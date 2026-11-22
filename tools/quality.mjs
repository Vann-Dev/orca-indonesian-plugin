// Reads a built pack the way Orca would load it and reports what still reads poorly.
//
//   node tools/quality.mjs                  fail on any problem not in the baseline
//   node tools/quality.mjs --list           print every problem
//   node tools/quality.mjs --baseline       rewrite the baseline from the current pack
//   node tools/quality.mjs --pack <file>    check another file (a preview, for instance)
//
// Problems already recorded in tools/quality-baseline.json are "known": they are counted and
// listed, but they do not fail the run, so the pack can be cleaned up without blocking every PR.
import fs from 'node:fs'
import path from 'node:path'
import {
  at,
  coverage,
  flatten,
  looksLikeEnglishProse,
  protectedChecker,
  readJson,
  SKIP_PATH,
  writeJson
} from './lib/catalog.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const manifest = readJson('orca-plugin.json')
const packPath = value('--pack') ?? manifest.contributes.languagePacks[0].path
const pack = JSON.parse(fs.readFileSync(path.resolve(at(packPath)), 'utf8'))
// The pack is built against the Orca release its manifest version names; the pinned sources for
// other releases stay around so a diff between two of them is reproducible.
const pinned = fs
  .readdirSync(at('tools/upstream'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
const baseVersion = manifest.version.replace(/-(?:\d+|[0-9A-Za-z.-]+)$/, '')
const orcaVersion =
  value('--orca') ??
  (pinned.includes(baseVersion) ? baseVersion : manifest.engines.orca.replace(/^>=\s*/, ''))
const upstreamDir = `tools/upstream/${orcaVersion}`
if (!fs.existsSync(at(upstreamDir))) {
  console.error(`no pinned English source at ${upstreamDir}; run tools/fetch-upstream.mjs ${orcaVersion}`)
  process.exit(1)
}
const english = readJson(`${upstreamDir}/en.json`)
const isProtected = protectedChecker(
  readJson(`${upstreamDir}/protected-copy-keys.json`),
  readJson(`${upstreamDir}/chrome.json`)
)

const problems = []
const add = (level, rule, key, detail) => problems.push({ level, rule, key, detail })

// --- shape ------------------------------------------------------------------
function keysWithDuplicates(text) {
  const seen = new Set()
  const duplicates = new Set()
  JSON.parse(text, function reviver(key, val) {
    return val
  })
  // JSON.parse keeps the last duplicate silently, so scan the text with a tiny parser instead.
  let depth = 0
  for (const token of text.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    const raw = token[0]
    const next = text.slice(token.index + raw.length).match(/^\s*:/)
    if (!next || depth === 0) continue
    let name
    try {
      name = JSON.parse(raw)
    } catch {
      continue
    }
    if (name.includes('.')) add('error', 'dot-in-key', name, 'catalog keys may not contain a dot')
  }
  return duplicates
}

const rawPack = fs.readFileSync(path.resolve(at(packPath)), 'utf8')
keysWithDuplicates(rawPack)

const E = flatten(english)
const P = flatten(pack)
const protectedKeys = [...P.keys()].filter((p) => isProtected(p) || SKIP_PATH.test(p)).sort()
for (const p of protectedKeys) add('error', 'protected', p, 'Orca keeps this copy in English')

for (const [p, value] of P) {
  if (typeof value !== 'string') {
    add('error', 'not-a-string', p, typeof value)
    continue
  }
  const base = p.replace(/_(?:zero|one|two|few|many|other)$/, '')
  const source = E.get(p) ?? (base === p ? undefined : E.get(`${base}_other`) ?? E.get(base))
  if (source === undefined) {
    add('error', 'unknown-key', p, 'no such key in the English catalog')
    continue
  }
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\ufeff]|\p{Bidi_Control}/u.test(value)) {
    add('error', 'control-character', p, JSON.stringify(value))
  }
  if (value.includes('\n') && !source.includes('\n')) {
    add('error', 'line-break', p, 'adds a line break the English text does not have')
  }
  const limit = Math.min(8192, Math.max(64, source.length * 4))
  if (value.length > limit) add('error', 'too-long', p, `${value.length} > ${limit}`)
  if (value !== value.trim()) add('error', 'padding', p, JSON.stringify(value.slice(0, 40)))
  if (/ {2,}/.test(value)) add('error', 'double-space', p, JSON.stringify(value.slice(0, 60)))

  const placeholders = (s) => [...s.matchAll(/\{\{[^{}]*\}\}/g)].map((m) => m[0]).sort().join('|')
  if (placeholders(source) !== placeholders(value)) {
    add('error', 'placeholder-set', p, `${placeholders(source)} -> ${placeholders(value)}`)
  }
  const markup = (s) => [...s.matchAll(/<\/?[A-Za-z][^<>]*>/g)].map((m) => m[0]).sort().join('|')
  if (markup(source) !== markup(value)) {
    add('error', 'markup', p, `${markup(source)} -> ${markup(value)}`)
  }

  if (value === source && looksLikeEnglishProse(source)) {
    add('warn', 'untranslated', p, source.slice(0, 80))
  }
  if (len(value) > 25 && /^[a-z]/.test(value) && /^[A-Z]/.test(source)) {
    add('warn', 'lowercase-start', p, value.slice(0, 60))
  }
  if (/\w\.\.\./.test(value) && !source.includes('...')) {
    add('warn', 'ellipsis', p, 'use … rather than ...')
  }
}

function len(value) {
  return value.length
}

// Plural pairs: a pack may not ship `_one` without `_other`.
for (const p of P.keys()) {
  const m = p.match(/^(.*)_(?:zero|two|few|many|one|other)$/)
  if (!m) continue
  if (!/_(?:one|other)$/.test(p)) continue
  const sibling = p.replace(/_(one|other)$/, (_, which) => (which === 'one' ? '_other' : '_one'))
  if (!P.has(sibling) && E.has(sibling)) add('error', 'plural-pair', p, `missing ${sibling}`)
}

// --- glossary ---------------------------------------------------------------
// Terms the README keeps in English. A machine translation turns them into everyday words
// that mean something else in an IDE, so they are errors; the baseline records the backlog.
const GLOSSARY = [
  [/\bagen\b/gi, 'agen', 'agent stays "agent"'],
  [/\bcabang\b/gi, 'cabang', 'branch stays "branch"'],
  [/\bkeahlian\b/gi, 'keahlian', 'skill stays "skill"'],
  [/\btinjau(?:lah|an)?\b/gi, 'tinjau', 'review stays "review"'],
  [/\bkosongkan\b/gi, 'kosongkan', 'checkout is not "kosongkan"']
]
for (const [p, value] of P) {
  for (const [re, word, why] of GLOSSARY) {
    if (re.test(value)) add('error', 'glossary', p, `"${word}": ${why}`)
  }
  // Machine artefacts that mean something else entirely.
  if (/\bPelabuhan\b/i.test(value)) add('error', 'machine-term', p, '"Pelabuhan" is a harbour, not a port')
  if (/\bPAK\b|\bBAPAK\b/.test(value)) add('error', 'machine-term', p, 'MR is not "PAK"/"BAPAK"')
  if (/\bKEPALA\b/.test(value)) add('error', 'machine-term', p, 'HEAD is not "KEPALA"')
  if (/Kulit terminal/i.test(value)) add('error', 'machine-term', p, 'shell is not "kulit"')
}

// --- coverage ---------------------------------------------------------------
const cov = coverage(pack, english, isProtected)
const missing = [...E.keys()].filter(
  (p) => !isProtected(p) && !SKIP_PATH.test(p) && !P.has(p)
)
if (missing.length > 0) {
  add('warn', 'missing-key', `${missing.length} keys`, `English has ${missing.length} strings this pack does not`)
}

// --- baseline ---------------------------------------------------------------
const baselinePath = 'tools/quality-baseline.json'
const baseline = fs.existsSync(at(baselinePath)) ? readJson(baselinePath) : { known: [] }
const known = new Set(baseline.known)
const signature = (p) => `${p.rule}\t${p.key}`

if (flag('--baseline')) {
  writeJson(baselinePath, {
    note: 'Problems that predate the quality gate. Fix them in a dedicated pass, then regenerate this file.',
    known: [...new Set(problems.map(signature))].sort()
  })
  console.log(`baseline written: ${problems.length} entries`)
  process.exit(0)
}

const fresh = problems.filter((p) => !known.has(signature(p)))
const errors = fresh.filter((p) => p.level === 'error')
const warnings = fresh.filter((p) => p.level === 'warn')

if (flag('--list')) {
  for (const p of problems) console.log(`${p.level}\t${p.rule}\t${p.key}\t${p.detail}`)
}

const byRule = {}
for (const p of problems) byRule[`${p.level}:${p.rule}`] = (byRule[`${p.level}:${p.rule}`] ?? 0) + 1

console.log(
  JSON.stringify(
    {
      pack: packPath,
      orca: orcaVersion,
      entries: P.size,
      coverage: `${cov.percent}% (${cov.translated}/${cov.translatable})`,
      missing: missing.length,
      known: problems.length - fresh.length,
      new: { errors: errors.length, warnings: warnings.length },
      byRule
    },
    null,
    2
  )
)
for (const p of [...errors, ...warnings].slice(0, 25)) {
  console.log(`  ${p.level} ${p.rule} ${p.key}: ${p.detail}`)
}
process.exitCode = errors.length > 0 ? 1 : 0

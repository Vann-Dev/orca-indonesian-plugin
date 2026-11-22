// Builds locales/id.json from the English catalog of a pinned Orca release.
//
//   node tools/build.mjs            translate whatever is missing, then write the pack
//   node tools/build.mjs --dry-run  report what would change, write nothing
//
// Machine output is a baseline. Anything in tools/memory/reviewed.json wins over it, and
// tools/corrections.mjs renames the developer terms the engine insists on translating.
// Both run at assembly time, so editing either rebuilds the pack without re-translating.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { NAMES_RE } from './names.mjs'
import { CORRECTIONS } from './corrections.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const BATCH = Number(process.env.TRANSLATE_BATCH ?? 250)
const PLUGIN_ID = 'indonesian'
const LOCALE = 'id'

// A short lead-in tells the engine this is interface copy, so short labels stay
// imperative ("Simpan") instead of turning into gerunds ("Menyimpan").
const PROMPT = 'UI: '
const PROMPT_RE = /^\s*UI\s*[:：]\s*/i

const at = (p) => path.join(root, p)
const readJson = (p) => JSON.parse(fs.readFileSync(at(p), 'utf8'))
const readJsonIfPresent = (p) => (fs.existsSync(at(p)) ? readJson(p) : {})
const writeJson = (p, value) => {
  fs.mkdirSync(path.dirname(at(p)), { recursive: true })
  fs.writeFileSync(at(p), JSON.stringify(value, null, 2) + '\n')
}

const manifest = readJson('orca-plugin.json')
const en = readJson('tools/upstream/en-1.4.269.json')
const protectedCopy = readJson('tools/upstream/protected-copy-keys.json')
const protectedKeys = new Set(protectedCopy.keys)
const protectedPrefixes = protectedCopy.prefixes
const chrome = new Set(readJson('tools/upstream/translatable-chrome.json'))
const approved = readJsonIfPresent('tools/memory/reviewed.json')

// --- what to translate -------------------------------------------------------
// The language picker lists every language in its own script, so those stay English.
const SKIP_PATHS = [
  /^settings\.appearance\.language\.(?!title$|description$)/,
  /^languages\./
]

/** Security copy, plus plugin copy that Orca keeps in English. */
function isProtectedPath(p) {
  let candidate = p
  while (candidate) {
    if (protectedKeys.has(candidate)) return true
    // Orca checks the plural base too, so `x_one` is protected when `x` is.
    const base = candidate.replace(/_(?:zero|one|two|few|many|other)$/, '')
    if (base !== candidate && protectedKeys.has(base)) return true
    if (protectedPrefixes.some((prefix) => candidate.startsWith(prefix))) return true
    const dot = candidate.lastIndexOf('.')
    candidate = dot === -1 ? '' : candidate.slice(0, dot)
  }
  if (!p.startsWith('auto.components.settings.')) return false
  if (chrome.has(p)) return false
  return /^plugin/i.test(p.slice('auto.components.settings.'.length))
}

const flat = []
const walk = (node, prefix) => {
  for (const [key, value] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') walk(value, p)
    else flat.push([p, value])
  }
}
walk(en, '')

const translatable = flat.filter(
  ([p, value]) =>
    typeof value === 'string' &&
    value.length > 0 &&
    !isProtectedPath(p) &&
    !SKIP_PATHS.some((re) => re.test(p))
)

// --- masking -----------------------------------------------------------------
// Placeholders, markup, commands and product names become ⟦n⟧ so they come back
// exactly as they went in.
const masking = [
  [/\{\{[^{}]*\}\}/g, 'code'],
  [/<\/?[A-Za-z][^<>]*>/g, 'code'],
  [/`[^`]*`/g, 'code'],
  [/\{[A-Za-z][^{}]*\}/g, 'code'],
  [/\$\{[^{}]*\}/g, 'code'],
  [/https?:\/\/\S+/g, 'code'],
  [/%[sd]/g, 'code'],
  [/&[a-z]+;|&#\d+;/g, 'code'],
  [NAMES_RE, 'code']
]

function mask(source) {
  const slots = []
  const keep = (raw) => {
    slots.push(raw)
    return `\u27e6${slots.length - 1}\u27e7`
  }
  let text = source
  for (const [re] of masking) text = text.replace(re, (m) => keep(m))
  return { text, slots }
}

function restore(text, slots) {
  let out = text
  // Markup can nest (a backticked placeholder, a link with a placeholder), so unwrap
  // until no slot is left.
  for (let pass = 0; pass < 8 && /\u27e6\d+\u27e7/.test(out); pass += 1) {
    out = out.replace(/\u27e6(\d+)\u27e7/g, (whole, n) => slots[Number(n)] ?? whole)
  }
  return out
}

// --- after translation -------------------------------------------------------
function tidy(text) {
  let out = text.replace(PROMPT_RE, '')
  // Keep a space before a percent sign the engine glued to the previous word.
  out = out.replace(/([A-Za-z])%/g, '$1 %')
  for (const [re, replacement] of CORRECTIONS) out = out.replace(re, replacement)
  return out.replace(/[ \t]+/g, ' ').trim()
}

// --- translation -------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function translateBatch(sources) {
  const body = new URLSearchParams()
  for (const s of sources) body.append('q', `${PROMPT}${s}`)
  const res = await fetch('https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=id', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) throw new Error(`translate endpoint returned ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length !== sources.length) {
    throw new Error(`translate endpoint returned ${Array.isArray(data) ? data.length : 'no'} results for ${sources.length}`)
  }
  return data.map((t) => String(t))
}

// Orca refuses a pack that adds control characters or bidi marks, adds a line break
// English does not have, drops a placeholder, or grows past 4x its source (at least 64).
function problem(source, target) {
  if (!target) return 'empty translation'
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\ufeff]/u.test(target)) return 'control character'
  if (/\p{Bidi_Control}/u.test(target)) return 'bidi control character'
  if (target.includes('\n') && !source.includes('\n')) return 'added line break'
  const limit = Math.min(8192, Math.max(64, source.length * 4))
  if (target.length > limit) return `too long (${target.length} > ${limit})`
  if (/\u27e6|\u27e7/.test(target)) return 'lost a masked value'
  const { slots } = mask(source)
  const missing = slots
    .map((_, n) => restore(`\u27e6${n}\u27e7`, slots))
    .filter((value) => !target.includes(value))
  if (missing.length) return `lost ${missing.join(', ')}`
  return false
}

// Strings that carry no prose: punctuation, units, sample commands, paths, versions.
function looksUntranslatable(source) {
  if (!/[A-Za-z]{2}/.test(source)) return true
  if (/^[\s\p{P}\p{S}]+$/u.test(source)) return true
  if (/^[A-Z0-9][A-Z0-9 .#+/-]{1,20}$/.test(source) && !/[a-z]/.test(source)) return true
  // A token with code punctuation and no spaces is a path, variable, command or size,
  // not a word to translate.
  if (!/\s/.test(source) && /[\d_/<>~:@.=]/.test(source) && !/^[A-Za-z]+$/.test(source)) return true
  return false
}

// Cache entries belong to the masking and prompt that produced them. Corrections are
// applied later, so editing them never costs a re-translation.
const CACHE_VERSION = crypto
  .createHash('sha256')
  .update(JSON.stringify([PROMPT, masking.map(([re]) => String(re))]))
  .digest('hex')
  .slice(0, 12)
const cacheFile = readJsonIfPresent('tools/memory/cache.json')
const cache = cacheFile.version === CACHE_VERSION ? cacheFile.entries : {}
const saveCache = () => {
  if (!dryRun) writeJson('tools/memory/cache.json', { version: CACHE_VERSION, entries: cache })
}

const sources = [...new Set(translatable.map(([, value]) => value))]
const resolved = new Map()
const pending = []

for (const source of sources) {
  if (Object.hasOwn(approved, source)) {
    resolved.set(source, approved[source])
    continue
  }
  const cached = Object.hasOwn(cache, source) ? tidy(cache[source]) : null
  if (cached && !problem(source, cached)) {
    resolved.set(source, cached)
    continue
  }
  if (looksUntranslatable(source)) {
    resolved.set(source, source)
    continue
  }
  pending.push(source)
}

const failures = []

async function fill(chunk) {
  const masked = chunk.map((s) => mask(s))
  let results = null
  for (let attempt = 1; attempt <= 4 && !results; attempt += 1) {
    try {
      results = await translateBatch(masked.map((m) => m.text))
    } catch (error) {
      console.log(`  attempt ${attempt} failed: ${error.message}`)
      await sleep(1500 * attempt)
    }
  }
  if (!results) {
    failures.push(...chunk)
    return
  }
  chunk.forEach((source, index) => {
    const target = tidy(restore(results[index], masked[index].slots))
    const issue = problem(source, target)
    if (issue) {
      failures.push(source)
      console.log(`  keeping English for ${JSON.stringify(source.slice(0, 60))}: ${issue}`)
    } else {
      resolved.set(source, target)
      cache[source] = target
    }
  })
}

for (let i = 0; i < pending.length; i += BATCH) {
  const chunk = pending.slice(i, i + BATCH)
  console.log(`  translating ${i + chunk.length}/${pending.length}`)
  await fill(chunk)
  // Persist after every batch so an interrupted run resumes where it stopped.
  saveCache()
}

if (failures.length > 0) {
  const retry = [...new Set(failures.filter((s) => !resolved.has(s)))]
  console.log(`  retrying ${retry.length} entries`)
  for (let i = 0; i < retry.length; i += 40) await fill(retry.slice(i, i + 40))
  saveCache()
}

// --- assemble ----------------------------------------------------------------
const catalog = {}
const untranslated = []
for (const [p, source] of translatable) {
  const target = resolved.get(source)
  if (!target) {
    untranslated.push(p)
    continue
  }
  const segments = p.split('.')
  let node = catalog
  for (const segment of segments.slice(0, -1)) {
    node[segment] ??= {}
    node = node[segment]
  }
  node[segments.at(-1)] = tidy(target)
}

const done = sources.filter((s) => resolved.has(s)).length
console.log(JSON.stringify({
  release: manifest.version,
  locale: LOCALE,
  pluginId: PLUGIN_ID,
  paths: translatable.length,
  uniqueStrings: sources.length,
  translatedStrings: done,
  coverage: Math.round((done / sources.length) * 1000) / 10,
  untranslatedPaths: untranslated.length,
  untranslatedSample: untranslated.slice(0, 5)
}, null, 2))

if (!dryRun) writeJson(`locales/${LOCALE}.json`, catalog)

// Compares the pack with one Orca release and writes the work a new version needs.
//
//   node tools/sync-upstream.mjs --plan                    what changed, nothing written
//   node tools/sync-upstream.mjs --plan --json             the same, machine readable
//   node tools/sync-upstream.mjs --write-todo todo.json    the keys that need Indonesian text
//   node tools/sync-upstream.mjs --apply translations.json write the new pack for that release
//
// `--apply` also bumps the plugin version to the Orca release, keeps `engines.orca` at the
// oldest Orca this pack still loads on, and refreshes the version the README names. It never
// touches git: committing, pushing and opening the pull request stay the caller's job.
import fs from 'node:fs'
import path from 'node:path'
import { at, buildPack, coverage, flatten, protectedChecker, readJson, SKIP_PATH, writeJson } from './lib/catalog.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const manifest = readJson('orca-plugin.json')
const packPath = manifest.contributes.languagePacks[0].path
const pack = readJson(packPath)
const currentOrca = manifest.engines.orca.replace(/^>=\s*/, '')
const target = (value('--orca') ?? currentOrca).replace(/^v/, '')

const dir = `tools/upstream/${target}`
if (!fs.existsSync(at(dir))) {
  console.error(`no pinned English source at ${dir}; run: node tools/fetch-upstream.mjs ${target}`)
  process.exit(1)
}
const english = readJson(`${dir}/en.json`)
const isProtected = protectedChecker(
  readJson(`${dir}/protected-copy-keys.json`),
  readJson(`${dir}/chrome.json`)
)

const E = flatten(english)
const P = flatten(pack)
const translatable = (p) => !isProtected(p) && !SKIP_PATH.test(p)

const added = []
const changed = []
const removed = []
const nowProtected = []
const stale = []

for (const [p, text] of E) {
  if (!translatable(p)) {
    if (P.has(p)) nowProtected.push(p)
    continue
  }
  if (!P.has(p)) added.push({ key: p, english: text })
}

const previousEnglishPath = `tools/upstream/${currentOrca}/en.json`
if (currentOrca !== target && fs.existsSync(at(previousEnglishPath))) {
  const before = flatten(readJson(previousEnglishPath))
  for (const [p, text] of E) {
    if (!translatable(p) || !before.has(p)) continue
    if (before.get(p) !== text && P.has(p)) {
      const existing = changed.find((c) => c.key === p)
      if (existing) {
        existing.reason = 'english-changed'
        existing.previousEnglish = before.get(p)
      } else {
        changed.push({
          key: p,
          english: text,
          previousEnglish: before.get(p),
          current: P.get(p),
          reason: 'english-changed'
        })
      }
    }
  }
}

for (const p of P.keys()) {
  if (!E.has(p) || !translatable(p)) stale.push(p)
}

const currentSource = `tools/upstream/${currentOrca}/en.json`
const report = {
  from: currentOrca,
  to: target,
  version: manifest.version,
  needsBump: manifest.version !== target,
  coverageBefore: fs.existsSync(at(currentSource))
    ? coverage(pack, readJson(currentSource), isProtected).percent
    : null,
  added,
  changed,
  removed: [...P.keys()].filter((p) => !E.has(p)),
  stale: [...new Set([...stale, ...nowProtected])].sort(),
  counts: { added: added.length, changed: changed.length, stale: stale.length }
}

if (flag('--plan')) {
  if (flag('--json')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`Orca ${report.from} -> ${report.to}   pack ${manifest.version}`)
    console.log(`coverage ${report.coverageBefore}%`)
    console.log(`added ${added.length}, english changed ${changed.length}, stale ${report.stale.length}`)
    for (const a of added.slice(0, 15)) console.log(`  + ${a.key}: ${a.english.slice(0, 90)}`)
    if (added.length > 15) console.log(`  … ${added.length - 15} more`)
    for (const c of changed) console.log(`  ~ ${c.key}: ${c.reason}`)
    for (const s of report.stale.slice(0, 10)) console.log(`  - ${s}`)
  }
  process.exit(0)
}

if (flag('--write-todo')) {
  const file = value('--write-todo')
  if (!file) {
    console.error('--write-todo needs a file name')
    process.exit(1)
  }
  writeJson(file, {
    orca: target,
    note: 'Fill in `id` for every entry, then run --apply with this file.',
    entries: [...added, ...changed].map((entry) => ({ ...entry, id: '' }))
  })
  console.log(`wrote ${file}: ${added.length + changed.length} strings to translate`)
  process.exit(0)
}

if (flag('--apply')) {
  const file = value('--apply')
  if (!file) {
    console.error('--apply needs a translations file')
    process.exit(1)
  }
  const todo = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
  const translations = new Map()
  for (const key of E.keys()) {
    if (P.has(key)) translations.set(key, P.get(key))
  }
  for (const entry of todo.entries ?? []) {
    if (!entry.id || !String(entry.id).trim()) {
      console.error(`missing translation for ${entry.key}`)
      process.exit(1)
    }
    translations.set(entry.key, entry.id)
  }
  const missing = [...E.keys()].filter((p) => translatable(p) && !translations.has(p))
  if (missing.length > 0) {
    console.error(`${missing.length} translatable keys still need text:`)
    for (const p of missing.slice(0, 20)) console.error(`  ${p}`)
    process.exit(1)
  }

  const nextPack = buildPack(english, translations, isProtected)
  writeJson(packPath, nextPack)

  const nextManifest = { ...manifest, version: target }
  nextManifest.description = manifest.description.replace(/Orca \d+\.\d+\.\d+/, `Orca ${target}`)
  writeJson('orca-plugin.json', nextManifest)

  const readmePath = 'README.md'
  const readme = fs.readFileSync(at(readmePath), 'utf8')
  const nextReadme = readme.replace(/katalog bahasa Inggris Orca \d+\.\d+\.\d+/g, `katalog bahasa Inggris Orca ${target}`)
  if (nextReadme !== readme) fs.writeFileSync(at(readmePath), nextReadme)

  const after = coverage(nextPack, english, isProtected)
  console.log(`wrote ${packPath} for Orca ${target}: ${after.percent}% (${after.translated}/${after.translatable})`)
  console.log(`bumped orca-plugin.json to ${target}`)
  if (nextReadme !== readme) console.log('README version updated')
  process.exit(0)
}

console.log('nothing to do; pass --plan, --write-todo <file> or --apply <file>')

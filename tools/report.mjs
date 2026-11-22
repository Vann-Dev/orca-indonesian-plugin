// Builds the pull request body from the diff between two pinned Orca releases.
//
//   node tools/report.mjs --orca 1.4.270 --out pr-body.md
//   node tools/report.mjs --orca 1.4.270 --from 1.4.269 --out pr-body.md
import fs from 'node:fs'
import path from 'node:path'
import { at, coverage, flatten, protectedChecker, readJson, SKIP_PATH } from './lib/catalog.mjs'

const args = process.argv.slice(2)
const value = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const manifest = readJson('orca-plugin.json')
const target = (value('--orca') ?? manifest.version).replace(/^v/, '')
const from = (value('--from') ?? manifest.engines.orca.replace(/^>=\s*/, '')).replace(/^v/, '')
const out = value('--out') ?? 'pr-body.md'

const english = readJson(`tools/upstream/${target}/en.json`)
const isProtected = protectedChecker(
  readJson(`tools/upstream/${target}/protected-copy-keys.json`),
  readJson(`tools/upstream/${target}/chrome.json`)
)
const pack = readJson(manifest.contributes.languagePacks[0].path)
const E = flatten(english)
const P = flatten(pack)
const translatable = (p) => !isProtected(p) && !SKIP_PATH.test(p)

const beforePinned = fs.existsSync(at(`tools/upstream/${from}/en.json`)) && from !== target
const before = beforePinned ? flatten(readJson(`tools/upstream/${from}/en.json`)) : new Map()
const wasProtected = beforePinned
  ? protectedChecker(
      readJson(`tools/upstream/${from}/protected-copy-keys.json`),
      readJson(`tools/upstream/${from}/chrome.json`)
    )
  : () => false
const added = beforePinned
  ? [...E.keys()].filter((p) => translatable(p) && !before.has(p))
  : []
const dropped = beforePinned
  ? [...before.keys()].filter((p) => !wasProtected(p) && !SKIP_PATH.test(p) && (!E.has(p) || !translatable(p)))
  : []
const reworded = [...before.keys()].filter(
  (p) => E.has(p) && translatable(p) && before.get(p) !== E.get(p)
)
const untranslated = [...E.keys()].filter((p) => translatable(p) && !P.has(p))
const cov = coverage(pack, english, isProtected)

const lines = [
  `Syncs the Indonesian pack with Orca ${target}.`,
  '',
  `- Orca release: \`v${target}\` (previous: \`v${from}\`)`,
  `- Pack version: \`${manifest.version}\``,
  `- Coverage: ${cov.percent}% (${cov.translated}/${cov.translatable} translatable strings)`,
  `- New strings: ${added.length}`,
  `- Reworded English: ${reworded.length}`,
  `- Keys dropped or now protected upstream: ${dropped.length}`,
  '',
  '### What changed'
]
if (manifest.version === target) lines.push(`- Plugin version now matches the Orca release (\`${target}\`), as the pack version tracks Orca.`)
if (added.length > 0) lines.push(`- Translated the ${added.length} strings Orca ${target} introduced.`)
if (reworded.length > 0) lines.push(`- Re-checked the ${reworded.length} strings whose English text changed.`)
if (dropped.length > 0) lines.push(`- Dropped ${dropped.length} keys this release no longer uses.`)
if (added.length + reworded.length + dropped.length === 0 && manifest.version !== target) {
  lines.push('- No translation changes; the pack was already in sync.')
}

lines.push(
  '',
  '### Checks',
  '- `npm run check` — manifest and the files it names',
  '- `npm run quality` — placeholders, protected copy, glossary, coverage',
  '',
  `Nothing here is merged automatically. ${untranslated.length === 0 ? 'Coverage is 100% for this release.' : `${untranslated.length} strings are still English.`}`,
  ''
)

if (added.length > 0 && added.length <= 40) {
  lines.push('<details><summary>New strings</summary>', '')
  for (const p of added) lines.push(`- \`${p}\`: ${E.get(p).slice(0, 120)}`)
  lines.push('', '</details>', '')
}

fs.writeFileSync(path.isAbsolute(out) ? out : at(out), lines.join('\n'))
console.log(`wrote ${out}: +${added.length} ~${reworded.length} -${dropped.length}, ${cov.percent}% coverage`)

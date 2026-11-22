// Checks a built pack the way Orca would load it, and reports what still reads poorly.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const at = (p) => path.join(root, p)
const readJson = (p) => JSON.parse(fs.readFileSync(at(p), 'utf8'))

const en = readJson('tools/upstream/en-1.4.269.json')
const pack = readJson('locales/id.json')
const protectedCopy = readJson('tools/upstream/protected-copy-keys.json')
const chrome = new Set(readJson('tools/upstream/translatable-chrome.json'))
const protectedKeys = new Set(protectedCopy.keys)

const flat = (node) => {
  const out = new Map()
  const walk = (value, prefix) => {
    for (const [key, child] of Object.entries(value)) {
      const p = prefix ? `${prefix}.${key}` : key
      if (child && typeof child === 'object') walk(child, p)
      else out.set(p, child)
    }
  }
  walk(node, '')
  return out
}

const english = flat(en)
const translated = flat(pack)
const problems = []
const push = (kind, p, detail) => problems.push({ kind, path: p, detail })

const isProtected = (p) => {
  let candidate = p
  while (candidate) {
    if (protectedKeys.has(candidate)) return true
    const base = candidate.replace(/_(?:zero|one|two|few|many|other)$/, '')
    if (base !== candidate && protectedKeys.has(base)) return true
    if (protectedCopy.prefixes.some((prefix) => candidate.startsWith(prefix))) return true
    const dot = candidate.lastIndexOf('.')
    candidate = dot === -1 ? '' : candidate.slice(0, dot)
  }
  if (!p.startsWith('auto.components.settings.')) return false
  if (chrome.has(p)) return false
  return /^plugin/i.test(p.slice('auto.components.settings.'.length))
}

for (const [p, value] of translated) {
  const source = english.get(p)
  if (source === undefined) {
    push('unknown-key', p, 'no such key in the English catalog')
    continue
  }
  if (isProtected(p)) push('protected', p, 'security copy Orca keeps in English')
  if (typeof value !== 'string') {
    push('not-a-string', p, typeof value)
    continue
  }
  if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\ufeff]/u.test(value)) {
    push('control-character', p, JSON.stringify(value))
  }
  if (/\u27e6|\u27e7/.test(value)) push('mask-leak', p, value)
  if (value.includes('\n') && !source.includes('\n')) push('line-break', p, value)
  const limit = Math.min(8192, Math.max(64, source.length * 4))
  if (value.length > limit) push('too-long', p, `${value.length} > ${limit}`)
  for (const match of source.matchAll(/\{\{[^{}]*\}\}/g)) {
    if (!value.includes(match[0])) push('placeholder', p, `missing ${match[0]}`)
  }
  for (const match of source.matchAll(/<\/?[A-Za-z][^<>]*>/g)) {
    if (!value.includes(match[0])) push('markup', p, `missing ${match[0]}`)
  }
  for (const match of source.matchAll(/\{[A-Za-z][^{}]*\}/g)) {
    if (!source.includes(`{{${match[0].slice(1)}`) && !value.includes(match[0])) {
      push('template-field', p, `missing ${match[0]}`)
    }
  }
  // A translation should not silently swap one placeholder for another.
  const expected = [...source.matchAll(/\{\{[^{}]*\}\}/g)].map((m) => m[0]).sort().join('|')
  const actual = [...value.matchAll(/\{\{[^{}]*\}\}/g)].map((m) => m[0]).sort().join('|')
  if (expected !== actual) push('placeholder-set', p, `${expected} -> ${actual}`)
  // A string that is only placeholders and markup has nothing to translate.
  const prose = source.replace(/\{\{[^{}]*\}\}|<\/?[A-Za-z][^<>]*>|`[^`]*`|https?:\/\/\S+/g, ' ')
  if (value === source && /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(prose)) {
    push('untranslated', p, source)
  }
}

const translatableCount = [...english.keys()].filter(
  (p) => !isProtected(p) && !/^settings\.appearance\.language\.(?!title$|description$)/.test(p)
).length

const byKind = new Map()
for (const problem of problems) byKind.set(problem.kind, (byKind.get(problem.kind) ?? 0) + 1)

if (process.argv.includes('--list')) {
  for (const problem of problems) console.log(`${problem.kind}\t${problem.path}\t${problem.detail}`)
}

console.log(JSON.stringify({
  entries: translated.size,
  translatable: translatableCount,
  coverage: Math.round((translated.size / translatableCount) * 1000) / 10,
  problems: Object.fromEntries(byKind),
  examples: [...byKind.keys()].flatMap((kind) =>
    problems.filter((p) => p.kind === kind).slice(0, 3)
  )
}, null, 2))

process.exitCode = problems.some((p) => p.kind !== 'untranslated') ? 1 : 0

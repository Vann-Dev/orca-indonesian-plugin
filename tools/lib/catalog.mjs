// Shared helpers: read and write the two JSON catalogs, compare them, and decide
// which English paths a pack may translate.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Set ORCA_REPO to run these scripts against a checkout that does not hold them, such as a
// fresh clone the maintenance run works in.
export const ROOT = process.env.ORCA_REPO
  ? path.resolve(process.env.ORCA_REPO)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const at = (p) => path.join(ROOT, p)

export const readJson = (p) => JSON.parse(fs.readFileSync(at(p), 'utf8'))
export const readJsonAbs = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

export function writeJson(p, value, indent = 2) {
  const file = path.isAbsolute(p) ? p : at(p)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, indent) + '\n')
}

/** Every leaf path of a catalog, in file order. */
export function flatten(node, prefix = '', into = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, p, into)
    else into.set(p, value)
  }
  return into
}

const PLURAL = /_(?:zero|one|two|few|many|other)$/

/**
 * Orca keeps security copy, plugin-consent copy and destructive confirmations in English.
 * Mirrors `isProtectedPluginTranslationPath` in Orca's plugin-language-pack-artifact.
 */
export function protectedChecker(protectedCopy, chrome) {
  const keys = new Set(protectedCopy.keys)
  const prefixes = protectedCopy.prefixes ?? []
  const english = new Set(chrome)
  return (p) => {
    if (prefixes.some((prefix) => p.startsWith(prefix))) return true
    for (let candidate = p; candidate; ) {
      if (keys.has(candidate) || keys.has(candidate.replace(PLURAL, ''))) return true
      const dot = candidate.lastIndexOf('.')
      candidate = dot === -1 ? '' : candidate.slice(0, dot)
    }
    if (!p.startsWith('auto.components.settings.')) return false
    if (english.has(p)) return false
    return /^plugin/i.test(p.slice('auto.components.settings.'.length))
  }
}

/** The language picker lists every language in its own script, so those stay as they are. */
export const SKIP_PATH = /^(?:languages\.|settings\.appearance\.language\.(?!title$|description$))/

export function buildPack(englishNode, translations, isProtected, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(englishNode)) {
    const p = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child = buildPack(value, translations, isProtected, p, {})
      if (Object.keys(child).length > 0) out[key] = child
      continue
    }
    if (SKIP_PATH.test(p) || isProtected(p)) continue
    const translated = translations.get(p)
    if (translated === undefined) throw new Error(`no translation for ${p}`)
    out[key] = translated
  }
  return out
}

export function texts(node) {
  return [...flatten(node).values()].filter((v) => typeof v === 'string')
}

/** Whole percent, the way Orca reports coverage in the language picker. */
export function coverage(packNode, englishNode, isProtected) {
  const translatable = [...flatten(englishNode).keys()].filter(
    (p) => !SKIP_PATH.test(p) && !isProtected(p)
  )
  const have = new Set(flatten(packNode).keys())
  const translated = translatable.filter((p) => have.has(p)).length
  return {
    translated,
    translatable: translatable.length,
    percent: translatable.length === 0 ? 0 : Math.floor((translated / translatable.length) * 100)
  }
}

// Product names, file types and keyboard labels stay as they are; only prose is worth
// flagging as untranslated.
const ENGLISH_WORDS =
  /\b(the|this|that|these|those|your|you|with|from|will|can|cannot|not|and|are|was|were|when|while|before|after|into|only|also|again|then|than|them|they|its|has|have|had|does|did|would|could|should|may|might|must|please|use|using|used|set|run|show|hide|open|close|add|remove|delete|make|need|needs|want|check|try|something|everything|nothing|more|less|here|there|about|each|every|other|same|new|old|first|last)\b/gi

export function looksLikeEnglishProse(text) {
  if ((text.match(/[A-Za-z']+/g) ?? []).length < 3) return false
  return (text.match(ENGLISH_WORDS) ?? []).length >= 2
}

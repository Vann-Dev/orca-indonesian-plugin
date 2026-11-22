// Pins the English source a pack version was built against.
//
//   node tools/fetch-upstream.mjs 1.4.269          download and save it
//   node tools/fetch-upstream.mjs --latest         read the newest stable release first
//
// Three files come from the Orca tag itself, never from `main`, so a run is
// reproducible after the branch moves on: the English catalog, the copy Orca refuses
// to translate, and the plugin copy that is exempt from that rule.
import fs from 'node:fs'
import path from 'node:path'
import { at, ROOT, writeJson } from './lib/catalog.mjs'

const REPO = 'stablyai/orca'
const SOURCES = {
  en: 'src/renderer/src/i18n/locales/en.json',
  protectedCopy: 'src/shared/plugins/languages/protected-copy-keys.json',
  chrome: 'src/shared/plugins/languages/plugin-translatable-chrome.ts'
}
const VERSION_RE = /^1\.4\.\d+$/

async function latestStable() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'orca-indonesian-plugin' }
  })
  if (!res.ok) throw new Error(`GitHub releases/latest answered ${res.status}`)
  const release = await res.json()
  if (release.draft || release.prerelease) throw new Error('latest release is a draft or pre-release')
  const tag = String(release.tag_name ?? '').replace(/^v/, '')
  if (!VERSION_RE.test(tag)) throw new Error(`unexpected release tag ${release.tag_name}`)
  return tag
}

async function download(tag, file) {
  const url = `https://raw.githubusercontent.com/${REPO}/${tag}/${file}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${file} at ${tag} answered ${res.status}`)
  return res.text()
}

/** `new Set(['a', 'b'])` in the TypeScript source, as string literals. */
function chromePaths(source) {
  const start = source.indexOf('new Set([')
  const end = source.indexOf('])', start)
  if (start === -1 || end === -1) throw new Error('could not find the chrome list in Orca source')
  const body = source.slice(start + 'new Set(['.length, end)
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const args = process.argv.slice(2)
let version = args.find((a) => VERSION_RE.test(a.replace(/^v/, '')))
if (!version) {
  if (!args.includes('--latest')) {
    console.error('usage: node tools/fetch-upstream.mjs <version> | --latest')
    process.exit(1)
  }
  version = await latestStable()
  console.log(`latest stable release: ${version}`)
}
version = version.replace(/^v/, '')
if (!VERSION_RE.test(version)) throw new Error(`not an Orca release version: ${version}`)

const tag = `v${version}`
const [enText, protectedText, chromeText] = await Promise.all([
  download(tag, SOURCES.en),
  download(tag, SOURCES.protectedCopy),
  download(tag, SOURCES.chrome)
])

const dir = path.join(ROOT, 'tools/upstream', version)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'en.json'), enText)
fs.writeFileSync(path.join(dir, 'protected-copy-keys.json'), protectedText)
writeJson(`tools/upstream/${version}/chrome.json`, chromePaths(chromeText))
writeJson(`tools/upstream/${version}/meta.json`, {
  orca: version,
  tag,
  source: `https://github.com/${REPO}/tree/${tag}`,
  fetchedAt: new Date().toISOString()
})

const english = JSON.parse(enText)
const count = (node) =>
  Object.values(node).reduce(
    (n, v) => n + (v && typeof v === 'object' ? count(v) : 1),
    0
  )
console.log(`saved Orca ${version}: ${count(english)} English strings -> tools/upstream/${version}/`)

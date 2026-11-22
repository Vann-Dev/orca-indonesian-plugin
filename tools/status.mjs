// One line of state for a scheduled run: is there a newer Orca, and what would the sync touch?
//
//   node tools/status.mjs            { latest, pack, pending, ... }
//   node tools/status.mjs --offline  skip the GitHub call and use the pinned sources only
import fs from 'node:fs'
import { at, coverage, flatten, protectedChecker, readJson, SKIP_PATH } from './lib/catalog.mjs'

const offline = process.argv.includes('--offline')
const manifest = readJson('orca-plugin.json')
const pack = readJson(manifest.contributes.languagePacks[0].path)
const current = manifest.engines.orca.replace(/^>=\s*/, '')

let latest = current
if (!offline) {
  const res = await fetch('https://api.github.com/repos/stablyai/orca/releases/latest', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'orca-indonesian-plugin' }
  })
  if (!res.ok) {
    console.log(JSON.stringify({ ok: false, error: `releases/latest answered ${res.status}` }))
    process.exit(1)
  }
  const release = await res.json()
  if (release.draft || release.prerelease) {
    console.log(JSON.stringify({ ok: false, error: 'latest release is a draft or pre-release' }))
    process.exit(1)
  }
  latest = String(release.tag_name).replace(/^v/, '')
}

const pinned = fs.existsSync(at(`tools/upstream/${latest}/en.json`))
let diff = null
if (pinned) {
  const english = readJson(`tools/upstream/${latest}/en.json`)
  const isProtected = protectedChecker(
    readJson(`tools/upstream/${latest}/protected-copy-keys.json`),
    readJson(`tools/upstream/${latest}/chrome.json`)
  )
  const E = flatten(english)
  const P = flatten(pack)
  const translatable = (p) => !isProtected(p) && !SKIP_PATH.test(p)
  const added = [...E.keys()].filter((p) => translatable(p) && !P.has(p))
  const stale = [...P.keys()].filter((p) => !E.has(p) || !translatable(p))
  diff = {
    added: added.length,
    stale: stale.length,
    coverage: coverage(pack, english, isProtected).percent
  }
}

console.log(
  JSON.stringify({
    ok: true,
    pack: manifest.version,
    engines: manifest.engines.orca,
    current,
    latest,
    newer: latest !== current,
    pinnedLatest: pinned,
    diff
  })
)

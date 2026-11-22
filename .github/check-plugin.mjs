// Reads the manifest, checks every file it names exists, and walks the language pack
// to make sure the JSON is objects of strings all the way down.
import fs from 'node:fs'

const manifest = JSON.parse(fs.readFileSync('orca-plugin.json', 'utf8'))
const packs = manifest.contributes?.languagePacks ?? []
if (packs.length === 0) throw new Error('manifest lists no language packs')

const named = [manifest.icon, manifest.cover?.path, ...packs.map((pack) => pack.path)].filter(Boolean)
for (const file of named) {
  if (!fs.existsSync(file)) throw new Error(`manifest names a missing file: ${file}`)
}

function countStrings(value, path) {
  if (typeof value === 'string') return 1
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`language pack entry at ${path || '(root)'} is not a string or object`)
  }
  return Object.entries(value).reduce((total, [key, child]) => {
    if (key.includes('.')) throw new Error(`catalog key contains a dot: ${path}.${key}`)
    return total + countStrings(child, path ? `${path}.${key}` : key)
  }, 0)
}

for (const pack of packs) {
  const catalog = JSON.parse(fs.readFileSync(pack.path, 'utf8'))
  console.log(`${pack.locale}: ${countStrings(catalog, '')} strings from ${pack.path}`)
}

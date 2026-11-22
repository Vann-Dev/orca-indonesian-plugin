// Merge hand-reviewed strings into tools/memory/reviewed.json.
//   node tools/merge-review.mjs <file.json>
import fs from 'node:fs'

const target = 'tools/memory/reviewed.json'
const reviewed = JSON.parse(fs.readFileSync(target, 'utf8'))
const additions = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const before = Object.keys(reviewed).length
Object.assign(reviewed, additions)
fs.writeFileSync(target, JSON.stringify(reviewed, null, 2) + '\n')
console.log(`${before} -> ${Object.keys(reviewed).length} reviewed strings`)

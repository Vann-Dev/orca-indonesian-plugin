// Commits the sync and opens a pull request. It refuses to touch main.
//
//   node tools/open-pr.mjs --version 1.4.270 --body pr-body.md
//
// The branch is always `auto/orca-<version>`. If a pull request for that branch is already
// open, the new commit is pushed onto it instead of opening a second one. Merging is left to
// a person: this script never merges and never pushes to the default branch.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { at } from './lib/catalog.mjs'

const args = process.argv.slice(2)
const value = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const version = value('--version')
const bodyFile = value('--body')
if (!version || !bodyFile) {
  console.error('usage: node tools/open-pr.mjs --version <orca version> --body <file>')
  process.exit(1)
}

const git = (...argv) => execFileSync('git', argv, { cwd: at('.'), encoding: 'utf8' }).trim()
const run = (cmd, argv) => execFileSync(cmd, argv, { cwd: at('.'), encoding: 'utf8' }).trim()

const dryRun = args.includes('--dry-run')
const branch = `auto/orca-${version}`
// Only the pack, the manifest and the README are part of a sync. The tooling itself and the
// downloaded English sources stay out of the commit.
const STAGED = ['locales', 'orca-plugin.json', 'README.md']
const ALLOWED = ['locales/', 'orca-plugin.json', 'README.md']

if (git('rev-parse', '--abbrev-ref', 'HEAD') === branch) {
  // already on the branch
} else {
  try {
    git('rev-parse', '--verify', branch)
    git('checkout', branch)
  } catch {
    git('checkout', '-b', branch)
  }
}

git('add', '--', ...STAGED)
const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean)
if (staged.length === 0) {
  console.log('nothing staged for the pack; no commit made')
  process.exit(0)
}
const outside = staged.filter((file) => !ALLOWED.some((prefix) => file.startsWith(prefix)))
if (outside.length > 0) {
  console.error('refusing to commit files outside the pack:')
  for (const file of outside) console.error(`  ${file}`)
  process.exit(1)
}
const summary = git('diff', '--cached', '--stat')
git('commit', '-m', `chore(i18n): sync with Orca ${version}`, '-m', summary)
if (dryRun) {
  console.log(`dry run: committed on ${branch}, not pushed`)
  console.log(summary)
  process.exit(0)
}
git('push', '--set-upstream', 'origin', branch)

const existing = JSON.parse(
  run('gh', ['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url'])
)
if (existing.length > 0) {
  console.log(`updated ${existing[0].url}`)
  process.exit(0)
}

const body = fs.readFileSync(path.resolve(bodyFile), 'utf8')
const url = run('gh', [
  'pr',
  'create',
  '--base',
  'main',
  '--head',
  branch,
  '--title',
  `chore(i18n): sync with Orca ${version}`,
  '--body',
  body
])
console.log(url)

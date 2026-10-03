// Pins scripts/gate.mjs guards on their OWN cases (a guard that has never fired is not known to work): the secret scan
// must catch planted keys in a real temp repo (tracked file AND unpushed history), and fail closed when it cannot run.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { secretScan, secretPattern, findTests, ungatedScripts, SECRET_PATTERNS_FILE } from '../../scripts/gate.mjs'
import { REPO_ROOT } from '../../scripts/lib/git.mjs'

// Keys assembled at runtime so no literal secret shape lives in this file.
const AWS = 'AKIA' + 'Z'.repeat(16)
const ANT = 'sk-ant-' + 'api03-' + 'Q'.repeat(24)

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ced-gate-'))
  const g = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' })
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('config', 'core.hooksPath', '/dev/null')
  mkdirSync(join(dir, 'enforcement'), { recursive: true })
  copyFileSync(join(REPO_ROOT, SECRET_PATTERNS_FILE), join(dir, SECRET_PATTERNS_FILE))
  writeFileSync(join(dir, 'ok.txt'), 'nothing to see\n')
  g('add', '.'); g('commit', '-qm', 'base')
  return { dir, g }
}

test('the shared pattern file exists and does not match itself', () => {
  const re = secretPattern()
  assert.ok(re && re.startsWith('-----BEGIN'))
  assert.equal(new RegExp(re).test(readFileSync(join(REPO_ROOT, SECRET_PATTERNS_FILE), 'utf8')), false)
  assert.ok(new RegExp(re).test(AWS) && new RegExp(re).test(ANT))
})
test('clean repo passes; a planted key in a tracked file fails (both key shapes)', () => {
  const { dir, g } = tempRepo()
  try {
    assert.equal(secretScan({ cwd: dir, ci: true }).ok, true)
    writeFileSync(join(dir, 'config.js'), `const a = '${AWS}'\nconst b = '${ANT}'\n`)
    g('add', '.'); g('commit', '-qm', 'oops')
    const r = secretScan({ cwd: dir, ci: true })
    assert.equal(r.ok, false); assert.match(r.detail, /config\.js/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('a key committed then deleted in unpushed history still fails (non-CI)', () => {
  const { dir, g } = tempRepo()
  try {
    writeFileSync(join(dir, 'k.txt'), `${ANT}\n`); g('add', '.'); g('commit', '-qm', 'add key')
    rmSync(join(dir, 'k.txt')); g('add', '-A'); g('commit', '-qm', 'remove key')
    assert.equal(secretScan({ cwd: dir, ci: true }).ok, true) // the HEAD tree is clean…
    const r = secretScan({ cwd: dir, ci: false }) // …but the push would publish the history
    assert.equal(r.ok, false); assert.match(r.detail, /unpushed history/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('a large unpushed history (multi-MB fixtures) is scanned, not refused with ENOBUFS (2026-10-03)', () => {
  // The gate failed with "git log failed: spawnSync git ENOBUFS" when the unpushed commits carried ~1.5 MB of fixtures:
  // spawnSync's default output buffer is 1 MB. The scan must read it all (and still catch a key at the end of it).
  const { dir, g } = tempRepo()
  try {
    const big = 'x'.repeat(100) + '\n'
    writeFileSync(join(dir, 'big.json'), big.repeat(40_000)); g('add', '.'); g('commit', '-qm', 'a 4 MB fixture')
    const clean = secretScan({ cwd: dir, ci: false })
    assert.equal(clean.ok, true, clean.detail)
    writeFileSync(join(dir, 'late.txt'), `${ANT}\n`); g('add', '.'); g('commit', '-qm', 'a key after the big diff')
    rmSync(join(dir, 'late.txt')); g('add', '-A'); g('commit', '-qm', 'removed')
    const r = secretScan({ cwd: dir, ci: false })
    assert.equal(r.ok, false); assert.match(r.detail, /unpushed history/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('allowlisted lines pass; a missing pattern file fails closed', () => {
  const { dir, g } = tempRepo()
  try {
    writeFileSync(join(dir, 'doc.md'), `example ${AWS}  <!-- pragma: allowlist secret -->\n`); g('add', '.'); g('commit', '-qm', 'doc')
    assert.equal(secretScan({ cwd: dir, ci: false }).ok, true)
    rmSync(join(dir, SECRET_PATTERNS_FILE))
    const r = secretScan({ cwd: dir, ci: true })
    assert.equal(r.ok, false); assert.match(r.detail, /fail closed/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('test discovery is recursive and finds this file', () => {
  const files = findTests()
  assert.ok(files.includes('tests/harness/gate.test.mjs'))
  assert.ok(files.every((f) => /\.test\.(mjs|cjs|js)$/.test(f)))
})
test('a test/typecheck/build/e2e/lint script not listed in gate.npmScripts is reported', () => {
  assert.deepEqual(ungatedScripts({ scripts: { test: 'x', build: 'y', 'test:harness': 'z' }, gate: { npmScripts: ['build'] } }), ['test'])
  assert.deepEqual(ungatedScripts({ scripts: { gate: 'x' }, gate: { npmScripts: [] } }), [])
})
test('workspace suites must be reached by a gated root script', () => {
  const ws = [{ dir: 'packages/schema', pkg: { name: '@ced/schema', scripts: { test: 'vitest run', dev: 'x' } } }]
  assert.deepEqual(ungatedScripts({ scripts: {}, gate: { npmScripts: [] } }, ws), ['packages/schema:test'])
  assert.deepEqual(ungatedScripts({ scripts: { test: 'npm run test --workspaces' }, gate: { npmScripts: ['test'] } }, ws), [])
  assert.deepEqual(ungatedScripts({ scripts: { 'test:schema': 'npm run test -w packages/schema' }, gate: { npmScripts: ['test:schema'] } }, ws), [])
  assert.deepEqual(ungatedScripts({ scripts: { build: 'npm run build --workspaces' }, gate: { npmScripts: ['build'] } }, ws), ['packages/schema:test'])
})

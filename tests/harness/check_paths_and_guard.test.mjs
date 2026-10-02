// Pins scripts/check_paths.mjs path extraction and scripts/hooks/push_guard.mjs command matching.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatePaths, checkDoc } from '../../scripts/check_paths.mjs'
import { isPush, isForce } from '../../scripts/hooks/push_guard.mjs'

const ROOTS = new Set(['docs', 'scripts', 'apps', 'HANDOFF.md'])
test('backticked repo paths are extracted; commands, flags, URLs, placeholders, foreign names are not', () => {
  const line = 'run `node scripts/gate.mjs --ci` then read `docs/ROADMAP.md:12` and `https://x.y/z.md` or `<dir>/x.md` and `and/or` ' +
    'and `TESTING.md` but not `hearings.xml`, `owner/repo`, `Mozilla/5.0`, `.mjs`, `meta.json`, `floor/YYYYMMDD.xml`'
  assert.deepEqual(candidatePaths(line, ROOTS).map((c) => c.path), ['scripts/gate.mjs', 'docs/ROADMAP.md', 'TESTING.md'])
})
test('markdown links resolve relative to the doc; (planned) lines are exempt', () => {
  const exists = (p) => p === 'docs/ROADMAP.md'
  assert.deepEqual(checkDoc('docs/X.md', 'see [r](ROADMAP.md)', exists, ROOTS), [])
  assert.deepEqual(checkDoc('docs/X.md', 'see [r](NOPE.md)', exists, ROOTS), ['docs/X.md:1: NOPE.md'])
  assert.deepEqual(checkDoc('MAP.md', '`apps/web/` — the web client (planned)', exists, ROOTS), [])
  assert.deepEqual(checkDoc('MAP.md', '`apps/web/` — the web client', exists, ROOTS), []) // planned top dir not created yet
  const appsExists = (p) => p === 'apps'
  assert.deepEqual(checkDoc('MAP.md', '`apps/web/` — the web client', appsExists, ROOTS), ['MAP.md:1: apps/web/'])
  assert.deepEqual(checkDoc('MAP.md', '`docs/GONE.md` moved', exists, ROOTS), ['MAP.md:1: docs/GONE.md'])
})
test('push detection', () => {
  assert.ok(isPush('git push origin main'))
  assert.ok(isPush('cd x && git -C "C:/a b" push -u origin main'))
  assert.ok(!isPush('git status && echo push'))
  assert.ok(!isPush('git log --grep push'))
})
test('force detection', () => {
  for (const c of ['git push --force origin main', 'git push -f', 'git push --force-with-lease', 'git push origin +main', 'git push -uf origin main']) assert.ok(isForce(c), c)
  for (const c of ['git push origin main', 'git push -u origin main', 'git push origin feature/fix-x']) assert.ok(!isForce(c), c)
})

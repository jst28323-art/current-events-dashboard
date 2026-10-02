// Pins scripts/check_paths.mjs path extraction and resolution. (Push-guard cases live in push_guard.test.mjs.)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatePaths, checkDoc } from '../../scripts/check_paths.mjs'

const ROOTS = new Set(['docs', 'scripts', 'apps', 'HANDOFF.md'])
test('backticked repo paths are extracted; commands, flags, URLs, placeholders, foreign names are not', () => {
  const line = 'run `node scripts/gate.mjs --ci` then read `docs/ROADMAP.md:12` and `https://x.y/z.md` or `<dir>/x.md` and `and/or` ' +
    'and `TESTING.md` but not `hearings.xml`, `owner/repo`, `Mozilla/5.0`, `.mjs`, `meta.json`, `floor/YYYYMMDD.xml`'
  assert.deepEqual(candidatePaths(line, ROOTS).map((c) => c.path), ['scripts/gate.mjs', 'docs/ROADMAP.md', 'TESTING.md'])
})
test('markdown links resolve relative to the doc; (planned) lines and not-yet-created planned dirs are exempt', () => {
  const exists = (p) => p === 'docs/ROADMAP.md'
  assert.deepEqual(checkDoc('docs/X.md', 'see [r](ROADMAP.md)', exists, ROOTS), [])
  assert.deepEqual(checkDoc('docs/X.md', 'see [r](NOPE.md)', exists, ROOTS), ['docs/X.md:1: NOPE.md'])
  assert.deepEqual(checkDoc('MAP.md', '`apps/web/` — the web client (planned)', exists, ROOTS), [])
  assert.deepEqual(checkDoc('MAP.md', '`apps/web/` — the web client', exists, ROOTS), []) // planned top dir not created yet
  const appsExists = (p) => p === 'apps'
  assert.deepEqual(checkDoc('MAP.md', '`apps/web/` — the web client', appsExists, ROOTS), ['MAP.md:1: apps/web/'])
  assert.deepEqual(checkDoc('MAP.md', '`docs/GONE.md` moved', exists, ROOTS), ['MAP.md:1: docs/GONE.md'])
})
test('existence is exact-case (a wrong-case path is dead even on a case-insensitive disk)', () => {
  const exists = (p) => p === 'docs/ROADMAP.md' // what git ls-files would report
  assert.deepEqual(checkDoc('HANDOFF.md', 'read `docs/roadmap.md`', exists, ROOTS), ['HANDOFF.md:1: docs/roadmap.md'])
})

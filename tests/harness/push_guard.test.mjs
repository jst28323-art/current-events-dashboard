// Pins scripts/hooks/push_guard.mjs. Every bypass found by the 2026-10-02 adversarial review is a case here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, segments, blankQuotes } from '../../scripts/hooks/push_guard.mjs'

const refused = (cmd) => { const a = analyze(cmd); return a.push && !!a.refuse }
const needsVerdict = (cmd) => { const a = analyze(cmd); return a.push && !a.refuse && !a.dryOnly }

test('plain pushes are pushes that need the ship_state verdict', () => {
  for (const c of ['git push', 'git push origin main', 'git push -u origin main', 'git -C "C:/a b" push origin main',
    'cd x && git push origin HEAD:main', 'git --no-pager push origin main', 'git.exe push origin main',
    'GIT_TRACE=1 git push origin main', 'git push origin main 2>&1 | tail -n 5', 'git push origin main 2>/dev/null']) {
    assert.ok(needsVerdict(c), c)
  }
})
test('review bypass: a -n / --dry-run in ANOTHER segment does not exempt the push', () => {
  assert.ok(needsVerdict('git push origin main 2>&1 | tail -n 5'))
  assert.ok(needsVerdict('git log -n 3 && git push origin main'))
  assert.ok(needsVerdict('echo --dry-run; git push origin main'))
})
test('a real dry run of the allowed shape skips the verdict', () => {
  assert.equal(analyze('git push --dry-run origin main').dryOnly, true)
  assert.equal(analyze('git push -n origin main').dryOnly, true)
})
test('force, deletion, mirror, all, prune, no-verify, odd refspecs and other remotes are refused outright', () => {
  for (const c of ['git push --force origin main', 'git push -f', 'git push -uf origin main', 'git push --force-with-lease',
    'git push --force-if-includes origin main', 'git push origin +main', 'git push origin :main', 'git push origin --delete main',
    'git push -d origin main', 'git push --mirror', 'git push --all', 'git push --prune origin', 'git push --no-verify origin main',
    'git push upstream main', 'git push origin wip:main', 'git push origin feature', 'git push origin main extra',
    'git push --force origin main | tail -n 3', 'git push --force --no-verify origin main 2>&1 | tail -n 5']) {
    assert.ok(refused(c), c)
  }
})
test('text that merely mentions git push is not a push', () => {
  for (const c of ['git commit -m "docs: explain when to git push"', "echo 'git push --force'", 'git log --grep push',
    'git status && echo push', "git commit -F - <<'EOF'\ngit push --force origin main\nEOF\n"]) {
    assert.equal(analyze(c).push, false, c)
  }
})
test('helpers: quotes are blanked and segments split on shell separators', () => {
  assert.equal(blankQuotes('git commit -m "a; git push"'), 'git commit -m ""')
  assert.deepEqual(segments('a && b || c; d | e'), ['a', 'b', 'c', 'd', 'e'])
})

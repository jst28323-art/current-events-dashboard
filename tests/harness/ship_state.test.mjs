// Pins every branch of scripts/ship_state.mjs decide(). A branch without a test here is a wish.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, roundState, parsePageNumber, HOOKS_PATH } from '../../scripts/ship_state.mjs'

const H = 'a'.repeat(40)
const PAGE = 'b'.repeat(40) // blob of HANDOFF.md at HEAD
const rec = (o) => ({ round: 1, page_n: 3, routing_verdict: 'PASS', content_verdict: 'PASS', n_resumers: 3, _blob: PAGE, ...o })
const base = () => ({
  isRepo: true, head: H, branch: 'main', hooksPath: HOOKS_PATH, dirty: [], gateRunning: false, hasOrigin: true, fetchOk: true,
  upstream: H, ahead: 0, behind: 0, stampAtHead: true, lastGate: { sha: H, verdict: 'PASS' },
  pushHold: false, pageN: 3, pageBlob: PAGE, rounds: [rec({})], ci: { state: 'success' },
})
const v = (patch) => decide({ ...base(), ...patch }).verdict

test('SHIPPED-CLEAN when pushed, verified, and a round validated exactly this page', () => assert.equal(v({}), 'SHIPPED-CLEAN'))
test('SETUP-ERROR outside a repo / without commits / without a LATEST heading / with hooks disabled', () => {
  assert.equal(v({ isRepo: false }), 'SETUP-ERROR')
  assert.equal(v({ head: null }), 'SETUP-ERROR')
  assert.equal(v({ pageN: null }), 'SETUP-ERROR')
  assert.equal(v({ hooksPath: '' }), 'SETUP-ERROR')
  assert.equal(v({ hooksPath: 'enforcement/wiring/git-hooks' }), 'SETUP-ERROR')
})
test('GATE-RUNNING-WAIT beats everything after setup', () => assert.equal(v({ gateRunning: true, dirty: ['x'] }), 'GATE-RUNNING-WAIT'))
test('DIRTY-COMMIT-FIRST on any dirty path', () => assert.equal(v({ dirty: [' M HANDOFF.md'] }), 'DIRTY-COMMIT-FIRST'))
test('OFF-MAIN-STOP on any other branch, even ahead + stamped (review: it used to say PUSH and push local main)', () => {
  assert.equal(v({ branch: 'feat', ahead: 1 }), 'OFF-MAIN-STOP')
  assert.equal(v({ branch: 'HEAD' }), 'OFF-MAIN-STOP')
})
test('NO-REMOTE without origin', () => assert.equal(v({ hasOrigin: false }), 'NO-REMOTE'))
test('DIVERGED-STOP when origin has commits HEAD lacks (even if ahead too)', () => assert.equal(v({ behind: 1, ahead: 2 }), 'DIVERGED-STOP'))
test('GATE-FAILED-STOP when the newest gate run for HEAD failed', () => assert.equal(v({ ahead: 1, stampAtHead: false, lastGate: { sha: H, verdict: 'FAIL' } }), 'GATE-FAILED-STOP'))
test('a FAIL at another sha is stale and ignored', () => assert.equal(v({ ahead: 1, stampAtHead: false, lastGate: { sha: 'c'.repeat(40), verdict: 'FAIL' } }), 'REGATE'))
test('CI-FAILED-STOP only for a pushed HEAD', () => {
  assert.equal(v({ ci: { state: 'failure' } }), 'CI-FAILED-STOP')
  assert.equal(v({ ahead: 1, ci: { state: 'failure' } }), 'PUSH')
})
test('REGATE when ahead without a stamp at HEAD', () => assert.equal(v({ ahead: 1, stampAtHead: false }), 'REGATE'))
test('PUSH-HOLD-STOP when ahead + stamped + hold', () => assert.equal(v({ ahead: 1, pushHold: true }), 'PUSH-HOLD-STOP'))
test('PUSH when ahead + stamped', () => assert.equal(v({ ahead: 2 }), 'PUSH'))
test('first push (no origin/main yet) is PUSH once stamped', () => assert.equal(v({ upstream: null, ahead: 5 }), 'PUSH'))
test('pushed HEAD needs a local stamp OR a CI success (review: an ungated push used to read SHIPPED-CLEAN)', () => {
  assert.equal(v({ stampAtHead: false, ci: { state: 'success' } }), 'SHIPPED-CLEAN')
  assert.equal(v({ stampAtHead: true, ci: { state: 'unknown' } }), 'SHIPPED-CLEAN')
  assert.equal(v({ stampAtHead: false, ci: { state: 'unknown' } }), 'PUSHED-UNVERIFIED-STOP')
  assert.equal(v({ stampAtHead: false, ci: { state: 'none' } }), 'PUSHED-UNVERIFIED-STOP')
  assert.equal(v({ stampAtHead: false, ci: { state: 'pending' } }), 'CI-PENDING-WAIT')
})
test('ROUND-DUE when pushed but the page has no round, or only a round for an older page number', () => {
  assert.equal(v({ rounds: [] }), 'ROUND-DUE')
  assert.equal(v({ pageN: 4 }), 'ROUND-DUE')
})
test('a round covers only the page TEXT it validated (review: an edited NEXT ACTION rode on an old round)', () => {
  assert.equal(v({ rounds: [rec({ _blob: 'd'.repeat(40) })] }), 'ROUND-DUE')
  assert.match(roundState(3, [rec({ _blob: 'd'.repeat(40) })], PAGE).how, /earlier text/)
  assert.equal(v({ rounds: [rec({ _blob: 'd'.repeat(40), content_fix_blob: PAGE, content_verdict: 'CONTENT-FIXED' })] }), 'SHIPPED-CLEAN')
  assert.equal(v({ rounds: [rec({ _blob: null })] }), 'ROUND-DUE') // record sha unresolvable => covers nothing
})
test('a routing PASS with content FAIL is not accepted; CONTENT-FIXED is', () => {
  assert.equal(v({ rounds: [rec({ content_verdict: 'FAIL' })] }), 'ROUND-DUE')
  assert.equal(v({ rounds: [rec({ content_verdict: 'CONTENT-FIXED' })] }), 'SHIPPED-CLEAN')
})
test('loop exit: two routing FAILs at n>=3 with the newest covering the page and content OK ships with the split', () => {
  const rounds = [rec({ round: 4, routing_verdict: 'FAIL', _blob: 'e'.repeat(40) }), rec({ round: 5, routing_verdict: 'FAIL' })]
  assert.equal(v({ rounds }), 'SHIPPED-CLEAN')
  assert.match(roundState(3, rounds, PAGE).how, /SPLIT/)
})
test('one FAIL, or FAILs with fewer than 3 resumers, do not take the exit', () => {
  assert.equal(v({ rounds: [rec({ round: 4, routing_verdict: 'FAIL' })] }), 'ROUND-DUE')
  assert.equal(v({ rounds: [rec({ round: 4, routing_verdict: 'FAIL', n_resumers: 2 }), rec({ round: 5, routing_verdict: 'FAIL', n_resumers: 2 })] }), 'ROUND-DUE')
})
test('next round number is max(round)+1 across ALL pages', () => {
  assert.equal(roundState(9, [{ round: 7, page_n: 3 }, { round: 2, page_n: 1 }], PAGE).nextRound, 8)
  assert.equal(roundState(1, [], PAGE).nextRound, 1)
})
test('ROUND-DUE prints the scriptPath and repo of THIS checkout', () => {
  const d = decide({ ...base(), rounds: [], repoRoot: 'C:\\x\\clone' })
  assert.match(d.next, /scriptPath: "C:\/x\/clone\/\.claude\/workflows\/coldstart-validate\.js"/)
  assert.match(d.next, /repo: "C:\/x\/clone"/)
})
test('parsePageNumber reads the LATEST heading', () => {
  assert.equal(parsePageNumber('# HANDOFF\n\n## ⚑ LATEST #12 (2026-10-02) — x\n'), 12)
  assert.equal(parsePageNumber('## LATEST #12'), null)
  assert.equal(parsePageNumber(null), null)
})

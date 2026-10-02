// Pins every branch of scripts/ship_state.mjs decide(). A branch without a test here is a wish.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, roundState, parsePageNumber } from '../../scripts/ship_state.mjs'

const H = 'a'.repeat(40)
const base = () => ({
  isRepo: true, head: H, branch: 'main', dirty: [], gateRunning: false, hasOrigin: true, fetchOk: true,
  upstream: H, ahead: 0, behind: 0, stampAtHead: true, lastGate: { sha: H, verdict: 'PASS' },
  pushHold: false, pageN: 3, rounds: [{ round: 1, page_n: 3, routing_verdict: 'PASS', content_verdict: 'PASS', n_resumers: 3 }],
  ci: { state: 'success' },
})
const v = (patch) => decide({ ...base(), ...patch }).verdict

test('SHIPPED-CLEAN when pushed and the page has an accepted round', () => assert.equal(v({}), 'SHIPPED-CLEAN'))
test('SETUP-ERROR outside a repo / without commits / without a LATEST heading', () => {
  assert.equal(v({ isRepo: false }), 'SETUP-ERROR')
  assert.equal(v({ head: null }), 'SETUP-ERROR')
  assert.equal(v({ pageN: null }), 'SETUP-ERROR')
})
test('GATE-RUNNING-WAIT beats everything after setup', () => assert.equal(v({ gateRunning: true, dirty: ['x'] }), 'GATE-RUNNING-WAIT'))
test('DIRTY-COMMIT-FIRST on any dirty path', () => assert.equal(v({ dirty: [' M HANDOFF.md'] }), 'DIRTY-COMMIT-FIRST'))
test('NO-REMOTE without origin', () => assert.equal(v({ hasOrigin: false }), 'NO-REMOTE'))
test('DIVERGED-STOP when origin has commits HEAD lacks (even if ahead too)', () => assert.equal(v({ behind: 1, ahead: 2 }), 'DIVERGED-STOP'))
test('GATE-FAILED-STOP when the newest gate run for HEAD failed', () => assert.equal(v({ ahead: 1, stampAtHead: false, lastGate: { sha: H, verdict: 'FAIL' } }), 'GATE-FAILED-STOP'))
test('a FAIL at another sha is stale and ignored', () => assert.equal(v({ ahead: 1, stampAtHead: false, lastGate: { sha: 'b'.repeat(40), verdict: 'FAIL' } }), 'REGATE'))
test('CI-FAILED-STOP only for a pushed HEAD', () => {
  assert.equal(v({ ci: { state: 'failure' } }), 'CI-FAILED-STOP')
  assert.equal(v({ ahead: 1, ci: { state: 'failure' } }), 'PUSH')
})
test('REGATE when ahead without a stamp at HEAD', () => assert.equal(v({ ahead: 1, stampAtHead: false }), 'REGATE'))
test('PUSH-HOLD-STOP when ahead + stamped + hold', () => assert.equal(v({ ahead: 1, pushHold: true }), 'PUSH-HOLD-STOP'))
test('PUSH when ahead + stamped', () => assert.equal(v({ ahead: 2 }), 'PUSH'))
test('first push (no origin/main yet) is PUSH once stamped', () => assert.equal(v({ upstream: null, ahead: 5 }), 'PUSH'))
test('ROUND-DUE when pushed but the page has no round', () => assert.equal(v({ rounds: [] }), 'ROUND-DUE'))
test('ROUND-DUE when the only round is for an older page', () => assert.equal(v({ pageN: 4 }), 'ROUND-DUE'))
test('a routing PASS with content FAIL is not accepted; CONTENT-FIXED is', () => {
  assert.equal(v({ rounds: [{ round: 1, page_n: 3, routing_verdict: 'PASS', content_verdict: 'FAIL', n_resumers: 3 }] }), 'ROUND-DUE')
  assert.equal(v({ rounds: [{ round: 1, page_n: 3, routing_verdict: 'PASS', content_verdict: 'CONTENT-FIXED', n_resumers: 3 }] }), 'SHIPPED-CLEAN')
})
test('loop exit: two routing FAILs at n>=3 with newest content OK ships with the split', () => {
  const rounds = [
    { round: 4, page_n: 3, routing_verdict: 'FAIL', content_verdict: 'PASS', n_resumers: 3 },
    { round: 5, page_n: 3, routing_verdict: 'FAIL', content_verdict: 'PASS', n_resumers: 3 },
  ]
  assert.equal(v({ rounds }), 'SHIPPED-CLEAN')
  assert.match(roundState(3, rounds).how, /SPLIT/)
})
test('one FAIL, or FAILs with fewer than 3 resumers, do not take the exit', () => {
  assert.equal(v({ rounds: [{ round: 4, page_n: 3, routing_verdict: 'FAIL', content_verdict: 'PASS', n_resumers: 3 }] }), 'ROUND-DUE')
  assert.equal(v({ rounds: [
    { round: 4, page_n: 3, routing_verdict: 'FAIL', content_verdict: 'PASS', n_resumers: 2 },
    { round: 5, page_n: 3, routing_verdict: 'FAIL', content_verdict: 'PASS', n_resumers: 2 },
  ] }), 'ROUND-DUE')
})
test('next round number is max(round)+1 across ALL pages', () => {
  assert.equal(roundState(9, [{ round: 7, page_n: 3 }, { round: 2, page_n: 1 }]).nextRound, 8)
  assert.equal(roundState(1, []).nextRound, 1)
})
test('parsePageNumber reads the LATEST heading', () => {
  assert.equal(parsePageNumber('# HANDOFF\n\n## ⚑ LATEST #12 (2026-10-02) — x\n'), 12)
  assert.equal(parsePageNumber('## LATEST #12'), null)
  assert.equal(parsePageNumber(null), null)
})

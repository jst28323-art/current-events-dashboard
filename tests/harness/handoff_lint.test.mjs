// Pins scripts/handoff_lint.mjs: each rule must fire on its own planted defect and stay quiet on a good page.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lintHandoff, extractCanonical, extractWorkflowCanonical } from '../../scripts/handoff_lint.mjs'

const PROMPT = 'Orient to x repo, read HANDOFF.md, and continue.'
const claudeMd = `# c\n<!-- canonical-prompt -->\n> ${PROMPT}\n<!-- /canonical-prompt -->\n`
const workflowJs = `const CANONICAL =\n  '${PROMPT}'\n`
const good = [
  '# HANDOFF', '', '## ⚑ LATEST #2 (2026-10-02) — groundwork laid', 'state.', '',
  '## SHIP STATE', '', '    node scripts/ship_state.mjs', '',
  '## NEXT ACTION', '', '### Do the one thing', 'details', '',
  '## WHERE THINGS ARE', 'MAP.md',
].join('\n')
const ctx = (patch) => ({ handoff: good, archive: '## ARCHIVED #1', claudeMd, workflowJs, progress: '# PROGRESS\n', ...patch })
const codes = (r) => r.errs.map((e) => e.split(' ')[0])

test('a good page passes', () => assert.deepEqual(lintHandoff(ctx({})).errs, []))
test('L1 fires over 80 lines', () => assert.ok(codes(lintHandoff(ctx({ handoff: good + '\n'.repeat(80) + 'x' }))).includes('L1')))
test('L2 fires with no / two / malformed LATEST headings', () => {
  assert.ok(codes(lintHandoff(ctx({ handoff: good.replace('## ⚑ LATEST #2 (2026-10-02) — groundwork laid', '## LATEST') }))).includes('L2'))
  assert.ok(codes(lintHandoff(ctx({ handoff: good + '\n## ⚑ LATEST #3 (2026-10-02) — again' }))).includes('L2'))
  assert.ok(codes(lintHandoff(ctx({ handoff: good.replace('(2026-10-02) — groundwork', '2026-10-02 groundwork') }))).includes('L2'))
})
test('L3 fires when SHIP STATE is prose', () => assert.ok(codes(lintHandoff(ctx({ handoff: good.replace('    node scripts/ship_state.mjs', 'everything is pushed') }))).includes('L3')))
test('L4 fires on zero or two actions', () => {
  assert.ok(codes(lintHandoff(ctx({ handoff: good.replace('### Do the one thing', 'do things') }))).includes('L4'))
  assert.ok(codes(lintHandoff(ctx({ handoff: good.replace('### Do the one thing', '### A\n### B') }))).includes('L4'))
})
test('L5 fires on a hand-written sha but not on dates or plain words', () => {
  assert.ok(codes(lintHandoff(ctx({ handoff: good.replace('state.', 'HEAD is 3c82e14 now.') }))).includes('L5'))
  assert.deepEqual(lintHandoff(ctx({ handoff: good.replace('state.', 'on 2026-10-02 at 20261002, decade faced') })).errs, [])
})
test('L6 fires when the page is not newer than the archive', () => assert.ok(codes(lintHandoff(ctx({ archive: 'ARCHIVED #2' }))).includes('L6')))
test('L7 fires when the two canonical prompts drift', () => {
  assert.ok(codes(lintHandoff(ctx({ workflowJs: "const CANONICAL = 'something else'" }))).includes('L7'))
  assert.equal(extractCanonical(claudeMd), PROMPT)
  assert.equal(extractWorkflowCanonical(workflowJs), PROMPT)
})
test('L8 fires on a missing or overgrown PROGRESS', () => {
  assert.ok(codes(lintHandoff(ctx({ progress: null }))).includes('L8'))
  assert.ok(codes(lintHandoff(ctx({ progress: 'x\n'.repeat(900) }))).includes('L8'))
  assert.equal(lintHandoff(ctx({ progress: 'x\n'.repeat(600) })).warns.length, 1)
})

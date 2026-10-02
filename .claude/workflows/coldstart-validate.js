/**
 * Cold-start handoff validation — adapted from aviary's coldstart_validate_v2.mjs (v2.2), where every rule below was
 * paid for. Runbook: docs/HANDOFF_PROCEDURE.md PART 4 and .claude/skills/handoff/SKILL.md.
 *
 * Invoke (from the interactive session that REPLACED the HANDOFF.md page, after the page is committed + pushed):
 *   Workflow({ scriptPath: "C:/Users/j/claude/current-events-dashboard/.claude/workflows/coldstart-validate.js",
 *              args: { round: <R>, page_n: <N>, sha: "<pushed HEAD, 12 chars>", date: "YYYY-MM-DD" } })
 * (name: "coldstart-validate" also works, but only when Claude Code was launched from the repo directory itself.)
 * `node scripts/ship_state.mjs` prints the exact call (with the next round number) when it says ROUND-DUE.
 *
 * TWO CRITERIA, TWO VERDICTS, NEVER MERGED:
 *   ROUTING  N>=3 blind resumers get ONLY the canonical prompt (verbatim from CLAUDE.md; handoff_lint L7 keeps the two
 *            copies identical) plus harness facts. PASS <=> every resumer names the SAME first action, reports the
 *            frozen sha as HEAD, could execute without asking, and filed no PAGE-scoped BLOCKER / CONTRADICTION / HARMFUL.
 *   CONTENT  EXACTLY ONE fact-checker re-derives every factual claim on the page from the repo (paths, commands, owner
 *            decisions, phase status). Not a bench of six — one agent, one job, recompute or fail.
 * Everything else a resumer notices is BACKLOG (a lead for the session), never automatic page prose: in aviary the fix
 * text of each round seeded the next round's defects.
 * EXIT: ship_state accepts a routing PASS with content PASS/CONTENT-FIXED; after TWO routing FAILs at n>=3 on one page it
 * ships "with the split" by itself (the newest record's `blocking` list becomes the owner's first decision).
 *
 * MANUAL FALLBACK (no Workflow tool): spawn the same agents with the Agent tool — >=3 resumers each given exactly
 * CANONICAL + RUNTIME + one LENS line, plus the fact-checker — and write docs/coldstart/r<R>/RESULT.json by hand in the
 * RESULT shape at the bottom. The record is what ship_state reads; the tool that produced it is not.
 */
export const meta = {
  name: 'coldstart-validate',
  description: 'Cold-start handoff validation: >=3 blind resumers (routing) + one fact-checker (content), two verdicts, RESULT.json',
  phases: [
    { title: 'Resume', detail: 'blind resumers: canonical prompt verbatim + harness facts, nothing else' },
    { title: 'Content', detail: 'one fact-checker: every claim on HANDOFF.md re-derived from the repo' },
    { title: 'Compare', detail: 'do the first actions agree? (a comparer only if the literal commands differ)' },
    { title: 'Record', detail: 'write docs/coldstart/r<R>/RESULT.json and read it back' },
  ],
}

const A = (typeof args === 'string' ? JSON.parse(args) : args) || {}
const ROUND = Number(A.round)
const PAGE_N = Number(A.page_n)
const SHA = String(A.sha || '')
const DATE = String(A.date || 'unknown-date')
const N = Math.max(3, Number(A.n || 3))
if (!ROUND || !PAGE_N || SHA.length < 7) {
  throw new Error(`args needs {round, page_n, sha(>=7 chars), date}; got ${JSON.stringify(A)}. A round with no frozen sha audits a moving tree.`)
}

const REPO = 'C:/Users/j/claude/current-events-dashboard'
const OUT = `${REPO}/docs/coldstart/r${ROUND}`

// Verbatim from CLAUDE.md's canonical-prompt block. scripts/handoff_lint.mjs (L7) fails the gate if they differ.
const CANONICAL =
  'Orient to current-events-dashboard repo, read HANDOFF.md, and continue. Use AskUserQuestion with multiselect to ask me anything you want before launching into development.'

// Harness facts only. Nothing here may state a fact the page under audit is supposed to deliver.
const RUNTIME = [
  'RUNTIME (harness facts only — nothing below tells you anything about the WORK):',
  `- The repo is at ${REPO} on a Windows 11 machine. The harness Bash tool is git-bash; node and git are on PATH.`,
  '- READ-ONLY: no edits, no commits, no pushes, no installs, no deploys, no gate runs. Running read-only repo scripts',
  '  (e.g. node scripts/ship_state.mjs, node scripts/handoff_lint.mjs) and reading any file is fine.',
  `- The ONLY file you may write is your own notes file under ${OUT}/ (named in your instructions).`,
  '- You cannot ask the owner anything: where the prompt says to ask, write down what you WOULD ask instead (would_ask).',
  '- You have NO Workflow tool and you do NOT run cold-start validation rounds. If ship_state says ROUND-DUE for the',
  '  page you are reading, that is THIS round in progress — a property of this sandbox, not a defect; carry on as if',
  '  it had said SHIPPED-CLEAN.',
  '- Do not start development. Stop at the moment you would begin and report the first action you would take.',
].join('\n')

const LENSES = ['straight', 'skeptic', 'executor', 'newcomer', 'archive-reader'].slice(0, N)
const LENS_NOTE = {
  straight: 'Read literally; do exactly what the page says, in order; report what actually happened.',
  skeptic: 'Assume the page is stale somewhere; verify every load-bearing claim by opening the file or running the read-only command before believing it.',
  executor: 'Get to a runnable first command as fast as the page allows; report every point where you had to guess.',
  newcomer: 'You know nothing about this project or its domain (US-government data feeds, web hosting); report every term, acronym or step a newcomer could not follow.',
  'archive-reader': 'Follow every pointer off the front page (MAP, ROADMAP, DECISIONS, OWNER_GRANTS, TRAPS, the skills) and report any that dead-ends or contradicts the page.',
}

const DEFECT = {
  type: 'object',
  required: ['severity', 'kind', 'scope', 'what', 'where', 'evidence'],
  properties: {
    severity: { type: 'string', enum: ['FATAL', 'MAJOR', 'MINOR'] },
    kind: { type: 'string', enum: ['BLOCKER', 'CONTRADICTION', 'HARMFUL', 'STALE', 'AMBIGUOUS', 'MISSING', 'NIT'] },
    scope: { type: 'string', enum: ['PAGE', 'TREE', 'HARNESS'], description: 'PAGE: in HANDOFF.md, or it makes the first action / NEXT ACTION wrong. TREE: elsewhere in the repo; the page still routes right. HARNESS: a property of your sandbox (missing tool/permission) — not a defect.' },
    what: { type: 'string' },
    where: { type: 'string', description: 'file:line, quoting both sides for a contradiction' },
    evidence: { type: 'string' },
  },
}
const RESUME_SCHEMA = {
  type: 'object',
  required: ['verdict', 'first_action_cmd', 'first_action', 'could_execute', 'observed_head', 'would_ask', 'wrote_path', 'defects'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'PASS-WITH-NOTES', 'FAIL'] },
    first_action_cmd: { type: 'string', description: 'The LITERAL first command or file path you would act on after orientation, copied from the page or its pointers. Not prose.' },
    first_action: { type: 'string', description: 'One sentence: what it does and why it is first.' },
    could_execute: { type: 'boolean', description: 'Could you have executed it (outside this read-only sandbox) without asking the owner anything?' },
    observed_head: { type: 'string', description: 'The HEAD sha node scripts/ship_state.mjs printed (7+ chars), or "NONE".' },
    would_ask: { type: 'array', items: { type: 'string' } },
    wrote_path: { type: 'string' },
    defects: { type: 'array', items: DEFECT },
  },
}

phase('Resume')
const resumerJobs = LENSES.map((lens, i) => () => agent(
  `${CANONICAL}\n\n${RUNTIME}\n\nLENS (${lens}): ${LENS_NOTE[lens]}\n\n` +
  `When you have oriented and identified your first action, write your full notes to ${OUT}/resumer-${i + 1}-${lens}.md, then return the structured result.\n` +
  'Two questions matter most — answer both explicitly in your notes and as defects where they apply:\n' +
  '(1) Is anything AMBIGUOUS, CONTRADICTORY or STALE? Quote BOTH sides with file:line.\n' +
  '(2) Did the handoff (or a doc it routes to) tell you to do anything that would be HARMFUL — destructive, outward-facing ' +
  'without the owner\'s OK, or wasteful (re-doing settled work)?',
  { label: `resume:${lens}`, phase: 'Resume', schema: RESUME_SCHEMA }
))

const CONTENT_SCHEMA = {
  type: 'object',
  required: ['content_verdict', 'claims_checked', 'findings', 'wrote_path'],
  properties: {
    content_verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    claims_checked: { type: 'number' },
    findings: { type: 'array', items: { type: 'object', required: ['claim', 'where', 'truth', 'evidence'], properties: { claim: { type: 'string' }, where: { type: 'string' }, truth: { type: 'string' }, evidence: { type: 'string' } } } },
    wrote_path: { type: 'string' },
  },
}
const contentJob = () => agent(
  `You are the ONE content fact-checker for cold-start round r${ROUND} of ${REPO}/HANDOFF.md (page #${PAGE_N}), frozen at ` +
  `commit ${SHA}. Work from that commit: run \`git -C ${REPO} show ${SHA}:HANDOFF.md\` and read other files the same way ` +
  `(git show ${SHA}:<path>) — the working tree may move under you.\n` +
  'Enumerate EVERY factual claim on the page — each path, command, script name, phase status, owner decision, grant, date, ' +
  'count, URL and "X is done / X is next" statement — and re-derive each from the repo at that commit (open the file, check ' +
  'the decision in docs/DECISIONS.md, check the grant in docs/OWNER_GRANTS.md, confirm a command exists and takes the stated ' +
  'flags). Also check that the NEXT ACTION is not already done (git log) and not contradicted by docs/ROADMAP.md. ' +
  'content_verdict is FAIL if any claim is false; a finding is a false claim only (not style). ' +
  `READ-ONLY except your notes: write them to ${OUT}/content-factcheck.md, then return the structured result.`,
  { label: 'content:factcheck', phase: 'Content', schema: CONTENT_SCHEMA }
)

const all = await parallel([...resumerJobs, contentJob])
const resumers = all.slice(0, LENSES.length).map((r, i) => (r ? { lens: LENSES[i], ...r } : null)).filter(Boolean)
const content = all[LENSES.length]
if (resumers.length < LENSES.length) log(`WARNING: ${LENSES.length - resumers.length} resumer(s) returned nothing; a round needs >=3 non-null resumers to PASS.`)

phase('Compare')
const norm = (s) => String(s || '').trim().replace(/^[`$>\s]+|[`\s]+$/g, '').replace(/\s+/g, ' ').toLowerCase()
const cmds = resumers.map((r) => norm(r.first_action_cmd))
let agree = cmds.length >= 3 && cmds.every((c) => c === cmds[0])
let compareNote = agree ? 'identical literal first commands' : ''
if (!agree && resumers.length >= 3) {
  const cmp = await agent(
    'Several fresh agents each read the same handoff and named their FIRST ACTION. Decide whether they name the SAME action ' +
    '(same command or file with trivially different spelling/flags-order counts as same; a different step, a different file, ' +
    'or the same step in a different order does not).\n' +
    resumers.map((r, i) => `${i + 1}. [${r.lens}] cmd: ${r.first_action_cmd}\n   what: ${r.first_action}`).join('\n'),
    { label: 'compare', phase: 'Compare', schema: { type: 'object', required: ['same', 'why'], properties: { same: { type: 'boolean' }, why: { type: 'string' } } } }
  )
  agree = !!(cmp && cmp.same)
  compareNote = cmp ? cmp.why : 'comparer returned nothing'
}

const sha7 = SHA.slice(0, 7).toLowerCase()
const headsOk = resumers.length > 0 && resumers.every((r) => String(r.observed_head || '').toLowerCase().startsWith(sha7) || sha7.startsWith(String(r.observed_head || '').toLowerCase().slice(0, 7)))
const execOk = resumers.length > 0 && resumers.every((r) => r.could_execute === true)
const defects = resumers.flatMap((r) => (r.defects || []).map((d) => ({ ...d, lens: r.lens })))
const blocking = defects.filter((d) => d.scope === 'PAGE' && ['BLOCKER', 'CONTRADICTION', 'HARMFUL'].includes(d.kind))
const blockingOffpage = defects.filter((d) => d.scope === 'TREE' && ['BLOCKER', 'CONTRADICTION', 'HARMFUL'].includes(d.kind))
const backlog = defects.filter((d) => d.scope !== 'HARNESS' && !blocking.includes(d))
const routing = resumers.length >= 3 && agree && headsOk && execOk && blocking.length === 0 ? 'PASS' : 'FAIL'

const RESULT = {
  round: ROUND,
  page_n: PAGE_N,
  sha: SHA,
  date: DATE,
  n_resumers: resumers.length,
  routing_verdict: routing,
  content_verdict: content ? content.content_verdict : 'FAIL',
  routing_axes: { first_actions_agree: agree, compare_note: compareNote, heads_ok: headsOk, could_execute_all: execOk, page_blockers: blocking.length },
  first_actions: resumers.map((r) => ({ lens: r.lens, cmd: r.first_action_cmd, what: r.first_action, head: r.observed_head, verdict: r.verdict })),
  blocking,
  blocking_offpage: blockingOffpage,
  backlog,
  would_ask: resumers.flatMap((r) => (r.would_ask || []).map((q) => `[${r.lens}] ${q}`)),
  content_findings: content ? content.findings : [],
  notes: `${OUT}/`,
}

phase('Record')
const rec = await agent(
  `Write the following JSON EXACTLY (pretty-printed, 2-space indent, trailing newline) to ${OUT}/RESULT.json using the Write ` +
  'tool, creating the directory if needed. Then Read it back and confirm it parses and its "round", "page_n", ' +
  '"routing_verdict" and "content_verdict" match. Change nothing.\n\n' + JSON.stringify(RESULT, null, 2),
  { label: 'record', phase: 'Record', effort: 'low', schema: { type: 'object', required: ['written', 'path'], properties: { written: { type: 'boolean' }, path: { type: 'string' } } } }
)
if (!rec || !rec.written) log(`WARNING: RESULT.json was not confirmed written — write it yourself from the returned object to ${OUT}/RESULT.json`)

return { RESULT, recorded: !!(rec && rec.written) }

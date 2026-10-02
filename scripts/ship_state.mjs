#!/usr/bin/env node
// scripts/ship_state.mjs — the SHIP STATE decision as code: ONE verdict line, then the facts and the next step.
//
// Why this exists (lesson carried from the aviary repo): a ship-state decision written as prose in a handoff page
// rots, and blind resumers ran the wrong git command first. A script cannot drift from the tree it measures.
// HANDOFF.md therefore never states "N commits unpushed" or names a sha; it says "run this".
//
// Usage:   node scripts/ship_state.mjs [--no-fetch] [--offline] [--brief] [--json]
//   --no-fetch  skip `git fetch origin` (fast; divergence may be stale)
//   --offline   also skip the GitHub CI lookup (implies --no-fetch)
//   --brief     print only the verdict and the next step (SessionStart hook)
//   --json      print the measurement + decision as JSON
//
// VERDICTS (first match wins):
//   SETUP-ERROR            not a git repo / no commits / HANDOFF.md lacks "## ⚑ LATEST #N" / git hooks not enabled
//   GATE-RUNNING-WAIT      a gate is running (.gate/running.json names a live pid, younger than 30 min)
//   DIRTY-COMMIT-FIRST     tracked changes or untracked non-ignored files — commit (or discard deliberately) first
//   OFF-MAIN-STOP          HEAD is not on branch main — this repo ships from main only
//   NO-REMOTE              no `origin` — creating a GitHub repo is an owner-approved admin action; ask
//   DIVERGED-STOP          origin/main has commits HEAD lacks — another writer pushed; stop and tell the owner
//   GATE-FAILED-STOP       the newest gate run is for HEAD and FAILED — fix the cause; never loosen a check
//   CI-FAILED-STOP         HEAD is pushed and its CI run failed — fix forward
//   REGATE                 HEAD is ahead of origin but has no PASS stamp — run the gate
//   PUSH-HOLD-STOP         ahead + stamped, but docs/STATUS.json declares push_hold — commit locally only
//   PUSH                   ahead + stamped — push from the harness Bash (Windows git)
//   CI-PENDING-WAIT        pushed, no local stamp, CI for HEAD still running — wait for it
//   PUSHED-UNVERIFIED-STOP pushed, but neither a local stamp nor a CI success covers HEAD (e.g. an ungated push from
//                          elsewhere, or an --offline fresh clone) — gate HEAD before building on it
//   ROUND-DUE              pushed + verified, but no accepted cold-start round covers the CURRENT HANDOFF.md text
//   SHIPPED-CLEAN          pushed + verified, and an accepted round validated exactly this HANDOFF.md
//
// A round covers the page only if it validated the same HANDOFF.md content (blob) — a page number alone is not enough,
// because editing the NEXT ACTION without rotating would otherwise ride on an old round (2026-10-02 review).
//
// EXIT CODE: 0 for PUSH and SHIPPED-CLEAN, 10 for every other verdict, 11 for SETUP-ERROR.
// scripts/hooks/push_guard.mjs relies on line 1 being "ship_state: <VERDICT>". decide() is pure and every branch is
// pinned by tests/harness/ship_state.test.mjs. If you add a branch, add its test, or the branch is a wish.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, git, run, readText, readJson, isMain, hasCommand } from './lib/git.mjs'

const MAIN = 'main'
export const HOOKS_PATH = 'enforcement/git-hooks'
const LOCK_MAX_AGE_MS = 30 * 60_000

export function parsePageNumber(handoffText) {
  if (!handoffText) return null
  const m = handoffText.match(/^## ⚑ LATEST #(\d+)\b/m)
  return m ? Number(m[1]) : null
}

// pageBlob: git blob id of HANDOFF.md at HEAD. Each record carries _blob (HANDOFF.md at the record's sha, resolved by
// measure()) and optionally content_fix_blob (the page after a recorded CONTENT-FIXED edit). When pageBlob is undefined
// (old callers), blobs are not compared.
export function roundState(pageN, rounds, pageBlob) {
  const okContent = (r) => r.content_verdict === 'PASS' || r.content_verdict === 'CONTENT-FIXED'
  const covers = (r) => pageBlob === undefined || (!!pageBlob && (r._blob === pageBlob || r.content_fix_blob === pageBlob))
  const mine = (rounds || []).filter((r) => r && r.page_n === pageN).sort((a, b) => (a.round || 0) - (b.round || 0))
  const nextRound = Math.max(0, ...(rounds || []).map((r) => Number(r && r.round) || 0)) + 1
  const pass = mine.filter((r) => covers(r) && ((r.routing_verdict === 'PASS' && okContent(r)) || r.shipped_with_split === true))
  if (pass.length) return { accepted: true, how: `PASS r${pass[pass.length - 1].round}`, nextRound, records: mine.length }
  const fails = mine.filter((r) => r.routing_verdict === 'FAIL' && Number(r.n_resumers) >= 3)
  const newest = mine[mine.length - 1]
  if (fails.length >= 2 && newest && covers(newest) && okContent(newest)) {
    return { accepted: true, how: `SPLIT after ${fails.length} routing FAILs (owner's first decision: r${newest.round} blocking list)`, nextRound, records: mine.length }
  }
  const stale = mine.filter((r) => !covers(r) && r.routing_verdict === 'PASS')
  if (stale.length) {
    return { accepted: false, how: `r${stale[stale.length - 1].round} validated an earlier text of page #${pageN}; the page changed since (re-round, or rotate to #${pageN + 1})`, nextRound, records: mine.length }
  }
  return { accepted: false, how: mine.length ? `${mine.length} record(s), none accepted` : 'none on record', nextRound, records: mine.length }
}

export function decide(m) {
  const notes = [...(m.notes || [])]
  if (!m.isRepo || !m.head) return { verdict: 'SETUP-ERROR', next: 'Run from inside the current-events-dashboard repo (git init + first commit).', notes }
  if (m.pageN === null || m.pageN === undefined) {
    return { verdict: 'SETUP-ERROR', next: 'HANDOFF.md is missing its "## ⚑ LATEST #N" heading: node scripts/handoff_lint.mjs', notes }
  }
  if (m.hooksPath !== undefined && m.hooksPath !== HOOKS_PATH) {
    return { verdict: 'SETUP-ERROR', next: `git hooks are not enabled in this clone: git config core.hooksPath ${HOOKS_PATH}`, notes }
  }
  if (m.gateRunning) return { verdict: 'GATE-RUNNING-WAIT', next: 'A gate is running. Wait for it; start nothing and commit nothing meanwhile.', notes }
  if (m.dirty && m.dirty.length) {
    return { verdict: 'DIRTY-COMMIT-FIRST', next: 'Commit the listed paths (or discard them deliberately), then re-run node scripts/ship_state.mjs', notes }
  }
  if (m.branch !== undefined && m.branch !== MAIN) {
    return { verdict: 'OFF-MAIN-STOP', next: `HEAD is on '${m.branch}', not ${MAIN}. This repo ships from ${MAIN} only: git switch ${MAIN} (bring the work over by a fast-forward merge), then re-run.`, notes }
  }
  if (!m.hasOrigin) {
    return { verdict: 'NO-REMOTE', next: 'No origin. Creating a GitHub repo is an admin action: ask the owner (docs/OWNER_GRANTS.md). Never create or delete a repo unasked.', notes }
  }
  if (m.fetchOk === false) notes.push('fetch FAILED — divergence below may be stale')
  if (m.behind > 0) {
    return { verdict: 'DIVERGED-STOP', next: 'origin/main has commits HEAD lacks: git log --oneline HEAD..origin/main — stop and tell the owner. Never force-push.', notes }
  }
  if (m.lastGate && m.lastGate.sha === m.head && m.lastGate.verdict === 'FAIL') {
    return { verdict: 'GATE-FAILED-STOP', next: 'The gate FAILED at HEAD: read .gate/last.json, fix the cause (never loosen a check), commit, re-gate.', notes }
  }
  const ci = m.ci || { state: 'unknown' }
  if (m.ahead === 0 && ci.state === 'failure') {
    return { verdict: 'CI-FAILED-STOP', next: `CI failed for the pushed HEAD (${ci.url || 'gh run list --limit 3'}): fix forward, gate, push.`, notes }
  }
  if (m.ahead > 0) {
    if (!m.stampAtHead) return { verdict: 'REGATE', next: 'node scripts/gate.mjs   (then re-run node scripts/ship_state.mjs)', notes }
    if (m.pushHold) return { verdict: 'PUSH-HOLD-STOP', next: `Push hold in docs/STATUS.json (${m.pushHoldReason || 'no reason given'}). Commit locally only; the owner lifts holds.`, notes }
    return { verdict: 'PUSH', next: `git push origin ${MAIN}   (harness Bash / Windows git; never --force)`, notes }
  }
  if (!m.stampAtHead && ci.state !== 'success') {
    if (ci.state === 'pending') return { verdict: 'CI-PENDING-WAIT', next: `CI for the pushed HEAD is still running (${ci.url || 'gh run list --limit 3'}); wait, then re-run.`, notes }
    return { verdict: 'PUSHED-UNVERIFIED-STOP', next: 'The pushed HEAD has no local gate stamp and no known CI success: run node scripts/gate.mjs (and check CI) before building on it.', notes }
  }
  if (ci.state === 'pending') notes.push('CI for HEAD is still running')
  const rs = roundState(m.pageN, m.rounds, m.pageBlob)
  if (!rs.accepted) {
    const root = String(m.repoRoot || REPO_ROOT).replace(/\\/g, '/')
    return {
      verdict: 'ROUND-DUE',
      next: `Run the cold-start round for page #${m.pageN} (${rs.how}): Workflow({scriptPath: "${root}/.claude/workflows/coldstart-validate.js", args: {round: ${rs.nextRound}, page_n: ${m.pageN}, sha: "${m.head.slice(0, 12)}", repo: "${root}", date: "<YYYY-MM-DD>"}}) — see .claude/skills/handoff/SKILL.md`,
      notes,
      round: rs,
    }
  }
  return { verdict: 'SHIPPED-CLEAN', next: 'Nothing to ship. Continue with HANDOFF.md ## NEXT ACTION.', notes, round: rs }
}

function pidAlive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

export function measure({ fetch = true, ci = true } = {}) {
  const m = { isRepo: false, notes: [], repoRoot: REPO_ROOT }
  const top = git(['rev-parse', '--show-toplevel'])
  if (!top.ok) return m
  m.isRepo = true
  const head = git(['rev-parse', 'HEAD'])
  m.head = head.ok ? head.out : null
  m.branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out || '?'
  m.hooksPath = git(['config', '--get', 'core.hooksPath']).out || ''
  const st = git(['status', '--porcelain=v1', '--untracked-files=all'])
  m.dirty = st.out ? st.out.split('\n').filter(Boolean) : []
  const running = readJson('.gate/running.json')
  if (running && !running.__parse_error) {
    const age = Date.now() - (Date.parse(running.started) || 0)
    m.gateRunning = pidAlive(running.pid) && age < LOCK_MAX_AGE_MS
    if (!m.gateRunning) m.notes.push('stale gate lock (process gone or > 30 min old): rm .gate/running.json')
  } else m.gateRunning = false
  m.hasOrigin = git(['remote', 'get-url', 'origin']).ok
  m.fetchOk = null
  if (m.hasOrigin && fetch) m.fetchOk = git(['fetch', '--quiet', 'origin'], { timeoutMs: 45_000 }).ok
  const up = git(['rev-parse', '--verify', '--quiet', `origin/${MAIN}`])
  m.upstream = up.ok ? up.out : null
  if (m.head && m.upstream) {
    const c = git(['rev-list', '--left-right', '--count', `HEAD...origin/${MAIN}`])
    const [a, b] = (c.out || '0 0').split(/\s+/).map(Number)
    m.ahead = a; m.behind = b
  } else if (m.head) {
    m.ahead = Number(git(['rev-list', '--count', 'HEAD']).out || 0); m.behind = 0
  }
  m.stampAtHead = !!(m.head && existsSync(join(REPO_ROOT, '.gate', 'stamps', `${m.head}.json`)))
  const stampDir = join(REPO_ROOT, '.gate', 'stamps')
  m.newestStampSha = null
  if (existsSync(stampDir)) {
    const files = readdirSync(stampDir).filter((f) => f.endsWith('.json'))
      .map((f) => ({ f, t: statSync(join(stampDir, f)).mtimeMs })).sort((x, y) => y.t - x.t)
    if (files.length) m.newestStampSha = files[0].f.replace(/\.json$/, '')
  }
  const lg = readJson('.gate/last.json')
  m.lastGate = lg && !lg.__parse_error ? { sha: lg.sha, verdict: lg.verdict } : null
  const status = readJson('docs/STATUS.json')
  m.pushHold = !!(status && status.push_hold)
  m.pushHoldReason = status && status.push_hold_reason
  m.pageN = parsePageNumber(readText('HANDOFF.md'))
  const blobAt = (rev) => { const r = git(['rev-parse', '--verify', '--quiet', `${rev}:HANDOFF.md`]); return r.ok ? r.out : null }
  m.pageBlob = m.head ? blobAt('HEAD') : null
  m.rounds = []
  const csDir = join(REPO_ROOT, 'docs', 'coldstart')
  if (existsSync(csDir)) {
    for (const d of readdirSync(csDir)) {
      const r = readJson(`docs/coldstart/${d}/RESULT.json`)
      if (r && !r.__parse_error) { r._blob = r.sha ? blobAt(r.sha) : null; m.rounds.push(r) }
    }
  }
  m.ci = { state: 'unknown' }
  if (ci && m.hasOrigin && m.head && m.ahead === 0 && hasCommand('gh')) {
    const r = run('gh', ['run', 'list', '--commit', m.head, '--workflow', 'ci.yml', '--limit', '1', '--json', 'status,conclusion,url'], { timeoutMs: 30_000 })
    if (r.ok) {
      try {
        const [x] = JSON.parse(r.out || '[]')
        if (x) m.ci = { state: x.status !== 'completed' ? 'pending' : x.conclusion === 'success' ? 'success' : 'failure', url: x.url }
        else m.ci = { state: 'none', url: null }
      } catch { /* keep unknown */ }
    }
  }
  return m
}

function main() {
  const argv = new Set(process.argv.slice(2))
  const offline = argv.has('--offline')
  const m = measure({ fetch: !(argv.has('--no-fetch') || offline), ci: !offline })
  const d = decide(m)
  if (argv.has('--json')) {
    console.log(JSON.stringify({ measurement: m, decision: d }, null, 2))
  } else {
    console.log(`ship_state: ${d.verdict}`)
    if (!argv.has('--brief')) {
      const s7 = (s) => (s ? s.slice(0, 7) : 'none')
      console.log(`  head: ${s7(m.head)} on ${m.branch} · origin/${MAIN}: ${s7(m.upstream)} · ahead ${m.ahead ?? '?'} · behind ${m.behind ?? '?'}${m.fetchOk === null ? ' (not fetched)' : ''}`)
      console.log(`  tree: ${m.dirty && m.dirty.length ? `${m.dirty.length} dirty: ${m.dirty.slice(0, 6).join(' | ')}${m.dirty.length > 6 ? ' …' : ''}` : 'clean'}`)
      console.log(`  gate: ${m.stampAtHead ? 'PASS stamp at HEAD' : `no stamp at HEAD (newest stamp: ${s7(m.newestStampSha)})`}${m.lastGate ? ` · last run ${m.lastGate.verdict} at ${s7(m.lastGate.sha)}` : ''}`)
      console.log(`  ci:   ${m.ci ? m.ci.state : 'unknown'}${m.ci && m.ci.url ? ` ${m.ci.url}` : ''}`)
      const rs = m.pageN != null ? roundState(m.pageN, m.rounds, m.pageBlob) : null
      console.log(`  page: HANDOFF #${m.pageN ?? '?'} · cold-start: ${rs ? rs.how : '?'}${rs && !rs.accepted ? ` (next round r${rs.nextRound})` : ''}`)
      if (m.pushHold) console.log(`  hold: PUSH HOLD — ${m.pushHoldReason || ''}`)
      for (const n of d.notes) console.log(`  note: ${n}`)
    }
    console.log(`  next: ${d.next}`)
  }
  process.exit(d.verdict === 'SETUP-ERROR' ? 11 : d.verdict === 'PUSH' || d.verdict === 'SHIPPED-CLEAN' ? 0 : 10)
}

if (isMain(import.meta.url)) main()

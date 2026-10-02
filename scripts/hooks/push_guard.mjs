#!/usr/bin/env node
// scripts/hooks/push_guard.mjs — Claude Code PreToolUse hook (matcher Bash): a `git push` from a Claude session must
// pass scripts/ship_state.mjs. Any verdict other than PUSH (or SHIPPED-CLEAN, where a push is a no-op) exits 2 with
// the verdict on stderr, which the harness feeds back to the model as the reason the push was refused. A force push
// is refused outright. Every other command passes through untouched.
//
// This is a client-side guard for agent sessions; a human at a terminal can bypass it. The server-side floor is
// GitHub branch protection (public repo: available on the free plan) — an admin setting the owner applies.
// Pipe-test:  echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' | node scripts/hooks/push_guard.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, run } from '../lib/git.mjs'

export function isPush(cmd) {
  return /(^|[;&|(]\s*|\s)git(\s+-[Cc]\s+("[^"]*"|\S+))*\s+push\b/.test(cmd || '')
}
export function isForce(cmd) {
  return /\spush\b[^;&|]*(\s--force(-with-lease)?\b|\s-f\b|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S+)/.test(cmd || '')
}

function main() {
  let input = ''
  try { input = readFileSync(0, 'utf8') } catch { process.exit(0) }
  let cmd = ''
  try { cmd = (JSON.parse(input).tool_input || {}).command || '' } catch { process.exit(0) }
  if (!isPush(cmd) || /--dry-run|\s-n\b/.test(cmd)) process.exit(0)
  if (isForce(cmd)) {
    process.stderr.write('push_guard: REFUSED — force pushes are never allowed in this repo (CLAUDE.md, Git & GitHub).\n')
    process.exit(2)
  }
  const r = run(process.execPath, [join(REPO_ROOT, 'scripts', 'ship_state.mjs')], { timeoutMs: 120_000 })
  const out = [r.out, r.err].filter(Boolean).join('\n')
  const verdict = (out.split('\n')[0] || '').replace(/^ship_state:\s*/, '').trim()
  if (verdict === 'PUSH' || verdict === 'SHIPPED-CLEAN') process.exit(0)
  process.stderr.write(`push_guard: REFUSED — scripts/ship_state.mjs says ${verdict || '(no verdict)'}, not PUSH.\n${out}\n` +
    'push_guard: obey the printed next command first (commit, gate PASS stamp at HEAD), then push.\n')
  process.exit(2)
}

if (process.argv[1] && process.argv[1].endsWith('push_guard.mjs')) main()

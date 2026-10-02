#!/usr/bin/env node
// scripts/hooks/push_guard.mjs — Claude Code PreToolUse hook (matcher Bash): a `git push` from a Claude session must
// pass scripts/ship_state.mjs, and only the plain shape is allowed at all.
//
// Allowed:  git [-C <dir>] [-c k=v] push [-u|--set-upstream] [-q|-v|--porcelain|--progress] [origin] [main|HEAD:main]
//           (a dry run `-n`/`--dry-run` of that shape is allowed without the ship_state check).
// Refused outright, whatever ship_state says: force (`--force`, `-f`, `--force-with-lease`, `--force-if-includes`,
// `+refspec`), deletion (`--delete`, `-d`, `:ref`), `--mirror`, `--all`, `--prune`, `--no-verify`, any other remote or
// refspec, and any flag not in the allowlist. (CLAUDE.md: never force-push, never delete a remote branch, never skip hooks.)
// Otherwise the push needs ship_state verdict PUSH (or SHIPPED-CLEAN, where a push is a no-op).
//
// Parsing: quoted strings are blanked first (so a commit message that mentions "git push" is not a push), then the
// command is split on ; && || | & and newlines, and each segment is checked on its own. A `-n` in another segment
// (e.g. `| tail -n 5`) means nothing here — the 2026-10-02 review bypassed the old guard exactly that way.
//
// This is a client-side guard for agent sessions; a human at a terminal can bypass it. It only runs when Claude Code is
// launched from the repo directory (docs/TRAPS.md). Pipe-test:
//   echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' | node scripts/hooks/push_guard.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const OK_FLAGS = new Set(['-u', '--set-upstream', '-q', '--quiet', '-v', '--verbose', '--porcelain', '--progress'])
const DRY_FLAGS = new Set(['-n', '--dry-run'])
const OK_REFSPECS = new Set(['main', 'HEAD:main', 'main:main', 'HEAD:refs/heads/main', 'refs/heads/main'])

export function blankQuotes(cmd) {
  // remove heredoc bodies (<<'X' ... X / <<X ... X), then single- and double-quoted strings
  let s = String(cmd || '').replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(\n|$)/g, ' HEREDOC ')
  s = s.replace(/'[^']*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""')
  return s
}

export function segments(cmd) {
  const s = blankQuotes(cmd)
    .replace(/\d*>&\d+/g, ' ') // 2>&1
    .replace(/\d*>>?\s*[^\s;&|]+/g, ' ') // >file, 2>/dev/null, >>log
    .replace(/<\s*[^\s;&|<]+/g, ' ') // <input
  return s.split(/\|\||&&|[;|&\n]/).map((x) => x.trim()).filter(Boolean)
}

// Returns null if the segment is not a git push, else {args:[...after push]}.
export function parsePush(segment) {
  const t = segment.split(/\s+/)
  let i = 0
  while (i < t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[i])) i++ // VAR=value prefixes
  if (i >= t.length || !/(^|[\\/])git(\.exe)?$/.test(t[i])) return null
  i++
  while (i < t.length && t[i].startsWith('-')) { // git global options
    if (t[i] === '-C' || t[i] === '-c') i += 2
    else i++
  }
  if (t[i] !== 'push') return null
  return { args: t.slice(i + 1) }
}

// Returns {ok, dry, reason}
export function judgePush(args) {
  let dry = false
  const pos = []
  for (const a of args) {
    if (DRY_FLAGS.has(a)) { dry = true; continue }
    if (OK_FLAGS.has(a)) continue
    if (a.startsWith('-')) return { ok: false, reason: `flag ${a} is not allowed (force, delete, mirror, all, prune, no-verify and unknown flags are refused)` }
    pos.push(a)
  }
  if (pos.length > 2) return { ok: false, reason: 'more than one refspec' }
  if (pos.length >= 1 && pos[0] !== 'origin') return { ok: false, reason: `remote ${pos[0]} is not allowed (only origin)` }
  if (pos.length === 2 && !OK_REFSPECS.has(pos[1])) return { ok: false, reason: `refspec ${pos[1]} is not allowed (only main / HEAD:main)` }
  return { ok: true, dry }
}

export function analyze(cmd) {
  const pushes = segments(cmd).map(parsePush).filter(Boolean)
  if (!pushes.length) return { push: false }
  for (const p of pushes) {
    const j = judgePush(p.args)
    if (!j.ok) return { push: true, refuse: j.reason }
  }
  return { push: true, dryOnly: pushes.every((p) => judgePush(p.args).dry) }
}

// Fails CLOSED: any error (unreadable input, a broken import, ship_state crashing) refuses the push with exit 2,
// because exit 1 is a non-blocking hook error in Claude Code and the push would go through.
async function main() {
  const refuse = (msg) => { process.stderr.write(`push_guard: REFUSED — ${msg}\n`); process.exit(2) }
  let cmd = ''
  try {
    const input = readFileSync(0, 'utf8')
    const j = JSON.parse(input)
    cmd = (j.tool_input || {}).command || ''
  } catch (e) {
    return refuse(`could not read the hook input (${e && e.message}); failing closed.`)
  }
  let a
  try { a = analyze(cmd) } catch (e) { return refuse(`could not parse the command (${e && e.message}); failing closed.`) }
  if (!a.push) process.exit(0)
  if (a.refuse) return refuse(`${a.refuse}. Only \`git push [-u] origin main\` is allowed from a session (CLAUDE.md, Git & GitHub).`)
  if (a.dryOnly) process.exit(0)
  try {
    const { REPO_ROOT, run } = await import('../lib/git.mjs')
    const r = run(process.execPath, [join(REPO_ROOT, 'scripts', 'ship_state.mjs')], { timeoutMs: 120_000 })
    const out = [r.out, r.err].filter(Boolean).join('\n')
    const verdict = (out.split('\n')[0] || '').replace(/^ship_state:\s*/, '').trim()
    if (verdict === 'PUSH' || verdict === 'SHIPPED-CLEAN') process.exit(0)
    return refuse(`scripts/ship_state.mjs says ${verdict || '(no verdict)'}, not PUSH.\n${out}\n` +
      'push_guard: obey the printed next step first (commit, gate PASS stamp at HEAD, on main), then push.')
  } catch (e) {
    return refuse(`ship_state could not run (${e && e.message}); failing closed.`)
  }
}

if (process.argv[1] && process.argv[1].endsWith('push_guard.mjs')) main().catch((e) => { process.stderr.write(`push_guard: REFUSED — ${e && e.message}
`); process.exit(2) })

#!/usr/bin/env node
// scripts/hooks/dirty_warn.mjs — Claude Code Stop hook, WARN-ONLY: when Claude stops with handoff-bearing files edited
// but uncommitted, show a one-line warning. It never blocks (a blocking Stop hook forces WIP commits that move HEAD
// out from under the gate stamp). Exit 0 always. Pipe-test:  echo '{}' | node scripts/hooks/dirty_warn.mjs
import { git } from '../lib/git.mjs'

const WATCH = ['HANDOFF.md', 'HANDOFF_ARCHIVE.md', 'PROGRESS.md', 'CLAUDE.md', 'MAP.md', 'docs/']
const st = git(['status', '--porcelain=v1', '--', ...WATCH])
const dirty = st.ok && st.out ? st.out.split('\n').map((l) => l.slice(3)).filter(Boolean) : []
if (dirty.length) {
  const msg = `handoff files edited but not committed: ${dirty.slice(0, 6).join(', ')}${dirty.length > 6 ? ' …' : ''} — commit them, run node scripts/ship_state.mjs, and if HANDOFF.md's page was replaced run the cold-start round before calling the session closed.`
  process.stdout.write(JSON.stringify({ systemMessage: msg }) + '\n')
}
process.exit(0)

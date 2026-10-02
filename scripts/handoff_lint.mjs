#!/usr/bin/env node
// scripts/handoff_lint.mjs — the SHAPE of the handoff, enforced (docs/HANDOFF_PROCEDURE.md). Exit 0 = PASS.
//
// Rules carried from aviary, where each one was paid for:
//   L1 LINES       HANDOFF.md <= 80 lines. Over the cap, content LEAVES the page (to PROGRESS / docs/*); it is never
//                  compressed. A long hand-written page failed six validation rounds out of six.
//   L2 LATEST      exactly one "## ⚑ LATEST #N (YYYY-MM-DD) — title" heading; N is the page number cold-start rounds key on.
//   L3 SHIP STATE  a "## SHIP STATE" section that tells the reader to RUN `node scripts/ship_state.mjs` — never prose
//                  about the tree.
//   L4 NEXT        exactly one "## NEXT ACTION" section holding exactly one "### " action heading.
//   L5 NO SHA      no hand-written commit sha on the page: it is stale the moment the next commit lands.
//   L6 ARCHIVE     the page number is greater than every "ARCHIVED #m" in HANDOFF_ARCHIVE.md (rotation is append-only).
//   L7 PROMPT      the canonical resume prompt in CLAUDE.md (between the canonical-prompt markers) is byte-identical to
//                  the CANONICAL constant in .claude/workflows/coldstart-validate.js — a claim written in two places is
//                  corrected in one unless a machine checks it.
//   L8 PROGRESS    PROGRESS.md exists and is under 800 lines (rotate the oldest entries to PROGRESS_ARCHIVE.md at ~500).
import { readText, isMain } from './lib/git.mjs'

export const MAX_LINES = 80

export function sectionBody(text, heading) {
  const lines = text.split('\n')
  const i = lines.findIndex((l) => l.trim() === heading || l.startsWith(heading + ' '))
  if (i < 0) return null
  const out = []
  for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) out.push(lines[j])
  return out.join('\n')
}

export function extractCanonical(claudeMd) {
  const m = claudeMd && claudeMd.match(/<!-- canonical-prompt -->\s*\n>\s*([\s\S]*?)\n\s*<!-- \/canonical-prompt -->/)
  return m ? m[1].replace(/\n>\s*/g, ' ').trim() : null
}

export function extractWorkflowCanonical(js) {
  const m = js && js.match(/const CANONICAL\s*=\s*\n?\s*(['"`])([\s\S]*?)\1/)
  return m ? m[2].trim() : null
}

export function lintHandoff({ handoff, archive, claudeMd, workflowJs, progress }) {
  const errs = []
  const warns = []
  if (handoff === null) return { errs: ['L0 HANDOFF.md is missing'], warns }
  const lines = handoff.replace(/\n$/, '').split('\n')
  if (lines.length > MAX_LINES) errs.push(`L1 LINES: HANDOFF.md has ${lines.length} lines (cap ${MAX_LINES}). Move content off the page; never compress it.`)

  const latest = lines.filter((l) => /^## ⚑ LATEST #\d+/.test(l))
  let pageN = null
  if (latest.length !== 1) errs.push(`L2 LATEST: need exactly one "## ⚑ LATEST #N (YYYY-MM-DD) — title" heading, found ${latest.length}`)
  else {
    const m = latest[0].match(/^## ⚑ LATEST #(\d+) \((\d{4}-\d{2}-\d{2})\) — \S/)
    if (!m) errs.push(`L2 LATEST: heading must read "## ⚑ LATEST #N (YYYY-MM-DD) — title"; got: ${latest[0]}`)
    else pageN = Number(m[1])
  }

  const ship = sectionBody(handoff, '## SHIP STATE')
  if (ship === null) errs.push('L3 SHIP STATE: missing "## SHIP STATE" section')
  else if (!ship.includes('node scripts/ship_state.mjs')) errs.push('L3 SHIP STATE: the section must tell the reader to run `node scripts/ship_state.mjs`')

  const nextCount = lines.filter((l) => l.trim() === '## NEXT ACTION').length
  const next = sectionBody(handoff, '## NEXT ACTION')
  if (nextCount !== 1 || next === null) errs.push(`L4 NEXT: need exactly one "## NEXT ACTION" section, found ${nextCount}`)
  else {
    const acts = next.split('\n').filter((l) => /^### /.test(l))
    if (acts.length !== 1) errs.push(`L4 NEXT: "## NEXT ACTION" must hold exactly one "### " action heading, found ${acts.length}`)
  }

  const shaRe = /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g
  const shas = [...handoff.matchAll(shaRe)].map((m) => m[0])
  if (shas.length) errs.push(`L5 NO SHA: the page names commit-like hex (${[...new Set(shas)].slice(0, 3).join(', ')}). Say "run node scripts/ship_state.mjs" instead.`)

  if (pageN !== null && archive) {
    const archived = [...archive.matchAll(/ARCHIVED #(\d+)/g)].map((m) => Number(m[1]))
    const max = archived.length ? Math.max(...archived) : 0
    if (pageN <= max) errs.push(`L6 ARCHIVE: page #${pageN} is not newer than ARCHIVED #${max}; a replaced page gets the next number`)
  }

  const a = extractCanonical(claudeMd)
  const b = extractWorkflowCanonical(workflowJs)
  if (!a) errs.push('L7 PROMPT: CLAUDE.md has no <!-- canonical-prompt --> block')
  else if (!b) errs.push('L7 PROMPT: .claude/workflows/coldstart-validate.js has no CANONICAL constant')
  else if (a !== b) errs.push(`L7 PROMPT: CLAUDE.md and coldstart-validate.js disagree:\n      CLAUDE.md : ${a}\n      workflow  : ${b}`)

  if (progress === null) errs.push('L8 PROGRESS: PROGRESS.md is missing')
  else {
    const n = progress.split('\n').length
    if (n > 800) errs.push(`L8 PROGRESS: ${n} lines — rotate the oldest entries to PROGRESS_ARCHIVE.md (keep ~300)`)
    else if (n > 500) warns.push(`L8 PROGRESS: ${n} lines — rotate soon (oldest entries to PROGRESS_ARCHIVE.md)`)
  }
  return { errs, warns, pageN, lines: lines.length }
}

function main() {
  const r = lintHandoff({
    handoff: readText('HANDOFF.md'),
    archive: readText('HANDOFF_ARCHIVE.md') || '',
    claudeMd: readText('CLAUDE.md'),
    workflowJs: readText('.claude/workflows/coldstart-validate.js'),
    progress: readText('PROGRESS.md'),
  })
  for (const w of r.warns) console.log(`WARN  ${w}`)
  for (const e of r.errs) console.log(`FAIL  ${e}`)
  console.log(`handoff_lint: ${r.errs.length ? 'FAIL' : 'PASS'} (page #${r.pageN ?? '?'}, ${r.lines ?? '?'} lines)`)
  process.exit(r.errs.length ? 1 : 0)
}

if (isMain(import.meta.url)) main()

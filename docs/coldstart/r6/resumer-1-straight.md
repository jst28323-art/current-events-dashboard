# Cold-start r6 — resumer 1 (lens: straight) — HANDOFF #4

Time at orientation: Mon 2026-10-05 21:00 CDT = 22:00 ET = Tue 02:00Z (`date`).

## What I did, in the page's order

1. Read `HANDOFF.md` (58 lines; `node scripts/handoff_lint.mjs` -> `PASS (page #4, 58 lines)`).
2. SHIP STATE: `node scripts/ship_state.mjs` (harness Bash, repo dir):
   - `ship_state: ROUND-DUE` · head `4a6eb33` on main = origin/main, ahead 0 / behind 0 · tree clean · gate PASS stamp
     at HEAD · CI first `pending`, re-run with `--no-fetch` a few minutes later: `success` (run 37401748435) ·
     page HANDOFF #4, cold-start none on record (next round r6).
   - ROUND-DUE for page #4 is this round (sandbox property). Treated as SHIPPED-CLEAN -> NEXT ACTION.
3. Read `CLAUDE.md`, `docs/ROADMAP.md` Phases 1-2 (lines 1-151), `MAP.md`.
4. Page's own check (HANDOFF.md:17-18): `Get-ScheduledTask | ? TaskName -like 'CED*'` (PowerShell) -> count 0.
   The one-time capture task is gone. PASS.
5. Verified page claims against the tree:
   - Monday's recordings committed: 147 fixture bodies (294 files with meta) under `*/2026-10-05/` are tracked;
     `fixtures/README.md:66-80` has their rows. OK.
   - `p2.2-final` (62b07ec) and `p2.2-revert-kit` (f99daf9) exist locally only (no remote branches), both based on
     main 5ca8c7b. Gate stamps exist in the p22-int worktree for G1 `af5cfd9` and the top `62b07ec`. OK.
   - `docs/STATUS.json`: `push_hold: false`.
   - `scratch/youtube/` holds `result_2026-10-05.json`, `run_37338433045/`, `result_key.pem` (deadline 2026-11-04,
     not today's work).
   - O1..O4 of `docs/design/P2.2.md` §9 are all settled (D-090, D-091, D-092, D-096 "do not ask again"): not re-asked.

## NEXT ACTION, step by step, against the clock

| step | when its data exists | now (Mon 22:00 ET) |
|---|---|---|
| 1 Ask first (one AskUserQuestion, multiselect, + PushNotification) | now | **FIRST ACTION** (would_ask below) |
| 2 Oct 6 Senate gallery post -> `fixtures/senate.pressgallery/2026-10-06/` | Tue 2026-10-06 ~15:30 ET (pro forma 13:30 ET per `fixtures/README.md:79,84`; Oct 5's post went public 91 min after convene, `docs/TRAPS.md:348-353`) | waiting |
| 3 `node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06` -> ROADMAP Phase 1 exit status | after Tue 2026-10-06 18:00 ET | waiting |
| 4 tick Phase 1, ask owner G0 first | after step 3 PASSes on both days | waiting |
| 5 `handoff` skill | session end | — |

So per HANDOFF.md:37 ("do the ones whose data exists, record what is still waiting, and stop there"): ask, record
the answers, record that steps 2-4 are waiting, stop.

Step 2 command when its time comes (URL copied from
`fixtures/senate.pressgallery/2026-10-05/posts_newest3_after_pro_forma.json.meta.json`):

    node scripts/record_fixture.mjs senate.pressgallery "https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories" --date 2026-10-06 --name posts_newest3_after_pro_forma.json

then check `X-WP-Total` went up and the new post carries "The Senate convened for a pro forma session", add the
`fixtures/README.md` row (and move it out of "Pending"), commit.

## First action

One AskUserQuestion (multiSelect) with a PushNotification (HANDOFF.md:38-39; CLAUDE.md:36-38), because steps 2-3
have no data until Tuesday afternoon and nothing else on the page is actionable before then.

## would_ask (what I would put in that one AskUserQuestion)

1. **Timing.** Phase 1's last check needs Tuesday's data: the Senate gallery post (~3:30 pm ET) and the latency
   report (after 6 pm ET). It is Monday 10 pm ET now. End now and resume Tuesday after 6 pm ET (one session does
   both; Rec.) / keep this session open and do each at its time / resume Wednesday morning.
2. **While waiting** (D-098 covers building P2.2 on a local branch, but the page says "stop there"): do nothing until
   Phase 1 closes / work on P2.2's open items on the local branch only (G9's fastpath exception, T-LEASE and
   T-PARSE-DIES against the real Hub, rebase `p2.2-final` onto today's main and re-gate the G1 boundary). Nothing
   pushed either way.
3. **Go-live question timing** (optional): ask the G0 / G1 go-live question only after Tuesday's report passes, one
   step at a time as the page says (Rec.) / ask it now, conditional on a PASS, so G1 can land Wed Oct 7 as the
   design's calendar fit plans (P2.2.md §4.1 "Calendar fit").
4. **Housekeeping** (low priority): about 20 local builder branches (p2.1-*, p2.2-* builders, worktree-wf_*) and 11
   worktrees remain from the builds. Keep all until P2.2 is merged (Rec.) / prune the P2.1 ones now (local only;
   never a remote branch, never a repo).

## (1) Ambiguous, contradictory or stale (both sides quoted)

- **CONTRADICTION (page, minor).** HANDOFF.md:11 "**Owner rulings D-097..D-106**, each asked with a push
  notification" vs `docs/DECISIONS.md:115` "| D-105 | 2026-10-05 | agent |" and `docs/DECISIONS.md:116`
  "| D-106 | 2026-10-05 | agent |". D-105/D-106 are agent rows, not asked; PROGRESS.md:12-16 correctly lists the
  owner rulings as D-097..D-104.
- **STALE (routed doc on the branch, minor).** HANDOFF.md:20-21 says the revert kit exists ("the local branch
  `p2.2-revert-kit`") and that "Everything about them, including what each push still needs" is in
  `git show p2.2-final:docs/design/P2.2_integration.md`. That doc's §6.2 (its line 512) still says: "**G1 push
  blocked by design §7 Stage 3b: the revert kit** (`p2.2-revert-kit`: ...) is not built." The kit was built later
  (`p2.2-revert-kit:docs/design/P2.2_revert_kit.md`, dated ~20:35 CDT, 11 tests + gate), and the kit's own pending
  item (re-create `30f6832` against the pushed G1, its §3) lives only in that other file, which the page does not
  route to. A resumer who trusts §6.2 could rebuild a kit that exists.
- **AMBIGUOUS (page, minor).** HANDOFF.md:19 "every go-live step G0..G9 a gated range" vs integration notes §8: the
  full gate ran only at G1 `af5cfd9` and at the top; the other boundaries ran typecheck/vitest/harness/check_paths/
  dry-run (table in §8). Also `docs/design/P2.2.md:519` G0 = "nothing pushed" vs integration §8 G0 = a 2-commit range
  `6195c59..5d85b16` (export_store), and HANDOFF.md:48-49 "ask the owner whether P2.2 goes live, one step at a time
  (... G0 first ...)": is G0 a push or not? Not decision-relevant until Phase 1 closes; the pre-push hook needs a
  gate stamp at whatever is pushed anyway.
- **AMBIGUOUS (page, minor).** HANDOFF.md:37 "record what is still waiting, and stop there" names no file (PROGRESS
  entry via the handoff skill is the obvious home; ROADMAP's exit-status line already says exit 3 is OPEN).
- **NIT (page).** HANDOFF.md:50-51 lists "rebase onto main and re-gate" as part of "what the integration notes'
  pending section lists"; §6.2 does not list a rebase (PROGRESS #9 and the kit notes do). The page names it itself,
  so nothing is lost.
- **NIT (tree, dated record).** Integration notes line 8 "Branch `p2.2-int` (worktree `.claude/worktrees/p22-int`)":
  that worktree now has `p2.2-final` checked out (`git worktree list`); §8 "main has moved to `781bed7`": main is
  now `4a6eb33`. The doc is a dated record and says to push from `p2.2-final`; harmless.

Nothing in the page's state paragraph is stale against the tree: ship_state, the scheduled-task check, the fixtures,
the branches and the gate stamps all match.

## (2) Harmful instructions?

None found. Every outward-facing step is fenced: branches never merged or pushed without the owner's go per step
(HANDOFF.md:21-22, D-098); pushes only under G-003 when ship_state says PUSH; the only commit the page asks for
before Phase 1 closes is a fixture row on main (step 2). The one waste risk is the stale §6.2 line above (rebuilding
the revert kit). The step-2 fixture GET is a single polite read of a public WordPress endpoint. The ledger report
reads our own API.

## Sandbox notes (not defects)

- ROUND-DUE is this round. No AskUserQuestion / PushNotification / Workflow tool in the sandbox; questions are listed
  above instead. No edits, commits, gate runs or network beyond ship_state's fetch/CI query.
- `git status --ignored` printed "could not open directory .claude/worktrees/p2.1*/node_modules/@ced/..." warnings
  (broken workspace symlinks in old worktrees); cosmetic.

Verdict: PASS-WITH-NOTES. The page routes straight to one first action (ask, then wait for Tuesday's data).

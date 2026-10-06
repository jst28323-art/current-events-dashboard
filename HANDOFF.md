# HANDOFF — read this first

AS-OF 2026-10-05 · one page. Repo `C:\Users\j\claude\current-events-dashboard` · GitHub `jst28323-art/current-events-dashboard`
(public) · live page <https://jst28323-art.github.io/current-events-dashboard/> · live API
<https://ced-api.usgovfeed.workers.dev/api/v1/status>. **Read `CLAUDE.md` next** (the contract), then `docs/ROADMAP.md`
Phases 1 and 2. `MAP.md` says where everything else lives. The tree's state is a command, not prose: this page names no commit.

## ⚑ LATEST #4 (2026-10-05) — Phase 1 waits only on Tuesday's data; P2.2 is built on a local branch, not live

Phase 1 is live; its only open exit criterion (3) needs Tuesday's live polling. This session (PROGRESS #9):
- **Owner rulings D-097..D-104**, each asked with a push notification: the Google key now; P2.2 built early on a local
  branch (D-098, owner override); exit 3 counts documents and also reports filing-slot sightings (D-099, set before
  Tuesday's data); the Phase 3 press-conference choices (D-101..D-103) and the shared research budget (D-104).
- **YouTube:** the owner made the key (Actions secret `YOUTUBE_API_KEY`) and ran the one research call. Agent rows
  D-105 and D-106 apply YouTube's terms to that call's result (kept 30 days at most; never committed, dumped or
  aggregated): conclusions are in prose only, and the decrypted copy's deletion is a dated ROADMAP P3.3 item.
- **Monday's recordings (P2.3) are committed**, and the one-time Windows capture task has deleted itself.
- **P2.2 is built, NOT live:** the local branch `p2.2-final` (each go-live step G0..G9 a contiguous range; the full gate
  passed at the G1 boundary and at the top, lighter checks at the other boundaries; G9 not pushable yet) and the local
  branch `p2.2-revert-kit`. Read `git show p2.2-final:docs/design/P2.2_integration.md` (its opening addendum first) and
  `git show p2.2-revert-kit:docs/design/P2.2_revert_kit.md`. They exist only on this PC. D-098: nothing from them is
  merged or pushed until Phase 1's exit criteria are met and G0 is done.

## SHIP STATE

    node scripts/ship_state.mjs

Run it first, from the harness Bash in the repo directory, and obey its one verdict line. It fetches origin (`--no-fetch`
skips that) and asks GitHub for the CI result (`--offline` skips that too). `SHIPPED-CLEAN` means nothing is owed, so go
to NEXT ACTION. Any other verdict prints its next step on the `next:` line (a command, or an instruction to wait, stop,
fix or ask the owner): do that first. Never reason about the tree from prose.

## NEXT ACTION

### Close Phase 1 with Tuesday's data, then ask the owner whether P2.2 goes live

Each step says when its data exists; do the ones whose data exists, write what is still waiting into the session's
PROGRESS entry (step 5), and stop there.
1. **Ask first**, as the canonical prompt says: one AskUserQuestion (with a PushNotification) for anything the repo
   does not answer; do not re-ask what `docs/DECISIONS.md` settles.
2. **The Oct 6 Senate gallery post**, from Tue 2026-10-06 ~15:30 ET (posts go public late: `docs/TRAPS.md`), with the
   production newest-3 URL from `fixtures/senate.pressgallery/2026-10-05/posts_newest3_after_pro_forma.json.meta.json`:
   `node scripts/record_fixture.mjs senate.pressgallery "<that url>" --date 2026-10-06 --name posts_newest3_after_pro_forma.json`.
   Tuesday's post must be among the 3, with its convene line (another day's early shell may sit above it); if not
   yet, try again later. Add its row to `fixtures/README.md` and commit. Friday Oct 9: the same.
3. **Live latency (exit 3)**, after Tue 2026-10-06 18:00 ET: `node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06`;
   record its PASS/FAIL lines, n, the medians and the filing-slot sightings behind each median (D-099) in ROADMAP's
   Phase 1 exit status, and mark (3) MET there if both days pass. A failing day does not count: run it again on the
   next business day with that day in `--days` (the exit needs any 2 business days). The White House lag line is not
   part of the exit: check each listed item over 1 h against its page's `dateModified` (`docs/TRAPS.md`) and record n
   and the median in the session's PROGRESS entry (TRAPS wants n >= 20 business-day items before acting on the lag).
4. When every Phase 1 exit criterion is met, ask the owner whether P2.2's go-live starts (`docs/design/P2.2.md` §4.1;
   G5 and G6 must be live before Sun Nov 8). Before the G1 push, do the checklist in the integration notes' opening
   addendum (rebase and re-gate, the store export, the living-doc rows, the revert kit re-made on the pushed G1).
5. End with the `handoff` skill (`.claude/skills/handoff/SKILL.md`; read it by path if it is not listed).

## WHERE THINGS ARE

`MAP.md` answers "where is X?" · `docs/TRAPS.md` covers what wastes a day · `PROGRESS.md` is the session log, newest
first · `HANDOFF_ARCHIVE.md` keeps superseded front pages · the YouTube key walkthrough page:
<https://claude.ai/artifact/KzryEjf4wjwUgGRYneuCY6> · account setup page: <https://claude.ai/artifact/3tfFpfAFLX1d8VShdzbBjj>.

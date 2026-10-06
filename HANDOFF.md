# HANDOFF — read this first

AS-OF 2026-10-05 · one page. Repo `C:\Users\j\claude\current-events-dashboard` · GitHub `jst28323-art/current-events-dashboard`
(public) · live page <https://jst28323-art.github.io/current-events-dashboard/> · live API
<https://ced-api.usgovfeed.workers.dev/api/v1/status>. **Read `CLAUDE.md` next** (the contract), then `docs/ROADMAP.md`
Phases 1 and 2. `MAP.md` says where everything else lives. The tree's state is a command, not prose: this page names no commit.

## ⚑ LATEST #4 (2026-10-05) — Phase 1 waits only on Tuesday's data; P2.2 is built on a local branch, not live

Phase 1 is live; its only open exit criterion (3) needs Tuesday's live polling. This session (PROGRESS #9):
- **Owner rulings D-097..D-106**, each asked with a push notification: the Google key now; P2.2 built early on a local
  branch (D-098, owner override); exit 3 counts documents and also reports filing-slot sightings (D-099, set before
  Tuesday's data); the Phase 3 press-conference choices (D-101..D-104).
- **YouTube:** the owner made the key (Actions secret `YOUTUBE_API_KEY`) and ran the one research call. YouTube's terms
  allow its data 30 days at most and forbid publishing it or any aggregate (D-105, D-106): conclusions are in prose only,
  and the decrypted copy in the gitignored `scratch/youtube/` must be deleted by 2026-11-04.
- **Monday's recordings (P2.3) are committed.** The one-time Windows capture task was set to delete itself after its
  trigger expired: check that `Get-ScheduledTask | ? TaskName -like 'CED*'` (PowerShell) returns nothing.
- **P2.2 is built, NOT live:** the local branch `p2.2-final` (every go-live step G0..G9 a gated range; G9 not
  pushable yet) and the local branch `p2.2-revert-kit`. Everything about them, including what each push still needs:
  `git show p2.2-final:docs/design/P2.2_integration.md`. They exist only on this PC. Never merge or push them without the
  owner's go for that step (D-098).

## SHIP STATE

    node scripts/ship_state.mjs

Run it first, from the harness Bash in the repo directory, and obey its one verdict line. It fetches origin (`--no-fetch`
skips that) and asks GitHub for the CI result (`--offline` skips that too). `SHIPPED-CLEAN` means nothing is owed, so go
to NEXT ACTION. Any other verdict prints its next step on the `next:` line (a command, or an instruction to wait, stop,
fix or ask the owner): do that first. Never reason about the tree from prose.

## NEXT ACTION

### Close Phase 1 with Tuesday's data, then ask the owner whether P2.2 goes live

Each step says when its data exists; do the ones whose data exists, record what is still waiting, and stop there.
1. **Ask first**, as the canonical prompt says: one AskUserQuestion (with a PushNotification) for anything the repo
   does not answer; do not re-ask what `docs/DECISIONS.md` settles.
2. **The Oct 6 Senate gallery post**, from Tue 2026-10-06 ~15:30 ET: record the production newest-3 list into a new
   `2026-10-06` folder under `fixtures/senate.pressgallery/`, as `fixtures/README.md` "Pending" says (posts go public late:
   `docs/TRAPS.md`), check that the post carries its convene line, add its row, commit. Friday Oct 9: the same.
3. **Live latency (exit 3)**, after Tue 2026-10-06 18:00 ET: `node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06`;
   record its PASS/FAIL lines, n, the medians and the filing-slot sightings behind each median (D-099) in ROADMAP's
   Phase 1 exit status. Its White House lag line: check every item over 1 h against its page's `dateModified` before
   calling it a delay (`docs/TRAPS.md`); TRAPS wants n >= 20 business-day items before acting on the lag, so if two
   days give fewer, record n and keep collecting.
4. When every Phase 1 exit criterion is met, tick it in ROADMAP and ask the owner whether P2.2 goes live, one step at a
   time (`docs/design/P2.2.md` §4.1, G0 first; Congress returns Nov 9). Before any push, do what the integration notes'
   pending section lists for that step (rebase onto main and re-gate, the store export, the living-doc rows, the
   revert kit re-made on the pushed G1).
5. End with the `handoff` skill (`.claude/skills/handoff/SKILL.md`; read it by path if it is not listed).

## WHERE THINGS ARE

`MAP.md` answers "where is X?" · `docs/TRAPS.md` covers what wastes a day · `PROGRESS.md` is the session log, newest
first · `HANDOFF_ARCHIVE.md` keeps superseded front pages · the YouTube key walkthrough page:
<https://claude.ai/artifact/KzryEjf4wjwUgGRYneuCY6> · account setup page: <https://claude.ai/artifact/3tfFpfAFLX1d8VShdzbBjj>.

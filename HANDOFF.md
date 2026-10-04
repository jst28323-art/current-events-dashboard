# HANDOFF — read this first

AS-OF 2026-10-03 · one page. Repo `C:\Users\j\claude\current-events-dashboard` · GitHub `jst28323-art/current-events-dashboard`
(public) · live page <https://jst28323-art.github.io/current-events-dashboard/> · live API
<https://ced-api.usgovfeed.workers.dev/api/v1/status>. **Read `CLAUDE.md` next** (the contract), then `docs/ROADMAP.md`
Phases 1 and 2. `MAP.md` says where everything else lives. The tree's state is a command, not prose: this page names no commit.

## ⚑ LATEST #3 (2026-10-03) — Phase 1 waits only on Mon-Tue data; Phase 2's Congress adapters are built, not live

Phase 1 is live; its only open exit criterion (3) needs Monday and Tuesday's live polling. This session (PROGRESS #7):
- **FR fix, live:** the Federal Register lists an issue days before its date; such documents now show as "scheduled"
  and flip to "published" at midnight Eastern (D-055, D-059, D-060). The first live flip is due Mon 2026-10-05 00:00 ET.
- **Probe closed (exit 5 MET):** no source has to move to the home PC, and no CPU cut-off was seen (D-094, D-095;
  `docs/SOURCES.md` "Cloudflare probe"). The dashboard cross-check is the owner's readout (D-057).
- **P2.1 built early on fixtures (owner override D-058):** five Congress adapters, merged but NOT polled and NOT in the
  Worker (D-063..D-088; pins in `packages/adapters/test/live_list.test.ts`). Going live is P2.2, after Phase 1 closes.
- **Paper only (D-089), no code:** the P2.2 design `docs/design/P2.2.md` (its owner questions are answered: D-090..D-092)
  and the P3.5 research `docs/research/leadership_press_conferences.md`.
- **Still running by itself:** the one-time Windows task that records Monday's pro forma sessions (D-033, D-056: it runs
  only if the owner is signed in), log `scratch/capture_task.log`. The disabled cloud routine (D-028) still exists.

## SHIP STATE

    node scripts/ship_state.mjs

Run it first, from the harness Bash in the repo directory, and obey its one verdict line. It fetches origin (`--no-fetch`
skips that) and asks GitHub for the CI result (`--offline` skips that too). `SHIPPED-CLEAN` means nothing is owed, so go
to NEXT ACTION. Any other verdict prints its next step on the `next:` line (a command, or an instruction to wait, stop,
fix or ask the owner): do that first. Never reason about the tree from prose.

## NEXT ACTION

### Close Phase 1 with Monday and Tuesday's data, then ask the owner about Phase 2 going live

Each step says when its data exists; do the ones whose data exists, record what is still waiting, and stop there.
1. **Ask first**, as the canonical prompt says: one AskUserQuestion (with a PushNotification) for anything the repo does
   not answer. Two known items: the Google API key walkthrough (D-093, grant G-012); and, if no DECISIONS row records
   them yet, the owner's Cloudflare readings (D-057; page under WHERE THINGS ARE; the probe's first logs expire about
   Mon 2026-10-05 7 PM CT), recorded as a row that amends D-095.
2. **The first live FR flip**, from Mon 2026-10-05 01:00 ET: in the whole event history (page `/api/v1/events` as
   `scripts/ledger_report.mjs` does), every `fr.api` event whose `result.publication_date` is 2026-10-05 must have status
   `published`, none `scheduled` (D-059; 106 were scheduled on Saturday). If any is still
   scheduled, the once-per-Eastern-day re-parse failed: read fr.api's detail in `/api/v1/status` and docs/TRAPS.md.
3. **Monday's recordings (P2.3)**, after Mon 2026-10-05 16:30 CT: read `scratch/capture_task.log` (only once it ends with
   an "exit" line), check the new `fixtures/*/2026-10-05/` files (real responses, no errors posing as data), add their
   rows to `fixtures/README.md`, commit them. If the task did not run, say so in PROGRESS; that data cannot be recorded again.
4. **Live latency (exit 3)**, after Tue 2026-10-06 18:00 ET: `node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06`;
   record its PASS/FAIL lines, n and medians in ROADMAP's Phase 1 exit status. From the same events, the White House lag
   (first_seen_at minus source_published_at per item, n and median) answers the open question in docs/TRAPS.md.
5. When every Phase 1 exit criterion is met, tick it in ROADMAP and ask the owner whether P2.2 starts (go-live of the
   Congress adapters per `docs/design/P2.2.md`; Congress returns Nov 9).
6. End with the `handoff` skill (`.claude/skills/handoff/SKILL.md`; read it by path if it is not listed).

## WHERE THINGS ARE

`MAP.md` answers "where is X?" · `docs/TRAPS.md` covers what wastes a day · `PROGRESS.md` is the session log, newest
first · `HANDOFF_ARCHIVE.md` keeps superseded front pages · Cloudflare CPU readout page for the owner:
<https://claude.ai/artifact/Kuw3yQ4xupbY94jWi4hviV> · account setup page: <https://claude.ai/artifact/3tfFpfAFLX1d8VShdzbBjj>.

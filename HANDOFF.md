# HANDOFF — read this first

AS-OF 2026-10-03 · one page. Repo `C:\Users\j\claude\current-events-dashboard` · GitHub `jst28323-art/current-events-dashboard`
(public) · live page <https://jst28323-art.github.io/current-events-dashboard/> · live API
<https://ced-api.usgovfeed.workers.dev/api/v1/status>. **Read `CLAUDE.md` next** (the contract), then `docs/ROADMAP.md`
Phase 1. `MAP.md` says where everything else lives. The tree's state is a command, not prose: this page names no commit.

## ⚑ LATEST #2 (2026-10-03) — Phase 1 is live on the owner's phone; two exit criteria need time

The feed is live: the Cloudflare Worker `ced-api` polls the Federal Register and the White House news feed into a
Durable Object and serves the read API; the GitHub Pages app shows it; the owner checked it on an iPhone over cellular,
light and dark (D-044). Everything deploys only through CI after a gated push (D-026, grants G-007 and G-010).

- **What is done and how it was verified:** `PROGRESS.md` entries #4 and #5; ROADMAP Phase 1 shows each ticked task
  with its evidence and the per-criterion exit status. Owner rulings this session: D-025..D-028, D-031..D-033,
  D-044..D-046 in `docs/DECISIONS.md` (grants G-006..G-011).
- **Still running by itself:** the probe Worker `ced-probe` (P1.3; it stops itself after its run limit, about a day after
  it started on 2026-10-03, D-042); a one-time Windows scheduled task on this PC that records Monday's pro forma sessions
  (Mon 2026-10-05 afternoon, D-033) into `fixtures/*/2026-10-05/`, uncommitted, with its log in
  `scratch/capture_task.log`. The disabled cloud routine from D-028 still exists; only the owner can delete it.
- **Open:** Phase 1 exit criteria 3 (two business days of live Public Inspection latency) and 5 (the probe table);
  Cloudflare CPU of the HubDO is unmeasured (W10, ROADMAP P1.5 note). Read `docs/TRAPS.md` before touching a source,
  the Worker or the e2e suite.

## SHIP STATE

    node scripts/ship_state.mjs

Run it first, from the harness Bash in the repo directory, and obey its one verdict line. It fetches origin (`--no-fetch`
skips that) and asks GitHub for the CI result (`--offline` skips that too). `SHIPPED-CLEAN` means nothing is owed, so go
to NEXT ACTION. Any other verdict prints its next step on the `next:` line (a command, or an instruction to wait, stop,
fix or ask the owner): do that first. Never reason about the tree from prose.

## NEXT ACTION

### Close Phase 1: record exit criteria 3 and 5, and review Monday's recordings

Each step says when its data exists; do the ones whose data exists, record what is still waiting, and stop there.
1. **Ask first**, as the canonical prompt says: one AskUserQuestion (with a PushNotification) for anything the repo
   does not answer. Do not re-ask what `docs/DECISIONS.md` settles.
2. **Probe results (exit 5, P1.3)**, from 2026-10-04 ~01:00Z: GET `https://ced-probe.usgovfeed.workers.dev/results`
   (its `cron.stopped` must be true). Do what D-042's "binds" column and ROADMAP P1.3 say: keep the full JSON in the
   repo, fill the "Cloudflare probe" section of `docs/SOURCES.md`, write the two DECISIONS rows (which sources must
   move to the home PC; whether the free CPU limit binds), then tick P1.3.
3. **Monday's recordings (P2.3)**, after Mon 2026-10-05 16:30 CT: read `scratch/capture_task.log`, check the new
   `fixtures/*/2026-10-05/` files (real responses, no errors posing as data), add their rows to `fixtures/README.md`,
   commit them. If the task did not run, say so in PROGRESS; the data cannot be recorded again.
4. **Live latency (exit 3)**, after Tue 2026-10-06 18:00 ET: from `/api/v1/status` and `/api/v1/events`, count Public
   Inspection documents and White House items per business day and the PI median of `first_seen_at` minus the filing
   slot (n), and write them into ROADMAP's Phase 1 exit status.
5. When every Phase 1 exit criterion is met, tick it in ROADMAP and ask the owner whether to start Phase 2 (P2.1).
6. End with the `handoff` skill (`.claude/skills/handoff/SKILL.md`; read it by path if it is not listed).

## WHERE THINGS ARE

`MAP.md` answers "where is X?" · `docs/TRAPS.md` covers what wastes a day · `PROGRESS.md` is the session log, newest
first · `HANDOFF_ARCHIVE.md` keeps superseded front pages · account setup page for the owner:
<https://claude.ai/artifact/3tfFpfAFLX1d8VShdzbBjj>.

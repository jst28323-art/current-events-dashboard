# HANDOFF_ARCHIVE — superseded front pages, whole (append-only)

Nothing here is a live instruction. When `HANDOFF.md` is replaced, the old page is appended below WHOLE under
`## ARCHIVED #N (YYYY-MM-DD)`, newest at the bottom (`docs/HANDOFF_PROCEDURE.md` PART 1 step 4).

(No pages archived yet; page #1 is the first.)

## ARCHIVED #1 (2026-10-02)

# HANDOFF — read this first

AS-OF 2026-10-02 · one page. Repo `C:\Users\j\claude\current-events-dashboard` · GitHub `jst28323-art/current-events-dashboard`
(public) · placeholder site <https://jst28323-art.github.io/current-events-dashboard/>. **Read `CLAUDE.md` next** (the
contract: owner rules, push grant, polite polling), then `docs/ROADMAP.md`. `MAP.md` says where everything else lives.
The tree's state is a command, not prose: this page names no commit.

## ⚑ LATEST #1 (2026-10-02) — groundwork laid; Phase 0 done; no product code yet; Phase 1 is next

The project is a live feed of the US federal government. The owner's brief, verbatim, and the feature ids F1–F12 are in
`docs/VISION.md`. This session did research, made decisions, and built the framework. It wrote no product code, as the
owner asked.

- **Decided:** every owner ruling is a row in `docs/DECISIONS.md` (append-only). Read the whole file before asking
  anything: most first-week questions are already answered there, including budget, visibility, which sources are
  allowed, alerts, transcripts, the push grant, the license and the phone plan. What you may do unasked is in
  `docs/OWNER_GRANTS.md`.
- **Designed:** `docs/ARCHITECTURE.md` (Cloudflare Workers Free backbone; GitHub Pages app; home PC as a pluggable
  producer); `docs/EVENT_MODEL.md` (one normalized event shape); `docs/SOURCES.md` (tiered catalog);
  `docs/DESIGN_LANGUAGE.md` (macOS look).
- **Evidence:** `docs/research/` holds six live-verified reports and `docs/research/SYNTHESIS.md`, all dated 2026-10-02.
  Re-measure before relying on any number.
- **Test data:** `fixtures/` holds real upstream responses (see `fixtures/README.md`), because Congress is in recess
  (dates: `docs/TRAPS.md`).
- **Harness:** `scripts/ship_state.mjs`, `scripts/gate.mjs`, `scripts/handoff_lint.mjs`, the cold-start workflow, and the
  skills in `.claude/skills/` (`handoff`, `add-source`); the procedure is `docs/HANDOFF_PROCEDURE.md`.

## SHIP STATE

    node scripts/ship_state.mjs

Run it first, from the harness Bash in the repo directory, and obey its one verdict line. It fetches origin (`--no-fetch`
skips that) and asks GitHub for the CI result (`--offline` skips that too). `SHIPPED-CLEAN` means nothing is owed, so go
to NEXT ACTION. Any other verdict prints its next step on the `next:` line (a command, or an instruction to wait, stop,
fix or ask the owner): do that first. Never reason about the tree from prose.

## NEXT ACTION

### Start Phase 1: ask the owner the P1.1 account questions, then build the P1.2 workspace scaffold

Phase 1 (a thin slice: two live sources on the owner's phone) and its exit criteria are in `docs/ROADMAP.md`. In order:
1. **Ask before building**, as the canonical prompt says: one AskUserQuestion call (multiselect where it fits), plus a
   PushNotification, asking every question ROADMAP P1.1 lists (the Cloudflare signup and API token, the api.data.gov
   key, whether sessions may deploy Workers when the gate passes, the workers.dev subdomain). All are ask-first
   (`docs/OWNER_GRANTS.md`); ROADMAP P1.1 also says how secrets get in. Walk the owner through it, and record the
   answers and grants in the same session. Don't re-ask what `docs/DECISIONS.md` already settles.
2. **P1.2 workspace scaffold** (needs no account, so start it even if the owner is away; P1.4 likewise): npm workspaces with
   `packages/schema`, `packages/adapters`, `workers/api` and `apps/web`, as ROADMAP P1.2 specifies. Check current tool
   versions before pinning them. Every new suite goes into `package.json` → `gate.npmScripts`, and the gate stays green.
3. Continue down Phase 1. P1.4 (adapters) needs no account and may come before the P1.3 probe; P1.3, P1.5 and P1.6
   need the Cloudflare account. **Time-boxed exception:** ROADMAP P2.3 (record live pro forma fixtures in its stated
   window) runs whenever that window falls, whatever phase is current.
4. End with the `handoff` skill (`.claude/skills/handoff/SKILL.md`; read it by path if it is not listed). It includes
   the cold-start round when you replace this page.

## WHERE THINGS ARE

`MAP.md` answers "where is X?" · `docs/TRAPS.md` covers what wastes a day: read it before touching a source or the
harness · `PROGRESS.md` is the session log, newest first · `HANDOFF_ARCHIVE.md` keeps superseded front pages.

## ARCHIVED #2 (2026-10-03)

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

## ARCHIVED #3 (2026-10-03)

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
- **Paper only (D-089), no code:** the P2.2 design `docs/design/P2.2.md` (owner questions O1, O2 and O4 answered by
  D-090..D-092; O3, five daily usage totals, is Part C of the pending D-057 readout) and the P3.5 research
  `docs/research/leadership_press_conferences.md`.
- **Still running by itself:** the one-time Windows task that records Monday's pro forma sessions (D-033, D-056: it runs
  only if the owner is signed in), log `scratch/capture_task.log`. The disabled cloud routine (D-028) still exists; only
  the owner can delete it.

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
   not answer; do not re-ask what `docs/DECISIONS.md` settles. Two known items:
   - **The Cloudflare readout** (D-057, page under WHERE THINGS ARE: screenshots 1-7 plus Part C, the P2.2 O3 totals),
     if no DECISIONS row records it yet. No readings reached the repo on 2026-10-03; screenshots pasted into chat are
     the only channel. The earliest probe logs expire about 2026-10-06 01:00Z (Mon Oct 5, ~8 PM CT; ROADMAP's "by
     2026-10-06" is that UTC date). Record the CPU times as a row amending D-095 (ROADMAP P1.3), the HubDO's as W10
     (ROADMAP P1.5), the Part C totals for G0 of `docs/design/P2.2.md` §4; if skipped, a row says the cross-check was not made.
   - **The Google API key walkthrough** (D-093, grant G-012). The key lives only as a GitHub Actions secret and never
     passes through chat; how its one retrospective `videos.list` call runs (Actions logs are public) is still to design.
2. **The first live FR flip**, from Mon 2026-10-05 01:00 ET: in the whole event history (page `/api/v1/events` as
   `scripts/ledger_report.mjs` does), every `fr.published.*` event whose `result.publication_date` is 2026-10-05 should
   now be `published` (D-059; Public Inspection events carry that field too: leave them out). A row still `scheduled`
   is a defect only if the FR still lists that document (one the FR dropped stays scheduled, D-060); then the
   once-per-Eastern-day re-parse failed: read fr.api's detail in `/api/v1/status` and docs/TRAPS.md.
3. **Monday's recordings (P2.3)**, after Mon 2026-10-05 16:30 CT: read `scratch/capture_task.log` (only once it ends with
   an "exit" line), check the new `fixtures/*/2026-10-05/` files (real responses, no errors posing as data), add their
   rows to `fixtures/README.md`, commit them. If the task did not run, say so in PROGRESS; that data cannot be recorded again.
4. **Live latency (exit 3)**, after Tue 2026-10-06 18:00 ET: `node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06`;
   record its PASS/FAIL lines, n and medians in ROADMAP's Phase 1 exit status. From the same events, compute the White
   House lag by hand (first_seen_at minus source_published_at per item, n and median; no script does it): docs/TRAPS.md
   wants n >= 20 business-day items before acting on it, so if two days give fewer, record n and keep collecting.
5. When every Phase 1 exit criterion is met, tick it in ROADMAP and ask the owner whether P2.2 starts (go-live of the
   Congress adapters per `docs/design/P2.2.md`; Congress returns Nov 9).
6. End with the `handoff` skill (`.claude/skills/handoff/SKILL.md`; read it by path if it is not listed).

## WHERE THINGS ARE

`MAP.md` answers "where is X?" · `docs/TRAPS.md` covers what wastes a day · `PROGRESS.md` is the session log, newest
first · `HANDOFF_ARCHIVE.md` keeps superseded front pages · Cloudflare CPU readout page for the owner:
<https://claude.ai/artifact/Kuw3yQ4xupbY94jWi4hviV> · account setup page: <https://claude.ai/artifact/3tfFpfAFLX1d8VShdzbBjj>.

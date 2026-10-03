# MAP — where things live and which file is canonical

One question, one file. If a fact has no home here, give it one (add a row) rather than starting a loose file.
Rows marked (planned) are created by the phase that needs them (`docs/ROADMAP.md`).

## Start here

| question | file |
|---|---|
| What is the state and the ONE next action? | `HANDOFF.md` |
| How do I work in this repo (rules, git, owner)? | `CLAUDE.md` |
| What did the owner ask for, verbatim? Feature ids F1–F12? | `docs/VISION.md` |
| What is the plan, phase by phase, and what is ticked? | `docs/ROADMAP.md` |
| Is the tree committed / gated / pushed / validated? | run `node scripts/ship_state.mjs` (never trust prose) |

## Product

| question | file |
|---|---|
| How is the system built (Cloudflare, Pages, home PC, API)? | `docs/ARCHITECTURE.md` |
| Which sources exist, their URLs, validators, cadence, tiers, status? | `docs/SOURCES.md` |
| What does an event look like (fields, keys, types, tiers)? | `docs/EVENT_MODEL.md` |
| What should it look and feel like (macOS tokens, layout)? | `docs/DESIGN_LANGUAGE.md` |
| What was measured about each source (dated evidence)? | `docs/research/` (2026-10-02 snapshot; start with `docs/research/SYNTHESIS.md`) |
| A phase's written design (dated records; where one differs from DECISIONS, EVENT_MODEL or the code, those win) | `docs/design/` (`docs/design/P2.1.md` is the file D-061..D-088 cite as scratch/phase2/DESIGN.md) |
| Recorded upstream responses for tests | `fixtures/` (index: `fixtures/README.md`) |
| The retired placeholder page (Pages now deploys `apps/web`; first home of the design tokens) | `site/index.html` |
| Event schema code (types, JSON Schema, ids, validator) | `packages/schema/` |
| The read-API v1 contract shared by the Worker and the web app | `packages/schema/src/api.ts` |
| The one event order key (Hub and page; the page imports it from `@ced/schema/order`, without the validator) | `packages/schema/src/order.ts` (D-048) |
| Source adapters + registry | `packages/adapters/` (registry: `packages/adapters/src/registry.ts`) |
| `fr.api` adapter and its helpers (branch table, FR times) | `packages/adapters/src/sources/fr_api.ts`, `packages/adapters/src/lib/fr_branch.ts`, `packages/adapters/src/lib/fr_time.ts` |
| `wh.feeds` adapter and the shared head-only RSS reader (envelope scan, item-head parse, RFC 822 dates) | `packages/adapters/src/sources/wh_feeds.ts`, `packages/adapters/src/lib/rss.ts` |
| The P2.1 Congress adapters, kept off the live site (D-058): the only module that exports them, and the pin that keeps them out of the Worker | `packages/adapters/src/fixture_only.ts` (subpath `@ced/adapters/fixture-only`); pin test `packages/adapters/test/live_list.test.ts` (live list, forbidden imports, sha-256 of every Worker-imported schema/adapter file; D-063) |
| `house.clerk.votes` adapter (Clerk index, roll N+1 probe, roll XML -> vote.result + member-vote record) | `packages/adapters/src/sources/house_clerk_votes.ts` (D-066) |
| `senate.lis.votes` adapter (vote menu as index, per-vote XML -> vote.result + member-vote record) | `packages/adapters/src/sources/senate_lis_votes.ts` (D-067) |
| `house.clerk.floor` adapter (Home/Feed -> per-day file -> floor entries + scheduled convene) | `packages/adapters/src/sources/house_clerk_floor.ts` (D-068) |
| `senate.schedule` adapter (floor_schedule.json convene, hearings.xml meetings) | `packages/adapters/src/sources/senate_schedule.ts` (D-069, D-070) |
| `senate.pressgallery` adapter (Daily Press Gallery WordPress posts -> one inferred event per timed log entry) | `packages/adapters/src/sources/senate_pressgallery.ts` (D-071) |
| Shared P2.1 adapter libs: naive Eastern time -> UTC (nonexistent/ambiguous reported, never guessed); forward XML block scanner; Congress ids, bill tables, the pinned session `CURRENT` and the year -> congress/session rule; the foundation stub parse | `packages/adapters/src/lib/eastern.ts` (D-075), `packages/adapters/src/lib/xmlscan.ts`, `packages/adapters/src/lib/congress_ids.ts` (D-077: the rollover edits `CURRENT` here), `packages/adapters/src/lib/stub.ts` |
| Member names for the vote adapters (bioguide <-> LIS <-> display name): builder, lookups, the committed map and the departed-members seed (regenerate with `UPDATE_MEMBERS=1` on `packages/adapters/test/members.test.ts`, then review the diff) | `packages/adapters/src/lib/members.ts`, `packages/adapters/src/generated/members.json`, `packages/adapters/src/generated/members_departed_119.json` (D-072) |
| Event schema v0.2 before go-live: typed vote result, member-vote side record, cross-field checks (`validateVoteEvent`, `validateMemberVotes`, `checkVotePair`); imported only by tests and the fixture-only adapters | `packages/schema/src/v02/` (subpath `@ced/schema/v02`; schema/TS agreement test `packages/schema/test/v02.test.ts`; D-064) |
| The adapter contract additions for P2.2 (dynamic endpoints and targets, notYetStatus, source calendar, side records) | `packages/adapters/src/types.ts` (D-065) |
| The Hub payload rules every adapter test applies (one dedup_key per payload, own source, registered affiliation) | `packages/adapters/test/payload_rules.ts` |
| The P2.1 sources replayed through a Hub (no duplicates, revisions, repeats) | `workers/api/test/replay_congress.test.ts` |
| Adapter golden outputs (regenerate with `UPDATE_GOLDEN=1`, then review the diff against the fixture; a vote golden holds the event AND its member-vote record) | `packages/adapters/test/golden/` (one directory per source_id) |
| The Cloudflare Worker `ced-api` (cron poller, hub, API) | `workers/api/` |
| Event store, merge/revision rule, payload rules, API cursor, latency ledger, per-endpoint poll state, request claim (HubDO) | `workers/api/src/hub.ts`, `workers/api/src/merge.ts`; the stub helper `workers/api/src/hub_ref.ts`; the validation fast path for stored-equal copies `workers/api/src/fastpath.ts` (D-050) |
| Poll loop and polite-polling constants (UA, cache-buster, timeout, backoff incl. drift, business hours, budget per source with the peak-fit bound `peakRequestsPerHour`, per-endpoint cadence and stale threshold (D-049), code-version body key) | `workers/api/src/poll.ts`, `workers/api/src/policy.ts` |
| Public read API routes, CORS, JSON Feed | `workers/api/src/http.ts` |
| The temporary P1.3 probe Worker `ced-probe` (reachability, validators, CPU limit, alarm jitter, measured from Cloudflare) | `workers/probe/` (deployed: `GET https://ced-probe.usgovfeed.workers.dev/results`, and `/results/sources.md` for the SOURCES table; the full JSON is kept after the run at `docs/research/probe_<date>.json`, ROADMAP P1.3) |
| The web app (Vite + Preact feed; built and deployed by `.github/workflows/pages.yml`) | `apps/web/` (pure logic `apps/web/src/lib/`, polling state machine `apps/web/src/poller.ts`) |
| Web end-to-end tests (Playwright, Chromium + WebKit, route-mocked API, events built from `fixtures/`) | `apps/web/e2e/` + `apps/web/playwright.config.ts` (screenshots go to `scratch/screens/`, gitignored; WebKit's are named `webkit-*.png`; a local run's full JSON report: `scratch/e2e-last.json`) |
| e2e helpers: the form factor read from the project's emulation, never its name; the screenshot-capture retry; the Node PNG decoder behind the contrast checks | `apps/web/e2e/project.ts`, `apps/web/e2e/shot.ts`, `apps/web/e2e/png.ts` (D-051, D-052) |
| The home-PC producer (captions, speech-to-text) | `homepc/` (planned) |

## Rules, records, and memory

| question | file |
|---|---|
| What has the owner decided (verbatim)? | `docs/DECISIONS.md` (append-only) |
| What may I do without asking? What is always ask-first? | `docs/OWNER_GRANTS.md` (append-only) |
| What surprising facts cost a day if unknown? | `docs/TRAPS.md` (never pruned) |
| What happened in each session, and how was it verified? | `PROGRESS.md` (newest first) |
| Older front pages | `HANDOFF_ARCHIVE.md` |
| How to end a session / start cold / validate a handoff | `docs/HANDOFF_PROCEDURE.md` + `.claude/skills/handoff/SKILL.md` |
| How to add or fix a source | `.claude/skills/add-source/SKILL.md` |
| What counts as tested? | `TESTING.md` |
| Known-broken checks, registered with evidence | `KNOWN_FAILING.md` |
| Machine-read flags (push hold) | `docs/STATUS.json` |
| Cold-start validation records (one directory per round; `ship_state` reads them) | `docs/coldstart/` |

## Harness (code)

| what | file |
|---|---|
| Ship-state verdict | `scripts/ship_state.mjs` |
| Merge gate (writes the stamp `push` needs) | `scripts/gate.mjs` (product suites: `package.json` → `gate.npmScripts`) |
| Handoff shape lint | `scripts/handoff_lint.mjs` |
| Dead-path check for living docs | `scripts/check_paths.mjs` |
| Record a fixture | `scripts/record_fixture.mjs` |
| Phase 1 exit criterion 3 from the live API (per business day: PI documents, White House items, PI latency n and median) | `scripts/ledger_report.mjs` |
| Record a live congressional session day as fixtures (D-033; `--smoke` checks reachability only) | `scripts/capture_live.mjs` |
| The wrapper the one-time Windows scheduled task runs (D-033, G-011; log in `scratch/capture_task.log`) | `scripts/capture_task.cmd` |
| Post-deploy check of the live API (TESTING.md layer 6) | `scripts/deployed_check.mjs` |
| Claude Code hooks (session start, push guard, stop warning) | `.claude/settings.json`, `scripts/hooks/` |
| Cold-start validation workflow | `.claude/workflows/coldstart-validate.js` |
| Git hooks (secret scan, no force-push) | `enforcement/git-hooks/` (enable: `git config core.hooksPath enforcement/git-hooks`) |
| CI and Pages deploy | `.github/workflows/ci.yml`, `.github/workflows/pages.yml` |
| Deploy of every Worker under `workers/` after CI passes, then the deployed check (D-026; skips until the Cloudflare secrets exist) | `.github/workflows/deploy.yml` |
| Harness tests | `tests/harness/` |

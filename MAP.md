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
| Recorded upstream responses for tests | `fixtures/` (index: `fixtures/README.md`) |
| The retired placeholder page (Pages now deploys `apps/web`; first home of the design tokens) | `site/index.html` |
| Event schema code (types, JSON Schema, ids, validator) | `packages/schema/` |
| The read-API v1 contract shared by the Worker and the web app | `packages/schema/src/api.ts` |
| The one event order key (Hub and page; the page imports it from `@ced/schema/order`, without the validator) | `packages/schema/src/order.ts` (D-048) |
| Source adapters + registry | `packages/adapters/` (registry: `packages/adapters/src/registry.ts`) |
| `fr.api` adapter and its helpers (branch table, FR times) | `packages/adapters/src/sources/fr_api.ts`, `packages/adapters/src/lib/fr_branch.ts`, `packages/adapters/src/lib/fr_time.ts` |
| `wh.feeds` adapter and the shared head-only RSS reader (envelope scan, item-head parse, RFC 822 dates) | `packages/adapters/src/sources/wh_feeds.ts`, `packages/adapters/src/lib/rss.ts` |
| Adapter golden outputs (regenerate with `UPDATE_GOLDEN=1`, then review the diff against the fixture) | `packages/adapters/test/golden/` (one directory per source_id) |
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

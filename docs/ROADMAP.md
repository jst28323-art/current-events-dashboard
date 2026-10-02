# ROADMAP — simple-first, gated phases

**Rule:** a phase starts only when the previous phase's exit criteria are met AND tested (CLAUDE.md directive 4).
Tasks are ticked `[x]` in the commit that finishes them, with a PROGRESS entry saying how each was verified. Never
delete a phase or task; mark it `[dropped: reason, date]`. `HANDOFF.md`'s NEXT ACTION is always the first unticked
task of the current phase, unless the owner redirects. The phase cut follows D-024 (from
`docs/research/SYNTHESIS.md` §5, which also carries the reasoning for each exit criterion).

**Calendar constraint:** Congress is in recess until Mon 2026-11-09 (`docs/TRAPS.md`). Congressional adapters are
built against `fixtures/` in October; the Federal Register and the White House publish every business day, so they
prove the live loop first. Phase 3 is timed to be ready for Nov 9.

Owner priorities (D-004): votes + floor activity, White House + Federal Register, live transcripts/video, daily
agendas. All four are covered by Phases 1–5 in simple-first order.

## Phase 0 — Groundwork ✅ (2026-10-02)

- [x] Repo, harness (ship_state, gate, handoff lint, path check, hooks, cold-start workflow), CI, Pages placeholder
- [x] Verified research on sources, live media, hosting, curation (`docs/research/`, summary in `docs/research/SYNTHESIS.md`)
- [x] Decisions D-001…D-024 (owner rulings plus three agent choices); vision, architecture, event model, design language, source catalog, traps
- [x] Recess-proof fixture set (`fixtures/README.md`)

## Phase 1 — A thin vertical slice: two live sources on the owner's phone

- [ ] **P1.1 Accounts (owner-led; ask first, walk through each).** Free Cloudflare account → an API token scoped to
  Workers edits, stored as GitHub Actions secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`; free api.data.gov
  key → secret `API_DATA_GOV_KEY` (a Worker secret too, later). The owner pastes secrets into GitHub's Settings →
  Secrets page themselves (keys never pass through chat; the local token may lack the Secrets permission). Also ask:
  may sessions deploy Workers to that account when the gate passes (a Cloudflare analogue of G-003), HOW Workers get
  deployed (recommended: a deploy workflow that runs on pushes to main after CI passes, using the GitHub secrets, so no
  key lives on this PC; alternative: `wrangler login` on this PC), and which `*.workers.dev` subdomain to use. Record
  every answer verbatim as a `docs/DECISIONS.md` row and each grant as a `docs/OWNER_GRANTS.md` row. If the owner is away, do
  P1.2 and P1.4 first (neither needs an account).
- [ ] **P1.2 Workspace scaffold.** npm workspaces + TypeScript: `packages/schema` (EVENT_MODEL v0.1 Phase-1 minimum →
  TS types + JSON Schema + validator), `packages/adapters` (registry type + a harness that replays `fixtures/`),
  `workers/api` (Worker + one Durable Object skeleton, wrangler config, the Vitest Workers pool), `apps/web` (Vite +
  Preact + signals shell carrying the design tokens from `site/index.html`). Check current versions and pin them (the
  synthesis notes Preact 11.0.0 was only two days old: stay on 10.x unless there is a reason; Vitest must stay on the
  major that `@cloudflare/vitest-pool-workers` supports, 4.x per the synthesis: check its peer range). Create all four
  directories in the same commit (`scripts/check_paths.mjs` starts checking a planned directory's paths once it exists).
  CI runs Node 22 while this PC runs Node 26 (`docs/TRAPS.md`): CI is the judge. Add each suite to
  `package.json` → `gate.npmScripts` and commit `package-lock.json` (`.github/workflows/ci.yml` runs `npm ci` only
  when that lockfile exists, so without it CI cannot run the new suites). Pick a JSON-Schema validator
  that works inside Workers (`docs/TRAPS.md`).
- [ ] **P1.3 Probe Worker** (needs P1.1). From Cloudflare's network, fetch every Tier 1–2 source in `docs/SOURCES.md` that needs no key the owner has not yet
  granted (skip e.g. YouTube and DVIDS until their keys exist; list them as skipped)
  and record status, which validator gets a 304, bytes, wall time and head-only parse CPU; also measure the Durable
  Object alarm CPU limit on Free (a deliberate ~20 ms busy loop) and alarm timing jitter. Results go into
  `docs/SOURCES.md` ("CF reachable", "parse CPU") and DECISIONS rows (which sources must move to the home PC; whether
  the free CPU limit binds).
- [ ] **P1.4 Adapters** (needs no account; may run before P1.3; each via the `add-source` skill, pure functions with
  golden fixture tests): `fr.api` (Public Inspection `current.json` with a cache-buster on every call, and the newest
  `documents.json`) and `wh.feeds` (the `/news/feed/` umbrella, deduped by GUID). Each has its error/empty
  cases: `fr.api` has a NEGATIVE fixture (an HTML 404 from the JSON API); for `wh.feeds`, "no new items" is the same
  feed replayed twice (record a malformed-feed case if the parser needs one).
- [ ] **P1.5 Worker v0.** A 1-minute cron runs the two adapters into a HubDO (SQLite): dedupe/merge by `dedup_key`,
  `first_seen_at`, the latency ledger, per-source state (validators, errors). Serve `GET /api/v1/events?since=`,
  `/api/v1/status` and `/feed.json` with CORS for the Pages origin. (DO alarms and WebSockets wait for Phase 2.)
- [ ] **P1.6 Web v0** on GitHub Pages (the Pages workflow builds `apps/web` instead of `site/`): a single-column,
  phone-first feed. Each row: time, origin chip, title, `official_text`, source link. A header with "last updated" and
  per-source health. Light and dark; polls the API every ~15 s; shows "live data unavailable" when the Worker is down.

**Exit:** (1) the gate is green locally and in CI, including: the validator rejects a malformed event; each adapter's
golden test passes; every NEGATIVE fixture emits zero events; re-ingesting a fixture creates no duplicates (fails if
dedupe is removed). (2) The page loads on the owner's phone over cellular, light and dark. (3) On ≥ 2 business days the
ledger shows ≥ 5 Public Inspection documents and ≥ 1 White House item, with the PI median `first_seen_at` − filing slot
≤ 90 s (n ≥ 5). (4) Fail-closed, tested with Playwright: a stopped poller shows "stale" within 2× its cadence; a down API
shows "live data unavailable", never an empty feed. (5) The probe table is in `docs/SOURCES.md`.

## Phase 2 — Congress pipelines on fixtures + real-time plumbing

- [ ] **P2.1 Adapters:** `senate.lis.votes`, `house.clerk.votes`, `house.clerk.floor` (per-day file), `senate.schedule`,
  `senate.pressgallery`, joined to `members`; member-vote side records (one per roll call) and a vote inspector.
- [ ] **P2.2 Real-time plumbing:** PollerDOs on alarms (hot and warm cadences as in `docs/ARCHITECTURE.md`) with a supervisor cron;
  `/api/v1/live` over a hibernating WebSocket (falling back to `?since=` polling); calendar-aware staleness (recess,
  weekends, FR publication days).
- [ ] **P2.3 Opportunistic, Mon 2026-10-05 ~16:00–17:00 ET:** both chambers hold short pro forma sessions. If one is
  running, record live fixtures with `scripts/record_fixture.mjs`: Senate floor caption playlist + segments (they vanish
  after the day), HouseLive `/latest/*`, the Clerk floor XML. (Do this whenever that window falls, whatever phase is
  current.)

**Exit:** every vote/floor adapter passes golden + NEGATIVE fixture tests (the 200-with-error roll, the HTML "File Not
Found", double-space Senate dates, naive Eastern times); a fixture event replayed through the Hub reaches an open phone
page in < 2 s over the WebSocket; during recess the status page says "in recess until Nov 9", not "stale".

## Phase 3 — Live Congress from Nov 9, agendas, Supreme Court, White House "live now"

- [ ] **P3.1** HouseLive (labeled unofficial), DomeWatch with a key (labeled partisan; quarantine test records), the
  docs.house.gov weekly schedule, House and Senate committee meetings, Senate Democrats RSS (labeled partisan).
- [ ] **P3.2 Today view (F7)**: floor schedules, hearings, the President's schedule (Factba.se, facts only with credit,
  D-017).
- [ ] **P3.3 White House + officials live:** the `wh.live` detector + YouTube `videos.list` (needs a free Google API key:
  ask the owner first) + the embedded official player; a hand-curated officials registry for the wider tracking list (D-020); agency live signals where they exist
  (Fed calendar, DVIDS, State schedule).
- [ ] **P3.4 Supreme Court** (D-016): slip-opinion and orders-list HTML pages only (never `/rss/`).
- [ ] **P3.5 Research gap:** find sources for congressional leadership press conferences (F3; no source was researched).
- [ ] **P3.6 Latency harness:** pre-register the measurement in its own commit, then run it on Nov 9–10.

**Exit:** measured `first_seen − occurred` per source (n ≥ 20 actions and votes per chamber) recorded in
`docs/SOURCES.md`; a White House live event flagged within ~2 min (n ≥ 1, measured); the Today view lists that day's
floor schedules and hearings for both chambers.

## Phase 4 — macOS UI + alerts

- [ ] Three-pane layout (sidebar · feed · inspector), FTS5 search, keyboard navigation, light/dark
  (`docs/DESIGN_LANGUAGE.md`). The default view shows everything (D-019); importance tiers drive ordering, optional
  filters and alerts.
- [ ] ntfy alerts for the D-012 classes, at any hour (D-023).

**Exit:** the owner confirms daily use; each D-012 class fires once in a fixture test and at least once live; the iOS
ntfy delivery delay is measured.

## Phase 5 — Live text

- [ ] Senate floor captions: dedupe roll-up cues, parse `SEN. X:` / `THE PRESIDING OFFICER:` tags; capture in a DO loop
  (home PC if the probe says so); archive every captured transcript (D-018).
- [ ] House caption relay; House speaker heuristic scored against a hand-labeled 30-minute slice before it appears in
  the UI, always labeled "inferred".
- [ ] Executive speech-to-text, CPU-first on the home PC, only for official non-YouTube streams whose terms allow it
  (D-010, D-003); register the acceptance bar first (e.g. real-time factor ≥ 5, chunk p95 < 3 s, word error rate vs
  captions < 12%).

**Exit:** floor text within ~30 s of speech (measured, n ≥ 20 segments); House speaker-label precision published, with
labels shown only above an agreed bar.

## Phase 6 — Phone app (PWA)

- [ ] Manifest, service worker, offline shell, Web Push (iPhone home-screen app, iOS 16.4+; declarative payload on
  18.4+), alert settings.

**Exit:** a push arrives on the owner's iPhone with the home-screen app closed.

## Phase 7 — Breadth (F11)

- [ ] Congress.gov bills and nominations, GovInfo, CBO/GAO, OIRA review, agency feeds (State, War, DOJ, Treasury, DHS
  HTML, Fed, SEC), the D.D.C. case watchlist (D-021), BNO pool reports and the Truth Social archive (D-017).

**Exit:** each new source has golden tests, a health row and a measured latency.

## Phase 8 — F12: financial + world news (plugins, off by default)

(Off by default means the owner opts each new SOURCE in; D-019's show-everything applies to the items of enabled
sources. If the owner wants F12 sources on by default, that is a new decision row.)

- [ ] SEC EDGAR, Federal Reserve, BLS/BEA/Census release calendars, Treasury, GDELT, UN, Bluesky. No market prices
  without a licensing decision.

**Exit:** an owner opt-in toggle per plugin.

## Later (owner decisions, each asked with its measured reason and price)

Native iOS app (D-015) · AI summaries (D-001) · Workers Paid $5/mo if the free CPU limit binds (D-001) · a custom
domain (D-001). Price list: `docs/research/SYNTHESIS.md` §8.

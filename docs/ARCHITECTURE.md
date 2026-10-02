# ARCHITECTURE

Status: **chosen 2026-10-02 (agent recommendation from the research, within the owner's constraints D-001 $0,
D-002 public, D-003 home PC, D-013 address open). Nothing below is built yet.** Evidence:
`docs/research/architecture_hosting_frontend.md` (§6 candidates, §2 live measurements) and
`docs/research/live_media_transcripts.md` (§6 transcript design). Paths marked (planned) are created by the phase that
needs them (`docs/ROADMAP.md`).

## The shape in one picture

```
 upstream sources (.gov XML/JSON/RSS, HouseLive API, caption playlists, …)
        │  conditional GET, head-only parse, per-host budgets
        ▼
 ┌──────────────────────────── Cloudflare Workers (Free plan) ─────────────────────────────┐
 │  PollerDO "hot" (alarm ~20 s) ┐                                                          │
 │  PollerDO "warm" (alarm ~60 s)├──► HubDO: SQLite (+FTS5) event store, dedupe/merge,       │
 │  cron 1 min: supervisor,      │    revisions, latency ledger, source health               │
 │  re-arms alarms, watchdog ────┘          │                                                │
 │                                          ├──► /api/v1/live  (hibernating WebSocket)        │
 │                                          ├──► /api/v1/events?since=…  /api/v1/status       │
 │                                          ├──► /feed.json (JSON Feed 1.1)                   │
 │                                          └──► alerts: ntfy now, Web Push later             │
 │  POST /api/v1/ingest (HMAC-signed) ◄──────────────────────────────┐                       │
 └───────────────────────────────────────────────────────────────────│───────────────────────┘
                                                                     │ outbound HTTPS only
 owner's home PC (always-on, D-003; light, yields the GPU) ──────────┘
   caption capture that needs a steady loop · CPU-first speech-to-text for allowed non-YouTube streams (D-010)
   · any source that blocks Cloudflare's IPs

 GitHub: code, CI (gate), deploys, optional nightly archive — NEVER on the live path (D-008)
 GitHub Pages: the web app (static PWA) at jst28323-art.github.io/current-events-dashboard, reading the API
```

## Why this shape

- **GitHub Actions cron cannot be the live path**: most scheduled runs never ran when measured (D-008). Pages is fine
  for the static app itself.
- **Cloudflare Workers Free is the only measured/documented free option with sub-minute polling and push** without a
  box at home: Durable Object alarms give sub-minute cadence (cron triggers bottom out at 1 min), SQLite-backed DOs
  give storage + full-text search, hibernating WebSockets give push to open pages. $0 at personal scale; the first paid
  unlock is Workers Paid at $5/mo (an owner decision under D-001).
- **The home PC is a pluggable producer, never on the critical path**: if it is off, transcripts pause and those
  sources show "stale"; everything else keeps working.
- **Adapters are pure TypeScript functions** (`parsed response → Event[]`), so the same code runs in the Worker, in
  Node on the home PC, and in tests against `fixtures/`. This is also the escape hatch from vendor lock-in.

## Components (planned layout)

| path | what | notes |
|---|---|---|
| `packages/schema/` (planned) | Event types + JSON Schema + validator, from `docs/EVENT_MODEL.md` | becomes the source of truth for the model; iOS can generate Codable types from the JSON Schema later |
| `packages/adapters/` (planned) | one pure adapter per source + the source registry (cadence, validator to send, rate budget, UA override, freshness SLO, calendar awareness) | tests replay `fixtures/<source_id>/…` |
| `workers/api/` (planned) | the Worker: PollerDOs, HubDO, supervisor cron, HTTP + WebSocket API, ingest endpoint | `wrangler` config; tested with Vitest + the Workers pool |
| `apps/web/` (planned) | Vite + Preact + signals + TypeScript PWA, macOS design tokens (`docs/DESIGN_LANGUAGE.md`) | built and deployed to GitHub Pages by `.github/workflows/pages.yml`, replacing today's `site/` placeholder |
| `homepc/` (planned) | the home-PC producer (Node for capture/relay; Python only where speech-to-text needs it) | outbound-only; installing it as a service needs the owner's OK each time |
| `fixtures/` | recorded upstream responses | exists; see `fixtures/README.md` |

## API contract (v1, planned)

- `GET /api/v1/events?since=<cursor>&features=F5,F6&tier=P0,P1` → newest-first page of events + next cursor.
- `GET /api/v1/live` → WebSocket; server sends `{type:"event", event}` and `{type:"health", source}` messages.
- `GET /api/v1/status` → per source: last attempt/success/change, items in 24 h, median first-seen latency, error streak,
  calendar state (in session / recess).
- `GET /feed.json` → JSON Feed 1.1 (any feed reader can follow the dashboard); our fields under `_ced`.
- `POST /api/v1/ingest` → HMAC-signed batches of events from the home PC (replay window, schema-validated).
- CORS: allow the Pages origin; the API is read-only and public except `/ingest`.

## Constraints that shape the code

- **10 ms CPU per Worker invocation on Free.** A full parse of the Senate vote menu took 6–12 ms on a fast desktop, so
  pollers send conditional GETs and parse only the newest items. Whether DO alarms on Free get the same 10 ms is
  undocumented: Phase 1 probes it.
- **Upstream caches set a freshness floor** (per-source figures: `docs/SOURCES.md`). Per-source cache-busting is a
  polite-polling decision recorded in the source's row.
- **Reachability of each .gov source from Cloudflare's IPs is unmeasured.** Phase 1's probe Worker decides which sources
  stay on Cloudflare and which move to the home PC.
- **Three clocks per event** (`occurred_at`, `source_published_at`, `first_seen_at`) plus `broadcast_at`: the latency
  ledger is built in from the first adapter, so freshness claims are measured.

## Decisions still open (with the default the build session should take)

| question | default | decided by |
|---|---|---|
| Serve the app from GitHub Pages or from the Worker? | Pages (D-013 default) unless the probe shows a concrete reason | build session; record a D-row |
| Long-term archive (beyond ~90 days hot in the HubDO) | transcripts are kept forever (D-018): R2 via the Worker binding (free tier) is the default; events: a nightly JSONL archive when needed | Phase 5 (transcripts), Phase 4+ (events) |
| Senate caption capture: in a DO alarm loop or on the home PC? | try the DO first (it is small text, 12-second segments) | Phase 5 probe |
| Workers Paid ($5/mo) if the free CPU limit binds | stay free; ask the owner with the measured evidence | owner (D-001) |

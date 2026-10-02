# TRAPS — facts that cost a day if you don't know them

Uncapped, versioned, never deleted. Add a trap the moment one bites (date + evidence). If a trap stops being true,
strike it through with a dated note and keep it. Each source trap cites the research report that measured it (dated
2026-10-02 evidence in `docs/research/`); re-measure before relying on a number.

## Calendar

- **Congress is in recess until Mon 2026-11-09.** Both chambers hold only short pro forma sessions (the House is in a
  district work period), so there are no recorded votes before Nov 9. Build and test against **recorded fixtures** from the
  Sep 15–16 (House) and Sep 28–30 (Senate) session days. Measure live latency from Nov 9.
  (`docs/research/congress_floor_votes.md`, `docs/research/curation_priorart_future.md`)

## Upstream data sources

- **HTTP 200 does not mean success.** The House Clerk returns 200 with an error body for a roll call that does not
  exist, and docs.house.gov returns 200 `text/html` "File Not Found" for a missing week. Validate the body (root
  element, content type), never just the status. (`docs/research/curation_priorart_future.md`, `docs/research/congress_floor_votes.md`)
- **Which cache validator works differs by source** (some answer `If-Modified-Since` with 304 but ignore `If-None-Match`
  and send the full body every time). The `docs/SOURCES.md` row records which validator each source honours; probe it
  for every new source. (`docs/research/architecture_hosting_frontend.md`, `docs/research/congress_floor_votes.md`)
- **A changed validator does not mean new items.** The White House RSS ETag and Last-Modified change site-wide with no new
  item, and Congress.gov RSS Last-Modified is the CDN refill time. Dedupe by GUID or content hash, never by "the
  validator changed". (`docs/research/curation_priorart_future.md`, `docs/research/congress_legislation_committees_courts.md`)
- **Upstream CDNs set a freshness floor.** Some APIs serve cached copies that are many minutes old even when they
  say `no-store`; polling faster than the cache gains nothing unless the request bypasses it. Per-source figures live
  in the source's row in `docs/SOURCES.md`. (`docs/research/architecture_hosting_frontend.md`)
- **Source timestamps are last-edit, not first-appearance.** `updateDate`, `lastModified` and RSS `pubDate` move on
  every revision (a bill's status file was re-stamped 46 h after the vote by a citation fix). Record our own
  `first_seen_at` for every item; never compute latency from a source's own stamp alone.
  (`docs/research/congress_legislation_committees_courts.md`)
- **Time zones lie.** Clerk times are truncated to the minute; House hearing XML is Eastern time with no offset; the
  Senate Democrats RSS labels daylight-time posts "EST". Normalize everything to UTC at ingest and test the DST edges.
- **api.data.gov `DEMO_KEY` is useless for real work.** The observed limit was 10 requests per UTC day per API (separate
  counters for Congress.gov and GovInfo), shared by everything on the same IP. Never use DEMO_KEY in CI; use the owner's
  free key (5,000/h on Congress.gov) from a secret. (`docs/research/architecture_hosting_frontend.md`, `docs/research/congress_legislation_committees_courts.md`)
- **The HouseLive backend is undocumented** (row `house.floorcast` in `docs/SOURCES.md`): it can change without notice,
  so the official Clerk XML stays the fallback and the adapter must fail closed on drift.
- **Senate floor caption playlists disappear (404) after the day ends.** Capture live or lose it.
  (`docs/research/live_media_transcripts.md`)
- **Bot walls.** HHS, Commerce and the war.gov homepage return 403 to scripts (DHS does not, despite an early report); the federalregister.gov *website*
  blocks scripts (use its API); C-SPAN serves a bot challenge and its terms forbid bots and AI use (link-out only).
  (`docs/research/executive_branch.md`, `docs/research/curation_priorart_future.md`)
- **YouTube is detect-and-embed only.** Captions of other people's videos cannot be fetched through the API and its terms
  forbid downloading; channel RSS lists a live stream only after it ends; `search.list` is capped at 100 calls/day.
  Detect White House live events from the `data-live-duplex` flag on whitehouse.gov/live/ instead.
  (`docs/research/executive_branch.md`, `docs/research/live_media_transcripts.md`)
- **The White House stopped posting remarks/briefing transcripts** (its remarks feed ends 2025-01-20), and the official
  compilation of presidential documents lags ~34 days. (`docs/research/executive_branch.md`)

## Hosting

- **GitHub Actions cron cannot drive a live feed**: most scheduled runs never ran in the measurement (D-008).
- **The Workers Free CPU limit per invocation is tiny** (figures and consequences: `docs/ARCHITECTURE.md`,
  "Constraints that shape the code"). Whether Durable Object alarms get the same limit on Free is undocumented: probe it
  (ROADMAP P1.3) before building on it.

- **JSON-Schema validators that compile with `new Function` / `eval` do not run inside Cloudflare Workers**
  (UNVERIFIED general knowledge, 2026-10-02: Ajv's default compile is one). Use a validator without code generation, or
  precompile standalone validators at build time; prove it in a Workers-pool test before relying on it.

## This machine and harness

- **The harness Bash tool is git-bash on Windows.** It sees `C:/Users/...`, not `/mnt/c/...`. Push from Windows git
  (`git -C C:/Users/j/claude/current-events-dashboard push origin main`); WSL git has no credential helper and hangs on a
  prompt that looks like a network stall.
- **The local GitHub token (used by both `git` and `gh`) has limited permissions** (as of 2026-10-02): it can push
  code and workflow files (the owner added "Workflows") and has "Pages", but it lacks "Administration: write" for this
  repo (so it cannot change repo settings such as turning Pages on; the owner did that by hand) and "Actions: write"
  (so `gh workflow run` fails with 403; to re-run a workflow, push a commit). A 403 response's
  `X-Accepted-GitHub-Permissions` header names exactly what a call needs (`gh api -i …`).
- **Where Claude Code is launched decides what the repo's `.claude/` does.** Launched from the repo directory, the hooks
  in `.claude/settings.json` fire (ship_state at session start, the push guard, the dirty-handoff warning) and workflows
  resolve by name. Launched from the parent `C:\Users\j\claude` (as the canonical prompt implies), those hooks do NOT
  fire: run `node scripts/ship_state.mjs` yourself before every push (the push grant requires its `PUSH` verdict anyway),
  and call workflows by absolute `scriptPath`. The git hooks (`core.hooksPath`) fire either way, and the pre-push hook
  refuses to update main to a commit without a gate stamp, so an ungated push fails even from a parent-launched session. The repo's skills may
  not appear in the skill list either: read them by path (`.claude/skills/handoff/SKILL.md`,
  `.claude/skills/add-source/SKILL.md`) and follow them as written.
- **Secrets go in through GitHub's web UI.** Whether the local token has the "Secrets" permission is unrecorded
  (assume not); the owner pastes keys into Settings → Secrets and variables → Actions themselves.
- **Long heredocs containing apostrophes or backticks fail in the harness Bash.** Write files with the Write tool.
- **This PC runs Node 26 (npm 11); CI runs Node 22.** Something can pass locally and fail in CI (or the reverse), and
  `package.json` says `>=22`. Avoid Node-26-only APIs; CI is the judge.
- **`node --test <directory>` fails on Node 26** ("test failed" on the directory itself): pass the test files
  explicitly (`npm run test:harness` and `scripts/gate.mjs` already do).
- **This PC can get slow at starting processes.** On 2026-10-02 afternoon every launch (`node -e 0`, `git --version`)
  took 4–11 s with CPU at 8% and 20 GB RAM free, so the gate took ~5 minutes instead of seconds. If the gate is slow, time
  `node -e 0` first: it is the host, not the harness. Several orphaned `grep --line-buffered` monitor processes from
  September aviary sessions were also still running (left alone; the owner may end them).
- **Headless Edge cannot render narrower than ~500 px**, so a `--window-size=390,…` screenshot is cropped, not a phone
  layout. Screenshot phone widths through a 390-px iframe (or Playwright device emulation).
- **The owner's home PC also runs GPU training for another project (aviary).** Anything always-on there must be light
  and must yield the GPU (D-003).

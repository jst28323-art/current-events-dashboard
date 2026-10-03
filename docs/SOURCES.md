# SOURCES — the living catalog (one row per source; the source's only home)

Every per-source number (latency, cadence, cache behaviour) lives HERE and nowhere else; other docs link to the row.
Latencies are **dated observations** from the 2026-10-02 research (n and method in the cited report), mostly measured
while Congress was in recess: re-measure live (ROADMAP P3.6) and update the row. `fixture` = recorded in `fixtures/`
(see `fixtures/README.md`). Affiliation values follow `docs/EVENT_MODEL.md`; partisan/unofficial/third-party use is
governed by D-009. Reports: CFV = `docs/research/congress_floor_votes.md`, LEG = `docs/research/congress_legislation_committees_courts.md`,
EXE = `docs/research/executive_branch.md`, LIVE = `docs/research/live_media_transcripts.md`,
ARC = `docs/research/architecture_hosting_frontend.md`, CUR = `docs/research/curation_priorart_future.md`.

Cloudflare reachability, which validator gets a 304, and parse CPU go in "Cloudflare probe" below (ROADMAP P1.3).

## Tier 1 — build first (Phases 1–3; `fr.api` and `wh.feeds` in Phase 1, per D-024): free, official or explicitly allowed, verified live

| source_id | what | features | access · validator | observed freshness (2026-10-02) | affiliation | fixture | report |
|---|---|---|---|---|---|---|---|
| `fr.api` | Federal Register API, two endpoints: `pi_current` = Public Inspection `current.json`; `documents_newest` = `documents.json?per_page=500&order=newest` with 12 `fields[]` (each checked live 2026-10-02): one page holds a whole daily issue, with room for a new record (D-047). EOs, presidential docs, rules. O1 closed 2026-10-03 (D-047). The FR lists the next issue before its date (docs/TRAPS.md): such a document is shown as scheduled until its Eastern date, and the unchanged list is parsed again each Eastern day (D-055, D-059). An issue that may overflow the page is said in the endpoint's health detail (still ok), but only until the next poll (review R2, open) | F10 F9 | JSON, no key, CORS `*` · no ETag/LM: hash the body; **always add the cache-buster `_=<epoch ms>`**: both endpoints accept it (live 2026-10-02: `Age: 0`, fresh `x-request-id`); plain requests got shared-cache copies despite `no-store`, up to ~104 min old on `current.json` (EXE) and ~47 min on `documents.json` (ARC); the cache seemed to refresh at slot times. `documents.json` echoes the cache-buster into `next_page_url` (docs/TRAPS.md; the poller rule is D-038) · cadence and stale threshold per endpoint (D-049, threshold rule D-039): `pi_current` every 60 s in business hours (covers the 08:45, 11:15, 14:00, 16:15 and 18:00 ET slots), 900 s off hours, stale after 120 s in business hours and 1800 s otherwise, including the first 15 min after 06:00 ET; `documents_newest` (its own `Endpoint.cadence`, D-047) every 900 s in business hours, 3600 s off hours, stale after 1800 s in business hours and 7200 s otherwise, including the first hour after 06:00 ET; `/api/v1/status` reports the larger threshold; budget 180 req/h, peak use 65 (60 PI + at most 5 documents per clock hour, `peakRequestsPerHour`; the FR publishes no limit) · mapping and fail-closed rules: D-034 | PI fixed slots: regular filings 08:45 ET; special filings 08:45, 11:15, 14:00, 16:15, 18:00 ET (verifier-corrected); presidential docs at 11:15 ET, 1–2 business days after signing (n=11); publication median 5 days after signing (n=31). Live smoke 2026-10-02 21:43Z: PI 200, 175,049 B, 696 ms, 108 docs; documents 200, 21,260 B, 92 ms. Parse (Node 26, home PC, 2026-10-02): PI 0.83 ms for 107 docs, 7.4 ms for 1000; documents (page of 20) 0.13 ms. Page of 500 (recorded 2026-10-03 02:20Z): 200, 514,532 B (55,385 B gzip on the wire), 369 ms, 1,029 B per document; parse 3.3-3.5 ms warm median, 10.3-11.3 ms on the first call in a fresh process (Node 26.3.0, home PC, 2026-10-03, n=5 processes x 60 parses); a page of 300 parsed in 2.1-2.3 ms warm and 8.2-8.4 ms on the first call (n=3). Daily issue size: FR `documents/facets/daily` since 1994 (`fixtures/fr.api/2026-10-03/facets_daily_since_1994.json`): n=8,191 publication days (1994-01-03..2026-10-02), median 123, p99 193; largest 344 (2024-12-30, the only day above 300; documents.json counts 344 too); above 250 on 7 days (2024-12-30 344, 2025-07-01 279, 2025-11-25 277, 2001-01-22 269, 2025-11-28 259, 2023-09-29 257, 2021-06-24 256); no weekend issue; 2025-01-02..2026-10-02 alone: n=437, median 101, max 279. Order: publication_date desc, then document_number desc as text (0 violations in 2000 results; a C1- correction sorts first in its issue). `per_page=2000` accepted (2000 results, 2026-10-03); `per_page=1` is not honoured (20 results came back, 2026-10-03, n=1), `count` is right either way. An issue is absent from documents.json before its publication day (2026-10-05: count 0 at 2026-10-03 01:40Z). When an issue posts on the FR API is unmeasured (research recipe: 06:00 ET): read it from the first 2026-10-05 sighting. CF parse CPU unmeasured (P1.3). Slot-to-detection latency unmeasured | official-nonpartisan | yes (+NEGATIVE) | EXE, ARC, CUR |
| `wh.feeds` | whitehouse.gov umbrella RSS `https://www.whitehouse.gov/news/feed/` (endpoint `news`), the only polled endpoint: the 30 newest posts across Releases, Briefings & Statements, Fact Sheets and every Presidential Actions subcategory. `/presidential-actions/feed/` is a test-only fixture and is not polled (same site-wide ETag) | F9 F11 | RSS · public domain (whitehouse.gov/copyright); robots allows feeds · send the ETag (IMS also gets 304s); the validator is site-wide and changes with no new item, so the adapter is idempotent and dedupes by WordPress post id (D-035); `max-age=300` · poll every 60 s at all hours; stale after 120 s (D-039); <= 60 req/h (the host is shared with `wh.live`) · head-only parse (item bodies cut before XML parsing) of the 514 KB fixture, dev PC, 2026-10-02: warm median 0.98 ms (n=20, Node 26.3) / 0.90 ms (n=20, Node 22.23); first call in a fresh process 7.4-10.0 ms (n=5) / 8.2-9.0 ms (n=5); after the review fixes (2026-10-02 23:01Z, Node 26.3, paired against the builder's version) first call median 7.18 -> 7.54 ms (n=15 each), warm +0.04-0.06 ms (paired, n=200 x 3); CF parse CPU unmeasured (P1.3) | EOs posted 17–210 min after the scheduled signing (10 signings, Aug–Sep 2026); the "breaking" source for EOs (FR follows ~42 h later). Live smoke 2026-10-02 21:44:55Z: 200 (ETag changed; 4 new posts), 477,586 B, 194 ms, same shape as the fixture, adapter `ok` with 30 items. Latency unmeasured | executive-messaging | yes | EXE, CUR |
| `wh.live` | whitehouse.gov/live/ `data-live-duplex` flag (event name + YouTube id when live) | F3 F4 | HTML · no ETag; `max-age=60`; ~41 KB gzip per poll | flag flip lag unmeasured | executive-messaging | yes (not-live state) | EXE, LIVE |
| `senate.lis.votes` | Senate LIS vote menu + per-vote XML (member-level, LIS ids) | F5 F6 | XML · **If-Modified-Since only** (ETag ignored) | per-vote XML 36–47 min after the vote closed (n=4, Sep 30) | official-nonpartisan | yes | CFV, ARC |
| `house.clerk.votes` | House Clerk `evs/<year>/roll<NNN>.xml` (member-level, bioguide ids) | F5 F6 | XML · probe the next roll number; a missing roll is **200 with an error body** | first-appearance latency unmeasured (needs a session day) | official-nonpartisan | yes (+NEGATIVE) | CFV, CUR |
| `house.clerk.floor` | Clerk floor proceedings XML: poll the per-day `floor/YYYYMMDD.xml` (~74 KB), not the ~2.2 MB whole-session file | F2 F5 F7 | XML · IMS 304 (INM ignored) | 84–87% of actions stamped ≤ 2 min after the action (n=322, Sep 15–16); vote-result lines posted in one batch per vote series, 4–45 min | official-nonpartisan | yes | CFV |
| `house.floorcast` | HouseLive backend behind live.house.gov: `/latest/{history,floor,votes,transcript,transcriptUpdates}`, `/transcripts/<date>`, `/broadcastevents/<date>` | F2 F5 F7 F1-like text | JSON, undocumented, **server-side only** (CORS pinned to live.house.gov) · ETag 304 on `/latest/history` | its own client polls every 30 s; floor actions median 0 min, p90 4.4 min (n=170); caption text ~55–60 s after speech (n=1); every speaker "UNIDENTIFIED SPEAKER" | unofficial (official data, undocumented API) | yes | CFV, LIVE |
| `senate.schedule` | `floor_schedule.json` (next convene + stream name) and committee `hearings.xml` | F7 F1 | JSON/XML · IMS | schedule updates when it changes; `hearings.xml` regenerated ~every 2 h | official-nonpartisan | yes (+EMPTY) | CFV, LEG, LIVE |
| `senate.pressgallery` | Senate Daily + Periodical Press Gallery WordPress REST/RSS floor logs | F1 F5 F7 F8 | JSON/RSS · open CORS | human-written; Periodical floor-log post modified ~1 min after the Sep 30 adjournment; per-event lag unmeasured | official-nonpartisan | yes | CFV, LIVE |
| `members` | unitedstates/congress-legislators current members (bioguide ↔ LIS ↔ names, socials) | identity for F6 F8 | JSON, CC0, CORS * | community-maintained; updated within days of membership changes | independent | yes | CFV, CUR |

## Tier 2 — next (Phases 2–7; the phase for each is in `docs/ROADMAP.md`)

| source_id | what | features | access · notes | affiliation | report |
|---|---|---|---|---|---|
| `house.domewatch` | DomeWatch Data API (House Democratic Whip): floor state, live vote tallies (SSE with a free key) | F2 F5 F7 F8 | anonymous 30 req/min, no SSE; free key for SSE; **test-vote records in production data** (quarantine); `/floor-updates` stale since June | official-partisan | CUR |
| `house.docs.floor` | docs.house.gov weekly floor schedule XML | F7 F5 | missing weeks are 200 HTML "File Not Found"; validate the root element | official-nonpartisan | CFV, CUR |
| `house.committee` | docs.house.gov Committee Repository (meetings ~7 days ahead; per-meeting XML) | F7 | per-meeting XML behind an ASP.NET postback; times Eastern with no offset | official-nonpartisan | LEG |
| `house.repcloakroom` | House Republican Cloakroom `vote_sheet` (WP REST) | F5 F7 | vote series posted ~37 min before the first vote (n=1); sends two ACAO headers (server-side only) | official-partisan | CFV |
| `senate.dems` | Senate Democrats RSS (floor schedule posts) | F7 | labels daylight-time posts "EST" | official-partisan | CUR |
| `senate.captions` | Senate floor/committee HLS WebVTT caption rendition (`stv<MMDDYY>` for the floor) | F1 F8 | 12 s segments, ACAO *; floor playlists vanish after the day (`docs/TRAPS.md`); speaker tags `SEN. X:` | official-nonpartisan | LIVE |
| `house.media` | House floor HLS with in-band captions + daily `captions.vtt` | F2 | ACAO *; the day's asset path is only listed by `house.floorcast` | official-nonpartisan | LIVE |
| `congress.api` | Congress.gov API v3: `/committee-meeting`, `/nomination`, `/house-vote` (no Senate endpoint), `/bill` | F7 F11 F5 F6 | needs the owner's api.data.gov key (5,000/h); `max-age=1800`; bill actions largely next-day | official-nonpartisan | LEG, CFV |
| `bsky.official` | Bluesky author feeds: Senate Press Gallery, House Democratic Cloakroom (later Jetstream) | F1 F5 F7 | free; `max-age=30`; human posts, minutes after events | official-* | CUR |
| `state.feeds` | State Dept RSS incl. the Secretary's public schedule | F7 F3 | needs a browser-like UA (bare bot UA gets 403) | executive-messaging | EXE |
| `war.feeds` | War Dept RSS (releases, transcripts) + DVIDS webcast schedule/HLS | F3 F7 | homepage 403 to scripts but `RSS.ashx` works; DVIDS API needs a free key | executive-messaging | EXE, LIVE |
| `fed.feeds` | Federal Reserve press RSS + `calendar.json` (speeches with live links) | F4 F7 F12 | ETag/LM | official-nonpartisan | EXE, CUR |
| `scotus.html` | Supreme Court slip-opinion and orders-list HTML pages (D-016; moved up from Tier 3 for the D-012 alert) | F11 | HTML, allowed by robots (`Crawl-delay: 1`), If-Modified-Since 304; never `/rss/` or docket JSON under it | official-nonpartisan | LEG, SYNTHESIS |
| `govinfo.rss` | GovInfo RSS, no key: Congressional Record "is out", BILLSTATUS batch, bills, public laws | F11 | RSS · IMS; next-day-ish, a cheap F11 backbone before the Congress.gov key | official-nonpartisan | LEG |
| `factbase` | Roll Call Factba.se presidential calendar JSON (D-017: ingest now, facts only + credit) | F7 F4 | JSON · ETag 304; file regenerated ~every 2 min | third-party | EXE, CUR |
| `youtube.api` | YouTube Data API `videos.list` on the video id from `wh.live` (1 unit/call) | F3 F4 | needs a free Google API key (ask-first signup, ROADMAP P3.3); detect + embed only, never captions or audio (D-010) | n/a | EXE, LIVE |

## Cloudflare probe (ROADMAP P1.3): running, results pending

Measured from Cloudflare's network by the temporary `ced-probe` Worker (`workers/probe`; method and schedule: D-042),
deployed 2026-10-03 and running since its first cron at 01:01Z; it stops itself after its last run. After that, paste
the body of `GET https://ced-probe.usgovfeed.workers.dev/results/sources.md` here (its first line is an HTML
comment naming the time, the run count and the dates). The raw measurements stay at `/results` (JSON), which the Worker
keeps serving after its last run. Columns:

- **CF reachable** = plain GETs that returned 2xx AND the expected document (the format, the root element for XML, a
  page marker for HTML; per-URL values and their evidence in `workers/probe/src/targets.ts`), over all sent. A 200 error
  or block page reads "not the expected document". Anything else lists what came back: statuses, bodies that failed to
  read after the headers, no answer. URLs of a host that asked to wait (429/503) read "not sent while the host asked to
  wait".
- **Validator 304** = conditional GETs that got 304, per validator, sent only after a usable plain GET that returned
  that validator (ETag -> If-None-Match, Last-Modified -> If-Modified-Since); "not measured (no usable answer)" when no
  plain GET was usable.
- **Median wall ms · bytes** = Date.now() around the request and body read; decoded bytes.
- **Parse CPU** = head-only parse of the recorded fixture, timed in Node on the dev PC (a Worker cannot read CPU time);
  "—" in the generated table.

Several probed URLs are fixed recorded documents (roll 314, floor file 20260916, billsthisweek 20260914, the Sep 30
Judiciary caption playlist), not the live "next" URL. The `fr.api` `documents_newest` probe URL has no `fields[]` and asks for 20 documents, not the production 500 (D-047),
so its bytes and wall time understate the production page.

## Tier 3 — later (Phase 7+) or needs an owner decision first

| source_id | what | blocker / note | report |
|---|---|---|---|
| `pacer.dcd` | Key-free D.D.C. docket RSS, filtered to a curated watchlist of administration cases (D-021) | Phase 7; entries appear within minutes | LEG |
| `courtlistener` | CourtListener API + feeds | free tier 5/min, 50/h, 125/day; optional for D-021 | LEG |
| `govinfo.dcpd` | GovInfo Daily Compilation of Presidential Documents | ~a month behind: archival/context only | LEG, LIVE |
| `oira.review` | OIRA regulatory-review XML (rules under White House review) | daily; a leading indicator for major rules | SYNTHESIS |
| `cbo.gao` | CBO and GAO report RSS | cheap; low urgency | LEG |
| `senate.noms` | Senate nominations XML | regenerated nightly | LEG |
| `trumpstruth` | Independent archive of the President's Truth Social posts | third-party; D-017: ingest, facts only + credit | EXE |
| `bno.pool` | BNO News White House press-pool page | third-party HTML; D-017: ingest, facts only + credit | EXE |
| F12 set | SEC EDGAR Atom, BLS calendar ICS, GDELT 2.0, Bluesky Jetstream, Treasury, UN | Phase 8; SEC requires a declared UA | CUR |

## Excluded (and why)

| source | reason |
|---|---|
| C-SPAN | terms forbid bots and AI use; bot challenge; link out only |
| YouTube captions / audio | not available to non-owners via the API; terms forbid downloading (D-010) |
| X (Twitter) API | pay-per-use; D-001 ($0) |
| GovTrack API | officially retired; robots disallows `/api` |
| ProPublica Congress API | shut down (July 2024) |
| HHS and Commerce press pages; war.gov homepage | 403 to scripts; no working feed found (DHS is NOT blocked: its press-release HTML returns 200 — an HTML-scrape source, Phase 7) |
| supremecourt.gov `/rss/` and docket JSON | robots.txt disallows `/rss/`; D-016 uses the allowed HTML pages instead |
| federalregister.gov website HTML | blocks scripts by policy; use the API |

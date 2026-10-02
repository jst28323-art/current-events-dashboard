# SOURCES — the living catalog (one row per source; the source's only home)

Every per-source number (latency, cadence, cache behaviour) lives HERE and nowhere else; other docs link to the row.
Latencies are **dated observations** from the 2026-10-02 research (n and method in the cited report), mostly measured
while Congress was in recess: re-measure live (ROADMAP P3.4) and update the row. `fixture` = recorded in `fixtures/`
(see `fixtures/README.md`). Affiliation values follow `docs/EVENT_MODEL.md`; partisan/unofficial/third-party use is
governed by D-009. Reports: CFV = `docs/research/congress_floor_votes.md`, LEG = `docs/research/congress_legislation_committees_courts.md`,
EXE = `docs/research/executive_branch.md`, LIVE = `docs/research/live_media_transcripts.md`,
ARC = `docs/research/architecture_hosting_frontend.md`, CUR = `docs/research/curation_priorart_future.md`.

Columns to fill in Phase 1 (probe Worker): **CF reachable** (fetchable from Cloudflare's network?) and **parse CPU**.

## Tier 1 — build first (Phases 2–3): free, official or explicitly allowed, verified live

| source_id | what | features | access · validator | observed freshness (2026-10-02) | affiliation | fixture | report |
|---|---|---|---|---|---|---|---|
| `fr.api` | Federal Register API: Public Inspection `current.json` + `documents.json` (EOs, presidential docs, rules) | F10 F9 | JSON, no key, CORS `*` · no ETag/LM: hash the body; **always add a cache-busting query** (a plain request got a shared-cache copy ~47 min old despite `no-store`) | PI fixed slots: regular filings 08:45 ET; special filings 08:45, 11:15, 14:00, 16:15, 18:00 ET (verifier-corrected); presidential docs at 11:15 ET, 1–2 business days after signing (n=11); publication median 5 days after signing (n=31); slot-to-detection lag unmeasured | official-nonpartisan | yes | EXE, ARC, CUR |
| `wh.feeds` | whitehouse.gov RSS: `/presidential-actions/feed/`, `/news/feed/` | F9 F11 | RSS · ETag + IMS both 304, but the validator is site-wide and changes with no new item: dedupe by GUID; `max-age=300` | EOs posted 17–210 min after the scheduled signing (10 signings, Aug–Sep 2026); the "breaking" source for EOs (FR follows ~42 h later) | executive-messaging | yes | EXE, CUR |
| `wh.live` | whitehouse.gov/live/ `data-live-duplex` flag (event name + YouTube id when live) | F3 F4 | HTML · no ETag; `max-age=60`; ~41 KB gzip per poll | flag flip lag unmeasured | executive-messaging | yes (not-live state) | EXE, LIVE |
| `senate.lis.votes` | Senate LIS vote menu + per-vote XML (member-level, LIS ids) | F5 F6 | XML · **If-Modified-Since only** (ETag ignored) | per-vote XML 36–47 min after the vote closed (n=4, Sep 30) | official-nonpartisan | yes | CFV, ARC |
| `house.clerk.votes` | House Clerk `evs/<year>/roll<NNN>.xml` (member-level, bioguide ids) | F5 F6 | XML · probe the next roll number; a missing roll is **200 with an error body** | first-appearance latency unmeasured (needs a session day) | official-nonpartisan | yes (+NEGATIVE) | CFV, CUR |
| `house.clerk.floor` | Clerk floor proceedings XML: poll the per-day `floor/YYYYMMDD.xml` (~74 KB), not the ~2.2 MB whole-session file | F2 F5 F7 | XML · IMS 304 (INM ignored) | 84–87% of actions stamped ≤ 2 min after the action (n=322, Sep 15–16); vote-result lines posted in one batch per vote series, 4–45 min | official-nonpartisan | yes | CFV |
| `house.floorcast` | HouseLive backend behind live.house.gov: `/latest/{history,floor,votes,transcript,transcriptUpdates}`, `/transcripts/<date>`, `/broadcastevents/<date>` | F2 F5 F7 F1-like text | JSON, undocumented, **server-side only** (CORS pinned to live.house.gov) · ETag 304 on `/latest/history` | its own client polls every 30 s; floor actions median 0 min, p90 4.4 min (n=170); caption text ~55–60 s after speech (n=1); every speaker "UNIDENTIFIED SPEAKER" | unofficial (official data, undocumented API) | yes | CFV, LIVE |
| `senate.schedule` | `floor_schedule.json` (next convene + stream name) and committee `hearings.xml` | F7 F1 | JSON/XML · IMS | schedule updates when it changes; `hearings.xml` regenerated ~every 2 h | official-nonpartisan | yes (+EMPTY) | CFV, LEG, LIVE |
| `senate.pressgallery` | Senate Daily + Periodical Press Gallery WordPress REST/RSS floor logs | F1 F5 F7 F8 | JSON/RSS · open CORS | human-written; Periodical floor-log post modified ~1 min after the Sep 30 adjournment; per-event lag unmeasured | official-nonpartisan | yes | CFV, LIVE |
| `members` | unitedstates/congress-legislators current members (bioguide ↔ LIS ↔ names, socials) | identity for F6 F8 | JSON, CC0, CORS * | community-maintained; updated within days of membership changes | independent | yes | CFV, CUR |

## Tier 2 — next (Phases 3–5)

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
| `youtube.api` | YouTube Data API `videos.list` on the id from `wh.live` (1 unit/call) | needs a free Google key; detect + embed only, never captions/audio (D-010) | EXE, LIVE |
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

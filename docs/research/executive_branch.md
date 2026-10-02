# Executive branch — White House, presidential actions, Federal Register, agencies

Research date: **2026-10-02** (all probes run 15:30–17:15 UTC, i.e. 11:30 AM–1:15 PM ET, a Friday).
Scope: features **F3** (briefings/press conferences), **F4** (President/cabinet speaking live + transcript), **F7** (President's and agencies' schedules), **F9** (presidential actions), **F10** (Federal Register + Public Inspection), **F11** (exec-branch slice: nominations sent, agency actions, GAO/CBO). F12 sources (Fed, SEC) are covered where they overlap with executive-branch speakers.

Conventions:
- **LIVE**: I fetched it today and quote what came back. The EVIDENCE column says how.
- **DOC**: taken from official documentation fetched today, not exercised by a live call.
- **UNVERIFIED**: could not be confirmed today; the reason is given.
- Every probe used the User-Agent `current-events-dashboard-research/0.1 (jst28323@gmail.com)` unless noted. "Browser-like UA" means `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 current-events-dashboard-research/0.1`.
- Times: `Z` = UTC; "ET" = US Eastern (EDT, UTC−4, today).

Sibling reports: `architecture_hosting_frontend.md` (Cloudflare Worker + Durable Object pollers, 10 ms CPU budget, transcription box), `curation_priorart_future.md` (event schema, Factba.se licensing note, WH on Bluesky), `congress_*.md` (floor, votes, Congress.gov, GovInfo).

---

## 0. TL;DR

1. **The single best "the White House is live right now" signal is the server-rendered flag on `https://www.whitehouse.gov/live/`.** The HTML carries `data-live-duplex="{"live":{"on":true,"name":"<event title>"},...}"` and, while live, a YouTube embed of the stream's video ID. I verified the on-state on 4 Wayback snapshots, for example 2026-09-30 16:36:07Z → `on:true`, `"Vice President JD Vance Delivers Remarks in Brownsville, TX"`, embed `LLh9sKf0L-w`. That stream ran 16:18:02Z–16:52:48Z per YouTube. The page is 41 KB gzipped, `cache-control: max-age=60`, and has no ETag. Poll it every 60 s. (LIVE)
2. **YouTube channel RSS feeds do NOT announce executive-branch live streams while they are live.** In 18 of 18 recent live videos on the White House (6), State (3), War (7) and Fed (2) channels, the RSS `<published>` time came **after the stream ended**. The lag ran from 3 minutes to about 12 hours. RSS is fine for "replay is up" but useless for "speaking now". (LIVE)
3. **The YouTube Data API is now very tight for search.** The quota page (updated 2026-09-15) says `search.list` has its **own bucket of 100 calls/day**, with 10,000 units/day for everything else. `eventType=live` searching across many channels is not viable. Use the video ID from (1), then call `videos.list` (1 unit) to get `liveStreamingDetails`. (DOC)
4. **Presidential actions: whitehouse.gov RSS is fastest; the Federal Register is authoritative and complete.**
   - `https://www.whitehouse.gov/news/feed/` is one umbrella feed for Releases, Briefings & Statements, Fact Sheets and every Presidential Actions subcategory. It returns 30 items (about 10 days), with ETag/Last-Modified, and 304s worked.
   - EOs land there about **17 min to 3.5 h after the scheduled signing time** (10 signings, Aug–Sep 2026).
   - WH posts carry **no EO number**. The FR assigns it at Public Inspection.
   - Some presidential documents never appear in the WH feed but do appear on FR Public Inspection: the Syria national-emergency continuation notice, the FY2027 refugee determination, and the Lebanon determination. (LIVE)
5. **Federal Register Public Inspection (PI) runs on a fixed clock** (LIVE, 10 business days of API history):
   - Regular filings are posted at **08:45 ET**.
   - Special filings are posted at **11:15, 16:15, 18:00 ET**, and rarely at 14:00 ET. [verifier 2026-10-02: corrected — special filings also occur at **08:45 ET** (1 on 09-22, 3 on 09-30 by `filed_at`). Special filings made at 14:00/16:15/18:00 on day D stay on PI and **also appear in day D+1's issue**, so per-issue counts double-count them; see the corrected slot table in §3.]
   - **All 11 presidential documents seen were filed in the 11:15 ET slot**, 1–2 business days after signing (1–4 calendar days, counting weekends).
   - FR publication follows a median of **5 days** after signing (n=31 presidential documents since 2026-09-01; range 2–7).
   - `current.json` exposes `regular_filings_updated_at` and `special_filings_updated_at`, which make a cheap change detector. [verifier 2026-10-02: caveat — despite `Cache-Control: no-store`, `current.json` is served from a shared cache: responses at 17:19–17:42Z carried `Age: 3855`→`5231` s (cached since ~16:15Z) and repeated `x-request-id`; adding a cache-busting query (`?_=<epoch>`) returned `Age: 0`. The cache was refreshed at 14:00:09 ET (slot boundary; no filing came in that slot), so it may be purged at slots. Add a cache-buster anyway: it costs nothing and removes the doubt. See "Verifier additions" §1.]
   - The API needs no key. HTML pages on federalregister.gov are **behind a bot wall** (302 to `unblock.federalregister.gov`), so use only `/api/v1/...`.
6. **The President's schedule comes from two machine-readable sources, neither official:**
   - **Roll Call Factba.se** `https://media-cdn.factba.se/rss/json/trump/calendar.json` (268 KB, ETag, 304 works). It is regenerated about every 2 min: `Last-Modified` advanced on 24 of 24 polls, but the content (ETag) changed only once in 60 min, so 304s are the norm. [verifier 2026-10-02: the advancing `Last-Modified` is visible only on CloudFront misses. Plain requests at 17:25Z got the last-content-change LM (16:27:05Z). Key on ETag (see §5.1).] It covers through tomorrow. It has `coverage` (Open/Closed Press), plus transcript `url` and `video_url` after the event.
   - **BNO News "White House Press Pool"** `https://bnonews.com/whpool/`. It auto-publishes the WHCA pool-report emails "often within seconds", including "Daily Guidance and Press Schedule". It is HTML only, with no RSS.
   - The White House itself publishes **no** schedule. (LIVE)
7. **Transcripts are the weakest link (F4).**
   - whitehouse.gov no longer posts remarks or briefing transcripts. The `/remarks/feed/` contains one item, the 2025-01-20 Inaugural Address.
   - The official record is GovInfo's Daily Compilation of Presidential Documents, which runs **about 5 weeks behind**: items issued 2026-08-28 were posted 2026-10-01.
   - Factba.se has speaker-labelled transcripts within hours, but it is proprietary.
   - A live transcript needs our own speech-to-text on the stream. See the architecture report, plus ToS risk §9.
8. **Agencies are a patchwork. Many .gov sites now block non-browser clients:**
   - war.gov, hhs.gov and commerce.gov return 403 (Akamai/Cloudflare WAF). state.gov returns 403 to a custom UA but 200 to a browser-like UA. dhs.gov returns 403 to both. [verifier 2026-10-02: corrected for DHS — at 17:31Z `https://www.dhs.gov/` and `https://www.dhs.gov/news-releases/press-releases` returned **HTTP 200 to our custom UA** (Akamai `cdn-cache; desc=HIT`); `dhs.gov/news-releases/rss.xml` and `dhs.gov/rss.xml` return **404** (Apache, URL does not exist), not 403. DHS has no RSS, but its press-release HTML listing is reachable. war/hhs/commerce 403s re-confirmed with both UAs.]
   - Working free feeds: **DOJ** RSS, **War** `RSS.ashx` (news, releases, advisories, speeches, transcripts, contracts), **State** RSS (including a daily **Public Schedule**), **Treasury** via GovDelivery, the **Fed** (feeds plus a `calendar.json` with upcoming speeches and live links), **SEC** RSS, **GAO** RSS, **CBO** RSS.
   - **"Today in DOW"** (GovDelivery USDOD) is the War Secretary's daily schedule. (LIVE)
9. **Social:**
   - X is now pay-per-use only for new developers: **$0.005 per post read**, $0.010 per user read, capped at 3M post reads/month. Free, Basic and Pro tiers are closed to new sign-ups (DOC, docs.x.com today). [verifier 2026-10-02: prices and cap re-confirmed on docs.x.com. The page lists no Free/Basic/Pro tier ("pay-per-usage pricing with no subscriptions"); that legacy tiers are closed to new sign-ups is not stated on the page, so that part is secondary-source only. The page also says reads are "Charged per resource returned in the response" and "All resources are deduplicated within a 24-hour UTC day window".]
   - Truth Social's API is behind Cloudflare (403).
   - A free third-party RSS of Trump's Truth Social posts exists at `https://www.trumpstruth.org/feed` (Defending Democracy Together). It has 100 items, supports 304, and each item carries the original post ID.
   - The White House also posts on Bluesky (see the curation report).

---

## 1. Fastest legitimate signal for each question

| Question | Fastest legitimate signal (first) | Confirmation / authoritative follow-up | Observed latency | Evidence |
|---|---|---|---|---|
| **"An EO was signed"** | (a) If televised: `whitehouse.gov/live/` flag turns on with a name like "President Trump Signs Executive Orders". (b) Pool reports (BNO) describe signings; their latency was not measured today. (c) **Text:** `https://www.whitehouse.gov/news/feed/` (or `/presidential-actions/feed/`), category `Executive Orders`. | FR Public Inspection 11:15 ET special filing, 1–2 business days later, with the EO number. FR publication follows (median +5 days after signing). | WH post was 17–210 min after the **scheduled** signing time across 10 signings. This assumes each post belongs to that day's scheduled signing session; one EO, America.gov on 9/29, was posted at 10:50 ET, before that day's 17:00 session, and is excluded. Examples: 9/29 sched 17:00 ET → posts 17:17 and 17:23 ET; 9/17 17:00 → 17:26/17:31; 9/18 16:30 → 18:02; 9/08 13:00 → 14:52/15:00; 8/27 13:30 → 17:00. PI: EO 14432–14434 (signed 9/29) filed 10/01 11:15 ET; published 10/02. | Factba.se calendar "signs Executive Orders" rows vs WH RSS `pubDate` (LIVE) |
| **"A press briefing just started"** | `whitehouse.gov/live/` `live.on` turns true; `live.name` holds the title. Pre-announcement: the pool **"Daily Guidance and Press Schedule"** (BNO) and Factba.se rows with `type: "Briefing Schedule"`. | YouTube `videos.list?part=liveStreamingDetails&id=<embed id>` gives `actualStartTime` (1 unit). Factba.se transcript `url` appears later. | The flag is set server-side. The page cache is 60 s, so worst case is the poll interval plus 60 s. WH briefings are **rare in 2026**: Factba.se lists 8 "Briefing Schedule" rows May–Sep, the last on 2026-09-15 (AG, Rose Garden). [verifier 2026-10-02: corrected — **9** rows, 2026-05-01 → 09-30, from calendar-full fetched 17:24Z: 05-05 Rubio, 05-19 Vance, 05-28 Bessent, 06-02 Oz, 06-18 Vance, 07-16 Leavitt, 07-23 Leavitt, 09-03 Vance, 09-15 Blanche. The conclusion (rare, last 09-15) stands.] State: the Public Schedule RSS has a "BRIEFING SCHEDULE" block (today: "No Department Press Briefing"). | Wayback snapshots + Factba.se JSON (LIVE) |
| **"The President is speaking live right now"** | `whitehouse.gov/live/` flag (verified on-state ×4). Cross-check Factba.se rows with `coverage` "Open Press"/"Pre-Credentialed Media" at that time. | `videos.list` on the embedded ID. Afterwards: WH `/videos/feed/` and YouTube RSS (replay), then Factba.se transcript. | During the stream. Example: VP remarks stream started 16:18:02Z, flag seen on at 16:36:07Z (the snapshot time, not the flip time; the flip time is UNVERIFIED). YouTube RSS listed the same video at 16:55:27Z, **after** it ended. | Wayback CDX + YouTube watch-page `liveBroadcastDetails` (LIVE) |
| **"A new FR document is on public inspection"** | `GET https://www.federalregister.gov/api/v1/public-inspection-documents/current.json`. Compare `special_filings_updated_at` / `regular_filings_updated_at` and the document_number set. Poll around 08:45, 11:15, 14:00, 16:15, 18:00 ET. | `public-inspection-documents.rss` (`pubDate` = filing time); `documents.json` on publication day. | Today: `regular_filings_updated_at 2026-10-02T08:45-04:00`, `special_filings_updated_at 2026-10-02T11:15-04:00`. The 11:15 special (Lebanon PD) was already present in a fetch at about 11:33 ET. Detection lag under 1 min after the slot is UNVERIFIED (the slot flip was not caught live). | curl + API history (LIVE) |

---

## 2. whitehouse.gov (WordPress; current administration)

### 2.1 What works today

| Endpoint | Auth / cost | Format | Caching / conditional GET | Freshness / volume | Evidence |
|---|---|---|---|---|---|
| `https://www.whitehouse.gov/news/feed/` **(umbrella)** | none | RSS 2.0, full HTML in `content:encoded` (~500 KB) | `ETag`, `Last-Modified`, `cache-control: max-age=300, must-revalidate`, `x-cache: HIT`. **304s returned** with If-None-Match / If-Modified-Since (22 of 23 polls after the baseline; the one 200 had no new items, §10). The ETag is **site-wide**: identical on `/presidential-actions/feed/` and `/briefings-statements/feed/`, so any site change produces a full 200. | 30 items spanning 2026-09-22 → 2026-10-01. Categories seen: Releases 12, Briefings & Statements 9, Fact Sheets 4, Presidential Actions/EOs 3, Nominations 1, Proclamations 1. `lastBuildDate Fri, 02 Oct 2026 13:40:11 +0000` | curl 15:31Z HTTP 200; poller 16:12–17:10Z |
| `/presidential-actions/feed/` | none | RSS | same | 30 items 2026-08-26 → 2026-09-29. Subcategories: Executive Orders 13, Proclamations 13, Nominations & Appointments 3, Presidential Memoranda 1. | curl HTTP 200, 593,364 B |
| `/presidential-actions/executive-orders/feed/`, `/proclamations/feed/`, `/presidential-memoranda/feed/`, `/nominations-appointments/feed/` | none | RSS | same | per-subcategory, 30 items each | curl HTTP 200 ×4 |
| `/briefings-statements/feed/`, `/fact-sheets/feed/`, `/articles/feed/` (=Releases), `/research/feed/` [verifier 2026-10-02: corrected — `/articles/feed/` now returns **HTTP 301 → `/releases/feed/`**; poll `https://www.whitehouse.gov/releases/feed/` directly (200, 30 items, same site-wide ETag). `/research/feed/` returned 26 items.] | none | RSS | same | Briefings & Statements newest "Congressional Bill S. 2398 Signed into Law" 2026-09-30T16:17Z. **Bill-signing notices ("…Signed into Law") are posted here (F11).** | curl HTTP 200 |
| `/videos/feed/` | none | RSS (37 KB) | same | Mirrors the YouTube uploads. Newest "America.Gov Launch" 2026-10-02T01:20:38Z. Titles name the event ("President Trump Gaggles with Press at Dallas Fort Worth International Airport, Oct. 1, 2026"). Each item is posted **after** the event (see §6). | curl HTTP 200 |
| `/remarks/feed/` | none | RSS | — | **Dormant.** 1 item: "The Inaugural Address" (2025-01-20). The WH does not post remarks or briefing transcripts. | curl HTTP 200, 30 KB |
| `/feed/` (site root) | — | — | — | **HTTP 404** | curl |
| `/wp-json/`, `/wp-json/wp/v2/posts`, `/wp-json/wp/v2/types` | — | — | — | **HTTP 403** (REST API blocked) | curl ×3 |
| `/sitemap_index.xml` → `post-sitemap*.xml`, `past_event-sitemap*.xml`, `wire_edition-sitemap.xml`, … | none | XML sitemaps with `<lastmod>` | — | `post-sitemap.xml lastmod 2026-10-02T13:40:11+00:00`. This is a cheap "something was published" tripwire, but it adds nothing over the news feed ETag. | curl HTTP 200 |
| **`/live/`** | none | HTML 270 KB (41 KB gzip) | `cache-control: max-age=60`, `x-cache: HIT`, **no ETag/Last-Modified** (a 304 test returned 200) | See 2.2 | curl + Wayback |
| `?paged=2` on any feed | none | RSS | ETag | Works for backfill (30 more items) | curl HTTP 200 |

robots.txt: `User-agent: * / Disallow: /*?s= / Disallow: /*&s=`. Feeds and `/live/` are allowed. Bot blocking: none seen on feeds or `/live/` with our custom UA.

**Real RSS item sample** (presidential-actions feed, first item, LIVE):
```
title: Eliminating Disease-Carrying Pests And Restoring Enjoyment Of The Great Outdoors
link: https://www.whitehouse.gov/presidential-actions/2026/09/eliminating-disease-carrying-pests-and-restoring-enjoyment-of-the-great-outdoors/
dc:creator: The White House
pubDate: Tue, 29 Sep 2026 21:23:48 +0000
category: Presidential Actions | category: Executive Orders
guid: https://www.whitehouse.gov/?p=51617          <- stable WP post id, use as dedupe key
description: <p>By the authority vested in me as President by the Constitution and the laws of the United States ...
content:encoded: <div class="alignfull has-wide-width wp-block-whitehouse-topper"> ... (full text)
```
Parsing traps: titles are inconsistently cased ("RESTORING AMERICAN SALTWATER ANGLING AND RECREATION"; "Inaugurating The Era Of Super Intelligence"). There is no EO number. The feed is served `charset=UTF-8`, but curly quotes showed up as mojibake in one Windows console. Decode as UTF-8 explicitly.

[verifier 2026-10-02: added trap — `pubDate` is the WordPress `datePublished`, which is **not always the go-live time**. "New Report: DSA Policies Would Cost Americans Trillions" has `pubDate`/`datePublished` 2026-10-01T22:22:29Z and `dateModified` 2026-10-02T13:40:11Z (= the feed's `lastBuildDate`), but the matching WH Office of Communications email ("FOR IMMEDIATE RELEASE 10/02/26") hit the BNO pool archive at 08:57 EDT on 10-02, ~14.5 h after `pubDate`. "Democrats Unanimously Vote Against…" has `pubDate` exactly `03:00:00 +0000` (a scheduled post) under a `/2026/09/` URL. Whether those posts were publicly visible at `pubDate` is UNVERIFIED (Wayback timed out). Store a first-seen timestamp and use it for latency and ordering. EO posts looked clean: `datePublished` 21:23:48Z vs `dateModified` 21:23:49Z.]

### 2.2 The `/live/` page: structure (LIVE + Wayback)

- The page is a "duplex" of two panels. **CH 45 "White House Live"** shows the live event; when off air it reads "Off Air · Stay Tuned · The official livestream will appear here when a briefing or event is underway." **CH 47 "Trump TV 24/7"** is a looped YouTube playlist, `A4gNgHfZ-v4`.
- The state is server-rendered in one attribute (HTML-entity encoded):
  - Off (today, 24 polls 16:12–17:10Z): `data-live-duplex="{"live":{"on":false,"name":""},"replay":{"on":true,"name":""}}"`
  - On (Wayback `id_` raw snapshots; gzip-decode them):

    | Snapshot (UTC) | `live.name` | Live embed ID |
    |---|---|---|
    | 2026-09-22 13:55:53 | "President Trump Delivers Remarks, Sep. 22, 2026" (UNGA) | `Q5WyknJN3qY` |
    | 2026-09-22 17:44:39 | "President Trump Participates in a Bilateral Meeting with the President of Ukraine" | `Ct9HNm6fcPY` |
    | 2026-09-25 14:42:34 | "President Trump and the First Lady Greet the President of China and Madame Peng" | `aHOaCVQoQuY` |
    | 2026-09-30 16:36:07 | "Vice President JD Vance Delivers Remarks in Brownsville, TX" | `LLh9sKf0L-w` |

    9 other snapshots in the same window were `on:false`.
- Extraction: find `data-live-duplex="` (at byte offset about 204,000 of 270 KB, i.e. 76% into the page), HTML-unescape, then JSON-parse. Collect `youtube.com/embed/([A-Za-z0-9_-]{11})` IDs and drop `A4gNgHfZ-v4` (the 24/7 loop). The remaining ID is the live stream.
- Not verified: how quickly the flag flips relative to the stream start (no event fell inside the session's poll window), and whether it covers **every** WH stream. The VP was covered, so it is not POTUS-only. The page's JS (`/wp-content/client-mu-plugins/live/blocks/live-duplex/view.js`) only reads `dataset.liveDuplex`. There is no XHR endpoint, so the HTML is the API.
- Etiquette: 1 req/60 s is about 59 MB/day gzipped. The edge already caches for 60 s, so polling faster gains nothing.

### 2.3 Other WH items

- **Nominations & withdrawals (F9/F11):** posted as Presidential Actions → "Nominations Sent to the Senate" / "Withdrawals Sent to the Senate" (e.g. 2026-09-28T19:59Z). Confirmations themselves come from Congress (see the congress reports).
- **Bill signings (F11):** "Congressional Bill(s) … Signed into Law" items in Briefings & Statements (e.g. 2026-09-25 "H.R. 3657, H.R. 7250, S. 550, S. 603, S. 759 and S. 790 Signed into Law").
- **Email/SMS:** a Mailchimp "Live Alerts" list (`MMERGE11=Live Alerts`) and "Text WIN to 45470". These are not machine-friendly and are out of scope.

---

## 3. Federal Register API v1 (F9, F10)

Base: `https://www.federalregister.gov/api/v1/`. **No key, no auth.** Responses were 0.13–0.46 s. No rate-limit headers were returned on any call (no `X-RateLimit-*`, no `Retry-After`). [verifier 2026-10-02: confirmed, with two additions. (1) Every API response carries **`access-control-allow-origin: *`**, so a static GitHub Pages front end could call the FR API directly from the browser. (2) Responses come from a **shared cache despite `no-store`**: `current.json` showed `Age` 3855–6244 s (17:19–17:59Z) and identical `x-request-id` across requests, while `?_=<epoch>` gave `Age: 0`. The cache refreshed at the 14:00 ET boundary (`Age: 11` at 18:00:20Z). Also note that curl needs `-g` (globoff) for the `conditions[...]`/`fields[]` URLs; without it curl exits with code 3.]
- The documented limit page is **behind the bot wall** (302 to `https://unblock.federalregister.gov/`, which says "Due to aggressive automated scraping … programmatic access to these sites is limited to access to our extensive developer APIs"). So the official rate limit is **UNVERIFIED**. Third-party summaries say "no documented rate limit".
- Etiquette: at most 1 req/s, and only poll at the known slots.

| Endpoint | Use | Caching | Sample / evidence (LIVE) |
|---|---|---|---|
| `public-inspection-documents/current.json` | Everything on PI now (all documents for the current PI issue) | `Cache-Control: no-store, no-cache, must-revalidate, private`; **no ETag**; ~170 KB | `{"count":107,"special_filings_updated_at":"2026-10-02T11:15:00.000-04:00","regular_filings_updated_at":"2026-10-02T08:45:00.000-04:00","results":[...]}`. Types: Notice 81, Proposed Rule 17, Rule 8, Presidential Document 1. filing_type: regular 101, special 6. |
| `public-inspection-documents.json?conditions[available_on]=YYYY-MM-DD` | PI history by day (used for the slot analysis) | same | 2026-10-01: count 99 |
| `public-inspection-documents.rss` | PI as RSS; `pubDate` = filing time; `dc:creator` = agency | no ETag | 107 items, channel `pubDate Fri, 02 Oct 2026 15:15:00 GMT`; first item "Lebanon; Presidential Determination on Revocation of Prior Presidential Determinations (Presidential Determination No. 2026-25 of September 30, 2026)", description `FR DOC #: 2026-20439; Publication Date: 2026-10-05; 64 KB; 1 page` |
| `documents.json?conditions[presidential_document_type]=executive_order&order=newest&fields[]=…` | Published EOs with number | `no-store` | `{"executive_order_number":"14434","title":"Inaugurating the Era of Super Intelligence","signing_date":"2026-09-29","publication_date":"2026-10-02","document_number":"2026-20321","citation":"91 FR 63129","public_inspection_pdf_url":"https://public-inspection.federalregister.gov/2026-20321.pdf?1790867710"}`. The `?1790867710` cache-buster is the PI posting time as epoch seconds: 2026-10-01T15:15:10Z = 11:15 ET. |
| `documents.json?conditions[type][]=PRESDOCU&fields[]=subtype…` | All presidential documents. **Note:** the field is `subtype`. Using `presidential_document_type` as a *field* returns `400 {"message":"field 'presidential_document_type' not valid"}`. It works only as a *condition*. | `no-store` | Since 2026-09-01: 31 documents. Executive Order 13, Proclamation 11, Notice 4, Determination 2, Memorandum 1. Signing → FR publication: min 2, **median 5**, max 7 days. |
| `documents.rss?conditions[...]` | Any search as RSS | — | `documents.rss?conditions[presidential_document_type]=executive_order` → HTTP 200 RSS, channel title "Federal Register Documents published on or after 09/02/2026 and of presidential document type Executive Order" |
| `documents.json?per_page=2000` | Backfill | — | **per_page=2000 accepted** (returned 2000 of 2426). Pagination via `next_page_url` with `search_after_cursor`. |
| `agencies.json`, `suggested_searches.json` | Agency registry (for facets, slugs, parent_id) | `ETag` on agencies [verifier 2026-10-02: corrected — `agencies.json` returned **no ETag/Last-Modified** at 17:38Z; headers were `Cache-Control: no-store, no-cache, must-revalidate, private` with `Age: 8577`. Cache it yourself.] | 695 KB, HTTP 200 |
| www.federalregister.gov **HTML** pages, including `/documents/search.rss` and reader-aids | — | — | **302 → unblock.federalregister.gov (CAPTCHA)** for curl and for the WebFetch tool. Use the API equivalents only. Human-facing `html_url` links still work in a browser. |

**PI document fields** (LIVE, sorted): `agencies, agency_letters, agency_names, docket_numbers, document_number, editorial_note, excerpts, filed_at, filing_type, html_url, json_url, last_public_inspection_issue, num_pages, page_views, pdf_file_name, pdf_file_size, pdf_updated_at, pdf_url, publication_date, raw_text_url, subject_1, subject_2, subject_3, title, toc_doc, toc_subject, type`.

Traps:
- `filed_at` and `publication_date` can be **null**. Example: an SEC "Sunshine Act" notice was withdrawn after posting; its `editorial_note` reads "An agency letter requesting withdrawal of this document was received after placement on public inspection…". Handle null, and show the editorial note.
- `raw_text_url` (e.g. `https://www.federalregister.gov/public-inspection/raw_text/202/620/295.txt`) is on the www host. Whether the bot wall blocks it is UNVERIFIED (not tested). [verifier 2026-10-02: resolved — `https://www.federalregister.gov/public-inspection/raw_text/202/620/439.txt` (Lebanon PD) returned **HTTP 200 `text/plain`, 1,172 B** with the full determination text ("Presidential Determination No. 2026-25 … MEMORANDUM FOR THE SECRETARY OF TRANSPORTATION …"), and `https://public-inspection.federalregister.gov/2026-20439.pdf` returned 200 `application/pdf`. Neither is bot-walled. The **full text of a presidential document is therefore machine-readable at its PI slot**, days before FR publication. The HTML `html_url` (`/public-inspection/2026-20295/…`) does 302 to `unblock.federalregister.gov`, as stated.]

**Filing-slot table (LIVE, `available_on` 2026-09-21 → 2026-10-02, 10 business days, counts per slot):**

| Day | 08:45 regular | 08:45 special | 11:15 | 14:00 | 16:15 | 18:00 |
|---|---|---|---|---|---|---|
| 09-21 | 97 | – | 4 | – | 3 | 1 |
| 09-22 | 94 | 1 | 2 | – | 2 | 1 |
| 09-23 | 104 | 1 | – | – | 3 | 1 |
| 09-24 | 101 | – | 1 | – | 3 | – |
| 09-25 | 100 | – | 3 | – | 3 | – |
| 09-28 | 111 | – | 3 | – | 3 | – |
| 09-29 | 126 | – | 2 | – | 3 | – |
| 09-30 | 106 | 3 | – | – | 7 | – |
| 10-01 | 85 | – | 5 | 1 | 7 | – |
| 10-02 | 101 | – | 1 | 1 | 3 | – |

[verifier 2026-10-02: corrected — the table above is **per PI issue (`available_on`), not per filing day**, and it keys on time of day only. Each issue also lists special filings carried over from the previous business day, so the 16:15/18:00/11:15 columns double-count, and the "10-02" row's 14:00 = 1 and 16:15 = 3 are **10-01 filings**. Those slots had not happened yet on 10-02 when the report was written (13:15 ET). Re-derived from the same API, de-duplicated by `document_number` and bucketed by the date in `filed_at` (1,068 distinct documents; 1 withdrawn document with `filed_at: null`):

| Filed on | 08:45 regular | 08:45 special | 11:15 | 14:00 | 16:15 | 18:00 |
|---|---|---|---|---|---|---|
| 09-18 (Fri) | – | – | 2 | – | 1 | – |
| 09-21 | 97 | – | 2 | – | 2 | 1 |
| 09-22 | 94 | 1 | 2 | – | – | – |
| 09-23 | 104 | – | – | – | 3 | – |
| 09-24 | 101 | – | 1 | – | – | – |
| 09-25 | 100 | – | 2 | – | 3 | – |
| 09-28 | 111 | – | 1 | – | – | – |
| 09-29 | 126 | – | 1 | – | 3 | – |
| 09-30 | 106 | 3 | – | – | 4 | – |
| 10-01 | 85 | – | 5 | 1 | 3 | – |
| 10-02 (to 13:45 ET) | 101 | – | 1 | – | – | – |

Operational point: a document filed at 16:15 on day D shows up in `current.json` on day D (the 10-01 issue lists the 10-01 16:15 filings) **and** again in D+1's issue. Dedupe on `document_number`, not on per-issue counts.]

**Every presidential document in that window (11 of 11) was a special filing at 11:15 ET.** [verifier 2026-10-02: CONFIRMED — 11 distinct presidential documents, all `filing_type: special`, all `filed_at` T11:15 (09-21 ×2, 09-22 ×2, 09-29 ×1, 10-01 ×5, 10-02 ×1). Note that 09-29 (Gold Star proclamation) is a fifth example the report did not list.] Examples: EO 14429/14430 on 09-21; H-1B EO and the Restriction on Entry proclamation on 09-22; EO 14432–14434, the FY2027 refugee PD and the Syria notice on 10-01; the Lebanon PD on 10-02.

**Polling recipe:** poll `current.json` every 2 min from 08:40–09:00, 11:10–11:30, 13:55–14:10, 16:10–16:30 and 17:55–18:15 ET on business days, plus every 15 min otherwise. Diff on `document_number`. That is about 60 calls/day, 170 KB each. [verifier 2026-10-02: add a cache-busting query parameter to every call (`current.json?_=<epoch>`). Without it the response can be over an hour old between slots (`Age` up to 6244 s observed, though the cache refreshed on the 14:00 ET boundary); see "Verifier additions" §1.]

---

## 4. Official presidential record: GovInfo Daily Compilation of Presidential Documents (DCPD)

| Endpoint | Auth | Evidence (LIVE) |
|---|---|---|
| `https://www.govinfo.gov/rss/dcpd.xml` | none | HTTP 200 `text/xml`, 100 items, `Last-Modified: Thu, 01 Oct 2026 21:27:00 GMT`. Items such as "DCPD-202600476 - Proclamation 11048—Imposing Additional Duties To Offset Canadian Discrimi…" |
| `https://api.govinfo.gov/collections/CPD/{since}?pageSize=…&offsetMark=*&api_key=…` | api.data.gov key | HTTP 200, count 49 since 2026-09-15. **Response header `X-Ratelimit-Limit: 10` on DEMO_KEY** (docs say DEMO_KEY = 30/hour/IP and 50/day/IP; a personal key gets 1,000/hour, per api.data.gov developer manual, DOC). [verifier 2026-10-02: confirmed. The api.data.gov manual (fetched 17:2xZ) reads "Hourly Limit: 30 requests per IP address per hour / Daily Limit: 50 requests per IP address per day" for DEMO_KEY and "Hourly Limit: 1,000 requests per hour" by default, adding "Rate limits may vary by service". The verifier's own GovInfo call returned **HTTP 429** with `X-Ratelimit-Limit: 10`, `X-Ratelimit-Remaining: 0`, so GovInfo applies a lower DEMO_KEY ceiling than the manual's default. Sibling probes from the same IP had already exhausted it, so the build needs a real key from day one.] |

Latency: `DCPD-202600566` "Executive Order 14423-Establishing the United States Space Academy" has dateIssued 2026-08-28 and lastModified 2026-10-01T21:25:55Z. **That is about 34 days behind.** Use it as the archival, citable text of remarks, gaggles and EOs. It is not a live source. (`https://www.govinfo.gov/rss/cpd.xml` is **404**; the feed is `dcpd.xml`.)

---

## 5. The President's (and others') public schedule (F7)

The White House publishes **no** public schedule on whitehouse.gov (checked the nav, sitemap and feeds). The press office emails "Daily Guidance and Press Schedule" to the WHCA pool list. Those emails surface in two places:

### 5.1 Roll Call Factba.se (FiscalNote) — machine-readable calendar

| Endpoint | Size | Caching | Notes (LIVE) |
|---|---|---|---|
| `https://media-cdn.factba.se/rss/json/trump/calendar.json` | 268 KB | S3 + CloudFront, `ETag`, `Last-Modified`, **304 works** | Recent window. Regenerated on a ~2-min cycle: `Last-Modified` 16:05:01Z, 16:13:03Z, 16:17:00Z, 16:19:02Z … 17:09:04Z. The content (ETag) changes far less often (§10). [verifier 2026-10-02: partly confirmed. At 17:25Z the plain URL returned `Last-Modified: 16:27:05Z` with `X-Cache: RefreshHit/Hit from cloudfront`: when the ETag is unchanged, CloudFront keeps serving the last-content-change `Last-Modified`. A cache-busted request (`?x=<rand>`, `X-Cache: Miss`) showed the origin `Last-Modified: 17:24:59Z` with the **same ETag**. So the origin is regenerated every few minutes, and whether you see the regeneration time depends on the cache path. The conclusion stands: key on ETag. 677 rows, 2026-08-18 → 2026-10-03, 269,050 B uncompressed / ~17.5 KB gzip.] |
| `https://media-cdn.factba.se/rss/json/trump/calendar-full.json` | 2.68 MB, 6,368 rows, 2025-01-18 → 2026-10-03 | `Cache-Control: max-age=60`, ETag, `Last-Modified: Fri, 02 Oct 2026 07:08:50 GMT` | Full history |
| `https://media-cdn.factba.se/rss/csv/trump/calendar.csv` | 112 KB | ETag, `Last-Modified 14:12:59Z` | CSV columns: `Date,Time,"Day of Week",Category,Details,Location,"Press Pool","Daily Summary","Factba.se URL"` |
| `…/rss/ical/trump/calendar.ics`, `…/rss/json/trump/transcripts.json`, `…/rss/json/vance/*` | — | **403 AccessDenied** | No VP calendar and no transcript JSON |
| `https://media-cdn.factba.se/rss/latest.rss` | 50 KB | `Last-Modified 2022-03-24` | **Dead** since 2022 |
| `https://rollcall.com/factbase/trump/transcripts/feed/` | — | — | WordPress stub with 1 placeholder item. Not a transcript feed. |

Row schema (calendar-full): `coverage, daily_text, date, day, day_of_week, day_summary, daycount, details, lastdaily, location, month, newmonth, time, time_formatted, type, url, video_url, year`. Types: `President Schedule` 3,127; `Pool Report Schedule` 3,168; `Briefing Schedule` 70 (+3 with a trailing colon). [verifier 2026-10-02: confirmed at 17:24Z (6,369 rows; Pool Report Schedule now 3,169). Trap: **`calendar.json` and `calendar-full.json` can disagree on the same row.** The 10-01 16:05 Peterbilt row has `video_url: "https://vimeo.com/1232238299"` in calendar-full (LM 16:26:56Z) but `video_url: null` in calendar.json (LM 16:27:05Z). The sample row below is the calendar-full version. Merge the two files field by field rather than trusting either one.]

Real rows (LIVE):
```json
{"date":"2026-10-02","time":"19:00:00","type":"President Schedule","details":"The President delivers Remarks [6:00 PM Local]","location":"Mitchell Center, Mobile, AL","coverage":"Pre-Credentialed Media","url":null,"video_url":null}
{"date":"2026-10-01","time":"16:05:00","type":"President Schedule","details":"The President participates in a Site Visit [3:05 PM Local]","location":"Peterbilt Motors, Denton, Texas","coverage":"Pre-Credentialed Media","url":"https://rollcall.com/factbase/trump/transcript/donald-trump-speech-peterbilt-plant-site-visit-denton-texas-october-1-2026/","video_url":"https://vimeo.com/1232238299"}
{"date":"2026-09-15","time":"14:00:00","type":"Briefing Schedule","details":"Press Briefing by the Attorney General of the United States, Todd Blanche","location":"Rose Garden","url":"https://rollcall.com/factbase/trump/transcript/donald-trump-press-conference-briefing-todd-blanche-september-15-2026/","video_url":"https://vimeo.com/1227085550"}
```
Semantics:
- `time` is ET; local time appears in brackets inside `details`.
- `time: null` rows are "TBD" travel legs.
- Since 2026-09-01: 507 rows, 73 with a transcript `url` and 72 with a `video_url`.
- Pool-report rows (exact arrival and departure times) are added after the fact.

Traps: the 10/01 row "The President participates in a Policy Meeting" carries `coverage: "Out-of-Town Travel Pool"`. Coverage strings are free text and can be wrong.

Licensing: **UNVERIFIED.** No ToS page was found (the sibling report reached the same result). A 2017 Roll Call post said Factba.se offered public APIs on condition the work product is shared publicly. rollcall.com robots.txt blocks `anthropic-ai`, `GPTBot`, `PerplexityBot` and `cohere-ai`, which bears on any LLM summarization of their transcripts. Recommendation: ingest schedule rows (facts) and link out to transcripts. Ask Roll Call before republishing transcript text (§14 Q2).

### 5.2 BNO News — White House Press Pool (`https://bnonews.com/whpool/`)

- About page (LIVE): "BNO News monitors the pool report inbox around the clock. The moment a new report arrives, it is automatically published here — unedited, unfiltered, and in full … often within seconds of it being sent."
- Pages: `/whpool/` (latest, paginated `?page=2`), `/whpool/schedule` (calendar of the daily guidance; today's page already listed **Sun Oct 4** and **Sat Oct 3**), `/whpool/archive`, `/whpool/<8-char id>` per report. The index showed "1,722 reports archived" and "Last update 19m ago".
- Real content seen: "In-Town Pool Note #2 - lunch lid · Oct 2, 2026, 12:07 PM EDT"; "In-Town Pool Report #5: Marine One Arrival … Marine One arrived at the White House at 2:54 am."
- Format: **server-rendered HTML only**. `/whpool/feed`, `/whpool/rss` and `/whpool/feed.xml` all 404. No JSON endpoint was visible in the page source. Cloudflare, `Cache-Control: no-store`. `bnonews.com/robots.txt` allows everything (Yoast block, `Disallow:` empty). It offers web-push subscriptions.
- [verifier 2026-10-02: confirmed at 17:3xZ. `/whpool/`, `/whpool/schedule` and `/whpool/archive` returned 200 (Cloudflare, `no-store`). `/whpool/feed`, `/rss` and `feed.xml` returned 404. robots.txt has `Disallow:` empty. The about-page quote matches verbatim. Addition: the inbox also carries **WH Office of Communications press-release emails**, not just pool reports (e.g. "New Report: DSA Policies Would Cost Americans Trillions", 08:57 AM EDT), so BNO can also act as a timestamp oracle for WH releases. The index now read "Last update 1h ago" (same 12:07 PM note, so no new report in the meantime).]
- This is the **fastest public text signal** for presidential movements, "lids", pool sprays and who is speaking. It is HTML scraping of a third party, so ask BNO for a feed or permission (§14 Q2). Freshness was not measured beyond "Last update 19m ago" at about 16:26Z, matching the 12:07 PM EDT note.

### 5.3 Vice President

There is no machine-readable VP schedule (Factba.se `vance/*` returns 403). VP events show up on `whitehouse.gov/live/` (verified 2026-09-30) and in the WH `/videos/feed/`. **Gap.**

### 5.4 Cabinet schedules found

| Agency | Schedule source | Evidence (LIVE) |
|---|---|---|
| **State** | `https://www.state.gov/rss-feed/public-schedule/feed/` (browser-like UA required) | 10 items; newest "Public Schedule – October 2, 2026", pubDate 2026-10-02T00:19:51Z (published the evening before). Body lists the Secretary, Deputy and Under Secretaries with times, "(CLOSED PRESS COVERAGE)" tags, and a **"BRIEFING SCHEDULE"** block ("No Department Press Briefing."). Trap: the item titled "October 2" had body text "October 1, 2026". |
| **War (DoD)** | GovDelivery `https://public.govdelivery.com/accounts/USDOD/feed.rss` → **"Today in DOW: Oct. 2/3/4, 2026"** bulletins; War advisories RSS `ContentType=2` (e.g. "Secretary of War Pete Hegseth Travels to Texas") | Today in DOW items posted 2026-10-02 10:29–10:30 CDT |
| **Federal Reserve** | `https://www.federalreserve.gov/json/calendar.json` (544 KB, ETag/LM, UTF-8 **BOM**) | 2,597 events; types Stat, Speeches, FOMC, Testimony, Beige, … Rows have a `live` link, e.g. `{"title":"Speech - Governor Christopher J. Waller","time":"10:00 a.m.","month":"2026-10","days":"1","live":"https://www.youtube.com/live/1fK5omRbOvM?..."}` and the "FOMC Press Conference" 2026-10-28 2:30 p.m. with `link: https://www.federalreserve.gov/live-broadcast.htm`. **The only agency calendar that gives the live video link ahead of time.** [verifier 2026-10-02: confirmed. 543,813 B, UTF-8 BOM, top-level `{"events":[…],"announcement":…}`, 2,597 events, the Waller row and the FOMC Press Conference row match verbatim. Caveat: `live` is not always YouTube. Of the 4 October rows with a `live` link, the others point to `darden-virginia.zoom.us/j/…`, `communitybanking.org` and `youtube.com/watch?v=UosIN7C-ZCE`, so `videos.list` covers only some of them.] |
| Treasury, DOJ, DHS, HHS, Commerce, SEC | None found machine-readable. Treasury "READOUT" items arrive via GovDelivery after the fact. | — |

---

## 6. YouTube: channel IDs, RSS behaviour, Data API quota (F3, F4)

### 6.1 Channel IDs (resolved via each channel's `<link rel="canonical">`, LIVE)

| Channel | Channel ID | How confirmed |
|---|---|---|
| The White House (`@WhiteHouse`) | `UCYxRlFDqcWM4y7FfpiAN3KQ` | Linked from whitehouse.gov; RSS title "The White House" |
| U.S. Department of State (`youtube.com/statedept`) | `UC6ZhpmNnLxlOYipqh8wbM3A` | Linked from state.gov; 3.33M subscribers |
| Department of War (`@DeptofWar`) | `UCpuofAxlrUAgnu7QEwKQwxw` | Title "Department of War"; uploads "STATE OF THE FORCE ADDRESS". Only 8.62K subscribers, so whether this is the primary DoD channel is UNVERIFIED (war.gov homepage 403'd, so I could not read its link). |
| The Justice Department (`youtube.com/TheJusticeDepartment`) | `UCJJGP5tnAqV5iaxpXj_J2Qw` | Linked from justice.gov. **Not** `@TheJusticeDept`, which is a look-alike titled "U.S. Department of Justice - POTUS". |
| U.S. Department of Homeland Security (`user/ushomelandsecurity`) | `UCpkaznWj_9PIVgO0BRKXu8w` | Referenced in dhs.gov page JS |
| U.S. Department of Health and Human Services (`@HHS`) | `UC1ZRVOl5MFHIXU4zZr-Oglg` | Title match, 157K subscribers. hhs.gov was 403, so the link was not confirmed. |
| Federal Reserve (`youtube.com/federalreserve`) | `UCAzhpt9DmG6PnHXjmJTvRGQ` | Linked from federalreserve.gov |
| U.S. Securities and Exchange Commission (`user/SECViews`) | `UCptda15--amT6JyBiJnWmNA` | Linked from sec.gov |
| Treasury, Commerce | not found (`@USTreasury`, `@ustreasury`, `@USTreasuryDept`, `@CommerceGov` all 404; `@uscommerce` is an unrelated empty channel) | — |
| Beware: `@TrumpTV` (`UCHjMcohNRWFxsG-IYisfJkw`) | unofficial 2019 fan channel | Newest upload 2019. The WH "Trump TV" panel is the embed `A4gNgHfZ-v4`, not this channel. |

### 6.2 Channel RSS: `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>`

- Free with no key. 15 most recent entries. `Cache-Control: public, max-age=900`. No ETag or Last-Modified (24 of 24 poller requests returned full 200s, §10). About 17–40 KB.
- **Live streams on executive channels appear only after they end** (LIVE). Data from the watch page's `liveBroadcastDetails` vs the RSS `published` time:

| Channel | Video | Stream start → end (Z) | RSS `published` (Z) |
|---|---|---|---|
| WH | `5fRpXOyalfc` Site Visit 10/1 | 21:35:27 → 22:41:27 | 22:44:35 |
| WH | `64w2lEYtw8E` Announcement w/ Sec. Commerce | 9/30 20:21:24 → 21:24:10 | 21:28:24 |
| WH | `VMWEHk4qH6I` Hispanic Heritage Month | 9/30 16:49:20 → 18:38:19 | 18:44:08 |
| WH | `LLh9sKf0L-w` VP Brownsville | 9/30 16:18:02 → 16:52:48 | 16:55:27 |
| WH | `qyJL5gKhajE` America.gov | 9/29 13:24:57 → 22:03:02 | 22:28:20 |
| WH | `wFXnUw93jsA` VP fireside chat | 9/29 19:54:16 → 21:29:29 | 21:34:10 |
| State | `dxLx1e_mcwk` Rubio remarks NY | 9/23 13:59:10 → 15:42:30 | 16:10:35 |
| State | `Z4jHwHPjAlo` POTUS at UNGA | 9/22 13:42:21 → 15:24:39 | 15:44:51 |
| War | `ZQPnYP-eq1I` State of the Force | 9/30 18:36:59 → 19:53:34 | 20:03:34 |
| War | 6 more (`UFnCNo466j4`, `xHawSovQZcQ`, `42hr0nruVIs`, `xwOMI9hXDgo`, `oIT28ljqbds`, `Xv2GOxHQ5_Y`) | all ended before publication | ~12 h after end (e.g. 9/22 14:29:41 → 9/23 02:33:20) |
| State | `5iA9AUYCwhQ` Rubio, Shield of the Americas | 9/22 17:30:54 → 19:21:37 | 19:49:33 |
| Fed | `mZviR299jgs` G20, `NYbL7pHBTK8` | ended 16:04:28 / 21:28:08 | 17:01:26 / 21:39:51 |

  Two non-government live streams showed the same after-the-end pattern: `1fK5omRbOvM` (St. Louis Fed FRED Con) and `UosIN7C-ZCE` (Atlantic Council). The C-SPAN channel, by contrast, listed a *scheduled* stream in RSS (published 10/01 21:57:55Z) before it aired. So the behaviour probably depends on how the publisher sets up the stream: a pre-scheduled public broadcast, versus "go live now" or unlisted-then-published. **Cause UNVERIFIED.** The practical point stands: the exec channels sampled do not show up in RSS while live.
- **Use RSS for "replay posted"** and for non-live clips (gaggle clips such as `ykv4al8IpGk` are uploads, `isLiveContent:false`).

### 6.3 YouTube Data API v3 quota math (DOC, quota page "Last updated 2026-09-15 UTC")

Quoted: "Projects that enable the YouTube Data API have a default quota allocation of **100 search.list calls, 100 videos.insert calls, and 10,000 units per day combined for all other endpoints**." Also: "The search.list and videos.insert methods have their own quota buckets. Each of these methods has a default daily limit of 100 per day." The table on the same page still lists `search list 100`. Under either reading you get **at most 100 searches/day per project**. Daily quotas reset at midnight PT.

| Approach | Cost | Feasibility |
|---|---|---|
| `search.list?channelId=X&eventType=live&type=video` every minute for 1 channel | 1,440 searches/day | **Impossible** (cap 100/day) |
| Same, every 15 min, 1 channel | 96/day | Uses the whole bucket for one channel. Useless for multi-channel. |
| Targeted search only around **scheduled** events (from Factba.se / State / Fed / Today in DOW) | ~3 calls per event | Fits 100/day for ~30 events. OK as a fallback for agency channels with no `/live/` flag. |
| **`videos.list?part=liveStreamingDetails,snippet&id=<comma-separated ids>`** | 1 unit per call (DOC). The max IDs per call is not stated on the method page; 50 is commonly cited (UNVERIFIED). [verifier 2026-10-02: the method page (fetched today) confirms "Quota impact: A call to this method has a quota cost of 1 unit". It says only that `maxResults` (1–50) "is not supported for use in conjunction with the id parameter". The ID cap is still UNVERIFIED: the doc is silent and no key was available to test it.] | **Recommended.** Feed it the ID from whitehouse.gov `/live/` or a Fed `calendar.json` `live` link. It returns `liveStreamingDetails.{actualStartTime, actualEndTime, scheduledStartTime, scheduledEndTime, concurrentViewers, activeLiveChatId}` and `snippet.liveBroadcastContent` ∈ {`live`, `none`, `upcoming`} (DOC). Polling every 30 s for a 2 h event costs 240 units. |
| `playlistItems.list` on the uploads playlist (`UU…`) | 1 unit | Public uploads only. On these channels, live streams appear only after they end, the same as RSS. No gain over free RSS. |
| Channel RSS | 0 | Replay/upload detection only (§6.2) |
| `https://www.youtube.com/channel/<ID>/live` HTML (canonical turns into `watch?v=` when live) | 0 | Technically works (seen today for C-SPAN, Sky News and NASA). It is **HTML scraping of YouTube**, which the YouTube ToS forbids for automated access. **Do not use.** |

Captions: the API's `captions.download` requires the video owner's authorization, so it cannot be used on government channels (DOC knowledge, not re-verified today). [verifier 2026-10-02: confirmed on the `captions/download` doc page today: the request "requires the user to have permission to edit the video" and OAuth scope `youtube.force-ssl` or `youtubepartner`, and it returns 403 `forbidden` otherwise. YouTube ToS (fetched today) forbids "access the Service using any automated means (such as robots, botnets or scrapers) except (a) … public search engines … or (b) with YouTube's prior written permission", and forbids downloading Content except "as expressly authorized by the Service".] A live transcript therefore needs our own speech-to-text on the audio (architecture report), and pulling the audio has ToS implications (§9).

Key handling: the API key must live server-side (Worker secret / Actions secret), never in the Pages bundle.

---

## 7. Cabinet departments and major agencies (F3, F4, F11)

Default UA unless stated. "WAF" = the request was blocked by a web-application firewall.

| Agency | Working feed(s) (URL) | Format / caching | Newest item seen (freshness) | Blocked / dead | Evidence |
|---|---|---|---|---|---|
| **State** | `https://www.state.gov/rss-feed/collected-department-releases/feed/`, `/press-releases/feed/`, `/secretarys-remarks/feed/`, `/public-schedule/feed/`, `/department-press-briefings/feed/`, plus regional, `treaties-new`, `diplomatic-security`, `direct-line-to-american-business` (15 feeds, listed at `https://www.state.gov/rss-feeds/`) | RSS, 10 items each, `Last-Modified`, `cache-control: max-age=600, stale-while-revalidate=420`, no ETag. **Needs a browser-like UA.** | "Secretary Rubio's Call with Jordanian King Abdullah II" 2026-10-02T15:13:18Z; LM 15:49:57Z | Default UA → **403** (AmazonS3/CloudFront WAF) on every feed. `department-press-briefings` newest item is 2025-11-10 and it holds non-briefing items, so it is effectively dormant. | feedprobe 15:5xZ |
| **War (DoD)** | `https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?Site=945&max=N&ContentType=` **1** News, **2** Advisories, **3** Biographies, **5** Publications, **9** Releases, **11** Speeches, **13** Transcripts, **400** Contracts (6, 7, 8, 10, 12 return empty) | RSS; `Cache-Control: private`; no ETag/LM | Releases: "Department of War Accelerates Counter-UAS Employment…" 2026-10-02T14:30:06Z. Contracts: "Contracts for Oct. 1, 2026" 21:00:44Z. Transcripts newest 2026-09-15. | `https://www.war.gov/` and `/News/RSS/` → **403 Akamai** (even with a browser UA), but `RSS.ashx` → 200. Trap: Speeches `pubDate` 2026-09-30 16:46 GMT predates the 18:37Z delivery of the speech. War pubDates are editorial dates, not post times. | feedprobe + curl loop |
| **War (daily schedule)** | `https://public.govdelivery.com/accounts/USDOD/feed.rss` | RSS, weak ETag, `no-cache` | "Today in DOW: Oct. 4, 2026" 2026-10-02 10:30 CDT; release mirrors | — | curl |
| **Treasury** | `https://public.govdelivery.com/accounts/USTREAS/feed.rss` | RSS, weak ETag, 25 items | "Treasury Dismantles Major Hamas Financing Network" 2026-10-02T15:44:34Z; "READOUT: Secretary … Bessent's Meeting with Iraq Minister…" | `home.treasury.gov/news/press-releases/feed` → timeout, then 404. Press-release HTML is 200 with ETag/LM if scraping is ever needed. | feedprobe |
| **Justice** | `https://www.justice.gov/news/rss?type=press_release&m=1`; `…?type=speech&m=1` | RSS, 25 items, `ETag` + LM, **`max-age=258452` (~3 days)**. Send `Cache-Control: no-cache` / conditional GET so you are not fed stale caches. | "Coordinated Arrests and Charges Dismantle Hamas Terror Finance Network…" pubDate 2026-10-02T12:00Z (25 of 25 pubDates are exactly `12:00:00 +0000`, so time-of-day is unusable; use first-seen time); LM 15:56:07Z | `/feeds/opa/justice-news.xml` → 404 | feedprobe |
| **Homeland Security** | GovDelivery `https://public.govdelivery.com/accounts/USDHS/feed.rss` (**S&T directorate only**). YouTube `UCpkaznWj_9PIVgO0BRKXu8w`. | RSS | 2026-10-01 S&T feature | `dhs.gov/news-releases/rss.xml`, `dhs.gov/rss.xml` → **403 Akamai** even with a browser UA. **Gap** for DHS press releases. [verifier 2026-10-02: corrected — both URLs return **HTTP 404** (Apache "not found" page, 96 KB) to both UAs: the feeds do not exist, and nothing blocked the request. `https://www.dhs.gov/news-releases/press-releases` (301 target of `/news-releases`) returned **200** to the custom UA, with server-rendered items and `datetime` dates, e.g. "Secretary Mullin and Attorney General Blanche Hold Press Conference on Recent Vo…" (`/news/2026/10/01/…`). robots.txt allows it (Disallow only `/core/`, `/search/`, `/archive/`, …). DHS press releases are an **HTML-scrape source, not a gap**. Headers are `Cache-Control: private, no-cache`, with no ETag on the listing. The GovDelivery USDHS feed is confirmed S&T-only (newest "Feature Article: Testing C-UAS…" 10-01).] | feedprobe |
| **HHS** | YouTube `UC1ZRVOl5MFHIXU4zZr-Oglg` only | — | — | `hhs.gov/rss/news.xml` → **403** (both UAs); GovDelivery `USHHS` 404 | feedprobe |
| **Commerce** | none fresh. GovDelivery `USDOC` newest is **2026-03-19** (stale). | — | — | `commerce.gov/feeds/news` → **403 Cloudflare** (both UAs) | feedprobe |
| **Federal Reserve** | `https://www.federalreserve.gov/feeds/press_all.xml`, `speeches.xml`, `press_monetary.xml` (FOMC statements), `testimony.xml`; index at `/feeds/feeds.htm`; **`/json/calendar.json`** (§5.4) | RSS with `ETag` + LM; pubDates are the real release times (e.g. 15:00:00Z) | press_all "…enforcement action with Ontario Bancorporation" 2026-10-02T15:00Z (LM 15:00:11Z, i.e. **11 s after release**); speeches "Bowman, Modernizing Financial Regulation…" 2026-10-01T19:00Z; FOMC statement 2026-09-16T18:00Z | — | feedprobe |
| **SEC** | `https://www.sec.gov/news/pressreleases.rss`, `speeches-statements.rss` | RSS, ETag + LM, `max-age` 26–52 s | "Statement on Departure of Commissioner Hester Peirce" 2026-10-01T20:30:37Z | `upcoming-events.rss` → 404. The SEC requires a declared UA with contact (our UA passed). SEC's 10 req/s fair-access limit is from prior knowledge; UNVERIFIED today. [verifier 2026-10-02: now CONFIRMED (DOC). `sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data` reads "Fair access Current max request rate: 10 requests/second", and `sec.gov/about/developer-resources` reads "no more than 10 requests per second, regardless of the number of machines". Feeds re-probed: 200, 25 items, ETag + LM, `max-age` 44–48 s. `upcoming-events.rss` → 404 confirmed.] | feedprobe |
| **GAO** (F11) | `https://www.gao.gov/rss/reports.xml` | RSS, ETag + LM, `max-age=3600` | LM 2026-10-02T13:09:57Z | — | feedprobe |
| **CBO** (F11) | `https://www.cbo.gov/publications/all/rss.xml` | RSS, ETag + LM, `max-age=3600` | LM 2026-10-02T15:34:00Z | — | feedprobe |

Catch-all for blocked agencies: their **rules and notices** still arrive through the FR API (`conditions[agencies][]=<slug>`, slugs from `agencies.json`) at 08:45 ET Public Inspection. Their **videos** arrive via YouTube RSS (after the fact). Their **messaging** arrives via X or Bluesky (§8).

---

## 8. Social accounts (F3, F4, F9 early signals)

| Platform | Free + ToS-compliant? | Cost / limits | Evidence |
|---|---|---|---|
| **X (Twitter) API** | Paid only for new developers | "pay-per-usage … no subscriptions". Posts read **$0.005/resource**, user data $0.010/resource, owned reads $0.001. "capped at 3 million Post reads per monthly billing cycle" (Enterprise above that). No Free/Basic/Pro tier in the docs. X Activity API webhooks are also per event (e.g. post.create $0.005). | WebFetch `docs.x.com/x-api/getting-started/pricing` 2026-10-02 (DOC); secondary sources agree that legacy Basic $200/mo and Pro $5,000/mo exist only for existing subscribers |
| — cost example | — | 25 exec accounts × ~15 posts/day ≈ 11,250 post reads/month ≈ **$56/month**, *if* each post is billed once (use `since_id`). Whether empty polls are free is UNVERIFIED. [verifier 2026-10-02: partly resolved (DOC). The pricing page says reads are "Charged per resource returned in the response" and "All resources are deduplicated within a 24-hour UTC day window … requesting the same resource again within that window will not incur an additional charge". By that wording, a poll that returns zero posts bills $0 and a re-read of the same post the same UTC day is free. Not exercised (no account). The arithmetic checks: 25 × 15 × 30 = 11,250 × $0.005 = $56.25.] | arithmetic |
| **Truth Social** (official) | No public developer API. `https://truthsocial.com/api/v1/accounts/107780257626128497/statuses` → **403 Cloudflare**. `/@realDonaldTrump.rss` returns an HTML shell. Scraping is not ToS-safe (ToS not read today; UNVERIFIED). | — | curl |
| **trumpstruth.org** (third party) | Free RSS `https://www.trumpstruth.org/feed`; robots allows all. Operator: "a project of Defending Democracy Together"; "not affiliated with TRUTH Social". No reuse terms stated. Supports `?start_date=&end_date=`. | 100 items, `Last-Modified`, **304 works**. `no-cache, private`. | Item: `pubDate Fri, 02 Oct 2026 14:01:01 +0000`, `truth:originalId 117371677010048663`. Mastodon snowflake `id>>16` = 2026-10-02T14:01:01.408Z, which **equals pubDate** (pubDate = post time, not ingest time). Ingest lag: see §10. |
| **Bluesky** (WH `whitehouse-47.bsky.social`) | Free public AppView API | — | See the curation report (verified there) |

---

## 9. Transcripts and live text (F4): options

| Option | Latency | Cost | Status |
|---|---|---|---|
| Factba.se transcripts (link from calendar `url`) | Within hours. Weak bound: the 10/01 ~23:00Z rally transcript was linked by 07:08Z the next day (≤ 8 h, from calendar-full `Last-Modified`). Tighter latency is UNVERIFIED. | free to link | LIVE (bound only) |
| GovInfo DCPD | ~34 days | free | LIVE |
| War Transcripts RSS (`ContentType=13`), DOJ speeches RSS, Fed speeches RSS, State `secretarys-remarks` | hours to days | free | LIVE |
| Own speech-to-text on the live stream (faster-whisper on the owner's GPU box, or Workers AI Whisper; see the architecture report) | ~5–30 s | GPU box free / Workers AI per minute | **ToS risk.** Fetching YouTube stream audio programmatically is the kind of automated access YouTube's terms restrict (ToS text not re-read today). Prefer a non-YouTube origin. WH streams are also posted to `rumble.com/c/whitehouse` (linked from `/live/`). That page returned HTTP 200 (112 KB HTML) with per-video `"live":false` flags, and Rumble's robots.txt has `Disallow: /api/`. C-SPAN carries most events. Whether either exposes a permissible HLS URL is UNVERIFIED. |

---

## 10. Live poll window (16:12 → 17:10 Z)

`poller.py` (scratchpad, not committed) polled, every 150 s:
- whitehouse.gov `/live/`, `/news/feed/`, `/presidential-actions/feed/`, `/videos/feed/`
- trumpstruth.org `/feed`
- WH YouTube RSS
- FR PI RSS and `current.json`
- Factba.se `calendar.json`

It used conditional GETs where supported. 24 cycles ran, 16:12:16Z → 17:10:24Z.

| Source | Responses (24 polls) | What happened |
|---|---|---|
| WH `/live/` | 24 × 200 (no conditional support) | `live.on` stayed **false** throughout. No WH event was live in this window: the pool note at 12:07 PM EDT called a lunch lid until 1 PM, and the next public event was the 6 PM CDT Mobile speech. **The flip-time lag stays UNVERIFIED.** |
| WH `/news/feed/` | 1 baseline + 1 × 200 + 22 × 304 | The one 200 (16:40:03Z) had **no new items**. That is ETag churn from the site-wide ETag. |
| WH `/presidential-actions/feed/` | 1 + 1 × 200 (16:19:51Z, no new items) + 22 × 304 | Same churn |
| WH `/videos/feed/` | 1 + 1 × 200 (16:45:07Z, no new items) + 22 × 304 | Same churn |
| trumpstruth.org `/feed` | 1 + 23 × 304 | No new posts after the 14:01:01Z post. **Ingest latency stays UNVERIFIED.** |
| WH YouTube RSS | 24 × 200 (no ETag/LM) | No new entries |
| FR PI `current.json` / `.rss` | 24 × 200 each (no ETag) | Unchanged: count 107, `special_filings_updated_at` 11:15 ET. No filing slot fell inside the window (11:15 had passed; the next is 14:00/16:15 ET). |
| Factba.se `calendar.json` | 1 baseline + 1 × 200 (16:27:27Z; `Last-Modified 16:27:05`) + 22 × 304 | `Last-Modified` advanced on **every** poll (16:05:01, 16:13:03, 16:17:00 … 17:09:04Z, about every 2–4 min). The file is regenerated on a cron, but the content changed only once in 60 min. A poller keyed on `Last-Modified` alone would re-download every time. **Key on ETag.** |

Takeaway: in a quiet hour, conditional GET cut transfer to near zero on every source that supports it. The two sources without ETag (WH `/live/` and FR PI `current.json`) are the ones to schedule carefully: `/live/` every 60 s, PI by slot.

---

## 11. Ranked recommendations (what the first build sessions should do)

1. **Executive "Live Now" detector (F3/F4):**
   - Poll `https://www.whitehouse.gov/live/` every 60 s and parse `data-live-duplex`.
   - On an on-edge, emit `live.started{name, youtube_id}` and call `videos.list` once for `actualStartTime`. On the off-edge, emit `live.ended`.
   - Record the first on-transition with timestamps to measure the flip lag. It is the one unverified number.
   - Ship this first: it is the highest-value signal and costs nothing.
2. **Presidential actions (F9):**
   - Poll `https://www.whitehouse.gov/news/feed/` every 60 s with `If-None-Match`, and dedupe on `guid` (`?p=` id).
   - Classify by `<category>`. When it is "Executive Orders", "Proclamations", "Presidential Memoranda" or "Nominations & Appointments", emit `presidential_action.posted`.
   - Later join to the FR record (EO number, FR citation) by normalized title + `signing_date`.
   - Also poll `/videos/feed/` (5 min) for "replay posted".
3. **FR Public Inspection + publication (F10, F9 completeness):**
   - Use the slot-aware `current.json` poller (§3). Emit `fr.public_inspection` for each new `document_number`, flagging `type == "Presidential Document"` as high-priority. These include notices and determinations the WH never posts. [verifier 2026-10-02: every request needs a cache-buster query (stale shared cache, `Age` > 1 h observed). Fetch `raw_text_url` for presidential documents: plain text, 200, not bot-walled, so the full EO text and number are available at the slot.]
   - On publication days, pull `documents.json?conditions[publication_date][is]=<today>` at 06:00 ET.
4. **Schedule (F7):**
   - Ingest Factba.se `calendar.json` every 5 min via ETag.
   - Render today/tomorrow with coverage badges. Use "Open Press"/"Pre-Credentialed Media" rows to **arm** the live detector.
   - Ask Roll Call about terms first (§14 Q2). Add the State public-schedule RSS, the GovDelivery "Today in DOW" and Fed `calendar.json`.
5. **Agency feeds (F3/F11):** one generic RSS poller covering the State (browser-like UA), War `RSS.ashx` (9, 2, 11, 13), DOJ, Treasury GovDelivery, Fed, SEC, GAO and CBO feeds, at 5–10 min intervals with conditional GET where offered. Store per-source "trust pubDate time-of-day?" flags (DOJ and War: no). [verifier 2026-10-02: add the WH feeds to the "no" list, since WP `datePublished` can precede go-live (§2.1 trap). Add a DHS HTML scraper for `https://www.dhs.gov/news-releases/press-releases` (200, robots-allowed). Add the OIRA `EO_RULES_UNDER_REVIEW.xml` daily pull (Verifier additions §4).]
6. **Pool reports (F4/F7):** add the BNO pool after permission, or as an owner-only experiment: HTML poll every 2 min, parse the list items (title, time, author).
7. **Social:** start with free sources (trumpstruth.org RSS, WH Bluesky). Defer X until a budget exists (~$50/mo for ~25 accounts).
8. **Transcripts:** v1 links out (Factba.se, War and DOJ transcripts, DCPD). A live STT pipeline is a later phase, after the ToS question (§14 Q4) is settled.

## 12. Gaps (no good free source today)

- **Live transcript of the President, VP or cabinet speaking.** None is free and official. The WH stopped posting transcripts. Live text needs our own STT.
- **Official President's schedule.** The only sources are non-official (Factba.se, pool emails via BNO).
- **VP schedule.** None machine-readable.
- **"Agency briefing is live now"** for State, War, Treasury, DHS and HHS. No `/live/`-style flag exists. YouTube RSS shows streams only after they end, and search.list is capped at 100/day. The best available approach is to arm on schedule entries, then spend targeted search.list calls.
- **DHS, HHS and Commerce press releases.** WAF-blocked (403) even for a browser UA, with no working GovDelivery feed. The only paths are X/Bluesky, YouTube, or the FR for formal actions. [verifier 2026-10-02: corrected — **DHS is not blocked**. `https://www.dhs.gov/news-releases/press-releases` returned 200 to the custom UA, and the DHS 403 claim came from probing non-existent RSS URLs, which return 404. The gap is HHS and Commerce only. Both were re-confirmed 403 with both UAs at 17:3xZ: hhs.gov bare 403, commerce.gov Cloudflare.]
- **EO number at WH posting time.** It is only known 1–2 business days later at Public Inspection.
- **Treasury/Commerce YouTube channel IDs.** Not resolved.

## 13. Risks

- **WAF and bot walls are spreading** (federalregister.gov HTML, war.gov, dhs.gov, hhs.gov, commerce.gov, state.gov on non-browser UAs). [verifier 2026-10-02: remove dhs.gov from this list; it served 200 to the custom UA today.] Cloud egress IPs (Cloudflare Workers, GitHub Actions) may be blocked even where a residential IP is not. **None of these endpoints was tested from a Worker or Actions IP today.** The first build session must re-probe from the production egress.
- **The `/live/` flag is an undocumented page attribute.** A WordPress theme change can silently break it. Add a canary: alert if the `data-live-duplex` attribute disappears.
- **Site-wide ETag on whitehouse.gov** causes full 600 KB downloads whenever anything on the site changes. Acceptable, but parse only the head of the feed (architecture report, 10 ms CPU budget).
- **Factba.se and BNO are third parties** with unclear or absent terms. They could change format, rate-limit, or object. The schedule is the most valuable executive F7 data and depends on them.
- **YouTube quota policy changed in 2026** (separate search bucket). It can change again; keep YouTube use to `videos.list` by ID.
- **Session observations are from one Friday with Congress in recess.** Volumes (e.g. 99–131 PI documents/day) and slot times should be re-checked over a busier week.

## 14. Questions only the owner can answer

1. **Budget:** is ~$5/mo (Workers Paid) acceptable now? Is ~$50/mo for X API reads of ~25 executive accounts worth it, or is it free sources only (WH site, Bluesky, trumpstruth.org) for now?
2. **Third-party sources:** OK to ingest Factba.se calendar JSON and BNO pool reports for a **private** dashboard while we ask them for permission? Or only link out until they answer? Does the dashboard stay private (owner-only), or will it be public? That changes the licensing exposure a lot.
3. **Truth Social:** include Trump's posts via the third-party trumpstruth.org archive? Note its operator has a political stance.
4. **Live transcription:** OK to run speech-to-text on official livestream audio on your RTX 2080 box? That means accepting YouTube-ToS ambiguity, or limiting it to C-SPAN/Rumble/other origins once checked.
5. **Scope of "administration":** which officials count for F4 alerts? POTUS, VP, Press Secretary, the 15 department heads, plus Fed Chair/FOMC? Alerting on every agency press release would be noisy.
6. **Alert threshold:** which executive events should push to your phone (e.g. "POTUS live", "new EO", "presidential doc on PI") versus only appear in the feed?

---

## Verifier additions

Adversarial verification pass, 2026-10-02 17:16–18:15 UTC, from the owner's Windows box (residential IP), using the same custom UA unless noted. Everything below was probed live today unless marked DOC.

1. **FR `current.json` is served stale from a shared cache. Always add a cache-buster.** Despite `Cache-Control: no-store, no-cache, must-revalidate, private`, plain requests returned `Age: 3855` (17:19Z), rising steadily to `Age: 5493` (17:46Z), with a repeated `x-request-id` (`Root1-6abfd88f-…`). The cached copy dated from ~16:15Z (12:15 ET). The same URL with `?_=<epoch>` returned `Age: 0` and a fresh `x-request-id`. `agencies.json` showed `Age: 8577`. 14:00 ET slot test (plain and cache-busted pollers every ~60 s, 17:18–18:07Z): **no 14:00 ET filing occurred today** (count stayed 107 and `special_filings_updated_at` stayed 11:15 in both), so detection lag is still UNVERIFIED. However, the plain URL's `Age` fell from 6244 (17:59:18Z) to **11 at 18:00:20Z**, so the shared cache was refreshed at **≈18:00:09Z = 14:00:09 ET**, exactly on the slot boundary. The cache therefore looks purged or re-primed at slot times, which limits the staleness risk around slots. Why the copy dated from 12:15 ET, not 11:15, is unexplained. **Build rule:** every FR API poll appends a unique query parameter, and the poller logs the `Age` header so staleness shows up.
2. **The FR API is CORS-open.** Every response carried `access-control-allow-origin: *`. A static GitHub Pages front end can read FR/PI data straight from the browser, with no proxy needed for that source.
3. **Full text of presidential documents is available at the PI slot.** `raw_text_url` (`https://www.federalregister.gov/public-inspection/raw_text/202/620/439.txt`) returned 200 `text/plain`, and the PI PDF returned 200. Neither is bot-walled. So the EO, proclamation or determination text, with its number, is machine-readable at 11:15 ET, 1–2 business days after signing and days before FR publication. This also covers documents the WH never posts (Syria notice, Lebanon PD, refugee PD). Confirmed by WH sitemap grep: no 2026/09–10 Syria, Lebanon or refugee posts on whitehouse.gov.
4. **OIRA regulatory-review XML (F11, a leading indicator for major agency rules) was omitted.** `https://www.reginfo.gov/public/do/XMLViewFileAction?f=EO_RULES_UNDER_REVIEW.xml` → 200 `application/xml`, 92.6 KB, `RUNDATE="2026-10-02"`, 178 `<REGACT>` records. Fields: `AGENCY_CODE, RIN, TITLE, STAGE, ECONOMICALLY_SIGNIFICANT, DATE_RECEIVED, LEGAL_DEADLINE, …`; newest `DATE_RECEIVED` 2026-10-01. The companion files `EO_RULE_COMPLETED_30_DAYS.xml` and `EO_RULE_COMPLETED_YTD.xml` (200, 610 KB, 658 records, newest `DATE_COMPLETED` 2026-10-01) are listed at `https://www.reginfo.gov/public/do/XMLReportList`. A rule entering or concluding White House review usually precedes its FR appearance. This is daily-grain data; poll a few times a day. No ETag was seen. reginfo.gov's robots.txt returned a 301 and was not read, so ToS/robots status is UNVERIFIED.
5. **whitehouse.gov licensing (missing from the report).** `https://www.whitehouse.gov/copyright/` (200): "government-produced materials appearing on this site are not copyright protected"; "third-party content on this site is licensed under a Creative Commons Attribution 3.0 License". WH text (EOs, fact sheets, statements) can be republished in full. FR/GovInfo text is likewise federal work.
6. **The American Presidency Project (UCSB) is a free transcript archive the report missed (F4, archival).** `https://www.presidency.ucsb.edu/documents/app-categories/presidential/spoken-addresses-and-remarks` → 200. Its newest item on 10-02 was "Remarks to the United Nations General Assembly…" dated **2026-09-22**, a ~10-day lag. That is slower than Factba.se (hours), much faster than DCPD (~34 days), and the source is non-proprietary. Its taxonomy feed `https://www.presidency.ucsb.edu/taxonomy/term/8/all/feed` returned **403** to our UA. Reuse terms were not checked (UNVERIFIED).
7. **DHS press releases are reachable** (see the corrections in §0.8, §7 and §12): `https://www.dhs.gov/news-releases/press-releases`, server-rendered HTML, 200 to the custom UA.
8. **Inference worth testing in build session 1: WH streams are probably unlisted while live.** Every WH, State and War live video's RSS `<published>` time falls after the stream's end (re-confirmed: `LLh9sKf0L-w` start 16:18:02Z, end 16:52:48Z, RSS published 16:55:27Z; War `ZQPnYP-eq1I` start 18:36:59Z, end 19:53:34Z). The likely reason is that the videos are not public while live. If so, `search.list eventType=live` would **also** miss them, which makes the whitehouse.gov `/live/` embed the only free detector for WH streams. UNVERIFIED (needs one `search.list` call during a live WH event).
9. **Wayback CDX is rate-limited.** The verifier's first CDX query returned **HTTP 429**, and later id_ fetches worked only intermittently; some timed out. Do not build any production path or re-verification routine on web.archive.org.
10. **The Fed calendar's `live` links are mixed:** YouTube, Zoom (`darden-virginia.zoom.us`) and third-party sites. Only the YouTube subset can feed `videos.list`.

## Verification ledger

| # | Claim | Method | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `whitehouse.gov/live/` carries `data-live-duplex` JSON; `max-age=60`, no ETag/LM | curl | CONFIRMED | 17:16Z HTTP 200, 269,696 B raw / 36,882 B gzip, `cache-control: max-age=60`, `x-cache: HIT`, no ETag/LM; IMS → 200; attr at byte 204,461 (76%); `live.on:false`; only embed `A4gNgHfZ-v4`; `view.js` path present |
| 2 | Wayback 2026-09-30 16:36:07Z snapshot shows `on:true`, VP Brownsville, embed `LLh9sKf0L-w` | Wayback id_ fetch | CONFIRMED | 200, 41,082 B gz; `{"live":{"on":true,"name":"Vice President JD Vance Delivers Remarks in Brownsville, TX"}…}`; embeds `A4gNgHfZ-v4`, `LLh9sKf0L-w` |
| 3 | VP stream 16:18:02→16:52:48Z; RSS published 16:55:27Z (after end) | watch page `liveBroadcastDetails` + channel RSS | CONFIRMED | exact timestamps matched; also `5fRpXOyalfc`, `64w2lEYtw8E`, `VMWEHk4qH6I`, `qyJL5gKhajE`, `wFXnUw93jsA` RSS times matched the report |
| 4 | YouTube quota: 100 search.list/day own bucket; 10,000 units others; page updated 2026-09-15 | doc fetch | CONFIRMED | `determine_quota_cost` "Last updated 2026-09-15 UTC"; quote verbatim; `getting-started` (2026-09-14) same text |
| 5 | `videos.list` = 1 unit; max 50 IDs | doc fetch | CONFIRMED (1 unit) / UNVERIFIABLE (50 IDs) | doc: "quota cost of 1 unit"; ID cap not documented |
| 6 | `captions.download` needs owner auth | doc fetch | CONFIRMED | "requires the user to have permission to edit the video" |
| 7 | WH `/news/feed/` umbrella: 30 items 09-22→10-01, ETag/LM, 304 works, site-wide ETag | curl + INM/IMS | CONFIRMED | 30 items, cats Releases 12 / B&S 9 / Fact Sheets 4 / EO 3 / Nominations 1 / Proclamations 1; INM → 304, IMS → 304; same `W/"1ae6d600…"` on 10 feeds |
| 8 | `/articles/feed/` = Releases, HTTP 200 | curl | REFUTED | HTTP 301 → `/releases/feed/` |
| 9 | `/remarks/feed/` dormant (1 item, Inaugural) | curl | CONFIRMED | 1 item, pubDate 2025-01-20 22:13:54Z |
| 10 | `/feed/` 404; `/wp-json/*` 403 | curl | CONFIRMED | 404; 403, 403 |
| 11 | Syria/Lebanon/refugee docs absent from WH | feed + `?paged=2,3` + post-sitemap grep | CONFIRMED | 0 matches in feeds; no 2026 Syria, Lebanon or refugee URLs in post-sitemap(3) |
| 12 | WH EO posts 17–210 min after scheduled signing | Factba.se rows vs WH EO feed pubDates | CONFIRMED (reproduced) | 9/29 17:00→17:17/17:23; 9/17 17:00→17:26/17:31; 9/18 16:30→18:02; 9/08 13:00→14:52/15:00; 8/27 13:30→17:00 ET. Caveat: pubDate is WP `datePublished` (see the §2.1 trap) |
| 13 | WH pubDate = go-live time | page JSON-LD vs BNO email time | UNVERIFIABLE (counter-example found) | DSA release: datePublished 10-01 22:22:29Z, dateModified 10-02 13:40:11Z, release email 10-02 08:57 EDT |
| 14 | PI `current.json`: count 107, special 11:15 / regular 08:45, types 81/17/8/1, no ETag | curl | CONFIRMED | identical numbers at 17:19Z; `no-store`; no ETag |
| 15 | `current.json` is a cheap, timely change detector (detection lag <1 min after a slot) | Age header + plain vs cache-busted pollers across the 14:00 ET slot | UNVERIFIABLE (caveat found) | `Age` up to 6244 s on the plain URL (no-store ignored by a shared cache); `?_=` → `Age: 0`; cache refreshed at 18:00:09Z (14:00:09 ET) slot boundary; no 14:00 filing today, so lag not measurable |
| 16 | Slot table (per-day counts) | API re-derivation by `filed_at` | REFUTED (mislabelled) | per-issue counts include previous-day carry-overs; "10-02" 14:00/16:15 entries were filed 10-01; corrected table in §3 |
| 17 | 11/11 presidential docs filed at 11:15 special | API | CONFIRMED | 11 distinct, all T11:15 special |
| 18 | Specials only at 11:15/16:15/18:00 (+rare 14:00) | API | REFUTED (incomplete) | 08:45 special: 1 on 09-22, 3 on 09-30 |
| 19 | EO 14434 record incl. `?1790867710` = 2026-10-01T15:15:10Z | API + epoch math | CONFIRMED | exact JSON matched; epoch → 2026-10-01 15:15:10Z |
| 20 | `presidential_document_type` as field → 400 | API | CONFIRMED | `{"status":400,"message":"field 'presidential_document_type' not valid"}` |
| 21 | 31 presidential docs since 09-01; median 5 d (2–7) | API (`publication_date ≥ 09-01`) | CONFIRMED | EO 13, Proc 11, Notice 4, Determination 2, Memo 1; lags 2–7, median 5 |
| 22 | `per_page=2000` accepted (2000 of 2426) | API | CONFIRMED | count 2426, 2000 returned, `search_after_cursor` in next_page_url |
| 23 | `agencies.json` has ETag | curl | REFUTED | no ETag/LM; `no-store`; `Age: 8577` |
| 24 | FR HTML bot-walled; `raw_text_url` UNVERIFIED | curl | CONFIRMED (HTML) / RESOLVED (raw text OK) | HTML/doc pages 302 → `unblock.federalregister.gov`; raw_text 200 text/plain; PI PDF 200 |
| 25 | PI RSS `pubDate` = filing time; first item Lebanon PD | curl | CONFIRMED | 107 items; `pubDate Fri, 02 Oct 2026 15:15:00 GMT`; "FR DOC #: 2026-20439; Publication Date: 2026-10-05; 64 KB; 1 page" |
| 26 | GovInfo `dcpd.xml` 100 items, LM 10-01 21:27Z; `cpd.xml` 404 | curl | CONFIRMED | identical LM; 100 items; cpd.xml 404 |
| 27 | DCPD ~34 days behind (EO 14423) | DCPD RSS + FR API | CONFIRMED | EO 14423 signed 2026-08-28 (FR); DCPD-202600566 RSS pubDate 2026-10-01 21:27Z |
| 28 | DEMO_KEY 30/h, 50/day; key 1,000/h; GovInfo shows `X-Ratelimit-Limit: 10` | api.data.gov manual + GovInfo call | CONFIRMED | quotes in §4; GovInfo 429 with `X-Ratelimit-Limit: 10` |
| 29 | Factba.se calendar/full/csv URLs, ETag, 304; ics/transcripts/vance 403; latest.rss dead 2022 | curl | CONFIRMED | 200/200/200; 403×3; latest.rss LM 2022-03-24 |
| 30 | Factba.se LM advances every poll | plain vs cache-busted requests | REFUTED (partly) | CloudFront RefreshHit keeps LM 16:27:05Z; origin LM 17:24:59Z on Miss; ETag same |
| 31 | 8 Briefing Schedule rows May–Sep | calendar-full | REFUTED (minor) | 9 rows |
| 32 | Sample Peterbilt row has `video_url` | calendar.json vs calendar-full | CONFIRMED (partly) | present in calendar-full, `null` in calendar.json |
| 33 | Factba.se licensing/ToS | rollcall.com, fiscalnote.com | UNVERIFIABLE | no terms URL on rollcall (404s); fiscalnote.com terms behind Cloudflare challenge (403); rollcall robots blocks `anthropic-ai`, `GPTBot`, `PerplexityBot`, `cohere-ai` (confirmed) |
| 34 | BNO `/whpool/` HTML-only, no feed, robots open, "within seconds" | curl | CONFIRMED | 200 ×3, 404 ×3 feeds, `Disallow:` empty, about text verbatim |
| 35 | BNO "within seconds" latency | — | UNVERIFIABLE | operator's own claim; not measured (no new pool report arrived during the window) |
| 36 | State feeds need browser UA; public schedule; briefing feed dormant; 15 feeds | curl both UAs | CONFIRMED | custom UA 403 (AmazonS3); browser UA 200, `max-age=600`; briefings newest 2025-11-10; 15 feed URLs on `/rss-feeds/` |
| 37 | War `RSS.ashx` 200 while war.gov 403 (Akamai, both UAs); Speeches pubDate predates delivery | curl + watch page | CONFIRMED | types 2/9/11/13/400 200; `/` and `/News/RSS/` 403 AkamaiGHost; speech pubDate 16:46Z vs stream 18:36:59Z |
| 38 | GovDelivery USDOD "Today in DOW", USTREAS 25 items, USDHS S&T only, USDOC stale 2026-03-19, USHHS 404 | curl | CONFIRMED | all as stated |
| 39 | DOJ RSS 25 items, ETag/LM, `max-age` ~3 days, all pubDates 12:00:00 | curl | CONFIRMED | `max-age=253511`; 25/25 at 12:00:00 |
| 40 | dhs.gov 403 to both UAs | curl both UAs | REFUTED | homepage and press-release listing 200; the RSS URLs are 404 (do not exist) |
| 41 | hhs.gov, commerce.gov 403 (both UAs) | curl both UAs | CONFIRMED | hhs 403 bare; commerce 403 Cloudflare |
| 42 | Fed feeds and `calendar.json` (BOM, 2,597 events, `live` links) | curl | CONFIRMED | as stated; caveat: live links mixed |
| 43 | SEC 10 req/s | doc fetch | CONFIRMED (was UNVERIFIED) | "Current max request rate: 10 requests/second" |
| 44 | GAO/CBO RSS ETag+LM, `max-age=3600` | curl | CONFIRMED | GAO LM 15:48:43Z; CBO LM 16:33:50Z |
| 45 | YouTube channel IDs (WH, State, War, DOJ, DHS, HHS, Fed, SEC, fake TrumpTV) | channel RSS titles | CONFIRMED | all 200 with the stated titles; TRUMP TV newest 2019-08-03 |
| 46 | YouTube ToS forbids automated access | ToS fetch | CONFIRMED | quote in §6.3 |
| 47 | X pricing $0.005/post, $0.010/user, 3M cap, no subscriptions | docs.x.com fetch | CONFIRMED | verbatim; dedup 24 h UTC; "legacy tiers closed to new sign-ups" not on the page |
| 48 | Truth Social API 403 | curl | CONFIRMED | HTTP 403 |
| 49 | trumpstruth.org feed: 100 items, 304 works, pubDate = post time, Defending Democracy Together | curl + snowflake math | CONFIRMED | IMS → 304; `117371677010048663>>16` = 14:01:01.408Z = pubDate; operator text verbatim |
| 50 | WH on Bluesky `whitehouse-47.bsky.social` | public AppView API | CONFIRMED | displayName "The White House", Bluesky-issued verification |
| 51 | Rumble `/c/whitehouse` 200 with `"live":false` flags; robots `Disallow: /api/` | curl | CONFIRMED | 200, 25× `"live":false`; robots has `Disallow: /api/` |
| 52 | `/live/` flip lag; ingest lag of trumpstruth; whether `/live/` covers every WH stream | — | UNVERIFIABLE | no WH live event or new Truth post in the verification window |

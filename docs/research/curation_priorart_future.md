# Feed curation, event model, prior art, legal, future financial/world sources

Research dimension: CURATION + PRIOR ART + FUTURE SOURCES (F11 partial, F12, cross-cutting design for F1-F11).
Researched: 2026-10-02, 15:30-16:30 UTC, from a Windows box (curl 8.19, gh 2.93, WebSearch/WebFetch).
All curl calls used a descriptive User-Agent with contact email unless the row says otherwise.

Conventions used below:
- **EVIDENCE** cells record what was actually observed (HTTP code, item counts, timestamps). Times are UTC unless marked ET.
- **UNVERIFIED** means I could not confirm it live; the reason is given. Do not build on an UNVERIFIED fact without re-checking.
- Feature IDs F1-F12 are the ones defined in the session brief.

---

## 0. TL;DR (read this first)

1. **Congress is in pre-election recess right now.** Senate Press Gallery (Bluesky, 2026-10-01 14:33Z): "Other than pro forma sessions the Senate stands adjourned until Monday, November 9th at 3:00 p.m." House Democratic Cloakroom (Bluesky, 2026-10-01 15:34Z): House adjourned "until Monday, October 5, 2026 4:30 pm in a Pro Forma Session (no recorded votes)". The last real House roll call is #314 (2026-09-16 7:05 PM ET); the last Senate roll call is #256 (2026-09-30 9:29 PM ET). **Consequence: the first build sessions (October) will see almost no live floor activity. Build and test against recorded fixtures from September session days; the executive branch, the Federal Register (FR) and the F12 sources stay live.** [verifier 2026-10-02: CONFIRMED. Both Bluesky posts re-fetched (senatepress 2026-10-01T14:33:55Z; democraticcloakroom 2026-10-01T15:34:57Z); Senate XML vote 256 and Clerk roll314 re-fetched. Additional: the nonpartisan House Press Gallery banner (pressgallery.house.gov/alerts, curl 200) reads "The House is in a district work period. Next votes are expected Monday, November 9", so **neither chamber has recorded votes before Nov 9**.]
2. **Nobody offers a neutral, free, unified, live feed across Congress, the White House, the FR and the courts.** What exists is (a) partisan official tools (DomeWatch from the House Democratic Whip, the two party cloakrooms), (b) small independent trackers that refresh several times a day or every ~15 min, (c) paid pro tools (Punchbowl, Politico Pro, Quorum, FiscalNote). That gap is this project's niche.
3. **Aggregator APIs die; primary sources persist.** Sunlight Congress API shut down 2017; ProPublica Congress API "no longer available" (updated July 10, 2024, verified); GovTrack ended bulk data in 2017 (its API v2 is still live today). **Build on primary sources (senate.gov, clerk.house.gov, whitehouse.gov, federalregister.gov API, congress.gov API) and use aggregators only as cross-checks.**
4. **New in 2026 and worth using:** the **DomeWatch Public Data API** (`https://data.domewatch.us/v1`, OpenAPI 1.0.0-draft) with House floor state, roll-call tallies updated "approximately once per second", and SSE streams. Anonymous access works (30 req/min observed). Caveats: partisan text in whip notices and floor updates, a test vote ("This is a test votes #315") sitting in the production `/floor` response, and `/floor-updates` stale since 2026-06-09.
5. **Event model:** one append-only `Event` record per state change, keyed by a **canonical object key** (`vote:senate:119:2:256`, `fr:2026-20321`, `eo:14434`, `bill:119:hr:5334`) plus a transition name. Separate `occurred_at`, `source_published_at` and `first_seen_at`, because sources lie about time. Example: the BLS jobs-report RSS entry is stamped 07:51 ET for an 08:30 ET release. Thread events by a `thread_key` (bill, nomination, EO, docket). Borrow vocabulary from Popolo (votes), schema.org Event (`eventStatus`, `BroadcastEvent.isLiveBroadcast`), ActivityStreams 2.0 (Create/Update/Delete/Tombstone), and publish our own output as **JSON Feed 1.1**.
6. **Curation: rules first, AI second.** The FR averaged ~105 docs per business day from Sept 1 to Oct 2 2026, and **82% were notices** (1,993 notices, 247 rules, 155 proposed rules, 31 presidential documents). Hiding notices by default removes most of the noise. Copy GovTrack's vote-category importance ranking (veto override, conviction or impeachment = 1 ... procedural = 6).
7. **AI cost is small if it is tiered.** Claude Haiku 4.5 (`claude-haiku-4-5`) costs **$1 / MTok input and $5 / MTok output**, or $0.50 / $2.50 through the Batch API (verified on platform.claude.com pricing, 2026-10-02). At about 1,500 input and 150 output tokens per item that is about $0.00225 per item. Summarizing every item costs ~$34/month at 500 items/day and ~$135/month at 2,000 items/day. **Summarizing only tiers P0-P2 (~15% of items) costs ~$5-20/month.** Prompt caching does not help unless the prompt is at least 4,096 tokens (the Haiku 4.5 minimum).
8. **Legal, hard nos:**
   - **C-SPAN:** the Terms (effective Dec 15, 2025) prohibit any "bot, spider, or other automatic device ... to monitor or copy our Content", and prohibit using Content "in connection with ... prompting ... any artificial intelligence" without a license.
   - **Reuters:** robots.txt notice: "Collection of content ... through automated means is prohibited".
   - **AP:** robots.txt disallows `/*.rss` and `/api/v2/feed/`.
   - **X API:** pay-per-use only, $0.005 per post read, no free tier (docs.x.com, verified).
   - **federalregister.gov website:** blocks programmatic access ("programmatic access to these sites is limited to access to our extensive developer APIs"). The API works.
9. **Operations:** conditional GET support is inconsistent (table in §4), and some sources return **HTTP 200 with an error body**. The House Clerk returns `<xml>Error sanitizing file "roll315.xml". Please try again.</xml>` with status 200 for a roll call that does not exist yet. Health checks must validate content, not just status codes. The WH presidential-actions feed is **593 KB per fetch**, so conditional GET is mandatory (observed 304 on both ETag and Last-Modified). [verifier 2026-10-02: corrected — 304 re-confirmed, but the validator is **site-wide and changes when the feed does not**: at 16:37Z the ETag was `"1ae6d600..."` with `Last-Modified 16:19:11 GMT` (researcher saw `"1886323d..."` ~15:45Z), yet the feed's own `lastBuildDate` is still Tue, 29 Sep 2026 21:23:49 and its newest item is from 29 Sep (no new presidential action since). So every site-wide change forces a full 593 KB re-download; a 200 does NOT mean new presidential actions. Diff by item `<guid>`. A second 200-with-error case was found: `docs.house.gov/floor/Download.aspx?file=/billsthisweek/20260928/20260928.xml` returns 200 `text/html` "File Not Found" (82 KB), see §4.1.]
10. **F12 (financial and world) is easy to add later through a plugin interface.** Verified live today: SEC EDGAR latest-filings Atom, the Fed press RSS (ETag/304), the BLS release-calendar ICS plus per-release RSS, the TreasuryDirect upcoming-auctions JSON, the Treasury FiscalData API, GDELT 2.0 15-minute files, UN News RSS, and Bluesky Jetstream (WebSocket works with plain curl). Do not show live market quotes publicly; exchange redistribution licensing makes it a paid problem. [verifier 2026-10-02: all of these re-probed 200. Also: Jetstream was rewritten in 2026 and now has a **v2** endpoint with replay and resume cursors (see Verifier additions); the Census calendar the report lists as UNVERIFIED does exist as RSS at `https://www.census.gov/economic-indicators/indicator.xml` (200, application/xml).]

---

## 1. Prior art

### 1.1 Landscape table

| Product / project | What it does (relevant to us) | Data access and license | Copy | Avoid | EVIDENCE |
|---|---|---|---|---|---|
| **GovTrack.us** | Bills, votes, members, analysis. "Tracking Congress & the White House" (its White House tracker is a Substack newsletter). | **API v2 live**: `https://www.govtrack.us/api/v2/vote?order_by=-created&limit=2`. Votes "updated roughly hourly"; bill status from GovInfo BILLSTATUS "typically ... the next business day". The site repo `govtrack/govtrack.us-web` has **no license file**, so copy ideas only, not code. robots.txt: `User-agent: * Disallow: /api`, `Crawl-delay: 30`. | Vote taxonomy with an **importance rank** (`vote/models.py`: veto_override 1, conviction 1, impeachment 1, nomination 2, ratification 2, passage 3, passage_part 3, passage_suspension 4, cloture 4, amendment 5, procedural 6, unknown 8). Per-vote `category`, `margin`, `party_uniformity`, `required`. | Using it as a primary real-time source (hourly batch; robots disallows `/api` for crawlers). Use at most 1 req/min as a cross-check. | curl 2026-10-02 HTTP 200, `total_count: 113719`, newest Senate vote 256 "On the Nomination PN1129: Keith Sonderling ... Secretary of Labor", `created: 2026-09-30T21:29:00`, 47-41. About page fetched (quotes above). |
| **unitedstates/congress** (GitHub) | Python scrapers for bills, votes, amendments and GovInfo bulk data. GovTrack runs it. | **CC0-1.0**. Last push **2025-10-05**, so maintenance mode. | Parsing of Clerk/Senate vote XML and BILLSTATUS. Its output layout (`data.json` per bill). | Taking it as a hard dependency (slow cadence, batch-oriented). Vendor the specific parsers instead. | `gh api repos/unitedstates/congress`: CC0-1.0, pushed 2025-10-05, 1,063 stars. |
| **unitedstates/congress-legislators** | Canonical member IDs, 1789 to present, plus presidents and VPs. | **CC0-1.0**, active (push 2026-09-24, "Rep. Wahab sworn in"). JSON at `https://unitedstates.github.io/congress-legislators/legislators-current.json`. | **Use as the actor registry for Congress.** The `id` keys include `bioguide`, `lis` (the Senate vote XML uses LIS IDs), `govtrack`, `wikidata`, `cspan`, `fec`, `opensecrets`, `icpsr`. | Expecting cabinet members: `executive.json` covers only presidents and VPs (80 records). | curl 2026-10-02: 539 current legislators; executive.json 80 entries, last = J.D. Vance (`bioguide V000137`, `lis S421`, `wikidata Q28935729`). |
| **unitedstates/statements-of-administration-policy** | Scraper and archive of OMB Statements of Administration Policy (SAPs). | CC0 org, push **2026-09-30**. | SAP as an event type (F9/F11). Metadata shape (`bills`, `date_issued`, `fetched_from_url`). | Nothing notable. | `gh api orgs/unitedstates/repos`. README read. [verifier 2026-10-02: corrected — push 2026-09-30T21:01Z confirmed, but the repo has **no LICENSE file** (GitHub API `license: null`; root listing has no LICENSE; README has no license text). "CC0 org" does not license this repo; treat as unlicensed, ideas only.] |
| **unitedstates/congressional-record** | Parser for the Congressional Record (next-day text of floor speech). | Org CC0; push 2026-09-18. [verifier 2026-10-02: corrected — push 2026-09-18T01:30Z confirmed, but the repo LICENSE is **BSD-style, "Copyright (c) 2015, Nick Judd. All rights reserved. Redistribution and use ... permitted provided that ..."** (GitHub reports `NOASSERTION`/"Other"), not CC0. Code reuse must keep that notice.] | Speaker segmentation for F8 "who spoke" (next day). | Treating it as live (the Record is next-day). | gh listing. |
| **Congress.gov (Library of Congress)** | Official site, API v3, email alerts, RSS. | API: "The rate limit is set to 5,000 requests per hour" (LibraryOfCongress/api.congress.gov README). Alerts: email, **"once a day"** for bill and member alerts (congress.gov/help/alerts via search). RSS: `/rss/notification.xml`, `/rss/house-floor-today.xml`, `/rss/senate-floor-today.xml`, `/rss/most-viewed-bills.xml` (weekly). robots: `Crawl-delay: 2`; it blocks a long list of AI agents including `ClaudeBot`, `Claude-User`, `Claude-SearchBot`. HTML pages return 403 to curl; API and RSS work. | **Most-viewed-bills RSS as a free popularity prior for ranking.** | Scraping HTML (403, plus robots). Relying on its alerts for real time (daily). | RSS curl 2026-10-02: all four HTTP 200. Most-viewed week of 2026-09-27 includes H.R.6509, S.4668, H.R.1, S.2296, H.R.5334. API repo pushed 2026-09-21, 59 open issues. |
| **ProPublica Congress API / Represent** | Former free Congress API (the successor to Sunlight's). | **Dead.** "Represent and the Congress API are no longer available" (updated July 10, 2024). | Nothing. | Old tutorials and SDKs that still point at it. | curl propublica.org datastore page 2026-10-02, quote above. |
| **Sunlight Foundation (legacy)** | Congress API, Scout alerts, Capitol Words, Open States. | Closed **September 2020** (Wikipedia and press, via search). Scout retired; Open States spun out. Its Congress API moved to ProPublica in 2017 and is now dead. | Scout's idea of saved-search alerts across bills, regulations and speeches. | Assuming any Sunlight endpoint works. | WebSearch 2026-10-02 (secondary sources). |
| **Open States / Plural** | State legislatures, Popolo-style model. | `openstates-core` **MIT**, push 2026-09-29. API v3 needs a key ("Must provide API Key as ?apikey or X-API-KEY"). | Popolo-derived model (people, organizations, memberships, vote events, bills); OCD IDs. Relevant if state coverage is ever added. | Not needed for federal scope. | curl `v3.openstates.org/jurisdictions` 2026-10-02 returned the key-required error. |
| **DomeWatch** (House Democratic Whip) | Live House floor status, vote clock and tallies, whip notices, committee meetings. **New public Data API.** | `https://data.domewatch.us/v1` (OpenAPI 3.1, `version: 1.0.0-draft`). Endpoints: `/floor`, `/votes/current`, `/votes/{rollCall}`, `/votes?congress=&session=`, `/floor-updates`, `/committee-meetings`, `/whip-notices`, `/stream/votes/current` (SSE), `/stream/floor` (SSE), `/health`. Anonymous: **30 req/min polling, 6 req/min vote-tally polling, no streaming**. Free "Standard" key (60 req/s, 2 concurrent SSE) via `https://domewatch.us/api/signup`. Terms: "attribution to DomeWatch is appreciated but not required." | **The only free live House vote-tally source found.** Use `/floor` and the SSE streams for F2/F5. Its structured whip-notice items (`billId`, `billNumber`, `procedure`, `firstVotes`, `lastVotes`) are useful for F7. | Showing partisan text: whip notices include "Democrats are urged to vote no ... VOTE NO". Show factual fields only, labeled with the source's affiliation. Validate: `/floor` currently shows `"question":"JOURNAL - This is a test votes #315..."` (a test record in production). `/floor-updates` newest `publishedAt` is 2026-06-09, so it is stale. | curl 2026-10-02 15:42Z: `/health` 200 `{"status":"ok"}`. `/floor` 200 with `x-ratelimit-limit: 30` and `{"now":{"text":"House adjourned"...}}`. `/whip-notices` newest `postedAt 2026-09-16T12:01:27+00:00`. **No ETag returned** (docs claim If-None-Match support); conditional request returned 200. |
| **House Democratic Cloakroom** (Bluesky `democraticcloakroom.house.gov`) | Floor open and adjourn posts. | Public AT Protocol. The handle is domain-verified on house.gov and Bluesky-verified. | Fast floor-status signal: adjourned 11:33 am, posted 15:34:57Z (11:34 ET), about **1-2 min latency**. | Treating it as neutral (it is a party office). | public.api.bsky.app getAuthorFeed 2026-10-02: 3 posts, latest 2026-10-01T15:34:57Z. 1,600 followers. |
| **Senate Press Gallery** (Bluesky `senatepress.bsky.social`) | Nonpartisan press-gallery floor log: convene and adjourn, UC passages, vote results, next-day schedule. | Public AT Protocol (DID `did:plc:6zocupvpoq7o4v4z6fuwimhj`). `Cache-Control: public, max-age=30`. | **Best free nonpartisan live Senate floor signal (F1, F5, F7).** Pro forma at 10:30 posted at 10:33 ET (~3 min). Adjourned 11:24 PM, posted 11:44 PM ET (~20 min). | Parsing it with brittle regexes without fixtures. Text format varies. | getAuthorFeed 2026-10-02: newest 2026-10-01T14:33:55Z; earlier posts "The #Senate passed by unanimous consent: H.R.5349 ..." (2026-09-30T20:04Z). |
| Senate Periodical Press Gallery (Bluesky `senateppg.bsky.social`) | Used to post votes ("Confirmed, 69-30 ..."). | Public. | Nothing now. | **Stale**: newest post 2025-07-15. | getAuthorFeed 2026-10-02. |
| "Republican Cloakroom" (Bluesky `repcloakroom.bsky.social`) | Cross-post bot of the X account. | Unverified handle, `t.co` links. | Nothing. | **Stale** (newest 2026-03-06) and unverified. Prefer X-native `@SenateCloakroom` / House GOP cloakroom only if the X API is ever budgeted. | getAuthorFeed 2026-10-02. |
| **White House on Bluesky** (`whitehouse-47.bsky.social`) | Official messaging. | Bluesky-verified (verification issuer `bsky.app`), 16,378 followers, 79 posts. | Low-cost "WH said X" signal. | Not a substitute for whitehouse.gov feeds (its posts are messaging, not actions). | getProfile and getAuthorFeed 2026-10-02: newest 2026-10-02T01:17Z. |
| **C-SPAN** | Live video, transcripts and captions, schedules. | **Restrictive.** Terms (effective Dec 15, 2025): personal, non-commercial use only; no "bot, spider, or other automatic device ... to monitor or copy our Content"; no AI use (including "prompting") without a license. robots: `Disallow: /transcript`, `/video/cc/`; `Crawl-delay: 4`; blanket disallow for ClaudeBot and other AI agents. House and Senate floor video itself is public domain (C-SPAN classroom copyright page). [verifier 2026-10-02: Terms quotes CONFIRMED ("Effective Date: December 15, 2025"; "use any bot, spider, or other automatic device, or manual process to monitor or copy our Content"; "...any training, prompting, development ... artificial intelligence ..."). robots `Disallow: /transcript`, `/video/cc/`, `Crawl-delay: 4` and `ClaudeBot` → `Disallow: /` are CONFIRMED. The classroom copyright page returned HTTP 202 (bot interstitial) to the verifier, so the public-domain floor-video statement is **UNVERIFIED** here.] | Link out to C-SPAN pages. Use **official** House and Senate streams for embeds. | **Any scraping or AI processing of C-SPAN transcripts, captions or schedules.** | curl 2026-10-02 of `/about/termsAndConditions/` (200) and `/classroom/copyright/` (200); robots.txt fetched. |
| **Factba.se** (now `rollcall.com/factbase`, owned by FiscalNote / CQ Roll Call) | The canonical presidential schedule, transcripts and remarks archive. | `factba.se` returns 301 to rollcall.com. Calendar JSON is publicly reachable at `https://media-cdn.factba.se/rss/json/trump/calendar-full.json` (2.68 MB, 6,368 records, `ETag`, `Cache-Control: max-age=60`). **No terms-of-use page found** (rollcall.com/terms*, all 404; only a FiscalNote privacy link). rollcall.com robots allows `*` but blocks AI-training bots. | Schema of a schedule item: `date`, `time`, `type`, `details`, `location`, `coverage` ("Open Press", "Closed Press"), `video_url`. It is the best model for F7 "President's public schedule". | **Ingesting or republishing without permission** (copyrighted compilation; ToS UNVERIFIED). Ask Roll Call, or link out only. | curl 2026-10-02: HTTP 200, `Last-Modified: Fri, 02 Oct 2026 07:08:50 GMT`. Records for 2026-10-03 ("TBD: The President departs the White House en route Dayton, Ohio", "Open Press"). |
| **Punchbowl News** (paid) | Insider newsletter. | Paid. Search result: Premium "$385 per year", Premium+ "$1200 per year" (punchbowl.news/pricing via WebSearch; **UNVERIFIED**, page not fetched). [verifier 2026-10-02: CONFIRMED — curl of punchbowl.news/pricing/ 200: "Premium $385 / year", "Premium+ $1200 / year"; annual billing "save you 20% compared to monthly".] | Editorial "what matters today" framing; morning agenda. | Data is not reusable. | WebSearch 2026-10-02. |
| **Politico Pro / Quorum / FiscalNote** (paid) | Enterprise legislative and regulatory tracking with near-real-time alerts on bills, regulations, hearings and floor transcripts. | Custom quotes (Quorum, FiscalNote); Politico Pro "$49.00 per user, per month" per Capterra (**UNVERIFIED**). | The UX of **"follow anything" alerts** (bill, member, keyword, committee, agency) and floor-transcript keyword alerts. | Data is not reusable; enterprise complexity. | WebSearch 2026-10-02. |
| **The Capitol Wire** (2025-26 newcomer) | Free email alerts on House floor schedule changes; monitors docs.house.gov and majorityleader.gov "every 60 seconds"; "AI-generated Policy Briefs". | Free, no login. Closed source. | Watching docs.house.gov and the Majority Leader's site for schedule changes (F7). | n/a | WebFetch of its blog 2026-10-02. |
| **OpenCongress.app** (newcomer) | Bills, votes, hearings, member profiles; alerts "within about 15 minutes, 8am to 11pm ET"; covers US, 50 states, France. | No API or GitHub link on its homepage. | Alert latency target to beat (15 min). | n/a | WebFetch 2026-10-02. |
| **Congress Vote Tracker** (congressvotetracker.org) | Daily roll-call list. "Not a minute-by-minute ticker"; "refreshes several times a day on weekdays". [verifier: UNVERIFIED — neither quote found on the homepage, /about or /methodology (curl 2026-10-02); the homepage instead says "Votes Today ... updated daily" and scores "refresh automatically each day". Latest roll call shown: Senate PN1129, 47-41, "Updated October 02, 2026".] | No repo. | Links back to the primary source on every item. | Cadence. | WebFetch 2026-10-02. |
| **POPVOX Foundation** | Open-source legislative AI tools (StaffLink chatbot, ParlLink for parliaments). | Open source per their blog (via search). | Ideas for AI honesty in civic tools. | Not a data feed. | WebSearch 2026-10-02. |
| Small GitHub bots | `nprapps/executive-orders` (cron that posts new whitehouse.gov presidential actions to Slack), `jessicard/exec_orders` (EO bot), `selenasun1618/whitehouse-rss-feeds` (scraped WH RSS, now redundant), `PolymarketTrader/WhiteHouseStream-Scraper` (polls the WH YouTube channel "every 5 seconds" for live streams, posts to Discord), `titouv/bot-journal-officiel` (Deno; LLM-summarizes France's Journal Officiel into Bluesky threads). | Various. | NPR pattern: simple cron, diff, notify. YouTube live detection pattern for F4. Journal-officiel pattern for AI summaries with a link to the official text. | Re-scraping pages when an RSS feed exists (whitehouse.gov has section feeds, §4). | `gh api .../readme`, 2026-10-02. [verifier 2026-10-02: corrected — (1) WhiteHouseStream-Scraper's README says it "checks the White House YouTube channel every 5 seconds using the YouTube Data API". That pattern **cannot be copied on a default key**: Google's docs give "a default quota allocation of 100 search.list calls ... and 10,000 units per day combined for all other endpoints", and every 5 s is 17,280 calls/day. Use the keyless channel RSS instead (see Verifier additions). (2) nprapps/executive-orders and jessicard/exec_orders were last pushed 2017-02 (dormant). (3) selenasun1618/whitehouse-rss-feeds is still active (pushed 2026-10-01).] |
| Federal Register's own code | `usnationalarchives/federalregister-api-core` (169 stars, push 2026-09-26), `federalregister-web`. [verifier 2026-10-02: corrected — GitHub API `pushed_at 2025-02-10T16:05:00Z`, newest commit 2025-01-28. The 2026-09-26 date is `updated_at` (repo metadata), not a code push. The public mirror is ~20 months stale, so the field names are a guide only; check them against live API responses.] | Open source. | Field names and semantics of the FR API (`type`, `subtype`, `significant`, `executive_order_number`, `signing_date`, PI `filed_at`). | n/a | `gh search repos federalregister`. |
| Market/insider trackers | `LuxAlgo/market-trackers` and `-data`: "Free CC0 daily dumps ... congress trades, insider filings, 13F". | CC0. [verifier 2026-10-02: corrected — only the **data** repo `market-trackers-data` is CC0-1.0 (push 2026-09-24). The **code** repo `market-trackers` is MIT (push 2026-09-28).] | F12 seed data (congressional stock trades). | Daily cadence only. | `gh search repos`, push 2026-09-28/30. |

### 1.2 Lessons from prior art (opinionated)

- **Primary sources only for the spine.** Every third-party federal-data API that hobby projects relied on (Sunlight 2017, ProPublica 2024, GovTrack bulk 2017) has died. Primary government endpoints have not.
- **Copy GovTrack's vote importance ranking** as the starting point for curation (§3). It is the closest existing published "what matters" heuristic.
- **Partisan official sources are useful and dangerous.** DomeWatch and the cloakrooms are the fastest House signals, but they mix facts with advocacy. Store an `affiliation` on every source and render only factual fields from partisan ones. [verifier 2026-10-02: corrected — the report missed an **official, nonpartisan** House floor source, the Clerk's floor proceedings XML `https://clerk.house.gov/floor/HDoc-119-2-FloorProceedings.xml`. It returned 200 with 5,148 `<floor_action>` entries, each timestamped to the second (e.g. "11:30:00 A.M. - The House convened ..."). Whether it beats DomeWatch or the cloakrooms is UNVERIFIED (recess, no live session to time). See Verifier additions.]
- **The free tools that exist are slow (hourly to daily) or narrow (House only).** The opportunity is minute-level, cross-branch, neutral and free.
- **Nobody does presidential schedule plus live-speech detection plus transcripts openly.** Factba.se does it best but is proprietary. This is a gap (§8).

---

## 2. Event model (normalized schema for the unified feed)

### 2.1 Design principles

1. **An event is a state change of a real-world object**, not a document. A bill is an object; "H.R. 5334 passed the House" is an event. A roll call is an object; "vote opened", "tally update", "result" are events.
2. **Append-only log plus a materialized current view.** Never mutate history. Corrections are new revisions that `supersedes` the old one (ActivityStreams `Update`/`Delete`/`Tombstone` semantics).
3. **Every event carries at least one primary-source URL.** No source URL means the event is not published.
4. **Three clocks, always.** `occurred_at` (when it happened in the world), `source_published_at` (what the source claims), `first_seen_at` (when we saw it). Sources disagree (§2.6).
5. **Stable IDs from authorities where they exist**: bioguide for members (House XML uses it directly), LIS for Senate votes mapped to bioguide via congress-legislators, FR document numbers, EO numbers, Congress/session/roll numbers, PN numbers for nominations, SCOTUS docket numbers.

### 2.2 Event record (v0.1). Proposed JSON, mapped to schema.org, Popolo and JSON Feed

```json
{
  "schema_version": "0.1",
  "id": "evt_6c1f0e9a2b7d4e11",
  "dedup_key": "vote:senate:119:2:256#result",
  "object_key": "vote:senate:119:2:256",
  "thread_key": "nomination:119:PN1129",
  "alias_keys": ["govtrack:vote:119-2026/s256"],
  "event_type": "vote.result",
  "status": "ended",
  "branch": "legislative",
  "body": "senate",
  "title": "Senate confirms Keith Sonderling as Secretary of Labor, 47-41",
  "official_text": "On the Nomination PN1129 - Nomination Confirmed (47-41)",
  "summary": null,
  "summary_meta": null,
  "importance": { "tier": 1, "score": 0.86, "reasons": ["vote.category=nomination", "office=cabinet"] },
  "times": {
    "occurred_at": "2026-10-01T01:29:00Z",
    "scheduled_for": null,
    "source_published_at": "2026-10-01T03:25:00Z",
    "first_seen_at": "2026-10-01T03:31:12Z",
    "updated_at": "2026-10-01T03:31:12Z"
  },
  "actors": [
    { "role": "nominee", "id": "wikidata:Q00000000", "name": "Keith Sonderling", "id_confidence": "curated" }
  ],
  "related": [
    { "rel": "about", "key": "nomination:119:PN1129" },
    { "rel": "office", "key": "office:us:secretary-of-labor" }
  ],
  "result": { "yea": 47, "nay": 41, "present": 0, "not_voting": 12, "required": "1/2", "passed": true },
  "member_votes_ref": "votes/senate/119/2/256.json",
  "media": [],
  "transcript": null,
  "sources": [
    { "source_id": "senate.lis.vote_xml", "url": "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00256.xml", "retrieved_at": "2026-10-01T03:31:12Z", "license": "us-gov-public-domain", "affiliation": "official-nonpartisan" },
    { "source_id": "govtrack.api", "url": "https://www.govtrack.us/congress/votes/119-2026/s256", "license": "third-party", "affiliation": "independent" }
  ],
  "revision": 1,
  "supersedes": null,
  "tags": ["labor", "nominations", "cabinet"],
  "provenance": { "parser": "senate_vote_xml@0.1.0", "confidence": "high" }
}
```

Notes on the example:
- `occurred_at` is derived from `<vote_date>September 30, 2026, 09:29 PM</vote_date>` in the Senate XML, i.e. 01:29Z on Oct 1 (EDT = UTC-4).
- `source_published_at` is from `<modify_date>September 30, 2026, 11:25 PM</modify_date>` (both seen in the XML 2026-10-02).
- `first_seen_at` is illustrative.
- The wikidata QID is a placeholder. **Do not invent QIDs**; resolve them from the curated registry (§2.5).

Field semantics:

| Field | Meaning | Borrowed from |
|---|---|---|
| `id` | Opaque, stable: `evt_` + first 16 hex of sha256(`dedup_key` + `revision_basis`). | JSON Feed `id` ("If an item is ever updated, the id should be unchanged"). |
| `dedup_key` | `object_key` + `#` + transition (`#result`, `#opened`, `#scheduled`, `#signed`, `#published`, `#pi_filed`). Two sources reporting the same transition produce the same `dedup_key`, so they **merge** (union of `sources`, earliest `first_seen_at`, best-quality fields win by source priority). | Our design. |
| `object_key` | Canonical key of the real-world object (§2.4). | Popolo `identifier` idea. |
| `thread_key` | The lifecycle the object belongs to (bill, nomination, EO, docket). The UI shows a thread timeline. | AS2 `context`. |
| `event_type` | Dotted taxonomy (§2.3). | AS2 activity types, made domain-specific. |
| `status` | `scheduled` → `live` → `ended`, or `postponed` / `cancelled` / `rescheduled` / `corrected` / `retracted`. | schema.org `eventStatus` (`EventScheduled`, `EventPostponed`, `EventRescheduled`, `EventCancelled`, `EventMovedOnline`, all verified in the schema.org JSON-LD vocab 2026-10-02) plus our `live` and `ended`. |
| `branch` / `body` | `legislative` / `executive` / `judicial` / `independent` / `nongov` (F12). `body`: `senate`, `house`, `white_house`, `agency:<fr-agency-slug>`, `scotus`, `fed`, `sec`, ... | Popolo Organization. |
| `official_text` | Verbatim source title or question. **Always displayed**, even when an AI summary exists. | Honesty rule (§3.6). |
| `summary` / `summary_meta` | Optional AI or rule summary, plus `{generator, model, prompt_version, created_at, checks_passed}`. | Our design. |
| `actors[]` | `{role, id, name, id_confidence}`. Roles: `speaker`, `sponsor`, `nominee`, `signer`, `presiding`, `voter` (member votes are stored in a side file), `agency`. | Popolo Person/Membership; schema.org `performer`/`organizer`. |
| `related[]` | Typed links to other object keys (`about`, `amends`, `implements`, `published_as`, `signed_as`). | AS2 `tag`/`context`. |
| `result` | Vote counts and outcome. | Popolo VoteEvent / Count. |
| `media[]` | `{kind: video_live / video_archive / audio / pdf / html, url, is_live, provider, license}`. | schema.org `BroadcastEvent.isLiveBroadcast`, JSON Feed `attachments`. |
| `transcript` | `{status: none / live / partial / final, segments: [{t_start, t_end, speaker_actor_id, text, source_url}], license}`. Only from public-domain or licensed sources. | Popolo Speech (`creator`, `text`, `audio`, `video`). |
| `sources[]` | Every contributing source with `license` and `affiliation`. | Our design. |
| `revision` / `supersedes` | Corrections and updates. | AS2 Update/Tombstone. |

### 2.3 Event type taxonomy (v0.1)

| Family | Types | Main sources (other research dimensions own the details) | Features |
|---|---|---|---|
| Floor | `floor.convened`, `floor.adjourned`, `floor.recess`, `floor.pro_forma`, `floor.action` (UC, motion), `floor.speaking` (who has the floor) | Senate Press Gallery Bluesky, Democratic Cloakroom Bluesky, DomeWatch `/floor`, House/Senate floor logs | F1, F2, F8 |
| Vote | `vote.scheduled`, `vote.opened`, `vote.tally` (ephemeral, not persisted per tick), `vote.result` | DomeWatch SSE (House live), Clerk XML, Senate LIS XML, Senate Press Gallery | F5, F6 |
| Bill | `bill.introduced`, `bill.action`, `bill.passed_chamber`, `bill.resolving_differences`, `bill.presented`, `bill.signed`, `bill.vetoed`, `law.enacted` | Congress.gov API, WH "Congressional Bill ... Signed into Law" posts | F11, F9 |
| Nomination | `nomination.received`, `nomination.committee_action`, `nomination.confirmed`, `nomination.rejected`, `nomination.withdrawn` | WH "Nominations Sent to the Senate", Congress.gov, Senate votes | F9, F11 |
| Hearing | `hearing.scheduled`, `hearing.live`, `hearing.ended`, `markup.*` | docs.house.gov, Senate committee schedule, DomeWatch `/committee-meetings` | F7 |
| Exec speech | `briefing.scheduled`, `briefing.live`, `briefing.ended`, `speech.live`, `speech.ended`, `transcript.published` | whitehouse.gov livestream page / YouTube, WH briefings feed | F3, F4 |
| Schedule | `schedule.item` (President, VP, cabinet) | Factba.se (licensing pending), WH guidance | F7 |
| Presidential action | `presidential_action.{executive_order, proclamation, memorandum, notice, determination, nominations_sent, statement, sap}` | WH `presidential-actions/feed/`, FR `PRESDOCU`, OMB SAP | F9 |
| Regulatory | `fr.public_inspection`, `fr.published.{rule, proposed_rule, notice, presidential_document}`, `fr.correction` | FR API | F10 |
| Judicial | `court.opinion`, `court.order_list`, `court.argument`, `court.grant` | supremecourt.gov (see legal note on its `/rss/` robots rule, §5) | F11 |
| Oversight | `report.{cbo, gao, crs, ig}` | CBO, GAO, IG feeds | F11 |
| F12 | `econ.release`, `econ.calendar`, `fed.statement`, `fed.minutes`, `treasury.auction.{announced, result}`, `sec.filing`, `world.news`, `market.move` (later) | §6 | F12 |
| Social | `social.post` (official accounts only) | Bluesky AppView / Jetstream | F3, F4 |
| System | `system.source_health` (internal; drives the /status page) | ingest | ops |

### 2.4 Canonical object keys (the dedup backbone)

| Object | Key format | Example (real) | Notes |
|---|---|---|---|
| Roll-call vote | `vote:{house\|senate}:{congress}:{session}:{roll}` | `vote:senate:119:2:256`; `vote:house:119:2:314` | Clerk XML has `<congress>119`, `<session>2nd`, `<rollcall-num>314`. Senate XML has `<congress>119`, `<session>2`, `<vote_number>256`. GovTrack uses `119-2026/s256` (year, not session) and is stored as an alias. |
| Bill | `bill:{congress}:{type}:{number}` | `bill:119:hr:5334` | Same shape as DomeWatch `billId: "hr5334"`. Types: hr, s, hjres, sjres, hconres, sconres, hres, sres. |
| Nomination | `nomination:{congress}:PN{n}` | `nomination:119:PN1129` | From the Senate vote question "On the Nomination PN1129". |
| FR document | `fr:{document_number}` | `fr:2026-20321` | PI and published share the number. |
| Executive order | `eo:{number}` | `eo:14434` | The number first appears at FR Public Inspection, not on whitehouse.gov. |
| WH page | `wh:{path}` | `wh:presidential-actions/2026/09/inaugurating-the-era-of-super-intelligence` | Alias that is later linked to `eo:`. |
| SCOTUS case | `scotus:{docket}` | `scotus:24-123` (format illustration only) | |
| Hearing | `hearing:{chamber}:{committee_code}:{yyyymmdd}:{slug}` | | |
| Member | `bioguide:{id}` | `bioguide:A000370` (House XML `name-id`) | Senate LIS `S428` maps to bioguide via congress-legislators `id.lis`. |
| Exec official | `official:{slug}` plus `wikidata:Q...` alias | `official:jd-vance` (alias `wikidata:Q28935729`, `bioguide:V000137`) | See §2.5. |
| Agency | `agency:{fr_slug}` | `agency:environmental-protection-agency` (FR agency slugs) | |

**Dedup across sources: worked examples (real, observed 2026-10-02).**

1. **The same vote from three sources.** Senate vote 256 appears as:
   - senate.gov XML: `vote_119_2_00256.xml`, `modify_date` 11:25 PM ET.
   - GovTrack: `s256`, `created 2026-09-30T21:29:00`.
   - Potentially the Senate Press Gallery Bluesky as free text.

   All three normalize to `vote:senate:119:2:256#result`. Source priority for counts: official XML > Congress.gov > GovTrack > press-gallery text. Bluesky text only ever contributes `first_seen_at` and a corroboration link, never counts.

2. **The same presidential action across three sources, with different titles and no shared ID at first.**

   | Source | Observed | Title as published |
   |---|---|---|
   | whitehouse.gov feed | `pubDate Tue, 29 Sep 2026 21:17:25 +0000` | "Inaugurating **The** Era **Of** Super Intelligence" |
   | FR Public Inspection | `filed_at 2026-10-01T11:15:00-04:00` | "Inaugurating the Era of Super Intelligence (EO 14434)  " (trailing spaces in the source) |
   | FR published | `publication_date 2026-10-02`, doc `2026-20321`, `signing_date 2026-09-29`, `executive_order_number 14434` | (same title) |

   **Link rule:** normalized title equality (casefold, strip a trailing `(EO nnnnn)`, collapse whitespace and punctuation) AND |WH pubDate − FR `signing_date`| ≤ 3 days AND WH category "Executive Orders" ↔ FR `subtype` "Executive Order". On match, add `eo:14434` and `fr:2026-20321` to the thread and keep `wh:` as an alias.

   Observed latency: **WH first (day 0), FR PI ≈ +42 h, FR publication ≈ +2.5 days.** So whitehouse.gov is the "breaking" source and the FR is the "authoritative number" source.

3. **Corrections.** If a later fetch changes a material field (count, title, result), emit `revision+1` with `supersedes` set to the prior `id` and a visible "updated" badge. If an item disappears from a source (WH has silently removed posts in past administrations; this is general knowledge and was not observed today), emit `status: retracted` with the last-seen snapshot. Never hard-delete.

### 2.5 Actor IDs for the executive branch (no authority exists)

- congress-legislators gives presidents and VPs only (80 records).
- **Wikidata is not safe as a roster.** A live SPARQL query today for current holders of Vice President and Secretary of State, with no end date, returned **fictional characters** alongside real people: `Q1068314 "Jack Ryan"`, `Q21233561 "Elizabeth McCord"`, `Q9012447 "John Hoynes"`, plus the real `Q28935729 JD Vance` and `Q324546 Marco Rubio`.
- **Recommendation:** keep a hand-curated `registry/officials.yaml` (slug, name, office, start, end, wikidata QID as an alias, bioguide if the person was a former member, official bio URL, source of the record). Seed it once from Wikidata with filters (instance of human, real start dates). A person updates it when the WH announces changes (nominations, confirmations, resignations). Use FR agency slugs for agencies.

### 2.6 Time semantics (three clocks), with observed traps

| Trap | Observed 2026-10-02 | Rule |
|---|---|---|
| Feed timestamp earlier than the actual release | BLS `empsit.rss` entry `updated 2026-10-02T07:51:08-04:00` for the Employment Situation released **8:30 a.m. (ET) Friday, October 2, 2026** (per the release page). | For scheduled releases, `occurred_at` = the official calendar time (BLS ICS); `source_published_at` = the feed time; never show the 07:51 time as "released". |
| Publication date later than action date | EO 14434 signed 2026-09-29, FR publication 2026-10-02. | `occurred_at` = `signing_date` (or WH pubDate if earlier); FR events are their own transitions (`#pi_filed`, `#published`). |
| Local-time strings without a zone | Senate XML `September 30, 2026, 09:29 PM`; Clerk `<action-time time-etz="19:05">`. | Parse as `America/New_York` and store UTC. Keep the raw string in provenance. [verifier 2026-10-02: the raw Senate string has a **double space**: `September 30, 2026,  09:29 PM` (also in `modify_date`), so normalize whitespace before parsing. More traps found: the Senate Democrats RSS stamps a September item `Wed, 30 Sep 2026 23:27:00 EST` (wrong zone label in daylight time); GDELT names its 15-min files ~9 min ahead (`20261002170000.*` already listed at 16:57Z, `last-modified 16:50:57Z`).] |
| Last-modified vs first available | Senate vote XML `modify_date` 11:25 PM vs vote 9:29 PM; vote menu `Last-Modified: Thu, 01 Oct 2026 03:47:06 GMT`. | Measure our own `first_seen_at` latency per source and publish it on /status. That is the honest freshness number. |

### 2.7 Standards to borrow (verified 2026-10-02)

- **JSON Feed 1.1** (jsonfeed.org/version/1.1): top level `version`, `title`, `items`, `home_page_url`, `feed_url`, `hubs` (WebSub). Item `id` (stable across updates), `url`, `external_url`, `title`, `content_text`/`content_html`, `summary`, `date_published`, `date_modified`, `tags`, `attachments`. MIME `application/feed+json`. Extensions start with `_` ("Names must start with an _ character followed by a letter").
  **Use it as our public output format** (`/feed.json` plus per-tier and per-branch feeds), putting our event under `_ced` (e.g. `"_ced": {event_type, importance, object_key, thread_key}`). Free benefit: any feed reader can follow the dashboard. Also emit Atom for older readers.
- **ActivityStreams 2.0**: `Create`, `Update`, `Delete`, `Announce`, `Tombstone`, `published`, `updated`, `context`, `tag` (dfn anchors present in the W3C vocabulary page). Borrow the revision semantics; do not adopt AS2 JSON-LD wholesale.
- **schema.org**: `Event.eventStatus` with `EventScheduled` / `EventPostponed` / `EventRescheduled` / `EventCancelled` / `EventMovedOnline`; `previousStartDate`; `superEvent`/`subEvent` (a hearing within a day's session); `recordedIn`; `BroadcastEvent.isLiveBroadcast` (all verified present in `schemaorg-current-https.jsonld`).
- **Popolo** (last spec update 2022-11-10, adding `pronouns`): `VoteEvent` (organization, legislative_session, motion, result, group_results), `Vote` (voter, option, role), `Count`, `Motion` (identifier, requirement, result), `Speech` (creator, event, text, audio, video). Use its names in member-vote side files.
- **OCD-IDs** (opencivicdata, OCDEP 2): optional, only if state or local coverage is ever added.

---

## 3. Curation

### 3.1 Volume reality (what we must filter)

| Stream | Observed volume | EVIDENCE |
|---|---|---|
| FR documents | 94-128 per business day; Sept 1 to Oct 2 2026: 1,993 notices, 247 rules, 155 proposed rules, 31 presidential = 2,426 (82% notices) | FR API facets/type, curl 2026-10-02 |
| FR Public Inspection (today) | 107 docs (81 notices, 8 rules, 17 proposed rules, 1 presidential) | `public-inspection-documents/current.json` |
| FR `significant` flag | Among the first 200 rules and proposed rules since Sept 1: True 12, False 61, **null 127** | FR API `fields[]=significant` [verifier 2026-10-02: CONFIRMED for `order=newest` page 1. Across **all 402** rules and proposed rules since Sept 1 (3 pages): null 238 (59%), False 140, True 24. The conclusion stands.] |
| WH presidential actions | 30 items in feed back to ~Sept 18; 3 EOs on 2026-09-29 | WH RSS |
| Votes | 0 now (recess); in session, 0-40 per day per chamber | Clerk roll 300-314 on Sept 15-16 |

**Conclusion:** the FR `significant` flag is mostly null, so do not rely on it alone. Default-hiding FR notices (82%) is the biggest single noise cut.

### 3.2 Importance tiers (rules, v0)

| Tier | Meaning | Default UI | Rule examples (any match) |
|---|---|---|---|
| **P0 Breaking** | Push-notification worthy | Top banner and push | `vote.result` with GovTrack category rank 1 (veto override, impeachment, conviction); final passage of appropriations, CR, NDAA, reconciliation or debt limit; `law.enacted` or `bill.signed` for those; first sighting of an `executive_order`; national-emergency proclamations; FOMC statement (F12); SCOTUS opinion in an argued case; a scheduled presidential address going `live`. |
| **P1 Major** | Front page | Feed and "Today" | Passage votes (rank 3), cloture (rank 4) on major bills; cabinet or circuit-judge confirmations (rank 2); other EOs, proclamations and memoranda; SAPs; FR rules with `significant=true`; WH press briefing `live`; hearing with a cabinet official; BLS CPI or jobs report. |
| **P2 Notable** | Front page, collapsed | Feed | Suspension passages (rank 4), amendment votes (rank 5), other nominations, proposed rules (significant or with comment deadline), CBO/GAO reports, `floor.convened`/`adjourned`, bills on the Congress.gov **most-viewed** list moving. |
| **P3 Routine** | "All" view | All | Procedural votes (rank 6), non-significant rules, bill referrals, agency releases. |
| **P4 Noise/archive** | Search only | Hidden | FR notices (default), pro forma sessions, FR corrections, duplicate posts. |

Boosts and penalties (score 0-1 inside a tier; promotion of at most one tier):
- +: followed by the user (client-side); bill on the Congress.gov weekly most-viewed list; corroborated by 2 or more independent sources; keyword list (owner-editable: "national emergency", "tariff", "shutdown", "impeach", "Supreme Court").
- −: partisan-only source and not yet corroborated; parser confidence low.

### 3.3 Breaking-news detection (no ML needed at first)

1. **State transitions**: `vote.opened` (DomeWatch SSE for the House), `floor.convened`, `briefing.live` / `speech.live` (livestream detection; another dimension owns it).
2. **First sighting** of a P0 or P1 object on the fastest source (WH feed for EOs).
3. **Burst rule**: 3 or more events on the same `thread_key` within 15 min, or a new object mentioned by 2 or more official accounts within 10 min, is promoted to P0 candidate. Later: GDELT/Bluesky mention velocity (F12).

### 3.4 Partisan and editorial sources

- Each source carries `affiliation`: `official-nonpartisan` (Clerk, Senate LIS, FR, Press Galleries), `official-partisan` (DomeWatch, cloakrooms, party leadership sites), `executive-messaging` (WH Bluesky), `independent` (GovTrack), `press` (licensed only).
- Render partisan sources **only through factual fields** (times, roll numbers, bill IDs, schedule). Strip advocacy (e.g. DomeWatch floor-update text "Democrats are urged to vote no ... VOTE NO"). Show a small source chip ("via House Democratic Whip").
- Prefer symmetric sources. If only one party's tool provides a fact, label it and seek corroboration (Clerk XML).

### 3.5 Per-user filters and follows (static-site friendly)

- MVP: no accounts. Follows live in `localStorage` as lists of stable keys (`bioguide:*`, `bill:*`, `agency:*`, `official:*`, topic tags). Filtering happens client-side on the JSON feed.
- Topic tags come from cheap deterministic sources first: FR `agencies`, the Congress.gov policy area (CRS), and committee. AI tags come later.
- Later: Web Push. On iOS this needs the site installed to the Home Screen; Web Push for Home Screen web apps shipped in iOS/iPadOS **16.4** (WebKit blog, verified via search). So a PWA can deliver P0 pushes before a native iOS app exists.

### 3.6 AI summarization and classification: where, cost, honesty

**Where AI helps:** plain-English 1-2 sentence "what this does" for EOs, rules, proposed rules and bills; topic tagging; extracting "what is being voted on" from terse vote questions plus bill titles; clustering duplicate social posts.

**Where AI must not be used:**
- Vote counts, member votes, times, or anything a parser can read exactly.
- Transcripts from C-SPAN (ToS forbids AI use).
- Paywalled or wire content.
- Generating events or "facts" without a source document in the prompt.

**Pricing (verified 2026-10-02, platform.claude.com/docs/en/about-claude/pricing):**

| Model | Input $/MTok | Output $/MTok | Batch in/out | Cache hit | Notes |
|---|---|---|---|---|---|
| **Claude Haiku 4.5** `claude-haiku-4-5` | **1.00** | **5.00** | 0.50 / 2.50 | 0.10 | Min cacheable prefix **4,096 tokens** (Anthropic prompt-caching docs bundled with Claude Code, cached 2026-06; not re-fetched). [verifier 2026-10-02: CONFIRMED live. platform.claude.com/docs/en/build-with-claude/prompt-caching says "4,096 tokens for Claude Haiku 4.5", and $1/$5, batch $0.50/$2.50, cache hit $0.10 are confirmed on the pricing page.] Uses the older tokenizer (the pricing page says "Claude 4.7 and later" produce ~30% more tokens). |
| Claude Sonnet 5 `claude-sonnet-5` | 2.00 | 10.00 | 1.00 / 5.00 | 0.20 | Pricing page: the $2/$10 introductory price "is now the standard price". [verifier 2026-10-02: price CONFIRMED (footnote 3: "...announced at launch as introductory pricing through August 31, 2026, is now the standard price"). But Sonnet 5 is a "Claude 4.7 and later" model, so it uses the newer tokenizer ("approximately 30% more tokens for the same text"). The Sonnet 5 cost column below is therefore ~30% low. Also, **Claude Sonnet 5.5** is listed at the same $2/$10 with a 512-token minimum cacheable prefix.] |
| Claude Haiku 3.5 | 0.80 | 4.00 | | | "retired, except on Bedrock and Google Cloud". Do not use. |

**Monthly cost estimate.** Assumptions: about 1,500 input tokens per item (≈700 instructions plus ≈800 source excerpt; ~4 chars per token per Anthropic's FAQ) and 150 output tokens (summary plus JSON tags). That is (1,500 × $1 + 150 × $5) / 1e6 = **$0.00225 per item** on Haiku 4.5.

| Items/day summarized | Haiku 4.5 real-time | Haiku 4.5 Batch (≤24 h, 50% off) | Sonnet 5 real-time |
|---|---|---|---|
| 500 | $33.75 / mo | $16.88 / mo | $67.50 / mo |
| 1,000 | $67.50 / mo | $33.75 / mo | $135 / mo |
| 2,000 | $135 / mo | $67.50 / mo | $270 / mo |
| **Tiered: P0-P2 only (≈15% of 500-2,000 → 75-300/day)** | **$5-20 / mo** | n/a (P0-P2 need speed) | $10-41 / mo |

**Recommendation:** ship v1 with **no AI**: rules plus official titles, which is truthful and free. Add Haiku 4.5 for P0-P2 summaries behind a feature flag with a hard monthly budget cap (e.g. $10). Use the Batch API overnight for P3 "explainers" if wanted. Prompt caching is irrelevant unless the instruction block grows past 4,096 tokens.

**Honesty guardrails (make these code, not policy):**
1. AI only **annotates** events that already exist from a primary source. It never creates events.
2. The prompt contains only fetched public-domain source text plus instructions. The output is structured (JSON schema) and carries `claims[]`, each with a verbatim `quote`. **Verify each quote is a substring of the source; if any check fails, discard the summary** and fall back to `official_text`.
3. Every number, bill ID, EO number, date and proper name in the summary must appear in the source (regex check). Otherwise discard.
4. Always render `official_text` plus a source link next to the summary, and label it "AI summary · Haiku 4.5 · prompt v3".
5. Log prompt, version, input hash and output for every summary. For the first weeks, sample 5% for owner review.
6. Exclude licensed or AI-restricted sources (C-SPAN, Factba.se, news wires) from AI input entirely.

---

## 4. Operations: polling, health, drift, fixtures

### 4.1 Observed HTTP caching behaviour (conditional GET test, 2026-10-02 ~15:45-16:00Z)

Method: a GET to capture `ETag`/`Last-Modified`, then a repeat with `If-None-Match` (INM) and, separately, `If-Modified-Since` (IMS).

| Source URL | Status | Size | INM → | IMS → | Cache-Control | Polling advice |
|---|---|---|---|---|---|---|
| `https://www.whitehouse.gov/presidential-actions/feed/` | 200 | **593,364 B** | **304** | **304** | `max-age=300, must-revalidate` | 60 s with INM+IMS. **The same ETag `"1886323d..."` was served on `/briefings-statements/feed/`** (site-wide validator), so a 304 means "nothing changed anywhere". [verifier 2026-10-02: CONFIRMED site-wide (both feeds served ETag `"1ae6d600..."` at 16:37Z). The converse does not hold: the ETag changed at 16:19:11Z with no new item in either feed. Expect frequent 593 KB re-downloads on 200, and detect "new" by `<guid>` diff, not by status.] |
| `https://www.federalregister.gov/api/v1/documents.json?per_page=5&order=newest` | 200 | 4.5 KB | no ETag | no LM | `no-store, no-cache` | Poll every 2-5 min with `fields[]` to keep responses small. FR publishes daily, so most change happens around publication. |
| `https://www.federalregister.gov/api/v1/public-inspection-documents/current.json` | 200 | 173 KB | none | none | `no-store` | Every 5 min during business hours (PI `filed_at` seen at 08:45 and 11:15 ET). Hash the body to detect change. |
| `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml` | 200 | 165 KB | **200 (ETag ignored)** | **304** | none | Use **IMS only**. |
| `https://www.govinfo.gov/rss/bills.xml` | 200 | 133 KB | no ETag | **304** | none | IMS. |
| `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=10&output=atom` | 200 | 7 KB | none | none | `no-cache, no-store` | ≤1 req/min per form type is far under 10 req/s. **403 without a UA** ("Undeclared Automated Tool"). |
| `https://www.federalreserve.gov/feeds/press_all.xml` | 200 | 15 KB | **304** | **304** | none | 60-120 s with INM. |
| `https://data.gdeltproject.org/gdeltv2/lastupdate.txt` | 200 | tiny | ETag present (304 not tested) | LM present (304 not tested) | | Every 5 min. Use **https**; http returned a 301. [verifier 2026-10-02: now tested; **INM → 304, IMS → 304**. Note: the file lists `http://` zip URLs even though http 301s to https.] |
| `https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/20260928/20260928.xml` | 200 | 82 KB | none | none | `private, max-age=56` | Hash the body; poll 2-5 min in session. [verifier 2026-10-02: REFUTED as a working source — the 200 / 82 KB body is `Content-Type: text/html` reading **"File Not Found. The requested file was not found."** No floor schedule exists for the pro-forma week of 9/28. The newest real file, linked from docs.house.gov/floor, is `.../billsthisweek/20260914/20260914.xml` (200, `application/x-octet-stream`, 56.8 KB, root `<floorschedule congress-num="119" week-date="2026-09-14" ... update-date="2026-09-15T11:20:08.180">`). Validate the root element; hashing this body would have "detected" an error page. The Atom alternative `https://docs.house.gov/BillsThisWeek-RSS.xml` is **38.8 MB** (has ETag and Last-Modified), so poll it only with conditional GET.] |
| `https://www.bls.gov/schedule/news_release/bls.ics` | 200 | 81 KB | 200 | **304** | none | Daily, IMS. |
| `https://data.domewatch.us/v1/floor` | 200 | ~1 KB | **no ETag** | n/a | `public, max-age=2` | Anonymous budget 30/min, so ≤ every 5 s is impossible; use a key plus SSE. |
| `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?...` | 200 | | | | `public, max-age=30` | 30-60 s per account, or one Jetstream socket with `wantedDids`. |
| `https://clerk.house.gov/evs/2026/index.asp` | **404** | 254 KB | | | `no-cache, no-store` | Wrong index URL guess. Probe `rollNNN.xml` sequentially instead (below). |

**Bandwidth example:** polling the WH feed every 60 s without conditional GET is about 593 KB × 1,440 ≈ **854 MB/day**. With 304s it is a few KB per poll.

### 4.2 Observed failure modes ("liveness is not validity")

| Failure | Evidence (2026-10-02) | Guard |
|---|---|---|
| **HTTP 200 with an error body** | `GET https://clerk.house.gov/evs/2026/roll315.xml` returned 200, `Content-Length: 65`, body `<xml>Error sanitizing file "roll315.xml". Please try again.</xml>` (roll 315 does not exist; 314 is the last). | Validate root element and required fields. Treat anything under ~1 KB as "not yet". Never parse status code alone. [verifier 2026-10-02: CONFIRMED (roll315 200, Content-Length 65, same body). Second case: docs.house.gov `Download.aspx` returns **200 with an 82 KB HTML "File Not Found" page** for a missing week, so the "<1 KB" heuristic would NOT catch it. Check the content type and root element.] |
| **Test data in production** | DomeWatch `/floor`: `"question":"JOURNAL - This is a test votes #315, ..."`, timer timestamp 2026-09-16T23:01Z. | Quarantine rule: drop records whose text matches `/\btest vote/i` or whose roll number has no Clerk XML within N minutes. |
| **Stale endpoint behind a live service** | DomeWatch `/floor-updates` newest `publishedAt 2026-06-09`, while `/whip-notices` is current to 2026-09-16 and `/health` says ok. | Per-endpoint freshness SLO, not per-host. |
| **UA-based WAF blocking** | `https://www.state.gov/rss-feed/press-releases/feed/`: **403** with UA `current-events-dashboard-research/0.1 (email)`, **200** with `Mozilla/5.0 (compatible; current-events-dashboard-research/0.1; email)`. | Standard UA: `Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/<owner>/current-events-dashboard; <contact-email>)`. It satisfies the SEC's "declare company/app and email" requirement (the plain-email UA got 200 from the SEC) and passes simple WAFs. Keep a per-source UA override. |
| **Website blocks programmatic access, API allowed** | `https://www.federalregister.gov/reader-aids/policy/legal-status`: "Due to aggressive automated scraping of FederalRegister.gov and eCFR.gov, programmatic access to these sites is limited to access to our extensive developer APIs." The FR developer docs URL redirected WebFetch to `unblock.federalregister.gov`. | FR: API only, never HTML. |
| **HTML 403, RSS/API fine** | congress.gov HTML pages 403 (curl and WebFetch); `/rss/*.xml` 200. | Use the API and RSS. |
| **Throttled shared keys / IPs** | Congress.gov with `api_key=DEMO_KEY`: **429** `OVER_RATE_LIMIT`, header `X-Ratelimit-Limit: 10` (the documented DEMO_KEY limits are 30/hour and 50/day per IP; the IP was likely exhausted by parallel research agents). GDELT DOC API: "Please limit requests to one every 5 seconds". | Get a real api.data.gov key on day 1. Note the developer manual: the default 1,000 req/hour "limits are applied across all api.data.gov API requests" for a key; Congress.gov documents its own 5,000/hour. Implement per-host token buckets. |
| **Calendar silence is not an outage** | Senate out until Nov 9; House pro forma only. | Staleness alarms must be **calendar-aware**: in-session vs recess, business day vs weekend, FR publication days. |
| **Scheduler jitter** | GitHub Actions: "The shortest interval you can run scheduled workflows is once every 5 minutes"; "can be delayed during periods of high loads ... High load times include the start of every hour"; public-repo schedules "automatically disabled when no repository activity has occurred in 60 days". | Do not promise minute-level latency from Actions cron. Use cron offsets like `:07`, and keep the repo active. The always-on worker choice belongs to the architecture dimension. [verifier 2026-10-02: CONFIRMED, and the docs add: "If the load is sufficiently high enough, some queued jobs may be **dropped**". Scheduled runs can be skipped, not just delayed, so the dead-man's switch is required.] |

### 4.3 Source registry (one YAML entry per plugin)

```yaml
- id: wh.presidential_actions
  name: "White House: Presidential Actions (RSS)"
  url: https://www.whitehouse.gov/presidential-actions/feed/
  kind: rss
  features: [F9]
  branch: executive
  affiliation: executive-messaging
  license: us-gov-public-domain   # whitehouse.gov/copyright: "government-produced materials ... are not copyright protected"; third-party CC BY 3.0
  robots: "allowed (only /*?s= and /*&s= disallowed), fetched 2026-10-02"
  conditional_get: [etag, ims]    # both returned 304, 2026-10-02
  cadence: { business_hours: 60s, off_hours: 300s }
  freshness_slo: { alert_if_no_change_for: 72h, business_days_only: true }
  budget: { max_rps: 0.1 }
  validators: [rss_has_items>=10, newest_pubdate_not_future]
  fixtures: tests/fixtures/wh.presidential_actions/2026-10-02.xml
  parser: sources/wh_rss.py@0.1.0
```

Health page (`/status`): per source show `last_attempt`, `last_success`, `last_change`, `items_24h`, `median first_seen latency`, `schema_hash`, error streak, and current calendar state. Add a free external dead-man's switch: **Healthchecks.io Hobbyist $0, "Monitor 20 jobs", "100 log entries per job"** (pricing page fetched 2026-10-02). Ping per poller run.

### 4.4 Schema-drift detection

- One pydantic or JSON-Schema model per source. On validation failure, put the raw payload in `quarantine/<source>/<ts>`, emit `system.source_health{state: drift}`, and **fail closed** (publish nothing from that payload).
- Track a `schema_hash` = sorted set of key paths (JSON) or element paths (XML). A change in the hash fires a non-fatal alert even if validation passes.
- Keep **sentinel checks** per source (e.g. Clerk XML must contain `<rollcall-vote>` and 400 or more `<recorded-vote>`; WH RSS must have `<item>` with `pubDate`).

### 4.5 Recorded fixtures (critical this month)

- Congress is in recess, so the **first build must be fixture-driven**. Capture now (all fetched successfully today): Senate vote 256 XML, Clerk roll 300/310/314 XML, Clerk roll 315 (the "error sanitizing" body, as a negative fixture), DomeWatch `/floor` (with the test-vote record, as a negative fixture) and `/whip-notices`, Senate Press Gallery and Democratic Cloakroom author feeds, WH presidential-actions RSS, FR PI current and documents JSON, BLS ICS and empsit RSS, SEC Atom, Fed RSS, GDELT lastupdate.
- Store fixtures as `tests/fixtures/<source_id>/<YYYY-MM-DD>/<name>` with a sidecar `meta.json` (url, headers, fetched_at, UA). Tests replay fixtures and assert the normalized events (golden files).
- Add a `scripts/record_fixture.py <source_id>` helper so later sessions can refresh fixtures when live session days resume (Nov 9 onward).

### 4.6 Polite-polling defaults

- One in-flight request per host. Token bucket per host and per key: SEC ≤ 10 req/s (we will use ≤ 1/s); DomeWatch anonymous 30/min; GDELT DOC 1 per 5 s; api.data.gov 1,000/hour per key by default, shared across all api.data.gov APIs; Congress.gov 5,000/hour; FRED 120/min (third-party reported, UNVERIFIED on official docs); BEA 100 req/min (secondary source, UNVERIFIED). [verifier 2026-10-02: both now CONFIRMED on official docs. FRED (fred.stlouisfed.org/docs/api/fred/errors.html): "429 Too Many Requests (Up to 120 requests per minute are allowed before being served a 429 error code ...)". BEA user guide PDF (apps.bea.gov/api/_pdf/bea_web_service_api_user_guide.pdf): "Number of requests per minute (100), and/or Data volume retrieved per minute (100 MB), and/or Errors per minute (30)". GDELT DOC API returned **429 on the verifier's first request** from this IP, so shared IPs (CI runners) may be throttled already.]
- Exponential backoff with jitter on 429/5xx. Honour `Retry-After`. Circuit breaker after 5 consecutive failures, with alert.
- Respect robots `Crawl-delay` where we fetch pages (congress.gov 2 s, C-SPAN 4 s but we do not fetch C-SPAN, supremecourt.gov 1 s, GovTrack 30 s for `*`).

---

## 5. Legal / ToS

### 5.1 Baseline law

- **17 U.S.C. §105(a):** "Copyright protection under this title is not available for any work of the United States Government" (law.cornell.edu, fetched 2026-10-02). This covers works prepared by federal officers and employees as part of their official duties. FR text, the Congressional Record, roll calls and WH-authored releases are reusable.
- **whitehouse.gov/copyright** (fetched): "Pursuant to federal law, government-produced materials appearing on this site are not copyright protected ... Except where otherwise noted, third-party content on this site is licensed under a Creative Commons Attribution 3.0 License." Photos and embedded third-party media may need attribution.

### 5.2 Per-source table

| Source | Copyright | robots.txt (fetched 2026-10-02) | ToS / notes | Our policy |
|---|---|---|---|---|
| whitehouse.gov | Public domain (gov), third-party CC BY 3.0 | `Disallow: /*?s=`, `/*&s=`; otherwise allowed; sitemap listed | (above) | Ingest RSS. Attribute third-party media. |
| senate.gov | Public domain | **No robots.txt** (302 to a not-found page) | | Ingest XML and floor logs politely. |
| house.gov / clerk.house.gov | Public domain | house.gov: Drupal default (admin paths). clerk.house.gov: 404 (none) | | Ingest. |
| congress.gov | Public domain data | `Crawl-delay: 2`; disallows search; **blocks many AI agents** incl. `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `anthropic-ai` | HTML 403 to scripts | **API and RSS only**. Never point an AI browsing tool at congress.gov. |
| api.data.gov keys | n/a | n/a | No standalone ToS page found (`/tos/`, `/terms/` are 404). The developer manual covers limits: 1,000/hour default per key "across all api.data.gov API requests"; DEMO_KEY "30 requests per IP address per hour", "50 requests per IP address per day". Agency API terms apply (e.g. LOC for Congress.gov). | Register one key in the owner's name; keep it in CI secrets. |
| federalregister.gov | Public domain | Disallows `/documents/search`, `/public-inspection/search`, `/documents/current`, etc. | Website blocks programmatic access; API only. Its "legal status" page is itself behind the block. | API only. |
| govinfo.gov | Public domain | Drupal default; `/search/` disallowed | | RSS and API. |
| supremecourt.gov | Public domain | **`User-agent: * Disallow: /rss/`**, `Crawl-delay: 1` | | **Flag for the SCOTUS research dimension:** polling `/rss/` conflicts with robots. Prefer other official channels or get explicit OK. |
| GovTrack | Mixed (its analysis is its own) | `User-agent: * Disallow: /api`, `Crawl-delay: 30`; blocks AI bots | No code license | Cross-check use only, ≤1/min, with attribution. |
| C-SPAN | Floor video public domain; everything else C-SPAN copyright | AI bots disallowed `/`; `*`: `Disallow: /transcript`, `/video/cc/`, `Crawl-delay: 4` | Personal non-commercial; **no bots/spiders**; **no AI use incl. prompting**; no framing unless full page | **Link only.** No scraping, no AI. |
| Factba.se / Roll Call | Copyrighted compilation (FiscalNote) | rollcall.com allows `*`, blocks AI training bots; media-cdn robots.txt returns 403 (S3 AccessDenied) | **No terms page found (UNVERIFIED)** | Link only until the owner gets permission. |
| AP | Copyrighted | `Disallow: /*.rss`, `/api/v2/feed/`, `/apdata/` | Licensing via AP | Do not ingest. |
| Reuters | Copyrighted | Header notice: "Collection of content ... through automated means is prohibited unless you have prior written consent from Reuters" | | Do not ingest. |
| Politico | Copyrighted | robots.txt itself behind a Cloudflare challenge (403) | | Do not ingest. |
| DomeWatch API | House public data; API terms at domewatch.us/api/terms | n/a (SPA) | "attribution to DomeWatch is appreciated but not required. We reserve the right to revoke keys for abuse." | Use with key and attribution. Partisan text stripped. |
| Bluesky (AT Protocol) | Posts belong to authors; gov accounts' posts are generally US gov works | n/a | Public API. Rate limits **UNVERIFIED** (docs.bsky.app failed TLS from this box) [verifier: UNVERIFIED — reproduced: curl to docs.bsky.app failed with exit 60 (TLS) on 2026-10-02. The new docs site bsky.network/docs (/bluesky-api, /developer-guidelines) states no AppView rate limit. Observed: `Cache-Control: public, max-age=30` on getAuthorFeed.] | Ingest official accounts only. Link each post. |
| X (Twitter) | | | **docs.x.com:** pay-per-use, "$0.005 per resource" read, "$0.015 per request" post ($0.200 with URL), "No subscriptions", "capped at 3 million Post reads per monthly billing cycle" | Skip. |
| SEC EDGAR | Public filings | Drupal default | Fair access "10 requests per second"; must declare UA (SEC webmaster FAQ). data.sec.gov: "do not require any authentication"; "does not support Cross Origin Resource Scripting (CORS)" | Server-side only. Declared UA. |
| FRED | FRED ToU: series "may be owned by third parties and subject to copyright restrictions" | | Key required | Check series notes before display (e.g. stock indices). |
| NewsAPI.org | | | Free Developer plan: "100 requests per day", "Articles have a 24 hour delay", "cannot be used in a staging or production environment"; Business "$449 per month" | Not viable. |

### 5.3 Our own outputs

- Our curated feed republishes public-domain text and links. AI summaries are our own text; label them.
- Code license: owner decision (MIT or Apache-2.0 suggested). Data: CC0 for our normalized public-domain-derived data is consistent with unitedstates/* norms.
- No personal data in the MVP (follows in `localStorage`).

---

## 6. Future sources (F12): financial and world news

| Source | Endpoint(s) | Auth / cost | Freshness observed | Polling etiquette | EVIDENCE |
|---|---|---|---|---|---|
| **SEC EDGAR latest filings** | `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=40&output=atom`; `https://data.sec.gov/submissions/CIK##########.json` | Free; declared UA mandatory | SEC FAQ: filings "typically appear ... within 1-3 minutes of EDGAR system acceptance". data.sec.gov submissions: "typical processing delay of less than a second". Observed: newest 8-K `2026-10-02T11:41:34-04:00` at poll 12:00 ET. [verifier 2026-10-02: corrected quote. The SEC FAQ actually says "Filings are often available on sec.gov within 1-3 minutes of the EDGAR system timestamp. The lag time can increase significantly with high server load. We don't guarantee and cannot predict this lag." The data.sec.gov quote is CONFIRMED. Verifier poll at 12:55 ET saw the newest 8-K `<updated>2026-10-02T12:55:26-04:00`, so it was under a minute old.] | No ETag/LM; `no-cache`. ≤10 req/s policy. No CORS (server-side). | curl 2026-10-02 200 (5 entries); no-UA request 403 "Undeclared Automated Tool". |
| **Federal Reserve press RSS** | `https://www.federalreserve.gov/feeds/press_all.xml`, `/feeds/press_monetary.xml` | Free | FOMC statement item `Wed, 16 Sep 2026 18:00:00 GMT` (2:00 pm ET release time) | ETag and IMS both give 304 | curl 2026-10-02 200; monetary feed newest "Federal Reserve issues FOMC statement". |
| **BLS release calendar** | `https://www.bls.gov/schedule/news_release/bls.ics`; per-release RSS e.g. `https://www.bls.gov/feed/empsit.rss` | Free | ICS: 313 events through 2026-12-30; next: CPI and Real Earnings 2026-10-14 08:30 ET. RSS entry stamped 07:51 ET for the 08:30 release (§2.6). | IMS → 304 | curl 2026-10-02 200. empsit page "USDL-26-1549", "+29,000", "4.2 percent". |
| **Treasury auctions** | `https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json`; FiscalData `.../v1/accounting/od/upcoming_auctions` | Free, no key | Upcoming 13-week bill, auction 2026-10-05, announced 2026-10-01. FiscalData `record_date 2026-10-02`. | JSON; poll hourly | curl 2026-10-02 200 (37.8 KB). |
| **Treasury FiscalData (Daily Treasury Statement)** | `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?sort=-record_date` | Free, no key | `record_date 2026-09-30` available on 2026-10-02 (next business day or later) | Daily | curl 2026-10-02 200. |
| **FRED** | `fred/releases/dates`, `fred/release/dates`, `fred/series/updates` (official docs page) | Free key; 120 req/min (**third-party reported; UNVERIFIED** on the official page) [verifier 2026-10-02: CONFIRMED on the official errors page: "Up to 120 requests per minute are allowed before being served a 429 error code".] | n/a | | WebFetch FRED docs 2026-10-02 (endpoints confirmed; limits not stated on page); ToU fetched. |
| **BEA** | `apps.bea.gov/api` | Free UserID; "100 requests, 100 MB, and 30 errors per minute" (secondary source, **UNVERIFIED**) [verifier 2026-10-02: CONFIRMED in the official BEA API user guide PDF: "Number of requests per minute (100) ... Data volume retrieved per minute (100 MB) ... Errors per minute (30)".] | n/a | | WebSearch only. |
| **Census economic indicators calendar** | **UNVERIFIED** (my guessed `indicator.json` URL returned non-JSON) [verifier 2026-10-02: resolved — the Economic Briefing Room page links to an RSS 2.0 feed, `https://www.census.gov/economic-indicators/indicator.xml` (200, `application/xml`, 10.9 KB, `Last-Modified: Fri, 02 Oct 2026 14:08:37 GMT`). Newest item: "Manufacturers' Shipments, Inventories, and Orders". Its channel `pubDate` was `13:00:06 -0400`, about 3 h after the file's Last-Modified (another clock trap for §2.6). It is a release feed, not a forward calendar; a forward calendar is still UNVERIFIED.] | | | | curl 2026-10-02. |
| **GDELT 2.0** | `https://data.gdeltproject.org/gdeltv2/lastupdate.txt` points to 15-min export, mentions and GKG zips; DOC API `https://api.gdeltproject.org/api/v2/doc/doc` | Free | lastupdate showed `20261002160000.*` with `last-modified 15:51:11Z`, observed 15:58Z | lastupdate has ETag/LM. DOC API: "limit requests to one every 5 seconds" | curl 2026-10-02. [verifier 2026-10-02: lastupdate CONFIRMED (now `20261002170000.*`, INM/IMS → 304). The DOC API returned **HTTP 429** with that message on the verifier's first call, and it also says "All high-traffic users should switch to our ngrams dataset", so do not build on the DOC API from shared IPs.] |
| **UN News RSS** | `https://news.un.org/feed/subscribe/en/news/all/rss.xml` | Free | 30 items, newest `Fri, 02 Oct 2026 12:00:00 +0000` | | curl 2026-10-02 200. |
| **State Dept RSS** | `https://www.state.gov/rss-feed/press-releases/feed/` | Free | Feed `Last-Modified: Tue, 17 Mar 2026` (on the 403 response); content unverified [verifier 2026-10-02: content now verified with the compatible UA: 200, 51 KB, 10 items, newest `pubDate Fri, 02 Oct 2026 16:31:48 +0000`, `Last-Modified: Fri, 02 Oct 2026 16:32:45 GMT`. The feed is live; the March date was only on the 403 block page.] | Needs the `Mozilla/5.0 (compatible; ...)` UA | 403 plain UA, 200 compatible UA. |
| **Bluesky Jetstream** | `wss://jetstream{1,2}.us-{east,west}.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&wantedDids=...` | Free | Live commits streamed in under 10 s of connect | One socket; `wantedDids` up to 10,000 (per Jetstream docs via search) | `curl wss://jetstream2.us-east.bsky.network/...` 2026-10-02 received JSON commit events. [verifier 2026-10-02: v1 CONFIRMED (378 KB of commits in 8 s). Material 2026 change: Jetstream was rewritten ("Full-network archive, replay, and streaming service"; the old code moved to `bluesky-social/jetstream-legacy`). The official docs (bsky.network/docs/jetstream) list **v2** at `wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents?collections=...&dids=...&kinds=commit`, with a `cursor` on every event for resume and history replay. "A single subscription accepts up to 100 collections and 10,000 DIDs." v1 hosts `jetstream1/2.us-{east,west}` remain as legacy. On v2 the v1 parameter names (`wantedDids`) are rejected with a 400. Prefer v2 for gap-free restarts.] |
| Market quotes | Alpha Vantage: free "25 API requests per day"; cheapest premium "$49.99/month" for "75 requests/min"; realtime US data needs premium. Finnhub free tier **UNVERIFIED** (pricing page did not render). | | | | WebFetch 2026-10-02. |
| News wires (AP, Reuters) and NewsAPI | see §5.2 | | | | |
| Prior-art data | `LuxAlgo/market-trackers-data` (CC0 daily: congress trades, insider filings, 13F) | Free | daily | | gh 2026-10-02. |

**F12 recommendation:** add only **event-type** sources (Fed statements and minutes, BLS/BEA/Census releases tied to the calendar, Treasury auctions, SEC 8-Ks for a watchlist, GDELT topic spikes, UN/State releases). Do **not** show live market prices publicly. If wanted, show end-of-day index levels from a source whose license allows display, or nothing.

### 6.1 "Sources are plugins" architecture (concrete)

```
sources/
  base.py            # SourcePlugin protocol
  wh_rss/            # one folder per source
    plugin.py        # id, poll(), normalize()
    schema.py        # pydantic model of raw payload
    fixtures/        # recorded payloads + meta.json
    test_plugin.py   # replay -> golden events
registry/sources.yaml  # §4.3 entries (cadence, budgets, license, SLO, enabled flag)
```

```python
class SourcePlugin(Protocol):
    id: str                      # "wh.presidential_actions"
    category: str                # gov.exec | gov.leg | gov.reg | gov.judicial | fin | world | social
    def poll(self, state: PollState) -> PollResult: ...        # conditional GET; returns raw items + new state (etag/lm/cursor/hash)
    def normalize(self, raw: RawItem) -> list[Event]: ...      # pure function; no network; unit-tested on fixtures
    def validate(self, raw_payload: bytes) -> ValidationResult: ...  # sentinels + schema; fail closed
```

Rules:
- `normalize` is pure, so fixtures fully test it.
- `poll` owns politeness: UA, budget, backoff, conditional GET.
- **Watchers** (fast, cheap: RSS, SSE, Jetstream) are kept separate from **enrichers** (slow: fetching full documents, member votes, AI summaries), so a slow enricher never delays a breaking event.
- Each plugin declares `features`, `affiliation`, `license` and `enabled`. F12 plugins ship disabled until the owner opts in.

---

## 7. Ranked recommendations (for the first build sessions)

1. **Freeze event schema v0.1** (§2.2) as JSON Schema plus pydantic, with canonical object keys (§2.4) and the three clocks. Do this first; everything else depends on it.
2. **Fixture-first development.** Record today's real payloads (§4.5) into `tests/fixtures/`. Congress has no votes until at least Nov 9 (Senate) and only pro forma House sessions in early October.
3. **MVP source set (highest signal per effort, all verified today):**
   (a) WH `presidential-actions/feed/` and `briefings-statements/feed/` (ETag/IMS);
   (b) FR API documents plus Public Inspection;
   (c) Senate LIS vote XML and House Clerk roll XML, with congress-legislators for bioguide/LIS mapping;
   (d) Senate Press Gallery and Democratic Cloakroom Bluesky for floor status;
   (e) DomeWatch API for House floor and vote state (register a free key; strip partisan text);
   (f) Congress.gov API (free api.data.gov key) for bills, actions and nominations.
   [verifier 2026-10-02: add (g) the House Clerk floor proceedings XML `https://clerk.house.gov/floor/HDoc-119-2-FloorProceedings.xml`: official, nonpartisan, per-second timestamps, IMS → 304 (INM ignored), 2.2 MB, so use IMS. It covers F2, part of F8 and F5 context, and lets (d)/(e) be corroboration rather than the primary House floor source. Also note that Congress.gov now documents a **BETA** `/v3/house-vote/{congress}/{session}` endpoint (118th and 119th, legislation-linked votes only, per `Documentation/HouseRollCallVoteEndpoint.md`). It was not live-tested because DEMO_KEY returned 429.]
4. **Rules-based tiers** (§3.2) with GovTrack's vote rank. Hide FR notices by default. Ship the "Today" view with P0-P2.
5. **Publish JSON Feed 1.1 and Atom** of our own curated stream from the static site.
6. **Source health from day one:** `/status` page, calendar-aware SLOs, content validators (Clerk 200-error, DomeWatch test vote), plus Healthchecks.io dead-man pings.
7. **AI later, behind a flag:** Haiku 4.5, P0-P2 only, quote-verified, ~$5-20/month cap.
8. **Do not touch:** C-SPAN scraping or AI, Factba.se ingestion (until permission), AP, Reuters, Politico, X API, NewsAPI free tier, federalregister.gov HTML, congress.gov HTML, supremecourt.gov `/rss/` (pending a decision).
9. **F12 via disabled-by-default plugins:** Fed RSS, BLS ICS and RSS, Treasury auctions, SEC Atom watchlist, GDELT, UN News.

---

## 8. Gaps (no free source covers these well)

- **Live floor transcripts (F1/F2):** no public-domain real-time text. The Congressional Record is next-day. C-SPAN captions are AI- and bot-restricted. A path needs official House/Senate video plus our own speech-to-text (cost and compute question for the owner), or accepting next-day text.
- **Who is speaking now (F8):** no structured feed found. DomeWatch `/floor` has `now.text` (House state only); the Senate has nothing structured. Likely needs video/caption processing of official streams. [verifier 2026-10-02: partly corrected for the House. The Clerk floor proceedings XML records floor actions with named members and second-level times (e.g. "The Speaker designated the Honorable Dan Newhouse to act as Speaker pro tempore for today", 11:30:23 A.M.), and `/FloorSummary/ViewFloorActions` exposes the last action time ("11:33:10 AM", 10/01/2026). That gives presiding officer and floor actions, not a speaker-by-speaker log. The Senate gap is CONFIRMED: senate.gov floor activity pages are per-day reports.]
- **Senate live vote tallies (F5):** no Senate equivalent of DomeWatch SSE. Results arrive via the Press Gallery (minutes) and LIS XML (`modify_date` ~2 h after the vote for #256).
- **President's public schedule (F7):** the only structured aggregator found is Factba.se (licensing UNVERIFIED). Official WH structured schedule not confirmed by this dimension.
- **Exec officials speaking, beyond the President (F4):** no registry of cabinet appearances. It needs livestream detection (WH, agency YouTube channels) plus a curated officials registry (§2.5).
- **Exec-branch actor IDs:** no authoritative ID scheme; Wikidata contains fictional office-holders (observed).
- **Market prices (F12):** real-time quotes need paid licensing.
- **Rate limits for Bluesky public AppView:** UNVERIFIED (docs unreachable from this box due to a TLS name mismatch).

## 9. Risks

1. **Aggregator or API death** (history: Sunlight 2017, ProPublica 2024). Mitigation: primary-first, plugins, fixtures.
2. **Partisan bias leakage** from DomeWatch or cloakroom text. Mitigation: affiliation tags and field whitelists.
3. **Silent bad data** (200-with-error, test votes in prod, stale endpoints on healthy hosts). Mitigation: validators, quarantine, per-endpoint SLOs.
4. **WAF and UA policy changes** (state.gov UA filter, FR blocking, congress.gov 403). Mitigation: a standard compatible UA, per-source overrides, a health page.
5. **Recess and shutdown quietness** causing false alarms, or a real lapse in appropriations stopping updates. Mitigation: calendar-aware alerts and a "Congress in recess until ..." banner.
6. **AI honesty and licensing.** A hallucinated summary of an EO would be very damaging. C-SPAN forbids AI use. Mitigation: §3.6 guardrails, AI off by default.
7. **Latency promises vs free schedulers:** GitHub Actions cron is ≥5 min and is delayed at the top of the hour. "As it happens" may require an always-on worker (architecture dimension).
8. **Shared key budgets:** one api.data.gov key's 1,000/hour default applies across all api.data.gov APIs; parallel dev agents on one IP exhausted DEMO_KEY today.
9. **Timestamp mis-ordering** (pre-staged RSS times, local-time strings). Mitigation: three clocks, calendar-anchored `occurred_at`.
10. **Factba.se or C-SPAN legal exposure** if anyone "just scrapes it". Mitigation: the registry `license` field gates ingestion in code.

## 10. Questions only the owner can answer

1. **Budget:** is ~$5-20/month for AI summaries of important items OK, or keep AI off until you ask? Any budget for an always-on worker (minute-level latency) vs free-only (≥5 min)?
2. **Audience:** is the site just for you, or public? This affects licensing comfort, rate limits and whether "non-commercial" terms matter.
3. **Partisan official sources:** include DomeWatch, cloakroom and party-leadership feeds (fast, but partisan) with labels and fact-only rendering? Or nonpartisan sources only, accepting slower House data?
4. **Factba.se:** link-only, or should we email Roll Call/FiscalNote asking permission to use their public schedule JSON?
5. **Push notifications:** which event types should alert your phone (suggest P0 only), and do you want quiet hours?
6. **Accounts:** OK to register free keys in your name/email (api.data.gov for Congress.gov/GovInfo, DomeWatch Standard key, later FRED and BEA, Anthropic API if AI is enabled)?
7. **Supreme Court:** its robots.txt disallows `/rss/`. Should we avoid it, or poll its feeds at a low rate as a feed reader (a judgment call)?
8. **F12 markets:** skip prices entirely, end-of-day only, or budget for a licensed delayed-quote source later?
9. **Licenses:** code license (MIT or Apache-2.0?) and our derived data (CC0?).
10. **Transcripts:** is next-day official text (Congressional Record, WH transcripts) acceptable for v1, or is live speech-to-text of official streams a must-have (it implies compute cost)?

---

### Appendix A: Sources consulted (all accessed 2026-10-02)

- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing
- GovTrack API: https://www.govtrack.us/api/v2/vote ; about: https://www.govtrack.us/about-our-data ; vote categories: https://raw.githubusercontent.com/govtrack/govtrack.us-web/main/vote/models.py
- GovTrack bulk-data end (2016 post): https://congressionaldata.org/ending-govtracks-bulk-data-and-api/
- ProPublica: https://www.propublica.org/datastore/api/propublica-congress-api
- unitedstates org: https://github.com/unitedstates ; legislators JSON: https://unitedstates.github.io/congress-legislators/
- Congress.gov API README: https://github.com/LibraryOfCongress/api.congress.gov ; RSS: https://www.congress.gov/rss/
- DomeWatch API spec: https://data.domewatch.us/v1/openapi.json
- Bluesky public API: https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed ; Jetstream: wss://jetstream2.us-east.bsky.network/subscribe
- C-SPAN terms: https://www.c-span.org/about/termsAndConditions/ ; copyright: https://www.c-span.org/classroom/copyright/
- Factba.se calendar JSON: https://media-cdn.factba.se/rss/json/trump/calendar-full.json
- whitehouse.gov feeds and copyright: https://www.whitehouse.gov/presidential-actions/feed/ , https://www.whitehouse.gov/copyright/
- Federal Register API: https://www.federalregister.gov/api/v1/
- Senate vote XML: https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00256.xml ; House Clerk: https://clerk.house.gov/evs/2026/roll314.xml
- api.data.gov developer manual: https://api.data.gov/docs/developer-manual/
- SEC: https://www.sec.gov/about/webmaster-frequently-asked-questions , https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- JSON Feed 1.1: https://www.jsonfeed.org/version/1.1/ ; Popolo: https://www.popoloproject.com/specs/ ; schema.org vocab: https://schema.org/version/latest/schemaorg-current-https.jsonld ; AS2: https://www.w3.org/TR/activitystreams-vocabulary/
- 17 U.S.C. §105: https://www.law.cornell.edu/uscode/text/17/105
- X API pricing: https://docs.x.com/x-api/getting-started/pricing
- GitHub Actions schedule: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- Healthchecks.io pricing: https://healthchecks.io/pricing/
- NewsAPI pricing: https://newsapi.org/pricing ; Alpha Vantage premium: https://www.alphavantage.co/premium/
- WebKit Web Push (iOS 16.4): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- GDELT: https://data.gdeltproject.org/gdeltv2/lastupdate.txt ; UN News RSS: https://news.un.org/feed/subscribe/en/news/all/rss.xml
- Treasury: https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json , https://api.fiscaldata.treasury.gov/services/api/fiscal_service/
- BLS: https://www.bls.gov/schedule/news_release/bls.ics , https://www.bls.gov/feed/empsit.rss
- Fed: https://www.federalreserve.gov/feeds/press_all.xml
- FRED: https://fred.stlouisfed.org/docs/api/fred/ , https://fred.stlouisfed.org/docs/api/terms_of_use.html

---

## Verifier additions

Adversarial verification pass, 2026-10-02 16:37-17:25 UTC, from the same kind of Windows box (curl 8.19). All probes used `current-events-dashboard-research/0.1 (jst28323@gmail.com)` or the `Mozilla/5.0 (compatible; ...)` variant where a WAF required it. These are sources or changes the report missed that matter for the first build sessions.

1. **House Clerk floor proceedings XML (official, nonpartisan; F2, F8 partial, F5 context).**
   - Endpoint: `https://clerk.house.gov/floor/HDoc-119-2-FloorProceedings.xml`, referenced from the Clerk's `/FloorSummary` page script.
   - Observed: 200, `text/xml`, 2,206,834 B. `Last-Modified: Fri, 02 Oct 2026 06:00:28 GMT`, ETag present, `Cache-Control: max-age=0, no-cache, no-store`.
   - Conditional GET: **IMS → 304, INM → 200 (ETag ignored)**.
   - Content: root `<house-floor-activities lastBuildDate="2026-10-02T02:00:25">` holds 5,148 `<floor_action act-id=... update-date-time="20261001T11:30" unique-id=...>` entries with `<action_time>11:30:00 A.M. -</action_time>` and `<action_description>`. Latest entries are from 2026-10-01: convene, chaplain, "The Speaker designated the Honorable Dan Newhouse to act as Speaker pro tempore".
   - HTML fragment `https://clerk.house.gov/FloorSummary/ViewFloorActions` (200, 13.7 KB) carries hidden fields `hidden-last-floor-action-time = 11:33:10 AM` and `hidden-last-floor-action-desc = "The Speaker announced that the House do now adjourn ... next meeting is scheduled for 4:30 p.m. on October 5, 2026."` This is a cheap "has anything changed" probe.
   - **UNVERIFIED:** in-session latency (no session to time until Nov 9). Record it on the first session day against DomeWatch and the Democratic Cloakroom.
2. **Congress.gov API added a BETA House roll-call endpoint.**
   - Source: `LibraryOfCongress/api.congress.gov/Documentation/HouseRollCallVoteEndpoint.md`: "Beta House Roll Call Vote data in the API currently includes all House roll call votes in the 118th and 119th Congresses associated with a piece of legislation. Non-legislation related votes ... will be added at a later date." Example `https://api.congress.gov/v3/house-vote/118/2?api_key=...`.
   - The same docs folder also lists `CommitteeMeetingEndpoint.md`, `DailyCongressionalRecordEndpoint.md` and `HearingEndpoint.md`. There is **no Senate vote endpoint** in the listing.
   - **UNVERIFIED live:** DEMO_KEY returned 429 (`X-Ratelimit-Limit: 10`, `X-Ratelimit-Remaining: 0`). Test it with a real key on day 1.
3. **Bluesky Jetstream v2 (2026 rewrite).**
   - Endpoint: `wss://jetstream.us-{east,west}.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents?collections=app.bsky.feed.post&dids=<did>&kinds=commit`.
   - Every event carries a `cursor` for resume, and there is an HTTP replay and snapshot path.
   - Limits: "up to 100 collections and 10,000 DIDs ... rejected before the WebSocket upgrade".
   - Legacy v1 (`jetstream1/2...`, `/subscribe?wantedDids=`) still streams. v2 rejects the v1 parameter names with a 400.
   - Source: bsky.network/docs/jetstream (curl 200) and the repo README. Recommendation: use v2 so a worker restart does not lose posts.
4. **YouTube: use the keyless channel RSS, not the Data API, for WH video detection (F3/F4).**
   - Feed: `https://www.youtube.com/feeds/videos.xml?channel_id=UCYxRlFDqcWM4y7FfpiAN3KQ` (The White House) returned 200, 17.5 KB, 15 entries. Newest: `2026-10-02T01:20:38Z "America.Gov Launch"`, then `2026-10-01T21:28:56Z "President Trump Gaggles with Press at Dallas Fort Worth International Airport, Oct. 1, 2026"`.
   - Data API defaults (developers.google.com): "100 search.list calls ... and 10,000 units per day combined for all other endpoints". `search.list` costs 100 units and `videos.list` costs 1, so 5-second polling is impossible on a default key.
   - **UNVERIFIED:** whether upcoming or live streams appear in the RSS before or while they are live, which needs a live event to test.
5. **House Press Gallery (nonpartisan, pressgallery.house.gov).** The site banner carries the House vote schedule ("The House is in a district work period. Next votes are expected Monday, November 9"). It is the House counterpart to the Senate Press Gallery and fits the `official-nonpartisan` affiliation. No Bluesky account or feed was checked.
6. **docs.house.gov (F7) facts the report got wrong or missed.**
   - Weekly files exist only for legislative weeks. The latest is `.../billsthisweek/20260914/20260914.xml`, with root `<floorschedule ... update-date=...>` (has an update timestamp, so use it as the change detector).
   - Missing weeks return a 200 HTML "File Not Found" page.
   - The site-wide Atom feed `https://docs.house.gov/BillsThisWeek-RSS.xml` is **38.8 MB**. Never fetch it without IMS/INM.
7. **Senate floor schedule from the Senate Democrats RSS (partisan; F7).**
   - Feed: `https://www.democrats.senate.gov/feed` (200, `text/xml`). The newest item is "Schedule for Pro Forma Sessions and Monday November 9, 2026", stamped `Wed, 30 Sep 2026 23:27:00 EST`. The zone label is wrong for daylight time, so parse it defensively.
   - The Senate Republican Conference feed (`https://www.republican.senate.gov/feed/`, 200) is messaging. `/floor-updates/` is a 404.
   - Use the Democrats feed only as a labeled, corroborated schedule hint, with the Senate Press Gallery as the nonpartisan primary.
8. **Census Economic Briefing Room RSS (F12):** `https://www.census.gov/economic-indicators/indicator.xml`. Details are in the §6 note.
9. **America.gov launch (watch item).** WH Bluesky 2026-09-30T21:46Z: "Thousands of websites ➡️ ONE easy place. Hello, America. Welcome to America.Gov!" `https://america.gov/` returns a Cloudflare JS challenge (403 "Just a moment...") to curl. **UNVERIFIED:** whether this consolidation will move or redirect agency press pages or feeds. Re-check agency feed URLs monthly; the source-health page should catch moves.
10. **Model note for §3.6.** Claude Sonnet 5.5 (same $2/$10, 512-token minimum cacheable prefix, batch $1/$5) is listed on the pricing page alongside Sonnet 5. The Haiku 4.5 recommendation and its cost math are unaffected.

## Verification ledger

| # | Claim (as stated in report) | Method | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Senate adjourned except pro forma until Mon Nov 9, 3:00 pm (Senate Press Gallery post 2026-10-01 14:33Z) | Bluesky getAuthorFeed senatepress.bsky.social | CONFIRMED | 200; newest createdAt 2026-10-01T14:33:55.387Z with the quoted text; adjourn post 03:44:56Z ("adjourned at 11:24 p.m.") |
| 2 | House adjourned until Mon Oct 5 4:30 pm pro forma (Dem Cloakroom 15:34Z), ~1-2 min latency | getAuthorFeed democraticcloakroom.house.gov | CONFIRMED | newest 2026-10-01T15:34:57Z "adjourned at 11:33 am"; 1,600 followers; Bluesky verification present |
| 3 | Last House roll call #314, 2026-09-16 7:05 PM ET | curl clerk.house.gov/evs/2026/roll314.xml | CONFIRMED | 200, 94,344 B; `<rollcall-num>314`, `<action-date>16-Sep-2026`, `time-etz="19:05"`; 433 `<recorded-vote>` |
| 4 | roll315.xml returns 200 with a 65-byte error body | curl | CONFIRMED | 200, Content-Length 65, `<xml>Error sanitizing file "roll315.xml". Please try again.</xml>` |
| 5 | Last Senate roll call #256, 9:29 PM ET, PN1129 47-41, modify 11:25 PM | curl vote_119_2_00256.xml | CONFIRMED | `<vote_date>September 30, 2026,  09:29 PM` (double space), `<modify_date>... 11:25 PM`, yeas 47 nays 41 absent 12; vote 257 → 301 |
| 6 | Senate vote menu: INM ignored, IMS → 304 | curl conditional | CONFIRMED | INM 200, IMS 304; `Last-Modified: Thu, 01 Oct 2026 03:47:06 GMT` |
| 7 | ProPublica Congress API dead ("no longer available", updated July 10, 2024) | curl propublica datastore page | CONFIRMED | 200; quoted text present |
| 8 | GovTrack bulk data/API end announced, API v2 still live | curl congressionaldata.org post; GovTrack API | CONFIRMED | post dated Dec 12, 2016, "terminate next summer"; api/v2/vote 200 `total_count 113719`, newest s256 created 2026-09-30T21:29:00 |
| 9 | GovTrack votes "roughly hourly"; bill status "next business day" | curl /about-our-data | CONFIRMED | both phrases present |
| 10 | GovTrack robots `*`: Disallow /api, Crawl-delay 30; blocks AI bots | curl robots.txt | CONFIRMED | lines 57-67; ClaudeBot listed |
| 11 | GovTrack vote importance ranks (veto_override 1 ... unknown 8) | curl vote/models.py | CONFIRMED | `VoteCategory` enum, importance values match exactly |
| 12 | govtrack.us-web has no license | GitHub API | CONFIRMED | `license: null` |
| 13 | unitedstates/congress CC0-1.0, pushed 2025-10-05 | GitHub API | CONFIRMED | CC0-1.0, 2025-10-05T11:46:32Z, 1,063 stars |
| 14 | congress-legislators: 539 current; executive.json 80, last = Vance (V000137, S421, Q28935729) | curl JSON | CONFIRMED | 539 (100 sen / 439 house incl. delegates); 80 exec; IDs match |
| 15 | statements-of-administration-policy is CC0 (org) | GitHub API + repo listing | REFUTED | `license: null`; no LICENSE file |
| 16 | congressional-record is CC0 (org) | GitHub API + LICENSE | REFUTED | BSD-style "Copyright (c) 2015, Nick Judd" |
| 17 | federalregister-api-core pushed 2026-09-26 | GitHub API | REFUTED | pushed_at 2025-02-10; last commit 2025-01-28; 2026-09-26 is updated_at |
| 18 | LuxAlgo market-trackers CC0 | GitHub API | REFUTED (partial) | data repo CC0-1.0; code repo MIT |
| 19 | Congress.gov API "5,000 requests per hour" | curl api.congress.gov README | CONFIRMED | README line 27 |
| 20 | Congress.gov RSS (notification, house/senate-floor-today, most-viewed) all 200; most-viewed incl. H.R.6509, S.4668, H.R.1, S.2296, H.R.5334 | curl | CONFIRMED | all 200; floor-today feeds are empty channels during recess; most-viewed "Week of September 27, 2026" |
| 21 | congress.gov HTML 403; robots Crawl-delay 2; blocks ClaudeBot / Claude-User / Claude-SearchBot / anthropic-ai | curl | CONFIRMED | bill page 403; robots lines 2, 27, 41-44 |
| 22 | Congress.gov email alerts are "once a day" | not reachable (HTML 403 to scripts) | UNVERIFIABLE | congress.gov blocks automated and Claude agents |
| 23 | DomeWatch API: OpenAPI 3.1, 1.0.0-draft, endpoint list, anon 30/min + 6/min tallies, Standard 60 req/s + 2 SSE, "attribution ... appreciated but not required" | curl /v1/openapi.json | CONFIRMED | openapi 3.1.0, version 1.0.0-draft, 13 paths. Also Standard vote-tally polling is 60 req/min (omitted by report) |
| 24 | DomeWatch /floor: test vote #315 in production, x-ratelimit-limit 30, no ETag | curl | CONFIRMED | `"question":"JOURNAL  - This is a test votes #315..."`, timer 2026-09-16T23:01:11Z; no ETag header; `cache-control: public, max-age=2` |
| 25 | DomeWatch /floor-updates stale (2026-06-09); /whip-notices newest 2026-09-16T12:01:27 | curl | CONFIRMED | exact timestamps match; /health 200 ok |
| 26 | Senate Press Gallery latency ~3 min (pro forma) and ~20 min (adjourn) | post text vs createdAt | CONFIRMED | 10:30 → 14:33:55Z; 11:24 PM → 03:44:56Z |
| 27 | senateppg stale since 2025-07-15; repcloakroom stale since 2026-03-06 | getAuthorFeed | CONFIRMED | newest 2025-07-15T16:17Z; 2026-03-06T06:30Z with t.co links |
| 28 | WH Bluesky verified, 16,378 followers, 79 posts, newest 2026-10-02T01:17Z | getProfile/getAuthorFeed | CONFIRMED | exact match |
| 29 | Bluesky AppView `Cache-Control: public, max-age=30` | response headers | CONFIRMED | all 5 author feeds |
| 30 | C-SPAN Terms (eff. Dec 15, 2025): no bot/spider; no AI incl. prompting; personal non-commercial | curl terms page | CONFIRMED | all three quotes present |
| 31 | C-SPAN robots: Disallow /transcript, /video/cc/, Crawl-delay 4; ClaudeBot disallowed | curl robots | CONFIRMED | lines 44, 45, 53; ClaudeBot group `Disallow: /` |
| 32 | House/Senate floor video is public domain (C-SPAN classroom page) | curl | UNVERIFIABLE | page returned 202 bot interstitial |
| 33 | Factba.se calendar JSON public: ~2.68 MB, ETag, max-age=60, fields, 10-03 Dayton records | curl | CONFIRMED | 200, 2,677,548 B, 6,369 records (was 6,368), Last-Modified 16:26:56Z, fields incl. `coverage`, `video_url` |
| 34 | No Roll Call / Factba.se terms page found | curl rollcall.com/terms*, factbase footer, fiscalnote.com/terms* | UNVERIFIABLE | rollcall terms paths 404; footer links only FiscalNote privacy; fiscalnote.com terms paths 403 (WAF) |
| 35 | Punchbowl Premium $385/yr, Premium+ $1200/yr (marked UNVERIFIED) | curl punchbowl.news/pricing/ | CONFIRMED | both prices present |
| 36 | The Capitol Wire monitors docs.house.gov + majorityleader.gov "every 60 seconds" | WebSearch (thecapitolwire.com, rebootdemocracy.ai) | CONFIRMED | search results quote "every 60 seconds" and "AI policy briefs" |
| 37 | OpenCongress.app alerts "within about 15 minutes, 8am to 11pm ET"; covers France | curl homepage | CONFIRMED | both strings present |
| 38 | Congress Vote Tracker: "not a minute-by-minute ticker", "refreshes several times a day on weekdays" | curl home, /about, /methodology | UNVERIFIABLE | quotes not found; homepage says "updated daily" |
| 39 | WhiteHouseStream-Scraper YouTube polling "every 5 seconds" is a reusable F4 pattern | README + Google quota docs | REFUTED | README confirms 5 s via YouTube Data API; default quota 10,000 units/day, 100 search.list/day, so infeasible |
| 40 | Open States v3 needs an API key; openstates-core MIT, push 2026-09-29 | curl + GitHub API | CONFIRMED | 403 "Must provide API Key as ?apikey or X-API-KEY"; MIT, 2026-09-29T18:44Z |
| 41 | Wikidata SPARQL for current VP/SecState returns fictional characters | live SPARQL | CONFIRMED | Jack Ryan Q1068314, Elizabeth McCord Q21233561, John Hoynes Q9012447 + many more; real ones are P31=Q5 |
| 42 | EO 14434 = FR 2026-20321, signed 2026-09-29, published 2026-10-02; PI filed 2026-10-01T11:15-04:00 with title "(EO 14434)  " | FR API documents + PI by number | CONFIRMED | exact fields and trailing spaces |
| 43 | WH pubDate Tue 29 Sep 2026 21:17:25 for that EO; WH → PI ≈ +42 h | WH RSS | CONFIRMED | pubDate present, category "Executive Orders"; 21:17Z → 15:15Z +2 d = 42 h |
| 44 | FR Sept 1 to Oct 2: 1,993 notices, 247 rules, 155 proposed, 31 presidential (82% notices) | FR facets/type | CONFIRMED | identical JSON counts |
| 45 | FR PI current: 107 docs (81/8/17/1); filed_at 08:45 and 11:15 ET | PI current.json | CONFIRMED | identical counts; 173,464 B; `no-store`; also 14:00/16:15 on 10-01 and some null filed_at |
| 46 | FR `significant`: True 12 / False 61 / null 127 of first 200 | FR API | CONFIRMED | exact for order=newest; full 402: 24/140/238 |
| 47 | FR documents.json: no ETag, `no-store` | headers | CONFIRMED | `Cache-Control: no-store, no-cache, must-revalidate, private`, 4,550 B |
| 48 | FR website blocks programmatic access; API allowed | curl legal-status → 302 unblock.federalregister.gov | CONFIRMED | quote present on unblock page; FR robots disallows /documents/search etc. |
| 49 | Haiku 4.5 $1/$5, batch $0.50/$2.50, cache hit $0.10; Haiku 3.5 retired except Bedrock/GC | pricing page (curl + WebFetch) | CONFIRMED | table rows match |
| 50 | Sonnet 5 $2/$10 "now the standard price" | pricing page | CONFIRMED | footnote 3 verbatim; caveat: newer tokenizer (~30% more tokens) not reflected in Sonnet column |
| 51 | Haiku 4.5 minimum cacheable prefix 4,096 tokens | prompt-caching doc | CONFIRMED | "4,096 tokens for Claude Haiku 4.5" |
| 52 | Cost math: $0.00225/item; $33.75 / $67.50 / $135 per month; tiered $5-20 | recomputed | CONFIRMED | (1500×1 + 150×5)/1e6; 15% of 500-2,000/day × 30 × 0.00225 = $5.06-$20.25 |
| 53 | WH presidential-actions feed 593,364 B, 30 items, INM/IMS → 304, `max-age=300, must-revalidate` | curl | CONFIRMED | exact byte count; both 304 |
| 54 | WH ETag is site-wide (same on briefings-statements) | curl both feeds | CONFIRMED | both `"1ae6d600..."` at 16:37Z |
| 55 | With 304s, WH polling is "a few KB per poll" (implies 200 = feed changed) | ETag over time vs lastBuildDate | REFUTED | ETag changed (16:19:11Z) with no new item since 29 Sep; full 593 KB refetch whenever anything site-wide changes |
| 56 | GovInfo bills RSS: no ETag, IMS → 304 | curl | CONFIRMED | 132,801 B; IMS 304 |
| 57 | SEC Atom: 403 without UA ("Undeclared Automated Tool"); no-cache; email UA OK | curl | CONFIRMED | 403 + string; 200 with UA; `no-cache, no-store` |
| 58 | SEC FAQ: filings "typically appear ... within 1-3 minutes of EDGAR system acceptance" | curl SEC FAQ | REFUTED (wording) | actual: "often available on sec.gov within 1-3 minutes of the EDGAR system timestamp. The lag time can increase significantly with high server load" |
| 59 | SEC 10 req/s; data.sec.gov no auth, <1 s delay, no CORS | curl SEC pages | CONFIRMED | all quotes present |
| 60 | Fed press RSS: INM and IMS → 304; FOMC statement 16 Sep 18:00 GMT | curl | CONFIRMED | 304/304 (weak ETag `W/"..."` on press_all); monetary feed top item matches |
| 61 | GDELT lastupdate: https, ETag/LM present (304 untested); http 301 | curl | CONFIRMED | INM 304, IMS 304 now tested; http 301 |
| 62 | GDELT DOC API "limit requests to one every 5 seconds" | curl one call | CONFIRMED | message returned with **HTTP 429** on first call |
| 63 | docs.house.gov `billsthisweek/20260928/20260928.xml` 200, 82 KB, pollable | curl + content-type | REFUTED | body is HTML "File Not Found"; real latest file is 20260914 |
| 64 | BLS ICS: IMS → 304, INM → 200, 313 events to 2026-12-30, next CPI 10-14 08:30 | curl | CONFIRMED | all match |
| 65 | BLS empsit.rss entry stamped 07:51 ET for 08:30 release; +29,000, 4.2% | curl | CONFIRMED | `2026-10-02T07:51:08.289-04:00`; pre-staging since Jul 2026 (earlier entries are 08:30) |
| 66 | Clerk `evs/2026/index.asp` is 404 | curl | CONFIRMED | 404 (91.7 KB here, not 254 KB) |
| 67 | state.gov RSS: 403 plain UA, 200 compatible UA | curl both | CONFIRMED | 403 / 200 (51 KB, 10 items, newest 2026-10-02 16:31Z) |
| 68 | DEMO_KEY on Congress.gov → 429, `X-Ratelimit-Limit: 10` | curl house-vote endpoint | CONFIRMED | identical 429 body and headers |
| 69 | api.data.gov: default 1,000/hour "across all api.data.gov API requests"; DEMO_KEY 30/hr, 50/day per IP | curl developer manual | CONFIRMED | quotes present ("Rate limits may vary by service") |
| 70 | GitHub Actions: ≥5 min interval; delays at top of hour; disabled after 60 days inactivity | curl GitHub docs | CONFIRMED | quotes present; also "some queued jobs may be dropped" |
| 71 | Healthchecks.io Hobbyist $0, 20 jobs, 100 log entries | curl pricing | CONFIRMED | exact |
| 72 | JSON Feed 1.1: `application/feed+json`, `_` extensions, stable id, `hubs` | curl jsonfeed.org | CONFIRMED | all quotes present |
| 73 | schema.org has EventScheduled/Postponed/Rescheduled/Cancelled/MovedOnline, isLiveBroadcast, previousStartDate, recordedIn, superEvent | grep jsonld | CONFIRMED | each `schema:` term present |
| 74 | Popolo last change 2022-11-10 (pronouns) | curl specs | CONFIRMED | "2022-11-10: Add a pronouns property" |
| 75 | 17 U.S.C. §105(a) quote; whitehouse.gov/copyright quotes | curl Cornell LII, WH | CONFIRMED | verbatim |
| 76 | robots: WH (/*?s=, /*&s=), senate.gov none (302), clerk 404, supremecourt `Disallow: /rss/` Crawl-delay 1 | curl | CONFIRMED | all match |
| 77 | AP robots disallow /*.rss, /api/v2/feed/, /apdata/; Reuters automated-collection notice; Politico robots 403 | curl | CONFIRMED | lines 8/16/18; notice verbatim; 403 |
| 78 | X API: $0.005/read, $0.015 post, $0.200 with URL, no subscriptions, 3M reads cap | WebFetch docs.x.com | CONFIRMED | verbatim |
| 79 | NewsAPI Developer 100/day, 24 h delay, no staging/prod; Business $449/mo | curl newsapi.org/pricing | CONFIRMED | verbatim |
| 80 | Alpha Vantage free 25/day; $49.99/mo for 75 req/min | curl premium page | CONFIRMED | verbatim |
| 81 | Treasury upcoming auctions JSON 37.8 KB; 13-week bill auction 10-05 announced 10-01; FiscalData record_date 10-02 | curl | CONFIRMED | 37,782 B; matches |
| 82 | FiscalData DTS record_date 2026-09-30 available 2026-10-02 | curl | CONFIRMED | newest record_date 2026-09-30 at 17:0xZ |
| 83 | FRED 120 req/min (marked UNVERIFIED) | curl FRED errors page | CONFIRMED | "Up to 120 requests per minute" |
| 84 | BEA 100 req / 100 MB / 30 errors per minute (marked UNVERIFIED) | BEA user guide PDF | CONFIRMED | verbatim |
| 85 | Census indicators calendar UNVERIFIED | curl census pages | CONFIRMED (resolved) | RSS at /economic-indicators/indicator.xml, 200 |
| 86 | UN News RSS 30 items, newest Fri 02 Oct 12:00 +0000 | curl | CONFIRMED | 30 items; matches |
| 87 | Jetstream WebSocket via plain curl; wantedDids up to 10,000 | curl wss; bsky.network docs | CONFIRMED | 378 KB of commits in 8 s; docs: 10,000 DIDs. Report missed the v2 rewrite |
| 88 | Bluesky AppView rate limits UNVERIFIED (docs.bsky.app TLS failure) | curl | UNVERIFIABLE | reproduced curl exit 60; bsky.network docs state no AppView limit |
| 89 | iOS/iPadOS 16.4 brought Web Push for Home Screen web apps | curl WebKit blog 13878 | CONFIRMED | "release of iOS and iPadOS 16.4 beta 1, and with it comes support for Web Push ... for Home Screen web apps" |
| 90 | "DomeWatch and the cloakrooms are the fastest House signals" | Clerk FloorSummary page script → XML | UNVERIFIABLE (omission found) | an official, nonpartisan Clerk floor XML with per-second action times exists (Verifier additions #1); no live session to compare latency until Nov 9 |
| 91 | Gaps §8: "Who is speaking now (F8): no structured feed found" | Clerk floor XML content | REFUTED (House, partial) | XML names the presiding member and floor actions with times; no speaker-by-speaker log. Senate gap confirmed |

# Congress — bills, committees/hearings, Congressional Record; Judiciary

Research dimension: **LEGISLATION, COMMITTEES, RECORD, COURTS** (primary features **F7**, **F11**; touches F6, F9, F10).
Researched and live-probed **2026-10-02, 15:30–16:25 UTC** (Fri, 11:30–12:25 ET) with `curl`
(User-Agent `current-events-dashboard-research/0.1 (jst28323@gmail.com)`), WebFetch and WebSearch.
Anything that was not confirmed live is marked **UNVERIFIED** with the reason.

> **Calendar context at probe time (matters when reading the evidence).** The Senate held a pro forma session on Oct 1
> (10:30:06–10:30:41 a.m.) and is next in at 4 p.m. on Mon Oct 5 (Daily Digest D961). The House's latest "Bills This
> Week" package is for the week of 2026-09-14, so both chamber "floor today" feeds were empty. The Supreme Court's
> October Term 2026 starts **Mon 2026-10-05**, with arguments that morning. So in a typical week every source below
> produces much more volume than it did today.

---

## 0. TL;DR

1. **Most legislative data in this area arrives the next morning.** It is not live. Measured case: the Senate cloture
   vote on H.R. 9340 happened at `2026-09-30T17:45:52Z` (Roll Call 254). Congress.gov's bill `updateDate` became
   `2026-10-01T11:08:29Z` (**+17.4 h**). The key-free GovInfo BILLSTATUS file was re-published at `2026-10-01T12:34:10Z`
   (**+18.8 h**). Congress.gov's own help page says "current congress information is usually updated the morning after
   House or Senate chamber sessions adjourn" and gives roughly 8:00 a.m. for bill actions. For same-day floor action
   you need the House Clerk and Senate floor sources, which belong to the F1/F2/F5/F6 dimension.
   **[verifier 2026-10-02: corrected — the +17.4 h / +18.8 h figures are not latency measurements.** `updateDate` and
   the file's `Last-Modified` record the *latest* edit, not when the vote action first appeared. Proof: at 16:23Z today
   the same BILLSTATUS file had `updateDate` `2026-10-02T15:39:58Z` and `Last-Modified` `2026-10-02T16:23:08Z`. The edit
   was a citation fix ("CR S5299" became "CR S5199"), so the same method would now report +45.9 h. GovInfo's
   `billstatus-batch.xml` shows `BILLSTATUS-119hr9340.xml` was re-published in the 2026-09-30 batches at 14:42Z, 16:35Z
   and **20:31:13Z, which is 2 h 45 min after the 17:45:52Z vote**. So Senate floor actions may reach BILLSTATUS (and
   so Congress.gov) the **same day**. Whether the 20:31Z version already held the vote cannot be checked now, because
   old file versions are not kept, so first-appearance latency stays **UNVERIFIED**. The official coverage page still
   says "usually updated the morning after" with actions at ~8:00 a.m. (WebSearch snippet; the page returns 403 to
   curl/WebFetch). Measure this on a session day before labelling all bill data "next morning".]
2. **The near-real-time sources here are agenda and court sources:**
   - the House Committee Repository (meetings posted at least about 7 days ahead and updated continuously),
   - Senate `hearings.xml` (regenerated about every 2 h),
   - Congress.gov `/committee-meeting` (updateDates during the day, e.g. `14:41:40Z` today),
   - supremecourt.gov (opinions, orders and docket JSON are posted at the moment of release, plus live argument audio),
   - CourtListener docket alerts ("within seconds" for courts that have RSS).
3. **The Congress.gov API needs a real key.** With DEMO_KEY the server sent `X-Ratelimit-Limit: 10`. Parallel research
   agents used it up and the next call got **HTTP 429 `OVER_RATE_LIMIT`** at 16:07Z. A free api.data.gov key gives
   **5,000 req/h** (Congress.gov README). The same key gives **36,000 req/h** on GovInfo (usgpo/api README).
   [verifier 2026-10-02: confirmed both README figures. Added: the DEMO_KEY quota on both APIs is a **daily** quota, not
   an hourly one. At 17:13:46Z Congress.gov's 429 carried `Retry-After: 24374` and GovInfo's 429 at 17:14:13Z carried
   `Retry-After: 24347`. Both point to exactly 00:00 UTC, so DEMO_KEY gives about 10 requests per UTC day per IP on each
   API. The api.data.gov generic default (30/h, 50/day) does not apply here.]
4. **Congress.gov responses are CDN-cached for 30 min.** Headers show `Cache-Control: public, max-age=1800`, and one
   response came back as `Cf-Cache-Status: HIT` with `Age: 542`. List queries that carry a changing `fromDateTime`
   came back `MISS`, so polling with a rolling `fromDateTime` avoids stale lists. Detail URLs can still be up to 30 min
   stale.
5. **GovInfo has a lot that needs no key.** There are 100-item RSS feeds per collection (`If-Modified-Since` returns
   **304**), BILLSTATUS bulk XML plus a "batch complete" RSS (batches every ~3–5 h), a link service and Daily Digest
   PDF/HTML. The Congressional Record arrives the next morning: the Oct 1 issue was published at
   `2026-10-02T11:17Z` (07:17 ET). Some issues lag about 2 days: the Sep 29 issue appeared at `2026-10-02T03:18Z`.
   [verifier 2026-10-02: corrected — RSS `pubDate` and API `lastModified` are the *last* (re)publication times, not
   first publication. `crec.xml` even carries re-published historical issues such as `CREC-1996-07-10`. The MODS for
   `CREC-2026-09-29` shows `recordCreationDate` 2026-10-01 and `recordChangeDate` 2026-10-02, so the package first
   appeared on 10/01 and the 10/02 03:18Z time is a revision. The worse lag is longer than 2 days: `CREC-2026-09-16` has
   `recordCreationDate` **2026-09-22 (6 days)**. Plan for a next-morning to about one-week tail.]
6. **The Compilation of Presidential Documents (DCPD/CPD) is archival, not live.** EO 14423 has `dateIssued`
   2026-08-28 and was published to GovInfo 2026-10-01 (about **34 days** later). Do not use it for F9 timeliness.
7. **CourtListener cut its free API limits** to **5/min, 50/h, 125/day** for authenticated users. The docs page says
   "as of May 2026". Poll its key-free **Atom feeds** instead and keep the API for enrichment.
   [verifier 2026-10-02: limits confirmed verbatim on wiki.free.law. The change date is **May 7, 2026**
   (free.law/2026/05/07/api-included-in-memberships; the old default was 5,000/h, and accounts that had made ≥1,000
   requests were grandfathered). Tier 1 membership costs **$10/mo** and gives 10/min, 75/h, 300/day plus unlimited docket
   alerts and real-time opinion alerts (free.law/membership). Caveat on the Atom alternative: the Atom feeds **ignore
   `If-Modified-Since`** (IMS returned 200), and their `Last-Modified` is midnight PT of the newest entry's date. Each
   feed holds only 20 entries.]
8. **Supreme Court:** there is no official opinions RSS or API. The slip-opinion and orders HTML pages (both answer
   `If-Modified-Since` with 304) and the per-docket **JSON/RSS** (`/rss/cases/JSON/{docket}.json`, `max-age=120`) are
   the real-time primitives. Argument transcripts are posted the same day, per the Court.
   **[verifier 2026-10-02: corrected — official SCOTUS RSS feeds do exist** and are listed at
   `https://www.supremecourt.gov/rss/`:
   - `rss/slipopinion_rss.aspx?TYear=25`: 200 `text/xml`, 74 items. It includes the 26A388 per curiam, pubDate
     "Fri, 25 Sep 2026 17:55:42 EDT", with the summary text as the description.
   - `rss/argument_transcripts_rss.aspx?TYear=25` and `rss/argument_audio_rss.aspx?TYear=25`: 58 items each.

   There is still no API. Caveats:
   - Revised U.S. Reports PDFs (`609us2r64_…`) re-enter the feed with a new pubDate, e.g. Chatrie today. Dedupe by
     docket.
   - pubDate zone labels are wrong for some items. "12:21:30 EST" today would be 17:21:30Z, which is later than the
     17:10:42Z fetch, so it really means EDT.
   - There is no ETag or Last-Modified (`private, max-age=120`).

   Keep the HTML-page IMS polling as the primary method and use the RSS feeds as a structured cross-check.]

---

## 1. Source catalog (summary)

| # | Source | Endpoint(s) | Features | Access | Auth / cost | Observed freshness | Conditional GET | Evidence (2026-10-02 UTC) |
|---|---|---|---|---|---|---|---|---|
| 1 | Congress.gov API v3 | `https://api.congress.gov/v3/{bill,amendment,committee-meeting,nomination,summaries,treaty,crsreport,committee-report,hearing,daily-congressional-record,...}` | F7, F11 (F6 via `recordedVotes` links) | REST JSON/XML | free api.data.gov key; 5,000/h; DEMO_KEY limit 10 | Bill actions next morning (+17.4 h measured). Committee meetings and nominations updated during the day (11:00Z, 13:03Z, 14:41Z) | No 304 tested. CDN `max-age=1800` [verifier: UNVERIFIED — DEMO_KEY was exhausted (429, reset at 00:00 UTC), so no cache headers could be re-observed] | 15:31 bill list 200, `count` 430813. 15:5x committee-meeting 9/25–10/2 window `count` 34. Nomination 9/30–10/2 `count` 51. 16:07 HTTP 429 |
| 2 | Congress.gov RSS | `https://www.congress.gov/rss/{presented-to-president,house-floor-today,senate-floor-today,most-viewed-bills}.xml` | F11, F2/F1 hints | RSS 2.0 | none | presented-to-president: `pubDate` 2026-09-29, 3 items. Floor-today feeds empty (no session) | CDN `max-age=1800`, `Last-Modified` [verifier 2026-10-02: corrected — `Last-Modified` is the CDN refill time, not a content change. presented-to-president read 16:13:27Z and then 17:13:25Z with identical content, and IMS returned 200. Diff by `guid`. Items carry no `pubDate`] | 4 × HTTP 200. `/rss/on-the-floor-today.xml`, `/rss/crs-reports.xml`, `/rss/congressional-record.xml` → 404 [verifier: re-probed 16:29Z, same 4 × 200 / 4 × 404] |
| 3 | GovInfo RSS | `https://www.govinfo.gov/rss/{bills,bills-enr,plaw,crec,ccal,chrg,crpt,cprt,hob,dcpd,uscourts-*,billstatus-batch,billstatus-bulkdata}.xml` (full list: `https://www.govinfo.gov/feeds`) | F11, F7 (CCAL), F9 (DCPD archival), courts | RSS 2.0, 100 newest items | none | BILLS: introduced 10/01, published 10/02 06:27Z. CREC: next morning to +2 d [verifier: corrected — up to +6 d, since the CREC-2026-09-16 MODS `recordCreationDate` is 09-22]. PLAW: +7 d after signing. DCPD: +34 d [verifier: both confirmed via MODS `recordCreationDate` 09-25 and 10-01] | **IMS → 304** (crec, bills, dcpd) [verifier: re-confirmed 304, 0.14–0.16 s] | 11 feeds HTTP 200. `bills.xml` 100 items, all 04:58–09:05Z today [verifier: re-confirmed 16 feeds × 200 at 16:4xZ; bills.xml still 100 items 04:58:04–09:05:01Z] |
| 4 | GovInfo API | `https://api.govinfo.gov/{collections,published,packages,related,search}` | F11, CR granules | REST JSON | same api.data.gov key; 36,000/h per README; DEMO_KEY limit 10 | `lastModified` precise to the second (`CREC-2026-10-01` → `2026-10-02T11:14:58Z`) | — | `/published/2026-09-28?collection=DCPD,CREC,PLAW` → 4 CREC packages. `/collections/CPD/2026-09-30T00:00:00Z` → 9 packages |
| 5 | GovInfo BILLSTATUS bulk | `https://www.govinfo.gov/bulkdata/BILLSTATUS/{congress}/{type}/BILLSTATUS-{congress}{type}{num}.xml` + `rss/billstatus-batch.xml` | F11 | XML files | **none** | Batches at 21:52, 00:24, 04:17, 09:14, 12:37Z (~3–5 h apart) [verifier: 14 consecutive batches from 9/30 14:42Z to 10/02 16:26Z were 1.9–5.5 h apart, roughly every 4 h, with 0–836 files each. One sample: Congress.gov `updateDate` 15:39:58Z reached the 16:26Z batch, about 46 min] | `Last-Modified` | `BILLSTATUS-119hr9340.xml` 200, LM `2026-10-01T12:34:10Z` [verifier: now LM `2026-10-02T16:23:08Z`] |
| 6 | House Committee Repository | `https://docs.house.gov/Committee/Calendar/ByWeek.aspx?WeekOf=MMDDYYYY_MMDDYYYY`, `ByDay.aspx?DayID=MMDDYYYY`, `ByEvent.aspx?EventID=N` (+ XML via ASP.NET postback) | **F7** | HTML scrape + XML | none | Posted ≥7 days ahead (Oct 6 field hearing "First Published: September 29, 2026 at 07:37 PM"). Many `publish-date`s per meeting | — | Week 10/04–10/10: 1 event. Day 09/15: 20 events. Postback XML for EventID 118670 → 200 `HMKP-119-FA00-20251203.xml` |
| 7 | Senate hearings XML | `https://www.senate.gov/general/committee_schedules/hearings.xml` | **F7** | XML | none | Regenerated ~2 h (LM 14:05:45Z → 16:05:46Z) | **IMS → 304**. `If-None-Match` returned 200 in my test | 200, today "No committee hearings scheduled" |
| 8 | Senate nominations XML / Executive Calendar | `https://www.senate.gov/legislative/LIS/nominations/NomCivilianPendingCalendar.xml`, `.../NomCivilianConfirmed.xml`, `.../executive_calendar/xcalv.pdf` | F11 (F7) | XML + PDF | none | Nightly (LM `2026-10-01T07:28Z` after 9/30 confirmations) | `Last-Modified`, `ETag` | Confirmed XML 200, 618 nominations, newest 2026-09-30 (PN1129 Secretary of Labor) |
| 9 | Congressional Record + Daily Digest (GovInfo) | `https://www.govinfo.gov/content/pkg/CREC-YYYY-MM-DD/pdf/CREC-YYYY-MM-DD-dailydigest.pdf`; granules `.../html/CREC-YYYY-MM-DD-pt1-PgD{page}[-n].htm` | F11, F7 (next-day committee schedule), F1/F2 recap | PDF / HTML | none | Next morning (Oct 1 issue at 11:17Z Oct 2) | IMS on RSS | Daily Digest PDF 200, 340 KB. `PgD961` HTML 200 |
| 10 | supremecourt.gov | `/opinions/slipopinion/{YY}`, `/orders/ordersofthecourt/{YY}`, `/rss/cases/JSON/{docket}.json`, `/rss/cases/{docket}.xml`, `/oral_arguments/live.aspx`, `/oral_arguments/argument_transcript/{YYYY}`, `/media/audio/mp3files/{docket}.mp3`, argument-calendar PDFs | F11 (SCOTUS), F7 (argument calendar) | HTML scrape, JSON, RSS, PDF, MP3 [verifier: plus official RSS `/rss/slipopinion_rss.aspx?TYear=25`, `/rss/argument_transcripts_rss.aspx?TYear=25`, `/rss/argument_audio_rss.aspx?TYear=25`] | none | Real time (it is the source). Transcripts same day | **IMS → 304** on slip/orders/docket RSS. Docket JSON `max-age=120` + ETag | 26A388 per curiam 9/25/26 listed. Orders 10/01/26 listed. Docket JSON 200 |
| 11 | CourtListener | `https://www.courtlistener.com/api/rest/v4/search/?type=o&court=scotus&order_by=dateFiled%20desc`, Atom `https://www.courtlistener.com/feed/court/{court}/`, docket alerts, webhooks | F11 (courts) | REST JSON + Atom | free account (token). **5/min, 50/h, 125/day**. Webhooks: fees for orgs | SCOTUS 26A388 `date_created` 2026-09-25T22:01:18Z (same day). Docket alerts "within seconds" (RSS courts) | Atom has `Last-Modified` [verifier 2026-10-02: corrected — IMS on `/feed/court/cadc/` returned **200, not 304**. `Last-Modified` is midnight PT of the newest entry date (`Fri, 02 Oct 2026 07:00:00 GMT`), and there are 20 entries per feed] | Anonymous search 200. `/clusters/{id}/` anonymous → **401** [verifier: both re-confirmed 17:0xZ] |
| 12 | CBO | `https://www.cbo.gov/publications/all/rss.xml` | F11 | RSS | none | Items within minutes of posting. CDN `max-age=3600` (Age 1961 s seen) | `ETag`, `Last-Modified` | 200, 30 items, newest 2026-10-02T11:00-04:00. Cost estimates (H.R. 7427, 10/01) included |
| 13 | GAO | `https://www.gao.gov/rss/{reports,reportslegal,reports_majrule,press}.xml` | F11 | RSS | none | reports newest 2026-10-02T07:23-04:00. Major rules 09:08-04:00 | `ETag`, `Last-Modified`, `max-age=900` [verifier 2026-10-02: corrected — observed `max-age=3600` on reports.xml and `max-age=300` on reportslegal/reports_majrule/press] | 4 × 200 (25/25/20/25 items) [verifier: re-confirmed counts] |
| 14 | CRS reports | Congress.gov API `/crsreport?fromDateTime=` (UNVERIFIED live); `https://www.everycrsreport.com/rss.xml` | F11 | REST / RSS | key / none | EveryCRSReport newest pubDate 2026-09-29 | — | EveryCRSReport RSS 200 |
| 15 | unitedstates/congress-legislators | `https://unitedstates.github.io/congress-legislators/{legislators-current,committees-current,committee-membership-current}.json` | reference data for F6/F7/F8 | static JSON | none | Last commit 2026-09-24 | `Last-Modified` | 3 × 200 (1.47 MB / 75 KB / 480 KB) |

Retired (do not build on these): the **ProPublica Congress API** ended in July 2024. **GovTrack's API and bulk data**
ended (congressionaldata.org, "Ending GovTrack's bulk data and API"). **Sunlight Congress API** was shut down on
Oct 1, 2017.

---

## 2. Congress.gov API v3 (Library of Congress)

**Base:** `https://api.congress.gov/v3/` · **Auth:** `api_key=` query parameter (verified), from a free api.data.gov
signup. The `X-Api-Key` header form follows the api.data.gov convention but is **UNVERIFIED** here
**[verifier 2026-10-02: confirmed — `-H "X-Api-Key: DEMO_KEY"` with no query key returned 429 `OVER_RATE_LIMIT`, so the
key was recognised. No key at all returned 403 `API_KEY_MISSING`. The header form works and keeps the key out of
logged URLs. `openapi.json` declares only `ApiKeyAuth` in query `api_key`]** · **Docs:** `https://github.com/LibraryOfCongress/api.congress.gov` (README, `ChangeLog.md`,
`Documentation/openapi.json`).

**Rate limit:** "The rate limit is set to 5,000 requests per hour" (README). DEMO_KEY responses carried
`X-Ratelimit-Limit: 10`. The `X-Ratelimit-Remaining` count went 9 → 8 → 3 → 2 → 1 → 0 between 15:31Z and 16:07Z,
because other research agents on the same IP were using it too. The next call returned
`HTTP 429 {"error":{"code":"OVER_RATE_LIMIT",...}}`. A cache HIT still counts against the quota (the `actions` call was
a HIT and remaining still dropped).
[verifier 2026-10-02: README quote confirmed verbatim. A 429 at 17:13:46Z carried `Retry-After: 24374`, which is a reset
at 00:00 UTC, so the DEMO_KEY allowance is per UTC day, not per hour. The api.data.gov developer manual's generic
DEMO_KEY limits ("30 requests per IP address per hour", "50 requests per IP address per day") do **not** match what
Congress.gov enforces (limit 10). The cache-HIT-counts claim is UNVERIFIED by me because of the exhausted quota.]

**Pagination:** `limit` max 250, `offset`. Responses carry `pagination.count` and `pagination.next`.

**Format gotcha:** since April 2026, "The default response format is now XML for all endpoints". **Always send
`format=json`** (ChangeLog, Completed April 2026 Part 1, Change #6).

**Caching:** every response had `Cache-Control: public, max-age=1800` and `Expires` = Date + 30 min, served through
Cloudflare. Observations:
- `/bill/119/hr/9340/actions` → `Cf-Cache-Status: HIT`, `Age: 542`.
- `/bill?sort=updateDate+desc` → `EXPIRED` (revalidated).
- `/committee-meeting?fromDateTime=...` → `MISS`.

**UNVERIFIED:** whether the cache key includes `api_key`. If it does not, another client's request warms the cache for
you, and the response can be up to 30 min old.

### 2.1 List endpoints and "new since T" filters (from `openapi.json`, fetched 2026-10-02)

| List endpoint | `fromDateTime`/`toDateTime` (filters on **update date**) | `sort` | Notes |
|---|---|---|---|
| `/bill`, `/bill/{congress}`, `/bill/{congress}/{type}` | yes | `updateDate+asc/desc` worked live. Default sort is latest action date (Apr 2026). `introducedDate asc/desc` added Aug 2026 | `introducedDate` field added Aug 2026 |
| `/amendment[/{congress}]` | yes | default latest action | — |
| `/committee-meeting[/{congress}]` | yes (**verified live**) | — | list items give `eventId`, `chamber`, `updateDate` (RFC 3339) |
| `/nomination[/{congress}]` | yes (**verified live**) | default by date received | — |
| `/summaries[/{congress}]` | yes | `updateDate+asc/desc` | CRS bill summaries (these lag) |
| `/treaty[/{congress}]`, `/committee-report`, `/committee-print`, `/crsreport`, `/committee`, `/member` | yes | — | committee-report sort/from were fixed in 2026 |
| `/hearing`, `/daily-congressional-record`, `/bound-congressional-record`, `/house-vote`, `/law/{congress}`, `/house-communication`, `/senate-communication` | **no** | — | poll the newest page and diff |

The documented `fromDateTime` format is `YYYY-MM-DDT00:00:00Z`.
[verifier 2026-10-02: the table was re-derived from `openapi.json` (fetched 16:3xZ) and matches it: list endpoints
with `fromDateTime`/`toDateTime`, and none on `/hearing`, `/daily-congressional-record`, `/bound-congressional-record`,
`/house-vote`, `/law/{congress}` or the communications endpoints. `limit` is documented as "The maximum limit is 250",
and `format` defaults to `xml`. One correction: the spec declares the `sort` parameter **only on `/summaries`**, not
on `/bill`. Whether `/bill?sort=updateDate+desc` works rests on the researcher's single 15:31Z call, so treat it as
UNVERIFIED-by-spec and test it in the first build session.]

**UNVERIFIED:** whether `/bill?fromDateTime=` honours times within a day. My test call hit the 429. The `/bill` list
`updateDate` came back date-only (`"2026-10-02"`), while BILLSTATUS and `/committee-meeting` carry full timestamps.

### 2.2 Real samples (abridged)

**Bill list.** `GET /v3/bill?format=json&sort=updateDate+desc&limit=5` → 200
```json
{"congress":119,"introducedDate":"2026-06-18","latestAction":{"actionDate":"2026-09-30",
 "text":"Motion to proceed to consideration of measure withdrawn in Senate. (CR S5299)"},
 "number":"9340","originChamber":"House","title":"Ratepayer Protection Act","type":"HR",
 "updateDate":"2026-10-02","updateDateIncludingText":"2026-10-02",
 "url":"https://api.congress.gov/v3/bill/119/hr/9340?format=json"}
```
`pagination.count` = 430813.

**Bill actions.** `GET /v3/bill/119/hr/9340/actions?format=json&limit=8` → 200, 29 actions. Each action is
`{actionDate, sourceSystem.name, text, type}`. Recorded votes carry a deep link to the chamber roll-call XML (F6
cross-reference):
```json
{"actionDate":"2026-09-30","recordedVotes":[{"chamber":"Senate","congress":119,"date":"2026-09-30T17:45:52Z",
 "rollNumber":254,"sessionNumber":2,
 "url":"https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00254.xml"}],
 "text":"Cloture on the motion to proceed to the measure not invoked in Senate by Yea-Nay Vote. 57 - 43. Record Vote Number: 254.",
 "type":"Floor"}
```
In these Senate-sourced actions `actionTime` was **absent**, so only the date is known.

**Committee meetings since T.** `GET /v3/committee-meeting?format=json&fromDateTime=2026-09-25T00:00:00Z&toDateTime=2026-10-02T23:59:59Z&limit=10` → 200, `count` 34
```json
{"chamber":"House","congress":119,"eventId":"119567","updateDate":"2026-10-02T14:41:40Z",
 "url":"https://api.congress.gov/v3/committee-meeting/119/house/119567?format=json"}
```

**Committee meeting detail.** `GET /v3/committee-meeting/119/house/119567?format=json` → 200. Fields:
- `committees[{name,systemCode:"hsgo00"}]`
- `date:"2026-09-15T20:00:00Z"`
- `location{building,room}`
- `meetingDocuments[{description,documentType,format,name,url}]`
- `meetingStatus:"Scheduled"`
- `title`
- `type:"Markup"`
- `updateDate:"2026-10-02T14:41:40Z"`
- `videos[{name,url:"https://www.youtube.com/watch?v=P3YYBcmNckM"}, {url:"https://www.congress.gov/event/119th-Congress/house-event/119567"}]`

Data-quality flag: `meetingStatus` still read "Scheduled" for a meeting that took place 17 days earlier.

**Nominations since T.** `GET /v3/nomination?format=json&fromDateTime=2026-09-30T00:00:00Z&toDateTime=2026-10-02T23:59:59Z&limit=4` → 200, `count` 51
```json
{"citation":"PN1180-2","description":"David Slade, of Florida, to be First Vice President of the Export-Import Bank ...",
 "latestAction":{"actionDate":"2026-10-01","text":"Committee on Banking, Housing, and Urban Affairs. Hearings held."},
 "nominationType":{"isCivilian":true},"number":1180,"partNumber":"02","receivedDate":"2026-07-14",
 "updateDate":"2026-10-02T11:00:48Z"}
```
Latency: hearing held 2026-10-01 → API `updateDate` 2026-10-02T11:00Z (next morning, about 07:00 ET).
[verifier: UNVERIFIED as a latency figure. `updateDate` is the most recent edit, so this is an upper bound on when the
hearing action appeared. None of the §2.2 samples could be re-fetched: DEMO_KEY was at 429 for the whole verification
window. Also, the bill-list sample's "(CR S5299)" now reads "(CR S5199)" in BILLSTATUS (corrected 10/02 15:39:58Z).]

### 2.3 Polling recipe ("new since T")
```
every 5 min (in-session hours), else every 30 min:
  T = last_successful_poll_start - 10 min        # overlap; de-dupe by (type, id, updateDate)
  GET /v3/bill?format=json&fromDateTime=T&toDateTime=now&sort=updateDate+desc&limit=250  (page via offset)
  GET /v3/committee-meeting?format=json&fromDateTime=T&toDateTime=now&limit=250
  GET /v3/nomination?format=json&fromDateTime=T&toDateTime=now&limit=250
  GET /v3/amendment?format=json&fromDateTime=T&toDateTime=now&limit=250
hourly: /summaries?sort=updateDate+desc, /treaty, /committee-report, /crsreport (all with fromDateTime)
daily:  /hearing (newest page, diff), /law/119 (diff)
for each changed id: GET detail (/bill/{c}/{t}/{n}/actions, /committee-meeting/{c}/{chamber}/{id}, /nomination/{c}/{n})
```
Budget: about 6–10 list calls per cycle × 12 per hour, plus details, comes to a few hundred calls an hour. That is far
under 5,000/h.

Using a rolling `fromDateTime` makes each URL unique, so the list call skips the 30-min CDN cache (observed `MISS`).
Detail calls may still be cached. **UNVERIFIED:** whether changing an extra legitimate parameter (e.g. `limit`) on
detail calls forces a fresh copy.

### 2.4 Change risk
The API changes almost every month. From the ChangeLog:
- default format switched to XML (Apr 2026),
- default sorts changed (Apr 2026),
- `updateDate` became RFC 3339 on committee-print (Jul 2026),
- `swagger.yaml` was renamed to `openapi.yaml` (Aug 2026),
- House vote endpoints dropped the "beta" label (Dec 2025),
- committee-meeting `meeting_dt` was renamed to `continuationDate` (Dec 2025).

Pin field parsing defensively and add a schema-drift test.
[verifier 2026-10-02: every ChangeLog item above was confirmed in `ChangeLog.md`:
- Apr 2026 Part 1 Change #6 (XML default), and Changes #3/Apr Part 2 #3 (sorts),
- Jul 2026 (committee-print RFC 3339),
- Aug 2026 Part 1 #2 (openapi rename) and Parts 1–2 (`introducedDate`),
- Dec 2025 Part 2 #4 ("beta" label removed) and Part 1 #2 (`meeting_dt` renamed `continuationDate`).

Nuance: for committee-report, Feb 2026 said `fromDateTime` "will be fixed in a later sprint", and Apr 2026 says only
"Optional sort by update date parameters were fixed". Whether `fromDateTime` on `/committee-report` now works is
UNVERIFIED.]

---

## 3. Congress.gov RSS (key-free)

| Feed | Status 2026-10-02 | Content |
|---|---|---|
| `https://www.congress.gov/rss/presented-to-president.xml` | 200. Channel `pubDate` Tue 29 Sep 2026. 3 items (H.R.5345, S.766, S.195) | Bills sent to the President (an "awaiting signature" signal for F9/F11) |
| `https://www.congress.gov/rss/house-floor-today.xml` | 200, 0 items (no House session) | "latest bills and resolutions considered on the floor of the U.S. House" |
| `https://www.congress.gov/rss/senate-floor-today.xml` | 200, 0 items | "...bills, resolutions, nominations, and treaties considered on the floor of the U.S. Senate" |
| `https://www.congress.gov/rss/most-viewed-bills.xml` | 200, weekly (Week of Sep 27, 2026) | popularity signal for curation |
| `/rss/on-the-floor-today.xml`, `/rss/crs-reports.xml`, `/rss/congressional-record.xml`, `/rss/crs-products.xml` | **404** | do not exist |

Etiquette: these feeds sit behind the same Cloudflare cache (`max-age=1800`, `Age: 530` seen) and send `Last-Modified`.
[verifier 2026-10-02: corrected — `Last-Modified` changes on every CDN refill even when the content is unchanged:
16:13:27Z, then 17:13:25Z, with the channel `pubDate` still 29 Sep and the same 3 items. IMS with the earlier value
returned 200, so conditional GET gives no benefit. Hash the body or diff `guid`s instead. The items in
presented-to-president have **no per-item `pubDate`**, only the date-only channel `pubDate`, so the time a bill was
presented must come from the bill's actions.]
**Congress.gov HTML pages return 403 to curl and WebFetch** (bot protection on `/get-alerts` and `/help/coverage-dates`).
Do not plan on scraping congress.gov HTML. The RSS feeds and the API are reachable.

Freshness of the floor-today feeds was not measured because neither chamber was in session. **UNVERIFIED** until a
session day; re-probe on Mon Oct 5.

---

## 4. GovInfo (GPO)

### 4.1 RSS (no key). Each feed holds the 100 most recent documents.
Feed index: `https://www.govinfo.gov/feeds`. Item tags: `guid` (= packageId), `title`, `pubDate` (when GovInfo
published it), `category`, `link`, `description` (HTML with PDF/XML/HTM/MODS links).

**Items are not sorted newest-first, so sort by `pubDate`.**

| Feed | Newest `pubDate` (UTC) | Newest item | Latency vs the real event |
|---|---|---|---|
| `rss/bills.xml` | 2026-10-02 09:05:01 | H.R.10660 (IH) | Introduced 10/01 (`dateIssued` 2026-10-01) → text published 10/02 06:27–09:05Z (next morning). All 100 items came from one overnight batch, **so 100 items can overflow on heavy days. Use the API as backstop** |
| `rss/bills-enr.xml` | 2026-09-29 05:03:18 | H.R.1721 (ENR) | enrolled text: `dateIssued` 2026-09-29, published the same night |
| `rss/plaw.xml` | 2026-09-25 12:53 | Public Law 119-111 | `dateIssued` 2026-09-18 → +7 days |
| `rss/crec.xml` | 2026-10-02 11:17 | CR Vol. 172 Issue 156 (Oct 1) | +~7 h after the Oct 1 day (07:17 ET next morning). Sep 30 issue: 10/01 17:28Z. Sep 29 issue: 10/02 03:18Z (**+2 days**) [verifier 2026-10-02: corrected — `pubDate` is the last (re)publish time. The Sep 29 MODS `recordCreationDate` is 10-01 (a revision followed 10-02), and the Sep 16 issue was created 09-22 (**+6 days**; its RSS `pubDate` is 09-22 15:33Z). The feed also re-lists old issues such as CREC-1996-07-10] |
| `rss/ccal.xml` | 2026-10-02 05:03 | Senate Calendar of Business for **Oct 5** | published ahead of the session day (F7) |
| `rss/chrg.xml` | 2026-10-02 15:01 | S. Hrg. 118-260 | printed hearings appear **months to years** after the hearing |
| `rss/crpt.xml` | 2026-10-01 13:10 | S. Rept. 119-134 | committee reports |
| `rss/cprt.xml` | 2026-10-02 01:46 | committee print CP-16 (House Oversight) | — |
| `rss/hob.xml` | 2026-09-29 22:36 | History of Bills 2026 | — |
| `rss/dcpd.xml` | 2026-10-01 21:27 | EO 14423 (DCPD-202600566) | **~34 days** (`dateIssued` 2026-08-28) |
| `rss/gaoreports.xml` | newest 2024-07-08 | — | **stale; use gao.gov feeds instead** |
| `rss/uscourts-cadc.xml` / `-dcd.xml` / `-ca9.xml` | 10/01 21:51 / 10/01 23:42 / 10/01 21:51 | D.C. Cir., D.D.C., 9th Cir. opinions | about 1 day. CourtListener's cadc Atom already had an item dated 10/02 |

Etiquette:
- Responses carry `Last-Modified`, and a conditional `If-Modified-Since` request returned **304** for crec, bills and
  dcpd (about 0.15 s).
- Cloudflare `cf-cache-status: DYNAMIC`.
- **Reliability note:** my first batch of 11 sequential RSS fetches took more than 120 s (one or more requests hung).
  Every later fetch took 0.15–0.55 s. Use a 20–30 s timeout per request and retry with backoff.
  [verifier 2026-10-02: partly refuted — my 16 sequential full GETs at 16:4xZ took **2.3–8.5 s each**. The 1.9 MB
  `billstatus-batch.xml` took 8.45 s. Only the conditional (304) requests took 0.14–0.16 s. Budget for multi-second
  full fetches and rely on IMS. Feed sizes are not always 100: `hob` has 44 items, `gaoreports` 54, `chrg`/`cprt` 99.]

### 4.2 API (`https://api.govinfo.gov`, same api.data.gov key)
- `GET /collections/{collection}/{lastModifiedStartDate}[/{end}]?pageSize=..&offsetMark=*` is the primary
  "changed since T" feed. **Verified:** `/collections/CPD/2026-09-30T00:00:00Z?pageSize=10&offsetMark=*` → 9 packages,
  each with `packageId`, `lastModified` (to the second), `dateIssued`, `docClass`, `title` and `packageLink`.
- **Collection-code gotcha:** the presidential documents collection is **`CPD`** in the API, while the RSS feed is
  named `dcpd.xml`. `/collections/DCPD/...` returned `count: 0`. A comma-separated collection list in the path
  (`/collections/CREC,DCPD,PLAW,CHRG/...`) also returned `count: 0`.
- `GET /published/{dateIssuedStartDate}?collection=A,B,C&pageSize=..&offsetMark=*` filters on **issue date** and
  accepts a comma list (verified: 4 CREC packages, `CREC-2026-10-01` `lastModified` `2026-10-02T11:14:58Z`).
- `GET /packages/{packageId}/granules?offsetMark=*&pageSize=100` was **verified** for `CREC-2026-10-01`: `count` 163.
  The first page held 98 HOUSE and 2 SENATE granules; Daily Digest granules are `PgD...`.
- Limits: "36,000 requests per hour", "1,200 requests per minute", "40 requests per second" (usgpo/api README). With
  DEMO_KEY the server sent `X-Ratelimit-Limit: 10`, counted **separately** from Congress.gov's.
  [verifier 2026-10-02: confirmed. The README says "36,000 requests per hour (Primary Rate limit)", "1,200 requests per
  minute" and "40 requests per second", tracked "on an rolling hourly basis". Separate counters were confirmed: at
  16:36Z GovInfo DEMO_KEY had `Remaining: 3` while Congress.gov was at 0. The GovInfo DEMO_KEY also resets at 00:00 UTC
  (`Retry-After: 24347` at 17:14:13Z). Re-verified live: `/collections/CPD/2026-09-30T00:00:00Z` gave 9 packages with
  newest `DCPD-202600566` `lastModified` 2026-10-01T21:25:55Z; `/collections/DCPD/...` gave `count: 0`; `/published`
  with a comma list gave 4 CREC packages; `/packages/CREC-2026-10-01/granules` gave count 163, with 98 HOUSE and 2 SENATE
  on page 1.]
- MODS metadata needs no key: `https://www.govinfo.gov/metadata/pkg/{packageId}/mods.xml` (`dateIssued` verified for
  BILLS, ENR and PLAW).

### 4.3 BILLSTATUS bulk (key-free mirror of Congress.gov bill status)
- Changed-file feed: `https://www.govinfo.gov/rss/billstatus-bulkdata.xml` (100 newest file URLs, e.g.
  `https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr10662.xml` at 12:35:04Z).
- Batch feed: `https://www.govinfo.gov/rss/billstatus-batch.xml` (1.9 MB). Each item is "BILLSTATUS batch update
  complete <time>" and its description lists every changed file. Batches seen: 2026-10-01 21:52, 10-02 00:24, 04:17,
  09:14, 12:37Z.
- File sample (`BILLSTATUS-119hr9340.xml`, LM `2026-10-01T12:34:10Z`): `bill/updateDate` `2026-10-01T11:08:29Z`, plus
  `actions/item{actionDate,sourceSystem,text,type,recordedVotes}`, the same shape as the API.
- **Use:** a key-free fallback and cross-check for F11. Follow the batch RSS (every 15 min, IMS), then fetch only the
  listed files.
- [verifier 2026-10-02: added — the batch feed is itself a **change-history instrument**. It covers 100 batches,
  2026-09-15 20:19Z to 10-02 16:26Z. `BILLSTATUS-119hr9340.xml` appears in the 9/30 batches at 14:42Z, 16:35Z and
  20:31:13Z, all on the day of the Senate floor action, and next in the 10/01 12:43Z batch. This undercuts "next
  morning" as a blanket rule; see the TL;DR #1 correction. Senate-sourced `actionTime` was confirmed absent in the
  current file (29 actions, all with `actionTime` None).]

### 4.4 Link service (no key, stable deep links for the UI)
- `https://www.govinfo.gov/link/bills/119/hr/9340?link-type=xml` → 302 to `BILLS-119hr9340pcs.xml` (latest version)
- `https://www.govinfo.gov/link/plaw/119/public/111?link-type=html` → 302 to `PLAW-119publ111.htm`
- `https://www.govinfo.gov/link/cpd/executiveorder/14423?link-type=pdf` → 302 to `DCPD-202600566.pdf`

---

## 5. Committee hearing schedules (F7)

### 5.1 House — Committee Repository (`docs.house.gov/Committee`), maintained by the Clerk
- **Discovery (HTML, no JS needed for event IDs):**
  - `https://docs.house.gov/Committee/Calendar/ByWeek.aspx?WeekOf=10042026_10102026` → 1 event (EventID 119575)
  - `ByWeek.aspx?WeekOf=09132026_09192026` → 14 events
  - `ByDay.aspx?DayID=09152026` → 20 events
  - Extract with the regex `ByEvent\.aspx\?EventID=(\d+)`.
- **Event page:** `https://docs.house.gov/Committee/Calendar/ByEvent.aspx?EventID=119575` gives title, committee,
  date/time, location and "First Published: September 29, 2026 at 07:37 PM" (Ways and Means field hearing, Tue Oct 6,
  9:00 AM, Collierville TN). That is a **7-day lead**, consistent with House notice rules.
- **Meeting XML:** the "Download Meeting XML (.xml)" button is an ASP.NET postback. Verified recipe:
  1. GET the event page.
  2. Collect the hidden inputs (`__VIEWSTATE` etc.).
  3. POST them back with `__EVENTTARGET=ctl00$MainContent$...DownloadMtgXML`.
  4. The response is `200 application/octet-stream`, `Content-Disposition: attachment; filename=HMKP-119-FA00-20251203.xml`.
- **XML schema seen** (`committee-meeting` root):
  - attributes `congress-num`, `meeting-id="HMKP118670"`, `meeting-type="HMKP"` (markup; the hearing type code is
    **UNVERIFIED** because the sample was a markup)
    **[verifier 2026-10-02: resolved — I re-ran the postback recipe on hearing EventID 119575 and got 200
    `application/octet-stream`, `filename=HHRG-119-WM00-20261006.xml`, root `meeting-type="HHRG"`,
    `meeting-id="HHRG119575"`, `<current-status>S</current-status>`. The timestamps carry **no zone offset**:
    `create-date="2026-09-29T19:37:18"` equals the page's "07:37 PM", which is Eastern local time.]**,
    `create-date`, `orig-publish-date`, `update-date`
  - `<publish-dates>`: 35 timestamps for one meeting, i.e. a full revision history
  - `<meeting-details>`: `committees/committee-name@id="FA00"`, `meeting-date/{calendar-date,start-time,end-time}`,
    `meeting-location`, `meeting-title`
  - `<meeting-documents>`: 31 documents, each `meeting-document@type` (e.g. `BR`) with `add-date`, `publish-date`,
    `legis-num` and `files`. In the sample these were bills, amendments, vote tallies
    (`CRPT-119-FA00-Vote001-...pdf`), the member roster and support documents. Witness testimony PDFs for hearings are
    expected in the same container but are **UNVERIFIED**, since no hearing was sampled.
- **Documents** are linkable directly: `http://docs.house.gov/meetings/{CMTE}/{SUBCMTE}/{YYYYMMDD}/{EventID}/{file}.pdf`.
- **Video:** not in the repository HTML. Congress.gov `/committee-meeting/{c}/house/{id}` carries `videos[]` with
  YouTube URLs (verified).
- **Polling:** this week's and next week's `ByWeek` pages every 15 min. Diff the EventIDs, then pull the XML for new
  or changed events (compare `update-date`). The "Committee/RSS.ashx" URL redirects ("Object moved"), so **no RSS was
  found**. The only XML found is per meeting.
  [verifier 2026-10-02: confirmed. ByWeek 10/04–10/10 had 1 event (119575), ByWeek 09/13–09/19 had 14, and ByDay
  09/15 had 20. `RSS.ashx` → 302 to `/Committee/Error/Error.aspx`. No RSS/XML feed links appear in the ByWeek/ByEvent
  HTML except the postback buttons `LinkButtonDownloadMtgXML` and `LinkButtonDownloadMtgPackage` (a .zip).]
- Floor (related, mostly other dimension):
  - Weekly floor XML: `https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/YYYYMMDD/YYYYMMDD.xml`, root
    `<floorschedule week-date=... update-date=...>`, many `publish-date`s. Verified for 20260914.
  - `https://docs.house.gov/BillsThisWeek-RSS.xml` is **38.8 MB** (entries back to 2020). Only fetch it with
    `If-Modified-Since` (it sends `Last-Modified` and `ETag`).

### 5.2 Senate — `hearings.xml`
- `https://www.senate.gov/general/committee_schedules/hearings.xml` (HTML twin: `/committees/hearings_meetings.htm`,
  which covers "today, and on days thereafter").
- Element `<css_meetings_scheduled><meeting>` with fields `cmte_code`, `committee`, `type`, `date` (`02-OCT-2026`),
  `date_iso_8601`, `day_of_week`, `time`, `room`, `matter`, **`video_url`**, `senate_cable_channel`.
  Today: one placeholder row, "No committee hearings scheduled".
- Regeneration: `Last-Modified` 14:05:45Z, then 16:05:46Z (about every 2 h; it may also regenerate on change,
  **UNVERIFIED**). `If-Modified-Since` → 304. `If-None-Match` → 200 in my test, so use IMS.
  [verifier 2026-10-02 16:49Z: confirmed. LM was still 16:05:46Z, IMS → 304, and `If-None-Match "197-65cddb48a3e7b"` →
  200. The file still had only the "No committee hearings scheduled" placeholder for today, with **no rows for later
  days**, even though the Senate returns Oct 5. Whether the file lists future days at all (the HTML says "today, and on
  days thereafter") is UNVERIFIED until a week with posted hearings.]
- **No witness lists or testimony** in the XML. Those live on each committee's site (heterogeneous; per-committee RSS
  **UNVERIFIED**). Congress.gov `/committee-meeting/{c}/senate/{eventId}` is the normalized fallback (Senate event
  338781 was updated 2026-09-30T16:08:20Z).
- Senate video: the **Senate ISVP player** (`senate.gov/isvp`). Recordings are named `<comm><MMDDYY>` per prior art
  (civictechdc/congressional-tech PR #102 "hearing-to-video matcher"; the yt-dlp `senategov` extractor). Live
  stream/HLS URL patterns are **UNVERIFIED** (no hearing today).

### 5.3 Next-day schedule from the Congressional Record
The Daily Digest ends with the next meeting of each chamber and the committee meetings scheduled. Example:
`CREC-2026-10-01-pt1-PgD961.htm` says the Senate "adjourned at 10:30:41 a.m. until 4 p.m. on Monday, October 5, 2026".
It arrives next morning, so it works as a reconciliation source, not a live one.

---

## 6. Nominations and confirmations (F11, plus F7 via the Executive Calendar)

| Source | URL | Freshness | Notes |
|---|---|---|---|
| Senate pending (on Executive Calendar) | `https://www.senate.gov/legislative/LIS/nominations/NomCivilianPendingCalendar.xml` | LM `2026-10-01T07:28:09Z` (nightly) | `<Nomination>`: `NominationDisplayNumber` (`PN852-1`), `ReceivedDate`, `ReportingStageDate`, `Organization`, `ReportingDescription`, `ExecutiveCalendarNumber`, `Committees/CommitteeReferrals{ReferralDate,ReportedOutDate,SenateCommitteeCode,CommitteeFullName}` |
| Senate confirmed (current Congress) | `https://www.senate.gov/legislative/LIS/nominations/NomCivilianConfirmed.xml` | LM `2026-10-01T07:28:08Z`. 618 nominations. Newest confirmations dated 2026-09-30 | confirmation happened 9/30, XML regenerated about 3:28 ET the next morning. ETag + LM |
| Executive Calendar (PDF) | `https://www.senate.gov/legislative/LIS/executive_calendar/xcalv.pdf`; dated archive `.../2026/10_05_2026.pdf` | LM `2026-10-01T14:32:49Z` (calendar for Oct 5 already up) | PDF only |
| Congress.gov API | `/v3/nomination?fromDateTime=` | next morning (11:00Z for a 10/01 hearing) | PN citation, `latestAction`, `updateDate` |

Real-time confirmation votes happen on the Senate floor and belong to the F5/F6 dimension. These sources give
next-morning official status.

---

## 7. Congressional Record and Daily Digest

- **Publication timing (measured):**
  - Oct 1 issue: 2026-10-02T11:14:58Z (API `lastModified`), RSS `pubDate` 11:17Z (07:17 ET).
  - Sep 30 issue: 10/01 17:27Z.
  - Sep 29 issue: 10/02 03:16Z.
  - So it is next morning at best and can take 2+ days.
  - [verifier 2026-10-02: corrected — the `lastModified` values above were re-confirmed via `/published`, but they are
    last-revision times. MODS `recordCreationDate`: Sep 29 issue → 2026-10-01; Sep 30 → 10-01; Oct 1 → 10-02;
    **Sep 16 → 09-22 (6 days)**. The tail is about a week, not 2 days.]
- **Daily Digest:** `https://www.govinfo.gov/content/pkg/CREC-2026-10-01/pdf/CREC-2026-10-01-dailydigest.pdf`
  (200, 340 KB). HTML granules: `https://www.govinfo.gov/content/pkg/CREC-2026-10-01/html/CREC-2026-10-01-pt1-PgD961.htm`
  (verified: "Chamber Action", "Committee Meetings"). `...-dailydigest.htm` is **not** valid (302 to /error). Granule
  IDs come from the MODS file (`PgD961`, `PgD961-2` … `-6`).
- Congress.gov API has `/daily-congressional-record` (newest first, no `fromDateTime`) and
  `/congressional-record?y=&m=&d=`. **UNVERIFIED live** (quota).
- Use: next-morning recap and an authoritative transcript link per day. **It is not a live transcript.**

---

## 8. Supreme Court (supremecourt.gov) — primary, real-time, no API

[verifier 2026-10-02: the section title holds (no API), but there **is official RSS**. See the added rows marked
"verifier" in the table below.]

| Need | URL | Format / notes | Evidence |
|---|---|---|---|
| Slip opinions (incl. per curiam on applications) | `https://www.supremecourt.gov/opinions/slipopinion/{YY}` (YY = term start year; `/25` = OT2025, `/26` → 302 until the term opens) | HTML table: R-number, Date, Docket, Name (link `/opinions/25pdf/26a388_q86b.pdf`, with a `title=` attribute holding the summary text), J., Citation. `Last-Modified` + IMS → 304. `Cache-Control: private, max-age=5` | Row `73, 9/25/26, 26A388, People Not Politicians v. Onder, PC, 609/2` |
| Orders | `https://www.supremecourt.gov/orders/ordersofthecourt/{YY}` | HTML `<span>MM/DD/YY</span><a href='/orders/courtorders/100126zr_6j37.pdf'>Miscellaneous Order</a>`. 124 entries in `/25`. IMS → 304 | newest `10/01/26` Miscellaneous Order ×2. `09/04/26` Order List |
| Docket (per case) | `https://www.supremecourt.gov/rss/cases/JSON/{docket}.json`, RSS `https://www.supremecourt.gov/rss/cases/{docket}.xml` | JSON keys: `CaseNumber, DocketedDate, PetitionerTitle, RespondentTitle, LowerCourt, ProceedingsandOrder[{Date,Text,Links[{Description,File,DocumentUrl}]}], Petitioner/Respondent/Other attorneys`. `Cache-Control: max-age=120`, ETag, LM, IMS → 304 | `26A388.json` LM `2026-09-28T19:50:47Z`, last entry "Sep 25 2026 … stay … granted" |
| Argument calendar | `https://www.supremecourt.gov/oral_arguments/argument_calendars/MonthlyArgumentCalOctober2026.pdf` (+ Nov/Dec 2026). Term calendar `/oral_arguments/2026TermCourtCalendar.pdf` | PDF (text-extractable with pypdf). Old `argument_calendars.aspx` → 404 page | "Monday, October 5 — 25-170 Suncor Energy v. Commissioners of Boulder County; 25-735 Johnson v. United States Congress … Amended September 14, 2026" |
| Live argument audio | `https://www.supremecourt.gov/oral_arguments/live.aspx` | HTML. Today: "There are no Oral Arguments or Live Audio scheduled for today." Stream URL **UNVERIFIED** (re-probe Oct 5, 10:00 ET) | 200 |
| Transcripts | `https://www.supremecourt.gov/oral_arguments/argument_transcript/{YYYY}` → `/oral_arguments/argument_transcripts/2025/25-466_ec8f.pdf` | Court: transcripts are available "on the same day an argument is heard" (availabilityoforalargumenttranscripts.aspx) | 58 transcript links for OT2025 |
| Audio | `https://www.supremecourt.gov/oral_arguments/argument_audio/{YYYY}` → `/oral_arguments/audio/2025/24-1287` → `https://www.supremecourt.gov/media/audio/mp3files/24-1287.mp3` | MP3. Posting delay **UNVERIFIED** [verifier: one sample points to same day. The `24-1287.mp3` HEAD gives 200 `audio/mpeg`, 76.4 MB, `Last-Modified: Wed, 05 Nov 2025 18:29:36 GMT`. The argument date of Nov 5, 2025 is from my memory and was not re-checked. The audio RSS items carry the same timestamps as the transcript RSS items] | audio page 200, mp3 link present [verifier: re-confirmed, 59 audio links] |
| **[verifier addition] Official RSS** | `https://www.supremecourt.gov/rss/slipopinion_rss.aspx?TYear={YY}`, `.../rss/argument_transcripts_rss.aspx?TYear={YY}`, `.../rss/argument_audio_rss.aspx?TYear={YY}` (index page `https://www.supremecourt.gov/rss/` lists terms only up to 2023, but `TYear=25` works) | RSS 2.0. Items have `title` "Case (docket)", `link` to the PDF and a `description` holding the summary. `Cache-Control: private, max-age=120`, no LM/ETag. Revised `609us…r…` PDFs re-enter with a new pubDate. Some pubDates carry the wrong zone label (EST during EDT) | 2026-10-02 17:10Z: slip RSS 200, 74 items, includes `26A388` "Fri, 25 Sep 2026 17:55:42 EDT". Transcript and audio RSS 200, 58 items each, newest 24-889 2026-04-29 |
| **[verifier addition] Hermes transfer** | `https://www.supremecourt.gov/rss/hermes_transfer.xml` | Small RSS listing order/docket XML files with "File Modified" times, e.g. `100126zr.xml` 9/30 5:33 PM and `26A428.xml` 9/30 6:26 PM. `max-age=60`, ETag, LM. Purpose and format **UNVERIFIED**. It may be an early signal for order lists | 200, 4 items |

**Polling recipe:**
- On announced opinion days and order-list mornings, poll the slip-opinion page and the orders page every 60 s with
  IMS. Each 304 is about 0.2 s and costs the Court almost nothing. Otherwise poll every 15 min.
- Diff the rows to find new opinions and orders.
- Poll a **watchlist** of docket JSONs (major cases) every 5–15 min, using IMS or ETag.
- Watch the term boundary: poll both `/25` and `/26` around early October.
- [verifier 2026-10-02: re-probed. IMS → 304 on the slipopinion/25, ordersofthecourt/25 and 26A388.json pages (0.12–0.22 s).
  `slipopinion/26` → 302 to `/opinions/USReports.aspx`, as stated. But **`orders/ordersofthecourt/26` already
  returns 200**: an empty "Term Year 2026" page with LM 10/01 17:56Z. The 10/01/26 orders (`100126zr_6j37.pdf`,
  `100126zr1_j4el.pdf`) are listed on `/25` (124 entries). The docket JSON `ProceedingsandOrder` array is **not strictly
  chronological**: its last element is "Sep 25 2026 Amicus brief … submitted", placed after the stay-granted entry.
  Diff the whole array; do not read only the last element. The October calendar PDF text was confirmed (Suncor 25-170
  and Johnson v. United States Congress 25-735 on Oct 5; "Amended … September 14, 2026").]

---

## 9. CourtListener (Free Law Project) — SCOTUS + federal courts aggregator

- **REST v4 search, anonymous OK:**
  `https://www.courtlistener.com/api/rest/v4/search/?type=o&court=scotus&order_by=dateFiled%20desc` → 200, cursor
  pagination.
  - Result fields: `caseName, dateFiled, docketNumber, court_id, cluster_id, docket_id, absolute_url, opinions[{download_url,per_curiam,snippet,type,...}], meta{timestamp,date_created}`.
  - Sample: 26A388 `dateFiled` 2026-09-25, `meta.date_created` **2026-09-25T22:01:18Z**, so it was ingested the same day.
  - `pagination.count` read 498145 even with `court=scotus`, which looks unfiltered. Do not trust count.
- **Other endpoints require a token:** `/api/rest/v4/clusters/10984030/` anonymous → **401** "Authentication
  credentials were not provided." The header is `Authorization: Token <token>`.
- **Rate limits** (wiki.free.law, verbatim): "By default, authenticated users may make up to **5 requests per minute**,
  **50 requests per hour**, and **125 requests per day**." The limits use rolling windows, and all throttles apply
  together. A search result says this has applied "as of May 2026". There is a maintenance window on Thursdays
  21:00–23:59 PT. Members and commercial agreements get more.
  [verifier 2026-10-02: confirmed on wiki.free.law REST v4 overview and api-usage pages (rolling windows, Thursday
  window). Effective date **May 7, 2026** per the free.law announcement. Member API tiers per free.law/membership:
  - Tier 1, $10/mo: 10/min, 75/h, 300/day
  - Tier 2, $25/mo: 15/min, 150/h, 600/day
  - Tier 3, $50/mo: 20/min, 250/h, 1,000/day
  - Tier 4, $100/mo: 25/min, 300/h, 1,400/day

  EDU membership is free.]
- **Atom feeds** (no quota, the recommended way to poll):
  - `https://www.courtlistener.com/feed/court/scotus/` → 200 `application/atom+xml`, `last-modified` header, entries
    dated by day (`2026-09-30T00:00:00-07:00` "Nelsen v. Pike"; "People Not Politicians v. Onder").
  - `.../feed/court/cadc/` had an entry dated 2026-10-02.
  - [verifier 2026-10-02: corrected — "no quota" is UNVERIFIED; no doc says the feeds are unthrottled, and the ToS
    mentions an "anti-crawling challenge". The feeds also **do not honour IMS**: IMS on cadc → 200. `Last-Modified` is
    date-granular, midnight PT of the newest entry. Each feed has 20 entries dated by day (`T00:00:00-07:00`), so
    "how recent" can only be resolved to the day. Poll at a modest cadence and dedupe by entry id.]
- **Docket alerts (PACER/RECAP):**
  - "We currently allow **5** docket alerts for free, and give a bonus of **10** alerts to anybody with the RECAP
    Extension installed". Members are unlimited.
  - "For active cases, alerts can come within seconds of a new filing landing in a source system."
  - Court RSS coverage: full RSS for 50+ district courts; partial for 8 circuits and 30+ districts; none for 5 circuits
    and 6 districts.
  - [verifier 2026-10-02: the "5", "10" and "within seconds" quotes were confirmed verbatim in the rendered page, which
    also adds "For less active cases … alerts may not arrive at all". The court coverage counts are **UNVERIFIED**:
    the lists are rendered client-side from template variables (`[[ rss_feeds.full ]]`), and a WebFetch summary
    produced inconsistent counts. Docket alerts cover **PACER courts only, not SCOTUS**. Per free.law/membership, Tier 1
    ($10/mo) and above get **unlimited** docket alerts, and the free tier gets **no real-time opinion search alerts**,
    only daily ones.]
- **Webhooks:** event types are docket alert, search alert, old docket alert, RECAP fetch and pray-and-pay. Failed
  deliveries are retried up to 7 times with 3× backoff (about 54 h) before the endpoint is disabled. Pricing:
  "we do charge reasonable fees to organizations using advanced features like Webhooks and APIs". Whether a single
  hobby user would be charged is **UNVERIFIED**, so it is listed as an owner question.
- **License:** court records are public domain. FLP asks for attribution ("please credit Free Law Project").
  [verifier 2026-10-02: corrected — the quoted phrase does **not** appear in the current ToS (curl + grep for "credit"
  and "attribut"). The ToS says filings "are generally in the public domain" but "may contain third-party copyrighted
  works". It also says: "Attribute honestly. If you republish or display our data, do not present it in a way that
  suggests Free Law Project produced, endorsed, or verified an AI-generated analysis of it". "Do not use multiple
  accounts, registered clients, or credential rotation to exceed the rate limits". "If you need access for a product or
  a team, talk to us about a commercial agreement".]

---

## 10. CBO, GAO, CRS (F11 — analysis and oversight)

| Source | Feed | Items / newest | Caching | Notes |
|---|---|---|---|---|
| CBO all publications | `https://www.cbo.gov/publications/all/rss.xml` | 30 items. Newest 2026-10-02T11:00-04:00 | `etag`, `last-modified`, `Cache-Control: public, max-age=3600`; `Age: 1961` seen (so up to 1 h stale) [verifier: re-confirmed at 16:5xZ (Age 1777). The full header is `public, max-age=3600, s-maxage=3600, stale-if-error=86400`, so the feed **can be up to 24 h stale during origin errors**] | Includes **cost estimates** (e.g. "H.R. 7427 …" 2026-10-01T14:21-04:00). `/cost-estimates/rss.xml` returned an HTML 404 page. No separate cost-estimate feed was confirmed |
| GAO reports | `https://www.gao.gov/rss/reports.xml` | 25. Newest 2026-10-02T07:23-04:00 | ETag, LM, `max-age=900` [verifier: corrected — observed `max-age=3600` here and `max-age=300` on the other three GAO feeds] | official list at gao.gov/about/stay-connected |
| GAO legal products | `https://www.gao.gov/rss/reportslegal.xml` | 25. Newest 2026-10-02T10:59-04:00 | same | bid protests, appropriations-law decisions |
| GAO major rules (Congressional Review Act) | `https://www.gao.gov/rss/reports_majrule.xml` | 20. Newest 2026-10-02T09:08-04:00 | same | e.g. "Environmental Protection Agency: Partial Repeal of the Carbon Pollution Standards…" (F10 cross-reference) |
| GAO press | `https://www.gao.gov/rss/press.xml` | 25. Newest 2026-09-18 | same | — |
| CRS | Congress.gov `/v3/crsreport?fromDateTime=` (**UNVERIFIED live**, quota). `https://www.everycrsreport.com/rss.xml` (200, newest 2026-09-29) | — | — | the Congress.gov CRS RSS URLs tried all 404 |

---

## 11. Latency summary (event → first machine-readable appearance)

| Event | Fastest source in this dimension | Measured / stated latency |
|---|---|---|
| House committee meeting scheduled | docs.house.gov ByWeek/ByEvent | ~7 days **ahead** (posted 09-29 for 10-06) |
| Senate committee hearing scheduled | senate.gov `hearings.xml` | ahead of time. File regenerates about every 2 h |
| Committee meeting materials / video link | Congress.gov `/committee-meeting` | `updateDate`s during the day (13:03Z, 14:41Z) |
| Nomination hearing held / reported | Congress.gov `/nomination` | next morning (~07:00 ET) |
| Nomination confirmed | senate.gov `NomCivilianConfirmed.xml` | next morning (~03:30 ET) |
| Bill introduced (status) | Congress.gov `/bill` | next morning (stated ~8:00 a.m.; **UNVERIFIED** live) |
| Bill introduced (text) | GovInfo `rss/bills.xml` | next morning (10/01 → 10/02 06:27Z) |
| Floor/vote action recorded on a bill | Congress.gov `/bill/.../actions` | **+17.4 h** (Senate vote 9/30 17:45Z → 10/01 11:08Z) [verifier: corrected — this is the time of the *latest edit*, not first appearance, so it is an upper bound at best. True latency is UNVERIFIED and may be same day; see TL;DR #1] |
| Same, key-free | GovInfo BILLSTATUS | **+18.8 h** [verifier: corrected — the file was re-published at 9/30 20:31:13Z, which is +2.75 h after the vote, and again at later times. Contents of that version are unknown] |
| Bill presented to President | Congress.gov RSS | same or next day (feed `pubDate` 9/29) |
| Public Law text | GovInfo `plaw.xml` | +7 days |
| Congressional Record / Daily Digest | GovInfo CREC | next morning 07:17 ET, up to +2 days [verifier: corrected — up to +6 days observed (Sep 16 issue created 09-22)] |
| [verifier addition] Federal district docket entry (D.D.C.) | PACER CM/ECF RSS `ecf.dcd.uscourts.gov/cgi-bin/rss_outside.pl` (key-free) | minutes (newest entry 16:59:27Z seen at 17:07:59Z) |
| Presidential doc (DCPD) | GovInfo CPD | ~34 days. **Archival only** |
| SCOTUS opinion / order | supremecourt.gov | real time (it is the source) |
| SCOTUS opinion in an aggregator | CourtListener | same day (date_created 22:01Z) |
| SCOTUS argument transcript | supremecourt.gov | same day (per the Court) |
| Federal district filing in a watched case | CourtListener docket alert | "within seconds" (RSS courts) |
| CBO / GAO publication | RSS | minutes (plus up to 1 h / 15 min of CDN cache) |
| Printed hearing transcript | GovInfo CHRG | months to years |

---

## 12. Normalization hints for the build session

- **Stable IDs:**
  - bills `119-hr-9340`
  - nominations `PN1180-2`
  - House meetings `house-event-119567` (same EventID in docs.house.gov and Congress.gov)
  - Senate meetings `senate-event-338781`
  - GovInfo `packageId`
  - SCOTUS `docket` + PDF filename
  - CourtListener `cluster_id`
- **Event types** (proposed): `committee.meeting.scheduled|updated|cancelled`, `bill.introduced`, `bill.action`,
  `bill.presented`, `bill.enacted`, `nomination.received|hearing|reported|confirmed`, `record.published`,
  `scotus.opinion`, `scotus.order`, `scotus.argument`, `court.opinion`, `report.cbo|gao|crs`.
- **Cross-link:** Congress.gov `recordedVotes[].url` points straight at Senate/House roll-call XML (F6).
  `meetingDocuments` and `videos` give the hearing pages. The GovInfo link service gives a permanent text link.
- **Show provenance and lag in the UI:** "Official record (next-morning batch)" versus "Live".

---

## 13. Ranked recommendations

1. **Get a free api.data.gov key before the first build session** (one key covers Congress.gov at 5,000/h and GovInfo
   at 36,000/h). DEMO_KEY is unusable: limit 10, shared per IP, and I hit a 429 during this research. Store it as a
   GitHub Actions secret.
   [verifier: confirmed and sharpened. DEMO_KEY gives about 10 requests per **UTC day** per IP on each API
   (`Retry-After` resolves to 00:00 UTC). Send the real key in the `X-Api-Key` header, which was verified, so it never
   appears in logged URLs.]
2. **First adapters for "Today's agenda" (F7):**
   - (a) House Committee Repository: ByWeek scrape plus postback XML.
   - (b) Senate `hearings.xml` (IMS).
   - (c) SCOTUS argument-calendar PDF and `live.aspx`.
   - (d) Congress.gov `/committee-meeting?fromDateTime=` as normalizer and video-link source.
   These are the only sources in this dimension that are genuinely ahead of time or same-day.
3. **Legislative change feed (F11):**
   - Congress.gov `/bill`, `/nomination`, `/amendment` with a rolling `fromDateTime` (avoids the CDN cache).
   - GovInfo BILLSTATUS batch RSS as the key-free fallback and cross-check.
   - Congress.gov `presented-to-president.xml` and GovInfo `bills`, `bills-enr`, `plaw`, `crec`, `ccal` RSS with IMS.
   - Label all of these "next-morning official".
4. **Courts:**
   - supremecourt.gov slip and orders pages (IMS polling, 60 s cadence on decision days), a docket-JSON watchlist, and
     `live.aspx`.
   - CourtListener **Atom feeds** for scotus, cadc and key circuits, with no API quota spent.
   - A CourtListener account for occasional enrichment (≤125/day) and the 5 free docket alerts on marquee
     administration cases.
   - [verifier addition] The **official SCOTUS slip-opinion RSS** (`/rss/slipopinion_rss.aspx?TYear=25`) as a
     structured cross-check of the HTML scrape. Dedupe revised `r` PDFs by docket.
   - [verifier addition] The **key-free D.D.C. PACER CM/ECF RSS** (`https://ecf.dcd.uscourts.gov/cgi-bin/rss_outside.pl`).
     It returns every docket entry from the last ~24 h (852 items, newest 8.5 min old at probe time), titled
     "case-no PARTY v. PARTY" with the entry type, e.g. "MOHAMMAD et al v. RUBIO et al — [Amended Complaint]". Filter
     it against a watchlist of administration cases. This is the primary source CourtListener's "within seconds" alerts
     depend on, and it costs no CourtListener quota. Document links go to paid PACER, so show only the entry text.
5. **Oversight and analysis:** CBO all-publications RSS, GAO `reports`/`reportslegal`/`reports_majrule` RSS, and
   EveryCRSReport RSS. All are cheap (ETag/IMS) and high signal.
6. **Use for recap only:** Daily Digest (next morning) for the "what happened yesterday" card, and DCPD/CPD only for
   archival transcripts of presidential remarks.
7. **Add a schema-drift and liveness test per adapter.** Congress.gov changed sorts, formats and fields in nearly every
   month of 2026.

---

## 14. Gaps (no free source covers these well)

- **Same-day bill actions and passage:** Congress.gov and GovInfo are next-morning batches. Same-day data needs the
  House Clerk floor feed and the Senate floor log (F1/F2/F5 dimension, not covered here).
  [verifier: weakened. BILLSTATUS batches run about every 4 h around the clock, and HR 9340's file was re-published
  three times on the day of its Senate vote. "Next morning" is the official promise, not a measured floor. Measure
  this on Oct 5–8.]
- **Live hearing transcripts:** nothing official. Printed hearings (CHRG) arrive months to years later. Live text would
  need captioning or ASR on the YouTube/ISVP streams (compute cost; owner decision).
- **Senate committee depth:** `hearings.xml` has no witnesses or testimony, and committee sites differ (per-committee
  RSS **UNVERIFIED**).
- **SCOTUS:** no official API or RSS for opinion and order lists, so it means HTML scraping. The argument calendar is
  PDF only. The live-audio stream URL is **UNVERIFIED** until a sitting day (Oct 5).
  [verifier 2026-10-02: corrected — there is official RSS for slip opinions, argument transcripts and argument audio
  (§8). **Orders** still have no RSS, so order lists remain an HTML scrape. `live.aspx` today contained no
  m3u8/stream URLs, so the stream URL is still UNVERIFIED.]
- **Executive Calendar:** PDF only (the pending-nomination XML partially substitutes).
- **CourtListener at scale:** the free tier (125/day) and the 5 free docket alerts are small. Webhooks may cost money.
- **CRS via Congress.gov API:** not verified live this session.

## 15. Risks

- **CDN staleness on Congress.gov** (`max-age=1800`). Detail pages may be up to 30 min stale even after a list poll
  shows a change.
- **Congress.gov HTML is bot-blocked** (403 to curl and WebFetch). Never depend on scraping it. RSS and the API are fine.
- **Monthly API drift:** default format changed to XML (Apr 2026), plus sort changes and field renames.
- **docs.house.gov XML needs an ASP.NET postback.** A site redesign would break it. Keep the Congress.gov
  committee-meeting fallback.
- **GovInfo RSS keeps only 100 items.** Overnight BILLS batches can exceed 100, so backfill from the API or
  BILLSTATUS.
- **GovInfo hangs:** occasional slow or hanging responses (one batch of fetches took more than 120 s). Use timeouts and
  retries.
- **Term-boundary URL change** on supremecourt.gov (`/25` → `/26`). Old `.aspx` paths now 404 (e.g.
  `argument_calendars.aspx`).
- **CourtListener:** limits were cut in 2026 and could be cut again.
  [verifier: the May 7, 2026 announcement also says "alerts for Supreme Court cases and queries" are coming "as a
  further member benefit", so expect more features to move behind membership.]
- [verifier addition] **Timestamp semantics:** many "dates" in this dimension are last-modified, not first-seen. This
  applies to Congress.gov `updateDate`, GovInfo `lastModified` and RSS `pubDate`, and to SCOTUS RSS revisions. Any
  latency or "new" logic must record its own first-seen time per item id, never trust the source timestamp as the
  event time, and never re-alert on a revision.
- [verifier addition] **Wrong zone labels:** the SCOTUS RSS labels some EDT times "EST". docs.house.gov XML timestamps
  carry no offset. Normalise to UTC with explicit America/New_York rules.
- **Shared DEMO_KEY:** keys are per account, but if anything falls back to DEMO_KEY on GitHub Actions' shared IPs it
  will 429 immediately.
- **Stale status fields:** e.g. Congress.gov `meetingStatus: "Scheduled"` on a meeting already held. Derive status from
  dates instead.
- **Volume and noise:** the 119th Congress is at H.R. 10,662 and S.Res. 948. GovInfo's `bills.xml` held 100 new
  bill-text items from a single overnight batch on 10/02, and ceremonial resolutions are common (e.g. S.Res. 947 and
  948 were agreed by unanimous consent on 9/30). The feed needs curation rules.

## 16. Questions only the owner can answer

1. May I (or the build session) register a **free api.data.gov key** and a **free CourtListener account** under your
   email, and store the tokens as GitHub repo secrets?
2. For bill status, is **next-morning official data** acceptable in v1, with same-day floor action coming from the
   Clerk/Senate floor sources? Or must every item be same-day?
3. **Courts scope:** SCOTUS only, or also major lower-court cases against or about the administration? The latter needs
   a curated watchlist and CourtListener docket alerts (5 free; more means membership).
4. **Curation:** show every introduced bill and simple resolution (100 bill-text items arrived overnight on 10/02), or
   only bills with committee or floor action, notable sponsors, or a "most-viewed" signal?
5. **Hearings:** list all House and Senate committee meetings (the House alone had 20 events on 2026-09-15), or only
   full-committee hearings and markups? Do you want embedded video links?
6. **Budget:** would you pay for (a) a CourtListener membership or webhooks, or (b) speech-to-text for live hearing
   transcripts? Neither is needed for v1.
   [verifier: concrete price — CourtListener Tier 1 is $10/mo or $100/yr and gives unlimited docket alerts, real-time
   opinion alerts and 300 API calls/day. Webhook pricing for organisations is by negotiation. The key-free D.D.C.
   PACER RSS may make a membership unnecessary for D.C. cases.]
7. **Alerts:** should any item types push a notification (e.g. "SCOTUS opinion released", "nominee confirmed", "bill
   sent to President")?

---

### Appendix A — exact probes run (2026-10-02 UTC)
- 15:31 `GET api.congress.gov/v3/bill?format=json&sort=updateDate+desc&limit=5` → 200, `X-Ratelimit-Limit: 10`, `Remaining: 9`, `Cache-Control: public, max-age=1800`, `Cf-Cache-Status: EXPIRED`
- 15:3x `GET /v3/bill/119/hr/9340/actions` → 200, `HIT`, `Age: 542`, Remaining 8
- 15:3x Congress.gov RSS ×8 → 4 × 200, 3 × 404, `/rss` → 302 to `/get-alerts` (which returns 403 to curl)
- 15:3x GovInfo RSS ×11 → all 200 (batch was slow, >120 s total). IMS re-requests → 304
- 15:4x supremecourt.gov slip/orders/docket JSON/RSS/live/transcripts/audio/calendars → 200. IMS → 304
- 15:4x docs.house.gov ByWeek/ByDay/ByEvent → 200. Postback XML → 200 attachment
- 15:4x senate.gov hearings.xml (200, IMS 304), Nom XMLs (200), xcalv.pdf (200), `executive_calendar/xml/exec_cal.xml` → 302 to file-not-found
- 15:5x api.govinfo.gov `/collections/CREC,DCPD,PLAW,CHRG/...` → count 0. `/collections/DCPD/...` → count 0. `/published/2026-09-28?collection=DCPD,CREC,PLAW` → 4. `/collections/CPD/...` → 9. `/packages/CREC-2026-10-01/granules` → 163
- 15:5x–16:0x Congress.gov `/committee-meeting?fromDateTime` (count 34), `/committee-meeting/119/house/119567`, `/nomination?fromDateTime` (count 51). 16:07 `/bill?fromDateTime=` → **429**
- 16:0x CourtListener v4 search (anonymous 200), clusters (401), Atom feeds scotus/cadc (200)
- 16:1x CBO / GAO / EveryCRSReport RSS → 200. GovInfo BILLSTATUS batch + file → 200. Link service → 302s
- 16:21 recheck: senate hearings.xml LM moved 14:05:45Z → 16:05:46Z. Congress.gov RSS `cf-cache-status: HIT`, `Age: 530`
- 16:26 retry of `/v3/bill?fromDateTime=2026-10-02T12:00:00Z...` → still **429** (DEMO_KEY window not yet freed), so
  the bill `fromDateTime` granularity stays **UNVERIFIED**

### Appendix B — sources consulted (docs)
- Congress.gov API README, ChangeLog.md and Documentation/openapi.json: `https://github.com/LibraryOfCongress/api.congress.gov`
- GovInfo API README: `https://github.com/usgpo/api`. Feed index: `https://www.govinfo.gov/feeds`
- Congress.gov coverage dates (via search snippet; the page itself returns 403 to bots): `https://www.congress.gov/help/coverage-dates`
- CourtListener REST v4 overview: `https://wiki.free.law/c/courtlistener/help/api/rest/v4/overview`. Webhooks:
  `https://wiki.free.law/c/courtlistener/help/api/webhooks/about`. Docket alerts:
  `https://wiki.free.law/c/courtlistener/help/alerts/docket-alerts-for-pacer`. ToS:
  `https://wiki.free.law/c/terms/courtlistener/courtlistenercom-terms-of-service-and-policies`
- SCOTUS transcript policy: `https://www.supremecourt.gov/oral_arguments/availabilityoforalargumenttranscripts.aspx`.
  Calendars: `https://www.supremecourt.gov/oral_arguments/calendarsandlists.aspx`
- Retired APIs: `https://projects.propublica.org/api-docs/congress-api/`,
  `https://congressionaldata.org/ending-govtracks-bulk-data-and-api/`, `https://github.com/propublica/sunlight-congress`
- Senate video prior art: `https://github.com/civictechdc/congressional-tech/pull/102`, yt-dlp `senategov` extractor
  (`https://github.com/yt-dlp/yt-dlp/commit/68221ecc87c6a3f3515757bac2a0f9674a38e3f2`)

---

## Verifier additions

Adversarial verification ran 2026-10-02, 16:29–17:20 UTC. I used curl (`--max-time 20`, same User-Agent), WebFetch and
WebSearch. DEMO_KEY was already exhausted on Congress.gov at the start, and GovInfo's DEMO_KEY ran out after 4 calls.
So nothing that needs the Congress.gov API could be re-observed.

1. **Official Supreme Court RSS exists. This refutes "no official opinions RSS".**
   - Index: `https://www.supremecourt.gov/rss/`. Its links stop at term 2023, but the current term works.
   - `https://www.supremecourt.gov/rss/slipopinion_rss.aspx?TYear=25` → 200 `text/xml`, 74 items. Each item has
     `title` "Name (docket)", `link` to the PDF, `description` = the summary, and `pubDate`. Example: "People Not
     Politicians v. Onder (26A388) - (per curiam)", "Fri, 25 Sep 2026 17:55:42 EDT".
   - Same pattern for `argument_transcripts_rss.aspx?TYear=25` and `argument_audio_rss.aspx?TYear=25` (58 items each).
   - Gotchas:
     - 12 items are revised U.S.-Reports PDFs (`609us…r…`) that come back with new pubDates. Chatrie v. United States
       was re-dated today, so treat these as revisions, not new opinions.
     - Some pubDates say "EST" during daylight time.
     - There is no LM/ETag (`private, max-age=120`).
     - Orders have **no** RSS.
   - Also present: `https://www.supremecourt.gov/rss/hermes_transfer.xml`, which lists order/docket XML files with
     modification times (e.g. `100126zr.xml` modified 9/30 5:33 PM, ahead of the 10/01 order). Its purpose is
     UNVERIFIED; it is worth one investigation as a possible early signal.
2. **Key-free PACER CM/ECF RSS for lower-court cases (F11 courts).**
   - `https://ecf.dcd.uscourts.gov/cgi-bin/rss_outside.pl` (U.S. District Court for D.C., where many cases against
     the administration are filed) → 200 `text/xml`, 360 KB.
   - 852 items covering a rolling ~24 h (10/01 17:03Z → 10/02 16:59:27Z, fetched 17:07:59Z), "Docket entries of type:
     all".
   - Item shape: `title` "1:25-cv-02757 MOHAMMAD et al v. RUBIO et al", `description` "[Amended Complaint] (22)",
     `link` = PACER docket report.
   - `Cache-Control: max-age=0`, no LM/ETag, so each poll fetches the full file. Every 5–10 min is plenty.
   - Coverage varies by court: `ecf.mdd.uscourts.gov` returned an empty 200, and appellate CM/ECF (`ecf.cadc…`) is a
     different system (301).
   - Document links lead to paid PACER. The entry titles are free.
   - This gives near-real-time lower-court tracking with no CourtListener quota. Court RSS terms of use were not
     reviewed (UNVERIFIED).
3. **Treat source timestamps as last-modified, not first-seen.**
   - Shown above for Congress.gov `updateDate` (HR 9340 re-edited today), GovInfo RSS `pubDate`/`lastModified` (CREC
     re-publications, CREC-1996-07-10 in the live feed) and SCOTUS RSS (revisions).
   - The build should keep a `first_seen_utc` per item id. That is the only honest latency instrument.
   - GovInfo MODS `recordCreationDate` (date only) is a key-free first-publication proxy.
   - `rss/billstatus-batch.xml` (100 batches, about 17 days) records *when* each bill file changed.
4. **DEMO_KEY is a daily allowance on both APIs.** `Retry-After` on the 429s resolves to 00:00 UTC on Congress.gov and
   on GovInfo, each with a separate counter of 10.
5. **CourtListener economics (2026).**
   - Defaults were cut on **May 7, 2026**, from 5,000/h to 5/min, 50/h, 125/day. Accounts that had made ≥1,000 requests
     were grandfathered.
   - Tier 1 is $10/mo for 10/min, 75/h, 300/day, unlimited docket alerts and real-time opinion alerts.
   - The free tier has no real-time opinion search alerts.
   - The announcement says SCOTUS alerts are coming as a member benefit.
   - The Atom feeds ignore IMS and hold 20 day-granular entries.
6. **House Committee Repository hearing XML.** It was verified on a hearing: `meeting-type="HHRG"`, filename
   `HHRG-119-WM00-20261006.xml`. Timestamps are Eastern local time with no offset.
7. **Congress.gov RSS `Last-Modified` = CDN refill time.** IMS is useless there; hash the body or diff guids instead.
8. **SCOTUS `orders/ordersofthecourt/26` is already live** (empty, 200), while `slipopinion/26` still redirects.
   Poll both term pages during the transition.

## Verification ledger

| # | Claim | Method | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Congress.gov API limit is 5,000 req/h | raw README from GitHub | CONFIRMED | "The rate limit is set to 5,000 requests per hour." |
| 2 | DEMO_KEY `X-Ratelimit-Limit: 10`, then 429 `OVER_RATE_LIMIT` | curl 16:31Z, 17:13Z | CONFIRMED | 429, Limit 10, Remaining 0, `Retry-After: 24374` (resets 00:00 UTC) |
| 3 | `X-Api-Key` header works (was UNVERIFIED) | curl with header only vs no key | CONFIRMED | header → 429 OVER_RATE_LIMIT (key recognised); no key → 403 API_KEY_MISSING |
| 4 | Default format became XML in Apr 2026 | ChangeLog.md; openapi `format` default | CONFIRMED | Apr 2026 Part 1 Change #6; openapi `default: xml` |
| 5 | `limit` max 250; `fromDateTime` format `YYYY-MM-DDT00:00:00Z` | openapi.json components | CONFIRMED | "The maximum limit is 250." / "Use format: YYYY-MM-DDT00:00:00Z." |
| 6 | Which list endpoints take `fromDateTime` (§2.1 table) | parsed openapi.json paths | CONFIRMED | e.g. `/committee-meeting` yes; `/hearing`, `/house-vote`, `/law/{congress}`, `/daily-congressional-record` no |
| 7 | `/bill` supports `sort=updateDate+desc` | openapi.json | UNVERIFIABLE | `sort` declared only on `/summaries`; live test blocked by 429 |
| 8 | Congress.gov CDN `max-age=1800`, cache HITs count against quota, rolling `fromDateTime` → MISS | live re-probe | UNVERIFIABLE | DEMO_KEY exhausted all session; 429 responses carry `X-Cache: MISS` only |
| 9 | ChangeLog drift items (sorts, RFC 3339, openapi rename, beta label, `continuationDate`, `introducedDate`) | ChangeLog.md grep | CONFIRMED | all six present with the stated months |
| 10 | Committee/nomination samples (count 34, count 51, PN1180-2, eventId 119567) | live re-probe | UNVERIFIABLE | API quota exhausted |
| 11 | Congress.gov RSS: 4 feeds 200; on-the-floor-today, crs-reports, congressional-record, crs-products 404 | curl 16:29Z | CONFIRMED | 4 × 200 (1300/445/454/2182 B); 4 × 404 |
| 12 | presented-to-president: 3 items, channel pubDate 29 Sep | curl | CONFIRMED | H.R.5345, S.766, S.195; no per-item pubDate |
| 13 | Congress.gov RSS `Last-Modified` usable for polling | IMS test | REFUTED | LM 16:13:27Z → 17:13:25Z with identical content; IMS → 200 |
| 14 | congress.gov HTML returns 403 to curl/WebFetch | curl + WebFetch | CONFIRMED | `/help/coverage-dates` 403 (both); `/rss` → 302 `/get-alerts` |
| 15 | Coverage page: "usually updated the morning after", actions ~8:00 a.m. | WebSearch snippet | CONFIRMED | snippet quotes both; page itself 403 |
| 16 | Senate vote → Congress.gov action +17.4 h; BILLSTATUS +18.8 h | BILLSTATUS file + batch RSS | REFUTED | measures latest edit (now `updateDate` 10/02 15:39:58Z); file re-published 9/30 20:31:13Z (+2.75 h) |
| 17 | GovInfo RSS feeds 200, `If-Modified-Since` → 304 | curl ×16 + IMS ×3 | CONFIRMED | all 200; crec/bills/dcpd 304 in 0.14–0.16 s |
| 18 | GovInfo RSS items not sorted newest-first; 100-item window | parsed all feeds | CONFIRMED | `sorted_desc=False` on all 15; hob 44, gaoreports 54, chrg 99 |
| 19 | `bills.xml` 100 items, all 04:58–09:05Z 10/02 | parsed | CONFIRMED | oldest 04:58:04Z, newest 09:05:01Z, 100 items |
| 20 | GovInfo fetches take 0.15–0.55 s after warm-up | timed curl | REFUTED | full GETs 2.3–8.5 s; only 304s are ~0.15 s |
| 21 | CREC lag at most ~2 days; Sep 29 issue first appeared 10/02 03:18Z | MODS recordCreationDate | REFUTED | Sep 29 created 10-01 (revised 10-02); Sep 16 created 09-22 (+6 d) |
| 22 | PLAW +7 d; DCPD/CPD +34 d | MODS | CONFIRMED | PLAW-119publ111 issued 09-18, created 09-25; DCPD-202600566 issued 08-28, created 10-01 |
| 23 | `rss/gaoreports.xml` stale (newest 2024-07-08) | parsed | CONFIRMED | newest 2024-07-08T15:22Z |
| 24 | GovInfo API limits 36,000/h, 1,200/min, 40/s | usgpo/api README | CONFIRMED | README lines 27–29 |
| 25 | GovInfo DEMO_KEY counted separately from Congress.gov | compared Remaining | CONFIRMED | GovInfo Remaining 3 while Congress.gov 0 |
| 26 | `/collections/CPD` works; `/collections/DCPD` → 0 | curl DEMO_KEY | CONFIRMED | CPD count 9; DCPD `count: 0` "No results found" |
| 27 | `/published?collection=A,B,C` takes a comma list; CREC-2026-10-01 lastModified 11:14:58Z | curl | CONFIRMED | 4 CREC packages; exact timestamp matched |
| 28 | CREC-2026-10-01 granules count 163 (98 HOUSE + 2 SENATE on page 1) | curl | CONFIRMED | count 163, Counter HOUSE 98, SENATE 2 |
| 29 | Link service 302s (bills xml, plaw html, cpd EO pdf) | curl | CONFIRMED | → BILLS-119hr9340pcs.xml, PLAW-119publ111.htm, DCPD-202600566.pdf |
| 30 | BILLSTATUS batch cadence ~3–5 h | parsed batch RSS | CONFIRMED | 14 recent gaps 1.9–5.5 h |
| 31 | Senate-sourced actions lack `actionTime` | parsed BILLSTATUS-119hr9340 | CONFIRMED | 29 actions, `actionTime` None on all shown |
| 32 | Recorded-vote URL points to Senate roll-call XML | curl | CONFIRMED | vote_119_2_00254.xml 200 text/xml 29 KB |
| 33 | docs.house.gov ByWeek 10/04 = 1, 09/13 = 14, ByDay 09/15 = 20 events | curl + regex | CONFIRMED | 1 / 14 / 20 |
| 34 | EventID 119575 "First Published: September 29, 2026 at 07:37 PM" | curl | CONFIRMED | text present |
| 35 | Postback recipe returns meeting XML | reproduced in Python | CONFIRMED | 200 octet-stream `HHRG-119-WM00-20261006.xml` |
| 36 | Hearing `meeting-type` code (was UNVERIFIED) | postback on a hearing | CONFIRMED | `meeting-type="HHRG"` |
| 37 | `Committee/RSS.ashx` has no RSS | curl | CONFIRMED | 302 → /Committee/Error/Error.aspx |
| 38 | House weekly floor XML for 20260914 | curl | CONFIRMED | 200, root `<floorschedule week-date="2026-09-14">` |
| 39 | Senate hearings.xml fields; IMS 304; If-None-Match 200 | curl 16:49Z | CONFIRMED | LM 16:05:46Z; IMS 304; INM 200 |
| 40 | hearings.xml regenerates about every 2 h | single observation | UNVERIFIABLE | only saw LM 16:05:46Z (no second change in my window) |
| 41 | NomCivilianConfirmed.xml 618 nominations; PN1129 Labor 2026-09-30; LM 10/01 07:28Z | curl + parse | CONFIRMED | 618; "Keith Sonderling … Secretary of Labor" ReportingStageDate 2026-09-30 |
| 42 | xcalv.pdf LM 10/01 14:32:49Z; dated 10_05_2026.pdf; exec_cal.xml → not found | curl | CONFIRMED | identical 275,347 B; exec_cal.xml 302 → file_not_found |
| 43 | Daily Digest PDF 200 (340 KB), PgD961 HTML, `-dailydigest.htm` invalid | curl | CONFIRMED | 340,015 B; PgD961 "adjourned at 10:30:41 a.m. until 4 p.m. on Monday, October 5"; .htm → 302 /error |
| 44 | SCOTUS has no official opinions RSS | /rss/ index + feed fetch | REFUTED | `slipopinion_rss.aspx?TYear=25` 200, 74 items |
| 45 | slipopinion/orders pages honour IMS; `/26` slip → 302 | curl | CONFIRMED | 304 ×3; slipopinion/26 → USReports.aspx |
| 46 | Term boundary: poll both `/25` and `/26` in early October | curl | CONFIRMED | `slipopinion/26` → 302, while `orders/ordersofthecourt/26` is already 200 (an empty Term 2026 page). Both pages need watching |
| 47 | Docket JSON keys, `max-age=120`, ETag, LM 9/28 19:50:47Z | curl | CONFIRMED | keys match; LM matches |
| 48 | Docket JSON last entry is "stay … granted" | parsed | REFUTED | last array element is "Amicus brief … submitted" (Sep 25); array not chronological |
| 49 | October 2026 argument calendar contents | pypdf on PDF | CONFIRMED | Suncor 25-170, Johnson v. United States Congress 25-735; "Amended … September 14, 2026" |
| 50 | live.aspx: no arguments today | curl | CONFIRMED | "There are no Oral Arguments or Live Audio scheduled for today." |
| 51 | Transcripts same day (Court statement); 58 transcripts OT2025 | curl | CONFIRMED | quote on availability page; 58 unique PDFs |
| 52 | Audio posting delay (was UNVERIFIED) | mp3 HEAD + audio RSS | UNVERIFIABLE | one sample LM 2025-11-05 18:29Z; suggests same day, not proven |
| 53 | CourtListener anonymous v4 search 200; clusters 401; count 498145 | curl | CONFIRMED | 26A388 `date_created` 2026-09-25T22:01:18Z; 401 "Authentication credentials were not provided." |
| 54 | CourtListener limits 5/min, 50/h, 125/day, "as of May 2026" | wiki.free.law + free.law blog | CONFIRMED | verbatim on overview; effective May 7, 2026 |
| 55 | CourtListener Atom feeds support conditional GET | IMS test | REFUTED | IMS → 200; LM = midnight PT of newest entry date |
| 56 | Atom feeds have no quota | docs search | UNVERIFIABLE | not documented; ToS mentions anti-crawling challenge |
| 57 | Docket alerts: 5 free, +10 RECAP bonus, "within seconds"; members unlimited | curl rendered wiki + membership page | CONFIRMED | quotes present; Tier 1+ "Unlimited" |
| 58 | Court RSS coverage counts (50+/8/30+/5/6) | curl + WebFetch | UNVERIFIABLE | lists client-rendered from template vars |
| 59 | Webhook event types, 7 retries, ~54 h, "reasonable fees" quote | WebFetch wiki | CONFIRMED | all present |
| 60 | FLP asks "please credit Free Law Project" | curl ToS + grep | REFUTED | phrase absent; ToS has "Attribute honestly …" instead |
| 61 | CBO RSS 30 items, newest 10/02 11:00-04:00, H.R. 7427 cost estimate, `max-age=3600` | curl | CONFIRMED | all match; also `stale-if-error=86400` |
| 62 | `cbo.gov/cost-estimates/rss.xml` → 404 | curl | CONFIRMED | 404 HTML |
| 63 | GAO 4 feeds 200 with 25/25/20/25 items | curl + parse | CONFIRMED | 25/25/20/25 |
| 64 | GAO `max-age=900` | headers | REFUTED | 3600 (reports) and 300 (others) |
| 65 | EveryCRSReport RSS newest 2026-09-29 | curl | CONFIRMED | 200, pubDate Tue 29 Sep 2026 |
| 66 | congress-legislators JSONs 200 (1.47 MB / 75 KB / 480 KB), last commit 2026-09-24 | curl + GitHub API | CONFIRMED | 1,469,059 / 74,732 / 480,243 B; commit 2026-09-24T10:17Z |
| 67 | ProPublica Congress API ended Jul 2024; GovTrack API ended; Sunlight shut Oct 1, 2017 | curl + WebSearch | CONFIRMED | "no longer available" (closed July 10, 2024); congressionaldata.org post 200; repo title "Shut down on Oct. 1, 2017" |
| 68 | `/bill?fromDateTime=` intra-day granularity | live test | UNVERIFIABLE | 429 |
| 69 | Prior-art links (civictechdc PR #102, yt-dlp senategov commit) | curl | CONFIRMED | both 200 with matching titles |

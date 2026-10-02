# Congress — floor activity, schedules, roll-call votes, members

**Dimension:** F1 Senate floor live · F2 House floor live · F5 what is being voted on now · F6 who voted how · F7 daily agendas · F8 who is speaking now
**Researched:** 2026-10-02, 15:30–16:35 UTC, by live probing with `curl` (UA `current-events-dashboard-research/0.1 (jst28323@gmail.com)`), WebSearch and WebFetch.
**Status labels:** **VERIFIED** means I fetched it today and quote what came back. **INFERRED** means I derived it from server timestamps or the site's own client code, not from watching a live event. **UNVERIFIED** means I could not confirm it today, and the reason is given.

---

## 0. Read this first: Congress is out until November 9

Both chambers left for the election recess in mid-September, so **no live floor session could be watched during this research.** All latency figures below come from server timestamps on the last real session days (House: Sep 15–16; Senate: Sep 28–30). They are labeled INFERRED.

- House: the Clerk's floor XML for 2026-09-16 records *"DISTRICT WORK PERIOD … from Wednesday, September 16, 2026, through Sunday, November 8, 2026"*. Since then the House has held only pro forma sessions (Oct 1 at 11:30; next one Oct 5 at 16:30 per `legislative_day_finished next-legislative-day-convenes="20261005T16:30"`).
- Senate: `senate.gov/legislative/schedule/floor_schedule.json` says it convenes Oct 5 at 16:00 for a pro forma session. The Senate Democrats' RSS has a post titled *"Schedule for Pro Forma Sessions and Monday November 9, 2026"*.
- **Planning consequence:** the first build sessions (October) will see only pro forma days. Build and test against **recorded fixtures** from Sep 15–16 (House) and Sep 28–30 (Senate). Run the **latency harness** (recommendation R6) during the post-election session that starts around Nov 9 to turn the INFERRED figures into measured ones.

---

## 1. Key findings (TL;DR)

1. **House, fastest source: the HouseLive backend JSON API (undocumented).** `https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net` serves floor actions, roll-call totals, bills-this-week, and a **live closed-caption transcript**. The official live.house.gov client polls `/latest/history` (352 bytes) **every 30 s** and fetches deltas only when a timestamp changes. The API supports `If-None-Match` and answers **304** (VERIFIED). Its CORS header is locked to `https://live.house.gov`, so it can only be called server-side. It is undocumented and therefore fragile. [verifier: UNVERIFIED that it is the *fastest* for floor actions — `/latest/floor` mirrors the Clerk data with identical `uniqueId` **and identical `updateDateTime`** (e.g. 45150 `2026-10-01T11:54:00.000` in both), and its own `lastActivityUpdate` (15:55:27Z) came ~0.5–1.5 min *after* the Clerk's 11:54 ET stamp. Which published file appears first is unmeasured until a live session. Its clear unique value is the caption transcript and the 304-friendly history poll. 352 B / `"inSession":false` / ACAO `https://live.house.gov` / `If-None-Match` 304 all re-confirmed 2026-10-02 16:38Z.]
2. **House, official source: the Clerk floor-proceedings XML**, `https://clerk.house.gov/floor/YYYYMMDD.xml`, archived by date. On Sep 15 and Sep 16, **84–87% of 322 actions had `update-date-time` within 2 min of `action_time`**, and 88–91% within 5 min. Vote-result lines lagged 4–45 min (n=9). [verifier 2026-10-02: corrected — re-parsing the same two files gives **n=17** recorded-vote result lines, not 9 (Sep 15: 10 lines, rolls 298–307; Sep 16: 7 lines, rolls 308–314), range 4.0–45.0 min. Every result line in a vote series carries the **same batch stamp** (Sep 15: 17:32 for rolls 298–300 and 22:37 for rolls 301–307; Sep 16: 19:12 for all of rolls 308–314). So the Clerk posts a series' results together, ~4–7 min after the series' last vote. The first vote in a long series therefore shows up 30–45 min late.] Gotcha: when out of session the file is **regenerated every 15 min** with a new `<pubDate>`, which changes the ETag even when nothing else changed (re-confirmed: Last-Modified 16:30:03 → 16:45:03 → 17:00:03 UTC, content identical apart from `<pubDate>`). Diff on content (`unique-id` plus `update-date-time`), not on ETag. [verifier 2026-10-02: addition — `If-None-Match` returns 200 **even with the current ETag**, but **`If-Modified-Since` returns 304** (tested twice). Use IMS to skip downloads between regenerations.]
3. **House member-level votes: Clerk roll-call XML** `https://clerk.house.gov/evs/2026/rollNNN.xml`. It has bioguide IDs and party/state and is VERIFIED. **Gotcha: a missing roll number returns HTTP 200** with a 65-byte body `<xml>Error sanitizing file "roll999.xml". Please try again.</xml>`. It sends no `Last-Modified`, so first-appearance latency is **UNVERIFIED** and must be measured in November.
4. **Senate member-level votes: senate.gov LIS XML.** It is official and complete, but **slow**. The XML's `Last-Modified` came **36–47 min after the vote closed** (n=4, Sep 30; close times taken from the Senate Daily Press Gallery log) and a median of **100 min after the vote started** (n=19). It is consistently about 28 min after the record's own `<modify_date>`, which suggests a batch export. `If-Modified-Since` works (304); `If-None-Match` does not (200).
5. **Senate, fastest source: the Senate press galleries' WordPress sites.** The **Daily Press Gallery** floor log (`dailypress.senate.gov/wp-json/wp/v2/posts`) has **time-stamped entries naming who spoke**, when each vote began and closed, and tallies. The **Periodical Press Gallery** log has vote results. On Sep 30, the Periodical log's `modified_gmt` was 03:25:18Z (11:25 pm ET), within about one minute of the 11:24 pm adjournment. Both are human-written and have no per-member votes.
6. **"Who is speaking now": no free, machine-readable, authoritative signal exists for either floor.** All 1,104 lines of the House caption transcript for Sep 16 are labeled `"UNIDENTIFIED SPEAKER"`. The Clerk floor summary names members only when they make motions or demands. For the Senate, the best signal is the Daily Press Gallery log ("7:40 p.m. Senator Bennet spoke on…"), which is human-entered and published after the fact. See §5.
7. **Congress.gov API v3:** `/house-vote` exists but is **Beta** and covers **only legislation-related votes**. [verifier 2026-10-02: corrected — the official ChangeLog says *"COMPLETED June 2025, Part 1 … Non-legislation related votes (e.g., 'Election of the Speaker') were added to the beta House roll call vote endpoints for 2023-present"*. Under *"COMPLETED December 2025, Part 2"* it says *"The 'beta' label will be removed from the House roll call vote endpoints"*. The OpenAPI spec (`Documentation/openapi.yaml`) still says "[BETA]". The "legislation only" sentence comes from the stale `HouseRollCallVoteEndpoint.md`. Coverage was not live-probed because `DEMO_KEY` was exhausted (HTTP 429, `X-Ratelimit-Limit: 10`, `Remaining: 0`).] **`/senate-vote` returns 404** (`"Unknown resource: senate-vote"`, VERIFIED). [verifier: absence CONFIRMED. There is no `senate-vote` path in `openapi.yaml`. A LoC maintainer replied on api.congress.gov issue #436 (2026-04-02): *"Only House roll call votes are available on Congress.gov and the Congress.gov API … we do not have any updates on if this functionality will be made available."*] `DEMO_KEY` has `X-RateLimit-Limit: 10`, which ran out after 6 calls today. [verifier: the header value of 10 is CONFIRMED. The api.data.gov developer manual instead documents *"Hourly Limit: 30 requests per IP address per hour; Daily Limit: 50 requests per IP address per day"* for DEMO_KEY, so the live limit is lower than documented.] A free registered key gets 5,000 requests per hour (per the official README; CONFIRMED: *"The rate limit is set to 5,000 requests per hour."*). Daily Congressional Record issues appear **the next morning**. [verifier: often later. The GovInfo CREC RSS shows Issue 156 (Oct 1) posted 2026-10-02T11:17Z, but Issue 155 (Sep 30) was posted 2026-10-01T17:28Z and Issue 152 (Sep 24) on 2026-09-25T18:02Z. Read it as next morning to next afternoon.]
8. **Schedules (F7):**
   - docs.house.gov weekly floor XML, which includes a history of every publish.
   - The House Republican Cloakroom `vote_sheet` posts. The Sep 16 vote series was **published 37 min before the first vote** and filled in with tallies afterward.
   - Senate `floor_schedule.json`, which gives the next convene time and the live stream URL.
   - Senate Democrats' "Schedule for …" and "Wrap Up for …" RSS.
   - Senate `hearings.xml`.
9. **Member identity:** `unitedstates/congress-legislators` JSON. It has `Access-Control-Allow-Origin: *`, maps bioguide↔LIS IDs (Senate XML uses `lis_member_id`), and was last updated 2026-09-24.
10. **Third-party sources:**
    - GovTrack API v2: alive, has Senate vote 256, CORS `*`. [verifier 2026-10-02: corrected — it answers, but it is **officially retired and unsupported**. GovTrack announced on 2016-12-12 (congressionaldata.org): *"Our open data and API will terminate next summer"*. `govtrack.us/developers` and `/developers/api` return 404. Reliability: the first probe timed out at 25 s and the second took 11.5 s.]
    - ProPublica Congress API: **dead since July 10, 2024** (VERIFIED shutdown page).
    - VoteView: daily CSVs.
    - unitedstates/congress scrapers: last push 2025-10-05.
    - OpenCongress (a 2026 newcomer): hourly, built on Congress.gov.
    - LegiScan: 403 to curl, so UNVERIFIED.

    None of these is faster than the official sources.

---

## 2. Source catalog

Freshness means how soon after the real-world event the data appears. Evidence is what I saw on 2026-10-02.

| # | Source | Endpoint | Features | Access | Auth/cost | Freshness | Polling etiquette | Evidence |
|---|---|---|---|---|---|---|---|---|
| H1 | HouseLive backend (undocumented) | `https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net/latest/{history,floor,votes,transcript,transcriptUpdates,billsthisweek}`; history: `/floor/YYYY-MM-DD`, `/votes/?start=YYYY-MM-DD`, `/transcripts/YYYY-MM-DD`, `/broadcastevents/YYYYMMDD`, `/sessiondays/YYYY` | F2, F5, F7, F1-like (House only; transcript text) | JSON | None. CORS `Access-Control-Allow-Origin: https://live.house.gov`, so server-side only | INFERRED about 30 s to 1.5 min. Official client polls every 30 s. Oct 1: `lastActivityUpdate` 15:55:27Z vs Clerk action update 11:54 ET; `lastTranscriptUpdate` 15:34:12Z vs adjournment 11:33:10 ET | Weak ETag; `If-None-Match` gives **304** (VERIFIED). Poll `/latest/history` only, then fetch what changed | curl 16:2x UTC: `/latest/history` 200, 352 B, `"inSession":false`; `/transcripts/2026-09-16` 200, 715,888 B, 1,104 lines; `/votes/?start=2026-09-16` 200, 7 votes (rolls 308–314) |
| H2 | Clerk floor proceedings XML | `https://clerk.house.gov/floor/YYYYMMDD.xml` (legislative day); RSS `https://clerk.house.gov/Home/Feed` | F2, F5, F7 (next convene) | XML; RSS 2.0 | None; public domain (17 USC 105, stated in file) | 84–87% of actions updated within 2 min of the action (n=322, Sep 15–16); vote-result lines 4–45 min (n=9) [verifier 2026-10-02: corrected — n=17 roll-call result lines (rolls 298–314), range 4.0–45.0 min, posted in one batch per vote series] | `Cache-Control: no-cache`. File regenerated **every 15 min** when idle (Last-Modified 15:30:03, 16:15:03, 16:30:03 UTC). ETag changes every regeneration, so `If-None-Match` is useless (returned 200). Hash the content [verifier 2026-10-02: INM returns 200 even with the *current* ETag; **`If-Modified-Since` returns 304** (VERIFIED twice). Use IMS, then hash.] | `20261001.xml` 200, 3,770 B, 7 actions; `20260916.xml` 200, 74,180 B, 170 actions; `20260930.xml` 404 (no session) |
| H3 | Clerk roll-call XML | `https://clerk.house.gov/evs/{year}/roll{NNN}.xml` (3-digit zero-pad) | F5, F6 | XML | None | **UNVERIFIED** (no Last-Modified; no session today) | No validators. **A missing roll returns 200 with a 65-byte error body**, so check size or the root element | `roll314.xml` 200, 94,247 B [verifier: 94,344 B on two fetches 2026-10-02; 433 `<recorded-vote>` confirmed], 433 `<recorded-vote>`; `roll999.xml` 200, 65 B error; last 2026 roll = 314 (Sep 16) |
| H4 | Congress.gov API `/house-vote` (Beta) | `https://api.congress.gov/v3/house-vote/{congress}/{session}/{n}[/members]` | F5, F6 (House) | JSON/XML (default XML; pass `format=json`) | Free api.data.gov key; 5,000 requests/hour (README); `DEMO_KEY` limit 10 | `updateDate` for roll 314 = Sep 17 18:38 ET vs vote Sep 16 19:05 (that is the last update; first ingest is UNVERIFIED) | `Cache-Control: public, max-age=1800`; Last-Modified present | `/house-vote/119/2/314` 200: `votePartyTotal`, `sourceDataURL`; only legislation-linked votes (docs) [verifier 2026-10-02: corrected — the ChangeLog (June 2025) added non-legislation votes for 2023-present. The "legislation only" text is from the stale endpoint .md. The response fields, `max-age=1800` and `updateDate` are UNVERIFIED: DEMO_KEY returned 429 at the verifier's first call] |
| H5 | docs.house.gov weekly floor schedule | `https://docs.house.gov/billsthisweek/YYYYMMDD/YYYYMMDD.xml` (Monday date) | F7, F5 (upcoming) | XML | None | Re-published as items change (18 publishes for week of Sep 14) | Last-Modified + ETag + `max-age`. **Never poll `BillsThisWeek-RSS.xml` (38.8 MB)** | `20260914.xml` 200, 56,837 B, `update-date="2026-09-15T11:20:08"` |
| H6 | House Republican Cloakroom (WordPress) | `https://repcloakroom.house.gov/wp-json/wp/v2/{floor,vote_sheet,leader_daily,leader_weekly,amendment}` | F5 (next vote series), F7, F2 summary | JSON (WP REST) | None | `vote_sheet` for Sep 16 created 21:51:25Z, which is **37 min before** the first vote (18:28 ET); tallies filled in by 23:19:58Z | Use `_fields=id,modified_gmt` for cheap change checks | `vote_sheet` 200; Sep 16 sheet lists 7 measures and Y/N tallies |
| H7 | HouseLive video and captions | HLS/DASH/WebVTT URLs inside `/broadcastevents/YYYYMMDD` (`houseliveprod-…azurefd.net/east/<stamp>/manifest.m3u8`, `captions.vtt`); YouTube `youtube.com/USHouseClerk/live` | F2 (video embed), F1-like captions | HLS/VTT | None | Live | n/a | `/broadcastevents/20260916` 200 with HLS, DASH and WebVTT file URLs |
| H8 | Clerk MemberData.xml | `https://clerk.house.gov/xml/lists/MemberData.xml` | identity (House) | XML | None | Changes when membership changes | Last-Modified | 200, 557,203 B, LM Sep 29 2026 |
| S1 | Senate roll-call XML and vote menu | `https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{NNNNN}.xml`; menu `…/roll_call_lists/vote_menu_{congress}_{session}.xml` | F5, F6 (Senate) | XML | None | **36–47 min after close** (n=4); median 100 min after start (n=19) | **`If-Modified-Since` gives 304** (VERIFIED); `If-None-Match` gives 200. Responses were often slow (21 sequential fetches took >120 s) [verifier: intermittent — menu in 0.20 s at 16:42Z; IMS 304 and INM 200 re-confirmed] | menu 200, 165,543 B, newest vote 00256 (Sep 30), LM Thu 01 Oct 03:47:06 GMT; vote 256 LM 03:46:58 GMT |
| S2 | Senate floor schedule JSON | `https://www.senate.gov/legislative/schedule/floor_schedule.json` | F7, F1 (stream URL) | JSON | None | Updated when the schedule changes | Last-Modified + ETag | 200, 974 B: convene 2026-10-05 16:00, `convenedSessionStream` `…/isvp/stv.html?type=live&comm=stv&filename=stv100526` |
| S3 | Senate daily floor activity XML | `https://www.senate.gov/legislative/LIS/floor_activity/MM_DD_YYYY_Senate_Floor.xml` (2026 files have **no year subfolder**; the `/2026/…` path redirects to not-found) | F1 (summary), F5 | XML | None | Final version the next morning (Sep 30 file LM Oct 1 13:36Z). **Same-day update cadence UNVERIFIED** | Last-Modified + ETag | `09_30_2026_Senate_Floor.xml` 200, 29,339 B, sections and `<document>` items, **no per-action timestamps** |
| S4 | Senate Daily Press Gallery floor log | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=5&_fields=id,date_gmt,modified_gmt,link,title` then `/posts/{id}?_fields=content,modified_gmt` | F1, **F8**, F5 (start and close times) | JSON (WP REST) | None | Human, entries per event. Sep 30 post modified until 03:57:40Z (adjourned 11:24 pm ET). Lag per event **UNVERIFIED** | Poll `modified_gmt` only | 200, `X-WP-Total: 1842` [verifier: re-confirmed 2026-10-02; reflects any `Origin` in ACAO, so it is browser-callable]; Sep 30 entries such as "9:29 p.m. The Senate began voting…", "11:00 p.m. … confirmed … 47-41" |
| S5 | Senate Periodical Press Gallery floor log | `https://www.periodicalpress.senate.gov/wp-json/wp/v2/posts?…`; RSS `…/category/floor-logs/feed/` | F1, F5 (results) | JSON / RSS | None | Sep 30 post `modified_gmt` 03:25:18Z, about 1 min after the 11:24 pm adjournment | RSS has Last-Modified + ETag | 200; Sep 30 log: "Confirmed, 47-41: Confirmation of Executive Calendar #912…"; no timestamps |
| S6 | Senate Democrats RSS | `https://www.democrats.senate.gov/feed` | F7 (next-day schedule), F1 wrap-up | RSS | None | Once per day, around adjournment | ETag, `max-age=300` | 200, 20 items: "Schedule for Pro Forma Sessions and Monday November 9, 2026" (pubDate labeled "EST" but really ET) |
| S7 | Senate committee hearings XML | `https://www.senate.gov/general/committee_schedules/hearings.xml` | F7 | XML | None | Daily or as posted | Last-Modified + ETag | 200, 407 B today: "No committee hearings scheduled" |
| S8 | Senate Executive Calendar | `https://www.senate.gov/legislative/LIS/executive_calendar/xcalv.pdf` | F7 (nominations pending) | PDF | None | Daily | Last-Modified | 200, 275,347 B, LM Oct 1 14:32Z |
| X1 | Congress.gov `/daily-congressional-record` | `https://api.congress.gov/v3/daily-congressional-record` | F1/F2 verbatim (next day) | JSON | key | **Next morning** [verifier: next morning to next afternoon. Per GovInfo RSS, Issue 155 (Sep 30) landed 2026-10-01T17:28Z] | as H4 | Issue 156 (Oct 1) `updateDate` 2026-10-02T11:44:33Z [verifier: API UNVERIFIED (429). Corroborated by the keyless GovInfo RSS `https://www.govinfo.gov/rss/crec.xml`: "Volume 172, Issue 156, (October 1, 2026)" pubDate 2026-10-02T11:17Z] |
| X2 | congress-legislators | `https://unitedstates.github.io/congress-legislators/legislators-current.json` (+ `legislators-social-media.json`) | identity | JSON | None; CC0 | Community-maintained (last commit 2026-09-24) | `max-age=600`, ETag, **CORS `*`** | 200, 1,469,059 B, 539 records (100 sen / 439 rep incl. delegates) |
| X3 | GovTrack API v2 | `https://www.govtrack.us/api/v2/vote?order_by=-created&limit=3` | F5, F6 (both chambers) | JSON | None | Ingest lag UNVERIFIED (search snippet claims "roughly hourly") [verifier: the official govtrack.us/about-our-data page says *"We update our vote data roughly hourly."*] | CORS `*` | 200; newest = Senate 256, `created` 2026-09-30T21:29 [verifier: `created` is the vote's start time (ET), not ingest time. The API is **officially retired** (2016 shutdown notice) and its docs page is 404. Probe 1 timed out at 25 s; probe 2 returned 200 in 11.5 s, `total_count` 113,719] |
| X4 | VoteView | `https://voteview.com/static/data/out/votes/S119_votes.csv` (and `H119_…`) | F6 (analysis) | CSV | None | Daily batch | Last-Modified + ETag | HEAD 200, LM Oct 1 07:01:56 GMT |
| X5 | ProPublica Congress API | — | — | — | — | **Shut down** | — | `projects.propublica.org/represent/`: "Represent and the Congress API are no longer available" (July 10, 2024) |

---

## 3. House details

### H1. HouseLive backend: fast House path, undocumented

I found it in `https://live.house.gov/js/app.9d37cb71.js` (`floorcast.config.api.base`). Routes listed in that config:

`/floor/ /votes/ /bills /billActions/ /committeemeetings/ /dailyschedule/ /billsthisweek/ /introduced/ /reported/ /passed/ /presented/ /enacted/ /sessiondays/ /transcripts/ /transcriptfiles/ /streamingUrl /broadcastevents /latest/memberDetails/ /latest/memberNameExceptions /latest/floor /latest/votes /latest/bills /latest/billActions /latest/committeemeetings /latest/billsthisweek /latest/dailyschedule /latest/transcript /latest/transcriptUpdates /latest/history`

Probe results:
- Worked (200): `/latest/floor`, `/latest/votes`, `/latest/transcript`, `/latest/history`, `/floor/2026-09-16`, `/votes/?start=2026-09-16`, `/transcripts/2026-09-16`, `/billsthisweek/2026-09-14`, `/broadcastevents/20260916`, `/sessiondays/2026`, `/latest/memberNameExceptions`.
- Failed (404): `/latest/dailyschedule`, `/streamingUrl`, `/dailyschedule/2026-09-16`, `/transcriptfiles/20260916`.
- Compact date IDs mostly 404. `/transcripts/20260916` gave 404. `/floor/20260916` returned the *latest* day instead.
- `/votes/20260916` **hung for 40 s**. Always set timeouts.

**How the official client polls** (from the JS): it runs `setTimeout(h, 3e4)`, i.e. it GETs `/latest/history` every 30 s. It compares `lastActivityUpdate`, `lastTranscriptUpdate`, `lastVoteUpdate`, `lastBillUpdate`, `lastBillActionUpdate`, `lastBillsThisWeekUpdate` and `lastDateChange`, and fetches only the matching `/latest/*` route when one moves. For the transcript it calls `/latest/transcriptUpdates?timespan=<last timestamp>&count=<n>`. Our poller should copy this pattern.

Sample `/latest/history` (VERIFIED, 352 B):
```json
{"lastActivityUpdate":"2026-10-01T15:55:27.971Z","lastBillUpdate":"2026-10-01T13:30:12.231Z","lastVoteUpdate":"2026-10-01T13:30:12.231Z","lastBillActionUpdate":"2026-10-02T13:08:01.808Z","lastBillsThisWeekUpdate":"2026-10-01T13:30:12.231Z","lastTranscriptUpdate":"2026-10-01T15:34:12.769Z","lastDateChange":"2026-10-01T13:30:12.231Z","inSession":false}
```

Sample `/latest/floor` subEvent. This is the same data as the Clerk XML, as JSON-LD, with the same `uniqueId`:
```json
{"type":"Event","uniqueId":"43840","updateDateTime":"2026-09-16T22:03:00.000","actionId":"H61000","actionTime":"2026-09-16T21:59:48.000","legisNum":"","description":"The Speaker announced that the House do now adjourn …","url":"http://clerk.house.gov/floorsummary/floor.aspx?day=20260916#43840"}
```
Times are **Eastern local with no offset**. `/latest/history` uses `Z` (UTC). Normalize both.

Sample `/votes/?start=2026-09-16` item. It has **totals only**: no member list and no timestamp.
```json
{"_id":"2026308","rollCallNum":"308","legisNum":"HR5334","voteQuestion":"On Motion to Concur in the Senate Amendments","voteType":"YEA-AND-NAY","result":"Passed","voteTotals":[{"option":"yea","total":262},{"option":"nay","total":159},{"option":"present","total":0},{"option":"not-voting","total":12}]}
```

Sample transcript line (`/latest/transcript`, `/transcripts/YYYY-MM-DD`). Keys are `speaker, text, timestamp, offsettime`, with times in seconds from the start of the video.
```json
{"speaker":"UNIDENTIFIED SPEAKER","text":"GENTLEMAN FROM TEXAS IS RECOGNIZED.","timestamp":11360.339,"offsettime":11598.253}
```
The UI labels this text "compiled from unreviewed Closed Captions". It is all caps, and **every one of the 1,104 lines on Sep 16 has `speaker = "UNIDENTIFIED SPEAKER"`**.

`/broadcastevents/20260916` gives the stream assets: HLS `…/east/2026-09-16T08-51-54/manifest.m3u8`, DASH `manifest.mpd`, and **WebVTT `captions.vtt`**, plus `startDate`, `endDate` and `isLiveBroadcast`.

`/sessiondays/2026` returns a list of `{_id:"20260102", startDate:"2026-01-02T16:00:00.000"}`, which serves as the House session calendar.

`/latest/memberNameExceptions` maps ambiguous names to bioguide IDs, e.g. `"Carter (TX)" → C001051`. This is useful for joining floor text to members.

Risks: the hostname is an Azure App Service instance (`…-003`) that can change without notice, CORS blocks browsers, and there are no published terms. [verifier 2026-10-02: partly corrected — there are no API terms, but the payloads carry a licence statement. `/broadcastevents/20260916` and `/latest/floor` include `"rights": "Pursuant to Title 17 Section 105 of the United States Code, this file is not subject to copyright protection and is in the public domain."`] Treat it as the **fast path with the Clerk XML as fallback**.

### H2. Clerk floor-proceedings XML and RSS: official House floor feed

Structure: `<legislative_activity>` contains `<legislative_day date=… previous-legislative-day-convened=…>`, then `<pubDate>`, then `<floor_actions>`. Inside that:
- `<legislative_day_finished next-legislative-day-convenes="20261005T16:30">Yes</…>`
- `<floor_action act-id="H37300" update-date-time="20260916T19:05" unique-id="…">` containing `<action_time for-search="20260916T19:05:16">`, `<action_description>` (may include `<a rel="bill" href=congress.gov…>`) and `<action_item>`.

Observed `act-id` codes. These come from the data and are **not an official codebook**:

| `act-id` | Meaning |
|---|---|
| H20100 | Convened |
| H22000 | Speaker pro tempore designated |
| H30000 | Considered |
| H35000 | Previous question ordered |
| H37100, H37300, H41610 | Vote outcomes ("(Roll no. 314)") |
| H38310 | Motion to reconsider tabled |
| H8D000 | Narrative ("DEBATE –", "ONE MINUTE SPEECHES –", "POSTPONED PROCEEDINGS –") |
| H24300, H24500 | Messages |
| H61000 | Adjourned |

Latency, computed as `update-date-time` minus `action_time`. `update-date-time` is the *last* edit and has minute resolution, so these are upper bounds. [verifier 2026-10-02: corrected — they are not strict upper bounds. `update-date-time` is truncated to the minute, so 67 of 152 (Sep 15) and 80 of 170 (Sep 16) computed lags are **negative**, which means the real lag can exceed the computed value by up to 59 s. The median, p75, p90, ≤2 min and ≤5 min columns below all reproduce exactly.]

| Day | n actions | median | p75 | p90 | ≤2 min | ≤5 min | Vote-result lines |
|---|---|---|---|---|---|---|---|
| 2026-09-15 | 152 | 0.1 min | 0.7 | 14.9 | 84% | 88% | n=5, median 14.9, max 45.0 min |
| 2026-09-16 | 170 | 0.0 min | 0.5 | 4.4 | 87% | 91% | n=4, median 31.3, max 43.7 min (rolls 309–311 all stamped 19:12, which looks like a batch edit) |

[verifier 2026-10-02: corrected vote-result column. The recorded-vote result lines (containing "(Roll no. N)") are **Sep 15: n=10 (rolls 298–307), median 27.7, range 4.0–45.0 min** and **Sep 16: n=7 (rolls 308–314), median 21.9, range 6.7–43.7 min**. On Sep 16 **all seven** result lines are stamped 19:12, not just rolls 309–311. On Sep 15 rolls 298–300 are stamped 17:32 and rolls 301–307 are stamped 22:37. Model this as a batch post at the end of each vote series, ~4–7 min after its last vote, not as a per-vote lag. Voice-vote result lines are near-instant (typically under 1 min).]

- The pro forma on Oct 1 had 7 actions: 5 were stamped within a minute, and the last two (message and adjournment) were stamped about 21 min later.
- RSS `https://clerk.house.gov/Home/Feed` mirrors the current day. Each item has `pubDate` (the action time, with offset `-0400`) and `a10:updated`. Its `guid` is the constant `urn:uuid:https`, so **it cannot be used for deduplication**. Use `unique-id` from the XML instead.
- `/Home/ViewStatus` returned `value="InSession"` while `/Home/ViewSession` said "House Not In Session". **Do not trust ViewStatus.** Use HouseLive `inSession` or `legislative_day_finished`.
- The XML does **not** name who is speaking. Members are named only when they act: "Mr. Raskin demanded the yeas and nays", "Mr. Massie rose to a point of personal privilege". On Sep 16, 11 of 170 actions named a member.

### H3. Clerk roll-call XML: House per-member votes

```xml
<rollcall-num>314</rollcall-num><legis-num>S 2403</legis-num>
<vote-question>On Motion to Suspend the Rules and Pass</vote-question><vote-type>2/3 YEA-AND-NAY</vote-type>
<vote-result>Passed</vote-result><action-date>16-Sep-2026</action-date><action-time time-etz="19:05">7:05 PM</action-time>
<totals-by-party><party>Republican</party><yea-total>191</yea-total><nay-total>14</nay-total>…
<recorded-vote><legislator name-id="A000370" sort-field="Adams" unaccented-name="Adams" party="D" state="NC" role="legislator">Adams</legislator><vote>Yea</vote></recorded-vote>
```
- `name-id` is the **bioguide ID**.
- The 2026 numbering ends at roll 314. I found that by binary search on response size, since status codes are useless here.
- `clerk.house.gov/evs/2026/index.asp` returns **404**. There is no year index, so walk `rollNNN.xml` upward from the last known number until you get the 65-byte error body.
- Latency is **UNVERIFIED**. There is no `Last-Modified`. HouseLive `/latest/votes` (totals) and the floor XML vote line will likely come first; measure in November.

### H5/H6. House agendas (F7, F5 "up next")

- **docs.house.gov weekly XML** has the root `<floorschedule congress-num="119" week-date="2026-09-14" … update-date="2026-09-15T11:20:08.180">` and a `<publish-dates>` history (18 publishes that week). Inside are `<category type="Items that may be considered under suspension of the rules">` and `<floor-item id add-date remove-date>` with `<legis-num>`, `<floor-text>` and text-file links.
- Folder dates are the week's Monday. HouseLive's `/billsthisweek/2026-09-14` is the same data as JSON.
- The **House Republican Cloakroom** WordPress offers the custom types `floor`, `vote_sheet`, `leader_daily`, `leader_weekly`, `amendment`, `mtr` and `pq`. A `vote_sheet` lists the measures in the next vote series before voting starts, then the Y/N tallies. Sample (Sep 16, created 21:51:25Z, modified 23:19:58Z): "Passage of H.R. 9576 – National Fraud Enforcement Division Act of 2026 · Y 352 · N 72".
- The House Democratic Cloakroom RSS (`democraticcloakroom.house.gov/rss.xml`) is **stale**; its newest item is from 2023.
- majorityleader.gov has HTML daily and weekly schedule pages and no structured feed found (`/news/rss.aspx` is press releases; not probed further). `floor.majorityleader.gov`, which the HouseLive config references, **does not resolve**.
- Committee meetings: docs.house.gov `Committee/Calendar/ByDay.aspx?DayID=MMDDYYYY` links to `ByEvent.aspx?EventID=…`, and the per-meeting XML sits behind an ASP.NET postback (`LinkButtonDownloadMtgXML`). That is awkward to scrape. Prefer Congress.gov `/committee-meeting`, which exists per the official OpenAPI spec but was **not live-probed** because `DEMO_KEY` was exhausted.

---

## 4. Senate details

### S1. Senate LIS roll-call XML: per-member votes, official but slow

```xml
<vote_number>256</vote_number><vote_date>September 30, 2026,  09:29 PM</vote_date><modify_date>September 30, 2026,  11:25 PM</modify_date>
<vote_question_text>On the Nomination PN1129</vote_question_text><vote_result_text>Nomination Confirmed (47-41)</vote_result_text>
<majority_requirement>1/2</majority_requirement><document><document_type>PN</document_type><document_number>1129</document_number>…
<count><yeas>47</yeas><nays>41</nays><present/><absent>12</absent></count>
<member><member_full>Alsobrooks (D-MD)</member_full><last_name>Alsobrooks</last_name><first_name>Angela</first_name><party>D</party><state>MD</state><vote_cast>Nay</vote_cast><lis_member_id>S428</lis_member_id></member>
```
- `vote_date` is the vote **start**, in Eastern time with no zone.
- Members are identified by **LIS ID**, not bioguide. Join through congress-legislators `id.lis`.
- The vote menu (`vote_menu_119_2.xml`) lists `<vote_number>`, `<vote_date>30-Sep</vote_date>` (no year and no time), `<issue>`, `<question>`, `<result>`, `<vote_tally>` and `<title>`.

Latency. Vote close times come from the Daily Press Gallery log (S4). `Last-Modified` is the last write, so these are upper bounds on first appearance.

| Vote | Start (ET) | Close (DPG log) | `modify_date` | XML Last-Modified (ET) | Close to XML |
|---|---|---|---|---|---|
| 253 | 11:58 am | 12:50 pm | 1:07 pm | 1:32:37 pm | 42 min |
| 254 | 12:51 pm | 1:40 pm | 1:52 pm | 2:16:40 pm | 36 min |
| 255 | 1:41 pm | 2:21 pm | 2:42 pm | 3:05:25 pm | 44 min |
| 256 | 9:29 pm | 11:00 pm | 11:25 pm | 11:46:58 pm | 47 min |

Across votes 236–256 (n=19, excluding two votes re-edited days later), the median from start to XML was 100 min, and the median from `modify_date` to XML was 28 min (range 19–36). That pattern points to a periodic export job. [verifier 2026-10-02: numbers reproduce (re-fetched votes 236–256: start→XML median 99.5 min, modify→XML median 27.5 min, range 19.2–35.6, n=19 after dropping 237 and 238). However, that n=19 still includes votes **239 and 246, whose `modify_date` is 1–2 days after the vote** (start→XML 1,355 and 2,799 min). Dropping all four re-edited votes gives n=17 with a start→XML median of 97 min. The four close→XML rows above (36–47 min) are CONFIRMED against the DPG Sep 30 log times and today's Last-Modified headers.]

### S2–S3. Senate schedule and floor summary

- `floor_schedule.json` fields:
  - `coveneOffsetMinutes` (*sic*)
  - `conveneYear/Month/Day/Hour/Minutes`
  - `convenedSessionStream` (ISVP player URL with `filename=stvMMDDYY`)
  - `outSessionLink`
  - `lastUpdated: "2026-10-01T09:34-05:00"`
- senate.gov's own `floor_status_new.js` reads only this file.
- The ISVP page builds Akamai HLS URLs (`…/master.m3u8`). I found **no separate caption or text track**. Whether captions are embedded in the stream is UNVERIFIED.
- Daily floor activity XML has sections (`journal`, `morning_business`, `legislative_business`, …) and `<document>` items with `<document_status_text>` ("Passed Senate without amendment by Unanimous Consent."). It has **no action timestamps**, which makes it a good end-of-day summary and a poor live feed.
- The index page is `/legislative/LIS/floor_activity/all-floor-activity-files.htm` (3.7 MB, don't poll it). Construct the filename directly.

### S4–S5. Senate press-gallery floor logs: best live Senate narrative

- **Daily Press Gallery** (`dailypress.senate.gov`, WordPress, 1,842 posts): one post per session day, newest entries first, each starting with a clock time. Real lines from Sep 30:
  - "9:29 p.m. The Senate began voting on confirmation of the nomination of Keith Sonderling to be Secretary of Labor."
  - "11:00 p.m. The Senate confirmed the Sonderling nomination on a party line vote of 47-41. Republicans not voting: Blackburn, Cornyn, Ernst, McConnell, Moran & Tillis."
  - "7:40 p.m. Senator Bennet spoke on the American dream, President Trump, and wealth inequality."
  - "1:40 p.m. The Senate did not invoke cloture on the motion to proceed to H.R. 9340 by a tally of 57-43. Democrats voting in favor: Hassan, Klobuchar, Ossoff, and Warnock."
- **Periodical Press Gallery** (`periodicalpress.senate.gov`, 691 posts): a shorter list of results with no clock times. Example: "Not invoked, 53-47: Motion to invoke cloture on the motion to proceed to Cal. #548, H.R.7008, Stop Insider Trading Act."
- Both logs are human-typed, so expect typos. Examples: DPG wrote "Gaban" and "Nuton Patel"; Periodical wrote "Nutan Patel". Parse with tolerant regexes, then link to the authoritative LIS vote once it lands.

### S6–S8.
- Senate Democrats RSS: "Schedule for <day>" and "Wrap Up for <day>" posts, about 1 per day each, published at adjournment. The pubDate's "EST" label is wrong in October; treat it as America/New_York. The `/floor/floor-updates` page is **stale** (newest 2022).
- I found **no current Senate Republican floor feed** on the web: `republican.senate.gov/floor-updates/` and `/floor/` return 404, and the site feed's Last-Modified is Jul 21 2026. GOP floor updates appear to live on X (`@SenateCloakroom`); X API access and cost are UNVERIFIED and outside this dimension.
- `hearings.xml` has fields `cmte_code, committee, type, date, date_iso_8601, time, room, matter, video_url`.
- The Executive Calendar is a PDF only.

---

## 5. Answers to the specific questions

**How long after a vote closes does it appear in each source?**

| Source | Chamber | Lag after close | Basis |
|---|---|---|---|
| HouseLive `/latest/votes` (totals) | House | ≤ ~30 s poll + ingest; **UNVERIFIED** | Client code polls every 30 s; Oct 1 activity ingest ≈1.5 min after Clerk update |
| Clerk floor XML vote line | House | median 15–31 min, range 4–45 min (n=9, upper bound) [verifier 2026-10-02: corrected — n=17, medians 27.7 (Sep 15) and 21.9 (Sep 16), range 4.0–45.0 min. Results are posted as one batch per vote series, ~4–7 min after the series' last vote] | `update-date-time` − `action_time` |
| Clerk roll XML (members) | House | **UNVERIFIED** | No validators; out of session |
| GOP Cloakroom `vote_sheet` | House | Series list available **before** voting; tallies by ~14 min after the last vote of the series (n=1) | WP `date_gmt` / `modified_gmt` |
| Congress.gov `/house-vote` | House | **UNVERIFIED** first ingest; last `updateDate` ~23.5 h after the vote | API field |
| Press gallery logs | Senate | Minutes (INFERRED; Periodical `modified_gmt` ≈1 min after adjournment) | WP `modified_gmt` |
| senate.gov LIS XML (members) | Senate | **36–47 min** (n=4) | Last-Modified vs DPG close time |
| GovTrack / VoteView / OpenCongress | both | GovTrack unknown (claimed ~hourly); VoteView daily; OpenCongress hourly [verifier: GovTrack's own about-our-data page says "roughly hourly". OpenCongress docs say "Votes — Hourly during session 9am–9pm ET on weekdays"] | Docs / headers |
| Congressional Record | both | Next morning [verifier 2026-10-02: corrected — next morning to next afternoon. GovInfo CREC RSS: Issue 156 at 11:17Z, Issue 155 at 17:28Z, Issue 152 at 18:02Z on the following day] | Congress.gov `updateDate` |

**How quickly does the Clerk floor summary reflect new actions during session?** Usually within the same minute. 84–87% of actions were stamped ≤2 min after they happened, but about 10% took 15 min or more (vote results, messages, long narrative entries). When out of session the file is rebuilt every 15 min. The in-session rebuild rate is **UNVERIFIED** but must be faster given the per-minute stamps; measure it in November.

**Is there any free, near-real-time, machine-readable "who is speaking now" signal?** **No authoritative one for either chamber.** The best available inputs:
- *House:* the HouseLive caption stream is near-real-time, but every line says `UNIDENTIFIED SPEAKER`. On Sep 16, 319 of 1,104 lines contained "RECOGNIZ". Of those, 183 included "GENTLEMAN/GENTLEWOMAN FROM <STATE>" and 63 included "MR./MS. <NAME>". Many one-minute recognitions omit the state ("THE GENTLEWOMAN IS RECOGNIZED FOR ONE MINUTE"). A heuristic of Chair recognition plus state, the member roster, and the bill manager from the floor XML could give a **probable** speaker label for debate, with low recall on one-minutes. It would have to be marked "inferred".
- *Senate:* the Daily Press Gallery log is the only source that names floor speakers (time + "Senator X spoke on Y"). It is written after each speech, so it says who spoke recently rather than who is speaking right now.
- *Not free or not live:* the C-SPAN Archives API (key by emailing `api@c-spanarchives.org`, per search results; UNVERIFIED) and the Congressional Record (speaker-attributed but next-day).
- *Experimental:* OCR of the on-screen name graphic in the HLS video, or speech-to-text with speaker ID. These need an always-on worker with ffmpeg. Not free-tier friendly and not validated.

**Is there a Senate equivalent of the House Clerk floor summary?** Not an official time-stamped one. The senate.gov daily floor activity XML is official but has no per-action times, and its same-day update cadence is UNVERIFIED. The functional equivalent is the **Senate Daily Press Gallery floor log** (WordPress REST): time-stamped, live-ish and human-written, but not a structured feed.

---

## 6. Architecture implications for the poller (for the first build session)

1. **Browsers cannot call most of these directly.**
   - HouseLive sends ACAO `https://live.house.gov`.
   - Clerk and senate.gov send no ACAO header.
   - congress-legislators and GovTrack send `*`.
   - [verifier 2026-10-02: addition — the **Senate Daily Press Gallery and Periodical Press Gallery WP REST APIs reflect any `Origin`**. With `Origin: https://example.github.io` both returned `Access-Control-Allow-Origin: https://example.github.io`, so a GitHub Pages page *can* fetch them directly. **repcloakroom.house.gov returns two ACAO headers** (the reflected origin plus `https://repcloakroom.house.gov/`), and browsers reject that, so it is server-side only.]

   So the static GitHub Pages front-end needs a **server-side poller** that writes normalized JSON (e.g., `feed.json`, `today.json`) somewhere the page can fetch.
2. **Cadence vs. host.** In-session targets: HouseLive `/latest/history` every 30 s (304 when unchanged), the Clerk floor XML every 60 s (hash-diff), the senate.gov vote menu every 60 s with `If-Modified-Since`, and the Daily Press Gallery `modified_gmt` every 60 s. Out of session or overnight, back off to 15 min. Today's numbers show a 5-minute scheduler would roughly double House floor latency; a 1-minute or always-on worker matches the sources.

   (Outside this dimension, not re-verified today: GitHub Actions scheduled workflows have a 5-minute minimum interval and can be delayed. Confirm in the hosting research.) [verifier 2026-10-02: CONFIRMED from docs.github.com "Events that trigger workflows": *"The shortest interval you can run scheduled workflows is once every 5 minutes."* The same page adds two things missing here: *"The schedule event can be delayed during periods of high loads … High load times include the start of every hour. If the load is sufficiently high enough, some queued jobs may be dropped."* and *"In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days."*]
3. **Detect sessions instead of polling blindly.**
   - House: HouseLive `history.inSession`, the Clerk `legislative_day_finished/@next-legislative-day-convenes`, and `/sessiondays/{year}`.
   - Senate: `floor_schedule.json` convene time.
4. **Dedup keys.**
   - House actions: `unique-id`.
   - House votes: `{congress}-{session}-h{roll}`.
   - Senate votes: `{congress}-{session}-s{vote_number}`.
   - Press-gallery posts: WP `id` plus a hash of each time-stamped line.
   - Never use the Clerk RSS `guid`, which is constant.
5. **Time zones.** Clerk XML, HouseLive floor JSON, the Senate XML `vote_date` and the press-gallery clock times are all **America/New_York local with no offset**. HouseLive history and WP `*_gmt` fields are UTC. The Senate Democrats RSS mislabels "EST". Normalize everything to UTC with explicit zone handling.
6. **Validity guards (fail closed).**
   - Clerk roll XML: require the `<rollcall-vote>` root, since a missing roll returns HTTP 200 with an error body.
   - senate.gov missing files return a **302 to `file_not_found.htm`**. Treat any redirect as "absent". [verifier 2026-10-02: corrected — it depends on the path. A missing **roll-call vote** (`vote1192/vote_119_2_00999.xml`) returns **301 → `/legislative/roll-call-vote-not-available.htm`**. The bad floor-activity path `/floor_activity/2026/…` returns 302 → `file_not_found.htm`. "Treat any 3xx as absent" still holds.]
   - Skip any HouseLive response that is not a JSON array or object.

---

## 7. Ranked recommendations

1. **R1 — House pipeline:**
   - HouseLive `/latest/history`-gated fetches (fast path) give `floor.action`, `vote.result` (totals) and `transcript.chunk` events.
   - The Clerk `floor/YYYYMMDD.xml` is the authoritative backfill and fallback, matched by `unique-id`.
   - Clerk `rollNNN.xml` gives `vote.members`.
   - Keep the Clerk XML as source of truth wherever the two disagree.
2. **R2 — Senate pipeline:**
   - The Daily Press Gallery and Periodical Press Gallery WP REST feeds give `floor.note`, `vote.started`, `vote.result (unofficial)` and `speaker.recent`.
   - The senate.gov vote menu and vote XML (polled with `If-Modified-Since`) give the official `vote.result` and `vote.members`.
   - `floor_schedule.json` gives `session.next` and the stream URL.
   - The daily floor-activity XML gives the end-of-day summary.
3. **R3 — Identity join table:** load `legislators-current.json` daily (bioguide ↔ LIS ↔ govtrack ↔ social handles) and HouseLive `memberNameExceptions` for ambiguous House names.
4. **R4 — Agendas (F7):** docs.house.gov weekly XML, GOP Cloakroom `vote_sheet` and `leader_daily`, Senate Democrats RSS "Schedule for…", Senate `hearings.xml`, and Congress.gov `/committee-meeting` once a key exists.
5. **R5 — Register a free api.data.gov key now.** `DEMO_KEY` (limit 10) ran out after 6 calls today, probably because parallel research shared the same IP.
6. **R6 — Build a latency harness before November 9.** It should record first-seen UTC per item per source to an append-only log. Run it in the first week back to replace every UNVERIFIED latency above with measured distributions (median and p90 per source). Pre-register what is being measured before the session starts.
7. **R7 — Capture fixtures now** while they are still the latest data:
   - House: `floor/20260915.xml`, `floor/20260916.xml`, roll 296–314, and HouseLive `/floor/2026-09-16`, `/votes/?start=2026-09-16`, `/transcripts/2026-09-16`.
   - Senate: votes 245–256, the 09_28–09_30 floor XML, and the DPG and Periodical posts for Sep 28–30.

   Use them as offline test data during the recess.
8. **R8 — Third-party sources: verification only.**
   - GovTrack API (alive, CORS `*`) can serve as a cross-check or backup for Senate votes. [verifier 2026-10-02: downgrade. It is officially retired (2016 notice, docs 404), slow (timed out once at 25 s), and updates votes only "roughly hourly". Use it as an occasional manual cross-check, never as a pipeline dependency.]
   - Do not build on ProPublica (dead), Sunlight (dead), OpenCongress (hourly, derived), or LegiScan (unverified, adds nothing over official XML for Congress).
9. **R9 — "Speaking now" (F8):** ship v1 with a **"recent speakers" (Senate, from the DPG log)** panel and a **"floor right now" panel built from the latest action plus the caption tail (House)**. Leave inferred House speaker labels for a later, explicitly experimental milestone.

---

## 8. Gaps: features no free source covers well

- **F8 "who is speaking now"** on both floors: no authoritative real-time source (see §5).
- **F1 Senate live transcript:** no text or caption feed found. Captions would have to be extracted from the ISVP HLS video (embedded captions UNVERIFIED) or produced by speech-to-text on a server. The official verbatim text (Congressional Record) arrives the next morning.
- **Fast Senate member-level votes:** official XML lands 36–47 min after close. Before that there are only unofficial tallies from the press-gallery logs, with names of defectors but no full member list.
- **House roll-call XML timing:** UNVERIFIED until November.
- **House committee meeting XML:** behind an ASP.NET postback. Use Congress.gov `/committee-meeting` (freshness UNVERIFIED).
- **Senate Republican floor updates:** no web or RSS feed found; X only.
- **Congress.gov `/senate-vote`:** does not exist (404). A Sep 12, 2026 GitHub issue in another project (search result) notes the same limitation. [verifier: stronger primary evidence is the LoC maintainer reply on `LibraryOfCongress/api.congress.gov` issue #436 (2026-04-02): "Only House roll call votes are available … Currently, the official source for Senate votes is: https://www.senate.gov/legislative/votes_new.htm".]

## 9. Risks

- **Undocumented HouseLive API:** the Azure hostname `…-003` can change and CORS is locked to live.house.gov. Mitigate with a Clerk XML fallback and an alert when HouseLive returns non-JSON or 404s on `/latest/history`.
- **Silent-failure traps:** the Clerk soft 404 (HTTP 200 plus error body), senate.gov's 302 to not-found [verifier: a missing vote XML gives a 301 to `roll-call-vote-not-available.htm`; treat any 3xx as absent], Clerk ETag churn every 15 min, the constant Clerk RSS `guid`, and `/votes/<compact-date>` hanging 40 s.
- **Human-written Senate logs:** typos, format drift, and possible site moves. The parser must tolerate this and should be backed by official XML.
- **Polling volume:** senate.gov was slow today (21 sequential small requests took over 120 s) and is Akamai-fronted. [verifier 2026-10-02: the slowness is intermittent — the vote menu returned in 0.20 s at 16:42Z and 17 sequential vote XMLs completed promptly. "Akamai-fronted" is UNVERIFIED: the response headers show `Server: Apache` and no Akamai headers. Only the ISVP video uses `*.akamaized.net`.] Use `If-Modified-Since`, back off when out of session, and send a descriptive User-Agent with contact info.
- **Calendar risk:** no live floor data until about Nov 9, and after Jan 3, 2027 a new Congress (120th) resets numbering. The Senate vote path changes to `vote1201/`, the House roll counter restarts per year, and the Congress.gov `{congress}` parameter becomes 120. Hard-code nothing.
- **Licensing:**
  - Clerk XML states it is public domain (17 USC 105).
  - senate.gov, the press galleries and the cloakroom sites are congressional offices, presumably public domain (**UNVERIFIED**, no terms found). [verifier 2026-10-02: corrected for **senate.gov** — its privacy/website-policy page (`/pagelayout/general/one_item_and_teasers/privacy.htm`) states *"Information presented on this site is considered public information and may be distributed or copied unless otherwise specified. Use of appropriate byline/photo/image credits is requested."* The press-gallery and cloakroom subdomains remain UNVERIFIED. The HouseLive JSON and docs.house.gov XML carry the 17 USC 105 public-domain statement.]
  - congress-legislators and unitedstates/congress are CC0.
  - GovTrack data license and LegiScan terms are **UNVERIFIED** (pages returned 403/404 to automated fetches).

## 10. Questions only the owner can answer

1. **Latency vs. $0:** House floor data can update within about 30 s, but only with an always-on poller (e.g., a 1-minute serverless cron or your home PC). Is a sub-minute target worth a small cost or a home-PC dependency, or is 5–15 min acceptable for v1?
2. **Undocumented sources:** may the product depend on the undocumented HouseLive API (with official XML fallback), or only on documented and official feeds?
3. **"Who's speaking":** would you accept *inferred* speaker labels (clearly badged) for the House, and a "recent speakers" list rather than "speaking now" for the Senate?
4. **X/Twitter:** the Senate GOP cloakroom and several floor-update accounts publish mainly on X. Is paying for X API access acceptable later, or should X be out of scope?
5. **Video:** should the dashboard embed live floor video (HouseLive HLS / YouTube, Senate ISVP), or link out?
6. **Personalization:** are there specific members, your own delegation, or topics to pin or alert on? This affects whether member-level votes must be fast (Senate official XML is about 40 min) or can arrive later.
7. **Recess plan:** OK to spend October building against recorded fixtures and validate live latency in the session starting around Nov 9?

---

## Appendix A — Reproduction commands (all run 2026-10-02)

```bash
UA="current-events-dashboard-research/0.1 (jst28323@gmail.com)"
B=https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net
curl -sS --max-time 20 -A "$UA" -H "Origin: https://live.house.gov" "$B/latest/history"
curl -sS --max-time 20 -A "$UA" "$B/transcripts/2026-09-16" | head -c 400
curl -sS --max-time 20 -A "$UA" https://clerk.house.gov/floor/20260916.xml | head -c 2000
curl -sS --max-time 20 -A "$UA" -w "%{size_download}\n" -o /dev/null https://clerk.house.gov/evs/2026/roll315.xml   # 65 => does not exist
curl -sS --max-time 20 -A "$UA" -I -H 'If-Modified-Since: Thu, 01 Oct 2026 03:47:06 GMT' \
  https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml                           # 304
curl -sS --max-time 20 -A "$UA" "https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date_gmt,modified_gmt,link"
curl -sS --max-time 20 -A "$UA" "https://repcloakroom.house.gov/wp-json/wp/v2/vote_sheet?per_page=3&_fields=id,date_gmt,modified_gmt,title"
curl -sS --max-time 20 -A "$UA" https://www.senate.gov/legislative/schedule/floor_schedule.json
```

## Appendix B — Sources consulted (web)
- Senate Periodical Press Gallery floor logs — https://www.periodicalpress.senate.gov/category/floor-logs/
- Senate Democrats floor pages — https://www.democrats.senate.gov/floor
- Congress.gov API repo (README, ChangeLog, OpenAPI, HouseRollCallVoteEndpoint.md) — https://github.com/LibraryOfCongress/api.congress.gov
- ProPublica Represent shutdown page — https://projects.propublica.org/represent/
- OpenCongress docs — https://opencongress.app/en/docs/us
- GovTrack "About our data" — https://www.govtrack.us/about-our-data
- LegiScan API (search snippet only; site returned 403) — https://legiscan.com/legiscan
- C-SPAN Archives API (search snippet only) — https://github.com/hanifsajid/cspan
- words-to-data issue on Senate votes (search snippet) — https://github.com/wordstodata/words-to-data/issues/112

---

## Verifier additions

Adversarial verification on 2026-10-02, 16:38–17:10 UTC. Every probe used `curl --max-time 20` (some 25–40 s) with the UA `current-events-dashboard-research/0.1 (jst28323@gmail.com)`. Items are ordered by how much they change the build plan.

1. **Clerk floor XML: use `If-Modified-Since`, not ETag.** IMS returned **304** twice, and INM returned 200 even with the ETag from the response just received. This makes 60-s polling of `clerk.house.gov/floor/YYYYMMDD.xml` cheap between regenerations.
2. **Clerk floor XML posts vote results in batches per vote series.** Every result line in a series shares one `update-date-time` (Sep 16: rolls 308–314 all at 19:12, 6.7 min after the last vote's `action_time` of 19:05:16; Sep 15: rolls 298–300 at 17:32 and rolls 301–307 at 22:37). For F5, "vote result" will show up all at once, ~5 min after a series ends. Faster per-vote totals must come from HouseLive `/latest/votes` (UNVERIFIED timing) or the GOP Cloakroom `vote_sheet`.
3. **HouseLive backend runs a socket.io server (push candidate, UNVERIFIED).** `GET https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net/socket.io/?EIO=4&transport=polling` returned 200 with an Engine.IO v4 handshake: `{"sid":"…","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`. The current client (`app.9d37cb71.js`) keeps a vestigial `config.websockets` block (`reconnect:!1`), but its `socketController` now just polls `/latest/history` every 30 s. Whether the socket emits floor/vote/transcript events is unknown. **Add it to the R6 latency harness in November**: subscribe and log any events next to the 30-s poll.
4. **The Senate press-gallery WP APIs are browser-callable (CORS reflects any origin).** A GitHub Pages client could read DPG and Periodical logs directly, as a fallback when the poller is down. The House GOP Cloakroom is *not* browser-callable: it sends two ACAO headers.
5. **The Daily Press Gallery publishes the full pro forma calendar (F7).** Post 167288 ("Thursday, October 1, 2026") lists every Senate pro forma date and time through Nov 5, plus *"The Senate will return for business on Monday, November 9th at 3:00 p.m. … At approximately 5:30 p.m., the Senate will vote on cloture on the motion to proceed to H.R.2347"*. That is a richer agenda than `floor_schedule.json`, which holds only the next convene time.
6. **GovInfo Congressional Record RSS needs no key.** `https://www.govinfo.gov/rss/crec.xml`: 200, 109 KB, `Last-Modified` present, 100 items. Use it to detect "Record for day X is out" without spending api.data.gov quota. Observed availability ranges from next morning (Issue 156: 11:17Z) to next afternoon (Issue 155: 17:28Z; Issue 152: 18:02Z).
7. **GovTrack API is officially retired.** It still answers, but there has been no support since the 2016 notice to terminate in summer 2017, and `govtrack.us/developers` returns 404. Do not depend on it.
8. **Congress.gov `/house-vote` coverage is broader than reported.** The ChangeLog says non-legislation votes for 2023-present were added in June 2025 and the "beta" label was slated for removal in December 2025, though the OpenAPI spec still says [BETA]. When a key exists, verify that `/house-vote/119/2/{n}` returns non-legislation votes.
9. **api.data.gov quota facts.** The DEMO_KEY doc says 30/hour and 50/day per IP, but the live header says 10. The default limit for a registered key is *"1,000 requests per hour … applied across all api.data.gov API requests"* unless a service overrides it (Congress.gov README: 5,000/hour). If Congress.gov, GovInfo and regulations.gov share one key, check each service's own limit.
10. **GitHub Actions cron caveats beyond the 5-min floor.** Docs say queued scheduled jobs "may be dropped" under high load (worst at the top of the hour), and scheduled workflows in a public repo are auto-disabled after 60 days without repo activity. Both matter if Actions is the poller.
11. **House Press Gallery (pressgallery.house.gov).** The "On the Floor" page shows a human-written "Vote Schedule" banner (today: *"The House is in a district work period. Next votes are expected Monday, November 9."*). Its RSS (`/rss.xml`) carries only announcements (newest Dec 2025), so it is not a floor feed. Its X account (@HouseDailyPress) is the House counterpart to the Senate galleries' logs. The X API cost is UNVERIFIED and out of scope.
12. **Senate floor captions: still UNVERIFIED.** The ISVP page (`/isvp/stv.html`) loads the Bitmovin player with an HLS source only and no sidecar text track. Live HLS is built as `https://www-senate-gov-media-srs.akamaized.net/hls/live/2096634/stv/stvMMDDYY/master.m3u8`, which returned 404 out of session. Archive manifests for `stv093026` also returned 404/400. Re-test for CEA-608 `CLOSED-CAPTIONS` in the master playlist during the Nov 9 session.

## Verification ledger

| # | Claim | Method | Verdict | Evidence |
|---|---|---|---|---|
| 1 | HouseLive `/latest/history` 200, 352 B, `inSession:false`, ACAO `https://live.house.gov` | curl with Origin header | CONFIRMED | 16:38Z: 200, `Content-Length: 352`, `ETag: W/"160-+GZ7…"`, ACAO `https://live.house.gov`, `X-Powered-By: Express` |
| 2 | HouseLive `If-None-Match` → 304 | curl INM with returned ETag | CONFIRMED | `INM 304` |
| 3 | Official client polls `/latest/history` every 30 s | fetched `live.house.gov/js/app.9d37cb71.js` (691,919 B) | CONFIRMED | `setTimeout(h,3e4)` inside `socketController.connect`; `transcriptUpdates?timespan=…&count=…` present |
| 4 | HouseLive is the *fastest* House source | compared HouseLive and Clerk timestamps | UNVERIFIABLE | `/latest/floor` carries identical `updateDateTime` to the Clerk XML; `lastActivityUpdate` 15:55:27Z is ~0.5–1.5 min after the Clerk 11:54 ET stamp; no live session |
| 5 | `/transcripts/2026-09-16` 715,888 B, 1,104 lines, all `UNIDENTIFIED SPEAKER`; 319 lines contain "RECOGNIZ" | curl + Python count | CONFIRMED | 715,888 B; Counter `{'UNIDENTIFIED SPEAKER': 1104}`; 319 "RECOGNIZ" (regex-dependent sub-counts: 178 vs 183 and 61 vs 63) |
| 6 | `/votes/?start=2026-09-16` → 7 votes, rolls 308–314, totals only | curl | CONFIRMED | 200, 3,343 B, rollCallNum 308…314, `voteTotals` |
| 7 | `/votes/20260916` hangs; `/floor/20260916` returns the latest day; `/transcripts/20260916` 404; `/latest/dailyschedule` 404 | curl | CONFIRMED | timed out at 20 s; `_id` 20261001; 404; 404 |
| 8 | `/broadcastevents/20260916` has HLS/DASH/`captions.vtt` | curl | CONFIRMED | 200, 2,122 B; `manifest.m3u8`, `manifest.mpd`, `captions.vtt`; `isLiveBroadcast:"False"` |
| 9 | `memberNameExceptions` maps "Carter (TX)" → C001051 | curl | CONFIRMED | `{"bioguideId":"C001051","name":"Carter (TX)"` |
| 10 | Clerk floor XML: 20261001 3,770 B/7 actions; 20260916 74,180 B/170; 20260930 404 | curl | CONFIRMED | identical sizes; 7/170/152 `<floor_action>`; 404 |
| 11 | Clerk floor XML regenerated every 15 min when idle; ETag churns | 3 fetches 16:38–17:00Z | CONFIRMED | LM 16:30:03 → 16:45:03 → 17:00:03; ETags differ; content identical except `<pubDate>` |
| 12 | Clerk floor XML: `If-None-Match` useless | curl INM / IMS | CONFIRMED (+ addition) | INM 200 even with current ETag; **IMS 304** (omitted by report) |
| 13 | 84–87% of actions ≤2 min; medians 0.1 / 0.0; p90 14.9 / 4.4 | re-parsed both XMLs | CONFIRMED | 84%/87% ≤2 min, 88%/91% ≤5 min, medians 0.07/0.02, p90 14.9/4.4 |
| 14 | Vote-result lines lag 4–45 min, n=9, medians 14.9 / 31.3; only rolls 309–311 batch-stamped | re-parsed both XMLs | **REFUTED** | n=17 (10 + 7); medians 27.7 / 21.9; all 7 Sep 16 rolls stamped 19:12 |
| 15 | Latency values are upper bounds | re-parsed | **REFUTED** (minor) | minute truncation makes 67/152 and 80/170 lags negative; error up to 59 s the other way |
| 16 | Sep 16 file records district work period Sep 16 → Nov 8; next House meeting Oct 5 16:30 | grep XML | CONFIRMED | "DISTRICT WORK PERIOD … September 16, 2026, through Sunday, November 8, 2026"; `next-legislative-day-convenes="20261005T16:30"` |
| 17 | Since Sep 16 only pro forma House sessions | HouseLive `/sessiondays/2026` + Clerk XMLs | CONFIRMED | session days after 0916: 0917, 0921, 0924, 0928, 1001; those files hold 6–8 actions each |
| 18 | Clerk RSS `guid` constant `urn:uuid:https`; pubDate `-0400` | curl | CONFIRMED | 7/7 items share that guid; `Thu, 01 Oct 2026 11:33:10 -0400` |
| 19 | `/Home/ViewStatus` says InSession while ViewSession says not in session | curl | CONFIRMED | `value="InSession"` vs "House Not In Session Next Session: October 5th, 2026 at 4:30 PM" |
| 20 | Clerk roll XML: roll314 433 recorded votes, bioguide `name-id`; missing roll → 200 + 65 B error; no Last-Modified; `index.asp` 404 | curl | CONFIRMED (size differs) | roll314 200 **94,344 B** (report 94,247), 433 `<recorded-vote>`; roll315/roll999 200, 65 B, "Error sanitizing file"; no LM/ETag; index.asp 404 |
| 21 | Congress.gov `/house-vote` Beta + legislation-only | ChangeLog, OpenAPI, endpoint .md | **REFUTED** (coverage) / CONFIRMED (spec still says [BETA]) | ChangeLog June 2025 Pt 1 #3 added non-legislation votes; Dec 2025 Pt 2 #4 beta label removal; openapi.yaml line 25 "[BETA]" |
| 22 | `/senate-vote` does not exist | OpenAPI paths + issue #436 | CONFIRMED (live 404 not re-probed: 429) | no `senate-vote` path; maintainer reply 2026-04-02 |
| 23 | DEMO_KEY limit 10 | curl headers | CONFIRMED (contradicts docs) | `X-Ratelimit-Limit: 10`; api.data.gov docs say 30/hour and 50/day per IP |
| 24 | Registered key 5,000 req/hour | README.md | CONFIRMED | "The rate limit is set to 5,000 requests per hour." |
| 25 | Default response format XML | ChangeLog | CONFIRMED | April 2026 Pt 1 #6: "The default response format is now XML for all endpoints." |
| 26 | `/house-vote` `max-age=1800`, `updateDate` Sep 17 18:38; CREC Issue 156 `updateDate` 11:44:33Z | — | UNVERIFIABLE | DEMO_KEY 429 on the verifier's first call; CREC timing corroborated by GovInfo RSS (11:17Z) |
| 27 | docs.house.gov weekly XML: 56,837 B, `update-date` 2026-09-15T11:20:08, 18 publishes; RSS 38.8 MB | curl | CONFIRMED | 56,837 B; `update-date="2026-09-15T11:20:08.180"`; 18 `<publish-date>`; RSS downloaded 38,854,265 B |
| 28 | GOP Cloakroom `vote_sheet` Sep 16 created 21:51:25Z, modified 23:19:58Z; types list | WP REST | CONFIRMED | id 11841 `date_gmt 2026-09-16T21:51:25`, `modified_gmt …23:19:58`; types include floor, vote_sheet, amendment, mtr, pq, leader_daily, leader_weekly |
| 29 | House Dem Cloakroom RSS stale; `floor.majorityleader.gov` does not resolve | curl, nslookup | CONFIRMED | newest pubDate 2023-04-12; "Could not resolve host" |
| 30 | MemberData.xml 557,203 B, LM Sep 29 | curl -I | CONFIRMED | 557,203; LM Tue 29 Sep 2026 20:36:31 GMT |
| 31 | Senate vote menu: 165,543 B, newest 00256, LM 03:47:06Z; IMS → 304; INM → 200 | curl | CONFIRMED | identical; `IMS 304`, `INM 200` |
| 32 | Senate votes 253–256 Last-Modified 36–47 min after DPG close times | curl + DPG post 167105 | CONFIRMED | LM 17:32:37Z/18:16:40Z/19:05:25Z/03:46:58Z; DPG lines 12:50, 1:40, 2:21, 11:00 p.m. present |
| 33 | Votes 236–256: start→XML median 100 min, modify→XML 28 (19–36), n=19 | re-fetched 21 XMLs | CONFIRMED (with caveat) | 99.5 / 27.5 / 19.2–35.6; n=19 still includes re-edited votes 239 and 246 |
| 34 | Senate XML `lis_member_id`, counts 47-41-12 | curl | CONFIRMED | `S428`; yeas 47, nays 41, absent 12 |
| 35 | `floor_schedule.json` 974 B; convene 2026-10-05 16:00; `coveneOffsetMinutes` typo; `lastUpdated 2026-10-01T09:34-05:00` | curl | CONFIRMED | `Content-Length: 974`, fields verbatim |
| 36 | `floor_status_new.js` reads only `floor_schedule.json` | curl JS | CONFIRMED | the only data URL in the file |
| 37 | Senate floor activity XML 29,339 B, LM Oct 1 13:36Z, no year subfolder | curl | CONFIRMED | 200, 29,339 B, LM 13:36:51Z; `/2026/…` → 302 `file_not_found.htm` |
| 38 | senate.gov missing files → 302 to `file_not_found.htm` | curl missing vote | **REFUTED** (partially) | missing vote XML → **301** → `roll-call-vote-not-available.htm` |
| 39 | DPG WP REST: X-WP-Total 1842; Sep 30 post modified 03:57:40Z; quoted lines incl. typos "Gaban", "Nuton Patel" | curl | CONFIRMED | `X-WP-Total: 1842`; id 167105 `modified_gmt 2026-10-01T03:57:40`; lines verbatim |
| 40 | Periodical Press Gallery: 691 posts, Sep 30 modified 03:25:18Z; RSS LM + ETag | curl | CONFIRMED | `X-WP-Total: 691`; id 90905 `modified_gmt 2026-10-01T03:25:18`; feed LM + ETag |
| 41 | Senate Dems RSS: 20 items, "Schedule for Pro Forma Sessions and Monday November 9, 2026", ETag, max-age=300 | curl | CONFIRMED | 20 items; title verbatim; pubDate "Wed, 30 Sep 2026 23:27:00 EST"; ETag W/…, `max-age=300` |
| 42 | "EST" label really means ET | — | UNVERIFIABLE | plausible (23:27 vs 11:24 pm adjournment); no machine timestamp to cross-check (`/wp-json` → 404) |
| 43 | No Senate GOP floor feed: `republican.senate.gov/floor-updates/` and `/floor/` 404; feed LM Jul 21 | curl | CONFIRMED | 404, 404; `/feed/` LM Tue 21 Jul 2026; old `republicans.senate.gov/public/index.cfm/floor-updates` also → 404 |
| 44 | `hearings.xml` 407 B "No committee hearings scheduled"; fields | curl | CONFIRMED | 407 B, fields verbatim (+ `day_of_week`, `senate_cable_channel`) |
| 45 | Executive Calendar PDF 275,347 B, LM Oct 1 14:32Z | curl -I | CONFIRMED | identical |
| 46 | congress-legislators: 1,469,059 B, 539 records (100/439), CORS *, max-age 600, last commit 2026-09-24, CC0 | curl + GitHub API | CONFIRMED | identical; commit 2026-09-24T10:17:24Z; license CC0-1.0 |
| 47 | unitedstates/congress last push 2025-10-05; CC0 | GitHub API | CONFIRMED | `pushed_at 2025-10-05T11:46:32Z`; CC0-1.0 |
| 48 | GovTrack API v2 alive, CORS *, newest Senate 256 | curl ×2 | CONFIRMED (but see 49) | try 1 timed out at 25 s; try 2 200 in 11.5 s, ACAO *, `total_count` 113,719 |
| 49 | GovTrack is a viable backup | GovTrack site + 2016 notice | **REFUTED** | API officially terminated (announced 2016-12-12); `/developers` 404; "roughly hourly" vote updates |
| 50 | VoteView S119 CSV LM Oct 1 07:01:56 | curl -I | CONFIRMED | identical, ETag present |
| 51 | ProPublica Congress API dead since July 10, 2024 | curl | CONFIRMED | "Represent and the Congress API are no longer available"; "July 10, 2024" on page |
| 52 | OpenCongress hourly, built on Congress.gov | curl docs | CONFIRMED | "Votes — Hourly during session 9am–9pm ET on weekdays"; "Congress.gov API … authoritative source" |
| 53 | LegiScan 403 to curl | curl | CONFIRMED | 403 |
| 54 | GitHub Actions 5-min minimum and delays | docs.github.com | CONFIRMED (+ omissions) | quoted; adds "queued jobs may be dropped" and the 60-day auto-disable |
| 55 | Clerk/senate.gov send no ACAO; browsers need a server-side poller | curl with foreign Origin | CONFIRMED (incomplete) | Clerk and senate.gov: no ACAO; DPG and Periodical reflect origin (browser-OK); repcloakroom sends a duplicate ACAO (browser-blocked) |
| 56 | senate.gov / press-gallery licensing UNVERIFIED | senate.gov policy page | **REFUTED** for senate.gov | "may be distributed or copied unless otherwise specified"; galleries still UNVERIFIED |
| 57 | senate.gov slow; Akamai-fronted | curl timing/headers | UNVERIFIABLE | menu 0.20 s today; `Server: Apache`, no Akamai headers |
| 58 | Senate ISVP has no caption track; embedded captions UNVERIFIED | curl ISVP page | CONFIRMED / still UNVERIFIABLE | Bitmovin, HLS only; live and archive manifests 404 out of session |
| 59 | Congressional Record "next morning" | GovInfo CREC RSS | **REFUTED** (partially) | Issue 156 next morning (11:17Z), but Issues 155 and 152 next afternoon (17:28Z, 18:02Z) |

# fixtures — recorded upstream responses (tests replay these; tests never hit the network)

Layout: `fixtures/<source_id>/<YYYY-MM-DD>/<name>` plus `<name>.meta.json` (url, final url, status, response headers,
bytes, sha256, fetched_at, User-Agent). Record new ones with `node scripts/record_fixture.mjs <source_id> <url>`.
Never edit a fixture by hand; re-record it under a new date. Files whose name contains `NEGATIVE` are error/empty
cases a parser must reject without emitting events.

## Set recorded 2026-10-02 (Congress in recess; session-day data from Sep 15–16 House, Sep 28–30 Senate)

| source_id | files | what it is | notes |
|---|---|---|---|
| `house.floorcast` | `latest_history.json`, `floor_2026-09-16.json`, `votes_start_2026-09-16.json`, `transcripts_2026-09-16.json`, `broadcastevents_20260916.json`, `sessiondays_2026.json` | the undocumented HouseLive backend behind live.house.gov (D-009: allowed, labeled "unofficial API") | transcript: 1,104 caption turns, all "UNIDENTIFIED SPEAKER"; server-side only (CORS-locked) |
| `house.clerk.votes` | `roll300.xml`, `roll310.xml`, `roll314.xml`, `roll315_NEGATIVE_error_body.xml` | official House roll-call XML (member-level, bioguide IDs) | roll 315 does not exist: HTTP 200 with a 65-byte error body |
| `house.clerk.floor` | `20260916.xml` | official Clerk floor proceedings for one session day | |
| `house.docs.floor` | `billsthisweek_20260914.xml`, `billsthisweek_20260928_NEGATIVE_file_not_found.html` | docs.house.gov weekly floor schedule | the NEGATIVE file is an HTTP 200 HTML "File Not Found" page |
| `house.domewatch` | `floor.json` | House Democratic Whip DomeWatch floor state (partisan, D-009) | contains a "test vote" record in production data (quarantine rule) |
| `senate.lis.votes` | `vote_menu_119_2.xml`, `vote_119_2_00256.xml` | official Senate vote list + one roll call (member-level, LIS IDs) | vote 256: "On the Nomination PN1129", Nomination Confirmed (47-41); raw dates have a double space |
| `senate.schedule` | `floor_schedule.json`, `hearings.xml` | Senate floor schedule (next: Mon Oct 5 16:00 ET pro forma) and committee hearings | `hearings.xml` is an EMPTY case ("No committee hearings scheduled") |
| `senate.captions` | `judiciary093026_master.m3u8`, `judiciary093026_text_1.m3u8`, 30 × `judiciary093026_text_1_00100..00129.vtt` | Senate Judiciary committee webcast (Sep 30) WebVTT caption rendition, ~6 minutes | roll-up captions: consecutive cues repeat lines (dedupe needed); speaker tags like `SEN. DURBIN:` (segments 114–115) |
| `senate.pressgallery` | `dailypress_posts.json`, `periodicalpress_posts.json` | Senate press galleries' WordPress REST posts (human-written floor logs, schedules) | |
| `wh.feeds` | `presidential-actions_feed.xml`, `news_feed.xml` | whitehouse.gov RSS (presidential actions; umbrella news feed) | site-wide ETag changes without new items: dedupe by GUID |
| `wh.live` | `live_page_not_live.html` | whitehouse.gov/live/ while NOT live | the live flag is the `data-live-duplex` attribute; a live-state sample still needs recording |
| `fr.api` | `pi_current.json`, `documents_newest20.json`, `documents_executive_orders.json` | Federal Register API: Public Inspection desk today; newest documents; newest executive orders | API only (the website blocks scripts) |
| `members` | `legislators-current.json` | unitedstates/congress-legislators current members (bioguide ↔ LIS ↔ names) | CC0 dataset; refresh when membership changes |

Not recorded on purpose: supremecourt.gov RSS (its robots.txt disallows `/rss/`; that needs an owner decision first),
C-SPAN (its terms forbid bots and AI use), YouTube (detect-and-embed only), anything that needs an API key.

<!-- Committed 2026-10-03 from the session's scratch/p35/. Its `ev/` evidence files (9.3 MB of saved headers and
bodies) stayed on the home PC and are not in the repo: the Verification ledger below is the record. Robots note
(added at commit, 23:16Z): https://www.youtube.com/robots.txt disallows /feeds/videos.xml for every user agent; 45 of
this research's requests went to that path before it was noticed (docs/TRAPS.md). -->
# Congress — leadership press conferences and stakeouts (F3, ROADMAP P3.5)

**Dimension:** F3 press conferences and briefings, congressional half: the Speaker's weekly presser, the House and Senate majority and minority leaders' and whips' pressers, the House conference/caucus weekly pressers, and the Senate leadership stakeouts after the weekly caucus lunches.
**Researched:** 2026-10-03, 21:53Z–23:03:37Z. **Research only (D-089):** no code, no fixtures. Nothing was written outside `scratch/p35/`.
**Method:** four source families (official offices, press galleries, video/live detection, third-party/social). Each had a researcher pass and an adversarial verifier pass. Probes were live `curl`/`node` GETs with the CLAUDE.md User-Agent, no keys, no logins, no paywalls. 423 requests are on disk; see the Verification ledger. This file merges the four verified reports and adds a synthesizer pass. That pass re-parsed the saved feeds and corrected one count (House Democratic Caucus, see V3). It also adds three cross-family findings: (1) YouTube's robots.txt and the office family's RSS plan disagree; (2) the in-session test windows were computed in EDT, but Nov 10 falls under EST; (3) Nov 11 is Veterans Day.
**Evidence paths:** `ev/` means `C:/Users/j/claude/current-events-dashboard/scratch/p35/evidence/`. Times are UTC unless marked ET.
**Status labels** (same as the other reports): **VERIFIED** means fetched on 2026-10-03 and quoted from the response. **INFERRED** means derived from server timestamps, archives or client code, not from watching a live event. **UNVERIFIED** means it could not be checked; the reason is given.

---

## 0. Read this first: Congress is out until November 9

Both chambers are in the election recess. The House is in a district work period through Nov 8; the Senate Democrats' RSS lists "Schedule for Pro Forma Sessions and Monday November 9, 2026" (docs/research/congress_floor_votes.md §0). **No presser could be watched live.** Every latency figure below compares archived server timestamps (YouTube `<published>`, WordPress `date_gmt`, Wayback capture times) with three reference times: Senate Daily Press Gallery floor-log times (minute precision), House Press Gallery scheduled times, and Internet Archive TV News start/stop times. Each figure is therefore INFERRED and dated.

Three calendar facts matter for the in-session measurement. All three are new in this synthesis.

- **DST ends Sun 2026-11-01.** The summer stakeout entries landed 18:16–18:55Z, which is 2:16–2:55 pm EDT. On Nov 10 the same wall-clock times are **19:16–19:55Z**. The offices family's proposed "17:45Z to 19:30Z" window was computed in EDT and would end before the expected entries. Shift every window by +1 h (§4).
- **Wed 2026-11-11 is Veterans Day**, a federal holiday. The usual Tuesday/Wednesday presser pattern that week is uncertain (INFERRED). Plan the decisive test for Tue Nov 10 *and* Tue–Wed Nov 17–18.
- **Not every Senate GOP stakeout falls on a Tuesday.** Of the 13 "LIVE: Senate GOP Speaks to the Press" entries, 3 are on Wednesdays: 07-15, 07-29 and 09-23 (synthesizer re-parse of `ev/offices/verifier/yt_senategop_lv.txt`). Poll windows must cover Tuesday and Wednesday.

---

## 1. Answer

There is **no free, keyless, terms-clean source that says "a congressional leadership press conference is live now."** The legal, buildable F3-Congress picture has four layers:

1. **Advance notice from the press galleries (official, nonpartisan).** The House Press Gallery homepage's "News Events on the Hill" block republishes the canonical EBBS board, which is itself robots-disallowed. It covers both chambers, and it listed the Speaker/Scalise/Emmer/McClain post-meeting presser, the Aguilar/Lieu caucus presser and the Senate lunch "STAKEOUT" with time and place, 12–17 h ahead (n=6 lower bounds, Wayback). The Senate Radio-TV Gallery homepage lists Senate leader avails and the Tuesday stakeout the evening before. Its Coverage Rules page fixes the stakeout at "approximately 2:15pm".
2. **"Video posted" from the conference and leader YouTube channels (partisan).** RSS `<published>` is the moment a stream became *public*. Measured against the Senate floor log and gallery times, that moment ran from about 21 min before a start (ambiguous case) to 50 min after it, or overnight. **It is not a start signal.** YouTube's robots.txt also **disallows `/feeds/videos.xml`**, and its ToS automated-access exception covers only public search engines. The documented WebSub push (Google's hub fetches the feed for us) is the cleaner path. Either way it needs an owner ruling.
3. **True live state from the YouTube Data API `videos.list`** (`liveBroadcastContent`, `actualStartTime`), 1 unit per call. This needs the owner's free Google key (P3.3, ask first). It is the only sanctioned way to turn "posted" into "live now" and to settle every timing question in this report.
4. **Post-hoc text from the leaders' own press releases**, partisan and limited to the principal's own remarks (no Q&A). Latency is about 1–3 h: speaker.gov, Thune's WP REST, Schumer's "TRANSCRIPT:" posts, Jeffries' "AT THE CAPITOL" posts.

Live caption text of leadership pressers has no legal free source: YouTube captions are off-limits (D-010), and the pressers do not run on chamber streams.

Every social and third-party route was rejected:
- Bluesky: 0 presser posts in 800 posts from leader and conference accounts.
- The X API is paid (D-001).
- The Hill (Nexstar terms) and Rev.com ban bots and AI use.
- CQ, Punchbowl and Politico are paid or walled.
- PBS NewsHour is legal but showed 0 advance pages for leaders in 2026 (owner decision).

---

## 2. Candidate sources

Origin labels follow D-009: **official** (nonpartisan government), **official-partisan** (a party conference or leader's office; label "from House Democrats" and so on), **third-party**. Every YouTube-hosted video is detect-and-embed only (D-010). "max-age" is the `Cache-Control` value.

### 2.1 Schedules: advance notice (galleries family)

| ID | Source | Origin | Advance notice | Live signal | Text | Access / terms | Latency evidence | Verdict |
|---|---|---|---|---|---|---|---|---|
| G1 | **House Press Gallery homepage, "News Events on the Hill" block** `https://pressgallery.house.gov/` (server render of EBBS) | official (nonpartisan gallery). Each row is an office advisory, so label it "announced (press gallery schedule)" | **YES, both chambers.** Rows give date, time, place and principals. Seen: 02/03 10:00 HVC Studio A "Speaker Johnson, Leader Scalise, Whip Emmer, and Conference Chairwoman McClain hold post-meeting press conference"; 02/03 10:45 Aguilar/Lieu; **02/03 11:30 OCC "STAKEOUT - SO for policy luncheons"** (Senate); 04/15 10:00 / 11:30 / 2:30 pm; 05/13 10:00 / 11:00; 05/14 2:00 pm McClain. The horizon is ONE schedule day and skips weekends (Fri 05/08 showed 05/11; Sat 10/03 showed 10/05). The next day goes up in the evening: present 21:23–21:25 EDT, absent 19:21–21:41 EST (n=4, INFERRED). **No Jeffries weekly presser and no Thune presser in 10 copies.** | none (1 row in 38 carried a YouTube URL in its text; researcher, not re-checked) | none | 200 HTML, Drupal 11, 20,212 B gzip. No ETag or Last-Modified; `no-cache, no-store` but `x-drupal-cache: HIT`. robots: Drupal default (allowed). `/copyright`: "a work of the Federal government under sections 105 and 403 of title 17". **Upstream EBBS is robots `Disallow: /`, so using this copy is an owner call.** Parser must be scoped to paragraph--id--79: the "Most Recent Votes" view shares the class `evo-view-ebbs-json-feed`. MM/DD with no year; no ids; double-escaped entities | Lead ≥12h36m, ≥14h06m, ≥17h06m (Apr 15 capture 01:23:47Z); ≥12h35m, ≥13h35m (May 13 01:25:12Z); ≥4h34m (May 14); ≥1h34m to ≥3h04m (Feb 3 13:25:53Z). **Empty block on a House voting day** (Wed Mar 18 13:26Z), so treat empty as "unknown". Lag behind EBBS unmeasured | **USE WITH CAVEATS (best advance source).** Poll every 5–15 min in session, hash-diff the scoped block. Needs an owner OK on the EBBS republication question. `ev/galleries/pressgallery_house_*.txt`, `ev/galleries/EXCERPT_pressgallery_house_ebbs_view_blocks.txt`, `ev/galleries/verifier/v_wb_pg_*.txt`, `VERIFIER_EXCERPTS.txt` |
| G2 | **Senate Radio-TV Gallery homepage, "News Events" block** `https://www.radiotv.senate.gov/` (Elementor widget data-id `4cdbf4b`) | official (nonpartisan Senate gallery staff); hand-typed | **YES, Senate side, evening before.** "STAKEOUT – SO for policy luncheons. ** Escort for crews from Gallery at 11:30 AM** Ohio Clock Corridor" on 4 of 5 sampled Tuesdays (absent Apr 28, the joint-meeting day). Leader avails with time and room: "MEDIA AVAILABILITY Senate Schumer holds a media avail. 3:30PM S-325" (live, for 9/30); "NEWS CONFERENCE: Senator Schumer … S-211 10:30 AM" (Feb 10). **No Thune entry seen.** The stakeout entry never names principals or a speaking time. 11:30 is the crew-escort time. | none | none | 200 HTML, WordPress 6.6.2, 22,610 B gzip, about 75 KB of pasted MS-Word comments to strip. Change detector: `/feed/` (456 B, empty RSS) Last-Modified = newest site edit; **IMS gives 304, INM is ignored**. REST `/wp-json/wp/v2/pages/51499?_fields=id,modified_gmt` is 81 B and **CORS reflects any Origin**. robots: Yoast empty `Disallow:`. **Terms page not found (UNVERIFIED).** | Stakeout listed 05:09:39Z Feb 10, ≥11h20m before the escort. Schumer's Feb 10 10:30 event: absent 05:09Z, present 17:11Z (same-day add). Durbin/Wyden Apr 28 listed 05:14Z, gone 17:12Z (silent removal). 12 Wayback copies + live page | **USE WITH CAVEATS.** IMS-poll `/feed/` every few minutes and fetch the page on change. Tolerant parser; check each date header against today (ET); support a "removed, reason unknown" state. `ev/galleries/radiotv_senate_*.txt`, `EXCERPT_radiotv_senate_news_events_blocks.txt`, `ev/galleries/verifier/v_rtvsen_*.txt` |
| G3 | **Senate RTV "Coverage Rules"** `https://www.radiotv.senate.gov/gallery-members/coverage-rules/` (REST pages/71949) | official | **Static standing rule:** "Senate policy luncheon stakeouts, held every Tuesday at approximately 2:15pm". The FAQ (pages/74045) says the Majority and Minority Leaders may book the studio without a gallery invitation. | none | none | WP REST JSON 29,111 B; same host rules as G2 | n/a | **USE as a static label** ("about 2:15 pm per gallery rule"). Not a poller. `ev/galleries/verifier/v_rtvsen_rules.txt`, `v_rtvsen_faqs.txt` |
| G4 | **Senate Daily Press Gallery floor log** (existing P2.1 source) `https://www.dailypress.senate.gov/wp-json/wp/v2/posts` | official | **Indirect only.** Its search for 'stakeout' returns `X-WP-Total` 0. The Tuesday line "The Senate will recess from 12:30 p.m. to 2:15 p.m. to allow for weekly caucus meetings" (post 166855) confirms the lunch window. The line was present by 03:38Z the night before (modified_gmt is an upper bound only). | none for pressers. It is **the ground truth for calibrating Senate-side YouTube timing** (actual return-from-recess times and leader floor-speech starts) | floor remarks only | robots empty `Disallow:`; CORS reflects Origin (congress_floor_votes.md S4) | Return from recess varies: 2:00 pm 7/15, 1:50 pm 9/15, about 2:00 pm 5/12 and 5/19 | **KEEP** (already planned) as the stakeout-window hint and calibration clock. `ev/galleries/dailypress_*.txt`, `ev/offices/verifier/dp_posts_mayaug.txt`, `dp_posts_sep.txt` |
| G5 | EBBS `https://ebbs.senate.gov/` | official (Senate Sergeant at Arms) | canonical upstream of G1 | none seen | none | **robots `User-agent: * / Disallow: /`** (26 B, re-fetched 22:34:36Z); `/events/upcoming/` needs a login | not measured (forbidden) | **REJECT direct use**; reach it only via G1. `ev/galleries/ebbs_*.txt`, `verifier/v_ebbs_robots.txt` |
| G6 | House Radio-TV Gallery `https://radiotv.house.gov/` | official | none of its own (links to EBBS login) | none | none | 200, 13,423 B gzip | n/a | **REJECT.** `ev/galleries/radiotv_house_*.txt`, `verifier/v_rtvhouse_home.txt` |
| G7 | Periodical Press Galleries (`periodicalpress.senate.gov`, `periodical.house.gov`) | official | none | none | none | robots allow | n/a | **REJECT** (researcher only; not re-probed). `ev/galleries/periodical*.txt` |

### 2.2 Live and "video posted" detection (offices and video families)

All YouTube rows: keyless Atom feeds with the 15 newest entries, `max-age=900`, no ETag or Last-Modified (0 of 18 feeds), so there is no 304. **`https://www.youtube.com/robots.txt` (Last-Modified 2026-07-22) has `User-agent: *` … `Disallow: /feeds/videos.xml`** (line 33 of `ev/video/verifier/yt_robots.txt`, re-confirmed 22:40:00Z). The ToS automated-access exception is "public search engines, in accordance with YouTube's robots.txt" only. RSS `<published>` = when the video became public. `LIVE` in a title is not a live flag.

| ID | Source | Origin | Advance notice | Live signal | Text | Access / terms | Latency evidence | Verdict |
|---|---|---|---|---|---|---|---|---|
| V1 | **Senate Republicans live playlist** `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVAdyfSY2oRwNIB4LddDYZJA` (channel UCAdyfSY2oRwNIB4LddDYZJA; "LIVE: Senate GOP Speaks to the Press \| MM-DD-YY") | official-partisan (Senate Republican Conference) | none (never published before event day) | **Weak / UNVERIFIED.** 12 of 13 stakeout entries were same day, 18:16:36–18:55:35Z. They came +1.6 to +49.8 min after the Senate's *actual* return from recess (floor log; n=12, median about +22). 2 overnight: 05-19 published 2026-05-20T06:37:53Z; "LIVE 07.14.26" published 07-15T07:57:09Z (is it a stakeout? INFERRED). The stakeout start is recorded nowhere, so "start" vs "end" cannot be decided. **oEmbed 401 on T5cTzKYpI3E**: embedding looks disabled on this channel only (INFERRED, n=1 channel). | none | robots disallows the path (see above); 17 KB / 1,882 B gzip | Thune text followed the entry by +1h04m33s, +1h46m41s and +1h37m48s; Thune's clip by +20m33s to +30m55s (n=3) | **USE WITH CAVEATS, as "stream posted (live or recently ended)" only.** Get it via WebSub (V8) if the owner allows, and confirm with V9. If not embeddable, link out. `ev/offices/yt_senategop_lv.txt`, `ev/offices/verifier/yt_senategop_lv.txt`, `EXCERPT_verifier_calibration.txt`, `ev/video/verifier/yt_oembed_T5c.txt` |
| V2 | **Senate Democrats live playlist** `…?playlist_id=UULVpgILFSGxY-9mQR79fLSt2A` ("Senate Democrats Live, M.DD.YYYY") | official-partisan (Senate Democratic Caucus / Schumer) | none in RSS; G2 sometimes lists the avail with a time | **Weak / UNVERIFIED.** 15 of 15 same day (14:43:08Z–21:19:19Z). Against the actual recess return: +18.3 to +95.6 min (n=8). On stakeout days it usually trails the GOP entry by 9–46 min (6 of 7 days). Against known starts: 9/24 +13.1 min after Schumer's logged 10:30 floor start; 9/30 +21m52s after the gallery-scheduled 3:30 pm (n=1 each) | none | as V1; 18.6 KB; oEmbed 200 (embeddable) | as stated | **USE WITH CAVEATS**, weaker than V1. `ev/offices/yt_sdems_lv.txt`, `ev/offices/verifier/yt_sdems_lv.txt`, `ev/video/verifier/yt_oembed_*.txt` |
| V3 | **House Democratic Caucus live playlist** `…?playlist_id=UULVxhAOE8DbC8iVNhAgQw5eNg` (channel resolved via `?user=HouseDems`; "M.D.YY Weekly Press Conference", Aguilar/Lieu) | official-partisan (House Democratic Caucus) | none in RSS; G1 lists the presser with time and place | **Weak.** **Synthesizer correction:** re-parsing the saved feed gives **8 of 15 same day (15:08:45Z–21:02:06Z) and 7 overnight (03:09:17Z–04:51:16Z)**. This matches the video family; the offices verifier's "6 and 9" was a miscount. Against G1 scheduled starts: 4/15 +36m10s, 5/13 +30m49s (n=2), probably near or after the end of a 20–30 min presser (INFERRED) | Chair's remarks via democrats.house.gov (O5) | as V1; `democrats.house.gov/robots.txt` 410 Gone | n=2 vs schedule | **USE WITH CAVEATS** as a same-day "caucus presser video is up" signal on about half the weeks. Pair with G1. `ev/offices/verifier/yt_housedems_lv.txt`, `ev/video/yt_uulv_housedems.txt` (identical entries) |
| V4 | House Republicans channel + live playlist `…?channel_id=UC4czmSY7dsAiLFseD313tKA`, `…?playlist_id=UULV4czmSY7dsAiLFseD313tKA` (weekly presser as "LIVE: Chairwoman McClain Speaks at a House Republicans Leadership Stakeout") | official-partisan (House Republican Conference) | none (G1 lists it) | **No.** All 15 live entries overnight (02:27Z–07:40Z next day). The 12 weekly-presser entries were 22:27–23:39 EDT. Against G1 times: +12h42m, +12h51m, +12h26m (n=3). Per-speaker clips land in the channel feed the same morning (9/15: 15:32:53–15:58:13Z; 9/1: 15:16:00–15:39:46Z; start unverified) | none | as V1; oEmbed 200 | as stated | **REJECT for live**; channel feed = "clips posted", about 1.5–2 h after a 10:00 presser (INFERRED). `ev/offices/yt_housegop*.txt`, `ev/video/yt_uulv_housegop.txt` |
| V5 | Leader Jeffries channel + live playlist `…?channel_id=UCYVmbsjoNbQ4j-PCQIYgpWQ`, `…UULVYVmbsjoNbQ4j-PCQIYgpWQ` | official-partisan (House Democratic Leader) | none | **No.** 14 of 15 overnight (03:07Z–09:13Z). Release-linked streams: +8h01m (9/14), +11h42m (9/23). The 9/30 event ITkB2c573fI appears **only in the uploads feed** (20:50:39Z same day). A stream can be public and linked from a release hours before RSS lists it (V4DWXH_UKcE). | none | as V1 | n=2 + n=15 | **REJECT for live**; replay only, and watch both feeds. `ev/offices/yt_jeffries*.txt`, `ev/offices/verifier/yt_jeffries_lv.txt` |
| V6 | Speaker Johnson channel `…?channel_id=UCzqBEpeIaDEfvAtsA53Fx2Q` (+UULV) | official-partisan (Speaker's office) | none | **No** in 2026. The weekly presser appears as a clip (sALqzexDY6Y 2026-09-15T15:20:10Z). 5/12 vigil +12h50m. Note: in Oct 2025 the channel streamed "Shutdown Press Conference" days 6/7/13 in daytime (14:26–14:44Z same day), so behavior changes over time | none | as V1 | n=1 matched | **REJECT for live**; clip/replay source. `ev/offices/yt_johnson*.txt`, `ev/video/yt_uulv_johnson.txt` |
| V7 | Other personal channels: Schumer UC-ABttxh8uQv_10qmwGaidw (floor streams), Thune UCRu6lpRfxhkDGUrKDgQNZYQ (no live), Scalise UCmYveHBVXVBRxl7GiCL-gjw (no live since 2023), Clark, Durbin; Barrasso and Aguilar-personal UULV 404; Emmer id unknown (`?user=RepTomEmmer` 404) | official-partisan | none | Schumer's floor-stream entries are the **calibration set**: against floor-log starts, -21 min (ambiguous, 2 speeches on 9/30) to +50 min, or overnight (n=9). 9/22 and 9/24 went public **mid-speech** | none | as V1 | `ev/offices/verifier/EXCERPT_verifier_calibration.txt` table B; `ev/video/derived_rss_published_vs_senate_floor_log.tsv` | **REJECT for F3** (calibration only; possibly F8) |
| V8 | **YouTube WebSub push** hub `https://pubsubhubbub.appspot.com/`, topic `https://www.youtube.com/feeds/videos.xml?channel_id=<UC id>` | (notifications about partisan channels, via Google's documented hub) | none expected | Same timing as the RSS entry, but pushed within seconds (INFERRED, untested). Whether a push fires when a live video flips from unlisted to public is UNVERIFIED | none | No key, no polling. Needs a public HTTPS callback (e.g. a Worker route) that answers `hub.challenge` and renews before `hub.lease_seconds`. Google's Data API guide (Last updated 2026-09-14) names this exact topic URL. Our server never fetches the disallowed path. Terms posture INFERRED better (YouTube API Services terms); API terms not re-read | none (no callback during research) | **USE WITH CAVEATS (preferred "video posted" path)**, subject to an owner ruling. `ev/video/verifier/devg_push_full.txt`, `yt_xmlfeeds_senategop.txt`, `websub_hub_root.txt` |
| V9 | **YouTube Data API v3** `videos.list?part=snippet,liveStreamingDetails,status&id=…`; `search.list?eventType=live\|upcoming` | (Google official API about partisan channels) | `scheduledStartTime` / `eventType=upcoming` in principle; no channel showed a public upcoming entry (probably empty, UNVERIFIED) | **The only sanctioned true live state:** `liveBroadcastContent=live`, `actualStartTime`, `actualEndTime`; `status.embeddable` | none (captions.download needs edit rights) | Free key, server-side. 10,000 units/day; `videos.list` costs 1 unit; `search.list` has its own 100/day bucket. The ID cap per call is undocumented ("maxResults … not supported … with the id parameter") | none (no key) | **USE** once the owner provides the P3.3 key. First call: the 1-unit retrospective probe in §6. `ev/video/verifier/devg_quota_full.txt`, `devg_videos_list_full.txt` |
| V10 | YouTube oEmbed / `/channel/<id>/live` / `embed/live_stream?channel=` | n/a | none | oEmbed has no live field and returns 404 for channel `/live` URLs (n=3). `/live` HTML is out (ToS) | none | ToS-gray even where robots allows | n/a | **REJECT** as a live detector. Use V9 `status.embeddable` for embeddability. `ev/video/yt_oembed_*.txt` |
| V11 | `https://democraticleader.house.gov/live` ("Watch Live") | official-partisan | not shown | **Unproven, leaning no.** All 6 observations embedded a past video. On the morning of the 9/17 presser (11:37Z) it showed hJjEHjZQQ1U while that day's stream was N59lzw_tfd0. It did beat RSS after one event (06-03 capture, 5h16m earlier) | none | Drupal, 43 KB, `no-cache, no-store`; **IMS gives 304, INM is ignored**; robots allow `/live`; embed URL forms vary (`watch?v=`, `/live/`, `youtu.be`) | n=6 snapshots | **Cheap watch only:** IMS-poll in session to test whether staff set it before a start. `ev/offices/demldr_live*.txt`, `wb_demldr_live_*.txt`, `ev/offices/verifier/dlh_live.txt` |
| V12 | `https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings?limit=10&days=7` (Thune site plugin) | official-partisan | By design (scheduled start, live start/end and stream id, with an auto-play banner) | Dormant: `[]` live (22:22:17Z, 22:47:57Z, 22:56:03Z), `[]` meetings-calendar Jan–Oct 2026, `[]` in 13 Wayback captures 07-30 to 09-26 | none | JSON, `max-age=60`, robots allow all | n/a | **Watch item:** 1 GET per session day; promote it if it ever fills. `ev/video/verifier/rl_*.txt`, `ev/offices/srl_livemeetings.txt`, `wb_srl_lm_*.txt` |
| V13 | Senate Recording Studio ISVP `comm=srs` (HLS `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/<name>/master.m3u8`) | official | none | master 404 with no event, 200 when one exists. srs<MMDDYY> naming rests on n=1 | official WebVTT captions (srs031026: 799 segments, still served 7 months later) | ACAO *, no key; senate.gov robots.txt is a 302 to a not-found page (no rules) | no presser found among 32 archived srs names | **REJECT for leadership pressers** (special events only). `ev/video/senate_*.txt` |
| V14 | House Recording Studio (CAO); HouseLive; DomeWatch | official / unofficial / partisan | floor only | floor only | floor captions only | as in SOURCES.md | n/a | **REJECT for F3** (they stay F2/P3.1 sources). `ev/video/cao_business_units.txt`, `houselive_*.txt`, `domewatch_*.txt` |

### 2.3 Post-hoc text (offices family)

| ID | Source | Origin | Advance notice | Live signal | Text | Access / terms | Latency evidence | Verdict |
|---|---|---|---|---|---|---|---|---|
| O1 | **speaker.gov RSS** `https://www.speaker.gov/feed/` (REST `…/wp-json/wp/v2/posts`) | official-partisan (Speaker's office) | none | none | Recap posts with the Speaker's quoted remarks (about 1,045 words for 9/15; no Q&A); embeds the video | robots allow all but `/wp-admin/`. RSS 67 KB; **IMS gives 304, INM with the exact ETag gives 200** (n=2 each). REST takes 7.1–9.5 s uncached; RSS about 0.3 s | Against G1 10:00 EDT starts: +2h58m (4/15), +2h15m and +2h53m (5/13); 9/29 gaggle post +1h37m after its video | **USE WITH CAVEATS:** House GOP presser recap, about 2–3 h late. Facts + link only. `ev/offices/speaker_*.txt`, `ev/offices/verifier/speaker_feed_ims.txt`, `speaker_feed_inm.txt` |
| O2 | **democraticleader.house.gov press releases** `https://democraticleader.house.gov/media/press-releases` ("LEADER JEFFRIES AT THE CAPITOL: …") | official-partisan | none | none | Leader's opening statement only, 182–719 words. Exact time in `article:published_time` | HTML only (`/rss.xml` is a slider feed; `/media/press-releases/rss.xml` 404). List `max-age=1749` with ETag/Last-Modified; robots allow | release +23m28s after the 9/30 upload (n=1); event-to-text unmeasured | **USE WITH CAVEATS** (HTML list poll). `ev/offices/demldr_pr*.txt`, `demldr_capitol_*.txt` |
| O3 | **republicanleader.senate.gov WP REST** `https://www.republicanleader.senate.gov/wp-json/wp/v2/press_releases?per_page=30&_fields=id,date,date_gmt,modified_gmt,title,link` (+ `/remark`) | official-partisan (Majority Leader) | none (V12 dormant) | none | "Thune's remarks below (as delivered)", about 480 words, Thune only | robots allow all; no validators. **`/feed/` returned 503 "U.S. Senate: Site Under Maintenance" 3 times over ≥18 min** while REST worked | +1h04m33s, +1h46m41s, +1h37m48s after the V1 entry (n=3) | **USE WITH CAVEATS** (REST, not RSS; check the body, not just the status). `ev/offices/srl_*.txt`, `ev/offices/verifier/srl_feed.txt` |
| O4 | **democrats.senate.gov** press releases `https://www.democrats.senate.gov/newsroom/press-releases` ("TRANSCRIPT: At A Press Conference, Leader Schumer …") + `/feed` (schedules) | official-partisan | `/feed` "Schedule for <day>" (the evening before) gives the lunch window only | none | Schumer's remarks only (9/30: about 437 words); links `youtube.com/live/<id>` | robots `Disallow: /*.js$` only. List 120 KB, `max-age=300`, weak ETag ignored. **JSON-LD `datePublished` is hand-set** (9/30 transcript stamped 17:00:00Z, *before* the 3:30 pm event; the visible date can be a day late) | not measurable (n=3 hand-set stamps) | **USE WITH CAVEATS:** take the event date from the title, body or video, never from `datePublished`. `ev/offices/sdems_*.txt`, `ev/offices/verifier/sdems_*.txt` |
| O5 | democrats.house.gov press releases `https://democrats.house.gov/newsroom/press-releases` (Aguilar) | official-partisan (House Democratic Caucus) | none | none | Chair's remarks ("read the transcript of the Chairman's remarks below") | robots.txt **410 Gone**; no feed found; date-only pages | unmeasurable | **Optional, low** (link-out text). `ev/offices/verifier/hdc_*.txt` |
| O6 | majorityleader.gov / majoritywhip.gov Fireside21 RSS (`…/news/rss.aspx`) | official-partisan | none (schedule pages are the floor schedule) | none | partial recaps | pubDate date-only (always 04:00:00 GMT) | unmeasurable | **REJECT** except as link-out. `ev/offices/majldr_*.txt`, `majwhip_*.txt` |
| O7 | democraticwhip.house.gov; republican.senate.gov `/feed/` (newest item 2024-12-18); dems.gov (points to democrats.house.gov) | official-partisan | none | none | none | allowed | n/a | **REJECT.** `ev/offices/demwhip_*.txt`, `srep_*.txt`, `dems_*.txt` |
| O8 | YouTube captions / timedtext | third-party machine text | n/a | n/a | not retrievable: captions.download needs edit rights; robots disallows `/timedtext_video`; the ToS bars downloading | — | — | **REJECT** (D-010) |

### 2.4 Third-party and social (thirdparty family)

| ID | Source | Origin | Advance notice | Live signal | Text | Access / terms | Latency evidence | Verdict |
|---|---|---|---|---|---|---|---|---|
| T1 | Bluesky, Democratic leaders (`hakeem-jeffries.bsky.social`, `schumer.senate.gov`, `whipkclark.bsky.social`, `durbin.senate.gov`, `aguilar.house.gov`, `housedemocrats.bsky.social`, `democrats.senate.gov`) via `public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed` | official-partisan (verified) | **none: 0 presser posts in 700** | none | captions only | keyless, ACAO *, `max-age=30`, no validators; `searchPosts` 403 unauthenticated | Jeffries: 0 posts from Sep 1 to Oct 3, a month with ≥3 C-SPAN-live leadership pressers plus Jeffries pressers PBS covered on Sep 16 and 17 | **REJECT.** `ev/thirdparty/bsky_feed_*.txt`, `bsky_feeds_presser_scan_2026-10-03.txt`, `ev/thirdparty/verifier/bsky_*.txt` |
| T2 | Bluesky, GOP (`houserepublicans.bsky.social` only; no Johnson, Thune, Scalise, Barrasso or Emmer accounts; `johnthune.bsky.social` is a squat) | official-partisan | none (0 in 100) | none | captions | as T1 | n=0 | **REJECT.** `ev/thirdparty/verifier/bsky_searchActors_*.txt`, `bsky_profile_johnthune.txt` |
| T3 | Bluesky `senatepress.bsky.social` | official | none for pressers (0 in 100) | none | none | as T1 | n=0 | **REJECT for F3** (keeps its F1/F5 role) |
| T4 | GOVpeeps X→Bluesky mirror `senategop.govpeeps.us` | third-party relay of partisan X | only what @SenateGOP posts | mirror lag p50 31 min (n=92), own posts p50 37 min (n=27) | X text | no robots, no terms; unknown operator | as stated | **REJECT.** `ev/thirdparty/govpeeps_*.txt`, `verifier/govpeeps_lag_own_posts_only.txt` |
| T5 | X / Twitter (leader and conference accounts) | partisan / official | likely the main GOP "LIVE" channel (INFERRED, not fetched) | INFERRED | none | **robots `User-agent: *` `Disallow: /`**; API is pay-per-use ($0.005/read, about $56/mo estimate) against D-001 | none | **REJECT under D-001** (owner's paid-options list). `ev/thirdparty/x_robots.txt` |
| T6 | Roll Call Factba.se (`media-cdn.factba.se/rss/json/trump/calendar.json`) | third-party (D-017) | no congressional leaders (0 of 679 rows) | none | Trump transcripts | as P3.2 | n/a | **REJECT for F3** (keep for F4/F7). `ev/thirdparty/factbase_trump_calendar.txt` |
| T7 | CQ Daybook / Punchbowl / Politico Playbook | third-party commercial | yes in principle (INFERRED) | none | none | CQ and Punchbowl are paid; Punchbowl ToS (effective Aug 14, 2026) bars robots; Politico robots.txt itself is behind a 403 Cloudflare challenge | n/a | **REJECT** |
| T8 | The Hill "Watch live" pages + section RSS `https://thehill.com/homenews/house/feed/` | third-party (Nexstar) | **Yes: +60 min, n=1** (Jeffries 2026-02-02, "scheduled to begin at 4 p.m. EST") | Anvato player | none | robots allow our UA but block named AI agents. **Nexstar Terms (updated Sep 16, 2026) ban robots "for any purpose" and use in AI products** (that they govern thehill.com is INFERRED). PerimeterX wall intermittent | n=1 | **REJECT (terms).** `ev/thirdparty/verifier/thehill_*.txt`, `nexstar_terms*.txt` |
| T9 | PBS NewsHour politics RSS `https://www.pbs.org/newshour/feeds/rss/politics`, watch-live pages, `/newshour/tag/<leader>` | third-party (public broadcaster; not named in D-017) | **Weak:** one advance page, +66 min (Johnson & Thune, 2025-10-03). **2026: 0 advance pages for leaders**; the 2 found (09-16, 09-17) are after-the-fact `watch-` slugs | indirect (embeds a PBS YouTube id) | blurb | robots allow our UA (Crawl-delay 1). Terms have no robot or AI clause but bar "commercial purposes". RSS has 20 items (about 34 h), validators regenerate (304 at +27 s, 200 at +10.5 min with the same items) | n=1 advance | **Owner decision; default: do not add yet** (re-measure in session). `ev/thirdparty/pbs_*.txt`, `verifier/pbs_*.txt` |
| T10 | Internet Archive TV News (C-SPAN recordings) `archive.org/advancedsearch.php`, `/metadata/<id>` | third-party archive of C-SPAN content | none | after the fact: `[LIVE]` airings with exact start/stop (Jeffries 2026-09-23 19:20–19:36Z) | C-SPAN captions, cc1.txt +86 min after stop (n=1) | C-SPAN content, so link-out only (TRAPS) | n=1–2 | **REJECT as a feed; USE OFFLINE as research ground truth** (include non-`[LIVE]` first airings). `ev/thirdparty/archive_*.txt` |
| T11 | GovInfo Congressional Record | official | none | none | only by a Member's leave to print (exception (c)); none found 2025–26 | PDF rules 129,242 B | n/a | **REJECT.** `ev/thirdparty/govinfo_crec_*` |
| T12 | Leaders' email advisories (public signup `https://democraticleader.house.gov/contact/press-release/subscribe`) | official-partisan | INFERRED yes | none | none | needs a project inbox (external account → ask the owner) | none | **NOT NOW** (owner question) |
| T13 | Rev.com transcripts `https://www.rev.com/transcripts/<slug>` | third-party | none | none | sporadic full transcripts, date only | **terms bar "any automated system or software to extract content"** | unmeasurable | **REJECT.** `ev/thirdparty/verifier/rev_*.txt` |

---

## 3. Recommended source stack for F3 (Congress) in Phase 3

The display model has five honest states. A source may only move an item to the states it can actually prove.

`scheduled (gallery)` → `video posted (may be live or ended)` → `live now (API-confirmed)` → `ended` → `text posted (principal's remarks only)`

**Build first** (cheap, legal, high value; fits P3.2 Today view and P3.3):

1. **Gallery schedule rows into the Today view (F7) and as F3 "scheduled" items.** Sources: G1 (House Press Gallery block, scoped parser, 5–15 min poll in session) and G2 (Senate RTV, IMS on `/feed/`, page fetch on change). Add G3's standing rule as a synthetic "Senate leadership stakeouts after caucus lunches, about 2:15 pm ET (gallery rule)" item, created only on days when G2/G1 list the STAKEOUT row or G4 carries the recess line. Label: "announced (House Press Gallery schedule)" / "(Senate Radio-TV Gallery)". Key: date + time + location + normalized-text hash. An empty block means "unknown". G1 needs the owner's EBBS ruling first (§6, decision 2).
2. **Post-hoc text links:** O1 (speaker.gov RSS, IMS), O3 (Thune REST), O4 (Schumer press list HTML), O2 (Jeffries press list HTML). Partisan label, facts + link only (D-009, D-017 style), and the note "remarks of <principal> only". Never take the event time from O4's `datePublished`.
3. **YouTube "video posted" via WebSub (V8)**, *if* the owner allows. Subscribe to the conference channels where pressers actually stream: Senate Republicans, Senate Democrats, House Democrats, House Republicans, plus Jeffries (uploads), Johnson and Schumer. Show "stream posted" with the embedded player (link-out where `status.embeddable` is false, likely Senate GOP). **Never call it "live" on the push alone.**
4. **Live confirmation via V9 `videos.list`** on each pushed video id (1 unit). Repeat at most every 2–5 min while `liveBroadcastContent` is `live` or `upcoming`. This needs the P3.3 key. It is the only thing that should set "live now", and so the only thing that could ever drive an alert. Leadership pressers are not a D-012 alert class today.

**Cheap watch items** (one request per session day, no UI until proven): V12 Thune live-meetings, V11 Jeffries `/live` (IMS).

**Skip:** G5–G7, V4–V7 as live signals (keep their channel ids in the registry), V10, V13–V14, O6–O8, T1–T8, T10–T13. Defer T9 (PBS) to an owner ruling after the November measurement. No live text for leadership pressers: there is no legal source (D-010).

**Registry note (INFERRED risk):** leadership elections for the next Congress happen after the Nov 3 election. Key the registry by **role** (Speaker, Majority Leader, conference/caucus channel), not by person, and re-check channel ids in January.

---

## 4. Fixtures and measurements to record when Congress returns (from Nov 9)

Pre-register this as part of P3.6 in its own commit, before any session data is seen. All windows are in **EST (UTC-5)**: DST ends Nov 1. The proposed decisive days are **Tue Nov 10** and **Tue–Wed Nov 17–18**, since Wed Nov 11 is Veterans Day. Politeness: CLAUDE.md UA, ≥2 s between requests to one host.

| # | URL (exact) | Cadence / window | Why |
|---|---|---|---|
| F1 | `https://pressgallery.house.gov/` | every 10 min, 17:00–06:00Z (12:00–01:00 ET) Mon–Fri of session weeks | Parser fixture for the scoped "News Events on the Hill" block (and the votes-view collision). When the next day's rows first appear. How often the block is empty on session days. Whether Jeffries or Thune rows ever appear |
| F2 | `https://www.radiotv.senate.gov/feed/` with `If-Modified-Since`; on change `https://www.radiotv.senate.gov/` and `https://www.radiotv.senate.gov/wp-json/wp/v2/pages/51499?_fields=id,modified_gmt` | every 5 min, same window | Fixture for the MSO-laden Elementor block. Posting time of the STAKEOUT row and leader avails. Same-day adds and silent removals |
| F3 | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=5&_fields=id,date_gmt,modified_gmt,link,title` then `/posts/{id}?_fields=content,modified_gmt` | already a P2.1 source; keep its normal cadence | Ground truth: actual recess and return times and leader floor-speech starts, for calibrating V1/V2 |
| F4 | WebSub push payloads for channels UCAdyfSY2oRwNIB4LddDYZJA, UCpgILFSGxY-9mQR79fLSt2A, UCxhAOE8DbC8iVNhAgQw5eNg, UC4czmSY7dsAiLFseD313tKA, UCYVmbsjoNbQ4j-PCQIYgpWQ, UCzqBEpeIaDEfvAtsA53Fx2Q, UC-ABttxh8uQv_10qmwGaidw (topic `https://www.youtube.com/feeds/videos.xml?channel_id=<id>`) | continuous, if the owner approves V8 | Arrival time of each push vs `actualStartTime`/`actualEndTime`. Whether pushes fire at unlisted→public flips |
| F5 | `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,status&id=<ids>` (key server-side, never logged in a URL) | on each push, then every 2–5 min while live/upcoming; plus one retrospective call (§6, Q1) | True start, end and live state; `status.embeddable`; whether streams are unlisted while live |
| F6 | **Only if the owner explicitly allows a bounded research poll despite robots** (§6, decision 1): `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVAdyfSY2oRwNIB4LddDYZJA`, `…UULVpgILFSGxY-9mQR79fLSt2A`, `…UULVxhAOE8DbC8iVNhAgQw5eNg`, `…?channel_id=UCYVmbsjoNbQ4j-PCQIYgpWQ` | every 60 s. Senate GOP **18:45–20:30Z** (Tue and Wed). Senate Dems **19:00–22:30Z** (9/15 came 95.6 min after the recess return). House Dem Caucus and House GOP **14:30–18:00Z** (presser at about 10:00–11:30 ET) | First-seen time vs F5. The offices family's plan used 17:45–19:30Z, which is EDT and wrong for November |
| F7 | `https://democraticleader.house.gov/live` with `If-Modified-Since` | every 2 min, 13:00–18:00Z Tue/Wed | Does staff set the live id before a presser starts? |
| F8 | `https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings?limit=10&days=7` | once per session day at about 14:00Z, plus once in the stakeout window | Does the dormant plugin ever fill? |
| F9 | `https://www.speaker.gov/feed/` (IMS); `https://www.republicanleader.senate.gov/wp-json/wp/v2/press_releases?per_page=30&_fields=id,date,date_gmt,modified_gmt,title,link`; `https://www.democrats.senate.gov/newsroom/press-releases`; `https://democraticleader.house.gov/media/press-releases` | every 10 min, 14:00–02:00Z on presser days | Event-to-text latency (n ≥ 5 per office) and fixtures for the four text parsers |
| F10 | Ground truth: a human watcher's log (start/end per presser), plus next-day `https://archive.org/advancedsearch.php?q=identifier:CSPAN*_YYYYMMDD*&fl[]=identifier,title,description,start_time,stop_time&output=json` (offline only) | per presser | The independent clock for every lag above; include non-`[LIVE]` first airings |
| F11 | (owner-dependent) `https://www.pbs.org/newshour/feeds/rss/politics` | every 15 min | Only if the owner wants T9 re-measured: count of `watch-live-` pages for leaders and their lead time (n ≥ 5) |

---

## 5. Traps

**YouTube**
1. **`robots.txt` disallows `/feeds/videos.xml`** (also `/api/`, `/timedtext_video`, `/youtubei/`, `/t/terms`). The ToS automated-access exception is for public search engines only, so robots compliance is necessary but not sufficient (oEmbed and `/channel/<id>/live` included). The earlier EXE/LIVE advice to poll channel RSS never checked robots. **This research itself made 45 GETs to `/feeds/videos.xml`** on 2026-10-03 (ledger). WebSub (V8) is the documented alternative. `ev/video/verifier/yt_robots.txt`.
2. RSS `<published>` is when a video became **public**: not the start, not reliably the end. Calibrated range: -21 min (ambiguous) to +50 min, or overnight. Schumer's 9/22 and 9/24 entries went public mid-speech. House GOP, Speaker and Jeffries live playlists publish about 8–13 h later. A `LIVE` title is kept on replays.
3. When matching an entry to an event, use only days with a single candidate event. Schumer spoke twice on 9/16 and 9/30, which produced a spurious "-21 min advance" case.
4. A stream can be public and linked (Jeffries' 9/23 release, youtube.com/live/V4DWXH_UKcE) about 11.7 h before RSS lists it. An RSS miss is not "not live".
5. Some events skip the live playlist (Jeffries 9/30 ITkB2c573fI is uploads-only). Watch both the channel and the UULV feed.
6. The presser channels are the **conference** channels, not the leaders' personal ones. Channel behavior drifts (Johnson streamed daytime pressers in Oct 2025, not in 2026).
7. Embeddability is per channel: oEmbed 401 for the Senate GOP stakeout T5cTzKYpI3E, 200 for the Senate Dems, House GOP and Jeffries videos. D-010 "embed the player" may fail for the Senate GOP. oEmbed 200 also does not prove a video is public (unlisted videos resolve; general knowledge, INFERRED).
8. `UULV` + (channel id minus `UC`) gives the live-only playlist. It 404s for channels without live streams. `?user=` works for some legacy names (senatedemocrats, HouseDems) and 404s for others (RepTomEmmer). No validators; `max-age=900`.
9. Wayback CDX on youtube.com URLs timed out every time (4 of 4 offices, 2 of 2 video verifier). Wayback cannot time-series YouTube feeds.

**Calendar and clocks**
10. The Senate lunch recess does not always end at 2:15 pm (2:00 on 7/15, 1:50 on 9/15). Floor return is not the lunch end, and the lunch end is not the stakeout start. Never compute stakeout latency from a fixed 2:15.
11. The "11:30 AM" in the stakeout row (G1/G2) is the **crew-escort** time. Display "about 2:15 pm (gallery rule)", never 11:30.
12. **DST ends Nov 1:** summer windows in UTC are 1 h early for November. **Veterans Day is Wed Nov 11.** Some weekly Senate stakeouts fall on Wednesdays (3 of 13).

**Galleries**
13. The `evo-view-ebbs-json-feed` class covers both "News Events on the Hill" and "Most Recent Votes" on pressgallery.house.gov. A class-only selector ingests roll calls as events. Scope to paragraph--id--79 and check the Date/Time/Location/Event labels.
14. An empty House PG block on a session day (Mar 18) means "unknown", never "no pressers".
15. House PG rows have no year and no id, show one schedule day that can skip a weekend, use double-escaped entities (`&amp;quot;`), and can lack the Event field. Infer the year carefully around New Year (D-075).
16. Senate RTV block: about 75 KB of MS-Word comments, typos ("NEWS CONFRENCE"), split labels, mixed time formats, and the previous day's section kept after midnight. Events vanish without a "canceled" marker. Same-day additions happen (Schumer Feb 10).
17. Coverage is whatever press offices submit: no Jeffries weekly presser and no Thune presser in about 22 sampled gallery copies. Absence from the board is not absence of a presser.
18. WordPress `modified_gmt` is the **last** edit, so it is only an upper bound on when a line appeared. It has no `Z`, so never `Date.parse` it naively (TRAPS).

**Offices**
19. Validators: speaker.gov `/feed/`, radiotv.senate.gov `/feed/` and democraticleader.house.gov `/live` honor `If-Modified-Since` (304) but ignore `If-None-Match`. democrats.senate.gov ignores INM.
20. republicanleader.senate.gov `/feed/` serves **503 "Site Under Maintenance"** (AkamaiNetStorage) while WP REST works. Check the body as well as the status.
21. Hand-set CMS timestamps (`…:00`; democrats.senate.gov `datePublished` 17:00:00Z before a 3:30 pm event; a visible date a day late) and Fireside21 date-only pubDates (04:00:00 GMT) are never event times.
22. Office "transcripts" contain only the principal's remarks, never Q&A or the other speakers. They are partisan releases: facts + link only.
23. The House GOP presser goes by several names ("weekly House Republican Leadership press conference", "post-meeting press conference", "Leadership Briefing", "Leadership Stakeout"). Match on date + principal.
24. Dormant widgets: Thune's live-meetings API and JS player are installed but have returned `[]` all of 2026. democraticleader.house.gov `/rss.xml` is a slider feed, not press releases.

**Third-party and process**
25. Bluesky impostors and squats (`repmikejohnson.bsky.social`, `stevescalise.bsky.social` "Not the real one", `johnthune.bsky.social`, `senatedemocrats.bsky.social` with 0 posts …). Pin DIDs and require `verifiedStatus=valid`. `getProfiles` silently drops unresolved handles. `searchPosts` returns 403 unauthenticated.
26. Bot walls are intermittent (The Hill and Punchbowl gave both 200 and 403 within minutes). Never treat one 200 as permission or one 403 as the reason to reject: read the terms.
27. PBS RSS validators regenerate every few minutes with an identical item set, so dedupe by GUID. Treat `watch-live-` slugs as possible advance pages and `watch-` slugs as after the fact (INFERRED). schema.org `startDate` is the publish time.
28. The per-host request cap was applied **per agent**. Combined, www.youtube.com took 60 requests and web.archive.org 58 on 2026-10-03 across 8 agents. Future multi-agent probes need a shared per-host budget.
29. Parallel subagents shared one scratchpad, and a generic-named fetch script was overwritten mid-run. Two Rev requests were logged into the wrong folder; the log lines were removed and the files moved back (thirdparty verifier). Use uniquely named scripts per agent.
30. Saving only the first N KB of a homepage hides footer scripts. That is how the researcher missed Thune's live-meetings config. Grep full bodies for `live`, `wp-json` and `stream` before rejecting a site.

---

## 6. Open questions

**Owner decisions needed (each with a recommended default):**

> Answered by the owner (the rows govern, not this list): item 1 by D-101 (WebSub + `videos.list`), item 2 by D-102
> (both galleries, labeled), item 3 by D-093 and D-097, items 4-6 by D-103 (PBS NewsHour added; no X API, no inbox),
> item 7 by D-104 (shared per-host budget).

1. **YouTube access path** (robots disallows `/feeds/videos.xml`; precedent D-016). Options: (a) no YouTube detection; (b) **WebSub push** via `pubsubhubbub.appspot.com`, where Google's hub fetches the feed; (c) Data API only; (d) allow RSS polling anyway. **Default: (b) + (c)**: WebSub for "video posted", `videos.list` for "live now". No RSS polling. A one-off research poll for F6 only if the owner explicitly allows it.
2. **House Press Gallery republication of EBBS** (EBBS is robots `Disallow: /`; the House PG page is robots-allowed and states that its content is a federal work). **Default: use it**, with the label "House Press Gallery schedule", facts + link, and drop it on objection. Same default for radiotv.senate.gov, whose terms page was not found.
3. **Google API key (P3.3)**, free. **Default: yes, ask now.** The first use is one 1-unit retrospective `videos.list` call on: T5cTzKYpI3E, SdBiFH4b0Zw, fLj_TONEDPQ, iJOICVOLYtw, JNvdKmLGDMc, hrzs4JSy7AM, N3yYbYFMB2o, 7PjDTlOWJ3Q (Senate GOP); AU2wgCBjCQo, k9mZ_8-PZXY, fUyxQF15vsU, gIj5S_oEkFQ, eotj_wlGHc0, zwa3SbG8Llk, MApaaDHPWl4 (Senate Dems); E9W3ToVAnSI, 9uMh4U7dOSI, iHDdqbgolyU, yVGxCOoX9yg, POFPgwFhXcA, Ejjm8bXdp_4, q9rY9tADmU4, QB84b2b9iUE, aNQqCgWgkOA (Schumer); gzoE_vUHYm4, T3c688n5V78 (House GOP); XVPKI7qQWE0, sorgtmtvr70, kkqdxe6dYQU, jENjK_1qT5g (House Dems); hiVDZ_fs7U4, N59lzw_tfd0, V4DWXH_UKcE, hJjEHjZQQ1U (Jeffries); MVws9MzAchs, xDqKpYV-ueY, EN2hblHltxc (Johnson). That is 38 ids, under the presumed 50 per call (cap undocumented). [2026-10-05 correction: the list above holds 37 ids, not 38. The call (`scripts/youtube_videos_list.mjs`) also asks for ITkB2c573fI and sALqzexDY6Y, the two other ids this report cites (V5, V6), still one call.] It settles the start/mid/end question, the 9/30 Schumer ambiguity, whether 7PjDTlOWJ3Q was a stakeout, what hJjEHjZQQ1U is, and Senate GOP embeddability, all from data we already have.
4. **PBS NewsHour as a named D-017 third party.** **Default: not yet.** 2026 advance evidence for leaders is n=0; re-measure (F11) after Nov 9.
5. **Paid X API** (about $56/mo; likely the main GOP "LIVE" channel, INFERRED). **Default: no** (D-001 $0); keep it on the paid-options list.
6. **Project email inbox for leaders' media advisories** (external account). **Default: not now.** The galleries already carry the advisories that matter.
7. **Shared per-host request budget for multi-agent research** (process). **Default: yes**: one budget file per host across agents, and a robots.txt check before the first request to any host.

**Research questions (resolved by the Nov measurement or the key):**

- Q1. Do the office live-playlist entries go public at the start, mid-stream or at the end? (`videos.list` above, then F4/F5 in session.)
- Q2. When does the Senate GOP stakeout actually start relative to the Senate's return from recess? No source records it; only F5 or a watcher can say.
- Q3. Where is the weekly House GOP presser public **live** at its start? The office channels show it 12 h later or as clips. Candidates are an unlisted stream (check with V9), X (T5) or C-SPAN (link-out only).
- Q4. Are leadership streams unlisted while live? If so, `search.list eventType=live` misses them too.
- Q5. Does democraticleader.house.gov `/live` ever switch to the new id before a presser (F7)? Does Thune's live-meetings ever fill (F8)?
- Q6. When does the next day's gallery schedule go up (observed bounds: House PG 19:21–21:41 ET, Senate RTV edit at 23:40 ET), and how often is the House PG block empty (F1, F2)?
- Q7. Do WebSub pushes fire at the unlisted→public flip, and how fast (F4)?
- Q8. Emmer's YouTube channel id is unknown, and democrats.house.gov (Aguilar) has no feed.

**The retrospective `videos.list` call (2026-10-05, D-097, D-105).** Run 2026-10-05T16:08Z by the owner-triggered
Action (run 37338433045): one call, 1 quota unit, HTTP 200, every one of the 39 requested ids returned. YouTube's API
terms allow its data to be kept at most 30 days and forbid publishing it or any aggregate of it (D-105, D-106), so this
report keeps only engineering conclusions in prose; the encrypted result and its decrypted copy live outside git and
are deleted by 2026-11-04. Conclusions, from the API's own fields only (`snippet.publishedAt` against
`liveStreamingDetails`):
- **Q1, Q4: the office channels' streams most likely became public only after the broadcast ended (INFERRED).** For
  every stream that is public now, `publishedAt` came after `actualEndTime`, sometimes within minutes and sometimes
  overnight; the one stream still unlisted carries a `publishedAt` before its start (for an unlisted video the docs
  define it as the upload time). The docs define `publishedAt` as "the time that the video was made public" for a
  private video made public later, and say nothing about live broadcasts; read with that rule, the streams were not
  public while live, which is also what the RSS observations above suggest. The direct check is a `videos.list` call
  DURING a broadcast (F5, from Nov 9): `status.privacyStatus` and `liveBroadcastContent` while live.
- **Design consequence for D-101, if that holds:** WebSub gives an after-the-fact "video posted" item only, and a
  public listing (RSS, WebSub, `search.list eventType=live`) cannot say "live now" for these channels. "Live now"
  then needs the video id while the broadcast runs, from a non-YouTube source (an office's `/live` page, a release
  linking `youtube.com/live/<id>`, the gallery schedules of D-102), confirmed by `videos.list` (`liveBroadcastContent`,
  `actualStartTime`). Q5 (does `/live` switch in time) becomes the question that decides F3's live signal.
- **Embedding:** the Senate Republican Conference channel's videos are not embeddable (`status.embeddable` false); the
  other channels' are. Phase 3 links out for that channel (trap 7 above confirmed).
- **Advance notice:** Speaker Johnson's channel streams carry no `scheduledStartTime`, so the API gives no "upcoming"
  state for them; the other broadcasts do.
- **The two extra ids** (ITkB2c573fI, sALqzexDY6Y) have no broadcast metadata: uploads, not streams.
- Still open: whether 7PjDTlOWJ3Q was a stakeout (its broadcast window does not settle it; the gallery and floor
  records must), Q2, Q3, Q5-Q7.
- Q9. Out of scope, noted: gop.gov embeds a Facebook feed plugin with a `data-cff-live` attribute (not examined). Reporters' Bluesky lists would need a curated DID list and an owner ruling on individual journalists.

---

## 7. Cross-family reconciliation (synthesizer notes)

| Topic | Family A | Family B | Resolution |
|---|---|---|---|
| House Dem Caucus same-day count | offices verifier: 6 same-day, 9 overnight | video: 8 of 15 same-day, 7 overnight | **8 / 7 is correct.** Re-parsed `ev/offices/verifier/yt_housedems_lv.txt` and `ev/video/yt_uulv_housedems.txt` (identical 15 entries): same day 02-10, 04-15, 04-21, 05-13, 06-03, 06-24, 07-14, 09-15; overnight 02-04, 03-05, 04-29, 06-10, 07-01, 07-22, 09-02 |
| Polling YouTube RSS | offices: recommends 60 s UULV polling; "robots.txt not re-checked" | video: robots disallows `/feeds/videos.xml`; ToS exception is for search engines only; WebSub exists | **Video family governs:** no RSS polling without an owner ruling (§6, decision 1) |
| Senate GOP lag basis | offices verifier: +1.6 to +49.8 min vs actual return (n=12) | video: 18.7 / 28.9 / 49.8 min after the end of the recess (n=3) | Consistent (same floor log; offices has the larger n). Neither is a start-to-entry lag |
| Test window | offices: Tue Nov 10, 17:45–19:30Z | — | **Shift +1 h for EST** (18:45–20:30Z) and cover Wednesdays. Nov 11 is Veterans Day |
| Senate stakeout in EBBS | galleries researcher: never in House PG feed | galleries verifier: present Feb 3 | Verifier governs: it does reach EBBS / House PG |
| Jeffries `/live` | offices: "use with caveats" as a pointer | video: "reject as live flag for now" | Same substance: cheap IMS watch only (V11) |

---
## Verification ledger

Every live HTTP request made for this research on 2026-10-03, generated from the evidence on disk. Sources: `ev/offices/_requests.log` and `ev/offices/verifier/_requests.log` for the offices family; the comment header of each saved response file (`# fetched …`, `# url: …`, `# status/HTTP …`) for the galleries, video and thirdparty families. "Result" is the HTTP status and body size as the fetch helper logged them. 000/ERR means a client-side timeout. The table excludes WebSearch/WebFetch calls (about 31 by the thirdparty researcher, 6 + 1 by its verifier) and derived analysis files.

**Totals (on disk vs as reported):**

| Family | Researcher on disk / reported | Verifier on disk / reported |
|---|---|---|
| offices | 109 / 109 (21:56:06Z–22:43:32Z) | 21 / 21 (22:55:17Z–23:03:37Z) |
| galleries | 71 / 72 (21:53Z–22:29Z; one request of the disclosed EBBS batch slip has no saved file) | 29 / 29 (22:34:36Z–22:41:47Z) |
| video | 62 / 62 (22:01Z–22:2xZ) | 36 / 36 (22:40Z–about 22:55Z) |
| thirdparty | 58 / 58 (21:58Z–22:36Z) | 37 / 36 (22:39:54Z–23:00:31Z; the PBS terms 301 and its follow-up appear to have been counted as one) |
| **all** | **300 / 301** | **123 / 122** |

**Disclosures:**
- 45 of these requests (offices 26, video 19, excluding Wayback) fetched `https://www.youtube.com/feeds/videos.xml`, a path YouTube's robots.txt disallows. Robots was first checked at 22:29:39Z (video researcher), after most of them. See Trap 1 and owner decision 1.
- The ≤25-per-host cap was applied per agent. Combined per-host load: www.youtube.com 60, web.archive.org 58, public.api.bsky.app 35, www.pbs.org 26, www.republicanleader.senate.gov 21, www.radiotv.senate.gov 21, democraticleader.house.gov 19, www.speaker.gov 17, www.dailypress.senate.gov 15.
- No URL in this ledger carries an API key. There were no logins and no paywalls. The two Rev.com requests at 22:56Z ran through a script without a sleep, so their 3 s spacing is unverified (thirdparty verifier).

| # | Family / pass | Time (UTC, 2026-10-03) | URL | Result (status, body bytes as logged) | Evidence file (under `scratch/p35/evidence/`) |
|---|---|---|---|---|---|
| 1 | offices / researcher | 21:56:06Z | `https://www.speaker.gov/robots.txt` | 200 (121 B) | `offices/speaker_robots.txt` |
| 2 | offices / researcher | 21:57:45Z | `https://www.speaker.gov/` | 200 (18081 B) | `offices/speaker_home.txt` |
| 3 | offices / researcher | 22:00:39Z | `https://www.majorityleader.gov/robots.txt` | 200 (158 B) | `offices/majldr_robots.txt` |
| 4 | offices / researcher | 22:00:39Z | `https://www.majoritywhip.gov/robots.txt` | 200 (158 B) | `offices/majwhip_robots.txt` |
| 5 | offices / researcher | 22:00:39Z | `https://democraticleader.house.gov/robots.txt` | 200 (702 B) | `offices/demldr_robots.txt` |
| 6 | offices / researcher | 22:00:39Z | `https://www.democraticwhip.gov/robots.txt` | 301 (0 B) | `offices/demwhip_robots.txt` |
| 7 | offices / researcher | 22:00:40Z | `https://www.republicanleader.senate.gov/robots.txt` | 200 (142 B) | `offices/srl_robots.txt` |
| 8 | offices / researcher | 22:00:40Z | `https://www.democrats.senate.gov/robots.txt` | 200 (50 B) | `offices/sdems_robots.txt` |
| 9 | offices / researcher | 22:03:24Z | `https://democraticleader.house.gov/` | 200 (12476 B) | `offices/demldr_home.txt` |
| 10 | offices / researcher | 22:03:24Z | `https://www.democraticwhip.gov/` | 301 (0 B) | `offices/demwhip_home.txt` |
| 11 | offices / researcher | 22:03:24Z | `https://www.majoritywhip.gov/` | 200 (4666 B) | `offices/majwhip_home.txt` |
| 12 | offices / researcher | 22:03:24Z | `https://www.majorityleader.gov/` | 200 (5560 B) | `offices/majldr_home.txt` |
| 13 | offices / researcher | 22:03:28Z | `https://www.republicanleader.senate.gov/` | 200 (52303 B) | `offices/srl_home.txt` |
| 14 | offices / researcher | 22:03:29Z | `https://www.democrats.senate.gov/` | 200 (22570 B) | `offices/sdems_home.txt` |
| 15 | offices / researcher | 22:10:00Z | `https://www.speaker.gov/feed/` | 200 (67114 B) | `offices/speaker_feed.txt` |
| 16 | offices / researcher | 22:10:00Z | `https://democraticwhip.house.gov/robots.txt` | 200 (2141 B) | `offices/demwhip_robots2.txt` |
| 17 | offices / researcher | 22:10:00Z | `https://www.majorityleader.gov/news/rss.aspx` | 200 (152033 B) | `offices/majldr_rss.txt` |
| 18 | offices / researcher | 22:10:00Z | `https://www.republicanleader.senate.gov/wp-json/wp/v2/types` | 200 (28101 B) | `offices/srl_types.txt` |
| 19 | offices / researcher | 22:10:00Z | `https://www.majoritywhip.gov/news/rss.aspx` | 200 (57790 B) | `offices/majwhip_rss.txt` |
| 20 | offices / researcher | 22:10:00Z | `https://democraticleader.house.gov/live` | 200 (43342 B) | `offices/demldr_live.txt` |
| 21 | offices / researcher | 22:10:00Z | `https://www.democrats.senate.gov/feed` | 200 (69710 B) | `offices/sdems_feed.txt` |
| 22 | offices / researcher | 22:10:00Z | `https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-social-media.yaml` | 200 (105096 B) | `offices/legis_social.txt` |
| 23 | offices / researcher | 22:10:03Z | `https://democraticwhip.house.gov/` | 200 (61957 B) | `offices/demwhip_home2.txt` |
| 24 | offices / researcher | 22:10:03Z | `https://www.majorityleader.gov/schedule/weekly-schedule.htm` | 200 (53331 B) | `offices/majldr_weekly.txt` |
| 25 | offices / researcher | 22:10:03Z | `https://www.republicanleader.senate.gov/newsroom/videos/` | 200 (355423 B) | `offices/srl_videos.txt` |
| 26 | offices / researcher | 22:10:03Z | `https://www.democrats.senate.gov/newsroom/press-releases` | 200 (119646 B) | `offices/sdems_pr.txt` |
| 27 | offices / researcher | 22:10:03Z | `https://www.majoritywhip.gov/videos` | 301 (159 B) | `offices/majwhip_videos.txt` |
| 28 | offices / researcher | 22:10:03Z | `https://democraticleader.house.gov/rss.xml` | 200 (15311 B) | `offices/demldr_rss.txt` |
| 29 | offices / researcher | 22:10:03Z | `https://www.speaker.gov/wp-json/wp/v2/types` | 200 (6058 B) | `offices/speaker_types.txt` |
| 30 | offices / researcher | 22:10:06Z | `https://www.majorityleader.gov/schedule/default.aspx` | 200 (202796 B) | `offices/majldr_sched.txt` |
| 31 | offices / researcher | 22:10:06Z | `https://www.republicanleader.senate.gov/wp-content/plugins/creativengine-congressional-utilities/assets/js/live-meetings.js?ver=1.4.7` | 200 (22524 B) | `offices/srl_livejs.txt` |
| 32 | offices / researcher | 22:10:06Z | `https://www.democrats.senate.gov/floor/senate-schedule` | 200 (113153 B) | `offices/sdems_sched.txt` |
| 33 | offices / researcher | 22:10:06Z | `https://democraticleader.house.gov/media/press-releases` | 200 (53469 B) | `offices/demldr_pr.txt` |
| 34 | offices / researcher | 22:10:06Z | `https://www.speaker.gov/wp-json/wp/v2/posts?per_page=20&_fields=id,date,date_gmt,modified_gmt,link,title,categories,type` | 200 (8337 B) | `offices/speaker_posts20.txt` |
| 35 | offices / researcher | 22:10:09Z | `https://www.republicanleader.senate.gov/wp-content/plugins/creativengine-congressional-utilities/assets/js/live-meetings-init.js?ver=1.4.7` | 200 (16279 B) | `offices/srl_liveinit.txt` |
| 36 | offices / researcher | 22:10:09Z | `https://www.speaker.gov/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count` | 200 (724 B) | `offices/speaker_cats.txt` |
| 37 | offices / researcher | 22:10:20Z | `https://www.speaker.gov/wp-json/wp/v2/pages?per_page=100&_fields=id,slug,link,title,modified_gmt` | 200 (2653 B) | `offices/speaker_pages.txt` |
| 38 | offices / researcher | 22:10:32Z | `https://www.speaker.gov/2026/09/29/speaker-johnson-addresses-press-following-meeting-with-president-trump-super-intelligence-industry-leaders/` | 200 (118554 B) | `offices/speaker_post_0929.txt` |
| 39 | offices / researcher | 22:22:17Z | `https://democraticleader.house.gov/media/press-releases/leader-jeffries-capitol-donald-trump-and-republicans-have-broken-economy-and` | 200 (44843 B) | `offices/demldr_capitol_1001.txt` |
| 40 | offices / researcher | 22:22:17Z | `https://www.democrats.senate.gov/news/press-releases/transcript-at-a-press-conference-leader-schumer-underscores-the-clear-contrast-between-senate-democrats-vision-for-american-families-and-republicans-devastating-costs-chaos-and-corruption` | 200 (84989 B) | `offices/sdems_transcript_0930.txt` |
| 41 | offices / researcher | 22:22:17Z | `https://www.barrasso.senate.gov/robots.txt` | 200 (181 B) | `offices/barrasso_robots.txt` |
| 42 | offices / researcher | 22:22:17Z | `https://democraticwhip.house.gov/newsroom/press-releases` | 200 (59188 B) | `offices/demwhip_pr.txt` |
| 43 | offices / researcher | 22:22:17Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCzqBEpeIaDEfvAtsA53Fx2Q` | 200 (16829 B) | `offices/yt_johnson.txt` |
| 44 | offices / researcher | 22:22:17Z | `https://www.durbin.senate.gov/robots.txt` | 302 (207 B) | `offices/durbin_robots.txt` |
| 45 | offices / researcher | 22:22:17Z | `https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings?limit=10&days=7` | 200 (2 B) | `offices/srl_livemeetings.txt` |
| 46 | offices / researcher | 22:22:17Z | `https://www.speaker.gov/wp-json/wp/v2/posts?search=press%20conference&per_page=50&_fields=id,date_gmt,modified_gmt,title,link,excerpt` | 200 (43873 B) | `offices/speaker_search_presser.txt` |
| 47 | offices / researcher | 22:22:19Z | `https://democraticleader.house.gov/media/press-releases/leader-jeffries-capitol-house-democrats-are-running-toward-finish-line-and` | 200 (44338 B) | `offices/demldr_capitol_prev.txt` |
| 48 | offices / researcher | 22:22:19Z | `https://www.barrasso.senate.gov/` | 200 (152843 B) | `offices/barrasso_home.txt` |
| 49 | offices / researcher | 22:22:20Z | `https://www.durbin.senate.gov/` | 200 (49896 B) | `offices/durbin_home.txt` |
| 50 | offices / researcher | 22:22:20Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVzqBEpeIaDEfvAtsA53Fx2Q` | 200 (16613 B) | `offices/yt_johnson_lv.txt` |
| 51 | offices / researcher | 22:22:20Z | `https://www.republicanleader.senate.gov/wp-json/wp/v2/capigacr_meeting?per_page=10` | 200 (2 B) | `offices/srl_meetings.txt` |
| 52 | offices / researcher | 22:22:23Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCYVmbsjoNbQ4j-PCQIYgpWQ` | 200 (18745 B) | `offices/yt_jeffries.txt` |
| 53 | offices / researcher | 22:22:23Z | `https://www.republicanleader.senate.gov/wp-json/wp/v2/remark?per_page=30&_fields=id,date,date_gmt,modified_gmt,title,link` | 200 (10274 B) | `offices/srl_remarks.txt` |
| 54 | offices / researcher | 22:22:25Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVYVmbsjoNbQ4j-PCQIYgpWQ` | 200 (20819 B) | `offices/yt_jeffries_lv.txt` |
| 55 | offices / researcher | 22:22:27Z | `https://www.republicanleader.senate.gov/wp-json/wp/v2/press_releases?per_page=30&_fields=id,date,date_gmt,modified_gmt,title,link` | 200 (10042 B) | `offices/srl_prs.txt` |
| 56 | offices / researcher | 22:22:28Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCRu6lpRfxhkDGUrKDgQNZYQ` | 200 (16876 B) | `offices/yt_thune.txt` |
| 57 | offices / researcher | 22:22:30Z | `https://www.republicanleader.senate.gov/newsroom/press-releases/thune-will-democrats-finally-take-yes-for-an-answer-2/` | 200 (313307 B) | `offices/srl_pr_yes.txt` |
| 58 | offices / researcher | 22:22:31Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVRu6lpRfxhkDGUrKDgQNZYQ` | 200 (1638 B) | `offices/yt_thune_lv.txt` |
| 59 | offices / researcher | 22:22:34Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVmYveHBVXVBRxl7GiCL-gjw` | 200 (16173 B) | `offices/yt_scalise_lv.txt` |
| 60 | offices / researcher | 22:22:37Z | `https://www.youtube.com/feeds/videos.xml?user=RepTomEmmer` | 404 (1594 B) | `offices/yt_emmer_user.txt` |
| 61 | offices / researcher | 22:22:39Z | `https://www.youtube.com/feeds/videos.xml?user=senatedemocrats` | 200 (20068 B) | `offices/yt_senatedems_user.txt` |
| 62 | offices / researcher | 22:28:22Z | `https://www.republican.senate.gov/robots.txt` | 200 (183 B) | `offices/srep_robots.txt` |
| 63 | offices / researcher | 22:28:22Z | `https://www.gop.gov/robots.txt` | 404 (146 B) | `offices/gop_robots.txt` |
| 64 | offices / researcher | 22:28:22Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVpgILFSGxY-9mQR79fLSt2A` | 200 (18601 B) | `offices/yt_sdems_lv.txt` |
| 65 | offices / researcher | 22:28:22Z | `https://www.speaker.gov/feed/` | 200 (67114 B) | `offices/speaker_feed_inm.txt` |
| 66 | offices / researcher | 22:28:22Z | `https://www.democrats.senate.gov/feed` | 200 (69710 B) | `offices/sdems_feed_inm.txt` |
| 67 | offices / researcher | 22:28:22Z | `http://web.archive.org/cdx/search/cdx?url=democraticleader.house.gov/live&from=2025&output=json&fl=timestamp,statuscode,digest,length` | 200 (5521 B) | `offices/wb_cdx_demldr_live.txt` |
| 68 | offices / researcher | 22:28:25Z | `https://www.republican.senate.gov/` | 200 (210872 B) | `offices/srep_home.txt` |
| 69 | offices / researcher | 22:28:25Z | `https://www.speaker.gov/feed/` | 304 (0 B) | `offices/speaker_feed_ims.txt` |
| 70 | offices / researcher | 22:28:25Z | `https://www.gop.gov/` | 200 (177452 B) | `offices/gop_home.txt` |
| 71 | offices / researcher | 22:28:25Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV-ABttxh8uQv_10qmwGaidw` | 200 (17081 B) | `offices/yt_schumer_lv.txt` |
| 72 | offices / researcher | 22:28:25Z | `http://web.archive.org/cdx/search/cdx?url=youtube.com/watch?v=AU2wgCBjCQo&output=json&fl=timestamp,statuscode,digest` | ERR | `offices/wb_cdx_yt_AU2w.txt` |
| 73 | offices / researcher | 22:28:28Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVgaI52w7QKI8LtkSeCCmSuw` | 200 (21692 B) | `offices/yt_clark_lv.txt` |
| 74 | offices / researcher | 22:28:30Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVxwbFLOlKDsXrwizV5jah7g` | 404 (1616 B) | `offices/yt_aguilar_lv.txt` |
| 75 | offices / researcher | 22:28:33Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVkbixlNCxcKAffEhe3X5-lw` | 200 (19870 B) | `offices/yt_durbin_lv.txt` |
| 76 | offices / researcher | 22:28:36Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV80PfiCAB2Fe1MFayWlR6GQ` | 404 (1616 B) | `offices/yt_barrasso_lv.txt` |
| 77 | offices / researcher | 22:28:57Z | `http://web.archive.org/cdx/search/cdx?url=youtube.com/watch?v=V4DWXH_UKcE&output=json&fl=timestamp,statuscode,digest` | ERR | `offices/wb_cdx_yt_V4DW.txt` |
| 78 | offices / researcher | 22:29:30Z | `http://web.archive.org/cdx/search/cdx?url=youtube.com/feeds/videos.xml?channel_id=UCYVmbsjoNbQ4j-PCQIYgpWQ&output=json&fl=timestamp,statuscode,digest&from=2025` | ERR | `offices/wb_cdx_ytfeed_jeffries.txt` |
| 79 | offices / researcher | 22:30:03Z | `http://web.archive.org/cdx/search/cdx?url=youtube.com/feeds/videos.xml?channel_id=UCzqBEpeIaDEfvAtsA53Fx2Q&output=json&fl=timestamp,statuscode,digest&from=2025` | ERR | `offices/wb_cdx_ytfeed_johnson.txt` |
| 80 | offices / researcher | 22:30:35Z | `http://web.archive.org/cdx/search/cdx?url=republicanleader.senate.gov/wp-json/creativengine-capitol-gains/&matchType=prefix&output=json&fl=timestamp,original,statuscode,length&limit=50` | 200 (2046 B) | `offices/wb_cdx_srl_live.txt` |
| 81 | offices / researcher | 22:33:45Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UC4czmSY7dsAiLFseD313tKA` | 200 (33877 B) | `offices/yt_housegop.txt` |
| 82 | offices / researcher | 22:33:45Z | `https://democraticleader.house.gov/media/press-releases?page=1` | 200 (54083 B) | `offices/demldr_pr_p1.txt` |
| 83 | offices / researcher | 22:33:45Z | `https://www.republicanleader.senate.gov/wp-json/wp/v2/search?search=advisory&per_page=20` | 200 (2 B) | `offices/srl_search_advisory.txt` |
| 84 | offices / researcher | 22:33:45Z | `https://archive.org/wayback/available?url=youtube.com/watch?v=AU2wgCBjCQo` | 200 (68 B) | `offices/ia_avail_AU2w.txt` |
| 85 | offices / researcher | 22:33:45Z | `http://web.archive.org/web/20260917113718id_/https://democraticleader.house.gov/live` | 200 (43596 B) | `offices/wb_demldr_live_20260917.txt` |
| 86 | offices / researcher | 22:33:45Z | `https://www.speaker.gov/wp-json/wp/v2/search?search=advisory&per_page=20` | 200 (4779 B) | `offices/speaker_search_advisory.txt` |
| 87 | offices / researcher | 22:33:48Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV4czmSY7dsAiLFseD313tKA` | 200 (22513 B) | `offices/yt_housegop_lv.txt` |
| 88 | offices / researcher | 22:33:51Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVAdyfSY2oRwNIB4LddDYZJA` | 200 (17075 B) | `offices/yt_senategop_lv.txt` |
| 89 | offices / researcher | 22:33:55Z | `http://web.archive.org/web/20260713012908id_/https://democraticleader.house.gov/live` | 200 (43771 B) | `offices/wb_demldr_live_20260713.txt` |
| 90 | offices / researcher | 22:34:04Z | `http://web.archive.org/web/20260603021850id_/https://democraticleader.house.gov/live` | 200 (43784 B) | `offices/wb_demldr_live_20260603.txt` |
| 91 | offices / researcher | 22:34:12Z | `http://web.archive.org/web/20260504190047id_/https://democraticleader.house.gov/live` | 200 (46544 B) | `offices/wb_demldr_live_20260504.txt` |
| 92 | offices / researcher | 22:34:23Z | `http://web.archive.org/web/20260926090312id_/https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings?limit=10&days=7&_t=1790413392319` | 200 (2 B) | `offices/wb_srl_lm_20260926.txt` |
| 93 | offices / researcher | 22:34:34Z | `http://web.archive.org/web/20260810144042id_/https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings?limit=10&days=7&_t=1786372842096` | 200 (2 B) | `offices/wb_srl_lm_20260810.txt` |
| 94 | offices / researcher | 22:37:30Z | `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=hJjEHjZQQ1U&format=json` | 200 (881 B) | `offices/yt_oembed_hJjE.txt` |
| 95 | offices / researcher | 22:37:30Z | `https://www.republican.senate.gov/feed/` | 200 (50450 B) | `offices/srep_feed.txt` |
| 96 | offices / researcher | 22:37:30Z | `https://democraticleader.house.gov/media/press-releases/leader-jeffries-we-are-committed-fight-affordable-america-until-we-win-fight` | 200 (47699 B) | `offices/demldr_pr_0916.txt` |
| 97 | offices / researcher | 22:37:30Z | `https://www.republicanleader.senate.gov/feed/` | 503 (4869 B) | `offices/srl_feed.txt` |
| 98 | offices / researcher | 22:37:33Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCAdyfSY2oRwNIB4LddDYZJA` | 200 (17412 B) | `offices/yt_sdems_ch.txt` |
| 99 | offices / researcher | 22:37:33Z | `https://democraticleader.house.gov/media/press-releases/leader-jeffries-affordability-crisis-united-states-america-not-hoax` | 200 (45202 B) | `offices/demldr_pr_0914.txt` |
| 100 | offices / researcher | 22:40:40Z | `https://www.speaker.gov/privacy-policy/` | 200 (86665 B) | `offices/speaker_privacy.txt` |
| 101 | offices / researcher | 22:40:40Z | `https://www.majorityleader.gov/news/documentsingle.aspx?DocumentID=6055` | 200 (26495 B) | `offices/majldr_doc6055.txt` |
| 102 | offices / researcher | 22:40:40Z | `https://www.dems.gov/robots.txt` | 410 (308 B) | `offices/dems_robots.txt` |
| 103 | offices / researcher | 22:40:40Z | `https://www.republicanleader.senate.gov/feed/` | 503 (4869 B) | `offices/srl_feed_retry.txt` |
| 104 | offices / researcher | 22:40:40Z | `https://democraticleader.house.gov/media/press-releases/rss.xml` | 404 (40449 B) | `offices/demldr_pr_rss.txt` |
| 105 | offices / researcher | 22:40:43Z | `https://www.dems.gov/` | 200 (32720 B) | `offices/dems_home.txt` |
| 106 | offices / researcher | 22:40:43Z | `https://democraticleader.house.gov/copyright` | 200 (41032 B) | `offices/demldr_copyright.txt` |
| 107 | offices / researcher | 22:43:29Z | `https://www.democrats.senate.gov/newsroom/press-releases` | 200 (119646 B) | `offices/sdems_pr_inm.txt` |
| 108 | offices / researcher | 22:43:29Z | `https://democraticleader.house.gov/live` | 200 (43342 B) | `offices/demldr_live_inm.txt` |
| 109 | offices / researcher | 22:43:32Z | `https://democraticleader.house.gov/live` | 304 (0 B) | `offices/demldr_live_ims.txt` |
| 110 | offices / verifier | 22:55:17Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVAdyfSY2oRwNIB4LddDYZJA` | 200 (1882 B) | `offices/verifier/yt_senategop_lv.txt` |
| 111 | offices / verifier | 22:55:17Z | `https://democrats.house.gov/robots.txt` | 410 (308 B) | `offices/verifier/hdc_robots.txt` |
| 112 | offices / verifier | 22:55:17Z | `https://democraticleader.house.gov/live` | 200 (11265 B) | `offices/verifier/dlh_live.txt` |
| 113 | offices / verifier | 22:55:17Z | `https://www.republicanleader.senate.gov/feed/` | 503 (1813 B) | `offices/verifier/srl_feed.txt` |
| 114 | offices / verifier | 22:55:57Z | `https://democrats.house.gov/` | 200 (7788 B) | `offices/verifier/hdc_home.txt` |
| 115 | offices / verifier | 22:55:57Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVpgILFSGxY-9mQR79fLSt2A` | 200 (2948 B) | `offices/verifier/yt_sdems_lv.txt` |
| 116 | offices / verifier | 22:56:03Z | `https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings?limit=10&days=7` | 200 (2 B) | `offices/verifier/srl_livemeetings.txt` |
| 117 | offices / verifier | 22:56:28Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV4czmSY7dsAiLFseD313tKA` | 200 (2025 B) | `offices/verifier/yt_housegop_lv.txt` |
| 118 | offices / verifier | 22:56:48Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVYVmbsjoNbQ4j-PCQIYgpWQ` | 200 (3556 B) | `offices/verifier/yt_jeffries_lv.txt` |
| 119 | offices / verifier | 22:57:15Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV-ABttxh8uQv_10qmwGaidw` | 200 (1781 B) | `offices/verifier/yt_schumer_lv.txt` |
| 120 | offices / verifier | 22:59:23Z | `https://www.youtube.com/feeds/videos.xml?user=HouseDems` | 200 (2517 B) | `offices/verifier/yt_housedems_user.txt` |
| 121 | offices / verifier | 22:59:23Z | `https://www.democrats.senate.gov/newsroom/press-releases` | 200 (24307 B) | `offices/verifier/sdems_pr.txt` |
| 122 | offices / verifier | 22:59:23Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?after=2026-05-11T00:00:00&before=2026-08-06T00:00:00&per_page=100&_fields=id,date_gmt,modified_gmt,title,content` | 200 (43398 B) | `offices/verifier/dp_posts_mayaug.txt` |
| 123 | offices / verifier | 22:59:48Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?after=2026-09-13T00:00:00&before=2026-10-02T00:00:00&per_page=100&_fields=id,date_gmt,modified_gmt,title,content` | 200 (17131 B) | `offices/verifier/dp_posts_sep.txt` |
| 124 | offices / verifier | 23:01:06Z | `https://www.democrats.senate.gov/news/press-releases/leader-schumer-floor-remarks-highlighting-the-skyrocketing-costs-unchecked-chaos-and-rampant-corruption-of-donald-trump-and-republicans` | 200 (19637 B) | `offices/verifier/sdems_floor_0930.txt` |
| 125 | offices / verifier | 23:01:06Z | `https://www.speaker.gov/feed/` | 304 (0 B) | `offices/verifier/speaker_feed_ims.txt` |
| 126 | offices / verifier | 23:01:06Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVxhAOE8DbC8iVNhAgQw5eNg` | 200 (1770 B) | `offices/verifier/yt_housedems_lv.txt` |
| 127 | offices / verifier | 23:01:26Z | `https://www.democrats.senate.gov/newsroom/press-releases/following-20-months-of-trumps-broken-promises-and-rampant-corruption-leader-schumer-shines-light-on-republicans-cost-raising-failures` | 200 (18042 B) | `offices/verifier/sdems_pr_20mo.txt` |
| 128 | offices / verifier | 23:02:04Z | `https://www.speaker.gov/feed/` | 200 (67114 B) | `offices/verifier/speaker_feed_inm.txt` |
| 129 | offices / verifier | 23:03:30Z | `https://democrats.house.gov/newsroom/press-releases/chairman-aguilar-house-republicans-are-nowhere-to-be-found-when-the-american-public-is-asking-for-help` | 200 (8112 B) | `offices/verifier/hdc_pr_latest.txt` |
| 130 | offices / verifier | 23:03:37Z | `https://democrats.house.gov/newsroom/press-releases` | 200 (10570 B) | `offices/verifier/hdc_pr_list.txt` |
| 131 | galleries / researcher | 21:53:49Z | `https://radiotv.house.gov/robots.txt` | 200 (702 B) | `galleries/radiotv_house_robots.txt` |
| 132 | galleries / researcher | 21:55:39Z | `https://pressgallery.house.gov/robots.txt` | 200 (702 B) | `galleries/pressgallery_house_robots.txt` |
| 133 | galleries / researcher | 21:57:21Z | `https://periodical.house.gov/robots.txt` | 200 (702 B) | `galleries/periodical_house_robots.txt` |
| 134 | galleries / researcher | 21:59:05Z | `https://www.radiotv.senate.gov/robots.txt` | 200 (133 B) | `galleries/radiotv_senate_robots.txt` |
| 135 | galleries / researcher | 22:02:21Z | `https://www.radiotv.senate.gov/robots.txt` | 200 (133 B) | `galleries/radiotv_senate_robots_v.txt` |
| 136 | galleries / researcher | 22:02:31Z | `https://radiotv.house.gov/` | 200 (13423 B) | `galleries/radiotv_house_home.txt` |
| 137 | galleries / researcher | 22:02:42Z | `https://pressgallery.house.gov/` | 200 (20212 B) | `galleries/pressgallery_house_home.txt` |
| 138 | galleries / researcher | 22:03:16Z | `https://periodical.house.gov/` | 200 (7170 B) | `galleries/periodical_house_home.txt` |
| 139 | galleries / researcher | 22:03:26Z | `https://www.radiotv.senate.gov/` | 200 (22610 B) | `galleries/radiotv_senate_home.txt` |
| 140 | galleries / researcher | 22:06:41Z | `https://ebbs.senate.gov/robots.txt` | 200 (26 B) | `galleries/ebbs_robots.txt` |
| 141 | galleries / researcher | 22:06:49Z | `https://ebbs.senate.gov/` | 200 (8889 B) | `galleries/ebbs_home.txt` |
| 142 | galleries / researcher | 22:06:57Z | `https://ebbs.senate.gov/events/upcoming/` | 302 (0 B) | `galleries/ebbs_events_upcoming.txt` |
| 143 | galleries / researcher | 22:09:19Z | `https://www.radiotv.senate.gov/wp-json/wp/v2/pages/51499?_fields=id,date_gmt,modified_gmt,modified,link,title,template` | 200 (166 B) | `galleries/radiotv_senate_page51499_meta.txt` |
| 144 | galleries / researcher | 22:09:27Z | `https://www.radiotv.senate.gov/wp-json/wp/v2/pages/51499?_fields=id,modified_gmt,content` | 200 (101774 B) | `galleries/radiotv_senate_page51499_content.txt` |
| 145 | galleries / researcher | 22:09:38Z | `https://www.radiotv.senate.gov/wp-json/wp/v2/types` | 200 (12572 B) | `galleries/radiotv_senate_types.txt` |
| 146 | galleries / researcher | 22:09:45Z | `https://www.radiotv.senate.gov/feed/` | 200 (456 B) | `galleries/radiotv_senate_feed.txt` |
| 147 | galleries / researcher | 22:11:12Z | `https://www.radiotv.senate.gov/feed/` | 304 (0 B) | `galleries/radiotv_senate_feed_IMS.txt` |
| 148 | galleries / researcher | 22:11:23Z | `https://www.radiotv.senate.gov/feed/` | 200 (456 B) | `galleries/radiotv_senate_feed_INM.txt` |
| 149 | galleries / researcher | 22:11:32Z | `https://www.radiotv.senate.gov/` | 200 (22610 B) | `galleries/radiotv_senate_home_IMS.txt` |
| 150 | galleries / researcher | 22:12:24Z | `http://web.archive.org/cdx/search/cdx?url=radiotv.senate.gov/&from=20260101&to=20261003&fl=timestamp,statuscode,digest,length` | 000 (0 B) timeout | `galleries/wb_cdx_radiotv_senate_2026.txt` |
| 151 | galleries / researcher | 22:13:28Z | `https://web.archive.org/cdx/search/cdx?url=www.radiotv.senate.gov/&from=20260901&to=20261003&fl=timestamp,statuscode,digest,length` | 200 (230 B) | `galleries/wb_cdx_radiotv_senate_202609.txt` |
| 152 | galleries / researcher | 22:15:13Z | `https://web.archive.org/cdx/search/cdx?url=www.radiotv.senate.gov/&from=20260101&to=20260831&fl=timestamp,statuscode,digest,length&filter=statuscode:200` | 200 (8896 B) | `galleries/wb_cdx_radiotv_senate_2026H1.txt` |
| 153 | galleries / researcher | 22:16:24Z | `https://web.archive.org/web/20260203051050id_/https://www.radiotv.senate.gov/` | 429 (117 B) | `galleries/wb_radiotv_senate_20260203051050.txt` |
| 154 | galleries / researcher | 22:16:31Z | `https://web.archive.org/web/20260203171128id_/https://www.radiotv.senate.gov/` | 200 (18687 B) | `galleries/wb_radiotv_senate_20260203171128.txt` |
| 155 | galleries / researcher | 22:16:40Z | `https://web.archive.org/web/20260210050939id_/https://www.radiotv.senate.gov/` | 200 (18357 B) | `galleries/wb_radiotv_senate_20260210050939.txt` |
| 156 | galleries / researcher | 22:16:43Z | `https://radiotv.house.gov/today-in-the-house` | 200 (11501 B) | `galleries/radiotv_house_today.txt` |
| 157 | galleries / researcher | 22:16:47Z | `https://web.archive.org/web/20260210171115id_/https://www.radiotv.senate.gov/` | 200 (18777 B) | `galleries/wb_radiotv_senate_20260210171115.txt` |
| 158 | galleries / researcher | 22:16:48Z | `https://radiotv.house.gov/for-press-secretaries/press-conference-locations` | 200 (12536 B) | `galleries/radiotv_house_pc_locations.txt` |
| 159 | galleries / researcher | 22:16:53Z | `https://web.archive.org/web/20260414051044id_/https://www.radiotv.senate.gov/` | 200 (18062 B) | `galleries/wb_radiotv_senate_20260414051044.txt` |
| 160 | galleries / researcher | 22:16:55Z | `https://radiotv.house.gov/for-press-secretaries/news-releaseadvisory-distribution` | 200 (11375 B) | `galleries/radiotv_house_advisory_dist.txt` |
| 161 | galleries / researcher | 22:17:02Z | `https://web.archive.org/web/20260414200315id_/https://www.radiotv.senate.gov/` | 200 (19537 B) | `galleries/wb_radiotv_senate_20260414200315.txt` |
| 162 | galleries / researcher | 22:17:05Z | `https://radiotv.house.gov/rss.xml` | 200 (1401 B) | `galleries/radiotv_house_rss.txt` |
| 163 | galleries / researcher | 22:17:12Z | `https://pressgallery.house.gov/on-the-floor` | 200 (17988 B) | `galleries/pressgallery_house_onfloor.txt` |
| 164 | galleries / researcher | 22:17:13Z | `https://web.archive.org/web/20260428051413id_/https://www.radiotv.senate.gov/` | 200 (17757 B) | `galleries/wb_radiotv_senate_20260428051413.txt` |
| 165 | galleries / researcher | 22:17:18Z | `https://pressgallery.house.gov/press-secretaries/schedule-pen-pad-gallery` | 200 (17781 B) | `galleries/pressgallery_house_penpad.txt` |
| 166 | galleries / researcher | 22:17:19Z | `https://web.archive.org/web/20260428171204id_/https://www.radiotv.senate.gov/` | 200 (19075 B) | `galleries/wb_radiotv_senate_20260428171204.txt` |
| 167 | galleries / researcher | 22:17:29Z | `https://web.archive.org/web/20260512051218id_/https://www.radiotv.senate.gov/` | 200 (18351 B) | `galleries/wb_radiotv_senate_20260512051218.txt` |
| 168 | galleries / researcher | 22:17:40Z | `https://web.archive.org/web/20260513171321id_/https://www.radiotv.senate.gov/` | 200 (20007 B) | `galleries/wb_radiotv_senate_20260513171321.txt` |
| 169 | galleries / researcher | 22:19:58Z | `https://web.archive.org/web/20260413192513id_/https://www.radiotv.senate.gov/` | 200 (16961 B) | `galleries/wb_radiotv_senate_20260413192513.txt` |
| 170 | galleries / researcher | 22:20:14Z | `https://web.archive.org/web/20260427171717id_/https://www.radiotv.senate.gov/` | 302 (0 B) | `galleries/wb_radiotv_senate_20260427171717.txt` |
| 171 | galleries / researcher | 22:20:39Z | `https://web.archive.org/web/20260511170917id_/https://www.radiotv.senate.gov/` | 200 (17979 B) | `galleries/wb_radiotv_senate_20260511170917.txt` |
| 172 | galleries / researcher | 22:22:04Z | `https://web.archive.org/cdx/search/cdx?url=pressgallery.house.gov/&from=20260101&to=20260930&fl=timestamp,statuscode,digest,length&filter=statuscode:200&collapse=timestamp:8` | 200 (4660 B) | `galleries/wb_cdx_pressgallery_house_2026.txt` |
| 173 | galleries / researcher | 22:22:23Z | `https://web.archive.org/web/20260113024155id_/https://pressgallery.house.gov/` | 200 (22428 B) | `galleries/wb_pressgallery_house_20260113024155.txt` |
| 174 | galleries / researcher | 22:22:34Z | `https://web.archive.org/web/20260210002133id_/https://pressgallery.house.gov/` | 200 (27379 B) | `galleries/wb_pressgallery_house_20260210002133.txt` |
| 175 | galleries / researcher | 22:22:41Z | `https://web.archive.org/web/20260415012347id_/https://pressgallery.house.gov/` | 200 (29448 B) | `galleries/wb_pressgallery_house_20260415012347.txt` |
| 176 | galleries / researcher | 22:22:53Z | `https://web.archive.org/web/20260513012512id_/https://pressgallery.house.gov/` | 200 (29314 B) | `galleries/wb_pressgallery_house_20260513012512.txt` |
| 177 | galleries / researcher | 22:23:05Z | `https://web.archive.org/web/20260514132546id_/https://pressgallery.house.gov/` | 200 (29581 B) | `galleries/wb_pressgallery_house_20260514132546.txt` |
| 178 | galleries / researcher | 22:24:15Z | `https://web.archive.org/web/20260414012634id_/https://pressgallery.house.gov/` | 503 (11832 B) | `galleries/wb_pressgallery_house_20260414012634.txt` |
| 179 | galleries / researcher | 22:24:25Z | `https://web.archive.org/web/20260512092055id_/https://pressgallery.house.gov/` | 200 (27903 B) | `galleries/wb_pressgallery_house_20260512092055.txt` |
| 180 | galleries / researcher | 22:25:03Z | `https://www.dailypress.senate.gov/robots.txt` | 200 (136 B) | `galleries/dailypress_robots.txt` |
| 181 | galleries / researcher | 22:25:08Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?search=stakeout&per_page=20&_fields=id,date_gmt,modified_gmt,title,link` | 200 (2 B) | `galleries/dailypress_search_stakeout.txt` |
| 182 | galleries / researcher | 22:25:15Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?search=press%20conference&per_page=20&_fields=id,date_gmt,modified_gmt,title,link` | 200 (845 B) | `galleries/dailypress_search_pressconf.txt` |
| 183 | galleries / researcher | 22:25:21Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?search=weekly%20caucus&per_page=5&_fields=id,date_gmt,modified_gmt,title,link` | 200 (344 B) | `galleries/dailypress_search_caucus.txt` |
| 184 | galleries / researcher | 22:25:38Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts/166969?_fields=id,date_gmt,modified_gmt,title,content` | 200 (3517 B) | `galleries/dailypress_post_166969.txt` |
| 185 | galleries / researcher | 22:25:43Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts/166665?_fields=id,date_gmt,modified_gmt,title,content` | 200 (2598 B) | `galleries/dailypress_post_166665.txt` |
| 186 | galleries / researcher | 22:25:47Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts/166593?_fields=id,date_gmt,modified_gmt,title,content` | 200 (2039 B) | `galleries/dailypress_post_166593.txt` |
| 187 | galleries / researcher | 22:25:51Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts/166855?_fields=id,date_gmt,modified_gmt,title,content` | 200 (2791 B) | `galleries/dailypress_post_166855.txt` |
| 188 | galleries / researcher | 22:26:09Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/pages?search=pen&per_page=20&_fields=id,modified_gmt,title,link` | 200 (475 B) | `galleries/dailypress_pages_search_pen.txt` |
| 189 | galleries / researcher | 22:26:14Z | `https://www.periodicalpress.senate.gov/robots.txt` | 200 (141 B) | `galleries/periodicalpress_robots.txt` |
| 190 | galleries / researcher | 22:26:19Z | `https://www.periodicalpress.senate.gov/wp-json/wp/v2/posts?search=stakeout&per_page=10&_fields=id,date_gmt,title,link` | 200 (159 B) | `galleries/periodicalpress_search_stakeout.txt` |
| 191 | galleries / researcher | 22:26:24Z | `https://www.periodicalpress.senate.gov/wp-json/wp/v2/posts?search=%22news%20conference%22&per_page=10&_fields=id,date_gmt,title,link` | 200 (2 B) | `galleries/periodicalpress_search_newsconf.txt` |
| 192 | galleries / researcher | 22:26:26Z | `https://periodical.house.gov/special-events-and-announcements` | 200 (7463 B) | `galleries/periodical_house_special.txt` |
| 193 | galleries / researcher | 22:26:42Z | `https://www.dailypress.senate.gov/` | 200 (45612 B) | `galleries/dailypress_home.txt` |
| 194 | galleries / researcher | 22:26:45Z | `https://www.periodicalpress.senate.gov/` | 200 (16013 B) | `galleries/periodicalpress_home.txt` |
| 195 | galleries / researcher | 22:27:15Z | `https://www.radiotv.senate.gov/gallery-members/coverage-locations/` | 200 (15491 B) | `galleries/radiotv_senate_coverage_locations.txt` |
| 196 | galleries / researcher | 22:27:21Z | `https://pressgallery.house.gov/copyright` | 200 (17719 B) | `galleries/pressgallery_house_copyright.txt` |
| 197 | galleries / researcher | 22:27:21Z | `https://www.radiotv.senate.gov/press-secretaries/` | 200 (14840 B) | `galleries/radiotv_senate_press_secretaries.txt` |
| 198 | galleries / researcher | 22:27:22Z | `https://radiotv.house.gov/copyright` | 200 (11242 B) | `galleries/radiotv_house_copyright.txt` |
| 199 | galleries / researcher | 22:28:18Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=radio-tv%20gallery&limit=25` | 200 (6426 B) | `galleries/bsky_search_radiotv.txt` |
| 200 | galleries / researcher | 22:28:22Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=press%20gallery&limit=25` | 200 (6179 B) | `galleries/bsky_search_pressgallery.txt` |
| 201 | galleries / researcher | 22:28:33Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=senatepress.bsky.social&limit=100&filter=posts_no_replies` | 200 (18727 B) | `galleries/bsky_senatepress_feed100.txt` |
| 202 | galleries / verifier | 22:34:36Z | `https://ebbs.senate.gov/robots.txt` | 200 (26 B) | `galleries/verifier/v_ebbs_robots.txt` |
| 203 | galleries / verifier | 22:34:36Z | `https://pressgallery.house.gov/robots.txt` | 200 (702 B) | `galleries/verifier/v_pghouse_robots.txt` |
| 204 | galleries / verifier | 22:34:37Z | `https://www.radiotv.senate.gov/robots.txt` | 200 (133 B) | `galleries/verifier/v_rtvsen_robots.txt` |
| 205 | galleries / verifier | 22:34:38Z | `https://radiotv.house.gov/robots.txt` | 200 (702 B) | `galleries/verifier/v_rtvhouse_robots.txt` |
| 206 | galleries / verifier | 22:34:41Z | `https://pressgallery.house.gov/` | 200 (20212 B) | `galleries/verifier/v_pghouse_home.txt` |
| 207 | galleries / verifier | 22:34:42Z | `https://www.radiotv.senate.gov/` | 200 (22610 B) | `galleries/verifier/v_rtvsen_home.txt` |
| 208 | galleries / verifier | 22:34:43Z | `https://radiotv.house.gov/` | 200 (13423 B) | `galleries/verifier/v_rtvhouse_home.txt` |
| 209 | galleries / verifier | 22:36:37Z | `https://www.radiotv.senate.gov/feed/` | 200 (456 B) | `galleries/verifier/v_rtvsen_feed.txt` |
| 210 | galleries / verifier | 22:36:41Z | `https://www.radiotv.senate.gov/feed/` | 304 (0 B) | `galleries/verifier/v_rtvsen_feed_IMS.txt` |
| 211 | galleries / verifier | 22:36:45Z | `https://www.radiotv.senate.gov/wp-json/wp/v2/pages/51499?_fields=id,modified_gmt,modified` | 200 (81 B) | `galleries/verifier/v_rtvsen_rest_meta.txt` |
| 212 | galleries / verifier | 22:36:52Z | `https://www.radiotv.senate.gov/wp-json/wp/v2/search?search=stakeout&per_page=20` | 200 (339 B) | `galleries/verifier/v_rtvsen_rest_search.txt` |
| 213 | galleries / verifier | 22:37:20Z | `https://www.radiotv.senate.gov/feed/` | 200 (456 B) | `galleries/verifier/v_rtvsen_feed_INM.txt` |
| 214 | galleries / verifier | 22:37:24Z | `https://www.radiotv.senate.gov/wp-json/wp/v2/pages/74045?_fields=id,modified_gmt,content` | 200 (8866 B) | `galleries/verifier/v_rtvsen_faqs.txt` |
| 215 | galleries / verifier | 22:37:30Z | `https://www.radiotv.senate.gov/wp-json/wp/v2/pages/71949?_fields=id,modified_gmt,content` | 200 (29111 B) | `galleries/verifier/v_rtvsen_rules.txt` |
| 216 | galleries / verifier | 22:38:21Z | `https://web.archive.org/web/20260415012347id_/https://pressgallery.house.gov/` | 200 (29448 B) | `galleries/verifier/v_wb_pg_20260415012347.txt` |
| 217 | galleries / verifier | 22:38:32Z | `https://web.archive.org/web/20260513012512id_/https://pressgallery.house.gov/` | 200 (29314 B) | `galleries/verifier/v_wb_pg_20260513012512.txt` |
| 218 | galleries / verifier | 22:38:42Z | `https://web.archive.org/web/20260203132553id_/https://pressgallery.house.gov/` | 200 (27885 B) | `galleries/verifier/v_wb_pg_20260203132553.txt` |
| 219 | galleries / verifier | 22:38:53Z | `https://web.archive.org/web/20260226132327id_/https://pressgallery.house.gov/` | 200 (26241 B) | `galleries/verifier/v_wb_pg_20260226132327.txt` |
| 220 | galleries / verifier | 22:39:01Z | `https://web.archive.org/web/20260227132600id_/https://pressgallery.house.gov/` | 200 (26485 B) | `galleries/verifier/v_wb_pg_20260227132600.txt` |
| 221 | galleries / verifier | 22:39:10Z | `https://web.archive.org/web/20260318132635id_/https://pressgallery.house.gov/` | 200 (26933 B) | `galleries/verifier/v_wb_pg_20260318132635.txt` |
| 222 | galleries / verifier | 22:39:18Z | `https://web.archive.org/web/20260508132615id_/https://pressgallery.house.gov/` | 200 (25926 B) | `galleries/verifier/v_wb_pg_20260508132615.txt` |
| 223 | galleries / verifier | 22:40:16Z | `https://web.archive.org/web/20260210050939id_/https://www.radiotv.senate.gov/` | 200 (18357 B) | `galleries/verifier/v_wb_rtv_20260210050939.txt` |
| 224 | galleries / verifier | 22:40:21Z | `https://web.archive.org/web/20260210171115id_/https://www.radiotv.senate.gov/` | 200 (18777 B) | `galleries/verifier/v_wb_rtv_20260210171115.txt` |
| 225 | galleries / verifier | 22:40:26Z | `https://web.archive.org/web/20260428171204id_/https://www.radiotv.senate.gov/` | 200 (19075 B) | `galleries/verifier/v_wb_rtv_20260428171204.txt` |
| 226 | galleries / verifier | 22:40:52Z | `https://www.senate.gov/robots.txt` | 302 (265 B) | `galleries/verifier/v_senategov_robots.txt` |
| 227 | galleries / verifier | 22:40:56Z | `https://www.senate.gov/galleries/` | 302 (265 B) | `galleries/verifier/v_senategov_galleries.txt` |
| 228 | galleries / verifier | 22:41:18Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?search=stakeout&_fields=id` | 200 (2 B) | `galleries/verifier/v_dp_search_stakeout.txt` |
| 229 | galleries / verifier | 22:41:22Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts/166855?_fields=id,modified_gmt,date_gmt,title,content` | 200 (2791 B) | `galleries/verifier/v_dp_166855.txt` |
| 230 | galleries / verifier | 22:41:47Z | `https://pressgallery.house.gov/copyright` | 200 (17719 B) | `galleries/verifier/v_pghouse_copyright.txt` |
| 231 | video / researcher | 22:01:20Z | `https://unitedstates.github.io/congress-legislators/legislators-social-media.json` | 200 | `video/cl_social.txt` |
| 232 | video / researcher | 22:04:39Z | `https://unitedstates.github.io/congress-legislators/legislators-current.json` | 200 | `video/cl_current.txt` |
| 233 | video / researcher | 22:06:06Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCzqBEpeIaDEfvAtsA53Fx2Q` | 200 (16829 B) | `video/yt_rss_johnson.txt` |
| 234 | video / researcher | 22:06:09Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCYVmbsjoNbQ4j-PCQIYgpWQ` | 200 (18745 B) | `video/yt_rss_jeffries.txt` |
| 235 | video / researcher | 22:06:11Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCRu6lpRfxhkDGUrKDgQNZYQ` | 200 (16876 B) | `video/yt_rss_thune.txt` |
| 236 | video / researcher | 22:06:14Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UC-ABttxh8uQv_10qmwGaidw` | 200 (19099 B) | `video/yt_rss_schumer.txt` |
| 237 | video / researcher | 22:06:16Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCmYveHBVXVBRxl7GiCL-gjw` | 200 (38830 B) | `video/yt_rss_scalise.txt` |
| 238 | video / researcher | 22:07:26Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVzqBEpeIaDEfvAtsA53Fx2Q` | 200 (16613 B) | `video/yt_uulv_johnson.txt` |
| 239 | video / researcher | 22:07:29Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVYVmbsjoNbQ4j-PCQIYgpWQ` | 200 (20819 B) | `video/yt_uulv_jeffries.txt` |
| 240 | video / researcher | 22:07:31Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVRu6lpRfxhkDGUrKDgQNZYQ` | 200 (1638 B) | `video/yt_uulv_thune.txt` |
| 241 | video / researcher | 22:07:34Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV-ABttxh8uQv_10qmwGaidw` | 200 (17081 B) | `video/yt_uulv_schumer.txt` |
| 242 | video / researcher | 22:07:36Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVmYveHBVXVBRxl7GiCL-gjw` | 200 (16173 B) | `video/yt_uulv_scalise.txt` |
| 243 | video / researcher | 22:09:13Z | `https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3FitemLabel%20%3Fyt%20WHERE%20%7B%20VALUES%20%3Fitem%20%7B%20wd%3AQ1636196%20wd%3AQ5916470%20wd%3AQ7450735%20wd%3AQ7450706%20%7D%20OPTIONAL%7B%3Fitem%20wdt%3AP2397%20%3Fyt%7D%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22en%22%20%7D%20%7D` | 200 (1042 B) | `video/wikidata_sparql_conf_yt.txt` |
| 244 | video / researcher | 22:09:14Z | `https://www.dailypress.senate.gov/wp-json/wp/v2/posts?after=2026-09-14T00:00:00&before=2026-10-02T00:00:00&per_page=20&_fields=id,date,modified,title,content` | 200 (88499 B) | `video/dailypress_posts_sep22_oct01.txt` |
| 245 | video / researcher | 22:10:07Z | `https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fitem%20%3Fl%20%3Fyt%20WHERE%20%7B%20VALUES%20%3Fl%20%7B%20%22House%20Republican%20Conference%22%40en%20%22House%20Democratic%20Caucus%22%40en%20%22Senate%20Republican%20Conference%22%40en%20%22Senate%20Democratic%20Caucus%22%40en%20%22Speaker%20of%20the%20United%20States%20House%20of%20Representatives%22%40en%20%22Senate%20Majority%20Leader%22%40en%20%22House%20Majority%20Leader%22%40en%20%7D%20%3Fitem%20rdfs%3Alabel%20%3Fl%20.%20OPTIONAL%20%7B%20%3Fitem%20wdt%3AP2397%20%3Fyt%20%7D%20%7D` | 200 (1432 B) | `video/wikidata_sparql_conf_yt2.txt` |
| 246 | video / researcher | 22:10:52Z | `https://www.dems.gov/` | 200 (32732 B) | `video/site_dems_gov.txt` |
| 247 | video / researcher | 22:10:52Z | `https://www.gop.gov/` | 200 (177452 B) | `video/site_gop_gov.txt` |
| 248 | video / researcher | 22:10:53Z | `https://democraticleader.house.gov/` | 200 (55071 B) | `video/site_democraticleader.txt` |
| 249 | video / researcher | 22:10:53Z | `https://www.democrats.senate.gov/` | 200 (113132 B) | `video/site_democrats_senate.txt` |
| 250 | video / researcher | 22:10:53Z | `https://www.republican.senate.gov/` | 200 (210872 B) | `video/site_republican_senate.txt` |
| 251 | video / researcher | 22:10:53Z | `https://www.speaker.gov/` | 200 (80883 B) | `video/site_speaker_gov.txt` |
| 252 | video / researcher | 22:13:30Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UC4czmSY7dsAiLFseD313tKA` | 200 (33877 B) | `video/yt_rss_housegop.txt` |
| 253 | video / researcher | 22:13:33Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV4czmSY7dsAiLFseD313tKA` | 200 (22513 B) | `video/yt_uulv_housegop.txt` |
| 254 | video / researcher | 22:13:35Z | `https://www.youtube.com/feeds/videos.xml?channel_id=UCAdyfSY2oRwNIB4LddDYZJA` | 200 (17412 B) | `video/yt_rss_senategop.txt` |
| 255 | video / researcher | 22:13:38Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVAdyfSY2oRwNIB4LddDYZJA` | 200 (17075 B) | `video/yt_uulv_senategop.txt` |
| 256 | video / researcher | 22:13:40Z | `https://www.youtube.com/feeds/videos.xml?user=HouseDems` | 200 (17110 B) | `video/yt_rss_user_housedems.txt` |
| 257 | video / researcher | 22:13:43Z | `https://democraticleader.house.gov/live` | 200 (43342 B) | `video/site_democraticleader_live.txt` |
| 258 | video / researcher | 22:13:43Z | `https://www.youtube.com/feeds/videos.xml?user=senatedemocrats` | 200 (20068 B) | `video/yt_rss_user_senatedemocrats.txt` |
| 259 | video / researcher | 22:17:19Z | `https://www.senate.gov/isvp/stv.html` | 200 (8195 B) | `video/senate_isvp_stv_html.txt` |
| 260 | video / researcher | 22:17:22Z | `https://www.senate.gov/robots.txt` | 200 (25791 B) | `video/senate_robots.txt` |
| 261 | video / researcher | 22:20:01Z | `https://www.grassley.senate.gov/news/video/watch/senate-judiciary-committee-press-conference-on-protecting-womens-sports` | 200 (61381 B) | `video/grassley_presser_video_page.txt` |
| 262 | video / researcher | 22:20:46Z | `https://web.archive.org/cdx/search/cdx?url=www.senate.gov/isvp/&matchType=prefix&from=2024&filter=original:.*comm=srs.*&fl=timestamp,original,statuscode&limit=40` | ERR (0 B) timeout | `video/wayback_cdx_isvp_srs.txt` |
| 263 | video / researcher | 22:21:31Z | `https://web.archive.org/cdx/search/cdx?url=democraticleader.house.gov/live&from=20260801&to=20261003&fl=timestamp,statuscode,digest,length` | 200 (228 B) | `video/wayback_cdx_jeffries_live.txt` |
| 264 | video / researcher | 22:22:16Z | `https://web.archive.org/web/20260917113718id_/https://democraticleader.house.gov/live` | 200 (43596 B) | `video/wayback_jeffries_live_20260917.txt` |
| 265 | video / researcher | 22:22:23Z | `https://web.archive.org/cdx/search/cdx?url=www.senate.gov/isvp/?comm=srs&matchType=prefix&fl=timestamp,original,statuscode&limit=60` | 200 (5118 B) | `video/wayback_cdx_isvp_srs_prefix.txt` |
| 266 | video / researcher | 22:22:46Z | `https://web.archive.org/cdx/search/cdx?url=www.senate.gov/isvp/?comm=srs&matchType=prefix&collapse=urlkey&fl=timestamp,original,statuscode&limit=200` | 200 (2797 B) | `video/wayback_cdx_isvp_srs_unique.txt` |
| 267 | video / researcher | 22:23:31Z | `https://live.house.gov/` | 200 (14545 B) | `video/houselive_index.txt` |
| 268 | video / researcher | 22:23:38Z | `https://live.house.gov/js/app.9d37cb71.js` | 200 (691919 B) | `video/houselive_app_bundle.txt` |
| 269 | video / researcher | 22:24:23Z | `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DT5cTzKYpI3E&format=json` | 401 (12 B) | `video/yt_oembed_T5cTzKYpI3E.txt` |
| 270 | video / researcher | 22:24:25Z | `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fchannel%2FUCYxRlFDqcWM4y7FfpiAN3KQ%2Flive&format=json` | 404 (9 B) | `video/yt_oembed_channel_live_wh.txt` |
| 271 | video / researcher | 22:24:28Z | `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fchannel%2FUCAdyfSY2oRwNIB4LddDYZJA%2Flive&format=json` | 404 (9 B) | `video/yt_oembed_channel_live_senategop.txt` |
| 272 | video / researcher | 22:24:30Z | `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DhJjEHjZQQ1U&format=json` | 200 (881 B) | `video/yt_oembed_hJjEHjZQQ1U.txt` |
| 273 | video / researcher | 22:24:33Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVpgILFSGxY-9mQR79fLSt2A` | 200 (18601 B) | `video/yt_uulv_senatedems.txt` |
| 274 | video / researcher | 22:24:35Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVxhAOE8DbC8iVNhAgQw5eNg` | 200 (17479 B) | `video/yt_uulv_housedems.txt` |
| 275 | video / researcher | 22:25:25Z | `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fchannel%2FUCoMdktPbSTixAyNGwb-UYkQ%2Flive&format=json` | 404 (9 B) | `video/yt_oembed_channel_live_skynews_24x7.txt` |
| 276 | video / researcher | 22:25:28Z | `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DSdBiFH4b0Zw&format=json` | 401 (12 B) | `video/yt_oembed_SdBiFH4b0Zw.txt` |
| 277 | video / researcher | 22:25:53Z | `https://data.domewatch.us/v1/openapi.json` | 200 (24339 B) | `video/domewatch_openapi.txt` |
| 278 | video / researcher | 22:25:53Z | `https://domewatch.us/` | 200 (3406 B) | `video/domewatch_site_index.txt` |
| 279 | video / researcher | 22:25:54Z | `https://cao.house.gov/about/business-units` | 200 (37395 B) | `video/cao_business_units.txt` |
| 280 | video / researcher | 22:26:22Z | `https://domewatch.us/_nuxt/2e5917d.js` | 200 (2771 B) | `video/domewatch_js_0.txt` |
| 281 | video / researcher | 22:26:24Z | `https://domewatch.us/_nuxt/791f64b.js` | 200 (245351 B) | `video/domewatch_js_1.txt` |
| 282 | video / researcher | 22:26:27Z | `https://domewatch.us/_nuxt/596659e.js` | 200 (1118871 B) | `video/domewatch_js_2.txt` |
| 283 | video / researcher | 22:26:29Z | `https://domewatch.us/_nuxt/70d3b20.js` | 200 (63465 B) | `video/domewatch_js_3.txt` |
| 284 | video / researcher | 22:26:54Z | `https://www-senate-gov-msl3archive.akamaized.net/srs_srs/srs031026_1/master.m3u8` | 404 (10 B) | `video/senate_msl3_srs031026.txt` |
| 285 | video / researcher | 22:26:55Z | `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/srs031026/master.m3u8` | 200 (355 B) | `video/senate_live_srs031026.txt` |
| 286 | video / researcher | 22:26:55Z | `https://web.archive.org/web/20260310214907id_/https://www.senate.gov/isvp/?filename=srs031026&type=live&comm=srs` | 200 (8175 B) | `video/wayback_isvp_srs031026.txt` |
| 287 | video / researcher | 22:27:25Z | `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/srs031026/master/text_1.m3u8` | 200 (28078 B) | `video/senate_live_srs031026_text1.txt` |
| 288 | video / researcher | 22:27:27Z | `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/srs100126/master.m3u8` | 404 (0 B) | `video/senate_live_srs100126_master_probe.txt` |
| 289 | video / researcher | 22:27:51Z | `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/srs031026/master/text_1_00030.vtt` | 200 (57 B) | `video/senate_srs031026_vtt_00030.txt` |
| 290 | video / researcher | 22:27:53Z | `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/srs031026/master/text_1_00300.vtt` | 200 (3250 B) | `video/senate_srs031026_vtt_00300.txt` |
| 291 | video / researcher | 22:29:39Z | `https://democraticleader.house.gov/robots.txt` | 200 (2141 B) | `video/democraticleader_robots.txt` |
| 292 | video / researcher | 22:29:39Z | `https://www.youtube.com/robots.txt` | 200 (792 B) | `video/youtube_robots.txt` |
| 293 | video / verifier | 22:39:51Z | `https://www.youtube.com/robots.txt` | 200 | `video/verifier/yt_robots.txt` |
| 294 | video / verifier | 22:40:06Z | `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/srs031026/master.m3u8` | 200 | `video/verifier/senate_srs031026_master.txt` |
| 295 | video / verifier | 22:40:17Z | `https://developers.google.com/youtube/v3/guides/push_notifications` | 200 | `video/verifier/devg_push.txt` |
| 296 | video / verifier | 22:40:26Z | `https://www.youtube.com/feeds/videos.xml?playlist_id=UULVAdyfSY2oRwNIB4LddDYZJA` | 200 | `video/verifier/yt_uulv_senategop.txt` |
| 297 | video / verifier | 22:40:31Z | `https://www-senate-gov-media-srs.akamaized.net/hls/live/2031966/srs/srs100326/master.m3u8` | 404 | `video/verifier/senate_srs100326_master.txt` |
| 298 | video / verifier | 22:40:39Z | `https://www.senate.gov/robots.txt` | 302 (265 B) | `video/verifier/senate_robots.txt` |
| 299 | video / verifier | 22:40:48Z | `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=T5cTzKYpI3E&format=json` | 401 | `video/verifier/yt_oembed_T5c.txt` |
| 300 | video / verifier | 22:40:57Z | `https://developers.google.com/youtube/v3/determine_quota_cost` | 200 | `video/verifier/devg_quota.txt` |
| 301 | video / verifier | 22:41:10Z | `https://democraticleader.house.gov/live` | 200 | `video/verifier/jeffries_live.txt` |
| 302 | video / verifier | 22:41:19Z | `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=hJjEHjZQQ1U&format=json` | 200 | `video/verifier/yt_oembed_hJj.txt` |
| 303 | video / verifier | 22:41:28Z | `https://www.youtube.com/oembed?url=https://www.youtube.com/channel/UCAdyfSY2oRwNIB4LddDYZJA/live&format=json` | 404 | `video/verifier/yt_oembed_chlive_senategop.txt` |
| 304 | video / verifier | 22:41:38Z | `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=k9mZ_8-PZXY&format=json` | 200 | `video/verifier/yt_oembed_k9m_senatedems.txt` |
| 305 | video / verifier | 22:41:47Z | `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=gzoE_vUHYm4&format=json` | 200 | `video/verifier/yt_oembed_gzoE_housegop.txt` |
| 306 | video / verifier | 22:42:01Z | `https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCAdyfSY2oRwNIB4LddDYZJA` | 200 | `video/verifier/yt_xmlfeeds_senategop.txt` |
| 307 | video / verifier | 22:43:30Z | `https://developers.google.com/youtube/v3/guides/push_notifications` | 200 | `video/verifier/devg_push_full.txt` |
| 308 | video / verifier | 22:43:52Z | `https://developers.google.com/youtube/v3/determine_quota_cost` | 200 | `video/verifier/devg_quota_full.txt` |
| 309 | video / verifier | 22:44:07Z | `https://developers.google.com/youtube/v3/docs/videos/list` | 200 | `video/verifier/devg_videos_list_full.txt` |
| 310 | video / verifier | 22:44:31Z | `https://web.archive.org/cdx/search/cdx?url=www.youtube.com/feeds/videos.xml?channel_id=UCAdyfSY2oRwNIB4LddDYZJA&from=2026&limit=50` | 000 (0 B) timeout | `video/verifier/wb_cdx_feed_senategop.txt` |
| 311 | video / verifier | 22:45:11Z | `https://web.archive.org/cdx/search/cdx?url=www.youtube.com/feeds/videos.xml&matchType=prefix&from=202609&limit=2000&fl=timestamp,original&filter=original:.*(UCAdyfSY2oRwNIB4LddDYZJA\|UC-ABttxh8uQv_10qmwGaidw\|UCpgILFSGxY-9mQR79fLSt2A\|UCYVmbsjoNbQ4j-PCQIYgpWQ\|UC4czmSY7dsAiLFseD313tKA\|UCzqBEpeIaDEfvAtsA53Fx2Q\|UCxhAOE8DbC8iVNhAgQw5eNg).*` | 000 (0 B) timeout | `video/verifier/wb_cdx_feed_prefix.txt` |
| 312 | video / verifier | 22:46:11Z | `https://web.archive.org/cdx/search/cdx?url=youtube.com/feeds/videos.xml%3Fchannel_id%3DUCAdyfSY2oRwNIB4LddDYZJA&limit=30&fl=timestamp,statuscode` | 200 | `video/verifier/wb_cdx_feed_senategop2.txt` |
| 313 | video / verifier | 22:46:46Z | `https://www.speaker.gov/live` | 404 | `video/verifier/speaker_live.txt` |
| 314 | video / verifier | 22:46:50Z | `https://www.majorityleader.gov/` | 200 | `video/verifier/majorityleader.txt` |
| 315 | video / verifier | 22:46:54Z | `https://www.republicanleader.senate.gov/` | 200 | `video/verifier/republicanleader.txt` |
| 316 | video / verifier | 22:46:58Z | `https://www.democrats.senate.gov/live` | 302 | `video/verifier/senatedems_live.txt` |
| 317 | video / verifier | 22:47:02Z | `https://www.majoritywhip.gov/` | 200 | `video/verifier/majoritywhip.txt` |
| 318 | video / verifier | 22:47:57Z | `https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings` | 200 | `video/verifier/rl_live_meetings_api.txt` |
| 319 | video / verifier | 22:48:07Z | `https://www.republicanleader.senate.gov/wp-content/plugins/creativengine-congressional-utilities/assets/js/live-meetings.js?ver=1.4.7` | 200 | `video/verifier/rl_live_meetings_js.txt` |
| 320 | video / verifier | 22:48:13Z | `https://www.republicanleader.senate.gov/robots.txt` | 200 | `video/verifier/rl_robots.txt` |
| 321 | video / verifier | 22:48:52Z | `https://www.republican.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings` | 404 | `video/verifier/rsenate_live_meetings_api.txt` |
| 322 | video / verifier | 22:49:16Z | `https://web.archive.org/cdx/search/cdx?url=www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/&matchType=prefix&limit=50&fl=timestamp,original,statuscode,length` | 200 | `video/verifier/wb_cdx_rl_livemeetings.txt` |
| 323 | video / verifier | 22:49:52Z | `https://web.archive.org/web/20260730053854id_/https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/live-meetings?limit=10&days=7&_t=1785389934675` | 200 | `video/verifier/wb_rl_lm_20260730.txt` |
| 324 | video / verifier | 22:50:22Z | `https://web.archive.org/web/20260907014742id_/https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1` | 200 | `video/verifier/wb_rl_capgains_root.txt` |
| 325 | video / verifier | 22:51:09Z | `https://www.republicanleader.senate.gov/wp-json/creativengine-capitol-gains/v1/meetings-calendar?start=2026-01-01&end=2026-10-31` | 200 | `video/verifier/rl_meetings_calendar.txt` |
| 326 | video / verifier | 22:52:20Z | `https://data.domewatch.us/v1/openapi.json` | 200 | `video/verifier/domewatch_openapi.txt` |
| 327 | video / verifier | 22:53:44Z | `https://pubsubhubbub.appspot.com/` | 200 (6074 B) | `video/verifier/websub_hub_root.txt` |
| 328 | video / verifier | 22:54:20Z | `https://pubsubhubbub.appspot.com/robots.txt` | 404 (154 B) | `video/verifier/websub_hub_robots.txt` |
| 329 | thirdparty / researcher | 21:58:05Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?actors=hakeem-jeffries.bsky.social&actors=schumer.senate.gov&actors=reppeteaguilar.bsky.social&actors=housedemocrats.bsky.social&actors=senatedems.bsky.social&actors=senatepress.bsky.social&actors=mike-johnson1.bsky.social&actors=democraticcloakroom.house.gov&actors=senateppg.bsky.social` | 200 | `thirdparty/bsky_getProfiles_1.txt` |
| 330 | thirdparty / researcher | 22:05:43Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Speaker%20Johnson&limit=8` | 200 | `thirdparty/bsky_searchActors_Speaker_Johnson.txt` |
| 331 | thirdparty / researcher | 22:08:08Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Thune&limit=8` | 200 | `thirdparty/bsky_searchActors_Thune.txt` |
| 332 | thirdparty / researcher | 22:10:17Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Scalise&limit=8` | 200 | `thirdparty/bsky_searchActors_Scalise.txt` |
| 333 | thirdparty / researcher | 22:12:56Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?actors=repmikejohnson.bsky.social&actors=speakerjohnson.bsky.social&actors=speaker.gov&actors=mikejohnson.house.gov&actors=thune.senate.gov&actors=senjohnthune.bsky.social&actors=scalise.house.gov&actors=stevescalise.bsky.social&actors=durbin.senate.gov&actors=katherineclark.house.gov&actors=clark.house.gov&actors=whipkclark.bsky.social&actors=aguilar.house.gov&actors=barrasso.senate.gov&actors=emmer.house.gov&actors=senatedemocrats.bsky.social&actors=democrats.senate.gov&actors=housegop.bsky.social&actors=senategop.bsky.social&actors=housepressgallery.bsky.social&actors=houseradiotv.bsky.social&actors=senateradiotv.bsky.social&actors=radiotv.house.gov&actors=dailypress.senate.gov&actors=senatedems.senate.gov` | 200 (7376 B) | `thirdparty/bsky_getProfiles_2.txt` |
| 334 | thirdparty / researcher | 22:12:59Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Katherine%20Clark&limit=8` | 200 (5220 B) | `thirdparty/bsky_searchActors_Katherine_Clark.txt` |
| 335 | thirdparty / researcher | 22:13:01Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Durbin&limit=8` | 200 (5011 B) | `thirdparty/bsky_searchActors_Durbin.txt` |
| 336 | thirdparty / researcher | 22:13:04Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=press%20gallery%20congress&limit=10` | 200 (8855 B) | `thirdparty/bsky_searchActors_gallery.txt` |
| 337 | thirdparty / researcher | 22:13:07Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=%22press%20conference%22&author=hakeem-jeffries.bsky.social&limit=25` | 403 (2334 B) | `thirdparty/bsky_searchPosts_test.txt` |
| 338 | thirdparty / researcher | 22:14:14Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=hakeem-jeffries.bsky.social&limit=100` | 200 (153821 B) | `thirdparty/bsky_feed_jeffries.txt` |
| 339 | thirdparty / researcher | 22:14:17Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=schumer.senate.gov&limit=100` | 200 (377462 B) | `thirdparty/bsky_feed_schumer.txt` |
| 340 | thirdparty / researcher | 22:14:20Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=whipkclark.bsky.social&limit=100` | 200 (239626 B) | `thirdparty/bsky_feed_whipkclark.txt` |
| 341 | thirdparty / researcher | 22:14:22Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=durbin.senate.gov&limit=100` | 200 (238580 B) | `thirdparty/bsky_feed_durbin.txt` |
| 342 | thirdparty / researcher | 22:14:25Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=aguilar.house.gov&limit=100` | 200 (207625 B) | `thirdparty/bsky_feed_aguilar.txt` |
| 343 | thirdparty / researcher | 22:14:28Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=housedemocrats.bsky.social&limit=100` | 200 (212213 B) | `thirdparty/bsky_feed_housedemocrats.txt` |
| 344 | thirdparty / researcher | 22:14:31Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=democrats.senate.gov&limit=100` | 200 (260044 B) | `thirdparty/bsky_feed_senatedems.txt` |
| 345 | thirdparty / researcher | 22:14:33Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=senatepress.bsky.social&limit=100` | 200 (166681 B) | `thirdparty/bsky_feed_senatepress.txt` |
| 346 | thirdparty / researcher | 22:18:16Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Senate%20Republicans&limit=10` | 200 (6281 B) | `thirdparty/bsky_searchActors_Senate_Republicans.txt` |
| 347 | thirdparty / researcher | 22:18:19Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=House%20Republicans&limit=10` | 200 (8087 B) | `thirdparty/bsky_searchActors_House_Republicans.txt` |
| 348 | thirdparty / researcher | 22:18:22Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Speaker%20of%20the%20House&limit=10` | 200 (7029 B) | `thirdparty/bsky_searchActors_Speaker_of_the_House.txt` |
| 349 | thirdparty / researcher | 22:18:25Z | `https://public.api.bsky.app/robots.txt` | 200 (203 B) | `thirdparty/bsky_robots.txt` |
| 350 | thirdparty / researcher | 22:18:25Z | `https://www.politico.com/robots.txt` | 403 (5735 B) | `thirdparty/politico_robots.txt` |
| 351 | thirdparty / researcher | 22:18:25Z | `https://punchbowl.news/robots.txt` | 200 (6768 B) | `thirdparty/punchbowl_robots.txt` |
| 352 | thirdparty / researcher | 22:18:25Z | `https://rollcall.com/robots.txt` | 200 (430 B) | `thirdparty/rollcall_robots.txt` |
| 353 | thirdparty / researcher | 22:18:25Z | `https://x.com/robots.txt` | 200 (2678 B) | `thirdparty/x_robots.txt` |
| 354 | thirdparty / researcher | 22:19:06Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=houserepublicans.bsky.social&limit=100` | 200 (172095 B) | `thirdparty/bsky_feed_houserepublicans.txt` |
| 355 | thirdparty / researcher | 22:19:09Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=senategop.govpeeps.us&limit=100` | 200 (260560 B) | `thirdparty/bsky_feed_senategop_govpeeps.txt` |
| 356 | thirdparty / researcher | 22:20:57Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?actors=speakerjohnson.govpeeps.us&actors=leaderjohnthune.govpeeps.us&actors=senjohnthune.govpeeps.us&actors=stevescalise.govpeeps.us&actors=majoritywhip.govpeeps.us&actors=gopwhip.govpeeps.us&actors=housegop.govpeeps.us&actors=senatecloakroom.govpeeps.us&actors=housedailypress.govpeeps.us&actors=houseradiotv.govpeeps.us&actors=senateradiotv.govpeeps.us&actors=senjohnbarrasso.govpeeps.us&actors=repmikejohnson.govpeeps.us&actors=leaderjeffries.govpeeps.us&actors=senschumer.govpeeps.us&actors=senatedems.govpeeps.us&actors=housedemocrats.govpeeps.us&actors=gopleader.govpeeps.us&actors=senategop.govpeeps.us&actors=whitehouse.govpeeps.us` | 200 (1899 B) | `thirdparty/bsky_getProfiles_govpeeps.txt` |
| 357 | thirdparty / researcher | 22:20:57Z | `https://govpeeps.us/` | 200 (3222 B) | `thirdparty/govpeeps_home.txt` |
| 358 | thirdparty / researcher | 22:21:00Z | `https://govpeeps.us/robots.txt` | 404 (355 B) | `thirdparty/govpeeps_robots.txt` |
| 359 | thirdparty / researcher | 22:22:31Z | `https://factba.se/` | 301 (134 B) | `thirdparty/factba_se_root.txt` |
| 360 | thirdparty / researcher | 22:22:31Z | `https://rollcall.com/factbase/` | 200 (186254 B) | `thirdparty/rollcall_factbase_home.txt` |
| 361 | thirdparty / researcher | 22:23:07Z | `https://media-cdn.factba.se/rss/json/trump/calendar.json` | 200 (270498 B) | `thirdparty/factbase_trump_calendar.txt` |
| 362 | thirdparty / researcher | 22:23:08Z | `https://punchbowl.news/terms-of-service/` | 403 (5754 B) | `thirdparty/punchbowl_terms.txt` |
| 363 | thirdparty / researcher | 22:23:08Z | `https://rollcall.com/terms-of-use/` | 404 (149600 B) | `thirdparty/rollcall_terms.txt` |
| 364 | thirdparty / researcher | 22:24:43Z | `https://www.govinfo.gov/media/RULES.PDF` | 200 (129242 B) | `thirdparty/govinfo_crec_rules_pdf.txt` |
| 365 | thirdparty / researcher | 22:26:03Z | `https://thehill.com/robots.txt` | 200 (2218 B) | `thirdparty/thehill_robots.txt` |
| 366 | thirdparty / researcher | 22:26:06Z | `https://thehill.com/homenews/house/5718868-watch-live-hakeem-jeffries-news-conference/` | 403 (6518 B) | `thirdparty/thehill_watchlive_jeffries_5718868.txt` |
| 367 | thirdparty / researcher | 22:26:08Z | `https://thehill.com/video-clips/5967078-watch-live-mike-johnson-house-gop-press-conference-conservatives-standoff/` | 403 (6518 B) | `thirdparty/thehill_watchlive_housegop_5967078.txt` |
| 368 | thirdparty / researcher | 22:26:09Z | `https://www.pbs.org/robots.txt` | 200 (3502 B) | `thirdparty/pbs_robots.txt` |
| 369 | thirdparty / researcher | 22:26:11Z | `https://www.pbs.org/newshour/politics/watch-live-johnson-and-thune-hold-news-conference-as-shutdown-threatens-to-extend-over-the-weekend` | 200 (276655 B) | `thirdparty/pbs_watchlive_johnson_thune.txt` |
| 370 | thirdparty / researcher | 22:26:15Z | `https://www.pbs.org/newshour/feeds/rss/politics` | 200 (34996 B) | `thirdparty/pbs_newshour_politics_rss.txt` |
| 371 | thirdparty / researcher | 22:27:24Z | `https://archive.org/robots.txt` | 200 (238 B) | `thirdparty/archive_robots.txt` |
| 372 | thirdparty / researcher | 22:27:27Z | `https://archive.org/advancedsearch.php?q=identifier%3ACSPAN%2A_202609%2A+AND+title%3A%28%22press+conference%22+OR+%22news+conference%22+OR+stakeout+OR+%22remarks+to+reporters%22%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=date&fl%5B%5D=publicdate&rows=200&sort%5B%5D=identifier+asc&output=json` | 200 (35183 B) | `thirdparty/archive_tv_cspan_pressers_2026-09.txt` |
| 373 | thirdparty / researcher | 22:27:55Z | `https://archive.org/metadata/CSPAN_20260923_192000_House_Democratic_Leader_Jeffries_Holds_News_Conference` | 200 (100073 B) | `thirdparty/archive_meta_jeffries_20260923.txt` |
| 374 | thirdparty / researcher | 22:28:27Z | `https://archive.org/advancedsearch.php?q=identifier%3ACSPAN%2A+AND+date%3A%5B2026-06-01+TO+2026-10-02%5D+AND+title%3A%28%22Speaker+Johnson%22+OR+Jeffries+OR+Thune+OR+Schumer+OR+%22Republican+Leadership%22+OR+%22Democratic+Leadership%22+OR+Scalise%29+AND+description%3A%28LIVE%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&rows=300&sort%5B%5D=identifier+asc&output=json` | 200 (8443 B) | `thirdparty/archive_tv_leaders_live_2026-06_09.txt` |
| 375 | thirdparty / researcher | 22:28:57Z | `https://archive.org/advancedsearch.php?q=identifier%3A%28CSPAN%2A_20251002%2A+OR+CSPAN%2A_20251003%2A%29+AND+title%3A%28Jeffries+OR+Johnson+OR+Thune%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&rows=50&sort%5B%5D=identifier+asc&output=json` | 200 (20570 B) | `thirdparty/archive_tv_leaders_2025-10-02_03.txt` |
| 376 | thirdparty / researcher | 22:28:58Z | `https://www.pbs.org/newshour/politics/watch-live-jeffries-holds-news-conference-as-shutdown-stretches-into-2nd-day` | 200 (264872 B) | `thirdparty/pbs_watchlive_jeffries_shutdown_day2.txt` |
| 377 | thirdparty / researcher | 22:29:01Z | `https://www.pbs.org/newshour/live` | 200 (271736 B) | `thirdparty/pbs_newshour_live_hub.txt` |
| 378 | thirdparty / researcher | 22:29:35Z | `https://www.pbs.org/newshour/live/?date=2026-09-03` | 200 (251135 B) | `thirdparty/pbs_live_hub_2026-09-03.txt` |
| 379 | thirdparty / researcher | 22:29:39Z | `https://www.pbs.org/newshour/live/?date=2026-09-16` | 200 (255714 B) | `thirdparty/pbs_live_hub_2026-09-16.txt` |
| 380 | thirdparty / researcher | 22:29:42Z | `https://www.pbs.org/newshour/live/?date=2026-09-23` | 200 (252540 B) | `thirdparty/pbs_live_hub_2026-09-23.txt` |
| 381 | thirdparty / researcher | 22:29:45Z | `https://www.pbs.org/newshour/live/?date=2026-08-31` | 200 (254145 B) | `thirdparty/pbs_live_hub_2026-08-31.txt` |
| 382 | thirdparty / researcher | 22:30:08Z | `https://www.pbs.org/newshour/politics/watch-house-democrats-blasts-do-nothing-republican-majority-in-midterm-pitch-to-voters` | 200 (258632 B) | `thirdparty/pbs_watch_housedems_2026-09-16.txt` |
| 383 | thirdparty / researcher | 22:30:31Z | `https://www.pbs.org/about/about-pbs/terms-of-use/` | 200 (68579 B) | `thirdparty/pbs_terms_of_use.txt` |
| 384 | thirdparty / researcher | 22:31:29Z | `https://www.pbs.org/about/terms-use/` | 200 (68579 B) | `thirdparty/pbs_terms_use.txt` |
| 385 | thirdparty / researcher | 22:32:32Z | `https://www.pbs.org/newshour/feeds/rss/politics` | 200 (34996 B) | `thirdparty/pbs_newshour_politics_rss_conditional.txt` |
| 386 | thirdparty / researcher | 22:33:52Z | `https://archive.org/metadata/CSPAN_20260831_190800_House_Democratic_Leader_Jeffries_Holds_Press_Conference` | 200 (153044 B) | `thirdparty/archive_meta_jeffries_20260831.txt` |
| 387 | thirdparty / verifier | 22:39:54Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=hakeem-jeffries.bsky.social&limit=5` | 200 (2040 B) | `thirdparty/verifier/bsky_jeffries_feed5.txt` |
| 388 | thirdparty / verifier | 22:40:17Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Mike%20Johnson&limit=25` | 200 (3661 B) | `thirdparty/verifier/bsky_searchActors_Mike_Johnson.txt` |
| 389 | thirdparty / verifier | 22:40:25Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=John%20Thune&limit=25` | 200 (6030 B) | `thirdparty/verifier/bsky_searchActors_John_Thune.txt` |
| 390 | thirdparty / verifier | 22:40:34Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Tom%20Emmer&limit=25` | 200 (6568 B) | `thirdparty/verifier/bsky_searchActors_Emmer.txt` |
| 391 | thirdparty / verifier | 22:40:49Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=Barrasso&limit=25` | 200 (581 B) | `thirdparty/verifier/bsky_searchActors_Barrasso.txt` |
| 392 | thirdparty / verifier | 22:41:06Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=press%20conference&limit=5` | 403 (1335 B) | `thirdparty/verifier/bsky_searchPosts_retest.txt` |
| 393 | thirdparty / verifier | 22:41:18Z | `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=houserepublicans.bsky.social&limit=5` | 200 (2007 B) | `thirdparty/verifier/bsky_houserepublicans_feed5.txt` |
| 394 | thirdparty / verifier | 22:41:51Z | `https://www.pbs.org/newshour/feeds/rss/politics` | 200 (7807 B) | `thirdparty/verifier/pbs_rss.txt` |
| 395 | thirdparty / verifier | 22:42:18Z | `https://www.pbs.org/newshour/feeds/rss/politics` | 304 (0 B) | `thirdparty/verifier/pbs_rss_cond.txt` |
| 396 | thirdparty / verifier | 22:43:19Z | `https://www.pbs.org/newshour/live/?date=2026-09-16` | 301 (0 B) | `thirdparty/verifier/pbs_live_hub_2026-09-16.txt` |
| 397 | thirdparty / verifier | 22:43:33Z | `https://www.pbs.org/newshour/live/?date=2026-09-23` | 301 (0 B) | `thirdparty/verifier/pbs_live_hub_2026-09-23.txt` |
| 398 | thirdparty / verifier | 22:44:05Z | `https://www.pbs.org/newshour/live?date=2026-09-16` | 200 (79638 B) | `thirdparty/verifier/pbs_live_hub_2026-09-16b.txt` |
| 399 | thirdparty / verifier | 22:44:27Z | `https://www.pbs.org/newshour/live` | 200 (81776 B) | `thirdparty/verifier/pbs_live_hub_nodate.txt` |
| 400 | thirdparty / verifier | 22:44:36Z | `https://www.pbs.org/newshour/live?date=2026-08-31` | 200 (79339 B) | `thirdparty/verifier/pbs_live_hub_2026-08-31b.txt` |
| 401 | thirdparty / verifier | 22:45:19Z | `https://www.pbs.org/newshour/tag/hakeem-jeffries` | 200 (80757 B) | `thirdparty/verifier/pbs_tag_hakeem_jeffries.txt` |
| 402 | thirdparty / verifier | 22:45:28Z | `https://www.pbs.org/newshour/politics/watch-jeffries-calls-on-republicans-to-stay-in-washington-to-work-on-ai-safety` | 200 (82035 B) | `thirdparty/verifier/pbs_watch_jeffries_ai_safety.txt` |
| 403 | thirdparty / verifier | 22:46:38Z | `https://x.com/robots.txt` | 200 (997 B) | `thirdparty/verifier/x_robots.txt` |
| 404 | thirdparty / verifier | 22:46:52Z | `https://media-cdn.factba.se/rss/json/trump/calendar.json` | 200 (17689 B) | `thirdparty/verifier/factbase_calendar.txt` |
| 405 | thirdparty / verifier | 22:47:02Z | `https://thehill.com/homenews/house/5718868-watch-live-hakeem-jeffries-news-conference/` | 200 (63994 B) | `thirdparty/verifier/thehill_jeffries.txt` |
| 406 | thirdparty / verifier | 22:47:16Z | `https://www.pbs.org/about/terms-use/` | 301 (166 B) | `thirdparty/verifier/pbs_terms.txt` |
| 407 | thirdparty / verifier | 22:47:57Z | `https://thehill.com/robots.txt` | 200 (676 B) | `thirdparty/verifier/thehill_robots.txt` |
| 408 | thirdparty / verifier | 22:48:04Z | `https://thehill.com/homenews/house/feed/` | 200 (5896 B) | `thirdparty/verifier/thehill_feed_house.txt` |
| 409 | thirdparty / verifier | 22:48:27Z | `https://thehill.com/terms-of-use/` | 403 (6518 B) | `thirdparty/verifier/thehill_terms.txt` |
| 410 | thirdparty / verifier | 22:49:03Z | `https://www.nexstar.tv/terms-of-use/` | 200 (28751 B) | `thirdparty/verifier/nexstar_terms.txt` |
| 411 | thirdparty / verifier | 22:50:21Z | `https://www.pbs.org/about/about-pbs/terms-of-use/` | 200 (18899 B) | `thirdparty/verifier/pbs_terms_final.txt` |
| 412 | thirdparty / verifier | 22:52:18Z | `https://www.pbs.org/newshour/feeds/rss/politics` | 200 (7800 B) | `thirdparty/verifier/pbs_rss_cond2.txt` |
| 413 | thirdparty / verifier | 22:52:59Z | `https://www.pbs.org/robots.txt` | 200 (1147 B) | `thirdparty/verifier/pbs_robots.txt` |
| 414 | thirdparty / verifier | 22:54:01Z | `https://archive.org/metadata/CSPAN_20260923_192000_House_Democratic_Leader_Jeffries_Holds_News_Conference` | 200 (16380 B) | `thirdparty/verifier/archive_meta_jeffries_20260923.txt` |
| 415 | thirdparty / verifier | 22:54:38Z | `https://archive.org/advancedsearch.php?q=identifier%3A%28CSPAN*_202609*%29+AND+title%3A%28Johnson%29&fl%5B%5D=identifier&fl%5B%5D=description&rows=100&output=json` | 200 (8519 B) | `thirdparty/verifier/archive_search_johnson_2026-09.txt` |
| 416 | thirdparty / verifier | 22:56:31Z | `https://www.rev.com/robots.txt` | 200 | `thirdparty/verifier/rev_robots.txt` |
| 417 | thirdparty / verifier | 22:56:50Z | `https://www.rev.com/transcripts/mike-johnson-fireside-chat` | 200 | `thirdparty/verifier/rev_transcript_johnson_fireside.txt` |
| 418 | thirdparty / verifier | 22:58:16Z | `https://www.rev.com/legal/terms-of-service` | 404 (29114 B) | `thirdparty/verifier/rev_terms.txt` |
| 419 | thirdparty / verifier | 22:58:51Z | `https://www.rev.com/legal/terms` | 200 (42588 B) | `thirdparty/verifier/rev_terms2.txt` |
| 420 | thirdparty / verifier | 22:59:46Z | `https://www.politico.com/robots.txt` | 403 (3209 B) | `thirdparty/verifier/politico_robots.txt` |
| 421 | thirdparty / verifier | 22:59:55Z | `https://punchbowl.news/terms-of-service/` | 200 (40173 B) | `thirdparty/verifier/punchbowl_terms.txt` |
| 422 | thirdparty / verifier | 23:00:06Z | `https://factba.se/` | 301 (134 B) | `thirdparty/verifier/factba_se_root.txt` |
| 423 | thirdparty / verifier | 23:00:31Z | `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=johnthune.bsky.social` | 200 (330 B) | `thirdparty/verifier/bsky_profile_johnthune.txt` |

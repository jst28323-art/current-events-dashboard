# Live video, audio, captions and transcripts

Research dimension: **LIVE MEDIA + TRANSCRIPTS** (features F1 Senate floor live, F2 House floor live, F3 press
conferences/briefings, F4 President/cabinet/exec officials speaking, F8 who is speaking now).

- Date of research: 2026-10-02 (Friday). All probes were run between 15:30Z and 17:30Z that day.
- Probe client: `curl` with UA `current-events-dashboard-research/0.1 (jst28323@gmail.com)`, `--max-time 20`.
- Evidence labels used below:
  - **LIVE-PROBED**: I fetched it today and saw the bytes quoted.
  - **DOC**: read from the provider's own documentation or pricing page today.
  - **SEARCH**: from a web-search summary only (secondary; treat as weaker).
  - **UNVERIFIED**: could not confirm; the reason is given.
- Important context for every latency claim: **Congress is in recess until after the election.** Both chambers are
  holding only pro forma sessions (Senate: Oct 5 4:00 pm, Oct 6, 9, 13, 15, 19, 22, 26, 29, Nov 2, Nov 5; returns for
  business **Mon Nov 9, 3:00 pm**; House next meets **Mon Oct 5, 4:30 pm**). Source: Senate Daily Press RSS item of
  2026-10-01 and House FloorCast `nextStartDate`. So nothing was live on the floor during this research. Archived
  copies of real session days (House 2026-09-16, Senate Judiciary hearing 2026-09-30) were used as stand-ins, and every
  "live latency" figure below is either an n=1 observation or an estimate that a first build session must measure.

---

## 1. Headline findings (read this first)

1. **Both floors already publish free, human-written live captions.** Self-transcription is NOT needed for F1/F2.
   - House: the Clerk's "House FloorCast" site (live.house.gov) is backed by a JSON API (undocumented, but public and
     unauthenticated) that serves the live caption transcript, floor actions, session days and the HLS + WebVTT URLs
     for each day's video. It supports ETag/304. Captions are written by human captioners (House says "a closed
     captioning vendor using manual captioners"). Every payload carries a public-domain notice (17 U.S.C. 105).
     [verifier 2026-10-02: corrected — only the `/floor/...`, `/latest/floor` and `/broadcastevents/...` payloads carry
     the `rights` notice; `/transcripts/...`, `/latest/transcript`, `/latest/transcriptUpdates`, `/latest/history`,
     `/sessiondays/` do not (grep of each saved payload). The "manual captioners" quote comes from a House Closed
     Captioning Sources Sought Notice dated 2020-12-30 (web search), not a 2026 page; the captions are vendor-produced.]
   - Senate: the floor stream (`stv`) and every committee stream are Akamai HLS with a **WebVTT subtitle rendition**
     declared in the master playlist. Senate captioners "write spoken words with speaker identification", and the
     committee captions I sampled do contain named speaker tags (`CHAIR GRASSLEY:`, `MR. RUDOFSKY:`).
2. **CORS:** the House and Senate media CDNs answer `Access-Control-Allow-Origin: *`, so a static GitHub Pages page
   can play the video and read the caption tracks directly in the browser (hls.js). The House FloorCast JSON API does
   NOT allow other origins (ACAO is pinned to `https://live.house.gov`), so it needs a server-side relay.
   [verifier 2026-10-02: confirmed for the media CDNs, but the discovery files a browser would also need send **no**
   ACAO header for a foreign Origin: `senate.gov/.../floor_schedule.json`, `dailypress.senate.gov/feed/`,
   `whitehouse.gov/live/`, YouTube RSS. The House day's HLS asset name (e.g. `2026-10-01T11-21-17`) is only
   discoverable from the CORS-blocked FloorCast `/broadcastevents/`, so even the "zero backend" House path needs a relay
   or a pointer file. See section 6.]
3. **Executive branch (F3/F4) is the real gap.** The White House stopped posting remarks transcripts (its `remarks`
   feed's newest item is the 2025-01-20 Inaugural Address). Live White House video is a YouTube embed. The YouTube
   Data API cannot download captions for videos you do not own (needs edit permission), and YouTube's Terms forbid
   automated access/downloading. So for live exec-branch transcripts the legitimate options are: show the embedded
   YouTube player with captions on (no text extraction), self-transcribe only from a non-YouTube public-domain source
   (e.g. DVIDS HLS for Department of War events, Senate/House HLS when officials testify), or link to after-the-fact
   transcripts (War Dept transcripts RSS, Roll Call Factba.se). [verifier 2026-10-02: omission — the official,
   public-domain post-hoc source for presidential remarks still exists: GovInfo's Daily Compilation of Presidential
   Documents RSS `https://www.govinfo.gov/rss/dcpd.xml` (200, 100 items, 47 of them remarks/exchanges). Lag is about a
   month: DCPD-202600562 (dateIssued 2026-08-27) was published 2026-09-30. See "Verifier additions".]
4. **C-SPAN is link-out only** for this project: their site sits behind an AWS WAF bot challenge
   (`x-amzn-waf-action: challenge`), no official public API was found, and their policy bars unlicensed live
   retransmission of C-SPAN-produced coverage. [verifier 2026-10-02: the WAF challenge is intermittent, not
   absolute: my first three requests (`/`, `/networks/?channel=c-span`, `/about/copyrightsAndLicensing/`) returned 200,
   then `/about/tveverywhere/` and `/about/faq/` returned `202` + `x-amzn-waf-action: challenge` with an empty body.
   Conclusion unchanged: do not build on scraping it.] Floor video itself is public domain and comes straight from the
   chambers' own CDNs (finding 2), so C-SPAN is not needed for F1/F2.
5. **Local ASR is feasible on the owner's hardware.** I measured faster-whisper on a real 10-minute House floor clip:
   approx. 6-8% word disagreement against the Clerk's human captions; CPU `small.en` int8 ran at 14.5x real time on
   the owner's desktop CPU. The GPU path (RTX 5080) ran unexpectedly slowly in this quick Windows test (GPU mostly
   idle). That is a setup problem to fix, not a ceiling (details in section 5.3).
6. **Oracle Cloud Always Free got smaller.** It is now **1,500 OCPU-hours + 9,000 GB-hours per month = 2 OCPU / 12 GB**
   Ampere A1 (doc last modified 2026-06-12), not the 4 OCPU / 24 GB many guides still quote.
7. **Paid streaming ASR is cheap if ever needed:** AssemblyAI Universal-Streaming **$0.15/hour**, Deepgram Nova-3
   streaming **$0.0048/min promo ($0.0077 regular)**, AWS Transcribe streaming **$0.01/min**, OpenAI
   `gpt-live-transcribe` **$0.017/min** (all DOC, 2026-10-02). Two chambers at 8-12 h/day for 30 days would cost about
   $72-108/month on AssemblyAI. But the floors don't need it (finding 1).

---

## 2. Source-by-source detail

### 2.1 House floor: Clerk "House FloorCast" (live.house.gov) (F2, F5-context, F8-partial)

**Player technology (LIVE-PROBED).** `https://live.house.gov/` loads `vendor/bitmovin/bitmovinplayer.js` and an app
bundle `js/app.9d37cb71.js` (691,919 bytes). The bundle's config block (verbatim keys):

```
floorcast.config = { clerkSiteUrl:"https://clerk.house.gov",
  api:{ base:"https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net",
    routes:{ floor:"/floor/", votes:"/votes/", bills:"/bills", billActions:"/billActions/",
      committeeMeetings:"/committeemeetings/", dailySchedule:"/dailyschedule/", billsThisWeek:"/billsthisweek/",
      introduced:"/introduced/", reported:"/reported/", passed:"/passed/", presented:"/presented/", enacted:"/enacted/",
      sessions:"/sessiondays/", transcript:"/transcripts/", transcriptFile:"/transcriptfiles/",
      streamingUrl:"/streamingUrl", broadcastEvents:"/broadcastevents", members:"/latest/memberDetails/",
      memberNameExceptions:"/latest/memberNameExceptions", floorUpdates:"/latest/floor", voteUpdates:"/latest/votes",
      billUpdates:"/latest/bills", billActionUpdates:"/latest/billActions", latestMeetings:"/latest/committeemeetings",
      latestBillsThisWeek:"/latest/billsthisweek", latestSchedule:"/latest/dailyschedule",
      latestTranscript:"/latest/transcript", transcriptUpdates:"/latest/transcriptUpdates", history:"/latest/history" } },
  ... hoursPriorToSession:2, hourToSwitchSession:10, ... }
```

The site's own "socketController" is actually a **poll of `/latest/history` every 30 s** (`setTimeout(h,3e4)`); when a
`last*Update` timestamp changes it fetches the matching `/latest/...` delta (e.g. `/latest/transcriptUpdates?timespan=
<last timestamp>&count=<n>`) and fires UI events such as `captionUpdate`, `newSpeakers`, `newVote`, `newActivity`.

**Endpoints I confirmed (LIVE-PROBED 2026-10-02):**

| Endpoint (base = `https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net`) | Result | Sample of real fields |
|---|---|---|
| `GET /latest/history` | 200, 352 B, `ETag: W/"160-+GZ7SDztnmnmevomcLRjQBJwXzk"`; re-request with `If-None-Match` returned **304** | `{"lastActivityUpdate":"2026-10-01T15:55:27.971Z","lastTranscriptUpdate":"2026-10-01T15:34:12.769Z","lastVoteUpdate":"2026-10-01T13:30:12.231Z",...,"inSession":false}` |
| `GET /latest/floor` | 200, 4,091 B | `"_id":"20261001","name":"LEGISLATIVE DAY OF OCTOBER  1, 2026","rights":"Pursuant to Title 17 Section 105 of the United States Code, this file is not subject to copyright protection and is in the public domain.","nextStartDate":"2026-10-05T16:30:00.000","subEvent":[{"uniqueId":"45150","updateDateTime":"2026-10-01T11:54:00.000","actionId":"H61000","actionTime":"2026-10-01T11:33:10.000","description":"The Speaker announced that the House do now adjourn ..."}]` |
| `GET /floor/2026-09-16` (dashed date; `/floor/20260916` silently returns the latest day instead) | 200, 74,870 B, 170 actions | `{"updateDateTime":"2026-09-16T14:30:00.000","actionId":"H8D000","actionTime":"2026-09-16T14:30:16.000","legisNum":"S. 766","description":"DEBATE - The House proceeded with forty minutes of debate on S. 766 ..."}` |
| `GET /latest/transcript` | 200, 9 entries for the 2026-10-01 pro forma | `{"speaker":"UNIDENTIFIED SPEAKER","text":"PURSUANT TO CLAUSE 13 OF RULE ONE, THE HOUSE STANDS ADJOURNED UNTIL 4:30 P.M. ON MONDAY, OCTOBER 5TH, 2026.","timestamp":460.009,"offsettime":460.009}` |
| `GET /transcripts/2026-09-16` | 200, 715,888 B, **1,104 entries** (one per speaker turn) | `{"speaker":"UNIDENTIFIED SPEAKER","text":"THE SPEAKER'S ROOMS. WASHINGTON, D.C. SEPTEMBER 16TH, 2026. I HEREBY APPOINT THE HONORABLE DUSTY JOHNSON ...","timestamp":16.373,"offsettime":254.287}` |
| `GET /latest/transcriptUpdates?timespan=309.859&count=2` | 200 | `{"previousEntry":{"speaker":"UNIDENTIFIED SPEAKER","text":"WOULD YOU PRAY WITH ME? ..."}, ...}` (I saw `previousEntry`; the `newEntries` array key comes from the app bundle's parser) [verifier 2026-10-02: the response itself has both top-level keys, `previousEntry` and `newEntries` (2,608 B)] |
| `GET /broadcastevents/20261001` | 200 | `"isLiveBroadcast":"True","videoFormat":"AdaptiveBitrateStreaming","asset":{"name":"2026-10-01T11-21-17","files":[{"type":"HLS","url":"https://houseliveprod-f9h4cpb9dyb8gegg.a01.azurefd.net/east/2026-10-01T11-21-17/manifest.m3u8#s=261.505"},{"type":"DASH",...},{"type":"WebVTT","url":".../east/2026-10-01T11-21-17/captions.vtt"}, ...central mirror...]}` |
| `GET /sessiondays/` | 200, 128 days in 2026 | `{"_id":"20261001","startDate":"2026-10-01T11:30:00.000"}` |
| `GET /latest/votes` | 200, `[]` (no votes on a pro forma day) | n/a |
| `GET /votes/2026-09-16`, `/transcripts/20260917`, `/streamingUrl`, `/latest/dailyschedule` | 404 | route exists in the bundle but not with those params |

Notes:
- **Times are naive Eastern local time** (`"2026-10-01T11:33:10.000"`, no offset). `/latest/history` uses true UTC
  (`Z`). Normalize both.
- **CORS (LIVE-PROBED):** with `Origin: https://live.house.gov` the API returns
  `Access-Control-Allow-Origin: https://live.house.gov`; with `Origin: https://example.github.io` it returns **no**
  ACAO header. So a GitHub Pages browser client cannot call it directly. A server-side poller can (no auth, no key).
- **Status:** undocumented internal API of the Clerk's site (`X-Powered-By: Express` on Azure App Service). It can
  change without notice. The hostname itself looks like a deployment slot (`-prod-eastus2-003`). Mitigation: re-derive
  `api.base` from the current `live.house.gov/js/app.*.js` bundle on startup and alert if it changes.
- **Rate/etiquette:** no published limits. Mirror the site's own behaviour: poll `/latest/history` no faster than
  every 15-30 s with `If-None-Match`, and fetch deltas only when a timestamp moves.

**Speaker attribution (LIVE-PROBED, House):** all 1,104 transcript turns on 2026-09-16 have
`"speaker":"UNIDENTIFIED SPEAKER"`, and so do all 1,104 `UNIDENTIFIED SPEAKER:` tags in that day's WebVTT file. The
schema has a speaker field and the app has a `newSpeakers` event and a `memberNameExceptions` route, but the field is
not populated in practice. Turn boundaries are reliable, though, and the chair's recognition language is in the text.
Counts in the 2026-09-16 captions: `GENTLEMAN FROM` 417, `GENTLEWOMAN FROM` 15 (plus `GENTLELADY FROM`), `RECOGNIZED`
275, `THE YEAS AND NAYS` 27. Real example:

```
... I'M PLEASED TO YIELD ONE MINUTE TO THE GENTLELADY FROM MISSOURI. MY DEAR FRIEND MS. WAGNER.
UNIDENTIFIED SPEAKER: THE GENTLEWOMAN FROM MISSOURI, IS RECOGNIZED.
UNIDENTIFIED SPEAKER: MR. SPEAKER, I RISE IN STRONG SUPPORT OF ...
```

So a heuristic (chair turn: "THE GENTLE(MAN|WOMAN|LADY) FROM <STATE> IS RECOGNIZED", plus the previous turn's
"YIELD ... TO ... <MR./MS.> <SURNAME>") gives the next turn's speaker as (state, sex, surname). Matching that against the
member list resolves most turns. The Clerk floor actions give the measure under debate. This is an inference I have
not built or scored. It is a first-session task with an accuracy check.

**Freshness (LIVE-PROBED, limited):**
- Floor actions, 2026-09-16 (n=170): `updateDateTime - actionTime` median **0.0 min**, p90 **4.4 min**, max 544 min
  (one late edit). `updateDateTime` may be a last-edit time, so this is an approximation of publish lag.
  [verifier 2026-10-02: corrected — recomputed from a fresh `/floor/2026-09-16` (170 actions): median 0.02 min, p90
  3.6-4.3 min depending on percentile method (OK), but **7 actions lag more than 60 min** (239, 274, 274, 274, 543,
  543, 544 min), not "one late edit". Also 80 of 170 lags are **negative** (down to -0.83 min) because
  `updateDateTime` is truncated to the minute (e.g. `14:30:00.000` vs `actionTime 14:30:16`), so sub-minute lag
  cannot be measured from these fields.]
- Transcript, 2026-10-01 pro forma (n=1): the final caption ("...THE HOUSE STANDS ADJOURNED...", timestamp 460 s from
  the caption origin, which lines up with the 11:33:10 ET adjournment action) was followed by
  `lastTranscriptUpdate = 15:34:12.769Z`, i.e. the API had it **about 55-60 s after it was spoken** (upper bound;
  includes captioner lag). This needs real measurement on Oct 5 (see section 7, items 1-2).
  [verifier: UNVERIFIED as a point value — the inputs re-check (final entry `timestamp 460.009`, `offsettime
  460.009`; `lastTranscriptUpdate 2026-10-01T15:34:12.769Z`), but the spoken time depends on which clock origin is
  used. Against the 11:33:10 ET adjournment action the gap is about 63 s; using the asset start 11:21:17 plus the
  day's VTT offset 00:04:39.505 plus 460 s (11:33:36 ET) it is about 36 s. Treat it as "roughly 0.5-1 min, n=1".]

### 2.2 House floor media: HLS, DASH, WebVTT and in-band captions (F2)

LIVE-PROBED on the 2026-10-01 and 2026-09-16 assets:
- Master: `https://houseliveprod-f9h4cpb9dyb8gegg.a01.azurefd.net/east/<asset>/manifest.m3u8` (also `/central/`
  mirror; Azure Front Door, `X-Cache: CONFIG_NOCACHE`, **`Access-Control-Allow-Origin: *`**, `ETag`/`Last-Modified`
  present). Five H.264 renditions from 426x240 @ 273 kbps to 1280x720 @ 3.1 Mbps, plus a **separate audio-only
  rendition** `audio_0.m3u8` (AAC 128 kbps, fMP4 `aac/128000/segment_N.m4s`, **2.0 s segments**). That audio-only
  playlist is the ideal ASR input (about 32 KB per 2 s).
- No `CLOSED-CAPTIONS=` attribute is declared in the master. But the H.264 video segments **do carry in-band
  CEA-608/708 caption user data**: a 2 s 360p segment (`h264/365000/segment_199.m4s`, 81,115 B) contained the ATSC
  `GA94` SEI marker **60 times (one per frame at 30 fps)**. I did not decode the caption bytes (no ffprobe on this
  box). hls.js parses CEA-608/708 by default (`enableCEA708Captions: true`), and Safari/iOS native HLS exposes them as
  a text track. [verifier 2026-10-02: GA94 x60 re-confirmed on the 2026-10-01 segment (81,115 B) and on the
  2026-09-16 segment_199 (99,529 B); hls.js v1.7.3 `docs/API.md` confirms `enableCEA708Captions` default `true`. The
  Safari/iOS claim is UNVERIFIED — not tested, and the master declares no `CLOSED-CAPTIONS` attribute.]
- Sidecar **`captions.vtt`** (one file per day): it starts with `NOTE CAPTIONS TIME OFFSET: 00:04:39.505` [verifier
  2026-10-02: corrected — that offset is the 2026-10-01 file's; the 2026-09-16 file starts with
  `NOTE CAPTIONS TIME OFFSET: 00:03:57.914`, which equals that day's `offsettime - timestamp` (254.287 - 16.373). The
  offset varies per day, so parse it from each file], has
  `UNIDENTIFIED SPEAKER:` turn tags, ALL CAPS text, and the 2026-09-16 file is 1,387,758 B with 21,987 cues covering
  13 h of session. The VOD playlist is `#EXT-X-PLAYLIST-TYPE:VOD` with `#EXT-X-ENDLIST`. For 2026-10-01, the m3u8
  `Last-Modified` was 15:57:26Z and captions.vtt was 15:55:53Z, about 22 min after adjournment. So the finalized VOD
  appears within about 20-25 min. Whether captions.vtt is updated incrementally *during* a live session is UNVERIFIED
  (nothing was live).
- Archive depth: `/sessiondays/` lists all 128 2026 session days, and `/broadcastevents/<date>` returns HLS + VTT for
  each (checked 2026-09-01 through 2026-10-01). The Clerk also mirrors to YouTube (`US House Clerk`, channel
  `UCqU8qiVHYmLsF0JIMByCTvw`; RSS shows "US House Floor Proceedings (Thursday, October 1, 2026)" published
  2026-10-02T03:58Z).
- Copyright/terms: public domain per the payload's `rights` field. House Rule V says floor coverage may not be used for
  partisan political campaign purposes or in commercial advertisements (SEARCH summary of Rule V, consistent with CRS
  R44665 quoted via everycrsreport.com: "Audio and video recordings can only be used for educational or informational
  purposes and not for any partisan campaign purposes"). A personal, non-commercial tracker is fine. Do not put ads on
  floor video. [verifier 2026-10-02: confirmed in substance from the official House Manual text of Rule V cl. 2(c)
  (govinfo HMAN-107, 107th Congress): coverage "(1) may not be used for any political purpose; (2) may not be used in
  any commercial advertisement; and (3) may not be broadcast with commercial sponsorship except as part of a bona fide
  news program or public affairs documentary program." Current-Congress wording ("partisan political campaign
  purpose") is from a search summary only. Clause (3) also matters if the site is ever sponsored.]

### 2.3 Senate floor and committee webcasts (F1, F8, committee part of F11)

**How today's floor stream is announced (LIVE-PROBED).**
`GET https://www.senate.gov/legislative/schedule/floor_schedule.json` returned 200, 974 B,
`ETag: "3ce-65cc8581e0de8"`, `Last-Modified: Thu, 01 Oct 2026 14:36:41 GMT`:

```
{ "floorProceedings": [ { "coveneOffsetMinutes": "15", "conveneYear": "2026", "conveneMonth": "10", "conveneDay": "05",
  "conveneHour": "16", "conveneMinutes": "00",
  "convenedSessionStream": "https://www.senate.gov/isvp/stv.html?type=live&comm=stv&filename=stv100526",
  "lastUpdated": "2026-10-01T09:34-05:00" } ] }
```

(Note the upstream typo `coveneOffsetMinutes`.) [verifier 2026-10-02: corrected for polling — the ETag is present,
but `If-None-Match: "3ce-65cc8581e0de8"` returned **200** (also with the gzip variant), while
`If-Modified-Since: Thu, 01 Oct 2026 14:36:41 GMT` returned **304**. Poll this file with If-Modified-Since, not
ETag. `dailypress.senate.gov/feed/` behaves the same way (INM 200, IMS 304).] The player page `isvp/stv.html`
(Bitmovin) builds the HLS URL as:

```
live:    https://www-senate-gov-media-srs.akamaized.net/hls/live/<streamID>/<comm>/<filename>/master.m3u8
archive: https://www-senate-gov-msl3archive.akamaized.net/<msl3>/<filename>_1/master.m3u8   (fallback on error 1208)
```

with `streamID` = `2096634` for the floor (`comm=stv`). Each committee has its own row in the page's `streamInfo`
table. Real values: judiciary `2036788`, finance `2036795`, foreign `2036794`, armed `2036800`, approps `2036802`,
banking `2036799`, commerce `2036779`, help `2036793`, govtaff `2036792`, intel `2036790`, budget `2036798`, energy
`2036797`, epw `2036783`, rules `2036787`, vetaff `2036785`, and others. Filenames follow `<comm>MMDDYY`
(e.g. `stv100126`, `judiciary093026`).

**Manifests and captions (LIVE-PROBED):**
- `.../2096634/stv/stv100126/master.m3u8` returned 200, `Access-Control-Allow-Origin: *`,
  `Cache-Control: max-age=0, no-cache, no-store`:
  ```
  #EXT-X-STREAM-INF:BANDWIDTH=712800,...,RESOLUTION=1280x720,FRAME-RATE=30.000,SUBTITLES="subs"
  master/index_1.m3u8
  #EXT-X-MEDIA:TYPE=SUBTITLES,NAME="English",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,LANGUAGE="eng",GROUP-ID="subs",URI="master/text_1.m3u8"
  ```
  So there is a **WebVTT subtitle rendition** on the floor stream. After the day ended, the floor variant playlists
  (`master/index_1.m3u8`, `master/text_1.m3u8`) returned **404** while the master stayed 200. The msl3 archive path
  also returned 404 for `stv100126_1`, `stv092926_1`, etc. senate.gov's floor page says "Past Floor Webcasts: View past
  floor proceedings on CSPAN". So **the Senate floor has no stable official archive URL that I could find. Capture
  captions live, or lose them.** [verifier 2026-10-02: confirmed — `stv100126` master 200 but both variants 404; msl3
  `stv/stv100126_1`, `stv092926_1`, `stv093026_1` all 404; the player's 4th fallback
  `ussenate-f.akamaihd.net/i/stv100126.mp4/master.m3u8` returned 400. Note the msl3 committee archive also 404s
  (`judiciary/judiciary093026_1`), yet the committee *live* path stayed a VOD. Liveness probe: a not-yet-live or
  nonexistent filename returns 404 for the master (`stv100526`, `stv123199` today), so polling the master works as
  an "is it up" check.]
- Committee example `.../2036788/judiciary/judiciary093026/master/text_1.m3u8`: 200, `#EXT-X-PLAYLIST-TYPE:VOD`,
  `#EXT-X-TARGETDURATION:12`, **662 segments of 12 s**, still available 2 days later. Sample segment
  `text_1_00201.vtt`:
  ```
  WEBVTT
  X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:183000

  00:40:00.000 --> 00:40:00.231
  WITH HIM WHEN I SERVED AS
  ATTORNEY GENERAL OF MISSOURI.
  HE SERVED FIRST IN MY
  ```
  These are **roll-up (608-style) cues re-emitted word by word**, so consecutive cues repeat the same lines. A
  de-duplicator is required (keep only the newly added words per cue). In 20 sampled segments the captions carry
  **speaker tags**: `CHAIR GRASSLEY:` and `MR. RUDOFSKY:` (the nominee). [verifier 2026-10-02: confirmed and
  broadened — 20 segments (00150-00340) gave `MR. RUDOFSKY:` 37, `SEN. KENNEDY:` 23, `SEN. DURBIN:` 15,
  `SEN. BLUMENTHAL:` 15, `CHAIR GRASSLEY:` 9. Seven more committee masters from Sept 23-30 (finance, foreign, help,
  govtaff, energy, epw, vetaff) all declare `SUBTITLES`; `text_1.m3u8` returned 200 for foreign093026 (405 segs),
  help093026 (144), govtaff093026 (728), with tags such as `SEN. KIM:` and `MR. KOKOTAJLO:`. Senators are tagged
  `SEN. <SURNAME>:`, so a speaker parser must handle that form too.] This is consistent with the Senate captioning
  job description: captioners "write spoken words with speaker identification ... transmitted instantaneously with no
  review" (SEARCH, senate.gov vacancy PDF).
- **No in-band 608** on the Senate side: a 12 s TS segment (`index_1_00200.ts`, 1,136,460 B) had **0** `GA94` markers,
  so the Senate captions exist only as the WebVTT subtitle rendition.
- Floor speaker tags: UNVERIFIED (no floor captions were retrievable today). They are expected to be similar
  (`THE PRESIDING OFFICER:` / `MR. <NAME>:`) based on the committee sample and the job description. Verify on the
  Oct 5 pro forma.
- Latency estimate (UNVERIFIED live): 12 s segments mean the subtitle playlist advances every 12 s. Add human
  captioner lag (a few seconds) and the client's playlist refresh, and the expected end-to-end delay is about
  **15-35 s** after speech. A server or browser only needs the `text_1.m3u8` playlist plus a few KB of VTT per 12 s,
  with **no video download.**
- Copyright: Senate floor proceedings are government-produced (Senate Recording Studio). S.Res.28 (1986) bars use of
  duplications for political campaign purposes (SEARCH). C-SPAN's policy also states floor video is public domain.
  [verifier: UNVERIFIED — that statement is not on the current c-span.org copyright page; see 2.5.]
  Non-commercial dashboard use is fine.
- Note: the iframe on `floor_activity_pail.htm` points to `https://floor.senate.gov/ViewPublisher.php?view_id=16`, but
  that host is **NXDOMAIN** (both Comcast DNS and 8.8.8.8). It is dead legacy markup. Use `floor_schedule.json`.

### 2.4 House committee hearings (committee part of F11, F3)

- The House Committee Repository event pages (e.g. `docs.house.gov/Committee/Calendar/ByEvent.aspx?EventID=119529`)
  contained **no video links** in the HTML I fetched (LIVE-PROBED). House committees mostly stream on their own YouTube
  channels or sites (CRS R44665, 2017: "frequently using YouTube embedding", via everycrsreport.com; not re-verified per
  committee in 2026).
- Consequence: House committee captions are YouTube's (usually auto-generated) captions. They can be shown in an
  embedded player but cannot be extracted via the official API (section 2.6). A committee-by-committee catalogue of
  stream sources is a follow-up task. Some committees may use non-YouTube HLS. UNVERIFIED.
  [verifier: UNVERIFIED — "usually auto-generated" is not established. On 2025-07-24 the Committee on House
  Administration announced a **House Committee Captioning Service "now available to every House committee"**
  (democrats-cha.house.gov press release, fetched 200). It is opt-in and framed as in-room captions ("so that everyone
  who attends a hearing can follow"). Whether its captions reach the committees' streams (YouTube or otherwise) is not
  known; check per committee in the catalogue task.]

### 2.5 C-SPAN (F1/F2/F3/F4 secondary; link-out only)

- `https://www.c-span.org/` returned 200 (99 KB) on the first request. Subsequent requests (`/networks/?channel=c-span`,
  `/about/copyrightsAndLicensing/`) returned **`HTTP/1.1 202` with `x-amzn-waf-action: challenge`** and an empty body
  (LIVE-PROBED). WebFetch got 403. Automated access is actively challenged, so do not build on scraping c-span.org.
- API: `https://api.c-span.org/` timed out and `/api/` is 404. I found no official public C-SPAN API in 2026. A "C-SPAN
  API" listed on parse.bot is a third-party scraper product, not C-SPAN. Avoid it (ToS and stability).
- Live access (SEARCH, c-span.org/about/tveverywhere): House, Senate, hearings, executive-branch events and
  Washington Journal stream live on c-span.org **without login**. The three linear channels need a TV-provider login.
- Copyright (SEARCH summaries of c-span.org/about/copyrightsAndLicensing; the page itself was WAF-blocked for me):
  "All uses of the video of the House and Senate floor proceedings are permitted because it is in the public domain".
  [verifier 2026-10-02: the page loaded for me (200, 41,645 B). The two quotes below are on it verbatim. The "All uses
  of the video of the House and Senate floor proceedings..." sentence is **not** on the current page (no "floor" or
  "All uses" in its text): UNVERIFIED. The page also says: "Individuals are permitted to use C-SPAN audio and video
  coverage of federal government events on a non-commercial public Internet site so long as C-SPAN is attributed as
  the source. No permission is required", and it lists "Events at the White House" among federal events. So posting
  *recordings* with a C-SPAN logo is allowed for non-commercial sites. The live-retransmission ban still applies.]
  For C-SPAN-produced coverage of other federal events, non-commercial posting of recordings with attribution is
  allowed. But "simultaneous streaming or retransmission ... live or recorded, may not be posted under any circumstances
  without a license", and unlicensed commercial use is not permitted.
- Transcripts: the Video Library uses closed captions for search and "does not provide copies of the transcripts"
  (SEARCH, c-span.org FAQ). Caption availability delay after airing: **UNVERIFIED** (site blocked automated checks).
- **Recommendation:** deep-link to C-SPAN event pages (a "Watch on C-SPAN" button) and never embed, restream or
  extract C-SPAN captions. Get floor video from the chambers' own CDNs instead.

### 2.6 White House live, YouTube, and executive-branch video (F3, F4)

**whitehouse.gov/live (LIVE-PROBED).** 200, 269,696 B, `cache-control: max-age=60`. The page is a "Live News"
two-panel layout: "CH 45 White House Live" (the official livestream "will appear here when a briefing or event is
underway") and "CH 47 Trump TV 24/7" (YouTube embed `A4gNgHfZ-v4`). The live state is **server-rendered JSON in an
attribute**:

```
data-live-duplex="{"live":{"on":false,"name":""},"replay":{"on":true,"name":""}}"
```

The bundle `wp-content/client-mu-plugins/live/blocks/live-duplex/view.js` (4,975 B) only drives YouTube iframes via
`postMessage`. There is no HLS URL and no JSON API. **A 60 s poll of this page with a parse of `live.on` + `live.name`
(+ the iframe video ID) is a cheap, official "the White House is live now" signal for F4.** The schema was observed
with `on:false` only, so the `on:true` shape is UNVERIFIED. [verifier 2026-10-02: corrected — the `on:true` shape
is now verified. Wayback raw snapshot `web.archive.org/web/20260930163607id_/https://www.whitehouse.gov/live/` (200)
has `{"live":{"on":true,"name":"Vice President JD Vance Delivers Remarks in Brownsville, TX"},"replay":{"on":true,"name":""}}`,
and the embed IDs are `A4gNgHfZ-v4` (the 24/7 loop) plus `LLh9sKf0L-w` (the live event). This matches
executive_branch.md section 2.2. Today's live page re-confirmed: 200, 269,696 B, `max-age=60`, `on:false`, no
`m3u8`. How fast the flag flips is still unmeasured.]

**White House feeds (LIVE-PROBED).**
- `https://www.whitehouse.gov/videos/feed/`: 30 items, newest "America.Gov Launch" 2026-10-02T01:20:38Z, then
  "President Trump Gaggles with Press at Dallas Fort Worth International Airport, Oct. 1, 2026" 2026-10-01T21:28:56Z.
  This mirrors the YouTube uploads (same titles and timestamps as the channel RSS).
- `https://www.whitehouse.gov/briefings-statements/feed/`: 30 items, `ETag`, `Last-Modified`, `max-age=300`.
  Titles are bill signings, messages and First Lady items. **0 press-briefing or remarks transcripts** among them.
  [verifier 2026-10-02: confirmed (30 items, 0 briefing/remarks titles). Polling note: the `videos`,
  `briefings-statements` and `presidential-actions` feeds all returned the **same** ETag
  `"1ae6d600bf48ffd0040961563c7b264d"` and `Last-Modified 16:19:11Z`, and that ETag gave 304 on both the remarks and
  videos feeds. The validator is site-wide, so any change anywhere on whitehouse.gov invalidates every feed. 304s
  will be rarer than per-feed validators would give.]
- `https://www.whitehouse.gov/remarks/feed/`: **1 item, "The Inaugural Address", 2025-01-20.** Remarks/briefing
  transcripts are not being published on whitehouse.gov.
- `https://www.whitehouse.gov/presidential-actions/feed/`: 30 items (F9, covered by another report).

**YouTube (DOC + LIVE-PROBED).**
- Channel IDs (from page `externalId`): White House `UCYxRlFDqcWM4y7FfpiAN3KQ`; US House Clerk `UCqU8qiVHYmLsF0JIMByCTvw`.
- Keyless RSS: `https://www.youtube.com/feeds/videos.xml?channel_id=<UC...>` (15 entries,
  `Cache-Control: public, max-age=900`). The **live-streams-only** playlist feed
  `...?playlist_id=UULV<rest of channel id>` also works (WH: 15 entries, newest "President Trump Participates in a Site
  Visit, Oct. 1, 2026"). Whether an *in-progress or upcoming* stream appears in RSS before it ends is UNVERIFIED (one
  third-party guide says no). Use RSS for "what aired", not for "live now".
- Data API (DOC, pages last updated 2026-09-14/15): `search.list` now has **its own bucket: default 100 calls/day, cost
  1 per call**. `eventType=live|upcoming|completed` requires `type=video`. All other methods share 10,000 units/day.
  `videos.list` (1 unit) returns `liveStreamingDetails` for known IDs.
- Captions: `captions.list` costs 50 units and `captions.download` 200 units, and the docs say **"This method requires
  the user to have permission to edit the video."** You cannot fetch captions (auto or manual) for the White House's
  videos through the official API.
- Terms of Service (DOC, youtube.com/t/terms, effective 2023-12-15): you may not "access the Service using any
  automated means (such as robots, botnets or scrapers)" except public search engines per robots.txt or with prior
  written permission, and may not download content unless expressly authorized. **Pulling WH YouTube audio with yt-dlp
  to transcribe it would violate YouTube's ToS** even though the content itself is a public-domain government work.
- ToS-compliant options for F4: (a) embed the YouTube player with `cc_load_policy=1`, so the viewer sees YouTube's
  live captions in the player; (b) detect "live now" via whitehouse.gov/live (60 s) plus Data API `search.list`
  (budget: 100/day, so about every 15 min for one channel, or triggered by the WH page flag); (c) for transcript text,
  use a public-domain non-YouTube copy of the same event if one exists (DVIDS, a chamber HLS feed, an agency HLS).
  Otherwise accept a post-hoc transcript (section 2.7). (d) Ask the White House for a direct feed or permission: out of
  scope.

**Other exec-branch video (LIVE-PROBED).**
- **DVIDS** (Department of War's public media hub): `https://www.dvidshub.net/webcast` lists "UPCOMING LIVE WEBCASTS"
  with times (e.g. "Oct 03 2026 3:50 PM EDT USS Ted Stevens Commissioning"; "Oct 12 2026 9:20 AM EDT 2026 AUSA Opening
  Ceremony"). Webcast pages expose CloudFront HLS URLs such as
  `https://d1b55jk78a7el0.cloudfront.net/out/v1/1d4a1a50b52b4333894d00ce0c4c7ca5/index.m3u8?start=...&end=...`. There is
  a JSON API at `api.dvidshub.net` (free registration and key; not tested). Most items are ceremonies, but Pentagon
  press briefings and SecWar remarks appear there too. This is a good legal ASR source for F4 (DoD/War) events. Caption
  tracks: UNVERIFIED. [verifier 2026-10-02: listing and HLS pattern confirmed (`/webcast` 200; "Oct 03 2026 3:50 PM
  EDT USS Ted Stevens Commissioning"; `/webcast/38407` embeds
  `d1b55jk78a7el0.cloudfront.net/.../index.m3u8?start=1791465300&end=1791475200`). The `start`/`end` epoch window is
  the event window (2026-10-08 13:15-16:00Z), and that URL returned **404** before the event, so it cannot be
  pre-tested. Omission: the API documents a **Live API**, `GET https://api.dvidshub.net/live/list?api_key=...`. Its
  doc example response has `begin`, `end`, `hls_url`, `url`, `title` per webcast and
  `Access-control-allow-origin: *`, with params `from_date`, `max_results` (1-50) and `hashtag`. Use that instead of
  scraping `/webcast`. A keyless call returns 403 `{"errors":["Bad Request - No API key was provided"]}`. Doc text:
  "Access to the API is currently open. To obtain an access key, please use the login/signup links". Rights
  (`/docs/copyright`): "All media on the site is produced by U.S. DoD or Federal Agency and is in the public domain
  unless other copyright status is indicated."]
- **War Department transcripts RSS (F3 text):**
  `https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=13&Site=945&max=10` (defense.gov now redirects to
  war.gov) returned "Transcript of Secretary Pete Hegseth Hosting Honor Cordon and Meeting ..." (2026-09-15). Speeches
  are `ContentType=11` ("Secretary of War Pete Hegseth's State of the Force Address (As Delivered)", 2026-09-30).
  ContentType=400 is contracts. Posting lag vs event: UNVERIFIED.
- **State Department** `https://www.state.gov/rss-feed/department-press-briefings/feed/`: **403** to curl (likely bot
  protection). UNVERIFIED. [verifier 2026-10-02: corrected — the 403 depends on the User-Agent. The plain research UA
  got 403, but `Mozilla/5.0 (compatible; current-events-dashboard-research/0.1; ...)` got 200 (CloudFront hit,
  `Last-Modified`, `max-age=600`, 10 items). The feed is **stale**, though: the newest item is dated 2025-11-10, and
  the newest actual "Department Press Briefing" is **August 12, 2025**. Not a live or recent source for F3.]

### 2.7 Senate/House text logs (substitutes when no transcript; F1, F2, F7, F8 context)

| Source | Access | What it gives | Freshness / evidence |
|---|---|---|---|
| House FloorCast `/latest/floor`, `/floor/<YYYY-MM-DD>` | JSON, no key, ETag | Timestamped floor actions incl. bill under debate, votes, adjournments | 2026-09-16: 170 actions, publish lag median 0 min, p90 4.4 min (LIVE-PROBED) [verifier 2026-10-02: 7 of 170 lagged more than 1 h; see the 2.1 correction] |
| House captions transcript `/latest/transcript` | JSON, no key | Human caption text per speaker turn | about 55-60 s after speech, n=1 (section 2.1) [verifier: UNVERIFIED point value; 36-63 s depending on clock origin] |
| Senate Daily Press floor log RSS `https://www.dailypress.senate.gov/feed/` | RSS 2.0, `ETag` + `Last-Modified` [verifier 2026-10-02: only If-Modified-Since yields 304; If-None-Match (plain or `-gzip` ETag) returns 200] | One post per day, **updated in place** through the day with time-stamped floor events and the next-day schedule | 3 items. "Thursday, October 1, 2026" (pubDate 04:07Z, `Last-Modified` 17:03:59Z) includes "10:30 a.m. The Senate convened for a pro forma session..." and the full pro forma calendar through Nov 9. In-session update cadence UNVERIFIED (recess). |
| Senate Democrats `https://www.democrats.senate.gov/floor` | HTML (+ "Floor Updates RSS Feed" link) [verifier 2026-10-02: corrected — that link, `/floor/feed`, returns `text/html` ("Floor Feed" page, 164 KB), not RSS. Only the site-wide `/feed` is XML. The 53-47 wrap-up quote is confirmed.] | Schedule and end-of-day "Wrap Up" with roll-call results ("...not agreed to: 53-47") | Wrap Up for 2026-09-30 posted 09.30 (LIVE-PROBED). Republican counterpart `republican.senate.gov/floor-updates/` returned 404. |
| Congressional Record (GovInfo CREC / Congress.gov) | API (covered by the Congress/GovInfo report) | Substantially verbatim text of floor debate | "usually available by 10:00 am" the next morning (SEARCH, congress.gov/help/congressional-record) |
| C-SPAN video library | link only | Video plus caption-search | WAF-blocked; delay UNVERIFIED |
| Roll Call Factba.se `https://rollcall.com/factbase/` | HTML; undocumented WordPress JSON `/wp-json/factbase/v1/search?...&format=json&person=trump` | Presidential remarks/interviews/gaggle transcripts and calendar | Index reports `records_total: 636789`. My test queries returned 0 matches (parameter names not figured out). `X-Robots-Tag: noindex`, `no-store`. ToS and latency UNVERIFIED. Link-out recommended. [verifier 2026-10-02: reproduced (0 matched, total 636789). The route index `/wp-json/factbase/v1` lists `/search`, `/calendar`, `/live`, `/twitter`, `/seating-chart`. `/live` returns the 6.9 MB "Factbase Transcripts" HTML page (a "protected post"), and `/calendar` returns an HTML month grid. The machine-readable calendar is `media-cdn.factba.se/rss/json/trump/calendar.json` (see executive_branch.md section 5.1).] |
| Rev.com transcripts | n/a | Third-party transcripts of political events | UNVERIFIED (not probed) |
| War Dept transcripts RSS | RSS | DoD/War briefings and remarks | see 2.6 |

---

## 3. Feature coverage map (F1, F2, F3, F4, F8)

| Feature | Best free source today | Transcript? | Speaker? | Expected delay | Confidence |
|---|---|---|---|---|---|
| F1 Senate floor live | `floor_schedule.json` + `stv` HLS **WebVTT subtitle rendition**; Senate Daily Press RSS for narrative | Yes, human captions | Yes (captioner tags; floor UNVERIFIED, committee verified) | about 15-35 s (estimate) | High for existence, medium for latency |
| F2 House floor live | FloorCast `/latest/transcript` via relay; or in-browser CEA-608 from HLS video [verifier 2026-10-02: the in-browser path still needs a server-published pointer to the day's asset URL, see section 6]; Clerk floor actions | Yes, human captions | Turns yes, names no (heuristic from recognition phrases) | API: about 1 min (n=1). In-browser 608: about 10-15 s (estimate) | High / medium |
| F3 press conferences & briefings | WH: YouTube embed + live flag; War Dept: DVIDS HLS + transcripts RSS; Congress leadership pressers: chamber/committee or party YouTube | Exec live text: **no legal free source**; post-hoc War Dept transcripts | Event title gives the principal | live video: seconds; text: hours (UNVERIFIED) | Medium |
| F4 President/cabinet speaking | whitehouse.gov/live `live.on` (60 s) + YouTube Data API `search.list` (100/day) + DVIDS schedule; Senate/House HLS when officials testify | Only via self-ASR on public-domain non-YouTube HLS, or embedded player captions | Title + diarization | detection 1-15 min; ASR text 10-20 s after audio | Medium-low |
| F8 who is speaking now (floors) | Senate caption tags; House recognition-phrase heuristic + Clerk floor actions | n/a | see left | same as captions | Medium (needs build plus accuracy test) |

---

## 4. Legal/ToS summary (non-commercial personal dashboard)

| Content | Status | What the dashboard may do |
|---|---|---|
| House floor video, captions, FloorCast data | Public domain (17 U.S.C. 105, stated in payload); House Rule V bars partisan campaign use and commercial ads | Embed/restream from House CDN, display captions, store transcripts. No ads, no campaign use. |
| Senate floor and committee video/captions | Government-produced; S.Res.28-era rules bar political campaign use (SEARCH) | Same as House |
| C-SPAN-produced coverage | Copyrighted; no unlicensed live retransmission; non-commercial recordings with attribution allowed (SEARCH) [verifier 2026-10-02: now DOC — quoted verbatim from the live copyrightsAndLicensing page, see 2.5] | Link out only. Do not scrape (WAF). |
| White House video on YouTube | Gov work, but **YouTube ToS** governs access | Embed the player (allowed). Do not download or scrape. Captions only as displayed in the player. |
| DVIDS | DoD public media (copyright page exists; most content public domain; UNVERIFIED per item) [verifier 2026-10-02: api.dvidshub.net/docs/copyright: "in the public domain unless other copyright status is indicated"; "may not be used to imply endorsement"] | Embed/restream/transcribe likely fine. Check per-item rights. |
| Factba.se / Rev | Private transcripts | Link out, or short quotes with attribution. No bulk copying. |

---

## 5. Self-transcription (ASR): models, measured speed, and where to run it

### 5.1 When ASR is actually needed
Not for the floors (human captions exist). It IS needed for: exec-branch events whose only free source is a
non-YouTube HLS (DVIDS, agency players), House committee hearings on non-YouTube players, and as a fallback if a
caption feed breaks.

### 5.2 Local open models (status October 2026)

| Model | License | Notes | Evidence |
|---|---|---|---|
| **NVIDIA Nemotron-3.5-ASR-Streaming-0.6B** | OpenMDW-1.1 (open weights, commercial OK) | Cache-aware FastConformer-RNNT built for streaming. Chunk 80 ms / 160 / 320 / 560 ms / 1.12 s. English FLEURS WER 9.43% @80 ms to 7.91% @1.12 s. Punctuation and capitalization. Turing listed as supported (fits the 2080 box). NeMo script `speech_to_text_cache_aware_streaming_infer.py`. | DOC (HF model card). Release month: NVIDIA/press say June 2026; the card's date string read as "June 4, 2024" (likely a summarizer error). UNVERIFIED. [verifier 2026-10-02: corrected — the raw README says "Hugging Face [06/04/2026]", and the HF API gives repo `createdAt 2026-05-15`. `license_name: openmdw-1.1`, chunks 80/160/320/560/1120 ms, English FLEURS 9.43 → 7.91, NVIDIA Turing and Volta under supported hardware: all confirmed. Omission: the model is **multilingual (40 locales)**, and its card says "We would recommend Nemotron ASR Streaming (English) model for English-only transcription use cases": `nvidia/nemotron-speech-streaming-en-0.6b` (NVIDIA Open Model License, HF release 03/13/2026). Benchmark both.] |
| **NVIDIA Parakeet-TDT-0.6B-v3** | CC-BY-4.0 | 25 European languages. Open ASR avg English WER 6.34%. RTFx 3,332 (A100 batch). Word timestamps, punctuation. Chunked streaming script. About 2 GB RAM to load. | DOC (HF card) [verifier 2026-10-02: CC-BY-4.0, 25 languages, 6.34%, "At least 2GB RAM", streaming script all confirmed in the raw README. "RTFx 3,332" does **not** appear in the v3 README text: UNVERIFIED (it may come from the Open ASR leaderboard or the v2 card).] |
| **Mistral Voxtral-Mini-4B-Realtime-2602** | Apache-2.0 | Natively streaming. Delay configurable 80 ms to 2.4 s, near batch accuracy at 480 ms+. Needs a bigger GPU (4B). | DOC (mistral.ai news, 2026-02-04) [verifier 2026-10-02: HF API confirms `mistralai/Voxtral-Mini-4B-Realtime-2602`, apache-2.0, 4,429,679,360 params. The blog says delay is "configurable down to sub-200ms", matches batch at 2.4 s, and stays "within 1-2% word error rate" at 480 ms; the exact 80 ms floor is not in the blog text. The blog also links a `Voxtral-Mini-3B-Realtime-2602` repo, which now 307-redirects.] |
| Kyutai STT (`stt-1b-en_fr` 0.5 s delay; `stt-2.6b-en` 2.5 s) | open weights | Streaming, batched serving | SEARCH [verifier: HF API shows both repos exist, license tag `cc-by-4.0`.] |
| faster-whisper 1.2.1 (CTranslate2 4.8.2) with Whisper `large-v3-turbo` / `small.en` | MIT | Chunked pseudo-streaming. Silero VAD built in. | LIVE-TESTED (below) |
| Diarization: `nvidia/diar_streaming_sortformer_4spk-v2` (CC-BY-4.0, streaming, max 4 speakers); pyannote.audio 4 "community-1" (clustering, no speaker cap) | open | Sortformer v2-stream 4-speaker DER 13.2% vs 21.3% for v1 (SEARCH, arXiv 2509.26177) | SEARCH |

### 5.3 Measured on the owner's machine (LIVE-TESTED 2026-10-02)

Setup: scratch venv, faster-whisper 1.2.1, ctranslate2 4.8.2, PyAV pinned `<16` (PyAV 16 breaks faster-whisper's
`decode_audio`: `open() got an unexpected keyword argument 'metadata_errors'`). Input: **600 s of real House floor
audio** (2026-09-16, `audio_0` segments 1800-2099 concatenated with `init.mp4`, AAC 128 kbps, debate on the Russia/Iran
sanctions bill). Reference: Clerk human-caption transcript entries in the same window (1,489 words). "WER" here means
word disagreement against the captions. The captions are not verbatim, and window edges are misaligned by a few
seconds, so treat these as rough agreement figures. Hardware: AMD Ryzen 9 9900X3D (12 cores / 24 threads),
NVIDIA GeForce RTX 5080 16 GB (compute capability 12.0, driver 595.95), Windows 11.

| Config | Mode | Wall time for 600 s | RTFx | Approx. WER vs captions | Notes |
|---|---|---|---|---|---|
| large-v3-turbo, CUDA fp16, VAD on | whole file, beam 1 | 88.6 s (cold) / 70.1 s (warm) | 6.8 / 8.6 | 6.4% | Model load 61-90 s |
| large-v3-turbo, CUDA int8_float16, VAD on | whole file | 97.6 s | 6.2 | 6.4% | `nvidia-smi` sampled every 2 s: GPU util 0% in most samples, max 54% |
| large-v3-turbo, CUDA fp16, VAD on | **5 s chunks** (pseudo-live) | 240.9 s | 2.5 | 9.5% | **per-chunk latency p50 2.04 s, max 5.49 s** |
| small.en, **CPU int8**, VAD on | whole file | 41.5 s | **14.5** | 8.0% | 24 threads |
| (more configs: see 5.3.1) | | | | | |

[verifier 2026-10-02: the CPU row **reproduced**. I re-ran the researcher's own `asr_bench.py` (same clip, same
reference, venv with faster-whisper 1.2.1 / ctranslate2 4.8.2 / av 15.1.0; the first two are still the latest on
PyPI, while PyPI's latest av is 19.0.0, so the "<16" pin claim was not re-tested)
with `small.en cpu int8` and got 41.0 s, RTFx 14.7, approx WER 0.080, 1,489 reference words. The
`large-v3-turbo` fp16 cold row matches the saved `bench_turbo_full.json` (load 90.2 s, proc 88.6 s, RTFx 6.8, WER
0.064). The other GPU rows were not re-run, to avoid loading the owner's main GPU. They rest on the researcher's
console output only. Method caveat: the reference window is selected by Clerk `offsettime` (3600-4200 s), which
lines up with stream time only via the per-day caption offset, so the WER figures are agreement estimates.]

Interpretation:
- Accuracy is good enough for a live "what is being said" pane (about 6-8% disagreement with human captions; many
  differences are caption paraphrase and edge misalignment).
- The GPU numbers are **far below what an RTX 5080 should do**. The GPU sat mostly idle, and 5.3.1 rules out VAD and
  model size, which leaves a fixed per-call overhead of about 2 s (likely CTranslate2 on Blackwell sm_120 under
  Windows). **Do not read them as a GPU ceiling.** A first ASR session should test NeMo Parakeet/Nemotron under WSL2 or
  Linux on the 2080 box. Even as measured, a 5 s chunk cost about 2 s, which fits a 10-30 s budget.
- CPU-only is viable: `small.en` int8 ran at 14.5x real time on 24 threads. Extrapolating linearly to an Oracle A1 VM
  with **2** Ampere cores gives very roughly 1-2x real time for `small.en`. That is borderline. `base.en`, or
  Parakeet/Nemotron via ONNX/sherpa-onnx on CPU, would be safer. This is an **UNVERIFIED extrapolation**. Benchmark
  on the actual VM before relying on it.

#### 5.3.1 Diagnostics
| Config | Mode | Wall time | RTFx | Approx. WER | Chunk latency |
|---|---|---|---|---|---|
| large-v3-turbo, CUDA fp16, **VAD off** | whole file | 93.4 s | 6.4 | 7.2% | n/a |
| **small.en**, CUDA fp16, VAD on | 5 s chunks | 241.5 s | 2.5 | 10.7% | **p50 2.02 s**, max 3.40 s |

Turning VAD off did not help. A model about 10x smaller (`small.en`) had the **same about 2.0 s per-chunk cost** as
`large-v3-turbo`. So the GPU path has a fixed per-call overhead of about 2 s that does not depend on model size. That
points to a configuration or toolchain issue (most likely CTranslate2 4.8.2 on Blackwell sm_120 under Windows: PTX JIT
or library setup per call), not to compute limits. The same `small.en` on CPU int8 (whole file) ran at 14.5x. Next
step for whoever owns ASR: retry under WSL2/Linux, or with NeMo (PyTorch) instead of CTranslate2, and on the 2080 box.
Scratch scripts were not committed: `asr_bench.py` lived in the session scratchpad, and the method is fully described
above.

### 5.4 Paid streaming ASR (DOC, official pricing pages, 2026-10-02)

| Provider / model | Streaming price | Add-ons / notes | 2 chambers x 8 h x 30 d (28,800 min) | 2 x 12 h x 30 d (43,200 min) |
|---|---|---|---|---|
| AssemblyAI Universal-Streaming (EN or multilingual) | **$0.15/h** ($0.0025/min), billed on WebSocket session duration [verifier: UNVERIFIED — the billing basis is not on the pricing page (it may be in the docs). The prices are confirmed] | diarization +$0.12/h; keyterms +$0.04/h (EN); $50 free credit; "Universal-3.6 Pro Realtime" $0.45/h [verifier 2026-10-02: confirmed; the free tier is worded as "up to 185 hours of pre-recorded transcription and up to 333 hours of streaming transcription" (333 h x $0.15 = $50). Free plan: 5 new streaming connections/min] | **$72** (+$58 diarization) | **$108** (+$86) |
| Deepgram Nova-3 (mono) | **$0.0048/min promo**, $0.0077 regular | diarization $0.0020/min; keyterm $0.0013/min; $200 free credit; 150 concurrent WSS | $138 promo / $222 regular | $207 / $333 |
| Deepgram Flux (EN) | $0.0065 promo / $0.0077 | turn-taking model for agents | $187 / $222 | $281 / $333 |
| Mistral Voxtral Realtime API | $0.006/min | open weights also available | $173 | $259 |
| AWS Transcribe streaming (us-east-1, tier 1) [verifier 2026-10-02: corrected — no tiers; AWS's pricing JSON lists "Streaming Stream to Text per second from 0 to Inf" at $0.0001667/s = $0.01/min flat, and batch "Audio to Text ... from 0 to Inf" $0.0001/s = $0.006/min flat; diarization is included ("This pricing includes ... speaker diarization")] | **$0.01/min** (batch $0.006) | 1-s billing increments; free tier 60 min/mo for 12 months | $288 | $432 |
| Google Cloud STT v2 "Standard" (0-500k min) | $0.016/min | dynamic batch $0.003/min (not live) | $461 | $691 |
| OpenAI `gpt-live-transcribe` / `gpt-realtime-whisper` | $0.017/min | file models: `gpt-4o-transcribe` $0.006, `gpt-transcribe` $0.0045, `gpt-4o-mini-transcribe` $0.003 | $490 | $734 |

Realistic exec-branch-only load (F3/F4): about 2 h/day = 3,600 min/month. That is **$9** on AssemblyAI, about $17 on
Deepgram promo, and $36 on AWS. Deepgram's $200 credit covers about 690 h at the promo rate, and AssemblyAI's $50 covers
about 333 h. Congress is in session on only about half the days, which halves the floor scenarios, but the floors
don't need ASR anyway.

---

## 6. Rough end-to-end design: "live transcript within about 10-30 s"

```
                 (A) official captions: no ASR                          (B) self-ASR: exec events / gaps
House:  FloorCast /latest/history (poll 15 s, If-None-Match)       DVIDS / agency / chamber HLS (public domain)
        -> /latest/transcriptUpdates delta                                 |
        and/or in-browser hls.js CEA-608 from 240p video                    v
Senate: floor_schedule.json -> stv master.m3u8 -> text_1.m3u8      ffmpeg or PyAV: audio-only rendition -> 16 kHz PCM
        (12 s WebVTT segments; dedupe roll-up)                       -> Silero VAD -> 2-5 s chunks
                 |                                                   -> Nemotron streaming / Parakeet / faster-whisper
                 v                                                   -> (optional) Sortformer diarization
        normalizer: sentences, speaker tags,                         -> same normalizer
        House recognition-phrase heuristic, member match                    |
                 \______________________________  ____________________________/
                                                \/
                    event store: append-only JSON lines per stream/day (id, t_spoken_est, t_published, speaker, text)
                                                |
                     publish: small JSON "tail" files on a CDN or realtime channel (architecture report decides)
                                                |
                    GitHub Pages client: polls tail every 5-10 s (or subscribes), renders transcript pane
```

Latency budget (estimates to measure, not observations):
- House via FloorCast API: captioner lag + Clerk batching (observed upper bound about 55-60 s, n=1) + our 15 s poll,
  so about 20-75 s. **Possibly above the 30 s target.** The in-browser CEA-608 path (2 s segments, about 3-segment
  live edge, plus captioner lag) should be about 10-15 s, but needs the browser to pull the 273 kbps video rendition.
- Senate via WebVTT rendition: about 15-35 s.
- Self-ASR: live edge (House audio 2 s segments: about 4-6 s; Senate 12 s TS: about 12-24 s) + chunk 5 s + inference
  (measured p50 2 s) + publish/poll 5-10 s, so about 15-30 s.

**Minimum infrastructure:**
1. **Tier 0, zero backend (works on GitHub Pages alone):** the browser itself reads the Senate `text_1.m3u8` captions
   and the House HLS 608 captions (both CDNs send `ACAO: *`). This gives a live transcript only while the page is open,
   with no history and no push alerts. It is a good first demo and is also mobile-friendly.
   [verifier 2026-10-02: corrected — "zero backend" holds for the **Senate only**. The stv URL is deterministic
   (`.../2096634/stv/stvMMDDYY/master.m3u8`; master 404 until it exists), so the browser can probe it without
   `floor_schedule.json` (which has no ACAO). The **House** asset path is a per-day start timestamp
   (`/east/2026-10-01T11-21-17/manifest.m3u8`) that is only listed by the CORS-blocked FloorCast `/broadcastevents/`.
   A House Tier 0 therefore needs a small pointer file published by something server-side (a relay, a Worker, or a
   scheduled job; discovery tolerates a few minutes of delay).]
2. **Tier 1, always-on poller/relay, no GPU:** a small process (Python or Node) that polls FloorCast + `floor_schedule.json`
   + the Senate subtitle playlist + whitehouse.gov/live + DVIDS, normalizes everything, and publishes the event store.
   CPU and RAM needs are tiny. Host options: the owner's spare RTX 2080 box (free, already owned); Oracle Always Free A1
   (now **2 OCPU / 12 GB**, 10 TB/month egress, but instances are **reclaimed if CPU p95 < 20%, network < 20% and
   memory < 20% over 7 days**, which a light poller would trip, so it is fragile); or a small paid VPS (a few $/month;
   prices not verified today). GitHub Actions cron is unsuitable for 10-30 s freshness (minimum schedule interval and
   queueing delays; not re-verified in this pass). Use it for daily/batch jobs. [verifier 2026-10-02: confirmed from
   GitHub docs ("events that trigger workflows"): "The shortest interval you can run scheduled workflows is once every
   5 minutes". The schedule event "can be delayed during periods of high loads", "some queued jobs may be dropped",
   and in public repos scheduled workflows "are automatically disabled when no repository activity has occurred in 60
   days". Oracle A1 figures (1,500 OCPU-h + 9,000 GB-h = 2 OCPU/12 GB; reclaim rule; 10 TB egress) are confirmed
   verbatim on docs.oracle.com (`cpp-last-modified-time 2026-06-12`).]
3. **Tier 2, ASR worker:** the spare **RTX 2080 box** (Turing is listed as supported by Nemotron-3.5 and Parakeet
   cards) running ffmpeg + streaming ASR for the few exec events that have a legal HLS source. It publishes outbound
   only (no inbound ports or tunnels needed). The RTX 5080 desktop is the fallback, but it is the owner's main machine
   and also runs the owner's other GPU projects.

---

## 7. Ranked recommendations (what the first build sessions should do)

1. **Build the Senate caption reader first (F1, F8).** Poll `floor_schedule.json` (ETag) [verifier 2026-10-02:
   corrected — use If-Modified-Since; this server ignores If-None-Match, see 2.3], build the `stv` HLS URL,
   follow `master/text_1.m3u8`, de-duplicate roll-up cues, split on `NAME:` speaker tags. Develop against the archived
   **committee** VTT (`judiciary093026`, 662 segments, still online) as a fixture. **Save fixtures to the repo now**,
   because Senate floor variants 404 after the day ends. Smoke test live on **Mon Oct 5, 4:00 pm ET** (pro forma).
2. **Build the House FloorCast relay (F2, F5/F8 context).** Poll `/latest/history` every 15 s with `If-None-Match`;
   fetch `/latest/transcriptUpdates`, `/latest/floor`, `/latest/votes` deltas. Fixtures: `/transcripts/2026-09-16` (1,104
   turns), `/floor/2026-09-16` (170 actions), `captions.vtt` for 2026-09-16. Smoke test live **Mon Oct 5, 4:30 pm ET**.
   Measure caption delay (speech time via HLS program time vs `lastTranscriptUpdate`).
3. **Prototype the Tier-0 in-browser player** (hls.js 1.7.3, `renderTextTracksNatively:false` + `CUES_PARSED` to build
   a transcript pane) for both chambers. This proves "free webpage, live transcript, from anywhere" with no server.
   [verifier 2026-10-02: corrected — the House half needs a server-published pointer to the day's asset URL. See
   the section 6 Tier 0 note.]
4. **House speaker heuristic (F8):** recognition-phrase parser plus a member table (another report covers member data),
   scored against a hand-labelled 30-minute slice of 2026-09-16 before it goes in the UI.
5. **Exec-branch "live now" detector (F4):** whitehouse.gov/live `data-live-duplex` every 60 s, plus the YouTube
   `UULV` RSS for history, plus `search.list` (at most 100/day) for confirmation; DVIDS upcoming list for War Dept
   events. UI: embedded YouTube player with captions on. No text extraction from YouTube.
6. **ASR worker (later; only after 1-5 work):** set up NeMo Nemotron-3.5-ASR-streaming or Parakeet on the 2080 box
   (Linux/WSL2). Before relying on it, pre-register an acceptance bar (e.g. RTFx >= 5 streaming, chunk p95 < 3 s,
   WER vs captions < 12% on the 2026-09-16 clip). First target: DVIDS/War Dept briefings. [verifier 2026-10-02: add
   the English-only `nvidia/nemotron-speech-streaming-en-0.6b` to the candidates, since NVIDIA recommends it for
   English. Use the DVIDS Live API (`/live/list`, `hls_url`) to find the source streams.]
7. **Text fallbacks:** Senate Daily Press RSS (narrative log), War Dept transcripts RSS (`ContentType=13`), next-morning
   Congressional Record (another report). Link out to C-SPAN, Factba.se and Rev.

---

## 8. Gaps (no good free source)

- **Live text of White House briefings, presidential remarks and cabinet appearances** (F3/F4). The only official live
  source is YouTube (no caption API for non-owners; ToS bars downloading), and whitehouse.gov no longer posts remarks
  transcripts. Free legal paths: embedded player captions (display only) and post-hoc third-party transcripts.
  [verifier 2026-10-02: add the official post-hoc path, GovInfo DCPD (`govinfo.gov/rss/dcpd.xml`), which is public
  domain with roughly a 1-month lag. The State Dept briefing feed is stale (newest briefing 2025-08-12).]
- **House floor speaker names** (F8): not populated in the official data; heuristic only.
- **Senate floor archive:** no stable official VOD URL found after the day ends (masters persist, variants 404). Capture
  live or link to C-SPAN.
- **House committee hearings:** mostly YouTube, so the same caption limitation as the White House. Per-committee survey
  not done.
- **C-SPAN-only events** (some think-tank or campaign appearances by officials): link-out only.
- **Live latency numbers:** none could be measured during recess. All figures are estimates or n=1.

## 9. Risks

- **Undocumented House FloorCast API** (Azure App Service slot hostname, routes found in a minified bundle). It could
  change or be locked down without notice. Mitigate: bundle-based base-URL discovery, contract tests against saved
  fixtures, and fall back to in-band 608 / captions.vtt.
- **Senate URL pattern is client-side JavaScript convention** (`streamInfo` table, `<comm>MMDDYY` filenames). It could
  change. Mitigate: re-parse `isvp/stv.html` daily and alert on diff.
- **Election-season recess**: the first build weeks have only minutes-long pro forma sessions to test against.
  Development must be fixture-driven, and real load testing waits for Nov 9 (Senate) and the House's return.
- **Oracle free tier shrinkage and idle reclamation**: it is already half of what guides say, and a light poller looks
  "idle".
- **ToS drift**: YouTube quotas changed in 2026 (`search.list` bucket). C-SPAN WAF could extend to link previews.
- **Caption quality**: human real-time captions are unreviewed ("no review ... once released"). Names and numbers can
  be wrong. Label the pane "live captions (unofficial)" and link to the Congressional Record.
- **Measured ASR GPU performance anomaly** on the RTX 5080 (Windows + CTranslate2): unresolved. Do not size hardware
  from it.
- **Political-use restrictions** (House Rule V, Senate rules): fine for a personal tracker, but they would matter if the
  site ever ran ads or carried campaign content.

## 10. Questions only the owner can answer

1. Is the **spare RTX 2080 box** available to run 24/7 as the always-on poller/ASR worker (power, network, OS:
   Linux/WSL2 OK?), or should the always-on part live in the cloud?
2. For White House/cabinet events, is **"embedded YouTube player with its own captions + a link to a transcript later"**
   acceptable for v1, given that extracting YouTube captions or audio violates YouTube's ToS?
3. Budget: would you pay roughly **$10-20/month** for a hosted streaming ASR (AssemblyAI/Deepgram) for exec-branch
   events, or should ASR stay local and free?
4. Should the dashboard keep a **permanent archive** of floor transcripts (needed for the Senate, whose official
   variants disappear), or only show the live day?
5. Is it acceptable for the first sessions to be **fixture-driven** (recorded September sessions), with live smoke tests
   only at the short pro forma sessions until Congress returns Nov 9?

---

## Evidence log (raw)

| # | Probe (2026-10-02 UTC) | Result |
|---|---|---|
| E1 | `curl https://live.house.gov/` | 200, 14,545 B, Bitmovin player, app bundle `js/app.9d37cb71.js` (691,919 B) |
| E2 | `curl https://houselive.gov/` and `www.` | connection timed out after 20 s from this network; live.house.gov is the current site (HTTP 200) |
| E3 | FloorCast `/latest/history` | 200 + ETag; `If-None-Match` gave 304; `inSession:false`; lastTranscriptUpdate 2026-10-01T15:34:12.769Z |
| E4 | FloorCast CORS with foreign Origin | no ACAO header (blocked for browsers) |
| E5 | `/broadcastevents/20261001` | HLS/DASH/WebVTT URLs on `houseliveprod-f9h4cpb9dyb8gegg.a01.azurefd.net` |
| E6 | House `manifest.m3u8` | 200, ACAO `*`, 5 video renditions + `audio_0.m3u8`; no CLOSED-CAPTIONS attr |
| E7 | House `h264/365000/segment_199.m4s` | 81,115 B, `GA94` x60 (in-band 608/708 present) |
| E8 | House `captions.vtt` 2026-09-16 | 1,387,758 B, 21,987 cues, 1,104 `UNIDENTIFIED SPEAKER` tags |
| E9 | `/transcripts/2026-09-16`, `/floor/2026-09-16` | 1,104 turns; 170 actions, lag median 0 / p90 4.4 min |
| E10 | `senate.gov/legislative/schedule/floor_schedule.json` | 200, ETag, next convene 2026-10-05 16:00, stream `stv100526` |
| E11 | `.../hls/live/2096634/stv/stv100126/master.m3u8` | 200, ACAO `*`, SUBTITLES group `text_1.m3u8`; variants 404 after the day |
| E12 | `.../2036788/judiciary/judiciary093026/master/text_1.m3u8` | 200, VOD, 662 x 12 s WebVTT; speaker tags `CHAIR GRASSLEY:` |
| E13 | Senate TS segment `index_1_00200.ts` | 1,136,460 B, `GA94` x0 |
| E14 | msl3 archive `.../stv/stv100126_1/master.m3u8` (and other dates) | 404 |
| E15 | `floor.senate.gov` | NXDOMAIN |
| E16 | c-span.org (2nd+ request) | 202 `x-amzn-waf-action: challenge`, empty body; api.c-span.org timeout |
| E17 | whitehouse.gov/live | 200, max-age=60, `data-live-duplex` `{"live":{"on":false...}}`; YouTube embeds only |
| E18 | whitehouse.gov `remarks/feed/` | 1 item (2025-01-20); `briefings-statements/feed/` 30 items, 0 briefings |
| E19 | YouTube RSS (channel + `UULV` playlist) | 200, 15 entries each, max-age=900 |
| E20 | YouTube Data API docs | `search.list` 100/day bucket, 1 unit; `captions.download` needs edit permission, 200 units |
| E21 | DVIDS `/webcast` | upcoming list with ET times; CloudFront HLS URLs in pages |
| E22 | war.gov RSS ContentType=13 | transcripts feed live (newest 2026-09-15) |
| E23 | dailypress.senate.gov/feed/ | 3 items, ETag/Last-Modified, recess calendar through Nov 9 |
| E24 | Oracle Always Free doc | A1: 1,500 OCPU-h + 9,000 GB-h/month = 2 OCPU/12 GB; meta last-modified 2026-06-12 |
| E25 | Pricing pages (Deepgram, AssemblyAI, OpenAI, AWS, Google, Mistral) | values in section 5.4 |
| E26 | faster-whisper bench (owner PC) | section 5.3 |

Sources (web): live.house.gov; clerk.house.gov; senate.gov (isvp, floor_schedule.json, floor pages);
dailypress.senate.gov; democrats.senate.gov/floor; everycrsreport.com/reports/R44665.html; ask.loc.gov/law/faq/446544;
c-span.org (copyright and TV Everywhere pages via search summaries); developers.google.com/youtube/v3/docs
(captions/download, captions/list, search/list, determine_quota_cost); youtube.com/t/terms; whitehouse.gov (live,
feeds); dvidshub.net; war.gov RSS; deepgram.com/pricing; assemblyai.com/pricing; developers.openai.com/api/docs/pricing;
aws.amazon.com/transcribe/pricing; cloud.google.com/speech-to-text/pricing; mistral.ai/news/voxtral-transcribe-2;
huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b; huggingface.co/nvidia/parakeet-tdt-0.6b-v3;
github.com/SYSTRAN/faster-whisper; docs.oracle.com Always Free resources; hls.js docs/API.md (v1.7.3 latest on jsDelivr).

---

## Verifier additions

Adversarial verification pass, 2026-10-02, 17:05-17:45Z. Probes used curl `--max-time 20` with the UA
`current-events-dashboard-research/0.1 (jst28323@gmail.com)` unless noted. Scratch evidence is in the session
scratchpad under `verify_media/` (not committed).

1. **DVIDS Live API (F3/F4 detection, DoD/War).** `GET https://api.dvidshub.net/live/list?api_key=key-...` is
   documented at `api.dvidshub.net/docs/live_api`. The doc's example response (dated 2026-10-02) has
   `results[].{id,title,begin,end,url,hls_url,unit_id}` and `current_time`, with the header
   `Access-control-allow-origin: *`. Params are `from_date` (ISO 8601), `has_video_id`, `hashtag`,
   `max_results` (1-50) and `sort`. A keyless call returns HTTP 403 `{"errors":["Bad Request - No API key was
   provided"]}`. Keys are free ("Access to the API is currently open"). This is a structured upcoming/live feed with
   the HLS URL included, better than scraping `/webcast`. Not tested with a key.
2. **GovInfo DCPD (F3/F4 post-hoc, official, public domain).** `https://www.govinfo.gov/rss/dcpd.xml` returned 200
   with 100 items, 47 of them "Remarks ..."/"Exchange ..." transcripts, plus EOs, proclamations and the "Checklist of
   White House Press Releases". The newest was `DCPD-202600565` (pubDate 2026-10-01T21:27Z). MODS for
   `DCPD-202600562` shows `dateIssued 2026-08-27` and `recordCreationDate 2026-09-30`, so the lag is **about 1
   month**. Too slow for "live", but it is the only official, citable transcript of presidential remarks now that
   whitehouse.gov `/remarks/` is dormant. Use it to backfill or replace earlier ASR text.
3. **Senate LIS daily floor activity (F1/F5 text log, official).**
   `https://www.senate.gov/legislative/LIS/floor_activity/MM_DD_YYYY_Senate_Floor.xml` (current year at the root,
   earlier years under `/YYYY/`). `09_30_2026_Senate_Floor.xml`: 200, 29,339 B, `ETag`,
   `Last-Modified Thu, 01 Oct 2026 13:36:51 GMT` (the next morning). Root element `<daily_senate_floor_activity>`
   with `<vote_number>`, `<document_status_text>`, `<sponsor_name>`. The HTML view is
   `.../floor_activity/floor_activity.htm` ("Recent Floor Activity"), and `floor_schedule.json`'s
   `outSessionLink` points here. Detailed in congress_floor_votes.md. Listed here because it is the official
   complement to the caption stream. Intraday update cadence: UNVERIFIED.
4. **Senate Periodical Press Gallery RSS.** `https://www.periodicalpress.senate.gov/feed/` returned 200,
   `application/rss+xml`, with daily posts ("Wednesday, September 30, 2026", ...). It is a second human-written
   floor log alongside the Daily Press feed. Cadence and content depth: UNVERIFIED.
5. **House Republican Cloakroom** `https://repcloakroom.house.gov/` (200) publishes daily floor wrap-ups. A search
   summary cites "S. 2403 ... 401-14 ... YEA 191 NAY 14" for 2026-09-16. Not probed further. The Senate GOP
   counterparts (`republican.senate.gov/floor-updates/`, `republicans.senate.gov/public/index.cfm/floor-updates`)
   both 404.
6. **English-only Nemotron streaming ASR.** `nvidia/nemotron-speech-streaming-en-0.6b` (HF 200, NVIDIA Open Model
   License, release 03/13/2026). NVIDIA's own 3.5 card recommends it for English-only use. Add it to the ASR bake-off
   in recommendation 6.
7. **House Committee Captioning Service** (Committee on House Administration, 2025-07-24): "now available to every
   House committee". Whether it reaches the streams is UNVERIFIED (see 2.4).
8. **CORS map for a browser-only (GitHub Pages) client**, tested with `Origin: https://example.github.io`:

   | Resource | ACAO |
   |---|---|
   | House media CDN (`houseliveprod-...azurefd.net`): manifests, segments, `captions.vtt` | `*` |
   | Senate media CDN (`www-senate-gov-media-srs.akamaized.net`) | `*` (with `Allow-Credentials: true`; fine for non-credentialed hls.js requests) |
   | House FloorCast API | none (pinned to `https://live.house.gov`) |
   | `senate.gov/.../floor_schedule.json` | none |
   | `dailypress.senate.gov/feed/` | none |
   | `whitehouse.gov/live/` | none |
   | YouTube RSS | none |
   | DVIDS API (per docs, not tested with a key) | the doc example shows `*`, but the intro says CORS works "from the domain associated with your access key" — UNVERIFIED which applies; register the key for the Pages domain |

9. **Conditional-GET behaviour (polling etiquette):**

   | Source | If-None-Match | If-Modified-Since |
   |---|---|---|
   | FloorCast `/latest/history` | 304 | not tested |
   | `floor_schedule.json` | **200 (ignored)** | 304 |
   | `dailypress.senate.gov/feed/` | **200 (ignored)** | 304 |
   | whitehouse.gov feeds | 304, but the ETag is **site-wide** (identical across feeds) | not tested |
   | war.gov `RSS.ashx` | no validators (`Cache-Control: private`) | n/a |

10. **Caption text copyright nuance.** The transcript payloads carry no rights notice, and the captions are produced
    by a contracted vendor. That is low risk for a personal tracker, but the UI should not label caption text "public
    domain" on the strength of the floor-actions payload's notice.

## Verification ledger

| # | Claim | Method | Verdict | Evidence |
|---|---|---|---|---|
| 1 | FloorCast `/latest/history` 200 + ETag, If-None-Match gives 304 | curl | CONFIRMED | 17:05Z 200, 352 B, `W/"160-+GZ7SDztnmnmevomcLRjQBJwXzk"`, INM → 304, `inSession:false` |
| 2 | FloorCast ACAO pinned to live.house.gov; none for foreign Origin | curl with Origin headers | CONFIRMED | live.house.gov Origin → ACAO echoed; example.github.io → no ACAO |
| 3 | `/latest/floor` 4,091 B, `nextStartDate 2026-10-05T16:30`, rights notice | curl | CONFIRMED | 200, 4,091 B, same `_id 20261001` |
| 4 | `/floor/2026-09-16` 74,870 B, 170 actions; `/floor/20260916` returns latest | curl | CONFIRMED | 74,870 B / 170; dashless → 4,091 B (= latest) |
| 5 | `/latest/transcript` 9 entries, final "...STANDS ADJOURNED..." at 460.009 | curl | CONFIRMED | 9 entries, text and timestamp match |
| 6 | `/transcripts/2026-09-16` 715,888 B, 1,104 turns, all `UNIDENTIFIED SPEAKER` | curl + python | CONFIRMED | 715,888 B; Counter = {UNIDENTIFIED SPEAKER: 1104} |
| 7 | `transcriptUpdates` delta shape | curl | CONFIRMED | response keys `previousEntry`, `newEntries` |
| 8 | `/broadcastevents/20261001` gives HLS/DASH/WebVTT east+central | curl | CONFIRMED | `isLiveBroadcast "True"`, `#s=261.505`, captions.vtt URLs |
| 9 | `/sessiondays/` 128 days in 2026; `/latest/votes` `[]`; listed 404 routes | curl | CONFIRMED | 128; `[]`; 404 x4 |
| 10 | Bundle `js/app.9d37cb71.js` 691,919 B, api base, 30 s history poll, `hoursPriorToSession:2` | curl + grep | CONFIRMED | `setTimeout(h,3e4)`, base `liveproxy-azapp-prod-eastus2-003` |
| 11 | "Every payload carries a public-domain notice" | grep saved payloads | REFUTED | only floor + broadcastevents carry `rights` |
| 12 | House uses "a closed captioning vendor using manual captioners" | web search | UNVERIFIABLE (for 2026) | source is a 2020-12-30 House Sources Sought Notice |
| 13 | Floor-action lag median 0, p90 4.4, max 544 "one late edit" | recompute from fresh payload | REFUTED (detail) | median 0.02, p90 3.6-4.3; **7** actions > 60 min; 80/170 negative (minute-truncated field) |
| 14 | House caption API lag about 55-60 s (n=1) | recompute | UNVERIFIABLE | 36-63 s depending on clock origin; needs live measurement |
| 15 | Recognition-phrase counts 417 / 15 / 275 / 27 | python | CONFIRMED | identical; `GENTLELADY FROM` = 24 |
| 16 | House master: ACAO `*`, 5 renditions 273k-3.1M, `audio_0` AAC, 2 s fMP4 | curl | CONFIRMED | manifest 793 B; `TARGETDURATION:2`; `aac/128000/init.mp4` |
| 17 | In-band 608/708: `GA94` x60 in segment_199 (81,115 B) | curl + byte count | CONFIRMED | 81,115 B x60; 09-16 segment 99,529 B x60 |
| 18 | captions.vtt 09-16: 1,387,758 B, 21,987 cues, 1,104 tags, about 13 h | curl + grep | CONFIRMED | last cue 12:59:25.709 |
| 19 | captions.vtt "starts with ... 00:04:39.505" | curl | REFUTED (for 09-16) | 09-16 = `00:03:57.914`; `04:39.505` is the 10-01 file |
| 20 | Finalized VOD about 22 min after adjournment (10-01) | HEAD | CONFIRMED (n=1) | m3u8 LM 15:57:26Z, VTT LM 15:55:53Z |
| 21 | Clerk YouTube RSS newest "US House Floor Proceedings (Thursday, October 1, 2026)" 03:58Z | curl | CONFIRMED | published 2026-10-02T03:58:05Z |
| 22 | `floor_schedule.json` 200, 974 B, ETag, LM, stream `stv100526` | curl | CONFIRMED | ETag `"3ce-65cc8581e0de8"`, LM 14:36:41Z |
| 23 | Poll `floor_schedule.json` via ETag | conditional curl | REFUTED | INM → 200; IMS → 304 |
| 24 | ISVP URL templates, floor streamID 2096634, committee IDs, 1208 fallback | curl `isvp/stv.html` | CONFIRMED | lines 133-138 of page; all IDs match |
| 25 | `stv100126` master 200, ACAO `*`, no-store, SUBTITLES; variants 404 | curl | CONFIRMED | `text_1.m3u8`/`index_1.m3u8` 404 |
| 26 | No official Senate floor archive (msl3 404) | curl | CONFIRMED | 3 dates 404; akamaihd fallback 400 |
| 27 | judiciary093026 `text_1.m3u8` VOD, 662 x 12 s; cue text; speaker tags | curl | CONFIRMED | 23,283 B, 662 segs; tags incl. `SEN. KENNEDY:` |
| 28 | Every committee stream has a WebVTT rendition | curl 8 committees | CONFIRMED (8/8 sampled) | finance, foreign, help, govtaff, energy, epw, vetaff, judiciary |
| 29 | Senate TS has no in-band 608 | byte count | CONFIRMED | 1,136,460 B, `GA94` x0 |
| 30 | `floor.senate.gov` NXDOMAIN | nslookup @8.8.8.8 | CONFIRMED | "Non-existent domain" |
| 31 | c-span.org WAF challenge | curl | CONFIRMED (intermittent) | 3x 200, then 202 + `x-amzn-waf-action: challenge` |
| 32 | api.c-span.org times out | curl | CONFIRMED | 000 after 20.0 s |
| 33 | C-SPAN retransmission ban and non-commercial recordings allowed | curl copyright page | CONFIRMED (verbatim) | 200, 41,645 B |
| 34 | C-SPAN "All uses of ... floor proceedings are permitted" quote | curl copyright page | UNVERIFIABLE | sentence not on current page |
| 35 | C-SPAN federal-event livestreams without login | WebFetch/curl (403/202) + search | UNVERIFIABLE (SEARCH only) | search summary consistent |
| 36 | whitehouse.gov/live 269,696 B, max-age 60, `on:false`, `A4gNgHfZ-v4`, view.js 4,975 B | curl | CONFIRMED | byte-identical sizes; 0 m3u8 |
| 37 | `on:true` shape (report: UNVERIFIED) | Wayback raw snapshot | CONFIRMED (upgraded) | 2026-09-30 16:36:07Z: `on:true`, name "Vice President JD Vance Delivers Remarks in Brownsville, TX" |
| 38 | WH feeds: videos 30; briefings-statements 30 / 0 briefings; remarks 1 item (2025-01-20); presidential-actions 30 | curl | CONFIRMED | ETag is site-wide (`1ae6d600...`) |
| 39 | YouTube RSS 15 entries, `max-age=900`; `UULV` playlist works; channel IDs | curl | CONFIRMED | WH + Clerk both 15 entries |
| 40 | `search.list` own bucket, 100/day, 1 unit; 10,000 units for others; `eventType` needs `type=video` | curl docs | CONFIRMED | quota page "Last updated 2026-09-15" |
| 41 | `captions.download` 200 units + "permission to edit the video"; `captions.list` 50 | curl docs | CONFIRMED | verbatim |
| 42 | YouTube ToS: no automated access, no download unless authorized; effective 2023-12-15 | curl ToS | CONFIRMED | verbatim; "Effective as of December 15, 2023" |
| 43 | `cc_load_policy=1` shows captions by default | curl player_parameters | CONFIRMED | doc updated 2026-09-16 |
| 44 | DVIDS `/webcast` upcoming list + CloudFront HLS on pages | curl | CONFIRMED | HLS URL 404 before its start/end window |
| 45 | DVIDS API needs a free key | curl + docs | CONFIRMED | 403 "No API key was provided" |
| 46 | war.gov RSS CT=13 / 11 / 400; defense.gov redirects | curl | CONFIRMED | 10 items each; newest as quoted; 301 → war.gov |
| 47 | State Dept briefings feed 403 (bot protection) | curl, two UAs | REFUTED | 200 with compatible UA; feed stale (last briefing 2025-08-12) |
| 48 | Senate Daily Press RSS: 3 items, pro forma calendar, return Nov 9 3:00 pm | curl | CONFIRMED | dates and times match text |
| 49 | Daily Press "ETag" polling | conditional curl | REFUTED | INM → 200; IMS → 304 |
| 50 | Senate Dems wrap-up 2026-09-30 "not agreed to: 53-47" | curl | CONFIRMED | quote present |
| 51 | Senate Dems "Floor Updates RSS Feed" | curl | REFUTED | `/floor/feed` is text/html |
| 52 | `republican.senate.gov/floor-updates/` 404 | curl | CONFIRMED | also the `republicans.senate.gov` CFM path 404 |
| 53 | Factba.se search 0 matches, `records_total 636789`, noindex/no-store | curl | CONFIRMED | identical meta |
| 54 | Congressional Record usually by 10:00 am | search (congress.gov 403 to curl/WebFetch) | CONFIRMED (SEARCH) | help-page text in search result |
| 55 | House Rule V bars political use and commercial ads | govinfo HMAN-107 | CONFIRMED | cl. 2(c)(1)-(3) verbatim (older edition) |
| 56 | Oracle A1 1,500 OCPU-h + 9,000 GB-h = 2 OCPU/12 GB; idle reclaim; 10 TB egress | curl docs | CONFIRMED | `cpp-last-modified-time 2026-06-12` |
| 57 | GitHub Actions cron not suitable (minimum interval, delays) | curl docs | CONFIRMED | 5 min minimum; may be delayed or dropped; 60-day disable |
| 58 | AssemblyAI $0.15/h, diarization $0.12/h, keyterms $0.04/h, U-3.6 Pro RT $0.45/h, $50 | curl pricing | CONFIRMED | free tier "up to 333 hours of streaming" |
| 59 | AssemblyAI billed on WebSocket session duration | curl pricing | UNVERIFIABLE | not on pricing page |
| 60 | Deepgram Nova-3 $0.0048 / $0.0077; Flux $0.0065 / $0.0077; diarization $0.0020; keyterm $0.0013; $200; 150 WSS | curl pricing | CONFIRMED | "Limited-time promotional rates on streaming" |
| 61 | AWS streaming $0.01/min, batch $0.006, 60 min/mo free for 12 months | pricing page + metered JSON | CONFIRMED | $0.0001667/s streaming |
| 62 | AWS price is "tier 1" | metered JSON | REFUTED | flat "from 0 to Inf"; no tiers |
| 63 | Google STT v2 Standard $0.016 (0-500k); dynamic batch $0.003 | curl pricing | CONFIRMED | SKU 3099-B70F-0949 |
| 64 | OpenAI `gpt-live-transcribe` / `gpt-realtime-whisper` $0.017/min; file-model prices | curl pricing | CONFIRMED | table rows verbatim |
| 65 | Mistral Voxtral Realtime $0.006/min, Apache-2.0, 2026-02-04 | curl blog + HF API | CONFIRMED | 4.43 B params |
| 66 | Nemotron-3.5 card (license, chunks, WER, Turing) | raw README + HF API | CONFIRMED | Turing and Volta listed |
| 67 | Nemotron release date (report: UNVERIFIED) | raw README | CONFIRMED (upgraded) | "Hugging Face [06/04/2026]" |
| 68 | Parakeet-v3 RTFx 3,332 | raw README | UNVERIFIABLE | figure absent from README |
| 69 | hls.js 1.7.3 latest; `enableCEA708Captions` default true; `CUES_PARSED` | jsDelivr API + v1.7.3 API.md | CONFIRMED | tags.latest = 1.7.3 |
| 70 | Safari/iOS native HLS exposes the House 608 as a text track | none possible | UNVERIFIABLE | no `CLOSED-CAPTIONS` attr; not tested |
| 71 | CPU `small.en` int8: 41.5 s, 14.5x, 8.0% | re-ran researcher's script | CONFIRMED | 41.0 s, RTFx 14.7, WER 0.080 |
| 72 | `large-v3-turbo` fp16 cold: 88.6 s, 6.8x, 6.4% | saved bench JSON | CONFIRMED | `bench_turbo_full.json` |
| 73 | Other GPU rows (int8_float16, 5 s chunks p50 2.04 s, VAD off, small.en GPU) | not re-run (owner GPU) | UNVERIFIABLE | console-only evidence |
| 74 | PyAV 16 breaks `decode_audio` | not tested | UNVERIFIABLE | venv pinned 15.1.0; PyPI latest 19.0.0 |
| 75 | Tier 0 "zero backend" works for both chambers | CORS + URL analysis | REFUTED (House half) | House asset URL only via CORS-blocked API |
| 76 | houselive.gov times out | curl | CONFIRMED | 000 after 20.06 s |
| 77 | House committee captions are "usually auto-generated" YouTube captions | search + press release | UNVERIFIABLE | 2025 House Committee Captioning Service exists |

Tally: 77 claims checked: 58 CONFIRMED (including 2 upgraded from UNVERIFIED), 9 REFUTED, 10 UNVERIFIABLE.

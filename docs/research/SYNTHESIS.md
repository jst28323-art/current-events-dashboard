# SYNTHESIS: what to build, in what order, and why

**Date:** 2026-10-02. **Inputs:** the six verified research reports in this folder. Where a verifier corrected a
researcher, the verifier's version is used here. One fresh probe was added: supremecourt.gov `robots.txt` at 18:12Z.
**Calendar context:** Congress is in recess until Mon 2026-11-09 (pro forma sessions only), so every congressional
latency below comes from server timestamps on September session days. None of it was watched live.

**How this file relates to the rest of the repo:**
- Owner rulings live in [`docs/DECISIONS.md`](../DECISIONS.md) (D-001 to D-015). This synthesis respects them, and §8
  lists only what is still open.
- Per-source operating numbers live in [`docs/SOURCES.md`](../SOURCES.md). The binding plan is
  [`docs/ROADMAP.md`](../ROADMAP.md).
- This file is the dated cross-report summary that those documents are built from. Re-measure before trusting any
  number.

Report abbreviations:
- **CFV** = [congress_floor_votes.md](congress_floor_votes.md)
- **LEG** = [congress_legislation_committees_courts.md](congress_legislation_committees_courts.md)
- **EXE** = [executive_branch.md](executive_branch.md)
- **LIVE** = [live_media_transcripts.md](live_media_transcripts.md)
- **ARC** = [architecture_hosting_frontend.md](architecture_hosting_frontend.md)
- **CUR** = [curation_priorart_future.md](curation_priorart_future.md)

Status labels:
- **VERIFIED**: fetched live on 2026-10-02 and confirmed by the verifier.
- **PARTIAL**: the mechanism was verified, but latency or coverage was not observed live.
- **UNVERIFIED**: not confirmed. The reason is given.

---

## 1. Headline

- **A minute-level feed of discrete events is achievable for $0.** That means presidential actions, the Federal
  Register, roll calls, floor actions and agendas. It runs on Cloudflare Workers Free: a cron Worker, Durable Object
  alarms for sub-minute polling, and a SQLite-backed hub with WebSocket push. The page is served by GitHub Pages.
  - Our own pipeline adds about 10–90 s after a source publishes.
  - GitHub Actions cron cannot be the live path. Measured on public repos, a `*/5` schedule delivered only 32–38% of
    runs (p50 gap 11–13 min) in some repos and 2% (p50 gap ~5 h) in others ([ARC §2](architecture_hosting_frontend.md#2-live-measurements-made-today)).
    This is decision D-008.
- **The upstream sources are the latency floor, not our infrastructure.** Each delay below runs from the real event to
  the source publishing it:
  - House floor actions: 84–87% stamped within 2 min (n=322).
  - House vote-result lines: posted as one batch per vote series, 4–45 min late (n=17).
  - Senate member-level vote XML: 36–47 min after the vote closes (n=4).
  - White House executive-order posts: 17–210 min after the scheduled signing (n=10).
  - Federal Register Public Inspection: presidential documents appear at a fixed 11:15 ET slot, 1–2 business days
    after signing (n=11).
  - Bill status: officially "the morning after". The Congressional Record: next morning to about 6 days.

  The UI must show the source and its measured lag. It must never imply an item is real-time when it is not.
- **Live floor text is free, official and human-captioned, so the floors need no speech-to-text.**
  - Senate: the floor HLS master declares a WebVTT subtitle rendition (the committee streams sampled use 12 s
    segments). Estimated 15–35 s behind speech (UNVERIFIED live).
  - House: the HouseLive backend serves the caption transcript about 0.5–1 min after speech (n=1). The video also
    carries in-band 608 captions.
  - Both are unproven on a real session day until Nov 9.
  - Senate floor caption playlists **vanish after the day**, so they must be captured live.
- **No free, authoritative "who is speaking now" signal exists (F8).**
  - All 1,104 House caption turns on Sep 16 say `UNIDENTIFIED SPEAKER`.
  - Senate committee captions carry `SEN. X:` tags (VERIFIED). The floor captions probably do too (UNVERIFIED).
  - Any House speaker label must be inferred from the chair's recognition phrases and shown as "inferred".
- **Executive "live now" detection is free; live executive transcripts are not.**
  - whitehouse.gov/live carries a server-rendered `data-live-duplex` flag with the event title and the YouTube video
    ID. Its on-state was verified in 4 archived snapshots. How fast it flips is unmeasured.
  - YouTube channel RSS lists live streams only **after they end** (18 of 18 samples). YouTube's terms forbid
    downloading the audio.
  - So White House events get an embedded official player, with captions shown in the player. Speech-to-text is
    limited to official non-YouTube streams on the owner's home PC (D-010), such as DVIDS for the War Department.
- **Presidential actions and the Federal Register are the strongest free sources (F9, F10). Ship them first.**
  - The whitehouse.gov umbrella RSS breaks the news.
  - Federal Register Public Inspection then adds the EO number and the full text at fixed filing slots.
  - The FR API needs no key and is CORS-open. Some presidential documents never appear on whitehouse.gov at all.
- **Hard or risky:**
  - Undocumented and human-written sources: the HouseLive API and the press-gallery logs.
  - Reachability of .gov sites from Cloudflare's network is untested.
  - Workers Free allows 10 ms of CPU per invocation (the Durable Object alarm limit on Free is undocumented).
  - The President's schedule exists only through third parties whose terms are unchecked: Factba.se and BNO.
  - Source timestamps are often last-edit times, not first-appearance times. Every item therefore needs our own
    `first_seen_at`.
- **The calendar decides the build order.** October has only pro forma sessions. Congressional adapters are therefore
  built against the recorded fixtures (`fixtures/`), and the Federal Register and White House prove the live loop.
  The first real latency measurements of Congress happen Nov 9–10.

---

## 2. Coverage matrix (F1–F12)

Latency means real-world event → first appearance at the source. Our pipeline then adds about 10–90 s (§3).

| F | Best primary source(s) | Access | Realistic latency | Cost | Confidence | Gap / notes |
|---|---|---|---|---|---|---|
| **F1** Senate floor live | Floor WebVTT captions on the `stv<MMDDYY>` HLS stream ([LIVE §2](live_media_transcripts.md#2-source-by-source-detail)); Daily Press Gallery floor log via WP REST ([CFV §4](congress_floor_votes.md#4-senate-details)); `floor_schedule.json` for convene time and stream name | HLS text playlist (ACAO `*`); WP REST JSON (reflects any Origin); JSON (If-Modified-Since only) | Captions ~15–35 s (estimate). Gallery log: minutes (one post ~1 min after adjournment, n=1) | $0 | **PARTIAL**: subtitle rendition verified on the Oct 1 master; committee captions verified; floor caption text, tags and lag UNVERIFIED | Playlists 404 after the day: capture live or lose it. C-SPAN is link-out only. Verbatim text comes from the next-day Congressional Record (up to ~6 days). Captions are unreviewed. |
| **F2** House floor live | Clerk `floor/YYYYMMDD.xml` ([CFV §3](congress_floor_votes.md#3-house-details)); HouseLive `/latest/history` then deltas, including `transcriptUpdates` (undocumented; D-009 allows it labelled); House HLS with in-band 608 plus a daily `captions.vtt` ([LIVE §2](live_media_transcripts.md#2-source-by-source-detail)) | XML with If-Modified-Since (ETag ignored); HouseLive JSON server-side only (CORS pinned), ETag gives 304; HLS ACAO `*` | Actions: 84–87% within 2 min (n=322, Sep 15–16). Captions ~0.5–1 min (n=1). In-browser 608 ~10–15 s (estimate) | $0 | **VERIFIED** for actions; **PARTIAL** for captions | Every caption turn says "UNIDENTIFIED SPEAKER". The HouseLive host is a deployment slot that can change. The day's video asset path is listed only by the CORS-blocked API. Whether HouseLive is faster than the Clerk is UNVERIFIED (they share `updateDateTime`). |
| **F3** Press conferences and briefings | whitehouse.gov/live flag plus the embedded official player ([EXE §2](executive_branch.md#2-whitehousegov-wordpress-current-administration)); State public-schedule RSS "BRIEFING SCHEDULE" block; War Dept transcripts RSS and the DVIDS Live API ([EXE §7](executive_branch.md#7-cabinet-departments-and-major-agencies-f3-f4-f11)) | HTML poll every 60 s (no ETag, `max-age=60`); RSS (State needs a browser-like UA); DVIDS needs a free key | Detection about poll interval + 60 s (flip lag UNVERIFIED). Text: hours (Factba.se, ≤8 h bound) to ~1 month (DCPD) | $0 | **PARTIAL** | No free, legal live text of White House briefings (YouTube terms; `captions.download` needs edit rights). WH briefings are rare in 2026 (9 from May to Sep). **Congressional leadership press conferences: no source was researched.** Agencies have no live flag. |
| **F4** President, cabinet, officials speaking | whitehouse.gov/live flag (covers the President and VP) plus YouTube `videos.list` by ID (1 quota unit) ([EXE §1](executive_branch.md#1-fastest-legitimate-signal-for-each-question)); Factba.se schedule rows to arm detection; Fed `calendar.json` live links; DVIDS; official House/Senate streams when officials testify | HTML/JSON; free Google key for `videos.list` | Detection ~1–2 min. Live text only via home-PC speech-to-text on allowed non-YouTube streams (~15–30 s, estimate); otherwise after the fact | $0 | **PARTIAL**: the flag mechanism is verified; flip lag and whether it covers every WH stream are UNVERIFIED | YouTube RSS shows streams only after they end (18/18), and `search.list` is capped at 100 calls/day, so agency detection must be armed by schedules. No registry of cabinet appearances exists. |
| **F5** What is being voted on now | House: GOP Cloakroom `vote_sheet` (series listed before voting), HouseLive `/latest/votes`, DomeWatch `/votes/current` (partisan; SSE with a free key) ([CUR §1](curation_priorart_future.md#1-prior-art)). Senate: Daily Press Gallery log ("began voting…", tallies) and the Senate Press Gallery on Bluesky | WP REST (cloakroom server-side only: duplicate ACAO); JSON | House series list ~37 min before the first vote (n=1). Clerk result lines batched 4–45 min after (n=17). Live tallies UNVERIFIED (DomeWatch documents "approximately once per second"). Senate: minutes (human-written log) | $0 | **PARTIAL** (no session observed) | No Senate live tally exists. The only live House tallies are partisan (DomeWatch) or undocumented (HouseLive). DomeWatch has a test vote in its production data. |
| **F6** Who voted how | House Clerk `evs/<yr>/rollNNN.xml` with bioguide IDs; Senate LIS vote XML with LIS IDs, mapped through `congress-legislators` ([CFV §2](congress_floor_votes.md#2-source-catalog)); Congress.gov `/house-vote` (key; there is no Senate endpoint) | XML. House: probe the next roll number. Senate: If-Modified-Since only | Senate 36–47 min after close (n=4). House UNVERIFIED (no Last-Modified header) | $0 | **VERIFIED** format; **PARTIAL** latency | No fast Senate member list (the press galleries name only party defectors). A missing House roll returns HTTP 200 with a 65-byte error body. |
| **F7** Daily agendas | House: docs.house.gov weekly XML and the Committee Repository (meetings posted ~7 days ahead) ([LEG §5](congress_legislation_committees_courts.md#5-committee-hearing-schedules-f7)). Senate: `floor_schedule.json`, Daily Press Gallery posts (the full pro forma calendar), `hearings.xml`, Senate Democrats RSS (partisan). President: Factba.se `calendar.json` ([EXE §5](executive_branch.md#5-the-presidents-and-others-public-schedule-f7)). Cabinet: State public schedule, "Today in DOW", Fed `calendar.json`. SCOTUS: argument-calendar PDF | XML/JSON/RSS; the House committee XML sits behind an ASP.NET postback; Congress.gov `/committee-meeting` (key) | Ahead of time (minutes to days). `hearings.xml` is regenerated about every 2 h | $0 | **VERIFIED** for Congress; **PARTIAL** for the President (third-party only) | The White House publishes no schedule. There is no VP schedule. Factba.se terms are unchecked: link out until checked (D-009). |
| **F8** Who is speaking now | Senate caption speaker tags (verified on committee captions; floor UNVERIFIED); Daily Press Gallery "Senator X spoke on…" after the fact; House recognition-phrase heuristic plus the member table ([CFV §5](congress_floor_votes.md#5-answers-to-the-specific-questions)) | As F1/F2 | Caption latency (Senate); minutes after the speech (gallery log) | $0 | **UNVERIFIED** | **No authoritative free source exists for either chamber.** House labels can only be inferred. Score them against a hand-labelled slice before showing them. |
| **F9** Presidential actions | whitehouse.gov `/news/feed/` umbrella RSS (EOs, proclamations, memoranda, nominations, "Signed into Law" posts) ([EXE §2](executive_branch.md#2-whitehousegov-wordpress-current-administration)); FR Public Inspection special filings with the EO number and full text via `raw_text_url` ([EXE §3](executive_branch.md#3-federal-register-api-v1-f9-f10)) | RSS: ETag/IMS give 304, but the validator is site-wide, so dedupe by GUID. FR JSON needs no key | WH post 17–210 min after the scheduled signing (n=10). PI at 11:15 ET, 1–2 business days after signing (n=11). FR publication median 5 days (n=31) | $0 | **VERIFIED** | WH posts carry no EO number. Some documents appear only on the FR (the Syria notice, the Lebanon and refugee determinations). WH `pubDate` can come before the post goes live, so order by `first_seen_at`. |
| **F10** Federal Register (incl. Public Inspection) | FR API v1: PI `current.json` and `documents.json` ([EXE §3](executive_branch.md#3-federal-register-api-v1-f9-f10)) | JSON, no key, ACAO `*`. **Always add a cache-busting query** (a plain request returned a copy with `Age` > 1 h despite `no-store`) | Fixed slots: regular filings 08:45 ET; special filings 08:45, 11:15, 14:00, 16:15, 18:00 ET. Detection lag at the slot UNVERIFIED (the flip was not caught live) | $0 | **VERIFIED** | 82% of documents are notices, so curation must hide them by default. The website HTML is bot-walled; use the API only. |
| **F11** Other federal events | Bills: Congress.gov API (key) and GovInfo BILLSTATUS batch RSS (no key) ([LEG §2](congress_legislation_committees_courts.md#2-congressgov-api-v3-library-of-congress), [§4](congress_legislation_committees_courts.md#4-govinfo-gpo)). Nominations: Senate vote XML and `NomCivilianConfirmed.xml`. SCOTUS: slip-opinion and orders **HTML** pages ([LEG §8](congress_legislation_committees_courts.md#8-supreme-court-supremecourtgov--primary-real-time-no-api)). Lower courts: D.D.C. PACER RSS, CourtListener. CBO/GAO RSS. OIRA rules-under-review XML. Agencies: DOJ, War, State, Treasury, Fed and SEC RSS; DHS HTML | Mixed; If-Modified-Since works on GovInfo and SCOTUS HTML | Bills: officially "morning after". A same-day BILLSTATUS re-publish was seen 2.75 h after a vote, but whether it held the vote is UNVERIFIED. SCOTUS: real time. PACER: minutes. CBO/GAO: minutes plus up to 1 h of CDN cache. Nominations confirmed: next morning | $0 (CourtListener free tier: 125 requests/day) | **VERIFIED** for sources; **PARTIAL** for bill latency | Same-day bill status. HHS and Commerce press pages return 403. SCOTUS `/rss/` is disallowed by robots.txt (re-checked 18:12Z), and so is the docket JSON under `/rss/cases/`. |
| **F12** Financial and world (future) | SEC EDGAR Atom (declared UA required), Fed RSS, BLS ICS plus RSS, Census RSS, Treasury auctions and FiscalData, GDELT 2.0, UN News RSS, Bluesky Jetstream v2 ([CUR §6](curation_priorart_future.md#6-future-sources-f12-financial-and-world-news)) | RSS/Atom/JSON/WebSocket; SEC has no CORS | SEC often 1–3 min (one 8-K seen < 1 min old). Fed RSS updated 11 s after a release. GDELT every 15 min | $0 | **VERIFIED** (reachable) | Market quotes need a licence: do not show them. AP and Reuters forbid automated collection. The NewsAPI free tier is not allowed in production. |

### 2.1 Conflicts between reports, and how they are resolved here

| Topic | Conflict | Resolution |
|---|---|---|
| Senate floor captions | CFV found no caption track on the ISVP player. LIVE found a `SUBTITLES` WebVTT rendition in the `stv100126` master playlist (the verifier confirmed it). | **Captions exist** (LIVE). CFV probed the player page and archive paths, which 404. The floor caption text and speaker tags are still UNVERIFIED. |
| Press-gallery CORS | CFV: the WP REST API reflects any Origin. LIVE: `dailypress.senate.gov/feed/` sends no ACAO header. | Both are true. Use **WP REST** (`/wp-json/wp/v2/posts`) for anything browser-side. |
| Congress.gov `/house-vote` coverage | CUR (endpoint `.md`): legislation-linked votes only, Beta. CFV (ChangeLog): non-legislation votes for 2023-present added June 2025, and the beta label was slated for removal in Dec 2025. | The ChangeLog is newer: **coverage is probably all votes**. UNVERIFIED live (DEMO_KEY returned 429); test it with the real key. |
| DEMO_KEY limits | The api.data.gov manual says 30/h and 50/day. Live headers say 10. | **About 10 per UTC day per IP, per API** (the `Retry-After` points to 00:00 UTC; LEG verifier). Never use it. A real key: Congress.gov 5,000/h, GovInfo 36,000/h; otherwise the api.data.gov default of 1,000/h is shared across its APIs. |
| YouTube RSS during a live stream | CUR: UNVERIFIED. EXE: 18 of 18 live videos appeared only after they ended. | **RSS shows replays only** (EXE measured it). Use it for "replay posted", never for "live now". |
| Congress.gov bill latency | LEG researcher: +17.4 h. Verifier: that figure is a last-edit time; BILLSTATUS was re-published +2.75 h after the vote. | **UNVERIFIED.** Label bill status "official, usually next morning" until it is measured on a session day. |
| SCOTUS feeds | LEG verifier: official SCOTUS RSS exists. CUR: robots.txt has `Disallow: /rss/`. | Both hold (robots re-confirmed 18:12Z, `Crawl-delay: 1`). **Use the HTML slip-opinion and orders pages, which are allowed** (`/opinions/slipopinion/25` returned 200). `/rss/`, including the docket JSON, needs an owner decision (§8). |
| House floor source | CUR named DomeWatch and the cloakrooms as the fastest. CFV and the CUR verifier found the official Clerk XML with per-minute stamps. | The **Clerk XML is primary**. Use the per-day `floor/YYYYMMDD.xml` (~74 KB), not the 2.2 MB session file. Partisan sources only corroborate. Who is faster is UNVERIFIED until Nov 9. |
| GitHub Pages deploy time | ARC: 48 s. Verifier: that came from CodeQL runs; real Pages builds have p50 24.6 s. | The verdict is unchanged: Actions and Pages are not the live path. |
| DHS | EXE: 403. Verifier: the RSS URLs are 404 (they do not exist), and the press-release HTML returns 200. | DHS is an HTML-scrape source, not a gap. HHS and Commerce stay blocked. |
| Hardware | Research says "2080 box". D-003 says the always-on machine is the owner's **main home PC**. | Read "2080 box" as "home PC". It runs other GPU work, so speech-to-text should run **CPU-first**: `small.en` int8 ran at 14.5× real time on this CPU ([LIVE §5](live_media_transcripts.md#5-self-transcription-asr-models-measured-speed-and-where-to-run-it)). |

---

## 3. Architecture options

### 3.1 What the sources demand of the architecture

| Requirement found in the source research | Sources | Consequence |
|---|---|---|
| Sub-minute polling in session | HouseLive history (its own client polls every 30 s), Clerk floor XML, Senate caption playlist (12 s segments), press-gallery logs, `wh.live` (60 s) | GitHub Actions cannot do this (5-min floor, 2–38% of runs delivered). It needs Durable Object (DO) alarms, or a loop on the home PC. |
| **Capture it during the event or lose it** | Senate floor caption playlists 404 after the day; live tallies are ephemeral | An **in-session loop is mandatory** for F1 text. A missed day is recoverable only as next-day Congressional Record text. |
| Server-side only (browsers are blocked) | HouseLive (CORS pinned), Clerk and senate.gov XML/JSON, whitehouse.gov/live, YouTube RSS, repcloakroom (duplicate ACAO), SEC (no CORS) | A backend is required. A browser can read directly only from the FR API (`*`), the press-gallery WP REST (reflects Origin), congress-legislators (`*`), and the House/Senate media CDNs (`*`). |
| Long-lived streams | DomeWatch SSE, Bluesky Jetstream | **Optional.** Polling works: DomeWatch with a key, and Bluesky `getAuthorFeed` (`max-age=30`). No box is needed for these. |
| ffmpeg plus a speech model | Executive speech-to-text (D-010) | **The only hard always-on-machine requirement.** It goes on the home PC (D-003), CPU-first. |
| Secrets | api.data.gov, DomeWatch, YouTube and DVIDS keys | Keep them in Worker secrets, never in the Pages bundle. |
| Large documents on a 10 ms CPU budget | Senate vote menu (full parse 6–12 ms on a fast desktop); WH RSS (593 KB) | Conditional GET plus head-only parsing, or Workers Paid ($5). |
| Stale upstream caches | FR API (`Age` > 1 h despite `no-store`); Congress.gov (`max-age=1800`); WH feeds (`max-age=300`) | Per-source `cacheSalt` and a rolling `fromDateTime`. Log the `Age` header. |

**Answer to "does any source REQUIRE an always-on process?"** Two things do:
1. **In-session continuous capture** of floor captions and live tallies. A DO alarm loop can do it if Cloudflare can
   reach the Akamai and Azure media CDNs within the CPU budget, which is UNVERIFIED and is the job of the Phase 1 probe.
   Otherwise the home PC does it.
2. **Speech-to-text**, which must run on the home PC.

The discrete-event feed (F5–F7 and F9–F11) needs no dedicated always-on server. It only needs a scheduler faster and
more reliable than Actions cron.

### 3.2 Option A: Cloudflare Workers Free, with the app on GitHub Pages (recommended backbone)

```
 .gov XML/JSON/RSS, HouseLive, caption playlists ──conditional GET, head-only parse──┐
                                                                                      ▼
 Cloudflare Workers Free:  cron (1 min) ─┐   PollerDO "hot" (alarm ~20-30 s) ─┐
                           supervisor     ├─► HubDO: SQLite + FTS5, dedupe/merge by dedup_key,
                                          │   revisions, latency ledger, source health
                           PollerDO "warm" (alarm ~60 s) ──────────────────────┘
                                   HubDO ─► /api/v1/events?since  /api/v1/status  /feed.json
                                         ─► /api/v1/live (hibernating WebSocket) ─► ntfy, later Web Push
 GitHub Pages: static Preact PWA (reads the API; macOS look)   GitHub Actions: CI, deploys, nightly archive only
```

- **Latency per feature** (our pipeline, after the source publishes):
  - F9/F10/F11 and F5/F6: ~10–30 s on hot sources, ~30–90 s on warm. Add the source's own CDN floor, e.g. the WH feed
    is served from the edge with `max-age=300`.
  - F7: ≤5 min.
  - F1/F2 text: about one poll after each caption segment (~15–60 s), if the probe shows the media CDNs are reachable.
  - F3/F4 detection: 60 s poll plus the 60 s edge cache.
  - WebSocket to an open page: under 1 s. ntfy and Web Push latency is UNVERIFIED.
- **Monthly cost:** $0. ARC's arithmetic for 30 sources (not yet run on Cloudflare) uses about 10% of the free DO
  request, row-write and duration quotas.
- **Ops burden:** low to medium. One deployable unit (wrangler) and one account. Secrets live in GitHub and in the
  Worker.
- **Failure modes and mitigations:**
  - .gov sites may block Cloudflare's egress IPs (untested). Move those sources to the home PC.
  - CPU overrun (error 1102). Use head-only parsers, give a heavy source its own DO, or move to the $5 plan.
  - An alarm can be dropped after 6 failed retries. The supervisor cron re-arms it.
  - The daily request cap of 100k. Static assets stay free.
  - Vendor lock-in. Adapters are pure TypeScript functions, so they also run in Node.
- **Growth path:**
  - Transcripts arrive through `POST /api/v1/ingest` from the home PC.
  - Web Push is sent from the Hub (Phase 6).
  - A native iOS app later uses the same `/api/v1`.
  - F12 sources are added as more adapters.

### 3.3 Option B: GitHub Actions cron with GitHub Pages ("git scraping"). Not suitable for live updates

```
 Actions schedule (*/5, best-effort) ─► pollers ─► commit data/*.json ─► Pages build (~25 s p50) ─► browser polls JSON
```

- **Latency:** every feature class lands 15 min to several hours late. Measured cron gaps had a p50 of 11–13 min in
  the best repos and ~5 h in the 2%-delivery repos. The browser cache adds up to 10 min (Pages sends `max-age=600`).
- **Cost:** $0.
- **Ops burden:** low, but unreliable.
- **Failure modes:**
  - Scheduled runs are dropped at peak load.
  - Public repos are auto-disabled after 60 days without activity.
  - The Actions terms bar activity unrelated to the project.
  - The repo grows with every data commit.
- **Growth path:** none toward transcripts or push.
- **Use it for:** CI, deploys, a nightly JSONL archive, and a "last known data" mirror (D-008).

### 3.4 Option C: Option A plus the home PC as a producer (needed for speech-to-text)

```
 allowed non-YouTube HLS (DVIDS, agency, chamber) ─► home PC: ffmpeg ─► VAD ─► CPU small.en / Parakeet / Nemotron ─┐
 Senate caption capture (if the DO cannot)        ─► home PC: Node loop ─────────────────────────────────────────────┤ HMAC-signed
 sources that block Cloudflare's IPs              ─► home PC: pollers ───────────────────────────────────────────────┘ POST /ingest
                                                                                       (outbound only) ─► HubDO (Option A)
```

- **Latency:**
  - Speech-to-text: about 15–30 s after the audio (estimate). Measured: 5 s chunks cost ~2 s each on GPU; CPU
    `small.en` ran at 14.5× real time with ~8% disagreement against the human captions.
  - Everything else is the same as Option A.
- **Cost:** $0 cash (electricity only).
- **Ops burden:** medium. A Windows service, power, the ISP, update reboots, and staying out of the way of the
  owner's GPU work (D-003).
- **Failure modes:** if the PC is off, transcripts pause and their sources show as **stale**; the rest of the feed is
  unaffected. The ingest endpoint must be protected against abuse with an HMAC, a replay window and schema validation.
- **Growth path:** live executive text (F3/F4), plus a fallback for any source that blocks Cloudflare.

**Degraded mode (not an option on its own).** If the Worker is down, the page can still read the CORS-open sources
directly: FR Public Inspection, the press-gallery WP REST logs, and the Senate caption playlists (whose URL is
deterministic). Show a banner saying "reduced live mode" and offer no history or alerts. Building this is optional
(Phase 2+).

### 3.5 Latency by feature for each option

| Feature class | A (CF Free) | B (Actions + Pages) | C (A + home PC) |
|---|---|---|---|
| F9, F10 (WH, FR) | source + 1–2 min (WH CDN can add ≤5 min) | 15 min–hours | as A |
| F5, F6 votes; F2 actions | source + 20–60 s | 15 min–hours | as A |
| F1, F2 caption text | ~15–60 s after speech (if the probe passes) | none | ~15–35 s (dedicated loop) |
| F3, F4 "live now" | ~1–2 min | 15 min–hours | as A |
| F3, F4 live text | none (embed the player only) | none | ~15–30 s for allowed streams |
| F7 agendas | ≤5 min | ≤hours | as A |
| Push to an open page | < 1 s (WebSocket) | none | as A |

### 3.6 Recommendation, and how it changes with budget

**Adopt Option A now. Design the `/ingest` contract from day one so that Option C plugs in without rework. Keep
Option B for CI, deploys and archive.** This matches `docs/ARCHITECTURE.md`. Option A is the only one documented or
measured to give sub-minute updates and push for free without a machine at home. Option C is needed only for
speech-to-text and for sources that block Cloudflare.

| Budget | What changes | What it unlocks |
|---|---|---|
| **$0** (current, D-001) | A + C. Head-only parsers to fit 10 ms of CPU; `*.github.io` and `*.workers.dev` addresses; ntfy's anonymous tier (250 messages/day per IP; the Worker's egress IP is shared, so this is UNVERIFIED); Web Push on iOS 16.4+ (free, no Apple account); speech-to-text only on the home PC; no AI summaries; no X | Everything in Phases 1–8 except AI summaries, paid alerts and a native app |
| **A few dollars a month** | Workers Paid **$5/mo** (30 s CPU, 10k subrequests, 10M requests/month, Workers AI beyond the free ~214 audio-minutes/day); custom domain ~$10/yr (price UNVERIFIED); Pushover $4.99 one-off or ntfy Supporter $6/mo | Full parsers, no CPU anxiety, a reliable alert channel, a nicer URL |
| **~$20–50/month** | The above, plus Claude Haiku 4.5 summaries of P0–P2 items (**$5–20/mo**, with quote-verification guardrails), CourtListener Tier 1 (**$10/mo**: unlimited docket alerts, real-time opinion alerts), and hosted streaming speech-to-text for executive events (AssemblyAI ~**$9/mo** at 2 h/day; it still needs a legal non-YouTube audio source, D-010) | Plain-English summaries, lower-court tracking, executive transcripts without the home PC |
| Above that, or not recommended | X API (~$56/mo for ~25 accounts); Apple Developer $99/yr (native app, D-015 defers it); licensed market quotes | Senate GOP cloakroom posts (X only); App Store; prices |

---

## 4. Source tiering for build order

The canonical rows are in [`docs/SOURCES.md`](../SOURCES.md). This list adds the cross-report findings, flagged as
**Δ**: places where this synthesis moves a source relative to that catalog.

**Tier 1: cheap, high value, verified. Build first (Phases 1–3).**

| source_id | Feature | Why it is Tier 1 |
|---|---|---|
| `fr.api` | F10, F9 | No key, CORS `*`, fixed filing slots, trivial JSON parse (0.2 ms), live every business day. **The best first live source.** |
| `wh.feeds` | F9, F11 | Breaking source for EOs; 304s work; GUID dedupe; live every business day. |
| `wh.live` | F3, F4 | The only free "White House is live" signal; one HTML attribute. |
| `senate.lis.votes`, `house.clerk.votes` | F5, F6 | Official, member-level, fixture-tested now and live from Nov 9. |
| `house.clerk.floor` | F2, F5, F7 | Official; minute-level stamps; If-Modified-Since gives 304. |
| `senate.schedule`, `senate.pressgallery` | F1, F5, F7, F8 | The fastest nonpartisan Senate narrative; the WP REST API is browser-callable. |
| `members` | identity | CC0; the bioguide ↔ LIS join that every vote needs. |
| `house.floorcast` | F2, F5, text | Undocumented but allowed (D-009); the House caption transcript and the 304-friendly history poll. |

**Tier 2: next (Phases 3–5).**
- `senate.captions` and `house.media`: live floor text.
- `house.domewatch`: needs a free key; partisan, so labelled; quarantine its test records.
- `house.docs.floor` and `house.committee`: agendas.
- `house.repcloakroom`: the vote series is posted before voting.
- `senate.dems`: partisan; schedule hints.
- `congress.api`: needs the api.data.gov key; committee meetings, nominations, `/house-vote`.
- `bsky.official`: corroboration.
- `state.feeds`, `war.feeds` (including the DVIDS Live API) and `fed.feeds`.
- **Δ `scotus.html`**: the slip-opinion and orders HTML pages are allowed by robots, answer If-Modified-Since with 304,
  and are needed for the D-012 "Supreme Court rulings" alert. They move up from Tier 3. Only `/rss/` waits for the
  owner.
- **Δ `govinfo.rss`** (no key): CREC "Record is out", BILLSTATUS batch, bills, plaw. A cheap F11 backbone before the
  Congress.gov key arrives.

**Tier 3: later, or research first (Phase 7+).**
- `scotus.rss` (owner decision, §8).
- `courtlistener` and **Δ `pacer.dcd`**: the key-free D.D.C. docket RSS; entries appear within minutes; filter it
  against a watchlist.
- `cbo.gao` and `senate.noms` (nightly).
- **Δ `oira.review`**: White House regulatory review XML; daily; a leading indicator for major rules.
- `factbase`, `bno.pool`, `trumpstruth`: third-party; terms first (D-009).
- `youtube.api`: `videos.list` only.
- The F12 set.
- **Research items:**
  - the HouseLive socket.io endpoint (is it a push channel?);
  - SCOTUS `hermes_transfer.xml` (an early signal for order lists?);
  - the CPU speech-to-text bake-off: Nemotron-en vs Parakeet vs faster-whisper;
  - the in-browser House 608 captions path.

**Excluded** (unchanged from `docs/SOURCES.md`):
- C-SPAN: its terms forbid bots and AI use.
- YouTube captions and audio: D-010.
- The X API: D-001.
- GovTrack's API: retired; robots disallows `/api`.
- ProPublica: dead.
- The federalregister.gov and congress.gov HTML pages: blocked; use the APIs.
- AP, Reuters and Politico.

---

## 5. Proposed phased roadmap (simple first, gated)

No phase starts until the previous phase's exit criteria are met **and tested** (CLAUDE.md directive 4). Each exit
criterion is something a session can demonstrate.

**Phase 0: repo, harness, CI. Done 2026-10-02.**
- The gate, ship_state, handoff lint and cold-start workflow exist, CI is green, and the Pages placeholder is live.
- Six verified reports exist, plus this synthesis.
- Owner decisions D-001 to D-015 are recorded.
- The recess-proof `fixtures/` set is recorded, including negative cases.

**Phase 1: a thin vertical slice, end to end.** Two live sources become events, get stored, and appear on the phone.
- **1a. Accounts (owner-led).** A free Cloudflare account and API token, and a free api.data.gov key, stored as
  secrets (ROADMAP P1.1). The scaffold can proceed without them.
- **1b. Scaffold.**
  - npm workspaces: `packages/schema`, `packages/adapters`, `workers/api`, `apps/web`.
  - Check current tool versions and pin them, e.g. Preact 10.29.x (Preact 11.0.0 is 2 days old) and Vitest 4.x for the
    Workers test pool.
  - Event schema v0.1 becomes TS types, a JSON Schema and a validator (`docs/EVENT_MODEL.md` Phase-1 minimum).
- **1c. Probe.** Deploy a probe Worker that fetches the slice sources plus every other Tier 1–2 source from
  Cloudflare. Record for each: status, which validator gets a 304, bytes, and parse CPU. Also run the DO-alarm CPU
  test (a deliberate ~20 ms busy loop) and an alarm-jitter test.
- **1d. Adapters**, written as pure functions with golden tests on fixtures:
  - `fr.api`: Public Inspection `current.json`, with a cache-buster on every call, and the newest `documents.json`;
  - `wh.feeds`: the `/news/feed/` umbrella, deduped by GUID.
- **1e. Worker.**
  - A **1-minute cron** runs the two adapters and writes to a HubDO (SQLite): dedupe and merge by `dedup_key`,
    `first_seen_at`, the latency ledger, and source state (validators and errors).
  - It serves `GET /api/v1/events?since=`, `/api/v1/status` and `/feed.json`, with CORS for the Pages origin.
  - DO alarms and WebSockets wait for Phase 2: one cron fits these two sources' fixed slots and 5-min CDN floor.
- **1f. Web v0.**
  - Preact on GitHub Pages: a single-column, phone-first feed.
  - Each row shows the time, an origin chip, the title, `official_text` and the source link.
  - A header line shows the "last updated" time and each source's health.
  - Light and dark modes; system font; it polls the API every 15 s with `cache: "no-cache"`.

**Exit criteria for Phase 1:**
1. The gate is green locally and in CI, and includes these tests:
   - the schema validator rejects a malformed event;
   - each adapter's golden test passes, and every `NEGATIVE` fixture emits zero events;
   - re-ingesting the same fixture creates no duplicates (the test fails if dedupe is removed).
2. The public page loads on the owner's phone **over cellular**, in light and dark mode.
3. On 2 or more business days, the ledger shows at least 5 Public Inspection documents and at least 1 White House
   item. The PI median of `first_seen_at` minus the filing-slot time is ≤ 90 s (n ≥ 5).
4. Fail-closed behaviour is tested with Playwright: a stopped poller shows as **stale** within 2× its cadence, and a
   down API shows "live data unavailable", never an empty feed.
5. The probe table is in `docs/SOURCES.md`, and the CPU and egress findings are DECISIONS rows.

**Phase 2: Congress pipelines on fixtures, then real-time plumbing.**
- Adapters for `senate.lis.votes`, `house.clerk.votes`, `house.clerk.floor`, `senate.schedule` and
  `senate.pressgallery`, plus the `members` join.
- Member-vote side records (one per roll call) and a vote inspector.
- PollerDOs on alarms (hot ~20–30 s, warm ~60 s) with a supervisor cron.
- `/api/v1/live` over a hibernating WebSocket, falling back to `?since=` polling.
- Calendar-aware staleness: recess, weekends, FR publication days.
- **Opportunistic:** record live fixtures at the Oct 5 pro forma sessions (Senate caption segments and HouseLive
  `/latest/*`).
- **Exit criteria:**
  - All vote and floor adapters pass golden and negative fixture tests: the 200-with-error roll, the HTML "File Not
    Found", the double-space Senate dates, and naive Eastern times.
  - A fixture event replayed through the Hub reaches the open phone page in under 2 s over the WebSocket.
  - During recess, the status page shows "in recess until Nov 9", not "stale".

**Phase 3: live Congress from Nov 9, agendas, and White House "live now".**
- HouseLive (labelled unofficial), DomeWatch with a key (labelled partisan; quarantine test records), the docs.house.gov
  weekly schedule, House and Senate committee meetings, and the Senate Democrats RSS (labelled).
- A **Today** view (F7).
- The `wh.live` detector, plus `videos.list`, plus the embedded official player.
- **Pre-register** the latency measurement in its own commit, then run the harness Nov 9–10.
- **Exit criteria:**
  - Measured `first_seen − occurred` per source, n ≥ 20 actions and votes per chamber, recorded in `docs/SOURCES.md`.
  - A White House live event flagged within ~2 min (n ≥ 1, measured).
  - The Today view lists that day's floor schedules and hearings for both chambers.

**Phase 4: macOS UI and alerts.**
- A three-pane layout: sidebar, feed, inspector.
- P0–P4 importance tiers (rules only), FTS5 search, keyboard navigation, light and dark modes.
- ntfy alerts for the D-012 classes.
- **Exit criteria:**
  - The owner confirms daily use.
  - Each D-012 alert class fires once in a fixture test and at least once live.
  - The iOS ntfy delivery delay is measured: it has known issues and is UNVERIFIED today.

**Phase 5: live text.**
- Senate floor captions: dedupe the roll-up cues and parse the `SEN. X:` / `THE PRESIDING OFFICER:` tags. Capture in
  a DO loop, or on the home PC if the probe fails.
- The House caption relay.
- The House speaker heuristic, scored against a hand-labelled 30-min slice before it appears in the UI, and always
  labelled "inferred".
- Executive speech-to-text, CPU-first, on the home PC, for DVIDS and other allowed streams only. Register its
  acceptance bar first, e.g. real-time factor ≥ 5, chunk p95 < 3 s, word error rate vs captions < 12%.
- **Exit criteria:**
  - Floor text within ~30 s of speech (measured, n ≥ 20 segments).
  - The precision of the House speaker labels is published, and labels show only above an agreed bar.

**Phase 6: PWA.** Manifest, service worker and Web Push, including the declarative payload for iOS 18.4+.
**Exit:** a push arrives on the owner's iPhone while the home-screen app is closed.

**Phase 7: breadth (F11).**
- SCOTUS HTML.
- Congress.gov bills and nominations, and GovInfo.
- CBO/GAO, OIRA, and the agency RSS feeds.
- PACER D.D.C. and CourtListener.
- The third-party schedule sources, after their terms are checked.

**Exit:** each new source has golden tests, a health row, and a measured latency.

**Phase 8: F12 plugins, off by default.** **Exit:** an owner opt-in toggle per plugin, and no market prices.
**Later:** a native iOS app (D-015), AI summaries and Workers Paid (D-001).

**Differences from the current `docs/ROADMAP.md`:**
- ROADMAP's Phase 1 (accounts, scaffold, probe) and Phase 2 (FR and WH live, votes from fixtures, DO alarms and
  WebSocket) are re-cut here into a **thinner** Phase 1. It has two live sources on a 1-min cron, client polling, and
  no votes, so the first phone-visible result arrives one phase sooner.
- Votes, DO alarms and the WebSocket move to Phase 2.
- SCOTUS HTML moves from Phase 7 to Tier 2, because D-012 wants SCOTUS alerts and only `/rss/` is blocked.
- Phases 3–8 otherwise match.
- Either ordering satisfies D-004. The build session should pick one and record it.

---

## 6. Event model

The canonical model is **[`docs/EVENT_MODEL.md`](../EVENT_MODEL.md) v0.1**. Its rationale is in
[CUR §2](curation_priorart_future.md#2-event-model-normalized-schema-for-the-unified-feed) and
[ARC §5](architecture_hosting_frontend.md). In short:

- **An event is a state change of a real-world object.** It is append-only; corrections are `revision + 1` with
  `supersedes`. A vanished item gets `retracted`; nothing is ever hard-deleted.
- **Identity:**
  - `object_key`, e.g. `vote:senate:119:2:256`, `fr:2026-20321`, `eo:14434`, `bill:119:hr:5334`, `live:youtube:<id>`.
  - `dedup_key` = `object_key#transition`. The same key from two sources **merges**: the union of sources, the
    earliest `first_seen_at`, and field values by source priority (official XML > Congress.gov > third-party >
    free text).
  - `thread_key` groups an object's lifecycle, e.g. one EO from the WH post to PI to publication.
- **Clocks:** `occurred_at`, `source_published_at`, `first_seen_at` and `broadcast_at`. **Never** treat a source's
  timestamp as the time it first appeared. These all lie in small ways:
  - Congress.gov `updateDate`
  - GovInfo `pubDate`
  - Senate `modify_date`
  - WH `pubDate`
  - the BLS 07:51 stamp for an 08:30 release
- **Display:**
  - `official_text` (verbatim) is always shown.
  - `title` is generated by rules (no AI in v1).
  - Every source carries `license` and `affiliation`: official-nonpartisan, official-partisan, executive-messaging,
    independent, third-party or unofficial.
  - `provenance.confidence` is `high` or `inferred` (e.g. House speaker labels).
- **Side records:**
  - member positions, one blob per roll call (`member_votes_ref`);
  - transcript segments, per stream per day, not stored in the Hub's events table.
  - `vote.tally` ticks are ephemeral and never stored.
- **Source registry fields** (one entry per adapter; from ARC §2.4 and CUR §4.3):
  - `conditional`: `etag`, `lastmod` or `none` (e.g. senate.gov and the Clerk need `lastmod`);
  - `cacheSalt`: `none` or `minuteBucket` (FR);
  - `cadence` (in-session and off-hours);
  - `parser`: `headOnly` or `full`;
  - a UA override (State needs a browser-like UA);
  - `affiliation` and `license`;
  - `validators`: root element, minimum size and content type, so 200-with-error bodies fail closed;
  - a calendar-aware freshness SLO;
  - a rate budget per host.
- **Cross-source link rule (WH ↔ FR):** normalized title equality, |WH pubDate − FR `signing_date`| ≤ 3 days, and a
  matching subtype. On a match, attach `eo:` and `fr:`, and keep `wh:` as an alias.
- **Output:** JSON Feed 1.1 (`/feed.json`), with our fields under `_ced`.

---

## 7. Risks, mitigations, and legal/ToS notes

### 7.1 Risks and mitigations

| Risk | Evidence | Mitigation |
|---|---|---|
| Undocumented or fragile sources change without notice | HouseLive runs on an Azure slot hostname (`…-003`); whitehouse.gov/live's flag is a theme attribute; the Senate caption URLs follow a JavaScript convention | Contract tests on fixtures. Canaries that alert when the attribute or host disappears. Re-derive the HouseLive base URL from the live.house.gov bundle. Keep official fallbacks (the Clerk XML; the next-day Congressional Record). |
| Silent bad data | Clerk roll returns 200 with a 65 B error body; docs.house.gov returns 200 with an 82 KB HTML "File Not Found"; DomeWatch has a test vote in production; endpoints go stale behind a healthy `/health` | Content validators. Quarantine. Fail closed. Freshness SLOs per endpoint, not per host. |
| Cloudflare egress blocked or CPU exceeded | Untested. Some agency sites block scripts (war.gov homepage, HHS, Commerce) | The Phase 1 probe. Move blocked sources to the home PC. Head-only parsing. Workers Paid with evidence (D-001). |
| Timestamp lies and time-zone traps | Last-modified dates posing as event times; naive Eastern time strings; "EST" labels in daylight time; double spaces in Senate dates | The three-clock model, our own `first_seen_at`, parsing with an explicit America/New_York zone, and the raw string kept in provenance. |
| Recess silence mistaken for an outage | Congress is out until Nov 9 | Calendar-aware staleness and a "recess until …" banner. |
| Partisan leakage | DomeWatch whip text ("VOTE NO"); the cloakrooms | Affiliation chips, whitelisted factual fields only, and corroboration from official sources (D-009). |
| Third-party dependency for the President's schedule | Factba.se and BNO: no terms found; Factba.se files disagree with each other field by field | Link out until terms are checked (D-009). Merge field by field, keyed on ETag. |
| Quota and key exhaustion | DEMO_KEY ran out in minutes; the GDELT DOC API returned 429 on its first call; CourtListener allows 125/day | Real keys on day 1, per-host token buckets, and never DEMO_KEY in CI. |
| Platform changes | Cloudflare changed its subrequest limits (Feb 2026); YouTube's quota changed (Sep 2026); Congress.gov changes almost monthly; Workers Logs pricing changes Dec 1, 2026 | Pin versions. A schema-drift hash per source. Portable adapters. |
| Home PC contention or outage | D-003: the PC runs other GPU work | CPU-first speech-to-text. Never on the critical path. Its sources show "stale" when it is off. |
| Congress numbering reset | The 120th Congress starts Jan 3, 2027: Senate vote paths become `vote1201/` and House rolls restart | Hard-code nothing. Derive the congress and session from the source's own data. |
| AI honesty (if ever enabled) | A wrong EO summary would be very damaging | AI is off in v1. If enabled later: quote-verified claims, the number and name regex check, and `official_text` always shown (CUR §3.6). |

### 7.2 Legal and ToS notes (personal, non-commercial, public site, no licence on the code per D-014)

- **US government works are public domain** (17 U.S.C. §105).
  - whitehouse.gov says government materials are not copyrighted, and third-party content on it is CC BY 3.0.
  - senate.gov content "may be distributed or copied unless otherwise specified".
  - The Clerk and HouseLive floor and broadcast payloads carry a 17 USC 105 notice. **The caption transcript payloads
    do not, and the captions are vendor-produced**, so do not label caption text "public domain".
- **Floor video rules.** House Rule V forbids using floor coverage for any political purpose, in commercial
  advertisements, or with commercial sponsorship (older House Manual text). The Senate has a similar campaign-use bar
  (from a search summary only). **No ads or sponsorship on the site, ever.**
- **YouTube:** embedding is fine. Automated access, downloading, and fetching captions you do not own are not. Never
  scrape `/channel/<id>/live` HTML.
- **C-SPAN:** no bots, no AI use including prompting, and no live retransmission. Link out only.
- **Use the API or RSS, never the HTML:**
  - federalregister.gov walls its website HTML. The API and `raw_text_url` work.
  - congress.gov returns 403 for HTML and its robots.txt blocks ClaudeBot and similar agents. Never point an AI
    browsing tool at congress.gov.
- **supremecourt.gov:** robots.txt has `Disallow: /rss/` and `Crawl-delay: 1` (re-checked 18:12Z). The HTML pages are
  allowed.
- **Third parties:**
  - Factba.se: no terms page found, and rollcall.com blocks AI bots. Link only until permission is recorded.
  - BNO: robots allows everything, but permission is advisable.
  - trumpstruth.org: no reuse terms stated.
  - DomeWatch: "attribution appreciated"; keys can be revoked for abuse.
  - CourtListener: "Attribute honestly"; no multiple accounts to get around limits.
  - DVIDS: public domain unless marked; do not imply endorsement.
  - SEC: a declared User-Agent and at most 10 requests/s.
- **Do not ingest:** AP (robots disallows its RSS), Reuters (its notice bans automated collection), Politico, or the
  NewsAPI free tier. Do not show market quotes without a licence.
- **Apple:**
  - Do not self-host SF Pro: the font licence forbids website use.
  - Do not use SF Symbols on the web.
  - Keep Apple trademarks out of the app name and icon.
  - Use the system font stack, Inter, and Lucide icons (ISC licence).
- **GitHub:** Pages is not for SaaS, and Actions must not be a 24/7 scraper (its terms bar non-project activity).

---

## 8. Decisions the owner must make

### 8.1 Already settled (do not re-ask; see `docs/DECISIONS.md`)

Budget $0 (D-001). Public repo and site (D-002). The always-on machine is the home PC, not the 2080 box; Cloudflare,
the api.data.gov key and Oracle are allowed (D-003). All four priority areas (D-004). Undocumented, partisan and
third-party sources allowed with labels (D-009). Embed the White House player plus speech-to-text only where allowed
(D-010). Push grant (D-011). Alert classes (D-012). Page address left to the agent (D-013). No code licence (D-014). PWA
before a native iOS app (D-015).

Several report questions are answered by these rows:
- latency vs $0;
- undocumented sources;
- the X API;
- the home box;
- repo visibility;
- audience;
- the domain;
- alerts;
- iOS;
- next-day vs live text;
- inferred speakers (allowed when labelled, per D-009 and directive 5).

### 8.2 Still open (merged and deduplicated from all six reports)

1. **Supreme Court feeds.**
   - *Situation:* the Court's official RSS feeds and per-case docket files sit under a path its robots.txt asks bots
     to avoid. Its opinion and order **web pages** are allowed. They cover the "Supreme Court rulings" alert you asked
     for (D-012).
   - *Choice:*
     - (a) use the allowed web pages only: free, fully reversible, covers opinions and orders, misses per-case docket
       updates;
     - (b) also poll the RSS and docket files slowly, like a feed reader: adds per-case tracking, but goes against the
       site's stated wish;
     - (c) leave out the Supreme Court.
   - *Recommendation:* **(a)**.
2. **Asking third parties for permission.**
   - *Situation:* the only machine-readable presidential schedule is Roll Call's Factba.se. The fastest pool reports
     come from BNO News. Trump's Truth Social posts come from an archive run by a political group. D-009 says link out
     until their terms are checked, and none of them publish terms.
   - *Choice:*
     - (a) I draft short permission emails and you send them from your address (outward-facing, in your name; one
       email each);
     - (b) link out only, indefinitely: the Today view then has no structured presidential schedule;
     - (c) drop these sources.
   - *Recommendation:* **(a)**. Until replies arrive, show link-outs only.
3. **Keeping floor transcripts.**
   - *Situation:* the Senate's official caption files disappear after each day, so whatever we capture becomes the only
     copy outside C-SPAN and the next-day Record.
   - *Choice:*
     - (a) keep everything (small text, ~1–2 MB a day; archived to free Cloudflare storage);
     - (b) keep 90 days;
     - (c) live day only.
   - *Recommendation:* **(a)**. It costs $0 and can be reduced later; a day that was not kept cannot be recovered.
4. **What counts as "the administration" for live detection.**
   - *Situation:* alerts are already limited to the President and Press Secretary going live (D-012). The feed itself
     can track more people.
   - *Choice:* track the President, VP, Press Secretary, the 15 department heads and the Fed Chair, or a narrower or
     wider list.
   - *Recommendation:* that list. It is cheap to change later.
5. **Defaults for noisy categories.**
   - *Situation:* about 100 Federal Register documents arrive per business day (82% routine notices), 100 new bill
     texts arrived on a single night, and the House alone held 20 committee events on one day.
   - *Choice:*
     - (a) hide routine items by default (notices, ceremonial resolutions, procedural votes, subcommittee meetings),
       keeping them in an "All" view;
     - (b) show everything.
   - *Recommendation:* **(a)**. A filter toggle reverses it.
6. **Things to follow or pin.**
   - *Situation:* ranking and alerts improve if we know your interests, such as your state's delegation, specific
     members, agencies or topics.
   - *Choice:* name them now, or start with none.
   - *Recommendation:* name your state if you're willing. Everything else can wait.
7. **Lower courts.**
   - *Situation:* many cases about the administration are in the D.C. federal district court, whose docket feed is
     free and arrives within minutes.
   - *Choice:*
     - (a) Supreme Court only;
     - (b) also a curated watchlist of major D.C. cases (Phase 7; a free CourtListener account is optional).
   - *Recommendation:* **(b)**, in Phase 7.
8. **More free sign-ups as their phases arrive.**
   - The services are: a DomeWatch key (live House tallies), a Google/YouTube key (live-stream details), a DVIDS key
     (War Department webcasts), Healthchecks.io (an outage alarm), ntfy (alerts), and later CourtListener.
   - Each is free and each is still asked one at a time (OWNER_GRANTS).
   - *Choice:* agree in principle now, or decide each when asked.
   - *Recommendation:* agree in principle. The walkthrough happens when each is needed.
9. **Quiet hours for alerts.**
   - *Choice:* deliver alerts at any hour, or hold non-urgent ones overnight.
   - *Recommendation:* ring overnight only for the President going live and for final passage of major votes. Make the
     rest silent overnight.

**Later, when evidence triggers them** (each is a D-001 money decision, asked with the measured reason):
- Workers Paid **$5/mo**, if free CPU limits are hit.
- AI summaries, **$5–20/mo**.
- CourtListener membership, **$10/mo**.
- Hosted speech-to-text, **~$9/mo**.
- A custom domain, **~$10/yr**.
- Apple Developer, **$99/yr**, for a native app.
- The X API, **~$56/mo**.

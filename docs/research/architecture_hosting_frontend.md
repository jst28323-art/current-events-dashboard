# Architecture, free hosting for near-real-time, push, PWA/iOS, macOS-style frontend

Research date: 2026-10-02 (UTC 15:30–16:25). Dimension: ARCHITECTURE + HOSTING + CLIENT (all features F1–F12; the delivery system).

Evidence labels used below:
- **DOC**: read from the vendor's official documentation on 2026-10-02 (URL given; numbers quoted).
- **LIVE**: measured by me on 2026-10-02 with curl, the `gh` API, or a local benchmark (command and result given).
- **UNVERIFIED**: could not be confirmed live today. The reason is stated. Treat it as a hypothesis for the first build session to test.

---

## 0. TL;DR

1. **"GitHub Actions cron writes JSON, then GitHub Pages serves it" cannot be the live path.** I measured three public repos running a `*/5` cron. The best one got only 32% of its scheduled runs, with a median gap of 12.9 min and a max of 57 min. The other two got about 2%, with median gaps around 5 hours. Pages builds then add about 48 s at p50, and the Pages CDN sends `Cache-Control: max-age=600` to browsers. Expected end-to-end latency is 15 min to hours (LIVE). [verifier 2026-10-02: corrected — the cron-gap table reproduced exactly, and two non-Upptime `*/5` repos show the same split (borestad/firehol-mirror 38%, p50 11.4 min; bluez/bluetooth-next 2%, p50 325 min). The "48 s Pages build" figure is wrong, though: it came from CodeQL code-scanning runs, not Pages deploys. The GitHub Pages builds API for the same 3 repos gives n=152, p50 24.6 s, p90 35.8 s, max 382 s. The conclusion does not change. See §2.2.] Actions is still useful for CI, deploys and the daily archive.
2. **Recommended backbone (Architecture A): Cloudflare Workers Free.**
   - A single Worker serves the static frontend (Workers Static Assets: "free and unlimited") plus a small JSON/WebSocket API.
   - A few **SQLite-backed Durable Objects (DOs)** run the pollers. Each uses an **alarm** to get sub-minute cadence; Cron Triggers cannot go below 1 min.
   - A single **"Hub" DO** stores events in SQLite (FTS5 available), deduplicates them, and pushes them to browsers over **hibernating WebSockets**.
   - The design is free at personal scale. Expected latency is about 10–60 s after the upstream publishes.
3. **The binding free-tier constraint is 10 ms CPU per invocation**, not requests. [verifier 2026-10-02: the 10 ms figure is CONFIRMED for Workers (fetch/cron). For **Durable Object alarms on Free** it is UNVERIFIED: the DO limits page lists 30 s with no plan qualifier (see §3.2), so P1 must measure it.]
   - Full XML parsing of the 162 KB Senate vote menu took 6.2 ms warm and 11.8 ms cold on a Ryzen 9 9900X3D (LIVE). Cloudflare's servers will probably be slower.
   - Head-only extraction of the newest items took 0.01–0.2 ms (LIVE). Pollers must therefore use conditional GET (ETag / If-Modified-Since, so unchanged data returns 304 with nothing to parse) and parse only the head of each document.
   - **The $5/mo Workers Paid plan is the first paid unlock.** It raises CPU to 30 s by default, subrequests to 10,000, removes KV write caps, and adds 10M requests/mo.
4. **Transcripts (F1–F4 audio) need an always-on box with ffmpeg and speech-to-text (Architecture C add-on).** The obvious candidate is the owner's RTX 2080 box. It runs faster-whisper and **pushes** normalized events to the Worker's `/ingest` endpoint, so no inbound tunnel is needed. Workers AI Whisper is an alternative at $0.0005/audio-min, with about 214 free audio-min/day. Its ability to take HLS audio is UNVERIFIED.
5. **Alerts and push, in order:**
   - **Phase 2:** ntfy for owner-only alerts. The anonymous tier allows 250 msgs/day per IP (LIVE).
   - **Phase 3:** PWA plus standard Web Push. This works on iOS/iPadOS 16.4+ for Home Screen web apps and needs no Apple Developer account (DOC). Declarative Web Push is available on iOS 18.4+.
   - **Later:** native SwiftUI with APNs. This needs the $99/yr Apple Developer Program and a Mac or a macOS CI runner.
6. **Frontend:** Vite + Preact 10 + @preact/signals + TypeScript, vite-plugin-pwa, Vitest + Playwright (including the WebKit engine). A minimal app is 8.3 KB gzipped, against 68.9 KB for React 19.3 (LIVE build).
   - For macOS feel: use the system font stack (SF Pro appears only on Apple devices; self-hosting it is **forbidden** by the license), Lucide icons (SF Symbols are not licensed for the web), `backdrop-filter` materials, and a sidebar / feed / inspector split view.

---

## 1. What "live" means here: latency classes

| Class | Features | Target (after the upstream makes data available) | Notes |
|---|---|---|---|
| L0 live text/speech | F1, F2, F4, F8, and the transcript part of F3 | 5–30 s behind real speech | Needs captions or STT on audio. No free REST source delivers this. |
| L1 discrete events | F5, F6, F9, F10, F11 | ≤ 60 s after upstream posts | Poll and diff. Bounded by poll interval plus upstream caching (see §2.4). |
| L2 schedules | F7 | ≤ 5 min | Changes rarely. Poll every 2–5 min. |
| L3 history/search | all | n/a | Archive, full-text search, iOS sync. |
| Future | F12 | L1/L2 | Same adapter model: RSS and APIs. |

The real-world event to upstream publication lag is set by each source (covered by the source-research reports). This report covers the upstream to owner's screen part.

---

## 2. Live measurements made today

### 2.1 GitHub Actions scheduled-workflow delivery (LIVE)

Method: `gh api repos/<r>/actions/workflows/uptime.yml/runs?created>=2026-09-30` on public Upptime repos whose workflow declares `cron: "*/5 * * * *"` (I read it from the workflow file). I then computed the gaps between consecutive `schedule` runs. Script: `scratchpad/arch/gaps.py`.

| Repo (public, `*/5` cron) | Window (UTC) | Runs delivered / expected | Gap p50 | Gap p90 | Gap max | Evidence |
|---|---|---|---|---|---|---|
| openfoodfacts/openfoodfacts-upptime | 09-30 00:58 → 10-02 15:42 (62.7 h) | 243 / 753 (**32%**) | 12.9 min | 26.2 min | 56.8 min | gh api 2026-10-02 ~15:50Z |
| hansluk/status | 09-30 01:26 → 10-02 11:13 (57.8 h) | 12 / 693 (**2%**) | 326 min | 398 min | 425 min | gh api 2026-10-02 ~15:50Z |
| Tanic-Labs/telegai-status | 09-30 02:13 → 10-02 10:42 (56.5 h) | 12 / 678 (**2%**) | 289 min | 399 min | 412 min | gh api 2026-10-02 ~15:50Z |

The official doc warns about this (DOC, [events-that-trigger-workflows#schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)):
- "The shortest interval you can run scheduled workflows is once every 5 minutes."
- "The `schedule` event can be delayed during periods of high loads … High load times include the start of every hour. If the load is sufficiently high enough, some queued jobs may be dropped."
- "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days."

[verifier 2026-10-02: CONFIRMED.
- I re-pulled `gh api …/actions/workflows/uptime.yml/runs?event=schedule&created=>=2026-09-30` at ~16:40Z and recomputed with my own script, cut off at 15:45Z. All three rows reproduce exactly: 243/753 32% p50 12.9 p90 26.2 max 56.8; 12/694 2% p50 326.1; 12/678 2% p50 288.7.
- I confirmed all three workflow files declare `cron: "*/5 * * * *"`.
- To test whether this is an Upptime artifact, I sampled two non-Upptime public `*/5` repos found by code search:
  - borestad/firehol-mirror `ci.yml`: 292 runs over 64.6 h, **38%**, p50 11.4 min, p90 23.8, max 58.0.
  - bluez/bluetooth-next `sync.yml`: 13 runs over 61.7 h, **2%**, p50 325 min, max 434.
- The same bimodal pattern (~1/3 delivered vs ~2% with ~5–6 h gaps) holds outside Upptime.
- All three doc quotes were found verbatim.]

### 2.2 GitHub Pages deploy time and caching (LIVE)

- **Deploy time.** openfoodfacts `pages-build-deployment` runs since 2026-10-01T00:00Z: n=127 successful. Created to completed took p50 **48 s**, p90 57 s, max 506 s. About 3 deploys per hour.
  - [verifier 2026-10-02: corrected — these 127 runs are not Pages deploys. In the researcher's own `arch/off_all.tsv` they are the "Push on master" runs, and `gh api repos/openfoodfacts/openfoodfacts-upptime/actions/runs` shows those all have path `dynamic/github-code-scanning/codeql`, which is CodeQL. Recomputing over them gives the same n/p50/p90/max (48/57/506 s). This repo's real `pages-build-deployment` workflow (id 46222179) has `total_count` 9, last run 2026-08-08. So there were no Pages deploys on 10-01/10-02, and "about 3 deploys per hour" is false. Measured Pages build duration from `gh api repos/<r>/pages/builds` for openfoodfacts-upptime, hansluk/status and Tanic-Labs/telegai-status: n=152 (all history), p50 **24.6 s**, p90 35.8 s, max 382 s. These are legacy branch builds; an Actions-based `deploy-pages` workflow was not measured. Time for the CDN to go fresh after a deploy also remains unmeasured.]
- **Headers.** `curl -I https://pages.github.com/` at 2026-10-02 ~15:35Z returned:
  - `HTTP 200`
  - `Cache-Control: max-age=600`
  - `ETag: "689c7eee-386e"`
  - `Last-Modified`
  - `Access-Control-Allow-Origin: *`
  - `Via: 1.1 varnish`, `X-Cache: HIT`
- **Conditional GET.** Repeating the request with `If-None-Match` returned `HTTP 304 Not Modified`. [verifier 2026-10-02: CONFIRMED — 16:30Z: 200, `Cache-Control: max-age=600`, `ETag: "689c7eee-386e"`, `Age: 235`, `X-Cache: HIT`; with If-None-Match: 304.]
- **What this means.** Browsers may reuse a cached copy for up to 10 min unless the client fetches with `cache: "no-cache"`, which forces revalidation. Whether GitHub purges its CDN immediately on deploy is UNVERIFIED (not documented on the pages I read).

### 2.3 Parse CPU on sample upstream payloads (LIVE, local Node 26.3.0, AMD Ryzen 9 9900X3D)

Payloads were fetched today. Script: `scratchpad/arch/bench.mjs` and `bench3.mjs`. The parser is fast-xml-parser 5.11.2.

| Payload | Size | Full parse (cold / warm) | Head-only extraction (cold / warm) |
|---|---|---|---|
| Federal Register API `documents.json?per_page=100` | 146 KB | 0.18 / 0.11 ms (JSON.parse) | n/a |
| FR Public Inspection `current.json` | 169 KB | 0.19 / 0.17 ms (JSON.parse) | n/a |
| Senate `vote_menu_119_2.xml` | 162 KB | **11.80 / 6.20 ms** (XML) | 0.164 / 0.011 ms (first 8 KB, 16 votes) |
| One Senate roll call XML (vote 256) | 28 KB | 1.98 / 1.32 ms | — |
| White House presidential-actions RSS | 579 KB | 1.98 / 0.79 ms | 0.088 / 0.004 ms |

[verifier 2026-10-02: CONFIRMED on the same machine with fast-xml-parser 5.11.2 and a fresh fetch. Senate menu: 12.4 ms cold / 6.4 ms warm median. WH RSS (592,715 chars): 1.7 / 0.76 ms. A regex head-scan of the first 8 KB: 0.10 ms, 17 votes.]

What this means: on the Workers **Free** plan's 10 ms CPU budget, full DOM-style parsing of large XML is already marginal on a fast desktop. Cloudflare's runtime hardware is UNVERIFIED and likely slower. The approach that works within the budget:
- conditional GET, so the common case is a 304 and nothing gets parsed;
- head-only, string-scan extraction of the newest N items;
- one source per invocation for heavy documents.

### 2.4 Upstream caching layers set a freshness floor (LIVE, relevant to every architecture)

| Endpoint | Observed headers (2026-10-02 ~16:01Z) | Implication for the poller |
|---|---|---|
| `https://www.federalregister.gov/api/v1/documents.json?per_page=100&order=newest` | `Cache-Control: no-store, no-cache, must-revalidate, private` **but** `Age: 2767`, then `Age: 2825` 58 s later. Adding a unique query param gave `Age: 0`. | A shared cache in front of the FR API served a ~47-min-old copy. The poller needs a per-source "cache-key salt" (for example a minute-bucket param) so the API answers at most once per minute. At this moment the cached and fresh copies had the same document set, so whether the staleness matters depends on timing. [verifier 2026-10-02: CONFIRMED — 16:31:58Z, plain: `Age: 960`, then `Age: 1024` 3 s later (different cache nodes). Salted `&_cb=<epoch>`: `Age: 0`. Both had 100 results, newest `2026-20322` (publication_date 2026-10-02), and an identical document set.] |
| `https://www.federalregister.gov/api/v1/public-inspection-documents/current.json` | Same no-store header. With a busted cache: `Age: 0`, 107 docs, newest `filed_at` = `2026-10-02T11:15:00.000-04:00` | Same as above. [verifier 2026-10-02: CONFIRMED — 16:34Z: plain `Age: 1174`, salted `Age: 0`. Both had 107 docs, newest `filed_at` 2026-10-02T11:15:00.000-04:00, 173,464 B.] |
| `https://api.congress.gov/v3/bill?format=json&limit=50&sort=updateDate+desc&api_key=DEMO_KEY` | `Cache-Control: public, max-age=1800`, `Age: 584`, `Last-Modified: Fri, 02 Oct 2026 15:52:15 GMT`, `Via: api-umbrella (ApacheTrafficServer)`, `X-Ratelimit-Limit: 10` (DEMO_KEY; it was already exhausted to 0 by parallel research) | Responses can be up to 30 min stale. The source report must decide whether to cache-bust. I made no further DEMO_KEY calls. [verifier: UNVERIFIED — the `max-age=1800` / `Age` headers could not be re-observed. At 16:37Z the DEMO_KEY returned `HTTP 429 OVER_RATE_LIMIT`, `Retry-After: 26561`, `X-Ratelimit-Limit: 10`, `X-Ratelimit-Remaining: 0`. Note the mismatch with api.data.gov's developer manual, which says DEMO_KEY allows "30 requests per IP address per hour" and "50 requests per IP address per day"; a normal key defaults to "1,000 requests per hour". Congress.gov apparently applies a lower DEMO_KEY limit, so the build session must use a real key.] |
| `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml` | HTTP 200, 165,543 B, `Server: Apache`, `Last-Modified: Thu, 01 Oct 2026 03:47:06 GMT`, `ETag: "286a7-65cbf44fc50f3"` | Conditional GET is supported, so polling is cheap. [verifier 2026-10-02: corrected — only **If-Modified-Since** works here. At 16:35Z, `If-None-Match: "286a7-65cbf44fc50f3"` alone returned **200 with the full body** in 3 of 3 tries, and also with `--compressed` and the `-gzip` ETag variant. `If-Modified-Since: Thu, 01 Oct 2026 03:47:06 GMT` returned **304**, as did both headers together. A poller that sends only the ETag downloads all 165 KB every time. Configure senate.gov as `conditional: lastmod`, and have the P1 probe record which validator each source actually honors.] Newest entry: `<vote_number>00256</vote_number> <vote_date>30-Sep</vote_date> <question>On the Nomination</question> <result>Confirmed</result> <yeas>47</yeas><nays>41</nays> <title>Confirmation: Keith Sonderling, of F.L., to be Secretary of Labor</title>` |
| `https://www.whitehouse.gov/presidential-actions/feed/` | HTTP 200, **593,364 B**, `ETag`, `Last-Modified: Fri, 02 Oct 2026 13:46:39 GMT`, `cache-control: max-age=300, must-revalidate`, `x-cache: HIT` | ETag avoids re-downloading about 0.6 MB. A CDN floor of up to 5 min applies. Newest item: "Eliminating Disease-Carrying Pests And Restoring Enjoyment Of The Great Outdoors", `pubDate Tue, 29 Sep 2026 21:23:48 +0000`. [verifier 2026-10-02: CONFIRMED, with one caveat. At 16:36Z the response was 200, 593,364 B, 30 items, the same newest item, `max-age=300, must-revalidate`, `x-cache: HIT`. Both If-None-Match and If-Modified-Since returned 304 (0 B). The gzip transfer is 83,933 B. Caveat: `Last-Modified` had moved from 13:46:39 to **16:19:11 GMT** although the newest item and the byte size were unchanged. So validators can change without a new item, and some polls will still re-download and must be deduplicated by item GUID.] |

**Architectural consequence:** the source registry needs per-source fields for `conditional: etag|lastmod|none` (senate.gov needs `lastmod`, since its ETag is ignored; verifier), `cacheSalt: none|minuteBucket`, `cadence`, and `parser: headOnly|full`. Every event also records `upstream_ts`, `first_seen_ts` and `broadcast_ts`, so that latency is measured rather than assumed.

### 2.5 Frontend baseline bundle size (LIVE, esbuild `--bundle --minify`, gzip -9)

| Minimal counter app | min | gz |
|---|---|---|
| Preact 10.29.8 + hooks + @preact/signals | 21.3 KB | **8.3 KB** |
| Lit 3.3.3 (one LitElement) | 15.8 KB | **6.1 KB** |
| Svelte 5.57.1 (`mount` + one component, compiled with svelte/compiler) | 49.2 KB | 18.4 KB (*) |
| React 19.3.0 + react-dom/client | 222.9 KB | **68.9 KB** |

(*) esbuild may tree-shake Svelte worse than Vite/Rollup. Re-measure in the build session before relying on this number.

[verifier 2026-10-02: CONFIRMED, independently re-built with esbuild `--bundle --minify` and gzip -9. Preact 10.29.8 + hooks + @preact/signals 2.11.3: 21,699 B min / 8,475 B gz. React 19.3.0: 223,578 / 69,099. Lit 3.3.3: 15,771 / 6,138. Svelte was not re-measured. Peer ranges checked: @preact/signals 2.11.3 accepts `preact >= 10.25.0`, lucide-preact 1.50.0 accepts `^10.27.2`, and vite-plugin-pwa 1.3.0 accepts `vite ^8.0.0`, so the Preact-10 pin is compatible.]

### 2.6 Other live checks

- ntfy.sh tiers, from `curl https://ntfy.sh/v1/tiers` (LIVE):
  - anonymous: `"basis":"ip","messages":250` per day, message expiry 43,200 s (12 h);
  - Supporter: $6/mo, 2,500/day;
  - Pro: $12/mo, 20,000/day.
  - [verifier 2026-10-02: CONFIRMED by re-fetching `/v1/tiers`. The report omits that a Business tier also exists ($25/mo, 50,000/day) and that the anonymous tier has `"reservations": 0`, so a *reserved* topic needs Supporter or higher.]
- npm `latest` versions on 2026-10-02 (LIVE, registry.npmjs.org):

| Package | Latest | Release date / note |
|---|---|---|
| @sveltejs/kit | 3.0.0 | **2026-10-01** |
| svelte | 5.57.1 | |
| astro | 7.3.5 | 7.0.0 released 2026-06-22 |
| preact | 11.0.0 | **2026-09-30** (10.x line: 10.29.8 from 2026-08-01) |
| react | 19.3.0 | 2026-09-09 |
| vite | 8.3.2 | |
| lit | 3.3.3 | |
| vite-plugin-pwa | 1.3.0 | |
| vitest | 5.0.3 | |
| @playwright/test | 1.63.0 | |
| @capacitor/core | 8.5.2 | |
| wrangler | 4.147.0 | |
| hono | 4.13.12 | |
| @cloudflare/vitest-pool-workers | 0.22.0 | peer `vitest ^4.1.0`, so **pin Vitest 4.x for Worker tests** |
| @pushforge/builder | 2.0.5 | |
| @block65/webcrypto-web-push | 2.0.0 | |
| lucide-preact | 1.50.0 | |

[verifier 2026-10-02: CONFIRMED — all 16 versions match registry.npmjs.org `dist-tags.latest`. Dates: kit 3.0.0 2026-10-01; preact 11.0.0 2026-09-30, 10.29.8 2026-08-01; astro 7.0.0 2026-06-22; react 19.3.0 2026-09-09; vitest 5.0.3 2026-09-30; wrangler 4.147.0 2026-10-02. `@cloudflare/vitest-pool-workers` 0.22.0 peers `vitest ^4.1.0`.]

- Licenses via `gh api repos/...` (LIVE):

| Repo | License | Notes |
|---|---|---|
| phosphor-icons/core | MIT | |
| tailwindlabs/heroicons | MIT | |
| lucide-icons/lucide | ISC per lucide.dev/license | GitHub reports NOASSERTION; some Feather-derived icons are MIT |
| codedgar/Puppertino | MIT | pushed 2026-10-01 |
| rsms/inter | OFL-1.1 | |
| sakofchit/system.css | MIT | last push 2023 |

[verifier 2026-10-02: CONFIRMED via `gh api`. Lucide shows NOASSERTION on GitHub; its LICENSE file and lucide.dev/license are ISC, with an MIT section covering the Feather-derived icons. Puppertino: MIT, 1,157 stars, pushed 2026-10-01. system.css: pushed 2023-11-26.]

---

## 3. Platform facts (free tiers, 2026)

### 3.1 GitHub Pages + GitHub Actions (DOC)

| Item | Value (quoted) | Source |
|---|---|---|
| Pages on GitHub Free | "GitHub Pages in public repositories". Private-repo Pages needs a paid plan. | [githubs-plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans) |
| Site size | "Published GitHub Pages sites may be no larger than 1 GB." | [github-pages-limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) |
| Bandwidth | "*soft* bandwidth limit of 100 GB per month" | same |
| Builds | "*soft* limit of 10 builds per hour. This limit does not apply if you build and publish your site with a custom GitHub Actions workflow." | same |
| Deploy timeout | "deployments will timeout if they take longer than 10 minutes" | same |
| Use restriction | "not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or … (SaaS)" | same |
| Actions cost | "free for self-hosted runners and for public repositories that use standard GitHub-hosted runners". Private repos on Free get 2,000 min/mo; Linux 2-core costs $0.006/min. | [billing/github-actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Job limit | "Each job in a workflow can run for up to 6 hours of execution time." 20 concurrent jobs on Free. | [actions/reference/limits](https://docs.github.com/en/actions/reference/limits) |
| Actions ToS | Prohibited: "any activity that places a burden on our servers … disproportionate", and "If using GitHub-hosted runners, any other activity unrelated to the production, testing, deployment, or publication of the software project" | [terms for additional products](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) |

[verifier 2026-10-02: CONFIRMED — every quote in this table was found verbatim on the cited docs.github.com pages, fetched 16:4xZ. Also, the events doc now documents IANA-timezone support for `schedule` (not relevant here). A live example of the 60-day auto-disable: modrinth/daedalus `run.yml` (`*/5`) reports `state: disabled_inactivity`.]

**Verdict:** Pages is fine for static hosting of the app shell or docs. Actions is fine for CI, deploys, and a once-a-day archive commit ("git scraping"). Actions is **not** viable as the live ingest loop (§2.1). A long-running 6-hour polling job would work technically but sits in a ToS gray zone, so I do not recommend it.

### 3.2 Cloudflare developer platform (DOC unless marked)

| Product | Free plan | Paid ($5/mo minimum) | Source |
|---|---|---|---|
| Workers requests | "100,000/day", reset at midnight UTC. Over the limit: Error 1027, with fail-open or fail-closed per route. | 10M/mo included + $0.30/M | [workers/platform/limits](https://developers.cloudflare.com/workers/platform/limits/), [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| CPU per HTTP request | **10 ms**. "Each isolate has some built-in flexibility … infrequently runs over". Exceeding gives Error 1102 / `exceededCpu`. | 30 s default, up to 5 min. [verifier: the Paid plan also *meters* CPU: "30 million CPU milliseconds included per month +$0.02 per additional million CPU milliseconds" (workers/platform/pricing, fetched 2026-10-02). It is negligible at this scale but missing from the report.] | limits |
| CPU per Cron Trigger | **10 ms** | 30 s (<1 h interval) / 15 min (≥1 h) | limits |
| Wall-clock duration | HTTP: "No limit" while the client is connected. Cron, DO Alarm and Queue consumer: 15 min. `waitUntil` adds up to 30 s. | same | limits |
| Subrequests per invocation | **50** external, 1,000 to Cloudflare services. "Each subrequest in a redirect chain counts." | 10,000 (configurable to 10M) | limits; [changelog 2026-02-11](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/) |
| Simultaneous open connections | 6 per invocation | 6 | limits [verifier: precise wording is "up to six connections simultaneously waiting for response headers"; a 7th is queued, not failed. Once headers arrive, a connection no longer counts.] |
| Memory | 128 MB per isolate | 128 MB | limits |
| Cron Triggers | **5 per account**. Smallest is `* * * * *` (1 min), UTC. Changes take "up to 15 minutes" to propagate. | 250 | limits; [cron-triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) |
| Static assets | "Requests to static assets are free and unlimited". 20,000 files per version, 25 MiB per file. With `run_worker_first`, requests over the limit get 429. | 100,000 files | [static-assets/billing-and-limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| Durable Objects | "Only Durable Objects with SQLite storage backend are available". 100,000 requests/day, where requests "Includes HTTP requests, RPC sessions, WebSocket messages, and alarm invocations". 13,000 GB-s/day duration. SQLite: 5M rows read/day, 100k rows written/day, 5 GB total. "Each setAlarm() is billed as a single row written." | 1M req/mo + $0.15/M; 400k GB-s/mo + $12.50/M GB-s | [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| DO duration rule | "Durable Objects that are idle and eligible for hibernation are not billed for duration, even before the runtime has hibernated them." Calling `accept()` on a WebSocket (no hibernation) bills "the entire time the WebSocket is connected". There is no charge for outgoing WS messages. Incoming WS messages are billed 20:1. | | DO pricing |
| DO limits | CPU: "Durable Objects are Worker scripts, and have the same per invocation CPU limits as any Workers do" (so 10 ms on Free; the table's "30 s default" applies to Paid). [verifier: UNVERIFIED — this is the researcher's inference, not doc text. The DO limits page (dateModified 2026-06-01) lists "CPU per request 30 seconds (default) / configurable to 5 minutes" with **no plan qualifier**. The 10 ms Free figure appears only on the Workers limits page. The DO CPU limit on Free (10 ms or 30 s) is therefore not stated, and it decides whether DO pollers can full-parse on Free. The P1 probe must measure it, for example with a deliberate 20 ms busy-loop in an alarm on a Free account.] Storage per object: 1 GB on Free per the FAQ (10 GB on Paid). Soft limit of 1,000 req/s per object. 100 classes on Free. | | [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (updated 2026-06-01) |
| DO alarms | "guaranteed at-least-once execution". Retried with exponential backoff from 2 s, "up to 6 retries". One alarm per object. Sub-minute cadence is possible; timing precision is not documented. | | [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) |
| DO SQLite features | FTS5 (incl. `fts5vocab`), JSON extension, and PITR (point-in-time recovery) restore "to any point in the past 30 days" | | [sqlite-storage-api](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) |
| Workers KV | 100,000 reads/day; **1,000 writes/day**; 1 write/s to the same key; 1 GB storage | Unlimited, with 1 write/s per key | [kv limits](https://developers.cloudflare.com/kv/platform/limits/) |
| D1 | 10 DBs; 500 MB per DB; 5 GB per account; 50 queries per invocation; 5M rows read/day and 100k rows written/day; Time Travel 7 days; FTS5 supported | 10 GB per DB; 30-day Time Travel | [d1 limits](https://developers.cloudflare.com/d1/platform/limits/), [sql-statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/) |
| Queues | Available on Free: "10,000 operations/day", retention "24 hours (non-configurable)" | 1M ops/mo + $0.40/M | [queues pricing](https://developers.cloudflare.com/queues/platform/pricing/) |
| R2 | 10 GB-month; 1M Class A and 10M Class B ops per month; egress free. `r2.dev` is "rate-limited and should only be used for development". Production needs a custom domain. | | [r2 pricing](https://developers.cloudflare.com/r2/pricing/), [public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) |
| Pages (legacy path) | 500 builds/mo; 1 concurrent; 20 min timeout; 20,000 files; 25 MiB per file. Docs steer DO users to Workers ("Using Durable Objects with Workers is simpler and recommended"). Private-repo support was not stated (UNVERIFIED). [verifier: the numbers are CONFIRMED on pages/platform/limits (updated Sep 5, 2026). The quote "Using Durable Objects with Workers is simpler and recommended" is UNVERIFIED: it is not on that page or on pages/functions/bindings, and its source is not given.] | | [pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Workers AI | "10,000 Neurons per day at no charge". `@cf/openai/whisper-large-v3-turbo` costs "$0.0005 per audio minute" (46.63 neurons/min), so about **214 free audio-min/day**. `@cf/deepgram/nova-3` costs $0.0052/min. Usage above the free allocation needs Paid. | | [workers-ai pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) (modified 2026-10-01) |

[verifier 2026-10-02: CONFIRMED for every other row in this table. Each quoted number was found on the cited developers.cloudflare.com page, fetched 16:4xZ: Workers limits and pricing, cron-triggers ("up to 15 minutes"), the 2026-02-11 changelog ("Workers on the free plan remain limited to 50 external subrequests and 1000 subrequests to Cloudflare services"), static assets ("free and unlimited", 429 with `run_worker_first`), DO pricing (100,000/day; 13,000 GB-s/day; 5M/100k rows; "Each setAlarm() is billed as a single row written"; 20:1 incoming WS), alarms ("up to 6 retries"), SQLite (FTS5 with fts5vocab, 30-day PITR), KV (1,000 writes/day), D1 (10 DBs, 500 MB, 7-day Time Travel, 50 queries/invocation), Queues (10,000 ops/day, 24 h), R2 (10 GB-month, 1M/10M ops), Workers AI (10,000 neurons/day; whisper-large-v3-turbo $0.0005/min = 46.63 neurons/min, so 214 min/day; nova-3 $0.0052/min; page dateModified 2026-10-01), and quick tunnels (200 in-flight, no SSE). One doc inconsistency: the alarms page says "A Worker can have up to three Cron Triggers configured at once", while the limits page says 5 per account on Free. Plan for 3 per Worker until tested.]

**Can one free cron Worker poll 20–40 sources every minute?**
- **Subrequests:** yes. 40 is under 50, provided no source redirects, since each redirect hop counts.
- **CPU:** yes only if almost every response is a 304 or tiny JSON and changed XML is parsed head-only (§2.3). A single full parse of the Senate vote menu can blow the 10 ms budget.
- **Connections:** only 6 open at once. 40 fetches with a 300 ms upstream response time and 6 in parallel take about 2 s of wall clock, which is fine because there is no wall-clock limit issue (cron allows 15 min).
- **Cadence:** with only 5 cron triggers per account and a 1-minute minimum, a sub-minute cadence needs **DO alarms**.

**Fan-out pattern that fits the free plan** (budget arithmetic in §6A): a small number of "tier poller" DOs, each with its own alarm.
- *hot*, every 20 s: ~8 sources;
- *warm*, every 60 s: ~15 sources;
- *cool*, a 5-min cron: the rest.

Each alarm invocation gets its own 10 ms CPU, 50-subrequest and 6-connection budget. If one source is CPU-heavy, give it a dedicated DO.

**Can a DO push to clients?** Yes. Use WebSocket Hibernation. Clients "remain connected to the Cloudflare network" while the DO is evicted, and "Billable Duration (GB-s) charges do not accrue during hibernation" ([websockets best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)). SSE from a DO is possible, but the DO cannot hibernate while a stream is open, so it is billed for wall-clock the whole time. One always-open SSE DO would use about 0.125 GB × 86,400 s ≈ 10,800 GB-s/day of the 13,000 free. **Use WebSocket Hibernation, not SSE, for push.**

### 3.3 Alternatives (DOC unless noted)

| Platform | Free tier facts (quoted or summarized from the doc) | Fit |
|---|---|---|
| **Oracle Cloud Always Free** ([doc](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)) | A1 Arm: "first 1,500 OCPU hours and 9,000 GB hours per month … equivalent to 2 OCPUs and 12 GB of memory". This is lower than the older 4 OCPU / 24 GB. Also 2× E2.1.Micro (1/8 OCPU, 1 GB), 200 GB block storage, 10 TB egress/mo. **Idle reclamation:** an instance is "idle if, during a 7-day period … CPU utilization for the 95th percentile is less than 20%, Network utilization is less than 20%, Memory utilization is less than 20% (A1 only)". Capacity: "out of host capacity" errors happen. | A light poller is exactly the "idle" profile, so reclamation is a real risk. Upgrading to Pay-as-you-go may avoid it (UNVERIFIED). Good for heavy ingest (ffmpeg plus CPU Whisper-small) if capacity is available. |
| **Google Cloud free e2-micro** ([doc](https://docs.cloud.google.com/free/docs/free-cloud-features)) | "1 non-preemptible e2-micro VM instance per month" in us-west1, us-central1 or us-east1; 30 GB disk; "1 GB of outbound data transfer from North America … per month". Sign-up requires a credit card. Cloud Run: 2M req/mo. | A viable always-on light poller (Python). Egress is fine because pushes are small. Too weak for STT. |
| **Fly.io** ([pricing](https://docs.fly.io/about/pricing), [trial](https://docs.fly.io/about/free-trial)) | No ongoing free compute. The trial is "2 hours of machine runtime or 7 days". shared-cpu-1x 256 MB costs about $0.44–0.46/mo plus RAM per their calculator. | Cheap paid always-on option, not free. |
| **Render** ([free](https://render.com/docs/free)) | Free web service "spins down" after 15 min with no inbound traffic, with about 1 min to spin up. No free cron jobs. Free Postgres "expire 30 days after creation". | Not suitable for always-on polling. |
| **Railway** ([plans](https://docs.railway.com/reference/pricing/plans)) | Trial: "one-time grant of $5". Hobby: "$5 / month", which "includes $5 of resource usage". | $5/mo always-on container. Comparable to CF Paid but needs more ops work. [verifier: CONFIRMED. The plans page also lists a "Free $0 / month" plan, which the report does not mention; its allowance was not checked.] |
| **Vercel Hobby** ([cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [hobby](https://vercel.com/docs/plans/hobby)) | Cron: "Once per day", precision "Per-hour (±59 min)". Hobby "restricts users to non-commercial, personal use only". 1M function invocations. | Unusable for ingest. Fine for static hosting. |
| **Netlify** ([scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/)) | "available on all pricing plans"; "30 second execution limit"; runs only on published deploys. Minimum interval not stated (UNVERIFIED). | Weaker than Cloudflare. No stateful push. |
| **Deno Deploy** ([pricing](https://deno.com/deploy/pricing), [cron](https://docs.deno.com/deploy/kv/manual/cron/)) | Free: 1M req/mo, 10 h CPU/mo, 20 GiB egress, KV 1 GiB with 1M read and 500k write units/mo. Cron "may vary by up to a minute"; overlapping runs are skipped. "Deno Deploy Classic will be shut down on July 20, 2026." Free-plan cron minimum is UNVERIFIED. | A credible runner-up for ingest. Platform churn risk (Classic was shut down). [verifier: the request, CPU, egress and KV numbers are CONFIRMED on deno.com/deploy/pricing. The "may vary by up to a minute" and overlap-skip quotes come from the **Classic** cron page, which carries the banner "Sunsetting on July 20, 2026", so they may not describe the new platform. The new Deploy also bills "Memory time" (768 MB per loaded second; Free 150 GiB-hr/mo; idle apps shut down after ~20–30 s), which the report omits.] |
| **Supabase** ([pricing](https://supabase.com/pricing)) | 500 MB DB, Realtime with 200 concurrent connections and 2M messages/mo, 500k Edge Function calls. "Free projects are paused after 1 week of inactivity". | Realtime works, but the pause policy and the lack of free cron make it a poor ingest host. [verifier 2026-10-02: corrected — Supabase does have cron. supabase.com/docs/guides/cron describes Supabase Cron (pg_cron), which "can run anywhere from every second to once a year" and can "make an HTTP request, such as invoking a Supabase Edge Function". The page states no plan restriction. The real blockers are the 1-week inactivity pause (whether cron jobs count as activity is UNVERIFIED) and the 500 MB DB. Pricing figures CONFIRMED.] |
| **Firebase Spark** ([pricing](https://firebase.google.com/pricing), [functions](https://firebase.google.com/docs/functions/get-started)) | "to deploy functions, your project must be on the Blaze pricing plan" (so no scheduled functions on Spark). Hosting: 10 GB storage, "360 MB/day" transfer. FCM is no-cost. | No. |
| **Val Town** ([pricing](https://www.val.town/pricing)) | Free cron interval "15 min". Pro "$21/mo" gives 1 min. | No. |
| **Home PC / RTX 2080 box** | $0 beyond electricity. Unlimited CPU/GPU, ffmpeg, Playwright, faster-whisper. | The best transcript engine. Availability depends on home power, ISP, sleep settings and Windows Update. |
| **Cloudflare Tunnel** ([quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)) | Quick Tunnels: 200 in-flight requests, "do not support Server-Sent Events", no uptime guarantee, a new hostname each time, "for testing and development". Named tunnels need a domain on Cloudflare (UNVERIFIED cost detail). | **Not needed** if the home box *pushes outbound* to the Worker (`POST /api/v1/ingest` with an HMAC signature). That is the recommended pattern: no inbound exposure. |

[verifier 2026-10-02: CONFIRMED verbatim on the cited pages, fetched 16:5xZ:
- Oracle: "1,500 OCPU hours and 9,000 GB hours … equivalent to 2 OCPUs and 12 GB"; the 7-day/95th-percentile/20% idle rule; "out of host capacity"; 10 TB egress; 200 GB block. The doc's Pay-as-You-Go text concerns capacity, not reclamation, so the reclamation exemption stays UNVERIFIED.
- GCP e2-micro: the regions, 30 GB, and 1 GB egress.
- Fly: "2 hours of machine runtime or 7 days".
- Render: 15 min spin-down, "about one minute" spin-up, Postgres expires after 30 days.
- Vercel: Hobby cron "Once per day", "Per-hour (±59 min)", "non-commercial, personal use only".
- Netlify: "available on all pricing plans", 30 s limit, published deploys only.
- Firebase: Blaze needed to deploy functions; Hosting 10 GB and 360 MB/day.
- Val Town: Free "15 min cron intervals"; Pro $21/mo "1 minute cron intervals".
- Cloudflare quick tunnels: 200 in-flight, no SSE.
- UNVERIFIED: Fly "shared-cpu-1x 256 MB about $0.44–0.46/mo". The fetched pricing page did not contain that figure, which comes from a calculator.]

---

## 4. Realtime delivery to browsers and phones

### 4.1 Transport options

| Option | Latency | Free-tier cost on Cloudflare | iOS behavior | Verdict |
|---|---|---|---|---|
| Poll static JSON with ETag (GitHub Pages) | Poll interval plus Pages deploy (~48 s p50) plus the cron problem (§2.1). [verifier 2026-10-02: corrected — the Pages build p50 is ~25 s (pages/builds API, n=152); 48 s was CodeQL. See §2.2.] | $0 | Works in the foreground only | Archive or fallback only |
| Poll Worker `/api/v1/events?since=cursor` every 10–15 s | 5–8 s average | 1 request per poll. One tab at 10 s for 16 h is 5,760 req/day out of 100k. | Foreground only | **Fallback** transport, plus catch-up after reconnect |
| SSE from Worker/DO | <1 s | DO cannot hibernate during SSE, so wall-clock is billed (§3.2) | iOS drops it when backgrounded | No |
| **WebSocket to a hibernating Hub DO** | <1 s | 1 request per connect. Outgoing messages are free. Duration is billed only while the DO is handling events. | Dropped when backgrounded. Reconnect on `visibilitychange`, then GET with `since=cursor`. | **Primary** transport |
| Web Push | Seconds (APNs/FCM; exact latency UNVERIFIED) | 1 subrequest per subscription per push | Works when the app is closed (Home Screen web app only) | **Alerts** channel |

### 4.2 Web Push on iPhone (DOC)

- **Requirements** ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)):
  - iOS/iPadOS **16.4+**.
  - Only a "web app that has been added to the Home Screen"; caniuse note: "Requires website to first be added to the Home Screen".
  - Permission must be requested "in response to direct user interaction".
  - Uses Push API, Notifications API and Service Workers via APNs (allow `*.push.apple.com`).
  - "You do not need to be a member of the Apple Developer Program." Badging API (`setAppBadge`) is supported.
- **Declarative Web Push** ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)), iOS/iPadOS 18.4+:
  - The payload is JSON `{"web_push": 8030, "notification": {"title", "body", "navigate" (required), "app_badge", ...}}`.
  - It needs no service-worker JavaScript to display a notification, and subscription is available via `window.pushManager`.
  - It is backward-compatible if the service worker handles the same JSON.
- **iOS 26** ([WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)): "By default, every website added to the Home Screen opens as a web app … there are now zero requirements for 'installability'".
- **Limitations (caniuse data, LIVE fetch):**
  - Background Sync: **not supported** on iOS Safari (through 27.2).
  - Push: "Requires website to first be added to the Home Screen". Safari support does not extend to WKWebView or SFSafariViewController.
  - So a closed PWA cannot refresh by itself. **Push is the only way to reach a backgrounded iPhone without a native app.**
  - [verifier 2026-10-02: CONFIRMED from Fyrd/caniuse raw JSON. `background-sync` ios_saf 26.6–27.2 = "n". `push-api` ios_saf 16.4–27.2 = "a #7" ("Requires website to first be added to the Home Screen."). Note: caniuse attaches the WKWebView/SFSafariViewController note (#6) to the *desktop* Safari rows, not ios_saf, so that sentence is caniuse's macOS note applied to iOS. It is still the practical reality for Capacitor-style wrappers, which need native push plugins. The WebKit blog quotes for 16.4, 18.4/declarative (`"web_push": 8030`, required `navigate`, `window.pushManager`) and the iOS 26 "zero requirements for 'installability'" quote are all CONFIRMED verbatim.]
- **Sending from a Worker:** VAPID plus aes128gcm encryption via WebCrypto. Libraries targeting Workers exist:
  - `@pushforge/builder` 2.0.5 ("Zero-dependency Web Push library for Cloudflare Workers…");
  - `@block65/webcrypto-web-push` 2.0.0.
  - Not yet tested on Workers (UNVERIFIED); spike this in Phase 3.

### 4.3 Cheap owner-only alert channels (before the PWA exists)

- **ntfy.sh** ([publish docs](https://docs.ntfy.sh/publish/), tiers LIVE):
  - Publish with a plain `POST https://ntfy.sh/<topic>`, using headers `Title`, `Priority` (1–5), `Tags`, `Click`. Messages are limited to "4,096 bytes".
  - The iOS app gets instant delivery through ntfy's APNs relay. [verifier 2026-10-02: corrected wording. ntfy.sh forwards to iOS via Firebase/APNs; the config doc says self-hosted servers must use `upstream-base-url: https://ntfy.sh` for iOS. The docs' "Instant delivery" feature is Android-only (a foreground service). docs.ntfy.sh/known-issues lists "iOS app not receiving notifications (anymore)" and "iOS app not refreshing (#267)". Treat iOS ntfy latency as unmeasured, and test it in P3.]
  - [verifier: omission] ntfy.sh also limits requests: "60 requests per visitor at once, and then refills … at a rate of one request per 5 seconds" (docs.ntfy.sh/publish). On a shared Cloudflare egress IP that bucket may be shared too. This is UNVERIFIED, and it is another reason to use an access token.
  - Anonymous: **250 msgs/day per IP**. Caveat: Worker egress IPs are shared by many Cloudflare tenants, so an anonymous IP quota may be shared or unpredictable (UNVERIFIED). Use a token or the $6/mo Supporter tier if limits bite.
  - Topic names are public, so use an unguessable topic or a reserved one. [verifier: reserved topics need a paid tier; anonymous `reservations: 0` per `/v1/tiers`.]
- **Pushover** ([pricing](https://pushover.net/pricing)): "$4.99 USD one-time" per platform, a 30-day trial, and "up to 10,000 messages per month for free". A more reliable, auth-scoped alternative. [verifier 2026-10-02: the pricing is CONFIRMED verbatim. "More reliable" is the researcher's opinion and was not measured.]

---

## 5. Data layer

### Canonical event (shared by web, iOS and future news sources)

```
Event {
  id            // stable: `${source}:${native_id}` (e.g. "senate.vote:119-2-00256", "fr.doc:2026-21877")
  kind          // vote.result | vote.member_positions | floor.action | floor.speaker | schedule.item |
                // presidential.action | fr.document | fr.public_inspection | bill.action | nomination.action |
                // court.opinion | transcript.segment | live.started | live.ended | news.item (F12)
  features      // ["F5","F6"] (for filtering and coverage reports)
  title, summary, url, body?            // body for transcript segments, abstracts
  entities      // { chamber, bill:"hr9340", members:[bioguide...], agency, person }
  upstream_ts   // when the source says it happened or was published (nullable)
  first_seen_ts // when our poller first saw it
  broadcast_ts  // when the Hub sent it
  rev, hash     // for corrections/updates (same id, new rev)
  payload       // source-specific JSON (e.g. member positions array as ONE blob per vote)
}
```

The three timestamps produce a per-source **latency ledger**, so "as soon as possible" becomes a measured number. A source-health watchdog alerts when a source has had no successful poll for k × cadence. Following the fail-closed rule, the UI then shows the source as **stale**, not as "quiet".

### Storage options compared

| Store | Pros | Cons | Use |
|---|---|---|---|
| **DO SQLite inside the Hub DO** | Single-writer dedupe; FTS5; 30-day PITR; zero network hop to the WebSocket fan-out | 1 GB per object on Free; one hot object (soft limit 1k req/s, ample for this) | **Hot store**: last 90 days plus FTS |
| D1 | SQL from any Worker; FTS5; 500 MB per DB, 10 DBs free | 100k rows written/day and 50 queries per invocation on Free; an extra hop | Long-term archive or search when needed |
| R2 (JSONL.gz daily) | 10 GB free; egress free | Needs a custom domain for public production reads | Cold archive and backup |
| Git (daily JSONL commit via Actions) | Free, auditable, diffable, outlives any vendor | Not real-time; repo growth (1 GB recommended limit) | Optional public archive; the owner can browse history on GitHub |
| KV | Fast global reads | **1,000 writes/day on Free** | Avoid for hot state on Free |

**Volume sanity check:** about 150 FR docs plus Public Inspection, a few hundred bill/nomination actions, up to roughly 50 roll calls (each stored as 1 row with a positions blob), and floor and schedule items. That comes to roughly 1–3k rows per day, about 5–15 MB/day with bodies. This is well inside DO SQLite limits for a 90-day hot window. Transcript segments are the heavy item; store them in per-day transcript DOs or R2 objects, not the Hub.

---

## 6. Candidate architectures

### A. All-Cloudflare (Free, upgradeable to the $5 Paid plan). RECOMMENDED BACKBONE

```
 upstream .gov sources                         Cloudflare (one Worker project, workers.dev)
 ─────────────────────                         ─────────────────────────────────────────────
 senate.gov XML  ─┐   conditional GET,         ┌─ PollerDO "hot"  (alarm 20 s) ─┐
 clerk.house.gov ─┤   head-only parse          ├─ PollerDO "warm" (alarm 60 s) ─┼─► HubDO (SQLite+FTS5)
 whitehouse.gov  ─┼──────────────────────────► ├─ cron 5 min ─► cool sources ──┘     │ dedupe, rev, ledger
 federalregister ─┤                            │                                     ├─► WebSocket (hibernating)
 congress.gov API─┘                            │  supervisor cron 1 min: re-arm       ├─► Web Push (VAPID)/ntfy
                                               │  alarms, source-health watchdog      └─► R2 / git daily archive
 browser / PWA / iOS ◄──── static assets (free, unlimited) + /api/v1/* + /api/v1/live (WS) ◄┘
```

**Free-plan budget (30 sources):**

| Resource | Usage | Free limit | Share |
|---|---|---|---|
| Hot DO alarms | 4,320/day | | |
| Warm DO alarms | 1,440/day | | |
| Cool cron runs | 288/day | | |
| Supervisor cron runs | 1,440/day | | |
| DO requests (alarms + Hub writes ~3k + WS connects ~500) | ≈ 10k/day | 100k/day | ~10% |
| DO rows written (setAlarm ~5.8k + events ~3k + state-on-change) | ≈ 10k/day | 100k/day | ~10% |
| DO duration (5.8k alarms × ~1 s wall × 0.125 GB) | ≈ 725 GB-s/day | 13,000 GB-s/day | ~6% |
| Worker requests (owner devices plus some friends) | well under 20k/day | 100k/day | <20% |

**CPU is the real risk:** 10 ms per invocation, see §2.3. The budget arithmetic is mine and was not run on Cloudflare (UNVERIFIED until the Phase-1 probe).

**Latency by feature class** (after upstream availability, excluding upstream CDN floors from §2.4):

| Feature class | Expected latency |
|---|---|
| F5/F6/F9/F10/F11 discrete events | ~10–30 s on hot sources; ~30–90 s on warm |
| F7 schedules | ≤ 5 min |
| F1/F2/F8 text-based floor status (from XML/HTML floor pages) | ~20–60 s |
| L0 audio transcripts | **not available** in pure A (no ffmpeg or STT on Free) |
| Push to phone | adds seconds (UNVERIFIED) |

**Monthly cost:** $0. Optional upgrades:
- Workers Paid at $5/mo. This unlocks 30 s CPU (so full parsers are fine), 10k subrequests, KV writes, 10M requests, and Workers AI beyond the free 10k neurons/day.
- A custom domain, roughly $10/yr at registrar cost (price UNVERIFIED).

**Failure modes and mitigations:**
1. **.gov sites may block or challenge Cloudflare egress IPs.** UNVERIFIED; this is the first thing Phase 1 tests with a probe Worker. The fallback is to route that source through the home box (C).
2. **CPU overrun** (Error 1102). Mitigate with head-only parsers, splitting heavy sources into their own DO, or the $5 plan.
3. **Alarm dropped after 6 failed retries.** The supervisor cron re-arms alarms.
4. **Daily request cap** (1027) if the page goes viral. Static assets stay free; the API can fail open to a "static snapshot" mode.
5. **Vendor lock-in.** Keep source adapters as pure TypeScript functions (`(Response) => Event[]`) with no Cloudflare APIs, so they also run in Node on the home box.

**Growth path:**
- Transcripts arrive via C's `/ingest`.
- Push: Web Push from the Hub.
- iOS: the same `/api/v1` plus APNs later.
- F12: just more adapters in the "cool" or "warm" tiers.

### B. GitHub Actions + GitHub Pages (static, "git scraping"). NOT for live

```
 Actions schedule (*/5, best-effort) ─► python pollers ─► commit data/*.json ─► Pages deploy ─► browser polls JSON
```

- **Latency, measured (§2.1–2.2):** cron gaps with p50 13 min (best case), up to ~5 h (typical worst case seen today), plus 1–2 min of job time, plus ~48 s deploy [verifier 2026-10-02: corrected to ~25 s p50 Pages build; see §2.2], plus up to 10 min of browser cache. **Every class ends up at 15 min to hours.** No transcripts, no push (no server).
- **Cost:** $0. Public repo required.
- **Failure modes:**
  - dropped or delayed schedules;
  - auto-disable after 60 days without repo activity (public repos);
  - the ToS clause on non-project activity;
  - repo bloat;
  - 1 GB site and repo guidance.
- **Use it for:** CI, deploying the Worker (wrangler from Actions), the nightly JSONL archive commit, and a status mirror of last-known data if Cloudflare is down.

### C. Always-on ingest box (home RTX 2080 box, or Oracle/GCP free VM) + Cloudflare edge (A). The transcript add-on

```
 HLS/live streams, captions ─► home box: ffmpeg → faster-whisper (GPU) → segmenter ─┐  HTTPS POST /api/v1/ingest
 JS-heavy pages (Playwright) ─► home box: scrapers ────────────────────────────────┤  (HMAC-signed, outbound only)
 sources blocked from CF IPs ─► home box: python pollers ───────────────────────────┘
                                                                                     ▼
                                                    Cloudflare HubDO (same as A) ─► WS / Push / API
```

- **Latency:**
  - Transcripts trail the audio by roughly chunk length plus inference time. With 5–10 s chunks, expect ~8–20 s. RTX 2080 faster-whisper throughput is UNVERIFIED; benchmark it in Phase 4.
  - Discrete events: the same as A, or faster with a 5–10 s loop.
- **Cost:** $0 cash on home hardware (electricity only). Oracle A1 is free but has reclamation and capacity risk. GCP e2-micro is free with a card on file but cannot run STT. Workers AI Whisper is an alternative at $0.0005/min, roughly **$11/mo** for 16 h/day of floor audio beyond the free ~214 min/day, if it can take the audio format (UNVERIFIED).
- **Failure modes:**
  - home power, ISP or sleep outages, or Windows Update reboots. Transcripts pause; the rest of the feed (A) keeps working. The Hub marks transcript sources *stale*.
  - Ingest endpoint abuse. Mitigate with an HMAC secret, replay window and schema validation.
- **Growth path:** this is how F1–F4 "live transcripts" ever become real. It also hosts any source that blocks datacenter IPs.

### Recommendation

**Build A now and design the `/ingest` contract from day one, so C plugs in later. Use B only for CI, deploys and archive.**

Reasons:
- A is the only free option measured or documented to deliver sub-minute updates without a box at home.
- It covers hosting, API, realtime push, storage and search in one deployable unit that agents can test locally with wrangler/miniflare.
- It has a clear $5/mo escape hatch.

C is unavoidable for audio transcripts on a free budget. Keeping it as a pluggable producer means it is never on the critical path for the rest of the feed.

---

## 7. Phased build plan (what the first build sessions should do)

| Phase | Goal | Done when |
|---|---|---|
| **P0 (session 1)** | Monorepo scaffold: `apps/web` (Vite+Preact PWA shell), `workers/api` (Worker + DOs, wrangler), `packages/schema` (Event types + JSON Schema), `packages/adapters` (pure source adapters plus fixtures from §2.4). CI on Actions: typecheck, Vitest (pin 4.x for `@cloudflare/vitest-pool-workers`), Playwright smoke (chromium + webkit). | `npm test` is green locally and in CI; `wrangler dev` serves the shell. |
| **P1** | **Reachability and CPU probe.** Deploy a probe Worker that fetches every candidate source from Cloudflare egress and records status, headers, ETag/LM, bytes, fetch wall-time and CPU (Workers Logs). Also repeat §2.3 parse timing on Workers. | A table of each source × {reachable from CF?, 304 support, CPU ms}. This decides which sources move to the home box. |
| **P2** | HubDO with events table + FTS5, `/api/v1/events?since=`, `/api/v1/live` (hibernating WS); 3 adapters (FR docs + PI, Senate votes, WH presidential actions); hot/warm PollerDOs; supervisor cron; latency ledger; source-health page. | The owner's phone shows a new FR/PI doc or Senate vote within 60 s of it appearing upstream, as measured by the ledger. |
| **P3** | macOS-style UI: sidebar / feed / inspector, filters, search, light/dark; ntfy alerts for owner-chosen event kinds. | The owner uses it daily. |
| **P4** | PWA manifest + service worker + Web Push (standard plus declarative payload); iOS Home Screen test. | A push arrives on the owner's iPhone with the app closed. |
| **P5** | Home-box ingest (C): captions first, then Whisper on HLS for floor and briefings; `transcript.segment` events. | A live floor transcript within 20 s of the audio. |
| **P6+** | More sources (F7, F11), F12 news, native iOS (SwiftUI) on the same API. | |

Implied repo layout: `apps/web`, `workers/api`, `packages/{schema,adapters}`, `ingest/homebox` (Python), `docs/{research,architecture,handoff}`.

---

## 8. Frontend stack

| Option | Baseline gz (LIVE §2.5) | PWA / service worker | Testing | AI-agent maintainability | Notes |
|---|---|---|---|---|---|
| **Vite + Preact 10 + signals + TS** | **8.3 KB** | vite-plugin-pwa 1.3.0 (Workbox) | Vitest + Playwright | High. React-identical API, so agents' React knowledge transfers; `preact/compat` exists if a React library is needed | **Recommended.** Pin Preact 10.29.x; 11.0.0 is 2 days old. |
| Vite + React 19.3 | 68.9 KB | same | same | Highest | Fine if bundle size stops mattering; ~8× heavier cold start on phones. |
| SvelteKit (adapter-static 4.0.0) + Svelte 5 | ~18 KB (esbuild; re-measure) | @vite-pwa/sveltekit 1.1.0 | Vitest + Playwright | Medium. Agents sometimes write Svelte 4 syntax instead of runes | **Kit 3.0.0 was released 2026-10-01**, so expect major-version churn now. |
| Astro 7 + islands | Depends on the island framework | Via plugins | Vitest + Playwright | Medium-high | Best for content sites. A live single-screen app gains little from islands. |
| Vanilla Web Components / Lit 3.3 | 6.1 KB (Lit) | Hand-rolled or Workbox | Vitest + Playwright | Medium; more boilerplate | Smallest. Lit is a reasonable choice for a design-system layer. |

Testing note: Playwright's **WebKit** engine runs on Windows, so the Windows-based owner and agents can catch Safari-specific layout and `backdrop-filter` issues before testing on the iPhone.

---

## 9. macOS design language on the web

- **Typography:**
  - `font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, "Segoe UI", Roboto, sans-serif;` gives SF Pro on Apple devices (rendered by the OS) and Inter (OFL-1.1, self-hostable) elsewhere.
  - Monospace: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. `ui-monospace` and `ui-rounded` work only in Safari (caniuse: Chrome 157 and Firefox 160 "n").
  - [verifier 2026-10-02: the caniuse `extended-system-fonts` claim is CONFIRMED: Chrome 154–157 "n", Firefox 157–160 "n", ios_saf "y". `css-backdrop-filter` Firefox 103 "y" (102 "n d #3") is CONFIRMED.]
  - **Do not self-host SF Pro.** The Apple Font License says it is "to be used solely for creating mock-ups of user interfaces … running on Apple's iOS, OS X or tvOS", "You may not embed the Apple Font in any software programs", and you may not use it to "display or otherwise distribute any … website content" ([developer.apple.com/fonts](https://developer.apple.com/fonts/)).
- **Icons:**
  - **Do not use SF Symbols on the web.** The HIG says to "understand the terms and conditions for using SF Symbols, including the prohibition against using symbols … in app icons, logos, or any other trademarked use". Secondary sources and Apple forum threads state they are licensed only for apps on Apple platforms. I could not read the bundled license text today because it ships inside the SF Symbols app (UNVERIFIED verbatim), so be conservative.
  - [verifier 2026-10-02: the Apple font licence quotes are CONFIRMED verbatim on developer.apple.com/fonts ("solely for creating mock-ups…", "You may not embed the Apple Font in any software programs", "…display or otherwise distribute any documentation, artwork, website content"). The HIG SF Symbols "prohibition" sentence and the HIG Materials "distinct functional layer" / "Use Liquid Glass effects sparingly" text are CONFIRMED via developer.apple.com/tutorials/data/design/human-interface-guidelines/{sf-symbols,materials}.json, since the HTML pages are JS-rendered. The SF Symbols licence itself remains UNVERIFIED, as the report says.]
  - Use **Lucide** (ISC; `lucide-preact` 1.50.0; thin outline style closest to SF Symbols), Phosphor (MIT; has a "regular/thin" weight family) or Heroicons (MIT).
- **Materials:**
  - Translucent sidebar and toolbar: `background: color-mix(in srgb, var(--bg) 72%, transparent); backdrop-filter: blur(20px) saturate(180%);` with a `@supports` fallback to solid. `backdrop-filter` is supported in iOS Safari, Chrome, and Firefox from 103 (caniuse, LIVE).
  - Current HIG (macOS/iOS 26, "Liquid Glass"): "Liquid Glass forms a distinct functional layer for controls and navigation elements — like tab bars and sidebars — that floats above the content layer". It also says "If you apply Liquid Glass effects to a custom control, do so sparingly" ([HIG materials](https://developer.apple.com/design/human-interface-guidelines/materials)). So translucency goes on chrome only; feed content stays plain and opaque.
- **Layout (HIG split views/sidebars/toolbars):**
  - Three panes. **Sidebar** source list: Live Now, Senate, House, White House, Cabinet & Agencies, Federal Register, Courts, Saved Searches; disclosure groups; user-customizable ("When possible, let people customize the contents of a sidebar"). Then **feed list**, then **inspector/detail** (vote breakdown, transcript, document).
  - A **unified toolbar** with title, search field and a filter segmented control. Keep items few; overflow goes to a menu.
  - Under ~700 px, collapse to a stack plus bottom tab bar (iPhone).
  - Keyboard shortcuts (⌘F search, ⌘1–9 sidebar sections, J/K to move through the feed).
- **Theme:**
  - `color-scheme: light dark`, with tokens under `prefers-color-scheme` and a manual override.
  - `accent-color` for native controls; respect `prefers-reduced-motion`.
  - Apple's system colors are documented in the HIG Color page. Hex values there are in images, so the design session should transcribe them into tokens.
- **Kits:** Puppertino (MIT, HIG-based CSS: buttons, segmented controls, tabs, blur, dark mode; ~1.2k stars; active 2026-10-01) is a good **reference**. I recommend a small in-repo token + component layer over adopting a kit wholesale, because it is easier for agents to keep consistent.

---

## 10. iOS path

1. **PWA first (Phase 4):**
   - Add to Home Screen. Any site works on iOS 26; a manifest still helps with name, icon and theme.
   - Web Push on iOS 16.4+ with no developer account; badging.
   - Offline shell via service worker. The cost is no background refresh (§4.2).
2. **Native later:** a SwiftUI app consuming the same `/api/v1` (Event JSON → Swift `Codable`, generated from the JSON Schema in `packages/schema`).
   - Gains: APNs, Live Activities (a "Senate vote in progress" lock-screen card), widgets, and real background refresh.
   - Requires the Apple Developer Program at "99 USD per membership year", which includes TestFlight, App Store distribution, "Push Notifications" and Xcode Cloud "25 hours/month" ([whats-included](https://developer.apple.com/programs/whats-included/)).
   - Without membership: Xcode Personal Team, with "Provisioning profiles expire 7 days from issuance", up to 3 devices, and **no TestFlight** ([compare-memberships](https://developer.apple.com/support/compare-memberships/)).
   - [verifier 2026-10-02: CONFIRMED. whats-included says "99 USD per membership year" and Xcode Cloud "Membership includes 25 compute hours/month". compare-memberships says "Provisioning profiles … will expire 7 days from issuance" and "register up to 3 devices". GitHub's billing doc lists macOS 3/4-core as a standard runner ($0.062/min) and says standard runners are free "In public repositories".]
   - Building needs Xcode on macOS. The owner is on Windows, so the options are a Mac, Xcode Cloud, or GitHub macOS runners (free for public repos per the Actions billing doc).
3. **Wrapper alternative:** Capacitor 8.5.2 wraps the PWA into an App Store app with native push plugins. It is the cheapest path to the App Store but gives non-native feel. The owner wants macOS-like polish, so prefer SwiftUI when native time comes. Expo/React Native would mean a second UI codebase.

---

## 11. Ranked recommendations

1. **Adopt Architecture A** (Cloudflare Workers Free: static assets + API + PollerDOs with alarms + HubDO with SQLite/FTS5 + hibernating WebSockets), with a documented `/api/v1/ingest` contract for external producers.
2. **Make the very first build task the P1 probe**: reachability of every source from Cloudflare egress, plus CPU per parse on Workers. Those two unknowns decide free vs $5 and which sources need the home box.
3. **Write source adapters as pure functions with fixtures** (the payloads in §2.4 are a starting set). Use conditional GET, head-only parsing, and per-source `cacheSalt` and `cadence` in a single source registry.
4. **Instrument latency from day one** (`upstream_ts` / `first_seen_ts` / `broadcast_ts`) and show source freshness in the UI. A stale source should show as stale, not as quiet.
5. **Frontend:** Vite + Preact 10 + signals + TS + vite-plugin-pwa; Vitest (4.x where Workers tests need it) + Playwright (chromium + webkit). Use a token-based macOS look: system font stack, Lucide icons, `backdrop-filter` chrome only, three-pane split view.
6. **Alerts:** ntfy now, Web Push in P4, APNs only with the native app.
7. **Keep GitHub for code, CI, deploys and a nightly archive.** Never put it on the live path.
8. **Budget trigger:** move to Workers Paid ($5/mo) the first time CPU-exceeded errors show up in Workers Logs, or when Workers AI transcription beyond ~214 min/day is wanted.
9. **Transcripts (P5):** captions first where official ones exist, then faster-whisper on the home GPU box pushing segments to `/ingest`.

---

## 12. Gaps (what no free option covers well)

- **Live speech-to-text for executive-branch speakers (F4) and press conferences (F3).** No free API delivers real-time transcripts. It requires STT on live audio (home GPU or paid STT). Coverage stops when the home box is off.
- **"Who is speaking right now" (F8) at second-level precision.** At best this comes from official captions or floor logs; architecture alone cannot fix it.
- **Reaching a backgrounded iPhone without push.** Impossible: iOS PWAs have no Background Sync.
- **Upstream freshness floors** from CDNs (FR API cached copy ~47 min old despite `no-store`; Congress.gov `max-age=1800`; WH RSS `max-age=300`). Polling faster than the upstream cache gains nothing unless the poller salts the cache key. Whether doing that is acceptable etiquette is a per-source call.
- **Cloudflare cron and alarm jitter is unmeasured.** Cloudflare documents no execution-timing guarantee for cron.
- **Cloudflare egress reachability to .gov sites is unmeasured** (the P1 probe).

## 13. Risks

- **Free-plan CPU (10 ms)** may be exceeded by real parsers. Mitigated by head-only parsing, per-source DOs, or $5/mo.
- **Bot defenses on .gov sites** against datacenter IPs (Cloudflare or Azure). Mitigated by the home-box fallback and a descriptive User-Agent with contact info.
- **Vendor and plan changes.** Cloudflare changed subrequest limits in Feb 2026; Oracle's A1 allowance shrank to 2 OCPU / 12 GB; Deno Deploy Classic shut down July 2026. Keep adapters portable and the event schema vendor-neutral.
- **Fresh major versions:** SvelteKit 3.0.0 (1 day old), Preact 11.0.0 (2 days old), Vitest 5 vs the Workers test pool's peer `vitest ^4.1.0`. Pin versions and upgrade deliberately.
- **Licensing:** SF Pro cannot be self-hosted; SF Symbols cannot be used on the web; Apple trademarks cannot appear in the app's name or icon.
- **GitHub ToS** if Actions were used as a 24/7 scraper (clause quoted in §3.1). Another reason to keep it off the live path.
- **Hub DO is a single logical writer.** Ample for one user. If the site is shared widely, shard WS fan-out (one DO per N clients) and add caching.
- **ntfy anonymous quota is per IP**, and Worker egress IPs are shared, so it is UNVERIFIED whether the quota is isolated. Use a token or Pushover.
- **Measurement caveats:** the CPU numbers come from a fast desktop, not Cloudflare. The cron-gap sample is 3 repos over about 2.5 days and shows high variance between repos (32% vs 2% delivery). The conclusion that Actions is unfit for live updates holds under both. [verifier 2026-10-02: the cron sample now has 5 repos (2 non-Upptime added) with the same split. The Pages-deploy timing in §2.2 was mis-sourced (CodeQL runs) and has been corrected.]

## 14. Questions only the owner can answer

1. **Budget:** is $5/mo (Workers Paid) acceptable once the free CPU limit bites? What is the ceiling for transcription (about $11/mo for Workers AI Whisper on 16 h/day of floor audio, versus $0 on your own GPU)?
2. **Accounts:** will you create a free Cloudflare account and let CI deploy with an API token stored as a GitHub secret?
3. **Repo visibility:** public (free Pages and free Actions minutes, open-source data) or private?
4. **Audience:** just you, or shared publicly? This affects request budgets, abuse protection, and whether login is ever needed.
5. **Home box:** can the RTX 2080 box run 24/7 as the transcript and scraper ingest node? Is it acceptable for transcripts to pause when it is off?
6. **Domain:** is a `*.workers.dev` URL fine, or do you want a custom domain (about $10/yr)?
7. **Alerts:** which events should buzz your phone (every vote? only final passage? EOs? Fed Register rules from specific agencies?). Is the ntfy app acceptable until the PWA exists?
8. **iOS native later:** do you have a Mac, and are you willing to pay $99/yr for the Apple Developer Program when the time comes?
9. **History:** how far back should search go (90 days hot is free and easy; years means the D1/R2/git archive)?

---

## 15. Sources

- GitHub:
  - https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
  - https://docs.github.com/en/get-started/learning-about-github/githubs-plans
  - https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
  - https://docs.github.com/en/billing/concepts/product-billing/github-actions
  - https://docs.github.com/en/actions/reference/limits
  - https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features
- Cloudflare:
  - https://developers.cloudflare.com/workers/platform/limits/
  - https://developers.cloudflare.com/workers/platform/pricing/
  - https://developers.cloudflare.com/workers/configuration/cron-triggers/
  - https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/
  - https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
  - https://developers.cloudflare.com/durable-objects/platform/pricing/
  - https://developers.cloudflare.com/durable-objects/platform/limits/
  - https://developers.cloudflare.com/durable-objects/api/alarms/
  - https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
  - https://developers.cloudflare.com/durable-objects/best-practices/websockets/
  - https://developers.cloudflare.com/kv/platform/limits/
  - https://developers.cloudflare.com/d1/platform/limits/
  - https://developers.cloudflare.com/d1/sql-api/sql-statements/
  - https://developers.cloudflare.com/queues/platform/pricing/
  - https://developers.cloudflare.com/r2/pricing/
  - https://developers.cloudflare.com/r2/buckets/public-buckets/
  - https://developers.cloudflare.com/pages/platform/limits/
  - https://developers.cloudflare.com/workers-ai/platform/pricing/
  - https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- Alternatives:
  - https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
  - https://docs.cloud.google.com/free/docs/free-cloud-features
  - https://docs.fly.io/about/pricing
  - https://docs.fly.io/about/free-trial
  - https://render.com/docs/free
  - https://docs.railway.com/reference/pricing/plans
  - https://vercel.com/docs/cron-jobs/usage-and-pricing
  - https://vercel.com/docs/plans/hobby
  - https://docs.netlify.com/build/functions/scheduled-functions/
  - https://deno.com/deploy/pricing
  - https://docs.deno.com/deploy/kv/manual/cron/
  - https://supabase.com/pricing
  - https://firebase.google.com/pricing
  - https://firebase.google.com/docs/functions/get-started
  - https://www.val.town/pricing
- Push and PWA:
  - https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
  - https://webkit.org/blog/16535/meet-declarative-web-push/
  - https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
  - caniuse data via https://github.com/Fyrd/caniuse (background-sync, push-api, css-backdrop-filter, extended-system-fonts)
  - https://docs.ntfy.sh/publish/
  - https://ntfy.sh/v1/tiers
  - https://pushover.net/pricing
- Apple:
  - https://developer.apple.com/fonts/
  - https://developer.apple.com/design/human-interface-guidelines/sf-symbols
  - HIG sidebars, toolbars, split-views, materials (developer.apple.com/design/human-interface-guidelines/…)
  - https://developer.apple.com/programs/whats-included/
  - https://developer.apple.com/support/compare-memberships/
- Libraries: npm registry (versions listed in §2.6); https://lucide.dev/license; GitHub repo metadata via `gh api`.
- Live data endpoints sampled:
  - https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml
  - https://www.federalregister.gov/api/v1/documents.json
  - https://www.federalregister.gov/api/v1/public-inspection-documents/current.json
  - https://www.whitehouse.gov/presidential-actions/feed/
  - https://api.congress.gov/v3/bill
- Local artifacts (scratchpad, not committed): `arch/gaps.py`, `arch/bench.mjs`, `arch/bench3.mjs`, `arch/sched_*.tsv`, `arch/off_all.tsv`, payload samples.

---

## Verifier additions

Adversarial verification was run on 2026-10-02 between 16:30Z and 17:10Z. The verifier's artifacts are in the session scratchpad under `verif/` (headers, fetched doc text, `gaps.py`, `cron2/`, `bundle/`, `bx.mjs`). Items marked UNVERIFIED stay hypotheses for P1.

1. **senate.gov ignores `If-None-Match`; use `If-Modified-Since`.** `If-None-Match` returned 200 with the full 165 KB in 3 of 3 tries; `If-Modified-Since` returned 304. Every source adapter's test should assert which validator the source honors. The P1 probe should record `etag_304` and `ims_304` separately for every source.
2. **The Pages deploy figure was mis-sourced.** The 48 s / n=127 / "3 per hour" numbers were CodeQL runs. Real legacy Pages builds: p50 24.6 s (n=152). No Actions `deploy-pages` workflow or CDN-freshness-after-deploy was measured. This does not change the verdict on Architecture B.
3. **The Durable Object CPU limit on the Free plan is undocumented.** The DO limits page says "CPU per request 30 seconds (default)" with no plan qualifier. The 10 ms Free figure appears only on the Workers limits page. P1 should run an alarm handler with a deliberate ~20 ms busy-loop on a Free account and check for `exceededCpu`. If DO alarms get 30 s on Free, the head-only parsing constraint relaxes for DO pollers.
4. **Workers Logs is the P1 measurement tool, and its pricing changes on Dec 1, 2026.** Free: "200,000 per day", "3 Days" retention. Paid: 20M/mo, 7 days. "Beginning December 1, 2026, Workers Logs will use Cloudflare Observability pricing" (workers/observability/logs/workers-logs). Sample logs, using `head_sampling_rate`, if pollers log per invocation: 6k alarms/day × several log lines is fine, but per-source logging at 20 s cadence adds up.
5. **Workers Paid also meters CPU:** 30M CPU-ms/month included, then $0.02 per million CPU-ms (workers/platform/pricing). It is negligible here but belongs in the budget table.
6. **Cloudflare Containers are Paid-only** (Containers pricing, updated Aug 28, 2026: "Free N/A"). Paid includes 375 vCPU-minutes/month and 25 GiB-hours of memory. That is far too little for 16 h/day of ffmpeg plus STT (about 960 vCPU-min/day before any model work), so the home box (C) remains the transcript path. A Container could still host an occasional JS-heavy scrape on the $5 plan.
7. **Cloudflare Workflows can now run on a schedule.** workflows/build/trigger-workflows (updated Sep 17, 2026) says Workflows can be triggered "On a recurring interval by defining schedules on a Workflow binding". The minimum interval, Free-plan availability, and whether this frees a Cron Trigger slot are UNVERIFIED. It may replace the "supervisor cron" for re-arming alarms.
8. **Supabase does have cron.** Supabase Cron is pg_cron that runs "anywhere from every second to once a year" and can make HTTP requests. With Realtime (200 concurrent / 2M msgs per month free), Supabase is a credible second-choice backbone. Its blockers are the "paused after 1 week of inactivity" policy (whether cron counts as activity is UNVERIFIED) and the 500 MB DB.
9. **The Congress.gov DEMO_KEY limit observed is 10 per window, not the documented 30/h.** On the 429 response, `X-Ratelimit-Limit: 10` and `Retry-After: 26561`. api.data.gov documents DEMO_KEY as 30/h and 50/day, and a real key as 1,000/h. Register a real key before any Congress.gov work, and never use DEMO_KEY in CI.
10. **White House RSS validators change without new items.** `Last-Modified` moved forward by 2.5 h with an identical newest item and byte count. Expect periodic full 593 KB (84 KB gzip) re-downloads, and dedupe by `<guid>`/link, not by the validator.
11. **ntfy:**
    - There is a per-visitor request bucket: 60 requests, refilled at 1 per 5 s.
    - Reserved topics need a paid tier.
    - iOS delivery goes through ntfy.sh's Firebase/APNs forwarding, and the known-issues page lists iOS delivery problems.
    - Use an access token, or Pushover, if alerts matter.
12. **Minor platform notes the report omits:**
    - Railway now lists a "Free $0 / month" plan; its allowance was not checked.
    - The new Deno Deploy bills memory-time (Free 150 GiB-hr/mo).
    - The DO alarms page says "A Worker can have up to three Cron Triggers configured at once", which conflicts with the 5-per-account figure on the limits page.
    - GitHub `schedule` now supports an IANA timezone.

## Verification ledger

| # | Claim | Method | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Upptime `*/5` cron delivery: openfoodfacts 32% / p50 12.9 min; hansluk 2% / p50 326; telegai 2% / p50 289 | `gh api …/runs?event=schedule`, own gaps.py | CONFIRMED | Exact match (243/753; 12/694; 12/678) |
| 2 | The bimodal cron delivery is general, not Upptime-specific | 2 non-Upptime `*/5` repos | CONFIRMED | firehol-mirror 38% p50 11.4; bluetooth-next 2% p50 325 |
| 3 | GH doc: 5-min minimum; delays and drops at high load; 60-day auto-disable | curl docs.github.com | CONFIRMED | Verbatim; modrinth/daedalus `disabled_inactivity` |
| 4 | Pages deploy p50 48 s, p90 57 s, max 506 s, n=127, ~3/h | `gh api` runs path + `pages/builds` | **REFUTED** | Runs were `dynamic/github-code-scanning/codeql`; Pages builds n=152 p50 24.6 s, p90 35.8, max 382 |
| 5 | pages.github.com `max-age=600`, ETag, `X-Cache`, INM gives 304 | curl -I | CONFIRMED | 16:30Z 200, `"689c7eee-386e"`, Age 235, then 304 |
| 6 | Pages limits quotes (1 GB, 100 GB soft, 10 builds/h, 10 min, no SaaS) | curl doc | CONFIRMED | Verbatim |
| 7 | Actions free for public repos; Free 2,000 min; Linux $0.006/min; macOS a standard runner | curl billing doc | CONFIRMED | Verbatim; macOS $0.062 |
| 8 | 6 h job limit; 20 concurrent jobs on Free | curl limits doc | CONFIRMED | Verbatim |
| 9 | Actions ToS "disproportionate" / "unrelated to the production…" | curl terms | CONFIRMED | Verbatim |
| 10 | Senate menu full parse 11.8 / 6.2 ms; head-only ~0.01–0.2 ms | Local rerun, fast-xml-parser 5.11.2 | CONFIRMED | 12.4 / 6.4 ms; head 0.10 ms |
| 11 | WH RSS parse 1.98 / 0.79 ms | Local rerun | CONFIRMED | 1.7 / 0.76 ms |
| 12 | FR documents.json served stale (`Age` ~47 min) despite `no-store`; salt gives Age 0 | curl ×3 | CONFIRMED | Age 960, 1024; salted 0; same 100 docs, newest 2026-20322 |
| 13 | FR PI current.json same behaviour; 107 docs; newest filed_at 11:15 | curl ×2 | CONFIRMED | Age 1174 vs 0; 107 docs; 173,464 B |
| 14 | Congress.gov `Cache-Control: public, max-age=1800` | curl DEMO_KEY | UNVERIFIABLE | 429 OVER_RATE_LIMIT, Retry-After 26561 |
| 15 | Congress.gov DEMO_KEY `X-Ratelimit-Limit: 10` | curl | CONFIRMED | Header on the 429; differs from the doc's 30/h |
| 16 | Senate vote menu supports conditional GET (ETag) | curl INM vs IMS | **REFUTED** (partial) | INM gives 200 (3/3); IMS gives 304 |
| 17 | Senate menu 165,543 B, LM 01 Oct 03:47:06, ETag, newest vote 256 Sonderling 47–41 | curl | CONFIRMED | Identical |
| 18 | Senate roll call XML for vote 256 ~28 KB | curl | CONFIRMED | 200, 28,706 B |
| 19 | WH presidential-actions feed: 593,364 B, ETag, `max-age=300`, HIT, newest item 29 Sep | curl + INM/IMS | CONFIRMED | Both validators give 304; LM churned to 16:19:11 with no new item |
| 20 | Bundle gz: Preact+signals 8.3 KB, Lit 6.1, React 68.9 | esbuild rebuild | CONFIRMED | 8,475 / 6,138 / 69,099 B |
| 21 | npm latest versions and dates (16 packages) | registry.npmjs.org | CONFIRMED | All match |
| 22 | vitest-pool-workers 0.22.0 peers `vitest ^4.1.0` | registry | CONFIRMED | peerDependencies |
| 23 | Repo licences (phosphor, heroicons, lucide, Puppertino, inter, system.css) | `gh api repos` | CONFIRMED | MIT/MIT/NOASSERTION (ISC+MIT file)/MIT/OFL-1.1/MIT |
| 24 | ntfy tiers: anon 250/day per IP, 12 h expiry; $6 / 2,500; $12 / 20,000 | curl /v1/tiers | CONFIRMED | JSON; Business tier also exists |
| 25 | ntfy 4,096-byte message; 250 daily | docs.ntfy.sh/publish | CONFIRMED | Verbatim |
| 26 | ntfy iOS gets "instant delivery" through an APNs relay | docs.ntfy.sh phone/config/known-issues | **REFUTED** (wording) | "Instant delivery" is Android-only; iOS goes via Firebase/APNs; known iOS delivery issues |
| 27 | CF Workers Free: 100k/day, 10 ms CPU, 50 subrequests, 6 connections, 128 MB, 5 crons | curl limits | CONFIRMED | Table verbatim |
| 28 | CF Paid: CPU 30 s default up to 5 min; 10k subrequests up to 10M; 10M req + $0.30/M; $5 minimum | curl limits / pricing / changelog | CONFIRMED | Verbatim; CPU-ms metering omitted |
| 29 | Error 1027 with fail-open/closed; 1102 / `exceededCpu` | curl limits | CONFIRMED | Verbatim |
| 30 | Wall clock: HTTP none; cron/alarm/queue 15 min; waitUntil 30 s | curl limits | CONFIRMED | Verbatim |
| 31 | Cron changes take up to 15 min to propagate | curl cron-triggers | CONFIRMED | "up to 15 minutes" |
| 32 | Static assets "free and unlimited"; 429 with `run_worker_first`; 20,000 files / 25 MiB | curl assets + limits | CONFIRMED | Verbatim |
| 33 | DO Free: 100k req/day (incl. alarms, WS msgs), 13,000 GB-s/day, 5M/100k rows, 5 GB; setAlarm = 1 row | curl DO pricing | CONFIRMED | Verbatim |
| 34 | DO hibernation: idle-eligible not billed; `accept()` billed for whole connection; outgoing WS free; incoming 20:1 | curl DO pricing + WS best practices | CONFIRMED | Verbatim |
| 35 | DO CPU on Free is 10 ms | curl DO limits | UNVERIFIABLE | Doc lists 30 s default with no plan split; inference only |
| 36 | DO: 1 GB per object on Free, 100 classes, ~1k req/s soft | curl DO limits | CONFIRMED | FAQ text; dateModified 2026-06-01 |
| 37 | Alarms: at-least-once, 2 s backoff, up to 6 retries, one alarm per object | curl alarms | CONFIRMED | Verbatim |
| 38 | DO SQLite: FTS5 + fts5vocab, JSON, 30-day PITR | curl sqlite API | CONFIRMED | Verbatim |
| 39 | KV Free 100k reads / 1,000 writes per day, 1 write/s per key, 1 GB | curl kv limits | CONFIRMED | Table |
| 40 | D1 Free: 10 DBs, 500 MB, 5 GB, 50 queries, 7-day Time Travel; Paid 10 GB, 30 days; FTS5 | curl d1 | CONFIRMED | Table |
| 41 | Queues Free 10,000 ops/day, 24 h retention | curl queues | CONFIRMED | Verbatim |
| 42 | R2 free 10 GB-month, 1M A / 10M B, free egress; r2.dev rate-limited | curl r2 | CONFIRMED | Verbatim |
| 43 | CF Pages: 500 builds/mo, 1 concurrent, 20 min, 20k files, 25 MiB | curl pages limits | CONFIRMED | Verbatim |
| 44 | Pages doc says "Using Durable Objects with Workers is simpler and recommended" | grep 2 pages | UNVERIFIABLE | Quote not found |
| 45 | Workers AI: 10k neurons/day; whisper-turbo $0.0005/min = 46.63 neurons, so ~214 min/day; nova-3 $0.0052 | curl AI pricing + arithmetic | CONFIRMED | 10,000 / 46.63 = 214.5 |
| 46 | Quick tunnels: 200 in-flight, no SSE, changing hostname | curl | CONFIRMED | Verbatim |
| 47 | WS hibernation: clients stay connected, no GB-s accrual | curl WS best practices | CONFIRMED | Verbatim |
| 48 | Oracle A1 1,500 OCPU-h / 9,000 GB-h, i.e. 2 OCPU / 12 GB; idle reclamation rule; capacity errors; 10 TB | curl Oracle doc | CONFIRMED | Verbatim |
| 49 | GCP e2-micro (3 US regions, 30 GB, 1 GB egress) | curl | CONFIRMED | Verbatim |
| 50 | Fly trial "2 hours … or 7 days" | curl | CONFIRMED | Verbatim |
| 51 | Fly shared-cpu-1x 256 MB ≈ $0.44–0.46/mo | curl pricing | UNVERIFIABLE | Not on the fetched page (calculator) |
| 52 | Render: 15 min spin-down, ~1 min spin-up, Postgres expires after 30 days | curl | CONFIRMED | Verbatim |
| 53 | Railway: $5 trial grant; Hobby $5 includes $5 of usage | curl | CONFIRMED | A Free plan is also listed |
| 54 | Vercel Hobby cron once per day, ±59 min; non-commercial | curl | CONFIRMED | Verbatim |
| 55 | Netlify scheduled functions on all plans, 30 s, published deploys | curl | CONFIRMED | Verbatim |
| 56 | Deno Deploy Free 1M req, 10 h CPU, 20 GiB, KV; Classic sunset July 20, 2026 | curl | CONFIRMED | Cron-jitter quote is from the Classic page |
| 57 | Supabase Free: 500 MB, Realtime 200 / 2M, 500k Edge calls, 1-week pause | curl pricing | CONFIRMED | Verbatim |
| 58 | Supabase has no free cron | curl docs/guides/cron | **REFUTED** | Supabase Cron: "every second to once a year", HTTP calls; no plan restriction stated |
| 59 | Firebase Spark: functions need Blaze; Hosting 10 GB / 360 MB/day | curl | CONFIRMED | Verbatim |
| 60 | Val Town Free 15-min cron; Pro $21 gives 1 min | curl | CONFIRMED | Verbatim |
| 61 | Pushover $4.99 one-time, 30-day trial, 10,000/month | curl | CONFIRMED | Verbatim |
| 62 | WebKit: Web Push iOS 16.4+, Home Screen only, user gesture, no Developer Program, `*.push.apple.com`, Badging | curl blog | CONFIRMED | Verbatim |
| 63 | Declarative Web Push: `"web_push": 8030`, `navigate` required, `window.pushManager`, iOS 18.4 | curl blog | CONFIRMED | Verbatim |
| 64 | iOS 26: every Home Screen site opens as a web app; "zero requirements for installability" | curl blog | CONFIRMED | Verbatim |
| 65 | caniuse: no Background Sync on iOS (to 27.2); push needs Home Screen; backdrop-filter Firefox 103+; ui-monospace Safari-only | raw caniuse JSON | CONFIRMED | Stats as quoted; the WKWebView note is caniuse's desktop-Safari note |
| 66 | Apple Font License forbids embedding and website use | curl developer.apple.com/fonts | CONFIRMED | Verbatim |
| 67 | HIG: SF Symbols "prohibition…"; Liquid Glass "distinct functional layer", "sparingly" | HIG JSON endpoints | CONFIRMED | Verbatim |
| 68 | Apple Developer $99/yr, Xcode Cloud 25 h/mo, push; Personal Team 7-day profiles, 3 devices | curl Apple pages | CONFIRMED | Verbatim |
| 69 | Lucide is ISC; Feather-derived icons MIT | lucide.dev/license + LICENSE file | CONFIRMED | Verbatim |
| 70 | Budget arithmetic (4,320 + 1,440 + 288 + 1,440 alarms/crons; SSE 10,800 GB-s; 725 GB-s; 5,760 req; ~$11/mo Whisper) | Recomputed | CONFIRMED | 0.125×86,400 = 10,800; (960−214)×30×$0.0005 = $11.19 |
| 71 | .gov sites reachable from CF egress; RTX 2080 STT throughput; CF alarm jitter; Web Push latency | n/a (needs deployment) | UNVERIFIABLE | Already flagged by the researcher; no Cloudflare account in this session |

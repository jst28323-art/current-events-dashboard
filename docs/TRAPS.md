# TRAPS — facts that cost a day if you don't know them

Uncapped, versioned, never deleted. Add a trap the moment one bites (date + evidence). If a trap stops being true,
strike it through with a dated note and keep it. Each source trap cites the research report that measured it (dated
2026-10-02 evidence in `docs/research/`); re-measure before relying on a number.

## Calendar

- **Congress is in recess until Mon 2026-11-09.** Both chambers hold only short pro forma sessions (the House is in a
  district work period), so there are no recorded votes before Nov 9. Build and test against **recorded fixtures** from the
  Sep 15–16 (House) and Sep 28–30 (Senate) session days. Measure live latency from Nov 9.
  (`docs/research/congress_floor_votes.md`, `docs/research/curation_priorart_future.md`)

## Upstream data sources

- **HTTP 200 does not mean success.** The House Clerk returns 200 with an error body for a roll call that does not
  exist, and docs.house.gov returns 200 `text/html` "File Not Found" for a missing week. Validate the body (root
  element, content type), never just the status. (`docs/research/curation_priorart_future.md`, `docs/research/congress_floor_votes.md`)
- **Which cache validator works differs by source** (some answer `If-Modified-Since` with 304 but ignore `If-None-Match`
  and send the full body every time). The `docs/SOURCES.md` row records which validator each source honours; probe it
  for every new source. (`docs/research/architecture_hosting_frontend.md`, `docs/research/congress_floor_votes.md`)
- **A changed validator does not mean new items.** The White House RSS ETag and Last-Modified change site-wide with no new
  item, and Congress.gov RSS Last-Modified is the CDN refill time. Dedupe by GUID or content hash, never by "the
  validator changed". (`docs/research/curation_priorart_future.md`, `docs/research/congress_legislation_committees_courts.md`)
- **Upstream CDNs set a freshness floor.** Some APIs serve cached copies that are many minutes old even when they
  say `no-store`; polling faster than the cache gains nothing unless the request bypasses it. Per-source figures live
  in the source's row in `docs/SOURCES.md`. (`docs/research/architecture_hosting_frontend.md`)
- **Source timestamps are last-edit, not first-appearance.** `updateDate`, `lastModified` and RSS `pubDate` move on
  every revision (a bill's status file was re-stamped 46 h after the vote by a citation fix). Record our own
  `first_seen_at` for every item; never compute latency from a source's own stamp alone.
  (`docs/research/congress_legislation_committees_courts.md`)
- **Time zones lie.** Clerk times are truncated to the minute; House hearing XML is Eastern time with no offset; the
  Senate Democrats RSS labels daylight-time posts "EST". Normalize everything to UTC at ingest and test the DST edges.
- **api.data.gov `DEMO_KEY` is useless for real work.** The observed limit was 10 requests per UTC day per API (separate
  counters for Congress.gov and GovInfo), shared by everything on the same IP. Never use DEMO_KEY in CI; use the owner's
  free key (5,000/h on Congress.gov) from a secret. (`docs/research/architecture_hosting_frontend.md`, `docs/research/congress_legislation_committees_courts.md`)
- **HouseLive hangs on a day that has not happened yet** (2026-10-02, n=1 each): `/broadcastevents/20261005` and
  `/transcripts/2026-10-05` sent no response within 30 s, while `/floor/2026-10-05` answered 200 `[]` at once. Give every
  FloorCast call a timeout and treat a timeout as "not yet", never as an outage. (`scripts/capture_live.mjs` dry run)
- **The HouseLive backend is undocumented** (row `house.floorcast` in `docs/SOURCES.md`): it can change without notice,
  so the official Clerk XML stays the fallback and the adapter must fail closed on drift.
- **Senate floor caption playlists disappear (404) after the day ends.** Capture live or lose it.
  (`docs/research/live_media_transcripts.md`)
- **Bot walls.** HHS, Commerce and the war.gov homepage return 403 to scripts (DHS does not, despite an early report); the federalregister.gov *website*
  blocks scripts (use its API); C-SPAN serves a bot challenge and its terms forbid bots and AI use (link-out only).
  (`docs/research/executive_branch.md`, `docs/research/curation_priorart_future.md`)
- **YouTube is detect-and-embed only.** Captions of other people's videos cannot be fetched through the API and its terms
  forbid downloading; channel RSS lists a live stream only after it ends; `search.list` is capped at 100 calls/day.
  Detect White House live events from the `data-live-duplex` flag on whitehouse.gov/live/ instead.
  (`docs/research/executive_branch.md`, `docs/research/live_media_transcripts.md`)
- **The White House stopped posting remarks/briefing transcripts** (its remarks feed ends 2025-01-20), and the official
  compilation of presidential documents lags ~34 days. (`docs/research/executive_branch.md`)
- **The FR `documents.json` copies an extra query parameter into `next_page_url`** (2026-10-02, live: with
  `&_=1790977406839` the body's `next_page_url` began `documents?_=1790977406839&fields…`). A cache-buster therefore
  changes the raw body on every poll, and a body-hash validator sees "changed" every time. `workers/api` hashes the body
  with the request's own `_=<stamp>` token removed (`cacheBustToken` in `workers/api/src/policy.ts`). `current.json` has
  no `next_page_url`. (fr.api live smoke, 2026-10-02)
- **An empty FR `documents.json` answer has no `results` key** (2026-10-02, live:
  `{"description":"Documents matching 'qqzzxxnonexistentterm'","count":0}`), while the Public Inspection search answers
  `{"count":0,"results":[]}`. A parser that requires `results` reports drift on a valid empty answer. `fr.api` treats
  exactly `description` + `count: 0` as empty, and anything else without `results` as drift.
- **The FR's `count` means two different things** (2026-10-02 fixtures). In `public-inspection-documents/current.json`
  it is the length of the one unpaginated list (count 107, 107 results). In `documents.json` it is the number of matches
  over all pages, capped at 10000 (`count: 10000` with 20 results and `total_pages: 50`). Never compare `count` to the
  page length on documents.json; on current.json a mismatch is drift.
- **FR agency lists differ between Public Inspection and publication** (2026-10-02 fixtures). PI lists only the issuing
  sub-agency (58 of 107 documents, e.g. U.S. Customs and Border Protection with `parent_id` 227), while `documents.json`
  lists the parent department first (Health and Human Services, then CMS). Keying anything on "the first agency" gives
  one document two different agencies; `fr.api` uses the most specific listed agency (D-034). Most FR titles also end in
  spaces ("Meetings; Sunshine Act  "): trim before comparing or linking by title. (`fixtures/fr.api/2026-10-02/`)
- **A White House category is a label, not a document type** (2026-10-02). "Establishing the United States Space
  Academy" (`?p=49230`, posted 2026-08-28) is filed under Proclamations, but the Compilation of Presidential Documents
  lists it as Executive Order 14423. "Nominations & Appointments" also holds "Withdrawals Sent to the Senate"
  (`?p=50428`). The post's own heading is the check: 12 of the 13 posts filed under Proclamations in the presidential
  actions fixture open with "By the President of the United States of America A Proclamation"; `?p=49230` does not,
  and no EO or memorandum post does. The operative words are not a test: `?p=50532` is a real proclamation that reads
  "it is hereby ordered". So `wh.feeds` titles say "posted under <category>", types a contradicted filing as
  `presidential_action.other` at P0 (D-035), and the EO number and true type come from the Federal Register. The
  WH-category condition in the link rule of `docs/research/curation_priorart_future.md` §2.4 would miss this post.
  (`fixtures/wh.feeds/2026-10-02/presidential-actions_feed.xml`; `docs/research/executive_branch.md` §4)
- **A content-hash skip hides parser fixes, and a hash-only skip freezes conditional GET** (2026-10-02, workers/api
  review W2/W9, reproduced in workerd tests). If "same body hash = do not parse" ignores which code parsed the body, a
  deployed adapter fix waits until the upstream body changes, which can be days for slow sources. If the skip does not
  also store the response's fresh ETag / Last-Modified, then after one site-wide validator change (wh.feeds) every poll
  is a full download. `workers/api` keys accepted bodies by sha-256 + Worker version id and refreshes validators on a
  hash match (D-038).
- **GovInfo's Federal Register RSS `pubDate` is a package (re)processing time, not when the issue went up** (2026-10-03,
  `https://www.govinfo.gov/rss/fr.xml`, 100 items). FR-2026-08-24 is stamped 2026-09-29 18:44 ET and FR-2026-09-18 is
  stamped 2026-09-23; only some packages carry a time on their own issue date (00:47-05:24 ET). Never read an FR issue's
  posting time from it; measure it from our own first sighting on the FR API (`docs/SOURCES.md` row `fr.api`).
- **Size a page or a cap on the whole recorded history, not a recent window** (2026-10-03, fr.api review R1). The first
  `documents_newest` page size came from the FR's daily counts for 2025-01-02..2026-10-02 (n=437, largest 279). That
  window began three publication days after the largest issue since 1994 (344 on 2024-12-30). Extremes cluster at year
  end and around a change of administration. The FR's daily facet goes back to 1994 in one ~550 KB request: record it
  and pin the rule to the fixture (`fixtures/fr.api/2026-10-03/facets_daily_since_1994.json`, D-047).
- **The FR API lists the next issue's documents before their publication date** (2026-10-03, the live ced-api's poll
  record and `fixtures/fr.api/2026-10-03/documents_newest_next_issue_early.json`). On Saturday `documents.json`
  (order=newest) began with Monday's issue: 106 documents dated 2026-10-05, absent at 07:15Z and present by 08:15Z.
  A rule that a listed document can never be dated after the poll day (the old FR-6, one day of slack) threw away every
  weekend's list and showed the FR as drift for ~16 h. Such a document is now "scheduled" (D-055, D-059). The same
  reply means something different once its date arrives, so a "same body hash = do not parse" skip must also key on
  the date (`Endpoint.dayDependent`); otherwise the flip waits for the FR's list to change. How early the FR lists a
  weekday issue is not yet measured.
- **An FR document listed early is already public on federalregister.gov** (2026-10-03 13:3xZ, review of 861a6f4).
  Two days before its publication date, the page of 2026-20439 answered 200 and said "This document has been published
  in the Federal Register", Publication Date 10/05/2026, and the issue's govinfo PDF answered 200. So the link of a
  "scheduled" row works, and "not yet published" is the wrong description: the FR has made it public with an official
  date that has not come yet. Our title names that date (D-059). A listed document the FR later drops is never
  revised by the Hub (it changes only events that arrive), so the page says "not seen published" once its date has
  passed (D-060).

## Hosting

- **GitHub Actions cron cannot drive a live feed**: most scheduled runs never ran in the measurement (D-008).
- **The Workers Free CPU limit per invocation is tiny** (figures and consequences: `docs/ARCHITECTURE.md`,
  "Constraints that shape the code"). Whether Durable Object alarms get the same limit on Free is undocumented: probe it
  (ROADMAP P1.3) before building on it.

- ~~**JSON-Schema validators that compile with `new Function` / `eval` do not run inside Cloudflare Workers**
  (UNVERIFIED general knowledge, 2026-10-02: Ajv's default compile is one). Use a validator without code generation, or
  precompile standalone validators at build time; prove it in a Workers-pool test before relying on it.~~
  (2026-10-02, measured in workerd 1.20261001.1, compat date 2026-10-01; superseded by the next two entries.)
- **Code generation (`eval` / `new Function`) is blocked at REQUEST time in production Workers, but allowed at startup**
  (`allow_eval_during_startup`, default since compat date 2025-06-01). So Ajv's `compile()` works at global scope and
  throws `EvalError: Code generation from strings disallowed` inside a handler; TypeBox caches "eval works" from its
  first call, so a first compile at startup makes a later in-request compile throw. The project uses
  `@cfworker/json-schema`, which never generates code (D-029).
- **The Workers test pool is MORE permissive than production**: inside `@cloudflare/vitest-plugin` tests, `new Function`
  works even at request time, and the plugin adds node-compat flags production does not have. A green Workers test
  therefore cannot prove a library is eval-free; that needs the real bundle (`wrangler deploy --dry-run --outdir`) run in
  plain Miniflare/workerd. A text search of the bundle is not enough either (esbuild rewrites `new Function` as
  `new globalThis.Function(`).
- **`@cloudflare/vitest-pool-workers` was renamed `@cloudflare/vitest-plugin`** (1.0.0 on 2026-08-20; the old package
  stopped at 0.22.0 and is not marked deprecated). The old `defineWorkersConfig` / `test.poolOptions.workers` config is
  gone: use `cloudflareTest({ wrangler: { configPath } })` in a `defineProject` config. The plugin's vitest peer is
  `^4.1.0`; Vitest 5 fails (ERESOLVE, then `SyntaxError: Unexpected identifier 'file'`). The plugin pins an exact wrangler:
  bump the two together. In tests, import `env` / `exports` from `cloudflare:workers` (`cloudflare:test`'s are deprecated).
- **TypeScript 7 defaults `types` to `[]`**: every tsconfig must list what it uses (`node` for tests that read fixtures;
  `./worker-configuration.d.ts` + `@cloudflare/vitest-plugin/types` for the Worker). `worker-configuration.d.ts` is
  generated by `wrangler types` (gitignored; the Worker's `typecheck` script regenerates it).
- **`nodejs_compat` is on by default from compat date 2026-08-04**; don't add the flag (some workerd builds reject it).
- **A Worker's main module may export ONLY the default handler and entrypoint classes** (Durable Objects,
  WorkerEntrypoints). workerd treats every named export as an entrypoint and refuses to start if one is a plain value.
  2026-10-02: the ced-probe bundle (wrangler 4.147.0 dry-run) in plain Miniflare 5.20261001.0-alpha / workerd
  1.20261001.1, compat date 2026-10-01, failed with "Uncaught TypeError: Incorrect type for map entry 'CPU_GAP_MS': the
  provided value is not of type 'function or ExportedHandler'", while the `@cloudflare/vitest-plugin` suite was green on
  the same code. `workers/api` had the same defect (`HUB_NAME`, now in `workers/api/src/hub_ref.ts`). Keep constants and
  helpers in other modules; `workers/api/test/entry.test.ts` and `workers/probe/test/entry.test.ts` pin each export
  list. Production runs the same runtime, so expect a deploy to fail the same way (UNVERIFIED in production).
- **Miniflare 5 rejects the v4 options shape.** miniflare 5.20261001.0-alpha (the copy wrangler 4.147.0 installs) fails
  `new Miniflare({ modules, scriptPath, compatibilityDate, bindings, durableObjects, outboundService })` with
  `ERR_VALIDATION` "Unrecognized keys ... expected array at workers"; options now live under `workers[]`, and its README
  still documents the old shape. Wrap v4-style options in `convertV4MiniflareOptions({ workers: [ ... ] })` (exported by
  miniflare; the vitest plugin does the same). Running the real bundle this way, with `outboundService` intercepting
  fetches, is the no-network check the test pool cannot replace (see the test-pool entry above). (2026-10-02,
  workers/api and workers/probe scratch smokes)
- **Workers RPC types a Durable Object method's result as `never` when it is not provably structured-cloneable, and
  `never` is assignable to everything.** Anything containing `CedEvent` qualifies (its `result` / `transcript` are
  `Record<string, unknown>`), so passing the stub where an interface is expected still typechecks while lying.
  (2026-10-02, workers/api: tsc reported `Property 'body' does not exist on type '{ ok: false; error: string; } &
  Disposable'`; the `ok: true` branch that carried events had silently become `never`.) `workers/api` sends events across
  RPC as their stored JSON text, and `workers/api/src/hub_ref.ts` has a compile-time guard that fails if any HubDO stub
  result is `never`.
- **An exception that escapes a Worker's fetch handler is answered by Cloudflare's own error page, with none of our
  headers** (by inspection plus the 2026-10-02 workers/api review probe W3; NOT reproduced in production). With no CORS
  grant, a browser app sees an opaque CORS failure instead of a readable error. Every route that calls a Durable Object
  needs a catch that answers JSON with the CORS headers; a DO call can fail on any deploy ("Durable Object reset because
  its code was updated"). `workers/api/src/http.ts` answers 503 JSON.
- **The `version_metadata` binding keys per-deploy behaviour; gradual deployments would break it** (2026-10-02, by
  inspection, not measured). `workers/api` tags each accepted body with `env.CF_VERSION_METADATA.id`, so the first cron
  after a deploy re-parses every endpoint once. Under a gradual (percentage) deployment two version ids would alternate
  between cron runs and re-parse on every poll. Keep `wrangler deploy` at 100%, or change the key. (wrangler 4.147.0
  lists version_metadata as supported locally; in the vitest-plugin runtime the id is a non-empty string,
  `workers/api/test/index.test.ts`.)
- **A cold isolate costs several times the warm CPU.** The wh.feeds parse takes about 1 ms warm but 7-10 ms on the
  first call in a fresh Node process (2026-10-02; the measured figures, with n and Node versions, are in the
  `docs/SOURCES.md` row `wh.feeds`). Most of that is first-use JIT
  cost: fast-xml-parser about 3.5 ms, XMLValidator about 1.2 ms, and 30 validateEvent calls another 4-5 ms when they ran
  inside the adapter. Measure CPU on a cold isolate (ROADMAP P1.3), not only warm.
- **The same JS loop can run at different speeds in Node and in workerd on the same machine, so CPU work calibrated in
  Node is wrong in a Worker** (2026-10-02, review finding R1 on `workers/probe`). An xorshift32 loop whose accumulator was
  wrapped to int32 (`acc = (acc + v) | 0`) ran at 334k-340k iterations/ms in plain workerd 1.20261001.1, and at
  863k-911k in Node 26.3.0 (921k in Node 22.23.3) on the dev PC, so every "N ms" level burned ~2.6N ms. The same loop with
  an unwrapped (double) accumulator ran at 886k vs 880k. Float loops and JSON.parse ran at the same speed in both. The
  cause is UNVERIFIED (workerd's pointer-compressed V8 has 31-bit small integers). Calibrate in workerd
  (`workers/probe/scripts/calibrate.mjs`) and pin runtime equality with a same-machine ratio test
  (`workers/probe/test/busy.test.ts`).
- **Local workerd's clocks advance during pure compute; production's are documented not to** (2026-10-02). In plain
  Miniflare 5.20261001.0-alpha (compat 2026-10-01), two Date.now() reads around a 1e8-step loop with no I/O differed by
  140 ms (performance.now as well), and the vitest pool's performance.now advances in 1 ms steps. Per Cloudflare's docs,
  a deployed Worker's clock only advances on I/O (not measured here). A timing test or log line that works locally can
  therefore read 0 in production. Time CPU work from outside (Node around dispatchFetch) or with Workers Observability
  cpuTime.
- **Plain Miniflare names a module by its path relative to the process's working directory** (2026-10-03, miniflare
  5.20261001.0-alpha, verified both ways). A `scriptPath` outside the cwd (e.g. a harness run from a scratch folder
  against the api Worker's built bundle, dist/index.js) fails to START with
  `service core:user:ced-api: Uncaught Error: internal error; reference = ...` and `ERR_RUNTIME_FAILURE`, while the
  identical bytes start fine under the cwd. Run plain-Miniflare
  checks from the repo directory, or set `modulesRoot` to the bundle's directory.
- **Miniflare 5's `convertV4MiniflareOptions` silently drops a worker's v4 `durableObjectsPersist`** (2026-10-03,
  miniflare 5.20261001.0-alpha, Node 26.3.0). With `durableObjectsPersist: <dir>` the run worked but wrote nothing to
  that directory and raised no error (reading it afterwards: ENOENT); the option name appears nowhere in miniflare 5's
  dist. The miniflare 5 option is the top-level `resourcePersistencePath: <dir>`: with it, the HubDO's SQLite appeared
  there (3 `.sqlite` files), survived `dispose()` and a new Miniflare on the same path, and was readable with
  `node:sqlite`.

## This machine and harness

- **The harness Bash tool is git-bash on Windows.** It sees `C:/Users/...`, not `/mnt/c/...`. Push from Windows git
  (`git -C C:/Users/j/claude/current-events-dashboard push origin main`); WSL git has no credential helper and hangs on a
  prompt that looks like a network stall.
- **The local GitHub token (used by both `git` and `gh`) has limited permissions** (as of 2026-10-02): it can push
  code and workflow files (the owner added "Workflows") and has "Pages", but it lacks "Administration: write" for this
  repo (so it cannot change repo settings such as turning Pages on; the owner did that by hand) and "Actions: write"
  (so `gh workflow run` fails with 403; to re-run a workflow, push a commit). A 403 response's
  `X-Accepted-GitHub-Permissions` header names exactly what a call needs (`gh api -i …`).
- **Claude cloud routines (claude.ai "Default" environment) cannot reach the .gov sources** (2026-10-02, smoke run of
  the D-028 routine, session `cse_01UeHciy55xURehwQHjizF5R`): senate.gov, the Senate Akamai stream host, the HouseLive
  Azure backend, clerk.house.gov and dailypress.senate.gov all answered HTTP 403 with a ~100-byte body and no `server`
  header (the sandbox's outbound proxy). The same URLs answered 200/404 from this PC. A cloud session also runs the
  repo's Claude Code hooks, so `scripts/hooks/push_guard.mjs` refuses any push except `git push origin main`, even a
  `--dry-run` to a side branch. Anything that must fetch upstream on a schedule runs on Cloudflare or on the home PC
  (D-033), never in a cloud routine; and a smoke check must fail on 403, not count it as "reachable" (fixed in
  `scripts/capture_live.mjs`).
- **The Windows scheduled task for the D-033 capture runs only while the owner is signed in on this PC** (2026-10-03,
  `schtasks /query /xml`: LogonType InteractiveToken, "Interactive only", no WakeToRun; StartWhenAvailable is set, so a
  late sign-in before the task's end boundary still starts it). If the PC is off, asleep or signed out for the whole
  window, nothing is recorded and the day cannot be recorded again. The run's final snapshots are taken right after
  its `--until` time, so read `scratch/capture_task.log` only once it ends with an "exit" line (cold-start r3).
- **Where Claude Code is launched decides what the repo's `.claude/` does.** Launched from the repo directory, the hooks
  in `.claude/settings.json` fire (ship_state at session start, the push guard, the dirty-handoff warning) and workflows
  resolve by name. Launched from the parent `C:\Users\j\claude` (as the canonical prompt implies), those hooks do NOT
  fire: run `node scripts/ship_state.mjs` yourself before every push (the push grant requires its `PUSH` verdict anyway),
  and call workflows by absolute `scriptPath`. The git hooks (`core.hooksPath`) fire either way, and the pre-push hook
  refuses to update main to a commit without a gate stamp, so an ungated push fails even from a parent-launched session. The repo's skills may
  not appear in the skill list either: read them by path (`.claude/skills/handoff/SKILL.md`,
  `.claude/skills/add-source/SKILL.md`) and follow them as written.
- **Secrets go in through GitHub's web UI.** ~~Whether the local token has the "Secrets" permission is unrecorded
  (assume not)~~ (2026-10-02: measured: `gh secret list` returns HTTP 403 "Resource not accessible by personal access
  token", so a session cannot even see secret NAMES; confirm a secret by the workflow that uses it, e.g. the
  `deploy-workers` run stops logging "Cloudflare secrets are not set yet"). The owner pastes keys into Settings →
  Secrets and variables → Actions themselves.
- **Long heredocs containing apostrophes or backticks fail in the harness Bash.** Write files with the Write tool.
- **This PC runs Node 26 (npm 11); CI runs Node 22.** Something can pass locally and fail in CI (or the reverse), and
  `package.json` says `>=22`. Avoid Node-26-only APIs; CI is the judge.
- **`node --test <directory>` fails on Node 26** ("test failed" on the directory itself): pass the test files
  explicitly (`npm run test:harness` and `scripts/gate.mjs` already do).
- **This PC can get slow at starting processes.** On 2026-10-02 afternoon every launch (`node -e 0`, `git --version`)
  took 4–11 s with CPU at 8% and 20 GB RAM free, so the gate took ~5 minutes instead of seconds. If the gate is slow, time
  `node -e 0` first: it is the host, not the harness. Several orphaned `grep --line-buffered` monitor processes from
  September aviary sessions were also still running (left alone; the owner may end them).
- **Headless Edge cannot render narrower than ~500 px**, so a `--window-size=390,…` screenshot is cropped, not a phone
  layout. Screenshot phone widths through a 390-px iframe (or Playwright device emulation).
- **The owner's home PC also runs GPU training for another project (aviary).** Anything always-on there must be light
  and must yield the GPU (D-003).
- **Parallel subagents of one session share ONE scratchpad directory** (2026-10-02). Two build agents both wrote
  `scratchpad/mutate.sh`. The probe agent's copy replaced the web agent's, and the web agent then ran the probe agent's
  mutation script by mistake (~17:12-17:17 CDT). It applied and restored mutations M1-M3 in `workers/probe/src` and was
  killed by a `timeout` during M4. A read-only grep afterwards found no mutation markers left, and do.ts matched the
  probe agent's own backup. Rules: give scratch files an agent-unique subdirectory (e.g. one named after the component),
  and never wrap a mutate-and-restore script in `timeout` unless it restores on exit (a shell `trap`).
- **Python text-mode writes on this PC produce CRLF, and git-bash `grep -c $'\r'` does not see CR** (it reported 0
  while `tr -cd '\r' | wc -c` counted 29). Check line endings with `git ls-files --eol <file>` (w/crlf vs w/lf) or
  `tr`, not grep. (2026-10-02: ci.yml, pages.yml and two web tests were briefly CRLF in the working copy; fixed with sed.)
- **On Windows, `process.cpuUsage()` advances in ~15.6 ms scheduler ticks**, so CPU timings of short work read as 0,
  15/16 or 31/32 ms. Measure >= 100 ms per sample, or use the wall clock of a single-threaded loop on an idle core.
  (2026-10-02, `workers/probe/scripts/calibrate.mjs`: busy(2e6) median CPU 0 ms, busy(2e7) 15-32 ms, versus wall 2.3 ms
  and 23 ms.)
- **Unicode escapes can be rewritten on the way to disk** (2026-10-02). A `\uFEFF` escape inside a TS regex and a
  string, written with the harness Write tool, landed as a literal invisible BOM (bytes EF BB BF in
  `workers/probe/src/probe.ts`; `\u0000` escapes in the same file were untouched). Separately, in a GNU sed replacement
  `\u` means "uppercase the next character", so a sed that should have written `\uFEFF` produced `FEFF`. The docs pass
  hit both again on this very entry: the harness Edit tool turned the escape text into a BOM, and a git-bash
  `perl -pi -e` substitution meant to repair it wrote `FEFF` (cause unverified). A node script that builds the text
  with `String.fromCharCode(92)` worked. Build such characters with `String.fromCharCode(0xfeff)`, and check a written
  file with `grep -c $'\xef\xbb\xbf' <file>`.
- **Playwright's WebKit on Windows is not iOS Safari** (2026-10-03, WebKit 26.6 / Playwright 1.63). (a) It has no
  `OffscreenCanvas` ("Can't find variable: OffscreenCanvas"), so an in-page canvas PNG decoder fails;
  `apps/web/e2e/png.ts` decodes in Node (D-052). (b) It accepts `backdrop-filter` (computed value
  `blur(20px) saturate(1.8)`, `CSS.supports` true) but paints nothing: a bare overlay screenshots byte-identical with
  and without it, while Chromium's differ. So default-settings WebKit screenshots show rows printing through the header
  text, and cannot verify the material. The opaque fallback (D-054) applies only under more contrast, reduced
  transparency or no backdrop-filter support, so `webkit-scrolled-*.png` still look that way: that is the instrument,
  not the iPhone. (c) It cannot emulate safe-area insets (always 0). Chromium can, through
  `Emulation.setSafeAreaInsetsOverride` over a CDP session (`apps/web/e2e/safe-area.spec.ts`). (d) It paints
  alpha-blended text one level lighter than Chromium (0.55-alpha black on a 234 gray chip: 106 vs 105). That put a
  4.56:1 word at 4.50:1, so keep at least 5% margin above any contrast bar (D-053). (e) It is ~10x slower per e2e test
  on this PC (median 2.7 s vs 0.25 s); the local gate's e2e step time is in `TESTING.md` layer 5.
- **Playwright's WebKit 26.6 does not know `prefers-reduced-transparency`, and Playwright cannot emulate it in any
  engine** (2026-10-03, probe). In WebKit, `matchMedia('(prefers-reduced-transparency: reduce)')` and
  `...: no-preference)` both match false, which is how an unknown feature behaves. Chromium knows it (no-preference
  matches by default) and emulates it over CDP: `Emulation.setEmulatedMedia` with the feature
  `prefers-reduced-transparency` set to `reduce`, which survives later `page.emulateMedia` calls
  (`apps/web/e2e/layout.spec.ts` WK4). `prefers-contrast: more` is emulated in both engines with
  `page.emulateMedia({ contrast: 'more' })`. Whether iOS Safari honours prefers-reduced-transparency is unverified.
  Related: Chromium answers `CSS.supports('-webkit-backdrop-filter', 'blur(1px)')` false; only WebKit knows the prefix.
- **A test keyed on a Playwright project NAME silently stops applying to a new project** (2026-10-03).
  `info.project.name === 'phone'` gave the new `webkit-phone` the desktop 24 px tap bound and skipped its contrast
  checks, all green. Read the emulated properties instead (`isMobile`, `deviceScaleFactor`: `apps/web/e2e/project.ts`).
- **`page.clock.install({ time })` keeps running in real time until `pauseAt`** (2026-10-03). Installed only 1 s before
  the `pauseAt` target, a slow WebKit worker passed it first: "clock.pauseAt: Cannot fast-forward to the past". Install
  well ahead (`openPaused` uses 60 s, `CLOCK_INSTALL_LEAD_MS` in `apps/web/e2e/mock-api.ts`); the jump fires nothing
  before the page loads.
- **Intermittent Chromium "Protocol error (Page.captureScreenshot): Unable to capture screenshot"** (2026-10-03, cause
  unverified). Seen on a desktop `screens.spec.ts` shot in 2 of 9 e2e runs that included Chromium after WebKit was added
  (one a Chromium-only run, so not WebKit load); 0 of 4 runs before. `apps/web/e2e/shot.ts` now retries exactly that
  error, at most twice, never an assertion (`apps/web/test/shot.test.ts`). Separately, one full gate run failed WK4
  (dark, Chromium desktop) and passed in isolation and in a full rerun; the gate log keeps only 25 lines, so its error
  text was lost. Every local e2e run now also writes `scratch/e2e-last.json`: read it after a red gate.
- **`spawnSync`'s default 1 MB output buffer fails on a large git history** (2026-10-03). The gate's secret scan read
  ~1.5 MB of unpushed fixtures and failed with "spawnSync git ENOBUFS": fail-closed, but a false red. `run()` in
  `scripts/lib/git.mjs` now passes `maxBuffer` 512 MB; regression test in `tests/harness/gate.test.mjs` (a 4 MB
  committed file scans clean, and a key committed after it is still caught).

- **A workflow agent with `isolation: 'worktree'` left `core.hooksPath` absolute in the shared `.git/config`**
  (2026-10-03). After the Phase 2 scouts' worktrees appeared under `.claude/worktrees/`, the main clone's config held
  the absolute path of this clone's hooks folder instead of `enforcement/git-hooks`. The scouts' transcripts show them
  only READING the value, so the worktree setup most likely wrote it. The hooks still ran, but `ship_state` reported
  SETUP-ERROR (it checks the exact relative value). After any worktree workflow, run
  `git config core.hooksPath enforcement/git-hooks` before the gate. `.claude/worktrees/` is gitignored.
- **The gate printed only the last 25 lines of a failing step, which hid a TypeScript error** (2026-10-03): tsc writes
  its errors to stdout, which the gate joined before stderr, and `wrangler types` filled the tail. The gate now prints
  every error-looking line first (`failureExcerpt`, harness test). A step's full output is still not kept: re-run it
  alone (e.g. `npm run typecheck > scratch/typecheck.log 2>&1`) and read the whole log, not its tail.

## Libraries and code

- **fast-xml-parser 5.11.2 defaults bend text and accept broken XML** (2026-10-02, probes plus mutation checks in
  `packages/adapters/test/wh_feeds.test.ts`). `trimValues: true` (the default) trims each text piece separately, so
  `A <![CDATA[mixed]]> title` becomes "Amixedtitle". `parseTagValue: true` (the default) turns a title "2026" into a
  number. Numeric entities such as `&#8217;` decode only with `htmlEntities: true`. `XMLParser.parse` does not throw on
  an unclosed tag, so run `XMLValidator.validate` first. The validator itself also accepts what XML forbids: an
  undefined entity (`&bogus;` is then kept as literal text, and `&nbsp;` is decoded), a reference to an illegal
  character (`&#0;` and `&#xD800;` are silently dropped, `&#x110000;` is kept literally), a malformed `&#x;`, and raw
  control characters. `packages/adapters/src/lib/rss.ts` sets the options and refuses all of these (`xmlTextProblem`),
  and its tests pin both.
- **A hand-rolled XML scanner must skip comments and processing instructions, not only CDATA.** Inside `<!-- -->` and
  `<? ?>`, a `</description>` or `<![CDATA[` is plain text. A scanner that skipped only CDATA dropped a whole item
  silently, and read a `<guid>` hidden inside a comment as the item's guid (review WH-2, 2026-10-02; regression tests in
  `packages/adapters/test/wh_feeds.test.ts`).
- **Two Preact copies freeze the web page** (2026-10-02, measured). npm put preact 11.0.0 in the root `node_modules` (as
  `@preact/signals`' peer) while `apps/web` pinned preact 10.29.8 in its own `node_modules`. `@preact/signals` resolved
  Preact 11 and attached its hooks there, while the app rendered with Preact 10. The page painted once and never
  re-rendered: it stayed on "Loading live data…" although the Playwright trace showed `/api/v1/status` and
  `/api/v1/events` answered 200. The first e2e run had 34 of 38 tests red. Guards: the root `package.json` `overrides`
  pins preact 10.29.8 (one copy installed), `apps/web/vite.config.ts` sets `resolve.dedupe: ['preact']`, and
  `apps/web/test/bundle.test.ts` plus the e2e suite check it. Any new web dependency that imports preact needs the same
  check.
- **Sorting UTC timestamps as strings breaks once fractional seconds appear** (2026-10-02, by inspection, not yet
  bitten). `'...T15:15:00.123Z' < '...T15:15:00Z'` because '.' (0x2E) sorts before 'Z' (0x5A), and both forms pass the
  schema's UTC pattern: first_seen_at and retrieved_at come from toISOString() with milliseconds, while source times
  usually have none. Compare parsed epoch milliseconds instead (`workers/api` stores `sort_ms` as an integer).
- **A reset API hub rejects every saved cursor with HTTP 400** (2026-10-02, read in `workers/api/src/hub.ts`). After the
  hub's store epoch changes (e.g. the Durable Object storage is reset), `/api/v1/events?since=<old cursor>` answers 400.
  A client that keeps resending its cursor after a 4xx is stranded until it reloads: the first Web v0 build did exactly
  that, and its "Retrying every 15 seconds" banner stayed up for good (apps/web review W1). The rule every client needs (the web
  app, later alerts and the iOS app) is in D-040.
- **@cfworker/json-schema throws on a value JSON has no type for** (2026-10-03, review fuzz: 12,148 of ~199k calls).
  An undefined member (which survives a Workers RPC structured clone) raised `Instances of "undefined" type are not
  supported.` instead of returning invalid. `validateEvent` now catches it and returns invalid, "not validatable: ..."
  (`packages/schema/src/validate.ts`, D-050); the HubDO keeps its own catch as a second line.
- **merge.ts `canonical()` compares facts; it is not an equality for validity** (2026-10-03, by inspection; pinned by
  `workers/api/test/fastpath.test.ts`). It drops null and undefined members, so an event that lacks a required null
  member (times.occurred_at) canonicalizes the same as a valid one with null. Anything that skips validation by
  comparing to a stored copy must compare strict JSON (`workers/api/src/fastpath.ts` sameJson, D-050).
- **The Hub stores each row's order key when it writes the row** (2026-10-03, read in `workers/api/src/hub.ts`: the
  `sort_ms` column is set only on insert and on a rewrite). A change to the order rule (`packages/schema/src/order.ts`,
  D-048) re-sorts only rows written after the deploy; an unchanged stored row keeps its old key, and the API serves by
  that column. Changing the rule for existing rows needs a recompute of `sort_ms` (or a store reset; see the
  "reset API hub" entry above).

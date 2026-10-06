# PROGRESS — what happened, and how it was verified (newest first, append-only)

Each entry: what changed · how it was verified (commands + results) · what failed · corrections. Never rewrite an old
entry; correct it with a new one. Rotate the oldest entries to `PROGRESS_ARCHIVE.md` at ~500 lines.

---

## #9 — 2026-10-05 — Owner rulings D-097..D-104; the YouTube key and its one research call (D-105, D-106); P2.2 built early on a local branch (D-098)

**Asked for:** the canonical resume (session 4). Two AskUserQuestion rounds, each with a push notification: D-097 (do
the Google key walkthrough now), D-098 (build P2.2 now on a local branch: owner override of directive 4 for the build
only), D-099 (exit 3 counts documents but reports filing-slot sightings, decided before Tuesday's data), D-100 (answer
the Phase 3 questions now), D-101..D-104 (WebSub + `videos.list`, never RSS polling; both press galleries, labeled;
PBS NewsHour added as a named third party; one shared request budget per host for multi-agent research).

**YouTube key and call.** The walkthrough page <https://claude.ai/artifact/KzryEjf4wjwUgGRYneuCY6> was written from
two research workflows (Google/YouTube/GitHub docs, 6 agents, 39/39, 45/46 and 42/43 claims confirmed by their
checkers; YouTube API terms, researcher + verifier, 31/35 confirmed). The terms finding changed the design before
anything ran: data fetched with an API key may be kept at most 30 days and must not be disclosed, so the Action
encrypts its result to `.github/youtube-videos-list.pub.pem` and logs counts only (D-105; D-106 amends it: no
aggregate of any kind). The research's id list held 37, not 38 (corrected; the call took 39: the two other ids the
report cites). Verified: `tests/harness/youtube_videos_list.test.mjs` (a stub server echoes the key back; the key
appears in no URL, file or log line; a planted plaintext write fails two tests). The owner created the key (restricted
to the YouTube Data API v3, no billing), added the secret and ran the Action: run 37338433045, 2026-10-05T16:08Z,
HTTP 200, 39 of 39 returned, the log shows only that count. The decrypted copy is in the gitignored
`scratch/youtube/`; **delete `scratch/youtube/result_2026-10-05.json` and `scratch/youtube/run_37338433045/` by
2026-11-04** (D-105). Conclusions, in prose only: the research's §6.

**Exit 3 instruments.** `scripts/ledger_report.mjs` now prints each day's filing-slot sightings (D-099) and the White
House lag with items over 1 h counted apart. Descriptive read at 15:59Z (not the exit record): Monday's 93 PI
documents came from one 08:45 slot, all in one poll, 46.006 s; one White House item, which turned out to be
backdated (feed `pubDate` Oct 2, page `dateModified` 21 min before our first sighting; docs/TRAPS.md).

**Monday's recordings (P2.3, HANDOFF #3 step 3).** The one-time Windows task ran 19:45:00Z-21:30:01Z (owner signed
in, D-056): 146 recordings, every one HTTP 200, all 90 Senate caption segments (6 with cues, e.g. the clerk reading
"OCTOBER 5, 2026"; 84 bare headers for the silences), HouseLive changes, the House captions file, the Clerk XML and
the gallery list; exit 10. Reviewed file by file and committed with their `fixtures/README.md` rows. One extra list
recorded by hand at 21:33Z caught the Oct 5 gallery post going public about 17:31 ET, 91 minutes after the convene,
though its timestamps say 00:03 and 16:04 ET (`X-WP-Total` 1,842 -> 1,843; docs/TRAPS.md): the Senate "sitting"
sensor of P2.2 lags on pro forma days. The Windows task has no further run (its one-time trigger ended 17:00 CT,
last result 0) and is set to delete itself 1 h after that (`DeleteExpiredTaskAfter` PT1H, G-011): it still existed
at 21:45Z; confirm it is gone next session (`Get-ScheduledTask | ? TaskName -like 'CED*'`).

**P2.2 built early on local branches (D-098); nothing merged, pushed or live.** Three workflows, each run with one
shared request budget (D-104): round 1 (prep: `scripts/export_store.mjs` + the FR holiday and Senate tentative
fixtures; contracts: the wire, adapter and Worker contracts and the G7 validator move; a re-quote of every Cloudflare
claim in the design, verified), round 2 (seven Stage 2 builders in parallel, each in a worktree created one at a time:
hub, poller, live, calendar, golive, page, latency), round 3 (integrate in go-live order, a three-lens adversarial
review, fix, restack, revert kit). Result: local branch `p2.2-final`, every go-live step G0..G9 a contiguous range, based
on main 5ca8c7b; local branch `p2.2-revert-kit` (design §5.4). Verified, in its worktree: the full gate PASS at the
G1 boundary and at the top (incl. e2e and the new e2e:latency step); E2 at the top: every sample under 2,000 ms, p95
about 125-156 ms in Chromium and WebKit (n = 30 each, 10 wakes proven), and a planted 2.5-s delay fails it; G1 is
dormant (40-min scenario against main's own recorded answers: identical except the designed R-3 grid stagger of
documents_newest); the review's 9 findings (one high: with CALENDAR on, every calendar evaluation re-read about 26 h
of ledger rows) were each reproduced, fixed with a test that fails without the fix, and gated; the revert kit's gate
PASS. Everything (all agent rows D-NEW-*, doc lines for the living docs, measurements, push ranges, pending items) is
in the branch's integration notes: `git show p2.2-final:docs/design/P2.2_integration.md`.
Not done: G9 is not pushable (the fastpath sameAsStored exception, design §4.6 B1); before G1 the branch must be
rebased onto the main of that day and re-gated at the G1 boundary, `export_store` re-run, the notes applied to the
living docs, and the revert kit re-created on the pushed G1 and re-tested; the Oct 6 and Oct 9 gallery posts for the 3
skipped E3 cases; T-LEASE and T-PARSE-DIES against the real Hub; LIVE_CAP 3,000 rests on dev-PC CPU numbers (the Free
plan's DO CPU limit is not documented per plan). The branches exist only on this PC.

**Process notes.** The first research workflow (6 agents, per-agent caps of 15 requests) was launched minutes after
D-104 and predates its shared budget; every later run used one budget file per run. The aviary session asked three
times for a quiet box (10:15-10:33, 11:45-12:00 and 13:59-14:19 CDT); heavy work went through a two-slot wrapper
(`with_slot.mjs` in the session scratchpad), which the orchestrator held during the second and third windows.
Audits: the harness's safety classifier timed out on the round-1 prep builder, so its actions were checked by hand
(owned files only, 17 GET requests all in the budget file, nothing pushed); two round-3 reviewers ended with a dirty
tree, so every fix commit was checked file by file (only the files its finding names); the revert-kit agent wrote and
deleted one temporary file at the main tree's root in a single command.

**Addendum (same session, after page #4's cold-start round r6).** The capture task is gone: `Get-ScheduledTask` finds no
`CED*` task (checked by the round's executor and again at 2026-10-06 ~02:20Z). Round r6 failed routing on five minor page
contradictions (all three resumers agreed on the first action) and content on four claims: D-105/D-106 are agent
rows, not owner rulings; the full gate ran only at the G1 boundary and at the top of `p2.2-final`; the integration
notes predate the revert kit, whose notes live on `p2.2-revert-kit`; D-098 does not require the owner's go per step.
Fixed in page #4 and the tree (`scripts/ledger_report.mjs` now lists each White House item over 1 h with its link;
ROADMAP P3.3 carries the 2026-11-04 deletion; an addendum on `p2.2-final`'s integration notes), then re-rounded.

---

## #8 — 2026-10-05 — Cloudflare readout recorded (D-096); the first live FR midnight flip verified

**Same session as #7, after its handoff (the owner's Monday morning):** the owner read the D-057 dashboard numbers into
the chat. ced-probe CPU per execution p99/p999 129 ms: the 120 ms test loops really ran about that long on Cloudflare
and completed, which cross-checks D-095 (the Free plan's 10 ms is not a hard cut-off at these levels). ced-api CPU per
execution p50 2.63 ms, p99 26.63 ms, p999 59.31 ms; about 1,450 Worker invocations and about 5.5k HubDO requests a day,
0 errors. Rows, GB-seconds and the HubDO's own CPU were not in the menus found (they fall to P2.2's /ops counters); the
log search refused the quoted query, so the per-event screenshots were skipped. All in D-096 and the ROADMAP P1.5 note.

**First live FR flip (HANDOFF #3 NEXT ACTION step 2), checked 2026-10-05 14:28Z:** paging the whole event history (the
`allEvents` export of `scripts/ledger_report.mjs`), all 106 `fr.published.*` events dated 2026-10-05 are `published`
(each now revision 2; e.g. 2026-20439 "Presidential determination published in the Federal Register on October 5, 2026").
So the once-per-Eastern-day re-parse (D-059) worked live.

**Push timing:** this docs-only push redeploys ced-api (byte-identical Worker) on a Phase 1 measurement day; it was sent
at about 10:40 ET, between the 08:45 and 11:15 ET Public Inspection slots, and a redeploy changes no stored
first_seen_at.

---

## #7 — 2026-10-03 — FR "scheduled" fix live; P2.1 Congress adapters built fixture-only and merged; probe closed; White House delay measured

**Asked for:** the canonical resume. Owner answers this session, each asked with a push notification: D-055 (FR documents
listed early: "Show early as scheduled", against the recommended "hold until their date"), D-056 (stay signed in for the
Monday task), D-057 (yes to the Cloudflare CPU readout; the click-by-click page is
<https://claude.ai/artifact/Kuw3yQ4xupbY94jWi4hviV>), D-058 (start P2.1 early on fixtures, look into the White House
delay, close the probe tonight), D-061 (impeachment verdicts and Speaker elections alert), D-062 (a press-gallery line may
alert, labeled unofficial).

**FR false drift, found at resume and fixed live.** From 08:15Z Saturday `/api/v1/status` showed fr.api drift + stale:
the FR API lists the next issue before its publication date (106 documents dated Mon Oct 5, on Saturday), and the
FR-6 rule threw the whole list away (docs/TRAPS.md). Fix (D-059): a listed document dated after the poll's Eastern day
(up to 7 days) is `scheduled` ("to be published in the Federal Register on <date>"), and becomes `published` at
midnight Eastern as a revision; `Endpoint.dayDependent` makes the poller key an unchanged body by its hash AND the
Eastern day, so the flip needs no upstream change. A three-lens adversarial review (each finding reproduced) led to
D-060: the page shows "not seen published" for a scheduled row whose date has passed; the D-050 fast path also matches
a revised row's revision-1 form (106 extra validations per parse before); `/feed.json` item ids are dedup_keys (stable
across revisions, JSON Feed 1.1); wording and reason codes. Verified: fixture
`fixtures/fr.api/2026-10-03/documents_newest_next_issue_early.json` recorded live; adapter, poller, Hub-replay and
fast-path tests, each mutation-checked; gate PASS; deployed 14:32Z; first post-deploy parse 15:15Z: fr.api ok, not
stale, "500 newest listed documents, 106 of them before their publication date (scheduled)"; the live page looked at
on a phone viewport in light and dark (Playwright, 390x844) and the "not seen published" chip in the reviewer's
harness (light, dark).

**P2.1 built early on fixtures (D-058), merged, nothing live changed.** Three workflows: design (6 source scouts that
recorded edge fixtures, a designer, 3 critics with 31 items, a revision; `scratch/phase2/DESIGN.md`, gitignored),
build (prep, foundation, 5 adapter builders in their own worktrees, integration with the full gate and a Worker-bundle
compare), review (fail-closed, time/DST, keys lenses; 21 findings: 17 fixed with regression tests, 2 recorded as
design decisions, 2 doc fixes; the one high finding: a Senate "Not Confirmed" result read as passed). The five
adapters (`house.clerk.votes`, `senate.lis.votes`, `house.clerk.floor`, `senate.schedule`, `senate.pressgallery`) and
the `@ced/schema/v02` subpath are exported only through `@ced/adapters/fixture-only`; an esbuild import-graph test, a
pin of the live list to [fr.api, wh.feeds] and sha-256 pins of every Worker-imported schema/adapter file keep them out
of the Worker. Decision rows D-063..D-087. Verified: gate PASS on the branch and on main after the merge; `wrangler
deploy --dry-run` index.js identical to the deployed bundle (sha-256 1d99fff3…), deployed 18:51Z with SHIPPED-CLEAN.
Deferred to P2.2 go-live (ROADMAP): the vote inspector, member-vote storage, the page rules Q-P1/Q-P2, poller support
for dynamic targets, the Jan 3 rollover checklist.

**Harness:** the gate prints every error-looking line of a failing step before its tail (a TypeScript error was hidden
by wrangler's chatter); `.claude/worktrees/` is gitignored; TRAPS: worktree workflows leave `core.hooksPath` absolute,
parallel worktree creation failed 4 of 6 agents, the harness Bash drops backslashes from heredoc-written scripts.

**What failed / corrections:** I said "typecheck is clean" after reading only the tail of its output; the gate then
failed on that TS error (fixed; now a trap and a harness fix). The first gate after the review fixes failed doc-paths on
backticked folder names in a new trap (reworded). My question for D-055 said "~300 documents"; the recorded reply holds
106 (corrected in D-059). Four of six design scouts failed before starting (parallel worktree creation); resumed by
reusing their worktrees. Two scripted edits lost backslashes (the date regex; caught by tests and by reading the line).

**Evening (owner present):** the White House delay watcher (13:33Z-20:28Z, 832 polls, 0 errors) saw no new post all
day (nor did ced-api); Claude Code then stopped it because the PC ran critically low on memory (aviary training runs on
it), and it was not restarted. Its finding is in docs/TRAPS.md (a cache-buster does not get a conditional request past
the White House CDN; 15 of 832 answers were STALE); the 24-minute lag stays n=1, to be measured from the ledger on
business days. A focused agent closed the P2.1 lead "suspension adoption of a resolution" with a real roll
(2025 roll 158, H RES 488; D-088), 2 requests. The P2.1 design moved into the repo as `docs/design/P2.1.md`
(code and docs had pointed at a gitignored scratch file). D-089 (owner): while the probe finished, the owner was to do the
Cloudflare readout (D-057; page extended with five daily usage totals for the P2.2 design; no readings had reached the
chat or the repo when this entry was written) and allowed two paper-only
pieces of later phases: P3.5 research (`docs/research/leadership_press_conferences.md`: 4 source families, each
verified live by an adversarial re-probe, 423 requests ledgered; no keyless "live now" source; the House Press Gallery
"News Events on the Hill" block gives 12-17 h notice) and a P2.2 design (`docs/design/P2.2.md`; 4 scouts, 3 critics,
38 items settled; no code). Owner answers to their questions: D-090 (phone reading for the 2-s exit), D-091 (automatic
Jan 3 rollover), D-092 (House recess wording), D-093 + G-012 (Google key walkthrough next session).
**Correction:** the P3.5 research sent 45 requests to YouTube's `/feeds/videos.xml`, which YouTube's robots.txt
disallows for every agent (I checked it at 23:16Z); three Phase 0 reports recommend that feed. TRAPS now says never
poll it and to read robots.txt before a host's first request.

**Probe closed (P1.3; Phase 1 exit 5 MET):** ced-probe stopped itself after run 48 (2026-10-04 00:30Z, 928 requests).
28 of 29 URLs answered usable 2xx on 16/16 tries from Cloudflare; clerk.house.gov's roll XML 15/16 (one 503 error page,
no Retry-After; the floor file on the same host 16/16). No CPU cut-off at any tested level (0-120 ms, alarms x3, fetch
and cron x48); alarm delay median 24 ms (n=30). Full JSON `docs/research/probe_2026-10-03.json`, table in SOURCES,
rows D-094 (no source moves to the home PC) and D-095 (Free CPU limit not binding at the levels tested; the dashboard
cross-check is the owner's D-057 readout, still to be read at this entry's writing).

**Pushes this session** (each after a gate PASS, deployed by CI): the FR fix and its review fixes; the P2.1 merge;
then this wind-down (docs and the D-088 adapter change). The Worker bundle stayed byte-identical from the P2.1 merge on.

**Open:** Phase 1 exit 3 (Mon-Tue live latency, `scripts/ledger_report.mjs`); the first live FR midnight flip (Mon
00:00 ET); Monday's capture task; the D-057 Cloudflare readings and the five daily totals (by ~Mon 7 PM CT, when the
first probe logs expire); the Google key walkthrough (G-012); the White House lag distribution from the ledger.

---

## #6 — 2026-10-03 — cold-start r3 PASS on page #2; the 500-document FR page verified live; r3 backlog fixed in the tree

**Cold-start round r3** (page #2, `docs/coldstart/r3/`, tree untouched while it ran): routing PASS (3/3 resumers named
the same first action: one AskUserQuestion with a PushNotification, then wait for the data), content PASS (0 false
claims). The page was not edited afterwards; its backlog was fixed in the TREE:
- Exit criterion 3 had no workable recipe (`/api/v1/status` is a rolling 24 h with no n): new
  `scripts/ledger_report.mjs` pages the whole event history and prints, per Eastern business day, PI documents, White
  House items and the PI latency (n, median) with PASS/FAIL (harness tests; run live: 639 events; 2026-10-02 FAILs as it
  should, all of it seen hours later in the first backfill). ROADMAP's exit status points to it.
- The probe's CPU-limit cross-check and the HubDO's cpuTime (W10) can only be read in the Cloudflare dashboard (the
  owner), and free Workers Logs keep about 3 days: ROADMAP P1.3 now says ask by 2026-10-06, and what to write if missed.
  The probe JSON's home is `docs/research/probe_<date>.json` (ROADMAP P1.3, MAP).
- TRAPS: the Monday task runs only while the owner is signed in; read its log only once it ends with an "exit" line.
- Stale notes fixed: SOURCES probe section, ARCHITECTURE status, MAP probe row, ROADMAP P1.3 note.

**Live checks** (read-only, 2026-10-03): the first fetch of the 500-document page landed by 05:15Z: fr.api ok
("documents_newest: 500 newest published documents"); the newest 500 events are the newest items, then the Oct 2
issue, then the backfilled issues in date order (no "first seen" flood). First live White House latency, n=1: a Fact
Sheet posted 03:01:43Z (its RSS pubDate) was first seen 03:26:00Z (24 min, polled every 60 s), so the delay is upstream
(the feed is CDN-cached; WordPress feeds can lag). One sample: measure before concluding anything.

---

## #5 — 2026-10-03 — Phase 1 polish (D-046): whole daily FR issues, WebKit e2e, HubDO fast path, one order rule

**Asked for:** the owner chose "Keep polishing Phase 1" (D-046) over wrapping up or starting Phase 2 early.

**Built** by a three-way workflow (build, adversarial review, fix with a regression test per confirmed finding; 11
findings, all fixed or recorded), then integrated by the orchestrator:
- fr.api O1 closed (D-047): `documents_newest` reads a whole daily issue in one page on its own cadence
  (`Endpoint.cadence`), sized on every FR issue since 1994 (fixture `fixtures/fr.api/2026-10-03/facets_daily_since_1994.json`);
  review R1 caught that the first size (300) missed the 2024-12-30 record. Open: review R2 (the overflow note lasts one
  poll; at this page size it should never fire).
- Worker (D-049, D-050): per-endpoint cadence, budget and staleness; the HubDO skips the full validator for an event
  identical to its stored, validated copy (local wall only, numbers in D-050; Cloudflare CPU still unmeasured).
- Web (D-051..D-054): WebKit phone and desktop projects (every exit-criterion test on both engines), contrast decoded in
  Node, light secondary text slightly darker, an opaque header where the blur is not painted.

**Orchestrator integration** (each with a test that fails without it; mutation-checked where marked):
- The bigger FR page would have put ~480 week-old documents on top as "first seen": one shared order key
  (`packages/schema/src/order.ts`, D-048) used by the Hub and the page; such rows show "published Sep 30" (a date,
  never a time). Mutation-checked in the Hub.
- `validateEvent` never throws (the library threw on an undefined member; review fuzz). Mutation-checked.
- The fast-path fingerprint now names the validation library and version (`VALIDATOR_ID`, pinned by a schema test;
  found by the docs critic).
- Harness: the secret scan failed ENOBUFS on ~1.5 MB of unpushed fixtures (spawnSync's 1 MB buffer): `maxBuffer`
  raised, regression test added. e2e: one intermittent gate failure (WK4, Chromium desktop) passed 64/64 in isolation
  and in a full rerun; its text was lost to the 25-line gate log, so local runs now also write `scratch/e2e-last.json`,
  and screenshots retry only Chromium's "Unable to capture screenshot" error (unit-tested).

**Verified:** gate PASS before each push (now incl. WebKit e2e locally); CI green with WebKit (install + gate about
2.5 min). Deployed 2026-10-03 ~04:23Z; both sources ok afterwards, and the feed caught a new White House post on its
own (03:01Z). The first fetch of the big FR page waits for its hourly overnight cadence (see #6 or the next session).

**What failed / corrections:** I launched the previous docs workflow script unedited by mistake (it would have
re-applied round-1 changes); stopped within seconds, tree verified clean, then ran the right one. A docs critic again
caught duplicated numbers (3) and a code-side gap (the fingerprint).

---

## #4 — 2026-10-02/03 — Phase 1 built, deployed and live on the owner's phone (exit criteria 3 and 5 need time)

**Owner answers** (asked in four AskUserQuestion rounds, each with a push notification): D-025..D-028 (both signups,
auto-deploy after CI, subdomain `usgovfeed`, Monday capture), D-031..D-033 (cloud test, probe deploy, capture moved to
the home PC), D-044 (phone check), D-045 (one alert per EO). Grants G-006..G-011. The owner created the Cloudflare and
api.data.gov accounts and added the three secrets (walkthrough artifact: claude.ai/artifact/3tfFpfAFLX1d8VShdzbBjj).

**Built** (commits: scaffold, build, docs, titles, live; each pushed only after a gate PASS):
- P1.2 scaffold: npm workspaces, TS 7, Vitest 4 projects incl. workerd via `@cloudflare/vitest-plugin` (the renamed
  pool), pins D-029, schema v0.1 additions D-030, the read-API contract in `packages/schema/src/api.ts`.
- P1.3/P1.4/P1.5/P1.6 by a five-way workflow: each component built, adversarially reviewed (45 findings), fixed with a
  regression test per reproduced finding; then integrated by the orchestrator. A second workflow applied ~80 doc
  changes and a docs critic checked every claim against the code (D-034..D-042).
- Orchestrator integration fixes, each with a test that fails without it (mutation-checked): main-module plain export
  (workerd refuses to start; found by the probe builder), stale vs the night cadence, the FR body echoing the
  cache-buster, WH-5 merge lead + alias accumulation (without the alias change every later poll would have revised),
  the "posted" order key, page/Hub tie order, MedPAC branch (FR-8), titles that repeated official_text (D-043; seen on
  the first live page), an e2e clock race (CI failure on 6dd6cf5; not reproduced locally in 264 stress runs, fixed by
  making the page report a settled poll).

**Verified:** gate PASS before every push (typecheck, 26 vitest files / 507+ tests incl. workerd, build, Playwright 58
passed + 2 skipped by design); CI green except 6dd6cf5 (above; nothing deployed from it). The real ced-api bundle ran
in plain Miniflare (no test-plugin flags): starts, ingests 157 fixture events, validates without eval. Live:
ced-api deployed 2026-10-03 00:49Z, first poll 00:53Z: fr.api ok (108 PI documents), wh.feeds ok (30 items), 157
events; the public page renders them (Playwright screenshot at 390x844, light and dark) and the owner checked it on
an iPhone over cellular (D-044). ced-probe deployed; run 1 at 01:01Z reached 10 of its group-1 sources (all 200);
alarm jitter so far median 24 ms, max 89 ms (n=25).

**Monday:** the cloud routine was disabled after its smoke run proved the cloud sandbox gets HTTP 403 from every .gov
host (and the push guard refuses side branches; TRAPS). A Windows scheduled task ("CED pro forma capture 2026-10-05")
runs `scripts/capture_task.cmd` Mon 14:45 CT, logs to `scratch/capture_task.log`, writes `fixtures/*/2026-10-05/`
(uncommitted) and deletes itself; a same-session test task proved the scheduler path (headless, all 5 targets ok).

**What failed / corrections:** the first smoke check reported the blocked cloud run as "every host answered" (it
counted any HTTP status as reachable): fixed to fail closed on a 403. The account-setup page first promised that I
could see secret names; the token cannot (403), so the page was corrected. The first live page showed every FR/WH
title twice (D-043). Published FR documents carry only a date, so on the first (backfill) poll they sort as "first
seen" at deploy time: truthful, a one-time artifact; not hidden by an invented time.

**Open:** Phase 1 exit (3) needs Mon-Tue live polling; exit (5) needs the probe's 48 runs; W10 (HubDO CPU on a full
re-ingest) unmeasured on Cloudflare; FR documents_newest covers ~20% of each issue (O1); WebKit not in e2e;
`API_DATA_GOV_KEY` unused so far. The disabled cloud routine still exists (only the owner can delete it, at
claude.ai/code/routines).

---

## #3 — 2026-10-02 — cold-start r2 PASS on the final page; session closes

**Cold-start round r2** (page #1 as pushed after the hardening; `docs/coldstart/r2/`, tree untouched while it ran):
routing PASS (3/3 resumers named the same first action: one multiselect AskUserQuestion + PushNotification with the
ROADMAP P1.1 questions), content PASS (0 false claims). `node scripts/ship_state.mjs` had correctly refused r1 for the
edited page ("r1 validated an earlier text of page #1").

**r2 backlog fixed in the tree** (TREE-scoped, so no re-round; HANDOFF.md itself unchanged): HANDOFF_PROCEDURE and the
handoff skill now say rounds key on the page text, not the number; ROADMAP P1.1 asks HOW Workers get deployed (deploy
workflow vs `wrangler login`) and records answers in DECISIONS + grants in OWNER_GRANTS; P1.2 notes the Vitest pin, the
all-four-directories rule and Node 22 (CI) vs 26 (local); P1.3 skips sources whose keys aren't granted; the gate now
also fails on workspace test/build scripts that no gated root script runs (harness tests 47 → 48); a split ARCHITECTURE
table row, a stale MAP row and more SYNTHESIS notes superseded by D-017/D-024 were fixed.
Left as leads (PAGE-scoped, minor, first action unaffected): the page restates ROADMAP P1.1's question list in short
form; AskUserQuestion blocks, so "start P1.2 even if the owner is away" applies after the owner has answered or declined.

---

## #2 — 2026-10-02 — first push, Pages live, cold-start r1, adversarial reviews, harness hardening

**Shipped:** the public repo `jst28323-art/current-events-dashboard` (G-001) and the Pages site
<https://jst28323-art.github.io/current-events-dashboard/> (G-002). Verified: `curl` of the site → 200 with
`<title>Current Events Dashboard</title>`; the `ci` and `pages` workflow runs on the pushed commit both succeeded.

**What failed on the way (all now in `docs/TRAPS.md`):** the first push was rejected because the local token lacked the
"Workflows" permission (the owner added it); turning Pages on needs "Pages" AND "Administration: write" on the token,
so the owner set the Pages source by hand; `gh workflow run` fails (no "Actions: write"); the Pages path filter skipped
the first deploy. Separately, this PC took 4–11 s to start any process this afternoon, so the gate took minutes.

**Cold-start round r1** (page #1 at the pushed commit; `docs/coldstart/r1/`): routing PASS (3/3 resumers named the same
first action), content FAIL on one false sentence (SHIP STATE said every other verdict prints "one command"; several
print instructions). Fixed and recorded as CONTENT-FIXED. The resumers' backlog (stale cross-references after
D-016…D-024, the fixture layout in TESTING.md, no Cloudflare deploy grant, CI without `npm ci`) was fixed in the tree.
Caveat: the tree was being edited while r1 ran, so its resumers read a moving tree; r2 runs on a still tree.

**Adversarial harness review** (2 skeptics, every finding reproduced in a throwaway clone with a fake remote) found real
bugs, all fixed with a test that replays the repro (harness tests 33 → 47):
- push_guard let any command containing ` -n` (e.g. `| tail -n 5`) through unchecked, force pushes included → rewritten
  to parse each command segment and allow only `git push [-u] origin main`; fails closed on any error; PowerShell hooked too.
- the gate's tracked-secrets check could never fire (`git grep` read the pattern as an option) → fixed with `-e`, fails
  closed on git errors, scans unpushed history too; one shared pattern file `enforcement/secret-patterns.txt` for the gate
  and the pre-commit hook (which also lacked the Anthropic-key shape).
- ship_state said PUSH on a non-main branch, said SHIPPED-CLEAN after an ungated push, and accepted a round by page number
  even after the page was edited → OFF-MAIN-STOP, PUSHED-UNVERIFIED-STOP / CI-PENDING-WAIT, rounds keyed on the page's
  blob, SETUP-ERROR until git hooks are enabled, stale gate locks recovered.
- the git pre-push hook now refuses updating main to a commit without a gate stamp and deleting any remote branch, so the
  core rule holds even when Claude Code's own hooks don't fire (launch from the parent directory).
- the gate now fails if HEAD or the tree changed while it ran, discovers tests recursively, and fails on an ungated
  test/build script; the cold-start workflow no longer counts a resumer that never saw HEAD, a resumer FAIL, or a
  PAGE-scoped FATAL as passing, and writes notes to gitignored `scratch/` during the round; Pages deploys only after CI
  passes; `record_fixture` refuses any credential-like URL parameter.

**Docs critic** (cross-document consistency): P0 alert tier narrowed D-012 (proclamations, memoranda, SCOTUS orders
would never alert) → P0 is now exactly the D-012 classes; a design mock-up showed an invented vote result → replaced with
the real fixture vote; plus stale pointers, a duplicated question list and figures, and hook messages that advised
`--no-verify` → all fixed.

**Next:** cold-start round r2 on the final page (result: `docs/coldstart/r2/RESULT.json`), then the session closes.

---

## #1 — 2026-10-02 — Phase 0: groundwork (no product code)

**Asked for:** a new repo and the groundwork for a live US-government tracker (brief verbatim in `docs/VISION.md`):
research how best to build and curate the feed, build a framework adapted from the aviary harness, and leave the first
build session knowing exactly where to start. Explicitly not: building the product.

**Owner decisions taken this session:** D-001…D-006, D-009…D-023 in `docs/DECISIONS.md` (asked in five
AskUserQuestion rounds, each announced with a push notification); agent choices D-007, D-008, D-024 (adopt the
synthesis's thinner Phase 1). Grants G-001…G-005 in `docs/OWNER_GRANTS.md`. Notable owner calls against the
recommendation: no code license (D-014), use third-party sources now without a terms check (D-017), show everything by
default (D-019), track the wider administration (D-020), alerts at any hour (D-023).

**Research** (workflow `ced-source-research`: 6 dimension researchers, each followed by one adversarial verifier that
re-probed endpoints live and corrected the report in place, then a synthesis): six reports + `docs/research/SYNTHESIS.md`.
Each report ends with a "Verification ledger". Headline findings that shaped the plan: GitHub Actions cron cannot be the
live path (D-008); Cloudflare Workers Free (Durable Objects with alarms, SQLite, WebSockets) is the free real-time
backbone; both chambers publish free live captions, so floor text needs no speech-to-text; White House live text is the
real gap (D-010); Congress is in recess until Nov 9, so congressional adapters are built against fixtures first.

**Harness** (adapted from aviary, Node, zero dependencies): `scripts/ship_state.mjs` (verdict-as-code),
`scripts/gate.mjs` (stamp at HEAD; product suites via `package.json` `gate.npmScripts`), `scripts/handoff_lint.mjs`
(L1–L8), `scripts/check_paths.mjs`, `scripts/record_fixture.mjs`, Claude Code hooks (session-start ship state, push
guard, dirty-handoff warning), git hooks from the agent-protocol bundle (secret scan, no force-push), the cold-start
validation workflow `.claude/workflows/coldstart-validate.js`, skills `handoff` and `add-source`, CI + Pages workflows.

**Docs:** `CLAUDE.md`, `HANDOFF.md`, `MAP.md`, `TESTING.md`, `KNOWN_FAILING.md`, `docs/{VISION, ROADMAP, ARCHITECTURE,
SOURCES, EVENT_MODEL, DESIGN_LANGUAGE, DECISIONS, OWNER_GRANTS, TRAPS, HANDOFF_PROCEDURE}.md`.

**Fixtures:** a recess-proof set recorded from live sources with `scripts/record_fixture.mjs` (index and caveats in
`fixtures/README.md`), including NEGATIVE cases (HTTP 200 error bodies) and an EMPTY case.

**Placeholder site:** `site/index.html` (macOS tokens from `docs/DESIGN_LANGUAGE.md`; no data, labeled "under
construction"). Looked at in headless Edge: desktop 1440×900 light and dark, and phone 390×844 light and dark (through
an iframe; headless Edge crops below ~500 px, now a trap). One fix made after looking: the footer line's spacing.

**How verified:**
- `node --test` over `tests/harness/*.test.mjs`: 33/33 pass (ship_state: every verdict branch incl. the two-FAIL exit;
  handoff_lint: each rule fires on its own planted defect and stays quiet on a good page; path extraction; push/force
  detection).
- `echo '{…"git push --force origin main"}' | node scripts/hooks/push_guard.mjs` → exit 2 (refused); a non-push command → exit 0.
- Fixture claims in `fixtures/README.md` were checked against the files (two corrections made: the vote-256 question
  text and the caption speaker tag actually present in the recorded segments).
- The gate, the first push, the Pages deploy and the cold-start round happen after this entry is committed; their
  results are entry #2.

**Corrections during the session:** research written before D-003 says "the spare RTX 2080 box"; the owner chose the
main home PC instead (D-003 says how to read it). Numbers that had been restated in TRAPS/ARCHITECTURE were moved to their
one home (`docs/SOURCES.md`, D-008) and replaced by pointers.

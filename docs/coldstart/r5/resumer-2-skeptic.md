# Cold-start r5 — resumer 2 (skeptic lens) — HANDOFF.md page #3

Oriented at Sat 2026-10-03 20:05 CDT (2026-10-04 01:05Z). Read-only sandbox. Every load-bearing claim on the page was
checked by opening the file or running a read-only command; nothing was taken on the page's word.

## Ship state (command, not prose)

`node scripts/ship_state.mjs` (exit 10):

    ship_state: ROUND-DUE
      head: 542603b on main · origin/main: 542603b · ahead 0 · behind 0
      tree: clean
      gate: PASS stamp at HEAD · last run PASS at 542603b
      ci:   success .../actions/runs/37166650874
      page: HANDOFF #3 · cold-start: r4 validated an earlier text of page #3; the page changed since (next round r5)

ROUND-DUE for page #3 is this round (harness rule), so I treat it as SHIPPED-CLEAN and go to NEXT ACTION.
`node scripts/handoff_lint.mjs` PASS (page #3, 67 lines). `node scripts/check_paths.mjs` PASS (19 docs, 0 dead paths).
`docs/STATUS.json`: push_hold false.

## First action

**One AskUserQuestion (multiSelect) together with a PushNotification**: HANDOFF.md:38-46, NEXT ACTION step 1.
It comes first for two reasons. The page orders it first. And at Sat 20:05 CDT none of steps 2-4 has data yet: the FR
flip can be checked from Mon 01:00 ET, the capture after Mon 16:30 CT, and the latency after Tue 18:00 ET. After asking,
I would record what is still waiting and end with the handoff skill (step 6). I would start no development.

### What I would ask (one call, multiSelect, plus a PushNotification)
1. **Cloudflare readout (D-057 + P2.2 O3).** Can you do screenshots 1-7 and Part C (screenshots 8-9) on the readout page
   now, or before Mon Oct 5 about 7 PM CT (the page's own deadline)? Or should we skip it, in which case a row records
   that the cross-check was not made? Did you paste any screenshots into last session's chat? None reached the repo,
   because DECISIONS ends at D-095.
2. **Google API key walkthrough (D-093, G-012).** Now in this session, later this week, or deferred? Separately, how
   should the one retrospective `videos.list` call run, given that Actions logs are public on this public repo? Options:
   a push-triggered workflow that prints only aggregates, defer the call to Phase 3, or another way you prefer.
3. (I would not ask about staying signed in Monday 14:45-16:30 CT: D-056 settles it. I would put it in the notification
   text as a reminder only.)

## Claims verified (true)
- HEAD/origin/CI/gate: per ship_state above.
- Phase 1 exit status: (1)(2)(4)(5) MET, (3) OPEN on Mon 10-05 + Tue 10-06 — docs/ROADMAP.md:96-100.
- FR fix live: one GET of `/api/v1/status` at 01:09Z: fr.api `not_modified`, `stale: false`, error_streak 0;
  wh.feeds `not_modified`, not stale.
- FR flip mechanism: `DOCUMENTS_CADENCE = { business_s: 900, off_s: 3600 }` (packages/adapters/src/sources/fr_api.ts:59),
  `dayDependent: true` (:646), poller dayTag `#et:` (workers/api/src/poll.ts:246). That justifies "from Mon 01:00 ET".
  PI events are `fr.public_inspection`, so the `fr.published.*` filter already excludes them.
- D-055/D-059/D-060/D-094/D-095/D-057/D-058/D-089..D-093: rows exist and say what the page says. DECISIONS ends at D-095,
  so there is no readout row yet.
- P2.1: `SOURCES = [frApi, whFeeds]` (packages/adapters/src/registry.ts:7); pin test
  packages/adapters/test/live_list.test.ts:29-30; packages/adapters/src/fixture_only.ts exists.
- P2.2.md §4 G0 needs "D-057 + O3 readings" (docs/design/P2.2.md:519); §9 O3 at :929. D-090/D-091/D-092 = O1/O2/O4.
- Readout artifact Kuw3yQ4xupbY94jWi4hviV (Artifact read): Parts A/B = screenshots 1-7, Part C = screenshots 8-9
  (five daily totals). It has no runtime capabilities, so the readings come back only through chat (as the page says).
- Capture task (PowerShell Get-ScheduledTask, read-only): "CED pro forma capture 2026-10-05" Ready, next run
  10/5/2026 2:45 PM, LastResult 267011 (has not run), Interactive logon, ExecutionTimeLimit PT3H, DeleteExpiredTaskAfter
  PT1H, args `--until 2026-10-05T21:30:00Z --max-run-s 7200`. That matches D-033, D-056, G-011 and TRAPS:530-534.
  `scratch/capture_task.log` does not exist yet, as expected.
- `scripts/ledger_report.mjs --days` exists. `allEvents` pages the whole history. dayReport covers PI and WH counts and
  PI latency only, so the page's "no script does it" for the WH lag is true. TRAPS:94 has the "n >= 20 on business
  days" bar.
- fixtures/README.md:68-70 has the pending Mon 2026-10-05 note (review statuses, sizes, no 403 proxy pages).
- The handoff skill exists at .claude/skills/handoff/SKILL.md. HANDOFF_PROCEDURE PART 2 agrees with step 1.
- G-012 "one-time, next session" (docs/OWNER_GRANTS.md:46).
- The r4 backlog page fixes landed in 542603b: O3 named, the deadline gives UTC + CT, the FR check leaves out PI and
  allows D-060 leftovers, the WH lag n caveat, "only the owner can delete it", and PROGRESS #7 no longer says the
  readout was done.

## (1) Ambiguous, contradictory or stale

None of these misroutes the first action. All are MINOR.

1. **The readout deadline is stated in three ways (TREE/artifact).** HANDOFF.md:42 says "expire about 2026-10-06 01:00Z
   (Mon Oct 5, ~8 PM CT ...)". The readout artifact's chip says "Best by Mon Oct 5, 7 PM CT" and its note says "disappear
   around Mon Oct 5, 7 PM CT". PROGRESS.md:84 says "(by ~Mon 7 PM CT ...)". docs/DECISIONS.md:67 (D-057) says
   "so by ~Tue Oct 6", and docs/design/P2.2.md:929 says "O3 (... by Tue Oct 6, logs keep ~3 days)". The arithmetic
   (first cron 2026-10-03 01:01Z, plus 72 h) gives about 20:00 CDT Monday, so the page is the accurate one and the
   artifact keeps an hour of margin. "Tue Oct 6" names a weekday, so it cannot be read as a UTC date the way the page
   reconciles ROADMAP:61. A resumer should tell the owner the earlier time, 7 PM CT.
2. **Mixed date conventions (TREE, unfixed from r4).** docs/ROADMAP.md:63 says "(Done 2026-10-04: ced-probe stopped
   ..." and :100 says "(5) MET (2026-10-04)". D-094 and D-095 are dated 2026-10-04 (DECISIONS.md:104-105). Against
   that, HANDOFF.md:3 says "AS-OF 2026-10-03" and ROADMAP.md:96 "Exit status (2026-10-03)". The commit ed43732 is
   2026-10-03 19:33 -0500. Today, a reader sees work marked done "tomorrow". The rows use UTC dates.
3. **PROGRESS #7 was rewritten in place (TREE, process).** 542603b changed the existing #7 text ("the owner did the" to
   "the owner was to do the ..."). PROGRESS.md:3 says "Never rewrite an old entry; correct it with a new one", and
   CLAUDE.md:76 says "`PROGRESS.md` is append-only". The entry was about 20 minutes old and from the same session, so
   this is arguably within bounds, but it is a precedent the rule forbids.
4. **The P2.2 design's row-id pointer is stale (TREE).** docs/design/P2.2.md:882 says "ids = next free at integration,
   D-090 onward today". D-090..D-095 are now taken (owner rulings and probe rows). The phrase "next free at integration"
   covers this, and MAP marks design docs as dated records.
5. **The capture log's success code is not stated (PAGE, NIT).** HANDOFF.md:52-53 says to read the log "only once it
   ends with an 'exit' line". scripts/capture_task.cmd echoes `==== exit %ERRORLEVEL%`, and scripts/capture_live.mjs:11
   defines "10 = window closed, final snapshots recorded (stop)" and "0 = chunk done, window still open". So
   "==== exit 10" is the success line, and a cold reader could take it for a failure. Since the task is one-time, exit 0
   means the capture stopped early and was not resumed.
6. **"Still running by itself" (PAGE, NIT).** HANDOFF.md:20 says "Still running by itself: the one-time Windows task".
   The task is armed but has never run (State Ready, LastResult 267011 = has not run, next run 10/5 2:45 PM).
7. **No branch for an exit-3 FAIL (PAGE, MINOR).** HANDOFF.md:55-56 says "record its PASS/FAIL lines". Exit (3) is
   "On >= 2 business days" (ROADMAP.md:91-93), so it can be any two days. If Mon or Tue FAILs (for example, a day with no
   White House post), the page does not say to keep polling and rerun `--days` with later business days. Step 5 and
   "record what is still waiting" imply it.

## (2) Harmful instructions

**None found.**
- Nothing destructive. The D-028 cloud routine line says "only the owner can delete it" (HANDOFF.md:21-22), and nothing
  says to delete it.
- Outward-facing items go through the owner. The Google key walkthrough is an external-account step, but G-012 grants
  it and the page routes it through step 1's question. The `videos.list` call is explicitly "still to design", not an
  instruction. Commits, pushes and deploys happen only through the handoff skill under G-003/G-007, with the gate stamp
  and the pre-push hook.
- Nothing wasteful. The page does not re-do settled work. Step 1 says "do not re-ask what docs/DECISIONS.md settles",
  and D-056 (staying signed in) is not re-asked.
- Step 2 pages the project's own `/api/v1/events`, which is read-only and polite (ledger_report's UA, sequential).

## Verdict

PASS-WITH-NOTES. The page routes a cold reader to one unambiguous first action that is correct at this moment.
Every load-bearing claim I checked is true. The defects are minor wording and date issues, most of them in the tree,
not the page.

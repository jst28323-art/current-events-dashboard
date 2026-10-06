# Cold-start r8, resumer 3 (executor lens): HANDOFF #4

Oriented at Mon 2026-10-05 21:54 CDT = 22:54 ET (2026-10-06 02:54Z). Read-only sandbox.

## What I ran

- `node scripts/ship_state.mjs` printed `ROUND-DUE`, head `a11bdbe` on main, origin/main `a11bdbe`, ahead 0 / behind 0, tree clean,
  gate PASS stamp at HEAD, CI pending (run 37406409349), page HANDOFF #4, "next round r8". The harness says ROUND-DUE is this
  round in progress, so I treated it as SHIPPED-CLEAN and went to NEXT ACTION. CI still running is a fact about this moment;
  a real session would check ship_state again before any push.
- `node scripts/handoff_lint.mjs`: PASS (page #4, 61 lines).
- `git branch`: `p2.2-final` (tip 79e36c2) and `p2.2-revert-kit` (tip f99daf9) exist locally, as the page says.
- `Get-ScheduledTask | ? TaskName -like 'CED*'` found nothing. The page says the capture task has deleted itself, and that holds.
- `node scripts/ledger_report.mjs --days 2026-10-05`: a descriptive read of Monday only, to check the step 3 command runs. It is
  not the exit record. PASS 2026-10-05: PI 93, WH 7, n=93, median 46.006 s, 1 filing slot (12:45Z, 1 poll). WH lag n=7, median
  360.009 s, 1 item over 1 h: the backdated Down Syndrome message, which TRAPS already covers. The command works, and Monday
  looks set to pass.
- Read: HANDOFF.md, CLAUDE.md (in context), ROADMAP Phases 1-2, MAP.md, DECISIONS D-096..D-106, PROGRESS #9 (+addendum) and #8,
  TRAPS (calendar, WH backdating, press-gallery section), fixtures/README.md (the 2026-10-05 set + Pending), the gallery meta file,
  scripts/record_fixture.mjs, scripts/ledger_report.mjs, workers/api/src/policy.ts (business hours 06-22 ET), the handoff skill,
  docs/STATUS.json (no hold), P2.2.md §4.1, the opening addendum and §8 of `p2.2-final:docs/design/P2.2_integration.md`,
  OWNER_GRANTS G-011/G-012, deploy.yml trigger, docs/coldstart/r7/RESULT.json, and `git diff cdfbd3e a11bdbe -- HANDOFF.md` (the r7 fixes).

## First action

Step 1 (HANDOFF.md:39-40): send one multiselect AskUserQuestion together with a PushNotification. It comes first for two reasons:
the page puts it first, and at Mon 22:54 ET none of the data steps has data yet. Step 2 waits for Tue ~15:30 ET. Step 3 waits
until after Tue 18:00 ET. Step 4 waits for step 3.

The first shell command after that, from Tue 2026-10-06 ~15:30 ET (the URL is copied from the meta file, and it matches the
adapter constant in `packages/adapters/src/sources/senate_pressgallery.ts:36` on main and :39 on p2.2-final):

    node scripts/record_fixture.mjs senate.pressgallery "https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories" --date 2026-10-06 --name posts_newest3_after_pro_forma.json

After that, step 3 runs after Tue 18:00 ET (I would pick ~18:15 so the 18:00 special-filing slot is in):
`node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06`. If the session starts tonight, it does step 1, writes a PROGRESS
entry saying steps 2-4 are waiting, and stops (step 5, handoff skill).

Could I execute without asking the owner? Yes. Each step names its command, its time and where its result goes. The ask in step 1
is a courtesy batch, not a blocker.

## What I would ask (one AskUserQuestion, multiselect, with a PushNotification)

1. **When to resume.** Nothing can run until Tue ~15:30 ET (the gallery post) and after 18:00 ET (exit 3). Options: end tonight and
   resume Tue after 18:00 ET, so steps 2 and 3 run in one session (Rec.) / resume Tue ~15:30 ET and stay until 18:00 / keep this
   session open and waiting.
2. **A one-time capture task for the gallery posts?** Under the integration notes' addendum (:27), E3 must state when each post
   became visible. One recording at 15:30 only shows the post was up by then; it does not say when it went up. A Windows task
   like G-011 could record the newest-3 list every ~15 min from 14:30 to 18:00 ET on Tue Oct 6 and Fri Oct 9 and then delete
   itself. This needs the owner's OK, because it runs on the home PC (CLAUDE.md "Ask first, every time"; G-011 was one-time).
   Options: yes, both days / Tuesday only / no, record by hand.
3. **Step 4, asked early as a condition.** If both days pass Tuesday evening, may go-live start: the G0 checks, then the G1 push
   on Wed Oct 7 with its 2-h watch (G5 and G6 must be live before Sun Nov 8)? Options: yes, start when Phase 1 closes / ask me again
   then / wait. This is not a re-ask: D-098 only says go-live follows G1..G10, each with its own row.

## (1) Ambiguous, contradictory or stale

I found no contradiction on the page. Every page claim I checked against its source held: D-097..D-104 are owner rows; D-105 and
D-106 are agent rows; the gate checks on p2.2-final match addendum :21-22; the capture task is gone; the record URL matches the
adapter. The r7 fixes landed (Tuesday's post "among the 3"; the WH lag n "in the session's PROGRESS entry"). These are the points
where I had to guess:

- **A1 (MINOR, PAGE, AMBIGUOUS/MISSING).** Step 2 says to retry with the same `--name`, so each retry overwrites the earlier
  "not yet" recording. That recording is the only lower bound on when the post went public, and E3 needs that time.
  HANDOFF.md:43-45 `--name posts_newest3_after_pro_forma.json` ... "if not yet, try again later"
  vs `p2.2-final:docs/design/P2.2_integration.md:27` "the cases built from the real Oct 5/6/9 posts must state the time each
  post became visible". Monday's bracket came from two files with different names (`dailypress_posts_end.json` at 21:30:01Z,
  then `posts_newest3_after_pro_forma.json` at 21:33:25Z; fixtures/README.md:80). My guess: save each not-yet attempt under its
  own name (e.g. `posts_newest3_before_<hhmm>Z.json`) and keep the final name for the first list that contains the post.
- **A2 (MINOR, PAGE, AMBIGUOUS).** HANDOFF.md:48-49 says: "A failing day does not count: run it again on the next business day with
  that day in `--days`". "That day" could mean the failing day or the next business day. I read it as "replace the failing day with
  the next business day" (e.g. `--days 2026-10-05,2026-10-07`), because a failing day does not count. Also, WH items are counted
  by `first_seen_at` day (scripts/ledger_report.mjs:33). A run just after 18:00 ET therefore sees only part of Tuesday's WH
  items. If it shows WH 0, the page says the day failed, yet a re-run before midnight could pass it. I would re-run before
  midnight ET first.
- **A3 (MINOR, PAGE, AMBIGUOUS).** HANDOFF.md:50-51 says to check each WH item over 1 h against its `dateModified` "and record n
  and the median in the session's PROGRESS entry". It does not say which median: the script's raw one (Monday 360.009 s,
  which includes the 248,197 s backdated item) or one corrected with `dateModified`. My guess: record the raw n/median exactly as
  printed, plus each over-1-h item's `dateModified` lag beside it.
- **A4 (NIT, PAGE).** Step 2 says "Add its row to `fixtures/README.md`". The README groups recordings into sets by date
  ("## Set recorded 2026-10-05"). The Pending paragraph at fixtures/README.md:84-86 also lists Oct 6 and Oct 9 as still to record.
  My guess: add a new "Set recorded 2026-10-06" table (or a row in the existing table), and edit the Pending line.
- **A5 (NIT, PAGE; carried from r7 backlog, unchanged).** The page sums up the addendum's pre-G1 checklist as four items:
  HANDOFF.md:53-54 "(rebase and re-gate, the store export, the living-doc rows, the revert kit re-made on the pushed G1)".
  The addendum also says `:15` "besides §6.2" and `:24` "re-read it [the Cloudflare rollback page] once more on the G1 day".
  The page does say "do the checklist in the addendum", so a reader who opens it will see both. None of this is reachable tonight.
- Stale in the tree, not on the page: integration notes §8 "main has moved to `781bed7`". Main is now a11bdbe. Addendum :16
  ("main has moved past `5ca8c7b`") covers it. `docs/design/P2.2.md:18` "a plan for the build session that starts after Phase 1
  closes" is overtaken by D-098, but MAP.md:25 marks design docs as dated records.

## (2) Harmful instructions

None destructive. Nothing outward-facing happens without the owner's OK: step 4 asks before go-live, and D-098 holds every
p2.2 branch local. Nothing re-does settled work, except one cheap check: step 3 would re-check the Down Syndrome item's
`dateModified`, which TRAPS:96-102 already records. One minor timing gap:

- **H1 (MINOR, PAGE, MISSING).** On Tuesday, step 2's commit and the step 5 handoff will lead to a push under G-003 on Phase 1's
  measurement day. Every push redeploys ced-api (deploy.yml runs on every CI-passing push to main). PI special-filing slots fall at
  14:00, 16:15 and 18:00 ET (docs/SOURCES.md `fr.api` row), and the gallery recording window is 15:30-17:30 ET. PROGRESS.md:97-99
  (#8) timed its own measurement-day push between slots on purpose, and P2.2.md:515 says "none inside a measurement window".
  The page says nothing about when to push. The risk is low, because the Worker bundle is byte-identical and stored
  first_seen_at does not change. My guess: push only after the 18:00 ET slot has been seen, or between slots.

## Verdict

PASS-WITH-NOTES. From the page alone I reached a runnable first action and a literal first command within minutes. Every
guess above is minor, and none changes the first action.

# Cold-start r7: resumer 3 (executor lens), page HANDOFF #4 at 1000899

Time I oriented: Mon 2026-10-05 21:31 CDT, which is 22:31 ET (02:31Z Tue). Read-only sandbox.

## Orientation path (what I read, in order)
1. `node scripts/ship_state.mjs` printed `ROUND-DUE`, head `1000899` on main, origin/main `1000899`, ahead 0 / behind 0,
   tree clean, gate PASS stamp at HEAD. CI was pending on the first run; a `--no-fetch` re-run about 10 min later showed
   `ci: success` (run 37404386335). The ROUND-DUE verdict is this round (r7 for page #4), so I treat it as SHIPPED-CLEAN.
2. `node scripts/handoff_lint.mjs` printed PASS (page #4, 61 lines).
3. HANDOFF.md (all 61 lines), then CLAUDE.md (already in context), then ROADMAP Phases 1-3 (lines 1-180), PROGRESS #9
   with its addendum, DECISIONS D-096..D-106, OWNER_GRANTS, STATUS.json (`push_hold` false), the handoff skill, MAP.md
   pointers, TRAPS (the recess, the White House backdate, the gallery post going public late), the fixtures/README
   2026-10-05 set and its Pending paragraph, the step-2 meta.json, `scripts/record_fixture.mjs` usage, the
   `scripts/ledger_report.mjs` header, and the deploy workflow trigger.
4. For step 4 only: `git show p2.2-final:docs/design/P2.2_integration.md` (the opening addendum and §8),
   `git show p2.2-revert-kit:docs/design/P2.2_revert_kit.md` (head and §3), and design `docs/design/P2.2.md` §4.1.

I checked these claims and found them true:
- The capture task is gone: `Get-ScheduledTask | ? TaskName -like 'CED*'` returned count 0 (HANDOFF:17).
- The step-2 URL in the meta.json is identical to the adapter constant `packages/adapters/src/sources/senate_pressgallery.ts:36`.
- The Tue Oct 6 convene is at 13:30 ET (`fixtures/README.md:79`). With Monday's 91-minute lag (TRAPS:348-353) the post
  would go public about 15:01 ET, so "~15:30 ET" in HANDOFF:41 is consistent.
- The step-3 command works. As a descriptive check, not the exit record, I ran `node scripts/ledger_report.mjs --days 2026-10-05`
  at 02:41Z: `PASS 2026-10-05: PI 93, WH 7, latency n=93 median=46.006 s`, with 1 filing slot (93 documents in 1 poll)
  and a White House lag of n=7 with 1 item over 1 h (the backdated Down Syndrome post). Exit 0. Monday passes, so the Tuesday plan holds.
- D-097..D-104 are owner rows and D-105/D-106 are agent rows, which matches HANDOFF:11 and :14 (the r6 fix holds).
- The p2.2-final addendum names the revert kit's notes, says the full gate ran only at the G1 boundary and at the top,
  and sets the 15:30 ET gallery timing. All of this matches HANDOFF:18-21.
- ROADMAP P3.3 carries the 2026-11-04 YouTube deletion item. `scratch/youtube/` holds `result_2026-10-05.json` and
  `run_37338433045/`, which matches.

## First action
It is Monday 22:31 ET. Step 2 has no data until Tue ~15:30 ET, and step 3 none until after Tue 18:00 ET. Step 4 depends on step 3.
So the only step I can do now is step 1, which the page lists first anyway: **one batched multiselect
AskUserQuestion plus a PushNotification** (HANDOFF:39-40). After that, step 5: write a PROGRESS entry saying what is still
waiting, then stop (HANDOFF:37-38).

The first shell command once data exists (Tue 2026-10-06 >= 15:30 ET), assembled from HANDOFF:43 and the meta.json:

    node scripts/record_fixture.mjs senate.pressgallery "https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories" --date 2026-10-06 --name posts_newest3_after_pro_forma.json

After Tue 18:00 ET: `node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06`.

Points where I had to guess, all small:
- Where "record n" for the White House lag goes (step 3).
- Which section of fixtures/README.md takes "its row" (step 2).
- How often to "try again later", and when to give up (step 2).
- Whether the Tuesday afternoon commit may be pushed before the 18:00 ET report.
None of them blocks the first action.

## What I WOULD ask (one AskUserQuestion, multiselect, with a PushNotification)
1. Timing. It is Mon ~22:30 ET and nothing on the page can run until Tue ~15:30 ET (gallery post), then after 18:00 ET (exit 3).
   Options:
   - End now, and resume Tue after 18:00 ET to do both in one session (Rec.).
   - Keep this session open.
   - Two short sessions (~15:30 ET and after 18:00 ET).
2. While waiting, local-only P2.2 work under D-098 (nothing pushed). Options (pick any):
   - Rebase p2.2-final onto today's main and re-gate the G1 boundary.
   - Build the G9 blocker (fastpath sameAsStored, design §4.6 B1).
   - T-LEASE and T-PARSE-DIES against the real Hub.
   - Nothing.
3. Go-live question timing:
   - Ask now, conditional on Tuesday's PASS: G0 (local only) the same evening, and ask before the G1 push.
   - Or ask only after the report (page step 4 as written).
4. Fri Oct 9 gallery post. Options:
   - A Friday afternoon session (Rec.).
   - A one-time Windows scheduled task. This is ask-first like G-011.
   - Skip Oct 9.
5. Quiet windows. Is the aviary session using this PC on Tuesday? If so, gate/e2e runs should avoid those windows.

## (1) AMBIGUOUS / CONTRADICTORY / STALE (both sides quoted)
- **AMBIGUOUS (PAGE, MINOR): where the White House lag n is recorded.**
  - HANDOFF:49-51 says "The White House lag line is not part of the exit: check each listed item over 1 h against its
    page's `dateModified` (`docs/TRAPS.md`) and record n".
  - The same step sends the exit numbers to "ROADMAP's Phase 1 exit status" (HANDOFF:47), but the lag is "not part of the exit".
  - So the record could go to ROADMAP, the TRAPS entry (TRAPS:90-95 wants "n >= 20 on business days"), or PROGRESS. I would put it in PROGRESS and append it to TRAPS.
- **AMBIGUOUS (PAGE, MINOR): step 4 puts the revert kit before the G1 push and on the pushed G1 at the same time.**
  - HANDOFF:53-54 says "Before the G1 push, do the checklist ... (... the revert kit re-made on the pushed G1)".
  - The design says it must exist before: `docs/design/P2.2.md:886` (R-1) "a tested revert kit exists before G1".
  - The kit notes say after: `p2.2-revert-kit:docs/design/P2.2_revert_kit.md:138-139` "At the G1 push, re-base: re-create `30f6832`
    against the pushed G1".
  - Workable reading: re-make it on the rebased G1 sha before pushing, since the sha does not change on push. The page should say so. This matters only at step 4.
- **MISSING (PAGE, MINOR): no rule on push timing for the Tuesday measurement day.**
  - Step 2 commits the gallery fixture on Tue afternoon. A session that ends after step 2 (before 18:00 ET) pushes at step 5.
  - Every push to main redeploys ced-api: `.github/workflows/deploy.yml:6-10` triggers on every successful ci run on main.
  - Design §4.1 (`P2.2.md:515`) says "none inside a measurement window" for the G pushes.
  - PROGRESS #8 deliberately timed a docs push "between the 08:45 and 11:15 ET Public Inspection slots".
  - The page is silent on this. Low impact: PROGRESS #8 says "a redeploy changes no stored first_seen_at".
- **NIT (PAGE): step 2's retry and its README row are loose.**
  - "if not yet, try again later" (HANDOFF:44) gives no interval and no give-up time.
  - "Add its row to `fixtures/README.md`" (HANDOFF:44-45) does not say whether that means a new "Set recorded 2026-10-06" table, or
    whether the Pending paragraph at `fixtures/README.md:84-86` must be edited too.
- **AMBIGUOUS (TREE, MINOR, carried over from r6, still open): is G0 a push?**
  - `docs/design/P2.2.md:519` says "G0 | nothing pushed: Phase 1 closed; ... store export".
  - `p2.2-final:docs/design/P2.2_integration.md:686` says "| G0 | `6195c59` | `5d85b16` | 2 |", a 2-commit push range.
  - HANDOFF:22 ("until ... G0 is done") works under either reading. It matters only at step 4.
- **NIT (TREE, carry-over): the exit-status heading date is stale.** `docs/ROADMAP.md:98` is headed "Exit status (2026-10-03)" but holds a 2026-10-04 entry (:103).
- **Not STALE (checked):**
  - HANDOFF:17, the capture task is gone: verified.
  - HANDOFF:10, only exit (3) is open: matches ROADMAP:98-103.
  - CI is now green.

## (2) HARMFUL instructions?
None found.
- Every outward action on the page is either granted or polite:
  - one GET per try to dailypress.senate.gov with the project UA;
  - read-only ledger paging of our own API;
  - a push under G-003 when ship_state says PUSH.
- Step 1 says "do not re-ask what docs/DECISIONS.md settles". That covers D-096 ("do not ask again") and the stale O1/O3/O4 list in the integration notes' §6.2, which the addendum now supersedes.
- Step 4 holds every P2.2 push behind an owner ask and D-098.
- The only mild waste risk is the unbounded "try again later" loop. Each try is a single request, so it is not harmful.
- No settled work is redone.

## Verdict
PASS-WITH-NOTES. The first action is unambiguous (step 1 ask). All later commands are literal or can be built directly
from named files. Nothing contradicts the routing. The open items are minor wording gaps in steps 2-4.

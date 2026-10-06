# Cold-start r6 — resumer 3 (lens: executor) — HANDOFF #4

Oriented 2026-10-05 20:57 CDT (= 21:57 ET, Mon). Read: HANDOFF.md, CLAUDE.md, MAP.md, ROADMAP Phase 1-2, DECISIONS
D-090..D-106, TRAPS (WH backdate, gallery entries), PROGRESS #9, fixtures/README.md "Pending", handoff SKILL.md,
docs/design/P2.2.md §4.1 and §9, `git show p2.2-final:docs/design/P2.2_integration.md` (§1, §6, §7.2, §8),
`git show p2.2-revert-kit:docs/design/P2.2_revert_kit.md` (§1, §3, §4), scripts/record_fixture.mjs, scripts/ledger_report.mjs.

## Ship state

`node scripts/ship_state.mjs` -> `ROUND-DUE`, head `4a6eb33` on main = origin/main, ahead 0 / behind 0, tree clean,
gate PASS stamp at HEAD, CI pending at first run (a `--no-fetch` re-run a few minutes later: CI success), page #4,
no cold-start on record (next r6). ROUND-DUE is this round (harness fact) -> treated as SHIPPED-CLEAN -> NEXT ACTION.
`node scripts/handoff_lint.mjs` -> PASS (page #4, 58 lines). `docs/STATUS.json`: push_hold false.

## Read-only checks I ran during orientation

- `Get-ScheduledTask | ? TaskName -like 'CED*'` (HANDOFF.md:17-18) -> count 0. The one-time capture task is gone. Nothing to do.
- `node scripts/ledger_report.mjs --days 2026-10-05` (descriptive only; Monday's data is complete; the rule is frozen by
  D-099). Output: `PASS 2026-10-05: PI 93, WH 7, latency n=93 median=46.006 s`; 1 filing slot (12:45Z, 93 docs, 1 poll);
  WH lag n=7, median 360 s, 1 item over 1 h (the backdated post TRAPS already covers). This confirms the tool runs and
  that WH items count by first-seen day (`dayReport`), so the backdated post does not cost Monday its WH item.
  NOT the exit record. Step 3 still waits for Tuesday.

## Where NEXT ACTION stands right now (Mon 21:57 ET)

| step | its data exists? | status |
|---|---|---|
| 1 Ask first | yes | FIRST ACTION: one AskUserQuestion (multiselect) + PushNotification |
| 2 Oct 6 gallery post | from Tue 2026-10-06 ~15:30 ET (convene 1:30 p.m., post went public 91 min late on Oct 5, n=1) | waiting |
| 3 Exit 3 ledger | after Tue 2026-10-06 18:00 ET | waiting |
| 4 Ask P2.2 go-live (G0 first) | only if step 3 shows every exit met | waiting |
| 5 handoff skill | at wind-down | — |

So: ask, record what is waiting, stop. This is the end state the page asks for ("do the ones whose data exists, record
what is still waiting, and stop there", HANDOFF.md:37).

## First action

AskUserQuestion, one multiselect call, with a PushNotification (HANDOFF.md:38-39; CLAUDE.md "Working with the owner").
It is first because the page puts it first and because no other step's data exists until Tue ~15:30 ET.

The first literal data command after that (Tue 2026-10-06, at or after ~15:30 ET), derived, not copied from the page:

    node scripts/record_fixture.mjs senate.pressgallery "https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories" --name posts_newest3_after_pro_forma.json --date 2026-10-06

(URL = `packages/adapters/src/sources/senate_pressgallery.ts:36` and the 2026-10-05 fixture's meta.json; name from
fixtures/README.md:85 "as `posts_newest3_after_pro_forma.json` above"; usage from scripts/record_fixture.mjs:4.)
Then, after 18:00 ET: `node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06` (copied from HANDOFF.md:43).

## What I would ask (one AskUserQuestion, multiselect, + PushNotification)

1. Timing: it is Monday ~10 p.m. ET and nothing can be done until Tuesday afternoon. End now and resume Tue after
   18:00 ET to do the gallery recording and the exit-3 report in one sitting (Rec.) / keep this session open and check
   in through Tuesday / resume Tue ~15:30 ET for the gallery post, then again after 18:00 ET.
2. If Tuesday passes exit 3: may I do G0 (local only, nothing pushed: store export, dry-run bundle size, rebase
   `p2.2-final` on that day's main and re-gate) the same evening, and ask you separately before G1, the first push of
   P2.2 code (Rec.) / ask me before G0 too?
3. Friday Oct 9 gallery post (step 2, "Friday Oct 9: the same"): a session on Friday afternoon records it (Rec.) / a
   one-time Windows scheduled task records it (keeps running on your PC: ask-first, like G-011) / skip Oct 9.
4. Optional: delete the decrypted YouTube result in `scratch/youtube/` now (its conclusions are already in the research's
   §6) instead of by the 2026-11-04 deadline (D-105) / keep it to the deadline.

Not asked (settled): O1 (D-090), O3 / D-057 readout (D-096 "do not ask again"), O4 (D-092), D-028 routine (D-100),
the exit-3 counting rule (D-099).

## Every point where I had to guess (executor lens)

1. Step 2 names no command. I derived the record_fixture call above (usage from MAP/script header, URL from the adapter
   constant, `--name` from the README's "as ... above", `--date` explicit because the default is the UTC date).
2. Step 2: how to know the Oct 6 post is public. Guess: `X-WP-Total` goes 1,843 -> 1,844 and the newest post is titled
   "Tuesday, October 6" with "1:30 p.m. The Senate convened for a pro forma session". If not yet public at 15:30 ET:
   guess, re-check every ~15 min (polite polling). The page does not say.
3. Step 2: what to do if the post lacks its convene line. Not said (guess: record anyway, note it, TRAPS entry).
4. Step 2 "add its row": guess a new "Set recorded 2026-10-06" table in fixtures/README.md like the 2026-10-05 one,
   plus updating the "Pending" paragraph (fixtures/README.md:84-86).
5. Step 3: what to do if Tuesday FAILS exit 3. Not said. Guess: exit 3 needs any 2 business days (ROADMAP.md:93), so
   re-run on Wed Oct 7 with `--days 2026-10-05,2026-10-07`, and say so.
6. Step 3 "if two days give fewer, record n and keep collecting": guess this is about the WH lag only and does NOT hold
   exit 3 open (exit 3 has no lag clause, ROADMAP.md:93-95). Monday alone gave WH n=7, so <20 after two days is likely.
7. Step 4 "tick it in ROADMAP": every Phase 1 box is already [x]; guess it means writing (3) MET in the "Exit status"
   paragraph (ROADMAP.md:98-103).
8. Step 4 "ask ... one step at a time (G0 first)" vs D-098 "until ... G0 (§4.1) is done; go-live then follows ... G1..G10,
   each with its own row": does G0 (nothing pushed) itself need a go? Guess: ask anyway (question 2 above).
9. HANDOFF.md:17-18 scheduled-task check: where to record the result is not said (guess: this session's PROGRESS entry);
   what to do if it still exists is not said (removing a task on the owner's PC: guess ask-first).

## (1) AMBIGUOUS / CONTRADICTORY / STALE (both sides quoted)

- CONTRADICTION / STALE (p2.2 notes vs HANDOFF). HANDOFF.md:19-21: "the local branch `p2.2-revert-kit`. Everything about
  them, including what each push still needs: `git show p2.2-final:docs/design/P2.2_integration.md`" vs
  `p2.2-final:docs/design/P2.2_integration.md:512-514`: "**G1 push blocked by design §7 Stage 3b: the revert kit** ...
  is not built." The kit WAS built (`p2.2-revert-kit` f99daf9, 20:34 CDT, after p2.2-final's 19:29 CDT tip; PROGRESS.md:55
  "the revert kit's gate PASS"). Its own pending list and rows D-NEW-kit-1..4 live only in
  `p2.2-revert-kit:docs/design/P2.2_revert_kit.md` (§3, §4; §3 item 5 says they go into the integration notes at the
  G1 push). No file on main names that notes file. So "Everything about them" is incomplete, and the one file it points
  to contradicts the page. Matters at step 4 (G1 push), not now. Fix: name the kit notes file beside the integration notes.
- STALE (tree, branch doc). `p2.2-final:docs/design/P2.2_integration.md:525`: "Owner questions O1 (phone E2 check), O3
  (dashboard numbers), O4 (the recess wording) from design §9." listed under "Still open" vs docs/DECISIONS.md D-090
  ("Yes, both"), D-092 ("House 'through Nov 8'"), D-096 ("The D-057 readout is complete: do not ask again"; O3 falls
  back to `/ops`). Only O1's phone reading is still to come (at G3). Re-asking O3/O4 would waste the owner's time;
  HANDOFF.md:38-39 "do not re-ask what `docs/DECISIONS.md` settles" catches it.
- AMBIGUOUS (page). HANDOFF.md:46-47 "TRAPS wants n >= 20 business-day items before acting on the lag, so if two days
  give fewer, record n and keep collecting" vs ROADMAP.md:93-95 exit 3 (no lag clause) and HANDOFF.md:48 "When every
  Phase 1 exit criterion is met". Readable as "Phase 1 stays open until n >= 20". Likely real (Monday WH n=7).
- AMBIGUOUS (page). HANDOFF.md:48 "tick it in ROADMAP" vs ROADMAP.md:25-89 (every Phase 1 box already [x]) and
  ROADMAP.md:98 (exit criteria live in a prose "Exit status" paragraph).
- AMBIGUOUS (page). HANDOFF.md:48-49 "ask the owner whether P2.2 goes live, one step at a time (`docs/design/P2.2.md`
  §4.1, G0 first)" vs DECISIONS D-098 "until Phase 1's exit criteria are met and G0 (§4.1) is done; go-live then follows
  the gated steps G1..G10 of §4.1, each with its own row" (G0 = "nothing pushed", P2.2.md:519).
- NIT STALE. ROADMAP.md:98 "Exit status (2026-10-03):" while the paragraph holds "(5) MET (2026-10-04)" (ROADMAP.md:103).
- NIT STALE. `p2.2-final:docs/design/P2.2_integration.md:666` "Since this stack was cut, main has moved to `781bed7`"
  (main is now 4a6eb33; a dated record, and HANDOFF.md:50 already requires a rebase onto that day's main).
- Not a defect: ship_state ROUND-DUE (this round), and CI pending at the first run (success a few minutes later).

## (2) HARMFUL instructions?

None found. Nothing destructive, nothing outward-facing without the owner's OK, nothing that redoes settled work:
- Step 2: one polite GET to dailypress.senate.gov, a local commit; any push goes through ship_state `PUSH` (G-003).
- Step 3: reads our own API; White House `dateModified` checks are a few polite page GETs.
- Step 4: asks the owner before each go-live step; P2.2 branches stay local (D-098), never pushed unasked.
- The only waste risk is the stale O1/O3/O4 list in the integration notes (above), which the page's "do not re-ask"
  rule neutralises.
- YouTube deletion (HANDOFF.md:16) is owner-ruled (D-105), due 2026-11-04, not now.

## Verdict

PASS-WITH-NOTES. The page routed me to a clear first action within minutes (ship_state -> step 1 ask), the waiting
state is explicit, and the time gates are concrete. Notes: step 2 has no literal command and no "not public yet" /
"no convene line" branch; no exit-3-FAIL branch; the WH-lag "keep collecting" line can be misread as holding Phase 1
open; and the P2.2 pointer omits the revert-kit notes file while the file it names still says the kit is not built.

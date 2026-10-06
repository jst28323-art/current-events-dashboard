# Cold-start r8 — resumer 1 (straight lens)

Prompt: the canonical resume prompt (byte-identical to CLAUDE.md:86). Read literally, in the order the page gives.
Clock at orientation: Mon 2026-10-05 21:57 CDT = 22:57 ET (`date`; git-bash had no America/New_York zone data, so I
worked out ET from CDT by hand).

## What I did, in order

1. `HANDOFF.md` (61 lines; `node scripts/handoff_lint.mjs` -> `PASS (page #4, 61 lines)`).
2. `node scripts/ship_state.mjs` (HANDOFF.md:26-31), exit 10:
   - `ship_state: ROUND-DUE`
   - `head: a11bdbe on main · origin/main: a11bdbe · ahead 0 · behind 0` · `tree: clean`
   - `gate: PASS stamp at HEAD · last run PASS at a11bdbe` · `ci: pending` (run 37406409349) · `note: CI for HEAD is still running`
   - `page: HANDOFF #4 · cold-start: 2 record(s), none accepted (next round r8)`
   - `next:` the coldstart-validate Workflow call for round 8, page 4, sha a11bdbe5fabc.
   ROUND-DUE for page #4 is this round (harness rule), so I carried on as if it had said SHIPPED-CLEAN -> NEXT ACTION.
   `docs/STATUS.json`: `push_hold: false`.
3. `CLAUDE.md` (the contract), `docs/ROADMAP.md` Phases 1 and 2 (lines 23-151), `MAP.md`.
4. The pointers the NEXT ACTION steps name: `fixtures/senate.pressgallery/2026-10-05/posts_newest3_after_pro_forma.json.meta.json`
   (its URL equals the adapter's `per_page=3&_fields=...` constant on main and on p2.2-final), `scripts/record_fixture.mjs`
   (`--date` and `--name` are real flags), `fixtures/README.md` rows 79-86, `docs/TRAPS.md` (gallery late-public entry
   :348-353; White House backdated post :96-102; n >= 20 lag rule :93-95), `scripts/ledger_report.mjs` (PASS/FAIL line
   format, slot sightings, WH lag), `docs/DECISIONS.md` D-097..D-106, PROGRESS #9 and its addendum,
   `git show p2.2-final:docs/design/P2.2_integration.md` (opening addendum, section 8 push ranges),
   `git show p2.2-revert-kit:docs/design/P2.2_revert_kit.md` (section 1), `docs/design/P2.2.md` §4.1,
   `.claude/skills/handoff/SKILL.md`, `docs/OWNER_GRANTS.md`.
5. Read-only checks: `node scripts/check_paths.mjs` -> PASS (19 docs, 0 dead paths); `git status` clean;
   `Get-ScheduledTask | ? TaskName -like 'CED*'` -> 0 tasks (HANDOFF.md:17 "the capture task has deleted itself" holds);
   `scratch/youtube/result_2026-10-05.json` exists (ROADMAP P3.3 deletion item, due 2026-11-04); branches `p2.2-final`
   (tip 79e36c2) and `p2.2-revert-kit` (tip f99daf9) exist locally only (`origin` has only main).

## NEXT ACTION, step by step, at Mon 22:57 ET

| step | data exists now? | what I do |
|---|---|---|
| 1 Ask first (AskUserQuestion + PushNotification) | yes | **FIRST ACTION** |
| 2 Oct 6 Senate gallery post | no: Tue 2026-10-06 from ~15:30 ET (convene 13:30 ET per fixtures/README.md:79; Oct 5 post went public 91 min late, TRAPS:348-353) | write as waiting |
| 3 Exit 3 ledger report + WH lag by hand | no: after Tue 2026-10-06 18:00 ET (last PI special-filing slot, SOURCES fr.api) | write as waiting |
| 4 Ask whether P2.2 go-live starts | no: needs every Phase 1 exit met (exit 3 open, ROADMAP:99) | write as waiting |
| 5 handoff skill | yes (after 1) | PROGRESS entry listing 2-4 as waiting, then stop |

**First action:** one batched AskUserQuestion (multiSelect) with a PushNotification (HANDOFF.md:39-40). It is first
because the page lists it first and because, on Monday night, it is the only step whose data exists.
**First data command after it** (Tue 2026-10-06 at or after ~15:30 ET):
`node scripts/record_fixture.mjs senate.pressgallery "https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories" --date 2026-10-06 --name posts_newest3_after_pro_forma.json`
then check that Tuesday's post (with its convene line) is among the 3; if not, retry later.

## What I would ask (one AskUserQuestion, multiSelect, with a PushNotification)

1. **Session shape.** It is Monday ~11 PM ET, and nothing on the list can run before Tuesday afternoon. The gallery
   post shows up from about 3:30 PM ET, and the latency check needs data until after 6 PM ET. Options: (a) end now and
   resume Tue after 6 PM ET, so both steps happen in one sitting and the push (which redeploys the live API) lands
   after the day's last filing slot (Rec.); (b) resume Tue ~3:30 PM ET for the gallery post, then again after 6 PM;
   (c) keep this session open and waiting.
2. **Friday Oct 9 (and a Tuesday backup).** The Oct 9 gallery post needs someone at the keyboard Friday afternoon.
   May I create one Windows scheduled task on this PC, like Monday's (G-011 was one-time and is used up), that records
   the gallery's newest-3 list a few times between 3:30 and 6:30 PM ET on Oct 6 and Oct 9 and then deletes itself?
   It sends a few small requests and uses no GPU. Ask-first: it runs on your home PC (CLAUDE.md:56-57). Options:
   yes, both days / Oct 9 only / no, a session will do it by hand.
3. (Step 4, asked when exit 3 is met, not now. I would only mention it ahead of time.) If Tuesday passes, should
   P2.2's go-live start Wednesday? That means the G0 checks, then the G1 push of dormant code with a 2-hour watch,
   then the later steps on the design's calendar (§4.1: G5 and G6 must be live before Sun Nov 8).

Not asked (already settled): D-099 counting rule; D-096 Cloudflare readout complete (do not ask again); D-100 the
disabled cloud routine stays; D-105/D-106 YouTube storage.

## (1) Ambiguous, contradictory or stale? (both sides quoted)

- **NIT, PAGE: no range of its own for G7.** HANDOFF.md:18 says "the local branch `p2.2-final` (each go-live step
  G0..G9 a contiguous range". But p2.2-final:docs/design/P2.2_integration.md:63 says "G7 rides inside G1
  (orchestrator decision, row D-NEW-int-1)", and section 8's table row reads "G1 (with G7 `1432d2d`)". A reader looking
  for a G7 push range will not find one. This does not change any action before step 4.
- **NIT, PAGE: when "after 18:00" is.** HANDOFF.md:46 says "after Tue 2026-10-06 18:00 ET: `node scripts/ledger_report.mjs ...`".
  But 18:00 ET is itself a filing slot (docs/SOURCES.md fr.api: "special filings 08:45, 11:15, 14:00, 16:15, 18:00
  ET"), and pi_current is polled every 60 s. A run at 18:00:30 could report a PASS/FAIL before that slot's documents are
  first seen. "A few minutes after 18:00" would remove the doubt.
- **NIT, PAGE: README text to update.** HANDOFF.md:45 says "Add its row to `fixtures/README.md` and commit". But
  fixtures/README.md:80 says "(Oct 6 and Oct 9 still to record)", and fixtures/README.md:84-86 has a "Pending" paragraph
  for both posts. The page does not say to update those two mentions. A literal reader adds a row and leaves "still
  to record" stale.
- **NIT, TREE (stale dated record):** docs/design/P2.2.md:18 says "a plan for the build session that starts after Phase 1
  closes (earliest Tue 2026-10-06 evening ET". DECISIONS D-098 (docs/DECISIONS.md:108) says "OWNER OVERRIDE ... the
  P2.2 code ... is written and tested now on a local branch". MAP.md:25 says DECISIONS wins over a design record, and
  ROADMAP:137-142 carries the override, so routing is unaffected.
- **MINOR, TREE: worktree names.** p2.2-final:docs/design/P2.2_integration.md:30 says "Branch `p2.2-int` (worktree
  `.claude/worktrees/p22-int`)". But `git worktree list` shows `.claude/worktrees/p22-int 79e36c2 [p2.2-final]`: the
  worktree now holds p2.2-final, and p2.2-int is in no worktree. Step 4's "rebase and re-gate" on p2.2-final must run
  inside that worktree, or after it is removed, because git refuses to rebase a branch checked out elsewhere. Twelve
  build worktrees and ~20 local p2.x branches remain. Nothing on the page says what happens to them. They are local and
  harmless; nothing should delete them without the owner.

No real contradiction on the page itself. Each fact I checked held: Phase 1 exit status (1),(2),(4),(5) MET and (3)
OPEN (ROADMAP:98-103); D-098 wording; the full gate only at the G1 boundary and at the top (addendum line 21);
YouTube's terms applied to that call's result only (D-105/D-106; the r7 contradiction is fixed); the capture task
gone; the step 2 URL; the deletion item in ROADMAP P3.3.

## (2) Anything harmful (destructive, outward-facing without OK, wasteful)?

- **MINOR, PAGE, MISSING: push timing on Tuesday, a measurement day.** HANDOFF.md:37-38 ("do the ones whose data exists ...
  and stop there") plus step 5 (the handoff skill: commit, gate, `git push origin main` under G-003) means that a
  session which does step 2 at ~15:30 ET and then stops will push before 18:00 ET. "Each push redeploys the public
  site" (CLAUDE.md:50), and deploy.yml then redeploys ced-api on Tuesday, near the 16:15 and 18:00 ET special-filing
  slots. docs/TRAPS.md:501 says "a DO call can fail on any deploy", and :505 says "the first cron after a deploy
  re-parses every endpoint once". PROGRESS #8 timed its push deliberately "between the 08:45 and 11:15 ET Public
  Inspection slots", and docs/design/P2.2.md §4.1 says "none inside a measurement window". The page says nothing
  about this. The impact on exit 3 is small, because the 08:45 slot dominates the median, but holding the push until
  after 18:00 ET (or keeping it away from 16:15) costs nothing. Owner question 1 above covers it.
- Nothing destructive or outward-facing without OK: step 2 is one polite GET to a public WordPress endpoint, and step
  3 is read-only GETs to our own API and whitehouse.gov pages. Step 4 asks the owner before any P2.2 push, and D-098
  forbids merging before exit and G0. The page explicitly tells me not to re-ask settled rows.
- Wasteful? At Mon 22:57 ET, the page's literal path is: ask, then write a "still waiting" PROGRESS entry and
  commit/gate/push it. A push with no product change is cheap, and the alternative (wait) is question 1. This is not
  re-doing settled work.

## Verdict

PASS-WITH-NOTES. The page routes correctly: ship_state first, then the ask, then time-gated data steps that each say
when their data exists. I could have executed every step without asking the owner anything the repo does not answer.
The notes are one MINOR missing caution (push timing on the measurement day) and NITs.

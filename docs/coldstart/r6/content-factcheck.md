# Cold-start r6 content fact-check: HANDOFF.md page #4 at 4a6eb33e3c3a

Checked 2026-10-05 from `git show 4a6eb33e3c3a:<path>` (snapshots in `scratch/coldstart/r6/snap/`). The P2.2 branches were
read at their refs, which have not moved since before the page's commit (20:48 CDT): `p2.2-final` = 62b07ec (reflog: last
commit 19:29 CDT) and `p2.2-revert-kit` = f99daf9 (last commit 20:34 CDT).

**Verdict: FAIL.** 4 false claims out of 46 checked.

## False claims

1. **L11 "Owner rulings D-097..D-106, each asked with a push notification".** D-105 and D-106 are `agent` rows
   (DECISIONS L115-116, column `by` = agent). Nobody asked the owner about them. PROGRESS #9's heading says "Owner rulings
   D-097..D-104; ... (D-105, D-106)", its L10-14 lists the two AskUserQuestion rounds as D-097..D-104, and commit d6c98fc
   also says "Owner rulings D-097..D-104". Correct range: D-097..D-104.
2. **L20-21 "Everything about them, including what each push still needs: `git show p2.2-final:docs/design/P2.2_integration.md`".**
   The integration notes were last committed at 19:29, which is before the revert kit was built (20:11-20:34). Their
   §6.2 still says "G1 push blocked by design §7 Stage 3b: the revert kit (...) is not built". The kit's real record, and
   what it still needs before a push (§3: re-create 30f6832 against the pushed G1, cherry-pick, re-run the checks and the
   gate; re-test at G8 and G9), exist only in `git show p2.2-revert-kit:docs/design/P2.2_revert_kit.md`. The page never
   names that file. So the one file it points to says the opposite of the page about the kit.
3. **L49-51 "do what the integration notes' pending section lists for that step (rebase onto main and re-gate, the store
   export, the living-doc rows, the revert kit re-made on the pushed G1)".** Pending §6 (6.1-6.3) lists only one of the
   four items: re-running `export_store` before G1. It does not say to rebase onto main and re-gate. §8 only notes that
   main moved to 781bed7 while the stack's base is 5ca8c7b; the rebase and re-gate instruction is in PROGRESS #9 L58-60.
   The living-doc rows are in the header comment and §4-§5, not in §6. "Revert kit re-made on the pushed G1" is in no
   part of the integration notes: it is in the revert-kit notes §3, and §6.2 says the kit is not built.
4. **L22 "Never merge or push them without the owner's go for that step (D-098)".** D-098's binding is: nothing merged or
   pushed until Phase 1's exit criteria are met and G0 is done, then G1..G10 follow §4.1, "each with its own row". It
   does not require the owner's go for each step. The step rows the integration notes propose are all `by: agent` (§4),
   and G-003 covers gated pushes to main. The page's rule is stricter than the ruling it cites, so the citation is
   false. Low severity: it errs toward asking the owner, and the archived page #3 also had "ask the owner whether P2.2
   starts".

## Checked and true

- L3: AS-OF 2026-10-05. Repo path. `origin` = github.com/jst28323-art/current-events-dashboard, public (D-002, G-001).
  The live page answers HTTP 200. `ced-api.usgovfeed.workers.dev/api/v1/status` answers 200 (DEFAULT_API_URL in
  deployed_check.mjs; D-027).
- L5-6: CLAUDE.md, docs/ROADMAP.md Phases 1-2 and MAP.md exist. The page names no sha.
- L8/L10: Phase 1 exits 1, 2, 4 and 5 are MET and exit 3 is OPEN, needing Mon 10-05 and Tue 10-06 (ROADMAP L98-103).
  Monday's polling is done (PROGRESS #9 descriptive read). P2.2 is built on a local branch and not live (ROADMAP
  L138-142). PROGRESS #9 exists.
- L12-13: D-097 (key now), D-098 (owner override, build early on a local branch), D-099 (documents plus slot
  sightings, asked before Tuesday) and D-101..D-104 (press-conference choices, per D-100) all match DECISIONS.
- L14: the secret is `YOUTUBE_API_KEY` (workflow L31). The owner made the key and ran the call (PROGRESS #9 L23-25, run
  37338433045; commit 5ca8c7b).
- L15-16: data kept at most 30 days (D-105, III.E.4.d). No aggregate (D-106). Conclusions only in prose (D-105; research
  §6). `scratch/` is gitignored. The run was 2026-10-05T16:08Z, and 30 calendar days from then is 2026-11-04 (PROGRESS L26-27).
- L17-18: the P2.3 recordings are committed (781bed7; ROADMAP P2.3 [x]). The task "CED pro forma capture 2026-10-05"
  had DeleteExpiredTaskAfter PT1H (PROGRESS L40-42). The PowerShell line is valid, and running it now returns nothing.
- L19-20: the local branches `p2.2-final` and `p2.2-revert-kit` exist, and `git ls-remote --heads origin` shows only
  main. The steps G0..G9 are each a contiguous range (integration §8; G10 is the Dec 15 rollover check, not code). G9 is
  not pushable (§6.2, §8).
- L26-31: `scripts/ship_state.mjs` exists. It fetches unless `--no-fetch` is given; `--offline` skips the CI lookup and
  implies `--no-fetch`. SHIPPED-CLEAN is the "nothing to ship" verdict, and every verdict prints a `next:` line (L219).
- L38-39: the canonical prompt asks for AskUserQuestion, and CLAUDE.md asks for a PushNotification with each question.
- L40-42: fixtures/README.md "Pending" covers the Tue Oct 6 and Fri Oct 9 1:30 p.m. pro formas (production newest-3
  URL, check the convene line). TRAPS L348-353 says posts go public late (91 min). The Oct 5 post lists Oct 6 and Oct 9
  at 1:30 p.m. No 2026-10-06 folder exists yet.
- L43-47: `ledger_report.mjs --days a,b` exists. It prints PASS/FAIL, n, median, the slot sightings (D-099) and the WH
  lag with a count over 1 h. TRAPS L100-102 says to check each item over 1 h against its dateModified, and TRAPS L94
  asks for n >= 20 business-day items. ROADMAP's exit status asks for the same record.
- L48-49: P2.2.md §4.1 exists and G0 comes first. Congress returns Nov 9 (ROADMAP L9).
- L52: `.claude/skills/handoff/SKILL.md` exists.
- L56-58: MAP.md, TRAPS, PROGRESS (newest first) and HANDOFF_ARCHIVE (#1-#3) exist. Both artifact links are recorded
  (PROGRESS #9 L16; PROGRESS L241).
- NEXT ACTION is not done yet: main HEAD = 4a6eb33, with no later commit and no Oct 6 data. ROADMAP does not contradict
  it: closing Phase 1 exit 3 is the open item, and the gallery recordings are allowed under D-098.

## Noted, not counted as false

- L19 says each step is "a gated range", and ROADMAP L140 says the same. In fact every boundary passed a subset of the
  checks (typecheck, vitest, harness, check_paths, dry-run; integration §8). The full gate ran only at G1 af5cfd9 and at
  the top. The wording is loose, but step 4 already says to re-gate before any push.
- L15 says the terms "forbid publishing it". D-106(2) allows showing current API data on the site. In the context of
  this research call's data the sentence matches D-105 (no disclosure or redistribution).

# Cold-start r4 · resumer 3 · lens: executor

Page read: `HANDOFF.md` (page #3, 58 lines). Oriented 2026-10-03 19:44 CDT (2026-10-04 00:44Z; Sat 20:44 ET).

## Orientation, in the order the page asked

1. `node scripts/ship_state.mjs` (harness git-bash, repo dir; it fetched origin and asked GitHub for CI):
   ```
   ship_state: ROUND-DUE
     head: aac53e8 on main · origin/main: aac53e8 · ahead 0 · behind 0
     tree: clean
     gate: PASS stamp at HEAD · last run PASS at aac53e8
     ci:   success .../actions/runs/37165608576
     page: HANDOFF #3 · cold-start: none on record (next round r4)
     next: Run the cold-start round for page #3 ...
   ```
   ROUND-DUE for page #3 is this round (harness rule), so I treat it as SHIPPED-CLEAN and go to NEXT ACTION.
   The tree is clean (`git status --short` is empty). `docs/STATUS.json`: `push_hold: false`.
2. `node scripts/handoff_lint.mjs`: `PASS (page #3, 58 lines)`.
3. Read: CLAUDE.md, ROADMAP Phases 1-2, DECISIONS D-028/D-033/D-055..D-060/D-089..D-095, OWNER_GRANTS G-011/G-012,
   PROGRESS #7 and #6, `docs/design/P2.2.md` §9, `docs/research/leadership_press_conferences.md` §6, TRAPS (Monday-task
   entry), the handoff skill, `scripts/ledger_report.mjs` header, `scripts/capture_task.cmd`, `.claude/settings.json`,
   and the Cloudflare readout page (artifact Kuw3yQ4xupbY94jWi4hviV, read-only: no runtime capabilities, so the owner
   sends results as screenshots in chat and nothing is stored on the page).
4. Live facts I checked (read-only):
   - Windows task `\CED pro forma capture 2026-10-05`: Status Ready, Next Run 10/5/2026 2:45 PM, Logon Mode
     "Interactive only" (this matches D-033/D-056 and TRAPS).
   - `scratch/capture_task.log` does not exist yet. That is expected: the task has not run, and step 3 reads it only after Mon 16:30 CT.
   - No DECISIONS row after D-095 (file ends at line 105), so the Cloudflare readings are NOT recorded.
   - No Cloudflare readings or screenshots anywhere in `scratch/`. `scratch/progress7_draft.md` and `scratch/handoff3_draft.md`
     hold none either.

## Where each NEXT ACTION step stands right now (Sat 20:44 ET)

| Step | When its data exists | Now |
|---|---|---|
| 1 Ask first (AskUserQuestion + PushNotification) | now | **DO FIRST** |
| 2 FR flip check | from Mon 2026-10-05 01:00 ET | waiting (~28 h) |
| 3 Monday recordings (P2.3) | after Mon 2026-10-05 16:30 CT, log ends with "exit" | waiting |
| 4 Live latency (exit 3) | after Tue 2026-10-06 18:00 ET | waiting |
| 5 Tick Phase 1, ask about P2.2 | after 4 | waiting |
| 6 handoff skill | session end | last |

So: ask, act on whatever the owner answers (the Google key walkthrough; record the Cloudflare readings as a row
amending D-095), record what is still waiting, then stop with the handoff skill.

## FIRST ACTION

One AskUserQuestion call (multiSelect where it fits), sent with a PushNotification. Source: HANDOFF.md:36-39, NEXT ACTION
step 1, and CLAUDE.md "Working with the owner". It comes first because the page puts it first, and because no other step's data exists until Monday.

What I would put in it (`would_ask`):
1. **Google API key walkthrough (D-093, G-012), timing only.** D-093 already settled "next session", so I would not
   re-ask whether to do it. Options: "walk me through it now (~10 min)" / "later in this session" / "postpone".
   Sub-question: the first use is one 1-unit `videos.list` call on the 38 ids. The key will live only as a GitHub
   Actions secret, and no workflow can make that call today. May I add a manual-run GitHub Actions workflow that makes
   that one call and saves the reply as a run artifact (one request to Google, nothing on the live site)? I would also
   say which secret name I will use (e.g. `YOUTUBE_API_KEY`).
2. **Cloudflare readings (D-057 + the P2.2 O3 daily totals, readout page Parts A-C).** PROGRESS #7 says you did the
   readout while the probe finished, but no reading was recorded. Did you send screenshots in the last session? If so,
   please send them again. Options: "sending now" / "before Mon Oct 5, 7 PM CT (when the first logs expire)" / "skip it"
   (then the row says the cross-check was not made, as ROADMAP P1.3 allows).
3. **The disabled D-028 cloud routine still exists.** Delete it now (ask-first) / leave it.
4. **Until Monday's data:** stop after this (Rec.) / something else within the gates. I would not offer P2.2 build work,
   because Phase 1 is not closed (CLAUDE.md directive 4, D-058/D-089 scope).

No reminder question about staying signed in Monday: D-056 already answered it. A one-line reminder in the notification is enough.

## Points where I had to guess (executor lens)

- **Step 1, Google key:** the page says "walkthrough" but not what comes after it. How is the one `videos.list` call
  made when the key exists only as a GitHub Actions secret? Which secret name? Is the call in scope this session? No
  workflow exists (`.github/workflows/` = ci.yml, deploy.yml, pages.yml) and nothing in the repo describes one.
- **Step 1, readings:** whether the owner already did the readout (PROGRESS contradicts itself, see below). Also where
  the readings go besides the "row that amends D-095": D-057 says ROADMAP P1.3 and W10 (P1.5) too, and the five daily
  totals (O3) have no stated home except P2.2.md G0.
- **Step 2:** no command is given ("page `/api/v1/events` as `scripts/ledger_report.mjs` does"). It is workable because
  `allEvents` is exported, e.g. `node -e "import('./scripts/ledger_report.mjs').then(async m=>{const ev=await m.allEvents('https://ced-api.usgovfeed.workers.dev');const d=ev.filter(e=>e.sources?.[0]?.source_id==='fr.api'&&e.result?.publication_date==='2026-10-05');console.log(d.length,d.filter(e=>e.status==='scheduled').length)})"`.
  `allEvents` takes the base URL (it appends `/api/v1/events` itself), and fr.api is matched the way `dayReport`
  matches wh.feeds, through `sources[0].source_id`. I checked that the field names exist: `result.publication_date`
  is set in `packages/adapters/src/sources/fr_api.ts:472`, and `times.source_published_at` is in `packages/schema/src/types.ts:24`.
  A PI event can never be `scheduled` (`isScheduled` applies to `documents_newest` only, fr_api.ts:443-445), so
  including PI events in the check is harmless.
- Steps 3-4 are concrete enough to run cold.

## (1) AMBIGUOUS / CONTRADICTORY / STALE (both sides quoted)

1. **CONTRADICTION (TREE, MINOR): did the owner do the Cloudflare readout?**
   - PROGRESS.md:61-62: "D-089 (owner): while the probe finished, the owner did the Cloudflare readout (D-057; page
     extended with five daily usage totals for the P2.2 design)"
   - PROGRESS.md:76-77: "the dashboard cross-check is the owner's D-057 readout, still to be read at this entry's
     writing"; PROGRESS.md:83: "Open: ... the D-057 Cloudflare readings and the five daily totals".
   - DECISIONS has no row after D-095. The page's conditional (HANDOFF.md:37-39, "if no DECISIONS row records them yet")
     routes correctly, but the question has to allow that the owner may already have read them and sent them in chat.
2. **AMBIGUOUS (PAGE vs TREE, MINOR): deadline for the readings.**
   - HANDOFF.md:38-39: "the probe's first logs expire about Mon 2026-10-05 7 PM CT"; the readout page agrees ("Best by Mon Oct 5, 7 PM CT").
   - docs/ROADMAP.md:61: "so ask by 2026-10-06"; DECISIONS.md:105 (D-095): "due before the logs expire about
     2026-10-06"; DECISIONS.md:67 (D-057): "by ~Tue Oct 6"; docs/design/P2.2.md:929 (O3): "by Tue Oct 6".
   - Both can be true (the first runs expire Monday, the last on Tuesday). I take the page's earlier deadline because
     the alarm-level runs may sit in the first logs.
3. **STALE / incomplete (PAGE, MINOR): "its owner questions are answered".**
   - HANDOFF.md:17: "the P2.2 design `docs/design/P2.2.md` (its owner questions are answered: D-090..D-092)"
   - docs/design/P2.2.md:929: O3, the five daily totals added to the D-057 readout, has no row and is still open
     (P2.2.md:519, G0, needs "D-057 + O3 readings"). Step 1 names only "Cloudflare readings (D-057)". The readout page's
     Part C does include O3, so asking for the readings covers it in practice.
4. **NIT (TREE): mixed date conventions.** D-094 and D-095 (DECISIONS.md:104-105) and ROADMAP "Done 2026-10-04" /
   "(5) MET (2026-10-04)" use the UTC date. PROGRESS #7 ("2026-10-03") and HANDOFF "AS-OF 2026-10-03" use local CT.
   The same evening carries two dates.
5. **NIT (TREE): docs/design/P2.2.md:882** says "ids = next free at integration, D-090 onward today". D-090..D-095
   are now taken. The rule "next free at integration" still holds, so this is harmless.
6. **NIT (PAGE): HANDOFF.md:20**, "The disabled cloud routine (D-028) still exists", gives no instruction (keep it? delete it with an OK?). Harmless.

## (2) Anything HARMFUL?

No. Nothing the page or its pointers tell me to do is destructive. Step 3 commits fixtures locally. Step 6 pushes only
under G-003 (gate stamp, `PUSH` verdict). The only outward-facing items are already granted or ask-first: the Google
key walkthrough (G-012; the owner creates the key and adds the secret themselves) and the P2.2 go-live (step 5 asks
the owner first). Nothing asks me to redo settled work: P2.1 is merged, the probe is closed, and the P2.2 design stays
on paper until Phase 1 closes. One possible waste is re-asking D-093's settled "next session" as a yes/no question, so
I would ask about timing only (above).

## Verdict

PASS-WITH-NOTES. The page got me to a runnable first action in a few minutes. The ship-state, lint and timing logic
all checked out against the live state. Every gap is MINOR and none changes the first action.

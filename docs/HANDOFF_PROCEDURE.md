# The Handoff Procedure

Adapted from the aviary repo's v2 procedure, where every rule was paid for. **The one idea:** a handoff is the intent
at last write, not the state of the world; the repo is the truth, not the narrative; and the author cannot be the
judge of their own handoff.

## PART 0 — The files and their jobs

| file | job | discipline |
|---|---|---|
| `CLAUDE.md` | the operating contract | changes rarely; an agent may REPORT a stale rule, never repeal one that binds it |
| `HANDOFF.md` | the front page: **≤ 80 lines**, dated `## ⚑ LATEST #N` banner, one-paragraph state, `## SHIP STATE` (run the script), `## NEXT ACTION` (exactly one), pointers | carries no number a command can produce and no history; enforced by `scripts/handoff_lint.mjs` |
| `scripts/ship_state.mjs` | the ship-state decision as code: one verdict line | every branch pinned by `tests/harness/ship_state.test.mjs` |
| `docs/ROADMAP.md` | phases, tasks, exit criteria; the task queue the NEXT ACTION is drawn from | tick tasks as they land; never delete a phase |
| `docs/DECISIONS.md` | every owner ruling (verbatim) and settled agent choice | append-only |
| `docs/OWNER_GRANTS.md` | what an agent may do without asking | append-only, dated, owner's words |
| `docs/TRAPS.md` | facts that waste a day if unknown | uncapped, never deleted |
| `PROGRESS.md` | what happened each session and how it was verified | append-only, newest first; rotate at ~500 lines |
| `HANDOFF_ARCHIVE.md` | every superseded front page, whole | append-only; nothing in it is a live instruction |
| `docs/coldstart/r<R>/RESULT.json` | cold-start round records | written by the round, read by `ship_state` |

**Every fact lives in exactly one place.** If you are restating a number, a status or a decision, link to its home
instead. In aviary, four validation rounds in a row found that the previous round's fix had corrected a claim in one
place and left its duplicate wrong in another.

## PART 1 — Wind-down (the `handoff` skill walks this)

1. **Clean stop.** Finish the unit of work, or commit a named WIP state with a continuation recipe (exact commands).
2. **PROGRESS entry** (prepend): what changed, how it was verified (commands + results), what failed, your own
   corrections. Compare it with its sources for dropped caveats before committing: summaries delete hedges.
3. **ROADMAP**: tick finished tasks; make sure the next task is concrete enough to start cold.
4. **HANDOFF.md.** Either edit the NEXT ACTION line only (no rotation), or REPLACE the page (a rotation):
   append the old page WHOLE to `HANDOFF_ARCHIVE.md` under `## ARCHIVED #N (date)`, then write the new page as
   `## ⚑ LATEST #N+1 (YYYY-MM-DD) — title`. Replace the page whenever the state paragraph or NEXT ACTION changed
   materially — which is most sessions.
5. **Commit as you write.** Each state carrier (PROGRESS, ROADMAP, HANDOFF) is committed when written, not batched.
6. **Gate, then push.** `node scripts/ship_state.mjs` → obey → `node scripts/gate.mjs` → `git push origin main`
   (only under the push grant in `docs/OWNER_GRANTS.md`). Never push a red gate; never force-push.
7. **Cold-start round if the page was replaced** (PART 4). `ship_state` prints `ROUND-DUE` until a round is on record
   for the page number. The session that replaced the page runs the round. **The session is not done while
   `ship_state` says `ROUND-DUE`.**
8. **Surface the canonical resume prompt** (from `CLAUDE.md`) in a fenced block, with the validation verdict ("READY and
   FULLY VALIDATED: routing PASS 3/3, content PASS"). Never surface it before the round has passed.
9. **Wrap-up message** (the session's last message to the owner): what shipped (with the live URL if it changed), what
   was verified and how, what is still open, and the recommended next step with its justification. Send a
   PushNotification with the one-line headline.

## PART 2 — Cold start

1. Read `HANDOFF.md` (it routes you), then `CLAUDE.md`.
2. Run `node scripts/ship_state.mjs` and obey its verdict. A dead reference (path, decision id) is HALT-AND-ASK.
3. Open what `## NEXT ACTION` names (a ROADMAP task, usually). Read the `docs/TRAPS.md` entries for whatever you are
   about to touch, and `grep docs/DECISIONS.md` for its terms before proposing anything.
4. Ask the owner what the canonical prompt says to ask: batch the genuinely blocking questions in ONE AskUserQuestion
   call (multiselect where it fits), with a PushNotification so they see it on their phone. Never ask what the repo
   answers.

## PART 3 — The canonical resume prompt

It lives in `CLAUDE.md` (between the `canonical-prompt` markers) and, byte-identical, in
`.claude/workflows/coldstart-validate.js`; `scripts/handoff_lint.mjs` (rule L7) fails the gate if they drift. `HANDOFF.md`
must stay self-sufficient under that prompt alone.

## PART 4 — Cold-start validation

**Trigger:** `ship_state` says `ROUND-DUE` (the page number has no accepted round). Run it after the page is pushed:

    Workflow({ scriptPath: "C:/Users/j/claude/current-events-dashboard/.claude/workflows/coldstart-validate.js",
               args: { round: R, page_n: N, sha: "<pushed HEAD>", repo: "C:/Users/j/claude/current-events-dashboard",
                       date: "YYYY-MM-DD" } })

**Do not edit the working tree while a round runs**: the resumers read it live. `ship_state` prints the exact call.
Use `scriptPath`, not `name`: a workflow is found by name only when Claude Code was
launched from the repo itself (`docs/TRAPS.md`). A round is **N ≥ 3 blind resumers** (given only the canonical prompt plus harness
facts) and **exactly one fact-checker**. It returns two verdicts that are never merged:

- **ROUTING** — PASS when every resumer names the same first action, reports the pushed sha as HEAD (a resumer that
  could not see HEAD does not count), could execute without asking, did not itself return FAIL, and filed no
  PAGE-scoped BLOCKER / CONTRADICTION / HARMFUL defect and no PAGE-scoped FATAL of any kind.
- **CONTENT** — PASS when every factual claim on the page re-derives from the repo. A content catch that you fix becomes
  `CONTENT-FIXED`: in that round's RESULT.json set `content_verdict`, list the fixes under `content_fixes`, and record
  `content_fix_blob` = the output of `git hash-object HANDOFF.md` for the fixed page. **A round covers only the page text
  it validated** (or that text plus a recorded content fix): `ship_state` compares HANDOFF.md's blob, so any other edit
  to the page, even of the NEXT ACTION line alone, makes `ROUND-DUE` again (re-round, or rotate to a new page number).

On a routing FAIL: make ONE fix confined to the page (HANDOFF.md and what it routes to), commit, gate, push, re-round.
After two routing FAILs at n ≥ 3 on the same page, `ship_state` accepts the page "with the split" by itself: the newest
record's `blocking` list becomes the owner's first decision. Everything else the resumers noticed is BACKLOG: fix
TREE-scoped blockers before stopping (no re-round needed), and leave the rest as leads, not new page prose.
Commit the round's directory (`docs/coldstart/r<R>/`), gate, push.

**Without the Workflow tool:** spawn the same agents with the Agent tool (see the header of
`.claude/workflows/coldstart-validate.js`) and write RESULT.json by hand in the same shape.

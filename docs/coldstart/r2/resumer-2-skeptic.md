# Cold-start r2 — resumer 2 (skeptic lens)

Date: 2026-10-02 (Fri), 14:39 CDT at start. Prompt: canonical resume prompt only + harness RUNTIME facts.
I did not read the other resumers' notes in this folder.

## Orientation (what I ran / opened)

- `node scripts/ship_state.mjs` (with fetch + CI lookup) printed:
  `ship_state: ROUND-DUE`; head `b5dcb44` on main = origin/main, ahead 0 / behind 0; tree clean; gate PASS stamp at
  HEAD; CI success (run 37055175828); page HANDOFF #1, r1 validated an earlier text of page #1 (next round r2).
  Per RUNTIME, ROUND-DUE is this round in progress, so I treat it as SHIPPED-CLEAN and go to NEXT ACTION.
- `git status --porcelain=v1 -uall` → empty (clean). `git config core.hooksPath` → `enforcement/git-hooks` (no SETUP-ERROR).
- `node scripts/handoff_lint.mjs` → PASS (page #1, 59 lines). `node scripts/check_paths.mjs` → PASS (19 docs, 0 dead).
- `node scripts/gate.mjs --list` (list only, no run) → 8 harness checks; `package.json` `gate.npmScripts` is `[]`.
- Read in full: HANDOFF.md, CLAUDE.md, docs/ROADMAP.md, docs/DECISIONS.md, docs/OWNER_GRANTS.md, docs/STATUS.json,
  MAP.md, README.md, KNOWN_FAILING.md, HANDOFF_ARCHIVE.md, docs/TRAPS.md, PROGRESS.md, TESTING.md,
  docs/HANDOFF_PROCEDURE.md, docs/VISION.md, docs/ARCHITECTURE.md, docs/EVENT_MODEL.md, fixtures/README.md (+ tree),
  .claude/skills/{handoff,add-source}/SKILL.md, .claude/settings.json, .github/workflows/{ci,pages}.yml,
  scripts/gate.mjs, scripts/hooks/push_guard.mjs, scripts/check_paths.mjs (header + logic), scripts/ship_state.mjs
  (verdict table + flags), scripts/record_fixture.mjs (header), SYNTHESIS §header/§5/§8, SOURCES header + Tier rows,
  docs/coldstart/r1/RESULT.json (to see which r1 leads were fixed).

## Load-bearing claims on HANDOFF.md, each re-derived

| HANDOFF claim | how I checked | result |
|---|---|---|
| :3 GitHub `jst28323-art/current-events-dashboard` (public) | `git remote -v`; `gh repo view --json visibility` | origin matches; `"visibility":"PUBLIC"` ✓ |
| :3-4 placeholder site URL | `curl` with the project UA | 200, 12,280 B, `<title>Current Events Dashboard</title>` ✓ |
| :4-5 read CLAUDE.md, then ROADMAP; MAP for the rest | opened all three | exist and route as described ✓ |
| :8 Phase 0 done, no product code, Phase 1 next | ROADMAP:16-21 all `[x]`; no `packages/`, `workers/`, `apps/` dirs | ✓ |
| :14-17 DECISIONS covers budget, visibility, sources, alerts, transcripts, push grant, license, phone plan | D-001, D-002, D-009/D-016/D-017, D-012/D-023, D-010/D-018, D-011, D-014, D-015 | all present ✓ |
| :18-20 ARCHITECTURE / EVENT_MODEL / SOURCES / DESIGN_LANGUAGE | opened | exist, content as described ✓ |
| :21-22 six reports + SYNTHESIS dated 2026-10-02 | `ls docs/research` | 6 reports + SYNTHESIS.md ✓ |
| :23-24 fixtures because of recess; dates in TRAPS | fixtures tree; TRAPS:9-12 | ✓ (recess until Mon 2026-11-09; `date -d` confirms Monday) |
| :25-26 harness scripts, cold-start workflow, skills `handoff` + `add-source`, procedure doc | `ls scripts .claude/skills .claude/workflows` | all exist ✓ |
| :32-33 `--no-fetch` skips fetch; `--offline` also skips CI | ship_state.mjs:8-10 | ✓ |
| :41 Phase 1 + exit criteria in ROADMAP | ROADMAP:23-62 | ✓ |
| :42-46 P1.1 questions = Cloudflare signup+token, api.data.gov key, deploy grant, workers.dev subdomain; secrets route in ROADMAP | ROADMAP:25-31 | match ✓ (ROADMAP:28 says the owner pastes into GitHub Settings → Secrets; TRAPS:80-81 agrees) |
| :45 all are ask-first | OWNER_GRANTS:20-29 (accounts and secrets), :4 (ungranted = ask-first) | ✓ |
| :47-49 P1.2 dirs, check versions, every suite → `gate.npmScripts` | ROADMAP:32-39; gate.mjs:15-18, 79-82, 122 | ✓ (gate fails an ungated test/typecheck/build/e2e/lint script) |
| :50-51 P1.4 needs no account; P1.3/P1.5/P1.6 need it | ROADMAP:40,45,50,53 | ✓ |
| :51-52 P2.3 time-boxed exception | ROADMAP:71-74; research CFV:13-14 (Senate 16:00 ET, House 16:30 ET on Mon Oct 5) | ✓ (2026-10-05 is a Monday) |
| :53-54 end with the handoff skill, read by path if unlisted | `.claude/skills/handoff/SKILL.md` exists; TRAPS:78-79 says the same | ✓ |

r1 backlog follow-up (skeptic: assume the fixes were partial). Fixed in the tree: CI `npm ci` when a lockfile exists
(ci.yml:22-24), TESTING fixture layout (TESTING:12,21), add-source third-party rule (SKILL:12-14), SYNTHESIS §8.2
superseded note (SYNTHESIS:9-12, 566-568), SOURCES tier heading and P3.6 pointer (SOURCES:5,13), fixtures README SCOTUS
line (:26), JSON-Schema-in-Workers trap (TRAPS:58-60), EVENT_MODEL tier and source_id (:42, :57), skills-by-path trap
(TRAPS:78-79), deploy grant now asked (ROADMAP:29-30) and add-source step 7 (SKILL:33-35), fr.api NEGATIVE fixture
exists. Still open: the deploy ROUTE (see defect 1).

## (1) Ambiguous, contradictory or stale (both sides quoted)

1. **Worker deploy route unspecified** (AMBIGUOUS, TREE, MINOR). ROADMAP.md:25-27 "an API token scoped to Workers
   edits, stored as GitHub Actions secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`" — so the token lives only
   in Actions; but `.github/workflows/` has only `ci.yml` and `pages.yml` (no deploy job), and TRAPS.md:67-70 says the
   local token lacks "Actions: write" (`gh workflow run` fails, so a deploy workflow could only be push-triggered).
   ROADMAP.md:40 P1.3 needs a deployed probe Worker. Nothing says whether deploys run from Actions (a new workflow) or
   from this PC (wrangler + gitignored `.env`/`wrangler login`). Belongs in the P1.1 question about the deploy grant.
2. **HANDOFF_PROCEDURE disagrees with itself on what triggers ROUND-DUE** (STALE/CONTRADICTION, TREE, MINOR).
   docs/HANDOFF_PROCEDURE.md:39-40 "`ship_state` prints `ROUND-DUE` until a round is on record for the page number" and
   :66 "(the page number has no accepted round)" vs :83-84 "`ship_state` compares HANDOFF.md's blob, so any other edit
   to the page, even of the NEXT ACTION line alone, makes `ROUND-DUE` again" and scripts/ship_state.mjs:29 "no accepted
   cold-start round covers the CURRENT HANDOFF.md text". Live proof: r1 IS on record for page #1, yet ship_state says
   ROUND-DUE. Also :32 step 4 offers "edit the NEXT ACTION line only (no rotation)" as if it avoided a round; it does not.
3. **HANDOFF.md:53-54 "It includes the cold-start round when you replace this page."** (AMBIGUOUS, PAGE, MINOR/NIT) —
   true but incomplete: per HANDOFF_PROCEDURE.md:83-84 any edit to the page needs a round. ship_state enforces it
   anyway, so harmless; it does not affect the first action. Same wording in .claude/skills/handoff/SKILL.md:21.
4. **Vitest pin not on the ROADMAP; latest Vitest is incompatible with the Workers pool** (MISSING, TREE, MINOR).
   ROADMAP.md:35-36 names only the Preact pin ("stay on 10.x"); SYNTHESIS.md:332 says "Vitest 4.x for the Workers test
   pool". Measured now (`npm view`, 2026-10-02): vitest latest = 5.0.3; @cloudflare/vitest-pool-workers latest = 0.22.0
   with peer `vitest ^4.1.0`. An unpinned `npm i -D vitest` gives 5.x and conflicts with the pool. (Preact latest is
   11.0.0, consistent with the "stay on 10.x" note; wrangler 4.147.0 needs node >= 22.)
5. **Local Node 26.3.0 vs CI Node 22** (MISSING, TREE, MINOR). `node --version` → v26.3.0, npm 11.16.0;
   .github/workflows/ci.yml:21 `node-version: 22`; package.json engines `>=22`. A dependency that installs/tests fine
   locally can fail in CI (different npm major for `npm ci`, engine ranges). Not a TRAP entry yet (TRAPS:83-84 covers
   only `node --test <dir>` on Node 26). r1 also noted this; still unaddressed.
6. **P1.3 probe scope includes key-gated sources nobody is asked about** (AMBIGUOUS, TREE, MINOR). ROADMAP.md:40-41
   "fetch every Tier 1–2 source in `docs/SOURCES.md`" vs SOURCES.md Tier 2 rows `youtube.api` "needs a free Google API
   key (ask-first signup, ROADMAP P3.3)" and `war.feeds` "DVIDS API needs a free key"; P1.1 asks only for Cloudflare
   and api.data.gov. The probe must either skip those or add sign-ups.
7. **Where P1.1 answers are recorded** (NIT, TREE). ROADMAP.md:30 "Record the answers and grants in
   `docs/OWNER_GRANTS.md`" vs CLAUDE.md "Record every answer verbatim as a new row in `docs/DECISIONS.md` (and a grant
   in `docs/OWNER_GRANTS.md` if it grants authority)". Do both; CLAUDE.md governs.
8. **MAP.md:47 stale "(planned until the first round lands)"** (STALE, TREE, NIT) — `docs/coldstart/r1/RESULT.json`
   exists.
9. **P1.2 + check_paths interaction** (NIT, TREE, not a doc error): scripts/check_paths.mjs:10-11 exempts paths under
   `packages/ workers/ apps/` only "until that directory exists". Once `packages/` exists, HANDOFF.md:48 and
   ROADMAP.md:32-34 cite `packages/schema`, `packages/adapters`, `workers/api`, `apps/web`; a partial scaffold gated
   before all four exist fails `doc-paths`. Scaffold all four before the first gate.
10. **Duplicated question list** (NIT, PAGE). HANDOFF.md:43-45 restates ROADMAP P1.1's question list (CLAUDE.md "Every
    fact lives in exactly one place"). The two copies currently agree.

No contradiction affects the first action.

## (2) Anything HARMFUL (destructive, outward-facing without OK, wasteful)?

None found. Checked specifically:
- Pushes: only under G-003 when ship_state says PUSH; push_guard and the pre-push hook refuse force/delete/ungated main.
  A push redeploys Pages from `site/` (pages.yml:33), which P1.2 does not change.
- Accounts/secrets: P1.1 is explicitly ask-first, and the owner pastes keys into GitHub's UI (ROADMAP.md:27-28,
  TRAPS.md:80-81). The Worker deploy is gated on a grant the page tells you to ask for (add-source SKILL:33-35).
- Settled questions: HANDOFF.md:46 forbids re-asking; SYNTHESIS §8.2 is marked superseded (no permission emails).
- P2.3 live recording: polite GETs to .gov with the project UA, read-only.
- The ship_state `next:` line for ROUND-DUE spawns a workflow; under this sandbox's RUNTIME that is this round, not
  something to run.

## First action

After ship_state (treated as SHIPPED-CLEAN under RUNTIME) and reading the docs above: send **one AskUserQuestion call
(multiSelect where it fits) plus a PushNotification** asking the ROADMAP P1.1 questions (docs/ROADMAP.md:25-31).
It is first because HANDOFF.md NEXT ACTION step 1 says "Ask before building", the canonical prompt asks for questions
before development, P1.1 is the first unticked Phase 1 task (ROADMAP.md:4-5), and account creation, secrets and a
deploy grant are all ask-first (OWNER_GRANTS.md:20-26). Then, without waiting, P1.2 (scaffold; begin with `npm view`
version checks and pin Preact 10.x + Vitest 4.x), with P1.4 possible before P1.3.

Could I execute it without asking anything first? Yes: the first action IS the asking.

## What I would ask the owner (one AskUserQuestion, multiselect where it fits, + PushNotification)

1. Cloudflare: create the free account now (I walk you through it), make an API token scoped to Workers edits, and
   paste it and the account ID into GitHub → Settings → Secrets → Actions as `CLOUDFLARE_API_TOKEN` /
   `CLOUDFLARE_ACCOUNT_ID`? (now / later today / not yet)
2. api.data.gov: sign up for the free key now and paste it as `API_DATA_GOV_KEY` (and later a Worker secret)?
3. Worker deploys: may sessions deploy Workers to that account without asking when the gate passes (a Cloudflare twin
   of the push grant)? And which route: a push-triggered GitHub Actions deploy job using the secrets (recommended:
   nothing secret on this PC), or wrangler from this PC with the token in a gitignored `.env`?
4. Which `*.workers.dev` subdomain name?
5. (Fold into the notification text or a 2nd option set) Will a session be running Mon Oct 5 from ~15:55 ET
   (14:55 CDT) to record the pro forma fixtures (ROADMAP P2.3)? Senate convenes 16:00 ET, House 16:30 ET; the Oct 1
   Senate pro forma lasted 35 s.
6. (Can wait until P1.3) For the probe, skip key-gated Tier 2 sources (YouTube, DVIDS), or sign up for those free keys
   too?

Note: AskUserQuestion takes at most four questions per call (harness property, not in the repo), so 1–4 fill it;
5 and 6 go into the notification text or wait.

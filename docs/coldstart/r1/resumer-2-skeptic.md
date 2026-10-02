# Cold-start r1 — resumer 2 (skeptic lens)

Date: 2026-10-02 (local `date`: Fri Oct 2 14:05 CDT 2026). Page: HANDOFF #1. Lens: assume the page is stale; verify
every load-bearing claim by opening the file or running the read-only command.

## What I ran

| command | result |
|---|---|
| `node scripts/ship_state.mjs` | `ship_state: ROUND-DUE`; head `fada891` on main = origin/main, ahead 0 / behind 0; tree clean; gate PASS stamp at HEAD; CI success (run 37051610828); page #1, no cold-start on record (next r1). Exit 10. ROUND-DUE is this round (harness fact), so I proceed as if SHIPPED-CLEAN -> NEXT ACTION. |
| `node scripts/handoff_lint.mjs` | PASS (page #1, 56 lines) |
| `node scripts/check_paths.mjs` | PASS (18 docs, 0 dead paths) |
| `git log --oneline` | 7 commits, HEAD `fada891`; last two (`d10c813`, `fada891`) touch only the coldstart workflow, ship_state, pages.yml and TRAPS |
| `cat docs/STATUS.json` | `push_hold: false` |
| `curl` the Pages URL | 200, 12,280 B, `<title>Current Events Dashboard</title>` (placeholder is live) |
| `node --version` / `npm --version` | v26.3.0 / 11.16.0 (CI uses Node 22) |

## Load-bearing claims on HANDOFF.md, checked

| HANDOFF line | claim | verified against | holds? |
|---|---|---|---|
| 3-4 | GitHub `jst28323-art/current-events-dashboard`, public; placeholder site URL | `git remote -v`; curl 200 | yes |
| 4-5 | CLAUDE.md = contract (owner rules, push grant, polite polling) | CLAUDE.md | yes |
| 8, 12 | Phase 0 done; no product code yet | ROADMAP.md:16-21 all ticked; no `packages/`, `workers/`, `apps/` | yes |
| 11 | brief verbatim + F1-F12 in VISION | docs/VISION.md:7-47 | yes |
| 14-17 | DECISIONS covers budget, visibility, sources, alerts, transcripts, push grant, license, phone plan | D-001, D-002, D-009/D-017, D-012/D-023, D-010/D-018, D-011, D-014, D-015 | yes |
| 18-20 | ARCHITECTURE (CF Workers Free; Pages; home PC producer), EVENT_MODEL, SOURCES, DESIGN_LANGUAGE | each file | yes |
| 21 | six live-verified reports + SYNTHESIS, dated 2026-10-02 | `ls docs/research` (6 + SYNTHESIS) | yes |
| 23-24 | fixtures exist; recess until Nov 9 | fixtures/README.md; TRAPS.md:9; CFV report:13-14 | yes |
| 25-26 | harness scripts, cold-start workflow, `handoff` + `add-source` skills | `.claude/skills/*`, `scripts/*`, `.claude/workflows/coldstart-validate.js` | yes |
| 32-33 | ship_state fetches origin (`--no-fetch`), asks GitHub CI (`--offline`) | scripts/ship_state.mjs:8-12 | yes |
| 41-44 | ask (a) Cloudflare signup + API token as GH secret, (b) api.data.gov key; both ask-first | OWNER_GRANTS.md:21-23; ROADMAP.md:25-28 | yes |
| 46-48 | P1.2 scaffold layout as ROADMAP specifies; suites into `package.json` -> `gate.npmScripts` | ROADMAP.md:29-34; package.json `gate.npmScripts: []`; gate.mjs:73 | yes (but see defect D4: CI cannot run npm suites yet) |
| 49-50 | P2.3 Mon 2026-10-05 ~16:00-17:00 ET pro forma window | Oct 5 2026 is a Monday; CFV report:13-14 (House 16:30 ET, Senate 16:00 ET); LEG report:8-9 (Senate Oct 1 pro forma lasted 35 s) | yes (= 15:00-16:00 CDT local; sessions may last under a minute) |
| ROADMAP:33 | "Preact 11.0.0 only two days old; stay on 10.x" | SYNTHESIS.md:330 | yes (dated 2026-10-02; re-check) |
| ROADMAP:29 | "EVENT_MODEL v0.1 Phase-1 minimum" | EVENT_MODEL.md:69-71 | yes |
| ROADMAP:32 | design tokens in `site/index.html` | site/index.html:15-49 (light + dark CSS vars) | yes |

## (1) Anything AMBIGUOUS, CONTRADICTORY or STALE? (both sides quoted)

None of these change the first action. All but D9 are TREE-scoped.

- **D1 CONTRADICTION (TREE, MINOR): add-source skill restates the superseded third-party rule.**
  `.claude/skills/add-source/SKILL.md:12-13`: "third-party terms checked and recorded in `docs/DECISIONS.md` before
  ingesting; link out until then" vs `docs/DECISIONS.md:27` (D-017): "SUPERSEDES D-009's 'check terms first; link out
  until then' for these sources: ingest them now" and `docs/OWNER_GRANTS.md:36` (G-005). It bites in Phase 3/7
  (factbase, bno.pool, trumpstruth), not Phase 1.
- **D2 STALE (TREE, MINOR): SOURCES tier headers predate D-024.** `docs/SOURCES.md:13` "Tier 1 — build first
  (Phases 2–3)" vs `docs/ROADMAP.md:40-42` P1.4 builds Tier-1 `fr.api` and `wh.feeds` in Phase 1 (D-024,
  `docs/DECISIONS.md:34`).
- **D3 STALE (TREE, MINOR): wrong ROADMAP pointer.** `docs/SOURCES.md:5` "re-measure live (ROADMAP P3.4)" vs
  `docs/ROADMAP.md:82` P3.4 = Supreme Court; the latency harness is P3.6 (`docs/ROADMAP.md:84`).
- **D4 MISSING (TREE, MINOR, matters for P1.2): CI cannot run product suites yet.** `.github/workflows/ci.yml:17-23`
  is checkout + setup-node (22) + `node scripts/gate.mjs --ci`, with no `npm ci`; `scripts/gate.mjs:73` runs
  `npm run <s>` for each `gate.npmScripts` entry. HANDOFF.md:47-48 "Every new suite goes into package.json ->
  gate.npmScripts, and the gate stays green." The first P1.2 suite that needs devDependencies (TypeScript, Vitest,
  wrangler) goes red in CI unless the same commit adds an install step and a lockfile. Also CI is Node 22, local is
  Node 26.3.0: pin tool versions that work on both. Phase 1 exit (1) requires green "locally and in CI".
- **D5 AMBIGUOUS (TREE, MINOR): who may deploy a Cloudflare Worker.** `.claude/skills/add-source/SKILL.md:32`:
  "Gate, push, deploy (G-003)" vs `docs/OWNER_GRANTS.md:34`: G-003 only grants "Push to `main` without asking ..."
  (a push deploys Pages; nothing deploys Workers yet), and `docs/OWNER_GRANTS.md:4`: "Anything not granted here is
  ask-first." P1.3 (probe Worker) and P1.5 (Worker v0) need a deploy, so I would add that to the P1.1 question.
- **D6 AMBIGUOUS (TREE, MINOR): how the secrets get into GitHub.** `docs/OWNER_GRANTS.md:22-23`: "the owner pastes
  keys in, never into chat history that gets committed" does not say where. `docs/TRAPS.md:63-67` lists the local
  token's permissions (code, Workflows, Pages; no Administration, no Actions write) and does not mention "Secrets",
  so `gh secret set` may 403. The likely route is that the owner pastes into GitHub Settings -> Secrets -> Actions
  themselves. I would ask.
- **D7 MISSING (TREE, MINOR): no NEGATIVE/EMPTY fixtures for the two Phase-1 sources.** `fixtures/README.md:21,23`
  lists only the happy-path files for `wh.feeds` and `fr.api`. `.claude/skills/add-source/SKILL.md:18-19`: "Always
  include an error case ... and an empty / no-new-items case." `fixtures/README.md:5`: "Never edit a fixture by hand."
  P1.4 must record them live, and an empty PI `current.json` may need a weekend or holiday capture.
- **D8 STALE (TREE, NIT):** `fixtures/README.md:26` "supremecourt.gov RSS (... that needs an owner decision first)"
  vs `docs/DECISIONS.md:26` D-016 already decided "never `/rss/`".
- **D9 AMBIGUOUS (PAGE, MINOR, does not change the first action):** `HANDOFF.md:49` "P1.3 probe once the Cloudflare
  account exists, then P1.4–P1.6" makes P1.4 look as if it waits on P1.3. P1.4 is pure adapters on fixtures
  (`docs/ROADMAP.md:40-42`) and needs no account. If the owner defers the Cloudflare signup, can a session go
  P1.2 -> P1.4? I would assume yes. Relatedly, `HANDOFF.md:46` "start it even if the owner is away" sits oddly with a
  blocking AskUserQuestion. I read it as: ask first; if the owner says "not now", build P1.2.
- **D10 STALE (TREE, NIT):** `TESTING.md:47` "fixture files under each adapter's `fixtures/`" and `TESTING.md:55-56`
  "with the capture date in the filename" vs `fixtures/README.md:3`, whose layout is `fixtures/<source_id>/<YYYY-MM-DD>/<name>`
  (a repo-root directory with the date as a folder).
- **D11 AMBIGUOUS (TREE, NIT, touches P1.2 schema):** `docs/EVENT_MODEL.md:42` `"importance": { "tier": 1, ...}` vs
  the tier names `P0..P4` (`docs/EVENT_MODEL.md:118-124`, `docs/ARCHITECTURE.md:61` `tier=P0,P1`). Is it a number or
  a "P1" string? `importance` is outside the Phase-1 minimum, so it can wait. Also `docs/EVENT_MODEL.md:57`
  `"source_id": "senate.lis.vote_xml"` vs `docs/SOURCES.md:20` `senate.lis.votes`.
- **D12 STALE-ish (TREE, NIT):** `PROGRESS.md:50-51` says gate/push/Pages/cold-start "results are entry #2". No #2
  exists, and `d10c813` + `fada891` (the TRAPS token trap and the pages.yml change) landed after #1. This is expected
  while the round runs. The closing session owes entry #2.
- **D13 duplication (TREE, NIT):** `.claude/skills/add-source/SKILL.md:23` restates "the Worker free tier allows 10 ms
  of CPU", a number whose home is `docs/ARCHITECTURE.md:71` (CLAUDE.md docs discipline: one fact, one place).

## (2) Did anything tell me to do something HARMFUL (destructive, outward-facing without OK, or wasteful)?

**No PAGE-scoped harm.**
- Nothing destructive: pushes go only under G-003 with a `PUSH` verdict, and the hooks block force-push.
- The outward-facing steps are explicitly ask-first on the page: the Cloudflare signup, the api.data.gov key and the
  secrets (`HANDOFF.md:41-44`).
- P2.3 live fixture recording is a few polite GETs to public .gov endpoints, using the declared UA.
- Nothing re-does settled work: the page says not to re-ask what DECISIONS settles. The api.data.gov ask is not
  wasteful, because the P1.3 probe covers Tier 2 `congress.api`, which needs the key (`docs/SOURCES.md:39`).

**One TREE-level near-miss:** add-source step 7 (D5) reads as if G-003 lets a session deploy to Cloudflare without
asking. Nothing grants that. I would ask the owner for it in the same P1.1 question rather than assume it.

## First action

After orientation, my first action is the P1.1 ask from `HANDOFF.md:41-44`: one AskUserQuestion call (multiselect),
plus a PushNotification so the owner sees it on their phone. Development (P1.2 scaffold) starts after the answers.
P1.2 starts even if the owner declines the signups for now.

### What I would ask (one AskUserQuestion, multiselect where it fits)

1. **Cloudflare (P1.1a).** Situation: live data needs a free Cloudflare account. Will you do the free signup now, with
   me walking you through it? Will you create a Workers-only API token and store it, with the account id, as GitHub
   Actions secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`? Options: now / later today / not this session.
   Cost $0. Reversible: the token can be revoked.
2. **api.data.gov key (P1.1b).** Same question for the free key, stored as `API_DATA_GOV_KEY`. It is used by the
   probe for Congress.gov, and later by the Worker. Options: now / later / not this session.
3. **How the secrets get in (D6).** You paste the keys into GitHub Settings -> Secrets yourself (recommended: they
   never pass through chat), or you give my GitHub token "Secrets: write". The second is a GitHub settings change, so
   it is ask-first.
4. **Cloudflare deploys (D5).** May sessions deploy the probe Worker and the live Worker to your Cloudflare account
   without asking each time, on the same terms as the push grant (only after a passing gate)? Or should each deploy be
   asked first?
5. **Monday Oct 5, 3–4 pm your time (4–5 pm ET).** Both chambers hold seconds-long pro forma sessions. Will a session
   be running then to record live fixtures (ROADMAP P2.3), or should we skip it?

Not asked, because the repo settles it: budget (D-001), visibility (D-002), allowed sources (D-009/D-017), alerts
(D-012/D-023), license (D-014), phone plan (D-015), Pages vs Worker address (D-013: build session decides), phase
order (D-024).

## Verdict

PASS-WITH-NOTES. The page routes correctly and every load-bearing claim re-derives from the repo. The defects are
TREE backlog. D4 (CI has no install step) and D7 (no NEGATIVE/EMPTY fixtures for fr.api/wh.feeds) will bite inside
Phase 1, and D5/D6 belong in the P1.1 question.

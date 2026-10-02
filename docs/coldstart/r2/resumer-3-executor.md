# Cold-start r2 — resumer 3 (executor lens)

Date: 2026-10-02 (Fri, ~14:44 CDT). Read-only sandbox. Prompt: the canonical resume prompt.

## Orientation path (what I read, in order)

HANDOFF.md -> ship_state -> CLAUDE.md -> docs/ROADMAP.md -> docs/DECISIONS.md (whole) -> docs/OWNER_GRANTS.md ->
docs/STATUS.json -> MAP.md -> docs/TRAPS.md -> PROGRESS.md -> HANDOFF_ARCHIVE.md, KNOWN_FAILING.md, README.md ->
docs/HANDOFF_PROCEDURE.md -> .claude/skills/handoff/SKILL.md -> TESTING.md -> .claude/skills/add-source/SKILL.md ->
fixtures/README.md (+ listing) -> docs/EVENT_MODEL.md -> docs/ARCHITECTURE.md -> docs/SOURCES.md (Tier 1) ->
docs/research/SYNTHESIS.md (header, section 5, section 8) -> docs/VISION.md -> scripts/gate.mjs, .github/workflows/*,
.claude/settings.json -> docs/coldstart/r1/RESULT.json (backlog, to see what r1 flagged and whether it was fixed).

## Ship state (observed)

    node scripts/ship_state.mjs
    ship_state: ROUND-DUE
      head: b5dcb44 on main · origin/main: b5dcb44 · ahead 0 · behind 0
      tree: clean
      gate: PASS stamp at HEAD · last run PASS at b5dcb44
      ci:   success
      page: HANDOFF #1 · cold-start: r1 validated an earlier text of page #1; the page changed since (next round r2)

ROUND-DUE is this round (sandbox property), so I treat it as SHIPPED-CLEAN and go to NEXT ACTION.
`node scripts/handoff_lint.mjs` -> PASS (page #1, 59 lines). core.hooksPath = enforcement/git-hooks; git user =
jst28323-art / jst28323@gmail.com (matches CLAUDE.md). Local node v26.3.0, npm 11.16.0.

## First action (time to a runnable first action: fast; the page names it directly)

HANDOFF.md:39-46 NEXT ACTION step 1: one AskUserQuestion call (multiselect where it fits) plus a PushNotification,
asking every question ROADMAP P1.1 lists (docs/ROADMAP.md:25-31):
1. Cloudflare free signup now (walked through) + a Workers-scoped API token and account ID, which the owner pastes into
   GitHub Settings -> Secrets as CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (ROADMAP:27-28 settles that the owner
   pastes them; I would not re-ask the route).
2. api.data.gov free key -> secret API_DATA_GOV_KEY (Phase 1's FR/WH sources need no key; the P1.3 probe of Congress.gov does).
3. May sessions deploy Workers to that account when the gate passes (Cloudflare analogue of G-003)?
4. Which *.workers.dev subdomain?

Then, without waiting on the owner (HANDOFF.md:47-49, ROADMAP:30-31): P1.2 scaffold. My first shell commands would be
version checks before pinning, e.g. `npm view preact@10 version`, `npm view vitest version`,
`npm view @cloudflare/vitest-pool-workers version`, `npm view wrangler version`, `npm view vite version`,
`npm view typescript version`, `npm view @preact/signals version`, then the workspace layout
(packages/schema, packages/adapters, workers/api, apps/web), root package.json `workspaces`, gate.npmScripts, and a
committed package-lock.json.

could_execute without asking: yes (the first action IS the ask; P1.2 needs no account).

## What I would ask (one AskUserQuestion call; plus PushNotification)

1. Cloudflare (free, $0): sign up now with me walking you through it, then paste a Workers-edit API token and your account
   ID into GitHub Settings -> Secrets (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)? Options: now / later today / not
   yet (I build offline first: P1.2 scaffold + P1.4 adapters).
2. api.data.gov key (free): sign up now and paste it as API_DATA_GOV_KEY? Only the P1.3 probe (Congress.gov) needs it in
   Phase 1. Options: now / with Cloudflare / later.
3. Worker deploys: may sessions deploy Workers (the P1.3 probe and P1.5 Worker v0; public *.workers.dev URLs, free,
   deletable) without asking when the gate passes, and by which route: a GitHub Actions workflow that deploys after CI
   passes (like Pages; uses the secrets above; my recommendation) vs a local `wrangler login` on your PC? Or ask each time?
4. Which *.workers.dev subdomain (it becomes part of the public API address)? Any preference / let me pick.
5. (Would need a 5th question or a merge, see GUESS 5) Mon 2026-10-05 16:00-17:00 ET pro forma window (ROADMAP P2.3):
   will a session be open then to record live fixtures, or skip it?

## Every point where I had to guess (executor lens)

- GUESS 1 — Worker deploy route. ROADMAP P1.1 puts the Cloudflare token only in GitHub Actions secrets, but no doc says how
  a Worker gets deployed: there is no deploy workflow (.github/workflows has ci.yml + pages.yml only; ci.yml:8-9
  `permissions: contents: read`), and `grep -rn wrangler` over the docs finds only ARCHITECTURE.md:54 and ROADMAP.md:34
  (config / test pool). If the token lives only in Actions, P1.3 needs a new workflow; if deploys are local, the token or a
  `wrangler login` must exist on the PC. I would fold the route into question 3. Does not change the first action.
- GUESS 2 — Which package.json gets "every new suite" (HANDOFF.md:48-49). scripts/gate.mjs:79-82,87 reads only the ROOT
  package.json for both gate.npmScripts and the "ungated test/build script" check. With npm workspaces, a workspace's own
  `test` script that the root never calls is neither run nor flagged (fail-open). I would make root scripts fan out
  (`npm run test --workspaces --if-present` etc.) and list those root names in gate.npmScripts.
- GUESS 3 — What a NEGATIVE fixture should return in P1.4 golden tests: `[]`, or `[system.source_health drift event]`?
  See defect D2.
- GUESS 4 — Node target. CI runs Node 22 (.github/workflows/ci.yml:21), local is v26.3.0, package.json engines `>=22`.
  No doc says which to pin tool versions against; I would target 22 compatibility (CI is the gate of record) and run the
  local gate on 26.
- GUESS 5 — AskUserQuestion capacity. HANDOFF + CLAUDE.md say ONE call; P1.1 already has four questions. If the tool caps
  questions per call at four (my recollection, unverified here: the tool is not available in this sandbox), the P2.3 Monday
  question needs merging into another question or a second call.
- GUESS 6 — "Walk the owner through it": no doc gives the Cloudflare token recipe (which template/permissions for Workers +
  Durable Objects). I would use Cloudflare's "Edit Cloudflare Workers" template and check current docs first.

## (1) AMBIGUOUS / CONTRADICTORY / STALE (both sides quoted)

- D1 (MINOR, AMBIGUOUS, PAGE) Worker deploy route unspecified.
  HANDOFF.md:44 "whether sessions may deploy Workers when the gate passes" + docs/ROADMAP.md:26-27 "stored as GitHub
  Actions secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`" vs .github/workflows/ (ci.yml, pages.yml only) and no doc
  naming `wrangler deploy` or a deploy workflow. Does not change the first action; it changes how question 3 is worded and
  what P1.3 must build.
- D2 (MINOR, AMBIGUOUS, TREE) NEGATIVE-fixture output.
  .claude/skills/add-source/SKILL.md:24-25 "on unexpected structure, emit a `system.source_health` drift event and publish
  nothing from that payload" (and :26-27 "the error and empty fixtures produce no events and the right health signal") vs
  docs/ROADMAP.md:58 "every NEGATIVE fixture emits zero events" and docs/EVENT_MODEL.md:111 "system | `system.source_health`"
  (listed as an event type). Is the health signal an Event in the adapter's `Event[]` return, or a separate channel? P1.4's
  tests and the P1.2 adapter registry type depend on the answer. Agent can decide (record a D-row): health on a separate
  return field, `events: []`.
- D3 (MINOR, MISSING, TREE) Gate check is root-only (fail-open for workspaces). scripts/gate.mjs:79-82 `ungatedScripts(pkg)`
  over root `pkg.scripts` only; gate.mjs:87 `readJson('package.json')`. vs HANDOFF.md:48-49 "Every new suite goes into
  `package.json` → `gate.npmScripts`" (which package.json, once there are five?).
- D4 (NIT, STALE, TREE) MAP.md:47 "Cold-start validation records | `docs/coldstart/r<R>/RESULT.json` (planned until the first
  round lands)" vs docs/coldstart/r1/RESULT.json exists (round r1 landed; PROGRESS.md:19).
- D5 (NIT, TREE) docs/ARCHITECTURE.md:86-87: the "Long-term archive" table row is split across two lines (line 87 starts
  with two spaces, not `|`), so in GFM the R2 payment-method caveat renders as a separate row under the "question" column
  and the original row's "decided by" cell is empty.
- D6 (NIT, AMBIGUOUS, TREE) docs/OWNER_GRANTS.md:25-26 "the owner pastes keys in, never into chat history that gets
  committed" vs docs/ROADMAP.md:27-28 "keys never pass through chat". The weaker wording could be read as allowing a key in
  an uncommitted chat. The stricter one governs; harmless.
- D7 (NIT, AMBIGUOUS, TREE) Node version target: .github/workflows/ci.yml:21 `node-version: 22` vs local v26.3.0 and
  docs/TRAPS.md:83-84 (a Node 26 behaviour difference already bit once). P1.2 "check current versions and pin them"
  (ROADMAP:35-36) does not say against which Node.

Checked and found consistent (r1 backlog items now fixed): TESTING.md fixture layout (TESTING.md:12,21 =
fixtures/README.md:3); add-source third-party rule now cites D-017 (SKILL.md:12-14); SOURCES Tier 1 heading says Phase 1
for fr.api/wh.feeds (SOURCES.md:13); SOURCES re-measure pointer is P3.6 (SOURCES.md:5); fixtures/README SCOTUS line cites
D-016 (:26); CI runs `npm ci` when a lockfile exists (ci.yml:22-24, matches ROADMAP:37-38); CLAUDE.md now qualifies the
hooks by launch directory; PROGRESS #2 exists; SYNTHESIS section 8.2 is annotated as superseded (SYNTHESIS.md:9-12,
:566-568); EVENT_MODEL uses P0..P4 and `senate.lis.votes`. Every HANDOFF factual claim I checked re-derives (six reports +
SYNTHESIS; Phase 0 ticked; no packages/ dir; DECISIONS covers budget/visibility/sources/alerts/transcripts/push
grant/license/phone plan; ship_state flags --no-fetch/--offline exist; skills exist at the named paths).

## (2) HARMFUL instructions?

None found. Checked: pushes only under G-003 with a gate stamp (and ship_state PUSH); Worker deploys, accounts and secrets
are ask-first and the page says so; secrets are pasted by the owner, never through chat; P2.3 live recording is polite
fetching of public .gov pages with the recorder script (which refuses credential-like URL params); the page tells me not
to re-ask settled decisions, and the superseded SYNTHESIS questions (including the permission emails) are marked "do not
re-ask / do not draft". No destructive step anywhere in the route. The end-of-session cold-start round costs agent runs but
is the owner's standing procedure (CLAUDE.md directive 6), not waste.

## Verdict

PASS-WITH-NOTES. Routing is unambiguous: first action = the P1.1 AskUserQuestion (+ PushNotification), then P1.2 scaffold.
All defects are MINOR/NIT; only D1 sits on the page, and it does not change the first action.

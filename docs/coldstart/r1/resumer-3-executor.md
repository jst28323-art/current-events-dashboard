# Cold-start round r1, resumer 3 (lens: executor)

Date: 2026-10-02. Prompt: the canonical resume prompt only, plus harness facts. Read-only sandbox.

## Orientation path taken

1. `HANDOFF.md` (56 lines), then `CLAUDE.md`, then `docs/ROADMAP.md`, as the page says.
2. `node scripts/ship_state.mjs` (harness Bash, repo dir). Output:
   - `ship_state: ROUND-DUE`
   - `head: fada891 on main · origin/main: fada891 · ahead 0 · behind 0`
   - `tree: clean`, `gate: PASS stamp at HEAD`, `ci: success` (run 37051610828)
   - `page: HANDOFF #1 · cold-start: none on record (next round r1)`
   - ROUND-DUE is this round in progress (sandbox property). I treated it as SHIPPED-CLEAN and went to NEXT ACTION.
3. Also ran the read-only checks: `node scripts/handoff_lint.mjs` gave PASS (page #1, 56 lines);
   `node scripts/check_paths.mjs` gave PASS (18 docs, 0 dead paths).
4. Read: `docs/DECISIONS.md` (all of D-001 to D-024), `docs/OWNER_GRANTS.md`, `docs/STATUS.json` (`push_hold: false`),
   `MAP.md`, `docs/TRAPS.md`, `PROGRESS.md`, `TESTING.md`, `docs/VISION.md`, `docs/EVENT_MODEL.md`,
   `docs/ARCHITECTURE.md`, `docs/SOURCES.md`, `fixtures/README.md`, both skills, `docs/HANDOFF_PROCEDURE.md`,
   `scripts/gate.mjs`, `.github/workflows/{ci,pages}.yml`, `package.json`, SYNTHESIS §5 and §8, and the version table
   in `docs/research/architecture_hosting_frontend.md`.
5. Environment: node v26.3.0, npm 11.16.0. `core.hooksPath` = `enforcement/git-hooks` (already set).
   git user = `jst28323-art`.

Time from opening the page to a runnable first action: short. The NEXT ACTION is a numbered list, and step 1 is
concrete.

## First action

**HANDOFF.md:38-45, NEXT ACTION step 1.** Make ONE AskUserQuestion call (multiselect where it fits) plus a
PushNotification. It asks the two P1.1 account questions: (a) the free Cloudflare signup now, plus a Workers-edit API
token and account ID as GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; (b) the free
api.data.gov key as `API_DATA_GOV_KEY`. This comes first for two reasons. The canonical prompt says to ask before
development. And account creation and adding secrets are ask-first every time (`docs/OWNER_GRANTS.md:21-23`).

D-003 (`docs/DECISIONS.md:13`) already says the owner can plan around both accounts. So the question is "sign up NOW
and allow the secrets?", not "may we use Cloudflare?". D-003 itself says "Signups happen only when a session needs
them, walked through with the owner", so this does not re-ask a settled question.

**Then, without waiting for answers (HANDOFF.md:46-48, ROADMAP P1.2):** check current versions before pinning anything:

    npm view preact@10 version ; npm view @preact/signals version ; npm view vite version ; npm view vitest@4 version
    npm view @cloudflare/vitest-pool-workers version peerDependencies ; npm view wrangler version ; npm view typescript version

Then scaffold the npm workspaces `packages/schema`, `packages/adapters`, `workers/api` and `apps/web`, and add each suite
to `package.json` → `gate.npmScripts`.

## Could I execute without asking? YES

Step 1 is the ask itself, and the page names exactly what to ask. Step 2 needs no account and no owner input
(`HANDOFF.md:46`, `ROADMAP.md:28`).

### What I would ask (one AskUserQuestion, multiselect, plus a PushNotification)

1. Cloudflare (free, $0): will you create the account now, with me walking you through it? Then create an API token
   limited to editing Workers, and add it and your account ID as GitHub secrets. Options: now / later today / not yet,
   build offline first. Reversible: the token can be revoked. Outward-facing: it creates an account in your name.
2. api.data.gov key (free): same choice. Phase 1's two sources (Federal Register, White House) need no key. The P1.3
   probe of Congress.gov does.
3. How the secrets get into GitHub. Option one: you paste them yourself in GitHub → Settings → Secrets (never in chat).
   Option two: you give the local token "Secrets: write" so I can run `gh secret set` while you paste into the
   terminal. `docs/TRAPS.md:63-67` lists the token's permissions but does not say whether it has Secrets.
4. Cloudflare asks for a `*.workers.dev` subdomain at signup, and that name becomes part of the public API address.
   Do you have a preference, or should I suggest one like `current-events-dashboard`?
5. (Optional) Mon 2026-10-05, 16:00–17:00 ET pro forma window (ROADMAP P2.3). Do you want a session open then to record
   live fixtures, for example one you start by hand?

I would NOT ask about any of these, because DECISIONS settles them: budget, visibility, sources allowed, Supreme Court
pages, third-party terms, transcript retention, default view, the administration list, lower courts, follows, quiet
hours, push grant, license, or phone plan.

## Points where I had to guess (executor lens)

These are all P1.2 build details. None blocks the first action.

- **CI has no install step.** `.github/workflows/ci.yml:18-23` runs `node scripts/gate.mjs --ci` straight after
  setup-node. There is no `npm ci`, and the repo has no lockfile yet. Once P1.2 puts entries in `gate.npmScripts`, CI
  will fail unless ci.yml installs dependencies. No page or roadmap line says this. My guess: add `npm ci` (with a
  committed `package-lock.json`) to ci.yml in the same commit as the first `gate.npmScripts` entry.
- **Where fixtures live.** `TESTING.md:12` says "fixture files under each adapter's `fixtures/`", and `TESTING.md:20-21`
  says "record real upstream responses ... into the adapter's `fixtures/`". Four other places say the top-level folder:
  `fixtures/README.md:3` (`fixtures/<source_id>/<YYYY-MM-DD>/<name>`), `.claude/skills/add-source/SKILL.md:18`,
  `docs/ARCHITECTURE.md:53` ("tests replay `fixtures/<source_id>/…`") and `ROADMAP.md:30` ("a harness that replays
  `fixtures/`"). My guess: top-level `fixtures/`, as the majority says.
- **Which test runner for schema and adapters.** `TESTING.md:12` says "`node:test`/Vitest". The Workers pool needs
  Vitest 4.x (`architecture_hosting_frontend.md:156`). My guess: Vitest 4.x everywhere, so there is one runner.
- **JSON Schema validator library.** Nothing in the repo picks one, and nothing in TRAPS covers it. From general
  knowledge, not verified here: Ajv's default compile uses `new Function`, and Cloudflare Workers block that. That
  matters once the HubDO or `/ingest` validates inside the Worker (P1.5). Options are a precompiled (standalone)
  validator or a Workers-safe library. This should become a TRAPS entry after someone verifies it.
- **Which comes first, the JSON Schema or the TS types?** `EVENT_MODEL.md:3` says "TypeScript types plus a JSON
  Schema" and does not say which one is generated from the other. My guess: write the JSON Schema by hand, derive the
  types from it, and validate the EVENT_MODEL example in a test.
- **Order of P1.3 and P1.4 if Cloudflare is deferred.** `HANDOFF.md:49` says "P1.3 probe once the Cloudflare account
  exists, then P1.4–P1.6". `ROADMAP.md:35` marks only P1.3 as "(needs P1.1)". The P1.4 adapters are pure functions
  tested on fixtures and need no account. My guess: if the owner defers Cloudflare, go P1.2 → P1.4 → P1.3.

## (1) Anything AMBIGUOUS, CONTRADICTORY or STALE? (both sides quoted)

- **AMBIGUOUS, page, minor: whether P1.4 waits for P1.3.** `HANDOFF.md:49`: "P1.3 probe once the Cloudflare account
  exists, then P1.4–P1.6". `docs/ROADMAP.md:35`: "**P1.3 Probe Worker** (needs P1.1)". P1.4 itself has no dependency
  (`ROADMAP.md:40-42`). It does not change the first action.
- **CONTRADICTION, tree, minor: fixture location.** Quoted above: `TESTING.md:12` and `:20-21` against
  `fixtures/README.md:3`, `add-source SKILL.md:18`, `ARCHITECTURE.md:53` and `ROADMAP.md:30`.
- **STALE, tree, minor: SYNTHESIS §8 still lists settled questions as open.** `docs/research/SYNTHESIS.md:9-10` says
  "Owner rulings live in DECISIONS.md (D-001 to D-015). ... §8 lists only what is still open". `SYNTHESIS.md:562`
  "### 8.2 Still open" lists Supreme Court feeds, third-party permission (it recommends drafting permission emails and
  "show link-outs only"), transcript retention, the administration list, noisy defaults (it recommends hiding routine
  items), follows, lower courts and quiet hours (it recommends silencing at night). Against that,
  `docs/DECISIONS.md:26-33` settles all of these as D-016 to D-023. Three of them go AGAINST the synthesis
  recommendation: D-017 ingest now, D-019 show everything, D-023 any hour. `MAP.md:24` says to start research with
  SYNTHESIS. `HANDOFF.md:14-15` ("Read the whole file before asking anything") mitigates the risk.
- **STALE, tree, minor: wrong ROADMAP pointer.** `docs/SOURCES.md:5` says "re-measure live (ROADMAP P3.4)", but
  `docs/ROADMAP.md:82` P3.4 is the Supreme Court. The latency harness is P3.6 (`ROADMAP.md:84`).
- **STALE, tree, nit: tier heading predates D-024.** `docs/SOURCES.md:13` says "Tier 1 — build first (Phases 2–3)".
  But `docs/ROADMAP.md:40-42` builds the Tier 1 sources `fr.api` and `wh.feeds` in Phase 1, per D-024
  (`DECISIONS.md:34`).
- **STALE, tree, minor: add-source skill predates D-017.** `.claude/skills/add-source/SKILL.md:12-13` says
  "third-party terms checked and recorded in `docs/DECISIONS.md` before ingesting; link out until then".
  `docs/DECISIONS.md:27` (D-017) and `docs/OWNER_GRANTS.md:36` (G-005) say to ingest Factba.se, BNO and the Truth
  Social archive now, without a terms check. This is not relevant until Phase 3 or 7.
- **NIT, tree: example source_id does not match the catalog.** `docs/EVENT_MODEL.md:57` uses
  `"source_id": "senate.lis.vote_xml"`. The catalog id is `senate.lis.votes` (`docs/SOURCES.md:20`,
  `fixtures/README.md:17`). It matters if P1.2 copies the example into a schema test.
- **NIT, tree: who turned Pages on.** `docs/TRAPS.md:64-66` says the token cannot change repo settings "such as
  turning Pages on; the owner did that by hand". `docs/OWNER_GRANTS.md:33` G-002 and `docs/DECISIONS.md:16` D-006 say
  the grant was "used 2026-10-02". This is historical only.
- **NIT, tree: PROGRESS #1 is missing its promised follow-up.** `PROGRESS.md` (entry #1, last bullet of "How
  verified") says "The gate, the first push, the Pages deploy and the cold-start round happen after this entry is
  committed; their results are entry #2." There is no entry #2, and commits d10c813 and fada891 are not logged. This is
  expected while this round is running; the authoring session still owes it.

## (2) Anything HARMFUL (destructive, outward-facing without OK, or wasteful)?

**Nothing on the page's route.** Step 1 asks before creating any account or secret. Step 2 is local scaffolding.
Pushes are covered by G-003, and only when `ship_state` says PUSH. `pages.yml` still deploys `site/`, so a scaffold
push does not change what the public sees. P2.3 is polite fetching of public pages.

There is one indirect risk, and it is off the route. If a resumer treats SYNTHESIS §8.2 as live, it could re-ask the
owner eight settled questions (wasteful). Worse, it could act on recommendations the owner overruled: draft permission
emails or show link-outs only (against D-017), hide routine items (against D-019), or add quiet hours (against D-023).
HANDOFF.md:14-15 guards against this, so I file it as a tree-scoped stale item, not as harmful.

## Verdict

PASS-WITH-NOTES. The route is unambiguous: ask the P1.1 questions in one AskUserQuestion call with a PushNotification,
then start the P1.2 scaffold right away. HEAD is fada891. Every defect is tree-scoped or a minor page ambiguity that
does not change the first action. The executor-relevant gap is that CI has no `npm ci` step. It will bite on the first
P1.2 push.

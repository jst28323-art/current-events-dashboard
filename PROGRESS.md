# PROGRESS — what happened, and how it was verified (newest first, append-only)

Each entry: what changed · how it was verified (commands + results) · what failed · corrections. Never rewrite an old
entry; correct it with a new one. Rotate the oldest entries to `PROGRESS_ARCHIVE.md` at ~500 lines.

---

## #5 — 2026-10-03 — Phase 1 polish (D-046): whole daily FR issues, WebKit e2e, HubDO fast path, one order rule

**Asked for:** the owner chose "Keep polishing Phase 1" (D-046) over wrapping up or starting Phase 2 early.

**Built** by a three-way workflow (build, adversarial review, fix with a regression test per confirmed finding; 11
findings, all fixed or recorded), then integrated by the orchestrator:
- fr.api O1 closed (D-047): `documents_newest` reads a whole daily issue in one page on its own cadence
  (`Endpoint.cadence`), sized on every FR issue since 1994 (fixture `fixtures/fr.api/2026-10-03/facets_daily_since_1994.json`);
  review R1 caught that the first size (300) missed the 2024-12-30 record. Open: review R2 (the overflow note lasts one
  poll; at this page size it should never fire).
- Worker (D-049, D-050): per-endpoint cadence, budget and staleness; the HubDO skips the full validator for an event
  identical to its stored, validated copy (local wall only, numbers in D-050; Cloudflare CPU still unmeasured).
- Web (D-051..D-054): WebKit phone and desktop projects (every exit-criterion test on both engines), contrast decoded in
  Node, light secondary text slightly darker, an opaque header where the blur is not painted.

**Orchestrator integration** (each with a test that fails without it; mutation-checked where marked):
- The bigger FR page would have put ~480 week-old documents on top as "first seen": one shared order key
  (`packages/schema/src/order.ts`, D-048) used by the Hub and the page; such rows show "published Sep 30" (a date,
  never a time). Mutation-checked in the Hub.
- `validateEvent` never throws (the library threw on an undefined member; review fuzz). Mutation-checked.
- The fast-path fingerprint now names the validation library and version (`VALIDATOR_ID`, pinned by a schema test;
  found by the docs critic).
- Harness: the secret scan failed ENOBUFS on ~1.5 MB of unpushed fixtures (spawnSync's 1 MB buffer): `maxBuffer`
  raised, regression test added. e2e: one intermittent gate failure (WK4, Chromium desktop) passed 64/64 in isolation
  and in a full rerun; its text was lost to the 25-line gate log, so local runs now also write `scratch/e2e-last.json`,
  and screenshots retry only Chromium's "Unable to capture screenshot" error (unit-tested).

**Verified:** gate PASS before each push (now incl. WebKit e2e locally); CI green with WebKit (install + gate about
2.5 min). Deployed 2026-10-03 ~04:23Z; both sources ok afterwards, and the feed caught a new White House post on its
own (03:01Z). The first fetch of the big FR page waits for its hourly overnight cadence (see #6 or the next session).

**What failed / corrections:** I launched the previous docs workflow script unedited by mistake (it would have
re-applied round-1 changes); stopped within seconds, tree verified clean, then ran the right one. A docs critic again
caught duplicated numbers (3) and a code-side gap (the fingerprint).

---

## #4 — 2026-10-02/03 — Phase 1 built, deployed and live on the owner's phone (exit criteria 3 and 5 need time)

**Owner answers** (asked in four AskUserQuestion rounds, each with a push notification): D-025..D-028 (both signups,
auto-deploy after CI, subdomain `usgovfeed`, Monday capture), D-031..D-033 (cloud test, probe deploy, capture moved to
the home PC), D-044 (phone check), D-045 (one alert per EO). Grants G-006..G-011. The owner created the Cloudflare and
api.data.gov accounts and added the three secrets (walkthrough artifact: claude.ai/artifact/3tfFpfAFLX1d8VShdzbBjj).

**Built** (commits: scaffold, build, docs, titles, live; each pushed only after a gate PASS):
- P1.2 scaffold: npm workspaces, TS 7, Vitest 4 projects incl. workerd via `@cloudflare/vitest-plugin` (the renamed
  pool), pins D-029, schema v0.1 additions D-030, the read-API contract in `packages/schema/src/api.ts`.
- P1.3/P1.4/P1.5/P1.6 by a five-way workflow: each component built, adversarially reviewed (45 findings), fixed with a
  regression test per reproduced finding; then integrated by the orchestrator. A second workflow applied ~80 doc
  changes and a docs critic checked every claim against the code (D-034..D-042).
- Orchestrator integration fixes, each with a test that fails without it (mutation-checked): main-module plain export
  (workerd refuses to start; found by the probe builder), stale vs the night cadence, the FR body echoing the
  cache-buster, WH-5 merge lead + alias accumulation (without the alias change every later poll would have revised),
  the "posted" order key, page/Hub tie order, MedPAC branch (FR-8), titles that repeated official_text (D-043; seen on
  the first live page), an e2e clock race (CI failure on 6dd6cf5; not reproduced locally in 264 stress runs, fixed by
  making the page report a settled poll).

**Verified:** gate PASS before every push (typecheck, 26 vitest files / 507+ tests incl. workerd, build, Playwright 58
passed + 2 skipped by design); CI green except 6dd6cf5 (above; nothing deployed from it). The real ced-api bundle ran
in plain Miniflare (no test-plugin flags): starts, ingests 157 fixture events, validates without eval. Live:
ced-api deployed 2026-10-03 00:49Z, first poll 00:53Z: fr.api ok (108 PI documents), wh.feeds ok (30 items), 157
events; the public page renders them (Playwright screenshot at 390x844, light and dark) and the owner checked it on
an iPhone over cellular (D-044). ced-probe deployed; run 1 at 01:01Z reached 10 of its group-1 sources (all 200);
alarm jitter so far median 24 ms, max 89 ms (n=25).

**Monday:** the cloud routine was disabled after its smoke run proved the cloud sandbox gets HTTP 403 from every .gov
host (and the push guard refuses side branches; TRAPS). A Windows scheduled task ("CED pro forma capture 2026-10-05")
runs `scripts/capture_task.cmd` Mon 14:45 CT, logs to `scratch/capture_task.log`, writes `fixtures/*/2026-10-05/`
(uncommitted) and deletes itself; a same-session test task proved the scheduler path (headless, all 5 targets ok).

**What failed / corrections:** the first smoke check reported the blocked cloud run as "every host answered" (it
counted any HTTP status as reachable): fixed to fail closed on a 403. The account-setup page first promised that I
could see secret names; the token cannot (403), so the page was corrected. The first live page showed every FR/WH
title twice (D-043). Published FR documents carry only a date, so on the first (backfill) poll they sort as "first
seen" at deploy time: truthful, a one-time artifact; not hidden by an invented time.

**Open:** Phase 1 exit (3) needs Mon-Tue live polling; exit (5) needs the probe's 48 runs; W10 (HubDO CPU on a full
re-ingest) unmeasured on Cloudflare; FR documents_newest covers ~20% of each issue (O1); WebKit not in e2e;
`API_DATA_GOV_KEY` unused so far. The disabled cloud routine still exists (only the owner can delete it, at
claude.ai/code/routines).

---

## #3 — 2026-10-02 — cold-start r2 PASS on the final page; session closes

**Cold-start round r2** (page #1 as pushed after the hardening; `docs/coldstart/r2/`, tree untouched while it ran):
routing PASS (3/3 resumers named the same first action: one multiselect AskUserQuestion + PushNotification with the
ROADMAP P1.1 questions), content PASS (0 false claims). `node scripts/ship_state.mjs` had correctly refused r1 for the
edited page ("r1 validated an earlier text of page #1").

**r2 backlog fixed in the tree** (TREE-scoped, so no re-round; HANDOFF.md itself unchanged): HANDOFF_PROCEDURE and the
handoff skill now say rounds key on the page text, not the number; ROADMAP P1.1 asks HOW Workers get deployed (deploy
workflow vs `wrangler login`) and records answers in DECISIONS + grants in OWNER_GRANTS; P1.2 notes the Vitest pin, the
all-four-directories rule and Node 22 (CI) vs 26 (local); P1.3 skips sources whose keys aren't granted; the gate now
also fails on workspace test/build scripts that no gated root script runs (harness tests 47 → 48); a split ARCHITECTURE
table row, a stale MAP row and more SYNTHESIS notes superseded by D-017/D-024 were fixed.
Left as leads (PAGE-scoped, minor, first action unaffected): the page restates ROADMAP P1.1's question list in short
form; AskUserQuestion blocks, so "start P1.2 even if the owner is away" applies after the owner has answered or declined.

---

## #2 — 2026-10-02 — first push, Pages live, cold-start r1, adversarial reviews, harness hardening

**Shipped:** the public repo `jst28323-art/current-events-dashboard` (G-001) and the Pages site
<https://jst28323-art.github.io/current-events-dashboard/> (G-002). Verified: `curl` of the site → 200 with
`<title>Current Events Dashboard</title>`; the `ci` and `pages` workflow runs on the pushed commit both succeeded.

**What failed on the way (all now in `docs/TRAPS.md`):** the first push was rejected because the local token lacked the
"Workflows" permission (the owner added it); turning Pages on needs "Pages" AND "Administration: write" on the token,
so the owner set the Pages source by hand; `gh workflow run` fails (no "Actions: write"); the Pages path filter skipped
the first deploy. Separately, this PC took 4–11 s to start any process this afternoon, so the gate took minutes.

**Cold-start round r1** (page #1 at the pushed commit; `docs/coldstart/r1/`): routing PASS (3/3 resumers named the same
first action), content FAIL on one false sentence (SHIP STATE said every other verdict prints "one command"; several
print instructions). Fixed and recorded as CONTENT-FIXED. The resumers' backlog (stale cross-references after
D-016…D-024, the fixture layout in TESTING.md, no Cloudflare deploy grant, CI without `npm ci`) was fixed in the tree.
Caveat: the tree was being edited while r1 ran, so its resumers read a moving tree; r2 runs on a still tree.

**Adversarial harness review** (2 skeptics, every finding reproduced in a throwaway clone with a fake remote) found real
bugs, all fixed with a test that replays the repro (harness tests 33 → 47):
- push_guard let any command containing ` -n` (e.g. `| tail -n 5`) through unchecked, force pushes included → rewritten
  to parse each command segment and allow only `git push [-u] origin main`; fails closed on any error; PowerShell hooked too.
- the gate's tracked-secrets check could never fire (`git grep` read the pattern as an option) → fixed with `-e`, fails
  closed on git errors, scans unpushed history too; one shared pattern file `enforcement/secret-patterns.txt` for the gate
  and the pre-commit hook (which also lacked the Anthropic-key shape).
- ship_state said PUSH on a non-main branch, said SHIPPED-CLEAN after an ungated push, and accepted a round by page number
  even after the page was edited → OFF-MAIN-STOP, PUSHED-UNVERIFIED-STOP / CI-PENDING-WAIT, rounds keyed on the page's
  blob, SETUP-ERROR until git hooks are enabled, stale gate locks recovered.
- the git pre-push hook now refuses updating main to a commit without a gate stamp and deleting any remote branch, so the
  core rule holds even when Claude Code's own hooks don't fire (launch from the parent directory).
- the gate now fails if HEAD or the tree changed while it ran, discovers tests recursively, and fails on an ungated
  test/build script; the cold-start workflow no longer counts a resumer that never saw HEAD, a resumer FAIL, or a
  PAGE-scoped FATAL as passing, and writes notes to gitignored `scratch/` during the round; Pages deploys only after CI
  passes; `record_fixture` refuses any credential-like URL parameter.

**Docs critic** (cross-document consistency): P0 alert tier narrowed D-012 (proclamations, memoranda, SCOTUS orders
would never alert) → P0 is now exactly the D-012 classes; a design mock-up showed an invented vote result → replaced with
the real fixture vote; plus stale pointers, a duplicated question list and figures, and hook messages that advised
`--no-verify` → all fixed.

**Next:** cold-start round r2 on the final page (result: `docs/coldstart/r2/RESULT.json`), then the session closes.

---

## #1 — 2026-10-02 — Phase 0: groundwork (no product code)

**Asked for:** a new repo and the groundwork for a live US-government tracker (brief verbatim in `docs/VISION.md`):
research how best to build and curate the feed, build a framework adapted from the aviary harness, and leave the first
build session knowing exactly where to start. Explicitly not: building the product.

**Owner decisions taken this session:** D-001…D-006, D-009…D-023 in `docs/DECISIONS.md` (asked in five
AskUserQuestion rounds, each announced with a push notification); agent choices D-007, D-008, D-024 (adopt the
synthesis's thinner Phase 1). Grants G-001…G-005 in `docs/OWNER_GRANTS.md`. Notable owner calls against the
recommendation: no code license (D-014), use third-party sources now without a terms check (D-017), show everything by
default (D-019), track the wider administration (D-020), alerts at any hour (D-023).

**Research** (workflow `ced-source-research`: 6 dimension researchers, each followed by one adversarial verifier that
re-probed endpoints live and corrected the report in place, then a synthesis): six reports + `docs/research/SYNTHESIS.md`.
Each report ends with a "Verification ledger". Headline findings that shaped the plan: GitHub Actions cron cannot be the
live path (D-008); Cloudflare Workers Free (Durable Objects with alarms, SQLite, WebSockets) is the free real-time
backbone; both chambers publish free live captions, so floor text needs no speech-to-text; White House live text is the
real gap (D-010); Congress is in recess until Nov 9, so congressional adapters are built against fixtures first.

**Harness** (adapted from aviary, Node, zero dependencies): `scripts/ship_state.mjs` (verdict-as-code),
`scripts/gate.mjs` (stamp at HEAD; product suites via `package.json` `gate.npmScripts`), `scripts/handoff_lint.mjs`
(L1–L8), `scripts/check_paths.mjs`, `scripts/record_fixture.mjs`, Claude Code hooks (session-start ship state, push
guard, dirty-handoff warning), git hooks from the agent-protocol bundle (secret scan, no force-push), the cold-start
validation workflow `.claude/workflows/coldstart-validate.js`, skills `handoff` and `add-source`, CI + Pages workflows.

**Docs:** `CLAUDE.md`, `HANDOFF.md`, `MAP.md`, `TESTING.md`, `KNOWN_FAILING.md`, `docs/{VISION, ROADMAP, ARCHITECTURE,
SOURCES, EVENT_MODEL, DESIGN_LANGUAGE, DECISIONS, OWNER_GRANTS, TRAPS, HANDOFF_PROCEDURE}.md`.

**Fixtures:** a recess-proof set recorded from live sources with `scripts/record_fixture.mjs` (index and caveats in
`fixtures/README.md`), including NEGATIVE cases (HTTP 200 error bodies) and an EMPTY case.

**Placeholder site:** `site/index.html` (macOS tokens from `docs/DESIGN_LANGUAGE.md`; no data, labeled "under
construction"). Looked at in headless Edge: desktop 1440×900 light and dark, and phone 390×844 light and dark (through
an iframe; headless Edge crops below ~500 px, now a trap). One fix made after looking: the footer line's spacing.

**How verified:**
- `node --test` over `tests/harness/*.test.mjs`: 33/33 pass (ship_state: every verdict branch incl. the two-FAIL exit;
  handoff_lint: each rule fires on its own planted defect and stays quiet on a good page; path extraction; push/force
  detection).
- `echo '{…"git push --force origin main"}' | node scripts/hooks/push_guard.mjs` → exit 2 (refused); a non-push command → exit 0.
- Fixture claims in `fixtures/README.md` were checked against the files (two corrections made: the vote-256 question
  text and the caption speaker tag actually present in the recorded segments).
- The gate, the first push, the Pages deploy and the cold-start round happen after this entry is committed; their
  results are entry #2.

**Corrections during the session:** research written before D-003 says "the spare RTX 2080 box"; the owner chose the
main home PC instead (D-003 says how to read it). Numbers that had been restated in TRAPS/ARCHITECTURE were moved to their
one home (`docs/SOURCES.md`, D-008) and replaced by pointers.

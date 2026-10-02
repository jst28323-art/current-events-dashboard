# PROGRESS — what happened, and how it was verified (newest first, append-only)

Each entry: what changed · how it was verified (commands + results) · what failed · corrections. Never rewrite an old
entry; correct it with a new one. Rotate the oldest entries to `PROGRESS_ARCHIVE.md` at ~500 lines.

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

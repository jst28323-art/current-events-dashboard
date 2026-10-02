# PROGRESS — what happened, and how it was verified (newest first, append-only)

Each entry: what changed · how it was verified (commands + results) · what failed · corrections. Never rewrite an old
entry; correct it with a new one. Rotate the oldest entries to `PROGRESS_ARCHIVE.md` at ~500 lines.

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

# MAP — where things live and which file is canonical

One question, one file. If a fact has no home here, give it one (add a row) rather than starting a loose file.
Rows marked (planned) are created by the phase that needs them (`docs/ROADMAP.md`).

## Start here

| question | file |
|---|---|
| What is the state and the ONE next action? | `HANDOFF.md` |
| How do I work in this repo (rules, git, owner)? | `CLAUDE.md` |
| What did the owner ask for, verbatim? Feature ids F1–F12? | `docs/VISION.md` |
| What is the plan, phase by phase, and what is ticked? | `docs/ROADMAP.md` |
| Is the tree committed / gated / pushed / validated? | run `node scripts/ship_state.mjs` (never trust prose) |

## Product

| question | file |
|---|---|
| How is the system built (Cloudflare, Pages, home PC, API)? | `docs/ARCHITECTURE.md` |
| Which sources exist, their URLs, validators, cadence, tiers, status? | `docs/SOURCES.md` |
| What does an event look like (fields, keys, types, tiers)? | `docs/EVENT_MODEL.md` |
| What should it look and feel like (macOS tokens, layout)? | `docs/DESIGN_LANGUAGE.md` |
| What was measured about each source (dated evidence)? | `docs/research/` (2026-10-02 snapshot; start with `docs/research/SYNTHESIS.md`) |
| Recorded upstream responses for tests | `fixtures/` (index: `fixtures/README.md`) |
| The live placeholder page (until `apps/web` replaces it) | `site/index.html` |
| Event schema code | `packages/schema/` (planned) |
| Source adapters + registry | `packages/adapters/` (planned) |
| The Cloudflare Worker (pollers, hub, API) | `workers/api/` (planned) |
| The web app (PWA) | `apps/web/` (planned) |
| The home-PC producer (captions, speech-to-text) | `homepc/` (planned) |

## Rules, records, and memory

| question | file |
|---|---|
| What has the owner decided (verbatim)? | `docs/DECISIONS.md` (append-only) |
| What may I do without asking? What is always ask-first? | `docs/OWNER_GRANTS.md` (append-only) |
| What surprising facts cost a day if unknown? | `docs/TRAPS.md` (never pruned) |
| What happened in each session, and how was it verified? | `PROGRESS.md` (newest first) |
| Older front pages | `HANDOFF_ARCHIVE.md` |
| How to end a session / start cold / validate a handoff | `docs/HANDOFF_PROCEDURE.md` + `.claude/skills/handoff/SKILL.md` |
| How to add or fix a source | `.claude/skills/add-source/SKILL.md` |
| What counts as tested? | `TESTING.md` |
| Known-broken checks, registered with evidence | `KNOWN_FAILING.md` |
| Machine-read flags (push hold) | `docs/STATUS.json` |
| Cold-start validation records (one directory per round; `ship_state` reads them) | `docs/coldstart/` |

## Harness (code)

| what | file |
|---|---|
| Ship-state verdict | `scripts/ship_state.mjs` |
| Merge gate (writes the stamp `push` needs) | `scripts/gate.mjs` (product suites: `package.json` → `gate.npmScripts`) |
| Handoff shape lint | `scripts/handoff_lint.mjs` |
| Dead-path check for living docs | `scripts/check_paths.mjs` |
| Record a fixture | `scripts/record_fixture.mjs` |
| Claude Code hooks (session start, push guard, stop warning) | `.claude/settings.json`, `scripts/hooks/` |
| Cold-start validation workflow | `.claude/workflows/coldstart-validate.js` |
| Git hooks (secret scan, no force-push) | `enforcement/git-hooks/` (enable: `git config core.hooksPath enforcement/git-hooks`) |
| CI and Pages deploy | `.github/workflows/ci.yml`, `.github/workflows/pages.yml` |
| Harness tests | `tests/harness/` |

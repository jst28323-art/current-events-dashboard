# HANDOFF — read this first

AS-OF 2026-10-02 · one page. Repo `C:\Users\j\claude\current-events-dashboard` · GitHub `jst28323-art/current-events-dashboard`
(public) · placeholder site <https://jst28323-art.github.io/current-events-dashboard/>. **Read `CLAUDE.md` next** (the
contract: owner rules, push grant, polite polling), then `docs/ROADMAP.md`. `MAP.md` says where everything else lives.
The tree's state is a command, not prose: this page names no commit.

## ⚑ LATEST #1 (2026-10-02) — groundwork laid; Phase 0 done; no product code yet; Phase 1 is next

The project is a live feed of the US federal government. The owner's brief, verbatim, and the feature ids F1–F12 are in
`docs/VISION.md`. This session did research, made decisions, and built the framework. It wrote no product code, as the
owner asked.

- **Decided:** every owner ruling is a row in `docs/DECISIONS.md` (append-only). Read the whole file before asking
  anything: most first-week questions are already answered there, including budget, visibility, which sources are
  allowed, alerts, transcripts, the push grant, the license and the phone plan. What you may do unasked is in
  `docs/OWNER_GRANTS.md`.
- **Designed:** `docs/ARCHITECTURE.md` (Cloudflare Workers Free backbone; GitHub Pages app; home PC as a pluggable
  producer); `docs/EVENT_MODEL.md` (one normalized event shape); `docs/SOURCES.md` (tiered catalog);
  `docs/DESIGN_LANGUAGE.md` (macOS look).
- **Evidence:** `docs/research/` holds six live-verified reports and `docs/research/SYNTHESIS.md`, all dated 2026-10-02.
  Re-measure before relying on any number.
- **Test data:** `fixtures/` holds real upstream responses (see `fixtures/README.md`), because Congress is in recess
  (dates: `docs/TRAPS.md`).
- **Harness:** `scripts/ship_state.mjs`, `scripts/gate.mjs`, `scripts/handoff_lint.mjs`, the cold-start workflow, and the
  skills in `.claude/skills/` (`handoff`, `add-source`); the procedure is `docs/HANDOFF_PROCEDURE.md`.

## SHIP STATE

    node scripts/ship_state.mjs

Run it first, from the harness Bash in the repo directory, and obey its one verdict line. It fetches origin (`--no-fetch`
skips that) and asks GitHub for the CI result (`--offline` skips that too). `SHIPPED-CLEAN` means nothing is owed, so go
to NEXT ACTION. Any other verdict prints its next step on the `next:` line (a command, or an instruction to wait, stop,
fix or ask the owner): do that first. Never reason about the tree from prose.

## NEXT ACTION

### Start Phase 1: ask the owner the P1.1 account questions, then build the P1.2 workspace scaffold

Phase 1 (a thin slice: two live sources on the owner's phone) and its exit criteria are in `docs/ROADMAP.md`. In order:
1. **Ask before building**, as the canonical prompt says: one AskUserQuestion call (multiselect where it fits), plus a
   PushNotification, asking every question ROADMAP P1.1 lists (the Cloudflare signup and API token, the api.data.gov
   key, whether sessions may deploy Workers when the gate passes, the workers.dev subdomain). All are ask-first
   (`docs/OWNER_GRANTS.md`); ROADMAP P1.1 also says how secrets get in. Walk the owner through it, and record the
   answers and grants in the same session. Don't re-ask what `docs/DECISIONS.md` already settles.
2. **P1.2 workspace scaffold** (needs no account, so start it even if the owner is away; P1.4 likewise): npm workspaces with
   `packages/schema`, `packages/adapters`, `workers/api` and `apps/web`, as ROADMAP P1.2 specifies. Check current tool
   versions before pinning them. Every new suite goes into `package.json` → `gate.npmScripts`, and the gate stays green.
3. Continue down Phase 1. P1.4 (adapters) needs no account and may come before the P1.3 probe; P1.3, P1.5 and P1.6
   need the Cloudflare account. **Time-boxed exception:** ROADMAP P2.3 (record live pro forma fixtures in its stated
   window) runs whenever that window falls, whatever phase is current.
4. End with the `handoff` skill (`.claude/skills/handoff/SKILL.md`; read it by path if it is not listed). It includes
   the cold-start round when you replace this page.

## WHERE THINGS ARE

`MAP.md` answers "where is X?" · `docs/TRAPS.md` covers what wastes a day: read it before touching a source or the
harness · `PROGRESS.md` is the session log, newest first · `HANDOFF_ARCHIVE.md` keeps superseded front pages.

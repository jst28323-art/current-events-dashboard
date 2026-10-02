# Cold-start r1 — content fact-check of HANDOFF.md page #1

Frozen commit: `fada8917faca` (2026-10-02 14:03 -0500). Every file was read with `git show fada8917faca:<path>`; the
frozen tree was also extracted with `git archive` into a scratch directory to run the harness scripts against it.
Live checks (GitHub visibility, the Pages URL) were made on 2026-10-02.

**Verdict: FAIL — 1 false claim out of 82 checked.** The finding is minor (one sentence about what `ship_state`
prints). The fix is one word. Everything else re-derives from the repo.

## Finding

| # | claim (page) | where | truth | evidence |
|---|---|---|---|---|
| 1 | "Any other verdict prints the one command to run first." | `## SHIP STATE`, last-but-one sentence | Every verdict prints a `next:` line, but for several verdicts that line is an instruction to stop, wait or ask, not a command. GATE-RUNNING-WAIT prints "A gate is running. Wait for it; start nothing and commit nothing meanwhile." NO-REMOTE prints "... ask the owner (docs/OWNER_GRANTS.md) ...". PUSH-HOLD-STOP prints "... Commit locally only; the owner lifts holds." GATE-FAILED-STOP prints "read .gate/last.json, fix the cause ..., commit, re-gate". | `scripts/ship_state.mjs` `decide()`; I ran `decide()` from the frozen tree on synthetic measurements for each branch and got the texts above. Suggested wording: "Any other verdict prints the next step (a command, or an instruction to stop or ask)." |

## Claims that check out (82 claims checked in all; the 81 below are true)

**Header**
- AS-OF 2026-10-02: matches the commit dates (all seven commits are dated 2026-10-02).
- The repo is at `C:\Users\j\claude\current-events-dashboard`: true.
- GitHub `jst28323-art/current-events-dashboard`: the `origin` URL is `https://github.com/jst28323-art/current-events-dashboard.git`.
- (public): `gh repo view` reports `visibility: PUBLIC`, matching D-002.
- Placeholder site `https://jst28323-art.github.io/current-events-dashboard/`: HTTP 200, `<title>Current Events Dashboard</title>`, "Under construction". `pages.yml` deploys `site/`.
- `CLAUDE.md` holds the owner rules ("Working with the owner"), the push grant ("Push authority (G-003)") and "Polite polling": true.
- `docs/ROADMAP.md` exists.
- `MAP.md` says where everything else lives: true.
- "this page names no commit": no hex string of 7+ characters appears on the page, and `handoff_lint` passes (page #1, 56 lines).

**LATEST #1**
- Page #1, dated 2026-10-02: true.
- Phase 0 done: ROADMAP shows "Phase 0 — Groundwork ✅ (2026-10-02)" with all four tasks ticked.
- No product code yet: the tree has no `packages/`, `workers/`, `apps/` or `homepc/`. `site/index.html` is the placeholder.
- Phase 1 is next: Phase 1 is the first phase with unticked tasks.
- The project is a live feed of the US federal government: matches CLAUDE.md "What this is" and VISION.
- The owner's brief is in `docs/VISION.md` verbatim: true.
- Feature ids F1–F12 are in `docs/VISION.md`: the table runs F1…F12.
- The session did research, made decisions and built the framework: PROGRESS #1 and commits 3d3a18e…fada891.
- It wrote no product code, as the owner asked: the brief says "don't worry about actually building the product today".
- Every owner ruling is a row in `docs/DECISIONS.md`: true.
- `docs/DECISIONS.md` is append-only: its header says so.
- `docs/DECISIONS.md` covers the topics the page lists:
  - budget: D-001
  - visibility: D-002
  - allowed sources: D-009 and D-017
  - alerts: D-012 and D-023
  - transcripts: D-010 and D-018
  - push grant: D-011
  - license: D-014
  - phone plan: D-015
- What an agent may do unasked is in `docs/OWNER_GRANTS.md`: true.
- `docs/ARCHITECTURE.md` describes a Cloudflare Workers Free backbone, a GitHub Pages app, and the home PC as a "pluggable producer" (line 43): true.
- `docs/EVENT_MODEL.md` is "the one shape every source emits": true.
- `docs/SOURCES.md` is a tiered catalog (Tier 1, 2, 3 and Excluded): true.
- `docs/DESIGN_LANGUAGE.md` describes a macOS look: true.
- `docs/research/` holds six reports:
  - `architecture_hosting_frontend.md`
  - `congress_floor_votes.md`
  - `congress_legislation_committees_courts.md`
  - `curation_priorart_future.md`
  - `executive_branch.md`
  - `live_media_transcripts.md`
- The reports are "live-verified": each one has a "Verification ledger" section.
- `docs/research/SYNTHESIS.md` exists.
- All seven research files are dated 2026-10-02 in their headers: true.
- `fixtures/` holds real upstream responses, each with a `.meta.json` recording its URL, status and `fetched_at`. `fixtures/README.md` exists.
- Congress is in recess until Nov 9: `docs/TRAPS.md` "Calendar" says so. 2026-11-09 is a Monday.
- The harness pieces exist:
  - `scripts/ship_state.mjs`, `scripts/gate.mjs` and `scripts/handoff_lint.mjs`
  - the cold-start workflow `.claude/workflows/coldstart-validate.js`
  - the skills `.claude/skills/handoff/SKILL.md` and `.claude/skills/add-source/SKILL.md`
- `docs/HANDOFF_PROCEDURE.md` exists and describes `ship_state`, the gate, the lint, the cold-start workflow and the `handoff` skill. It does not mention `add-source`, but that skill has its own row in MAP.md. The parenthetical is a pointer to the procedure, so I did not count this as a false claim.

**SHIP STATE**
- `node scripts/ship_state.mjs` exists and runs.
- It prints one verdict line: line 1 is `ship_state: <VERDICT>`.
- It fetches origin: `git fetch --quiet origin`, run when `fetch` is true.
- `--no-fetch` skips the fetch: `argv.has('--no-fetch')`.
- It asks GitHub for the CI result: `gh run list --commit <head> --workflow ci.yml`. This only runs when HEAD is not ahead of origin and `gh` is installed.
- `--offline` skips the CI lookup and also the fetch: `ci: !offline`, and the fetch flag includes `|| offline`.
- `SHIPPED-CLEAN` means nothing is owed: its next step is "Nothing to ship. Continue with HANDOFF.md ## NEXT ACTION."
- (The claim about what the other verdicts print is the finding above.)

**NEXT ACTION**
- Phase 1 is "a thin vertical slice: two live sources on the owner's phone", and its exit criteria are in ROADMAP: true.
- The canonical prompt says to ask before building: "Use AskUserQuestion with multiselect to ask me anything you want before launching into development."
- One AskUserQuestion call plus a PushNotification: CLAUDE.md "Working with the owner" says so.
- (a) The Cloudflare signup, with an API token as a GitHub secret: ROADMAP P1.1 (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).
- (b) The api.data.gov key: ROADMAP P1.1 (`API_DATA_GOV_KEY`).
- Both are ask-first: OWNER_GRANTS "Accounts and secrets" requires a go-ahead for creating any external account or adding a secret.
- Walk the owner through it: OWNER_GRANTS says "Walk the owner through the signup".
- Record the answers and grants in the same session: CLAUDE.md "Record every answer verbatim … in the same session".
- Asking these questions does not re-ask a settled decision. D-003 only says the accounts can be planned around, and that "Signups happen only when a session needs them, walked through with the owner."
- P1.2 needs no account and can start while the owner is away: ROADMAP P1.1 says "If the owner is away, do P1.2 first (it needs no account)."
- The P1.2 packages match ROADMAP P1.2: `packages/schema`, `packages/adapters`, `workers/api` and `apps/web`, as npm workspaces.
- Check tool versions before pinning: ROADMAP says "Check current versions and pin them".
- `package.json` → `gate.npmScripts` exists (an empty array), and `scripts/gate.mjs` runs each entry as `npm run <name>`.
- P1.3 needs the Cloudflare account: ROADMAP says "P1.3 Probe Worker (needs P1.1)". Tasks P1.4–P1.6 exist.
- ROADMAP P2.3 records live pro forma fixtures on Mon 2026-10-05, ~16:00–17:00 ET: true, and 2026-10-05 is a Monday.
- P2.3 runs "whenever that window falls, whatever phase is current": true.
- The `handoff` skill includes the cold-start round when the page is replaced: SKILL.md step 7.
- The NEXT ACTION is not already done: `git log --all` has no commit after fada891, and no workspace directories exist at the frozen commit.
- The NEXT ACTION is not contradicted by ROADMAP. ROADMAP says "NEXT ACTION is always the first unticked task of the current phase". That task is P1.1, and the page also follows P1.1's away-owner rule for P1.2.

**WHERE THINGS ARE**
- `MAP.md` answers "where is X?": true.
- `docs/TRAPS.md` covers "facts that cost a day if you don't know them": true.
- `PROGRESS.md` is the session log, newest first: its header says so.
- `HANDOFF_ARCHIVE.md` keeps superseded front pages: true (it is empty so far; page #1 is the first).

## Harness run on the frozen tree

- `node scripts/handoff_lint.mjs`: PASS (page #1, 56 lines).
- `node scripts/check_paths.mjs`: PASS (18 docs, 0 dead paths).

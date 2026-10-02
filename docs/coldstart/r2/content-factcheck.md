# Cold-start r2: content fact-check of HANDOFF.md page #1

Frozen commit: `b5dcb44c29f9` (2026-10-02 14:35 -0500). I read every file with `git show b5dcb44c29f9:<path>`. I also
extracted the frozen tree with `git archive` into the session scratchpad to run `handoff_lint` and to call
`ship_state.decide()` on synthetic measurements. The working tree was at the same commit and clean, so I also ran
`node scripts/ship_state.mjs --offline` and `node scripts/check_paths.mjs` there; both are read-only. The live checks
(GitHub visibility and the Pages URL) were made on 2026-10-02.

**Verdict: PASS. I checked 90 claims and found none false.**

Since r1 (`fada891`), the page changed in four places: the Test data pointer, the Harness skills line, the SHIP STATE
`next:` sentence (the r1 content fix), and NEXT ACTION steps 1–4. I checked those claims with extra care. Everything
else was re-derived again at `b5dcb44`.

## Findings (false claims)

None.

## Claims checked (all true)

**Header**
1. AS-OF 2026-10-02: all eight commits up to `b5dcb44` are dated 2026-10-02.
2. "one page": 59 lines. `handoff_lint: PASS (page #1, 59 lines)`.
3. The repo path `C:\Users\j\claude\current-events-dashboard` is correct.
4. GitHub `jst28323-art/current-events-dashboard`: `origin` = `https://github.com/jst28323-art/current-events-dashboard.git`.
5. "(public)": `gh repo view` → `"visibility":"PUBLIC"`. This matches D-002.
6. The placeholder site URL returns HTTP 200 with `<title>Current Events Dashboard</title>` and the text "Under construction".
7. `CLAUDE.md` is "the operating contract". It has "Working with the owner" (the owner rules), "Push authority (G-003)" (the push grant) and "Polite polling".
8. `docs/ROADMAP.md` exists.
9. `MAP.md` says where everything else lives (its tables map each question to a file).
10. "this page names no commit": the page has no hex string of 7 or more characters.

**LATEST #1**
11. The heading is `## ⚑ LATEST #1 (2026-10-02)`. `HANDOFF_ARCHIVE.md` says "No pages archived yet; page #1 is the first."
12–13. "groundwork laid; Phase 0 done": ROADMAP shows "Phase 0 — Groundwork ✅ (2026-10-02)" with all four tasks `[x]`.
14. "no product code yet": `ls-tree` has no `packages/`, `workers/`, `apps/` or `homepc/`. `site/index.html` is the placeholder.
15. "Phase 1 is next": Phase 1 is the first phase with unticked tasks.
16. The project is a live feed of the US federal government: this matches CLAUDE.md "What this is" and the VISION brief.
17–18. `docs/VISION.md` has the brief verbatim and the F1…F12 table.
19. "This session did research, made decisions, and built the framework" matches PROGRESS #1 and the commits from 3d3a18e to b5dcb44.
20. "no product code, as the owner asked": the brief says "don't worry about actually building the product today".
21–22. Every owner ruling is a row in `docs/DECISIONS.md`, and its header says "Append-only".
23–30. DECISIONS answers each topic the page lists:
    - budget: D-001
    - visibility: D-002
    - allowed sources: D-009 and D-017
    - alerts: D-012 and D-023
    - transcripts: D-010 and D-018
    - push grant: D-011
    - license: D-014
    - phone plan: D-015
31. `docs/OWNER_GRANTS.md` is "what an agent may do without asking".
32–34. `docs/ARCHITECTURE.md` shows a "Cloudflare Workers (Free plan)" backbone and the Pages web app. Line 43 says "The home PC is a pluggable producer".
35. `docs/EVENT_MODEL.md` is "the one shape every source emits".
36. `docs/SOURCES.md` is tiered: Tier 1, Tier 2, Tier 3 and Excluded.
37. `docs/DESIGN_LANGUAGE.md` is titled "macOS calm for a live feed".
38–41. `docs/research/` holds six reports plus `SYNTHESIS.md`. Each report has one "Verification ledger" (grep count 1 each), and each header is dated 2026-10-02. SYNTHESIS says "**Date:** 2026-10-02".
42–43. The `fixtures/*/2026-10-02/*` files are real upstream responses. Each has a `.meta.json` with url, status, sha256 and fetched_at (for example `pi_current.json`: 200, fetched 2026-10-02T18:00:28Z). `fixtures/README.md` exists.
44–45. Congress is in recess: TRAPS "Calendar" says "Congress is in recess until Mon 2026-11-09", with the Sep 15–16 and Sep 28–30 fixture days.
46–49. `scripts/ship_state.mjs`, `scripts/gate.mjs`, `scripts/handoff_lint.mjs` and `.claude/workflows/coldstart-validate.js` all exist.
50. `.claude/skills/` holds exactly `handoff` and `add-source`.
51. `docs/HANDOFF_PROCEDURE.md` is the procedure.

**SHIP STATE**
52. `node scripts/ship_state.mjs` runs. On the live tree with `--offline` it returned `ROUND-DUE` with exit code 10.
53. It prints one verdict line: line 1 is `ship_state: <VERDICT>`.
54–55. It fetches origin with `git fetch --quiet origin`. `--no-fetch` skips the fetch (`fetch: !(argv.has('--no-fetch') || offline)`).
56–57. It asks GitHub for the CI result with `gh run list --commit <head> --workflow ci.yml` (only when ahead = 0 and `gh` exists). `--offline` skips that and the fetch (`ci: !offline`).
58. `SHIPPED-CLEAN` → next: "Nothing to ship. Continue with HANDOFF.md ## NEXT ACTION."
59–60. Every other verdict prints a `next:` line, and that line is either a command or an instruction to wait, stop, fix or ask the owner. I ran `decide()` on all 15 branches and each one returned a `next`:
    - GATE-RUNNING-WAIT: "Wait for it"
    - NO-REMOTE: "ask the owner"
    - DIVERGED-STOP: "stop and tell the owner"
    - GATE-FAILED-STOP: "fix the cause"
    - PUSH-HOLD-STOP: "Commit locally only"
    - REGATE and PUSH: commands
    - the rest, including ROUND-DUE: the exact Workflow call

**NEXT ACTION**
61–62. ROADMAP has "Phase 1 — A thin vertical slice: two live sources on the owner's phone" and a Phase 1 Exit list.
63. P1.1 is the first unticked task, and ROADMAP says "NEXT ACTION is always the first unticked task of the current phase". The page's NEXT ACTION starts with P1.1, so ROADMAP does not contradict it.
64. The canonical prompt says to ask before building: "...ask me anything you want before launching into development" (CLAUDE.md). The PushNotification-on-ask rule is in CLAUDE.md and VISION.
65–69. ROADMAP P1.1 lists exactly four questions:
    - the Cloudflare account and a Workers-scoped API token (secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`)
    - the api.data.gov key (`API_DATA_GOV_KEY`)
    - "may sessions deploy Workers to that account when the gate passes"
    - "which `*.workers.dev` subdomain to use"
70. All are ask-first. OWNER_GRANTS makes account creation and adding secrets explicitly ask-first, and says "Anything not granted here is ask-first". No grant covers Cloudflare deploys.
71. ROADMAP P1.1 says how secrets get in: "The owner pastes secrets into GitHub's Settings → Secrets page themselves".
72. Answers and grants are recorded in the same session (CLAUDE.md "Record every answer verbatim ... in the same session"; ROADMAP P1.1).
73–74. P1.2 and P1.4 need no account: ROADMAP P1.1 says "If the owner is away, do P1.2 and P1.4 first (neither needs an account)". P1.4 itself says "needs no account".
75. ROADMAP P1.2 names `packages/schema`, `packages/adapters`, `workers/api` and `apps/web`.
76. ROADMAP P1.2 says "Check current versions and pin them".
77. `package.json` has `"gate": {"npmScripts": []}`. `gate.mjs` runs each entry, and it fails on an ungated test or build script (`ungatedScripts`).
78. ROADMAP P1.4 says "may run before P1.3".
79–81. P1.3, P1.5 and P1.6 need the Cloudflare account:
    - P1.3 says "(needs P1.1)".
    - P1.5 is a deployed Worker (cron and HubDO).
    - P1.6 polls that Worker's API.
    - ROADMAP names only P1.2 and P1.4 as account-free.
82–83. ROADMAP P2.3 is the opportunistic pro forma fixture recording (Mon 2026-10-05, about 16:00–17:00 ET; 2026-10-05 is a Monday). It says "Do this whenever that window falls, whatever phase is current".
84. `.claude/skills/handoff/SKILL.md` exists.
85. "read it by path if it is not listed": TRAPS says "The repo's skills may not appear in the skill list either: read them by path".
86. The skill includes the cold-start round when the page is replaced (step 7: "If the page was replaced: ... Run it").

**WHERE THINGS ARE**
87. MAP.md answers "where is X?"
88. TRAPS has "Upstream data sources" and "This machine and harness" sections (it is "facts that cost a day").
89. `PROGRESS.md` is "newest first, append-only".
90. `HANDOFF_ARCHIVE.md` holds "superseded front pages, whole".

**Is the NEXT ACTION already done?** No:
- `git log --all` has nothing after `b5dcb44`.
- No `packages/`, `workers/` or `apps/` directory exists.
- OWNER_GRANTS has no Cloudflare grant; G-001 to G-005 are the only grants.

**Path check:** `check_paths: PASS (19 docs, 0 dead path(s))` on the live tree at the same commit. Every path the page
names exists at `b5dcb44` (`git cat-file -e`).

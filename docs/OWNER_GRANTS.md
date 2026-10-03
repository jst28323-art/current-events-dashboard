# OWNER_GRANTS — what an agent may do without asking

Append-only, dated, in the owner's words (the decision rows in [DECISIONS.md](DECISIONS.md) carry the verbatim text).
Anything not granted here is ask-first. When unsure whether an action is covered, treat it as not covered and ask.
**An agent may report that a grant or rule has gone stale; it may never widen or repeal one itself.**

## Absolute rules (no grant can override these)

- **Never delete any repository**, local or on GitHub, under any circumstances. If a repo looks wrong or duplicated,
  tell the owner and let them decide.
- **Never force-push, never delete a branch on the remote, never skip hooks** (`--no-verify`). The git pre-push hook
  refuses force updates of main, deletion of any remote branch, and updating main to a commit without a gate stamp
  (for every push from a clone with hooks enabled); `scripts/hooks/push_guard.mjs` also refuses force, deletion and
  `--no-verify` in Claude sessions launched from the repo. `--no-verify` itself can only be refused by that Claude hook,
  so it stays a rule you keep.
- **Never commit a secret.** API keys and tokens live in GitHub Actions secrets, Cloudflare secrets, or a local `.env`
  (gitignored). The gate scans tracked files for secret shapes.
- **Never spend money** or start a paid plan, trial or subscription (D-001: budget is $0 for now).

## Ask-first, every time (each one needs its own explicit go-ahead)

- **GitHub admin actions:** creating, renaming, archiving or changing the visibility of a repo; repo settings
  (including Pages settings); collaborators; branch protection or rulesets; webhooks; deploy keys.
- **Accounts and secrets:** creating any external account (Cloudflare, api.data.gov, Oracle, ntfy, Apple, etc.), or
  adding/rotating a secret. Walk the owner through the signup; the owner pastes keys into the service's own settings
  page (GitHub / Cloudflare) themselves: keys never pass through chat.
- **Anything running on the owner's home PC** that keeps running after the session ends (services, scheduled tasks,
  startup entries), and anything that uses its GPU (D-003: it also runs other GPU work).
- **Contacting anyone** outside the repo (emailing a data provider to ask permission, filing issues on other repos).

## Granted

| id | date | grant | scope | source |
|---|---|---|---|---|
| G-001 | 2026-10-02 | Create the public repo `jst28323-art/current-events-dashboard` and push the groundwork | one-time, used 2026-10-02 | D-005 |
| G-002 | 2026-10-02 | Enable GitHub Pages (source: GitHub Actions) with a placeholder page | one-time, used 2026-10-02 | D-006 |
| G-003 | 2026-10-02 | Push to `main` without asking **when `node scripts/gate.mjs` has passed at HEAD** (`node scripts/ship_state.mjs` says `PUSH`). Each push redeploys the public site. List the session's pushes in the wrap-up message. | standing, until the owner revokes it or `docs/STATUS.json` sets `push_hold` | D-011 |
| G-004 | 2026-10-02 | Use undocumented official APIs, labeled partisan sources, and labeled third-party sources (third-party: terms checked first; link out until then) | standing | D-009 |
| G-005 | 2026-10-02 | Ingest the third-party sources (Factba.se, BNO pool reports, the Truth Social archive) now, without a terms check, showing facts only with source credit and link; this narrows G-004's "link out until then" for these sources | standing | D-017 |
| G-006 | 2026-10-02 | Walk the owner through creating a free Cloudflare account (+ a Workers-scoped API token) and a free api.data.gov key; the owner signs up and pastes the keys into GitHub secrets themselves | one-time, this session | D-025 |
| G-007 | 2026-10-02 | Deploy the Worker to the owner's Cloudflare account without asking, **only** through the GitHub Actions deploy workflow that runs after CI passes on a push to `main` (so only gated code deploys; the same `push_hold` stops it). Never deploy from this PC; never change Cloudflare account settings, plans or billing. List the session's deploys in the wrap-up. | standing, until the owner revokes it or `docs/STATUS.json` sets `push_hold` | D-026 |
| G-008 | 2026-10-02 | Schedule ONE one-time Claude cloud run for Mon 2026-10-05 (pro forma window ~16:00–17:00 ET) that records live fixtures and pushes them to a side branch (never `main`) | one-time | D-028 |
| G-009 | 2026-10-02 | Fire the D-028 cloud routine once today in its smoke mode (reachability check, no commits, no pushes) | one-time | D-031 |
| G-010 | 2026-10-02 | Deploy the temporary probe Worker `ced-probe` through the same deploy workflow and conditions as G-007; it must stop all outbound requests by itself after 48 cron runs (~24 h) | one-time deploy of the probe (re-deploys of the same probe under G-007 conditions included) | D-032 |
| G-011 | 2026-10-02 | Create ONE Windows scheduled task on the owner's home PC that runs `scripts/capture_live.mjs` on Mon 2026-10-05 (14:45–16:30 CT; a few small requests a minute, no GPU) and deletes itself afterwards; plus a short same-session test task that proves the scheduler can run it | one-time | D-033 |
| G-012 | 2026-10-03 | Walk the owner through creating a free Google API key (YouTube Data API v3) next session; the owner adds it as a GitHub Actions secret themselves (it never passes through chat) | one-time, next session | D-093 |

Note (2026-10-02): G-002 was carried out by the owner by hand in the repo's Pages settings, because the local token
lacked "Administration: write" (`docs/TRAPS.md`). G-001's push needed the owner to add "Workflows" to the token first.

# OWNER_GRANTS — what an agent may do without asking

Append-only, dated, in the owner's words (the decision rows in [DECISIONS.md](DECISIONS.md) carry the verbatim text).
Anything not granted here is ask-first. When unsure whether an action is covered, treat it as not covered and ask.
**An agent may report that a grant or rule has gone stale; it may never widen or repeal one itself.**

## Absolute rules (no grant can override these)

- **Never delete any repository**, local or on GitHub, under any circumstances. If a repo looks wrong or duplicated,
  tell the owner and let them decide.
- **Never force-push, never delete a branch on the remote, never skip hooks** (`--no-verify`). The pre-push hook and
  `scripts/hooks/push_guard.mjs` enforce the first two.
- **Never commit a secret.** API keys and tokens live in GitHub Actions secrets, Cloudflare secrets, or a local `.env`
  (gitignored). The gate scans tracked files for secret shapes.
- **Never spend money** or start a paid plan, trial or subscription (D-001: budget is $0 for now).

## Ask-first, every time (each one needs its own explicit go-ahead)

- **GitHub admin actions:** creating, renaming, archiving or changing the visibility of a repo; repo settings
  (including Pages settings); collaborators; branch protection or rulesets; webhooks; deploy keys.
- **Accounts and secrets:** creating any external account (Cloudflare, api.data.gov, Oracle, ntfy, Apple, etc.), or
  adding/rotating a secret. Walk the owner through the signup; the owner pastes keys in, never into chat history
  that gets committed.
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

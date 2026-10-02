# CLAUDE.md — operating contract for `current-events-dashboard`

Binding for every agent session in this repo. **Start with `HANDOFF.md`**: it names the current state and the one next
action. This file says how to work; `MAP.md` says where everything lives.

## What this is

A live feed of the United States federal government: floor activity, votes, agendas, briefings, presidential actions,
the Federal Register, and other important federal events, shown as they happen. It is a free public web page that works
on a phone, with an iPhone home-screen app and alerts later and, after that, financial and world news. The design
language is macOS: minimal, clean, intuitive. The owner's brief, verbatim, is in `docs/VISION.md`. Owner rulings are in
`docs/DECISIONS.md`.

## Prime directives

1. **Tested before done** (`TESTING.md`). Parsers are tested against recorded upstream fixtures; a test must fail without
   the change; UI changes are looked at (phone + desktop, light + dark) before they count as done.
2. **Verify, don't trust.** Upstream sources change without notice and lie in small ways: HTTP 200 with an error body,
   last-edit timestamps posing as publication times, caches that serve stale copies (`docs/TRAPS.md`). Re-measure before
   relying on a number. Never claim a latency without a measurement (n, date). Research in `docs/research/` is dated
   2026-10-02 evidence, not a guarantee.
3. **Check prior work first.** Before proposing or rebuilding anything: `grep` `docs/DECISIONS.md`, `docs/TRAPS.md`,
   `PROGRESS.md` and `docs/research/` for its terms, and `git log --oneline` for earlier attempts. Re-litigating a
   settled question wastes the owner's time.
4. **Simple first, gated phases** (`docs/ROADMAP.md`). A phase starts only when the previous phase's exit criteria are
   met AND tested. Thin end-to-end slices beat broad half-built layers. Debugging many new features at once is the
   failure this rule prevents.
5. **An honest feed.** Never fabricate or guess an event, a number or a name. Every event links its primary source;
   origin is labeled (official / partisan / third-party / inferred, D-009); facts only, never a source's spin. A stale
   source is shown as stale, not as quiet.
6. **Resumability.** Every session ends with the handoff procedure (`docs/HANDOFF_PROCEDURE.md`, the `handoff` skill),
   and a replaced front page is cold-start validated by blind resumers before anyone calls the session closed.

## Working with the owner

- **Ask, don't assume, on anything the repo doesn't answer.** Batch questions into ONE AskUserQuestion call
  (multiselect where it fits), and send a **PushNotification** whenever you ask, so the owner sees it on their phone (the
  owner asked for this). If you ask in prose instead, still send the notification.
- **Plain English for decisions:** say what happened and why it matters, then the choice, then the concrete impact of
  each option (cost, reversibility, what it unlocks or breaks). Identifiers and file paths go in supporting detail, never
  as the whole description. Mark irreversible or outward-facing options.
- **Record every answer verbatim** as a new row in `docs/DECISIONS.md` (and a grant in `docs/OWNER_GRANTS.md` if it
  grants authority) in the same session.
- **Budget is $0** (D-001). Anything paid is an owner decision with a plain-English price.

## Git, GitHub, deploys

- Solo project. Commit as `jst28323-art` <jst28323@gmail.com> (set in the repo's git config).
- **Push authority (G-003):** push to `main` without asking ONLY when `node scripts/ship_state.mjs` says `PUSH`, which
  requires a gate PASS stamp at HEAD (`node scripts/gate.mjs`). Each push redeploys the public site. A `push_hold` in
  `docs/STATUS.json` suspends the grant; only the owner lifts a hold.
  > This line must never name a specific hold. Read holds from `docs/STATUS.json`, which `ship_state` checks for you.
- Push with Windows git from the harness Bash: `git -C C:/Users/j/claude/current-events-dashboard push origin main`
  (WSL git has no credentials and hangs).
- **Never:** delete a repo (local or remote), force-push, delete a remote branch, skip hooks, commit a secret. **Ask
  first, every time:** any GitHub admin/settings action, creating any external account, adding a secret, anything
  that keeps running on the owner's home PC (`docs/OWNER_GRANTS.md` lists all of it).
- Enable the client-side hooks in every fresh clone: `git config core.hooksPath enforcement/git-hooks`
  (pre-commit secret scan; pre-push refuses force-push and branch deletion). Claude Code hooks in
  `.claude/settings.json` run `ship_state` at session start and guard `git push`.

## Polite polling (applies to every source adapter)

- User-Agent: `Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/jst28323-art/current-events-dashboard)`
  (some government WAFs reject a bare bot UA).
- Conditional GET with the validator each source actually honours (`docs/TRAPS.md`); one request in flight per host;
  per-host rate budgets; exponential backoff with jitter; honour `Retry-After` and robots `Crawl-delay`.
- Fixtures, not live calls, in tests. Never use api.data.gov `DEMO_KEY` in CI.

## Docs discipline

- **Every fact lives in exactly one place**; elsewhere, link to it. A duplicated claim gets corrected in one copy and
  not the other.
- `HANDOFF.md` ≤ 80 lines, enforced by `scripts/handoff_lint.mjs`; `PROGRESS.md` is append-only, newest first.
  `docs/DECISIONS.md` and `docs/OWNER_GRANTS.md` are append-only. `docs/TRAPS.md` is never pruned.
- If a fact has no home, give it one in `MAP.md`'s structure; don't start a new loose file.
- An agent may report that a rule here has gone stale; it may not repeal a rule that binds it.

## Canonical resume prompt (persistent rule; do not weaken)

The only prompt the owner should need to resume this project is, verbatim:

<!-- canonical-prompt -->
> Orient to current-events-dashboard repo, read HANDOFF.md, and continue. Use AskUserQuestion with multiselect to ask me anything you want before launching into development.
<!-- /canonical-prompt -->

`HANDOFF.md` must stay self-sufficient under this prompt alone. All cold-start validation uses this exact prompt
(`.claude/workflows/coldstart-validate.js` carries a byte-identical copy; `scripts/handoff_lint.mjs` rule L7 fails the
gate if they drift).

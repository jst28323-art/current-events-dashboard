# TESTING — tested-before-done

**No change is done until it is tested, the test would fail without the change, and the result is recorded.** A green
suite proves the invariants it checks, not the feature you are selling, so every claim of "works" names the evidence.
Bugs are caught at the step that made them, never carried forward.

## The ladder (each layer is required where it applies)

| layer | what it proves | how | where it runs |
|---|---|---|---|
| 1. Harness tests | the handoff/ship/gate machinery behaves | `npm run test:harness` (`node:test`) | gate + CI |
| 2. Parser unit tests | a source adapter turns a **recorded upstream response** into the right events | fixture files under `fixtures/<source_id>/<YYYY-MM-DD>/` + `node:test`/Vitest | gate + CI |
| 3. Contract tests | the normalized events match `docs/EVENT_MODEL.md` (schema, required fields, IDs, UTC times) | schema validation over every adapter's fixture output | gate + CI |
| 4. Live smoke (non-gating) | the upstream still answers in the shape we recorded | `scripts/` probe per source, run by hand or on a schedule; a diff from the fixture shape is a TRAP or a fix | manual / scheduled |
| 5. End-to-end | ingest → store → API → page works on a phone-width screen | Playwright at 390×844 and 1440×900, light + dark | gate + CI (once the UI exists) |
| 6. Deployed check | what the owner actually opens is up and fresh | fetch the live URL, check the newest event's age and the health endpoint | after every deploy |

## Rules

1. **Fixtures first.** Before writing a parser, record real upstream responses (status, headers, body) with
   `node scripts/record_fixture.mjs` into `fixtures/<source_id>/<YYYY-MM-DD>/` (layout: `fixtures/README.md`). Include an error case (the 200-with-error-body shapes in
   `docs/TRAPS.md`) and an empty case. Parsers are tested only against fixtures; tests never hit the network.
2. **The test must fail without the change.** For a bug fix, write the failing test first (replay the bug), then fix.
   A test that cannot fail is not a test.
3. **Non-default paths get their own case.** The default fixture exercising one branch says nothing about the others
   (e.g. a vote with a tie, a voice vote, a revised document, a DST-boundary timestamp).
4. **Never loosen a check to pass.** If a check is wrong, fix it in its own commit that says why. If something is known
   broken and out of scope, register it in `KNOWN_FAILING.md` with the evidence and the owner of the fix.
5. **Latency is measured, not claimed.** Any "within N seconds" statement cites a measurement: our own `first_seen_at`
   against the real-world event time, with n and the date.
6. **Look at it.** UI work is not done until someone has looked at a screenshot at phone and desktop width, in light and
   dark mode. Screenshots go in the PR or PROGRESS entry.
7. **Adversarial review for load-bearing work.** Parsers that feed votes (F5/F6), presidential actions (F9) and anything
   shown as "official" get an adversarial review (a skeptic tries to make the parser emit a wrong fact) before they ship.

## The gate

`node scripts/gate.mjs` runs layers 1–3 (and 5 once it exists) plus the harness checks, and writes a stamp naming HEAD on
PASS. Product checks are declared as npm script names in `package.json` → `gate.npmScripts`; add each new suite there.
CI runs the same gate (`node scripts/gate.mjs --ci`) on every push to `main` and on pull requests; the Pages deploy
runs only after CI passes.

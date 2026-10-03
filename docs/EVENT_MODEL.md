# EVENT MODEL — the one shape every source emits

Status: **v0.1, implemented 2026-10-02** as TypeScript types plus a JSON Schema in `packages/schema/`. The JSON Schema
(`packages/schema/src/event.schema.json`) is the machine contract and wins over this page if they ever differ; D-030 in
`docs/DECISIONS.md` lists what the code added to the v0.1 draft below. Full rationale, worked examples and standards mapping: `docs/research/curation_priorart_future.md` §2.

## Principles

1. **An event is a state change of a real-world object**, not a document. A bill is an object; "H.R. 5334 passed the
   House" is an event. A roll call is an object; "vote opened" and "result" are events.
2. **Append-only.** Never mutate history: a correction is a new revision (`revision + 1`, `supersedes`), and a
   vanished item becomes `status: "retracted"` with its last-seen snapshot. Never hard-delete.
3. **No source URL, no event.** Every event carries at least one primary-source link.
4. **Three clocks, always** (docs/TRAPS.md: source timestamps are last-edit, not first-appearance):
   `occurred_at` (in the world), `source_published_at` (what the source claims), `first_seen_at` (when our poller first
   saw it). Plus `broadcast_at` (when we pushed it). Together they form the latency ledger, so "as soon as possible"
   becomes a measured number.
5. **Stable IDs from authorities**: bioguide for members, Senate LIS mapped to bioguide (via the
   unitedstates/congress-legislators dataset), FR document numbers, EO numbers, congress/session/roll, PN numbers,
   SCOTUS docket numbers. Executive officials have no authority, so we keep a hand-curated registry (never trust
   Wikidata as a roster: a live query returned fictional office-holders).
6. **Facts only, labeled by origin.** `official_text` (verbatim) is always shown. Partisan and third-party sources
   contribute facts (times, numbers, IDs), never their commentary (D-009).

## The record (v0.1)

```jsonc
{
  "schema_version": "0.1",
  "id": "evt_6c1f0e9a2b7d4e11",            // opaque, stable: "evt_" + 16 hex of sha256(dedup_key + revision basis)
  "dedup_key": "vote:senate:119:2:256#result", // object_key + "#" + transition; same key from two sources => MERGE
  "object_key": "vote:senate:119:2:256",
  "thread_key": "nomination:119:PN1129",   // the lifecycle it belongs to (bill, nomination, EO, docket); optional
  "alias_keys": [],                         // other systems' IDs for the same object
  "event_type": "vote.result",             // taxonomy below
  "status": "ended",                       // scheduled | live | ended | postponed | cancelled | rescheduled | corrected | retracted
  "branch": "legislative",                 // legislative | executive | judicial | independent | nongov (F12)
  "body": "senate",                        // senate | house | white_house | agency:<fr-slug> | scotus | fed | sec | ...
  "features": ["F5", "F6"],                // docs/VISION.md feature ids (filters + coverage reports)
  "title": "Senate confirms … , 47-41",    // our plain-words line (rule-generated, never AI in v1)
  "official_text": "On the Nomination PN1129 - Nomination Confirmed (47-41)",
  "importance": { "tier": "P0", "reasons": ["confirmation", "office=cabinet"] },  // P0..P4, rules only (below)
  "times": {
    "occurred_at": "2026-10-01T01:29:00Z",
    "scheduled_for": null,
    "source_published_at": "2026-10-01T03:25:00Z",
    "first_seen_at": "2026-10-01T03:31:12Z",
    "broadcast_at": null
  },
  "actors": [{ "role": "nominee", "id": "official:…", "name": "…", "id_confidence": "curated" }],
  "related": [{ "rel": "about", "key": "nomination:119:PN1129" }],
  "result": { "yea": 47, "nay": 41, "present": 0, "not_voting": 12, "required": "1/2", "passed": true },
  "member_votes_ref": "votes/senate/119/2/256.json", // member-level positions live in a side record, one per vote
  "media": [],                              // { kind: video_live|video_archive|audio|pdf|html, url, is_live, provider }
  "transcript": null,                       // { status: none|live|partial|final, segments_ref, license }
  "sources": [{
    "source_id": "senate.lis.votes",        // the docs/SOURCES.md row id
    "url": "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00256.xml",
    "retrieved_at": "2026-10-01T03:31:12Z",
    "license": "us-gov-public-domain",
    "affiliation": "official-nonpartisan"   // official-nonpartisan | official-partisan | executive-messaging | independent | third-party | unofficial
  }],
  "revision": 1,
  "supersedes": null,
  "provenance": { "parser": "senate_vote_xml@0.1.0", "confidence": "high" }  // confidence: high | inferred
}
```

**Phase-1 minimum** (everything else optional until a feature needs it): `schema_version`, `id`, `dedup_key`,
`object_key`, `event_type`, `status`, `branch`, `body`, `features`, `title`, `official_text`, `times.occurred_at`,
`times.first_seen_at`, `sources[0]`, `revision`, `provenance`.

**Date-only facts** go in `result`, never in `times`: every time in `times` is a full UTC instant (D-030). A source that
gives only a calendar day puts it in `result.publication_date` as `YYYY-MM-DD` (today: published FR documents, D-034).

**Order key** (newest first, the same in the API and the page): one function, `orderKeyMs` in
`packages/schema/src/order.ts` (rule and reasons: D-048). In short, it uses the event's own time first, then the
source's posting time, then an earlier `result.publication_date` (sort only, never shown as a time), then
`first_seen_at`; ties by id descending.

## Object keys (the dedup backbone)

| object | key | example |
|---|---|---|
| roll-call vote | `vote:{house\|senate}:{congress}:{session}:{roll}` | `vote:house:119:2:314` |
| bill | `bill:{congress}:{type}:{number}` (types: hr, s, hjres, sjres, hconres, sconres, hres, sres) | `bill:119:hr:5334` |
| nomination | `nomination:{congress}:PN{n}` | `nomination:119:PN1129` |
| FR document | `fr:{document_number}` (Public Inspection and publication share it) | `fr:2026-20321` |
| executive order | `eo:{number}` (the number first appears at FR Public Inspection) | `eo:14434` |
| White House page | `wh:{path}` (an alias later linked to `eo:` / `fr:`) | `wh:presidential-actions/2026/09/…` |
| White House post | `wh_post:{wordpress_post_id}` from the RSS `<guid>` `?p=` (stable across re-titles and re-slugs; `wh:{path}` is its alias) | `wh_post:51617` |
| SCOTUS case | `scotus:{docket}` | `scotus:24-123` |
| hearing | `hearing:{chamber}:{committee_code}:{yyyymmdd}:{slug}` | |
| live stream | `live:{provider}:{id}` | `live:youtube:{videoId}` |
| member | `bioguide:{id}` | `bioguide:A000370` |
| executive official | `official:{slug}` (curated registry) | `official:secretary-of-state` |
| agency | `agency:{fr_slug}` | `agency:environmental-protection-agency` |

Merge rule: same `dedup_key` → union of `sources`, earliest `first_seen_at`, field values by source priority
(official XML > Congress.gov > third-party > press-gallery text). Free-text sources contribute `first_seen_at` and a
corroboration link, never counts. Cross-source linking without a shared ID (e.g. a White House EO post ↔ its FR
filing) uses the normalized-title + date-window rule in the research §2.4. How the Worker applies this rule today (what
counts as a fact, who may revise, payload rules): D-036.

## Event types (v0.1 taxonomy)

The last column lists what the code emits today (2026-10-02, commit 83ea2b6); the adapter rows are D-034 and D-035.

| family | types | features | emitted now (by) |
|---|---|---|---|
| floor | `floor.convened`, `floor.adjourned`, `floor.recess`, `floor.pro_forma`, `floor.action`, `floor.speaking` | F1 F2 F8 | none |
| vote | `vote.scheduled`, `vote.opened`, `vote.tally` (ephemeral, not stored per tick), `vote.result` | F5 F6 | none |
| bill | `bill.introduced`, `bill.action`, `bill.passed_chamber`, `bill.presented`, `bill.signed`, `bill.vetoed`, `law.enacted` | F11 F9 | none |
| nomination | `nomination.received`, `nomination.committee_action`, `nomination.confirmed`, `nomination.rejected`, `nomination.withdrawn` | F9 F11 | none |
| hearing | `hearing.scheduled`, `hearing.live`, `hearing.ended`, `markup.*` | F7 | none |
| live / speech | `live.started`, `live.ended`, `briefing.*`, `speech.*`, `transcript.segment`, `transcript.published` | F3 F4 F1 F2 | none |
| schedule | `schedule.item` (President, VP, cabinet; floor schedules) | F7 | none |
| presidential action | `presidential_action.{executive_order, proclamation, memorandum, notice, determination, nominations_sent, statement, other}` | F9 | `presidential_action.executive_order`, `.proclamation`, `.memorandum`, `.nominations_sent`, `.other` (`wh.feeds`) |
| White House messaging | `wh.{release, briefing_statement, fact_sheet, article, remarks, other}` (D-030) | F11 | all six (`wh.feeds`) |
| regulatory | `fr.public_inspection`, `fr.published.{rule, proposed_rule, notice, presidential_document, other}` (status `scheduled` while listed before its publication date, D-059), `fr.correction` | F10 | `fr.public_inspection`, `fr.published.rule`, `.proposed_rule`, `.notice`, `.presidential_document`, `.other` (`fr.api`) |
| judicial | `court.opinion`, `court.order_list`, `court.argument`, `court.grant` | F11 | none |
| oversight | `report.{cbo, gao, crs, ig}` | F11 | none |
| later (F12) | `econ.release`, `fed.statement`, `sec.filing`, `world.news`, … | F12 | none |
| system | `system.source_health` (drives the status page) | ops | none (health is served by `/api/v1/status`, not as events) |

## Importance tiers (rules first; no AI in v1)

The default view shows **every** item (D-019). Tiers never hide anything by default: they drive alerts, ordering,
emphasis and the filters a user chooses to turn on. **P0 is exactly the owner's alert classes (D-012); narrowing it is
the owner's call.**

| tier | meaning | used for | examples |
|---|---|---|---|
| P0 alert | exactly the D-012 classes | push at any hour (D-023) + banner | executive orders, proclamations, memoranda and presidential documents filed at Public Inspection; final passage votes, confirmation votes, vetoes and veto overrides; the President or the Press Secretary going live; Supreme Court opinions and major orders |
| P1 major | emphasized | Today view, bold rows | cloture and other significant votes, significant FR rules, other officials going live (D-020 list), other presidential actions |
| P2 notable | normal | feed | amendment votes, other nominations, proposed rules, CBO/GAO reports, floor convened/adjourned |
| P3 routine | de-emphasized | feed (lighter row) | procedural votes, routine rules, bill referrals, agency releases |
| P4 low | de-emphasized | feed (lighter row), optional "hide routine" filter | FR notices (~82% of FR volume), pro forma sessions, corrections |

## Honesty rules (code, not policy)

- Never present an inferred fact as official: inferred speakers, unofficial tallies and third-party schedule items
  carry `provenance.confidence: "inferred"` or a non-official `affiliation`, and the UI labels them.
- If AI summaries are ever added (an owner decision, D-001), AI only annotates existing events, every number/name in a
  summary must appear in the source text, and `official_text` is always shown beside it.

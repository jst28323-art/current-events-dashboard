// The docs/EVENT_MODEL.md merge rule as a pure function (no storage), so it is unit-testable:
// same dedup_key -> union of sources (by source_id + url), the EARLIEST first_seen_at, field values by source priority.
//
// Facts vs provenance. An event's FACTS are everything except id, revision, supersedes, sources, alias_keys and
// times.first_seen_at. Its PROVENANCE is the sources list, alias_keys and first_seen_at. alias_keys are other systems'
// names for the object: they only ever accumulate (a re-slugged White House post keeps its old wh:{path} alias for the
// later EO <-> FR link, WH-5), so they are compared as a growing set, never as a fact: a fact would make the stored
// union differ from every later poll's list and revise the event on every poll.
//   - facts unchanged, provenance unchanged  -> 'unchanged' (no write, the cursor does not move)
//   - facts unchanged, provenance grew       -> 'merged'    (same id and revision; stored in place, cursor moves)
//   - facts changed                          -> 'revised'   (revision + 1, supersedes = the previous id, new id)
// A correction is a new revision (EVENT_MODEL principle 2); a second source confirming the same facts is not one.
//
// Source priority: the stored event's sources[0] owns its facts. A payload from the owner (or from a source whose
// affiliation ranks strictly higher, which then becomes the owner) can change them; any other source only adds
// provenance, never facts (D-009: official sources stay the fallback and the record of truth).
import { eventId, type Affiliation, type CedEvent, type EventSource } from '@ced/schema'

/** Lower is more authoritative (EVENT_MODEL "field values by source priority"; official first). */
export const AFFILIATION_RANK: Record<Affiliation, number> = {
  'official-nonpartisan': 0,
  'official-partisan': 1,
  'executive-messaging': 1,
  independent: 2,
  'third-party': 3,
  unofficial: 4,
}

export type MergeResult =
  | { kind: 'unchanged' }
  | { kind: 'merged'; event: CedEvent }
  | { kind: 'revised'; event: CedEvent }

/** A stable serialization for comparison: object keys sorted, null and undefined members dropped (an optional field
 * that is null means the same as one that is absent). */
export function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => o[k] !== null && o[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

/** The fields whose change makes a new revision. */
export function facts(e: CedEvent): Record<string, unknown> {
  const { id: _id, schema_version: _v, revision: _r, supersedes: _s, sources: _src, alias_keys: _a, times, ...rest } = e
  const { first_seen_at: _f, ...otherTimes } = times
  return { ...rest, times: otherTimes }
}

const sourceKey = (s: EventSource) => `${s.source_id} ${s.url}`

/** Union by source_id + url. `first`'s entries come first; for an entry in both lists, `preferSecond` decides whose
 * copy (and so whose retrieved_at) is kept. */
function unionSources(first: EventSource[], second: EventSource[], preferSecond: boolean): EventSource[] {
  const inSecond = new Map(second.map((s) => [sourceKey(s), s]))
  const inFirst = new Set(first.map(sourceKey))
  const out: EventSource[] = []
  const seen = new Set<string>()
  for (const s of [...first, ...second]) {
    const k = sourceKey(s)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(inFirst.has(k) && preferSecond ? (inSecond.get(k) ?? s) : s)
  }
  return out
}

/** Union of two alias lists, first list's order first; undefined when both are empty (the field stays absent). */
function unionAliases(first: string[] | undefined, second: string[] | undefined): string[] | undefined {
  const out = [...new Set([...(first ?? []), ...(second ?? [])])]
  return out.length ? out : undefined
}

function earliest(a: string, b: string): string {
  return Date.parse(b) < Date.parse(a) ? b : a
}

/** Merge `incoming` into `stored` (both with the same dedup_key, both already validated). */
export function mergeEvent(stored: CedEvent, incoming: CedEvent): MergeResult {
  const owner = stored.sources[0]
  const lead = incoming.sources[0]
  if (!owner || !lead) throw new Error('an event without sources reached the merge (validation should have refused it)')
  // Decided by the incoming LEAD entry only (the HubDO guarantees it is the polled source, with its registered
  // affiliation): merely listing the owner's entry somewhere in sources[] must never grant the owner's authority.
  const fromOwner = lead.source_id === owner.source_id
  const takeover = !fromOwner && AFFILIATION_RANK[lead.affiliation] < AFFILIATION_RANK[owner.affiliation]
  const firstSeen = earliest(stored.times.first_seen_at, incoming.times.first_seen_at)

  if ((fromOwner || takeover) && canonical(facts(incoming)) !== canonical(facts(stored))) {
    // A new revision: the incoming copy's facts, its own retrieved_at for the entries it carries, and its lead entry
    // first (the current link pairs with the current facts: a re-slugged post must not keep its old URL as
    // sources[0], WH-5). Earlier entries and aliases stay as provenance.
    const sources = unionSources(incoming.sources, stored.sources, false)
    const alias_keys = unionAliases(incoming.alias_keys, stored.alias_keys)
    const revision = stored.revision + 1
    const event: CedEvent = {
      ...incoming,
      schema_version: '0.1',
      id: eventId(stored.dedup_key, revision),
      revision,
      supersedes: stored.id,
      times: { ...incoming.times, first_seen_at: firstSeen },
      sources,
    }
    if (alias_keys) event.alias_keys = alias_keys
    else delete event.alias_keys
    return { kind: 'revised', event }
  }

  // Same facts: only provenance can grow. Existing entries keep their first retrieved_at.
  const sources = takeover
    ? unionSources(incoming.sources, stored.sources, true)
    : unionSources(stored.sources, incoming.sources, false)
  const alias_keys = unionAliases(stored.alias_keys, incoming.alias_keys)
  if (firstSeen === stored.times.first_seen_at && canonical(sources) === canonical(stored.sources) &&
    canonical(alias_keys) === canonical(stored.alias_keys)) {
    return { kind: 'unchanged' }
  }
  const event: CedEvent = { ...stored, times: { ...stored.times, first_seen_at: firstSeen }, sources }
  if (alias_keys) event.alias_keys = alias_keys
  return { kind: 'merged', event }
}

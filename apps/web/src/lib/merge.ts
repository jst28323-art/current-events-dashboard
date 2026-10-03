// Client-side merge of polled events. Keyed by dedup_key (one row per real-world state change); a higher (or equal,
// i.e. re-sent) revision replaces its predecessor, a lower one arriving late is ignored, and an event that names a
// `supersedes` id removes that predecessor even if it was stored under another key. Append-only upstream, so nothing
// else ever removes a row (a retraction arrives as a revision with status "retracted").
import type { CedEvent } from '@ced/schema'
import { sortKeyMs } from './time.js'

/** The most rows kept in memory (the API's first page is 100; polls only add). */
export const MAX_EVENTS = 500

/** Newest first by the API's order key (sortKeyMs: occurred_at, else the posting time, else first seen); ties by id
 * DESCENDING, exactly as the Hub orders them (hub.ts ORDER BY sort_ms DESC, id DESC), so a reload never reshuffles. */
export function sortNewestFirst(events: CedEvent[]): CedEvent[] {
  return events.sort((a, b) => sortKeyMs(b) - sortKeyMs(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}

export interface MergeResult {
  events: CedEvent[]
  /** Rows the `max` cap dropped (the oldest by sortKeyMs); the page says when this happens. */
  trimmed: number
}

export function mergeEventsCounted(current: readonly CedEvent[], incoming: readonly CedEvent[], max = MAX_EVENTS): MergeResult {
  const byKey = new Map<string, CedEvent>()
  for (const e of current) byKey.set(e.dedup_key, e)
  for (const e of incoming) {
    const prev = byKey.get(e.dedup_key)
    if (prev && e.revision < prev.revision) continue
    byKey.set(e.dedup_key, e)
  }
  // Supersedes is applied after the whole batch, so it does not depend on arrival order: the no-since answer is newest
  // first (a successor before its predecessor), and a predecessor re-sent later must not come back. A row drops only
  // for a successor of a higher revision (a correction is revision + 1), so a malformed cycle cannot hide both rows.
  const supersededAt = new Map<string, number>()
  for (const e of [...current, ...incoming]) {
    if (e.supersedes && e.supersedes !== e.id) supersededAt.set(e.supersedes, Math.max(supersededAt.get(e.supersedes) ?? 0, e.revision))
  }
  const kept = [...byKey.values()].filter((e) => !((supersededAt.get(e.id) ?? 0) > e.revision))
  const sorted = sortNewestFirst(kept)
  return { events: sorted.slice(0, max), trimmed: Math.max(0, sorted.length - max) }
}

export function mergeEvents(current: readonly CedEvent[], incoming: readonly CedEvent[], max = MAX_EVENTS): CedEvent[] {
  return mergeEventsCounted(current, incoming, max).events
}

// Shape checks for what the API sends (packages/schema/src/api.ts). The page fails CLOSED: a response whose envelope
// is not the contract's shape is treated like an outage ("Live data unavailable"), never rendered as an empty feed.
// A single event that is malformed is skipped and counted (the page says how many), so one bad row cannot blank the
// feed and cannot render half-filled either.
import type { CedEvent, EventsResponse, SourceStatus, StatusResponse } from '@ced/schema'
import { parseUtc } from './time.js'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const nullOrInstant = (v: unknown) => v === null || parseUtc(v) !== null

export function isEvent(v: unknown): v is CedEvent {
  if (!isObj(v)) return false
  if (!nonEmpty(v.id) || !nonEmpty(v.dedup_key) || !isStr(v.title) || !isStr(v.official_text) || !isStr(v.status)) return false
  if (!Number.isInteger(v.revision) || (v.revision as number) < 1) return false
  if (v.supersedes !== undefined && v.supersedes !== null && !isStr(v.supersedes)) return false
  const t = v.times
  if (!isObj(t) || parseUtc(t.first_seen_at) === null || !nullOrInstant(t.occurred_at)) return false
  const s = v.sources
  if (!Array.isArray(s) || s.length === 0) return false
  const s0: unknown = s[0]
  if (!isObj(s0) || !nonEmpty(s0.source_id) || !isStr(s0.url) || !isStr(s0.affiliation)) return false
  if (!isObj(v.provenance) || !isStr(v.provenance.confidence)) return false
  if (v.importance !== undefined && (!isObj(v.importance) || !isStr(v.importance.tier))) return false
  return true
}

export interface ParsedEvents {
  response: EventsResponse
  /** Events dropped because they were malformed. */
  skipped: number
}

/** null when the envelope is not an EventsResponse (garbage: fail closed). */
export function parseEventsResponse(v: unknown): ParsedEvents | null {
  if (!isObj(v)) return null
  if (parseUtc(v.generated_at) === null || !nonEmpty(v.cursor) || typeof v.has_more !== 'boolean' || !Array.isArray(v.events)) return null
  const events = v.events.filter(isEvent)
  return {
    response: { generated_at: v.generated_at as string, cursor: v.cursor, has_more: v.has_more, events },
    skipped: v.events.length - events.length,
  }
}

function isSourceStatus(v: unknown): v is SourceStatus {
  if (!isObj(v)) return false
  if (!nonEmpty(v.source_id) || !isStr(v.name) || !isStr(v.affiliation) || !isStr(v.health) || !isStr(v.detail)) return false
  if (typeof v.cadence_s !== 'number' || !(v.cadence_s > 0)) return false
  if (typeof v.freshness_slo_s !== 'number' || !(v.freshness_slo_s > 0)) return false
  if (!nullOrInstant(v.last_success_at) || !nullOrInstant(v.last_attempt_at)) return false
  if (typeof v.stale !== 'boolean') return false
  return true
}

/** null unless the whole status is well formed: a source whose health cannot be read fails the response. */
export function parseStatusResponse(v: unknown): StatusResponse | null {
  if (!isObj(v) || parseUtc(v.generated_at) === null || !Array.isArray(v.sources)) return null
  if (!v.sources.every(isSourceStatus)) return null
  return { generated_at: v.generated_at as string, sources: v.sources }
}

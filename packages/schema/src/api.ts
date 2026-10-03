// The public read API v1 (docs/ARCHITECTURE.md "API contract"): the shapes the Worker serves and the web app reads.
// One definition for both sides, so a field renamed on one side fails the other's typecheck.
import type { Affiliation, CedEvent, FeatureId, Utc } from './types.js'

/** An adapter's verdict on one poll (packages/adapters). Drives /api/v1/status and the "stale" label. */
export type HealthStatus =
  | 'ok' // parsed, and at least one item seen
  | 'empty' // parsed, a valid "nothing here" answer (e.g. an empty Public Inspection desk)
  | 'not_modified' // 304: nothing to parse
  | 'drift' // the body is not the shape we recorded: nothing from it was published (fail closed)
  | 'error' // HTTP error status, network failure, or an error page posing as data

/**
 * GET /api/v1/events?since=<cursor>&limit=<n>
 * - without `since`: the newest `limit` events (default 100, max 500), newest first by
 *   the shared order key `orderKeyMs` (packages/schema/src/order.ts): occurred_at; else source_published_at when it is
 *   not later than first_seen_at; else the start (Eastern) of an earlier publication DAY in result.publication_date;
 *   else first_seen_at (a White House executive-order post has no signing time and a published FR document has only a
 *   date, so a backfill does not put week-old items on top). Ties are broken by id DESCENDING (the page sorts the
 *   same way). `has_more` is always false here in v1: older events are not paged yet.
 * - with a `since` this API did not issue (e.g. after a store reset): HTTP 400 {error}; call again without since.
 * - with `since`: every event stored or revised after that cursor (up to `limit`, oldest change first), so a client
 *   that polls with the last cursor it got never misses one; `has_more` says to call again at once with the new cursor.
 */
export interface EventsResponse {
  /** When the answer was served (clients treat an answer more than 5 min old as stale). */
  generated_at: Utc
  /** Opaque; pass back as `since`. Never goes backwards. */
  cursor: string
  events: CedEvent[]
  has_more: boolean
}

export interface SourceStatus {
  source_id: string
  name: string
  affiliation: Affiliation
  features: FeatureId[]
  /** The cadence the Worker polls at now (seconds): the FASTEST of the source's endpoints, each of which may poll on its
   * own cadence (D-046). */
  cadence_s: number
  /** The LARGEST stale threshold in force among the source's endpoints (seconds). Each endpoint is stale after its own
   * threshold: max(the source's SLO, 2x that endpoint's cadence now or one of its off-hours intervals ago) (D-039;
   * Phase 1 exit criterion 4); `stale` below carries that per-endpoint verdict. A client that compares last_success_at
   * (the stalest endpoint's) with this value therefore never flags a healthy slow endpoint, and learns of a stopped fast
   * endpoint only through `stale`. */
  freshness_slo_s: number
  last_attempt_at: Utc | null
  last_success_at: Utc | null
  /** Last poll that added or revised at least one event. */
  last_change_at: Utc | null
  health: HealthStatus | 'never_polled'
  /** Plain words, e.g. "HTML 404 page instead of JSON". */
  detail: string
  error_streak: number
  items_24h: number
  /** Median first_seen_at - occurred_at over the last 24 h of events (seconds); null until n >= 1. */
  median_latency_s: number | null
  /** Computed by the server at generated_at, PER ENDPOINT: true when any endpoint never succeeded, or its last success
   * is older than that endpoint's own threshold (see freshness_slo_s). */
  stale: boolean
}

/** GET /api/v1/status */
export interface StatusResponse {
  generated_at: Utc
  sources: SourceStatus[]
}

// The adapter contract. An adapter is a PURE function (no network, no clock, no platform APIs): one recorded or live
// HTTP response in, normalized events + one health signal out. The same code runs in the Cloudflare Worker, in Node
// on the home PC, and in tests that replay fixtures/ (docs/ARCHITECTURE.md, .claude/skills/add-source/SKILL.md).
import type { Affiliation, CedEvent, FeatureId, HealthStatus } from '@ced/schema'

export type { HealthStatus }

/** One HTTP response as the poller saw it (or as a fixture recorded it). */
export interface FetchedResponse {
  /** The URL that was requested (a cache-buster query, if any, included). */
  url: string
  status: number
  /** Lower-cased header names. */
  headers: Record<string, string>
  /** The decoded body text. */
  body: string
  /** When the response arrived (UTC, Z). Becomes first_seen_at / retrieved_at of every event in it. */
  fetchedAt: string
}

/** Drives /api/v1/status and the "stale" label; it is never a feed item. */
export interface HealthSignal {
  source_id: string
  endpoint: string
  status: HealthStatus
  /** Plain words for the status page, e.g. "HTML 404 page instead of JSON". */
  detail: string
  /** Items the payload contained (before any head-only cut). */
  items_seen: number
}

export interface AdapterOutput {
  events: CedEvent[]
  health: HealthSignal
}

export type Validator = 'etag' | 'if-modified-since' | 'body-hash'

/** One URL a source polls. */
export interface Endpoint {
  /** Stable id within the source, e.g. "pi_current". */
  id: string
  /** The URL without any cache-buster. */
  url: string
  /** Which conditional-GET validator this endpoint honours (docs/SOURCES.md row; docs/TRAPS.md). */
  validator: Validator
  /** Append a unique query parameter on every call (FR API: shared caches serve copies up to ~104 min old). */
  cacheBust?: boolean
  /** This endpoint's own poll cadence (seconds), overriding the source's `cadence` (D-046): a large list that changes
   * once a day (FR documents.json, the daily issue) need not be fetched every minute beside a fast one (Public
   * Inspection). The endpoint's "stale" threshold follows its own cadence (workers/api policy.ts). */
  cadence?: { business_s: number; off_s: number }
  /** The adapter's output for an UNCHANGED body depends on the poll's calendar day in Eastern time (fr.api
   * documents_newest: a document listed before its publication date is "scheduled" until that day, D-055). The poller
   * then keys the body by its hash AND that day, so an unchanged body is parsed again once per Eastern day. */
  dayDependent?: boolean
}

export interface SourceDefinition {
  source_id: string
  /** Human name for the status page. */
  name: string
  affiliation: Affiliation
  license: string
  features: FeatureId[]
  endpoints: Endpoint[]
  /** Poll cadence in seconds (business hours / otherwise). Phase 1 runs on a 1-minute cron, so 60 is the floor. */
  cadence: { business_s: number; off_s: number }
  /** A source is "stale" when it has not been polled successfully for this long (Phase 1 exit: 2x cadence). */
  freshness_slo_s: number
  /** Max requests per hour to this host, all endpoints together. */
  rate_budget_per_h: number
  parse(endpointId: string, res: FetchedResponse): AdapterOutput
}

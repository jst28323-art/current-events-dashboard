// The adapter contract. An adapter is a PURE function (no network, no clock, no platform APIs): one recorded or live
// HTTP response in, normalized events + one health signal out. The same code runs in the Cloudflare Worker, in Node
// on the home PC, and in tests that replay fixtures/ (docs/ARCHITECTURE.md, .claude/skills/add-source/SKILL.md).
import type { Affiliation, CedEvent, FeatureId, HealthStatus } from '@ced/schema'
import type { MemberVotesRecord } from '@ced/schema/v02'

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

/** A URL another endpoint's parse asks the poller to fetch (dynamic endpoints; scratch/phase2/DESIGN.md §3.0, R-3). */
export interface Target {
  /** The id of the dynamic endpoint this URL belongs to (its `dynamic.from` is the endpoint just parsed). */
  endpoint: string
  url: string
}

export interface AdapterOutput {
  events: CedEvent[]
  health: HealthSignal
  /** Dynamic-endpoint targets (Endpoint.dynamic). Only for endpoints whose `dynamic.from` is the endpoint just parsed.
   * Not read by the Phase 1 poller; P2.2 (PollerDOs) implements it. */
  targets?: Target[]
  /** Side records (member votes, DESIGN §2). Never feed events; the Hub ignores them until the vote inspector (§2.4). */
  records?: MemberVotesRecord[]
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
  /** Dynamic endpoint (DESIGN §3.0; P2.2 poller, never on a live SOURCES endpoint: live_list.test.ts): its URLs come
   * from the latest accepted (ok/empty) parse of endpoint `from` (AdapterOutput.targets for this endpoint id), which
   * REPLACES this endpoint's target set; a drift/error/not_modified parse keeps the old set. `url` is then a
   * human-readable template; the poller rejects any target not matching `urlPattern` (full match) and any beyond
   * `maxTargets`. A target new to the set is due at once; afterwards it polls at this endpoint's cadence with its own
   * validator state and body hash. A target never fetched successfully is KEPT even when a later parse drops it, until
   * one fetch of it is accepted (a burst of new rolls between accepted index parses is never lost). */
  dynamic?: { from: string; urlPattern: string; maxTargets: number }
  /** An HTTP status that means "not posted yet" for this endpoint (house.clerk.floor next day: 404). The poller records
   * health `empty` with "not posted yet", never parses it, never backs off for it. P2.2 poller only. */
  notYetStatus?: number
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
  /** Calendar awareness for P2.2 (not read by the Phase 1 poller; never on a live SOURCES entry): in recess (next
   * convene of `chamber` more than 24 h away, from house.clerk.floor / senate.schedule) every endpoint polls at
   * `recess_s`; while the chamber is sitting (convened and not adjourned), at business cadence whatever the clock says
   * (votes run at 2:49 AM: roll2025_143). */
  calendar?: { chamber: 'house' | 'senate'; recess_s: number }
  parse(endpointId: string, res: FetchedResponse): AdapterOutput
}

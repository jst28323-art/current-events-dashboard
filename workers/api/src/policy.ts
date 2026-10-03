// Polite-polling policy (CLAUDE.md "Polite polling"): the constants and pure rules the poll loop and the HubDO share.
// Pure functions only, so tests pin each rule without a network or a clock.
import type { Endpoint, SourceDefinition } from '@ced/adapters'
import type { SourceInfo } from './hub.js'

/** The User-Agent every upstream request carries (CLAUDE.md: some government WAFs reject a bare bot UA). */
export const USER_AGENT =
  'Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/jst28323-art/current-events-dashboard)'

/** The query parameter appended when `endpoint.cacheBust` is set (FR API shared caches: docs/SOURCES.md row fr.api).
 * "_" is the name verified live on both FR endpoints (Age 0 with it, 2026-10-02); other names are untested there. */
export const CACHE_BUST_PARAM = '_'

/** The exact "<param>=<stamp>" token a cache-busted URL carries, or null. Some APIs echo the request's query string into
 * the body (FR documents.json copies it into next_page_url), so the body hash must ignore that token, or every poll
 * looks like a new body and is parsed again. */
export function cacheBustToken(url: string): string | null {
  const m = new RegExp(`[?&](${CACHE_BUST_PARAM}=[0-9]+)(?:&|#|$)`).exec(url)
  return m ? m[1]! : null
}

/** Give up on an upstream request after this long (HouseLive hangs on future days: docs/TRAPS.md). */
export const FETCH_TIMEOUT_MS = 15_000

/** Exponential backoff after an HTTP error or network failure: base doubles per consecutive failure, capped. */
export const BACKOFF_BASE_S = 120
export const BACKOFF_CAP_S = 15 * 60
/** A Retry-After longer than this is treated as this (a bogus header must not silence a source for good). */
export const RETRY_AFTER_CAP_S = 24 * 60 * 60
/** Drift (a body the adapter cannot read: a format change, or a WAF / challenge page served as a 200) is retried at the
 * endpoint's cadence this many times in a row, so a one-off truncated body costs nothing; after that it backs off like
 * an error (backoffMs(streak - this)), so a persistent block is not hammered every minute. */
export const DRIFT_RETRIES_BEFORE_BACKOFF = 2

/** The cron fires about once a minute, not exactly: an endpoint is due this much before its cadence has fully elapsed. */
export const CRON_SLACK_S = 20

/** Polling "business hours" for SourceDefinition.cadence: Mon-Fri, [start, end) hours, America/New_York. */
export const BUSINESS_HOURS_ET = { startHour: 6, endHour: 22 } as const

/** The newest-events page and feed size bounds (EventsResponse docs). */
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 500
export const FEED_SIZE = 100

const etParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: 'numeric',
  hourCycle: 'h23',
})

/** True on weekdays between BUSINESS_HOURS_ET.startHour and endHour, Eastern time (DST handled by Intl). */
export function isBusinessHours(nowMs: number): boolean {
  let weekday = ''
  let hour = -1
  for (const p of etParts.formatToParts(new Date(nowMs))) {
    if (p.type === 'weekday') weekday = p.value
    else if (p.type === 'hour') hour = Number(p.value)
  }
  if (weekday === 'Sat' || weekday === 'Sun') return false
  return hour >= BUSINESS_HOURS_ET.startHour && hour < BUSINESS_HOURS_ET.endHour
}

/** The cadence an endpoint polls on: its own (Endpoint.cadence, D-046), else its source's. */
export function endpointCadence(def: SourceDefinition, ep?: Endpoint): { business_s: number; off_s: number } {
  return ep?.cadence ?? def.cadence
}

/** The cadence (seconds) an endpoint (or, without one, the source) is polled at, at this instant. */
export function cadenceFor(def: SourceDefinition, nowMs: number, ep?: Endpoint): number {
  const c = endpointCadence(def, ep)
  return isBusinessHours(nowMs) ? c.business_s : c.off_s
}

/** The "stale" threshold in force (seconds) for one endpoint (D-039, applied per endpoint): the source's own SLO, but
 * never less than twice the cadence the endpoint is polled at, now or one of its off-hours intervals ago. An endpoint
 * polled every 15 min at night (fr.api) is not stale after 2 min, and the morning switch to the business cadence does
 * not flash "stale" before the first business-hours poll has run. Without `ep`: the source's own cadence.
 * (Phase 1 exit criterion 4: a stopped poller shows stale within 2x its cadence.) */
export function effectiveFreshnessS(def: SourceDefinition, nowMs: number, ep?: Endpoint): number {
  const offS = endpointCadence(def, ep).off_s
  const cadence = Math.max(cadenceFor(def, nowMs, ep), cadenceFor(def, nowMs - offS * 1000, ep))
  return Math.max(def.freshness_slo_s, 2 * cadence)
}

/** The static part of each definition, as the HubDO needs it for /api/v1/status (functions do not cross RPC). Each
 * endpoint carries its own cadence and stale threshold in force (the HubDO judges staleness per endpoint); the source
 * row reports the FASTEST endpoint cadence and the LARGEST endpoint threshold, so a client that compares the stalest
 * endpoint's last success with that threshold never flags a healthy slow endpoint (packages/schema api.ts). */
export function describeSources(sources: readonly SourceDefinition[], nowMs: number): SourceInfo[] {
  return sources.map((d) => {
    const endpoints = d.endpoints.map((e) => ({
      id: e.id,
      cadence_s: cadenceFor(d, nowMs, e),
      freshness_slo_s: effectiveFreshnessS(d, nowMs, e),
    }))
    return {
      source_id: d.source_id,
      name: d.name,
      affiliation: d.affiliation,
      features: [...d.features],
      cadence_s: endpoints.length ? Math.min(...endpoints.map((e) => e.cadence_s)) : cadenceFor(d, nowMs),
      freshness_slo_s: endpoints.length ? Math.max(...endpoints.map((e) => e.freshness_slo_s)) : effectiveFreshnessS(d, nowMs),
      endpoints,
    }
  })
}

/** The most requests the poll loop can send for one endpoint (or, without `ep`, all of a source's endpoints) in one
 * budget window (a UTC clock hour). An endpoint is due once its cadence minus CRON_SLACK_S has passed since its last
 * claim (the claim time is also what the budget counts), so a window holds at most ceil(3600 / that gap) of its
 * requests, and never more than the 60 cron runs; the faster of its business / off-hours cadences counts. Backoff only
 * ever delays a request. A source fits when this is within its rate_budget_per_h, so no endpoint is ever starved by
 * another's share of the budget (checked for every registered source in test/policy.test.ts). */
export function peakRequestsPerHour(def: SourceDefinition, ep?: Endpoint): number {
  if (!ep) return def.endpoints.reduce((n, e) => n + peakRequestsPerHour(def, e), 0)
  const c = endpointCadence(def, ep)
  const gapS = Math.max(1, Math.min(c.business_s, c.off_s) - CRON_SLACK_S)
  return Math.min(60, Math.ceil(3600 / gapS))
}

/** The URL actually requested: the endpoint URL, plus a unique cache-buster when the endpoint asks for one. Appended
 * as text (not via URLSearchParams) so the source's own query string is sent byte for byte as recorded. */
export function requestUrl(endpoint: Endpoint, nowMs: number): string {
  if (!endpoint.cacheBust) return endpoint.url
  const hash = endpoint.url.indexOf('#')
  const base = hash >= 0 ? endpoint.url.slice(0, hash) : endpoint.url
  return `${base}${base.includes('?') ? '&' : '?'}${CACHE_BUST_PARAM}=${nowMs}`
}

/** Retry-After as seconds from `nowMs` (delta-seconds or an HTTP-date); null when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number): number | null {
  if (value == null) return null
  const v = value.trim()
  if (/^\d+$/.test(v)) return Number(v)
  const t = Date.parse(v)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.ceil((t - nowMs) / 1000))
}

/** The key the poll loop stores for an accepted body: its sha-256 hex, tagged with the code version that parsed it
 * (`<sha>@<version>`) when the version is known. A new deploy therefore re-fetches (without validators) and re-parses
 * every endpoint once, so a parser fix applies at once instead of waiting for the upstream body to change. */
export function bodyKey(sha256Hex: string, codeVersion: string | undefined): string {
  return codeVersion ? `${sha256Hex}@${codeVersion}` : sha256Hex
}

/** True when a stored body key was made by this code version (always true when no version is known). */
export function sameCodeVersion(storedKey: string, codeVersion: string | undefined): boolean {
  const at = storedKey.indexOf('@')
  return (at < 0 ? undefined : storedKey.slice(at + 1)) === (codeVersion || undefined)
}

/** How long to back off after the `streak`-th consecutive failure: exponential with equal jitter (jitter in [0, 1)),
 * capped at BACKOFF_CAP_S, and never shorter than a (capped) Retry-After. */
export function backoffMs(streak: number, jitter: number, retryAfterS: number | null): number {
  const expS = Math.min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2 ** Math.max(0, streak - 1))
  const j = Math.min(Math.max(jitter, 0), 1)
  let ms = (expS / 2 + (j * expS) / 2) * 1000
  if (retryAfterS != null) ms = Math.max(ms, Math.min(retryAfterS, RETRY_AFTER_CAP_S) * 1000)
  return Math.round(ms)
}

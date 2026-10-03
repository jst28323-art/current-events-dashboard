// The source-reachability probe: for each target, one plain GET, then a conditional GET with If-None-Match (only if
// an ETag came back) and one with If-Modified-Since (only if Last-Modified came back), recording which got a 304.
// Conditional requests follow only a usable answer (2xx AND the expected document): never a 4xx/5xx, a block page or a
// body that failed mid-read (review R4).
// Pure apart from the injected deps (fetch, clock, sleep), so tests drive it with a fake fetch and no network.
//
// Polite polling (CLAUDE.md): the project User-Agent, one request in flight at a time (every request is awaited before
// the next starts), a per-host gap, a timeout, a per-run request cap, the fr.api cache-buster, no further requests to a
// host that answered 429/503 in this run, and a per-host back-off that OUTLIVES the run (review R3): Retry-After when
// the host sent one, else 30 min doubling while 429/503 repeats. The caller (the Durable Object) stores it.
import type { Expect, ProbeTarget } from './targets.js'

export const USER_AGENT = 'Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/jst28323-art/current-events-dashboard)'
export const TIMEOUT_MS = 20_000
/** Minimum wait between the end of one request to a host and the start of the next (scotus robots: Crawl-delay 1). */
export const HOST_GAP_MS = 1_500
/** Bodies are streamed and counted, never kept; stop counting past this (the largest target is ~1.5 MB). */
export const MAX_BODY_BYTES = 8 * 1024 * 1024
/** A 429/503 without a usable Retry-After: back off this long, doubled for each repeat (CLAUDE.md: exponential). */
export const BACKOFF_BASE_MS = 30 * 60_000
/** Cap for that doubling (a Retry-After the host sends is honoured as given, uncapped). */
export const BACKOFF_MAX_MS = 8 * 3_600_000
/** Bytes kept for the format and XML-root checks (the stored body_head is shorter). */
const HEAD_BYTES = 2048
const HEAD_CHARS = 160
const HEADER_CHARS = 200

export type RequestKind = 'base' | 'if-none-match' | 'if-modified-since'

/** One HTTP request as the probe saw it. Times are Date.now() deltas around I/O (valid in Workers). */
export interface RequestRow {
  run: number
  source_id: string
  endpoint_id: string
  tier: number
  kind: RequestKind
  /** The URL as requested (cache-buster included). */
  url: string
  /** false: not sent (the host answered 429/503 earlier in this run); `error` says why. */
  sent: boolean
  requested_at: string
  /** null when no HTTP answer arrived (network error, timeout). */
  status: number | null
  error: string | null
  not_modified: boolean
  /** The validator value sent (If-None-Match / If-Modified-Since); null on the base request. */
  sent_validator: string | null
  content_type: string | null
  content_length: string | null
  /** Decoded body bytes counted (base requests only; conditional bodies are cancelled unread). */
  bytes: number | null
  body_truncated: boolean
  headers_ms: number | null
  wall_ms: number | null
  etag: string | null
  last_modified: string | null
  age: string | null
  cache_control: string | null
  cf_cache_status: string | null
  cf_mitigated: string | null
  server: string | null
  retry_after: string | null
  /** Set only when a redirect changed the URL. */
  final_url: string | null
  /** The first characters of the body (base requests), so a block page posing as a 200 is visible. */
  body_head: string | null
  /**
   * Base requests: a 2xx whose body is the expected document (format, XML root, page marker: checkBody). false for any
   * other status; null on conditional requests and when the body could not be read (`error` says why).
   */
  shape_ok: boolean | null
  /** Why a 2xx failed the body check (e.g. "XML root <xml>, expected <rollcall-vote>"); null otherwise. */
  shape_why: string | null
}

/** A host that answered 429/503: no request goes to it before until_ms, in this run or a later one. */
export type HostBackoff = {
  host: string
  until_ms: number
  /** The status that asked us to wait. */
  status: number
  /** The Retry-After header as sent (null: none, so the exponential back-off applied). */
  retry_after: string | null
  /** Consecutive 429/503 answers (the doubling counter); reset by any other answer. */
  strikes: number
  set_at_ms: number
}

export interface ProbeDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  now: () => number
  sleep: (ms: number) => Promise<void>
}

export interface ProbeOptions {
  /** Requests this run may still send. */
  cap: number
  /** Persist each row as soon as it exists (the Durable Object writes it before the next request starts). */
  onRow?: (row: RequestRow) => void | Promise<void>
  /** Per-host back-off carried over from earlier runs (host -> state). Updated in place. */
  backoff?: Map<string, HostBackoff>
  /** Persist a back-off change as soon as it happens (null: cleared by a normal answer). */
  onBackoff?: (host: string, state: HostBackoff | null) => void | Promise<void>
}

export interface ProbeRunResult {
  rows: RequestRow[]
  requests: number
  capped: boolean
}

const BACKOFF_STATUSES = new Set([429, 503])
/** U+FEFF byte-order mark (built from its code point: an escape in source gets rewritten by some tools). */
const BOM = String.fromCharCode(0xfeff)

export function withCacheBuster(url: string, nowMs: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}_=${nowMs}`
}

/** Does the start of a body look like the expected format? (HTTP 200 is not success: docs/TRAPS.md.) */
export function shapeOk(expect: Expect, head: string): boolean {
  const h = (head.startsWith(BOM) ? head.slice(1) : head).trimStart()
  const lower = h.toLowerCase()
  const html = /^(<!--[\s\S]*?-->\s*)*<!doctype html|^(<!--[\s\S]*?-->\s*)*<html[\s>]/.test(lower)
  switch (expect) {
    case 'json':
      return h.startsWith('{') || h.startsWith('[')
    case 'xml':
      return h.startsWith('<') && !html
    case 'html':
      return html
    case 'hls':
      return h.startsWith('#EXTM3U')
  }
}

/**
 * The first element name of an XML document: after a BOM, whitespace, the XML declaration and other processing
 * instructions, comments and a DOCTYPE (with an internal subset). null when the head ends before an element starts.
 */
export function xmlRootName(head: string): string | null {
  let s = (head.startsWith(BOM) ? head.slice(1) : head).trimStart()
  for (;;) {
    if (s.startsWith('<?')) {
      const end = s.indexOf('?>')
      if (end < 0) return null
      s = s.slice(end + 2).trimStart()
    } else if (s.startsWith('<!--')) {
      const end = s.indexOf('-->')
      if (end < 0) return null
      s = s.slice(end + 3).trimStart()
    } else if (s.startsWith('<!')) {
      const m = /^<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i.exec(s)
      if (!m) return null
      s = s.slice(m[0].length).trimStart()
    } else {
      return /^<([A-Za-z_][\w.:-]*)/.exec(s)?.[1] ?? null
    }
  }
}

export interface BodyCheck {
  ok: boolean
  /** Why the body is not the expected document; null when ok. */
  why: string | null
}

/**
 * Is a 2xx body the document the target serves, not just something in its format (review R2)? The format (shapeOk),
 * then for XML the root element (`target.root`), then the page marker (`target.marker`), which the caller looks for in
 * the whole body (`markerSeen`; null when the target has no marker). docs/TRAPS.md: "HTTP 200 does not mean success".
 */
export function checkBody(t: Pick<ProbeTarget, 'expect' | 'root' | 'marker'>, head: string, markerSeen: boolean | null): BodyCheck {
  if (!shapeOk(t.expect, head)) {
    const start = (head.startsWith(BOM) ? head.slice(1) : head).trimStart().slice(0, 40)
    return { ok: false, why: `not ${t.expect.toUpperCase()}: starts ${JSON.stringify(start)}` }
  }
  if (t.expect === 'xml' && t.root !== undefined) {
    const root = xmlRootName(head)
    if (root === null || !t.root.includes(root)) return { ok: false, why: `XML root <${root ?? '?'}>, expected <${t.root.join('> or <')}>` }
  }
  if (t.marker !== undefined && markerSeen !== true) {
    return { ok: false, why: `${t.expect.toUpperCase()} without the page marker ${JSON.stringify(t.marker)}` }
  }
  return { ok: true, why: null }
}

/** Retry-After as delay-seconds or an HTTP-date, in ms from now (never negative); null when absent or unreadable. */
export function retryAfterMs(value: string | null, nowMs: number): number | null {
  if (value === null) return null
  const v = value.trim()
  if (/^\d+$/.test(v)) return Number(v) * 1000
  const at = Date.parse(v)
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs)
}

function clip(v: string | null, n = HEADER_CHARS): string | null {
  return v === null ? null : v.length > n ? v.slice(0, n) : v
}

export function describeError(e: unknown): string {
  const s = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  return s.slice(0, 300)
}

/**
 * Streams the body: counts bytes, keeps the head, and (only when a marker is given) looks for the marker in the whole
 * body as it streams, carrying the last marker.length - 1 characters across chunks. The body itself is never kept.
 */
async function countBody(
  res: Response, marker: string | null,
): Promise<{ bytes: number; head: string; truncated: boolean; markerSeen: boolean | null }> {
  if (!res.body) return { bytes: 0, head: '', truncated: false, markerSeen: marker === null ? null : false }
  const reader = res.body.getReader()
  const headParts: Uint8Array[] = []
  let headLen = 0
  let bytes = 0
  let truncated = false
  const decoder = marker === null ? null : new TextDecoder('utf-8')
  let carry = ''
  let seen = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (headLen < HEAD_BYTES) {
      const part = value.subarray(0, HEAD_BYTES - headLen)
      headParts.push(part)
      headLen += part.byteLength
    }
    bytes += value.byteLength
    if (decoder !== null && marker !== null && !seen) {
      const text = carry + decoder.decode(value, { stream: true })
      if (text.includes(marker)) seen = true
      else carry = text.slice(Math.max(0, text.length - (marker.length - 1)))
    }
    if (bytes > MAX_BODY_BYTES) {
      truncated = true
      await reader.cancel()
      break
    }
  }
  const buf = new Uint8Array(headLen)
  let o = 0
  for (const p of headParts) {
    buf.set(p, o)
    o += p.byteLength
  }
  return { bytes, head: new TextDecoder('utf-8').decode(buf), truncated, markerSeen: marker === null ? null : seen }
}

function emptyRow(t: ProbeTarget, run: number, kind: RequestKind, url: string, at: number): RequestRow {
  return {
    run, source_id: t.source_id, endpoint_id: t.endpoint_id, tier: t.tier, kind, url, sent: true,
    requested_at: new Date(at).toISOString(), status: null, error: null, not_modified: false, sent_validator: null,
    content_type: null, content_length: null, bytes: null, body_truncated: false, headers_ms: null, wall_ms: null,
    etag: null, last_modified: null, age: null, cache_control: null, cf_cache_status: null, cf_mitigated: null,
    server: null, retry_after: null, final_url: null, body_head: null, shape_ok: null, shape_why: null,
  }
}

async function request(
  t: ProbeTarget, run: number, kind: RequestKind, deps: ProbeDeps, validator: string | null,
): Promise<RequestRow> {
  const start = deps.now()
  const url = t.cacheBust ? withCacheBuster(t.url, start) : t.url
  const row = emptyRow(t, run, kind, url, start)
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: '*/*' }
  if (kind === 'if-none-match' && validator !== null) headers['If-None-Match'] = validator
  if (kind === 'if-modified-since' && validator !== null) headers['If-Modified-Since'] = validator
  row.sent_validator = validator
  try {
    // cache: 'no-store' keeps Cloudflare's own cache out of the measurement (the upstream answers, not our edge).
    const res = await deps.fetch(url, { method: 'GET', headers, redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
    row.headers_ms = deps.now() - start
    row.status = res.status
    row.not_modified = res.status === 304
    const h = (name: string) => clip(res.headers.get(name))
    row.content_type = h('content-type')
    row.content_length = h('content-length')
    row.etag = h('etag')
    row.last_modified = h('last-modified')
    row.age = h('age')
    row.cache_control = h('cache-control')
    row.cf_cache_status = h('cf-cache-status')
    row.cf_mitigated = h('cf-mitigated')
    row.server = h('server')
    row.retry_after = h('retry-after')
    if (res.url && res.url !== url) row.final_url = clip(res.url, 500)
    if (kind === 'base' && res.status !== 304) {
      const ok2xx = res.status >= 200 && res.status < 300
      // The marker is looked for only in a 2xx body (any other status fails on the status alone).
      const b = await countBody(res, ok2xx && t.marker !== undefined ? t.marker : null)
      row.bytes = b.bytes
      row.body_truncated = b.truncated
      row.body_head = b.head.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, HEAD_CHARS)
      const check = ok2xx ? checkBody(t, b.head, b.markerSeen) : null
      row.shape_ok = check !== null && check.ok
      row.shape_why = check?.why ?? null
    } else {
      await res.body?.cancel()
    }
  } catch (e) {
    row.error = describeError(e)
  }
  row.wall_ms = deps.now() - start
  return row
}

const iso = (ms: number) => new Date(ms).toISOString()

function waitReason(b: HostBackoff): string {
  if (b.retry_after === null) return `no Retry-After, back-off #${b.strikes}`
  if (retryAfterMs(b.retry_after, b.set_at_ms) === null) return `unreadable Retry-After ${JSON.stringify(b.retry_after)}, back-off #${b.strikes}`
  return `Retry-After ${JSON.stringify(b.retry_after)}`
}

function notSent(t: ProbeTarget, run: number, kind: RequestKind, at: number, why: string): RequestRow {
  const row = emptyRow(t, run, kind, t.url, at)
  row.sent = false
  row.error = why
  return row
}

/** Probe the targets one request at a time. Never sends more than `opts.cap` requests. */
export async function probeTargets(
  targets: readonly ProbeTarget[], run: number, deps: ProbeDeps, opts: ProbeOptions,
): Promise<ProbeRunResult> {
  const rows: RequestRow[] = []
  const hostLastEnd = new Map<string, number>()
  const backedOff = new Map<string, number>() // host -> status that told us to back off for the rest of this run
  const backoff = opts.backoff ?? new Map<string, HostBackoff>() // host -> back-off that outlives the run
  let requests = 0
  let capped = false

  const keep = async (row: RequestRow) => {
    rows.push(row)
    if (opts.onRow) await opts.onRow(row)
  }
  const saveBackoff = async (host: string, state: HostBackoff | null) => {
    if (state === null) backoff.delete(host)
    else backoff.set(host, state)
    if (opts.onBackoff) await opts.onBackoff(host, state)
  }

  const send = async (t: ProbeTarget, kind: RequestKind, validator: string | null): Promise<RequestRow | null> => {
    const host = new URL(t.url).host
    const inRun = backedOff.get(host)
    if (inRun !== undefined) {
      await keep(notSent(t, run, kind, deps.now(), `not sent: ${host} answered ${inRun} earlier in this run`))
      return null
    }
    const prior = backoff.get(host)
    const now = deps.now()
    if (prior !== undefined && now < prior.until_ms) {
      await keep(notSent(t, run, kind, now, `not sent: ${host} answered ${prior.status} at ${iso(prior.set_at_ms)}; ${waitReason(prior)}: waiting until ${iso(prior.until_ms)}`))
      return null
    }
    if (requests >= opts.cap) {
      capped = true
      return null
    }
    const last = hostLastEnd.get(host)
    if (last !== undefined) {
      const wait = HOST_GAP_MS - (deps.now() - last)
      if (wait > 0) await deps.sleep(wait)
    }
    requests++
    const row = await request(t, run, kind, deps, validator)
    const end = deps.now()
    hostLastEnd.set(host, end)
    if (row.status !== null && BACKOFF_STATUSES.has(row.status)) {
      backedOff.set(host, row.status)
      // Honour Retry-After as sent; without one, 30 min doubling per consecutive 429/503. No jitter: the cron's fixed
      // 30-min tick is the only moment a request can go out, so jitter would not spread anything.
      const strikes = (prior?.strikes ?? 0) + 1
      const wait = retryAfterMs(row.retry_after, end) ?? Math.min(BACKOFF_BASE_MS * 2 ** (strikes - 1), BACKOFF_MAX_MS)
      await saveBackoff(host, { host, until_ms: end + wait, status: row.status, retry_after: row.retry_after, strikes, set_at_ms: end })
    } else if (row.status !== null && prior !== undefined) {
      await saveBackoff(host, null) // any other answer ends the back-off and resets the doubling
    }
    await keep(row)
    return row
  }

  for (const t of targets) {
    if (capped) break
    const base = await send(t, 'base', null)
    // Validators are measured only on a usable answer: never after a 4xx/5xx, a block page posing as a 200, or a body
    // that failed mid-read (review R4).
    if (!base || base.shape_ok !== true) continue
    if (base.etag !== null) await send(t, 'if-none-match', base.etag)
    if (base.last_modified !== null) await send(t, 'if-modified-since', base.last_modified)
  }
  return { rows, requests, capped }
}

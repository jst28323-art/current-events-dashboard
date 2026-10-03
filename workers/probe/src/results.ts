// Turns the probe's stored rows into the GET /results summaries. Pure functions (tested without a Durable Object).
// Every verdict is a count over what was actually measured, never a guess: "not probed yet" until a request was sent.
import type { RequestRow } from './probe.js'
import type { ProbeTarget, SkippedSource } from './targets.js'

export type Reachable = 'yes' | 'partial' | 'blocked' | 'not-found' | 'no' | 'not probed yet'

export interface ValidatorCounts {
  sent: number
  got_304: number
  got_200: number
}

export interface EndpointSummary {
  source_id: string
  endpoint_id: string
  tier: number
  url: string
  expect: string
  base: {
    /** Plain GETs sent. */
    n: number
    /** Plain GETs not sent because the host had asked to wait (429/503 back-off). */
    not_sent: number
    /** Every HTTP status that arrived, including those whose body then failed to read. */
    statuses: Record<string, number>
    /** no_answer + body_errors. */
    errors: number
    /** No HTTP answer at all (network error, timeout before the headers). */
    no_answer: number
    /** Headers arrived, then reading the body failed (timeout, reset): review R5. */
    body_errors: number
    /** Error names over both kinds (the text before the first ":", e.g. TimeoutError). */
    error_kinds: Record<string, number>
    /** Why 2xx answers failed the body check (checkBody's reason), with counts: review R2. */
    shape_failures: Record<string, number>
    /** 2xx AND the expected document (format, XML root, page marker: probe.ts checkBody). */
    ok_shape: number
    median_wall_ms: number | null
    max_wall_ms: number | null
    median_bytes: number | null
    content_types: string[]
    servers: string[]
    cf_cache_status: string[]
    cache_control: string[]
    max_age_s: number | null
    etag_seen: number
    last_modified_seen: number
    last_error: string | null
    last_body_head: string | null
  }
  if_none_match: ValidatorCounts
  if_modified_since: ValidatorCounts
  cf_reachable: Reachable
  /** Paste-ready text for the docs/SOURCES.md columns. */
  sources_md: { cf_reachable: string; validator_304: string }
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2)
}

export function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!
}

const BLOCK_STATUSES = new Set([401, 403, 407, 429, 451])

/** One verdict per endpoint, from the plain (base) requests that were sent. */
export function reachableVerdict(base: RequestRow[]): Reachable {
  const sent = base.filter((r) => r.sent)
  if (sent.length === 0) return 'not probed yet'
  const ok = sent.filter((r) => r.shape_ok === true).length
  if (ok === sent.length) return 'yes'
  if (ok > 0) return 'partial'
  if (sent.some((r) => (r.status !== null && BLOCK_STATUSES.has(r.status)) || r.cf_mitigated !== null)) return 'blocked'
  if (sent.every((r) => r.status === 404 || r.status === 410)) return 'not-found'
  return 'no'
}

function countValidator(rows: RequestRow[]): ValidatorCounts {
  const sent = rows.filter((r) => r.sent && r.status !== null)
  return { sent: sent.length, got_304: sent.filter((r) => r.status === 304).length, got_200: sent.filter((r) => r.status === 200).length }
}

export function validatorText(inm: ValidatorCounts, ims: ValidatorCounts, base: { n: number; ok_shape: number }): string {
  if (base.n === 0) return 'not probed yet'
  // Conditional requests follow only a usable answer (probe.ts), so with none there was nothing to measure.
  if (base.ok_shape === 0) return 'not measured (no usable answer)'
  if (inm.sent === 0 && ims.sent === 0) return 'none offered (no ETag, no Last-Modified)'
  const parts: string[] = []
  parts.push(inm.sent > 0 ? `ETag→304 ${inm.got_304}/${inm.sent}` : 'no ETag')
  parts.push(ims.sent > 0 ? `IMS→304 ${ims.got_304}/${ims.sent}` : 'no Last-Modified')
  return parts.join('; ')
}

const uniq = (xs: Array<string | null>): string[] => [...new Set(xs.filter((x): x is string => x !== null))]

const count = (xs: string[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const x of xs) out[x] = (out[x] ?? 0) + 1
  return out
}

/** "TimeoutError: The operation was aborted" -> "TimeoutError". */
export const errorKind = (e: string): string => (e.split(':')[0] ?? e).trim().slice(0, 60)

const is2xx = (s: number) => s >= 200 && s < 300

/**
 * What came back instead of a usable answer, per status, in the order first seen: e.g. "HTTP 403x2",
 * "HTTP 200x1 not the expected document", "1 body read failed after HTTP 200 (TimeoutError)", "2 no answer".
 */
function whatCameBack(sentBase: RequestRow[], statuses: Record<string, number>): string[] {
  const parts: string[] = []
  for (const s of Object.keys(statuses)) {
    const mine = sentBase.filter((r) => String(r.status) === s)
    const clean = mine.filter((r) => r.error === null)
    const usable = clean.filter((r) => r.shape_ok === true).length
    if (is2xx(Number(s))) {
      if (usable > 0) parts.push(`HTTP ${s}x${usable}`)
      if (clean.length - usable > 0) parts.push(`HTTP ${s}x${clean.length - usable} not the expected document`)
    } else if (clean.length > 0) {
      parts.push(`HTTP ${s}x${clean.length}`)
    }
    const failed = mine.filter((r) => r.error !== null)
    if (failed.length > 0) parts.push(`${failed.length} body read failed after HTTP ${s} (${uniq(failed.map((r) => errorKind(r.error!))).join(', ')})`)
  }
  const none = sentBase.filter((r) => r.status === null).length
  if (none > 0) parts.push(`${none} no answer`)
  return parts
}

export function summarizeEndpoint(t: ProbeTarget, rows: RequestRow[], dateSpan: string): EndpointSummary {
  const mine = rows.filter((r) => r.source_id === t.source_id && r.endpoint_id === t.endpoint_id)
  const base = mine.filter((r) => r.kind === 'base')
  const sentBase = base.filter((r) => r.sent)
  const answered = sentBase.filter((r) => r.status !== null)
  const statuses: Record<string, number> = {}
  for (const r of answered) statuses[String(r.status)] = (statuses[String(r.status)] ?? 0) + 1
  const ages = answered.map((r) => (r.age === null ? NaN : Number(r.age))).filter((n) => Number.isFinite(n))
  const last = sentBase[sentBase.length - 1]
  const noAnswer = sentBase.length - answered.length
  const bodyErrors = answered.filter((r) => r.error !== null).length
  const b = {
    n: sentBase.length,
    not_sent: base.length - sentBase.length,
    statuses,
    errors: noAnswer + bodyErrors,
    no_answer: noAnswer,
    body_errors: bodyErrors,
    error_kinds: count(sentBase.filter((r) => r.error !== null).map((r) => errorKind(r.error!))),
    shape_failures: count(sentBase.filter((r) => r.shape_why !== null && r.shape_why !== undefined).map((r) => r.shape_why!)),
    ok_shape: sentBase.filter((r) => r.shape_ok === true).length,
    median_wall_ms: median(answered.map((r) => r.wall_ms ?? 0)),
    max_wall_ms: answered.length ? Math.max(...answered.map((r) => r.wall_ms ?? 0)) : null,
    median_bytes: median(answered.filter((r) => r.bytes !== null).map((r) => r.bytes!)),
    content_types: uniq(answered.map((r) => r.content_type)),
    servers: uniq(answered.map((r) => r.server)),
    cf_cache_status: uniq(answered.map((r) => r.cf_cache_status)),
    cache_control: uniq(answered.map((r) => r.cache_control)),
    max_age_s: ages.length ? Math.max(...ages) : null,
    etag_seen: answered.filter((r) => r.etag !== null).length,
    last_modified_seen: answered.filter((r) => r.last_modified !== null).length,
    last_error: last?.error ?? null,
    last_body_head: last?.body_head ?? null,
  }
  const inm = countValidator(mine.filter((r) => r.kind === 'if-none-match'))
  const ims = countValidator(mine.filter((r) => r.kind === 'if-modified-since'))
  const verdict = reachableVerdict(base)
  // Anything short of "yes" says what came back instead (e.g. "HTTP 403x16", "1 body read failed after HTTP 200
  // (TimeoutError)", "2 no answer").
  const seen = whatCameBack(sentBase, statuses)
  const why = verdict === 'yes' || seen.length === 0 ? '' : `; ${seen.join(', ')}`
  const notProbed = b.not_sent > 0 ? `${verdict} (${b.not_sent} not sent while the host asked to wait)` : verdict
  const reachText = verdict === 'not probed yet' ? notProbed : `${verdict} (${b.ok_shape}/${b.n} usable 2xx${why}, ${dateSpan})`
  return {
    source_id: t.source_id, endpoint_id: t.endpoint_id, tier: t.tier, url: t.url, expect: t.expect,
    base: b, if_none_match: inm, if_modified_since: ims, cf_reachable: verdict,
    sources_md: { cf_reachable: reachText, validator_304: validatorText(inm, ims, b) },
  }
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/**
 * The paste-ready docs/SOURCES.md probe table (GET /results/sources.md), built only from measured summaries so nobody
 * transcribes numbers by hand. "parse CPU" is "—": a Worker cannot read CPU time; it is measured in Node (see report).
 */
export function sourcesMd(
  targets: readonly ProbeTarget[], summaries: readonly EndpointSummary[], skipped: readonly SkippedSource[],
  header: { generated_at: string; runs: number; span: string },
): string {
  const lines = [
    `<!-- generated by ced-probe GET /results/sources.md at ${header.generated_at}: ${header.runs} cron runs, ${header.span} -->`,
    '| source_id | endpoint | URL probed | CF reachable | validator 304 | median wall ms · bytes | parse CPU |',
    '|---|---|---|---|---|---|---|',
  ]
  targets.forEach((t, i) => {
    const s = summaries[i]!
    const url = `${t.url}${t.cacheBust ? ' (+ `_=<ms>` cache-buster)' : ''}`
    const size = s.base.median_wall_ms === null ? '—' : `${s.base.median_wall_ms} ms · ${s.base.median_bytes === null ? '—' : `${s.base.median_bytes} B`}`
    lines.push(`| \`${t.source_id}\` | \`${t.endpoint_id}\` | ${cell(url)} | ${cell(s.sources_md.cf_reachable)} | ${cell(s.sources_md.validator_304)} | ${size} | — |`)
  })
  lines.push('', `Not probed: ${skipped.map((s) => `\`${s.source_id}\` (${cell(s.reason)})`).join('; ')}.`)
  return `${lines.join('\n')}\n`
}

// ---- CPU experiments

export type CpuRow = {
  id: number
  kind: string // alarm | fetch | scheduled
  ref: string
  level_ms: number
  iterations: number
  phase: string // started | done | retry | no_retry | unavailable | caller_ok | caller_error
  at: string
  started_id: number | null
  retry_count: number | null
  checksum: number | null
  detail: string | null
}

export interface CpuLevelSummary {
  kind: string
  level_ms: number
  iterations: number
  started: number
  done: number
  /** Started rows with no done row: the run was cut off (a CPU-limit kill leaves exactly this). */
  started_without_done: number
  retries_seen: number
  other: Record<string, number>
}

export function summarizeCpu(rows: CpuRow[], nowMs: number, inFlightGraceMs = 120_000): CpuLevelSummary[] {
  const doneFor = new Set(rows.filter((r) => r.phase === 'done' && r.started_id !== null).map((r) => r.started_id))
  const key = (r: CpuRow) => `${r.kind}|${r.level_ms}`
  const out = new Map<string, CpuLevelSummary>()
  for (const r of rows) {
    let s = out.get(key(r))
    if (!s) {
      s = { kind: r.kind, level_ms: r.level_ms, iterations: r.iterations, started: 0, done: 0, started_without_done: 0, retries_seen: 0, other: {} }
      out.set(key(r), s)
    }
    if (r.phase === 'started') {
      s.started++
      const recent = nowMs - Date.parse(r.at) < inFlightGraceMs
      if (!doneFor.has(r.id) && !recent) s.started_without_done++
    } else if (r.phase === 'done') s.done++
    else if (r.phase === 'retry') s.retries_seen++
    else s.other[r.phase] = (s.other[r.phase] ?? 0) + 1
  }
  return [...out.values()].sort((a, b) => (a.kind === b.kind ? a.level_ms - b.level_ms : a.kind < b.kind ? -1 : 1))
}

/** Plain words per kind: the lowest level that was ever cut off, or "none cut off". */
export function cpuVerdicts(levels: CpuLevelSummary[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const kind of [...new Set(levels.map((l) => l.kind))]) {
    const mine = levels.filter((l) => l.kind === kind).sort((a, b) => a.level_ms - b.level_ms)
    const ran = mine.filter((l) => l.started > 0)
    if (ran.length === 0) {
      out[kind] = 'no run started yet'
      continue
    }
    const cut = ran.find((l) => l.started_without_done > 0)
    const maxDone = [...ran].reverse().find((l) => l.done > 0)
    out[kind] = cut
      ? `cut off at ${cut.level_ms} ms target (${cut.started_without_done}/${cut.started} runs); highest level completed at least once: ${maxDone ? `${maxDone.level_ms} ms` : 'none'}`
      : `none cut off; highest level completed: ${maxDone ? `${maxDone.level_ms} ms` : 'none'} (${ran.reduce((n, l) => n + l.done, 0)} runs done)`
  }
  return out
}

// ---- Alarm timing

export type AlarmRow = {
  id: number
  task_id: number | null
  task_kind: string | null
  planned_ms: number | null
  entered_ms: number
  delta_ms: number | null
  is_retry: number
  retry_count: number
  info_scheduled_ms: number | null
  action: string
}

export interface JitterSummary {
  n: number
  min_ms: number | null
  median_ms: number | null
  p90_ms: number | null
  max_ms: number | null
}

export function summarizeJitter(rows: AlarmRow[]): { jitter_alarms: JitterSummary; all_first_attempts: JitterSummary; retries_seen: number } {
  const s = (xs: number[]): JitterSummary => ({
    n: xs.length, min_ms: xs.length ? Math.min(...xs) : null, median_ms: median(xs), p90_ms: quantile(xs, 0.9), max_ms: xs.length ? Math.max(...xs) : null,
  })
  const first = rows.filter((r) => r.is_retry === 0 && r.delta_ms !== null)
  return {
    jitter_alarms: s(first.filter((r) => r.task_kind === 'jitter').map((r) => r.delta_ms!)),
    all_first_attempts: s(first.map((r) => r.delta_ms!)),
    retries_seen: rows.filter((r) => r.is_retry === 1).length,
  }
}

// The /results summaries (src/results.ts): verdicts are counts over what was measured, never guesses.
import { describe, expect, test } from 'vitest'
import type { RequestRow } from '../src/probe.js'
import { cpuVerdicts, reachableVerdict, sourcesMd, summarizeCpu, summarizeEndpoint, summarizeJitter, type AlarmRow, type CpuRow } from '../src/results.js'
import type { ProbeTarget } from '../src/targets.js'

const T: ProbeTarget = { source_id: 's', endpoint_id: 'e', tier: 1, url: 'https://s.example/x', expect: 'json' }

function row(over: Partial<RequestRow>): RequestRow {
  return {
    run: 1, source_id: 's', endpoint_id: 'e', tier: 1, kind: 'base', url: T.url, sent: true, requested_at: '2026-10-03T00:00:00.000Z',
    status: 200, error: null, not_modified: false, sent_validator: null, content_type: 'application/json', content_length: null,
    bytes: 10, body_truncated: false, headers_ms: 5, wall_ms: 20, etag: null, last_modified: null, age: null, cache_control: null,
    cf_cache_status: null, cf_mitigated: null, server: null, retry_after: null, final_url: null, body_head: '{}', shape_ok: true, shape_why: null, ...over,
  }
}

describe('reachableVerdict', () => {
  test('counts usable answers only', () => {
    expect(reachableVerdict([])).toBe('not probed yet')
    expect(reachableVerdict([row({}), row({})])).toBe('yes')
    expect(reachableVerdict([row({}), row({ status: 503, shape_ok: false })])).toBe('partial')
    expect(reachableVerdict([row({ status: 403, shape_ok: false })])).toBe('blocked')
    expect(reachableVerdict([row({ status: 200, shape_ok: false, cf_mitigated: 'challenge' })])).toBe('blocked')
    expect(reachableVerdict([row({ status: 404, shape_ok: false })])).toBe('not-found')
    expect(reachableVerdict([row({ status: null, shape_ok: null, error: 'TimeoutError: x' })])).toBe('no')
    // A 200 HTML page where JSON was expected is not "reachable".
    expect(reachableVerdict([row({ status: 200, shape_ok: false })])).toBe('no')
    // Rows that were never sent do not count.
    expect(reachableVerdict([row({ sent: false, status: null, shape_ok: null })])).toBe('not probed yet')
  })
})

describe('summarizeEndpoint', () => {
  test('paste-ready SOURCES.md text: reachability and which validator got a 304', () => {
    const rows = [
      row({ etag: '"a"', last_modified: 'x' }),
      row({ kind: 'if-none-match', status: 200, shape_ok: null, bytes: null }),
      row({ kind: 'if-modified-since', status: 304, not_modified: true, shape_ok: null, bytes: null }),
      row({ run: 4, etag: '"a"', last_modified: 'x', age: '120' }),
      row({ run: 4, kind: 'if-none-match', status: 200, shape_ok: null, bytes: null }),
      row({ run: 4, kind: 'if-modified-since', status: 304, not_modified: true, shape_ok: null, bytes: null }),
      row({ source_id: 'other' }),
    ]
    const s = summarizeEndpoint(T, rows, '2026-10-03')
    expect(s.base.n).toBe(2)
    expect(s.base.statuses).toEqual({ '200': 2 })
    expect(s.base.max_age_s).toBe(120)
    expect(s.if_none_match).toEqual({ sent: 2, got_304: 0, got_200: 2 })
    expect(s.if_modified_since).toEqual({ sent: 2, got_304: 2, got_200: 0 })
    expect(s.cf_reachable).toBe('yes')
    expect(s.sources_md.cf_reachable).toBe('yes (2/2 usable 2xx, 2026-10-03)')
    expect(s.sources_md.validator_304).toBe('ETag→304 0/2; IMS→304 2/2')
  })

  test('a blocked endpoint says what came back instead', () => {
    const s = summarizeEndpoint(T, [row({ status: 403, shape_ok: false }), row({ status: null, shape_ok: null, error: 'TimeoutError: x' })], 'd')
    expect(s.sources_md.cf_reachable).toBe('blocked (0/2 usable 2xx; HTTP 403x1, 1 no answer, d)')
  })

  // Review R5 (2026-10-02): a 200 whose body read then failed (timeout, reset) was summarised as a plain "HTTP 200x1".
  test('a body read that failed after the headers is reported as such, wherever it sits in the rows (review R5)', () => {
    const cutOff = row({ status: 200, shape_ok: null, bytes: null, error: 'TimeoutError: The operation was aborted due to timeout' })
    const one = summarizeEndpoint(T, [cutOff], '2026-10-02')
    expect(one.base).toMatchObject({ n: 1, errors: 1, no_answer: 0, body_errors: 1, statuses: { '200': 1 }, error_kinds: { TimeoutError: 1 } })
    expect(one.sources_md.cf_reachable).toBe('no (0/1 usable 2xx; 1 body read failed after HTTP 200 (TimeoutError), 2026-10-02)')
    // Not the last row, mixed with a usable answer and a request that got no answer at all.
    const mixed = summarizeEndpoint(T, [cutOff, row({ status: null, shape_ok: null, error: 'TypeError: Network connection lost' }), row({})], 'd')
    expect(mixed.base).toMatchObject({ n: 3, errors: 2, no_answer: 1, body_errors: 1, error_kinds: { TimeoutError: 1, TypeError: 1 } })
    expect(mixed.base.last_error).toBeNull()
    expect(mixed.sources_md.cf_reachable).toBe('partial (1/3 usable 2xx; HTTP 200x1, 1 body read failed after HTTP 200 (TimeoutError), 1 no answer, d)')
  })

  // Since review R4 conditional requests follow only a usable answer, so "none sent" no longer means "none offered".
  // Found 2026-10-02 running the fixed bundle in plain workerd: a 429 and a Clerk 200 error body (which carried an
  // ETag) were both reported as "none offered (no ETag, no Last-Modified)".
  test('validators are "not measured" when no answer was usable, never "none offered"', () => {
    const blocked = summarizeEndpoint(T, [row({ status: 429, shape_ok: false, etag: null })], 'd')
    expect(blocked.sources_md.validator_304).toBe('not measured (no usable answer)')
    const errorBody = summarizeEndpoint(T, [row({ shape_ok: false, shape_why: 'XML root <xml>, expected <rollcall-vote>', etag: '"c"' })], 'd')
    expect(errorBody.sources_md.validator_304).toBe('not measured (no usable answer)')
    // A usable answer without validators is "none offered"; one with an ETag whose conditional request was sent is counted.
    expect(summarizeEndpoint(T, [row({}), row({ status: 403, shape_ok: false, etag: '"x"' })], 'd').sources_md.validator_304).toBe('none offered (no ETag, no Last-Modified)')
  })

  // Review R2 (2026-10-02): a 200 that is not the expected document says so, and why.
  test('a 2xx that failed the body check is counted apart from the usable ones, with the reason', () => {
    const s = summarizeEndpoint(T, [row({}), row({ shape_ok: false, shape_why: 'XML root <xml>, expected <rollcall-vote>' })], 'd')
    expect(s.cf_reachable).toBe('partial')
    expect(s.base.shape_failures).toEqual({ 'XML root <xml>, expected <rollcall-vote>': 1 })
    expect(s.sources_md.cf_reachable).toBe('partial (1/2 usable 2xx; HTTP 200x1, HTTP 200x1 not the expected document, d)')
  })

  test('sourcesMd prints one paste-ready table row per target, from the summaries only', () => {
    const fr: ProbeTarget = { ...T, source_id: 'fr.api', endpoint_id: 'pi', url: 'https://fr.example/c.json', cacheBust: true }
    const rows = [row({ etag: '"a"' }), row({ kind: 'if-none-match', status: 304, not_modified: true, shape_ok: null, bytes: null })]
    const targets = [T, fr]
    const summaries = targets.map((t) => summarizeEndpoint(t, rows, '2026-10-03'))
    const md = sourcesMd(targets, summaries, [{ source_id: 'congress.api', tier: 2, reason: 'needs a key | not granted' }], { generated_at: 'G', runs: 3, span: '2026-10-03' })
    expect(md.split('\n')).toEqual([
      '<!-- generated by ced-probe GET /results/sources.md at G: 3 cron runs, 2026-10-03 -->',
      '| source_id | endpoint | URL probed | CF reachable | validator 304 | median wall ms · bytes | parse CPU |',
      '|---|---|---|---|---|---|---|',
      '| `s` | `e` | https://s.example/x | yes (1/1 usable 2xx, 2026-10-03) | ETag→304 1/1; no Last-Modified | 20 ms · 10 B | — |',
      '| `fr.api` | `pi` | https://fr.example/c.json (+ `_=<ms>` cache-buster) | not probed yet | not probed yet | — | — |',
      '',
      'Not probed: `congress.api` (needs a key \\| not granted).',
      '',
    ])
  })

  test('no validator offered, and not probed yet', () => {
    expect(summarizeEndpoint(T, [row({})], 'd').sources_md.validator_304).toBe('none offered (no ETag, no Last-Modified)')
    const none = summarizeEndpoint(T, [], 'd')
    expect(none.cf_reachable).toBe('not probed yet')
    expect(none.sources_md).toEqual({ cf_reachable: 'not probed yet', validator_304: 'not probed yet' })
  })
})

describe('summarizeCpu', () => {
  const base = { ref: 'task:1', iterations: 100, at: '2026-10-03T00:00:00.000Z', started_id: null, retry_count: 0, checksum: null, detail: null }
  const NOW = Date.parse('2026-10-03T01:00:00Z')
  test('a started row without a done row is a cut-off run; a retry row is counted', () => {
    const rows: CpuRow[] = [
      { ...base, id: 1, kind: 'alarm', level_ms: 5, phase: 'started' },
      { ...base, id: 2, kind: 'alarm', level_ms: 5, phase: 'done', started_id: 1, checksum: 9 },
      { ...base, id: 3, kind: 'alarm', level_ms: 60, phase: 'started' },
      { ...base, id: 4, kind: 'alarm', level_ms: 60, phase: 'retry', retry_count: 1 },
      { ...base, id: 5, kind: 'scheduled', level_ms: 0, phase: 'started' },
      { ...base, id: 6, kind: 'scheduled', level_ms: 0, phase: 'done', started_id: 5 },
      { ...base, id: 7, kind: 'fetch', level_ms: 0, phase: 'unavailable' },
    ]
    const levels = summarizeCpu(rows, NOW)
    expect(levels.find((l) => l.kind === 'alarm' && l.level_ms === 5)).toMatchObject({ started: 1, done: 1, started_without_done: 0 })
    expect(levels.find((l) => l.kind === 'alarm' && l.level_ms === 60)).toMatchObject({ started: 1, done: 0, started_without_done: 1, retries_seen: 1 })
    expect(levels.find((l) => l.kind === 'fetch')).toMatchObject({ started: 0, other: { unavailable: 1 } })
    const v = cpuVerdicts(levels)
    expect(v['alarm']).toBe('cut off at 60 ms target (1/1 runs); highest level completed at least once: 5 ms')
    expect(v['scheduled']).toMatch(/^none cut off; highest level completed: 0 ms/)
    expect(v['fetch']).toBe('no run started yet')
  })
  test('a run started within the grace window is still in flight, not cut off', () => {
    const recent = new Date(NOW - 10_000).toISOString()
    const levels = summarizeCpu([{ ...base, id: 1, kind: 'alarm', level_ms: 5, phase: 'started', at: recent }], NOW)
    expect(levels[0]!.started_without_done).toBe(0)
  })
})

describe('summarizeJitter', () => {
  test('first attempts of the dedicated jitter alarms; retries counted apart', () => {
    const a = (id: number, delta: number, kind = 'jitter', isRetry = 0): AlarmRow => ({
      id, task_id: id, task_kind: kind, planned_ms: 1000, entered_ms: 1000 + delta, delta_ms: delta, is_retry: isRetry, retry_count: isRetry, info_scheduled_ms: 1000, action: kind,
    })
    const s = summarizeJitter([a(1, 10), a(2, 30), a(3, 20), a(4, 500, 'cpu'), a(5, 9000, 'cpu', 1)])
    expect(s.jitter_alarms).toEqual({ n: 3, min_ms: 10, median_ms: 20, p90_ms: 30, max_ms: 30 })
    expect(s.all_first_attempts.n).toBe(4)
    expect(s.retries_seen).toBe(1)
  })
})

// The request logic (src/probe.ts) against a fake upstream: row shape, 304 detection per validator, the cache-buster,
// the User-Agent, errors, back-off, one request in flight, the per-host gap and the per-run cap.
import { describe, expect, test } from 'vitest'
import rollErrorBody from '../../../fixtures/house.clerk.votes/2026-10-02/roll315_NEGATIVE_error_body.xml?raw'
import rollBody from '../../../fixtures/house.clerk.votes/2026-10-02/roll314.xml?raw'
import weekMissingBody from '../../../fixtures/house.docs.floor/2026-10-02/billsthisweek_20260928_NEGATIVE_file_not_found.html?raw'
import weekBody from '../../../fixtures/house.docs.floor/2026-10-02/billsthisweek_20260914.xml?raw'
import livePage from '../../../fixtures/wh.live/2026-10-02/live_page_not_live.html?raw'
import {
  BACKOFF_BASE_MS, checkBody, HOST_GAP_MS, probeTargets, retryAfterMs, shapeOk, USER_AGENT, xmlRootName, type HostBackoff, type RequestRow,
} from '../src/probe.js'
import { TARGETS, type ProbeTarget } from '../src/targets.js'
import { canonical, fakeClock, fakeServer, type FakeRoute } from './fakes.js'

const A: ProbeTarget = { source_id: 'x.src', endpoint_id: 'a', tier: 1, url: 'https://a.example/feed.xml', expect: 'xml' }
const B: ProbeTarget = { source_id: 'x.src', endpoint_id: 'b', tier: 1, url: 'https://a.example/other.xml', expect: 'xml' }
const C: ProbeTarget = { source_id: 'y.src', endpoint_id: 'c', tier: 2, url: 'https://c.example/data.json', expect: 'json' }
const FR: ProbeTarget = { source_id: 'fr.api', endpoint_id: 'pi', tier: 1, url: 'https://fr.example/current.json', expect: 'json', cacheBust: true }

const ETAG = '"abc123"'
const LM = 'Fri, 02 Oct 2026 15:00:00 GMT'
const XML = '<?xml version="1.0"?><rss><channel><item/></channel></rss>'
const VALIDATED = { 'content-type': 'application/rss+xml', etag: ETAG, 'last-modified': LM, age: '42', 'cache-control': 'max-age=300', 'cf-cache-status': 'HIT', server: 'cloudflare' }

const run = (targets: ProbeTarget[], server: ReturnType<typeof fakeServer>, clock = fakeClock(), cap = 40) =>
  probeTargets(targets, 7, { fetch: server.fetch, now: clock.now, sleep: clock.sleep }, { cap })

describe('probeTargets', () => {
  test('records one row per request with the measured fields, and detects 304 on both validators', async () => {
    const server = fakeServer({ [A.url]: { body: XML, headers: VALIDATED, honourInm: true, honourIms: true } })
    const { rows, requests } = await run([A], server)
    expect(requests).toBe(3)
    expect(rows.map((r) => r.kind)).toEqual(['base', 'if-none-match', 'if-modified-since'])
    const [base, inm, ims] = rows as [RequestRow, RequestRow, RequestRow]
    expect(base).toMatchObject({
      run: 7, source_id: 'x.src', endpoint_id: 'a', tier: 1, sent: true, status: 200, error: null, not_modified: false,
      content_type: 'application/rss+xml', bytes: XML.length, etag: ETAG, last_modified: LM, age: '42',
      cache_control: 'max-age=300', cf_cache_status: 'HIT', server: 'cloudflare', shape_ok: true, sent_validator: null,
    })
    expect(base.body_head).toBe(XML)
    expect(typeof base.wall_ms).toBe('number')
    expect(base.wall_ms).toBeGreaterThan(0)
    expect(Number.isNaN(Date.parse(base.requested_at))).toBe(false)
    expect(inm).toMatchObject({ status: 304, not_modified: true, sent_validator: ETAG, bytes: null, shape_ok: null })
    expect(ims).toMatchObject({ status: 304, not_modified: true, sent_validator: LM })
    // The validators really went out as headers.
    expect(server.calls[1]!.headers.get('if-none-match')).toBe(ETAG)
    expect(server.calls[1]!.headers.get('if-modified-since')).toBeNull()
    expect(server.calls[2]!.headers.get('if-modified-since')).toBe(LM)
    expect(server.calls[2]!.headers.get('if-none-match')).toBeNull()
  })

  test('tells apart the validator a source honours (IMS 304, ETag ignored)', async () => {
    const server = fakeServer({ [A.url]: { body: XML, headers: VALIDATED, honourInm: false, honourIms: true } })
    const { rows } = await run([A], server)
    const inm = rows.find((r) => r.kind === 'if-none-match')!
    const ims = rows.find((r) => r.kind === 'if-modified-since')!
    expect(inm).toMatchObject({ status: 200, not_modified: false })
    expect(ims).toMatchObject({ status: 304, not_modified: true })
  })

  test('sends no conditional request when the source returned no validator', async () => {
    const server = fakeServer({ [C.url]: { body: '{"a":1}', headers: { 'content-type': 'application/json' } } })
    const { rows, requests } = await run([C], server)
    expect(requests).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'base', status: 200, etag: null, last_modified: null, shape_ok: true })
  })

  test('every request carries the project User-Agent; fr.api gets a fresh cache-buster on every call', async () => {
    const server = fakeServer({ [FR.url]: { body: '{"results":[]}', headers: { etag: ETAG }, honourInm: true } })
    const { rows } = await run([FR, C], server)
    for (const c of server.calls) expect(c.headers.get('user-agent')).toBe(USER_AGENT)
    const frCalls = server.calls.filter((c) => canonical(c.url) === FR.url)
    expect(frCalls).toHaveLength(2)
    for (const c of frCalls) expect(c.url).toMatch(/\?_=\d+$/)
    expect(new Set(frCalls.map((c) => c.url)).size).toBe(2)
    expect(rows.filter((r) => r.source_id === 'fr.api').every((r) => /\?_=\d+$/.test(r.url))).toBe(true)
    // Targets without cacheBust are requested exactly as listed.
    expect(server.calls.find((c) => c.url.startsWith('https://c.example'))!.url).toBe(C.url)
  })

  test('a timeout or network error is a row with status null and the error, and no follow-up request', async () => {
    const server = fakeServer({ [A.url]: { throws: () => new DOMException('The operation was aborted due to timeout', 'TimeoutError') } })
    const { rows, requests } = await run([A], server)
    expect(requests).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: null, sent: true, shape_ok: null })
    expect(rows[0]!.error).toMatch(/TimeoutError/)
  })

  test('a 429 stops further requests to that host in this run (recorded as not sent)', async () => {
    const server = fakeServer({ [A.url]: { status: 429, body: 'slow down', headers: { etag: ETAG, 'retry-after': '120' } }, [C.url]: { body: '[]' } })
    const { rows } = await run([A, B, C], server)
    expect(server.calls.map((c) => c.url)).toEqual([A.url, C.url])
    expect(rows.find((r) => r.endpoint_id === 'a')).toMatchObject({ status: 429, retry_after: '120' })
    expect(rows.find((r) => r.endpoint_id === 'b')).toMatchObject({ sent: false, status: null })
    expect(rows.find((r) => r.endpoint_id === 'b')!.error).toMatch(/answered 429/)
  })

  test('one request in flight at a time, with a gap between requests to the same host', async () => {
    const server = fakeServer({ [A.url]: { body: XML, headers: VALIDATED, honourInm: true, honourIms: true }, [B.url]: { body: XML } })
    const clock = fakeClock()
    await run([A, B, C], server, clock)
    expect(server.maxInFlight()).toBe(1)
    // A base -> A INM -> A IMS -> B base are four requests to a.example: three gaps. C is another host: no wait.
    expect(clock.sleeps).toHaveLength(3)
    for (const s of clock.sleeps) {
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThanOrEqual(HOST_GAP_MS)
    }
  })

  test('never sends more than the per-run cap', async () => {
    const server = fakeServer({ [A.url]: { body: XML, headers: VALIDATED, honourInm: true, honourIms: true } })
    const { requests, capped } = await run([A, C], server, fakeClock(), 2)
    expect(server.calls).toHaveLength(2)
    expect(requests).toBe(2)
    expect(capped).toBe(true)
  })

  test('a 200 that is an HTML page where JSON was expected is not usable (HTTP 200 is not success)', async () => {
    const server = fakeServer({ [C.url]: { body: '<!DOCTYPE html><html><body>Access denied</body></html>', headers: { 'content-type': 'text/html' } } })
    const { rows } = await run([C], server)
    expect(rows[0]).toMatchObject({ status: 200, shape_ok: false })
    expect(rows[0]!.body_head).toMatch(/Access denied/)
  })
})

describe('shapeOk', () => {
  test('recognises each expected format and rejects HTML posing as data', () => {
    expect(shapeOk('json', ' \n{"a":1}')).toBe(true)
    expect(shapeOk('json', '<html>')).toBe(false)
    expect(shapeOk('xml', `${String.fromCharCode(0xfeff)}<?xml version="1.0"?><rss/>`)).toBe(true)
    expect(shapeOk('xml', '<!DOCTYPE html><html>')).toBe(false)
    expect(shapeOk('html', '<!doctype html><html lang="en">')).toBe(true)
    expect(shapeOk('html', '{"error":"x"}')).toBe(false)
    expect(shapeOk('hls', '#EXTM3U\n#EXT-X-VERSION:3')).toBe(true)
    expect(shapeOk('hls', '<?xml version="1.0"?><Error>')).toBe(false)
  })
})

// ---- Review R2 (2026-10-02): HTTP 200 is not success. Each target names what a working answer contains (an XML root
// element, an HTML page marker), checked against recorded fixtures (fixtures/*/2026-10-02, never edited).
describe('the body check: the expected document, not just the expected format (review R2)', () => {
  const target = (source_id: string, endpoint_id: string) => TARGETS.find((t) => t.source_id === source_id && t.endpoint_id === endpoint_id)!
  const one = async (t: ProbeTarget, route: FakeRoute) => (await run([t], fakeServer({ [t.url]: route }))).rows[0]!
  const BLOCK_PAGES = {
    access_denied: '<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Request blocked</body></html>',
    challenge: '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body></body></html>',
    file_not_found: weekMissingBody,
  }

  test('the recorded Clerk 200 error body is not a roll call; the recorded roll is', async () => {
    const t = target('house.clerk.votes', 'roll')
    const bad = await one(t, { body: rollErrorBody, headers: { 'content-type': 'text/xml', etag: '"e"' } })
    expect(bad).toMatchObject({ status: 200, shape_ok: false })
    expect(bad.shape_why).toBe('XML root <xml>, expected <rollcall-vote>')
    const good = await one(t, { body: rollBody, headers: { 'content-type': 'text/xml' } })
    expect(good).toMatchObject({ status: 200, shape_ok: true, shape_why: null })
  })

  test('the recorded docs.house.gov 200 "File Not Found" page is not the week file; the recorded week is', async () => {
    const t = target('house.docs.floor', 'billsthisweek')
    expect(await one(t, { body: weekMissingBody })).toMatchObject({ status: 200, shape_ok: false })
    expect(await one(t, { body: weekBody })).toMatchObject({ status: 200, shape_ok: true })
  })

  test('an HTML target needs its page marker: the recorded White House live page has it 204 KB in; block pages do not', async () => {
    const live = target('wh.live', 'live_page')
    // Delivered in 1000-byte chunks, so the marker can straddle two of them.
    expect(await one(live, { body: livePage, chunkBytes: 1000 })).toMatchObject({
      status: 200, shape_ok: true, shape_why: null, bytes: new TextEncoder().encode(livePage).byteLength,
    })
    for (const t of TARGETS.filter((x) => x.expect === 'html')) {
      for (const [name, page] of Object.entries(BLOCK_PAGES)) {
        const row = await one(t, { body: page })
        expect(row.shape_ok, `${t.source_id}/${t.endpoint_id} vs ${name}`).toBe(false)
        expect(row.shape_why, name).toBe(`HTML without the page marker ${JSON.stringify(t.marker)}`)
      }
    }
  })

  test('a marker split across two chunks is still found', async () => {
    const t: ProbeTarget = { source_id: 'x', endpoint_id: 'm', tier: 2, url: 'https://m.example/p', expect: 'html', marker: 'MARKER-0123456789' }
    const body = `<!DOCTYPE html><html><body>${'x'.repeat(5000)}MARKER-0123456789</body></html>`
    const at = body.indexOf('MARKER')
    for (const size of [at + 3, at + 9, 7, 1]) expect((await one(t, { body, chunkBytes: size })).shape_ok, `chunks of ${size}`).toBe(true)
    expect((await one(t, { body: body.replace('MARKER-0123456789', 'MARKER-012345678'), chunkBytes: 7 })).shape_ok).toBe(false)
  })

  test('XML-looking error pages are rejected for XML targets (an XHTML page after an XML prolog, an HTML fragment)', () => {
    const t = target('senate.lis.votes', 'vote_menu')
    const xhtml =
      '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd"><html><head><title>Error</title>'
    expect(checkBody(t, xhtml, null)).toEqual({ ok: false, why: 'XML root <html>, expected <vote_summary>' })
    expect(checkBody(t, '<head><title>404</title></head><body>Not found</body>', null)).toEqual({ ok: false, why: 'XML root <head>, expected <vote_summary>' })
    expect(checkBody(t, '<?xml version="1.0"?><vote_summary><votes/></vote_summary>', null)).toEqual({ ok: true, why: null })
    // A feed target accepts any syndication root, nothing else.
    const feed = target('fed.feeds', 'press_all')
    for (const ok of ['<rss version="2.0">', '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">', '<rdf:RDF xmlns:rdf="x">']) {
      expect(checkBody(feed, ok, null).ok, ok).toBe(true)
    }
    expect(checkBody(feed, '<error>quota</error>', null).ok).toBe(false)
  })

  test('xmlRootName skips a BOM, the prolog, processing instructions, comments and a DOCTYPE', () => {
    const bom = String.fromCharCode(0xfeff)
    expect(xmlRootName(`${bom}<?xml version="1.0"?>\n<?xml-stylesheet href="a.xsl"?><!-- c --><!DOCTYPE x [<!ENTITY a "b">]>\n<rollcall-vote>`)).toBe('rollcall-vote')
    expect(xmlRootName('  <rdf:RDF>')).toBe('rdf:RDF')
    expect(xmlRootName('<!-- never closed')).toBeNull()
    expect(xmlRootName('{"a":1}')).toBeNull()
  })
})

// ---- Review R4 (2026-10-02): conditional requests only follow a usable answer.
describe('conditional requests (review R4)', () => {
  const VALIDATORS = { etag: ETAG, 'last-modified': LM }
  test.each([
    ['a 403 bot wall', { status: 403, body: '<html>Access Denied</html>' }],
    ['a 404', { status: 404, body: 'not found' }],
    ['a 500', { status: 500, body: 'oops' }],
    ['a 200 that is not the expected document', { status: 200, body: '<!DOCTYPE html><html>Access Denied</html>' }],
  ])('none after %s, even when it carries validators', async (_name, route) => {
    const server = fakeServer({ [A.url]: { ...route, headers: VALIDATORS } })
    const { rows, requests } = await run([A], server)
    expect(requests).toBe(1)
    expect(rows.map((r) => r.kind)).toEqual(['base'])
  })
})

// ---- Review R3 (2026-10-02): Retry-After (and the back-off without one) outlives the run.
describe('host back-off across runs (review R3)', () => {
  const HOUR = 3_600_000
  const at = (server: ReturnType<typeof fakeServer>, host: string) => server.calls.filter((c) => new URL(c.url).host === host).length

  test('a 429 with Retry-After: 7200 keeps the host unasked for 2 h, across runs; then it is asked again', async () => {
    const clock = fakeClock()
    const backoff = new Map<string, HostBackoff>()
    const saved: Array<[string, HostBackoff | null]> = []
    const opts = { cap: 40, backoff, onBackoff: (h: string, s: HostBackoff | null) => void saved.push([h, s]) }
    const deps = (s: ReturnType<typeof fakeServer>) => ({ fetch: s.fetch, now: clock.now, sleep: clock.sleep })

    const s1 = fakeServer({ [A.url]: { status: 429, body: 'slow down', headers: { 'retry-after': '7200' } }, [C.url]: { body: '[]' } })
    await probeTargets([A, C], 1, deps(s1), opts)
    expect(at(s1, 'a.example')).toBe(1)
    expect(backoff.get('a.example')).toMatchObject({ status: 429, retry_after: '7200', strikes: 1 })
    expect(saved.map(([h]) => h)).toEqual(['a.example'])

    clock.advance(HOUR / 2) // the next cron run
    const s2 = fakeServer({}, { status: 200, body: XML })
    const r2 = await probeTargets([A, B, C], 2, deps(s2), opts)
    expect(at(s2, 'a.example')).toBe(0)
    expect(at(s2, 'c.example')).toBe(1)
    const skipped = r2.rows.filter((r) => r.source_id === 'x.src')
    expect(skipped.map((r) => r.sent)).toEqual([false, false])
    expect(skipped[0]!.error).toMatch(/^not sent: a\.example answered 429 .*Retry-After "7200".* until /)

    clock.advance(HOUR + HOUR / 2 + 60_000) // 2 h 1 min after the 429
    const s3 = fakeServer({}, { status: 200, body: XML })
    await probeTargets([A], 3, deps(s3), opts)
    expect(at(s3, 'a.example')).toBe(1)
    expect(backoff.has('a.example')).toBe(false) // a normal answer clears the back-off
    expect(saved.at(-1)).toEqual(['a.example', null])
  })

  test('without Retry-After a 429/503 backs off 30 min, doubling while it repeats', async () => {
    const clock = fakeClock()
    const backoff = new Map<string, HostBackoff>()
    const server = fakeServer({ [A.url]: { status: 503, body: 'busy' } })
    const go = (r: number) => probeTargets([A], r, { fetch: server.fetch, now: clock.now, sleep: clock.sleep }, { cap: 40, backoff })
    await go(1)
    const first = backoff.get('a.example')!
    expect(first.strikes).toBe(1)
    expect(first.until_ms - first.set_at_ms).toBe(BACKOFF_BASE_MS)
    clock.advance(BACKOFF_BASE_MS / 2)
    await go(2) // still backed off: not sent
    expect(server.calls).toHaveLength(1)
    clock.advance(BACKOFF_BASE_MS / 2 + 1)
    await go(3)
    const second = backoff.get('a.example')!
    expect(second.strikes).toBe(2)
    expect(second.until_ms - second.set_at_ms).toBe(2 * BACKOFF_BASE_MS)
    expect(server.calls).toHaveLength(2)
  })

  test('Retry-After is read as delay-seconds or as an HTTP-date', () => {
    const now = Date.parse('2026-10-02T12:00:00Z')
    expect(retryAfterMs('120', now)).toBe(120_000)
    expect(retryAfterMs(' 0 ', now)).toBe(0)
    expect(retryAfterMs('Fri, 02 Oct 2026 14:00:00 GMT', now)).toBe(2 * 3_600_000)
    expect(retryAfterMs('Fri, 02 Oct 2026 11:00:00 GMT', now)).toBe(0) // in the past: no wait beyond this run
    expect(retryAfterMs('soon', now)).toBeNull()
    expect(retryAfterMs(null, now)).toBeNull()
  })
})

// ---- Review R5 (2026-10-02): an error while reading the body is an error, not a plain 200.
test('a timeout while reading the body keeps the status, records the error, and sends no conditional request (review R5)', async () => {
  const server = fakeServer({
    [A.url]: { status: 200, headers: VALIDATED, bodyFailsAfter: { sent: '<?xml', error: () => new DOMException('The operation was aborted due to timeout', 'TimeoutError') } },
  })
  const { rows, requests } = await run([A], server)
  expect(requests).toBe(1)
  expect(rows[0]).toMatchObject({ status: 200, bytes: null, shape_ok: null })
  expect(rows[0]!.error).toMatch(/^TimeoutError: /)
})

// The cron poll loop against a scripted fetch and an injected clock (no network), storing into a fresh HubDO.
import { describe, expect, test } from 'vitest'
import type { Endpoint } from '@ced/adapters'
import { pollOnce, type PollDeps, type PollHub } from '../src/poll.js'
import {
  BACKOFF_CAP_S,
  CACHE_BUST_PARAM,
  USER_AGENT,
  backoffMs,
  describeSources,
  parseRetryAfter,
  peakRequestsPerHour,
  requestUrl,
} from '../src/policy.js'
import { DOCS, MIN, T0, docsBody, fakeSource, freshHub, iso, page, scriptedFetch } from './fakes.js'

const PI: Endpoint = {
  id: 'pi',
  url: 'https://www.federalregister.gov/api/v1/public-inspection-documents/current.json',
  validator: 'body-hash',
  cacheBust: true,
}
const NEWS: Endpoint = { id: 'news', url: 'https://www.whitehouse.gov/news/feed/', validator: 'etag' }
const CLERK: Endpoint = { id: 'floor', url: 'https://clerk.house.gov/floor/2026-10-05.xml', validator: 'if-modified-since' }

const ok = (body: string, headers: Record<string, string> = {}) => () =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json', ...headers } })

function setup(endpoint: Endpoint, script: Parameters<typeof scriptedFetch>[0], opts: Parameters<typeof fakeSource>[2] = {}) {
  const hub = freshHub()
  const src = fakeSource('fake.fr', [endpoint], opts)
  const f = scriptedFetch(script)
  const clock = { t: T0 }
  const deps: PollDeps = { hub, sources: [src.def], fetch: f.fetch, now: () => clock.t, random: () => 0.5 }
  const status = async () => (await hub.status(clock.t, describeSources([src.def], clock.t))).sources[0]!
  return { hub, src, f, clock, deps, status }
}

describe('conditional GET', () => {
  test('etag: the second poll sends If-None-Match, and a 304 is not_modified without parsing', async () => {
    const { f, clock, deps, src, status } = setup(NEWS, [
      ok(docsBody(DOCS), { etag: '"5f1-abc"' }),
      () => new Response(null, { status: 304, headers: { etag: '"5f1-abc"' } }),
    ])
    const r1 = await pollOnce(deps)
    expect(r1[0]).toMatchObject({ action: 'polled', result: { health: 'ok', inserted: 3 } })
    expect(f.calls[0]!.headers['if-none-match']).toBeUndefined()
    expect(f.calls[0]!.headers['user-agent']).toBe(USER_AGENT)

    clock.t += MIN
    const r2 = await pollOnce(deps)
    expect(f.calls[1]!.headers['if-none-match']).toBe('"5f1-abc"')
    expect(f.calls[1]!.headers['if-modified-since']).toBeUndefined()
    expect(r2[0]).toMatchObject({ action: 'polled', result: { health: 'not_modified', inserted: 0 } })
    expect(src.parseCalls()).toBe(1)
    expect(await status()).toMatchObject({ health: 'not_modified', last_success_at: iso(clock.t), stale: false })
  })

  test('if-modified-since: the second poll sends the stored Last-Modified', async () => {
    const lm = 'Thu, 01 Oct 2026 15:15:02 GMT'
    const { f, clock, deps, src } = setup(CLERK, [
      ok(docsBody(DOCS), { 'last-modified': lm, etag: '"ignored"' }),
      () => new Response(null, { status: 304 }),
    ])
    await pollOnce(deps)
    clock.t += MIN
    const r2 = await pollOnce(deps)
    expect(f.calls[1]!.headers['if-modified-since']).toBe(lm)
    expect(f.calls[1]!.headers['if-none-match']).toBeUndefined() // this endpoint honours IMS only
    expect(r2[0]!.result!.health).toBe('not_modified')
    expect(src.parseCalls()).toBe(1)
  })

  test('body-hash: an unchanged body is not_modified and is never parsed; a changed body is', async () => {
    const { clock, deps, src, hub } = setup(PI, [ok(docsBody(DOCS)), ok(docsBody(DOCS)), ok(docsBody(DOCS.slice(0, 2)))])
    await pollOnce(deps)
    expect(src.parseCalls()).toBe(1)
    clock.t += MIN
    const r2 = await pollOnce(deps)
    expect(r2[0]!.result).toMatchObject({ health: 'not_modified' })
    expect(r2[0]!.result!.detail).toMatch(/sha-256/)
    expect(src.parseCalls()).toBe(1)
    clock.t += MIN
    const r3 = await pollOnce(deps)
    expect(src.parseCalls()).toBe(2)
    expect(r3[0]!.result).toMatchObject({ health: 'ok', inserted: 0, unchanged: 2 })
    expect((await page(hub, null)).events).toHaveLength(3)
  })
})

describe('validators after a body-hash short-circuit', () => {
  test('a 200 with the same body but a new ETag is not parsed, and that new ETag is sent next time', async () => {
    const body = docsBody(DOCS)
    const { f, clock, deps, src } = setup(NEWS, [
      ok(body, { etag: '"e1"' }),
      ok(body, { etag: '"e2"' }), // wh.feeds: the site-wide ETag moves with no new item
      () => new Response(null, { status: 304 }),
    ])
    await pollOnce(deps)
    clock.t += MIN
    const r2 = await pollOnce(deps)
    expect(r2[0]!.result).toMatchObject({ health: 'not_modified' })
    expect(src.parseCalls()).toBe(1)
    clock.t += MIN
    const r3 = await pollOnce(deps)
    expect(f.calls[2]!.headers['if-none-match']).toBe('"e2"')
    expect(r3[0]!.result).toMatchObject({ health: 'not_modified' })
  })

  test('a 200 with the same body but a newer Last-Modified: that Last-Modified is sent next time', async () => {
    const body = docsBody(DOCS)
    const { f, clock, deps, src } = setup(CLERK, [
      ok(body, { 'last-modified': 'Thu, 01 Oct 2026 15:00:00 GMT' }),
      ok(body, { 'last-modified': 'Thu, 01 Oct 2026 15:17:00 GMT' }),
      () => new Response(null, { status: 304 }),
    ])
    await pollOnce(deps)
    clock.t += MIN
    await pollOnce(deps)
    clock.t += MIN
    await pollOnce(deps)
    expect(f.calls[2]!.headers['if-modified-since']).toBe('Thu, 01 Oct 2026 15:17:00 GMT')
    expect(src.parseCalls()).toBe(1)
  })
})

describe('a new code version (deploy)', () => {
  test('re-parses an unchanged body once (a parser fix applies at once), then short-circuits again', async () => {
    const body = docsBody(DOCS)
    const { clock, deps, src } = setup(PI, [ok(body), ok(body), ok(body), ok(body)])
    const v1: PollDeps = { ...deps, codeVersion: 'version-1' }
    const v2: PollDeps = { ...deps, codeVersion: 'version-2' }
    await pollOnce(v1)
    clock.t += MIN
    expect((await pollOnce(v1))[0]!.result).toMatchObject({ health: 'not_modified' })
    expect(src.parseCalls()).toBe(1)
    clock.t += MIN
    expect((await pollOnce(v2))[0]!.result).toMatchObject({ health: 'ok', inserted: 0, revised: 0, unchanged: 3 })
    expect(src.parseCalls()).toBe(2)
    clock.t += MIN
    expect((await pollOnce(v2))[0]!.result).toMatchObject({ health: 'not_modified' })
    expect(src.parseCalls()).toBe(2)
  })

  test("does not send the previous version's validator once, so a 304 cannot hide a parser fix", async () => {
    const body = docsBody(DOCS)
    const { f, clock, deps, src } = setup(NEWS, [
      ok(body, { etag: '"e1"' }),
      () => new Response(null, { status: 304 }),
      ok(body, { etag: '"e1"' }),
      () => new Response(null, { status: 304 }),
    ])
    const v1: PollDeps = { ...deps, codeVersion: 'version-1' }
    const v2: PollDeps = { ...deps, codeVersion: 'version-2' }
    await pollOnce(v1)
    clock.t += MIN
    await pollOnce(v1)
    expect(f.calls[1]!.headers['if-none-match']).toBe('"e1"')
    clock.t += MIN
    await pollOnce(v2)
    expect(f.calls[2]!.headers['if-none-match']).toBeUndefined()
    expect(src.parseCalls()).toBe(2)
    clock.t += MIN
    await pollOnce(v2)
    expect(f.calls[3]!.headers['if-none-match']).toBe('"e1"')
    expect(src.parseCalls()).toBe(2)
  })
})

describe('request shape', () => {
  test('cacheBust endpoints get a unique cache-buster; others are requested byte for byte', async () => {
    const busted = setup(PI, [ok(docsBody([]))])
    await pollOnce(busted.deps)
    expect(busted.f.calls[0]!.url).toBe(`${PI.url}?${CACHE_BUST_PARAM}=${T0}`)
    // Cloudflare's own cache is bypassed too, and this runtime (our compatibility_date) accepts that option.
    expect(busted.f.calls[0]!.cache).toBe('no-store')
    expect(new Request(PI.url, { cache: 'no-store' }).cache).toBe('no-store')

    const plain = setup(NEWS, [ok(docsBody([]))])
    await pollOnce(plain.deps)
    expect(plain.f.calls[0]!.url).toBe(NEWS.url)

    const withQuery: Endpoint = { ...PI, url: 'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest' }
    expect(requestUrl(withQuery, 42)).toBe(`${withQuery.url}&${CACHE_BUST_PARAM}=42`)
  })

  test('a body that echoes the cache-buster (FR documents.json next_page_url) is still "unchanged" on the next poll', async () => {
    const DOCS_EP: Endpoint = { ...PI, id: 'docs', url: 'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest' }
    // The real API copies the request's query, cache-buster included, into next_page_url (live, 2026-10-02).
    const echo = (call: { url: string }) => {
      const q = call.url.slice(call.url.indexOf('?'))
      const body = JSON.stringify({ count: DOCS.length, next_page_url: `https://www.federalregister.gov/api/v1/documents${q}&page=2`, results: DOCS })
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const { clock, deps, src } = setup(DOCS_EP, [echo, echo, () => ok(docsBody(DOCS.slice(1)))()])
    const r1 = await pollOnce(deps)
    expect(r1[0]).toMatchObject({ action: 'polled', result: { health: 'ok' } })
    clock.t += MIN
    const r2 = await pollOnce(deps)
    expect(r2[0]).toMatchObject({ action: 'polled', result: { health: 'not_modified' } })
    expect(src.parseCalls()).toBe(1) // the second body differs ONLY by the echoed stamp: not parsed again
    clock.t += MIN
    await pollOnce(deps)
    expect(src.parseCalls()).toBe(2) // a real change is still parsed
  })

  test('one request in flight per host; different hosts in parallel', async () => {
    const inFlight = new Map<string, number>()
    let maxPerHost = 0
    let maxTotal = 0
    const fetch = async (url: string): Promise<Response> => {
      const host = new URL(url).host
      inFlight.set(host, (inFlight.get(host) ?? 0) + 1)
      maxPerHost = Math.max(maxPerHost, inFlight.get(host)!)
      maxTotal = Math.max(maxTotal, [...inFlight.values()].reduce((a, b) => a + b, 0))
      await new Promise((r) => setTimeout(r, 20))
      inFlight.set(host, inFlight.get(host)! - 1)
      return new Response(docsBody([]), { status: 200 })
    }
    const fr = fakeSource('fake.fr', [
      { id: 'pi', url: 'https://www.federalregister.gov/a.json', validator: 'body-hash' },
      { id: 'docs', url: 'https://www.federalregister.gov/b.json', validator: 'body-hash' },
    ])
    const wh = fakeSource('fake.wh', [{ id: 'news', url: 'https://www.whitehouse.gov/news/feed/', validator: 'etag' }])
    const runs = await pollOnce({ hub: freshHub(), sources: [fr.def, wh.def], fetch, now: () => T0, random: () => 0.5 })
    expect(runs.filter((r) => r.action === 'polled')).toHaveLength(3)
    expect(maxPerHost).toBe(1)
    expect(maxTotal).toBe(2)
  })
})

describe('errors and backoff', () => {
  test('503: error_streak 1 and a jittered backoff; no request until it passes; success resets the streak', async () => {
    const { f, clock, deps, status } = setup(PI, [
      () => new Response('Service Unavailable', { status: 503, headers: { 'content-type': 'text/html' } }),
      ok(docsBody(DOCS)),
    ])
    const r1 = await pollOnce(deps)
    expect(r1[0]!.result).toMatchObject({ health: 'error', detail: 'HTTP 503 (text/html)', error_streak: 1 })
    // streak 1: base 120 s, equal jitter at 0.5 -> 90 s.
    expect(r1[0]!.result!.backoff_until_ms).toBe(T0 + 90_000)
    expect(await status()).toMatchObject({ health: 'error', error_streak: 1, stale: true })

    clock.t = T0 + MIN
    const r2 = await pollOnce(deps)
    expect(r2[0]).toMatchObject({ action: 'skipped', reason: 'backoff' })
    expect(f.calls).toHaveLength(1)

    clock.t = T0 + 2 * MIN
    const r3 = await pollOnce(deps)
    expect(r3[0]!.result).toMatchObject({ health: 'ok', error_streak: 0, backoff_until_ms: null })
    expect(f.calls).toHaveLength(2)
  })

  test('Retry-After is honoured when longer than the backoff', async () => {
    const { f, clock, deps } = setup(PI, [
      () => new Response('slow down', { status: 429, headers: { 'retry-after': '600' } }),
      ok(docsBody([])),
    ])
    const r1 = await pollOnce(deps)
    expect(r1[0]!.result!.backoff_until_ms).toBe(T0 + 600_000)
    clock.t = T0 + 9 * MIN
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'skipped', reason: 'backoff' })
    clock.t = T0 + 10 * MIN
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'polled', result: { health: 'empty' } })
    expect(f.calls).toHaveLength(2)
  })

  test('a network failure is an error with backoff, not a crash', async () => {
    const { deps } = setup(PI, [
      () => {
        throw new TypeError('Network connection lost.')
      },
    ])
    const r = await pollOnce(deps)
    expect(r[0]!.result).toMatchObject({ health: 'error', detail: 'network error: Network connection lost.', error_streak: 1 })
    expect(r[0]!.result!.backoff_until_ms).toBeGreaterThan(T0)
  })

  test('a timeout is reported as no response', async () => {
    const { deps } = setup(PI, [
      () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      },
    ])
    const r = await pollOnce(deps)
    expect(r[0]!.result).toMatchObject({ health: 'error', detail: 'no response within 15 s' })
  })

  test('a parse() throw is drift: nothing stored, validators not kept, and the same body is parsed again', async () => {
    const { clock, deps, src, hub, status } = setup(PI, [ok(docsBody(DOCS)), ok(docsBody(DOCS))], { throws: true })
    const r1 = await pollOnce(deps)
    expect(r1[0]!.result).toMatchObject({ health: 'drift', inserted: 0, error_streak: 1, backoff_until_ms: null })
    expect(r1[0]!.result!.detail).toMatch(/^parser threw: /)
    expect((await page(hub, null)).events).toEqual([])
    clock.t += MIN
    const r2 = await pollOnce(deps)
    expect(src.parseCalls()).toBe(2) // not short-circuited as "unchanged"
    expect(r2[0]!.result).toMatchObject({ health: 'drift', error_streak: 2 })
    expect(await status()).toMatchObject({ health: 'drift', stale: true })
  })
})

describe('politeness on 200 error pages and drift', () => {
  test('an adapter-reported error page backs off like an HTTP error', async () => {
    const page = ok('<html><body>Access Denied</body></html>', { 'content-type': 'text/html' })
    const { f, clock, deps } = setup(PI, [page, page], { reportsError: true })
    const r1 = await pollOnce(deps)
    expect(r1[0]!.result).toMatchObject({ health: 'error', detail: 'HTML error page instead of JSON', error_streak: 1 })
    expect(r1[0]!.result!.backoff_until_ms).toBe(T0 + 90_000)
    clock.t += MIN
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'skipped', reason: 'backoff' })
    expect(f.calls).toHaveLength(1)
  })

  test('drift is retried at cadence twice, then backs off exponentially (a WAF page served as a 200)', async () => {
    const waf = ok('<html>Access Denied</html>', { 'content-type': 'text/html' })
    const { f, clock, deps } = setup(NEWS, Array.from({ length: 10 }, () => waf), { throws: true })
    const seen: Array<number | null | string | undefined> = []
    for (let i = 0; i < 10; i++) {
      clock.t = T0 + i * MIN
      const run = (await pollOnce(deps))[0]!
      seen.push(run.action === 'polled' ? run.result!.backoff_until_ms : run.reason)
    }
    // streak 3 -> base 120 s, 4 -> 240 s, 5 -> 480 s (equal jitter at 0.5: x0.75).
    expect(seen).toEqual([
      null,
      null,
      T0 + 2 * MIN + 90_000,
      'backoff',
      T0 + 4 * MIN + 180_000,
      'backoff',
      'backoff',
      T0 + 7 * MIN + 360_000,
      'backoff',
      'backoff',
    ])
    expect(f.calls).toHaveLength(5)
  })
})

describe('registered affiliation', () => {
  test('the loop records the registered affiliation, so an adapter that labels itself higher is refused', async () => {
    const honest = fakeSource('fake.mirror', [PI], { affiliation: 'third-party' })
    const lying = fakeSource('fake.mirror', [PI], { affiliation: 'third-party' })
    const realParse = lying.def.parse
    lying.def.parse = (id, res) => {
      const out = realParse(id, res)
      const events = out.events.map((e) => ({ ...e, sources: e.sources.map((s) => ({ ...s, affiliation: 'official-nonpartisan' as const })) }))
      return { ...out, events }
    }
    const poll = (def: typeof honest.def) =>
      pollOnce({ hub: freshHub(), sources: [def], fetch: scriptedFetch([ok(docsBody(DOCS))]).fetch, now: () => T0, random: () => 0.5 })
    expect((await poll(honest.def))[0]!.result).toMatchObject({ health: 'ok', inserted: 3 })
    const r = (await poll(lying.def))[0]!.result!
    expect(r).toMatchObject({ health: 'drift', inserted: 0 })
    expect(r.detail).toContain('registered as third-party')
  })
})

describe('store failures', () => {
  test('plan() failing: nothing is fetched, and pollOnce still resolves with one failed run per endpoint', async () => {
    const src = fakeSource('fake.fr', [PI, NEWS])
    const f = scriptedFetch([])
    const hub: PollHub = {
      plan: async () => {
        throw new Error('DO unavailable')
      },
      claim: async () => {
        throw new Error('no')
      },
      recordPoll: async () => {
        throw new Error('no')
      },
    }
    const runs = await pollOnce({ hub, sources: [src.def], fetch: f.fetch, now: () => T0, random: () => 0.5 })
    expect(runs).toEqual([
      { source_id: 'fake.fr', endpoint_id: 'pi', action: 'failed', error: expect.stringMatching(/DO unavailable/) },
      { source_id: 'fake.fr', endpoint_id: 'news', action: 'failed', error: expect.stringMatching(/DO unavailable/) },
    ])
    expect(f.calls).toHaveLength(0)
  })

  test('a request the store did not count first is never sent', async () => {
    const real = freshHub()
    const src = fakeSource('fake.fr', [PI])
    const f = scriptedFetch([ok(docsBody(DOCS))])
    const hub: PollHub = {
      plan: (n) => real.plan(n),
      claim: async () => {
        throw new Error('storage write failed')
      },
      recordPoll: (rec) => real.recordPoll(rec),
    }
    const runs = await pollOnce({ hub, sources: [src.def], fetch: f.fetch, now: () => T0, random: () => 0.5 })
    expect(runs[0]).toMatchObject({ action: 'failed', error: expect.stringMatching(/not sent.*storage write failed/) })
    expect(f.calls).toHaveLength(0)
  })

  test('when the store cannot record a payload, a plain error is recorded instead, so the endpoint backs off', async () => {
    const real = freshHub()
    const src = fakeSource('fake.fr', [PI])
    const f = scriptedFetch([ok(docsBody(DOCS)), ok(docsBody(DOCS))])
    const clock = { t: T0 }
    const hub: PollHub = {
      plan: (n) => real.plan(n),
      claim: (s, e, at) => real.claim(s, e, at),
      recordPoll: (rec) =>
        rec.outcome.kind === 'parsed' ? Promise.reject(new Error('Durable Object exceeded its CPU time limit')) : real.recordPoll(rec),
    }
    const deps: PollDeps = { hub, sources: [src.def], fetch: f.fetch, now: () => clock.t, random: () => 0.5 }
    const r1 = await pollOnce(deps)
    expect(r1[0]).toMatchObject({ action: 'failed', result: { health: 'error', error_streak: 1, backoff_until_ms: T0 + 90_000 } })
    expect(r1[0]!.result!.detail).toMatch(/could not record.*CPU time limit/)
    clock.t += MIN
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'skipped', reason: 'backoff' })
    expect(f.calls).toHaveLength(1)
    const st = (await real.status(clock.t, describeSources([src.def], clock.t))).sources[0]!
    expect(st).toMatchObject({ health: 'error', stale: true })
  })

  test('when the store records nothing, the attempts it counted first still hold the budget and the cadence', async () => {
    const failing = (real: ReturnType<typeof freshHub>): PollHub => ({
      plan: (n) => real.plan(n),
      claim: (s, e, at) => real.claim(s, e, at),
      recordPoll: async () => {
        throw new Error('Durable Object storage operation exceeded timeout')
      },
    })
    const run = async (src: ReturnType<typeof fakeSource>, ep: Endpoint) => {
      const f = scriptedFetch(Array.from({ length: 5 }, () => ok(docsBody(DOCS))))
      const hub = failing(freshHub())
      const reasons: Array<string | undefined> = []
      for (let i = 0; i < 5; i++) {
        const runs = await pollOnce({ hub, sources: [src.def], fetch: f.fetch, now: () => T0 + i * MIN, random: () => 0.5 })
        const r = runs.find((x) => x.endpoint_id === ep.id)!
        reasons.push(r.reason ?? r.action)
      }
      return { calls: f.calls.length, reasons }
    }
    const budget = await run(fakeSource('fake.fr', [PI], { cadence_s: 60, rate_budget_per_h: 2 }), PI)
    expect(budget).toEqual({ calls: 2, reasons: ['failed', 'failed', 'budget', 'budget', 'budget'] })
    const offHours = await run(fakeSource('fake.wh', [NEWS], { cadence_s: 900 }), NEWS)
    expect(offHours).toEqual({ calls: 1, reasons: ['failed', 'cadence', 'cadence', 'cadence', 'cadence'] })
  })
})

describe('pacing', () => {
  test('an endpoint is not polled again before its cadence, and never over the hourly budget', async () => {
    const script = Array.from({ length: 5 }, () => ok(docsBody([])))
    const { f, clock, deps } = setup(PI, script, { cadence_s: 60, rate_budget_per_h: 2 })
    await pollOnce(deps)
    clock.t = T0 + 30_000
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'skipped', reason: 'cadence' })
    clock.t = T0 + MIN
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'polled' })
    clock.t = T0 + 2 * MIN
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'skipped', reason: 'budget' })
    expect(f.calls).toHaveLength(2)
    clock.t = T0 + 61 * MIN // a new budget window
    expect((await pollOnce(deps))[0]).toMatchObject({ action: 'polled' })
  })

  test('a 60/h budget at a 60 s cadence never loses a slot at the window edge, cron jitter included', async () => {
    const script = Array.from({ length: 70 }, () => ok(docsBody([])))
    const { f, clock, deps } = setup(PI, script, { cadence_s: 60, rate_budget_per_h: 60 })
    for (let k = 0; k < 70; k++) {
      clock.t = T0 + k * MIN + (k === 0 ? 500 : 300) // the first cron fired a little later than the rest
      expect((await pollOnce(deps))[0]!.action, `cron run ${k}`).toBe('polled')
    }
    expect(f.calls).toHaveLength(70)
  })

  test('no sources: the cron does nothing (and touches no storage)', async () => {
    const f = scriptedFetch([])
    const hub: PollHub = {
      plan: () => Promise.reject(new Error('should not be called')),
      claim: () => Promise.reject(new Error('no')),
      recordPoll: () => Promise.reject(new Error('no')),
    }
    expect(await pollOnce({ hub, sources: [], fetch: f.fetch, now: () => T0, random: () => 0 })).toEqual([])
  })
})

describe('policy', () => {
  test('backoff doubles per failure, is jittered, caps at 15 min, and yields to a longer Retry-After', () => {
    expect(backoffMs(1, 0, null)).toBe(60_000)
    expect(backoffMs(1, 1, null)).toBe(120_000)
    expect(backoffMs(2, 0.5, null)).toBe(180_000)
    expect(backoffMs(50, 1, null)).toBe(BACKOFF_CAP_S * 1000)
    expect(backoffMs(1, 0.5, 3600)).toBe(3_600_000)
    expect(backoffMs(1, 0.5, 10)).toBe(90_000)
  })

  test('Retry-After: delta seconds or an HTTP date', () => {
    const now = Date.parse('2026-10-02T12:00:00Z')
    expect(parseRetryAfter('120', now)).toBe(120)
    expect(parseRetryAfter('Fri, 02 Oct 2026 12:05:00 GMT', now)).toBe(300)
    expect(parseRetryAfter('soon', now)).toBeNull()
    expect(parseRetryAfter(null, now)).toBeNull()
  })
})

describe('per-endpoint cadence (Endpoint.cadence, D-046)', () => {
  const NEWEST: Endpoint = {
    id: 'docs',
    url: 'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest',
    validator: 'body-hash',
    cacheBust: true,
    cadence: { business_s: 900, off_s: 3600 },
  }
  const twoEndpoints = (budget: number) => fakeSource('fake.fr', [PI, NEWEST], { cadence_s: 60, rate_budget_per_h: budget })

  test('each endpoint is due on its own cadence: the slow one waits 15 min while the fast one polls every minute', async () => {
    const src = twoEndpoints(180)
    const f = scriptedFetch(Array.from({ length: 40 }, () => ok(docsBody([]))))
    const clock = { t: T0 }
    const deps: PollDeps = { hub: freshHub(), sources: [src.def], fetch: f.fetch, now: () => clock.t, random: () => 0.5 }
    const seen: string[] = []
    for (let m = 0; m <= 16; m++) {
      clock.t = T0 + m * MIN
      const runs = await pollOnce(deps)
      seen.push(runs.map((r) => `${r.endpoint_id}:${r.action === 'polled' ? 'P' : r.reason}`).join(' '))
    }
    expect(seen[0]).toBe('pi:P docs:P')
    for (let m = 1; m <= 14; m++) expect(seen[m], `minute ${m}`).toBe('docs:cadence pi:P')
    expect(seen[15]).toBe('pi:P docs:P') // 900 s minus the 20 s cron slack has passed
    expect(seen[16]).toBe('docs:cadence pi:P')
    expect(f.calls.filter((c) => c.url.includes('documents.json'))).toHaveLength(2)
    expect(f.calls.filter((c) => c.url.includes('current.json'))).toHaveLength(17)
  })

  test('off hours: the slow endpoint follows its own off-hours cadence (1 h), the fast one the source off-hours cadence', async () => {
    const SAT = Date.parse('2026-10-03T16:00:10Z') // Sat noon ET
    const src = fakeSource('fake.fr', [PI, NEWEST], { rate_budget_per_h: 180 })
    src.def.cadence = { business_s: 60, off_s: 900 }
    const f = scriptedFetch(Array.from({ length: 20 }, () => ok(docsBody([]))))
    const clock = { t: SAT }
    const deps: PollDeps = { hub: freshHub(), sources: [src.def], fetch: f.fetch, now: () => clock.t, random: () => 0.5 }
    const polled: string[] = []
    for (let m = 0; m <= 60; m += 15) {
      clock.t = SAT + m * MIN
      for (const r of await pollOnce(deps)) if (r.action === 'polled') polled.push(`${m}:${r.endpoint_id}`)
    }
    expect(polled).toEqual(['0:pi', '0:docs', '15:pi', '30:pi', '45:pi', '60:pi', '60:docs'])
  })

  test('a whole hour of cron runs fits a budget of exactly peakRequestsPerHour: no endpoint is ever skipped for budget', async () => {
    const budget = peakRequestsPerHour(twoEndpoints(1).def)
    expect(budget).toBe(65)
    const src = twoEndpoints(budget)
    const f = scriptedFetch(Array.from({ length: 200 }, () => ok(docsBody([]))))
    const clock = { t: 0 }
    const deps: PollDeps = { hub: freshHub(), sources: [src.def], fetch: f.fetch, now: () => clock.t, random: () => 0.5 }
    const hourStart = Math.floor(T0 / 3_600_000) * 3_600_000
    const reasons = new Set<string>()
    // Two clock hours, cron runs a little late by varying amounts (0-7 s), as Cloudflare's cron fires.
    for (let k = 0; k < 120; k++) {
      clock.t = hourStart + k * MIN + ((k * 7919) % 7000)
      for (const r of await pollOnce(deps)) if (r.action !== 'polled') reasons.add(`${r.endpoint_id}:${r.reason}`)
    }
    expect([...reasons]).toEqual(['docs:cadence'])
    expect(f.calls.filter((c) => c.url.includes('current.json'))).toHaveLength(120)
    expect(f.calls.filter((c) => c.url.includes('documents.json'))).toHaveLength(8)
  })
})

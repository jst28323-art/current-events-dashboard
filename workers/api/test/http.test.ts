// The public read API (packages/schema/src/api.ts), through handleRequest with an injected hub, sources and clock.
import { env } from 'cloudflare:workers'
import { describe, expect, test } from 'vitest'
import type { CedEvent, EventsResponse, StatusResponse } from '@ced/schema'
import { handleRequest, type ApiHub } from '../src/http.js'
import { DOCS, MIN, T0, docEvent, fakeSource, freshHub, ingest, iso } from './fakes.js'

const PAGES = env.PAGES_ORIGIN
const src = fakeSource('fake.fr', [{ id: 'pi', url: 'https://www.federalregister.gov/x.json', validator: 'body-hash' }], {
  freshness_slo_s: 120,
})

function api(hub = freshHub(), clock = { t: T0 }) {
  const call = (path: string, init?: RequestInit) =>
    handleRequest(new Request(`https://ced-api.example${path}`, init), env, { hub, sources: [src.def], now: () => clock.t })
  return { hub, clock, call }
}

describe('GET /api/v1/events', () => {
  test('newest first by coalesce(occurred_at, first_seen_at), ties by id; default limit 100', async () => {
    const { hub, call } = api()
    await ingest(hub, 'fake.fr', DOCS.map((d) => docEvent(d, T0)), T0)
    const res = await call('/api/v1/events')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^application\/json/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await res.json()) as EventsResponse
    expect(body.generated_at).toBe(iso(T0))
    expect(body.has_more).toBe(false)
    // SEC has no filing time, so it sorts by first_seen_at (T0, later than the two 15:15 filings).
    const [a, b, c] = body.events as [CedEvent, CedEvent, CedEvent]
    expect(a.official_text).toBe(DOCS[2]!.title)
    expect([b.id, c.id]).toEqual([b.id, c.id].sort().reverse())
    expect(body.events).toHaveLength(3)

    const two = (await (await call('/api/v1/events?limit=2')).json()) as EventsResponse
    expect(two.events.map((e) => e.id)).toEqual(body.events.slice(0, 2).map((e) => e.id))
    // The snapshot cursor polls forward from now.
    const next = (await (await call(`/api/v1/events?since=${encodeURIComponent(body.cursor)}`)).json()) as EventsResponse
    expect(next.events).toEqual([])
  })

  test('limit must be an integer from 1 to 500', async () => {
    const { call } = api()
    for (const bad of ['0', '501', '-1', '1.5', 'abc', '', '1e2', '0100']) {
      const res = await call(`/api/v1/events?limit=${bad}`)
      expect(res.status, `limit=${bad}`).toBe(400)
      expect(((await res.json()) as { error: string }).error).toMatch(/limit/)
    }
    expect((await call('/api/v1/events?limit=1')).status).toBe(200)
    expect((await call('/api/v1/events?limit=500')).status).toBe(200)
  })

  test('since must be a cursor this API issued, else 400 JSON', async () => {
    const { call } = api()
    const theirs = (await (await api().call('/api/v1/events')).json()) as EventsResponse
    for (const bad of ['nope', '', theirs.cursor]) {
      const res = await call(`/api/v1/events?since=${encodeURIComponent(bad)}`)
      expect(res.status, `since=${bad}`).toBe(400)
      expect(res.headers.get('content-type')).toMatch(/^application\/json/)
      expect(((await res.json()) as { error: string }).error).toMatch(/since/)
    }
  })
})

describe('GET /api/v1/status', () => {
  test('stale is computed at request time with the injected clock', async () => {
    const { hub, clock, call } = api()
    const read = async () => ((await (await call('/api/v1/status')).json()) as StatusResponse).sources[0]!
    expect(await read()).toMatchObject({ source_id: 'fake.fr', name: 'Fake fake.fr', health: 'never_polled', stale: true })
    await ingest(hub, 'fake.fr', [docEvent(DOCS[0]!, T0)], T0)
    clock.t = T0 + MIN
    expect(await read()).toMatchObject({ health: 'ok', stale: false, last_success_at: iso(T0), items_24h: 1 })
    clock.t = T0 + 2 * MIN + 1
    expect(await read()).toMatchObject({ health: 'ok', stale: true })
  })
})

describe('GET /feed.json', () => {
  test('JSON Feed 1.1: id = dedup_key, url = primary source, title, content_text = official_text, date_published, _ced', async () => {
    const { hub, call } = api()
    await ingest(hub, 'fake.fr', DOCS.map((d) => docEvent(d, T0)), T0)
    const res = await call('/feed.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^application\/feed\+json/)
    const feed = (await res.json()) as {
      version: string
      title: string
      home_page_url: string
      feed_url: string
      items: Array<Record<string, unknown>>
    }
    expect(feed.version).toBe('https://jsonfeed.org/version/1.1')
    expect(feed.title.length).toBeGreaterThan(0)
    expect(feed.home_page_url).toBe(env.APP_URL)
    expect(feed.feed_url).toBe('https://ced-api.example/feed.json')
    expect(feed.items).toHaveLength(3)
    const eo = docEvent(DOCS[0]!, T0)
    const sec = docEvent(DOCS[2]!, T0)
    expect(feed.items.find((i) => i.id === eo.dedup_key)).toEqual({
      id: eo.dedup_key,
      url: DOCS[0]!.html_url,
      title: eo.title,
      content_text: DOCS[0]!.title,
      date_published: '2026-10-01T15:15:00Z',
      _ced: {
        event_type: 'fr.public_inspection', tier: 'P0', affiliation: 'official-nonpartisan', source_id: 'fake.fr', event_id: eo.id, revision: 1,
      },
    })
    // No occurred_at: date_published falls back to first_seen_at; no importance: tier null.
    expect(feed.items.find((i) => i.id === sec.dedup_key)).toMatchObject({ date_published: iso(T0), _ced: { tier: null } })
  })

  test('a revised event keeps its item id (JSON Feed: an updated item keeps its id); _ced names the new revision', async () => {
    const { hub, call } = api()
    await ingest(hub, 'fake.fr', DOCS.map((d) => docEvent(d, T0)), T0)
    const before = ((await (await call('/feed.json')).json()) as { items: Array<{ id: string }> }).items.map((i) => i.id).sort()
    const renamed = docEvent({ ...DOCS[0]!, title: 'Inaugurating the Era of Superintelligence' }, T0 + MIN)
    expect(await ingest(hub, 'fake.fr', [renamed, ...DOCS.slice(1).map((d) => docEvent(d, T0 + MIN))], T0 + MIN)).toMatchObject({ revised: 1 })
    const after = ((await (await call('/feed.json')).json()) as { items: Array<{ id: string; _ced: { revision: number } }> }).items
    expect(after.map((i) => i.id).sort()).toEqual(before)
    expect(after.find((i) => i.id === renamed.dedup_key)?._ced.revision).toBe(2)
  })
})

describe('routing, CORS, read-only', () => {
  test('only the Pages origin gets a CORS grant, on every route', async () => {
    const { call } = api()
    for (const path of ['/api/v1/events', '/api/v1/status', '/feed.json', '/', '/nope']) {
      const allowed = await call(path, { headers: { Origin: PAGES } })
      expect(allowed.headers.get('access-control-allow-origin'), path).toBe(PAGES)
      expect(allowed.headers.get('vary')).toBe('Origin')
      const denied = await call(path, { headers: { Origin: 'https://evil.example' } })
      expect(denied.headers.get('access-control-allow-origin'), path).toBeNull()
      const none = await call(path)
      expect(none.headers.get('access-control-allow-origin')).toBeNull()
      expect(none.headers.get('cache-control')).toBe('no-store')
    }
  })

  test('a preflight is answered; any other non-GET is 405 JSON; unknown paths are 404 JSON', async () => {
    const { call } = api()
    const pre = await call('/api/v1/events', { method: 'OPTIONS', headers: { Origin: PAGES } })
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-methods')).toBe('GET')
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await call('/api/v1/events', { method })
      expect(res.status, method).toBe(405)
      expect(res.headers.get('allow')).toBe('GET')
      expect(((await res.json()) as { error: string }).error).toMatch(/read-only/)
    }
    const nf = await call('/api/v1/nope')
    expect(nf.status).toBe(404)
    expect(await nf.json()).toEqual({ error: 'not found' })
  })

  test('a hub failure answers 503 JSON with no-store and the CORS grant, never an exception', async () => {
    // e.g. "Durable Object reset because its code was updated", which every deploy can cause mid-request.
    const down = () => Promise.reject(new Error('Durable Object reset because its code was updated'))
    const failing: ApiHub = { events: down, status: down, recent: down }
    for (const path of ['/api/v1/events', '/api/v1/events?since=abc.1', '/api/v1/status', '/feed.json']) {
      const req = new Request(`https://ced-api.example${path}`, { headers: { Origin: PAGES } })
      const res = await handleRequest(req, env, { hub: failing, sources: [src.def], now: () => T0 })
      expect(res.status, path).toBe(503)
      expect(res.headers.get('content-type'), path).toMatch(/^application\/json/)
      expect(res.headers.get('cache-control'), path).toBe('no-store')
      expect(res.headers.get('access-control-allow-origin'), path).toBe(PAGES)
      expect(((await res.json()) as { error: string }).error, path).toMatch(/store/)
    }
  })

  test('GET / is a small JSON index of the endpoints', async () => {
    const { call } = api()
    const body = (await (await call('/')).json()) as { endpoints: Record<string, string> }
    expect(Object.keys(body.endpoints)).toEqual(['/api/v1/events', '/api/v1/status', '/feed.json'])
  })
})

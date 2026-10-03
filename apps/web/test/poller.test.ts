import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { EventsResponse, StatusResponse } from '@ced/schema'
import { initialFeedState, MAX_ANSWER_AGE_MS, MAX_PAGES_PER_POLL, pollOnce, startPolling, type PollDeps } from '../src/poller.js'
import { MAX_EVENTS } from '../src/lib/merge.js'
import { fixtureEvents, sourceStatus } from '../e2e/fixture-events.js'

const BASE = 'https://ced-api.usgovfeed.workers.dev'
const T0 = Date.parse('2026-10-02T18:01:00Z')
const GEN = new Date(T0).toISOString()

const status: StatusResponse = { generated_at: GEN, sources: [sourceStatus('fr.api', GEN), sourceStatus('wh.feeds', GEN)] }
const page = (events: EventsResponse['events'], cursor: string, has_more = false): EventsResponse => ({ generated_at: GEN, cursor, events, has_more })
const json = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json' } })

type Handler = (url: URL) => Response | Promise<Response>

function deps(handler: Handler, calls: string[] = []): PollDeps {
  return {
    base: BASE,
    fetch: (url, init) =>
      new Promise<Response>((resolve, reject) => {
        calls.push(url)
        expect(init.cache).toBe('no-store')
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        Promise.resolve()
          .then(() => handler(new URL(url)))
          .then(resolve, reject)
      }),
    now: () => T0,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    timeoutMs: 50,
  }
}

const healthy: Handler = (u) =>
  u.pathname === '/api/v1/status' ? json(status) : u.searchParams.has('since') ? json(page([], 'c1')) : json(page(fixtureEvents(), 'c1'))

describe('pollOnce', () => {
  test('first poll has no since; the next passes the cursor; both cache no-store', async () => {
    const calls: string[] = []
    const s1 = await pollOnce(initialFeedState, deps(healthy, calls))
    expect(s1.available).toBe(true)
    expect(s1.everLoaded).toBe(true)
    expect(s1.events).toHaveLength(4)
    expect(s1.cursor).toBe('c1')
    expect(s1.lastGoodAt).toBe(T0)
    expect(s1.sources.map((s) => s.source_id)).toEqual(['fr.api', 'wh.feeds'])
    expect(calls.filter((c) => c.includes('/events'))).toEqual([`${BASE}/api/v1/events`])
    const s2 = await pollOnce(s1, deps(healthy, calls))
    expect(calls.filter((c) => c.includes('/events')).at(-1)).toBe(`${BASE}/api/v1/events?since=c1`)
    expect(s2.events).toHaveLength(4) // an empty since-page keeps what we have
  })

  test('a since-poll merges new events into the existing rows', async () => {
    const [a, b, c, d] = fixtureEvents()
    const first: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(page([a!, b!], 'c1')))
    const second: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(page([c!, d!, a!], 'c2')))
    const s1 = await pollOnce(initialFeedState, deps(first))
    const s2 = await pollOnce(s1, deps(second))
    expect(s2.events).toHaveLength(4)
    expect(s2.cursor).toBe('c2')
  })

  const failures: Array<[string, Handler]> = [
    ['network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['HTTP 503 on events', (u) => (u.pathname === '/api/v1/status' ? json(status) : json({ error: 'down' }, 503))],
    ['HTTP 500 on status', (u) => (u.pathname === '/api/v1/status' ? json({}, 500) : json(page(fixtureEvents(), 'c1')))],
    ['HTML instead of JSON', () => new Response('<!doctype html><h1>Error</h1>', { status: 200 })],
    ['JSON of the wrong shape', () => json({ ok: true })],
    ['a timeout', () => new Promise<Response>(() => {})],
  ]

  test.each(failures)('%s -> unavailable, never an empty success', async (_n, h) => {
    const s = await pollOnce(initialFeedState, deps(h))
    expect(s.available).toBe(false)
    expect(s.everLoaded).toBe(false)
    expect(s.lastAttemptAt).toBe(T0)
    expect(s.lastGoodAt).toBeNull()
    expect(s.lastError).toMatch(/API|answer/)
  })

  test('a failure after good data keeps the rows and the last good time, and marks unavailable', async () => {
    const s1 = await pollOnce(initialFeedState, deps(healthy))
    const s2 = await pollOnce(s1, { ...deps(() => json({}, 502)), now: () => T0 + 15_000 })
    expect(s2.available).toBe(false)
    expect(s2.everLoaded).toBe(true)
    expect(s2.events).toHaveLength(4)
    expect(s2.lastGoodAt).toBe(T0)
    expect(s2.lastAttemptAt).toBe(T0 + 15_000)
    const s3 = await pollOnce(s2, { ...deps(healthy), now: () => T0 + 30_000 })
    expect(s3.available).toBe(true)
    expect(s3.lastGoodAt).toBe(T0 + 30_000)
    expect(s3.lastError).toBeNull()
  })

  test('has_more is followed with the new cursor on since-polls, and bounded', async () => {
    const calls: string[] = []
    let n = 0
    const endless: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(page([], `c${++n}`, true)))
    const s = await pollOnce({ ...initialFeedState, cursor: 'c0', everLoaded: true }, deps(endless, calls))
    expect(calls.filter((c) => c.includes('/events'))).toHaveLength(MAX_PAGES_PER_POLL)
    expect(calls.filter((c) => c.includes('/events'))[1]).toBe(`${BASE}/api/v1/events?since=c1`)
    expect(s.available).toBe(true)
  })

  test('has_more on the first (no since) load is not chased', async () => {
    const calls: string[] = []
    const h: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(page(fixtureEvents(), 'c1', true)))
    await pollOnce(initialFeedState, deps(h, calls))
    expect(calls.filter((c) => c.includes('/events'))).toHaveLength(1)
  })

  test('a cursor that does not advance stops the has_more loop', async () => {
    const calls: string[] = []
    const h: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(page([], 'c0', true)))
    await pollOnce({ ...initialFeedState, cursor: 'c0', everLoaded: true }, deps(h, calls))
    expect(calls.filter((c) => c.includes('/events'))).toHaveLength(1)
  })

  test('malformed events are skipped and counted', async () => {
    const [a] = fixtureEvents()
    const h: Handler = (u) =>
      u.pathname === '/api/v1/status' ? json(status) : json({ generated_at: GEN, cursor: 'c1', has_more: false, events: [a, { id: 'evt_x' }] })
    const s = await pollOnce(initialFeedState, deps(h))
    expect(s.available).toBe(true)
    expect(s.events).toHaveLength(1)
    expect(s.skipped).toBe(1)
  })
})

describe('startPolling', () => {
  class FakeDoc extends EventTarget {
    hidden = false
    set(hidden: boolean) {
      this.hidden = hidden
      this.dispatchEvent(new Event('visibilitychange'))
    }
  }
  let doc: FakeDoc
  let polls: number
  let stop: () => void
  const flush = () => vi.advanceTimersByTimeAsync(0)

  beforeEach(() => {
    vi.useFakeTimers()
    doc = new FakeDoc()
    polls = 0
    stop = startPolling({
      doc: doc as unknown as Parameters<typeof startPolling>[0]['doc'],
      poll: async () => {
        polls++
      },
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      intervalMs: 15_000,
    })
  })
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  test('polls at once, then every 15 s', async () => {
    await flush()
    expect(polls).toBe(1)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(polls).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(polls).toBe(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(polls).toBe(4)
  })

  test('pauses while hidden and polls at once when visible again', async () => {
    await flush()
    doc.set(true)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(polls).toBe(1)
    doc.set(false)
    await flush()
    expect(polls).toBe(2)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(polls).toBe(3)
  })

  test('stop ends the loop', async () => {
    await flush()
    stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(polls).toBe(1)
  })
})

describe('startPolling while hidden mid-poll', () => {
  test('a poll that finishes after the tab was hidden does not schedule another until visible', async () => {
    vi.useFakeTimers()
    const doc = Object.assign(new EventTarget(), { hidden: false })
    let polls = 0
    const stop = startPolling({
      doc: doc as unknown as Parameters<typeof startPolling>[0]['doc'],
      poll: () => {
        polls++
        return new Promise<void>((r) => setTimeout(r, 5_000))
      },
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      intervalMs: 15_000,
    })
    await vi.advanceTimersByTimeAsync(1_000) // first poll in flight
    doc.hidden = true
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(300_000)
    const whileHidden = polls
    doc.hidden = false
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    stop()
    vi.useRealTimers()
    expect(whileHidden).toBe(1)
    expect(polls).toBe(2)
  })
})

describe('startPolling never overlaps polls', () => {
  test('a slow poll delays the next one instead of stacking', async () => {
    vi.useFakeTimers()
    const doc = Object.assign(new EventTarget(), { hidden: false })
    let inFlight = 0
    let maxInFlight = 0
    let polls = 0
    const stop = startPolling({
      doc: doc as unknown as Parameters<typeof startPolling>[0]['doc'],
      poll: () => {
        polls++
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return new Promise<void>((r) => setTimeout(() => (inFlight--, r()), 40_000))
      },
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      intervalMs: 15_000,
    })
    doc.dispatchEvent(new Event('visibilitychange')) // visible again while the first poll is in flight
    await vi.advanceTimersByTimeAsync(100_000)
    stop()
    vi.useRealTimers()
    expect(maxInFlight).toBe(1)
    expect(polls).toBe(2) // 0 -> 40 s, then 55 s -> 95 s
  })
})

// Review fixes (2026-10-02, findings W1, W7, W9, W10).
describe('pollOnce: a cursor the API rejects (W1)', () => {
  // workers/api/src/hub.ts answers 400 "since is not a cursor this API issued; call again without since to start over"
  // once its epoch changes (e.g. the Durable Object storage was reset).
  const rejected = { error: 'since is not a cursor this API issued; call again without since to start over' }

  test('HTTP 400 to a since-call: the same poll starts over without since, replaces the rows and recovers', async () => {
    const [a, b, c] = fixtureEvents()
    const calls: string[] = []
    const h: Handler = (u) => {
      if (u.pathname === '/api/v1/status') return json(status)
      const since = u.searchParams.get('since')
      if (since === 'old.9') return json(rejected, 400)
      if (since === null) return json(page([c!], 'new.1'))
      return json(page([], since))
    }
    const before = { ...initialFeedState, events: [a!, b!], cursor: 'old.9', everLoaded: true, available: true, lastGoodAt: T0 - 15_000, lastAttemptAt: T0 - 15_000 }
    const s = await pollOnce(before, deps(h, calls))
    expect(calls.filter((x) => x.includes('/events'))).toEqual([`${BASE}/api/v1/events?since=old.9`, `${BASE}/api/v1/events`])
    expect(s.available).toBe(true)
    expect(s.lastError).toBeNull()
    expect(s.cursor).toBe('new.1')
    expect(s.events.map((e) => e.id)).toEqual([c!.id]) // started over: what a reload would show
    const s2 = await pollOnce(s, deps(h, calls))
    expect(calls.filter((x) => x.includes('/events')).at(-1)).toBe(`${BASE}/api/v1/events?since=new.1`)
    expect(s2.available).toBe(true)
  })

  test('starting over is tried once per poll: a 400 to the fresh call too stays unavailable', async () => {
    const calls: string[] = []
    const h: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(rejected, 400))
    const s = await pollOnce({ ...initialFeedState, cursor: 'old.9', everLoaded: true }, deps(h, calls))
    expect(calls.filter((x) => x.includes('/events'))).toHaveLength(2)
    expect(s.available).toBe(false)
    expect(s.lastError).toBe('the API answered HTTP 400')
  })

  test('a 400 to the first (no since) load is a failure, not retried', async () => {
    const calls: string[] = []
    const h: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(rejected, 400))
    const s = await pollOnce(initialFeedState, deps(h, calls))
    expect(calls.filter((x) => x.includes('/events'))).toHaveLength(1)
    expect(s.available).toBe(false)
  })

  test('other HTTP errors to a since-call keep the cursor (no start-over)', async () => {
    const calls: string[] = []
    const h: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json({ error: 'down' }, 503))
    const s = await pollOnce({ ...initialFeedState, cursor: 'old.9', everLoaded: true }, deps(h, calls))
    expect(calls.filter((x) => x.includes('/events'))).toEqual([`${BASE}/api/v1/events?since=old.9`])
    expect(s.cursor).toBe('old.9')
  })
})

describe('pollOnce: an old answer is not presented as current (W7)', () => {
  const at = (ms: number): Handler => (u) =>
    u.pathname === '/api/v1/status'
      ? json({ ...status, generated_at: new Date(ms).toISOString() })
      : json({ ...page(fixtureEvents(), 'c1'), generated_at: new Date(ms).toISOString() })

  test('an events answer generated 3 hours ago -> unavailable, saying how old it is', async () => {
    const h: Handler = (u) =>
      u.pathname === '/api/v1/status' ? json(status) : json({ ...page(fixtureEvents(), 'c1'), generated_at: new Date(T0 - 3 * 3600_000).toISOString() })
    const s = await pollOnce(initialFeedState, deps(h))
    expect(s.available).toBe(false)
    expect(s.everLoaded).toBe(false)
    expect(s.events).toHaveLength(0)
    expect(s.lastError).toBe('the API sent an answer generated 3 hours ago')
  })

  test('a status answer generated 20 minutes ago -> unavailable', async () => {
    const h: Handler = (u) =>
      u.pathname === '/api/v1/status' ? json({ ...status, generated_at: new Date(T0 - 20 * 60_000).toISOString() }) : json(page(fixtureEvents(), 'c1'))
    const s = await pollOnce(initialFeedState, deps(h))
    expect(s.available).toBe(false)
    expect(s.lastError).toBe('the API sent an answer generated 20 minutes ago')
  })

  test('answers up to MAX_ANSWER_AGE_MS old (clock skew) are accepted; 1 s more is not', async () => {
    expect(MAX_ANSWER_AGE_MS).toBe(5 * 60_000)
    expect((await pollOnce(initialFeedState, deps(at(T0 - MAX_ANSWER_AGE_MS)))).available).toBe(true)
    expect((await pollOnce(initialFeedState, deps(at(T0 - MAX_ANSWER_AGE_MS - 1000)))).available).toBe(false)
    expect((await pollOnce(initialFeedState, deps(at(T0 + 60_000)))).available).toBe(true) // viewer clock behind
  })
})

describe('pollOnce: a poll commits only when both calls succeed (W10)', () => {
  test('status 200 + events 503: sources, rows and cursor all stay from the last good poll', async () => {
    const s1 = await pollOnce(initialFeedState, deps(healthy))
    const erroring: StatusResponse = { generated_at: GEN, sources: [sourceStatus('fr.api', GEN, { health: 'error' }), sourceStatus('wh.feeds', GEN)] }
    const h: Handler = (u) => (u.pathname === '/api/v1/status' ? json(erroring) : json({ error: 'down' }, 503))
    const s2 = await pollOnce(s1, { ...deps(h), now: () => T0 + 15_000 })
    expect(s2.available).toBe(false)
    expect(s2.sources).toEqual(s1.sources) // shown as "last known, as of <lastGoodAt>": must be that poll's data
    expect(s2.lastGoodAt).toBe(T0)
  })

  test('status 500 + new events: nothing merged and the cursor does not move, so the next good poll still gets them', async () => {
    const [a, b, c] = fixtureEvents()
    const first: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(page([a!, b!], 'c1')))
    const s1 = await pollOnce(initialFeedState, deps(first))
    const calls: string[] = []
    const changes: Handler = (u) => (u.searchParams.get('since') === 'c1' ? json(page([c!], 'c2')) : json(page([], 'c2')))
    const broken: Handler = (u) => (u.pathname === '/api/v1/status' ? json({}, 500) : changes(u))
    const s2 = await pollOnce(s1, deps(broken, calls))
    expect(s2.available).toBe(false)
    expect(s2.cursor).toBe('c1')
    expect(s2.events).toHaveLength(2)
    const s3 = await pollOnce(s2, deps((u) => (u.pathname === '/api/v1/status' ? json(status) : changes(u)), calls))
    expect(calls.filter((x) => x.includes('/events')).at(-1)).toBe(`${BASE}/api/v1/events?since=c1`)
    expect(s3.events).toHaveLength(3)
    expect(s3.cursor).toBe('c2')
  })
})

describe('pollOnce: the row cap is said, not silent (W9)', () => {
  test('when the cap drops rows the state says so; it stays false otherwise', async () => {
    const base = fixtureEvents()[0]!
    const many = Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ({
      ...base,
      id: `evt_${i.toString(16).padStart(16, '0')}`,
      dedup_key: `${base.dedup_key}:${i}`,
      times: { ...base.times, occurred_at: new Date(T0 - i * 1000).toISOString() },
    }))
    const small = await pollOnce(initialFeedState, deps(healthy))
    expect(small.trimmed).toBe(false)
    const h: Handler = (u) => (u.pathname === '/api/v1/status' ? json(status) : json(page(many, 'c1')))
    const s = await pollOnce(initialFeedState, deps(h))
    expect(s.events).toHaveLength(MAX_EVENTS)
    expect(s.trimmed).toBe(true)
  })
})

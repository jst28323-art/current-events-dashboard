// Test doubles: a fake upstream (no network), a fake clock and a fake sleep. The fake server honours If-None-Match /
// If-Modified-Since only where a route says so, so tests can tell apart which validator a source honours.
import type { ProbeDeps } from '../src/probe.js'
import type { ProbeTarget } from '../src/targets.js'

export interface FakeRoute {
  status?: number
  body?: string
  headers?: Record<string, string>
  honourInm?: boolean
  honourIms?: boolean
  throws?: () => Error
  /** Send these bytes of the body, then fail the body stream with this error (e.g. a timeout mid-body). */
  bodyFailsAfter?: { sent: string; error: () => Error }
  /** Deliver the body in chunks of this many bytes (a marker can straddle two chunks). */
  chunkBytes?: number
}

export interface FakeCall {
  url: string
  headers: Headers
  init: RequestInit
}

/** Fake time starts 30 days ahead of the real clock: alarms armed on it never fire on their own during a test. */
export const T0 = Date.now() + 30 * 24 * 3600_000

/** Strip the fr.api cache-buster so a route matches its canonical URL. */
export const canonical = (url: string) => url.replace(/[?&]_=\d+$/, '')

export function fakeClock(start = T0, stepMs = 5) {
  let t = start
  const sleeps: number[] = []
  return {
    sleeps,
    now: () => (t += stepMs),
    sleep: async (ms: number) => {
      sleeps.push(ms)
      t += ms
    },
    advance: (ms: number) => {
      t += ms
    },
    peek: () => t,
  }
}

export function fakeServer(routes: Record<string, FakeRoute>, fallback: FakeRoute | null = { status: 200, body: '{}' }) {
  const calls: FakeCall[] = []
  let inFlight = 0
  let maxInFlight = 0
  const fetch: ProbeDeps['fetch'] = async (url, init) => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    try {
      await new Promise((r) => setTimeout(r, 0)) // a real await, so overlapping requests would show up
      const headers = new Headers(init.headers)
      calls.push({ url, headers, init })
      const route = routes[canonical(url)] ?? fallback
      if (!route) return new Response('no route', { status: 404 })
      if (route.throws) throw route.throws()
      const rh = new Headers(route.headers ?? {})
      const inm = headers.get('if-none-match')
      const ims = headers.get('if-modified-since')
      if (route.honourInm && inm !== null && inm === rh.get('etag')) return new Response(null, { status: 304, headers: rh })
      if (route.honourIms && ims !== null && ims === rh.get('last-modified')) return new Response(null, { status: 304, headers: rh })
      if (route.bodyFailsAfter) {
        const { sent, error } = route.bodyFailsAfter
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(sent))
            c.error(error())
          },
        })
        return new Response(stream, { status: route.status ?? 200, headers: rh })
      }
      if (route.chunkBytes) {
        const bytes = new TextEncoder().encode(route.body ?? '')
        const size = route.chunkBytes
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            for (let o = 0; o < bytes.byteLength; o += size) c.enqueue(bytes.slice(o, o + size))
            c.close()
          },
        })
        return new Response(stream, { status: route.status ?? 200, headers: rh })
      }
      return new Response(route.body ?? '', { status: route.status ?? 200, headers: rh })
    } finally {
      inFlight--
    }
  }
  return { fetch, calls, maxInFlight: () => maxInFlight }
}

/** The smallest body that passes a target's body check (its format, XML root, page marker). */
export function goodBody(t: ProbeTarget): string {
  switch (t.expect) {
    case 'json':
      return '{}'
    case 'xml':
      return `<?xml version="1.0" encoding="UTF-8"?><${t.root?.[0] ?? 'root'}/>`
    case 'html':
      return `<!DOCTYPE html><html><head><title>x</title></head><body>${t.marker ?? ''}</body></html>`
    case 'hls':
      return '#EXTM3U\n#EXT-X-VERSION:3\n'
  }
}

/** One route per target, each answering its good body with these headers (validators etc.). */
export function routesFor(targets: readonly ProbeTarget[], route: Omit<FakeRoute, 'body'> = {}): Record<string, FakeRoute> {
  return Object.fromEntries(targets.map((t) => [t.url, { ...route, body: goodBody(t) }]))
}

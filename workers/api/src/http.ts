// The read-only public HTTP API (docs/ARCHITECTURE.md "API contract"; shapes in packages/schema/src/api.ts).
// Every answer is JSON with Cache-Control: no-store; only env.PAGES_ORIGIN gets a CORS grant; only GET is served
// (OPTIONS answers a preflight); a HubDO failure is a 503 JSON answer, never an uncaught exception. The hub, the source list and the clock are injected so tests can drive them.
import type { SourceDefinition } from '@ced/adapters'
import type { CedEvent, StatusResponse } from '@ced/schema'
import type { EventsAnswer, SourceInfo } from './hub.js'
import { DEFAULT_LIMIT, FEED_SIZE, MAX_LIMIT, describeSources } from './policy.js'

/** The HubDO calls the API makes (a DurableObjectStub<HubDO> satisfies this). */
export interface ApiHub {
  events(q: { since: string | null; limit: number; now_ms: number }): Promise<EventsAnswer>
  status(nowMs: number, sources: SourceInfo[]): Promise<StatusResponse>
  recent(n: number): Promise<string[]>
}

export interface HttpDeps {
  hub: ApiHub
  sources: readonly SourceDefinition[]
  now: () => number
}

export function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  return origin != null && origin === env.PAGES_ORIGIN
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : { Vary: 'Origin' }
}

function json(body: unknown, status: number, extra: Record<string, string>, contentType = 'application/json'): Response {
  return raw(JSON.stringify(body), status, extra, contentType)
}

/** A JSON response whose body is already serialized. */
function raw(text: string, status: number, extra: Record<string, string>, contentType = 'application/json'): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': `${contentType}; charset=utf-8`, 'Cache-Control': 'no-store', ...extra },
  })
}

/** limit: an integer 1..MAX_LIMIT written plainly (no sign, no leading zero, no exponent); default DEFAULT_LIMIT. */
export function parseLimit(value: string | null): number | null {
  if (value == null) return DEFAULT_LIMIT
  if (!/^[1-9][0-9]{0,2}$/.test(value)) return null
  const n = Number(value)
  return n <= MAX_LIMIT ? n : null
}

/** JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/); our own fields under `_ced`. An item's `id` is the event's
 * dedup_key, which a revision keeps: the spec says an updated item keeps its id, and the event id changes with every
 * revision, so a reader saw each revised event as a new item (review F2 of 861a6f4: the D-059 flip revises ~100 at
 * once). The event id and revision are in `_ced`. */
export function jsonFeed(events: CedEvent[], feedUrl: string, homePageUrl: string): unknown {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'US federal government live feed',
    home_page_url: homePageUrl,
    feed_url: feedUrl,
    description: 'Federal events as they happen, each linked to its primary source; official text verbatim.',
    language: 'en-US',
    items: events.map((e) => {
      const primary = e.sources[0]!
      return {
        id: e.dedup_key,
        url: primary.url,
        title: e.title,
        content_text: e.official_text,
        date_published: e.times.occurred_at ?? e.times.first_seen_at,
        _ced: {
          event_type: e.event_type,
          tier: e.importance?.tier ?? null,
          affiliation: primary.affiliation,
          source_id: primary.source_id,
          event_id: e.id,
          revision: e.revision,
        },
      }
    }),
  }
}

export async function handleRequest(request: Request, env: Env, deps: HttpDeps): Promise<Response> {
  const url = new URL(request.url)
  const cors = corsHeaders(env, request.headers.get('Origin'))
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store' },
    })
  }
  if (request.method !== 'GET') return json({ error: 'method not allowed: this API is read-only' }, 405, { ...cors, Allow: 'GET' })

  try {
    return await route(url, env, deps, cors)
  } catch (e) {
    // A HubDO failure (e.g. "Durable Object reset because its code was updated", on any deploy) must still be JSON
    // with the CORS grant: an uncaught throw becomes workerd's own HTML 500 without CORS, which the web app cannot read.
    console.error(`${url.pathname} failed: ${e instanceof Error ? e.message : String(e)}`)
    return json({ error: 'the event store did not answer; try again shortly' }, 503, cors)
  }
}

async function route(url: URL, env: Env, deps: HttpDeps, cors: Record<string, string>): Promise<Response> {
  switch (url.pathname) {
    case '/':
      return json(
        {
          name: 'ced-api',
          description: 'Read-only API of the US federal government live feed.',
          endpoints: {
            '/api/v1/events': 'newest events, or every change after ?since=<cursor> (&limit=1..500, default 100)',
            '/api/v1/status': 'per-source health, freshness and latency',
            '/feed.json': `JSON Feed 1.1 of the newest ${FEED_SIZE} events`,
          },
          app: env.APP_URL,
        },
        200,
        cors,
      )
    case '/api/v1/events': {
      const limit = parseLimit(url.searchParams.get('limit'))
      if (limit == null) return json({ error: `limit must be an integer from 1 to ${MAX_LIMIT}` }, 400, cors)
      const since = url.searchParams.get('since')
      const answer = await deps.hub.events({ since, limit, now_ms: deps.now() })
      return answer.ok ? raw(answer.json, 200, cors) : json({ error: answer.error }, 400, cors)
    }
    case '/api/v1/status': {
      const nowMs = deps.now()
      return json(await deps.hub.status(nowMs, describeSources(deps.sources, nowMs)), 200, cors)
    }
    case '/feed.json': {
      const events = (await deps.hub.recent(FEED_SIZE)).map((j) => JSON.parse(j) as CedEvent)
      return json(jsonFeed(events, `${url.origin}/feed.json`, env.APP_URL), 200, cors, 'application/feed+json')
    }
    default:
      return json({ error: 'not found' }, 404, cors)
  }
}

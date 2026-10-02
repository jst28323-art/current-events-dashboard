// ced-api entry: a 1-minute cron polls the registered sources into the HubDO; fetch serves the read-only API.
// Phase 1 scaffold (ROADMAP P1.2): routing, CORS and the HubDO skeleton; P1.5 fills in polling and storage.
import { DurableObject } from 'cloudflare:workers'
import { SOURCES } from '@ced/adapters'

export interface StatusPayload {
  generated_at: string
  sources: Array<{ source_id: string; name: string }>
}

export class HubDO extends DurableObject<Env> {
  async status(): Promise<StatusPayload> {
    return {
      generated_at: new Date().toISOString(),
      sources: SOURCES.map((s) => ({ source_id: s.source_id, name: s.name })),
    }
  }
}

function hub(env: Env) {
  return env.HUB.get(env.HUB.idFromName('hub'))
}

export function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  return origin === env.PAGES_ORIGIN ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' }
}

function json(body: unknown, status: number, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    const cors = corsHeaders(env, request.headers.get('Origin'))
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } })
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, cors)
    if (url.pathname === '/api/v1/status') return json(await hub(env).status(), 200, cors)
    return json({ error: 'not found' }, 404, cors)
  },
  async scheduled(_controller, _env, _ctx): Promise<void> {
    // P1.5: poll each registered source into the HubDO.
  },
} satisfies ExportedHandler<Env>

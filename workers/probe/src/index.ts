// ced-probe: the temporary P1.3 measurement Worker (docs/ROADMAP.md P1.3; owner grant G-010 / D-032).
//
// From Cloudflare's network it measures (1) whether each key-free Tier 1-2 source is reachable and which cache
// validator gets a 304, (2) whether a Durable Object alarm, a fetch invocation and a cron invocation on the Free plan
// are cut off by the CPU limit (calibrated busy work, src/busy.ts), and (3) alarm timing jitter. Everything lands in one
// SQLite Durable Object (src/do.ts); GET /results returns it as JSON.
//
// SAFETY: a cron every 30 min drives everything; after MAX_CRON_RUNS (src/config.ts) it only serves /results.
//
// This is the main module: workerd treats every named export here as an entrypoint and refuses to start if one is a
// plain value (docs/TRAPS.md), so it exports ONLY the default handler and the entrypoint classes (pinned by a test).
import { MAX_CRON_RUNS } from './config.js'
import { probeStub } from './do.js'
import { runScheduled } from './scheduled.js'

export { ProbeDO } from './do.js'
export { CpuFetchEntry } from './scheduled.js'

const INDEX = {
  name: 'ced-probe',
  what: 'Temporary measurement Worker for current-events-dashboard (ROADMAP P1.3): reachability and cache validators of the key-free Tier 1-2 sources from Cloudflare\'s network, the Durable Object alarm / fetch / cron CPU limit on the Free plan, and alarm timing jitter.',
  endpoints: {
    '/results': 'every measurement as JSON; /results?rows=0 for the summaries only',
    '/results/sources.md': 'the paste-ready docs/SOURCES.md probe table (Markdown), built from the measured summaries',
  },
  safety: `stops all outbound requests by itself after ${MAX_CRON_RUNS} cron runs (~24 h); after that it only serves /results`,
  repo: 'https://github.com/jst28323-art/current-events-dashboard',
}

function json(body: unknown, status: number): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405)
    const url = new URL(request.url)
    const stub = probeStub(env)
    if (url.pathname === '/') return json({ ...INDEX, status: await stub.status() }, 200)
    if (url.pathname === '/results') return json(await stub.resultsJson(url.searchParams.get('rows') !== '0'), 200)
    if (url.pathname === '/results/sources.md') {
      return new Response(await stub.sourcesMarkdown(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' } })
    }
    return json({ error: 'not found' }, 404)
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    await runScheduled(env, ctx)
  },
} satisfies ExportedHandler<Env>

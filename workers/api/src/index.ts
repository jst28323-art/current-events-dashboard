// ced-api entry (docs/ARCHITECTURE.md; ROADMAP P1.5): a 1-minute cron polls the registered sources (@ced/adapters
// SOURCES) into the HubDO; fetch serves the read-only API. All logic lives in poll.ts, hub.ts and http.ts with its
// dependencies injected; this file only wires the real ones (the "hub" instance, SOURCES, Date.now, fetch).
// Export ONLY the default handler and entrypoint classes from this module (test/entry.test.ts; docs/TRAPS.md).
import { SOURCES } from '@ced/adapters'
import { HubDO } from './hub.js'
import { hub } from './hub_ref.js'
import { handleRequest } from './http.js'
import { pollOnce } from './poll.js'

export { HubDO }

export default {
  async fetch(request, env): Promise<Response> {
    return handleRequest(request, env, { hub: hub(env), sources: SOURCES, now: () => Date.now() })
  },
  async scheduled(_controller, env, _ctx): Promise<void> {
    const runs = await pollOnce({
      hub: hub(env),
      sources: SOURCES,
      fetch: (url, init) => fetch(url, init),
      now: () => Date.now(),
      random: () => Math.random(),
      codeVersion: env.CF_VERSION_METADATA?.id || undefined,
    })
    const polled = runs.filter((r) => r.action === 'polled').length
    const failed = runs.filter((r) => r.action === 'failed').length
    if (runs.length > 0) console.log(`cron: ${polled} polled, ${runs.length - polled - failed} skipped, ${failed} failed`)
  },
} satisfies ExportedHandler<Env>

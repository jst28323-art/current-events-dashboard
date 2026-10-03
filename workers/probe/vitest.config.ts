// Tests run inside workerd (@cloudflare/vitest-plugin) with an injected fetch: they never touch the network. Note: the
// test runtime is MORE permissive than production (docs/TRAPS.md), and it has no CPU limit, so these tests prove the
// bookkeeping, never the limit itself.
//
// NODE_BUSY (test-only service binding, not in wrangler.jsonc): runs src/busy.ts busy(n) in THIS Node process and
// returns its wall time, so test/busy.test.ts can compare the same loop in workerd and in Node on the same machine at
// the same moment (a busy loop that runs at a different speed in workerd made the Node calibration wrong by ~2.6x).
import { defineProject } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { busy } from './src/busy.ts'

function nodeBusy(request: Request): Response {
  const n = Number(new URL(request.url).searchParams.get('n'))
  if (!Number.isSafeInteger(n) || n < 0 || n > 2_000_000_000) return new Response('bad n', { status: 400 })
  const t0 = performance.now()
  const checksum = busy(n)
  const ms = performance.now() - t0
  return Response.json({ ms, checksum })
}

export default defineProject({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { serviceBindings: { NODE_BUSY: nodeBusy } } })],
  test: { name: 'probe', include: ['test/**/*.test.ts'] },
})

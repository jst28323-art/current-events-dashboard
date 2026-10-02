// Tests run inside workerd (@cloudflare/vitest-plugin). Note: the test runtime is MORE permissive than production
// (it allows eval/new Function and adds node-compat flags), so it cannot prove a library is eval-free: docs/TRAPS.md.
import { defineProject } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'

export default defineProject({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: { name: 'api', include: ['test/**/*.test.ts'] },
})

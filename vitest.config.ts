// One `vitest run` for every workspace (npm run test → the gate). Each workspace has its own defineProject config;
// workers/* run inside workerd through @cloudflare/vitest-plugin (the renamed vitest-pool-workers: docs/TRAPS.md).
// Workspaces deliberately have no `test` script of their own, so nothing runs twice.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'workers/*', 'apps/*'],
  },
})

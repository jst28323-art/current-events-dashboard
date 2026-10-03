// Built by .github/workflows/pages.yml and served at https://jst28323-art.github.io/current-events-dashboard/.
// VITE_API_BASE (build-time) names the live API; the default is the D-027 address.
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  base: '/current-events-dashboard/',
  plugins: [preact()],
  // ONE Preact in the bundle. npm hoists preact 11 to the root node_modules (as @preact/signals' peer) while this app
  // pins 10.x in apps/web/node_modules; without dedupe, signals hooks attach to the other copy and the page never
  // re-renders after the first paint (stuck on "Loading", 2026-10-02; e2e caught it). Dedupe resolves every `preact`
  // import from this project's root.
  resolve: { dedupe: ['preact'] },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
})

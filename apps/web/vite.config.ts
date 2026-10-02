// Built by .github/workflows/pages.yml and served at https://jst28323-art.github.io/current-events-dashboard/.
// VITE_API_BASE (build-time) names the live API; the default is the D-027 address.
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  base: '/current-events-dashboard/',
  plugins: [preact()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
})

// End-to-end tests of the built page (TESTING.md layer 5): Vite builds apps/web, `vite preview` serves dist/ on a fixed
// port, and every test route-mocks the API (no network). Phone 390x844 and desktop 1440x900, Chromium.
// Screenshots go to scratch/screens/ at the repo root (gitignored; looked at, never committed).
import { defineConfig } from '@playwright/test'

const PORT = 4391
const CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  workers: CI ? 2 : 4,
  reporter: CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/current-events-dashboard/`,
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
  // Always build first, so the suite can never pass against a stale dist/; never reuse a server it did not start.
  webServer: {
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/current-events-dashboard/`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})

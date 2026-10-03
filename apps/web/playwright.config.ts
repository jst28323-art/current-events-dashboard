// End-to-end tests of the built page (TESTING.md layer 5): Vite builds apps/web, `vite preview` serves dist/ on a fixed
// port, and every test route-mocks the API (no network). Phone 390x844 and desktop 1440x900, each in Chromium and in
// WebKit (Safari's engine; docs/DESIGN_LANGUAGE.md asks for both, D-046). Playwright's WebKit is not iOS Safari: it is
// the same engine family built for the test host, so it catches WebKit layout/CSS/JS differences, not iOS-only ones
// (real safe-area insets, the collapsing URL bar, iOS font rendering). Tests that depend on the form factor read
// `isPhone()` from e2e/project.ts, never a project name.
// Screenshots go to scratch/screens/ at the repo root (gitignored; looked at, never committed).
import { defineConfig, devices } from '@playwright/test'

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
    // An iPhone (iPhone 13 descriptor: Mobile Safari user agent, 3x, touch, a mobile viewport honouring
    // <meta name="viewport">) at the same 390x844 as the Chromium phone.
    // WebKit runs every test except those tagged @engine-agnostic: today one, "polling pauses while the tab is hidden"
    // (e2e/feed.spec.ts), which fakes visibility with a synthetic event under Playwright's injected fake clock, so the
    // engine adds nothing (it passed in WebKit before being scoped out, 2026-10-03). Never tag a test of an exit
    // criterion: the fail-closed suite runs in every engine (test/e2e-coverage.test.ts; review R1).
    { name: 'webkit-phone', grepInvert: /@engine-agnostic/, use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: 'webkit-desktop', grepInvert: /@engine-agnostic/, use: { ...devices['Desktop Safari'], browserName: 'webkit', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
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

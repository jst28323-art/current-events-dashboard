// (e) Screenshots for looking at (TESTING.md rule 6): each state, light and dark, at the project's size.
// Saved to <repo>/scratch/screens/ (gitignored; never committed) as <state>-<phone|desktop>-<scheme>.png for Chromium and
// webkit-<state>-<phone|desktop>-<scheme>.png for WebKit (e2e/project.ts shotName).
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { repeatedEvents, sourceStatus } from './fixture-events.js'
import { iso, MockApi, nextPoll, openPaused, T0 } from './mock-api.js'
import { shotName } from './project.js'
import { shot } from './shot.js'

const SCREENS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scratch/screens')
mkdirSync(SCREENS, { recursive: true })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme })

    test('feed', async ({ page }, info) => {
      const api = new MockApi()
      await openPaused(page, api)
      await expect(page.getByTestId('event-row')).toHaveCount(4)
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'feed', scheme)}`, fullPage: true }))
    })

    test('unavailable after data', async ({ page }, info) => {
      const api = new MockApi()
      await openPaused(page, api)
      await expect(page.getByTestId('event-row')).toHaveCount(4)
      api.mode = 'down'
      await nextPoll(page, api)
      await expect(page.getByTestId('unavailable')).toBeVisible()
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'unavailable', scheme)}`, fullPage: true }))
    })

    test('unavailable before any data', async ({ page }, info) => {
      const api = new MockApi()
      api.mode = 'down'
      await openPaused(page, api)
      await expect(page.getByTestId('unavailable')).toBeVisible()
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'nodata', scheme)}`, fullPage: true }))
    })

    test('long source name, stale, then API down (last known)', async ({ page }, info) => {
      const api = new MockApi()
      api.status = {
        generated_at: iso(T0),
        sources: [
          sourceStatus('fr.api', iso(T0 - 30_000), { name: 'Office of the Federal Register Public Inspection Desk (special filings)', stale: true }),
          sourceStatus('wh.feeds', iso(T0 - 30_000)),
        ],
      }
      await openPaused(page, api)
      await expect(page.getByTestId('event-row')).toHaveCount(4)
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'longname', scheme)}`, fullPage: true }))
      api.mode = 'down'
      await nextPoll(page, api)
      await expect(page.getByTestId('unavailable')).toBeVisible()
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'longname-down', scheme)}`, fullPage: true }))
    })

    // The header material over content (a viewport shot: a full-page shot never scrolls, so it never shows the blur).
    test('scrolled under the header', async ({ page }, info) => {
      const api = new MockApi()
      api.events = repeatedEvents(4)
      await openPaused(page, api)
      await expect(page.getByTestId('event-row')).toHaveCount(16)
      await page.evaluate(() => window.scrollTo(0, 560))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(560)
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'scrolled', scheme)}` }))
    })

    // The same, for a viewer who asks for more contrast: the opaque bar (styles.css fallback; layout.spec.ts WK4).
    test('scrolled under the header, more contrast asked for', async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: scheme, contrast: 'more' })
      const api = new MockApi()
      api.events = repeatedEvents(4)
      await openPaused(page, api)
      await expect(page.getByTestId('event-row')).toHaveCount(16)
      await page.evaluate(() => window.scrollTo(0, 560))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(560)
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'scrolled-opaque', scheme)}` }))
    })

    test('loading', async ({ page }, info) => {
      const api = new MockApi()
      api.mode = 'hang'
      await openPaused(page, api)
      await expect(page.getByTestId('loading')).toBeVisible()
      await shot(() => page.screenshot({ path: `${SCREENS}/${shotName(info, 'loading', scheme)}`, fullPage: true, animations: 'disabled' }))
    })
  })
}

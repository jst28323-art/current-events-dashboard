// (e) Screenshots for looking at (TESTING.md rule 6): each state, light and dark, at the project's size.
// Saved to <repo>/scratch/screens/ (gitignored; never committed).
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { sourceStatus } from './fixture-events.js'
import { iso, MockApi, nextPoll, openPaused, T0 } from './mock-api.js'

const SCREENS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scratch/screens')
mkdirSync(SCREENS, { recursive: true })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme })

    test('feed', async ({ page }, info) => {
      const api = new MockApi()
      await openPaused(page, api)
      await expect(page.getByTestId('event-row')).toHaveCount(4)
      await page.screenshot({ path: `${SCREENS}/feed-${info.project.name}-${scheme}.png`, fullPage: true })
    })

    test('unavailable after data', async ({ page }, info) => {
      const api = new MockApi()
      await openPaused(page, api)
      await expect(page.getByTestId('event-row')).toHaveCount(4)
      api.mode = 'down'
      await nextPoll(page, api)
      await expect(page.getByTestId('unavailable')).toBeVisible()
      await page.screenshot({ path: `${SCREENS}/unavailable-${info.project.name}-${scheme}.png`, fullPage: true })
    })

    test('unavailable before any data', async ({ page }, info) => {
      const api = new MockApi()
      api.mode = 'down'
      await openPaused(page, api)
      await expect(page.getByTestId('unavailable')).toBeVisible()
      await page.screenshot({ path: `${SCREENS}/nodata-${info.project.name}-${scheme}.png`, fullPage: true })
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
      await page.screenshot({ path: `${SCREENS}/longname-${info.project.name}-${scheme}.png`, fullPage: true })
      api.mode = 'down'
      await nextPoll(page, api)
      await expect(page.getByTestId('unavailable')).toBeVisible()
      await page.screenshot({ path: `${SCREENS}/longname-down-${info.project.name}-${scheme}.png`, fullPage: true })
    })

    test('loading', async ({ page }, info) => {
      const api = new MockApi()
      api.mode = 'hang'
      await openPaused(page, api)
      await expect(page.getByTestId('loading')).toBeVisible()
      await page.screenshot({ path: `${SCREENS}/loading-${info.project.name}-${scheme}.png`, fullPage: true, animations: 'disabled' })
    })
  })
}

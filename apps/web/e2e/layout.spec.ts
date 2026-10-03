// Layout and legibility at both sizes (review findings W2, W3, W5, 2026-10-02): a long source name never pushes the
// page sideways or the health word off screen; "last known" health chips keep readable contrast; the source link is a
// real tap target.
import { expect, test, type Page } from '@playwright/test'
import { measuredContrast } from './contrast.js'
import { sourceStatus } from './fixture-events.js'
import { iso, MockApi, nextPoll, openPaused, T0 } from './mock-api.js'

const hScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// Longer than any Phase-1 name; registry names of later sources (Press Gallery, committees) run this long.
const LONG_NAME = 'Office of the Federal Register Public Inspection Desk (special filings)'

test('(W2) a long source name in a health chip: no sideways scroll, and the health word stays on screen', async ({ page }) => {
  const api = new MockApi()
  api.status = {
    generated_at: iso(T0),
    sources: [sourceStatus('fr.api', iso(T0 - 30_000), { name: LONG_NAME, stale: true }), sourceStatus('wh.feeds', iso(T0 - 30_000))],
  }
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(4)
  expect(await hScroll(page)).toBeLessThanOrEqual(0)
  const chip = page.locator('.health-chip[data-source="fr.api"]')
  await expect(chip.locator('.state')).toHaveText('stale')
  await expect(chip.locator('.state')).toBeInViewport({ ratio: 1 })
  // The whole name is still in the chip's text (screen readers) and leads its tooltip.
  await expect(chip.locator('.name')).toHaveText(LONG_NAME)
  await expect(chip).toHaveAttribute('title', new RegExp(`^${LONG_NAME.replace(/[()]/g, '\\$&')}: `))
  const box = await chip.boundingBox()
  const vw = page.viewportSize()!.width
  expect(box!.x + box!.width).toBeLessThanOrEqual(vw)
})

test('(W5) the source link is a tap target: >= 44 px tall on a phone, >= 24 px on desktop; targets do not overlap', async ({ page }, info) => {
  const api = new MockApi()
  await openPaused(page, api)
  const links = page.getByTestId('source-link')
  await expect(links).toHaveCount(4)
  const min = info.project.name === 'phone' ? 44 : 24
  const boxes = []
  for (let i = 0; i < 4; i++) {
    const b = (await links.nth(i).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(min)
    boxes.push(b)
  }
  for (let i = 0; i + 1 < boxes.length; i++) expect(boxes[i]!.y + boxes[i]!.height).toBeLessThanOrEqual(boxes[i + 1]!.y)
  // A tap near the top and bottom edges of the target lands on the link itself (nothing paints over it).
  for (const b of boxes.slice(0, 2)) {
    for (const y of [b.y + 2, b.y + b.height - 2]) {
      const hit = await page.evaluate(([x, yy]) => document.elementFromPoint(x!, yy!)?.closest('a')?.dataset['testid'] ?? null, [b.x + b.width / 2, y])
      expect(hit).toBe('source-link')
    }
  }
  expect(await hScroll(page)).toBeLessThanOrEqual(0)
})

for (const scheme of ['light', 'dark'] as const) {
  test(`(W3) ${scheme}: "last known" health chips keep >= 4.5:1 text contrast while the API is down`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'pixel contrast needs deviceScaleFactor >= 2 (see contrast.ts); the phone project has 3')
    await page.emulateMedia({ colorScheme: scheme })
    const api = new MockApi()
    api.status = { generated_at: iso(T0), sources: [sourceStatus('fr.api', iso(T0 - 30_000)), sourceStatus('wh.feeds', iso(T0 - 30_000), { stale: true })] }
    await openPaused(page, api)
    await expect(page.getByTestId('event-row')).toHaveCount(4)
    api.mode = 'down'
    await nextPoll(page, api)
    await expect(page.getByTestId('unavailable')).toBeVisible()
    await expect(page.locator('ul.health')).toHaveAttribute('data-last-known', 'true')
    for (const sel of [
      '.health-chip[data-source="fr.api"] .name',
      '.health-chip[data-source="fr.api"] .state',
      '.health-chip[data-source="wh.feeds"] .name',
      '.health-chip[data-source="wh.feeds"] .state',
    ]) {
      const c = await measuredContrast(page, page.locator(sel))
      test.info().annotations.push({ type: 'contrast', description: `${scheme} ${sel}: ${c.ratio.toFixed(2)}:1 (fg ${c.fg} on bg ${c.bg})` })
      expect(c.ratio, `${sel}: fg ${c.fg} on bg ${c.bg}`).toBeGreaterThanOrEqual(4.5)
    }
    // Still told apart from live health: the ok dot loses its green.
    const dot = await page.locator('.health-chip[data-source="fr.api"] .dot').evaluate((el) => getComputedStyle(el).backgroundColor)
    const okGreen = await page.evaluate(() => {
      const probe = document.createElement('span')
      probe.style.color = 'var(--ok)'
      document.body.append(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    })
    expect(dot).not.toBe(okGreen)
  })
}

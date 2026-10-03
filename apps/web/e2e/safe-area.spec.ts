// (WK3, 2026-10-03) Safe-area insets. index.html asks for viewport-fit=cover, so on an iPhone the page runs under the
// status bar / Dynamic Island and the home indicator, and styles.css must pad with env(safe-area-inset-*). Playwright's
// WebKit cannot emulate insets (on Windows they are always 0), so this runs in Chromium, whose DevTools protocol can
// (Emulation.setSafeAreaInsetsOverride). env() is the same CSS in Safari, so this pins OUR use of it; only a real
// iPhone proves the device's own insets. Inset sizes are representative notch-phone values (portrait top 47 / bottom
// 34; landscape sides 47 / bottom 21); the checks hold for any values.
import { expect, test, type Page } from '@playwright/test'
import { repeatedEvents } from './fixture-events.js'
import { MockApi, openPaused } from './mock-api.js'
import { engineOf, isPhone } from './project.js'

type Insets = { top: number; bottom: number; left: number; right: number }

async function openWithInsets(page: Page, insets: Insets): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never)
  const api = new MockApi()
  api.events = repeatedEvents(4)
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(16)
  // The override really reached the page (else every check below would pass trivially at 0).
  const seen = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'
    document.body.append(probe)
    const cs = getComputedStyle(probe)
    const r = { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) }
    probe.remove()
    return r
  })
  expect(seen).toEqual({ top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left })
}

test.beforeEach(({}, info) => {
  test.skip(engineOf(info) !== 'chromium' || !isPhone(info), "insets can be emulated only through Chromium's DevTools protocol, on the phone project")
})

test('(WK3) portrait: the material reaches the top edge, the title clears the status bar, the last row clears the home indicator', async ({ page }) => {
  const insets = { top: 47, bottom: 34, left: 0, right: 0 }
  await openWithInsets(page, insets)
  const vh = page.viewportSize()!.height
  const header = (await page.locator('header.toolbar').boundingBox())!
  expect(header.y).toBe(0)
  const h1 = (await page.locator('header.toolbar h1').boundingBox())!
  expect(h1.y).toBeGreaterThanOrEqual(insets.top)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const last = (await page.getByTestId('event-row').last().boundingBox())!
  expect(last.y + last.height, 'the last row ends above the home indicator').toBeLessThanOrEqual(vh - insets.bottom + 0.5)
  // Pinned header still clears the status bar after scrolling.
  expect((await page.locator('header.toolbar h1').boundingBox())!.y).toBeGreaterThanOrEqual(insets.top)
})

test('(WK3) landscape: no text under the side insets, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  const insets = { top: 0, bottom: 21, left: 47, right: 47 }
  await openWithInsets(page, insets)
  const vw = page.viewportSize()!.width
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('header h1, .updated, .health-chip, .row .meta, .row .title, .row .official, .row .foot')].map((el) => {
      const b = el.getBoundingClientRect()
      return { sel: el.className || el.tagName, left: b.left, right: b.right }
    }),
  )
  expect(boxes.length).toBeGreaterThan(50)
  for (const b of boxes) {
    expect(b.left, `${b.sel} left edge`).toBeGreaterThanOrEqual(insets.left)
    expect(b.right, `${b.sel} right edge`).toBeLessThanOrEqual(vw - insets.right)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

// Layout and legibility at both sizes (review findings W2, W3, W5, 2026-10-02): a long source name never pushes the
// page sideways or the health word off screen; "last known" health chips keep readable contrast; the source link is a
// real tap target.
import { expect, test, type Page } from '@playwright/test'
import { measuredContrast } from './contrast.js'
import { repeatedEvents, sourceStatus } from './fixture-events.js'
import { iso, MockApi, nextPoll, openPaused, T0 } from './mock-api.js'
import { decodePng } from './png.js'
import { engineOf, isPhone, scaleOf } from './project.js'

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
  const min = isPhone(info) ? 44 : 24
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

// (WK1, 2026-10-03) Every secondary-text surface, live and with the banner up, in each engine. WebKit paints alpha text
// one level lighter than Chromium: at the first light --label-2 (0.55) the health chip's "ok" read 4.563:1 in Chromium
// and 4.496:1 in WebKit, and the other light surfaces sat at 4.61-4.74:1. The source link host is not measured here:
// --accent #007aff on white is 4.02:1 by the WCAG formula, an open design question (reported 2026-10-03), not a
// rendering difference.
for (const scheme of ['light', 'dark'] as const) {
  test(`(WK1) ${scheme}: secondary text keeps >= 4.5:1 on every surface (chips, header, rows, banner)`, async ({ page }, info) => {
    test.skip(scaleOf(info) < 2, 'pixel contrast needs deviceScaleFactor >= 2 (see contrast.ts); the phone projects have 3, the desktop ones 1')
    await page.emulateMedia({ colorScheme: scheme })
    const api = new MockApi()
    api.status = { generated_at: iso(T0), sources: [sourceStatus('fr.api', iso(T0 - 30_000)), sourceStatus('wh.feeds', iso(T0 - 30_000), { stale: true })] }
    await openPaused(page, api)
    await expect(page.getByTestId('event-row')).toHaveCount(4)
    const check = async (sel: string) => {
      const c = await measuredContrast(page.locator(sel).first())
      test.info().annotations.push({ type: 'contrast', description: `${scheme} ${sel}: ${c.ratio.toFixed(2)}:1 (fg ${c.fg} on bg ${c.bg})` })
      expect(c.ratio, `${sel}: fg ${c.fg} on bg ${c.bg}`).toBeGreaterThanOrEqual(4.5)
    }
    for (const sel of [
      '.health-chip[data-source="fr.api"] .name',
      '.health-chip[data-source="fr.api"] .state', // "ok" in --label-2 on a chip over the material: the weakest
      '.health-chip[data-source="wh.feeds"] .state', // "stale" on the --warn tint
      '[data-testid="last-updated"]',
      '[data-testid="origin-chip"]',
      '[data-testid="event-time"]',
      '.row .official',
      '.row .foot .src',
      '.row.minor .title',
    ]) await check(sel)
    api.mode = 'down'
    await nextPoll(page, api)
    await expect(page.getByTestId('unavailable')).toBeVisible()
    for (const sel of ['[data-testid="unavailable"] strong', '[data-testid="unavailable"] span']) await check(sel)
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`(W3) ${scheme}: "last known" health chips keep >= 4.5:1 text contrast while the API is down`, async ({ page }, info) => {
    test.skip(scaleOf(info) < 2, 'pixel contrast needs deviceScaleFactor >= 2 (see contrast.ts); the phone projects have 3, the desktop ones 1')
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
      const c = await measuredContrast(page.locator(sel))
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

// (WK2, 2026-10-03) The header is the page's one translucent material (docs/DESIGN_LANGUAGE.md): it stays pinned at the
// top while rows scroll under it, paints over them, and the engine under test accepts its backdrop blur. Safari-only
// risks: sticky inside the rounded, clipped window (.shell overflow: clip at >= 760 px) and backdrop-filter support
// (Safari before 18 knows only the -webkit- form, pinned by test/safari.test.ts). What this cannot prove: that the blur
// is PAINTED. Playwright's WebKit 26.6 on Windows accepts backdrop-filter (computed value, CSS.supports) but paints it
// as a no-op: a bare overlay screenshots byte-identical with and without it (probe, 2026-10-03), so WebKit screenshots
// show rows sharp under the header. Chromium paints it; on an iPhone only the device shows it.
test('(WK2) the header stays pinned while rows scroll under its translucent, blurred material', async ({ page }) => {
  const api = new MockApi()
  api.events = repeatedEvents(4)
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(16)
  const header = page.locator('header.toolbar')
  const top0 = (await header.boundingBox())!.y
  await page.evaluate(() => window.scrollTo(0, 700))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(700)
  const box = (await header.boundingBox())!
  expect(box.y, `header top after scrolling 700 px (it was ${top0} before)`).toBeGreaterThanOrEqual(-0.5)
  expect(box.y).toBeLessThanOrEqual(0.5)
  // Rows are under it, and it paints over them.
  const under = await page.evaluate(([y0, y1]) => [...document.querySelectorAll('[data-testid="event-row"]')].some((r) => {
    const b = r.getBoundingClientRect()
    return b.top < y1! && b.bottom > y0!
  }), [box.y, box.y + box.height])
  expect(under).toBe(true)
  for (const y of [box.y + 2, box.y + box.height / 2, box.y + box.height - 2]) {
    const inHeader = await page.evaluate(([x, yy]) => document.elementFromPoint(x!, yy!)?.closest('header') != null, [box.x + box.width / 2, y])
    expect(inHeader, `the header is on top at y=${y}`).toBe(true)
  }
  const style = await header.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter') }
  })
  expect(style.blur).toMatch(/blur\(20px\)/)
  const alpha = /^rgba?\([^)]*[,/]\s*([0-9.]+)\)$/.exec(style.bg)?.[1]
  expect(alpha, `translucent background: ${style.bg}`).toBeDefined()
  expect(Number(alpha)).toBeLessThan(1)
})

// (WK4, 2026-10-03; review R2) Where the blur may not be painted, the header turns opaque, so rows never print through
// "Last updated" and the chips. Playwright's WebKit paints no backdrop blur, and its scrolled screenshots showed rows
// through the 0.68-0.72 material, unreadable: the default header is legible only where the blur is painted (Chromium,
// and the iPhone, D-044). The opaque fallback (styles.css) applies when the viewer asks for more contrast
// (`prefers-contrast: more`, emulated in both engines), for less transparency (`prefers-reduced-transparency: reduce`:
// Chromium supports it, emulated through its DevTools protocol; Playwright's WebKit 26.6 does not know the feature,
// probe 2026-10-03) and where backdrop-filter is unsupported (no engine here lacks it; test/safari.test.ts pins that
// rule). Measured as: the header's pixels do not change when other rows scroll under it. A control first runs the same
// comparison on the default, translucent header, which must change, so the comparison can see through the header.
for (const scheme of ['light', 'dark'] as const) {
  test(`(WK4) ${scheme}: asked for more contrast or less transparency, the header is opaque over scrolling rows`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme })
    const api = new MockApi()
    api.events = repeatedEvents(4)
    await openPaused(page, api)
    await expect(page.getByTestId('event-row')).toHaveCount(16)
    const header = page.locator('header.toolbar')
    const shotAt = async (y: number) => {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y)
      const box = (await header.boundingBox())!
      expect(Math.abs(box.y), `the header is pinned at the top at scrollY ${y}`).toBeLessThanOrEqual(0.5)
      return decodePng(await page.screenshot({ clip: box, animations: 'disabled' })).rgb
    }
    /** Header pixels that differ between two scroll positions with different rows under the header. */
    const changed = async () => {
      const a = await shotAt(700)
      const b = await shotAt(760)
      expect(b.length).toBe(a.length)
      let n = 0
      for (let i = 0; i < a.length; i += 3) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++
      return { n, of: a.length / 3 }
    }
    const control = await changed()
    expect(control.n / control.of, `control, the default translucent header: ${control.n} of ${control.of} pixels changed`).toBeGreaterThan(0.01)

    const asks: Array<[string, () => Promise<void>]> = [['prefers-contrast: more', () => page.emulateMedia({ colorScheme: scheme, contrast: 'more' })]]
    if (engineOf(info) === 'chromium') {
      asks.push(['prefers-reduced-transparency: reduce', async () => {
        await page.emulateMedia({ colorScheme: scheme, contrast: 'no-preference' })
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
      }])
    }
    for (const [ask, apply] of asks) {
      await apply()
      const style = await header.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter') }
      })
      expect(style.bg, `${ask}: an opaque header background`).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
      expect(style.blur, `${ask}: no blur under an opaque background`).toBe('none')
      const r = await changed()
      expect(r.n, `${ask}: ${r.n} of ${r.of} header pixels changed when other rows scrolled under it`).toBe(0)
      if (scaleOf(info) >= 2) {
        for (const sel of ['.health-chip[data-source="fr.api"] .state', '[data-testid="last-updated"]']) {
          const c = await measuredContrast(page.locator(sel))
          test.info().annotations.push({ type: 'contrast', description: `${scheme} ${ask} ${sel}: ${c.ratio.toFixed(2)}:1 (fg ${c.fg} on bg ${c.bg})` })
          expect(c.ratio, `${ask} ${sel}: fg ${c.fg} on bg ${c.bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
}

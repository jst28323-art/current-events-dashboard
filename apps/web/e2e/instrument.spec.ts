// The contrast instrument checked against an independent decoder: e2e/png.ts must read a real Playwright screenshot
// byte for byte as Chromium's own PNG decoder does (createImageBitmap + OffscreenCanvas, the method contrast.ts used
// before WebKit joined the suite). Runs where contrast is measured (deviceScaleFactor >= 2, the phone projects), in
// BOTH engines, because each writes its own kind of PNG: Chromium RGB (colour type 2), WebKit RGBA (colour type 6),
// with different scanline-filter mixes. The screenshot comes from the engine under test; the reference decode always
// runs in Chromium (the WebKit project launches one), since Playwright's WebKit on Windows has no OffscreenCanvas.
// Review R4 (2026-10-03): the first version ran in Chromium only, so the RGBA path that WebKit contrast depends on was
// covered only by the unit tests' synthetic round trips (test/png.test.ts).
import { chromium, expect, test, type Page } from '@playwright/test'
import { decodePng } from './png.js'
import { MockApi, nextPoll, openPaused } from './mock-api.js'
import { engineOf, scaleOf } from './project.js'

/** The PNG colour type each engine's screenshots use (observed 2026-10-03, Playwright 1.63). Pinned, so that the decode
 * path this check covers cannot change silently: if an engine starts writing another type, re-aim the check. */
const COLOUR_TYPE: Record<string, number> = { chromium: 2, webkit: 6 }

/** Chromium's own decode of `png` in `page`, as RGB. */
async function chromiumDecode(page: Page, png: Buffer): Promise<{ width: number; height: number; rgb: Buffer }> {
  const r = await page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    // RGB as base64 (a JSON array of millions of numbers took ~20 s to cross the protocol)
    let rgb = ''
    for (let i = 0; i < d.length; i += 4) rgb += String.fromCharCode(d[i]!, d[i + 1]!, d[i + 2]!)
    return { width: bmp.width, height: bmp.height, rgb: btoa(rgb) }
  }, png.toString('base64'))
  return { width: r.width, height: r.height, rgb: Buffer.from(r.rgb, 'base64') }
}

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: the Node PNG decoder agrees with Chromium's decoder on a real screenshot from the engine under test`, async ({ page }, info) => {
    test.skip(scaleOf(info) < 2, 'checked where contrast is measured (deviceScaleFactor >= 2, the phone projects)')
    const engine = engineOf(info)
    await page.emulateMedia({ colorScheme: scheme })
    const api = new MockApi()
    await openPaused(page, api)
    await expect(page.getByTestId('event-row')).toHaveCount(4)
    api.mode = 'down'
    await nextPoll(page, api) // the header now has the banner and last-known chips: material, tints, dashed outlines, text
    await expect(page.getByTestId('unavailable')).toBeVisible()
    const png = await page.locator('header.toolbar').screenshot({ animations: 'disabled' })
    expect(png.toString('latin1', 12, 16)).toBe('IHDR')
    expect(png[25], `${engine} screenshot PNG colour type (the decode path this run covers)`).toBe(COLOUR_TYPE[engine])
    const ours = decodePng(png)
    let theirs: { width: number; height: number; rgb: Buffer }
    if (engine === 'chromium') theirs = await chromiumDecode(page, png)
    else {
      const reference = await chromium.launch()
      try {
        theirs = await chromiumDecode(await reference.newPage(), png)
      } finally {
        await reference.close()
      }
    }
    expect([ours.width, ours.height]).toEqual([theirs.width, theirs.height])
    expect(theirs.rgb.length).toBe(ours.rgb.length)
    let differ = 0
    for (let i = 0; i < ours.rgb.length; i++) if (ours.rgb[i] !== theirs.rgb[i]) differ++
    expect(differ, `${differ} of ${ours.rgb.length} channel values differ`).toBe(0)
    // Not a blank image: the comparison covered real variety (text, tints, material).
    expect(new Set(Array.from({ length: ours.rgb.length / 3 }, (_, i) => (ours.rgb[i * 3]! << 16) | (ours.rgb[i * 3 + 1]! << 8) | ours.rgb[i * 3 + 2]!)).size).toBeGreaterThan(50)
  })
}

// Measured text contrast (WCAG 2 ratio) from real pixels: screenshot the element, decode the PNG inside the page with
// a canvas (no image library needed), take the most common pixel as the background and the pixel farthest from it in
// luminance as the text color. Measures what is painted (opacity, blending, translucent material included), which a
// computed-style calculation cannot. Use it at deviceScaleFactor >= 2: at 1x the cores of 11-13 px glyphs are
// anti-aliased and never reach the full text color, so the ratio reads low.
import type { Locator, Page } from '@playwright/test'

export interface Contrast {
  ratio: number
  fg: [number, number, number]
  bg: [number, number, number]
}

export async function measuredContrast(page: Page, target: Locator): Promise<Contrast> {
  const png = await target.screenshot({ animations: 'disabled' })
  return page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    const lin = (c: number) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const counts = new Map<number, number>()
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    let bgKey = 0
    let best = -1
    for (const [k, n] of counts) if (n > best) [bgKey, best] = [k, n]
    const bg: [number, number, number] = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255]
    const lb = lum(...bg)
    let fg = bg
    let far = -1
    for (const k of counts.keys()) {
      const px: [number, number, number] = [(k >> 16) & 255, (k >> 8) & 255, k & 255]
      const dist = Math.abs(lum(...px) - lb)
      if (dist > far) [fg, far] = [px, dist]
    }
    const lf = lum(...fg)
    return { ratio: (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05), fg, bg }
  }, png.toString('base64'))
}

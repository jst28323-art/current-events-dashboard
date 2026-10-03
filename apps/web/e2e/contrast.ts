// Measured text contrast (WCAG 2 ratio) from real pixels: screenshot the element, decode the PNG in Node (e2e/png.ts),
// take the most common pixel as the background and the pixel farthest from it in luminance as the text color. Measures
// what is painted (opacity, blending, translucent material included), which a computed-style calculation cannot. Use
// it at deviceScaleFactor >= 2: at 1x the cores of 11-13 px glyphs are anti-aliased and never reach the full text
// color, so the ratio reads low. The decode runs in Node, not in the page, so the same instrument measures Chromium and
// WebKit (WebKit on Windows has no OffscreenCanvas; e2e/png.ts).
import type { Locator } from '@playwright/test'
import { contrastOf, decodePng, type Contrast } from './png.js'
import { shot } from './shot.js'

export type { Contrast }

export async function measuredContrast(target: Locator): Promise<Contrast> {
  const png = await shot(() => target.screenshot({ animations: 'disabled' }))
  return contrastOf(decodePng(png).rgb)
}

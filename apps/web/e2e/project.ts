// What the running Playwright project emulates, read from its resolved `use` options (playwright.config.ts), never from
// its name: the same spec runs in Chromium and WebKit, and a check keyed on the name 'phone' silently stopped applying
// to 'webkit-phone' (it ran the desktop 24 px tap-target bound and skipped the contrast checks; found 2026-10-03).
import type { TestInfo } from '@playwright/test'

/** The phone form factor: a mobile viewport (isMobile), the phone type scale and the 44 px tap targets. */
export const isPhone = (info: TestInfo): boolean => info.project.use.isMobile === true

/** Device pixels per CSS pixel. Pixel-contrast measurement needs >= 2 (e2e/contrast.ts). */
export const scaleOf = (info: TestInfo): number => info.project.use.deviceScaleFactor ?? 1

/** The browser engine: 'chromium' | 'webkit' (| 'firefox', not configured). */
export const engineOf = (info: TestInfo): string => info.project.use.browserName ?? 'chromium'

/** Screenshot name part: 'phone' or 'desktop', with the engine as a prefix for any engine other than Chromium
 * (e.g. `webkit-feed-phone-light.png`; Chromium keeps its original `feed-phone-light.png`). */
export function shotName(info: TestInfo, state: string, scheme: string): string {
  const engine = engineOf(info)
  return `${engine === 'chromium' ? '' : `${engine}-`}${state}-${isPhone(info) ? 'phone' : 'desktop'}-${scheme}.png`
}

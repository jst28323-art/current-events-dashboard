// (a) Rows render from the API: time in the viewer's zone (America/Chicago here), origin chip, title, official_text,
// an https source link opening in a new tab. Events are built from the recorded fixtures (fixture-events.ts).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { EO_LINK, piEvent, whExecutiveOrderEvent } from './fixture-events.js'
import { iso, MockApi, nextPoll, openPaused } from './mock-api.js'

const norm = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ').trim()

test('rows show time, origin chip, title, official text and an https link; newest first', async ({ page }) => {
  const api = new MockApi()
  await openPaused(page, api)

  const rows = page.getByTestId('event-row')
  await expect(rows).toHaveCount(4)

  // Newest first. The EO post has no signing time: it sorts and shows by its posting time (Sep 29), labeled "posted",
  // so it sits BELOW the Oct 2 filings instead of on top as "first seen" (orchestrator integration, 2026-10-02).
  const eo = whExecutiveOrderEvent(EO_LINK)
  const eoRow = rows.nth(3)
  await expect(eoRow.getByTestId('origin-chip')).toHaveText(['White House'])
  await expect(eoRow.locator('.title')).toHaveText('The White House posted an executive order')
  await expect(eoRow.locator('.official')).toHaveText(eo.official_text)
  expect(norm(await eoRow.getByTestId('event-time').textContent())).toBe('posted Sep 29, 4:23 PM CDT') // fixture pubDate 21:23:48 +0000
  await expect(eoRow.getByTestId('event-time')).toHaveAttribute('datetime', eo.times.source_published_at!)

  const pd = piEvent('2026-20439', 'P0')
  const pdRow = rows.nth(0)
  await expect(pdRow.getByTestId('origin-chip')).toHaveText(['official'])
  await expect(pdRow.locator('.title')).toHaveText('Presidential document filed for public inspection (FR Doc. 2026-20439)')
  await expect(pdRow.locator('.official')).toHaveText(
    'Lebanon; Presidential Determination on Revocation of Prior Presidential Determinations (Presidential Determination No. 2026-25 of September 30, 2026)',
  )
  // Filed 11:15 ET (fixture filed_at 11:15-04:00) = 10:15 in the viewer's zone (Chicago), with the abbreviation.
  expect(norm(await pdRow.getByTestId('event-time').textContent())).toBe('Oct 2, 10:15 AM CDT')
  const link = pdRow.getByTestId('source-link')
  await expect(link).toHaveAttribute('href', pd.sources[0]!.url)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /\bnoopener\b/)
  expect(pd.sources[0]!.url.startsWith('https://')).toBe(true)
  await expect(link).toContainText('federalregister.gov')
  await expect(pdRow.locator('.src')).toHaveText('Federal Register')

  // Importance: P0/P1 emphasized, P4 lighter (and still shown: D-019).
  await expect(pdRow).toHaveClass(/\bmajor\b/)
  await expect(eoRow).toHaveClass(/\bmajor\b/)
  await expect(rows.filter({ hasText: '2026-20293' })).toHaveClass(/\bminor\b/)
  const w = async (row: typeof pdRow) => Number(await row.locator('.title').evaluate((el) => getComputedStyle(el).fontWeight))
  expect(await w(pdRow)).toBeGreaterThan(await w(rows.filter({ hasText: '2026-20293' })))

  // Header: last updated + one health chip per source.
  expect(norm(await page.getByTestId('last-updated').textContent())).toBe('Last updated 1:01:00 PM CDT')
  await expect(page.locator('.health-chip')).toHaveCount(2)
  await expect(page.locator('.health-chip[data-source="fr.api"]')).toContainText('Federal Register')
  await expect(page.locator('.health-chip[data-source="fr.api"] .state')).toHaveText('ok')
  await expect(page.locator('.health-chip[data-source="wh.feeds"] .state')).toHaveText('ok')
  await expect(page.getByTestId('unavailable')).toHaveCount(0)

  // The next poll asks only for what changed since the cursor; nothing went to the network.
  expect(api.requests.filter((r) => r.startsWith('/api/v1/events'))).toEqual(['/api/v1/events'])
  await nextPoll(page, api)
  await expect.poll(() => api.requests.filter((r) => r.startsWith('/api/v1/events'))).toEqual(['/api/v1/events', '/api/v1/events?since=c1'])
  await expect(rows).toHaveCount(4)
  expect(api.unexpected).toEqual([])
})

test('upstream text is shown as text, never parsed as HTML; a non-https source is not linked', async ({ page }) => {
  // The White House item's own RSS <description> (real upstream bytes, HTML markup included) as official_text.
  const xml = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/wh.feeds/2026-10-02/presidential-actions_feed.xml'), 'utf8')
  const item = xml.split('<item>').find((it) => it.includes(`<link>${EO_LINK}</link>`))!
  const raw = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(item)![1]!
  expect(raw).toContain('<a href=')
  const eo = { ...whExecutiveOrderEvent(EO_LINK), official_text: raw }
  const pd = piEvent('2026-20439', 'P0')
  const insecure = { ...pd, sources: [{ ...pd.sources[0]!, url: pd.sources[0]!.url.replace('https:', 'http:') }] }
  const api = new MockApi()
  api.events = [eo, insecure]
  await openPaused(page, api)

  const official = page.getByTestId('event-row').filter({ hasText: 'By the authority vested in me' }).locator('.official')
  await expect(official).toContainText('<p>By the authority vested in me')
  await expect(official.locator('a, p')).toHaveCount(0)
  const insecureRow = page.getByTestId('event-row').filter({ hasText: 'Lebanon' })
  await expect(insecureRow.getByTestId('source-link')).toHaveCount(0)
  await expect(insecureRow.getByTestId('link-withheld')).toBeVisible()
  await expect(page.locator('a[href^="http:"]')).toHaveCount(0)
})

// @engine-agnostic: poller logic under Playwright's injected fake clock; the WebKit projects skip it (playwright.config.ts).
test('polling pauses while the tab is hidden and runs at once when it returns', { tag: '@engine-agnostic' }, async ({ page }) => {
  const api = new MockApi()
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(4)
  await nextPoll(page, api)
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  await setHidden(true)
  const hiddenAt = api.count('/api/v1/status')
  await page.clock.runFor(120_000)
  await page.waitForTimeout(300)
  expect(api.count('/api/v1/status')).toBe(hiddenAt)
  await setHidden(false)
  await expect.poll(() => api.count('/api/v1/status')).toBe(hiddenAt + 1)
})

// Review fixes (2026-10-02): W4, W9.
test('(W4) a status outside the contract ("constructor", "toString") gets no chip, not an empty one', async ({ page }) => {
  const api = new MockApi()
  const [pd, , , notice] = api.events
  api.events = [{ ...pd!, status: 'constructor' as never }, { ...notice!, status: 'toString' as never }]
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(2)
  await expect(page.getByTestId('status-chip')).toHaveCount(0)
})

test('(W9) when the row cap drops older rows the page says so', async ({ page }) => {
  // 501 copies of one recorded document; only the bookkeeping (id, dedup_key) and the sort time differ, so the cap
  // has something to drop. No fact on screen is invented beyond the copy count.
  const api = new MockApi()
  const base = api.events[0]!
  api.events = Array.from({ length: 501 }, (_, i) => ({
    ...base,
    id: `evt_${i.toString(16).padStart(16, '0')}`,
    dedup_key: `${base.dedup_key}:${i}`,
    times: { ...base.times, occurred_at: iso(Date.parse(base.times.occurred_at!) - i * 60_000) },
  }))
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(500)
  await expect(page.getByTestId('trimmed')).toHaveText('This page keeps the newest 500 rows; older ones are no longer shown.')
})

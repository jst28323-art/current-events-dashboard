// Phase 1 exit criterion 4 (docs/ROADMAP.md): a down API shows "Live data unavailable", never an empty feed; a stopped
// poller shows "stale" within 2x its cadence; and the feed comes back when the API recovers.
import { expect, test, type Page } from '@playwright/test'
import { iso, MockApi, nextPoll, openPaused, T0, type Mode } from './mock-api.js'
import { sourceStatus } from './fixture-events.js'

const norm = (s: string | null) => (s ?? '').replace(/[  ]/g, ' ').trim()

async function expectNoEmptyFeed(page: Page) {
  await expect(page.getByTestId('feed-empty')).toHaveCount(0)
  await expect(page.getByTestId('loading')).toHaveCount(0)
}

for (const mode of ['down', 'http503', 'garbage', 'hang'] as const satisfies readonly Mode[]) {
  test(`(b) API ${mode} from the first load: "Live data unavailable", no empty feed, then (d) rows return on recovery`, async ({ page }) => {
    const api = new MockApi()
    api.mode = mode
    await openPaused(page, api)
    if (mode === 'hang') {
      // Before any answer: a loading state, never an empty list.
      await expect(page.getByTestId('loading')).toBeVisible()
      await expect(page.getByTestId('event-row')).toHaveCount(0)
      await page.clock.runFor(10_000) // the page's own 10 s fetch timeout
    }
    const banner = page.getByTestId('unavailable')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Live data unavailable')
    await expect(banner).toContainText('No live data has been received yet.')
    await expect(page.getByTestId('no-data')).toBeVisible()
    await expect(page.getByTestId('event-row')).toHaveCount(0)
    await expectNoEmptyFeed(page)
    await expect(page.getByTestId('last-updated')).toHaveText('Not updated yet')

    // (d) the API recovers: the next poll brings the rows back and the banner goes away.
    api.mode = 'ok'
    await nextPoll(page, api)
    await expect(page.getByTestId('event-row')).toHaveCount(4)
    await expect(banner).toHaveCount(0)
    expect(api.unexpected).toEqual([])
  })
}

test('(b) API goes down after data: banner with the last good time, rows kept; (d) recovers', async ({ page }) => {
  const api = new MockApi()
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(4)
  await expect(page.getByTestId('unavailable')).toHaveCount(0)

  api.mode = 'down'
  await nextPoll(page, api)
  const banner = page.getByTestId('unavailable')
  await expect(banner).toContainText('Live data unavailable')
  expect(norm(await banner.textContent())).toContain('Showing the data last received at 1:01:00 PM CDT.')
  await expect(page.getByTestId('event-row')).toHaveCount(4)
  await expectNoEmptyFeed(page)
  expect(norm(await page.getByTestId('last-updated').textContent())).toBe('Last updated 1:01:00 PM CDT')
  // The health chips are now last-known, labeled with their time (not a live "ok").
  const health = page.locator('ul.health')
  await expect(health).toHaveAttribute('data-last-known', 'true')
  expect(norm(await health.getAttribute('aria-label'))).toBe('Last known health, as of 1:01:00 PM CDT')

  api.mode = 'ok'
  await nextPoll(page, api)
  await expect(banner).toHaveCount(0)
  await expect(health).not.toHaveAttribute('data-last-known', 'true')
  await expect(health).toHaveAttribute('aria-label', 'Source health')
  expect(norm(await page.getByTestId('last-updated').textContent())).toBe('Last updated 1:01:30 PM CDT')
})

test('(c) a stopped poller turns "stale" within 2x its cadence, by the client clock, while the API keeps answering', async ({ page }) => {
  // fr.api: cadence 60 s, freshness SLO 120 s (2x cadence); its last success is T0 and never moves again (the poller
  // stopped), and the frozen status keeps saying stale: false. wh.feeds keeps succeeding.
  const api = new MockApi()
  api.status = { generated_at: iso(T0), sources: [sourceStatus('fr.api', iso(T0)), sourceStatus('wh.feeds', iso(T0))] }
  const chip = page.locator('.health-chip[data-source="fr.api"]')
  await openPaused(page, api, 1000)
  await expect(chip.locator('.state')).toHaveText('ok')

  let t = 1000
  while (t + 15_000 <= 106_000) {
    await nextPoll(page, api)
    t += 15_000
    api.status = { generated_at: iso(T0 + t), sources: [sourceStatus('fr.api', iso(T0)), sourceStatus('wh.feeds', iso(T0 + t))] }
  }
  await page.clock.runFor(119_000 - t) // T0 + 119 s: 1 s inside the SLO
  await expect(chip.locator('.state')).toHaveText('ok')
  await expect(chip).toHaveAttribute('data-state', 'ok')

  await page.clock.runFor(2_000) // T0 + 121 s: past 2x cadence (the chip re-checks every second)
  await expect(chip.locator('.state')).toHaveText('stale')
  await expect(page.locator('.health-chip[data-source="wh.feeds"] .state')).toHaveText('ok')
  await expect(page.getByTestId('event-row')).toHaveCount(4)
})

test('(c) the server\'s stale flag shows at once', async ({ page }) => {
  const api = new MockApi()
  api.status = {
    generated_at: iso(T0),
    sources: [sourceStatus('fr.api', iso(T0 - 30_000)), sourceStatus('wh.feeds', iso(T0 - 30_000), { stale: true, detail: 'no successful poll for 3 minutes' })],
  }
  await openPaused(page, api)
  await expect(page.locator('.health-chip[data-source="wh.feeds"] .state')).toHaveText('stale')
  await expect(page.locator('.health-chip[data-source="fr.api"] .state')).toHaveText('ok')
})

test('a never-polled source says "not polled yet"; an erroring one says "error"', async ({ page }) => {
  const api = new MockApi()
  api.status = {
    generated_at: iso(T0),
    sources: [sourceStatus('fr.api', iso(T0 - 30_000), { health: 'error', detail: 'HTML 404 page instead of JSON', error_streak: 1 }), sourceStatus('wh.feeds', null)],
  }
  await openPaused(page, api)
  await expect(page.locator('.health-chip[data-source="fr.api"] .state')).toHaveText('error')
  await expect(page.locator('.health-chip[data-source="fr.api"]')).toHaveAttribute('title', /HTML 404 page instead of JSON/)
  await expect(page.locator('.health-chip[data-source="wh.feeds"] .state')).toHaveText('not polled yet')
})

// Review fixes (2026-10-02): W1, W6, W7.
test('(W1) the API rejects the saved cursor (HTTP 400 after its store was reset): the page starts over and stays live', async ({ page }) => {
  const api = new MockApi()
  await openPaused(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(4)
  api.cursor = 'e2.0' // the hub's epoch changed: since=c1 now answers 400 "call again without since to start over"
  api.events = api.events.slice(0, 2)
  await nextPoll(page, api)
  await expect(page.getByTestId('event-row')).toHaveCount(2) // the fresh snapshot, as a reload would show
  await expect(page.getByTestId('unavailable')).toHaveCount(0)
  expect(api.requests.filter((r) => r.startsWith('/api/v1/events')).slice(-2)).toEqual(['/api/v1/events?since=c1', '/api/v1/events'])
  await nextPoll(page, api)
  expect(api.requests.filter((r) => r.startsWith('/api/v1/events')).at(-1)).toBe('/api/v1/events?since=e2.0')
  await expect(page.getByTestId('unavailable')).toHaveCount(0)
  expect(norm(await page.getByTestId('last-updated').textContent())).toBe('Last updated 1:01:30 PM CDT')
})

test('(W7) an events answer generated 3 hours ago (an old cached copy) is not presented as current', async ({ page }) => {
  const api = new MockApi()
  api.eventsGeneratedAt = iso(T0 - 3 * 3600_000)
  await openPaused(page, api)
  const banner = page.getByTestId('unavailable')
  await expect(banner).toBeVisible()
  expect(norm(await banner.textContent())).toContain('The API sent an answer generated 3 hours ago.')
  await expect(page.getByTestId('event-row')).toHaveCount(0)
  await expectNoEmptyFeed(page)
  await expect(page.getByTestId('last-updated')).toHaveText('Not updated yet')
})

test('(W6) every event malformed: the page says they were skipped, never that the API "has no events"', async ({ page }) => {
  const api = new MockApi()
  api.events = api.events.map((e) => ({ ...e, times: { ...e.times, first_seen_at: '2026-10-02 18:00:00' } }))
  await openPaused(page, api)
  await expect(page.getByTestId('skipped')).toHaveText('4 items were skipped because the API sent them malformed.')
  await expect(page.getByTestId('feed-empty')).toHaveCount(0)
  expect(await page.locator('main').textContent()).not.toContain('has no events')
  await expect(page.getByTestId('unavailable')).toHaveCount(0)
})

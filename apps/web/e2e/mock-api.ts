// A route-mocked ced-api for the e2e suite. Every request the page makes to the API is answered here; any other
// non-local request is aborted and recorded, so a test can assert the page never touched the network.
import { expect, type Page, type Route } from '@playwright/test'
import type { CedEvent, EventsResponse, StatusResponse } from '@ced/schema'
import { fixtureEvents, sourceStatus } from './fixture-events.js'

export const API_ORIGIN = 'https://ced-api.usgovfeed.workers.dev'
/** The fake "now" every test starts at: one minute after the fixtures were recorded (18:00Z). 1:01 PM CDT. */
export const T0 = Date.parse('2026-10-02T18:01:00Z')
export const iso = (ms: number) => new Date(ms).toISOString()

export type Mode = 'ok' | 'down' | 'http503' | 'garbage' | 'hang'

const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }

export class MockApi {
  mode: Mode = 'ok'
  events: CedEvent[] = fixtureEvents()
  status: StatusResponse = { generated_at: iso(T0), sources: [sourceStatus('fr.api', iso(T0 - 30_000)), sourceStatus('wh.feeds', iso(T0 - 30_000))] }
  /**
   * The cursor this "Worker" issues. Like workers/api/src/hub.ts, a `since` it did not issue gets HTTP 400; change it
   * to model a hub whose store was reset.
   */
  cursor = 'c1'
  /** The events answer's generated_at; null = the status's (set it to model a cache serving an old copy). */
  eventsGeneratedAt: string | null = null
  /** Path + query of every API request, in order. */
  readonly requests: string[] = []
  /** Non-local requests that were blocked (should stay empty). */
  readonly unexpected: string[] = []

  async install(page: Page): Promise<void> {
    // Registered first, so it runs last (Playwright runs the most recently registered matching route first).
    await page.route(
      (u) => u.hostname !== '127.0.0.1',
      (route) => {
        this.unexpected.push(route.request().url())
        return route.abort('blockedbyclient')
      },
    )
    await page.route((u) => u.origin === API_ORIGIN && u.pathname.startsWith('/api/v1/'), (route) => this.handle(route))
  }

  count(path: '/api/v1/status' | '/api/v1/events'): number {
    return this.requests.filter((r) => r.startsWith(path)).length
  }

  private async handle(route: Route): Promise<void> {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': '*' } })
    const u = new URL(req.url())
    this.requests.push(u.pathname + u.search)
    switch (this.mode) {
      case 'down':
        return route.abort('connectionrefused')
      case 'hang':
        return // never answered: the page's own timeout must handle it
      case 'http503':
        return route.fulfill({ status: 503, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) })
      case 'garbage':
        return route.fulfill({ status: 200, headers: CORS, contentType: 'text/html', body: '<!doctype html><title>Just a moment...</title><p>Checking your browser</p>' })
      case 'ok':
        break
    }
    let body: StatusResponse | EventsResponse
    if (u.pathname === '/api/v1/status') body = this.status
    else if (u.pathname === '/api/v1/events') {
      const since = u.searchParams.get('since')
      if (since !== null && since !== this.cursor) {
        // workers/api/src/hub.ts events(): the exact error a reset hub gives a cursor from its previous epoch.
        return route.fulfill({
          status: 400,
          headers: CORS,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'since is not a cursor this API issued; call again without since to start over' }),
        })
      }
      const generated_at = this.eventsGeneratedAt ?? this.status.generated_at
      body = since === null
        ? { generated_at, cursor: this.cursor, events: this.events, has_more: false }
        : { generated_at, cursor: this.cursor, events: [], has_more: false }
    } else return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{"error":"not found"}' })
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) })
  }
}

/**
 * Installs the mock and a paused fake clock at T0 (+`atMs`), then opens the page. With the clock paused, timers fire
 * only when a test advances it (page.clock.runFor), so 15-second polls and 2-minute staleness run in milliseconds.
 */
export async function openPaused(page: Page, api: MockApi, atMs = 0): Promise<void> {
  await api.install(page)
  await page.clock.install({ time: T0 - 1000 })
  await page.clock.pauseAt(T0 + atMs)
  await page.goto('./')
}

/** Advances the fake clock by one poll interval and waits until that poll's status request has been answered. */
export async function nextPoll(page: Page, api: MockApi, ms = 15_000): Promise<void> {
  const before = api.count('/api/v1/status')
  await page.clock.runFor(ms)
  await expect.poll(() => api.count('/api/v1/status')).toBeGreaterThan(before)
}

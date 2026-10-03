// Runs inside workerd. Pins the real wiring (src/index.ts): the default export serves the API from the "hub" HubDO
// with the registered SOURCES, and the cron handler runs the poll loop without throwing.
import { describe, expect, test, vi } from 'vitest'
import { env, exports } from 'cloudflare:workers'
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test'
import { SOURCES } from '@ced/adapters'
import type { EventsResponse, StatusResponse } from '@ced/schema'
import worker from '../src/index.js'
import { USER_AGENT } from '../src/policy.js'

const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`https://ced-api.example${path}`, init))

describe('ced-api wiring', () => {
  test('GET /api/v1/status answers a StatusResponse with one row per registered source', async () => {
    const res = await call('/api/v1/status')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = (await res.json()) as StatusResponse
    expect(Number.isNaN(Date.parse(body.generated_at))).toBe(false)
    expect(body.sources.map((s) => s.source_id)).toEqual(SOURCES.map((s) => s.source_id))
  })
  test('GET /api/v1/events answers an EventsResponse with a cursor', async () => {
    const body = (await (await call('/api/v1/events')).json()) as EventsResponse
    expect(typeof body.cursor).toBe('string')
    expect(Array.isArray(body.events)).toBe(true)
    expect(body.has_more).toBe(false)
  })
  test('unknown paths are 404, not an empty 200', async () => {
    expect((await call('/nope')).status).toBe(404)
  })
  test('CORS: the Pages origin is allowed, any other origin is not', async () => {
    const ok = await call('/api/v1/status', { headers: { Origin: 'https://jst28323-art.github.io' } })
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://jst28323-art.github.io')
    const other = await call('/api/v1/status', { headers: { Origin: 'https://evil.example' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })
  test('the API is read-only', async () => {
    expect((await call('/api/v1/status', { method: 'POST' })).status).toBe(405)
  })
  test('the version-metadata binding (the poll loop\'s codeVersion) resolves to a non-empty id', () => {
    expect(typeof env.CF_VERSION_METADATA.id).toBe('string')
    expect(env.CF_VERSION_METADATA.id.length).toBeGreaterThan(0)
  })
  test('the cron handler polls every registered endpoint once, politely, without throwing (network stubbed)', async () => {
    // The main worker shares this isolate, so stubbing the global fetch keeps the test off the network.
    const seen: Array<{ url: string; ua: string | null; cache: string | undefined }> = []
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      seen.push({ url: String(input), ua: new Headers(init?.headers).get('user-agent'), cache: init?.cache })
      return new Response('upstream down', { status: 503 })
    })
    try {
      const ctx = createExecutionContext()
      await worker.scheduled!(createScheduledController({ cron: '* * * * *' }), env, ctx)
      await waitOnExecutionContext(ctx)
    } finally {
      spy.mockRestore()
    }
    expect(seen).toHaveLength(SOURCES.reduce((n, s) => n + s.endpoints.length, 0))
    for (const s of seen) expect(s).toMatchObject({ ua: USER_AGENT, cache: 'no-store' })
  })
})

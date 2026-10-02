// Runs inside workerd. Pins the scaffold's public contract: status is JSON, unknown paths 404, only the Pages origin
// gets a CORS grant, and the API is read-only.
import { describe, expect, test } from 'vitest'
import { exports } from 'cloudflare:workers'

const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`https://ced-api.example${path}`, init))

describe('ced-api scaffold', () => {
  test('GET /api/v1/status answers JSON with generated_at and a sources array', async () => {
    const res = await call('/api/v1/status')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    const body = (await res.json()) as { generated_at: string; sources: unknown[] }
    expect(Number.isNaN(Date.parse(body.generated_at))).toBe(false)
    expect(Array.isArray(body.sources)).toBe(true)
  })
  test('unknown paths are 404 JSON, not an empty 200', async () => {
    const res = await call('/nope')
    expect(res.status).toBe(404)
  })
  test('CORS: the Pages origin is allowed, any other origin is not', async () => {
    const ok = await call('/api/v1/status', { headers: { Origin: 'https://jst28323-art.github.io' } })
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://jst28323-art.github.io')
    const other = await call('/api/v1/status', { headers: { Origin: 'https://evil.example' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })
  test('the API is read-only', async () => {
    const res = await call('/api/v1/status', { method: 'POST' })
    expect(res.status).toBe(405)
  })
})

// The fixture replay helper must hand adapters exactly what was recorded: a wrong status or a shifted fetchedAt would
// make every golden test check the wrong thing.
import { describe, expect, test } from 'vitest'
import { replay, variant } from './replay.js'
import { SOURCES } from '../src/index.js'

describe('replay', () => {
  test('returns the recorded status, lower-cased headers, body and UTC fetch time', () => {
    const r = replay('fr.api', '2026-10-02', 'documents_2026-99999_NEGATIVE_404_html_body.html')
    expect(r.status).toBe(404)
    expect(r.headers['content-type']).toMatch(/text\/html/)
    expect(r.body).toMatch(/<html/i)
    expect(r.fetchedAt).toMatch(/^2026-10-02T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(r.url).toContain('federalregister.gov/api/v1/documents/2026-99999')
  })
  test('variant patches without touching the original', () => {
    const r = replay('wh.feeds', '2026-10-02', 'news_feed.xml')
    const v = variant(r, { status: 304, body: '' })
    expect(v.status).toBe(304)
    expect(r.status).toBe(200)
    expect(v.headers).toEqual(r.headers)
  })
})

describe('registry', () => {
  test('source ids are unique and every endpoint id is unique within its source', () => {
    const ids = SOURCES.map((s) => s.source_id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SOURCES) {
      const eps = s.endpoints.map((e) => e.id)
      expect(new Set(eps).size).toBe(eps.length)
      expect(s.cadence.business_s).toBeGreaterThanOrEqual(60)
      expect(s.cadence.off_s).toBeGreaterThanOrEqual(60)
      // an endpoint's own cadence (D-046) may not go below the 1-minute cron either
      for (const e of s.endpoints) if (e.cadence) {
        expect(e.cadence.business_s, `${s.source_id}/${e.id}`).toBeGreaterThanOrEqual(60)
        expect(e.cadence.off_s, `${s.source_id}/${e.id}`).toBeGreaterThanOrEqual(60)
      }
    }
  })
})

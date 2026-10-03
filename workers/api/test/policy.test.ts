// The "stale" threshold must follow the cadence in force (Phase 1 exit criterion 4): fr.api is polled every 15 min at
// night and on weekends (cadence.off_s 900) while its SLO is 120 s; judged by the SLO alone it showed "stale" every
// night (orchestrator integration, 2026-10-02).
import { describe, expect, test } from 'vitest'
import { SOURCES, type Endpoint } from '@ced/adapters'
import { cadenceFor, effectiveFreshnessS, describeSources, peakRequestsPerHour } from '../src/policy.js'
import { fakeSource } from './fakes.js'

const { def } = fakeSource('fake.fr', [{ id: 'pi', url: 'https://www.federalregister.gov/x.json', validator: 'body-hash' }])
const fr = { ...def, cadence: { business_s: 60, off_s: 900 }, freshness_slo_s: 120 }
const at = (iso: string) => Date.parse(iso)

describe('effectiveFreshnessS', () => {
  test('business hours: the SLO (2 x 60 s = 120 s)', () => {
    expect(effectiveFreshnessS(fr, at('2026-10-01T15:16:30Z'))).toBe(120) // Thu 11:16 ET
  })
  test('night and weekend: twice the off-hours cadence (1800 s), not the 120 s SLO', () => {
    expect(effectiveFreshnessS(fr, at('2026-10-02T04:00:00Z'))).toBe(1800) // Fri 00:00 ET
    expect(effectiveFreshnessS(fr, at('2026-10-03T16:00:00Z'))).toBe(1800) // Sat noon ET
  })
  test('the morning switch does not flash stale: 1800 s until one off-hours interval has passed', () => {
    expect(effectiveFreshnessS(fr, at('2026-10-05T10:00:30Z'))).toBe(1800) // Mon 06:00:30 ET
    expect(effectiveFreshnessS(fr, at('2026-10-05T10:15:01Z'))).toBe(120) // Mon 06:15:01 ET
  })
  test('describeSources reports the threshold in force, so the page judges stale the same way', () => {
    expect(describeSources([fr], at('2026-10-03T16:00:00Z'))[0]).toMatchObject({ cadence_s: 900, freshness_slo_s: 1800 })
    expect(describeSources([fr], at('2026-10-01T15:16:30Z'))[0]).toMatchObject({ cadence_s: 60, freshness_slo_s: 120 })
  })
})

// D-046: an endpoint may poll on its own cadence (FR documents.json every 15 min beside Public Inspection every minute).
// Staleness, the reported cadence/threshold and the hourly budget all follow each endpoint's own cadence.
describe('per-endpoint cadence (Endpoint.cadence)', () => {
  const PI: Endpoint = { id: 'pi', url: 'https://www.federalregister.gov/a.json', validator: 'body-hash' }
  const DOCS: Endpoint = { ...PI, id: 'docs', url: 'https://www.federalregister.gov/b.json', cadence: { business_s: 900, off_s: 3600 } }
  const two = { ...fakeSource('fake.fr', [PI, DOCS]).def, cadence: { business_s: 60, off_s: 900 }, freshness_slo_s: 120 }

  test('an endpoint without its own cadence keeps the source cadence; one with it uses its own', () => {
    const thu = at('2026-10-01T15:16:30Z') // Thu 11:16 ET
    const sat = at('2026-10-03T16:00:00Z') // Sat noon ET
    expect([cadenceFor(two, thu, PI), cadenceFor(two, thu, DOCS), cadenceFor(two, thu)]).toEqual([60, 900, 60])
    expect([cadenceFor(two, sat, PI), cadenceFor(two, sat, DOCS), cadenceFor(two, sat)]).toEqual([900, 3600, 900])
  })

  test("each endpoint's stale threshold follows its own cadence (D-039 rule), including its own morning switch", () => {
    expect(effectiveFreshnessS(two, at('2026-10-01T15:16:30Z'), PI)).toBe(120)
    expect(effectiveFreshnessS(two, at('2026-10-01T15:16:30Z'), DOCS)).toBe(1800)
    expect(effectiveFreshnessS(two, at('2026-10-03T16:00:00Z'), DOCS)).toBe(7200) // Sat: 2 x 3600
    // Mon 06:00:30 ET: still 2 x 3600 until one of ITS off-hours intervals (1 h) has passed; then 2 x 900.
    expect(effectiveFreshnessS(two, at('2026-10-05T10:00:30Z'), DOCS)).toBe(7200)
    expect(effectiveFreshnessS(two, at('2026-10-05T10:59:59Z'), DOCS)).toBe(7200)
    expect(effectiveFreshnessS(two, at('2026-10-05T11:00:01Z'), DOCS)).toBe(1800)
    expect(effectiveFreshnessS(two, at('2026-10-05T10:15:01Z'), PI)).toBe(120)
  })

  test('describeSources: per-endpoint values; the source row reports the fastest cadence and the largest threshold', () => {
    const [info] = describeSources([two], at('2026-10-01T15:16:30Z'))
    expect(info).toMatchObject({
      cadence_s: 60,
      freshness_slo_s: 1800,
      endpoints: [
        { id: 'pi', cadence_s: 60, freshness_slo_s: 120 },
        { id: 'docs', cadence_s: 900, freshness_slo_s: 1800 },
      ],
    })
    const [night] = describeSources([two], at('2026-10-03T16:00:00Z'))
    expect(night).toMatchObject({ cadence_s: 900, freshness_slo_s: 7200 })
  })

  test('peakRequestsPerHour: at most one request per cron minute, and ceil(3600 / (cadence - cron slack)) per endpoint', () => {
    const one = (cadence: { business_s: number; off_s: number }) =>
      peakRequestsPerHour({ ...two, endpoints: [{ ...PI, cadence }] })
    expect(one({ business_s: 60, off_s: 60 })).toBe(60)
    expect(one({ business_s: 30, off_s: 30 })).toBe(60) // the 1-minute cron is the floor
    expect(one({ business_s: 900, off_s: 3600 })).toBe(5) // due after 880 s: ceil(3600 / 880)
    expect(one({ business_s: 3600, off_s: 3600 })).toBe(2)
    expect(one({ business_s: 900, off_s: 60 })).toBe(60) // the faster of the two counts
    expect(peakRequestsPerHour(two)).toBe(65)
    expect(peakRequestsPerHour(two, DOCS)).toBe(5)
  })

  test('every registered source fits its hourly budget, so no endpoint is ever starved by another', () => {
    expect(SOURCES.length).toBeGreaterThan(0)
    for (const def of SOURCES) {
      expect(peakRequestsPerHour(def), `${def.source_id}: ${def.rate_budget_per_h}/h budget`).toBeLessThanOrEqual(def.rate_budget_per_h)
    }
  })
})

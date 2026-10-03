// The "stale" threshold must follow the cadence in force (Phase 1 exit criterion 4): fr.api is polled every 15 min at
// night and on weekends (cadence.off_s 900) while its SLO is 120 s; judged by the SLO alone it showed "stale" every
// night (orchestrator integration, 2026-10-02).
import { describe, expect, test } from 'vitest'
import { effectiveFreshnessS, describeSources } from '../src/policy.js'
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

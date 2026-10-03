// The probe's target list: every key-free Tier 1-2 source is probed or listed as skipped with a reason, nothing
// key-gated or robots-disallowed is fetched, and no cron run can exceed the request budget.
import { describe, expect, test } from 'vitest'
import { GROUPS, REQUEST_CAP_PER_RUN, SKIPPED, TARGETS, targetsForRun } from '../src/targets.js'

// The Tier 1 and Tier 2 source_ids of docs/SOURCES.md as of 2026-10-02 (copied by hand: workerd tests cannot read
// the repo). A source added to those tiers must be added here AND probed or skipped, or this test fails.
const TIER1 = ['fr.api', 'wh.feeds', 'wh.live', 'senate.lis.votes', 'house.clerk.votes', 'house.clerk.floor', 'house.floorcast', 'senate.schedule', 'senate.pressgallery', 'members']
const TIER2 = [
  'house.domewatch', 'house.docs.floor', 'house.committee', 'house.repcloakroom', 'senate.dems', 'senate.captions', 'house.media',
  'congress.api', 'bsky.official', 'state.feeds', 'war.feeds', 'fed.feeds', 'scotus.html', 'govinfo.rss', 'factbase', 'youtube.api',
]

describe('targets', () => {
  test('every Tier 1-2 source is either probed or skipped with a reason', () => {
    const covered = new Set([...TARGETS.map((t) => t.source_id), ...SKIPPED.map((s) => s.source_id)])
    for (const id of [...TIER1, ...TIER2]) expect(covered, id).toContain(id)
    for (const s of SKIPPED) expect(s.reason.length, s.source_id).toBeGreaterThan(20)
  })

  test('the key-gated sources are skipped, never probed', () => {
    const skipped = SKIPPED.map((s) => s.source_id)
    for (const id of ['congress.api', 'youtube.api', 'house.domewatch']) {
      expect(skipped).toContain(id)
      expect(TARGETS.some((t) => t.source_id === id)).toBe(false)
    }
    expect(SKIPPED.find((s) => s.source_id === 'war.feeds')?.reason).toMatch(/DVIDS/)
    expect(SKIPPED.find((s) => s.source_id === 'house.media')?.reason).toMatch(/no stable URL/)
  })

  test('only Tier 1-2 sources, with the right tier, over https, without keys or disallowed paths', () => {
    const ids = new Set<string>()
    for (const t of TARGETS) {
      expect(t.tier === 1 ? TIER1 : TIER2, t.source_id).toContain(t.source_id)
      expect(t.url.startsWith('https://'), t.url).toBe(true)
      expect(t.url, 'no API keys').not.toMatch(/api_key|apikey|[?&]key=|DEMO_KEY/i)
      expect(t.url, 'D-016: never the SCOTUS /rss/').not.toMatch(/supremecourt\.gov\/rss\//)
      if (t.url.includes('federalregister.gov')) expect(t.url, 'the FR website blocks scripts: API only').toMatch(/federalregister\.gov\/api\//)
      const key = `${t.source_id}/${t.endpoint_id}`
      expect(ids.has(key), key).toBe(false)
      ids.add(key)
    }
  })

  // Review R2 (2026-10-02): "expected format" alone let a 200 error page count as reachable.
  test('every XML target names its root element(s) and every HTML target a page marker', () => {
    for (const t of TARGETS) {
      const id = `${t.source_id}/${t.endpoint_id}`
      if (t.expect === 'xml') expect(t.root?.length ?? 0, id).toBeGreaterThan(0)
      if (t.expect === 'html') expect(t.marker?.length ?? 0, id).toBeGreaterThanOrEqual(8)
      if (t.marker !== undefined) expect(t.marker.length, id).toBeGreaterThanOrEqual(2)
      for (const r of t.root ?? []) expect(r, id).toMatch(/^[A-Za-z_][\w.:-]*$/)
    }
  })

  test('fr.api is always cache-busted (shared caches ignore no-store)', () => {
    const fr = TARGETS.filter((t) => t.source_id === 'fr.api')
    expect(fr.length).toBeGreaterThan(0)
    for (const t of fr) expect(t.cacheBust).toBe(true)
  })

  test('the groups partition the targets, and no run can exceed the request cap', () => {
    const seen: string[] = []
    for (let run = 1; run <= GROUPS; run++) {
      const g = targetsForRun(run)
      // Worst case: every target returns both validators -> 3 requests each.
      expect(g.length * 3, `group ${run}`).toBeLessThanOrEqual(REQUEST_CAP_PER_RUN)
      seen.push(...g.map((t) => t.url))
    }
    expect(seen.sort()).toEqual(TARGETS.map((t) => t.url).sort())
    expect(targetsForRun(GROUPS + 1)).toEqual(targetsForRun(1))
  })
})

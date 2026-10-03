// Pins scripts/ledger_report.mjs (Phase 1 exit criterion 3): day boundaries in Eastern time, the counts, the latency
// median and the pass rule, and the history paging (a missed page would undercount a day).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allEvents, dayEt, dayReport, median } from '../../scripts/ledger_report.mjs'

const pi = (num, filed, seen) => ({ dedup_key: `fr:${num}#public_inspection`, event_type: 'fr.public_inspection', times: { occurred_at: filed, first_seen_at: seen }, sources: [{ source_id: 'fr.api' }] })
const wh = (id, seen) => ({ dedup_key: `wh_post:${id}#published`, event_type: 'wh.release', times: { occurred_at: seen, first_seen_at: seen }, sources: [{ source_id: 'wh.feeds' }] })

test('Eastern-time days: 03:30Z on Oct 6 is still Monday Oct 5', () => {
  assert.equal(dayEt('2026-10-06T03:30:00Z'), '2026-10-05')
  assert.equal(dayEt('2026-10-06T04:30:00Z'), '2026-10-06')
  assert.equal(dayEt(null), null)
})

test('median of odd and even lists', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(median([]), null)
})

test('a passing day: 5 PI filings at the 08:45 ET slot seen within 90 s, and one White House item', () => {
  const slot = '2026-10-05T12:45:00Z' // 08:45 EDT
  const events = [30, 40, 50, 60, 80].map((s, i) => pi(`2026-2100${i}`, slot, new Date(Date.parse(slot) + s * 1000).toISOString()))
  events.push(wh(1, '2026-10-05T15:00:00Z'))
  events.push(pi('2026-20999', '2026-10-02T12:45:00Z', '2026-10-05T13:00:00Z')) // another day's filing: not counted on Oct 5
  const r = dayReport(events, '2026-10-05')
  assert.deepEqual([r.pi, r.wh, r.n, r.median_s, r.pass], [5, 1, 5, 50, true])
})

test('failing days: too slow, too few, or no White House item', () => {
  const slot = '2026-10-05T12:45:00Z'
  const slow = [100, 120, 130, 140, 150].map((s, i) => pi(`2026-2100${i}`, slot, new Date(Date.parse(slot) + s * 1000).toISOString()))
  assert.equal(dayReport([...slow, wh(1, slot)], '2026-10-05').pass, false) // median 130 s > 90 s
  const few = slow.slice(0, 4).map((e) => ({ ...e, times: { ...e.times, first_seen_at: slot } }))
  assert.equal(dayReport([...few, wh(1, slot)], '2026-10-05').pass, false) // 4 < 5
  const fast = slow.map((e) => ({ ...e, times: { ...e.times, first_seen_at: slot } }))
  assert.equal(dayReport(fast, '2026-10-05').pass, false) // no White House item
})

test('allEvents pages through the whole history from <epoch>.0 and keeps the latest copy of each event', async () => {
  const pages = {
    'limit=1': { cursor: 'ab12.9', events: [], has_more: false },
    'ab12.0': { cursor: 'ab12.5', events: [wh(1, 'x'), wh(2, 'x')], has_more: true },
    'ab12.5': { cursor: 'ab12.9', events: [{ ...wh(1, 'x'), title: 'revised' }, wh(3, 'x')], has_more: false },
  }
  const asked = []
  const get = async (url) => {
    asked.push(url)
    const k = Object.keys(pages).find((p) => url.includes(p.includes('.') ? `since=${p}` : p))
    if (!k) throw new Error(`unexpected ${url}`)
    return pages[k]
  }
  const evs = await allEvents('https://api.example', get)
  assert.equal(evs.length, 3)
  assert.equal(evs.find((e) => e.dedup_key === 'wh_post:1#published').title, 'revised')
  assert.equal(asked.length, 3)
})

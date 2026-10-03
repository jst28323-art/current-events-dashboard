// wh.feeds adapter (ROADMAP P1.4): golden output for the recorded umbrella feed, field-by-field checks of items read by
// hand from the fixture bytes, the "no new items" replay, and every fail-closed path on in-memory variants of the
// recorded response (fixtures are never edited; TESTING.md rule 1).
//
// Goldens: test/golden/wh.feeds/*.json. To regenerate after a deliberate change, run with UPDATE_GOLDEN=1 and review
// the diff line by line; the hand-written expectations below must still pass on their own.
import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateEvent, type CedEvent } from '@ced/schema'
import { classify, parseWhFeeds, whFeeds, WH_FEEDS_PARSER } from '../src/sources/wh_feeds.js'
import { parseItemHeads, parseRfc822, scanRssItems, xmlTextProblem } from '../src/lib/rss.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'
import { fixturePath, replay, variant } from './replay.js'

const DAY = '2026-10-02'
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'wh.feeds')
const news = (): FetchedResponse => replay('wh.feeds', DAY, 'news_feed.xml')
const pres = (): FetchedResponse => replay('wh.feeds', DAY, 'presidential-actions_feed.xml')
const NEWS_FETCHED = '2026-10-02T18:00:23.941Z' // news_feed.xml.meta.json fetched_at
const PRES_FETCHED = '2026-10-02T18:00:20.520Z'

function golden(name: string, value: unknown): void {
  const p = join(GOLDEN_DIR, name)
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(p, JSON.stringify(value, null, 2) + '\n')
    return
  }
  expect(existsSync(p), `missing golden ${p}: run with UPDATE_GOLDEN=1, then review it`).toBe(true)
  expect(JSON.parse(JSON.stringify(value))).toEqual(JSON.parse(readFileSync(p, 'utf8')))
}

/** Parses and asserts the invariants every successful output must keep. */
function parseOk(res: FetchedResponse): AdapterOutput {
  const out = parseWhFeeds('news', res)
  expect(out.health.status, out.health.detail).toBe('ok')
  expect(out.events.length).toBe(out.health.items_seen)
  for (const e of out.events) expect(validateEvent(e), `${e.object_key}`).toEqual({ valid: true, errors: [] })
  return out
}

/** A payload that must be refused whole: no events, and the given health status. */
function expectRefused(res: FetchedResponse, status: string, detail: RegExp): AdapterOutput {
  const out = parseWhFeeds('news', res)
  expect(out.events).toEqual([])
  expect(out.health.status).toBe(status)
  expect(out.health.detail).toMatch(detail)
  return out
}

function edit(body: string, from: string | RegExp, to: string): string {
  const out = body.replace(from, to)
  if (out === body) throw new Error(`variant edit did not apply: ${String(from)}`)
  return out
}

// The recorded document split into its channel head and raw items, to build in-memory variants from real bytes.
function split(body: string): { head: string; items: string[] } {
  const first = body.indexOf('<item>')
  const items: string[] = []
  let p = first
  while (p >= 0) {
    const end = body.indexOf('</item>', p) + '</item>'.length
    items.push(body.slice(p, end))
    p = body.indexOf('<item>', end)
  }
  return { head: body.slice(0, first), items }
}
const assemble = (head: string, items: string[]): string => `${head}${items.join('\n')}\n</channel>\n</rss>\n`
/** A one-item feed built from the first recorded item (Releases, ?p=52051) with `patch` applied to it. */
function oneItem(patch: (item: string) => string): FetchedResponse {
  const base = news()
  const { head, items } = split(base.body)
  return variant(base, { body: assemble(head, [patch(items[0] as string)]) })
}
const byPost = (out: AdapterOutput, id: number): CedEvent => {
  const e = out.events.find((x) => x.object_key === `wh_post:${id}`)
  if (!e) throw new Error(`no event for ?p=${id}`)
  return e
}

describe('source definition', () => {
  test('one umbrella endpoint with the ETag validator and the polite-polling numbers from the SOURCES row', () => {
    expect(whFeeds.source_id).toBe('wh.feeds')
    expect(whFeeds.endpoints).toEqual([{ id: 'news', url: 'https://www.whitehouse.gov/news/feed/', validator: 'etag' }])
    expect(whFeeds.cadence).toEqual({ business_s: 60, off_s: 60 })
    expect(whFeeds.freshness_slo_s).toBe(120)
    expect(whFeeds.rate_budget_per_h).toBe(60)
    expect(whFeeds.affiliation).toBe('executive-messaging')
    expect(whFeeds.features).toEqual(['F9', 'F11'])
    expect(whFeeds.parse).toBe(parseWhFeeds)
  })
})

describe('news_feed.xml (umbrella feed, 30 items)', () => {
  test('golden: the full normalized output', () => {
    const out = parseOk(news())
    expect(out.health).toEqual({ source_id: 'wh.feeds', endpoint: 'news', status: 'ok', detail: '30 items', items_seen: 30 })
    golden('news_feed.json', out)
  })

  test('every event carries the fixed fields (branch, body, status, source, provenance, revision)', () => {
    const out = parseOk(news())
    for (const e of out.events) {
      expect(e.branch).toBe('executive')
      expect(e.body).toBe('white_house')
      expect(e.status).toBe('published')
      expect(e.revision).toBe(1)
      expect(e.provenance).toEqual({ parser: WH_FEEDS_PARSER, confidence: 'high' })
      expect(e.provenance.parser).toBe('wh_feeds@0.1.0')
      expect(e.dedup_key).toBe(`${e.object_key}#published`)
      expect(e.times.first_seen_at).toBe(NEWS_FETCHED)
      expect(e.sources).toHaveLength(1)
      expect(e.sources[0]).toMatchObject({ source_id: 'wh.feeds', retrieved_at: NEWS_FETCHED, affiliation: 'executive-messaging', license: 'us-gov-public-domain' })
      expect(e.sources[0]?.url).toMatch(/^https:\/\/www\.whitehouse\.gov\//)
      expect(e.title.startsWith('White House posted under ')).toBe(true)
      expect(e.title.endsWith(`“${e.official_text}”`)).toBe(true)
    }
    // One event per item, in feed order, ids unique.
    expect(new Set(out.events.map((e) => e.id)).size).toBe(30)
    expect(out.events[0]?.object_key).toBe('wh_post:52051')
    expect(out.events[29]?.object_key).toBe('wh_post:50681')
  })

  // Expected values typed from the raw fixture bytes (title, link, pubDate, categories, guid), not from the parser.
  type Row = { p: number; type: string; tier: string; feature: string; official: string; under: string; link: string; pub: string; occurred: string | null }
  const rows: Row[] = [
    { p: 52051, type: 'wh.release', tier: 'P3', feature: 'F11', official: 'New Report: DSA Policies Would Cost Americans Trillions', under: 'Releases', link: 'https://www.whitehouse.gov/releases/2026/10/new-report-dsa-policies-would-cost-americans-trillions/', pub: '2026-10-01T22:22:29Z', occurred: '2026-10-01T22:22:29Z' },
    { p: 52037, type: 'wh.release', tier: 'P3', feature: 'F11', official: 'Democrats UNANIMOUSLY Vote AGAINST the Stop Insider Trading Act', under: 'Releases', link: 'https://www.whitehouse.gov/releases/2026/09/democrats-unanimously-vote-against-the-stop-insider-trading-act/', pub: '2026-10-01T03:00:00Z', occurred: '2026-10-01T03:00:00Z' },
    { p: 51745, type: 'wh.briefing_statement', tier: 'P2', feature: 'F11', official: 'Congressional Bill S. 2398 Signed into Law', under: 'Briefings & Statements', link: 'https://www.whitehouse.gov/briefings-statements/2026/09/congressional-bill-s-2398-signed-into-law/', pub: '2026-09-30T16:17:26Z', occurred: '2026-09-30T16:17:26Z' },
    { p: 51634, type: 'wh.briefing_statement', tier: 'P2', feature: 'F11', official: 'Adobe, Amazon, Intel, Starlink, Google, and Zoom partner with First Lady Melania Trump\u2019s Fostering the Future Together', under: 'Briefings & Statements', link: 'https://www.whitehouse.gov/briefings-statements/2026/09/adobe-amazon-intel-starlink-google-and-zoom-partner-with-first-lady-melania-trumps-fostering-the-future-together/', pub: '2026-09-30T12:28:07Z', occurred: '2026-09-30T12:28:07Z' },
    { p: 51607, type: 'wh.fact_sheet', tier: 'P3', feature: 'F11', official: 'Fact Sheet: President Donald J. Trump Eliminates Disease-Carrying Pests and Restores Enjoyment of The Great Outdoors', under: 'Fact Sheets', link: 'https://www.whitehouse.gov/fact-sheets/2026/09/fact-sheet-president-donald-j-trump-eliminates-disease-carrying-pests-and-restores-enjoyment-of-the-great-outdoors/', pub: '2026-09-29T21:24:24Z', occurred: '2026-09-29T21:24:24Z' },
    { p: 51617, type: 'presidential_action.executive_order', tier: 'P0', feature: 'F9', official: 'Eliminating Disease-Carrying Pests And Restoring Enjoyment Of The Great Outdoors', under: 'Executive Orders', link: 'https://www.whitehouse.gov/presidential-actions/2026/09/eliminating-disease-carrying-pests-and-restoring-enjoyment-of-the-great-outdoors/', pub: '2026-09-29T21:23:48Z', occurred: null },
    { p: 51615, type: 'presidential_action.executive_order', tier: 'P0', feature: 'F9', official: 'Inaugurating The Era Of Super Intelligence', under: 'Executive Orders', link: 'https://www.whitehouse.gov/presidential-actions/2026/09/inaugurating-the-era-of-super-intelligence/', pub: '2026-09-29T21:17:25Z', occurred: null },
    { p: 51499, type: 'presidential_action.nominations_sent', tier: 'P1', feature: 'F9', official: 'Nominations Sent to the Senate', under: 'Nominations & Appointments', link: 'https://www.whitehouse.gov/presidential-actions/2026/09/nominations-sent-to-the-senate-e1fc/', pub: '2026-09-28T19:59:28Z', occurred: null },
    { p: 51258, type: 'wh.briefing_statement', tier: 'P2', feature: 'F11', official: 'Presidential Message on National Hunting and Fishing Day', under: 'Briefings & Statements', link: 'https://www.whitehouse.gov/briefings-statements/2026/09/presidential-message-on-national-hunting-and-fishing-day/', pub: '2026-09-26T16:26:20Z', occurred: '2026-09-26T16:26:20Z' },
    { p: 51134, type: 'wh.briefing_statement', tier: 'P2', feature: 'F11', official: 'Congressional Bills H.R. 3657, H.R. 7250, S. 550, S. 603, S. 759 and S. 790 Signed into Law', under: 'Briefings & Statements', link: 'https://www.whitehouse.gov/briefings-statements/2026/09/congressional-bills-h-r-3657-h-r-7250-s-550-s-603-s-759-and-s-790-signed-into-law/', pub: '2026-09-25T19:48:25Z', occurred: '2026-09-25T19:48:25Z' },
    // The raw title is "Gold Star Mother&#8217;s And Family&#8217;s Day, 2026": the entity must decode to U+2019.
    { p: 51135, type: 'presidential_action.proclamation', tier: 'P0', feature: 'F9', official: 'Gold Star Mother\u2019s And Family\u2019s Day, 2026', under: 'Proclamations', link: 'https://www.whitehouse.gov/presidential-actions/2026/09/gold-star-mothers-and-familys-day-2026/', pub: '2026-09-25T19:47:32Z', occurred: null },
    { p: 51007, type: 'wh.briefing_statement', tier: 'P2', feature: 'F11', official: 'First Lady Melania Trump Releases Details on the State Dinner with His Excellency Xi Jinping, President of The People\u2019s Republic of China, and Madame Peng Liyuan', under: 'Briefings & Statements', link: 'https://www.whitehouse.gov/briefings-statements/2026/09/first-lady-melania-trump-releases-details-on-the-state-dinner-with-his-excellency-xi-jinping-president-of-the-peoples-republic-of-china-and-madame-peng-liyuan/', pub: '2026-09-24T12:21:19Z', occurred: '2026-09-24T12:21:19Z' },
    { p: 50681, type: 'wh.release', tier: 'P3', feature: 'F11', official: 'President Trump Inks Historic Arctic Security Agreement', under: 'Releases', link: 'https://www.whitehouse.gov/releases/2026/09/president-trump-inks-historic-arctic-security-agreement/', pub: '2026-09-22T21:03:03Z', occurred: '2026-09-22T21:03:03Z' },
  ]
  test.each(rows)('?p=$p ($type) field by field', (r) => {
    const e = byPost(parseOk(news()), r.p)
    expect(e.object_key).toBe(`wh_post:${r.p}`)
    expect(e.dedup_key).toBe(`wh_post:${r.p}#published`)
    expect(e.event_type).toBe(r.type)
    expect(e.importance?.tier).toBe(r.tier)
    expect(e.features).toEqual([r.feature])
    expect(e.official_text).toBe(r.official)
    expect(e.title).toBe(`White House posted under ${r.under}: “${r.official}”`)
    expect(e.sources[0]?.url).toBe(r.link)
    expect(e.alias_keys).toEqual([`wh:${new URL(r.link).pathname.slice(1, -1)}`])
    expect(e.times).toEqual({ occurred_at: r.occurred, source_published_at: r.pub, first_seen_at: NEWS_FETCHED })
  })

  test('multi-category items: the presidential subcategory decides; both categories are listed as reasons', () => {
    const e = byPost(parseOk(news()), 51617)
    expect(e.importance).toEqual({ tier: 'P0', reasons: ['category: Presidential Actions', 'category: Executive Orders', 'D-012 alert class (presidential action)'] })
  })

  test('the category tally matches the fixture (Releases 12, Briefings & Statements 9, Fact Sheets 4, EO 3, Nominations 1, Proclamations 1)', () => {
    const tally: Record<string, number> = {}
    for (const e of parseOk(news()).events) tally[e.event_type] = (tally[e.event_type] ?? 0) + 1
    expect(tally).toEqual({
      'wh.release': 12, 'wh.briefing_statement': 9, 'wh.fact_sheet': 4,
      'presidential_action.executive_order': 3, 'presidential_action.nominations_sent': 1, 'presidential_action.proclamation': 1,
    })
  })
})

describe('presidential-actions_feed.xml (test-only input; not a registered endpoint)', () => {
  test('golden: the full normalized output', () => {
    const out = parseOk(pres())
    expect(out.health.items_seen).toBe(30)
    golden('presidential-actions_feed.json', out)
  })

  test('every item is a presidential action: F9, occurred_at null, posting time kept as source_published_at', () => {
    for (const e of parseOk(pres()).events) {
      expect(e.event_type.startsWith('presidential_action.')).toBe(true)
      expect(e.features).toEqual(['F9'])
      expect(e.times.occurred_at).toBeNull()
      expect(e.times.source_published_at).toMatch(/^2026-0[89]-\d\dT\d\d:\d\d:\d\dZ$/)
      expect(e.times.first_seen_at).toBe(PRES_FETCHED)
    }
  })

  test('a memorandum is P0 (D-012); its title says the White House filed it under Presidential Memoranda', () => {
    const e = byPost(parseOk(pres()), 50367)
    expect(e.event_type).toBe('presidential_action.memorandum')
    expect(e.importance?.tier).toBe('P0')
    expect(e.title).toBe('White House posted under Presidential Memoranda: “Restoring Reciprocity in Government Procurement”')
    expect(e.times.source_published_at).toBe('2026-09-16T20:27:39Z')
  })

  test('"Withdrawals Sent to the Senate" (Nominations & Appointments) is not typed as nominations_sent', () => {
    const e = byPost(parseOk(pres()), 50428)
    expect(e.event_type).toBe('presidential_action.other')
    expect(e.importance?.tier).toBe('P1')
    expect(e.title).toBe('White House posted under Nominations & Appointments: “Withdrawals Sent to the Senate”')
  })

  test('an all-caps headline is kept verbatim (no re-casing)', () => {
    expect(byPost(parseOk(pres()), 50434).official_text).toBe('RESTORING AMERICAN SALTWATER ANGLING AND RECREATION')
  })

  test('the White House filing is attributed, not asserted: the Space Academy EO is filed under Proclamations', () => {
    // Its text reads "it is hereby ordered" (an executive order; DCPD lists EO 14423), but the feed files it under
    // Proclamations. The title must not claim "a proclamation" as our own fact, and (review WH-4) neither may the
    // event type: the post does not open with the proclamation heading, so the type is presidential_action.other.
    // The alert is kept: both kinds are D-012 classes.
    const e = byPost(parseOk(pres()), 49230)
    expect(e.event_type).toBe('presidential_action.other')
    expect(e.importance?.tier).toBe('P0')
    expect(e.importance?.reasons).toContain('filed under Proclamations, but the post does not open with the proclamation heading ("By the President of the United States of America A Proclamation")')
    expect(e.title).toBe('White House posted under Proclamations: “Establishing the United States Space Academy”')
    expect(e.title).not.toMatch(/posted a proclamation/)
  })

  test('WH-4: every other post filed under Proclamations opens with the heading and keeps the proclamation type', () => {
    // ?p=50532 is a real proclamation whose operative words are "it is hereby ordered" (like an EO): the check reads
    // the heading, never the operative formula, so it stays a proclamation.
    const out = parseOk(pres())
    expect(byPost(out, 50532).event_type).toBe('presidential_action.proclamation')
    const tally: Record<string, number> = {}
    for (const e of out.events) tally[e.event_type] = (tally[e.event_type] ?? 0) + 1
    expect(tally).toEqual({
      'presidential_action.executive_order': 13, 'presidential_action.proclamation': 12, 'presidential_action.other': 2,
      'presidential_action.nominations_sent': 2, 'presidential_action.memorandum': 1,
    })
    expect(out.events.filter((e) => e.event_type === 'presidential_action.other').map((e) => e.object_key)).toEqual(['wh_post:50428', 'wh_post:49230'])
  })

  test('five posts with the same pubDate (Sep 8 22:50:00Z) stay five distinct events', () => {
    const same = parseOk(pres()).events.filter((e) => e.times.source_published_at === '2026-09-08T22:50:00Z')
    expect(same).toHaveLength(5)
    expect(new Set(same.map((e) => e.id)).size).toBe(5)
  })

  test('the two feeds agree on the posts they share (same ids from either feed)', () => {
    const a = parseOk(news())
    const b = parseOk(pres())
    for (const p of [51617, 51615, 51585, 51499, 51135]) expect(byPost(a, p).id).toBe(byPost(b, p).id)
  })
})

describe('idempotence: the site-wide validator changes with no new item (docs/TRAPS.md)', () => {
  test('the same response replayed twice yields identical output', () => {
    expect(parseWhFeeds('news', news())).toEqual(parseWhFeeds('news', news()))
  })

  test('same items under a new ETag, Last-Modified and fetch time: same ids and keys; only our own clocks move', () => {
    const a = parseOk(news())
    const later = '2026-10-02T18:05:00.000Z'
    const b = parseOk(variant(news(), { fetchedAt: later, headers: { etag: 'W/"changed"', 'last-modified': 'Fri, 02 Oct 2026 18:04:00 GMT' } }))
    expect(b.events.map((e) => e.id)).toEqual(a.events.map((e) => e.id))
    const strip = (e: CedEvent) => ({ ...e, times: { ...e.times, first_seen_at: 'x' }, sources: e.sources.map((s) => ({ ...s, retrieved_at: 'x' })) })
    expect(b.events.map(strip)).toEqual(a.events.map(strip))
    expect(b.events[0]?.times.first_seen_at).toBe(later)
  })

  test('a re-titled and re-slugged post with the same GUID keeps its id, object_key and dedup_key', () => {
    const before = byPost(parseOk(news()), 52051)
    const after = oneItem((it) => edit(edit(it, '<title>New Report: DSA Policies Would Cost Americans Trillions</title>', '<title>New Report: DSA Policies Would Cost Americans $49 Trillion</title>'),
      '<link>https://www.whitehouse.gov/releases/2026/10/new-report-dsa-policies-would-cost-americans-trillions/</link>',
      '<link>https://www.whitehouse.gov/releases/2026/10/new-report-dsa-policies-would-cost-49-trillion/</link>'))
    const e = parseOk(after).events[0] as CedEvent
    expect([e.id, e.object_key, e.dedup_key]).toEqual([before.id, before.object_key, before.dedup_key])
    expect(e.official_text).toBe('New Report: DSA Policies Would Cost Americans $49 Trillion')
    expect(e.alias_keys).toEqual(['wh:releases/2026/10/new-report-dsa-policies-would-cost-49-trillion'])
  })

  test('a post re-filed under another category keeps its dedup_key (the event type is not part of it)', () => {
    const before = byPost(parseOk(news()), 52051)
    const e = parseOk(oneItem((it) => edit(it, '<category><![CDATA[Releases]]></category>', '<category><![CDATA[Fact Sheets]]></category>'))).events[0] as CedEvent
    expect(e.event_type).toBe('wh.fact_sheet')
    expect(e.dedup_key).toBe(before.dedup_key)
    expect(e.id).toBe(before.id)
  })
})

describe('fail closed: HTTP and envelope', () => {
  test('304 → not_modified, no events', () => {
    expectRefused(variant(news(), { status: 304, body: '' }), 'not_modified', /304/)
  })
  test('non-200 statuses → error, no events', () => {
    for (const status of [500, 403, 404, 206, 301]) expectRefused(variant(news(), { status }), 'error', new RegExp(`HTTP ${status}`))
  })
  test('an unknown endpoint id → error', () => {
    expect(parseWhFeeds('presidential_actions', news()).health.status).toBe('error')
    expect(parseWhFeeds('presidential_actions', news()).events).toEqual([])
  })
  test('HTTP 200 with an HTML page (the recorded whitehouse.gov/live/ page) → drift', () => {
    const html = readFileSync(fixturePath('wh.live', DAY, 'live_page_not_live.html'), 'utf8')
    expectRefused(variant(news(), { body: html, headers: { 'content-type': 'text/html; charset=UTF-8' } }), 'drift', /HTML/)
    // Even when the header claims RSS, the body is checked.
    expectRefused(variant(news(), { body: html }), 'drift', /HTML/)
  })
  test('other non-RSS bodies → drift', () => {
    expectRefused(variant(news(), { body: '' }), 'drift', /empty/)
    expectRefused(variant(news(), { body: '<?xml version="1.0"?><xml>Error sanitizing file. Please try again.</xml>' }), 'drift', /no <rss><channel>/)
    expectRefused(variant(news(), { body: '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>x</title></entry></feed>' }), 'drift', /no <rss><channel>/)
    expectRefused(variant(news(), { headers: { 'content-type': 'application/json' } }), 'drift', /content-type/)
  })
  test('a DOCTYPE / ENTITY declaration → drift (not in the recorded shape; entity expansion is never attempted)', () => {
    const body = edit(news().body, '<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa">]>')
    expectRefused(variant(news(), { body }), 'drift', /DOCTYPE/)
  })
  test('truncated in the middle of an item → drift, nothing published', () => {
    const body = news().body
    expectRefused(variant(news(), { body: body.slice(0, Math.floor(body.length / 2)) }), 'drift', /truncated/)
  })
  test('truncated cleanly between items (after item 5) → drift: the five complete items are not published either', () => {
    const body = news().body
    let cut = 0
    for (let i = 0; i < 5; i++) cut = body.indexOf('</item>', cut) + '</item>'.length
    const out = expectRefused(variant(news(), { body: body.slice(0, cut) }), 'drift', /does not end with <\/channel><\/rss>/)
    expect(out.health.items_seen).toBe(0)
  })
  test('WH-6: a channel with zero items → drift, not "empty": the umbrella feed always lists its newest posts', () => {
    const { head } = split(news().body)
    const out = expectRefused(variant(news(), { body: assemble(head, []) }), 'drift', /no items/)
    expect(out.health.items_seen).toBe(0)
  })
  test('WH-6: <item> renamed (<ITEM>, <entry>) → drift, never reported as a quiet feed', () => {
    for (const name of ['ITEM', 'entry']) {
      const body = news().body.replaceAll('<item>', `<${name}>`).replaceAll('</item>', `</${name}>`)
      expectRefused(variant(news(), { body }), 'drift', /no items/)
    }
  })
})

describe('fail closed: one bad item refuses the whole payload', () => {
  const full = (patch: (body: string) => string) => variant(news(), { body: patch(news().body) })
  test('an item without a guid → drift', () => {
    const out = expectRefused(full((b) => edit(b, '<guid isPermaLink="false">https://www.whitehouse.gov/?p=52044</guid>', '')), 'drift', /item 2: no <guid>/)
    expect(out.health.items_seen).toBe(30)
  })
  test('a guid that is not a whitehouse.gov ?p= post id → drift', () => {
    expectRefused(full((b) => edit(b, 'https://www.whitehouse.gov/?p=52044</guid>', 'https://www.whitehouse.gov/releases/2026/10/x/</guid>')), 'drift', /item 2: guid .* is not a whitehouse.gov \?p= post id/)
  })
  test('a duplicate guid within one payload → drift', () => {
    expectRefused(full((b) => edit(b, '?p=52044</guid>', '?p=52051</guid>')), 'drift', /item 2: duplicate guid \?p=52051/)
  })
  test('an http (not https) link → drift', () => {
    expectRefused(full((b) => edit(b, '<link>https://www.whitehouse.gov/releases/2026/10/nearly', '<link>http://www.whitehouse.gov/releases/2026/10/nearly')), 'drift', /item 2: <link> is not https/)
  })
  test('a link off whitehouse.gov → drift', () => {
    expectRefused(full((b) => edit(b, '<link>https://www.whitehouse.gov/releases/2026/10/nearly', '<link>https://example.com/releases/2026/10/nearly')), 'drift', /item 2: <link> is not on whitehouse.gov/)
  })
  test('a missing link or title → drift', () => {
    expectRefused(full((b) => edit(b, /<link>https:\/\/www\.whitehouse\.gov\/releases\/2026\/10\/nearly[^<]*<\/link>/, '')), 'drift', /item 2: no <link>/)
    expectRefused(full((b) => edit(b, '<title>Nearly Two Years In, President Trump Is Still Stacking Historic Wins at Record Speed</title>', '')), 'drift', /item 2: no <title>/)
    expectRefused(full((b) => edit(b, '<title>Nearly Two Years In, President Trump Is Still Stacking Historic Wins at Record Speed</title>', '<title>  </title>')), 'drift', /item 2: no <title>/)
  })
  test('a repeated <title> or a title holding markup → drift', () => {
    expectRefused(oneItem((it) => edit(it, '</title>', '</title><title>Second</title>')), 'drift', /item 1: <title> appears 2 times/)
    expectRefused(oneItem((it) => edit(it, '<title>New Report', '<title><b>New</b> Report')), 'drift', /item 1: <title> holds markup/)
  })
  test('an unclosed tag inside an item head → drift (the XML parser alone would accept it)', () => {
    expectRefused(oneItem((it) => edit(it, '</pubDate>', '')), 'drift', /does not parse/)
  })
})

describe('titles: entities, CDATA, whitespace', () => {
  const titled = (raw: string): CedEvent => parseOk(oneItem((it) => edit(it, '<title>New Report: DSA Policies Would Cost Americans Trillions</title>', `<title>${raw}</title>`))).events[0] as CedEvent
  test('&amp; and numeric entities decode once', () => {
    expect(titled('Ways &amp; Means &#8217;26 &#x2014; Fish &amp;amp; Chips').official_text).toBe('Ways & Means \u201926 \u2014 Fish &amp; Chips')
  })
  test('CDATA is literal: a raw & stays, an entity inside CDATA is not decoded', () => {
    expect(titled('<![CDATA[Fish & Chips &amp; Peas]]>').official_text).toBe('Fish & Chips &amp; Peas')
  })
  test('text mixed with CDATA keeps its spaces; XML whitespace collapses; NBSP is kept', () => {
    expect(titled('A <![CDATA[mixed]]> title').official_text).toBe('A mixed title')
    expect(titled('  Two\n\t lines  ').official_text).toBe('Two lines')
    // WordPress writes NBSP as a character reference (its feed filters run ent2ncr); &nbsp; itself is not XML (WH-7).
    expect(titled('Before&#160;after').official_text).toBe('Before\u00a0after')
  })
  test('WH-7: a reference XML does not allow \u2192 drift, never kept as literal text or silently dropped', () => {
    const refused = (raw: string, detail: RegExp) =>
      expectRefused(oneItem((it) => edit(it, '<title>New Report: DSA Policies Would Cost Americans Trillions</title>', `<title>${raw}</title>`)), 'drift', detail)
    refused('A&bogus;B', /"&bogus;", which XML does not define/)
    refused('Before&nbsp;after', /"&nbsp;", which XML does not define/)
    refused('nul&#0;', /"&#0;", a reference to a character XML does not allow/)
    refused('sur&#xD800;', /"&#xD800;", a reference to a character XML does not allow/)
    refused('big&#x110000;', /"&#x110000;", a reference to a character XML does not allow/)
    refused('ctl&#x1F;', /"&#x1F;", a reference to a character XML does not allow/)
    refused('x&#x;y', /a malformed reference "&#x;y/)
    refused('raw\u0001control', /the character U\+0001, which XML does not allow/)
    refused('<![CDATA[raw\u0008control]]>', /the character U\+0008, which XML does not allow/)
  })
  test('WH-7: xmlTextProblem unit cases (XML 1.0 §2.2 Char and §4.1 references; runs at index 0, runs back to back)', () => {
    expect(xmlTextProblem('<![CDATA[a & b]]>')).toBeNull()
    expect(xmlTextProblem('<![CDATA[a & b')).toBe('a CDATA section, comment or processing instruction that never closes')
    expect(xmlTextProblem('<a><![CDATA[x]]><![CDATA[y]]>&amp;<![CDATA[&]]>&#8217;<?pi & ?><!-- & -->&bad;</a>')).toBe('"&bad;", which XML does not define (no DTD is allowed)')
    expect(xmlTextProblem('<a>&amp;&lt;&gt;&quot;&apos;&#9;&#xA;&#13;&#x20;&#xD7FF;&#xE000;&#xFFFD;&#x10000;&#x10FFFF;</a>')).toBeNull()
    for (const ref of ['&#8;', '&#31;', '&#xDFFF;', '&#xFFFE;', '&#xFFFF;', '&#1114112;']) {
      expect(xmlTextProblem(`<a>${ref}</a>`), ref).toBe(`"${ref}", a reference to a character XML does not allow`)
    }
    expect(xmlTextProblem('<a>Fish & Chips</a>')).toBe('a malformed reference "&"')
    expect(xmlTextProblem('<a>x' + String.fromCharCode(0xfffe) + 'y</a>')).toBe('the character U+FFFE, which XML does not allow')
    expect(xmlTextProblem('<a>x\uD800y</a>')).toBe('the character U+D800, which XML does not allow')
    expect(xmlTextProblem('<a>\u{1F600} \t\r\n</a>')).toBeNull()
  })
  test('WH-7: legal references still decode, and & inside CDATA or a comment is not a reference', () => {
    expect(titled('&lt;b&gt; &quot;q&quot; &apos;a&apos; &#65;&#x42; &#x1F600;').official_text).toBe('<b> "q" \'a\' AB \u{1F600}')
    expect(titled('<![CDATA[A&bogus;B]]>').official_text).toBe('A&bogus;B')
    expect(titled('Kept<!-- &bogus; --> title').official_text).toBe('Kept title')
  })
  test('a title that looks like a number stays a string', () => {
    expect(titled('2026').official_text).toBe('2026')
  })
  test('a CDATA title containing "</item>" does not end the item early', () => {
    expect(titled('<![CDATA[About </item> tags]]>').official_text).toBe('About </item> tags')
  })
  test('content:encoded that contains its own closing tag text inside CDATA is skipped whole', () => {
    const out = parseOk(oneItem((it) => edit(it, '<content:encoded><![CDATA[', '<content:encoded><![CDATA[<p>literal </content:encoded> and </item> text</p>')))
    expect(out.events[0]?.official_text).toBe('New Report: DSA Policies Would Cost Americans Trillions')
  })
})

describe('times', () => {
  const dated = (raw: string): CedEvent =>
    parseOk(oneItem((it) => edit(it, '<pubDate>Thu, 01 Oct 2026 22:22:29 +0000</pubDate>', raw))).events[0] as CedEvent
  const asEo = (it: string) => edit(it, '<category><![CDATA[Releases]]></category>', '<category><![CDATA[Presidential Actions]]></category><category><![CDATA[Executive Orders]]></category>')
  test('a missing pubDate → both source times null (never guessed); the health detail says so', () => {
    const out = parseOk(oneItem((it) => edit(it, '<pubDate>Thu, 01 Oct 2026 22:22:29 +0000</pubDate>', '')))
    expect(out.events[0]?.times).toEqual({ occurred_at: null, source_published_at: null, first_seen_at: NEWS_FETCHED })
    expect(out.health.detail).toBe('1 items; 1 without a usable pubDate')
  })
  test('offsets convert to UTC; a weekday that disagrees, a named US zone or an impossible date → null', () => {
    expect(dated('<pubDate>Thu, 01 Oct 2026 18:22:29 -0400</pubDate>').times.occurred_at).toBe('2026-10-01T22:22:29Z')
    expect(dated('<pubDate>Fri, 01 Oct 2026 22:22:29 +0000</pubDate>').times.source_published_at).toBeNull()
    expect(dated('<pubDate>Thu, 01 Oct 2026 18:22:29 EDT</pubDate>').times.source_published_at).toBeNull()
    expect(dated('<pubDate>31 Sep 2026 12:00:00 +0000</pubDate>').times.source_published_at).toBeNull()
  })
  test('a pubDate after our own fetch is not a posting time: occurred_at null, the claim kept', () => {
    const e = dated('<pubDate>Sat, 03 Oct 2026 12:00:00 +0000</pubDate>')
    expect(e.times.occurred_at).toBeNull()
    expect(e.times.source_published_at).toBe('2026-10-03T12:00:00Z')
  })
  test('a presidential action never gets the posting time as occurred_at', () => {
    const e = parseOk(oneItem(asEo)).events[0] as CedEvent
    expect(e.event_type).toBe('presidential_action.executive_order')
    expect(e.times).toEqual({ occurred_at: null, source_published_at: '2026-10-01T22:22:29Z', first_seen_at: NEWS_FETCHED })
  })
  test('parseRfc822 unit cases', () => {
    expect(parseRfc822('Tue, 29 Sep 2026 21:23:48 +0000')).toBe('2026-09-29T21:23:48Z')
    expect(parseRfc822('29 Sep 2026 21:23 GMT')).toBe('2026-09-29T21:23:00Z')
    expect(parseRfc822('Wed, 30 Sep 2026 23:30:00 -0400')).toBe('2026-10-01T03:30:00Z')
    expect(parseRfc822('Sun, 01 Mar 2026 01:00:00 +0530')).toBe('2026-02-28T19:30:00Z')
    expect(parseRfc822('Tue, 29 Feb 2026 10:00:00 +0000')).toBeNull() // 2026 is not a leap year
    expect(parseRfc822('Tue, 29 Sep 26 21:23:48 +0000')).toBeNull() // two-digit year
    expect(parseRfc822('Tue, 29 Sep 2026 24:00:00 +0000')).toBeNull()
    expect(parseRfc822('2026-09-29T21:23:48Z')).toBeNull()
    expect(parseRfc822(undefined)).toBeNull()
  })
})

// The opening of a recorded <description> for each kind (presidential-actions fixture: ?p=51617 EO, ?p=51135
// proclamation, ?p=50367 memorandum), as the scanner hands it to classify().
const EO_OPENING = '<description><![CDATA[<p>By the authority vested in me as President by the Constitution and the laws of the United States of America, it is hereby ordered:</p>]]></description>'
const PROC_OPENING = '<description><![CDATA[<p>BY THE PRESIDENT OF THE UNITED STATES OF AMERICA A PROCLAMATION America is free, strong, secure, and prosperous</p>]]></description>'
const MEMO_OPENING = '<description><![CDATA[<p>MEMORANDUM FOR THE SECRETARY OF WAR THE UNITED STATES TRADE REPRESENTATIVE</p>]]></description>'

describe('classification rules', () => {
  test('one per WordPress category, Presidential Actions first', () => {
    const t = (cats: string[], title = 'X', opening: string | undefined = undefined) => {
      const c = classify(cats, title, opening)
      return [c.event_type, c.tier, c.presidential]
    }
    expect(t(['Presidential Actions', 'Executive Orders'], 'X', EO_OPENING)).toEqual(['presidential_action.executive_order', 'P0', true])
    expect(t(['Presidential Actions', 'Proclamations'], 'X', PROC_OPENING)).toEqual(['presidential_action.proclamation', 'P0', true])
    expect(t(['Presidential Actions', 'Presidential Memoranda'], 'X', MEMO_OPENING)).toEqual(['presidential_action.memorandum', 'P0', true])
    expect(t(['Presidential Actions', 'Nominations & Appointments'], 'Nominations Sent to the Senate')).toEqual(['presidential_action.nominations_sent', 'P1', true])
    expect(t(['Presidential Actions', 'Nominations & Appointments'], 'Nomination Sent to the Senate')).toEqual(['presidential_action.nominations_sent', 'P1', true])
    expect(t(['Presidential Actions', 'Nominations & Appointments'], 'Withdrawal Sent to the Senate')).toEqual(['presidential_action.other', 'P1', true])
    expect(t(['Executive Orders'], 'X', EO_OPENING)).toEqual(['presidential_action.executive_order', 'P0', true])
    expect(t(['Briefings & Statements'])).toEqual(['wh.briefing_statement', 'P2', false])
    expect(t(['Fact Sheets'])).toEqual(['wh.fact_sheet', 'P3', false])
    expect(t(['Releases'])).toEqual(['wh.release', 'P3', false])
    expect(t(['Articles'])).toEqual(['wh.article', 'P3', false])
    expect(t(['Remarks'])).toEqual(['wh.remarks', 'P2', false])
    expect(t(['RELEASES'])).toEqual(['wh.release', 'P3', false])
    expect(t(['Research'])).toEqual(['wh.other', 'P3', false])
    expect(t([])).toEqual(['wh.other', 'P3', false])
  })
  test('a presidential action also filed under a messaging section stays a presidential action', () => {
    expect(classify(['Briefings & Statements', 'Presidential Actions', 'Executive Orders'], 'X', EO_OPENING).event_type).toBe('presidential_action.executive_order')
  })
  test('disagreeing subcategories → presidential_action.other, still P0 when one is a D-012 class', () => {
    const c = classify(['Presidential Actions', 'Executive Orders', 'Proclamations'], 'X', EO_OPENING)
    expect([c.event_type, c.tier]).toEqual(['presidential_action.other', 'P0'])
    expect(c.filedUnder).toEqual(['Executive Orders', 'Proclamations'])
    const d = classify(['Fact Sheets', 'Briefings & Statements'], 'X', undefined)
    expect([d.event_type, d.tier]).toEqual(['wh.other', 'P2'])
  })
  test('WH-1: a Presidential Actions post with no known subcategory is refused (a renamed subcategory could hide an alert class)', () => {
    const refuse = (cats: string[]) => classify(cats, 'X', EO_OPENING).drift
    expect(refuse(['Presidential Actions', 'Executive Order'])).toBe('a Presidential Actions post under a category we do not know ("Executive Order"): it could be a renamed alert class, so nothing is published until the mapping is checked')
    expect(refuse(['Presidential Actions', 'Presidential Memorandums'])).toMatch(/category we do not know \("Presidential Memorandums"\)/)
    expect(refuse(['Presidential Actions', 'Notices'])).toMatch(/category we do not know \("Notices"\)/)
    // A known non-alert subcategory beside an unknown one: the unknown one could be the alert class.
    expect(refuse(['Presidential Actions', 'Nominations & Appointments', 'Executive Order'])).toMatch(/\("Executive Order"\)/)
    expect(refuse(['Presidential Actions'])).toBe('a Presidential Actions post with no subcategory: its alert tier cannot be decided')
    // The recorded shapes are not refused.
    for (const cats of [['Presidential Actions', 'Executive Orders'], ['Executive Orders'], ['Briefings & Statements', 'Presidential Actions', 'Executive Orders'], ['Research'], [], ['Releases']]) {
      expect(refuse(cats), cats.join('|')).toBeNull()
    }
  })
  test('WH-1: in the feed, one such post refuses the whole payload as drift (reviewer repro: "Executive Order", singular)', () => {
    const body = edit(news().body, '<category><![CDATA[Releases]]></category>', '<category><![CDATA[Presidential Actions]]></category><category><![CDATA[Executive Order]]></category>')
    const out = expectRefused(variant(news(), { body }), 'drift', /^item 1 \(\?p=52051\): a Presidential Actions post under a category we do not know \("Executive Order"\)/)
    expect(out.health.items_seen).toBe(30)
    expectRefused(variant(news(), { body: edit(news().body, '<category><![CDATA[Releases]]></category>', '<category><![CDATA[Presidential Actions]]></category>') }), 'drift', /item 1 \(\?p=52051\): a Presidential Actions post with no subcategory/)
  })
  test('WH-3: a withdrawal is never typed nominations_sent', () => {
    const t = (title: string) => classify(['Presidential Actions', 'Nominations & Appointments'], title, undefined).event_type
    expect(t('Withdrawal of Nomination Sent to the Senate')).toBe('presidential_action.other')
    expect(t('Nominations and Withdrawals Sent to the Senate')).toBe('presidential_action.other')
    expect(t('Nominations & Withdrawals Sent to the Senate')).toBe('presidential_action.other')
    expect(t('Nomination Withdrawn and Sent to the Senate')).toBe('presidential_action.other')
    expect(t('Nominations Sent to the Senate')).toBe('presidential_action.nominations_sent')
  })
  test('WH-4: the type is withheld (presidential_action.other, tier kept) when the post\'s heading contradicts the White House filing', () => {
    const c = (sub: string, opening: string | undefined) => { const r = classify(['Presidential Actions', sub], 'X', opening); return [r.event_type, r.tier] }
    // Filed under Proclamations without the heading (the Space Academy EO), or with no description at all: not asserted.
    expect(c('Proclamations', EO_OPENING)).toEqual(['presidential_action.other', 'P0'])
    expect(c('Proclamations', undefined)).toEqual(['presidential_action.other', 'P0'])
    // Filed as an EO or a memorandum, but the post opens with the proclamation heading: not asserted either.
    expect(c('Executive Orders', PROC_OPENING)).toEqual(['presidential_action.other', 'P0'])
    expect(c('Presidential Memoranda', PROC_OPENING)).toEqual(['presidential_action.other', 'P0'])
    expect(classify(['Presidential Actions', 'Executive Orders'], 'X', PROC_OPENING).reasons).toContain('filed under Executive Orders, but the post opens with the proclamation heading ("By the President of the United States of America A Proclamation")')
    // The heading as the recorded posts print it: upper case (?p=51135), title case (?p=49811), a <br> between lines.
    expect(c('Proclamations', '<description><![CDATA[<p>By the President of the United States of America A Proclamation This Labor Day, we recognize</p>]]></description>')).toEqual(['presidential_action.proclamation', 'P0'])
    expect(c('Proclamations', '<description><![CDATA[<p>BY THE PRESIDENT OF THE UNITED STATES OF AMERICA<br />A PROCLAMATION</p>]]></description>')).toEqual(['presidential_action.proclamation', 'P0'])
    // Markup written as entities (a description without CDATA) is read the same way; the heading must end at a word end.
    expect(c('Proclamations', '<description>&lt;p&gt;BY THE PRESIDENT OF THE UNITED STATES OF AMERICA&#160;A PROCLAMATION&lt;/p&gt;</description>')).toEqual(['presidential_action.proclamation', 'P0'])
    expect(c('Proclamations', '<description><![CDATA[<p>By the President of the United States of America A Proclamations list</p>]]></description>')).toEqual(['presidential_action.other', 'P0'])
    // "a proclamation" deep in an EO's text is not the heading.
    expect(c('Executive Orders', '<description><![CDATA[<p>By the authority vested in me as President, it is hereby ordered: Section 1. In Proclamation 10973, I issued a proclamation</p>]]></description>')).toEqual(['presidential_action.executive_order', 'P0'])
  })
  test('WH-4: in the feed, an EO post that opens with the proclamation heading is typed presidential_action.other, P0', () => {
    const out = parseOk(oneItem((it) => edit(edit(it, '<category><![CDATA[Releases]]></category>', '<category><![CDATA[Presidential Actions]]></category><category><![CDATA[Executive Orders]]></category>'),
      '<description><![CDATA[', '<description><![CDATA[<p>BY THE PRESIDENT OF THE UNITED STATES OF AMERICA A PROCLAMATION</p>')))
    expect([out.events[0]?.event_type, out.events[0]?.importance?.tier]).toEqual(['presidential_action.other', 'P0'])
    expect(out.events[0]?.title).toBe('White House posted under Executive Orders: “New Report: DSA Policies Would Cost Americans Trillions”')
  })
  test('in the feed: titles name every deciding category; an unknown or missing category is flagged in health', () => {
    const multi = parseOk(oneItem((it) => edit(it, '<category><![CDATA[Releases]]></category>', '<category><![CDATA[Executive Orders]]></category><category><![CDATA[Proclamations]]></category>'))).events[0]
    expect(multi?.title).toBe('White House posted under Executive Orders and Proclamations: “New Report: DSA Policies Would Cost Americans Trillions”')
    const unknown = parseOk(oneItem((it) => edit(it, '<category><![CDATA[Releases]]></category>', '<category><![CDATA[Research]]></category>')))
    expect(unknown.events[0]?.event_type).toBe('wh.other')
    expect(unknown.events[0]?.title).toBe('White House posted under Research: “New Report: DSA Policies Would Cost Americans Trillions”')
    expect(unknown.health.detail).toBe('1 items; 1 with no known category')
    const none = parseOk(oneItem((it) => edit(it, '<category><![CDATA[Releases]]></category>', '')))
    expect(none.events[0]?.title).toBe('White House posted: “New Report: DSA Policies Would Cost Americans Trillions”')
  })
})

describe('head-only parsing (docs/ARCHITECTURE.md: 10 ms CPU per Worker invocation)', () => {
  test('item bodies are cut out before XML parsing: the parsed slice is ~3% of the document', () => {
    const body = news().body
    const scan = scanRssItems(body)
    if (scan.kind !== 'ok') throw new Error(scan.detail)
    expect(scan.items).toHaveLength(30)
    const slice = scan.items.join('')
    for (const it of scan.items) {
      expect(it).not.toMatch(/<description|<content:encoded/)
      expect(it).toMatch(/^<item>[\s\S]*<guid[\s\S]*<\/item>$/)
    }
    expect(slice.length).toBeLessThan(body.length * 0.05)
  })
  // WH-2: the scanner must agree with a conforming XML parser about where a skipped element ends. Markup inside a
  // comment or a processing instruction is not markup (XML 1.0 §2.5, §2.6), so neither may end the element early nor
  // open a CDATA section. The recorded descriptions are CDATA-wrapped; these bodies are not, which is still legal XML.
  test('WH-2: a comment holding "<![CDATA[" inside an unwrapped description does not swallow the next item', () => {
    const body = edit(news().body, /<description><!\[CDATA\[[\s\S]*?\]\]><\/description>/, '<description>&lt;p&gt;x&lt;/p&gt;<!-- <![CDATA[ --></description>')
    const out = parseOk(variant(news(), { body }))
    expect(out.events).toHaveLength(30)
    expect(byPost(out, 52044).official_text).toBe('Nearly Two Years In, President Trump Is Still Stacking Historic Wins at Record Speed')
  })
  test('WH-2: a guid hidden inside a comment in the description is not read as the item\'s guid', () => {
    const noGuid = edit(news().body, '<guid isPermaLink="false">https://www.whitehouse.gov/?p=52051</guid>', '')
    const body = edit(noGuid, /<description><!\[CDATA\[[\s\S]*?\]\]><\/description>/, '<description><!-- </description><guid isPermaLink="false">https://www.whitehouse.gov/?p=99999</guid><description> --></description>')
    expectRefused(variant(news(), { body }), 'drift', /item 1: no <guid>/)
  })
  test('WH-2: a processing instruction holding "</description>" does not end the description', () => {
    const body = edit(news().body, /<description><!\[CDATA\[[\s\S]*?\]\]><\/description>/, '<description><?wp </description><guid>https://www.whitehouse.gov/?p=99999</guid> ?>text</description>')
    const out = parseOk(variant(news(), { body }))
    expect(out.events).toHaveLength(30)
    expect(out.events[0]?.object_key).toBe('wh_post:52051')
  })
  test('WH-2: a comment or processing instruction that never closes inside a description → drift', () => {
    const { head, items } = split(news().body)
    const cut = (s: string) => variant(news(), { body: `${head}${(items[0] as string).replace('<description>', `<description>${s}`)}` })
    expectRefused(cut('<!-- never closed'), 'drift', /<description> in item 1 never closes/)
    expectRefused(cut('<?wp never closed'), 'drift', /<description> in item 1 never closes/)
  })
  test('WH-2: a processing instruction holding "<item>" between items is not an item', () => {
    const { head, items } = split(news().body)
    const out = parseOk(variant(news(), { body: assemble(head, [items[0] as string, '<?wp <item><title>Ghost</title></item> ?>', items[1] as string]) }))
    expect(out.events.map((e) => e.object_key)).toEqual(['wh_post:52051', 'wh_post:52044'])
  })
  test('parseItemHeads parses repeated categories as a list and keeps guid text without its attribute', () => {
    const scan = scanRssItems(news().body)
    if (scan.kind !== 'ok') throw new Error(scan.detail)
    const parsed = parseItemHeads(scan.items)
    if (!parsed.ok) throw new Error(parsed.detail)
    expect(parsed.items[7]?.category).toEqual(['Presidential Actions', 'Executive Orders'])
    expect(parsed.items[7]?.guid).toBe('https://www.whitehouse.gov/?p=51617')
  })
})

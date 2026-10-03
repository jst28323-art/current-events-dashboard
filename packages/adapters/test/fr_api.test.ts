// fr.api adapter: golden output for the recorded fixtures, hand-checked spot values, and every fail-closed path.
// Goldens live in test/golden/fr.api/. They are compared byte-for-byte; regenerate them only on purpose with
// UPDATE_GOLDEN=1 and re-check the diff by hand against the fixture (a golden is only as good as that check).
import { describe, expect, test } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateEvent } from '@ced/schema'
import type { CedEvent } from '@ced/schema'
import { DOCUMENTS_FIELDS, DOCUMENTS_NEWEST_URL, PI_CURRENT_URL, frApi, parseFr } from '../src/sources/fr_api.js'
import { frBranch } from '../src/lib/fr_branch.js'
import { frDateInWords, frInstantToUtc } from '../src/lib/fr_time.js'
import { REPO_ROOT, replay, variant } from './replay.js'
import type { AdapterOutput, FetchedResponse } from '../src/types.js'

const DAY = '2026-10-02'
const pi = (): FetchedResponse => replay('fr.api', DAY, 'pi_current.json')
const docs = (): FetchedResponse => replay('fr.api', DAY, 'documents_newest.json')
const negative = (): FetchedResponse => replay('fr.api', DAY, 'documents_2026-99999_NEGATIVE_404_html_body.html')
const GOLDEN_DIR = join(REPO_ROOT, 'packages', 'adapters', 'test', 'golden', 'fr.api')

function checkGolden(name: string, out: AdapterOutput): void {
  const text = JSON.stringify(out, null, 2) + '\n'
  const path = join(GOLDEN_DIR, name)
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(path, text)
  }
  expect(text).toBe(readFileSync(path, 'utf8'))
}

function expectAllValid(events: CedEvent[]): void {
  for (const ev of events) {
    const v = validateEvent(ev)
    expect(v.errors, `${ev.object_key}: ${v.errors.join('; ')}`).toEqual([])
  }
}

function byNumber(events: CedEvent[], n: string): CedEvent {
  const ev = events.find((e) => e.object_key === `fr:${n}`)
  if (!ev) throw new Error(`no event for ${n}`)
  return ev
}

/** The fixture's JSON with an edit applied, as a FetchedResponse (in memory; fixtures/ is never written). */
function edited(base: FetchedResponse, edit: (j: any) => void): FetchedResponse {
  const j = JSON.parse(base.body)
  edit(j)
  return variant(base, { body: JSON.stringify(j) })
}

function expectNothing(out: AdapterOutput, status: string): void {
  expect(out.events).toEqual([])
  expect(out.health.status).toBe(status)
}

describe('frApi source definition', () => {
  test('polls the two recorded URLs with a body hash and a cache-buster', () => {
    expect(frApi.source_id).toBe('fr.api')
    expect(frApi.endpoints.map((e) => e.id)).toEqual(['pi_current', 'documents_newest'])
    // The fixtures were recorded from exactly the production URLs (minus the cache-buster the poller adds).
    expect(pi().url).toBe(PI_CURRENT_URL)
    expect(docs().url).toBe(DOCUMENTS_NEWEST_URL)
    expect(frApi.endpoints.map((e) => e.url)).toEqual([PI_CURRENT_URL, DOCUMENTS_NEWEST_URL])
    for (const e of frApi.endpoints) {
      expect(e.validator).toBe('body-hash')
      expect(e.cacheBust).toBe(true)
    }
    expect(frApi.cadence.business_s).toBe(60)
    expect(frApi.freshness_slo_s).toBe(120)
  })
})

describe('pi_current fixture (107 documents, 2026-10-02 18:00Z)', () => {
  const out = parseFr('pi_current', pi())

  test('matches the golden output and every event is schema-valid', () => {
    checkGolden('pi_current.json', out)
    expect(out.health).toEqual({ source_id: 'fr.api', endpoint: 'pi_current', status: 'ok', detail: '107 documents on public inspection', items_seen: 107 })
    expect(out.events).toHaveLength(107)
    expect(new Set(out.events.map((e) => e.id)).size).toBe(107)
    expectAllValid(out.events)
  })

  test('re-parsing the same fixture gives byte-identical events (stable ids)', () => {
    expect(JSON.stringify(parseFr('pi_current', pi()))).toBe(JSON.stringify(out))
  })

  test('the presidential determination 2026-20439 is a P0 White House filing at 11:15 EDT', () => {
    const ev = byNumber(out.events, '2026-20439')
    expect(ev.event_type).toBe('fr.public_inspection')
    expect(ev.dedup_key).toBe('fr:2026-20439#public_inspection')
    expect(ev.status).toBe('published')
    expect(ev.body).toBe('white_house')
    expect(ev.branch).toBe('executive')
    expect(ev.features).toEqual(['F10', 'F9'])
    expect(ev.importance).toEqual({ tier: 'P0', reasons: ['presidential_document_filed_for_public_inspection', 'D-012'] })
    expect(ev.times).toEqual({ occurred_at: '2026-10-02T15:15:00Z', first_seen_at: '2026-10-02T18:00:28.428Z' })
    expect(ev.official_text).toBe('Lebanon; Presidential Determination on Revocation of Prior Presidential Determinations (Presidential Determination No. 2026-25 of September 30, 2026)')
    expect(ev.title).toBe(`Presidential document filed for public inspection: ${ev.official_text}`)
    expect(ev.sources).toEqual([{
      source_id: 'fr.api',
      url: 'https://www.federalregister.gov/public-inspection/2026-20439/lebanon-presidential-determination-on-revocation-of-prior-presidential-determinations-presidential',
      retrieved_at: '2026-10-02T18:00:28.428Z', license: 'us-gov-public-domain', affiliation: 'official-nonpartisan',
    }])
    expect(ev.media).toEqual([{ kind: 'pdf', url: 'https://public-inspection.federalregister.gov/2026-20439.pdf' }])
    expect(ev.result).toEqual({ publication_date: '2026-10-05' })
    expect(ev.thread_key).toBeUndefined() // PI carries no EO number field
    expect(ev.provenance).toEqual({ parser: 'fr_api@0.1.0', confidence: 'high' })
  })

  test('the withdrawn-request filing 2026-20295 has no time and shows the editorial note', () => {
    const ev = byNumber(out.events, '2026-20295')
    expect(ev.times.occurred_at).toBeNull()
    expect(ev.official_text).toBe('Meetings; Sunshine Act') // source: "Meetings; Sunshine Act  " (trimmed only)
    expect(ev.title).toBe('Securities and Exchange Commission notice filed for public inspection (with an editorial note): Meetings; Sunshine Act')
    expect(ev.body).toBe('agency:securities-and-exchange-commission')
    expect(ev.branch).toBe('independent') // SEC is on the 44 U.S.C. 3502(5) list
    expect(ev.importance).toEqual({ tier: 'P4', reasons: ['notice'] })
    expect(ev.result).toEqual({
      editorial_note: "An agency letter requesting withdrawal of this document was received after placement on public inspection. The document will remain on public inspection through close of business on October 5, 2026.  You may request a copy of the agency's withdrawal letter, and/or the withdrawn document, by sending an email to fr.inspection@nara.gov.",
    }) // publication_date is null in the source, so it is absent here
  })

  test('each filing slot converts from its -04:00 offset to UTC', () => {
    // 08:45 regular (10-02), 14:00 special (10-01), 16:15 special (10-01), all EDT (UTC-4).
    expect(byNumber(out.events, '2026-20283').times.occurred_at).toBe('2026-10-02T12:45:00Z')
    expect(byNumber(out.events, '2026-20330').times.occurred_at).toBe('2026-10-02T12:45:00Z')
    const special = JSON.parse(pi().body).results.filter((r: any) => r.filing_type === 'special' && r.filed_at)
    const byFiled = new Map<string, string>()
    for (const r of special) byFiled.set(r.filed_at, byNumber(out.events, r.document_number).times.occurred_at!)
    expect(Object.fromEntries(byFiled)).toEqual({
      '2026-10-01T14:00:00.000-04:00': '2026-10-01T18:00:00Z',
      '2026-10-01T16:15:00.000-04:00': '2026-10-01T20:15:00Z',
      '2026-10-02T11:15:00.000-04:00': '2026-10-02T15:15:00Z',
    })
  })

  test('one of each document type gets its tier; a rule at PI has unknown significance', () => {
    const types = new Map<string, CedEvent>()
    for (const r of JSON.parse(pi().body).results) if (!types.has(r.type)) types.set(r.type, byNumber(out.events, r.document_number))
    expect([...types.keys()].sort()).toEqual(['Notice', 'Presidential Document', 'Proposed Rule', 'Rule'])
    expect(types.get('Rule')!.importance).toEqual({ tier: 'P3', reasons: ['rule', 'significance_unknown'] })
    expect(types.get('Proposed Rule')!.importance).toEqual({ tier: 'P2', reasons: ['proposed_rule'] })
    expect(types.get('Notice')!.importance).toEqual({ tier: 'P4', reasons: ['notice'] })
    expect(out.events.every((e) => e.event_type === 'fr.public_inspection' && e.status === 'published')).toBe(true)
    expect(out.events.filter((e) => e.importance?.tier === 'P0').map((e) => e.object_key)).toEqual(['fr:2026-20439'])
  })

  test('an EO number named inside a title never becomes an eo: key', () => {
    // 2026-20317 is a GSA rule titled "... Implementation of Executive Order 14275 ..."; it is not that EO.
    const ev = byNumber(out.events, '2026-20317')
    expect(ev.official_text).toContain('Executive Order 14275')
    expect(ev.thread_key).toBeUndefined()
    expect(ev.alias_keys).toBeUndefined()
    expect(out.events.some((e) => e.thread_key !== undefined)).toBe(false)
  })
})

describe('documents_newest fixture (20 newest published, recorded 2026-10-02 21:27Z with fields[])', () => {
  const out = parseFr('documents_newest', docs())

  test('matches the golden output and every event is schema-valid', () => {
    checkGolden('documents_newest.json', out)
    expect(out.health).toEqual({ source_id: 'fr.api', endpoint: 'documents_newest', status: 'ok', detail: '20 newest published documents', items_seen: 20 })
    expect(out.events).toHaveLength(20)
    expectAllValid(out.events)
  })

  test('re-parsing the same fixture gives byte-identical events (stable ids)', () => {
    expect(JSON.stringify(parseFr('documents_newest', docs()))).toBe(JSON.stringify(out))
  })

  test('EO 14434 is keyed by its number, with no invented time of day', () => {
    const ev = byNumber(out.events, '2026-20321')
    expect(ev.event_type).toBe('fr.published.presidential_document')
    expect(ev.dedup_key).toBe('fr:2026-20321#published')
    expect(ev.thread_key).toBe('eo:14434')
    expect(ev.alias_keys).toEqual(['eo:14434'])
    expect(ev.title).toBe('Executive Order 14434 published in the Federal Register on October 2, 2026: Inaugurating the Era of Super Intelligence')
    expect(ev.times.occurred_at).toBeNull()
    expect(ev.times.first_seen_at).toBe('2026-10-02T21:27:22.995Z')
    // FR-9: an executive order is a D-012 alert class wherever it is seen (EVENT_MODEL P0 examples); only the owner
    // may narrow that, so publication is P0 too, like the White House feed's EO post.
    expect(ev.importance).toEqual({ tier: 'P0', reasons: ['presidential_document_published', 'executive_order', 'D-012'] })
    expect(ev.result).toEqual({ publication_date: '2026-10-02', signing_date: '2026-09-29', executive_order_number: '14434', citation: '91 FR 63129' })
    expect(ev.body).toBe('white_house')
    expect(ev.features).toEqual(['F10', 'F9'])
  })

  test('presidential notices and determinations are worded by subtype and get no eo: key', () => {
    const notice = byNumber(out.events, '2026-20322')
    expect(notice.title).toBe('Presidential notice published in the Federal Register on October 2, 2026: Continuation of the National Emergency With Respect to the Situation in and in Relation to Syria')
    expect(notice.thread_key).toBeUndefined()
    expect(byNumber(out.events, '2026-20318').title).toMatch(/^Presidential determination published in the Federal Register on October 2, 2026: /)
  })

  test('the significant flag decides P1 for a rule; null stays unknown', () => {
    const sig = byNumber(out.events, '2026-20281') // CMS GLOBE model rule, significant: true
    expect(sig.event_type).toBe('fr.published.rule')
    expect(sig.importance).toEqual({ tier: 'P1', reasons: ['rule', 'significant'] })
    expect(sig.body).toBe('agency:centers-for-medicare-medicaid-services') // HHS (parent) is listed first, CMS is the issuer
    expect(sig.title).toBe('Centers for Medicare & Medicaid Services rule published in the Federal Register on October 2, 2026: Global Benchmark for Efficient Drug Pricing (GLOBE) Model')
    expect(sig.branch).toBe('executive')
    const nrc = byNumber(out.events, '2026-20276') // NRC rule, significant: null
    expect(nrc.importance).toEqual({ tier: 'P3', reasons: ['rule', 'significance_unknown'] })
    expect(nrc.branch).toBe('independent')
    expect(byNumber(out.events, '2026-20277').event_type).toBe('fr.published.proposed_rule')
    expect(byNumber(out.events, '2026-20280').event_type).toBe('fr.published.notice')
  })

  test('the cache-buster echoed into next_page_url (seen live 2026-10-02) does not change any event', () => {
    const busted = edited(docs(), (j) => { j.next_page_url = j.next_page_url.replace('documents?', 'documents?_=1790977406839&') })
    expect(busted.body).not.toBe(docs().body)
    expect(JSON.stringify(parseFr('documents_newest', variant(busted, { url: `${DOCUMENTS_NEWEST_URL}&_=1790977406839` })).events))
      .toBe(JSON.stringify(out.events))
  })

  test('FR-2: the older fixtures recorded without fields[] are drift (the production URL asks for every field)', () => {
    // Real recorded payloads that lack `significant`, `subtype` and `executive_order_number`: parsed as if those were
    // null, every significant rule would drop to P3 and every EO would lose its eo: key, with health ok.
    for (const name of ['documents_newest20.json', 'documents_executive_orders.json']) {
      const o = parseFr('documents_newest', replay('fr.api', DAY, name))
      expectNothing(o, 'drift')
      expect(o.health.detail).toMatch(/^result 1 of \d+: document \S+ has no "citation" field; nothing from this payload was published$/)
    }
  })
})

describe('fail closed: nothing is published from a bad payload', () => {
  test('the NEGATIVE fixture (HTTP 404 HTML page from the JSON API) is an error on both endpoints', () => {
    for (const ep of ['pi_current', 'documents_newest']) {
      const out = parseFr(ep, negative())
      expectNothing(out, 'error')
      expect(out.health.detail).toBe('HTTP 404 with an HTML page instead of JSON data')
      expect(out.health.items_seen).toBe(0)
    }
  })

  test('an HTML page with HTTP 200 is an error', () => {
    const out = parseFr('pi_current', variant(pi(), { body: negative().body, headers: { 'content-type': 'text/html' } }))
    expectNothing(out, 'error')
    expect(out.health.detail).toBe('HTTP 200 but an HTML page instead of JSON data')
  })

  test('an HTML body labelled as JSON is still an error', () => {
    const out = parseFr('documents_newest', variant(docs(), { body: negative().body }))
    expectNothing(out, 'error')
    expect(out.health.detail).toBe('HTTP 200 but an HTML page that is not valid JSON')
  })

  test('a 304 is not_modified', () => {
    const out = parseFr('pi_current', variant(pi(), { status: 304, body: '' }))
    expectNothing(out, 'not_modified')
  })

  test('a 500 with a JSON error body is an error', () => {
    const out = parseFr('pi_current', variant(pi(), { status: 500, body: '{"status":500,"message":"oops"}' }))
    expectNothing(out, 'error')
    expect(out.health.detail).toBe('HTTP 500 with a body of type application/json instead of JSON data')
  })

  test('a result missing document_number is drift and drops the whole payload', () => {
    const out = parseFr('pi_current', edited(pi(), (j) => { delete j.results[2].document_number }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toBe('result 3 of 107: a result has no document_number; nothing from this payload was published')
    expect(out.health.items_seen).toBe(107)
  })

  const driftCases: Array<[string, (j: any) => void]> = [
    ['no results list', (j) => { delete j.results }],
    ['results is not a list', (j) => { j.results = { a: 1 } }],
    ['a result is not an object', (j) => { j.results[0] = 'x' }],
    ['document_number with a space', (j) => { j.results[0].document_number = '2026 20439' }],
    ['missing title', (j) => { delete j.results[5].title }],
    ['whitespace-only title', (j) => { j.results[5].title = '   ' }],
    ['missing html_url', (j) => { delete j.results[5].html_url }],
    ['http html_url', (j) => { j.results[5].html_url = 'http://www.federalregister.gov/x' }],
    ['missing type', (j) => { delete j.results[5].type }],
    ['filed_at without an offset', (j) => { j.results[5].filed_at = '2026-10-02T08:45:00' }],
    ['filed_at on an impossible day', (j) => { j.results[5].filed_at = '2026-09-31T08:45:00.000-04:00' }],
    ['filed_at as a number', (j) => { j.results[5].filed_at = 1790944500 }],
    ['agencies not a list', (j) => { j.results[5].agencies = 'SEC' }],
    ['agency slug with capitals', (j) => { j.results[5].agencies[0].slug = 'Securities' }],
    ['publication_date not a date', (j) => { j.results[5].publication_date = '10/05/2026' }],
    ['pdf_url over http', (j) => { j.results[5].pdf_url = 'http://public-inspection.federalregister.gov/x.pdf' }],
  ]
  test.each(driftCases)('pi_current drift: %s', (_name, edit) => {
    expectNothing(parseFr('pi_current', edited(pi(), edit)), 'drift')
  })

  const docDriftCases: Array<[string, (j: any) => void]> = [
    ['executive_order_number not numeric', (j) => { j.results[1].executive_order_number = '14434A' }],
    ['significant as text', (j) => { j.results[6].significant = 'yes' }],
    ['signing_date not a date', (j) => { j.results[1].signing_date = 'September 29' }],
  ]
  test.each(docDriftCases)('documents_newest drift: %s', (_name, edit) => {
    expectNothing(parseFr('documents_newest', edited(docs(), edit)), 'drift')
  })

  test('a JSON array or a non-JSON body never publishes', () => {
    expectNothing(parseFr('pi_current', variant(pi(), { body: '[]' })), 'drift')
    expectNothing(parseFr('pi_current', variant(pi(), { body: '' })), 'error')
  })

  test('an unknown endpoint id and a bad fetch time are errors', () => {
    expectNothing(parseFr('documents', pi()), 'error')
    expectNothing(parseFr('pi_current', variant(pi(), { fetchedAt: '2026-10-02 18:00:28' })), 'error')
  })
})

describe('empty answers', () => {
  test('{"count":0,"results":[]} (the PI shape) is empty', () => {
    const out = parseFr('pi_current', variant(pi(), { body: '{"count":0,"results":[]}' }))
    expectNothing(out, 'empty')
    expect(out.health.items_seen).toBe(0)
  })

  test('{"description":…,"count":0} with no results key (documents.json, seen live 2026-10-02) is empty', () => {
    const out = parseFr('documents_newest', variant(docs(), { body: '{"description":"Documents matching \'qqzzxxnonexistentterm\'","count":0}' }))
    expectNothing(out, 'empty')
  })

  test('a count above zero without results is still drift', () => {
    expectNothing(parseFr('documents_newest', variant(docs(), { body: '{"description":"x","count":5}' })), 'drift')
  })
})

describe('times', () => {
  // The poll is placed one hour after the filing time (Date's own offset parsing is the independent oracle), so a
  // future slot such as December stays inside the plausibility window (FR-6).
  const filed = (filedAt: string | null): CedEvent => {
    const fetchedAt = filedAt === null ? pi().fetchedAt : new Date(new Date(filedAt).getTime() + 3_600_000).toISOString()
    const out = parseFr('pi_current', edited(variant(pi(), { fetchedAt }), (j) => { j.results[1].filed_at = filedAt }))
    expect(out.health.status, out.health.detail).toBe('ok')
    expectAllValid(out.events)
    return out.events[1]!
  }

  test('a winter (-05:00) filing time converts with its own offset', () => {
    expect(filed('2026-12-01T08:45:00.000-05:00').times.occurred_at).toBe('2026-12-01T13:45:00Z')
    expect(filed('2026-12-01T11:15:00.000-05:00').times.occurred_at).toBe('2026-12-01T16:15:00Z')
  })

  test('the same 08:45 slot on both sides of the 2026-11-01 DST change', () => {
    expect(filed('2026-10-30T08:45:00.000-04:00').times.occurred_at).toBe('2026-10-30T12:45:00Z')
    expect(filed('2026-11-02T08:45:00.000-05:00').times.occurred_at).toBe('2026-11-02T13:45:00Z')
  })

  test('a filing late in the evening rolls into the next UTC day (and year)', () => {
    expect(filed('2026-12-31T21:00:00.000-05:00').times.occurred_at).toBe('2027-01-01T02:00:00Z')
  })

  test('a null filed_at gives occurred_at null, never a guess; a missing filed_at key is drift (FR-2)', () => {
    expect(filed(null).times.occurred_at).toBeNull()
    expectNothing(parseFr('pi_current', edited(pi(), (j) => { delete j.results[1].filed_at })), 'drift')
  })

  test('published documents never get an occurred_at (publication_date has no time of day)', () => {
    expect(parseFr('documents_newest', docs()).events.every((e) => e.times.occurred_at === null)).toBe(true)
  })

  test('frInstantToUtc and frDateInWords', () => {
    expect(frInstantToUtc('2026-10-02T11:15:00.000-04:00')).toBe('2026-10-02T15:15:00Z')
    expect(frInstantToUtc('2026-10-02T11:15:00Z')).toBe('2026-10-02T11:15:00Z')
    expect(frInstantToUtc('2026-10-02T11:15:00+05:30')).toBe('2026-10-02T05:45:00Z')
    expect(frInstantToUtc('2026-02-29T08:45:00-05:00')).toBeNull() // 2026 is not a leap year
    expect(frInstantToUtc('2026-10-02T24:00:00-04:00')).toBeNull()
    expect(frInstantToUtc('2026-10-02')).toBeNull()
    expect(frDateInWords('2026-10-05')).toBe('October 5, 2026')
    expect(frDateInWords('2027-01-01')).toBe('January 1, 2027')
  })
})

describe('mapping rules', () => {
  const one = (ep: 'pi_current' | 'documents_newest', patch: Record<string, unknown>): CedEvent => {
    const base = ep === 'pi_current' ? pi() : docs()
    const out = parseFr(ep, edited(base, (j) => { j.results = [{ ...j.results[ep === 'pi_current' ? 1 : 6], ...patch }]; j.count = 1 }))
    expect(out.health.status, out.health.detail).toBe('ok')
    expectAllValid(out.events)
    return out.events[0]!
  }
  // ids and parent ids as in the live FR registry (api/v1/agencies.json, 2026-10-02)
  const agency = (slug: string | null, name: string, id: number | null = null, parent_id: number | null = null) =>
    ({ raw_name: name.toUpperCase(), name, id, slug, parent_id })
  const energy = agency('energy-department', 'Energy Department', 136)
  const ferc = agency('federal-energy-regulatory-commission', 'Federal Energy Regulatory Commission', 167, 136)
  const treasury = agency('treasury-department', 'Treasury Department', 497)
  const occ = agency('comptroller-of-the-currency', 'Comptroller of the Currency', 80, 497)
  const irs = agency('internal-revenue-service', 'Internal Revenue Service', 254, 497)
  const commerce = agency('commerce-department', 'Commerce Department', 54)
  const noaa = agency('national-oceanic-and-atmospheric-administration', 'National Oceanic and Atmospheric Administration', 361, 54)

  test('branch: a sub-agency listed after its parent still counts (FERC under Energy, OCC under Treasury)', () => {
    const fercRule = one('documents_newest', { agencies: [energy, ferc] })
    expect(fercRule.branch).toBe('independent')
    expect(fercRule.body).toBe('agency:federal-energy-regulatory-commission')
    expect(one('pi_current', { agencies: [ferc] }).branch).toBe('independent')
    expect(one('documents_newest', { agencies: [treasury, occ] }).branch).toBe('independent')
    expect(one('documents_newest', { agencies: [treasury, irs] }).branch).toBe('executive')
  })

  test('body: the same document gets the same agency at Public Inspection (sub-agency alone) and when published (parent first)', () => {
    const atPi = one('pi_current', { agencies: [noaa] })
    const published = one('documents_newest', { agencies: [commerce, noaa] })
    expect(atPi.body).toBe('agency:national-oceanic-and-atmospheric-administration')
    expect(published.body).toBe(atPi.body)
    expect(published.title.startsWith('National Oceanic and Atmospheric Administration rule published')).toBe(true)
    // Independent co-issuers (no parent link between them): the first listed one.
    expect(one('documents_newest', { agencies: [irs, agency('defense-department', 'Defense Department', 103)] }).body).toBe('agency:internal-revenue-service')
  })

  test('branch: legislative and judicial agencies, and the table itself', () => {
    expect(one('pi_current', { agencies: [agency('copyright-office-library-of-congress', 'Copyright Office, Library of Congress')] }).branch).toBe('legislative')
    expect(one('pi_current', { agencies: [agency('united-states-sentencing-commission', 'United States Sentencing Commission')] }).branch).toBe('judicial')
    expect(frBranch(true, ['securities-and-exchange-commission'])).toBe('executive')
    expect(frBranch(false, ['federal-election-commission'])).toBe('executive') // not on the 3502(5) list
    expect(frBranch(false, ['medicare-payment-advisory-commission'])).toBe('legislative') // 42 U.S.C. 1395b-6(a), review FR-8
    expect(frBranch(false, ['u-s-china-economic-and-security-review-commission'])).toBe('executive') // statute names no branch: documented gap
    expect(frBranch(false, ['federal-reserve-system'])).toBe('independent')
  })

  test('body: no agency -> federal_register (executive); an agency without a slug is skipped', () => {
    const none = one('pi_current', { agencies: [] })
    expect(none.body).toBe('federal_register')
    expect(none.branch).toBe('executive')
    expect(none.title.startsWith('Notice filed for public inspection: ')).toBe(true)
    const skipped = one('pi_current', { agencies: [{ raw_name: 'SOME BOARD' }, agency('postal-service', 'Postal Service', 410)] })
    expect(skipped.body).toBe('agency:postal-service')
    expect(skipped.title.startsWith('Postal Service notice filed for public inspection: ')).toBe(true)
    expectNothing(parseFr('pi_current', edited(pi(), (j) => { j.results[1].agencies[0].parent_id = '227' })), 'drift')
  })

  test('every published type maps to its event type; unknown types are kept as other', () => {
    const map: Record<string, string> = {
      Rule: 'fr.published.rule', 'Proposed Rule': 'fr.published.proposed_rule', Notice: 'fr.published.notice',
      'Presidential Document': 'fr.published.presidential_document', 'Uncategorized Document': 'fr.published.other',
    }
    for (const [type, eventType] of Object.entries(map)) expect(one('documents_newest', { type }).event_type).toBe(eventType)
    expect(one('documents_newest', { type: 'Uncategorized Document' }).importance).toEqual({ tier: 'P4', reasons: ['other_document_type'] })
  })

  test('an integer executive_order_number is accepted; significant false is said, not hidden', () => {
    const eo = one('documents_newest', { type: 'Presidential Document', subtype: 'Executive Order', executive_order_number: 14500 })
    expect(eo.thread_key).toBe('eo:14500')
    expect(eo.title.startsWith('Executive Order 14500 published in the Federal Register on ')).toBe(true)
    const noNumber = one('documents_newest', { type: 'Presidential Document', subtype: 'Executive Order', executive_order_number: null })
    expect(noNumber.title.startsWith('Executive order published')).toBe(true)
    expect(noNumber.thread_key).toBeUndefined()
    expect(one('documents_newest', { type: 'Rule', significant: false }).importance).toEqual({ tier: 'P3', reasons: ['rule', 'not_significant'] })
  })

  test('a repeated document number in one payload is skipped once and reported', () => {
    const out = parseFr('pi_current', edited(pi(), (j) => { j.results.push(j.results[0]); j.count++ }))
    expect(out.health.status).toBe('ok')
    expect(out.health.items_seen).toBe(108)
    expect(out.events).toHaveLength(107)
    expect(out.health.detail).toBe('108 documents on public inspection; 1 repeated document number skipped')
  })

  test('a very long title is cut in our title line only; official_text stays verbatim', () => {
    const long = 'A'.repeat(1500)
    const ev = one('pi_current', { title: long })
    expect(ev.title.length).toBe(1000)
    expect(ev.title.endsWith('…')).toBe(true)
    expect(ev.official_text).toBe(long)
    expectNothing(parseFr('pi_current', edited(pi(), (j) => { j.results[0].title = 'B'.repeat(4001) })), 'drift')
  })
})

// Regression tests for the adversarial review of 2026-10-02 (findings FR-1 … FR-11). Each one replays the attack that
// made the adapter publish a wrong fact or report "ok" over one, and was red before its fix.
describe('adversarial review 2026-10-02: regression tests', () => {
  const find = (j: any, n: string): any => j.results.find((r: any) => r.document_number === n)
  const single = (ep: 'pi_current' | 'documents_newest', patch: Record<string, unknown>): AdapterOutput => {
    const base = ep === 'pi_current' ? pi() : docs()
    return parseFr(ep, edited(base, (j) => { j.results = [{ ...j.results[ep === 'pi_current' ? 1 : 6], ...patch }]; j.count = 1 }))
  }

  // FR-1: a payload must belong to the endpoint it is parsed for.
  test('FR-1: a documents.json payload given to pi_current is drift, never 20 Public Inspection filings', () => {
    const out = parseFr('pi_current', docs())
    expectNothing(out, 'drift')
    expect(out.health.detail).toBe('result 1 of 20: document 2026-20322 is not a Public Inspection document (its html_url is not under https://www.federalregister.gov/public-inspection/); nothing from this payload was published')
  })

  test('FR-1: a current.json payload given to documents_newest is drift, never 107 publications', () => {
    expectNothing(parseFr('documents_newest', pi()), 'drift') // 107 results: more than the URL's per_page=20 (FR-11)
    const out = parseFr('documents_newest', edited(pi(), (j) => { j.results = j.results.slice(0, 20); j.count = 20 }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toMatch(/^result 1 of 20: document \S+ is not a published document \(its html_url is not under https:\/\/www\.federalregister\.gov\/documents\/\); nothing from this payload was published$/)
  })

  // FR-2: a key the endpoint always sends is required; only its null value means "none".
  const PI_REQUIRED = ['agencies', 'document_number', 'editorial_note', 'filed_at', 'filing_type', 'html_url', 'pdf_url', 'publication_date', 'title', 'type']
  test('FR-2: every key the adapter requires is present on all 127 recorded production results', () => {
    for (const r of JSON.parse(pi().body).results) for (const k of PI_REQUIRED) expect(Object.hasOwn(r, k), `${r.document_number}.${k}`).toBe(true)
    for (const r of JSON.parse(docs().body).results) for (const k of DOCUMENTS_FIELDS) expect(Object.hasOwn(r, k), `${r.document_number}.${k}`).toBe(true)
  })

  test.each(PI_REQUIRED)('FR-2: a PI result without its "%s" key is drift', (key) => {
    expectNothing(parseFr('pi_current', edited(pi(), (j) => { delete find(j, '2026-20439')[key] })), 'drift')
  })

  test.each([...DOCUMENTS_FIELDS])('FR-2: a published result without the requested "%s" field is drift', (key) => {
    expectNothing(parseFr('documents_newest', edited(docs(), (j) => { delete j.results[6][key] })), 'drift')
  })

  test('FR-2: agencies missing from every result is drift, not "no agency" (the NRC rule would lose its body and branch)', () => {
    const out = parseFr('documents_newest', edited(docs(), (j) => { for (const r of j.results) delete r.agencies }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toBe('result 1 of 20: document 2026-20322 has no "agencies" field; nothing from this payload was published')
  })

  test('FR-1: a PI result whose filing_type is not text is drift (it is the PI marker)', () => {
    expectNothing(parseFr('pi_current', edited(pi(), (j) => { find(j, '2026-20439').filing_type = null })), 'drift')
  })

  test('FR-2: agencies null is drift; only an explicit [] means "no agency"', () => {
    expectNothing(parseFr('pi_current', edited(pi(), (j) => { find(j, '2026-20283').agencies = null })), 'drift')
    expect(single('pi_current', { agencies: [] }).events[0]!.body).toBe('federal_register')
  })

  // FR-3: the type decides the only D-012 class this source carries, so an unknown spelling must not fail open.
  test.each(['PRESDOCU', 'Presidential Documents', 'Presidential_Document', 'Executive Order'])('FR-3: an unknown type "%s" is drift, never a quiet P4', (t) => {
    const out = parseFr('pi_current', edited(pi(), (j) => { find(j, '2026-20439').type = t }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toContain(`document 2026-20439 has an unknown type "${t}"`)
  })

  test('FR-3: the known types still map in any letter case', () => {
    const out = parseFr('pi_current', edited(pi(), (j) => { find(j, '2026-20439').type = 'PRESIDENTIAL DOCUMENT' }))
    expect(out.health.status).toBe('ok')
    expect(byNumber(out.events, '2026-20439').importance?.tier).toBe('P0')
    expect(single('documents_newest', { type: 'uncategorized document' }).events[0]!.event_type).toBe('fr.published.other')
  })

  // FR-4: eo: keys and "Executive Order N" only for a presidential document whose subtype is Executive Order.
  test('FR-4: an EO number on a rule is drift (it would thread the NRC rule into EO 14434)', () => {
    const out = parseFr('documents_newest', edited(docs(), (j) => { find(j, '2026-20276').executive_order_number = '14434' }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toContain('document 2026-20276 has an executive_order_number but is not an executive order')
  })

  test('FR-4: an EO number on a presidential notice, or on a presidential document with no subtype, is drift', () => {
    expectNothing(parseFr('documents_newest', edited(docs(), (j) => { find(j, '2026-20322').executive_order_number = '11111' })), 'drift')
    expectNothing(single('documents_newest', { type: 'Presidential Document', subtype: null, executive_order_number: '14500' }), 'drift')
    const eo = single('documents_newest', { type: 'Presidential Document', subtype: 'executive order', executive_order_number: '14500' })
    expect(eo.events[0]!.thread_key).toBe('eo:14500')
  })

  // FR-5: a repeated document number is skipped only when both copies say the same thing.
  test('FR-5: a repeated document number with different content is drift; the P0 copy is never dropped quietly', () => {
    const out = parseFr('pi_current', edited(pi(), (j) => { j.results.unshift({ ...find(j, '2026-20439'), type: 'Notice' }); j.count++ }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toMatch(/^result \d+ of 108: document 2026-20439 appears twice with different content; nothing from this payload was published$/)
  })

  test('FR-5: a repeat that differs only in a field the adapter does not read is still skipped', () => {
    const out = parseFr('pi_current', edited(pi(), (j) => { j.results.push({ ...j.results[0], page_views: { count: 99 } }); j.count++ }))
    expect(out.health.status).toBe('ok')
    expect(out.events).toHaveLength(107)
  })

  // FR-6: a time far from the poll is not a time we publish.
  const filedOn = (f: string): AdapterOutput => parseFr('pi_current', edited(pi(), (j) => { find(j, '2026-20439').filed_at = f }))
  test.each([
    '9999-12-31T23:00:00.000-05:00', // year 10000 in UTC: not even a valid event time
    '2099-01-01T08:45:00.000-05:00',
    '1900-01-01T00:00:00.000+14:00',
    '2026-10-02T11:15:00.000-14:59', // no such UTC offset
    '2026-10-02T11:15:00.000+05:07', // no such UTC offset
    '2026-10-03T08:45:00.000-04:00', // 18.7 h after the poll (fetched 2026-10-02T18:00:28Z)
    '2025-09-30T11:15:00.000-04:00', // more than a year before the poll
  ])('FR-6: an implausible filed_at %s is drift', (f) => {
    expectNothing(filedOn(f), 'drift')
  })

  test('FR-6: filed_at up to 6 h after the poll (clock slack) or under a year before it is kept', () => {
    expect(byNumber(filedOn('2026-10-02T15:00:00.000-04:00').events, '2026-20439').times.occurred_at).toBe('2026-10-02T19:00:00Z')
    expect(byNumber(filedOn('2025-10-15T08:45:00.000-04:00').events, '2026-20439').times.occurred_at).toBe('2025-10-15T12:45:00Z')
  })

  test('FR-6: frInstantToUtc rejects offsets no zone uses and results past year 9999', () => {
    expect(frInstantToUtc('9999-12-31T23:00:00.000-05:00')).toBeNull()
    expect(frInstantToUtc('2026-10-02T11:15:00-14:59')).toBeNull()
    expect(frInstantToUtc('2026-10-02T11:15:00+14:30')).toBeNull()
    expect(frInstantToUtc('2026-10-02T11:15:00+05:07')).toBeNull()
    expect(frInstantToUtc('2026-10-02T11:15:00+14:00')).toBe('2026-10-01T21:15:00Z')
    expect(frInstantToUtc('2026-10-02T11:15:00-12:00')).toBe('2026-10-02T23:15:00Z')
    expect(frInstantToUtc('2026-10-02T11:15:00+05:45')).toBe('2026-10-02T05:30:00Z')
  })

  test('FR-6: a published document dated after the poll day (+1 day for the UTC/Eastern date line) is drift', () => {
    const pub = (d: string): AdapterOutput => parseFr('documents_newest', edited(docs(), (j) => { find(j, '2026-20321').publication_date = d }))
    expectNothing(pub('2031-01-01'), 'drift')
    expectNothing(pub('2026-10-04'), 'drift') // fetched 2026-10-02T21:27Z
    expect(pub('2026-10-03').health.status).toBe('ok')
  })

  test('FR-6: a signing date after the publication date, or any date over a year from the poll, is drift', () => {
    expectNothing(parseFr('documents_newest', edited(docs(), (j) => { find(j, '2026-20321').signing_date = '2026-10-03' })), 'drift')
    expectNothing(parseFr('pi_current', edited(pi(), (j) => { find(j, '2026-20439').publication_date = '2031-01-01' })), 'drift')
  })

  // FR-7: only the empty shapes seen live count as empty, and count must agree with the list.
  test('FR-7: a 200 JSON reply carrying an error object is an error, not empty', () => {
    const out = parseFr('documents_newest', variant(docs(), { body: '{"count":0,"errors":{"conditions":"bad"}}' }))
    expectNothing(out, 'error')
    expect(out.health.detail).toBe('HTTP 200 but the JSON body is an error reply ("errors"); nothing was published')
  })

  test('FR-7: each endpoint accepts only its own observed empty shape', () => {
    expectNothing(parseFr('pi_current', variant(pi(), { body: '{"description":"x","count":0}' })), 'drift')
    expectNothing(parseFr('documents_newest', variant(docs(), { body: '{"count":0,"results":[]}' })), 'drift')
    expectNothing(parseFr('pi_current', variant(pi(), { body: '{"count":3,"results":[]}' })), 'drift')
    expectNothing(parseFr('documents_newest', variant(docs(), { body: '{"description":"x","count":0,"warning":"y"}' })), 'drift')
    const piEmpty = '{"count":0,"special_filings_updated_at":null,"regular_filings_updated_at":null,"results":[]}'
    expectNothing(parseFr('pi_current', variant(pi(), { body: piEmpty })), 'empty')
  })

  test('FR-7: on pi_current (not paginated) count must equal the number of results', () => {
    const out = parseFr('pi_current', edited(pi(), (j) => { j.count = 500 }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toBe('the body says count 500 but lists 107 results; nothing from this payload was published')
  })

  test('FR-7: on documents_newest count is the total number of matches, never below the results listed', () => {
    expectNothing(parseFr('documents_newest', edited(docs(), (j) => { j.count = 5 })), 'drift')
    expectNothing(parseFr('documents_newest', edited(docs(), (j) => { delete j.count })), 'drift')
  })

  // FR-9: EVENT_MODEL's P0 examples name executive orders, proclamations and memoranda; narrowing is the owner's call.
  test.each([
    ['Executive Order', 'P0', ['presidential_document_published', 'executive_order', 'D-012']],
    ['Proclamation', 'P0', ['presidential_document_published', 'proclamation', 'D-012']],
    ['Memorandum', 'P0', ['presidential_document_published', 'memorandum', 'D-012']],
    ['Notice', 'P1', ['presidential_document_published']],
    ['Determination', 'P1', ['presidential_document_published']],
    [null, 'P1', ['presidential_document_published', 'subtype_unknown']],
  ])('FR-9: a published presidential document with subtype %s is %s', (subtype, tier, reasons) => {
    const out = single('documents_newest', { type: 'Presidential Document', subtype, executive_order_number: null })
    expect(out.health.status, out.health.detail).toBe('ok')
    expect(out.events[0]!.importance).toEqual({ tier, reasons })
  })

  test('FR-9: the three EOs in the fixture are P0 when published; the notice and determination stay P1', () => {
    const out = parseFr('documents_newest', docs())
    expect(out.events.filter((e) => e.importance?.tier === 'P0').map((e) => e.thread_key)).toEqual(['eo:14434', 'eo:14433', 'eo:14432'])
    expect(byNumber(out.events, '2026-20322').importance?.tier).toBe('P1')
    expect(byNumber(out.events, '2026-20318').importance?.tier).toBe('P1')
  })

  // FR-10: an event's primary-source link may not leave the official host.
  test.each([
    ['pi_current', 'html_url', 'https://evil.example/public-inspection/2026-20439/x'],
    ['pi_current', 'html_url', 'https://www.federalregister.gov@evil.example/public-inspection/2026-20439/x'],
    ['pi_current', 'html_url', 'https://www.federalregister.gov:8443/public-inspection/2026-20439/x'],
    ['pi_current', 'html_url', 'https://user:pw@www.federalregister.gov/public-inspection/2026-20439/x'],
    ['pi_current', 'html_url', 'https://www.federalregister.gov/public-inspection/../documents/2026-20439/x'],
    ['pi_current', 'pdf_url', 'https://evil.example/2026-20439.pdf'],
    ['pi_current', 'pdf_url', 'https://www.govinfo.gov/content/pkg/FR-2026-10-05/pdf/2026-20439.pdf'],
    ['documents_newest', 'html_url', 'https://evil.example/documents/2026/10/02/2026-20321/x'],
    ['documents_newest', 'pdf_url', 'https://evil.example/2026-20321.pdf'],
  ])('FR-10: %s %s on a foreign host (%s) is drift', (ep, key, url) => {
    const base = ep === 'pi_current' ? pi() : docs()
    const n = ep === 'pi_current' ? '2026-20439' : '2026-20321'
    expectNothing(parseFr(ep, edited(base, (j) => { find(j, n)[key] = url })), 'drift')
  })

  // FR-11: an abnormal payload is refused before it can use up the Worker's CPU budget.
  const manyPi = (n: number): FetchedResponse => edited(pi(), (j) => {
    const base = j.results
    j.results = Array.from({ length: n }, (_, i) => ({ ...base[i % base.length], document_number: `2026-${30000 + i}` }))
    j.count = n
  })
  test('FR-11: more than 1000 PI results is drift before any result is read', () => {
    const out = parseFr('pi_current', manyPi(1001))
    expectNothing(out, 'drift')
    expect(out.health.detail).toBe('1001 results, more than the 1000 this adapter reads in one poll; nothing from this payload was published')
    expect(out.health.items_seen).toBe(1001)
    expect(parseFr('pi_current', manyPi(1000)).events).toHaveLength(1000)
  })

  test('FR-11: documents_newest never lists more than the 20 its URL asks for', () => {
    const out = parseFr('documents_newest', edited(docs(), (j) => { j.results.push({ ...j.results[0], document_number: '2026-99999' }) }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toBe('21 results, more than the 20 this adapter reads in one poll; nothing from this payload was published')
  })

  test('FR-11: a body over 2,000,000 characters is drift before it is parsed', () => {
    const body = pi().body + ' '.repeat(2_000_000)
    const out = parseFr('pi_current', variant(pi(), { body }))
    expectNothing(out, 'drift')
    expect(out.health.detail).toBe(`the body is ${body.length} characters, more than the 2000000 this adapter parses; nothing was published`)
  })
})

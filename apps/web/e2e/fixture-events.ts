// Events for the web tests, built at test time from the RECORDED upstream fixtures (fixtures/fr.api, fixtures/wh.feeds),
// never from invented facts: every title word, number, agency, time and URL below is read from a fixture file. The
// rule that makes each `title` is spelled out next to it (what the source did, in plain words); `official_text` is the
// source's own words. These stand in for the Worker's output until P1.4/P1.5 land; they are not the adapters.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CedEvent, SourceStatus, Tier } from '@ced/schema'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8')
const meta = (rel: string) => JSON.parse(read(`${rel}.meta.json`)) as { url: string; fetched_at: string }
const evtId = (dedupKey: string, revision: number) =>
  'evt_' + createHash('sha256').update(`${dedupKey}|${revision}`).digest('hex').slice(0, 16)

const PI_FILE = 'fixtures/fr.api/2026-10-02/pi_current.json'
const WH_FILE = 'fixtures/wh.feeds/2026-10-02/presidential-actions_feed.xml'

interface PiDoc {
  document_number: string
  type: string
  title: string
  agency_names: string[]
  filed_at: string | null
  html_url: string
}

const PI_KIND: Record<string, string> = {
  'Presidential Document': 'Presidential document',
  'Proposed Rule': 'Proposed rule',
  Rule: 'Rule',
  Notice: 'Notice',
}

/** One Public Inspection document from the recorded `current.json` as an `fr.public_inspection` event. */
export function piEvent(documentNumber: string, tier: Tier): CedEvent {
  const body = JSON.parse(read(PI_FILE)) as { results: PiDoc[] }
  const d = body.results.find((r) => r.document_number === documentNumber)
  if (!d || !d.filed_at) throw new Error(`fixture has no filed document ${documentNumber}`)
  const m = meta(PI_FILE)
  const kind = PI_KIND[d.type]
  if (!kind) throw new Error(`unexpected PI type ${d.type}`)
  const dedup = `fr:${d.document_number}#public_inspection`
  // Title rule: "<type> filed for public inspection" + "by <first agency>" unless presidential + the FR document number.
  const by = d.type === 'Presidential Document' ? '' : ` by ${d.agency_names[0]}`
  return {
    schema_version: '0.1',
    id: evtId(dedup, 1),
    dedup_key: dedup,
    object_key: `fr:${d.document_number}`,
    event_type: 'fr.public_inspection',
    status: 'published',
    branch: 'executive',
    body: 'federal_register',
    features: d.type === 'Presidential Document' ? ['F10', 'F9'] : ['F10'],
    title: `${kind} filed for public inspection${by} (FR Doc. ${d.document_number})`,
    official_text: d.title.replace(/\s+/g, ' ').trim(),
    importance: { tier, reasons: [d.type] },
    times: { occurred_at: new Date(d.filed_at).toISOString(), first_seen_at: new Date(m.fetched_at).toISOString() },
    sources: [
      { source_id: 'fr.api', url: d.html_url, retrieved_at: new Date(m.fetched_at).toISOString(), affiliation: 'official-nonpartisan', license: 'us-gov-public-domain' },
    ],
    revision: 1,
    supersedes: null,
    provenance: { parser: 'web-e2e-fixture@0', confidence: 'high' },
  }
}

/** The White House presidential-actions RSS item at `link` as a `presidential_action.executive_order` event. */
export function whExecutiveOrderEvent(link: string): CedEvent {
  const xml = read(WH_FILE)
  const item = xml.split('<item>').slice(1).find((it) => it.includes(`<link>${link}</link>`))
  if (!item) throw new Error(`fixture has no item ${link}`)
  if (!item.includes('<category><![CDATA[Executive Orders]]></category>')) throw new Error(`${link} is not filed under Executive Orders`)
  const title = /<title>([^<]*)<\/title>/.exec(item)?.[1]
  const pub = /<pubDate>([^<]*)<\/pubDate>/.exec(item)?.[1]
  if (!title || !pub || /&/.test(title)) throw new Error('item title/pubDate missing or needs entity decoding')
  const m = meta(WH_FILE)
  const path = new URL(link).pathname.replace(/^\/+|\/+$/g, '')
  const dedup = `wh:${path}#published`
  return {
    schema_version: '0.1',
    id: evtId(dedup, 1),
    dedup_key: dedup,
    object_key: `wh:${path}`,
    event_type: 'presidential_action.executive_order',
    status: 'published',
    branch: 'executive',
    body: 'white_house',
    features: ['F9'],
    // Title rule: what the source did, from its "Executive Orders" category; the order's own title is official_text.
    title: 'The White House posted an executive order',
    official_text: title,
    importance: { tier: 'P1', reasons: ['presidential_action'] },
    // No signing time in the feed, so occurred_at stays null; the row shows the posting time, labeled "posted".
    times: { occurred_at: null, source_published_at: new Date(pub).toISOString(), first_seen_at: new Date(m.fetched_at).toISOString() },
    sources: [
      { source_id: 'wh.feeds', url: link, retrieved_at: new Date(m.fetched_at).toISOString(), affiliation: 'executive-messaging', license: 'us-gov-public-domain' },
    ],
    revision: 1,
    supersedes: null,
    provenance: { parser: 'web-e2e-fixture@0', confidence: 'high' },
  }
}

export const EO_LINK =
  'https://www.whitehouse.gov/presidential-actions/2026/09/eliminating-disease-carrying-pests-and-restoring-enjoyment-of-the-great-outdoors/'

/** The feed the e2e mock serves: a presidential document (P0), an EO post (P1), a proposed rule (P2), a notice (P4). */
export function fixtureEvents(): CedEvent[] {
  return [piEvent('2026-20439', 'P0'), whExecutiveOrderEvent(EO_LINK), piEvent('2026-20296', 'P2'), piEvent('2026-20293', 'P4')]
}

/** `copies` (<= 16) repeats of fixtureEvents(), for a page long enough to scroll. Only the bookkeeping differs (id,
 * dedup_key); every fact on screen, times included, is the recorded one, so the copies show as repeated rows. */
export function repeatedEvents(copies: number): CedEvent[] {
  if (copies < 1 || copies > 16) throw new Error('1..16 copies')
  return Array.from({ length: copies }, (_, k) =>
    // Still schema-shaped: id ^evt_[0-9a-f]{16}$; the copy mark goes before the dedup_key's single '#'.
    fixtureEvents().map((e) => ({ ...e, id: `evt_${k.toString(16)}${e.id.slice(5)}`, dedup_key: e.dedup_key.replace('#', `.copy${k}#`) })),
  ).flat()
}

/** The two Phase-1 sources as /api/v1/status rows. Cadence/SLO are the Phase-1 1-minute cron and its 2x SLO. */
export function sourceStatus(source_id: 'fr.api' | 'wh.feeds', lastSuccessIso: string | null, over: Partial<SourceStatus> = {}): SourceStatus {
  return {
    source_id,
    name: source_id === 'fr.api' ? 'Federal Register' : 'White House',
    affiliation: source_id === 'fr.api' ? 'official-nonpartisan' : 'executive-messaging',
    features: source_id === 'fr.api' ? ['F10'] : ['F9'],
    cadence_s: 60,
    freshness_slo_s: 120,
    last_attempt_at: lastSuccessIso,
    last_success_at: lastSuccessIso,
    last_change_at: lastSuccessIso,
    health: lastSuccessIso === null ? 'never_polled' : 'ok',
    detail: '',
    error_streak: 0,
    items_24h: 0,
    median_latency_s: null,
    stale: lastSuccessIso === null,
    ...over,
  }
}

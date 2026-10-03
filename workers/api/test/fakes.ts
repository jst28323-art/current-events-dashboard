// Test doubles for the Worker: fake SourceDefinitions whose parse() turns a small JSON body into real-looking
// Federal Register Public Inspection events (shaped like fixtures/fr.api/2026-10-02/pi_current.json; the document
// numbers and titles are taken from that fixture, the filing times are illustrative), a scripted fetch that records
// what was sent, and a fresh HubDO per test. The real fr.api / wh.feeds adapters live in packages/adapters.
import { env } from 'cloudflare:workers'
import { finalizeEvent, type Affiliation, type CedEvent, type EventsResponse } from '@ced/schema'
import type { AdapterOutput, Endpoint, FetchedResponse, SourceDefinition } from '@ced/adapters'
import type { HubDO, PollResult } from '../src/hub.js'

/** Thu 2026-10-01 15:16:30 UTC = 11:16 ET, inside polling business hours. */
export const T0 = Date.parse('2026-10-01T15:16:30Z')
export const MIN = 60_000
export const iso = (ms: number) => new Date(ms).toISOString()

export interface FakeDoc {
  document_number: string
  title: string
  agency: string
  agency_slug: string
  type: string
  filed_at: string | null
  html_url: string
}

export const DOCS: FakeDoc[] = [
  {
    document_number: '2026-20321',
    title: 'Inaugurating the Era of Super Intelligence',
    agency: 'Executive Office of the President',
    agency_slug: 'executive-office-of-the-president',
    type: 'Presidential Document',
    filed_at: '2026-10-01T15:15:00Z',
    html_url: 'https://www.federalregister.gov/public-inspection/2026-20321/inaugurating-the-era-of-super-intelligence',
  },
  {
    document_number: '2026-20320',
    title: 'Eliminating Disease-Carrying Pests and Restoring Enjoyment of the Great Outdoors',
    agency: 'Executive Office of the President',
    agency_slug: 'executive-office-of-the-president',
    type: 'Presidential Document',
    filed_at: '2026-10-01T15:15:00Z',
    html_url:
      'https://www.federalregister.gov/public-inspection/2026-20320/eliminating-disease-carrying-pests-and-restoring-enjoyment-of-the-great-outdoors',
  },
  {
    // No trustworthy filing time in the payload: occurred_at stays null (never guessed).
    document_number: '2026-20295',
    title: 'Meetings; Sunshine Act',
    agency: 'Securities and Exchange Commission',
    agency_slug: 'securities-and-exchange-commission',
    type: 'Notice',
    filed_at: null,
    html_url: 'https://www.federalregister.gov/public-inspection/2026-20295/meetings-sunshine-act',
  },
]

export function docEvent(
  d: FakeDoc,
  fetchedAtMs: number,
  opts: { source_id?: string; affiliation?: Affiliation; url?: string } = {},
): CedEvent {
  const fetchedAt = iso(fetchedAtMs)
  const presidential = d.type === 'Presidential Document'
  return finalizeEvent({
    dedup_key: `fr:${d.document_number}#public_inspection`,
    object_key: `fr:${d.document_number}`,
    event_type: 'fr.public_inspection',
    status: 'published',
    branch: presidential ? 'executive' : 'independent',
    body: `agency:${d.agency_slug}`,
    features: presidential ? ['F9', 'F10'] : ['F10'],
    title: `${d.agency} filed a ${d.type.toLowerCase()} for public inspection: ${d.title}`,
    official_text: d.title,
    ...(presidential ? { importance: { tier: 'P0' as const, reasons: ['presidential document at public inspection'] } } : {}),
    times: { occurred_at: d.filed_at, first_seen_at: fetchedAt },
    sources: [
      {
        source_id: opts.source_id ?? 'fake.fr',
        url: opts.url ?? d.html_url,
        retrieved_at: fetchedAt,
        license: 'us-gov-public-domain',
        affiliation: opts.affiliation ?? 'official-nonpartisan',
      },
    ],
    revision: 1,
    provenance: { parser: 'fake_fr@0.1.0', confidence: 'high' },
  })
}

/** The body a fake endpoint serves. */
export function docsBody(docs: FakeDoc[]): string {
  return JSON.stringify({ count: docs.length, results: docs })
}

export interface FakeSource {
  def: SourceDefinition
  parseCalls: () => number
}

/** A SourceDefinition whose parse() is a real (if tiny) adapter over docsBody(); `throws` makes it throw instead. */
export function fakeSource(
  source_id: string,
  endpoints: Endpoint[],
  opts: {
    throws?: boolean
    /** parse() recognises an error page and reports health 'error' (a 200 with an error body). */
    reportsError?: boolean
    affiliation?: Affiliation
    freshness_slo_s?: number
    rate_budget_per_h?: number
    cadence_s?: number
  } = {},
): FakeSource {
  let calls = 0
  const affiliation = opts.affiliation ?? 'official-nonpartisan'
  const def: SourceDefinition = {
    source_id,
    name: `Fake ${source_id}`,
    affiliation,
    license: 'us-gov-public-domain',
    features: ['F10'],
    endpoints,
    cadence: { business_s: opts.cadence_s ?? 60, off_s: opts.cadence_s ?? 60 },
    freshness_slo_s: opts.freshness_slo_s ?? 120,
    rate_budget_per_h: opts.rate_budget_per_h ?? 120,
    parse(endpointId: string, res: FetchedResponse): AdapterOutput {
      calls++
      if (opts.throws) throw new Error('Unexpected token < in JSON at position 0')
      if (opts.reportsError) {
        const detail = 'HTML error page instead of JSON'
        return { events: [], health: { source_id, endpoint: endpointId, status: 'error', detail, items_seen: 0 } }
      }
      const data = JSON.parse(res.body) as { results?: FakeDoc[] }
      if (!Array.isArray(data.results)) {
        return { events: [], health: { source_id, endpoint: endpointId, status: 'drift', detail: 'no results array', items_seen: 0 } }
      }
      const events = data.results.map((d) => docEvent(d, Date.parse(res.fetchedAt), { source_id, affiliation }))
      return {
        events,
        health: {
          source_id,
          endpoint: endpointId,
          status: events.length ? 'ok' : 'empty',
          detail: `${events.length} documents`,
          items_seen: events.length,
        },
      }
    },
  }
  return { def, parseCalls: () => calls }
}

export interface Call {
  url: string
  headers: Record<string, string>
  cache: string | undefined
}

/** A fetch that answers from a script, one entry per call, and records each request. */
export function scriptedFetch(script: Array<(call: Call) => Response | Promise<Response>>) {
  const calls: Call[] = []
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v
    })
    const call = { url, headers, cache: init.cache }
    calls.push(call)
    const next = script[calls.length - 1]
    if (!next) throw new Error(`unexpected request #${calls.length}: ${url}`)
    return next(call)
  }
  return { fetch, calls }
}

/** A fresh, isolated HubDO for one test. */
export function freshHub(): DurableObjectStub<HubDO> {
  return env.HUB.getByName(`test-${crypto.randomUUID()}`)
}

/** Record an accepted-looking payload for `events` as if a poll of `endpoint_id` returned them at `atMs`.
 * `affiliation` is the polled source's REGISTERED affiliation (SourceDefinition.affiliation). */
export function ingest(
  hub: DurableObjectStub<HubDO>,
  source_id: string,
  events: unknown[],
  atMs: number,
  endpoint_id = 'pi',
  affiliation: Affiliation = 'official-nonpartisan',
): Promise<PollResult> {
  return hub.recordPoll({
    source_id,
    affiliation,
    endpoint_id,
    started_ms: atMs,
    finished_ms: atMs,
    jitter: 0.5,
    outcome: {
      kind: 'parsed',
      output: {
        events: events as CedEvent[],
        health: { source_id, endpoint: endpoint_id, status: 'ok', detail: `${events.length} documents`, items_seen: events.length },
      },
      etag: null,
      last_modified: null,
      body_hash: `hash-${atMs}`,
    },
  })
}

/** GET /api/v1/events through the hub directly; fails the test on a 400-style answer. */
export async function page(
  hub: DurableObjectStub<HubDO>,
  since: string | null,
  limit = 100,
  nowMs = T0,
): Promise<EventsResponse> {
  const a = await hub.events({ since, limit, now_ms: nowMs })
  if (!a.ok) throw new Error(`events refused: ${a.error}`)
  return JSON.parse(a.json) as EventsResponse
}

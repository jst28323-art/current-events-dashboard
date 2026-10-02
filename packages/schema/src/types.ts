// TypeScript shape of one event (docs/EVENT_MODEL.md v0.1). The JSON Schema next to this file
// (event.schema.json) is the machine contract; tests/types.test.ts pins that the two agree on the
// required fields and enums, so a change to one without the other fails the gate.

export type Utc = string // "2026-10-02T15:15:00Z": UTC, always Z (docs/TRAPS.md: time zones lie)

export type EventStatus =
  | 'scheduled' | 'live' | 'ended' | 'postponed' | 'cancelled' | 'rescheduled' | 'corrected' | 'retracted' | 'published'

export type Branch = 'legislative' | 'executive' | 'judicial' | 'independent' | 'nongov'

export type Affiliation =
  | 'official-nonpartisan' | 'official-partisan' | 'executive-messaging' | 'independent' | 'third-party' | 'unofficial'

export type Tier = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type FeatureId = `F${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`

export interface EventTimes {
  /** When it happened in the world; null when the source gives no trustworthy time (never guessed). */
  occurred_at: Utc | null
  scheduled_for?: Utc | null
  /** What the source claims (often a last-edit time: docs/TRAPS.md). */
  source_published_at?: Utc | null
  /** When our poller first saw it: the latency ledger's anchor. */
  first_seen_at: Utc
  broadcast_at?: Utc | null
}

export interface EventSource {
  source_id: string // a docs/SOURCES.md row id, e.g. "fr.api"
  url: string // https only: every event links its primary source
  retrieved_at: Utc
  license?: string
  affiliation: Affiliation
}

export interface CedEvent {
  schema_version: '0.1'
  id: string // "evt_" + 16 hex (eventId())
  dedup_key: string // object_key + "#" + transition
  object_key: string
  thread_key?: string
  alias_keys?: string[]
  event_type: string // the v0.1 taxonomy; the JSON Schema holds the allowed list
  status: EventStatus
  branch: Branch
  body: string // senate | house | white_house | scotus | fed | sec | federal_register | agency:<fr-slug>
  features: FeatureId[]
  title: string
  official_text: string
  importance?: { tier: Tier; reasons: string[] }
  times: EventTimes
  actors?: Array<{ role: string; id?: string; name: string; id_confidence?: 'authority' | 'curated' | 'inferred' }>
  related?: Array<{ rel: string; key: string }>
  result?: Record<string, unknown>
  member_votes_ref?: string
  media?: Array<{ kind: 'video_live' | 'video_archive' | 'audio' | 'pdf' | 'html'; url: string; is_live?: boolean; provider?: string }>
  transcript?: Record<string, unknown> | null
  sources: EventSource[]
  revision: number
  supersedes?: string | null
  provenance: { parser: string; confidence: 'high' | 'inferred' }
}

/** The fields an adapter fills; eventId() derives `id`, and finalizeEvent() adds schema_version. */
export type EventDraft = Omit<CedEvent, 'id' | 'schema_version'>

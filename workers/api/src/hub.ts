// HubDO: the one SQLite-backed Durable Object (instance name "hub") that owns all state (docs/ARCHITECTURE.md):
// the event store (dedupe/merge by dedup_key, revisions, a change sequence that is the API cursor), the latency ledger,
// and the per-endpoint poll state (validators, health, error streak, backoff). Every method takes the caller's clock
// (`*_ms`), so tests drive time; nothing here reads Date.now().
//
// Fail closed: every incoming event is validated (validateEvent) before anything is written; if ANY event of a payload
// is invalid, cites a source other than the polled one, claims an affiliation other than the registered one, or repeats
// a dedup_key, nothing from that payload is stored and the endpoint's health becomes `drift` with the reasons.
// Every upstream request is counted by claim() BEFORE it is sent (cadence + hourly budget), so a failure to record its
// result never turns into unthrottled polling.
// Storage writes for one poll (events, ledger, validators, health) commit in ONE transaction, so validators never move
// ahead of the events they vouch for.
import { DurableObject } from 'cloudflare:workers'
import {
  validateEvent,
  type Affiliation,
  type CedEvent,
  type FeatureId,
  type HealthStatus,
  type SourceStatus,
  type StatusResponse,
} from '@ced/schema'
import type { AdapterOutput } from '@ced/adapters'
import { mergeEvent } from './merge.js'
import { DRIFT_RETRIES_BEFORE_BACKOFF, backoffMs } from './policy.js'

/** The static part of a SourceDefinition plus the cadence in force now (see policy.describeSources). */
export interface SourceInfo {
  source_id: string
  name: string
  affiliation: Affiliation
  features: FeatureId[]
  cadence_s: number
  freshness_slo_s: number
  endpoint_ids: string[]
}

export type EndpointState = {
  source_id: string
  endpoint_id: string
  etag: string | null
  last_modified: string | null
  /** The key of the last ACCEPTED body: its sha-256 hex, tagged `@<code version>` when known (policy.bodyKey). A
   * drifting body is never remembered, so it is re-parsed next time. */
  body_hash: string | null
  /** Set by claim() BEFORE each request is sent, so cadence holds even if recording the result fails. */
  last_attempt_ms: number | null
  last_success_ms: number | null
  last_change_ms: number | null
  /** 'never_polled' only between the first claim() and the first recorded result. */
  health: HealthStatus | 'never_polled'
  detail: string
  /** Consecutive failed polls (error or drift); 0 after any success. */
  error_streak: number
  backoff_until_ms: number | null
}

export interface PollPlan {
  states: EndpointState[]
  /** Requests each source has made in the current clock hour (the budget window). */
  requests_this_hour: Record<string, number>
}

/** What one poll of one endpoint came to, as the cron isolate saw it. */
export type PollOutcome =
  /** 304, or a 2xx whose body key equals the last accepted body's: nothing was parsed. In the second case
   * `validators` carries that response's ETag / Last-Modified (they vouch for a body already accepted, so they are
   * stored: a site-wide ETag that moved with no new item must not cost a full download every poll). */
  | {
      kind: 'not_modified'
      detail: string
      validators?: { etag: string | null; last_modified: string | null; body_hash: string }
    }
  /** HTTP error status or network failure / timeout: backoff applies. */
  | { kind: 'error'; detail: string; retry_after_s: number | null }
  /** The adapter threw: the body is not the shape we recorded. */
  | { kind: 'drift'; detail: string }
  /** The adapter returned. Validators are stored only if the payload is accepted. */
  | { kind: 'parsed'; output: AdapterOutput; etag: string | null; last_modified: string | null; body_hash: string }

export interface PollRecord {
  source_id: string
  /** The polled source's REGISTERED affiliation (SourceDefinition.affiliation), never the payload's own claim. */
  affiliation: Affiliation
  endpoint_id: string
  started_ms: number
  finished_ms: number
  /** A random number in [0, 1) for the backoff jitter (injected so tests are deterministic). */
  jitter: number
  outcome: PollOutcome
}

export interface PollResult {
  health: HealthStatus
  detail: string
  inserted: number
  revised: number
  merged: number
  unchanged: number
  error_streak: number
  backoff_until_ms: number | null
}

export interface EventsQuery {
  since: string | null
  limit: number
  now_ms: number
}

/**
 * Events cross RPC as the JSON text they are stored as, never as objects: the HTTP layer sends that text as is (no
 * parse and re-serialize), and CedEvent's `Record<string, unknown>` fields make Workers RPC type an object result as
 * `never` (unknown is not provably structured-cloneable).
 * `json` is the EventsResponse body, ready to send.
 */
export type EventsAnswer = { ok: true; json: string } | { ok: false; error: string }

/** One stored revision (current or superseded) of an event; `json` is the CedEvent as stored. */
export type RevisionRow = {
  id: string
  revision: number
  current: boolean
  json: string
}

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Ledger rows older than this are pruned (status needs 24 h; the rest is slack). */
const LEDGER_KEEP_MS = 7 * DAY_MS
/** /api/v1/status recomputes the 24-h ledger aggregates at most this often unless a poll changes the ledger. */
const LEDGER_CACHE_MS = 60_000

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  // The latest revision of each event. seq = the change sequence (bumped on insert, merge and revision).
  `CREATE TABLE IF NOT EXISTS events (
     dedup_key TEXT PRIMARY KEY,
     id TEXT NOT NULL,
     revision INTEGER NOT NULL,
     sort_ms INTEGER NOT NULL,
     seq INTEGER NOT NULL UNIQUE,
     json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS events_by_sort ON events (sort_ms DESC, id DESC)`,
  // Superseded revisions, never deleted (EVENT_MODEL principle 2: append-only).
  `CREATE TABLE IF NOT EXISTS event_history (
     id TEXT PRIMARY KEY,
     dedup_key TEXT NOT NULL,
     revision INTEGER NOT NULL,
     superseded_ms INTEGER NOT NULL,
     json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS history_by_key ON event_history (dedup_key, revision)`,
  // Latency ledger: one row per (event, source) at that source's first sighting.
  `CREATE TABLE IF NOT EXISTS ledger (
     dedup_key TEXT NOT NULL,
     source_id TEXT NOT NULL,
     first_seen_ms INTEGER NOT NULL,
     latency_s REAL,
     backfill INTEGER NOT NULL,
     PRIMARY KEY (dedup_key, source_id))`,
  `CREATE INDEX IF NOT EXISTS ledger_by_source ON ledger (source_id, first_seen_ms)`,
  `CREATE TABLE IF NOT EXISTS source_state (
     source_id TEXT NOT NULL,
     endpoint_id TEXT NOT NULL,
     etag TEXT,
     last_modified TEXT,
     body_hash TEXT,
     last_attempt_ms INTEGER,
     last_success_ms INTEGER,
     last_change_ms INTEGER,
     health TEXT NOT NULL,
     detail TEXT NOT NULL,
     error_streak INTEGER NOT NULL,
     backoff_until_ms INTEGER,
     PRIMARY KEY (source_id, endpoint_id))`,
  // Per-source request budget (SourceDefinition.rate_budget_per_h), counted per UTC clock hour. Clock-aligned so a
  // once-a-minute cron fits exactly 60 polls in a window (a window opened at the first request would catch a 61st).
  `CREATE TABLE IF NOT EXISTS budget (source_id TEXT PRIMARY KEY, window_start_ms INTEGER NOT NULL, count INTEGER NOT NULL)`,
]

const CURSOR_RE = /^([0-9a-f]{8})\.(0|[1-9][0-9]{0,14})$/

/** Worst first: the status of a multi-endpoint source is its worst endpoint's. */
const SEVERITY: Array<SourceStatus['health']> = ['drift', 'error', 'never_polled', 'ok', 'empty', 'not_modified']

const iso = (ms: number) => new Date(ms).toISOString()
const hourOf = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS

/** The API's order key (packages/schema api.ts EventsResponse): occurred_at, else source_published_at when it is not
 * later than our first sighting (a White House executive-order post has no signing time, only its posting time; a
 * "posted" time after we had already seen the item cannot be its posting time), else first_seen_at. The web app sorts
 * with the same rule (apps/web/src/lib/time.ts). */
export function sortKeyMs(e: { times: { occurred_at: string | null; source_published_at?: string | null; first_seen_at: string } }): number {
  if (e.times.occurred_at) return Date.parse(e.times.occurred_at)
  const seen = Date.parse(e.times.first_seen_at)
  const posted = e.times.source_published_at ? Date.parse(e.times.source_published_at) : NaN
  return !Number.isNaN(posted) && posted <= seen ? posted : seen
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** The EventsResponse body built from stored event JSON (no parse / re-serialize). */
function eventsBody(generated_at: string, cursor: string, events: string[], has_more: boolean): string {
  const head = `{"generated_at":${JSON.stringify(generated_at)},"cursor":${JSON.stringify(cursor)}`
  return `${head},"events":[${events.join(',')}],"has_more":${has_more}}`
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Validation plus the payload-level rules. Returns the problems (empty = accept).
 * - An adapter speaks only for itself: every sources[] entry is the polled source, with its REGISTERED affiliation.
 *   Cross-source provenance is built only by the merge, so a payload can never borrow another source's authority
 *   (listing the official owner's entry, or labelling itself official) to change facts or pose as the owner.
 * - A dedup_key appears at most once per payload (two copies with different facts would revise on every re-parse).
 */
export function checkPayload(sourceId: string, affiliation: Affiliation, events: unknown[]): string[] {
  const problems: string[] = []
  const firstIndex = new Map<string, number>()
  events.forEach((ev, i) => {
    const r = validateEvent(ev)
    const key = (ev as { dedup_key?: unknown } | null)?.dedup_key
    const label = `events[${i}]${typeof key === 'string' ? ` (${key})` : ''}`
    for (const e of r.errors) problems.push(`${label} ${e}`)
    if (!r.valid) return
    const e = ev as CedEvent
    if (!e.sources.some((s) => s.source_id === sourceId)) problems.push(`${label} does not cite source ${sourceId}`)
    e.sources.forEach((s, j) => {
      if (s.source_id !== sourceId) {
        problems.push(`${label} sources[${j}] cites ${s.source_id}: an adapter may cite only its own source ${sourceId}`)
      } else if (s.affiliation !== affiliation) {
        problems.push(`${label} sources[${j}] claims affiliation ${s.affiliation}, but ${sourceId} is registered as ${affiliation}`)
      }
    })
    const seen = firstIndex.get(e.dedup_key)
    if (seen != null) problems.push(`${label} repeats events[${seen}] (one dedup_key per payload)`)
    else firstIndex.set(e.dedup_key, i)
  })
  return problems
}

interface Verdict {
  health: HealthStatus
  detail: string
  success: boolean
  /** 'error': exponential backoff from the first failure; 'drift': only after DRIFT_RETRIES_BEFORE_BACKOFF in a row. */
  backoff: 'error' | 'drift' | null
  retry_after_s: number | null
  events: CedEvent[] | null
  validators: { etag: string | null; last_modified: string | null; body_hash: string } | null
}

export class HubDO extends DurableObject<Env> {
  private readonly sql: SqlStorage
  private readonly epoch: string
  private seq: number
  private newestCache: { seq: number; limit: number; json: string[] } | null = null
  private ledgerCache = new Map<string, { at_ms: number; items_24h: number; median_latency_s: number | null }>()
  private lastPruneMs = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    for (const stmt of SCHEMA) this.sql.exec(stmt)
    let epoch = this.meta('epoch')
    if (epoch == null) {
      epoch = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('epoch', ?)`, epoch)
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('seq', '0')`)
    }
    this.epoch = epoch
    this.seq = this.readSeq()
  }

  // ---- poll loop side -------------------------------------------------------------------------------------------

  /** Everything the cron isolate needs to decide what to fetch and with which validators: one read per cron run. */
  async plan(nowMs: number): Promise<PollPlan> {
    const states = this.sql.exec<EndpointState>(`SELECT * FROM source_state`).toArray()
    const requests_this_hour: Record<string, number> = {}
    for (const b of this.sql.exec<{ source_id: string; window_start_ms: number; count: number }>(`SELECT * FROM budget`)) {
      requests_this_hour[b.source_id] = b.window_start_ms === hourOf(nowMs) ? b.count : 0
    }
    return { states, requests_this_hour }
  }

  /**
   * Count a request BEFORE it is sent: the attempt time (cadence) and the hourly budget, in one transaction. The poll
   * loop sends nothing this did not count, so a store that cannot record results never turns into one upstream request
   * per endpoint per minute (and a store that is down entirely means no requests at all).
   */
  async claim(sourceId: string, endpointId: string, atMs: number): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.countRequest(sourceId, atMs)
      this.sql.exec(
        `INSERT INTO source_state (source_id, endpoint_id, last_attempt_ms, health, detail, error_streak)
         VALUES (?, ?, ?, 'never_polled', 'first poll in progress', 0)
         ON CONFLICT (source_id, endpoint_id) DO UPDATE SET last_attempt_ms = excluded.last_attempt_ms`,
        sourceId,
        endpointId,
        atMs,
      )
    })
  }

  /** Record one poll: health, validators, error streak/backoff, and (for an accepted payload) its events. The request
   * itself was already counted by claim(). */
  async recordPoll(rec: PollRecord): Promise<PollResult> {
    const prev = this.readState(rec.source_id, rec.endpoint_id)
    const verdict = this.judge(rec, prev)
    try {
      return this.ctx.storage.transactionSync(() => this.apply(rec, prev, verdict))
    } catch (e) {
      // The store refused something mid-payload (the transaction rolled back): record drift, store nothing.
      this.seq = this.readSeq()
      this.newestCache = null
      const refused: Verdict = {
        ...verdict,
        health: 'drift',
        detail: `nothing stored from this payload: ${message(e)}`,
        success: false,
        backoff: 'drift',
        events: null,
        validators: null,
      }
      return this.ctx.storage.transactionSync(() => this.apply(rec, prev, refused))
    }
  }

  private judge(rec: PollRecord, prev: EndpointState): Verdict {
    const o = rec.outcome
    const base = { retry_after_s: null, events: null, validators: null, backoff: null }
    switch (o.kind) {
      case 'not_modified': {
        // Fresh validators are kept only when they come with the very body this endpoint last accepted.
        const v = o.validators
        const validators = v && prev.body_hash != null && v.body_hash === prev.body_hash ? v : null
        return { ...base, health: 'not_modified', detail: o.detail, success: true, validators }
      }
      case 'error':
        return { ...base, health: 'error', detail: o.detail, success: false, backoff: 'error', retry_after_s: o.retry_after_s }
      case 'drift':
        return { ...base, health: 'drift', detail: o.detail, success: false, backoff: 'drift' }
      case 'parsed': {
        const drift = (detail: string): Verdict => ({ ...base, health: 'drift', detail, success: false, backoff: 'drift' })
        const h = (o.output as Partial<AdapterOutput> | null)?.health
        if (!h || typeof h.status !== 'string') return drift('adapter returned no health signal')
        if (h.status === 'error') {
          // An error page posing as data (HealthStatus 'error'): the same class as an HTTP error, so it backs off.
          return { ...base, health: 'error', detail: h.detail || 'adapter reported error', success: false, backoff: 'error' }
        }
        if (h.status === 'drift') return drift(h.detail || 'adapter reported drift')
        if (h.status !== 'ok' && h.status !== 'empty' && h.status !== 'not_modified') {
          return drift(`adapter reported an unknown health "${String(h.status)}"`)
        }
        const events = Array.isArray(o.output.events) ? o.output.events : null
        if (events == null) return drift('adapter returned no events array')
        const problems = checkPayload(rec.source_id, rec.affiliation, events)
        if (problems.length > 0) {
          const shown = problems.slice(0, 3).join('; ')
          const more = problems.length > 3 ? ` (+${problems.length - 3} more)` : ''
          return drift(`invalid events, nothing stored from this payload: ${shown}${more}`)
        }
        return {
          ...base,
          health: h.status,
          detail: typeof h.detail === 'string' ? h.detail : '',
          success: true,
          events,
          validators: { etag: o.etag, last_modified: o.last_modified, body_hash: o.body_hash },
        }
      }
    }
  }

  private apply(rec: PollRecord, prev: EndpointState, v: Verdict): PollResult {
    const counts = { inserted: 0, revised: 0, merged: 0, unchanged: 0 }
    const seqBefore = this.seq
    if (v.events && v.events.length > 0) {
      // The endpoint's first accepted payload is a backfill: its first_seen_at is our start-up time, not detection.
      const backfill = prev.last_success_ms == null
      for (const ev of v.events) this.storeOne(ev, rec.source_id, backfill, rec.finished_ms, counts)
      this.ledgerCache.clear()
      if (rec.finished_ms - this.lastPruneMs > HOUR_MS) {
        this.sql.exec(`DELETE FROM ledger WHERE first_seen_ms < ?`, rec.finished_ms - LEDGER_KEEP_MS)
        this.lastPruneMs = rec.finished_ms
      }
    }
    if (this.seq !== seqBefore) this.sql.exec(`UPDATE meta SET v = ? WHERE k = 'seq'`, String(this.seq))
    const error_streak = v.success ? 0 : prev.error_streak + 1
    let backoff_until_ms: number | null = null
    if (v.backoff === 'error') {
      backoff_until_ms = rec.finished_ms + backoffMs(error_streak, rec.jitter, v.retry_after_s)
    } else if (v.backoff === 'drift' && error_streak > DRIFT_RETRIES_BEFORE_BACKOFF) {
      backoff_until_ms = rec.finished_ms + backoffMs(error_streak - DRIFT_RETRIES_BEFORE_BACKOFF, rec.jitter, null)
    }
    const next: EndpointState = {
      ...prev,
      etag: v.validators ? v.validators.etag : prev.etag,
      last_modified: v.validators ? v.validators.last_modified : prev.last_modified,
      body_hash: v.validators ? v.validators.body_hash : prev.body_hash,
      last_attempt_ms: rec.started_ms,
      last_success_ms: v.success ? rec.finished_ms : prev.last_success_ms,
      last_change_ms: this.seq !== seqBefore ? rec.finished_ms : prev.last_change_ms,
      health: v.health,
      detail: v.detail,
      error_streak,
      backoff_until_ms,
    }
    this.sql.exec(
      `INSERT OR REPLACE INTO source_state (source_id, endpoint_id, etag, last_modified, body_hash, last_attempt_ms,
         last_success_ms, last_change_ms, health, detail, error_streak, backoff_until_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      next.source_id, next.endpoint_id, next.etag, next.last_modified, next.body_hash, next.last_attempt_ms,
      next.last_success_ms, next.last_change_ms, next.health, next.detail, next.error_streak, next.backoff_until_ms,
    )
    return { health: v.health, detail: v.detail, ...counts, error_streak, backoff_until_ms }
  }

  private storeOne(
    ev: CedEvent,
    sourceId: string,
    backfill: boolean,
    atMs: number,
    counts: { inserted: number; revised: number; merged: number; unchanged: number },
  ): void {
    const row = this.sql.exec<{ json: string }>(`SELECT json FROM events WHERE dedup_key = ?`, ev.dedup_key).toArray()[0]
    let toStore: CedEvent | null = null
    if (!row) {
      toStore = ev
      counts.inserted++
    } else {
      const stored = JSON.parse(row.json) as CedEvent
      const m = mergeEvent(stored, ev)
      if (m.kind === 'unchanged') counts.unchanged++
      else {
        const check = validateEvent(m.event)
        if (!check.valid) throw new Error(`merging ${ev.dedup_key} gave an invalid event: ${check.errors.slice(0, 2).join('; ')}`)
        if (m.kind === 'revised') {
          this.sql.exec(
            `INSERT INTO event_history (id, dedup_key, revision, superseded_ms, json) VALUES (?, ?, ?, ?, ?)`,
            stored.id, stored.dedup_key, stored.revision, atMs, row.json,
          )
          counts.revised++
        } else counts.merged++
        toStore = m.event
      }
    }
    if (toStore) {
      this.seq += 1
      const sortMs = sortKeyMs(toStore)
      this.sql.exec(
        `INSERT INTO events (dedup_key, id, revision, sort_ms, seq, json) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (dedup_key) DO UPDATE SET id = excluded.id, revision = excluded.revision,
           sort_ms = excluded.sort_ms, seq = excluded.seq, json = excluded.json`,
        toStore.dedup_key, toStore.id, toStore.revision, sortMs, this.seq, JSON.stringify(toStore),
      )
    }
    // Latency ledger: this source's first sighting of this event (later sightings are ignored).
    const firstSeenMs = Date.parse(ev.times.first_seen_at)
    const occurredMs = ev.times.occurred_at == null ? null : Date.parse(ev.times.occurred_at)
    this.sql.exec(
      `INSERT OR IGNORE INTO ledger (dedup_key, source_id, first_seen_ms, latency_s, backfill) VALUES (?, ?, ?, ?, ?)`,
      ev.dedup_key, sourceId, firstSeenMs, occurredMs == null ? null : (firstSeenMs - occurredMs) / 1000, backfill ? 1 : 0,
    )
  }

  private countRequest(sourceId: string, atMs: number): void {
    const b = this.sql
      .exec<{ window_start_ms: number; count: number }>(`SELECT window_start_ms, count FROM budget WHERE source_id = ?`, sourceId)
      .toArray()[0]
    if (!b || b.window_start_ms !== hourOf(atMs)) {
      this.sql.exec(`INSERT OR REPLACE INTO budget (source_id, window_start_ms, count) VALUES (?, ?, 1)`, sourceId, hourOf(atMs))
    } else {
      this.sql.exec(`UPDATE budget SET count = count + 1 WHERE source_id = ?`, sourceId)
    }
  }

  private readState(sourceId: string, endpointId: string): EndpointState {
    const row = this.sql
      .exec<EndpointState>(`SELECT * FROM source_state WHERE source_id = ? AND endpoint_id = ?`, sourceId, endpointId)
      .toArray()[0]
    return (
      row ?? {
        source_id: sourceId,
        endpoint_id: endpointId,
        etag: null,
        last_modified: null,
        body_hash: null,
        last_attempt_ms: null,
        last_success_ms: null,
        last_change_ms: null,
        health: 'empty',
        detail: '',
        error_streak: 0,
        backoff_until_ms: null,
      }
    )
  }

  private meta(k: string): string | null {
    const row = this.sql.exec<{ v: string }>(`SELECT v FROM meta WHERE k = ?`, k).toArray()[0]
    return row ? row.v : null
  }

  private readSeq(): number {
    return Number(this.meta('seq') ?? '0')
  }

  // ---- read API side ------------------------------------------------------------------------------------------------

  private cursor(seq: number): string {
    return `${this.epoch}.${seq}`
  }

  /** The seq a cursor names, or null when this hub never issued it (malformed, another hub's epoch, or ahead of us). */
  private parseCursor(c: string): number | null {
    const m = CURSOR_RE.exec(c)
    if (!m || m[1] !== this.epoch) return null
    const seq = Number(m[2])
    return seq <= this.seq ? seq : null
  }

  /** Newest first by sortKeyMs (packages/schema api.ts), ties by id, as stored JSON; cached until the next change. */
  private newest(limit: number): string[] {
    const c = this.newestCache
    if (c && c.seq === this.seq && c.limit >= limit) return c.json.slice(0, limit)
    const json = this.sql
      .exec<{ json: string }>(`SELECT json FROM events ORDER BY sort_ms DESC, id DESC LIMIT ?`, limit)
      .toArray()
      .map((r) => r.json)
    this.newestCache = { seq: this.seq, limit, json }
    return json
  }

  /** GET /api/v1/events (EventsResponse docs). `limit` is already bounded by the HTTP layer. */
  async events(q: EventsQuery): Promise<EventsAnswer> {
    const generated_at = iso(q.now_ms)
    if (q.since == null) {
      // A snapshot of the newest events; the cursor is "now", so polling with it returns only later changes.
      return { ok: true, json: eventsBody(generated_at, this.cursor(this.seq), this.newest(q.limit), false) }
    }
    const since = this.parseCursor(q.since)
    if (since == null) {
      return { ok: false, error: 'since is not a cursor this API issued; call again without since to start over' }
    }
    const rows = this.sql
      .exec<{ seq: number; json: string }>(`SELECT seq, json FROM events WHERE seq > ? ORDER BY seq LIMIT ?`, since, q.limit + 1)
      .toArray()
    const page = rows.slice(0, q.limit)
    const last = page[page.length - 1]
    const cursor = this.cursor(last ? last.seq : since)
    return { ok: true, json: eventsBody(generated_at, cursor, page.map((r) => r.json), rows.length > q.limit) }
  }

  /** The newest `n` events as stored JSON, for /feed.json. */
  async recent(n: number): Promise<string[]> {
    return this.newest(n)
  }

  /** Every stored revision of one event, oldest first (the current one last). */
  async history(dedupKey: string): Promise<RevisionRow[]> {
    type Row = { id: string; revision: number; json: string }
    const old = this.sql
      .exec<Row>(`SELECT id, revision, json FROM event_history WHERE dedup_key = ? ORDER BY revision`, dedupKey)
      .toArray()
      .map((r) => ({ id: r.id, revision: r.revision, current: false, json: r.json }))
    const cur = this.sql
      .exec<Row>(`SELECT id, revision, json FROM events WHERE dedup_key = ?`, dedupKey)
      .toArray()
      .map((r) => ({ id: r.id, revision: r.revision, current: true, json: r.json }))
    return [...old, ...cur]
  }

  private ledgerStats(sourceId: string, nowMs: number): { items_24h: number; median_latency_s: number | null } {
    const c = this.ledgerCache.get(sourceId)
    if (c && nowMs >= c.at_ms && nowMs - c.at_ms < LEDGER_CACHE_MS) return c
    const rows = this.sql
      .exec<{ latency_s: number | null; backfill: number }>(
        `SELECT latency_s, backfill FROM ledger WHERE source_id = ? AND first_seen_ms > ?`,
        sourceId,
        nowMs - DAY_MS,
      )
      .toArray()
    // A negative latency (occurred_at after our first sighting: a scheduled or mis-stamped source time) is not a
    // detection latency; it stays in the ledger as raw data but never enters the published median (it would understate).
    const latencies = rows
      .filter((r) => r.backfill === 0 && r.latency_s != null && r.latency_s >= 0)
      .map((r) => r.latency_s as number)
    const stats = { at_ms: nowMs, items_24h: rows.length, median_latency_s: median(latencies) }
    this.ledgerCache.set(sourceId, stats)
    return stats
  }

  /** GET /api/v1/status: one row per registered source; staleness computed at nowMs. */
  async status(nowMs: number, sources: SourceInfo[]): Promise<StatusResponse> {
    const byKey = new Map<string, EndpointState>()
    for (const s of this.sql.exec<EndpointState>(`SELECT * FROM source_state`)) byKey.set(`${s.source_id} ${s.endpoint_id}`, s)
    return {
      generated_at: iso(nowMs),
      sources: sources.map((info) => this.sourceStatus(info, byKey, nowMs)),
    }
  }

  private sourceStatus(info: SourceInfo, byKey: Map<string, EndpointState>, nowMs: number): SourceStatus {
    const eps = info.endpoint_ids.map((id) => ({ id, s: byKey.get(`${info.source_id} ${id}`) ?? null }))
    const polled = eps.flatMap((e) => (e.s ? [e.s] : []))
    const maxOf = (xs: Array<number | null>) => {
      const v = xs.filter((x): x is number => x != null)
      return v.length ? Math.max(...v) : null
    }
    // The source is only as fresh as its stalest endpoint: one endpoint that never succeeded makes it never-succeeded.
    const successes = eps.map((e) => e.s?.last_success_ms ?? null)
    const lastSuccess = eps.length > 0 && successes.every((x) => x != null) ? Math.min(...(successes as number[])) : null
    let worst: { id: string; health: SourceStatus['health']; detail: string } | null = null
    for (const e of eps) {
      const health: SourceStatus['health'] = e.s ? e.s.health : 'never_polled'
      if (!worst || SEVERITY.indexOf(health) < SEVERITY.indexOf(worst.health)) {
        worst = { id: e.id, health, detail: e.s ? e.s.detail : 'not polled yet' }
      }
    }
    const health = worst ? worst.health : 'never_polled'
    const detail = worst ? (eps.length > 1 ? `${worst.id}: ${worst.detail}` : worst.detail) : 'no endpoints'
    const ledger = this.ledgerStats(info.source_id, nowMs)
    const lastAttempt = maxOf(polled.map((s) => s.last_attempt_ms))
    const lastChange = maxOf(polled.map((s) => s.last_change_ms))
    return {
      source_id: info.source_id,
      name: info.name,
      affiliation: info.affiliation,
      features: info.features,
      cadence_s: info.cadence_s,
      freshness_slo_s: info.freshness_slo_s,
      last_attempt_at: lastAttempt == null ? null : iso(lastAttempt),
      last_success_at: lastSuccess == null ? null : iso(lastSuccess),
      last_change_at: lastChange == null ? null : iso(lastChange),
      health,
      detail,
      error_streak: Math.max(0, ...polled.map((s) => s.error_streak)),
      items_24h: ledger.items_24h,
      median_latency_s: ledger.median_latency_s,
      stale: lastSuccess == null || nowMs - lastSuccess > info.freshness_slo_s * 1000,
    }
  }
}

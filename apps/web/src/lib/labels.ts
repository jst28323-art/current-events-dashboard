// Origin chips (D-009: neutral gray chips with words, never party colors) and the per-source health chip.
import type { Affiliation, CedEvent, EventStatus, SourceStatus, Tier } from '@ced/schema'
import { parseUtc } from './time.js'

export const ORIGIN_LABEL: Record<Affiliation, string> = {
  'official-nonpartisan': 'official',
  'executive-messaging': 'White House',
  'official-partisan': 'partisan',
  'third-party': 'third-party',
  unofficial: 'unofficial',
  independent: 'independent',
}

/** Shown when the affiliation is not one the event model defines: never fall back to "official". */
export const UNKNOWN_ORIGIN = 'origin unknown'

/** The origin chips of a row: the primary source's affiliation, plus "inferred" unless confidence is exactly "high". */
export function originChips(e: Pick<CedEvent, 'sources' | 'provenance'>): string[] {
  const aff = e.sources[0]?.affiliation
  const chips = [aff !== undefined && Object.hasOwn(ORIGIN_LABEL, aff) ? ORIGIN_LABEL[aff] : UNKNOWN_ORIGIN]
  if (e.provenance?.confidence !== 'high') chips.push('inferred')
  return chips
}

/** The status chip words; "ended" and "published" are the quiet default and get none. */
const STATUS_CHIP: Partial<Record<EventStatus, string>> = {
  live: 'LIVE',
  scheduled: 'scheduled',
  postponed: 'postponed',
  cancelled: 'cancelled',
  rescheduled: 'rescheduled',
  corrected: 'corrected',
  retracted: 'retracted',
}

/**
 * The status chip of a row, or null. Own keys only: the guard admits any status string, and a plain lookup of
 * "constructor" or "toString" would return an inherited function and render an empty chip.
 */
export function statusChip(status: string): string | null {
  return Object.hasOwn(STATUS_CHIP, status) ? (STATUS_CHIP[status as EventStatus] ?? null) : null
}

/** The note above the rows when malformed events were dropped. */
export function skippedNote(n: number): string {
  return n === 1 ? '1 item was skipped because the API sent it malformed.' : `${n} items were skipped because the API sent them malformed.`
}

export type Emphasis = 'major' | 'normal' | 'minor'

/** P0/P1 emphasized, P3/P4 lighter, P2 (or no tier) normal. Tiers never hide anything (D-019). */
export function emphasis(tier: Tier | undefined): Emphasis {
  if (tier === 'P0' || tier === 'P1') return 'major'
  if (tier === 'P3' || tier === 'P4') return 'minor'
  return 'normal'
}

export type HealthLabel = 'ok' | 'stale' | 'error' | 'not polled yet'

/**
 * Stale by the server's flag OR by the client clock: no successful poll ever, or the last success is older than the
 * source's freshness SLO (2x cadence, Phase 1 exit criterion 4). The client check matters when the status itself is
 * frozen (a cached or stuck API keeps saying stale: false).
 */
export function isStale(s: SourceStatus, nowMs: number): boolean {
  if (s.stale) return true
  const last = parseUtc(s.last_success_at)
  if (last === null) return true
  if (!(s.freshness_slo_s > 0)) return true
  return nowMs - last > s.freshness_slo_s * 1000
}

export function healthLabel(s: SourceStatus, nowMs: number): HealthLabel {
  if (s.health === 'never_polled') return 'not polled yet'
  const failing = s.health === 'error' || s.health === 'drift'
  if (failing && s.last_success_at === null) return 'error'
  if (isStale(s, nowMs)) return 'stale'
  if (failing) return 'error'
  if (s.health === 'ok' || s.health === 'empty' || s.health === 'not_modified') return 'ok'
  return 'error' // a health value the contract does not define: fail closed
}

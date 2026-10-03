// W10: the HubDO's CPU on a re-ingest. Most of a poll's events are copies of events already stored, differing only in
// the two stamps every poll writes afresh: times.first_seen_at and sources[].retrieved_at. Running the full JSON-Schema
// validator (validateEvent) on each of them was most of the HubDO's own work on a re-ingest. An incoming event may skip
// it when it is IDENTICAL, as JSON values, to a stored event whose content passed validateEvent under THIS validator
// (checkedMark(): validatorFingerprint() bound to the row's change seq), apart from those two stamps, and each stamp is
// itself a valid UTC instant by the schema's own rule (the utc pattern read from event.schema.json, plus isRealInstant).
// Such an event is valid exactly when the stored one was, so fail-closed is unchanged: any difference at all, a value
// that is not plain JSON (NaN, a Date, undefined, an extra or missing key), a stored copy validated by another validator
// or rewritten since it was marked, or a schema whose stamp fields are no longer plain utc references (FAST_PATH_ON
// false) means the full validateEvent. The payload rules that are not about
// one event's shape (own source, registered affiliation, one dedup_key per payload) run on every event either way
// (hub.ts checkPayload). Pure functions only.
import { eventJsonSchema, isRealInstant, sha256Hex, validateEvent, type CedEvent } from '@ced/schema'

type Json = Record<string, unknown>

function isPlainObject(v: unknown): v is Json {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Strict JSON equality: `a` (anything) equals `b` (a value JSON.parse produced). Objects compare by key set, not key
 * order; anything JSON.parse cannot produce (undefined, NaN, Infinity, a Date, a Map, a class instance) is never equal. */
export function sameJson(a: unknown, b: unknown): boolean {
  // b comes from JSON.parse, so a === b only for equal primitives (null, booleans, finite numbers, strings).
  if (a === b) return true
  if (typeof b !== 'object' || b === null) return false
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || a.length !== b.length) return false
    for (let i = 0; i < b.length; i++) if (!sameJson(a[i], b[i])) return false
    return true
  }
  return isPlainObject(a) && sameObject(a, b as Json, null)
}

/** Same key set; every value strictly equal, except `skip` whose value is not compared (its key must still exist). */
function sameObject(a: Json, b: Json, skip: string | null): boolean {
  const keys = Object.keys(b)
  if (Object.keys(a).length !== keys.length) return false
  for (const k of keys) {
    if (!Object.hasOwn(a, k)) return false
    if (k !== skip && !sameJson(a[k], b[k])) return false
  }
  return true
}

/** True when `incoming` equals the stored event as JSON values, apart from the VALUES of times.first_seen_at and
 * sources[i].retrieved_at (whose keys must still be present). Says nothing about whether those two values are valid. */
export function sameAsStored(incoming: unknown, stored: CedEvent): boolean {
  if (!isPlainObject(incoming)) return false
  const b = stored as unknown as Json
  const keys = Object.keys(b)
  if (Object.keys(incoming).length !== keys.length) return false
  for (const k of keys) {
    if (!Object.hasOwn(incoming, k)) return false
    const a = incoming[k]
    if (k === 'times') {
      if (!isPlainObject(a) || !sameObject(a, b.times as Json, 'first_seen_at')) return false
    } else if (k === 'sources') {
      const bs = b.sources as Json[]
      if (!Array.isArray(a) || a.length !== bs.length) return false
      for (let i = 0; i < bs.length; i++) {
        const s = a[i]
        if (!isPlainObject(s) || !sameObject(s, bs[i]!, 'retrieved_at')) return false
      }
    } else if (!sameJson(a, b[k])) return false
  }
  return true
}

// The fast path re-checks the two stamps by the schema's own utc rule, so it is only sound while each stamp field is
// exactly a reference to $defs/utc and that definition is a plain string pattern. Anything else: always validate.
const UTC_REF = '#/$defs/utc'
const schema = eventJsonSchema as unknown as {
  $defs?: { utc?: unknown }
  properties?: { times?: { properties?: Json }; sources?: { items?: { properties?: Json } } }
}
const onlyUtcRef = (s: unknown) => isPlainObject(s) && Object.keys(s).length === 1 && s.$ref === UTC_REF
const utcDef = schema.$defs?.utc
const utcPattern =
  isPlainObject(utcDef) &&
  utcDef.type === 'string' &&
  typeof utcDef.pattern === 'string' &&
  Object.keys(utcDef).every((k) => k === 'type' || k === 'pattern' || k === 'description')
    ? utcDef.pattern
    : null

/** False when the schema's stamp fields are no longer plain utc references: then every event is fully validated. */
export const FAST_PATH_ON =
  utcPattern !== null &&
  onlyUtcRef(schema.properties?.times?.properties?.first_seen_at) &&
  onlyUtcRef(schema.properties?.sources?.items?.properties?.retrieved_at)

// The validator applies `pattern` with the u flag (@cfworker/json-schema); so does this check.
const UTC_RE = utcPattern === null ? null : new RegExp(utcPattern, 'u')

/** The schema's utc rule (type string + pattern) plus validateEvent's real-calendar-instant rule. */
export function isUtcInstant(v: unknown): boolean {
  return UTC_RE !== null && typeof v === 'string' && UTC_RE.test(v) && isRealInstant(v)
}

/** Both per-poll stamps of an event that sameAsStored() matched are valid UTC instants. */
export function stampsValid(ev: CedEvent): boolean {
  return isUtcInstant(ev.times.first_seen_at) && ev.sources.every((s) => isUtcInstant(s.retrieved_at))
}

let fingerprint: string | null = null

/** Which validator a stored row's content passed: a hash of the schema text and of the cross-field rules' code. A
 * deploy that changes either makes every stored copy "not checked" again, so its next re-ingest is fully validated
 * once (and the rows it confirms get the new fingerprint). Computed on first use (only the HubDO needs it). */
export function validatorFingerprint(): string {
  fingerprint ??= sha256Hex(`${JSON.stringify(eventJsonSchema)}\n${validateEvent.toString()}\n${isRealInstant.toString()}`).slice(0, 16)
  return fingerprint
}

/** The events.checked mark for a row whose content passed validateEvent: the fingerprint bound to the row's change seq.
 * Every write of a row's json gives it a new seq, including a write by code from before the column existed (a rollback),
 * which leaves `checked` as it was (review R1). So a mark vouches only for the very content it was written with; a
 * rewritten row no longer matches and its next copy is fully validated once. */
export function checkedMark(seq: number): string {
  return `${validatorFingerprint()}:${seq}`
}

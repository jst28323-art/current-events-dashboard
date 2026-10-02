// Validates an event against event.schema.json plus the rules JSON Schema cannot say. Runs in Cloudflare Workers:
// @cfworker/json-schema interprets the schema (no eval / new Function, which Workers forbid: docs/TRAPS.md).
import { Validator } from '@cfworker/json-schema'
import schema from './event.schema.json' with { type: 'json' }
import { eventId } from './id.js'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

const validator = new Validator(schema as object, '2020-12', false)

/** Schema check + cross-field rules. Never throws; an invalid event comes back with readable reasons. */
export function validateEvent(ev: unknown): ValidationResult {
  const r = validator.validate(ev)
  const errors = r.valid ? [] : r.errors.map((e) => `${e.instanceLocation} ${e.keyword}: ${e.error}`)
  if (r.valid) {
    const e = ev as {
      id: string; dedup_key: string; object_key: string; revision: number
      times: { occurred_at: string | null; first_seen_at: string }
      sources: Array<{ retrieved_at: string }>
    }
    if (!e.dedup_key.startsWith(`${e.object_key}#`)) errors.push(`dedup_key must be object_key + "#" + transition (got ${e.dedup_key})`)
    if (e.id !== eventId(e.dedup_key, e.revision)) errors.push('id is not eventId(dedup_key, revision)')
    for (const [k, v] of Object.entries(e.times)) {
      if (typeof v === 'string' && !isRealInstant(v)) errors.push(`times.${k} is not a real instant (${v})`)
    }
    for (const [i, s] of e.sources.entries()) {
      if (!isRealInstant(s.retrieved_at)) errors.push(`sources[${i}].retrieved_at is not a real instant (${s.retrieved_at})`)
    }
  }
  return { valid: errors.length === 0, errors }
}

/** True when a "...Z" timestamp names a real calendar instant. V8's Date.parse rolls "02-30" over to March 2
 * instead of failing, so the parsed value is round-tripped and compared to the text. */
export function isRealInstant(utc: string): boolean {
  const d = new Date(utc)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 19) === utc.slice(0, 19)
}

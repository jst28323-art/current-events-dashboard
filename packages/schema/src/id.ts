// Stable event ids: "evt_" + the first 16 hex digits of sha256(dedup_key + "@" + revision) (docs/EVENT_MODEL.md).
// Synchronous on purpose: adapters are pure synchronous functions, and the same id must come out of the Worker,
// Node and the tests. @noble/hashes is a dependency-free, audited sha256 that runs in all three.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { CedEvent, EventDraft } from './types.js'

export function sha256Hex(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)))
}

export function eventId(dedupKey: string, revision: number): string {
  return 'evt_' + sha256Hex(`${dedupKey}@${revision}`).slice(0, 16)
}

/** Adds the derived fields to an adapter's draft. */
export function finalizeEvent(draft: EventDraft): CedEvent {
  return { schema_version: '0.1', id: eventId(draft.dedup_key, draft.revision), ...draft }
}

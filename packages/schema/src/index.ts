// @ced/schema — the event model (docs/EVENT_MODEL.md v0.1) as code: types, the JSON Schema, ids and the validator.
export type * from './types.js'
export { eventId, finalizeEvent, sha256Hex } from './id.js'
export { validateEvent, isRealInstant, type ValidationResult } from './validate.js'
export { default as eventJsonSchema } from './event.schema.json' with { type: 'json' }

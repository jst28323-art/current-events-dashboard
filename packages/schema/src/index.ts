// @ced/schema — the event model (docs/EVENT_MODEL.md v0.1) as code: types, the JSON Schema, ids and the validator.
export type * from './types.js'
export { eventId, finalizeEvent, sha256Hex } from './id.js'
export { validateEvent, isRealInstant, type ValidationResult } from './validate.js'
export { default as eventJsonSchema } from './event.schema.json' with { type: 'json' }
export type { EventsResponse, HealthStatus, SourceStatus, StatusResponse } from './api.js'
export { orderKeyMs, postedMs, earlierPublicationDate, startOfDayEtMs, dayInEt } from './order.js'

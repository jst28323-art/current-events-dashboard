// The probe's fixed settings. Kept out of src/index.ts on purpose: workerd treats EVERY named export of the main module
// as an entrypoint and refuses to start if one is a plain value ("Incorrect type for map entry 'X': the provided value
// is not of type 'function or ExportedHandler'"), so index.ts exports only the handler and the entrypoint classes.

/** SAFETY (grant G-010): after this many cron runs the probe sends nothing more, arms no alarm, only serves /results. */
export const MAX_CRON_RUNS = 48
/** Must match wrangler.jsonc triggers.crons. */
export const CRON = '*/30 * * * *'
export const JITTER_ALARMS = 30
export const JITTER_GAP_MS = 60_000
export const CPU_REPS = 3
export const CPU_GAP_MS = 10_000
/** A CPU alarm that fires while a source probe is in flight waits this long, so the two never share the object. */
export const DEFER_MS = 60_000
/** The cron supervisor treats an armed/started task with no pending alarm as lost after this long. */
export const STALE_TASK_MS = 10 * 60_000
/** A probe run longer than this is assumed dead (worst case ~10 targets x 3 requests x (20 s timeout + gap)). */
export const PROBE_IN_FLIGHT_MAX_MS = 15 * 60_000
/** The one ProbeDO instance. */
export const PROBE_NAME = 'probe'

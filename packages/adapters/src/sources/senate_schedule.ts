// senate.schedule — the Senate's next floor convene (floor_schedule.json) and its committee meetings (hearings.xml):
// floor.convened (scheduled), hearing.scheduled and markup.scheduled events. Design: scratch/phase2/DESIGN.md §3.4.
// FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// FOUNDATION STUB: the SourceDefinition below is final (endpoints, cadence, budget, SLO from §3.4); `parse` returns
// drift "adapter not built yet" until the senate-schedule builder replaces this file's parse code.
import type { SourceDefinition } from '../types.js'
import { stubParse } from '../lib/stub.js'

export const SOURCE_ID = 'senate.schedule'
export const SENATE_SCHEDULE_PARSER = 'senate_schedule@0.0.0'

/** 974 B, fixed width; announces pro forma convenes in recess too. sources[0].url is built from these constants, never
 * from `res.url` (Wayback fixtures carry a web.archive.org url: R-12). */
export const FLOOR_URL = 'https://www.senate.gov/legislative/schedule/floor_schedule.json'
export const HEARINGS_URL = 'https://www.senate.gov/general/committee_schedules/hearings.xml'

export const senateSchedule: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'Senate floor and committee schedule (senate.gov)',
  affiliation: 'official-nonpartisan',
  license: 'us-gov-public-domain',
  features: ['F7', 'F1'],
  endpoints: [
    // Both answer If-Modified-Since with 304 (scout measured).
    { id: 'floor', url: FLOOR_URL, validator: 'if-modified-since', cadence: { business_s: 300, off_s: 900 } },
    { id: 'hearings', url: HEARINGS_URL, validator: 'if-modified-since', cadence: { business_s: 900, off_s: 3600 } },
  ],
  cadence: { business_s: 300, off_s: 900 },
  // One number per source; D-049 makes the hearings endpoint's own threshold max(600, 2 x 900) = 1800 s (critique C9).
  freshness_slo_s: 600,
  rate_budget_per_h: 20,
  calendar: { chamber: 'senate', recess_s: 900 },
  parse: stubParse(SOURCE_ID),
}

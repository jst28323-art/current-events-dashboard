// house.clerk.floor — the House Clerk's floor proceedings XML (clerk.house.gov/floor/{YYYYMMDD}.xml): floor convened /
// adjourned / recess / action events and the next scheduled convene. Design: scratch/phase2/DESIGN.md §3.3.
// FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// FOUNDATION STUB: the SourceDefinition below is final (endpoints, cadence, budget, SLO from §3.3); `parse` returns
// drift "adapter not built yet" until the house-floor builder replaces this file's parse code.
import type { SourceDefinition } from '../types.js'
import { stubParse } from '../lib/stub.js'

export const SOURCE_ID = 'house.clerk.floor'
export const HOUSE_FLOOR_PARSER = 'house_clerk_floor@0.0.0'

/** RSS 2.0 with a UTF-8 BOM; its item title `Legislative Day of 10/01/2026` names the current day file. */
export const FEED_URL = 'https://clerk.house.gov/Home/Feed'
/** Human-readable template of a day file URL; the real URLs come from the feed / day parses (AdapterOutput.targets). */
export const DAY_URL_TEMPLATE = 'https://clerk.house.gov/floor/{YYYYMMDD}.xml'
export const DAY_URL_PATTERN = '^https://clerk\\.house\\.gov/floor/20[0-9]{6}\\.xml$'
/** Head-only cut: the newest 50 <floor_action> blocks, except a whole-file scan when the congress is a colon pair. */
export const HEAD_ACTIONS = 50

export const houseClerkFloor: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'House Clerk floor proceedings',
  affiliation: 'official-nonpartisan',
  license: 'us-gov-public-domain',
  features: ['F2', 'F5', 'F7'],
  endpoints: [
    // No ETag / Last-Modified: body-hash. Zero events; its one target is the current legislative day's file.
    { id: 'feed', url: FEED_URL, validator: 'body-hash', cadence: { business_s: 300, off_s: 900 } },
    // The events. Answers If-Modified-Since with 304 (If-None-Match ignored: scout).
    {
      id: 'day', url: DAY_URL_TEMPLATE, validator: 'if-modified-since', cadence: { business_s: 60, off_s: 300 },
      dynamic: { from: 'feed', urlPattern: DAY_URL_PATTERN, maxTargets: 1 },
    },
    // The file named by `@next-legislative-day-convenes`: 404 until it exists ("not posted yet", never a backoff).
    {
      id: 'next_day', url: DAY_URL_TEMPLATE, validator: 'if-modified-since', cadence: { business_s: 300, off_s: 900 },
      dynamic: { from: 'day', urlPattern: DAY_URL_PATTERN, maxTargets: 1 }, notYetStatus: 404,
    },
  ],
  cadence: { business_s: 60, off_s: 300 },
  freshness_slo_s: 120,
  // 12 feed + 60 day + 12 next_day in session; clerk.house.gov with house.clerk.votes stays <= 280/h.
  rate_budget_per_h: 100,
  calendar: { chamber: 'house', recess_s: 3600 },
  parse: stubParse(SOURCE_ID),
}

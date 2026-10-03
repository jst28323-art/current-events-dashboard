// senate.pressgallery — the Senate Daily Press Gallery's floor log (dailypress.senate.gov WordPress REST): one event per
// timed log entry, typed by our reading of staff prose (confidence `inferred`). Design: scratch/phase2/DESIGN.md §3.5.
// Scope v1: the Daily gallery only (the Periodical gallery is deferred, R-9).
// FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// FOUNDATION STUB: the SourceDefinition below is final (endpoint, cadence, budget, SLO from §3.5); `parse` returns
// drift "adapter not built yet" until the press-gallery builder replaces this file's parse code.
import type { SourceDefinition } from '../types.js'
import { stubParse } from '../lib/stub.js'

export const SOURCE_ID = 'senate.pressgallery'
export const PRESS_GALLERY_PARSER = 'senate_pressgallery@0.0.0'

/** Always send `_fields` (unfiltered is ~243 KB for 10 posts). */
export const DAILY_POSTS_URL =
  'https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories'

export const senatePressgallery: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'Senate Daily Press Gallery log',
  affiliation: 'official-nonpartisan',
  license: 'us-gov-public-domain',
  features: ['F1', 'F5', 'F8'],
  // The REST API sends no ETag / Last-Modified and ignores If-Modified-Since (scout): body-hash.
  endpoints: [{ id: 'daily_posts', url: DAILY_POSTS_URL, validator: 'body-hash', cadence: { business_s: 60, off_s: 300 } }],
  cadence: { business_s: 60, off_s: 300 },
  freshness_slo_s: 120,
  rate_budget_per_h: 70,
  calendar: { chamber: 'senate', recess_s: 900 },
  parse: stubParse(SOURCE_ID),
}

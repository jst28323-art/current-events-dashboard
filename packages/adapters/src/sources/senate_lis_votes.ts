// senate.lis.votes — Senate roll call votes from the Legislative Information System (senate.gov LIS): one vote.result
// event + one member-vote side record per vote. Design: scratch/phase2/DESIGN.md §3.2 (mapping, titles, drift checks,
// tests), §2 (records). FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// FOUNDATION STUB: the SourceDefinition below is final (endpoints, cadence, budget, SLO from §3.2); `parseVote` returns
// drift "adapter not built yet" until the senate-votes builder replaces this file's parse code.
import type { AdapterOutput, FetchedResponse, SourceDefinition } from '../types.js'
import { CURRENT } from '../lib/congress_ids.js'
import { DEFAULT_VOTE_OPTIONS, type ParseVoteOptions } from '../lib/members.js'
import { stubParse } from '../lib/stub.js'

export const SOURCE_ID = 'senate.lis.votes'
export const SENATE_VOTES_PARSER = 'senate_lis_votes@0.0.0'

const CS = `${CURRENT.congress}_${CURRENT.session}`
/** The session's vote menu, newest first (head-only: the top 10 <vote> blocks). */
export const MENU_URL = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${CS}.xml`
/** Human-readable template of a vote XML URL; the real URLs come from the menu parse (AdapterOutput.targets). */
export const VOTE_URL_TEMPLATE = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CURRENT.congress}${CURRENT.session}/vote_${CS}_{NNNNN}.xml`
/** = `^https://www\.senate\.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_[0-9]{5}\.xml$` for 119-2 (§3.2). */
export const VOTE_URL_PATTERN = `^https://www\\.senate\\.gov/legislative/LIS/roll_call_votes/vote${CURRENT.congress}${CURRENT.session}/vote_${CS}_[0-9]{5}\\.xml$`

const stub = stubParse(SOURCE_ID)

/** Pure: one response of any endpoint (`menu`, `vote`) in; events, records, targets and health out. */
export function parseVote(endpointId: string, res: FetchedResponse, opts: ParseVoteOptions = DEFAULT_VOTE_OPTIONS): AdapterOutput {
  void opts
  return stub(endpointId, res)
}

export const senateLisVotes: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'Senate roll calls (senate.gov LIS)',
  affiliation: 'official-nonpartisan',
  license: 'us-gov-public-domain',
  features: ['F5', 'F6'],
  endpoints: [
    // Answers If-Modified-Since with 304 (If-None-Match alone is ignored: scout), so its 60/h are cheap.
    { id: 'menu', url: MENU_URL, validator: 'if-modified-since', cadence: { business_s: 60, off_s: 300 } },
    // The top 10 numbers the menu lists (an unlisted number answers 301 to an HTML page: never probe ahead).
    {
      id: 'vote', url: VOTE_URL_TEMPLATE, validator: 'if-modified-since', cadence: { business_s: 1800, off_s: 3600 },
      dynamic: { from: 'menu', urlPattern: VOTE_URL_PATTERN, maxTargets: 10 },
    },
  ],
  cadence: { business_s: 60, off_s: 300 },
  freshness_slo_s: 120,
  // 60 menu + 10 targets x 2 + up to ~20 new votes in a vote-a-rama hour = 100.
  rate_budget_per_h: 110,
  calendar: { chamber: 'senate', recess_s: 3600 },
  parse: (endpointId, res) => parseVote(endpointId, res),
}

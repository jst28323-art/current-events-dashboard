// house.clerk.votes — House roll call votes from the Clerk (clerk.house.gov): one vote.result event + one member-vote
// side record per roll call. Design: scratch/phase2/DESIGN.md §3.1 (mapping, titles, drift checks, tests), §2 (records).
// FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// FOUNDATION STUB: the SourceDefinition below is final (endpoints, cadence, budget, SLO from §3.1); `parseVote` returns
// drift "adapter not built yet" until the house-votes builder replaces this file's parse code.
import type { AdapterOutput, FetchedResponse, SourceDefinition } from '../types.js'
import { CURRENT, sessionOrdinal } from '../lib/congress_ids.js'
import { DEFAULT_VOTE_OPTIONS, type ParseVoteOptions } from '../lib/members.js'
import { stubParse } from '../lib/stub.js'

export const SOURCE_ID = 'house.clerk.votes'
export const HOUSE_VOTES_PARSER = 'house_clerk_votes@0.0.0'

/** The listing of the current session's roll calls, newest first, 10 rows (URL fixed: DESIGN §3.1, critique B8). */
export const INDEX_URL = `https://clerk.house.gov/Votes/MemberVotes?CongressNum=${CURRENT.congress}&Session=${sessionOrdinal(CURRENT.session)}`
/** Human-readable template of a roll call XML URL; the real URLs come from the index parse (AdapterOutput.targets). */
export const ROLL_URL_TEMPLATE = `https://clerk.house.gov/evs/${CURRENT.year}/roll{NNN}.xml`
export const ROLL_URL_PATTERN = '^https://clerk\\.house\\.gov/evs/20[0-9]{2}/roll[0-9]{3}\\.xml$'

const stub = stubParse(SOURCE_ID)

/** Pure: one response of any endpoint (`index`, `roll_next`, `roll`) in; events, records, targets and health out. */
export function parseVote(endpointId: string, res: FetchedResponse, opts: ParseVoteOptions = DEFAULT_VOTE_OPTIONS): AdapterOutput {
  void opts
  return stub(endpointId, res)
}

export const houseClerkVotes: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'House Clerk roll calls (clerk.house.gov)',
  affiliation: 'official-nonpartisan',
  license: 'us-gov-public-domain',
  features: ['F5', 'F6'],
  endpoints: [
    // No ETag / Last-Modified; IMS and INM both get 200 (scout measured): body-hash.
    { id: 'index', url: INDEX_URL, validator: 'body-hash', cadence: { business_s: 60, off_s: 300 } },
    // Probe of roll N+1 (N = top listed roll): a 65-byte "Error sanitizing file" body until it exists.
    {
      id: 'roll_next', url: ROLL_URL_TEMPLATE, validator: 'body-hash', cadence: { business_s: 60, off_s: 300 },
      dynamic: { from: 'index', urlPattern: ROLL_URL_PATTERN, maxTargets: 1 },
    },
    // Every listed roll (10): re-polled hourly for corrections; a new target is fetched at once (critique B6).
    {
      id: 'roll', url: ROLL_URL_TEMPLATE, validator: 'body-hash', cadence: { business_s: 3600, off_s: 3600 },
      dynamic: { from: 'index', urlPattern: ROLL_URL_PATTERN, maxTargets: 10 },
    },
  ],
  cadence: { business_s: 60, off_s: 300 },
  freshness_slo_s: 120, // 2x cadence (D-039)
  // In session: 60 index + 60 probe + up to ~25 new rolls + 10 targets x 2 (D-049 peak formula) = 165.
  rate_budget_per_h: 180,
  calendar: { chamber: 'house', recess_s: 3600 },
  parse: (endpointId, res) => parseVote(endpointId, res),
}

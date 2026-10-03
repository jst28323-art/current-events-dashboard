// @ced/adapters/fixture-only — the P2.1 Congress adapters, built and tested against recorded fixtures and NOT polled
// live (owner override D-058; docs/design/P2.1.md §4). The Worker imports `@ced/adapters` (src/index.ts), which
// never reaches this module, the members map or `@ced/schema/v02`; packages/adapters/test/live_list.test.ts pins that,
// pins SOURCES to [fr.api, wh.feeds], and hash-pins every Worker-imported entry file.
//
// Going live (P2.2) = a decision row + moving sources into SOURCES (registry.ts) + the poller features of DESIGN §3.0
// (dynamic endpoints, notYetStatus, calendar). Until then nothing here may be imported by workers/api/src or apps/web/src.
import type { SourceDefinition } from './types.js'
import { houseClerkVotes } from './sources/house_clerk_votes.js'
import { senateLisVotes } from './sources/senate_lis_votes.js'
import { houseClerkFloor } from './sources/house_clerk_floor.js'
import { senateSchedule } from './sources/senate_schedule.js'
import { senatePressgallery } from './sources/senate_pressgallery.js'

export type * from './types.js'
export { houseClerkVotes, senateLisVotes, houseClerkFloor, senateSchedule, senatePressgallery }
export { parseVote as parseHouseVote } from './sources/house_clerk_votes.js'
export { parseVote as parseSenateVote } from './sources/senate_lis_votes.js'
export { MEMBERS, MEMBERS_MAP, DEFAULT_VOTE_OPTIONS, makeLookup, type MembersLookup, type ParseVoteOptions } from './lib/members.js'
export { ADAPTER_NOT_BUILT } from './lib/stub.js'

export const FIXTURE_ONLY_SOURCES: readonly SourceDefinition[] = [
  houseClerkVotes, senateLisVotes, houseClerkFloor, senateSchedule, senatePressgallery,
]

export function fixtureOnlySourceById(id: string): SourceDefinition | undefined {
  return FIXTURE_ONLY_SOURCES.find((s) => s.source_id === id)
}

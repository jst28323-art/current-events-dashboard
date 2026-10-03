// @ced/schema/v02 — EVENT_MODEL v0.2 additions (typed vote.result `result`, member-vote side records, cross-field
// identity rules). A separate subpath so the Worker's validator stays byte-identical in P2.1 (D-058; design §1.7):
// imported only by tests and `@ced/adapters/fixture-only`, never by workers/api/src or apps/web/src
// (packages/adapters/test/live_list.test.ts enforces this). P2.2 folds it into event.schema.json and deletes the subpath.
export type * from './types.js'
export {
  VOTE_REQUIRED_VALUES, VOTE_RESULT_REQUIRED, POSITION_VALUES, ID_CONFIDENCE_VALUES, MEMBER_VOTES_REQUIRED,
  MEMBER_POSITION_REQUIRED, TYPE_AGREEMENT_CHECKED,
} from './types.js'
export {
  validateVoteEvent, validateMemberVotes, checkVotePair, parseVoteKey, voteKeyOf, memberVotesRefOf, VOTE_KEY,
  type VoteIdentity,
} from './validate.js'
export { default as voteResultJsonSchema } from './vote_result.schema.json' with { type: 'json' }
export { default as memberVotesJsonSchema } from './member_votes.schema.json' with { type: 'json' }

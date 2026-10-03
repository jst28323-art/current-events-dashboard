// EVENT_MODEL v0.2 additions as TypeScript (docs/design/P2.1.md §1.7, §2.1): the typed `result` of a vote.result
// event and the member-vote side record. The JSON Schemas next to this file are the machine contract;
// packages/schema/test/v02.test.ts pins that the two agree (required lists, enums), and the compile-time checks at the
// bottom of this file fail `npm run typecheck` if a required field is added to one list and not the other.
//
// This is a SEPARATE subpath (`@ced/schema/v02`) so the Worker's validator stays byte-identical in P2.1 (D-058): it is
// imported only by tests and `@ced/adapters/fixture-only`. P2.2 folds it into event.schema.json.

export const VOTE_REQUIRED_VALUES = ['1/2', '3/5', '2/3'] as const
export type VoteRequired = (typeof VOTE_REQUIRED_VALUES)[number]

export interface VoteCandidate { name: string; votes: number }

/** The fields every vote.result `result` has (no index signature, so the compile-time key checks below are exact). */
export interface VoteResultCore {
  question: string
  question_kind: string
  result_text: string
  required: VoteRequired | null
  passed: boolean | null
  yea: number | null
  nay: number | null
  present: number
  not_voting: number
  /** Speaker elections: named people only (never `Present` / `Not Voting`). */
  candidates?: VoteCandidate[]
  tie_breaker?: { by: string; vote: string } | null
  time_note?: string
}
/** `additionalProperties` stays open: the House adds vote_type, legis_num, amendment_num, … (DESIGN §1.7). */
export type VoteResult = VoteResultCore & { [extra: string]: unknown }

export const VOTE_RESULT_REQUIRED = [
  'question', 'question_kind', 'result_text', 'required', 'passed', 'yea', 'nay', 'present', 'not_voting',
] as const satisfies readonly (keyof VoteResultCore)[]

export const POSITION_VALUES = ['yea', 'nay', 'present', 'not_voting', 'candidate'] as const
export type PositionValue = (typeof POSITION_VALUES)[number]

export const ID_CONFIDENCE_VALUES = ['authority', 'mapped', 'unresolved'] as const
export type IdConfidence = (typeof ID_CONFIDENCE_VALUES)[number]

export interface MemberPosition {
  /** "bioguide:A000370" | "lis:S293" (a Senate id not in the members map). */
  member_key: string
  /** House name-id = authority; Senate LIS id mapped through the members map = mapped; not in the map = unresolved. */
  id_confidence: IdConfidence
  /** Senate only. */
  lis: string | null
  /** The members map's displayName when found, else the source's own text (never invented). */
  name: string
  name_source: 'map' | 'source'
  /** Verbatim: House <legislator> text ("Hernández"), Senate member_full ("Graham (R-SC)"). */
  source_name: string
  /** AS PRINTED in the vote XML (party at vote time). */
  party: string
  state: string
  /** House @role; Senate null. */
  role: 'legislator' | 'speaker' | null
  position: PositionValue
  /** Verbatim: "Yea" | "Aye" | "No" | "Guilty" | "Present, Giving Live Pair" | "Johnson (LA)". */
  vote_text: string
  /** Senate vote_cast/@pair ("S375"), else null. */
  pair: string | null
}

export interface MemberVoteCounts {
  yea: number | null
  nay: number | null
  present: number
  not_voting: number
  candidates?: VoteCandidate[]
}

export interface MemberVotesRecord {
  record_type: 'member_votes'
  record_version: '0.1'
  /** = the event's member_votes_ref, "votes/senate/119/2/256.json". */
  ref: string
  /** = the event's object_key, "vote:senate:119:2:256". */
  vote_key: string
  chamber: 'house' | 'senate'
  congress: number
  session: 1 | 2
  roll: number
  source: { source_id: string; url: string; retrieved_at: string; parser: string }
  /** The generated members map used (@ced/adapters lib/members.ts `MEMBERS.meta`). */
  members_map: { sha256: string; source_last_modified: string | null; built_at: string }
  counts: MemberVoteCounts
  /** Positions whose member could not be named from the map (name_source "source"). */
  unresolved: number
  /** In source order. */
  positions: MemberPosition[]
}

export const MEMBER_VOTES_REQUIRED = [
  'record_type', 'record_version', 'ref', 'vote_key', 'chamber', 'congress', 'session', 'roll', 'source', 'members_map',
  'counts', 'unresolved', 'positions',
] as const satisfies readonly (keyof MemberVotesRecord)[]

export const MEMBER_POSITION_REQUIRED = [
  'member_key', 'id_confidence', 'lis', 'name', 'name_source', 'source_name', 'party', 'state', 'role', 'position',
  'vote_text', 'pair',
] as const satisfies readonly (keyof MemberPosition)[]

// ---- compile-time agreement: each list above names exactly the interface's required keys ----
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const voteResultKeysAgree: Same<RequiredKeys<VoteResultCore>, (typeof VOTE_RESULT_REQUIRED)[number]> = true
const memberVotesKeysAgree: Same<RequiredKeys<MemberVotesRecord>, (typeof MEMBER_VOTES_REQUIRED)[number]> = true
const memberPositionKeysAgree: Same<RequiredKeys<MemberPosition>, (typeof MEMBER_POSITION_REQUIRED)[number]> = true
const positionValuesAgree: Same<MemberPosition['position'], PositionValue> = true
const requiredValuesAgree: Same<NonNullable<VoteResultCore['required']>, VoteRequired> = true
/** Referenced so the compile-time checks above are not dead code to a linter; carries no runtime meaning. */
export const TYPE_AGREEMENT_CHECKED =
  voteResultKeysAgree && memberVotesKeysAgree && memberPositionKeysAgree && positionValuesAgree && requiredValuesAgree

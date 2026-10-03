// EVENT_MODEL v0.2 validators (docs/design/P2.1.md §1.7, §2.1). Like validateEvent they never throw (D-050 rule):
// a bad value comes back as readable reasons. Imported only by tests and `@ced/adapters/fixture-only` in P2.1; the
// Worker keeps the unchanged v0.1 `validateEvent` until P2.2 folds this in.
import { Validator } from '@cfworker/json-schema'
import { validateEvent, type ValidationResult } from '../validate.js'
import voteResultSchema from './vote_result.schema.json' with { type: 'json' }
import memberVotesSchema from './member_votes.schema.json' with { type: 'json' }
import type { MemberVotesRecord, VoteCandidate } from './types.js'

const voteResultValidator = new Validator(voteResultSchema as object, '2020-12', false)
const memberVotesValidator = new Validator(memberVotesSchema as object, '2020-12', false)

/** `vote:{chamber}:{congress}:{session 1|2}:{roll}`: the one place a vote's identity lives (DESIGN §1.4). */
export const VOTE_KEY = /^vote:(house|senate):([0-9]{2,3}):([12]):([1-9][0-9]{0,4})$/

export interface VoteIdentity { chamber: 'house' | 'senate'; congress: number; session: 1 | 2; roll: number }

export function parseVoteKey(key: string): VoteIdentity | null {
  const m = VOTE_KEY.exec(key)
  if (!m) return null
  return { chamber: m[1] as 'house' | 'senate', congress: Number(m[2]), session: Number(m[3]) as 1 | 2, roll: Number(m[4]) }
}

export function voteKeyOf(id: VoteIdentity): string {
  return `vote:${id.chamber}:${id.congress}:${id.session}:${id.roll}`
}

/** `votes/{chamber}/{congress}/{session}/{roll}.json`: the member-vote record's address (event.member_votes_ref). */
export function memberVotesRefOf(id: VoteIdentity): string {
  return `votes/${id.chamber}/${id.congress}/${id.session}/${id.roll}.json`
}

function schemaErrors(v: Validator, value: unknown, prefix: string): string[] {
  try {
    const r = v.validate(value)
    return r.valid ? [] : r.errors.map((e) => `${prefix}${e.instanceLocation} ${e.keyword}: ${e.error}`)
  } catch (e) {
    return [`${prefix} not validatable: ${e instanceof Error ? e.message : String(e)}`]
  }
}

/**
 * validateEvent (the unchanged v0.1 validator) AND, for `vote.result`: `result` valid against vote_result.schema.json,
 * `member_votes_ref` present, and the cross-field identity rules (object_key shape, dedup_key = object_key + "#result",
 * body = chamber, member_votes_ref = the record address derived from object_key).
 */
export function validateVoteEvent(ev: unknown): ValidationResult {
  const base = validateEvent(ev)
  if (!base.valid) return base
  const e = ev as { event_type: string; object_key: string; dedup_key: string; body: string; result?: unknown; member_votes_ref?: unknown }
  if (e.event_type !== 'vote.result') return base
  const errors: string[] = []
  if (e.result === undefined) errors.push('vote.result needs a result')
  else errors.push(...schemaErrors(voteResultValidator, e.result, 'result'))
  const id = parseVoteKey(e.object_key)
  if (!id) errors.push(`object_key ${e.object_key} is not vote:{house|senate}:{congress}:{1|2}:{roll}`)
  if (e.dedup_key !== `${e.object_key}#result`) errors.push(`dedup_key must be object_key + "#result" (got ${e.dedup_key})`)
  if (typeof e.member_votes_ref !== 'string') errors.push('vote.result needs member_votes_ref')
  if (id) {
    if (e.body !== id.chamber) errors.push(`body ${e.body} is not the chamber in object_key (${id.chamber})`)
    const want = memberVotesRefOf(id)
    if (typeof e.member_votes_ref === 'string' && e.member_votes_ref !== want) {
      errors.push(`member_votes_ref must be ${want} (got ${e.member_votes_ref})`)
    }
  }
  return { valid: errors.length === 0, errors }
}

const sameCandidates = (a: VoteCandidate[] | undefined, b: VoteCandidate[] | undefined): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The record schema plus: vote_key and ref agree with the record's own chamber/congress/session/roll; per-bucket
 * position counts equal `counts` (a null yea/nay means no position in that bucket; candidate positions are counted per
 * candidate name); `unresolved` equals the positions not named from the map; each position is consistent with its
 * chamber (House: bioguide key, authority, no lis, a role; Senate: a lis, no role, `lis:` key exactly when unresolved);
 * no duplicate member.
 */
export function validateMemberVotes(record: unknown): ValidationResult {
  const errors = schemaErrors(memberVotesValidator, record, 'record')
  if (errors.length > 0) return { valid: false, errors }
  const r = record as MemberVotesRecord
  const id: VoteIdentity = { chamber: r.chamber, congress: r.congress, session: r.session, roll: r.roll }
  if (r.vote_key !== voteKeyOf(id)) errors.push(`vote_key ${r.vote_key} does not match the record's identity (${voteKeyOf(id)})`)
  if (r.ref !== memberVotesRefOf(id)) errors.push(`ref ${r.ref} does not match the record's identity (${memberVotesRefOf(id)})`)

  const bucket = { yea: 0, nay: 0, present: 0, not_voting: 0, candidate: 0 }
  const perCandidate = new Map<string, number>()
  const seen = new Set<string>()
  let fromSource = 0
  r.positions.forEach((p, i) => {
    const at = `positions[${i}] (${p.member_key})`
    bucket[p.position] += 1
    if (p.position === 'candidate') perCandidate.set(p.vote_text, (perCandidate.get(p.vote_text) ?? 0) + 1)
    if (seen.has(p.member_key)) errors.push(`${at} duplicates a member`)
    seen.add(p.member_key)
    if (p.name_source === 'source') fromSource += 1
    if (r.chamber === 'house') {
      if (!p.member_key.startsWith('bioguide:')) errors.push(`${at}: a House position is keyed by its bioguide name-id`)
      if (p.id_confidence !== 'authority') errors.push(`${at}: a House name-id is the authority (got ${p.id_confidence})`)
      if (p.lis !== null) errors.push(`${at}: a House position has no lis id`)
      if (p.role === null) errors.push(`${at}: a House position carries the XML's role`)
      if (p.pair !== null) errors.push(`${at}: pairs are Senate-only`)
    } else {
      if (p.lis === null) errors.push(`${at}: a Senate position carries its lis id`)
      if (p.role !== null) errors.push(`${at}: a Senate position has no role`)
      const unresolved = p.member_key.startsWith('lis:')
      if (unresolved !== (p.id_confidence === 'unresolved')) errors.push(`${at}: a lis: key is exactly the unresolved case`)
      if (unresolved && p.member_key !== `lis:${p.lis}`) errors.push(`${at}: an unresolved key must be lis:{its lis id}`)
      if (!unresolved && p.id_confidence !== 'mapped') errors.push(`${at}: a resolved Senate id is "mapped"`)
      if (unresolved && p.name_source !== 'source') errors.push(`${at}: an unresolved member cannot have a map name`)
    }
  })
  if (r.unresolved !== fromSource) errors.push(`unresolved ${r.unresolved} != ${fromSource} positions named from the source`)
  const c = r.counts
  const want = (k: 'yea' | 'nay', n: number | null) => {
    if ((n ?? 0) !== bucket[k]) errors.push(`counts.${k} ${n} != ${bucket[k]} ${k} positions`)
  }
  want('yea', c.yea)
  want('nay', c.nay)
  if (c.present !== bucket.present) errors.push(`counts.present ${c.present} != ${bucket.present} present positions`)
  if (c.not_voting !== bucket.not_voting) errors.push(`counts.not_voting ${c.not_voting} != ${bucket.not_voting} not_voting positions`)
  const cands = c.candidates ?? []
  const names = new Set<string>()
  for (const k of cands) {
    if (names.has(k.name)) errors.push(`counts.candidates repeats ${k.name}`)
    names.add(k.name)
    const got = perCandidate.get(k.name) ?? 0
    if (got !== k.votes) errors.push(`candidate ${k.name}: counts say ${k.votes}, positions say ${got}`)
  }
  for (const [name, n] of perCandidate) if (!names.has(name)) errors.push(`${n} candidate positions for ${name}, who is not in counts.candidates`)
  return { valid: errors.length === 0, errors }
}

/** An event and its member-vote record describe the same vote: key, ref, and every count (and candidate) agree. */
export function checkVotePair(event: unknown, record: unknown): ValidationResult {
  const e = event as { object_key?: string; member_votes_ref?: string; result?: Record<string, unknown> } | null
  const r = record as MemberVotesRecord | null
  const errors: string[] = []
  if (!e || !r) return { valid: false, errors: ['missing event or record'] }
  if (r.vote_key !== e.object_key) errors.push(`record.vote_key ${r.vote_key} != event.object_key ${e.object_key}`)
  if (r.ref !== e.member_votes_ref) errors.push(`record.ref ${r.ref} != event.member_votes_ref ${e.member_votes_ref}`)
  const res = e.result ?? {}
  for (const k of ['yea', 'nay', 'present', 'not_voting'] as const) {
    if (r.counts?.[k] !== res[k]) errors.push(`counts.${k} ${r.counts?.[k]} != result.${k} ${String(res[k])}`)
  }
  if (!sameCandidates(r.counts?.candidates, res.candidates as VoteCandidate[] | undefined)) {
    errors.push('counts.candidates != result.candidates')
  }
  return { valid: errors.length === 0, errors }
}

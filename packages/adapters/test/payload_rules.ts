// Test helper (Node only): the Hub's payload rules plus the P2.1 adapter-output contract, for every adapter test
// (scratch/phase2/DESIGN.md §4.3, §3.0). The Hub (workers/api/src/hub.ts checkPayload) refuses a whole payload when any
// event is invalid, cites a source other than the polled one, claims an affiliation other than the registered one, or
// repeats a dedup_key; an adapter test that only ran validateEvent would lock such a payload into a golden (critique B3:
// the duplicate scheduled-convene key passed validateEvent). This helper re-states those rules here (the Hub module
// imports cloudflare:workers, so Node tests cannot import it) and adds the P2.1 contract:
//   - fail closed: a drift / error / not_modified output carries zero events, zero records, zero targets;
//   - vote.result events pass validateVoteEvent; every record passes validateMemberVotes and pairs 1:1 with a vote.result
//     event of the same payload (checkVotePair);
//   - targets name a dynamic endpoint of this source fed by the endpoint just parsed, full-match its urlPattern, stay
//     within maxTargets, and do not repeat;
//   - first_seen_at and every sources[].retrieved_at are the response's fetchedAt (DESIGN §1.3), when `res` is given.
import { expect } from 'vitest'
import { validateEvent, type CedEvent } from '@ced/schema'
import { checkVotePair, validateMemberVotes, validateVoteEvent } from '@ced/schema/v02'
import type { AdapterOutput, FetchedResponse, SourceDefinition } from '../src/types.js'

export function hubPayloadProblems(def: SourceDefinition, out: AdapterOutput, res?: FetchedResponse): string[] {
  const problems: string[] = []
  const h = out.health
  const endpointIds = new Set(def.endpoints.map((e) => e.id))
  if (h.source_id !== def.source_id) problems.push(`health.source_id ${h.source_id} is not ${def.source_id}`)
  if (!endpointIds.has(h.endpoint)) problems.push(`health.endpoint ${h.endpoint} is not an endpoint of ${def.source_id}`)
  const events = out.events
  const records = out.records ?? []
  const targets = out.targets ?? []
  if (h.status !== 'ok' && h.status !== 'empty') {
    if (events.length || records.length || targets.length) {
      problems.push(`health ${h.status} must carry zero events/records/targets (got ${events.length}/${records.length}/${targets.length})`)
    }
  }

  const firstIndex = new Map<string, number>()
  events.forEach((ev: CedEvent, i) => {
    const label = `events[${i}] (${ev?.dedup_key})`
    const r = ev?.event_type === 'vote.result' ? validateVoteEvent(ev) : validateEvent(ev)
    for (const e of r.errors) problems.push(`${label} ${e}`)
    if (!r.valid) return
    if (!ev.sources.some((s) => s.source_id === def.source_id)) problems.push(`${label} does not cite source ${def.source_id}`)
    ev.sources.forEach((s, j) => {
      if (s.source_id !== def.source_id) problems.push(`${label} sources[${j}] cites ${s.source_id}: an adapter may cite only its own source`)
      else if (s.affiliation !== def.affiliation) problems.push(`${label} sources[${j}] claims ${s.affiliation}, registered ${def.affiliation}`)
      if (s.license !== undefined && s.license !== def.license) problems.push(`${label} sources[${j}] license ${s.license} is not ${def.license}`)
      if (res && s.retrieved_at !== res.fetchedAt) problems.push(`${label} sources[${j}].retrieved_at is not the response's fetchedAt`)
    })
    if (res && ev.times.first_seen_at !== res.fetchedAt) problems.push(`${label} first_seen_at is not the response's fetchedAt`)
    const seen = firstIndex.get(ev.dedup_key)
    if (seen != null) problems.push(`${label} repeats events[${seen}] (one dedup_key per payload)`)
    else firstIndex.set(ev.dedup_key, i)
  })

  const votes = new Map(events.filter((e) => e?.event_type === 'vote.result').map((e) => [e.object_key, e] as const))
  const paired = new Set<string>()
  records.forEach((rec, i) => {
    const label = `records[${i}] (${rec?.vote_key})`
    const r = validateMemberVotes(rec)
    for (const e of r.errors) problems.push(`${label} ${e}`)
    if (!r.valid) return
    if (rec.source.source_id !== def.source_id) problems.push(`${label} source ${rec.source.source_id} is not ${def.source_id}`)
    if (res && rec.source.retrieved_at !== res.fetchedAt) problems.push(`${label} source.retrieved_at is not the response's fetchedAt`)
    const ev = votes.get(rec.vote_key)
    if (!ev) {
      problems.push(`${label} has no vote.result event in the payload`)
      return
    }
    if (paired.has(rec.vote_key)) problems.push(`${label} repeats a record for the same vote`)
    paired.add(rec.vote_key)
    for (const e of checkVotePair(ev, rec).errors) problems.push(`${label} ${e}`)
  })
  for (const key of votes.keys()) if (!paired.has(key)) problems.push(`vote.result ${key} has no member-vote record`)

  const perEndpoint = new Map<string, Set<string>>()
  targets.forEach((t, i) => {
    const label = `targets[${i}] (${t?.endpoint} ${t?.url})`
    const ep = def.endpoints.find((e) => e.id === t.endpoint)
    if (!ep?.dynamic) {
      problems.push(`${label}: not a dynamic endpoint of ${def.source_id}`)
      return
    }
    if (ep.dynamic.from !== h.endpoint) problems.push(`${label}: fed by ${ep.dynamic.from}, but ${h.endpoint} was parsed`)
    if (!new RegExp(ep.dynamic.urlPattern).test(t.url)) problems.push(`${label}: does not match ${ep.dynamic.urlPattern}`)
    const set = perEndpoint.get(t.endpoint) ?? new Set<string>()
    if (set.has(t.url)) problems.push(`${label}: repeated`)
    set.add(t.url)
    perEndpoint.set(t.endpoint, set)
  })
  for (const [id, set] of perEndpoint) {
    const max = def.endpoints.find((e) => e.id === id)!.dynamic!.maxTargets
    if (set.size > max) problems.push(`${set.size} targets for ${id}, more than maxTargets ${max}`)
  }
  return problems
}

/** Assert that an adapter output would pass the Hub and the P2.1 output contract (see the file header). */
export function expectHubPayloadRules(def: SourceDefinition, out: AdapterOutput, res?: FetchedResponse): void {
  expect(hubPayloadProblems(def, out, res)).toEqual([])
}

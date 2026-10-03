// house.clerk.floor — the House Clerk's floor proceedings XML (clerk.house.gov/floor/{YYYYMMDD}.xml): floor convened /
// adjourned / recess / action events and the next scheduled convene. Design: scratch/phase2/DESIGN.md §3.3 (keys §1.4,
// times §1.3, tiers §1.5, decision row R-6). FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never
// in SOURCES.
//
// Three endpoints share this parse:
//   - `feed` (RSS, UTF-8 BOM): zero events; its one target is the current legislative day's file (`day`).
//   - `day` / `next_day` (the day file): one event per <floor_action> (head-only: the newest 50, except a whole-file scan
//     on a Congress split) plus one scheduled convene per distinct next-meeting date; a `day` parse targets `next_day`.
//
// Fail closed: any structure we did not record (root, envelope, attribute shapes, a duplicate unique-id, a wall time that
// does not exist, two times for one convene date, a vote link we cannot read) makes the whole payload `drift` with zero
// events and zero targets. Meaning is labelled, not refused: a sentence we do not recognise is a plain `floor.action` (P3).
// Every rule below says why; the fixture it rests on is named.
import { finalizeEvent, type CedEvent, type FeatureId, type Tier } from '@ced/schema'
import type { AdapterOutput, FetchedResponse, HealthStatus, SourceDefinition, Target } from '../types.js'
import {
  attrsOf, blocks, collapseWs, countBlocks, endsWithClose, hasUnknownEntity, innerText, rootName, stripBom, textOf,
  type XmlBlock,
} from '../lib/xmlscan.js'
import { easternToUtc, fmtClock12, fmtWeekdayMonthDay, isRealDate, ymd } from '../lib/eastern.js'
import { billKey, congressSessionOfYear, floorBillType, fmtBill, type BillType } from '../lib/congress_ids.js'

export const SOURCE_ID = 'house.clerk.floor'
export const HOUSE_FLOOR_PARSER = 'house_clerk_floor@0.1.0'

/** RSS 2.0 with a UTF-8 BOM; its item title `Legislative Day of 10/01/2026` names the current day file. */
export const FEED_URL = 'https://clerk.house.gov/Home/Feed'
/** Human-readable template of a day file URL; the real URLs come from the feed / day parses (AdapterOutput.targets). */
export const DAY_URL_TEMPLATE = 'https://clerk.house.gov/floor/{YYYYMMDD}.xml'
export const DAY_URL_PATTERN = '^https://clerk\\.house\\.gov/floor/20[0-9]{6}\\.xml$'
/** Head-only cut: the newest 50 <floor_action> blocks, except a whole-file scan when the congress is a colon pair. */
export const HEAD_ACTIONS = 50

const DAY_URL = /^https:\/\/clerk\.house\.gov\/floor\/(20[0-9]{6})\.xml$/
const dayUrl = (yyyymmdd: string) => `https://clerk.house.gov/floor/${yyyymmdd}.xml`

const TITLE_MAX = 1000 // event.schema.json title.maxLength
const OFFICIAL_MAX = 4000 // event.schema.json official_text.maxLength (DESIGN §3.3 "max 4000 chars")

type Out = AdapterOutput
const health = (endpoint: string, status: HealthStatus, detail: string, items_seen = 0): Out['health'] =>
  ({ source_id: SOURCE_ID, endpoint, status, detail, items_seen })
const fail = (endpoint: string, status: HealthStatus, detail: string, items_seen = 0): Out =>
  ({ events: [], health: health(endpoint, status, detail, items_seen) })

// ---------------------------------------------------------------------------------------------------------------------
// Classification (DESIGN §3.3). Both the act-id AND the Clerk's fixed sentence must match; anything else is floor.action.
// Sentences opened in 20260327.xml, 20260103.xml, 20250103.xml, 20261001.xml (all fixtures/house.clerk.floor/2026-10-03).

export interface FloorClass {
  event_type: 'floor.convened' | 'floor.adjourned' | 'floor.recess' | 'floor.action'
  tier: Tier
  features: FeatureId[]
  /** Our title without the action_item suffix (vote / other lines add it). */
  kind: 'new_day' | 'from_recess' | 'sine_die' | 'adjourned' | 'recess' | 'vote' | 'other'
}

const NEW_DAY = /^(The )?House convened, starting a new legislative day/
const TWENTIETH = /^The House convened pursuant to the 20th Amendment/i
const FROM_RECESS = /^The House convened, returning from a recess/
const SINE_DIE = /sine die/i
const ADJOURNED = /^The House adjourned|do now adjourn/
const RECESS = /do now recess/

/** Type, tier and features of one entry from its act-id, its text (the §3.3 text rule) and whether it links a vote. */
export function classifyAction(actId: string, text: string, hasVote: boolean): FloorClass {
  if (actId === 'H20100') {
    if (NEW_DAY.test(text) || TWENTIETH.test(text)) return { event_type: 'floor.convened', tier: 'P2', features: ['F2'], kind: 'new_day' }
    if (FROM_RECESS.test(text)) return { event_type: 'floor.convened', tier: 'P3', features: ['F2'], kind: 'from_recess' }
  }
  if (actId === 'H61000') {
    // Sine die first: "do now adjourn Sine Die." (20250103 uid 51338) also matches the plain adjourn sentence.
    if (SINE_DIE.test(text)) return { event_type: 'floor.adjourned', tier: 'P1', features: ['F2', 'F7'], kind: 'sine_die' }
    if (ADJOURNED.test(text)) return { event_type: 'floor.adjourned', tier: 'P2', features: ['F2', 'F7'], kind: 'adjourned' }
    if (RECESS.test(text)) return { event_type: 'floor.recess', tier: 'P3', features: ['F2'], kind: 'recess' }
  }
  // A vote result line is a floor.action related to the vote key, deliberately NOT vote.result: the official roll call
  // (house.clerk.votes) owns that dedup_key (DESIGN §0.1, R-11).
  if (hasVote) return { event_type: 'floor.action', tier: 'P2', features: ['F2', 'F5'], kind: 'vote' }
  return { event_type: 'floor.action', tier: 'P3', features: ['F2'], kind: 'other' }
}

// `<action_item>` as the Clerk prints it (all 380 in the recorded files: `H.R. N`, `H. Res. N`, `H.J. Res. N`,
// `H. Con. Res. N`, `S. N`, `S. Con. Res. N`; the two Senate resolution kinds by symmetry). We re-format the number
// ourselves (D-043: identifiers only in titles). Anything else only loses the "on …" part of the title.
const ACTION_ITEM: ReadonlyArray<[RegExp, BillType]> = [
  [/^H\. ?R\. ?([1-9][0-9]{0,5})$/, 'hr'],
  [/^H\. ?Res\. ?([1-9][0-9]{0,5})$/, 'hres'],
  [/^H\. ?J\. ?Res\. ?([1-9][0-9]{0,5})$/, 'hjres'],
  [/^H\. ?Con\. ?Res\. ?([1-9][0-9]{0,5})$/, 'hconres'],
  [/^S\. ?([1-9][0-9]{0,5})$/, 's'],
  [/^S\. ?Res\. ?([1-9][0-9]{0,5})$/, 'sres'],
  [/^S\. ?J\. ?Res\. ?([1-9][0-9]{0,5})$/, 'sjres'],
  [/^S\. ?Con\. ?Res\. ?([1-9][0-9]{0,5})$/, 'sconres'],
]

/** `H.J. Res. 1` -> `H.J.Res. 1` (our wording); null when outside the table. */
export function fmtActionItem(item: string): string | null {
  const t = collapseWs(item)
  for (const [re, type] of ACTION_ITEM) {
    const m = re.exec(t)
    if (m) return fmtBill(type, Number(m[1]))
  }
  return null
}

function titleOf(cls: FloorClass, rolls: number[], item: string | null): string {
  switch (cls.kind) {
    case 'new_day': return 'House convened for a new legislative day'
    case 'from_recess': return 'House returned from a recess'
    case 'sine_die': return 'House adjourned its session (sine die)'
    case 'adjourned': return 'House adjourned'
    case 'recess': return 'House went into recess'
    case 'vote': {
      const list = rolls.length === 1 ? `roll call ${rolls[0]}` : `roll calls ${rolls.slice(0, -1).join(', ')} and ${rolls[rolls.length - 1]}`
      const what = rolls.length === 1 ? 'the result' : 'the results'
      return `House floor recorded ${what} of ${list}${item ? ` on ${item}` : ''}`
    }
    default: return item ? `House floor action on ${item}` : 'House floor proceedings entry'
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Times (DESIGN §1.3, §1.6, R-13): naive Eastern; nonexistent = drift; ambiguous = null + result.time_note.

const FOR_SEARCH = /^(\d{4})(\d{2})(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
const UPDATED = /^(\d{4})(\d{2})(\d{2})T(\d{2}):(\d{2})$/
const CONVENES = /^(\d{4})(\d{2})(\d{2})T(\d{2}):(\d{2})$/

type WallTime = { ok: true; utc: string | null; wall: string; date: string; y: number; mo: number; d: number; h: number; mi: number } | { ok: false; detail: string }

/** A naive Clerk wall time -> UTC; `utc` null when ambiguous (fall-back hour). Malformed / nonexistent -> not ok. */
function wallTime(value: string, re: RegExp, what: string): WallTime {
  const m = re.exec(value)
  if (!m) return { ok: false, detail: `${what} "${value}" is not in the recorded format` }
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((i) => Number(m[i])) as [number, number, number, number, number]
  const s = m[6] === undefined ? 0 : Number(m[6])
  const r = easternToUtc(y, mo, d, h, mi, s)
  if (!r.ok && r.reason !== 'ambiguous') return { ok: false, detail: `${what} "${value}" is ${r.reason === 'nonexistent' ? 'a wall time that does not exist in Eastern time (spring forward)' : 'not a real date/time'}` }
  const wall = `${ymd(y, mo, d)}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return { ok: true, utc: r.ok ? r.utc : null, wall, date: ymd(y, mo, d), y, mo, d, h, mi }
}

/** a later than b: by instant when both are known, else by Eastern wall clock (only the fall-back hour differs). */
function later(a: { utc: string | null; wall: string }, b: { utc: string | null; wall: string }): boolean {
  return a.utc !== null && b.utc !== null ? a.utc > b.utc : a.wall > b.wall
}

// ---------------------------------------------------------------------------------------------------------------------
// Links inside <action_description>.

// `http://clerk.house.gov/cgi-bin/vote.asp?year=2026&amp;rollnumber=293` (33 of 33 recorded; attrsOf decodes &amp;).
const VOTE_HREF = /^https?:\/\/clerk\.house\.gov\/cgi-bin\/vote\.asp\?year=(\d{4})&rollnumber=([0-9]{1,5})$/
// `https://www.congress.gov/bill/119th-congress/house-bill/2388`.
const BILL_HREF = /^https:\/\/www\.congress\.gov\/bill\/([1-9][0-9]{0,2})(?:st|nd|rd|th)-congress\/([a-z-]+)\/([1-9][0-9]{0,5})$/

type Links = { ok: true; votes: Array<{ key: string; roll: number }>; bills: string[] } | { ok: false; detail: string }

function links(description: string): Links {
  const votes: Array<{ key: string; roll: number }> = []
  const bills: string[] = []
  for (const m of description.matchAll(/<a(?=[\s/>])[^>]*>/g)) {
    const a = attrsOf(m[0])
    if (a === null) return { ok: false, detail: `a malformed link tag ${m[0].slice(0, 80)}` }
    if (a.rel === 'vote') {
      // A vote link decides the type and tier and names the vote key: one we cannot read is drift (not a lost link).
      const v = VOTE_HREF.exec(a.href ?? '')
      const cs = v ? congressSessionOfYear(Number(v[1])) : null
      const roll = v ? Number(v[2]) : 0
      if (!v || !cs || roll < 1) return { ok: false, detail: `a vote link we cannot read: href "${a.href ?? ''}"` }
      // The §3.1 year rule, NOT the current session: 20250103.xml links year=2025 rolls 1..5 = vote:house:119:1:* (T6).
      const key = `vote:house:${cs.congress}:${cs.session}:${roll}`
      if (!votes.some((x) => x.key === key)) votes.push({ key, roll })
    } else if (a.rel === 'bill') {
      // An unknown href shape or segment only loses the related key (DESIGN §3.0), never the payload.
      const b = BILL_HREF.exec(a.href ?? '')
      const type = b ? floorBillType(b[2]!) : null
      if (b && type) {
        const key = billKey(Number(b[1]), type, Number(b[3]))
        if (!bills.includes(key)) bills.push(key)
      }
    }
  }
  return { ok: true, votes, bills }
}

// ---------------------------------------------------------------------------------------------------------------------
// One <floor_action> block -> its parts (strict shape: the recorded files hold exactly these, 443 of 443 actions).

interface Action {
  uid: string
  actId: string
  forSearch: WallTime & { ok: true }
  updated: WallTime & { ok: true }
  text: string
  item: string | null
  description: string
}

const ACTION_ATTRS = ['act-id', 'unique-id', 'update-date-time']

function readAction(b: XmlBlock, n: number): { ok: true; action: Action } | { ok: false; detail: string } {
  const at = `action ${n + 1}`
  const a = attrsOf(b.openTag)
  if (a === null) return { ok: false, detail: `${at}: a malformed <floor_action> tag` }
  const names = Object.keys(a).sort()
  if (names.join(' ') !== [...ACTION_ATTRS].sort().join(' ')) return { ok: false, detail: `${at}: <floor_action> attributes are [${names.join(', ')}], recorded [${ACTION_ATTRS.join(', ')}]` }
  const uid = a['unique-id']!
  if (!/^[0-9]{1,10}$/.test(uid)) return { ok: false, detail: `${at}: unique-id "${uid}" is not digits` }
  const actId = a['act-id']!
  if (!/^H[0-9A-Z]{5}$/.test(actId)) return { ok: false, detail: `${at} (uid ${uid}): act-id "${actId}" is not in the recorded format` }
  const updated = wallTime(a['update-date-time']!, UPDATED, `uid ${uid} update-date-time`)
  if (!updated.ok) return { ok: false, detail: updated.detail }

  // Children: exactly one action_time, at most one action_item, exactly one action_description, nothing else.
  const times = blocks(b.inner, 'action_time')
  const items = blocks(b.inner, 'action_item')
  const descs = blocks(b.inner, 'action_description')
  if (!times.ok || !items.ok || !descs.ok) return { ok: false, detail: `uid ${uid}: unbalanced child elements` }
  if (times.blocks.length !== 1 || descs.blocks.length !== 1 || items.blocks.length > 1) {
    return { ok: false, detail: `uid ${uid}: ${times.blocks.length} <action_time>, ${items.blocks.length} <action_item>, ${descs.blocks.length} <action_description> (recorded 1, 0-1, 1)` }
  }
  let rest = b.inner
  for (const x of [times.blocks[0]!, items.blocks[0], descs.blocks[0]!]) if (x) rest = rest.replace(x.raw, '')
  if (rest.trim() !== '') return { ok: false, detail: `uid ${uid}: unexpected content in <floor_action>: ${collapseWs(rest).slice(0, 80)}` }

  const ta = attrsOf(times.blocks[0]!.openTag)
  if (ta === null || Object.keys(ta).join() !== 'for-search') return { ok: false, detail: `uid ${uid}: <action_time> attributes are not [for-search]` }
  const forSearch = wallTime(ta['for-search']!, FOR_SEARCH, `uid ${uid} for-search`)
  if (!forSearch.ok) return { ok: false, detail: forSearch.detail }

  const description = descs.blocks[0]!.inner
  if (hasUnknownEntity(description)) return { ok: false, detail: `uid ${uid}: an entity outside the XML five and numeric references` }
  // The §3.3 text rule (verified 443/443 by the scout): strip tags, decode entities, collapse whitespace, trim.
  const text = collapseWs(innerText(description))
  if (text === '') return { ok: false, detail: `uid ${uid}: an empty <action_description>` }
  const item = items.blocks[0] ? collapseWs(innerText(items.blocks[0].inner)) : null
  return { ok: true, action: { uid, actId, forSearch, updated, text, item, description } }
}

// ---------------------------------------------------------------------------------------------------------------------

function parseFeed(res: FetchedResponse): Out {
  const E = 'feed'
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('html') || !ct.includes('xml')) return fail(E, 'drift', `content-type "${ct}" is not RSS/XML`)
  const body = stripBom(res.body) // the Clerk's feed starts with a UTF-8 BOM (Home_Feed_rss.xml)
  if (rootName(body) !== 'rss') return fail(E, 'drift', `root element <${rootName(body) ?? '?'}> is not <rss>`)
  if (!endsWithClose(body, ['</channel>', '</rss>'])) return fail(E, 'drift', 'truncated: the body does not end with </channel></rss>')
  const items = blocks(body, 'item')
  if (!items.ok) return fail(E, 'drift', items.detail)
  const seen = items.blocks.length
  // The feed always lists the latest legislative day's actions (in recess too: 7 items for 10/01 on Sat 10/03); an empty
  // channel looks exactly like a renamed <item>, so it is drift, never "quiet" (the wh.feeds rule).
  if (seen === 0) return fail(E, 'drift', 'the feed lists no items')
  const dates = new Set<string>()
  for (const [n, it] of items.blocks.entries()) {
    const title = textOf(it.inner, 'title')
    const m = title === null ? null : /^Legislative Day of (\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(collapseWs(title))
    if (!m || !isRealDate(Number(m[3]), Number(m[1]), Number(m[2]))) return fail(E, 'drift', `item ${n + 1}: title ${JSON.stringify(title)} is not "Legislative Day of MM/DD/YYYY"`, seen)
    dates.add(`${m[3]}${m[1]!.padStart(2, '0')}${m[2]!.padStart(2, '0')}`)
  }
  // maxTargets 1: the latest day named (every recorded item names one day; two would be a day changing over).
  const latest = [...dates].sort().at(-1)!
  const iso = `${latest.slice(0, 4)}-${latest.slice(4, 6)}-${latest.slice(6)}`
  const detail = `${seen} items; current legislative day ${iso}${dates.size > 1 ? ` (the feed names ${dates.size} days; the latest is polled)` : ''}`
  return { events: [], health: health(E, 'ok', detail, seen), targets: [{ endpoint: 'day', url: dayUrl(latest) }] }
}

function parseDay(endpointId: string, res: FetchedResponse): Out {
  const E = endpointId
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('html') || !ct.includes('xml')) return fail(E, 'drift', `content-type "${ct}" is not XML (an HTML page instead of the day file)`)
  const body = res.body
  const root = rootName(body)
  if (root !== 'legislative_activity') return fail(E, 'drift', `root element <${root ?? '?'}> is not <legislative_activity>`)
  if (!endsWithClose(body, ['</floor_actions>', '</legislative_activity>'])) return fail(E, 'drift', 'truncated: the body does not end with </floor_actions></legislative_activity>')
  const u = DAY_URL.exec(res.url)
  if (!u) return fail(E, 'error', `requested URL ${res.url} is not a day file (${DAY_URL_TEMPLATE})`)
  const fileDate = u[1]!

  // Header elements (everything before <floor_actions>).
  const headEnd = body.indexOf('<floor_actions>')
  if (headEnd < 0) return fail(E, 'drift', 'no <floor_actions> element')
  const header = body.slice(0, headEnd)
  const dayB = blocks(header, 'legislative_day')
  const congB = blocks(header, 'legislative_congress')
  if (!dayB.ok || !congB.ok || dayB.blocks.length !== 1 || congB.blocks.length !== 1) return fail(E, 'drift', 'the header does not hold exactly one <legislative_day> and one <legislative_congress>')
  const dayDate = attrsOf(dayB.blocks[0]!.openTag)?.date ?? ''
  if (!/^\d{8}$/.test(dayDate) || !isRealDate(Number(dayDate.slice(0, 4)), Number(dayDate.slice(4, 6)), Number(dayDate.slice(6)))) return fail(E, 'drift', `legislative_day date "${dayDate}" is not YYYYMMDD`)
  // Inferred guard: the file named by the URL is the legislative day it says it is.
  if (dayDate !== fileDate) return fail(E, 'drift', `legislative_day date ${dayDate} is not the URL's date ${fileDate}`)
  const legislativeDay = `${dayDate.slice(0, 4)}-${dayDate.slice(4, 6)}-${dayDate.slice(6)}`
  const congAttr = attrsOf(congB.blocks[0]!.openTag)?.congress ?? ''
  const single = /^([1-9][0-9]{1,2})$/.exec(congAttr)
  const pair = /^([1-9][0-9]{1,2}):([1-9][0-9]{1,2})$/.exec(congAttr)
  if (!single && !pair) return fail(E, 'drift', `legislative_congress congress "${congAttr}" is neither N nor N:M`)
  if (pair && Number(pair[1]) !== Number(pair[2]) + 1) return fail(E, 'drift', `legislative_congress congress "${congAttr}" is not two Congresses in a row (new:old)`)

  // Head-only (§3.3): the newest 50 actions, but the whole file when the Congress changes inside it (20250103.xml: the
  // 20th-Amendment convene is action 75 of 85, critique B2).
  const total = countBlocks(body, 'floor_action')
  const limit = pair ? Number.POSITIVE_INFINITY : HEAD_ACTIONS
  const scan = blocks(body, 'floor_action', limit, headEnd)
  if (!scan.ok) return fail(E, 'drift', scan.detail, total)
  if (total === 0) return { events: [], health: health(E, 'empty', 'the day file lists no floor actions', 0) }

  const actions: Action[] = []
  const uids = new Set<string>()
  for (const [n, b] of scan.blocks.entries()) {
    const r = readAction(b, n)
    if (!r.ok) return fail(E, 'drift', r.detail, total)
    if (uids.has(r.action.uid)) return fail(E, 'drift', `duplicate unique-id ${r.action.uid} in one payload`, total)
    uids.add(r.action.uid)
    actions.push(r.action)
  }

  // Congress of each action. A pair splits at the H20100 "pursuant to the 20th amendment" convene: it and everything at
  // or after it get the new Congress (20250103 uid 4 -> 119), everything before it the old one (uid 51338 -> 118). Ids
  // restart per Congress only, so the key carries the Congress and not the session (R-6).
  const congressOf: number[] = []
  if (single) {
    congressOf.push(...actions.map(() => Number(single[1])))
  } else {
    const splits = actions.map((a, i) => (a.actId === 'H20100' && /pursuant to the 20th amendment/i.test(a.text) ? i : -1)).filter((i) => i >= 0)
    if (splits.length !== 1) return fail(E, 'drift', `congress "${congAttr}" but ${splits.length} 20th-Amendment convene entries (need exactly 1 to split the Congresses)`, total)
    const s = actions[splits[0]!]!
    for (const [i, a] of actions.entries()) {
      const isNew = a.forSearch.wall === s.forSearch.wall ? i <= splits[0]! : later(a.forSearch, s.forSearch)
      congressOf.push(Number(isNew ? pair![1] : pair![2]))
    }
  }

  const fetched = res.fetchedAt
  const source = { source_id: SOURCE_ID, url: dayUrl(dayDate), retrieved_at: fetched, license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' as const }
  const events: CedEvent[] = []
  let unknownItems = 0
  let timeNotes = 0

  // Next meeting (§3.3): the distinct next-legislative-day-convenes values later than every action in the file, one event
  // per distinct DATE (20260103.xml prints the same 20260106T18:30 twice, critique T4); two times for one date = drift.
  // An element without the attribute is skipped (the in-progress shape is unseen; never drift every live poll, R-6).
  const newest = actions.reduce((m, a) => (later(a.forSearch, m.forSearch) ? a : m), actions[0]!).forSearch
  const byDate = new Map<string, WallTime & { ok: true }>()
  for (const m of body.matchAll(/<legislative_day_finished(?=[\s/>])[^>]*>/g)) {
    const a = attrsOf(m[0])
    if (a === null) return fail(E, 'drift', 'a malformed <legislative_day_finished> tag', total)
    const v = a['next-legislative-day-convenes']
    if (v === undefined || v === '') continue
    const w = wallTime(v, CONVENES, 'next-legislative-day-convenes')
    if (!w.ok) return fail(E, 'drift', w.detail, total)
    if (!later(w, newest)) continue // already past within this file (20250103.xml's 20250103T12:00)
    const prev = byDate.get(w.date)
    if (prev && prev.wall !== w.wall) return fail(E, 'drift', `two different next-meeting times for ${w.date} (${prev.wall.slice(11, 16)} and ${w.wall.slice(11, 16)})`, total)
    byDate.set(w.date, w)
  }
  const scheduledDates = [...byDate.keys()].sort()
  for (const date of scheduledDates) {
    const w = byDate.get(date)!
    const raw = `${date.replace(/-/g, '')}T${w.wall.slice(11, 16)}`
    const result: Record<string, unknown> = { convene_date: date }
    if (w.utc === null) {
      result.time_note = `next-legislative-day-convenes ${raw} falls in the repeated fall-back hour; scheduled_for left null`
      timeNotes++
    }
    events.push(finalizeEvent({
      dedup_key: `floor_day:house:${date}#scheduled_convene`,
      object_key: `floor_day:house:${date}`,
      event_type: 'floor.convened',
      status: 'scheduled',
      branch: 'legislative',
      body: 'house',
      features: ['F7'],
      title: `House scheduled to meet ${fmtWeekdayMonthDay(w.y, w.mo, w.d)}, at ${fmtClock12(w.h, w.mi)} Eastern`,
      // The attribute verbatim: the file has no prose for it.
      official_text: `next legislative day convenes ${raw}`,
      importance: { tier: 'P3', reasons: ['floor_schedule'] },
      times: { occurred_at: null, scheduled_for: w.utc, source_published_at: null, first_seen_at: fetched },
      result,
      sources: [source],
      revision: 1,
      provenance: { parser: HOUSE_FLOOR_PARSER, confidence: 'high' },
    }))
  }

  for (const [i, a] of actions.entries()) {
    const l = links(a.description)
    if (!l.ok) return fail(E, 'drift', `uid ${a.uid}: ${l.detail}`, total)
    const cls = classifyAction(a.actId, a.text, l.votes.length > 0)
    const item = a.item === null ? null : fmtActionItem(a.item)
    if (a.item !== null && item === null) unknownItems++
    const title = titleOf(cls, l.votes.map((v) => v.roll), item)
    const related: Array<{ rel: string; key: string }> = []
    // The actual convene links the scheduled one (critique C3): floor_day:house:{Eastern date of its for-search}.
    if (cls.kind === 'new_day') related.push({ rel: 'about', key: `floor_day:house:${a.forSearch.date}` })
    for (const v of l.votes) related.push({ rel: 'about', key: v.key })
    for (const k of l.bills) related.push({ rel: 'about', key: k })
    const result: Record<string, unknown> = { legislative_day: legislativeDay, act_id: a.actId }
    const notes: string[] = []
    if (a.forSearch.utc === null) notes.push(`for-search ${a.forSearch.wall} falls in the repeated fall-back hour; occurred_at left null`)
    if (a.updated.utc === null) notes.push(`update-date-time ${a.updated.wall.slice(0, 16)} falls in the repeated fall-back hour; source_published_at left null`)
    if (notes.length > 0) {
      result.time_note = notes.join('; ')
      timeNotes++
    }
    const objectKey = `floor:house:${congressOf[i]}:${Number(a.uid)}`
    events.push(finalizeEvent({
      dedup_key: `${objectKey}#entry`,
      object_key: objectKey,
      event_type: cls.event_type,
      status: 'ended',
      branch: 'legislative',
      body: 'house',
      features: cls.features,
      title: title.length <= TITLE_MAX ? title : `${title.slice(0, TITLE_MAX - 1)}…`,
      official_text: a.text.length <= OFFICIAL_MAX ? a.text : `${a.text.slice(0, OFFICIAL_MAX - 1)}…`,
      importance: { tier: cls.tier, reasons: ['floor_entry'] },
      times: { occurred_at: a.forSearch.utc, scheduled_for: null, source_published_at: a.updated.utc, first_seen_at: fetched },
      ...(related.length > 0 ? { related } : {}),
      result,
      sources: [source],
      revision: 1,
      provenance: { parser: HOUSE_FLOOR_PARSER, confidence: 'high' },
    }))
  }

  // A `day` parse names the next meeting's file (only the latest date; never the file just parsed).
  const targets: Target[] = []
  const nextDate = scheduledDates.at(-1)
  if (endpointId === 'day' && nextDate !== undefined && nextDate.replace(/-/g, '') !== dayDate) {
    targets.push({ endpoint: 'next_day', url: dayUrl(nextDate.replace(/-/g, '')) })
  }

  const parts = [scan.more ? `newest ${actions.length} of ${total} actions` : `${total} actions`]
  if (pair) parts.push(`whole file scanned (Congress ${congAttr})`)
  parts.push(`legislative day ${legislativeDay}`)
  parts.push(scheduledDates.length > 0 ? `next meeting ${scheduledDates.join(', ')}` : 'no next meeting announced')
  if (unknownItems > 0) parts.push(`${unknownItems} action_item value(s) outside the bill table (title left generic)`)
  if (timeNotes > 0) parts.push(`${timeNotes} event(s) with an ambiguous fall-back wall time (time left null)`)
  return { events, health: health(E, 'ok', parts.join('; '), total), ...(targets.length > 0 ? { targets } : {}) }
}

/**
 * Pure: one response in, events + one health signal (+ targets) out. Common prelude (DESIGN §3.0): 304 -> not_modified;
 * non-200 -> error (the next_day 404 "not posted yet" never reaches here live: the poller maps it to empty through
 * notYetStatus); then content-type, root and envelope; any failure after that is drift with nothing emitted.
 */
export function parseHouseFloor(endpointId: string, res: FetchedResponse): AdapterOutput {
  if (endpointId !== 'feed' && endpointId !== 'day' && endpointId !== 'next_day') {
    return { events: [], health: health(endpointId, 'error', `unknown endpoint "${endpointId}"`) }
  }
  if (res.status === 304) return fail(endpointId, 'not_modified', 'HTTP 304: nothing changed since the last poll')
  if (res.status !== 200) {
    const hint = res.status === 404 && endpointId === 'next_day' ? ' (the next day file is not posted yet)' : ''
    return fail(endpointId, 'error', `HTTP ${res.status}${hint}`)
  }
  return endpointId === 'feed' ? parseFeed(res) : parseDay(endpointId, res)
}

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
  parse: parseHouseFloor,
}

// senate.lis.votes — Senate roll call votes from the Legislative Information System (senate.gov LIS): one vote.result
// event + one member-vote side record per vote. Design: scratch/phase2/DESIGN.md §3.2 (mapping, titles, drift checks,
// tests), §2 (records), §1.3-§1.6 (times, keys, tiers). FIXTURE-ONLY (D-058): exported through
// `@ced/adapters/fixture-only`, never in SOURCES.
//
// Two endpoints:
// - `menu` (vote_menu_119_2.xml, ~165 KB, newest first): head-only. Only the top 10 <vote> blocks are read; the menu
//   emits NO events (it has no time and abbreviated results), only the dynamic targets for `vote` (DESIGN §3.0).
// - `vote` (vote_{c}_{s}_{NNNNN}.xml, ~29 KB; 87 KB for an en bloc vote): the slice before <members> is parsed with
//   fast-xml-parser (validated first, the lib/rss.ts pattern); the 100 <member> blocks are cut by a forward scan and
//   read with one strict regex each.
//
// Fail closed (DESIGN §0.2, R-14): any structure we did not record, an unknown value in a closed vocabulary that decides
// `passed` or a position, a count that does not reproduce its member rows, an impossible Eastern time, or more than
// `maxUnresolved` unknown LIS ids = health `drift` with zero events, records and targets. An unknown QUESTION only
// words the title, so it publishes at P3 with a neutral title and a health detail, unless it mentions a veto (drift:
// the P0 class must never be silently demoted). Pure: no network, no clock (the clock is res.fetchedAt).
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { finalizeEvent, type CedEvent, type Tier } from '@ced/schema'
import type { MemberPosition, MemberVotesRecord, VoteRequired, VoteResult } from '@ced/schema/v02'
import type { AdapterOutput, FetchedResponse, HealthSignal, HealthStatus, SourceDefinition, Target } from '../types.js'
import { CURRENT, billKey, fmtBill, nominationKey, senateDocumentType, type BillType } from '../lib/congress_ids.js'
import { MONTHS, easternToUtc, hour24 } from '../lib/eastern.js'
import { DEFAULT_VOTE_OPTIONS, type ParseVoteOptions } from '../lib/members.js'
import { xmlTextProblem } from '../lib/rss.js'
import {
  attrsOf, blocks, collapseWs, countBlocks, decodeEntities, endsWithClose, firstBlock, hasUnknownEntity, rootName,
  stripBom, textOf,
} from '../lib/xmlscan.js'

export const SOURCE_ID = 'senate.lis.votes'
export const SENATE_VOTES_PARSER = 'senate_lis_votes@0.1.0'

const CS = `${CURRENT.congress}_${CURRENT.session}`
/** The session's vote menu, newest first (head-only: the top 10 <vote> blocks). */
export const MENU_URL = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${CS}.xml`
/** Human-readable template of a vote XML URL; the real URLs come from the menu parse (AdapterOutput.targets). */
export const VOTE_URL_TEMPLATE = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CURRENT.congress}${CURRENT.session}/vote_${CS}_{NNNNN}.xml`
/** = `^https://www\.senate\.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_[0-9]{5}\.xml$` for 119-2 (§3.2). */
export const VOTE_URL_PATTERN = `^https://www\\.senate\\.gov/legislative/LIS/roll_call_votes/vote${CURRENT.congress}${CURRENT.session}/vote_${CS}_[0-9]{5}\\.xml$`
/** How many of the menu's newest votes become `vote` targets (= the endpoint's maxTargets; critique B6). */
export const MENU_TOP = 10

/** The URL of one vote of the current session (`num` = the menu's 5-digit vote_number). */
export function voteUrl(num: string): string {
  return VOTE_URL_TEMPLATE.replace('{NNNNN}', num)
}

/** senate.gov's 200 HTML page for a session menu that does not exist yet (vote_menu_120_1, 2026-10-03): health error. */
export const MENU_NOT_POSTED_TITLE = 'U.S. Senate: 404 Error Page'
/** senate.gov's 200 HTML page for a vote file that is not available (vote_119_2_00257, 2026-10-03): health error. */
export const VOTE_UNAVAILABLE_TITLE = 'U.S. Senate: Roll Call Vote Unavailable'

// ---------------------------------------------------------------------------------------------------------------
// Output helpers

function health(endpoint: string, status: HealthStatus, detail: string, items_seen: number): HealthSignal {
  return { source_id: SOURCE_ID, endpoint, status, detail, items_seen }
}
/** A payload refused (or not parsed) whole: zero events, records and targets. */
function fail(endpoint: string, status: HealthStatus, detail: string, items_seen = 0): AdapterOutput {
  return { events: [], health: health(endpoint, status, detail, items_seen) }
}

const contentType = (res: FetchedResponse): string => (res.headers['content-type'] ?? '').toLowerCase().trim()
const isHtml = (ct: string): boolean => /^text\/html\s*(;|$)/.test(ct)
/** DESIGN §3.2: the LIS serves `text/xml` (every recorded menu and vote); anything else is drift. */
const isXml = (ct: string): boolean => /^text\/xml\s*(;|$)/.test(ct)

/** The <title> of an HTML page, entities decoded and whitespace collapsed; null when there is none. */
function htmlTitle(body: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)
  return m ? collapseWs(decodeEntities(m[1] ?? '')) : null
}

/** The common prelude (DESIGN §3.0): 304 -> not_modified, non-200 -> error. null = go on parsing. */
function prelude(endpoint: string, res: FetchedResponse): AdapterOutput | null {
  if (res.status === 304) return fail(endpoint, 'not_modified', 'HTTP 304: not modified since the last poll')
  if (res.status !== 200) return fail(endpoint, 'error', `HTTP ${res.status}`)
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// menu

/**
 * The vote menu: no events, only the top MENU_TOP vote numbers as `vote` targets (DESIGN §3.2). Drift on: not text/xml
 * (except the "404 Error Page" HTML, which is error "session menu not posted", §3.0), root not <vote_summary>, a body
 * that does not end with </votes></vote_summary> (truncated), the menu's congress/session not CURRENT, a top <vote>
 * without a 5-digit vote_number, without a vote-level <result> and without <en_bloc><matter>, or top numbers that are
 * not strictly decreasing (the head-only cut relies on newest-first).
 */
function parseMenu(res: FetchedResponse): AdapterOutput {
  const ep = 'menu'
  const pre = prelude(ep, res)
  if (pre) return pre
  const ct = contentType(res)
  const body = stripBom(res.body)
  if (isHtml(ct)) {
    const title = htmlTitle(body)
    if (title === MENU_NOT_POSTED_TITLE) {
      return fail(ep, 'error', `session menu not posted: senate.gov answered its "${MENU_NOT_POSTED_TITLE}" page (a new session before its first vote, or a moved file); retried at backoff`)
    }
    return fail(ep, 'drift', `an HTML page (${title === null ? 'no <title>' : `"${title}"`}) instead of the vote menu`)
  }
  if (!isXml(ct)) return fail(ep, 'drift', `content-type "${ct}" is not text/xml`)
  if (rootName(body) !== 'vote_summary') return fail(ep, 'drift', `root element <${rootName(body) ?? '?'}> is not <vote_summary>`)
  if (!endsWithClose(body, ['</votes>', '</vote_summary>'])) {
    return fail(ep, 'drift', 'the menu does not end with </votes></vote_summary> (truncated download?)')
  }
  const votesOpen = /<votes\s*(\/?)>/.exec(body)
  if (!votesOpen) return fail(ep, 'drift', 'no <votes> element')
  const head = body.slice(0, votesOpen.index)
  const congress = textOf(head, 'congress')
  const session = textOf(head, 'session')
  if (congress?.trim() !== String(CURRENT.congress) || session?.trim() !== String(CURRENT.session)) {
    return fail(ep, 'drift', `the menu is for congress ${congress ?? '?'} session ${session ?? '?'}, not ${CURRENT.congress}-${CURRENT.session}`)
  }
  const total = countBlocks(body, 'vote')
  if (votesOpen[1] === '/' || total === 0) {
    if (total !== 0) return fail(ep, 'drift', 'an empty <votes/> element followed by <vote> blocks', total)
    return { events: [], health: health(ep, 'empty', 'the menu lists no votes yet (zero targets)', 0), targets: [] }
  }
  const scan = blocks(body, 'vote', MENU_TOP, votesOpen.index)
  if (!scan.ok) return fail(ep, 'drift', scan.detail, total)
  const numbers: string[] = []
  for (const [i, b] of scan.blocks.entries()) {
    const at = `menu vote ${i + 1}`
    const num = textOf(b.inner, 'vote_number')
    if (num === null || !/^\d{5}$/.test(num)) return fail(ep, 'drift', `${at}: vote_number ${JSON.stringify(num)} is not 5 digits`, total)
    const enBloc = firstBlock(b.inner, 'en_bloc')
    const outer = enBloc ? b.inner.slice(0, enBloc.start) + b.inner.slice(enBloc.end) : b.inner
    const result = textOf(outer, 'result')
    const hasResult = result !== null && collapseWs(result) !== ''
    const hasMatter = enBloc !== null && firstBlock(enBloc.inner, 'matter') !== null
    if (!hasResult && !hasMatter) return fail(ep, 'drift', `${at} (${num}): neither a vote-level <result> nor <en_bloc><matter>`, total)
    const prev = numbers[numbers.length - 1]
    if (prev !== undefined && !(Number(num) < Number(prev))) {
      return fail(ep, 'drift', `${at}: vote ${num} follows ${prev}; the menu is no longer newest first`, total)
    }
    numbers.push(num)
  }
  const targets: Target[] = numbers.map((n) => ({ endpoint: 'vote', url: voteUrl(n) }))
  const span = numbers.length > 1 ? `${numbers[0]} down to ${numbers[numbers.length - 1]}` : numbers[0]
  return {
    events: [],
    health: health(ep, 'ok', `${total} votes listed; the newest ${numbers.length} (${span}) are vote targets`, total),
    targets,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// vote: closed vocabularies

type QuestionKind =
  | 'nomination' | 'cloture' | 'passage' | 'veto_override' | 'resolution' | 'amendment' | 'table' | 'motion'
  | 'point_of_order' | 'impeachment_verdict' | 'unknown'
type QuestionForm = 'plain' | 'proceed' | 'discharge'
type DocKind = BillType | 'nomination' | 'amendment'

/** One question's closed vocabulary (review 483d7ab F1/F2): the `vote_result` phrases it may carry, each the WHOLE
 * phrase `{prefix} {outcome}` (lower-cased after collapse), and the document kinds it may be about (null = any). */
interface QuestionRow {
  kind: QuestionKind
  form: QuestionForm
  /** prefix ('' = the outcome alone) -> the outcomes allowed after it. */
  results: ReadonlyArray<readonly [string, readonly Outcome[]]>
  docs: ReadonlySet<DocKind> | null
}

// The outcome words, longest first (so "not well taken" is read before "well taken" and "not guilty" before "guilty": the
// suffix trap). Never from the tally: 00254 is 57-43 Rejected (3/5), 00009 is 50-50 Well Taken (the Vice President).
type Outcome = 'agreed to' | 'rejected' | 'confirmed' | 'passed' | 'well taken' | 'not well taken' | 'guilty' | 'not guilty' | 'veto overridden' | 'veto sustained'
const OUTCOMES: ReadonlyArray<readonly [Outcome, boolean]> = [
  ['not well taken', false], ['veto overridden', true], ['veto sustained', false], ['not guilty', false], ['well taken', true],
  ['agreed to', true], ['confirmed', true], ['rejected', false], ['passed', true], ['guilty', true],
]

const AGREE: readonly Outcome[] = ['agreed to', 'rejected']
const BILLS: ReadonlySet<DocKind> = new Set<DocKind>(['hr', 'hres', 'hjres', 'hconres', 's', 'sres', 'sjres', 'sconres'])
const row = (kind: QuestionKind, form: QuestionForm, results: QuestionRow['results'], docs: readonly DocKind[] | null): QuestionRow =>
  ({ kind, form, results, docs: docs === null ? null : new Set(docs) })

/**
 * `/question`, lower-cased after whitespace collapse (DESIGN §3.2; every question in the 10-02 menu is listed), with the
 * result phrases and document kinds recorded for it (fixtures/senate.lis.votes, the 10-02 menu's <question>/<result>/
 * <issue> columns). A phrase or document outside a question's row is drift: a P0 title must never come from a
 * combination the source did not print together (00256 with "Guilty" or "Nomination Not Confirmed" published
 * "Senate confirmed nomination PN1129" before this table).
 */
const QUESTIONS = new Map<string, QuestionRow>([
  ['on the nomination', row('nomination', 'plain', [['nomination', ['confirmed', 'rejected']]], ['nomination'])],
  ['on the cloture motion', row('cloture', 'plain', [['cloture motion', AGREE]], null)],
  ['on cloture on the motion to proceed', row('cloture', 'proceed', [['cloture on the motion to proceed', AGREE]], [...BILLS, 'nomination'])],
  ['on passage of the bill', row('passage', 'plain', [['bill', ['passed', 'rejected']]], ['s', 'hr'])],
  ['on the joint resolution', row('passage', 'plain', [['joint resolution', ['passed', 'rejected']]], ['sjres', 'hjres'])],
  ['on overriding the veto', row('veto_override', 'plain', [['', ['veto overridden', 'veto sustained']]], ['hr', 's', 'hjres', 'sjres'])],
  ['on the concurrent resolution', row('resolution', 'plain', [['concurrent resolution', AGREE]], ['sconres', 'hconres'])],
  ['on the resolution', row('resolution', 'plain', [['resolution', AGREE]], ['sres', 'hres'])],
  ['on the amendment', row('amendment', 'plain', [['amendment', AGREE]], ['amendment'])],
  ['on the motion to table', row('table', 'plain', [['motion to table', AGREE]], null)],
  ['on the motion', row('motion', 'plain', [['motion', AGREE]], null)],
  ['on the motion to discharge', row('motion', 'discharge', [['motion to discharge', AGREE]], [...BILLS])],
  ['on the motion to proceed', row('motion', 'proceed', [['motion to proceed', AGREE]], [...BILLS, 'nomination'])],
  ['on the point of order', row('point_of_order', 'plain', [['point of order', ['well taken', 'not well taken']]], null)],
  ['guilty or not guilty', row('impeachment_verdict', 'plain', [['', ['guilty', 'not guilty']]], ['hres'])],
])
/** An unknown question publishes at P3 with a neutral title only with one of these outcomes after a prefix of plain
 * words that never says "not" (a veto, verdict or point-of-order outcome on an unknown question is drift). */
const UNKNOWN_OUTCOMES: readonly Outcome[] = ['agreed to', 'rejected', 'confirmed', 'passed']
const NEGATING = /\b(not|no|never|failed|without|un\w*)\b/

const lookupQuestion = (question: string): QuestionRow =>
  QUESTIONS.get(collapseWs(question).toLowerCase()) ?? row('unknown', 'plain', [], null)

/** true / false from the WHOLE result phrase checked against the question's row; null = not in its closed table. */
export function passedOf(question: string, voteResult: string): boolean | null {
  const t = collapseWs(voteResult).toLowerCase()
  const hit = OUTCOMES.find(([o]) => t === o || t.endsWith(` ${o}`))
  if (!hit) return null
  const [outcome, passed] = hit
  const prefix = t.slice(0, t.length - outcome.length).trim()
  const row = lookupQuestion(question)
  if (row.kind === 'unknown') {
    return UNKNOWN_OUTCOMES.includes(outcome) && /^[a-z][a-z .]*$/.test(prefix) && !NEGATING.test(prefix) ? passed : null
  }
  return row.results.some(([p, os]) => p === prefix && os.includes(outcome)) ? passed : null
}
/** An unknown question matching this is drift, not a P3 publish (DESIGN §0.2: the P0 veto class is never demoted). */
const VETO_WORDS = /veto|objections of the president/i

/** DESIGN §1.5 Senate column. */
const TIER: Record<QuestionKind, { tier: Tier; reason: string }> = {
  nomination: { tier: 'P0', reason: 'confirmation' },
  passage: { tier: 'P0', reason: 'final_passage' },
  veto_override: { tier: 'P0', reason: 'veto_override' },
  cloture: { tier: 'P1', reason: 'cloture' },
  resolution: { tier: 'P1', reason: 'resolution' },
  impeachment_verdict: { tier: 'P0', reason: 'impeachment_verdict' }, // D-061 (owner): an impeachment verdict alerts
  amendment: { tier: 'P2', reason: 'amendment' },
  table: { tier: 'P3', reason: 'procedural' },
  motion: { tier: 'P3', reason: 'procedural' },
  point_of_order: { tier: 'P3', reason: 'procedural' },
  unknown: { tier: 'P3', reason: 'unknown_question' },
}

const REQUIRED = new Set<string>(['1/2', '3/5', '2/3'])

/** <vote_cast> text -> bucket (closed; DESIGN §2.1). `Guilty` / `Not Guilty` are counted in yeas / nays (117_1_00059). */
function positionOf(voteCast: string): MemberPosition['position'] | null {
  const t = collapseWs(voteCast).toLowerCase()
  if (t === 'yea' || t === 'guilty') return 'yea'
  if (t === 'nay' || t === 'not guilty') return 'nay'
  if (t === 'not voting') return 'not_voting'
  if (t === 'present' || t.startsWith('present,')) return 'present' // "Present, Giving Live Pair" (115_2_00223)
  return null
}

// Senate date text: "September 30, 2026,  09:29 PM" (TWO spaces after the year's comma; DESIGN §1.6). Matched on the
// element's raw text: a single-space variant is drift, not a guess.
const SENATE_DATE = /^([A-Z][a-z]+) (\d{1,2}), (\d{4}),  (\d{2}):(\d{2}) ([AP]M)$/

/** `wall` = the Eastern wall clock as "YYYY-MM-DDTHH:MM" (sortable; bounds the fall-back hour, where utc is null). */
type TimeRead = { ok: true; utc: string | null; note: string | null; wall: string } | { ok: false; detail: string }

/** Naive Eastern wall time -> UTC. Nonexistent (spring-forward gap) = drift; ambiguous (fall-back hour) = null + note. */
function senateTime(raw: string, field: string): TimeRead {
  const m = SENATE_DATE.exec(raw)
  if (!m) return { ok: false, detail: `<${field}> ${JSON.stringify(raw)} is not "Month D, YYYY,  hh:mm AM|PM"` }
  const mo = (MONTHS as readonly string[]).indexOf(m[1]!) + 1
  const h = hour24(Number(m[4]), m[6] === 'PM')
  if (mo === 0 || h === null) return { ok: false, detail: `<${field}> ${JSON.stringify(raw)} is not a real date and time` }
  const r = easternToUtc(Number(m[3]), mo, Number(m[2]), h, Number(m[5]))
  const wall = `${m[3]}-${String(mo).padStart(2, '0')}-${m[2]!.padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[5]}`
  if (r.ok) return { ok: true, utc: r.utc, note: null, wall }
  if (r.reason === 'ambiguous') {
    return { ok: true, utc: null, note: `<${field}> "${raw}" falls in the repeated fall-back hour (Eastern time), so its instant is unknown`, wall }
  }
  return { ok: false, detail: `<${field}> ${JSON.stringify(raw)} is ${r.reason === 'nonexistent' ? 'a wall time that does not exist in Eastern time (spring-forward gap)' : 'not a real date and time'}` }
}

// ---------------------------------------------------------------------------------------------------------------
// vote: head parsing (fast-xml-parser on the slice before <members>)

// trimValues false + parseTagValue false: every value stays the exact string (the date regex needs its two spaces).
// Attributes are kept (prefixed) so that an attribute we never recorded shows up as an unknown key = drift.
const headParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: true,
  ignoreDeclaration: true,
  isArray: (_name, jpath) => jpath === 'roll_call_vote.document' || jpath === 'roll_call_vote.amendment',
})

const ROOT_TEXT = [
  'congress', 'session', 'congress_year', 'vote_number', 'vote_date', 'modify_date', 'vote_question_text',
  'vote_document_text', 'vote_result_text', 'question', 'vote_title', 'majority_requirement', 'vote_result',
] as const
const ROOT_KEYS = new Set<string>([...ROOT_TEXT, 'document', 'amendment', 'count', 'tie_breaker'])
const DOCUMENT_KEYS = ['document_congress', 'document_type', 'document_number', 'document_name', 'document_title', 'document_short_title'] as const
const AMENDMENT_KEYS = [
  'amendment_number', 'amendment_to_amendment_number', 'amendment_to_amendment_to_amendment_number',
  'amendment_to_document_number', 'amendment_to_document_short_title', 'amendment_purpose',
] as const
const COUNT_KEYS = ['yeas', 'nays', 'present', 'absent'] as const
const TIE_KEYS = ['by_whom', 'tie_breaker_vote'] as const

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** An element's object form holds exactly `keys` as plain text (plus whitespace-only '#text'); else the problem. */
function exactTextKeys(o: unknown, keys: readonly string[], where: string): string | null {
  if (!isObj(o)) return `<${where}> is not one element with child elements`
  for (const k of Object.keys(o)) {
    if (k === '#text') {
      if (typeof o[k] !== 'string' || (o[k] as string).trim() !== '') return `<${where}> holds stray text`
      continue
    }
    if (!keys.includes(k)) return `<${where}> has an element or attribute we never recorded: ${k}`
  }
  for (const k of keys) {
    if (!Object.hasOwn(o, k)) return `<${where}> has no <${k}>`
    if (typeof o[k] !== 'string') return `<${where}><${k}> is not one plain-text element`
  }
  return null
}

interface Head {
  t: Record<(typeof ROOT_TEXT)[number], string>
  documents: Array<Record<(typeof DOCUMENT_KEYS)[number], string>>
  amendments: Array<Record<(typeof AMENDMENT_KEYS)[number], string>>
  count: Record<(typeof COUNT_KEYS)[number], string>
  tie: Record<(typeof TIE_KEYS)[number], string>
}

function parseHead(head: string): { ok: true; head: Head } | { ok: false; detail: string } {
  const v = XMLValidator.validate(head)
  if (v !== true) return { ok: false, detail: `the vote head does not parse as XML: ${v.err.msg} (line ${v.err.line})` }
  const problem = xmlTextProblem(head)
  if (problem) return { ok: false, detail: `the vote head holds ${problem}` }
  let doc: unknown
  try {
    doc = headParser.parse(head)
  } catch (e) {
    return { ok: false, detail: `the vote head does not parse: ${e instanceof Error ? e.message : String(e)}` }
  }
  const root = isObj(doc) ? doc.roll_call_vote : undefined
  if (!isObj(root)) return { ok: false, detail: 'no <roll_call_vote> element with children' }
  for (const k of Object.keys(root)) {
    if (k === '#text') {
      if (typeof root[k] !== 'string' || (root[k] as string).trim() !== '') return { ok: false, detail: '<roll_call_vote> holds stray text' }
    } else if (!ROOT_KEYS.has(k)) return { ok: false, detail: `<roll_call_vote> has an element or attribute we never recorded: ${k}` }
  }
  const t = {} as Head['t']
  for (const k of ROOT_TEXT) {
    const x = root[k]
    if (typeof x !== 'string') return { ok: false, detail: x === undefined ? `no <${k}>` : `<${k}> is not one plain-text element` }
    t[k] = x
  }
  const docs = root.document
  const amds = root.amendment
  if (!Array.isArray(docs) || docs.length === 0) return { ok: false, detail: 'no <document>' }
  if (!Array.isArray(amds) || amds.length !== docs.length) {
    return { ok: false, detail: `${Array.isArray(amds) ? amds.length : 0} <amendment> blocks for ${docs.length} <document> blocks` }
  }
  for (const [i, d] of docs.entries()) {
    const p = exactTextKeys(d, DOCUMENT_KEYS, `document ${i + 1}`)
    if (p) return { ok: false, detail: p }
  }
  for (const [i, a] of amds.entries()) {
    const p = exactTextKeys(a, AMENDMENT_KEYS, `amendment ${i + 1}`)
    if (p) return { ok: false, detail: p }
  }
  const pc = exactTextKeys(root.count, COUNT_KEYS, 'count')
  if (pc) return { ok: false, detail: pc }
  const pt = exactTextKeys(root.tie_breaker, TIE_KEYS, 'tie_breaker')
  if (pt) return { ok: false, detail: pt }
  return {
    ok: true,
    head: {
      t,
      documents: docs as Head['documents'],
      amendments: amds as Head['amendments'],
      count: root.count as Head['count'],
      tie: root.tie_breaker as Head['tie'],
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// vote: measure, subject and keys

interface Measure {
  /** Title wording: "nomination PN1129", "S. 4668", "amendment S.Amdt. 6776 (on S. 4668)", "74 nominations en bloc". */
  subject: string
  thread_key: string | null
  related: Array<{ rel: string; key: string }>
  documents: Array<{ congress: number; type: string; number: string }>
  amendment: { number: string; to_amendment: string | null; to_amendment_to_amendment: string | null; to_document: string } | null
  enBloc: boolean
  /** The closed document kind of each <document>, in order (the question row checks them). */
  kinds: DocKind[]
}

const AMDT = /^S\.Amdt\. ([1-9][0-9]{0,5})$/
/** "S. 4668", "S.Con.Res. 33", "H.R. 6395" -> a bill (the closed Senate document table, bills only). */
function parseBillText(text: string): { type: BillType; n: number } | null {
  const m = /^(\S+) ?([1-9][0-9]{0,5})$/.exec(text)
  if (!m) return null
  const k = senateDocumentType(m[1]!)
  if (k === null || k === 'nomination' || k === 'amendment') return null
  return { type: k, n: Number(m[2]) }
}

function measureOf(h: Head, congress: number): { ok: true; m: Measure } | { ok: false; detail: string } {
  const bad = (detail: string) => ({ ok: false as const, detail })
  const documents: Measure['documents'] = []
  const kinds: DocKind[] = []
  for (const [i, d] of h.documents.entries()) {
    const type = collapseWs(d.document_type)
    const kind = senateDocumentType(type)
    if (kind === null) return bad(`document ${i + 1}: document_type ${JSON.stringify(type)} is not in the closed table`)
    const dc = collapseWs(d.document_congress)
    if (!/^[0-9]{2,3}$/.test(dc)) return bad(`document ${i + 1}: document_congress ${JSON.stringify(dc)}`)
    kinds.push(kind)
    documents.push({ congress: Number(dc), type, number: collapseWs(d.document_number) })
  }
  // Only the first <amendment> may carry numbers (en bloc lists one empty <amendment> per <document>).
  for (const [i, a] of h.amendments.entries()) {
    if (i > 0 && (a.amendment_number.trim() !== '' || a.amendment_to_document_number.trim() !== '')) {
      return bad(`amendment ${i + 1}: an amendment number beside document ${i + 1} (not recorded)`)
    }
  }
  const a0 = h.amendments[0]!
  const amdNo = collapseWs(a0.amendment_number)
  const amdTo = collapseWs(a0.amendment_to_document_number)

  if (documents.length > 1) {
    // En bloc (vote 225: 74 nominations). Only nominations were recorded en bloc.
    if (kinds.some((k) => k !== 'nomination')) return bad(`an en bloc vote on ${documents.length} documents that are not all nominations`)
    if (amdNo !== '' || amdTo !== '') return bad('an en bloc vote with an amendment number')
    const related: Measure['related'] = []
    const seen = new Set<string>()
    for (const [i, d] of documents.entries()) {
      const key = nominationKey(d.congress, d.number)
      if (key === null) return bad(`document ${i + 1}: PN number ${JSON.stringify(d.number)}`)
      if (seen.has(key)) return bad(`document ${i + 1}: ${key} listed twice`)
      seen.add(key)
      related.push({ rel: 'about', key })
    }
    return { ok: true, m: { subject: `${documents.length} nominations en bloc`, thread_key: null, related, documents, amendment: null, enBloc: true, kinds } }
  }

  const d = documents[0]!
  const kind = kinds[0]!
  if (kind === 'amendment') {
    // The vote is ON THE AMENDMENT (00249, 00096, 00240): the document number is empty; the subject names the
    // amendment and, with "on", the underlying measure (amendment_to_document_number names it even for a second-degree
    // amendment: 00249 is S.Amdt. 6835 to S.Amdt. 6776 to S. 4668). Both empty = drift.
    if (d.number !== '') return bad(`an S.Amdt. document with a document_number (${JSON.stringify(d.number)})`)
    if (amdNo === '' && amdTo === '') return bad('an S.Amdt. vote with neither amendment_number nor amendment_to_document_number')
    const am = AMDT.exec(amdNo)
    if (!am) return bad(`amendment_number ${JSON.stringify(amdNo)} is not "S.Amdt. N"`)
    const bill = parseBillText(amdTo)
    if (!bill) return bad(`amendment_to_document_number ${JSON.stringify(amdTo)} is not a bill in the closed table`)
    const toAmd = collapseWs(a0.amendment_to_amendment_number)
    const toToAmd = collapseWs(a0.amendment_to_amendment_to_amendment_number)
    for (const x of [toAmd, toToAmd]) if (x !== '' && !AMDT.test(x)) return bad(`amendment_to_amendment number ${JSON.stringify(x)} is not "S.Amdt. N"`)
    const label = `S.Amdt. ${am[1]}`
    const on = fmtBill(bill.type, bill.n)
    return {
      ok: true,
      m: {
        subject: `amendment ${label} (on ${on})`,
        thread_key: billKey(congress, bill.type, bill.n),
        related: [],
        documents,
        kinds,
        amendment: { number: label, to_amendment: toAmd === '' ? null : toAmd, to_amendment_to_amendment: toToAmd === '' ? null : toToAmd, to_document: on },
        enBloc: false,
      },
    }
  }
  if (amdNo !== '' || amdTo !== '') return bad(`an amendment number on a ${d.type} vote (not recorded)`)
  if (kind === 'nomination') {
    const key = nominationKey(d.congress, d.number)
    if (key === null) return bad(`PN number ${JSON.stringify(d.number)} is not N or N-N`)
    const pn = key.slice(key.indexOf(':PN') + 1)
    return { ok: true, m: { subject: `nomination ${pn}`, thread_key: key, related: [{ rel: 'about', key }], documents, amendment: null, enBloc: false, kinds } }
  }
  if (!/^[1-9][0-9]{0,5}$/.test(d.number)) return bad(`${d.type} number ${JSON.stringify(d.number)} is not a number`)
  const n = Number(d.number)
  return { ok: true, m: { subject: fmtBill(kind, n), thread_key: billKey(d.congress, kind, n), related: [], documents, amendment: null, enBloc: false, kinds } }
}

// ---------------------------------------------------------------------------------------------------------------
// vote: title (ours; DESIGN §0.4: identifiers and tallies only, never the source's prose)

function tallyText(yea: number, nay: number, tieBreak: boolean, required: VoteRequired): string {
  let s: string
  if (yea === nay) s = tieBreak ? `, ${yea}-${nay}, the Vice President breaking the tie` : ` on a ${yea}-${nay} tie`
  else s = `, ${yea}-${nay}`
  if (required === '3/5') s += '; three-fifths needed'
  if (required === '2/3') s += '; two-thirds needed'
  return s
}

function titleOf(kind: QuestionKind, form: QuestionForm, passed: boolean, subject: string, tally: string, roll: number): string {
  const yes = passed
  const tail = `${tally} (roll call ${roll})`
  switch (kind) {
    case 'nomination':
      return `Senate ${yes ? 'confirmed' : 'rejected'} ${subject}${tail}`
    case 'cloture':
      return `Senate ${yes ? 'invoked' : 'did not invoke'} cloture on ${form === 'proceed' ? `the motion to take up ${subject}` : subject}${tail}`
    case 'passage':
      return `Senate ${yes ? 'passed' : 'rejected'} ${subject}${tail}`
    case 'veto_override':
      return `Senate ${yes ? 'overrode' : 'failed to override'} the veto of ${subject}${tail}`
    case 'resolution':
    case 'amendment':
      return `Senate ${yes ? 'adopted' : 'rejected'} ${subject}${tail}`
    case 'table':
      return `Senate ${yes ? 'agreed to' : 'rejected'} a motion to table ${subject}${tail}`
    case 'motion': {
      const what = form === 'discharge' ? 'a motion to discharge' : form === 'proceed' ? 'a motion to take up' : 'a motion on'
      return `Senate ${yes ? 'agreed to' : 'rejected'} ${what} ${subject}${tail}`
    }
    case 'point_of_order':
      return `Senate ${yes ? 'upheld' : 'rejected'} a point of order on ${subject}${tail}`
    case 'impeachment_verdict':
      return `Senate ${yes ? 'convicted' : 'acquitted'} on ${subject}${tail}`
    case 'unknown':
      // Never "passed" (critique T10): the question is not one we know.
      return `Senate roll call ${roll}: the question was ${yes ? 'agreed to' : 'not agreed to'}${tally}`
  }
}

// ---------------------------------------------------------------------------------------------------------------
// vote: members (forward scan + one strict regex per <member>)

const MEMBER = new RegExp(
  '^\\s*<member_full>([^<]*)</member_full>\\s*<last_name>([^<]*)</last_name>\\s*<first_name>([^<]*)</first_name>' +
  '\\s*<party>([^<]*)</party>\\s*<state>([^<]*)</state>\\s*(<vote_cast(?:\\s[^>]*)?>)([^<]*)</vote_cast>' +
  '\\s*<lis_member_id>([^<]*)</lis_member_id>\\s*$',
)
const LIS_ID = /^S[0-9]{3}$/
const VOTE_CAST_ATTRS = new Set(['crp', 'pair'])

type MembersRead = { ok: true; positions: MemberPosition[]; unresolved: string[] } | { ok: false; detail: string }

function readMembers(xml: string, opts: ParseVoteOptions, question: { kind: QuestionKind; text: string }): MembersRead {
  const bad = (detail: string): MembersRead => ({ ok: false, detail })
  const scan = blocks(xml, 'member')
  if (!scan.ok) return bad(scan.detail)
  // Nothing but whitespace between the <member> blocks.
  let p = 0
  for (const b of scan.blocks) {
    if (xml.slice(p, b.start).trim() !== '') return bad(`unexpected content inside <members> before offset ${b.start}`)
    p = b.end
  }
  if (xml.slice(p).trim() !== '') return bad('unexpected content at the end of <members>')
  if (scan.blocks.length === 0) return bad('<members> lists no member')

  const positions: MemberPosition[] = []
  const unresolved: string[] = []
  const seen = new Set<string>()
  for (const [i, b] of scan.blocks.entries()) {
    const at = `member ${i + 1}`
    if (b.openTag !== '<member>') return bad(`${at}: open tag ${b.openTag}`)
    const m = MEMBER.exec(b.inner)
    if (!m) return bad(`${at}: not the recorded child list (member_full, last_name, first_name, party, state, vote_cast, lis_member_id)`)
    const raw = m.slice(1)
    if (raw.some((x) => hasUnknownEntity(x ?? ''))) return bad(`${at}: an entity XML does not define`)
    const [full, last, first, party, state, , cast, lis] = raw.map((x) => collapseWs(decodeEntities(x ?? '')))
    if (!LIS_ID.test(lis!)) return bad(`${at}: lis_member_id ${JSON.stringify(lis)} is not S + 3 digits`)
    if (seen.has(lis!)) return bad(`${at}: lis_member_id ${lis} listed twice`)
    seen.add(lis!)
    if (!/^[A-Z]{2}$/.test(state!)) return bad(`${at} (${lis}): state ${JSON.stringify(state)}`)
    if (!/^[A-Z]{1,3}$/.test(party!)) return bad(`${at} (${lis}): party ${JSON.stringify(party)}`)
    if (full === '') return bad(`${at} (${lis}): empty member_full`)
    const attrs = attrsOf(m[6]!)
    if (attrs === null) return bad(`${at} (${lis}): malformed <vote_cast> tag ${m[6]}`)
    for (const k of Object.keys(attrs)) if (!VOTE_CAST_ATTRS.has(k)) return bad(`${at} (${lis}): <vote_cast> attribute ${k} was never recorded`)
    const pair = (attrs.pair ?? '').trim()
    if (pair !== '' && !LIS_ID.test(pair)) return bad(`${at} (${lis}): vote_cast pair ${JSON.stringify(pair)} is not a LIS id`)
    const position = positionOf(cast!)
    if (position === null) return bad(`${at} (${lis}): vote_cast ${JSON.stringify(cast)} is not in the closed table`)
    // The words belong to the question: Guilty / Not Guilty only on a verdict (117_1_00059), Yea / Nay never on one.
    const verdictWord = /^(not )?guilty$/i.test(cast!)
    if ((position === 'yea' || position === 'nay') && verdictWord !== (question.kind === 'impeachment_verdict')) {
      return bad(`${at} (${lis}): vote_cast ${JSON.stringify(cast)} is not a vote word of ${JSON.stringify(question.text)}`)
    }
    const found = opts.members.lookupSenate(lis!)
    // Never join on names (Graham (R-SC) is S293 in vote 122 and S441 in vote 256): the LIS id is the only key.
    let name: string
    if (found) name = found.name
    else {
      name = collapseWs(`${first} ${last}`)
      if (name === '') name = full!
      unresolved.push(lis!)
    }
    positions.push({
      member_key: found ? `bioguide:${found.bioguide}` : `lis:${lis}`,
      id_confidence: found ? 'mapped' : 'unresolved',
      lis: lis!,
      name,
      name_source: found ? 'map' : 'source',
      source_name: full!,
      party: party!,
      state: state!,
      role: null,
      position,
      vote_text: cast!,
      pair: pair === '' ? null : pair,
    })
  }
  return { ok: true, positions, unresolved }
}

// ---------------------------------------------------------------------------------------------------------------
// vote

const VOTE_URL = /^https:\/\/www\.senate\.gov\/legislative\/LIS\/roll_call_votes\/vote([0-9]{2,3})([12])\/vote_([0-9]{2,3})_([12])_([0-9]{5})\.xml$/
const OFFICIAL_MAX = 4000 // event.schema.json official_text.maxLength
/** How far a vote instant may run ahead of our own fetch before it is drift (the source's clock vs ours). */
const FUTURE_SKEW_MS = 10 * 60_000

const countOf = (raw: string): number | null => {
  const t = raw.trim()
  if (t === '') return 0 // an empty element (<present/>, <absent/>) is zero (00009, 117_1_00059)
  return /^[0-9]{1,3}$/.test(t) ? Number(t) : null
}

function parseVoteXml(res: FetchedResponse, opts: ParseVoteOptions): AdapterOutput {
  const ep = 'vote'
  const pre = prelude(ep, res)
  if (pre) return pre
  const ct = contentType(res)
  const body = stripBom(res.body)
  if (isHtml(ct)) {
    const title = htmlTitle(body)
    if (title === VOTE_UNAVAILABLE_TITLE) {
      return fail(ep, 'error', `vote file not available: senate.gov answered its "${VOTE_UNAVAILABLE_TITLE}" page; retried at backoff`)
    }
    return fail(ep, 'drift', `an HTML page (${title === null ? 'no <title>' : `"${title}"`}) instead of a vote XML`)
  }
  if (!isXml(ct)) return fail(ep, 'drift', `content-type "${ct}" is not text/xml`)
  const u = VOTE_URL.exec(res.url.split(/[?#]/)[0] ?? '')
  if (!u || u[1] !== u[3] || u[2] !== u[4]) return fail(ep, 'drift', `${res.url} is not a senate.gov vote XML URL (vote{c}{s}/vote_{c}_{s}_{NNNNN}.xml)`)
  const urlId = { congress: Number(u[3]), session: Number(u[4]), roll: Number(u[5]) }
  if (rootName(body) !== 'roll_call_vote') return fail(ep, 'drift', `root element <${rootName(body) ?? '?'}> is not <roll_call_vote>`)
  if (!endsWithClose(body, ['</members>', '</roll_call_vote>'])) {
    return fail(ep, 'drift', 'the vote does not end with </members></roll_call_vote> (truncated download?)')
  }
  const mi = body.indexOf('<members>')
  if (mi < 0 || body.indexOf('<members>', mi + 1) >= 0) return fail(ep, 'drift', 'not exactly one <members> list')
  const parsedHead = parseHead(`${body.slice(0, mi)}</roll_call_vote>`)
  if (!parsedHead.ok) return fail(ep, 'drift', parsedHead.detail, 1)
  const h = parsedHead.head
  const t = h.t

  // Identity: the XML's congress / session / unpadded vote_number must equal the URL's vote_{c}_{s}_{NNNNN}.
  const congressText = t.congress.trim()
  const sessionText = t.session.trim()
  const numberText = t.vote_number.trim()
  if (!/^[0-9]{2,3}$/.test(congressText) || !/^[12]$/.test(sessionText) || !/^[1-9][0-9]{0,4}$/.test(numberText)) {
    return fail(ep, 'drift', `identity congress ${JSON.stringify(congressText)} session ${JSON.stringify(sessionText)} vote_number ${JSON.stringify(numberText)} is malformed`, 1)
  }
  const id = { congress: Number(congressText), session: Number(sessionText) as 1 | 2, roll: Number(numberText) }
  if (id.congress !== urlId.congress || id.session !== urlId.session || id.roll !== urlId.roll) {
    return fail(ep, 'drift', `the XML is vote ${id.congress}-${id.session}-${id.roll} but the URL names ${urlId.congress}-${urlId.session}-${urlId.roll}`, 1)
  }
  const at = `roll call ${id.roll} (${id.congress}-${id.session})`
  const failVote = (detail: string) => fail(ep, 'drift', `${at}: ${detail}`, 1)

  const when = senateTime(t.vote_date, 'vote_date')
  if (!when.ok) return failVote(when.detail)
  const modified = senateTime(t.modify_date, 'modify_date')
  if (!modified.ok) return failVote(modified.detail)

  // The session's own bounds (review 483d7ab F8, time F3): congress_year is the session's year; the vote falls between
  // Jan 1 of it and noon Eastern on Jan 3 of the next year (20th Amendment: 116-2's vote 292 is on January 1, 2021);
  // the record is not modified before the vote; neither instant is later than our own fetch.
  const sessionYear = 1787 + 2 * id.congress + (id.session - 1)
  const cyText = t.congress_year.trim()
  if (cyText !== String(sessionYear)) return failVote(`congress_year ${cyText} is not the year of session ${id.congress}-${id.session} (${sessionYear})`)
  // Compared on the Eastern wall clock, so a time in the fall-back hour (utc null) is bounded too.
  const first = `${sessionYear}-01-01T00:00`
  const end = `${sessionYear + 1}-01-03T12:00`
  const fetchedMs = Date.parse(res.fetchedAt)
  for (const [field, raw, r] of [['vote_date', t.vote_date, when], ['modify_date', t.modify_date, modified]] as const) {
    if (r.wall < first || r.wall >= end) {
      return failVote(`<${field}> ${JSON.stringify(raw)} is outside session ${id.congress}-${id.session} (${sessionYear}-01-01 to ${sessionYear + 1}-01-03 noon Eastern)`)
    }
    // In the fall-back hour the earlier reading is EDT (wall + 4 h): if even that is after the fetch, it is the future.
    const earliestMs = r.utc !== null ? Date.parse(r.utc) : Date.parse(`${r.wall}:00Z`) + 4 * 3_600_000
    if (earliestMs > fetchedMs + FUTURE_SKEW_MS) return failVote(`<${field}> ${JSON.stringify(raw)} is later than our own fetch (${res.fetchedAt})`)
  }
  // By instant when both are known; else by wall clock with the one repeated hour of slack.
  const modifiedFirst = when.utc !== null && modified.utc !== null
    ? modified.utc < when.utc
    : Date.parse(`${modified.wall}:00Z`) < Date.parse(`${when.wall}:00Z`) - 3_600_000
  if (modifiedFirst) return failVote(`<modify_date> ${JSON.stringify(t.modify_date)} is earlier than <vote_date> ${JSON.stringify(t.vote_date)}`)

  const required = collapseWs(t.majority_requirement)
  if (!REQUIRED.has(required)) return failVote(`majority_requirement ${JSON.stringify(required)} is not 1/2, 3/5 or 2/3`)
  const resultText = collapseWs(t.vote_result)
  const question = collapseWs(t.question)
  const questionText = collapseWs(t.vote_question_text)
  const resultLine = collapseWs(t.vote_result_text)
  if (question === '' || questionText === '' || resultLine === '') return failVote('an empty question, vote_question_text or vote_result_text')
  const q = lookupQuestion(question)
  if (q.kind === 'unknown' && (VETO_WORDS.test(question) || VETO_WORDS.test(questionText))) {
    return failVote(`possible veto vote, question ${JSON.stringify(question)} not in the table`)
  }
  const passed = passedOf(question, resultText)
  if (passed === null) return failVote(`vote_result ${JSON.stringify(resultText)} is not a result of ${JSON.stringify(question)} we know (closed table per question)`)

  const measure = measureOf(h, id.congress)
  if (!measure.ok) return failVote(measure.detail)
  const ms = measure.m
  if (ms.enBloc && q.kind !== 'nomination') return failVote(`an en bloc vote on the question ${JSON.stringify(question)} (only nominations were recorded en bloc)`)
  const offDoc = q.docs === null ? undefined : ms.kinds.find((k) => !q.docs!.has(k))
  if (offDoc !== undefined) {
    return failVote(`the question ${JSON.stringify(question)} on a ${ms.documents[ms.kinds.indexOf(offDoc)]!.type} document (not a combination we know)`)
  }

  // Counts: an empty element = 0; `absent` = not voting.
  const counts: Record<(typeof COUNT_KEYS)[number], number> = { yeas: 0, nays: 0, present: 0, absent: 0 }
  for (const k of COUNT_KEYS) {
    const n = countOf(h.count[k])
    if (n === null) return failVote(`<count><${k}> ${JSON.stringify(h.count[k])} is not a count`)
    counts[k] = n
  }

  // Tie breaker: both fields set or both empty; only the Vice President, only on a tie, only Yea or Nay.
  const by = collapseWs(h.tie.by_whom)
  const tieVote = collapseWs(h.tie.tie_breaker_vote)
  let tieBreaker: { by: string; vote: string } | null = null
  if (by !== '' || tieVote !== '') {
    if (by === '' || tieVote === '') return failVote('a tie_breaker with only one of by_whom / tie_breaker_vote')
    if (!/^vice president\b/i.test(by)) return failVote(`tie broken by ${JSON.stringify(by)}, not the Vice President`)
    if (!/^(yea|nay)$/i.test(tieVote)) return failVote(`tie_breaker_vote ${JSON.stringify(tieVote)} is not Yea or Nay`)
    if (counts.yeas !== counts.nays) return failVote(`a tie_breaker on a ${counts.yeas}-${counts.nays} vote that is not tied`)
    tieBreaker = { by, vote: tieVote }
  }

  const members = readMembers(body.slice(mi + '<members>'.length, body.lastIndexOf('</members>')), opts, { kind: q.kind, text: question })
  if (!members.ok) return failVote(members.detail)
  const pos = members.positions
  const bucket = { yea: 0, nay: 0, present: 0, not_voting: 0, candidate: 0 }
  for (const p of pos) bucket[p.position] += 1
  // Every <count> field equals its bucket of member rows (so their sum equals the rows). Never assert 100 senators
  // (vote 193 has 99 rows: a vacancy).
  if (counts.yeas !== bucket.yea || counts.nays !== bucket.nay || counts.present !== bucket.present || counts.absent !== bucket.not_voting) {
    return failVote(`<count> ${counts.yeas}/${counts.nays}/${counts.present}/${counts.absent} (yeas/nays/present/absent) does not match the member rows ${bucket.yea}/${bucket.nay}/${bucket.present}/${bucket.not_voting}`)
  }
  if (members.unresolved.length > opts.maxUnresolved) {
    return failVote(`${members.unresolved.length} members not in the member list (more than ${opts.maxUnresolved}): member list stale or wrong`)
  }

  const official = collapseWs(`${questionText} - ${resultLine}`)
  if (official.length > OFFICIAL_MAX) return failVote(`official text is ${official.length} characters (more than ${OFFICIAL_MAX})`)

  const ident = `${id.congress}:${id.session}:${id.roll}`
  const objectKey = `vote:senate:${ident}`
  const ref = `votes/senate/${id.congress}/${id.session}/${id.roll}.json`
  const req = required as VoteRequired
  const title = titleOf(q.kind, q.form, passed, ms.subject, tallyText(counts.yeas, counts.nays, tieBreaker !== null, req), id.roll)
  const tier = TIER[q.kind]
  const notes = [when.note, modified.note].filter((x): x is string => x !== null)

  const result: VoteResult = {
    question,
    question_kind: q.kind,
    result_text: resultText,
    required: req,
    passed,
    yea: counts.yeas,
    nay: counts.nays,
    present: counts.present,
    not_voting: counts.absent,
    tie_breaker: tieBreaker,
    documents: ms.documents,
    amendment: ms.amendment,
  }
  if (notes.length > 0) result.time_note = notes.join('; ')

  const source = { source_id: SOURCE_ID, url: res.url, retrieved_at: res.fetchedAt, license: 'us-gov-public-domain', affiliation: 'official-nonpartisan' as const }
  const event: CedEvent = finalizeEvent({
    dedup_key: `${objectKey}#result`,
    object_key: objectKey,
    ...(ms.thread_key ? { thread_key: ms.thread_key } : {}),
    event_type: 'vote.result',
    status: 'ended',
    branch: 'legislative',
    body: 'senate',
    features: ['F5', 'F6'],
    title,
    official_text: official,
    importance: { tier: tier.tier, reasons: [tier.reason] },
    times: {
      occurred_at: when.utc, // the vote START (LIS has no close time; DESIGN §1.3)
      scheduled_for: null,
      source_published_at: modified.utc,
      first_seen_at: res.fetchedAt,
    },
    ...(ms.related.length > 0 ? { related: ms.related } : {}),
    result,
    member_votes_ref: ref,
    sources: [source],
    revision: 1,
    provenance: { parser: SENATE_VOTES_PARSER, confidence: 'high' },
  })

  const record: MemberVotesRecord = {
    record_type: 'member_votes',
    record_version: '0.1',
    ref,
    vote_key: objectKey,
    chamber: 'senate',
    congress: id.congress,
    session: id.session,
    roll: id.roll,
    source: { source_id: SOURCE_ID, url: res.url, retrieved_at: res.fetchedAt, parser: SENATE_VOTES_PARSER },
    members_map: { ...opts.members.meta },
    counts: { yea: counts.yeas, nay: counts.nays, present: counts.present, not_voting: counts.absent },
    unresolved: members.unresolved.length,
    positions: pos,
  }

  const details = [`${at}: ${pos.length} members`]
  details.push(members.unresolved.length === 0
    ? 'all in the member list'
    : `${members.unresolved.length} not in the member list (${members.unresolved.map((l) => `LIS ${l}`).join(', ')})`)
  if (q.kind === 'unknown') details.push(`unknown question ${JSON.stringify(question)}: neutral title at P3`)
  for (const n of notes) details.push(`${n}: left null`)
  return { events: [event], health: health(ep, 'ok', details.join('; '), 1), records: [record] }
}

// ---------------------------------------------------------------------------------------------------------------

/** Pure: one response of any endpoint (`menu`, `vote`) in; events, records, targets and health out. */
export function parseVote(endpointId: string, res: FetchedResponse, opts: ParseVoteOptions = DEFAULT_VOTE_OPTIONS): AdapterOutput {
  if (endpointId === 'menu') return parseMenu(res)
  if (endpointId === 'vote') return parseVoteXml(res, opts)
  return fail(endpointId, 'error', `unknown endpoint "${endpointId}"`)
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
      dynamic: { from: 'menu', urlPattern: VOTE_URL_PATTERN, maxTargets: MENU_TOP },
    },
  ],
  cadence: { business_s: 60, off_s: 300 },
  freshness_slo_s: 120,
  // 60 menu + 10 targets x 2 + up to ~20 new votes in a vote-a-rama hour = 100.
  rate_budget_per_h: 110,
  calendar: { chamber: 'senate', recess_s: 3600 },
  parse: (endpointId, res) => parseVote(endpointId, res),
}

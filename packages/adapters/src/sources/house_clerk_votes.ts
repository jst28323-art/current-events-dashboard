// house.clerk.votes — House roll call votes from the Clerk (clerk.house.gov): one vote.result event + one member-vote
// side record per roll call, and the listing that names which roll calls to fetch. Design: scratch/phase2/DESIGN.md
// §3.1 (mapping, titles, drift checks, tests), §2 (records), §1.3-§1.6 (times, keys, tiers).
// FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// Three endpoints, one parser:
// - `index`: the HTML listing of the session's roll calls, newest first, 10 rows. No events; it names the targets of the
//   two dynamic endpoints (every listed roll, and the probe of roll N+1).
// - `roll_next` / `roll`: a roll call XML (~94-97 KB). Only the <vote-metadata> head (~2.5 KB) goes through the XML
//   parser; the 430-odd <recorded-vote> blocks are read by one forward scan with a strict per-block pattern.
//
// Fail closed (DESIGN §0.2): any structure we did not record, an identity that disagrees with the URL, an unknown
// vote-type / result / vote value, or member votes that do not reproduce the printed totals = health `drift`, zero
// events, zero records, zero targets. An unknown vote QUESTION only words the title: it publishes at P3 with a neutral
// title and a health note, unless it mentions a veto (the P0 class must never be silently demoted), which is drift.
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { finalizeEvent, type CedEvent, type Tier } from '@ced/schema'
import type { MemberPosition, MemberVotesRecord, VoteCandidate, VoteRequired, VoteResult } from '@ced/schema/v02'
import type { AdapterOutput, FetchedResponse, HealthSignal, HealthStatus, SourceDefinition, Target } from '../types.js'
import {
  CURRENT, billKey, congressSessionOfYear, fmtBill, parseLegisNum, sessionNumber, sessionOrdinal, type BillType, type LegisNum,
} from '../lib/congress_ids.js'
import { easternToUtc, MONTHS } from '../lib/eastern.js'
import { DEFAULT_VOTE_OPTIONS, type ParseVoteOptions } from '../lib/members.js'
import { collapseWs, decodeEntities, endsWithClose, hasUnknownEntity, rootName, stripBom, attrsOf } from '../lib/xmlscan.js'

export const SOURCE_ID = 'house.clerk.votes'
export const HOUSE_VOTES_PARSER = 'house_clerk_votes@0.1.0'

/** The listing of the current session's roll calls, newest first, 10 rows (URL fixed: DESIGN §3.1, critique B8). */
export const INDEX_URL = `https://clerk.house.gov/Votes/MemberVotes?CongressNum=${CURRENT.congress}&Session=${sessionOrdinal(CURRENT.session)}`
/** Human-readable template of a roll call XML URL; the real URLs come from the index parse (AdapterOutput.targets). */
export const ROLL_URL_TEMPLATE = `https://clerk.house.gov/evs/${CURRENT.year}/roll{NNN}.xml`
export const ROLL_URL_PATTERN = '^https://clerk\\.house\\.gov/evs/20[0-9]{2}/roll[0-9]{3}\\.xml$'

const ROLL_URL = /^https:\/\/clerk\.house\.gov\/evs\/(\d{4})\/roll(\d{3})\.xml$/
const HOUSE = 'U.S. House of Representatives'
/** The listing shows 10 rows per page; `roll` takes every one (maxTargets 10). */
const LISTED_MAX = 10
/** The exact marker of a listing with no votes yet (a new session's first days; DESIGN §3.0, R-15). */
const NO_VOTES_MARKER = 'No Votes Found'
const OFFICIAL_MAX = 4000 // event.schema.json official_text.maxLength
const TITLE_MAX = 1000 // event.schema.json title.maxLength
/** How far a vote instant may run ahead of our own fetch before it is drift (the Clerk's clock vs ours). */
const FUTURE_SKEW_MS = 10 * 60_000

export function rollUrl(year: number, roll: number): string {
  return `https://clerk.house.gov/evs/${year}/roll${String(roll).padStart(3, '0')}.xml`
}

// ---------------------------------------------------------------------------------------------------------------
// Closed vocabularies (DESIGN §3.1). Strings are compared case-insensitively after whitespace collapse (§0.2: the
// Clerk printed `Call By States` in 2023 and `Call by States` in 2025).
// ---------------------------------------------------------------------------------------------------------------

const norm = (s: string): string => collapseWs(s).toLowerCase()

type VoteFamily = 'yea_nay' | 'recorded' | 'quorum'
/** vote-type -> (required, which vote words it uses). Anything else = drift. */
const VOTE_TYPES: Readonly<Record<string, { required: VoteRequired | null; family: VoteFamily }>> = {
  'yea-and-nay': { required: '1/2', family: 'yea_nay' },
  '2/3 yea-and-nay': { required: '2/3', family: 'yea_nay' },
  '3/5 yea-and-nay': { required: '3/5', family: 'yea_nay' },
  'recorded vote': { required: '1/2', family: 'recorded' },
  '2/3 recorded vote': { required: '2/3', family: 'recorded' },
  '3/5 recorded vote': { required: '3/5', family: 'recorded' },
  quorum: { required: null, family: 'quorum' },
}

/** vote-result -> passed. NEVER from yea > nay (roll009: Failed 248-177 on a two-thirds vote). */
const RESULTS: Readonly<Record<string, boolean>> = { passed: true, 'agreed to': true, failed: false }

export type QuestionKind =
  | 'passage' | 'suspension_passage' | 'suspension_resolution' | 'concur' | 'veto_override' | 'resolution' | 'rule'
  | 'amendment' | 'table' | 'adjourn' | 'previous_question' | 'recommit' | 'consideration' | 'quorum' | 'speaker_election'
  | 'unknown'

const QUESTIONS: Readonly<Record<string, QuestionKind>> = {
  'on passage': 'passage',
  'on motion to suspend the rules and pass': 'suspension_passage',
  'on motion to suspend the rules and pass, as amended': 'suspension_passage',
  // A resolution adopted under suspension (D-088; roll2025_158: H RES 488; the 119-1 listing also prints `, as Amended`,
  // roll 179 of 2025, H RES 519). Only on an H RES or H CON RES, else drift (SUSPENSION_RESOLUTION_TYPES).
  'on motion to suspend the rules and agree': 'suspension_resolution',
  'on motion to suspend the rules and agree, as amended': 'suspension_resolution',
  'on motion to concur in the senate amendment': 'concur',
  'on motion to concur in the senate amendments': 'concur',
  'passage, objections of the president to the contrary notwithstanding': 'veto_override',
  'on agreeing to the resolution': 'resolution',
  'on agreeing to the amendment': 'amendment',
  'on motion to table': 'table',
  'on motion to adjourn': 'adjourn',
  'on ordering the previous question': 'previous_question',
  'on motion to recommit': 'recommit',
  'on consideration of the resolution': 'consideration',
  'call by states': 'quorum',
  'election of the speaker': 'speaker_election',
}
/** An unknown question that mentions a veto is drift, never a P3 "unknown" (DESIGN §0.2, critique T5/C4). */
const VETO_WORDS = /veto|objections of the president/i
/** A rule: an H RES whose vote-desc begins like this (roll300, roll107; critique T8). */
const RULE_DESC = /^Providing for (the )?(consideration|disposition)/i

/** Bill types whose passage-class votes are P0 (DESIGN §1.5): bills and joint resolutions. */
const P0_BILL_TYPES = new Set<BillType>(['hr', 's', 'hjres', 'sjres'])
/** The only legis-num types a `suspension_resolution` question may be about (D-088); any other = drift. */
const SUSPENSION_RESOLUTION_TYPES = new Set<BillType>(['hres', 'hconres'])

/** totals-by-party <party> names -> the letter the member rows print. */
const PARTY_LETTER: Readonly<Record<string, string>> = { republican: 'R', democratic: 'D', independent: 'I' }

const MONTH_ABBR: Readonly<Record<string, number>> = Object.fromEntries(MONTHS.map((m, i) => [m.slice(0, 3), i + 1]))

// ---------------------------------------------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------------------------------------------

function health(endpoint: string, status: HealthStatus, detail: string, items_seen: number): HealthSignal {
  return { source_id: SOURCE_ID, endpoint, status, detail, items_seen }
}
const refuse = (endpoint: string, status: HealthStatus, detail: string, items_seen = 0): AdapterOutput =>
  ({ events: [], health: health(endpoint, status, detail, items_seen) })

class Drift extends Error {}
function drift(detail: string): never {
  throw new Drift(detail)
}

// ---------------------------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------------------------

/** Pure: one response of any endpoint (`index`, `roll_next`, `roll`) in; events, records, targets and health out. */
export function parseVote(endpointId: string, res: FetchedResponse, opts: ParseVoteOptions = DEFAULT_VOTE_OPTIONS): AdapterOutput {
  if (endpointId !== 'index' && endpointId !== 'roll_next' && endpointId !== 'roll') {
    return refuse(endpointId, 'error', `unknown endpoint "${endpointId}"`)
  }
  if (res.status === 304) return refuse(endpointId, 'not_modified', 'HTTP 304: nothing changed since the last poll')
  if (res.status !== 200) return refuse(endpointId, 'error', `HTTP ${res.status}`)
  try {
    return endpointId === 'index' ? parseIndex(res) : parseRoll(endpointId, res, opts)
  } catch (e) {
    if (e instanceof Drift) return refuse(endpointId, 'drift', e.message)
    throw e
  }
}

// ---------------------------------------------------------------------------------------------------------------
// index: the listing -> targets
// ---------------------------------------------------------------------------------------------------------------

const ROW_LABEL = /aria-label="Roll number, /g
const ROW_ANCHOR = /<a\s[^>]*aria-label="Roll number, [^"]*"[^>]*>/g
const ROW_HREF = /^\/Votes\/(\d{4})(\d{1,4})(?:\?Page=\d+)?$/
const PAGINATION = /<div class="pagination_info">([^<]*)<\/div>/g

function parseIndex(res: FetchedResponse): AdapterOutput {
  const ep = 'index'
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct !== '' && !ct.includes('html')) drift(`content-type "${ct}" is not the HTML listing`)
  const body = res.body

  // Rows are counted by their roll-number label, never by div.role-call-vote: the empty listing still has one.
  const labels = (body.match(ROW_LABEL) ?? []).length
  if (labels === 0) {
    if (body.includes(NO_VOTES_MARKER)) {
      // A new session before its first roll call: valid and quiet. Probe roll 001 of the pinned year (DESIGN §3.0).
      const probe = rollUrl(CURRENT.year, 1)
      return {
        events: [],
        targets: [{ endpoint: 'roll_next', url: probe }],
        health: health(ep, 'empty', `the listing says "${NO_VOTES_MARKER}"; probing roll 1 of ${CURRENT.year}`, 0),
      }
    }
    drift('the listing has no roll-number rows and no "No Votes Found" marker')
  }
  if (body.includes(NO_VOTES_MARKER)) drift(`the listing has ${labels} roll rows AND the "${NO_VOTES_MARKER}" marker`)

  const anchors = body.match(ROW_ANCHOR) ?? []
  if (anchors.length !== labels) drift(`${labels} roll-number labels but ${anchors.length} of them on a link`)
  const rows: Array<{ year: number; roll: number }> = []
  for (const [i, tag] of anchors.slice(0, LISTED_MAX).entries()) {
    const a = attrsOf(tag)
    if (!a) drift(`row ${i + 1}: malformed link ${tag}`)
    const label = /^Roll number, ([1-9][0-9]{0,3})$/.exec(a!['aria-label'] ?? '')
    if (!label) drift(`row ${i + 1}: aria-label "${a!['aria-label']}" is not "Roll number, N"`)
    const href = ROW_HREF.exec(a!.href ?? '')
    if (!href) drift(`row ${i + 1}: href "${a!.href}" is not /Votes/{year}{roll}`)
    const year = Number(href![1])
    const roll = Number(href![2])
    if (roll !== Number(label![1])) drift(`row ${i + 1}: href roll ${href![2]} disagrees with its label ${label![1]}`)
    if (!congressSessionOfYear(year)) drift(`row ${i + 1}: year ${year} is out of range`)
    rows.push({ year, roll })
  }

  // One session, newest first: the top row is N, the probe is N+1 (and every row is a target).
  const year = rows[0]!.year
  for (const [i, r] of rows.entries()) {
    if (r.year !== year) drift(`row ${i + 1} is from ${r.year}, row 1 from ${year}: the listing mixes years`)
    if (i > 0 && r.roll >= rows[i - 1]!.roll) drift(`row ${i + 1} (roll ${r.roll}) is not older than row ${i} (roll ${rows[i - 1]!.roll})`)
  }
  // The year must be the session the URL asked for (when the URL names one).
  let asked: URL | null = null
  try {
    asked = new URL(res.url)
  } catch {
    asked = null
  }
  const qc = asked?.searchParams.get('CongressNum')
  const qs = asked?.searchParams.get('Session')
  if (qc != null && qs != null) {
    const cs = congressSessionOfYear(year)!
    if (String(cs.congress) !== qc || sessionOrdinal(cs.session) !== qs) {
      drift(`the listing's rolls are from ${year} (${cs.congress}-${cs.session}), but the URL asked for Congress ${qc}, session ${qs}`)
    }
  }
  // pagination_info, when printed (above and below the rows: votes_index_119_2nd.html lines 5 and 569), must agree
  // with the rows: "1 - 10 of 314 Results". Not required: a listing too short to paginate is not recorded yet.
  const pages = [...new Set([...body.matchAll(PAGINATION)].map((m) => collapseWs(m[1]!)))]
  if (pages.length > 1) drift(`pagination_info blocks disagree: ${pages.map((p) => `"${p}"`).join(', ')}`)
  if (pages.length === 1) {
    const p = /^(\d+) - (\d+) of (\d+) Results$/.exec(pages[0]!)
    if (!p) drift(`pagination_info "${pages[0]}" is not "1 - N of M Results"`)
    if (Number(p![1]) !== 1 || Number(p![2]) !== Math.min(labels, LISTED_MAX) || Number(p![3]) < Number(p![2])) {
      drift(`pagination_info "${pages[0]}" disagrees with the ${labels} rows listed`)
    }
  }

  const top = rows[0]!.roll
  if (top + 1 > 999) drift(`roll ${top + 1} has no three-digit URL (evs/{year}/rollNNN.xml)`)
  const targets: Target[] = [{ endpoint: 'roll_next', url: rollUrl(year, top + 1) }]
  for (const r of rows) targets.push({ endpoint: 'roll', url: rollUrl(r.year, r.roll) })
  const last = rows[rows.length - 1]!.roll
  return {
    events: [],
    targets,
    health: health(ep, 'ok', `${rows.length} roll calls listed (${top}..${last}, ${year}); probing roll ${top + 1}`, labels),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// roll: one roll call XML -> one vote.result event + one member-vote record
// ---------------------------------------------------------------------------------------------------------------

/** The Clerk's 65-byte answer for a roll that does not exist (yet), served with HTTP 200 and an XML content-type. */
const ERROR_BODY = /^<xml>Error sanitizing file "(roll\d{3}\.xml)"\. Please try again\.<\/xml>$/

const headParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: true, // numeric references; named ones other than XML's five are refused before parsing
  isArray: () => true, // every element is an array, so "exactly once" is one check everywhere
})

type Node = Record<string, unknown>

function nodes(parent: Node, name: string): unknown[] {
  const v = parent[name]
  return Array.isArray(v) ? v : []
}

/** The children of a container element: only `allowed` names, no stray text, no attributes. */
function container(v: unknown, where: string, allowed: readonly string[]): Node {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) drift(`<${where}> is not an element with children`)
  const n = v as Node
  for (const k of Object.keys(n)) {
    if (k === '#text') {
      if (typeof n[k] !== 'string' || (n[k] as string).trim() !== '') drift(`<${where}> holds stray text`)
    } else if (!allowed.includes(k)) drift(`<${where}> has an element we did not record: <${k.replace(/^@_/, '@')}>`)
  }
  return n
}

/** The one `<name>` child (null when absent and optional), as text; a repeated or nested one = drift. */
function leaf(parent: Node, name: string, where: string, required = true): string | null {
  const arr = nodes(parent, name)
  if (arr.length === 0) {
    if (required) drift(`<${where}> has no <${name}>`)
    return null
  }
  if (arr.length > 1) drift(`<${where}> repeats <${name}>`)
  const v = arr[0]
  if (typeof v === 'string') return v
  drift(`<${name}> is not plain text`)
  return null
}

function count(parent: Node, name: string, where: string): number {
  const t = collapseWs(leaf(parent, name, where)!)
  if (!/^\d{1,4}$/.test(t)) drift(`<${where}><${name}> "${t}" is not a count`)
  return Number(t)
}

const META_CHILDREN = [
  'majority', 'congress', 'session', 'chamber', 'committee', 'rollcall-num', 'legis-num', 'vote-question', 'amendment-num',
  'amendment-author', 'vote-type', 'vote-result', 'action-date', 'action-time', 'vote-desc', 'vote-totals',
] as const
const TOTALS_CHILDREN = ['totals-by-party-header', 'totals-by-party', 'totals-by-vote', 'totals-by-candidate'] as const
const PARTY_HEADER_CHILDREN = ['party-header', 'yea-header', 'nay-header', 'present-header', 'not-voting-header'] as const
const BUCKET_CHILDREN = ['yea-total', 'nay-total', 'present-total', 'not-voting-total'] as const

interface Bucket { yea: number; nay: number; present: number; not_voting: number }
const zero = (): Bucket => ({ yea: 0, nay: 0, present: 0, not_voting: 0 })

/** One <recorded-vote> block, strict (attribute order as recorded in roll314 / roll2025_002; whitespace tolerant).
 * Values are captured loosely and checked one by one, so the drift detail says which one broke. */
const RECORDED_VOTE = new RegExp(
  '\\s*<recorded-vote>\\s*<legislator\\s+name-id="([^"]*)"\\s+sort-field="([^"]*)"\\s+unaccented-name="([^"]*)"\\s+' +
    'party="([^"]*)"\\s+state="([^"]*)"\\s+role="([^"]*)"\\s*>([^<]*)</legislator>\\s*<vote>([^<]*)</vote>\\s*</recorded-vote>',
  'y',
)

interface Identity { year: number; roll: number; congress: number; session: 1 | 2 }

function parseRoll(ep: 'roll_next' | 'roll', res: FetchedResponse, opts: ParseVoteOptions): AdapterOutput {
  const body = stripBom(res.body)
  const urlMatch = ROLL_URL.exec(res.url)
  const root = rootName(body)

  // The Clerk's error body, detected by its <xml> root, never by status or content-type (DESIGN §3.1).
  if (root === 'xml') {
    const m = ERROR_BODY.exec(body.trim())
    if (!m) drift(`an <xml> body that is not the Clerk's "Error sanitizing file" answer`)
    // The answer names the file it could not serve: another roll's name is not an answer about this URL (review 483d7ab).
    if (urlMatch && m![1] !== `roll${urlMatch[2]}.xml`) drift(`the Clerk's error body names ${m![1]}, but the URL asked for roll${urlMatch[2]}.xml`)
    const rollN = urlMatch ? `roll ${Number(urlMatch[2])} of ${urlMatch[1]}` : `"${m![1]}"`
    if (ep === 'roll_next') return refuse(ep, 'empty', `${rollN} not posted yet (the Clerk's error body)`)
    // A roll the listing names should exist: the body says "Please try again", so back off and retry.
    return refuse(ep, 'error', `Clerk error body for a listed roll (${rollN}): "Error sanitizing file"`)
  }
  if (root === null) drift('the body is not XML')
  if (root!.toLowerCase() === 'html') drift(`an HTML page (<${root}>) instead of a roll call XML`)
  if (root !== 'rollcall-vote') drift(`root element <${root}>, not <rollcall-vote>`)
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct !== '' && !ct.includes('xml')) drift(`content-type "${ct}" is not XML`)
  if (!urlMatch) drift(`URL ${res.url} is not https://clerk.house.gov/evs/{year}/rollNNN.xml`)
  if (!endsWithClose(body, ['</vote-data>', '</rollcall-vote>'])) drift('the body does not end with </vote-data></rollcall-vote> (truncated?)')

  // ---- head: <vote-metadata>, parsed as XML ----
  const cut = body.indexOf('</vote-metadata>')
  if (cut < 0) drift('no </vote-metadata>')
  const headEnd = cut + '</vote-metadata>'.length
  const head = body.slice(0, headEnd)
  if (hasUnknownEntity(head)) drift('<vote-metadata> holds an entity outside XML\'s five')
  const headDoc = `${head}</rollcall-vote>`
  const valid = XMLValidator.validate(headDoc)
  if (valid !== true) drift(`<vote-metadata> is not well-formed XML (${valid.err.msg})`)
  const doc = headParser.parse(headDoc) as Node
  for (const k of Object.keys(doc)) if (k !== '?xml' && k !== 'rollcall-vote') drift(`unexpected top-level <${k}>`)
  const rv = nodes(doc, 'rollcall-vote')
  if (rv.length !== 1) drift('not exactly one <rollcall-vote>')
  const rvNode = container(rv[0], 'rollcall-vote', ['vote-metadata'])
  const vm = nodes(rvNode, 'vote-metadata')
  if (vm.length !== 1) drift('not exactly one <vote-metadata>')
  const meta = container(vm[0], 'vote-metadata', META_CHILDREN)

  // ---- identity: XML vs URL (year rule, roll number) ----
  const congressText = collapseWs(leaf(meta, 'congress', 'vote-metadata')!)
  const sessionText = collapseWs(leaf(meta, 'session', 'vote-metadata')!)
  const rollText = collapseWs(leaf(meta, 'rollcall-num', 'vote-metadata')!)
  if (!/^[0-9]{2,3}$/.test(congressText)) drift(`<congress> "${congressText}" is not a Congress number`)
  const session = sessionNumber(sessionText)
  if (session === null) drift(`<session> "${sessionText}" is not 1st or 2nd`)
  if (!/^[1-9][0-9]{0,4}$/.test(rollText)) drift(`<rollcall-num> "${rollText}" is not a roll number`)
  const id: Identity = { year: Number(urlMatch![1]), roll: Number(rollText), congress: Number(congressText), session: session! }
  if (id.roll !== Number(urlMatch![2])) drift(`<rollcall-num> ${id.roll} is not the URL's roll ${urlMatch![2]}`)
  const cs = congressSessionOfYear(id.year)
  if (!cs || cs.congress !== id.congress || cs.session !== id.session) {
    drift(`the XML says Congress ${id.congress} session ${id.session}, but the URL's year ${id.year} is ${cs ? `${cs.congress}-${cs.session}` : 'out of range'}`)
  }

  // ---- chamber: <chamber>, or <committee> in the Committee of the Whole (roll275) ----
  const chamber = leaf(meta, 'chamber', 'vote-metadata', false)
  const committee = leaf(meta, 'committee', 'vote-metadata', false)
  if ((chamber === null) === (committee === null)) drift('need exactly one of <chamber> / <committee>')
  if (collapseWs((chamber ?? committee)!) !== HOUSE) drift(`<${chamber !== null ? 'chamber' : 'committee'}> is "${collapseWs((chamber ?? committee)!)}", not "${HOUSE}"`)
  const committeeOfTheWhole = committee !== null

  // ---- question, vote-type, result, legis-num ----
  leaf(meta, 'majority', 'vote-metadata', false) // printed once; not used (party control is not a fact of this vote)
  const question = collapseWs(leaf(meta, 'vote-question', 'vote-metadata')!)
  if (question === '') drift('empty <vote-question>')
  const voteTypeText = collapseWs(leaf(meta, 'vote-type', 'vote-metadata')!)
  const vt = VOTE_TYPES[norm(voteTypeText)]
  if (!vt) drift(`unknown <vote-type> "${voteTypeText}"`)
  const resultText = collapseWs(leaf(meta, 'vote-result', 'vote-metadata')!)
  if (resultText === '') drift('empty <vote-result>')
  const legisText = leaf(meta, 'legis-num', 'vote-metadata', false)
  let legis: LegisNum | null = null
  if (legisText !== null) {
    legis = parseLegisNum(legisText)
    if (!legis) drift(`<legis-num> "${collapseWs(legisText)}" is outside the bill table`)
  }
  const bill = legis?.kind === 'bill' ? legis : null
  const amendmentNum = leaf(meta, 'amendment-num', 'vote-metadata', false)
  const amendmentAuthor = leaf(meta, 'amendment-author', 'vote-metadata', false)
  const desc = collapseWs(leaf(meta, 'vote-desc', 'vote-metadata', false) ?? '')

  let kind: QuestionKind = QUESTIONS[norm(question)] ?? 'unknown'
  if (vt!.family === 'quorum') kind = 'quorum' // vote-type QUORUM is a quorum call whatever the question says
  if (kind === 'unknown' && VETO_WORDS.test(question)) drift(`possible veto vote, question not in the table: "${question}"`)
  if (kind === 'suspension_resolution' && !(bill && SUSPENSION_RESOLUTION_TYPES.has(bill.type))) {
    drift(`"${question}" adopts a resolution, but <legis-num> is ${legisText === null ? 'absent' : `"${collapseWs(legisText)}"`}, not an H RES or H CON RES`)
  }
  if (kind === 'resolution' && bill?.type === 'hres' && RULE_DESC.test(desc)) kind = 'rule'
  const speaker = kind === 'speaker_election'

  // ---- totals ----
  const totals = nodes(meta, 'vote-totals')
  if (totals.length !== 1) drift('not exactly one <vote-totals>')
  const tot = container(totals[0], 'vote-totals', TOTALS_CHILDREN)
  for (const h of nodes(tot, 'totals-by-party-header')) container(h, 'totals-by-party-header', PARTY_HEADER_CHILDREN)
  const byVote = nodes(tot, 'totals-by-vote')
  const byCandidate = nodes(tot, 'totals-by-candidate')
  const byPartyRaw = nodes(tot, 'totals-by-party')

  let counts: Bucket
  let candidates: VoteCandidate[] | undefined
  const byParty = new Map<string, { name: string; bucket: Bucket }>()
  if (speaker) {
    if (byVote.length > 0 || byPartyRaw.length > 0) drift('a Speaker election with <totals-by-vote> / <totals-by-party>')
    if (byCandidate.length === 0) drift('a Speaker election with no <totals-by-candidate>')
    counts = zero()
    candidates = []
    const seen = new Set<string>()
    for (const c of byCandidate) {
      const n = container(c, 'totals-by-candidate', ['candidate', 'candidate-total'])
      const name = collapseWs(leaf(n, 'candidate', 'totals-by-candidate')!)
      const votes = count(n, 'candidate-total', 'totals-by-candidate')
      if (name === '' || seen.has(norm(name))) drift(`<candidate> "${name}" is empty or repeated`)
      seen.add(norm(name))
      // `Present` and `Not Voting` are listed as candidates (roll2025_002, 2023 roll002); they are buckets, not people.
      if (norm(name) === 'present') counts.present = votes
      else if (norm(name) === 'not voting') counts.not_voting = votes
      else candidates.push({ name, votes })
    }
    if (candidates.length === 0) drift('a Speaker election with no named candidate')
  } else {
    if (byCandidate.length > 0) drift(`<totals-by-candidate> on a question that is not a Speaker election ("${question}")`)
    if (byVote.length !== 1) drift('not exactly one <totals-by-vote>')
    const v = container(byVote[0], 'totals-by-vote', ['total-stub', ...BUCKET_CHILDREN])
    const stub = leaf(v, 'total-stub', 'totals-by-vote', false)
    if (stub !== null && collapseWs(stub) !== 'Totals') drift(`<total-stub> "${collapseWs(stub)}" is not "Totals"`)
    counts = {
      yea: count(v, 'yea-total', 'totals-by-vote'),
      nay: count(v, 'nay-total', 'totals-by-vote'),
      present: count(v, 'present-total', 'totals-by-vote'),
      not_voting: count(v, 'not-voting-total', 'totals-by-vote'),
    }
    for (const p of byPartyRaw) {
      const n = container(p, 'totals-by-party', ['party', ...BUCKET_CHILDREN])
      const name = collapseWs(leaf(n, 'party', 'totals-by-party')!)
      const letter = PARTY_LETTER[norm(name)]
      if (!letter) drift(`unknown party "${name}" in <totals-by-party>`)
      if (byParty.has(letter!)) drift(`<totals-by-party> repeats ${name}`)
      byParty.set(letter!, {
        name,
        bucket: {
          yea: count(n, 'yea-total', 'totals-by-party'),
          nay: count(n, 'nay-total', 'totals-by-party'),
          present: count(n, 'present-total', 'totals-by-party'),
          not_voting: count(n, 'not-voting-total', 'totals-by-party'),
        },
      })
    }
    if (vt!.family === 'quorum' && (counts.yea !== 0 || counts.nay !== 0)) drift(`a quorum call with ${counts.yea} yeas and ${counts.nay} nays`)
  }

  // ---- passed: from vote-result only ----
  let passed: boolean | null
  if (speaker) {
    // The result names the top named candidate, even without a majority (2023 roll002: Jeffries, 212 of 434).
    const best = Math.max(...candidates!.map((c) => c.votes))
    const top = candidates!.filter((c) => c.votes === best)
    if (top.length !== 1 || norm(top[0]!.name) !== norm(resultText)) {
      drift(`Speaker election result "${resultText}" is not the single top candidate (${top.map((c) => c.name).join(', ')})`)
    }
    passed = null
  } else {
    const p = RESULTS[norm(resultText)]
    if (p === undefined) drift(`unknown <vote-result> "${resultText}"`)
    passed = vt!.family === 'quorum' ? null : p!
  }

  // ---- time: naive Eastern, D-Mon-YYYY + time-etz, cross-checked against the h:mm AM|PM text ----
  const time = actionTime(meta, id.year, res.fetchedAt)

  // ---- members: one forward scan of <vote-data> ----
  const tail = body.slice(headEnd)
  const open = /^\s*<vote-data>/.exec(tail)
  if (!open) drift('<vote-metadata> is not followed by <vote-data>')
  const closeAt = tail.lastIndexOf('</vote-data>')
  const data = tail.slice(open![0].length, closeAt)
  const candidateNames = new Map((candidates ?? []).map((c) => [c.name, c.name] as const))
  const positions: MemberPosition[] = []
  const tally = zero()
  const perParty = new Map<string, Bucket>()
  const perCandidate = new Map<string, number>()
  const ids = new Set<string>()
  let unresolved = 0
  let at = 0
  for (;;) {
    RECORDED_VOTE.lastIndex = at
    const m = RECORDED_VOTE.exec(data)
    if (!m) break
    at = RECORDED_VOTE.lastIndex
    const [, nameId, , , party, state, role, rawName, rawVote] = m
    const n = positions.length + 1
    if (!/^[A-Z][0-9]{6}$/.test(nameId!)) drift(`member ${n}: malformed name-id "${nameId}"`)
    if (ids.has(nameId!)) drift(`member ${n}: name-id ${nameId} appears twice`)
    ids.add(nameId!)
    if (!/^[DRI]$/.test(party!)) drift(`member ${n} (${nameId}): party "${party}" is not D, R or I`)
    if (!/^[A-Z]{2}$/.test(state!)) drift(`member ${n} (${nameId}): state "${state}" is not two letters`)
    if (role !== 'legislator' && role !== 'speaker') drift(`member ${n} (${nameId}): role "${role}"`)
    if (hasUnknownEntity(rawName!) || hasUnknownEntity(rawVote!)) drift(`member ${n} (${nameId}): an entity outside XML's five`)
    const sourceName = collapseWs(decodeEntities(rawName!))
    const voteText = collapseWs(decodeEntities(rawVote!))
    if (sourceName === '') drift(`member ${n} (${nameId}): no name`)
    const position = positionOf(voteText, vt!.family, speaker, candidateNames)
    if (position === null) drift(`member ${n} (${nameId}): vote "${voteText}" is outside the ${speaker ? 'Speaker election' : voteTypeText} vocabulary`)
    if (position === 'candidate') perCandidate.set(voteText, (perCandidate.get(voteText) ?? 0) + 1)
    else {
      tally[position!] += 1
      const pb = perParty.get(party!) ?? zero()
      pb[position!] += 1
      perParty.set(party!, pb)
    }
    const found = opts.members.lookupHouse(nameId!)
    if (!found) unresolved += 1
    positions.push({
      member_key: `bioguide:${nameId}`,
      id_confidence: 'authority', // the House name-id IS the bioguide (DESIGN §2.2), map entry or not
      lis: null,
      name: found ? found.name : sourceName,
      name_source: found ? 'map' : 'source',
      source_name: sourceName,
      party: party!,
      state: state!,
      role: role as 'legislator' | 'speaker',
      position: position!,
      vote_text: voteText,
      pair: null,
    })
  }
  if (data.slice(at).trim() !== '') {
    drift(`member ${positions.length + 1}: a <recorded-vote> block that does not match the recorded shape (offset ${headEnd + open![0].length + at})`)
  }
  if (positions.length === 0) drift('no member votes')

  // ---- the member votes must reproduce every printed total ----
  for (const k of ['yea', 'nay', 'present', 'not_voting'] as const) {
    if (tally[k] !== counts[k]) drift(`${tally[k]} ${k} member votes, but the totals say ${counts[k]}`)
  }
  for (const c of candidates ?? []) {
    const got = perCandidate.get(c.name) ?? 0
    if (got !== c.votes) drift(`${got} member votes for ${c.name}, but the totals say ${c.votes}`)
  }
  for (const [letter, pb] of speaker ? [] : perParty) {
    const row = byParty.get(letter)
    if (!row) drift(`members of party ${letter} voted, but <totals-by-party> has no row for it`)
    for (const k of ['yea', 'nay', 'present', 'not_voting'] as const) {
      if (pb[k] !== row!.bucket[k]) drift(`${pb[k]} ${k} votes from party ${letter}, but its <totals-by-party> row says ${row!.bucket[k]}`)
    }
  }
  for (const [letter, row] of byParty) {
    if (!perParty.has(letter) && (row.bucket.yea || row.bucket.nay || row.bucket.present || row.bucket.not_voting)) {
      drift(`<totals-by-party> ${row.name} has votes, but no member of party ${letter} voted`)
    }
  }

  // ---- the event ----
  const objectKey = `vote:house:${id.congress}:${id.session}:${id.roll}`
  const ref = `votes/house/${id.congress}/${id.session}/${id.roll}.json`
  const yea = speaker ? null : counts.yea
  const nay = speaker ? null : counts.nay
  const official = collapseWs([
    question,
    ...(legisText !== null ? [legisText] : []),
    ...(amendmentAuthor !== null && collapseWs(amendmentAuthor) !== '' ? [amendmentAuthor] : []),
    ...(desc !== '' ? [desc] : []),
    resultText,
  ].map(collapseWs).join(' — '))
  if (official.length > OFFICIAL_MAX) drift(`official text is ${official.length} characters (max ${OFFICIAL_MAX})`)

  const result: VoteResult = {
    question,
    question_kind: kind,
    result_text: resultText,
    required: vt!.required,
    passed,
    yea,
    nay,
    present: counts.present,
    not_voting: counts.not_voting,
    ...(candidates ? { candidates } : {}),
    ...(time.note ? { time_note: time.note } : {}),
    vote_type: voteTypeText,
    legis_num: legisText !== null ? collapseWs(legisText) : null,
    ...(amendmentNum !== null ? { amendment_num: collapseWs(amendmentNum) } : {}),
    ...(amendmentAuthor !== null ? { amendment_author: collapseWs(amendmentAuthor) } : {}),
    committee_of_the_whole: committeeOfTheWhole,
    ...(byParty.size > 0
      ? { by_party: [...byParty.values()].map((p) => ({ party: p.name, ...p.bucket })) }
      : {}),
  }

  const tier = importance(kind, bill)
  const title = titleOf(kind, id.roll, passed, bill, amendmentNum, question, { yea: counts.yea, nay: counts.nay, present: counts.present, not_voting: counts.not_voting }, candidates)
  if (title.length > TITLE_MAX) drift(`title is ${title.length} characters`)
  const bkey = bill ? billKey(id.congress, bill.type, bill.number) : null

  const event: CedEvent = finalizeEvent({
    dedup_key: `${objectKey}#result`,
    object_key: objectKey,
    ...(bkey ? { thread_key: bkey } : {}),
    event_type: 'vote.result',
    status: 'ended',
    branch: 'legislative',
    body: 'house',
    features: ['F5', 'F6'],
    title,
    official_text: official,
    importance: tier,
    times: { occurred_at: time.utc, scheduled_for: null, source_published_at: null, first_seen_at: res.fetchedAt },
    ...(bkey ? { related: [{ rel: 'about', key: bkey }] } : {}),
    result,
    member_votes_ref: ref,
    sources: [{
      source_id: SOURCE_ID,
      url: res.url,
      retrieved_at: res.fetchedAt,
      license: 'us-gov-public-domain',
      affiliation: 'official-nonpartisan',
    }],
    revision: 1,
    provenance: { parser: HOUSE_VOTES_PARSER, confidence: 'high' },
  })

  const record: MemberVotesRecord = {
    record_type: 'member_votes',
    record_version: '0.1',
    ref,
    vote_key: objectKey,
    chamber: 'house',
    congress: id.congress,
    session: id.session,
    roll: id.roll,
    source: { source_id: SOURCE_ID, url: res.url, retrieved_at: res.fetchedAt, parser: HOUSE_VOTES_PARSER },
    members_map: { ...opts.members.meta },
    counts: { yea, nay, present: counts.present, not_voting: counts.not_voting, ...(candidates ? { candidates } : {}) },
    unresolved,
    positions,
  }

  const notes: string[] = []
  if (unresolved > 0) notes.push(`${unresolved} member id${unresolved === 1 ? '' : 's'} not in the member list`)
  if (kind === 'unknown') notes.push(`unknown vote question "${question}"`)
  if (time.note) notes.push('ambiguous Eastern time (fall-back hour): occurred_at null')
  const detail = `roll call ${id.roll} (${id.congress}-${id.session}): ${positions.length} member votes${notes.length ? `; ${notes.join('; ')}` : ''}`
  return { events: [event], records: [record], health: health(ep, 'ok', detail, 1) }
}

type Pos = MemberPosition['position']

/** A member's vote word -> bucket, by vote-type family (DESIGN §2.1, §3.1). null = outside the vocabulary (drift). */
function positionOf(v: string, family: VoteFamily, speaker: boolean, candidates: ReadonlyMap<string, string>): Pos | null {
  if (v === 'Not Voting') return 'not_voting'
  if (v === 'Present') return 'present'
  if (speaker) return candidates.has(v) ? 'candidate' : null
  if (family === 'yea_nay') return v === 'Yea' ? 'yea' : v === 'Nay' ? 'nay' : null
  if (family === 'recorded') return v === 'Aye' ? 'yea' : v === 'No' ? 'nay' : null
  return null // a quorum call: only Present / Not Voting
}

/** `<action-date>16-Sep-2026</action-date><action-time time-etz="19:05">7:05 PM</action-time>` -> UTC (DESIGN §1.3,
 * §1.6). The time-etz must agree with the AM/PM text; an unknown month or a nonexistent wall time (spring forward) =
 * drift; an ambiguous one (fall back) = null + a note (R-13). */
function actionTime(meta: Node, urlYear: number, fetchedAt: string): { utc: string | null; note: string | null } {
  const dateText = collapseWs(leaf(meta, 'action-date', 'vote-metadata')!)
  const d = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(dateText)
  if (!d) drift(`<action-date> "${dateText}" is not D-Mon-YYYY`)
  const mo = MONTH_ABBR[d![2]!]
  if (!mo) drift(`<action-date> "${dateText}": unknown month "${d![2]}"`)
  const times = nodes(meta, 'action-time')
  if (times.length !== 1) drift('not exactly one <action-time>')
  const t = times[0]
  if (t === null || typeof t !== 'object') drift('<action-time> has no time-etz attribute')
  const tn = t as Node
  for (const k of Object.keys(tn)) if (k !== '#text' && k !== '@_time-etz') drift(`<action-time> has ${k.replace(/^@_/, '@')}`)
  const etzArr = tn['@_time-etz']
  const etz = Array.isArray(etzArr) && etzArr.length === 1 && typeof etzArr[0] === 'string' ? etzArr[0] : null
  const text = typeof tn['#text'] === 'string' ? collapseWs(tn['#text']) : ''
  const e = etz === null ? null : /^(\d{2}):(\d{2})$/.exec(etz)
  if (!e) drift(`<action-time> time-etz "${etz}" is not HH:MM`)
  const x = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(text)
  if (!x) drift(`<action-time> text "${text}" is not h:mm AM|PM`)
  const h12 = Number(x![1])
  if (h12 < 1 || h12 > 12) drift(`<action-time> text "${text}" has hour ${h12}`)
  const h = (h12 % 12) + (x![3] === 'PM' ? 12 : 0)
  if (h !== Number(e![1]) || x![2] !== e![2]) drift(`<action-time> time-etz ${etz} disagrees with its text "${text}"`)
  const y = Number(d![3])
  const day = Number(d![1])
  // The session of the URL's year (review 483d7ab F8, time F3): Jan 1 of that year up to noon Eastern on Jan 3 of the
  // next (20th Amendment), compared on the wall clock so the fall-back hour is bounded too.
  const mi = Number(e![2])
  const inSession = y === urlYear || (y === urlYear + 1 && mo === 1 && (day < 3 || (day === 3 && h < 12)))
  if (!inSession) drift(`<action-date> ${dateText} ${text} is outside the ${urlYear} session of the URL (${urlYear}-01-01 to ${urlYear + 1}-01-03 noon Eastern)`)
  const r = easternToUtc(y, mo!, day, h, mi)
  if (r.ok) {
    if (Date.parse(r.utc) > Date.parse(fetchedAt) + FUTURE_SKEW_MS) drift(`<action-date> ${dateText} ${text} is later than our own fetch (${fetchedAt})`)
    return { utc: r.utc, note: null }
  }
  if (r.reason === 'ambiguous') {
    // The earlier reading is EDT (wall + 4 h): if even that is after our fetch, the vote is in the future.
    if (Date.UTC(y, mo! - 1, day, h + 4, mi) > Date.parse(fetchedAt) + FUTURE_SKEW_MS) drift(`<action-date> ${dateText} ${text} is later than our own fetch (${fetchedAt})`)
    return { utc: null, note: `${text} Eastern on ${dateText} falls in the repeated fall-back hour, so the instant is ambiguous` }
  }
  if (r.reason === 'nonexistent') drift(`${text} Eastern on ${dateText} does not exist (spring-forward gap)`)
  drift(`<action-date> "${dateText}" ${text} is not a real date and time`)
  return { utc: null, note: null }
}

/** DESIGN §1.5 (D-012 decides P0). */
function importance(kind: QuestionKind, bill: { type: BillType } | null): { tier: Tier; reasons: string[] } {
  switch (kind) {
    case 'passage':
    case 'suspension_passage':
    case 'concur': {
      const reason = kind === 'passage' ? 'final_passage' : kind
      // Passage-class votes on bills and joint resolutions are P0; on a simple or concurrent resolution, P1.
      return { tier: bill && P0_BILL_TYPES.has(bill.type) ? 'P0' : 'P1', reasons: [reason] }
    }
    case 'veto_override':
      return { tier: 'P0', reasons: ['veto_override'] }
    case 'resolution':
    case 'suspension_resolution': // always an H RES or H CON RES (else drift before this)
      return { tier: 'P1', reasons: ['resolution'] }
    case 'speaker_election':
      return { tier: 'P0', reasons: ['speaker_election'] } // D-061 (owner): every Speaker ballot is an alert class
    case 'amendment':
      return { tier: 'P2', reasons: ['amendment'] }
    case 'quorum':
      return { tier: 'P3', reasons: ['quorum'] }
    case 'unknown':
      return { tier: 'P3', reasons: ['unknown_question'] }
    default: // rule, previous_question, consideration, table, adjourn, recommit
      return { tier: 'P3', reasons: ['procedural'] }
  }
}

/** Our title (DESIGN §0.4, §3.1): identifiers and numbers only, never the question, bill title or vote-desc. */
function titleOf(
  kind: QuestionKind, roll: number, passed: boolean | null, bill: { type: BillType; number: number } | null,
  amendmentNum: string | null, question: string, c: Bucket, candidates: VoteCandidate[] | undefined,
): string {
  const rc = `(roll call ${roll})`
  const tally = `${c.yea}-${c.nay}${c.present > 0 ? `, ${c.present} present` : ''}`
  const b = bill ? fmtBill(bill.type, bill.number) : null
  const neutral = `House roll call ${roll}: the question was ${passed === true ? 'agreed to' : passed === false ? 'not agreed to' : 'decided'}, ${tally}`
  const twoThirds = '; two-thirds needed'
  switch (kind) {
    case 'quorum':
      return `House quorum call: ${c.present} present, ${c.not_voting} not voting ${rc}`
    case 'speaker_election':
      // Named candidates only, and never "elected": whether a ballot elected anyone is not in the XML (critique T1).
      return `House vote for Speaker: ${candidates!.map((k) => `${k.name} ${k.votes}`).join(', ')} ${rc}`
    case 'adjourn':
      return `House ${passed ? 'voted' : 'declined'} to adjourn, ${tally} ${rc}`
    case 'unknown':
      return neutral
    default:
      break
  }
  if (!b) return neutral // every other template names the measure; without one, say only what is known
  switch (kind) {
    case 'passage':
      return `House ${passed ? 'passed' : 'rejected'} ${b}, ${tally} ${rc}`
    case 'suspension_passage':
      // "failed to pass", not "rejected": a majority can vote yes and still fail the two-thirds (critique T12).
      return `House ${passed ? 'passed' : 'failed to pass'} ${b} under suspension of the rules, ${tally}${twoThirds} ${rc}`
    case 'suspension_resolution':
      // The suspension wording above, for a resolution: "failed to adopt", not "rejected" (same two-thirds reason).
      return `House ${passed ? 'adopted' : 'failed to adopt'} ${b} under suspension of the rules, ${tally}${twoThirds} ${rc}`
    case 'concur': {
      const which = /amendments\s*$/i.test(question) ? 'amendments' : 'amendment'
      return `House ${passed ? 'agreed' : 'declined to agree'} to the Senate ${which} to ${b}, ${tally} ${rc}`
    }
    case 'veto_override':
      return `House ${passed ? 'overrode' : 'failed to override'} the veto of ${b}, ${tally}${twoThirds} ${rc}`
    case 'resolution':
    case 'rule':
      return `House ${passed ? 'adopted' : 'rejected'} ${b}, ${tally} ${rc}`
    case 'amendment':
      return `House ${passed ? 'adopted' : 'rejected'} ${amendmentNum !== null && collapseWs(amendmentNum) !== '' ? `amendment ${collapseWs(amendmentNum)}` : 'an amendment'} to ${b}, ${tally} ${rc}`
    case 'table':
      return `House ${passed ? 'voted' : 'declined'} to table ${b}, ${tally} ${rc}`
    case 'previous_question':
      return `House ${passed ? 'ordered' : 'did not order'} the previous question on ${b}, ${tally} ${rc}`
    case 'recommit':
      return `House ${passed ? 'agreed to' : 'rejected'} a motion to recommit ${b}, ${tally} ${rc}`
    case 'consideration':
      return `House ${passed ? 'agreed' : 'declined'} to consider ${b}, ${tally} ${rc}`
    default:
      return neutral
  }
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

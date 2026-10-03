// fr.api — the Federal Register API v1 (docs/SOURCES.md row `fr.api`; what was measured: docs/research/executive_branch.md
// §3 and its verifier additions). Two endpoints:
// - pi_current: the Public Inspection desk (`public-inspection-documents/current.json`): every document filed for
//   public inspection in the current issue, with its filing-slot time `filed_at`. A presidential document appears here
//   1–2 business days after signing, days before FR publication.
// - documents_newest: the newest published documents (`documents.json`, order=newest, an explicit fields[] list), one
//   page big enough to hold a whole daily issue, polled on its own slower cadence (D-046, open item O1).
// Both answer with no ETag/Last-Modified and are served from a shared cache despite `no-store` (copies up to ~104 min
// old), so the poller hashes the body and appends a cache-buster query to every call (`_=<epoch ms>` is tolerated:
// checked live 2026-10-02 on documents.json, and by the research on current.json).
//
// Pure: one response in, events + one health signal out. Fail closed: any payload we cannot read completely publishes
// nothing (docs/TRAPS.md "HTTP 200 does not mean success"; the FR answers a missing document with an HTML 404 page).
// "Completely" includes (adversarial review 2026-10-02, FR-1…FR-11): every result belongs to the endpoint it was fetched
// for, every key the endpoint always sends is present, the type is one the FR uses, links stay on the official hosts,
// times are plausible for the poll, repeats agree, `count` agrees with the list, and the payload is of a sane size.
import { dayInEt, finalizeEvent, isRealInstant } from '@ced/schema'
import type { CedEvent, EventDraft, FeatureId, Tier } from '@ced/schema'
import type { AdapterOutput, FetchedResponse, HealthStatus, SourceDefinition } from '../types.js'
import { frBranch } from '../lib/fr_branch.js'
import { frDateInWords, frInstantToUtc, isFrDate } from '../lib/fr_time.js'

const SOURCE_ID = 'fr.api'
const PARSER = 'fr_api@0.1.0'
const LICENSE = 'us-gov-public-domain'

const FR_HOST = 'www.federalregister.gov'

export const PI_CURRENT_URL = 'https://www.federalregister.gov/api/v1/public-inspection-documents/current.json'

/** Exactly the fields the adapter reads from documents.json (each one checked live 2026-10-02: an unknown field is a 400,
 * e.g. `presidential_document_type` is only a condition; the field is `subtype`). */
export const DOCUMENTS_FIELDS = [
  'agencies', 'citation', 'document_number', 'executive_order_number', 'html_url', 'pdf_url',
  'publication_date', 'significant', 'signing_date', 'subtype', 'title', 'type',
] as const

/** documents_newest asks for one page of this many; a reply can never list more (FR-11). Sized so one page holds a whole
 * daily issue, on the FR's own count for every publication day since 1994 (api/v1/documents/facets/daily, recorded
 * 2026-10-03 02:16Z as fixtures/fr.api/2026-10-03/facets_daily_since_1994.json): n=8,191 days from 1994-01-03 to
 * 2026-10-02, median 123 documents, largest 344 (2024-12-30; documents.json agrees), the only day above 300. That
 * record beat the one before it (269, 2001-01-22) by 28%, so the page leaves room for one more jump like it
 * (344 x 344/269 = 440; review R1 of 2026-10-03: the first sizing, 300, used only 2025-01-02..2026-10-02 and missed
 * 2024-12-30). A missed issue is silent downstream (review R2: the note below lasts one poll), which is why the margin
 * errs high: a page too big for the CPU budget fails loudly, a page too small does not. 400 still holds every issue on
 * record if CPU forces a cut. per_page=2000 is accepted (2000 results, 2026-10-03 01:40Z). The page lists
 * publication_date newest first, then document_number descending (0 order violations in 2000 results), so an issue
 * larger than the page loses its lowest-numbered documents, and the health detail says so (issueOverflowNote). The old
 * page of 20 saw ~20% of an issue (open item O1). */
export const DOCUMENTS_PER_PAGE = 500

/** documents_newest's own poll cadence (Endpoint.cadence; Public Inspection keeps the source cadence of 60 s). The list
 * changes about once a business day, when an issue is listed: none of those 8,191 issues fell on a weekend. The FR lists
 * an issue BEFORE its publication date (Monday's on the Saturday before, docs/TRAPS.md; when a weekday issue is listed
 * is unmeasured), so the old 06:00 ET expectation (docs/research/executive_branch.md §11 recipe) no longer times
 * anything here: such documents are "scheduled" (D-059) and become "published" on their Eastern date. 900 s by day also
 * catches a special edition or a late addition; 3600 s at night and on weekends, so a list posted overnight waits at
 * most an hour. 4 requests an hour by day instead of 60. */
export const DOCUMENTS_CADENCE = { business_s: 900, off_s: 3600 } as const

export const DOCUMENTS_NEWEST_URL =
  `https://www.federalregister.gov/api/v1/documents.json?per_page=${DOCUMENTS_PER_PAGE}&order=newest&` +
  DOCUMENTS_FIELDS.map((f) => `fields%5B%5D=${f}`).join('&')

type EndpointId = 'pi_current' | 'documents_newest'
type DocKind = 'rule' | 'proposed_rule' | 'notice' | 'presidential_document' | 'other'

/** Keys every Public Inspection result carries (107 of 107 on 2026-10-02; `filed_at`, `publication_date`,
 * `editorial_note` and `pdf_url` may be null, but the key is always there). current.json is fetched without fields[],
 * so a renamed field would not be a 400: a missing key is drift, never "none" (FR-2). */
export const PI_REQUIRED_KEYS = [
  'agencies', 'document_number', 'editorial_note', 'filed_at', 'filing_type', 'html_url', 'pdf_url',
  'publication_date', 'title', 'type',
] as const

/** What makes a result belong to its endpoint (FR-1) and where its links may point (FR-10). Hosts and paths as in
 * every recorded result (fixtures/fr.api/2026-10-02: 107 PI + 60 published). */
interface EndpointProfile {
  /** "a Public Inspection document": used in the drift detail. */
  noun: string
  /** html_url must be on www.federalregister.gov under this path (the endpoint's own desk). */
  htmlPath: string
  pdfHost: string
  required: readonly string[]
  /** More results than this is drift before any is read (FR-11). */
  maxResults: number
}

/** A real Public Inspection day lists about 100 documents (107 on 2026-10-02; 94–104 regular filings a day over 10
 * business days, docs/research/executive_branch.md §3). 1000 is ~10x that; this parser takes ~7.4 ms median for 1000
 * (0.8 ms for the real 107) on Node 26 on the home PC, 2026-10-02, so the cap only refuses an abnormal payload before it
 * can use up a Worker's CPU limit. The workerd figure is unmeasured (ROADMAP P1.3): tighten the cap if it binds. */
const MAX_PI_RESULTS = 1000
/** ~11x the 2026-10-02 current.json (175 KB) and ~3.9x a full documents_newest page of 500 (fixtures/fr.api/2026-10-03);
 * checked before JSON.parse, which is most of the cost of a huge body. */
const MAX_BODY_CHARS = 2_000_000

const PROFILES: Record<EndpointId, EndpointProfile> = {
  pi_current: {
    noun: 'a Public Inspection document',
    htmlPath: '/public-inspection/',
    pdfHost: 'public-inspection.federalregister.gov',
    required: PI_REQUIRED_KEYS,
    maxResults: MAX_PI_RESULTS,
  },
  documents_newest: {
    noun: 'a published document',
    htmlPath: '/documents/',
    pdfHost: 'www.govinfo.gov',
    required: DOCUMENTS_FIELDS,
    maxResults: DOCUMENTS_PER_PAGE,
  },
}

/** Top-level keys of an empty answer, exactly as seen live (FR-7): the PI search answered {"count":0,"results":[]}
 * (current.json also carries its two *_updated_at keys); documents.json answered {"description":…,"count":0}. */
const PI_EMPTY_KEYS = new Set(['count', 'results', 'special_filings_updated_at', 'regular_filings_updated_at'])
const DOCUMENTS_EMPTY_KEYS = new Set(['description', 'count'])

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** A filing time may be at most this far after our poll: allowance for clock skew between the poller and the FR. */
const FILED_AHEAD_MS = 6 * HOUR_MS
/** No FR time or date we publish is further than this from the poll. PI holds a document only until it publishes
 * (filed_at 2.8–24 h before the poll on 2026-10-02, n=106); the bound only rejects impossible values (FR-6). */
const MAX_DISTANCE_MS = 366 * DAY_MS

/** documents.json lists an issue's documents before their publication date (docs/TRAPS.md has the measurement); such a
 * document is shown as scheduled (D-055, D-059). A week covers a weekend plus a holiday stretch with room to spare; a
 * date further ahead is drift (FR-6): a broken record, not a schedule. */
export const MAX_SCHEDULED_AHEAD_DAYS = 7

/** The poll's own times, which the plausibility windows are measured from. */
interface PollContext {
  at: EndpointId
  fetchedMs: number
  /** 00:00Z of the poll's UTC day. */
  fetchDayMs: number
  /** The poll's calendar day in Eastern time, "YYYY-MM-DD": the FR dates its issues in Eastern time, so a listed
   * document dated after this day has not been published yet (D-055). */
  dayEt: string
}

/** One FR result after the shape check: every field typed, optional ones null. */
interface FrDoc {
  document_number: string
  /** The source's title, whitespace-trimmed only (official_text). */
  title: string
  kind: DocKind
  html_url: string
  pdf_url: string | null
  /** The most specific listed agency that has a slug (see primaryAgency), or null. */
  agency: { slug: string; name: string | null } | null
  /** Every listed agency slug, in the source's order (for the branch rule). */
  agency_slugs: string[]
  /** UTC; PI only. */
  filed_at: string | null
  publication_date: string | null
  editorial_note: string | null
  subtype: string | null
  executive_order_number: string | null
  significant: boolean | null
  signing_date: string | null
  citation: string | null
}

class Drift extends Error {}

// FR document numbers look like 2026-20439 (older: E6-12345, C1-2026-12345). Anything else could not be keyed safely.
const DOC_NUMBER = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const HTTPS_URL = /^https:\/\/[^\s]+$/
const AGENCY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EO_NUMBER = /^[1-9]\d{0,5}$/
const UTC_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** null/undefined/"" -> null; a string -> trimmed; anything else is drift. */
function optString(raw: Record<string, unknown>, key: string, num: string): string | null {
  const v = raw[key]
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') throw new Drift(`document ${num}: ${key} is not text`)
  const t = v.trim()
  return t === '' ? null : t
}

function optDate(raw: Record<string, unknown>, key: string, num: string): string | null {
  const v = optString(raw, key, num)
  if (v !== null && !isFrDate(v)) throw new Drift(`document ${num}: ${key} is not a YYYY-MM-DD date (${v.slice(0, 40)})`)
  return v
}

/** True when `v` is an https link on exactly `host` (no port, no user:password@ trick) whose normalized path starts
 * with `pathPrefix`. Checked on the parsed URL, so "https://www.federalregister.gov@evil.example/…" is evil.example. */
function onOfficialHost(v: string, host: string, pathPrefix: string): boolean {
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return false
  }
  return u.protocol === 'https:' && u.hostname === host && u.port === '' && u.username === '' && u.password === '' &&
    u.pathname.startsWith(pathPrefix)
}

function optHttpsUrl(raw: Record<string, unknown>, key: string, num: string, host: string): string | null {
  const v = optString(raw, key, num)
  if (v === null) return null
  if (!HTTPS_URL.test(v) || v.length > 2000) throw new Drift(`document ${num}: ${key} is not an https link`)
  if (!onOfficialHost(v, host, '/')) throw new Drift(`document ${num}: ${key} is not on ${host}`)
  return v
}

/** A YYYY-MM-DD date no further than MAX_DISTANCE_MS from the poll's UTC day (FR-6). */
function optPlausibleDate(raw: Record<string, unknown>, key: string, num: string, ctx: PollContext): string | null {
  const v = optDate(raw, key, num)
  if (v !== null && Math.abs(Date.parse(`${v}T00:00:00Z`) - ctx.fetchDayMs) > MAX_DISTANCE_MS) {
    throw new Drift(`document ${num}: ${key} ${v} is more than a year from the poll`)
  }
  return v
}

function optInt(raw: Record<string, unknown>, key: string, num: string): number | null {
  const v = raw[key]
  if (v === undefined || v === null) return null
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Drift(`document ${num}: agency ${key} is not a whole number`)
  return v
}

interface ListedAgency { slug: string | null; name: string | null; id: number | null; parent_id: number | null }

/** The agency a document is FROM: the first listed agency (with a slug) that is not the parent of another listed
 * agency. Why not simply the first: Public Inspection lists only the sub-agency (58 of 107 documents on 2026-10-02,
 * e.g. CBP with parent_id 227), while documents.json lists the parent department first (HHS, then CMS). "First" would
 * give one document two different bodies at its two transitions; "most specific" gives the same one, and equals "first"
 * whenever a single agency is listed. */
function primaryAgency(listed: ListedAgency[]): { slug: string; name: string | null } | null {
  const parents = new Set(listed.flatMap((a) => (a.parent_id === null ? [] : [a.parent_id])))
  const slugged = listed.filter((a): a is ListedAgency & { slug: string } => a.slug !== null)
  const pick = slugged.find((a) => a.id === null || !parents.has(a.id)) ?? slugged[0]
  return pick ? { slug: pick.slug, name: pick.name } : null
}

/** The FR's document types, by its own display names. Anything else is drift (FR-3): the type alone decides the P0
 * rule, so a new spelling ("PRESDOCU", "Presidential Documents") must never quietly turn a presidential document into a
 * P4 "other". "Uncategorized Document" is the FR's name for its UNKNOWN type and is kept as fr.published.other. */
function kindOf(type: string): DocKind | null {
  switch (type.trim().toLowerCase()) {
    case 'rule': return 'rule'
    case 'proposed rule': return 'proposed_rule'
    case 'notice': return 'notice'
    case 'presidential document': return 'presidential_document'
    case 'uncategorized document': return 'other'
    default: return null
  }
}

/** The shape check for one result. Throws Drift with plain words; the caller then publishes nothing. */
function readDoc(raw: unknown, ctx: PollContext): FrDoc {
  const profile = PROFILES[ctx.at]
  if (!isObject(raw)) throw new Drift('a result is not an object')
  const num = raw.document_number
  if (num === undefined || num === null) throw new Drift('a result has no document_number')
  if (typeof num !== 'string' || !DOC_NUMBER.test(num) || num.length > 40) {
    throw new Drift(`a result has an unusable document_number (${JSON.stringify(num).slice(0, 40)})`)
  }
  // The html_url says which desk a result comes from (/public-inspection/ or /documents/), so it is checked first: a
  // payload delivered to the wrong endpoint must not publish (FR-1), and the link must stay on the FR host (FR-10).
  if (typeof raw.html_url !== 'string') throw new Drift(`document ${num} has no html_url`)
  if (!HTTPS_URL.test(raw.html_url) || raw.html_url.length > 2000) throw new Drift(`document ${num}: html_url is not an https link`)
  if (!onOfficialHost(raw.html_url, FR_HOST, profile.htmlPath)) {
    throw new Drift(`document ${num} is not ${profile.noun} (its html_url is not under https://${FR_HOST}${profile.htmlPath})`)
  }
  // Every key the endpoint always sends must be there; null is the source saying "none", absence is drift (FR-2).
  for (const key of profile.required) {
    if (!Object.hasOwn(raw, key)) throw new Drift(`document ${num} has no "${key}" field`)
  }
  if (typeof raw.title !== 'string' || raw.title.trim() === '') throw new Drift(`document ${num} has no title`)
  const title = raw.title.trim()
  if (title.length > 4000) throw new Drift(`document ${num}: title is longer than 4000 characters`)
  // `type` decides the event type and the P0 rule, so it is required too, and must be a type we know.
  if (typeof raw.type !== 'string' || raw.type.trim() === '') throw new Drift(`document ${num} has no type`)
  const kind = kindOf(raw.type)
  if (kind === null) throw new Drift(`document ${num} has an unknown type "${raw.type.trim().slice(0, 60)}"`)
  if (ctx.at === 'pi_current' && (typeof raw.filing_type !== 'string' || raw.filing_type.trim() === '')) {
    throw new Drift(`document ${num}: filing_type is not text`)
  }

  // Only an explicit [] means "no agency" (D-030 federal_register); null is not a list.
  if (!Array.isArray(raw.agencies)) throw new Drift(`document ${num}: agencies is not a list`)
  const listed: ListedAgency[] = []
  for (const a of raw.agencies) {
    if (!isObject(a)) throw new Drift(`document ${num}: an agency is not an object`)
    // FR lists some agencies by raw_name only (no slug); they cannot become a body but still count as parents.
    const slug = optString(a, 'slug', num)
    if (slug !== null && !AGENCY_SLUG.test(slug)) throw new Drift(`document ${num}: agency slug "${slug.slice(0, 60)}" is not an FR slug`)
    listed.push({ slug, name: optString(a, 'name', num), id: optInt(a, 'id', num), parent_id: optInt(a, 'parent_id', num) })
  }

  let filed_at: string | null = null
  const filed = optString(raw, 'filed_at', num)
  if (filed !== null) {
    filed_at = frInstantToUtc(filed)
    if (filed_at === null) throw new Drift(`document ${num}: filed_at is not a real time with a valid UTC offset (${filed.slice(0, 40)})`)
    const ms = Date.parse(filed_at)
    if (ms > ctx.fetchedMs + FILED_AHEAD_MS || ms < ctx.fetchedMs - MAX_DISTANCE_MS) {
      throw new Drift(`document ${num}: filed_at ${filed.slice(0, 40)} is not a plausible filing time for a poll at ${new Date(ctx.fetchedMs).toISOString()}`)
    }
  }

  const subtype = optString(raw, 'subtype', num)
  let eo: string | null = null
  const eoRaw = raw.executive_order_number
  if (typeof eoRaw === 'number' && Number.isInteger(eoRaw)) eo = String(eoRaw)
  else if (eoRaw !== undefined && eoRaw !== null && eoRaw !== '') {
    if (typeof eoRaw !== 'string') throw new Drift(`document ${num}: executive_order_number is not a number`)
    eo = eoRaw.trim()
  }
  if (eo !== null && !EO_NUMBER.test(eo)) throw new Drift(`document ${num}: executive_order_number "${eo.slice(0, 20)}" is not a number`)
  // An EO number names an executive order; on anything else it would thread a rule into that EO or title a notice
  // "Executive Order N" (FR-4). The live FR sets it only on EOs, so a conflict is drift, not a choice.
  if (eo !== null && !(kind === 'presidential_document' && subtype !== null && /^executive order$/i.test(subtype))) {
    throw new Drift(`document ${num} has an executive_order_number but is not an executive order (type "${raw.type.trim().slice(0, 40)}", subtype ${JSON.stringify(subtype)?.slice(0, 40)})`)
  }

  const sig = raw.significant
  if (sig !== undefined && sig !== null && typeof sig !== 'boolean') throw new Drift(`document ${num}: significant is not true/false`)

  const publication_date = optPlausibleDate(raw, 'publication_date', num, ctx)
  const signing_date = optPlausibleDate(raw, 'signing_date', num, ctx)
  // A listed document dated after the poll's Eastern day is scheduled (D-055), but only up to a week ahead; nothing is
  // signed after it is published (FR-6).
  if (ctx.at === 'documents_newest' && publication_date !== null &&
    Date.parse(`${publication_date}T00:00:00Z`) - Date.parse(`${ctx.dayEt}T00:00:00Z`) > MAX_SCHEDULED_AHEAD_DAYS * DAY_MS) {
    throw new Drift(`document ${num}: publication_date ${publication_date} is more than ${MAX_SCHEDULED_AHEAD_DAYS} days after the poll's Eastern day ${ctx.dayEt}`)
  }
  if (signing_date !== null && publication_date !== null && signing_date > publication_date) {
    throw new Drift(`document ${num}: signing_date ${signing_date} is after its publication_date ${publication_date}`)
  }

  return {
    document_number: num,
    title,
    kind,
    html_url: raw.html_url,
    pdf_url: optHttpsUrl(raw, 'pdf_url', num, profile.pdfHost),
    agency: primaryAgency(listed),
    agency_slugs: listed.flatMap((a) => (a.slug === null ? [] : [a.slug])),
    filed_at,
    publication_date,
    editorial_note: optString(raw, 'editorial_note', num),
    subtype,
    executive_order_number: eo,
    significant: typeof sig === 'boolean' ? sig : null,
    signing_date,
    citation: optString(raw, 'citation', num),
  }
}

// ---- mapping (each rule is a choice a reviewer should be able to check against the source) ----

/** body: a presidential document is the White House's act, whatever FR agency it is filed under ("Executive Office of
 * the President"); otherwise the most specific listed agency (primaryAgency: a CMS rule is
 * agency:centers-for-medicare-medicaid-services at both transitions); no agency at all -> federal_register (D-030). */
function bodyOf(d: FrDoc): string {
  if (d.kind === 'presidential_document') return 'white_house'
  return d.agency ? `agency:${d.agency.slug}` : 'federal_register'
}

/** Our plain-words subject: who and what, from structured fields only (never parsed out of the title, which can name
 * an EO it merely implements, e.g. a GSA rule "Implementation of Executive Order 14275"). */
function subjectOf(d: FrDoc): string {
  if (d.kind === 'presidential_document') {
    if (d.executive_order_number) return `Executive Order ${d.executive_order_number}`
    const sub = d.subtype
    if (!sub) return 'Presidential document'
    if (/^executive order$/i.test(sub)) return 'Executive order'
    if (/^presidential\b/i.test(sub)) return sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase()
    return `Presidential ${sub.toLowerCase()}`
  }
  const word = { rule: 'rule', proposed_rule: 'proposed rule', notice: 'notice', other: 'document' }[d.kind]
  const agency = d.agency?.name
  return agency ? `${agency} ${word}` : word.charAt(0).toUpperCase() + word.slice(1)
}

const MAX_TITLE = 1000 // event.schema.json title maxLength

function capTitle(s: string): string {
  const oneLine = s.replace(/\s+/g, ' ')
  if (oneLine.length <= MAX_TITLE) return oneLine
  let cut = oneLine.slice(0, MAX_TITLE - 1)
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1) // never split a surrogate pair
  return cut + '…'
}

/** FR presidential-document subtypes that are D-012 alert classes (EOs, proclamations, memoranda). */
const P0_SUBTYPES: ReadonlyMap<string, string> = new Map([
  ['executive order', 'executive_order'],
  ['proclamation', 'proclamation'],
  ['memorandum', 'memorandum'],
])

/** Importance (docs/EVENT_MODEL.md tiers; rules only):
 * - a presidential document at Public Inspection is P0: D-012 names "Public Inspection filings" of presidential
 *   actions as an alert class, and this is the first official sighting with the full text;
 * - at publication, an executive order, proclamation or memorandum (the FR `subtype`) is P0: EVENT_MODEL's P0 examples
 *   name those three classes wherever they are seen, and "narrowing it is the owner's call" (review FR-9), so an EO is
 *   P0 here as it is in wh.feeds (P0_SUBS). Other presidential documents (notices, determinations) and an unknown
 *   subtype are P1 ("other presidential actions"); they were already P0 at Public Inspection;
 * - rules: P1 only when the FR's own `significant` flag is true; false or unknown -> P3 ("routine rules"). The flag is
 *   null on ~59% of rules (research CUR §3.1) and absent at Public Inspection, so unknown is said, never assumed;
 * - proposed rules P2, notices P4 (~82% of FR volume), anything else P4. */
function importanceOf(d: FrDoc, at: EndpointId, scheduled: boolean): { tier: Tier; reasons: string[] } {
  // A document listed before its date keeps the tier it will have when published (an EO is P0 wherever it is seen);
  // only the reason says which stage this is (review adapter-3 of 861a6f4).
  const stage = scheduled ? 'presidential_document_scheduled' : 'presidential_document_published'
  switch (d.kind) {
    case 'presidential_document': {
      if (at === 'pi_current') return { tier: 'P0', reasons: ['presidential_document_filed_for_public_inspection', 'D-012'] }
      if (d.subtype === null) return { tier: 'P1', reasons: [stage, 'subtype_unknown'] }
      const alertClass = P0_SUBTYPES.get(d.subtype.toLowerCase())
      return alertClass
        ? { tier: 'P0', reasons: [stage, alertClass, 'D-012'] }
        : { tier: 'P1', reasons: [stage] }
    }
    case 'rule':
      if (d.significant === true) return { tier: 'P1', reasons: ['rule', 'significant'] }
      return { tier: 'P3', reasons: ['rule', d.significant === false ? 'not_significant' : 'significance_unknown'] }
    case 'proposed_rule':
      return { tier: 'P2', reasons: ['proposed_rule'] }
    case 'notice':
      return { tier: 'P4', reasons: ['notice'] }
    default:
      return { tier: 'P4', reasons: ['other_document_type'] }
  }
}

/** A listed document whose publication date is after the poll's Eastern day: listed before its official publication
 * date (the FR's own document page and the issue PDF are already public then, docs/TRAPS.md), D-055. YYYY-MM-DD compares
 * as text. */
function isScheduled(d: FrDoc, at: EndpointId, dayEt: string): boolean {
  return at === 'documents_newest' && d.publication_date !== null && d.publication_date > dayEt
}

function draftOf(d: FrDoc, at: EndpointId, fetchedAt: string, dayEt: string): EventDraft {
  const objectKey = `fr:${d.document_number}`
  const isPi = at === 'pi_current'
  const scheduled = isScheduled(d, at, dayEt)
  const features: FeatureId[] = d.kind === 'presidential_document' ? ['F10', 'F9'] : ['F10']

  let title: string
  if (isPi) {
    // The editorial note is the FR's own warning (e.g. the agency asked to withdraw the document after it was placed
    // on public inspection, 2026-20295); the row says one exists and `result.editorial_note` carries it verbatim.
    // The title says what happened; the document's own title is official_text, shown right under it, so it is not
    // repeated here (D-043). The FR document number tells same-titled documents apart.
    title = `${subjectOf(d)} filed for public inspection${d.editorial_note ? ' (with an editorial note)' : ''} (FR Doc. ${d.document_number})`
  } else if (scheduled) {
    // Listed before its date (D-055). The same event says "published" once the poll's Eastern day reaches the date: a
    // revision, because the poller parses an unchanged list again on each new Eastern day (Endpoint.dayDependent).
    title = `${subjectOf(d)} to be published in the Federal Register on ${frDateInWords(d.publication_date!)} (FR Doc. ${d.document_number})`
  } else {
    // publication_date has no time of day: it goes into words, never into occurred_at.
    const when = d.publication_date ? ` on ${frDateInWords(d.publication_date)}` : ''
    title = `${subjectOf(d)} published in the Federal Register${when} (FR Doc. ${d.document_number})`
  }

  // Date-only and flag facts, verbatim from the source, only when present.
  const result: Record<string, unknown> = {}
  if (d.publication_date) result.publication_date = d.publication_date
  if (isPi && d.editorial_note) result.editorial_note = d.editorial_note
  if (!isPi) {
    if (d.signing_date) result.signing_date = d.signing_date
    if (d.executive_order_number) result.executive_order_number = d.executive_order_number
    if (d.significant !== null) result.significant = d.significant
    if (d.citation) result.citation = d.citation
  }

  // EO numbers come only from the structured field (published documents); Public Inspection does not carry one, and the
  // PI event and the published event already share object_key fr:<document_number>.
  const eoKey = !isPi && d.executive_order_number ? `eo:${d.executive_order_number}` : null

  return {
    dedup_key: `${objectKey}#${isPi ? 'public_inspection' : 'published'}`,
    object_key: objectKey,
    ...(eoKey ? { thread_key: eoKey, alias_keys: [eoKey] } : {}),
    event_type: isPi ? 'fr.public_inspection' : `fr.published.${d.kind}`,
    status: scheduled ? 'scheduled' : 'published',
    branch: frBranch(d.kind === 'presidential_document', d.agency_slugs),
    body: bodyOf(d),
    features,
    title: capTitle(title),
    official_text: d.title,
    importance: importanceOf(d, at, scheduled),
    times: {
      // PI: the filing-slot time the FR states, converted from its offset to UTC; null when the FR gives none (a
      // withdrawn filing has filed_at null). Published: null, because publication_date is a date with no time.
      occurred_at: isPi ? d.filed_at : null,
      first_seen_at: fetchedAt,
    },
    ...(d.pdf_url ? { media: [{ kind: 'pdf' as const, url: d.pdf_url }] } : {}),
    ...(Object.keys(result).length > 0 ? { result } : {}),
    sources: [{ source_id: SOURCE_ID, url: d.html_url, retrieved_at: fetchedAt, license: LICENSE, affiliation: 'official-nonpartisan' }],
    revision: 1,
    provenance: { parser: PARSER, confidence: 'high' },
  }
}

// ---- the response-level checks ----

function contentKind(contentType: string, body: string): string {
  if (/html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(body)) return 'an HTML page'
  if (/xml/i.test(contentType)) return 'an XML document'
  return contentType ? `a body of type ${contentType.split(';')[0]!.trim()}` : 'a body'
}

export function parseFr(endpointId: string, res: FetchedResponse): AdapterOutput {
  const out = (status: HealthStatus, detail: string, items_seen = 0, events: CedEvent[] = []): AdapterOutput => ({
    events,
    health: { source_id: SOURCE_ID, endpoint: endpointId, status, detail, items_seen },
  })
  if (endpointId !== 'pi_current' && endpointId !== 'documents_newest') return out('error', `unknown endpoint "${endpointId}"`)
  const at: EndpointId = endpointId

  if (res.status === 304) return out('not_modified', 'HTTP 304: not modified since the last poll')
  const ct = res.headers['content-type'] ?? ''
  if (res.status !== 200) return out('error', `HTTP ${res.status} with ${contentKind(ct, res.body)} instead of JSON data`)
  if (ct !== '' && !/json/i.test(ct)) return out('error', `HTTP 200 but ${contentKind(ct, res.body)} instead of JSON data`)
  if (!UTC_Z.test(res.fetchedAt) || !isRealInstant(res.fetchedAt)) {
    return out('error', `the poller's fetch time is not a UTC instant (${res.fetchedAt.slice(0, 40)})`)
  }

  // An abnormal body is refused before JSON.parse, which is most of the parse cost (FR-11).
  if (res.body.length > MAX_BODY_CHARS) {
    return out('drift', `the body is ${res.body.length} characters, more than the ${MAX_BODY_CHARS} this adapter parses; nothing was published`)
  }
  let payload: unknown
  try {
    payload = JSON.parse(res.body)
  } catch {
    return out('error', `HTTP 200 but ${contentKind(ct, res.body)} that is not valid JSON`)
  }
  if (!isObject(payload)) return out('drift', 'the JSON body is not an object; nothing was published')
  // docs/TRAPS.md "HTTP 200 does not mean success": an error object is an error, whatever else the body says (FR-7).
  for (const key of ['errors', 'error']) {
    if (payload[key] !== undefined && payload[key] !== null) {
      return out('error', `HTTP 200 but the JSON body is an error reply ("${key}"); nothing was published`)
    }
  }
  const empty = (): AdapterOutput =>
    out('empty', at === 'pi_current' ? 'no documents on public inspection' : 'no published documents returned')
  const keys = Object.keys(payload)
  const results = payload.results
  // Only the exact empty shapes seen live count as "nothing here" (FR-7): documents.json answers an empty search with
  // {"description":…,"count":0} and NO results key; the PI search answers {"count":0,"results":[]}.
  if (at === 'documents_newest' && results === undefined && payload.count === 0 &&
    typeof payload.description === 'string' && keys.every((k) => DOCUMENTS_EMPTY_KEYS.has(k))) return empty()
  if (!Array.isArray(results)) return out('drift', 'the JSON body has no "results" list; nothing was published')
  if (results.length === 0) {
    if (at === 'pi_current' && payload.count === 0 && keys.every((k) => PI_EMPTY_KEYS.has(k))) return empty()
    return out('drift', `an empty "results" list in a shape ${at} has not been seen to send (count ${JSON.stringify(payload.count) ?? 'missing'}); nothing was published`)
  }
  const profile = PROFILES[at]
  if (results.length > profile.maxResults) {
    return out('drift', `${results.length} results, more than the ${profile.maxResults} this adapter reads in one poll; nothing from this payload was published`, results.length)
  }

  const fetchedMs = Date.parse(res.fetchedAt)
  const ctx: PollContext = {
    at, fetchedMs, fetchDayMs: Date.parse(`${res.fetchedAt.slice(0, 10)}T00:00:00Z`), dayEt: dayInEt(fetchedMs),
  }
  const docs: FrDoc[] = []
  const seen = new Map<string, FrDoc>()
  let duplicates = 0
  for (const [i, raw] of results.entries()) {
    const fail = (why: string): AdapterOutput =>
      out('drift', `result ${i + 1} of ${results.length}: ${why}; nothing from this payload was published`, results.length)
    let d: FrDoc
    try {
      d = readDoc(raw, ctx)
    } catch (e) {
      if (!(e instanceof Drift)) throw e
      return fail(e.message)
    }
    // The same document twice in one payload would give two events with one id. An exact repeat (as far as every field
    // we read goes) is skipped and reported; two copies that disagree leave no way to know which is true (FR-5).
    const earlier = seen.get(d.document_number)
    if (earlier !== undefined) {
      // Both copies come out of readDoc with the same field order, so equal text means equal content.
      if (JSON.stringify(earlier) !== JSON.stringify(d)) return fail(`document ${d.document_number} appears twice with different content`)
      duplicates++
      continue
    }
    seen.set(d.document_number, d)
    docs.push(d)
  }
  // current.json is one unpaginated list, so its count is the list's length; documents.json's count is the number of
  // matches over all pages (10000 = the FR's cap on 2026-10-02), never fewer than the page lists (FR-7).
  const count = payload.count
  const countFits = typeof count === 'number' && Number.isInteger(count) &&
    (at === 'pi_current' ? count === results.length : count >= results.length)
  if (!countFits) {
    return out('drift', `the body says count ${JSON.stringify(count) ?? 'nothing'} but lists ${results.length} results; nothing from this payload was published`, results.length)
  }

  const events = docs.map((d) => finalizeEvent(draftOf(d, at, res.fetchedAt, ctx.dayEt)))
  const what = at === 'pi_current' ? 'documents on public inspection' : 'newest published documents'
  const dupNote = duplicates > 0 ? `; ${duplicates} repeated document number${duplicates === 1 ? '' : 's'} skipped` : ''
  const early = docs.filter((d) => isScheduled(d, at, ctx.dayEt)).length
  // "published" would count the scheduled ones too: then the list is described as listed (review adapter-2).
  const listed = early > 0 ? `newest listed documents, ${early} of them before their publication date (scheduled)` : what
  const overflow = at === 'documents_newest' ? issueOverflowNote(docs, results.length, count, ctx.dayEt) : ''
  return out('ok', `${results.length} ${listed}${dupNote}${overflow}`, results.length, events)
}

/** documents_newest is one page (DOCUMENTS_PER_PAGE). When more matches exist beyond it (count above the number listed)
 * and no listed document is dated before the newest listed publication_date, the page never reached the previous
 * issue, so the newest issue may hold documents this poll cannot see: they would never be seen as published (their
 * Public Inspection event is unaffected). Every result was read, so this stays ok, never drift; the detail says it.
 * A document with no publication_date is not evidence that the page reached an older issue. */
function issueOverflowNote(docs: readonly FrDoc[], listed: number, count: number, dayEt: string): string {
  if (count <= listed) return ''
  const dates = docs.flatMap((d) => (d.publication_date === null ? [] : [d.publication_date]))
  if (dates.length === 0) return ''
  const newest = dates.reduce((a, b) => (b > a ? b : a)) // YYYY-MM-DD compares as text
  if (dates.some((d) => d < newest)) return ''
  // An issue listed ahead of its date (D-059) that overflows the page: its cut documents are not seen at all.
  const unseen = newest > dayEt ? 'and those are not seen' : 'and those are not seen as published'
  return `; none is dated before ${frDateInWords(newest)}, so that day's issue may have more documents than this page of ${listed} holds, ${unseen}`
}

export const frApi: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'Federal Register',
  affiliation: 'official-nonpartisan',
  license: LICENSE,
  features: ['F10', 'F9'],
  endpoints: [
    { id: 'pi_current', url: PI_CURRENT_URL, validator: 'body-hash', cacheBust: true },
    // dayDependent: a document listed early reads "scheduled" only until its Eastern date (D-055), so the same body
    // must be parsed again on the next Eastern day.
    {
      id: 'documents_newest', url: DOCUMENTS_NEWEST_URL, validator: 'body-hash', cacheBust: true,
      cadence: { ...DOCUMENTS_CADENCE }, dayDependent: true,
    },
  ],
  // The source cadence is Public Inspection's (documents_newest has its own, DOCUMENTS_CADENCE). Business hours: every
  // minute (Phase 1's cron floor), covering the PI slots 08:45, 11:15, 14:00, 16:15 and 18:00 ET. Off hours: every
  // 15 min (research recipe, EXE §3). PI at 60/h plus documents at 4/h is 64 requests/h by day; the budget leaves room
  // for backoff retries and stays far below the 1 request/s etiquette (the FR publishes no rate limit).
  cadence: { business_s: 60, off_s: 900 },
  freshness_slo_s: 120,
  rate_budget_per_h: 180,
  parse: parseFr,
}

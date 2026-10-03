// senate.schedule — the Senate's next floor convene (floor_schedule.json) and its committee meetings (hearings.xml):
// floor.convened (scheduled), hearing.scheduled and markup.scheduled events. Design: docs/design/P2.1.md §3.4
// (keys §1.4, times §1.3, tiers §1.5, R-7, R-8, R-12, R-13).
// FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// Pure: one response in, events + one health signal out; no network, no clock (the clock is res.fetchedAt). Fail closed:
// any structure we did not record is health `drift` with zero events from that payload (a partial publish would hide
// which meetings are missing). Every rule below says which fixture it rests on.
import { finalizeEvent, type CedEvent } from '@ced/schema'
import type { AdapterOutput, FetchedResponse, HealthSignal, HealthStatus, SourceDefinition } from '../types.js'
import { easternToUtc, fmtClock12, fmtWeekdayMonthDay, hour24, isoZ, isRealDate, weekdayOf, ymd } from '../lib/eastern.js'
import { attrsOf, blocks, collapseWs, endsWithClose, hasUnknownEntity, innerText, rootName } from '../lib/xmlscan.js'

export const SOURCE_ID = 'senate.schedule'
export const SENATE_SCHEDULE_PARSER = 'senate_schedule@0.1.0'

/** 974 B, fixed width; announces pro forma convenes in recess too. sources[0].url is built from these constants, never
 * from `res.url` (Wayback fixtures carry a web.archive.org url: R-12). */
export const FLOOR_URL = 'https://www.senate.gov/legislative/schedule/floor_schedule.json'
export const HEARINGS_URL = 'https://www.senate.gov/general/committee_schedules/hearings.xml'

const ENDPOINT_FLOOR = 'floor'
const ENDPOINT_HEARINGS = 'hearings'
const LICENSE = 'us-gov-public-domain'
const AFFILIATION = 'official-nonpartisan' as const

const TITLE_MAX = 1000 // event.schema.json title.maxLength
const OFFICIAL_MAX = 4000 // event.schema.json official_text.maxLength

function health(endpoint: string, status: HealthStatus, detail: string, items_seen: number): HealthSignal {
  return { source_id: SOURCE_ID, endpoint, status, detail, items_seen }
}
const fail = (endpoint: string, status: HealthStatus, detail: string, items_seen = 0): AdapterOutput =>
  ({ events: [], health: health(endpoint, status, detail, items_seen) })

const pad2 = (n: number) => String(n).padStart(2, '0')
/** MMDDYY, the date part of every senate.gov ISVP stream filename (stv100526 = 2026-10-05). */
const mmddyy = (y: number, mo: number, d: number) => `${pad2(mo)}${pad2(d)}${pad2(y % 100)}`

/**
 * The common prelude (DESIGN §3.0): 304 -> not_modified; non-200 -> error; content-type checked per endpoint before
 * any parsing. The 200 HTML `U.S. Senate: 404 Error Page` (floor_schedule_NEGATIVE_not_found.html, text/html) and the
 * Akamai "Access Denied" page served with 200 must drift here, before JSON.parse / the XML scan. An absent
 * content-type is let through to the structure checks (they refuse an HTML body on their own).
 */
function prelude(endpoint: string, res: FetchedResponse, want: 'json' | 'xml'): AdapterOutput | null {
  if (res.status === 304) return fail(endpoint, 'not_modified', 'HTTP 304: nothing changed since the last poll')
  if (res.status !== 200) return fail(endpoint, 'error', `HTTP ${res.status}`)
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('html')) return fail(endpoint, 'drift', `an HTML page (${ct}) instead of ${want === 'json' ? 'JSON' : 'XML'}`)
  if (ct !== '' && !ct.includes(want)) return fail(endpoint, 'drift', `unexpected content-type "${ct}"`)
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// floor: floor_schedule.json
// ---------------------------------------------------------------------------------------------------------------------

const CONVENE_FIELDS = ['conveneYear', 'conveneMonth', 'conveneDay', 'conveneHour', 'conveneMinutes'] as const
/** Every key of the one floorProceedings entry, identical in all recorded copies (2026-10-02, 09-30, 02-04; scout). */
const FLOOR_ENTRY_KEYS: readonly string[] = [
  'coveneOffsetMinutes', ...CONVENE_FIELDS, 'convenedSessionLink', 'convenedSessionDescription', 'convenedSessionStream',
  'outSessionLink', 'outSessionDescription', 'outSessionImage', 'lastUpdated',
]
// lastUpdated always carries the literal offset -05:00, even in summer (2026-10-02 and 2026-09-30 copies) and winter
// (2026-02-04 copy): read as written, it is a correct instant all year, so it is parsed WITH its own offset (§1.3).
const LAST_UPDATED = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)([+-])(\d\d):(\d\d)$/

/** "2026-10-01T09:34-05:00" -> "2026-10-01T14:34:00Z"; null when malformed or out of range (no Date roll-over). */
export function parseOffsetMinuteTime(s: string): string | null {
  const m = LAST_UPDATED.exec(s)
  if (!m) return null
  const [y, mo, d, h, mi, oh, om] = [m[1], m[2], m[3], m[4], m[5], m[7], m[8]].map(Number) as number[]
  if (!isRealDate(y!, mo!, d!) || h! > 23 || mi! > 59 || oh! > 14 || om! > 59) return null
  const offsetMin = (m[6] === '-' ? -1 : 1) * (oh! * 60 + om!)
  return isoZ(Date.UTC(y!, mo! - 1, d!, h!, mi!) - offsetMin * 60_000)
}

/** One `floorProceedings` entry -> the scheduled-convene event, or a drift reason. */
function floorEvent(p: Record<string, unknown>, res: FetchedResponse): CedEvent | string {
  const raw: Record<string, string> = {}
  for (const f of CONVENE_FIELDS) {
    const v = p[f]
    if (typeof v !== 'string' || !/^\d+$/.test(v)) return `${f} is ${JSON.stringify(v)}, not an all-digit string`
    raw[f] = v
  }
  if (!/^\d{4}$/.test(raw.conveneYear!)) return `conveneYear "${raw.conveneYear}" is not a 4-digit year`
  for (const f of CONVENE_FIELDS.slice(1)) if (!/^\d{1,2}$/.test(raw[f]!)) return `${f} "${raw[f]}" is not 1-2 digits`
  const [y, mo, d, h, mi] = CONVENE_FIELDS.map((f) => Number(raw[f])) as [number, number, number, number, number]
  if (!isRealDate(y, mo, d)) return `the convene date ${raw.conveneYear}-${raw.conveneMonth}-${raw.conveneDay} is not a real date`
  if (h > 23 || mi > 59) return `the convene time ${raw.conveneHour}:${raw.conveneMinutes} is out of range`
  const date = ymd(y, mo, d)

  // The stream link names the convene day (4 of 4 recorded copies, scout); another day means the fields disagree.
  const streamFile = `stv${mmddyy(y, mo, d)}`
  const stream = `https://www.senate.gov/isvp/stv.html?type=live&comm=stv&filename=${streamFile}`
  if (p.convenedSessionStream !== stream) {
    return `convenedSessionStream ${JSON.stringify(p.convenedSessionStream)} is not the stream for ${date} (${streamFile})`
  }
  const lu = p.lastUpdated
  const published = typeof lu === 'string' ? parseOffsetMinuteTime(lu) : null
  if (published === null) return `lastUpdated ${JSON.stringify(lu)} is not YYYY-MM-DDTHH:MM±HH:MM`
  // The entry's keys are a closed set (review 483d7ab F6): an unseen key could be a cancellation marker
  // ("conveneStatus": "CANCELLED"), and publishing the convene as scheduled beside it would be wrong.
  for (const k of Object.keys(p)) if (!FLOOR_ENTRY_KEYS.includes(k)) return `floorProceedings[0] has a key we never recorded: ${k}`
  for (const k of FLOOR_ENTRY_KEYS) if (!Object.hasOwn(p, k)) return `floorProceedings[0] lacks the recorded key ${k}`

  // Naive Eastern wall time (R-13): nonexistent = drift; ambiguous (the fall-back hour) = null + time_note.
  const et = easternToUtc(y, mo, d, h, mi)
  if (!et.ok && et.reason !== 'ambiguous') return `the convene time ${date} ${pad2(h)}:${pad2(mi)} Eastern is ${et.reason}`
  const scheduledFor = et.ok ? et.utc : null

  const objectKey = `floor_day:senate:${date}`
  const result: Record<string, unknown> = { convene_date: date, stream_filename: streamFile }
  if (!et.ok) result.time_note = `${pad2(h)}:${pad2(mi)} Eastern on ${date} falls in the repeated fall-back hour; the file does not say which`
  return finalizeEvent({
    dedup_key: `${objectKey}#scheduled_convene`,
    object_key: objectKey,
    event_type: 'floor.convened',
    status: 'scheduled',
    branch: 'legislative',
    body: 'senate',
    features: ['F7', 'F1'],
    // 11 of the next 12 convenes are pro forma (gallery calendar) and the file cannot tell: no "pro forma" word (§3.4).
    title: `The Senate is next due to meet on ${fmtWeekdayMonthDay(y, mo, d)}, at ${fmtClock12(h, mi)} Eastern`,
    // The file has no prose (R-7): the convene fields verbatim are the source's own words.
    official_text: CONVENE_FIELDS.map((f) => `${f} ${raw[f]}`).join(' '),
    importance: { tier: 'P3', reasons: ['floor_schedule'] },
    times: { occurred_at: null, scheduled_for: scheduledFor, source_published_at: published, first_seen_at: res.fetchedAt },
    media: [{ kind: 'video_live', url: stream, is_live: false, provider: 'senate.gov ISVP' }],
    result,
    sources: [{ source_id: SOURCE_ID, url: FLOOR_URL, retrieved_at: res.fetchedAt, license: LICENSE, affiliation: AFFILIATION }],
    revision: 1,
    provenance: { parser: SENATE_SCHEDULE_PARSER, confidence: 'high' },
  })
}

export function parseFloor(res: FetchedResponse): AdapterOutput {
  const ep = ENDPOINT_FLOOR
  const pre = prelude(ep, res, 'json')
  if (pre) return pre
  let doc: unknown
  try {
    doc = JSON.parse(res.body)
  } catch {
    return fail(ep, 'drift', 'the body is not JSON')
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return fail(ep, 'drift', 'the JSON root is not an object')
  const list = (doc as Record<string, unknown>).floorProceedings
  if (!Array.isArray(list)) return fail(ep, 'drift', 'no floorProceedings array')
  // Exactly one entry in every recorded copy (4 of 4); two would mean two candidate convenes and we cannot pick.
  if (list.length !== 1) return fail(ep, 'drift', `floorProceedings holds ${list.length} entries, not exactly 1`, list.length)
  const extra = Object.keys(doc as Record<string, unknown>).find((k) => k !== 'floorProceedings')
  if (extra !== undefined) return fail(ep, 'drift', `the JSON root has a key we never recorded: ${extra}`, 1)
  const p = list[0]
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return fail(ep, 'drift', 'floorProceedings[0] is not an object', 1)
  const ev = floorEvent(p as Record<string, unknown>, res)
  if (typeof ev === 'string') return fail(ep, 'drift', ev, 1)
  const r = ev.result as { convene_date: string; time_note?: string }
  const when = ev.times.scheduled_for ?? 'time ambiguous'
  return { events: [ev], health: health(ep, 'ok', `next convene ${r.convene_date} (${when})`, 1) }
}

// ---------------------------------------------------------------------------------------------------------------------
// hearings: hearings.xml
// ---------------------------------------------------------------------------------------------------------------------

const ROOT = 'css_meetings_scheduled'
const PLACEHOLDER_MATTER = 'No committee hearings scheduled'
// Every child element seen in a <meeting> across the four recorded copies (44 real rows + 3 placeholders). Anything
// else could be a postponement or cancellation marker we have never seen (none was recorded, §1.2): publishing such a
// row as "scheduled" would be wrong, so an unknown child element is drift.
const MEETING_CHILDREN = new Set([
  'identifier', 'last_update', 'last_update_iso_8601', 'cmte_code', 'committee', 'sub_cmte', 'type', 'date',
  'date_iso_8601', 'day_of_week', 'time', 'time_iso_8601', 'room', 'video_url', 'senate_cable_channel', 'Documents',
  'matter',
])

type MeetingKind = { event_type: 'hearing.scheduled' | 'markup.scheduled'; phrase: string }
// The closed type table (R-8): any other type drifts the whole payload, since a renamed type could silently change the
// event type. Compared case-insensitively after whitespace collapse (principle 2).
const MEETING_TYPES: Record<string, MeetingKind> = {
  'open hearing': { event_type: 'hearing.scheduled', phrase: 'an open hearing' },
  'closed hearing': { event_type: 'hearing.scheduled', phrase: 'a closed hearing' },
  'open business meeting': { event_type: 'markup.scheduled', phrase: 'a business meeting' },
}

const IDENTIFIER = /^\d{6}$/
const CMTE_CODE = /^[A-Z]{4}\d{2}$/
const DATE_ISO = /^(\d{4})-(\d\d)-(\d\d)$/
const TIME_ISO = /^(\d\d):(\d\d):(\d\d)$/
// `last_update` is Eastern wall clock (09-08-2026 01:12:21 PM). last_update_iso_8601 is ignored: it is malformed
// (`2026-09-08T13:12:21.000000Z-04:00`, a Z and an offset at once; §1.3).
const LAST_UPDATE = /^(\d\d)-(\d\d)-(\d{4}) (\d\d):(\d\d):(\d\d) ([AP]M)$/
// The printed copies of the meeting time: `<date>15-SEP-2026 09:00 AM</date>`, `<time>09:00 AM</time>` (43 of 43).
const PRINTED_DATE = /^(\d\d)-([A-Z]{3})-(\d{4}) (\d\d:\d\d) ([AP]M)$/
const PRINTED_TIME = /^(\d\d):(\d\d) ([AP]M)$/
const MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
// A committee stream link we publish (T7): the ISVP player with a lower-case committee slug and a filename ending in the
// meeting's MMDDYY. `comm=xxxx` is the site's placeholder (07-30 copy, id 338700).
const VIDEO = /^https:\/\/www\.senate\.gov\/isvp\/\?comm=([a-z]+)&filename=[a-z]+(\d{6})$/

/** A meeting's child elements, name -> the inner markup of each occurrence ('' when self-closing). */
type Children = Map<string, string[]>
// One forward pass over a <meeting> (a meeting's children never nest an element of their own name; <Documents> holds
// only self-closing <AssociatedDocument/> tags). Cheaper than one scan per field: 1 pass instead of ~30 per meeting.
const CHILD = /<([A-Za-z_][\w.:-]*)(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/\1\s*>)/g

/** The children of one meeting; a string = drift reason (text, a comment or an unclosed element between children, an
 * attribute on a child, or markup inside a text child). No recorded child carries an attribute, and only <Documents>
 * holds elements (its <AssociatedDocument/> tags, checked in relatedOf): a status carried as an attribute
 * (`<type status="Postponed">`) or a nested element would otherwise be ignored (review 483d7ab F6). */
function childrenOf(inner: string): Children | string {
  const out: Children = new Map()
  let last = 0
  for (const m of inner.matchAll(CHILD)) {
    if (inner.slice(last, m.index).trim() !== '') return `unexpected content "${collapseWs(inner.slice(last, m.index)).slice(0, 60)}"`
    const name = m[1]!
    const attrs = (m[2] ?? '').trim()
    if (attrs !== '') return `<${name}> carries attributes (${attrs.slice(0, 60)}), never recorded`
    const text = m[3] ?? ''
    if (name !== 'Documents' && text.includes('<')) return `markup inside <${name}> ("${collapseWs(text).slice(0, 60)}"), never recorded`
    const list = out.get(name)
    if (list) list.push(text)
    else out.set(name, [text])
    last = m.index + m[0].length
  }
  if (inner.slice(last).trim() !== '') return `unexpected content "${collapseWs(inner.slice(last)).slice(0, 60)}"`
  return out
}

/** Text of a child element: null when absent, '' when empty or self-closing. */
function child(c: Children, tag: string): string | null {
  const v = c.get(tag)
  return v === undefined ? null : innerText(v[0]!)
}

/** NBSP and every whitespace run -> one space, trimmed (`collapseWs`; JS `\s` includes U+00A0). */
const clean = (s: string | null): string => collapseWs(s ?? '')

/** "Senate Judiciary Committee set", "A Senate Judiciary subcommittee (SSJU22) set", "The Commission on … set". */
function whoSet(committee: string, cmteCode: string): string {
  // Joint bodies (cmte_code J…, e.g. JCSE00 "Commission on Security and Cooperation in Europe") are not Senate
  // committees: they are named on their own (§3.4 names JCSE00; the rule covers any J code).
  if (cmteCode.startsWith('J')) return `${/^the /i.test(committee) ? '' : 'The '}${committee} set`
  // A name that already says Committee/Commission (e.g. a "Select Committee on Ethics") does not get another one.
  const named = /\b(committee|commission)\b/i.test(committee) ? committee : `${committee} Committee`
  if (!cmteCode.endsWith('00')) return `A Senate ${committee} subcommittee (${cmteCode}) set`
  return `Senate ${named} set`
}

type RelatedKey = { rel: string; key: string }

/** A meeting's <Documents> -> related `about` keys (SN/HR/PN, §1.4); an unknown prefix only loses its key (counted).
 * <Documents/> or no <Documents> = no related keys. */
function relatedOf(c: Children, at: string): { related: RelatedKey[]; unknownPrefixes: string[] } | string {
  const related: RelatedKey[] = []
  const unknownPrefixes: string[] = []
  const inner = c.get('Documents')?.[0]
  if (inner === undefined) return { related, unknownPrefixes }
  const docs = blocks(inner, 'AssociatedDocument')
  if (!docs.ok) return `${at}: ${docs.detail}`
  let rest = inner
  for (const b of docs.blocks) rest = rest.replace(b.raw, '')
  if (rest.trim() !== '') return `${at}: <Documents> holds something other than <AssociatedDocument> elements`
  const seen = new Set<string>()
  for (const b of docs.blocks) {
    const a = attrsOf(b.openTag)
    if (a === null) return `${at}: a malformed <AssociatedDocument> tag`
    const congress = a.congress ?? ''
    const prefix = (a.document_prefix ?? '').trim()
    const num = (a.document_num ?? '').trim()
    if (!/^\d{2,3}$/.test(congress)) return `${at}: AssociatedDocument congress "${congress}" is not a Congress number`
    if (!/^[1-9]\d{0,5}$/.test(num)) return `${at}: AssociatedDocument document_num "${num}" is not a number`
    let key: string
    if (prefix === 'SN') key = `bill:${congress}:s:${num}`
    else if (prefix === 'HR') key = `bill:${congress}:hr:${num}`
    else if (prefix === 'PN') {
      // partition "0 " or absent = none; "03" -> -3 (LIS prints PN962-3: no leading zero, so the keys meet).
      const part = (a.partition ?? '').trim()
      if (part !== '' && !/^\d{1,3}$/.test(part)) return `${at}: PN partition "${a.partition}" is not a number`
      const pn = part === '' || Number(part) === 0 ? '' : `-${Number(part)}`
      key = `nomination:${congress}:PN${num}${pn}`
    } else {
      // Only the related link is lost (the floor href rule, §3.0): a resolution on a business-meeting agenda must not
      // take down the whole schedule. Reported in the health detail.
      unknownPrefixes.push(prefix === '' ? '(none)' : prefix)
      continue
    }
    if (!seen.has(key)) related.push({ rel: 'about', key })
    seen.add(key)
  }
  return { related, unknownPrefixes }
}

interface MeetingNotes { truncated: number; videoWithheld: number; unknownPrefixes: string[]; ambiguous: number }

/** One real <meeting> (it has an identifier) -> its event, or a drift reason. */
function meetingEvent(c: Children, at: string, res: FetchedResponse, notes: MeetingNotes): CedEvent | string {
  const id = clean(child(c, 'identifier'))
  if (!IDENTIFIER.test(id)) return `${at}: identifier "${id}" is not 6 digits`
  at = `${at} (id ${id})`

  const cmteCode = clean(child(c, 'cmte_code'))
  if (!CMTE_CODE.test(cmteCode)) return `${at}: cmte_code "${cmteCode}" is not like SSJU00`
  const committee = clean(child(c, 'committee'))
  if (committee === '') return `${at}: no committee name`
  const subRaw = child(c, 'sub_cmte')
  const sub = subRaw === null ? null : clean(subRaw)
  const typeText = clean(child(c, 'type'))
  const kind = MEETING_TYPES[typeText.toLowerCase()]
  if (!kind) return `${at}: meeting type "${typeText}" is not one we know (Open Hearing, Closed Hearing, Open Business Meeting)`

  const dm = DATE_ISO.exec(clean(child(c, 'date_iso_8601')))
  const tm = TIME_ISO.exec(clean(child(c, 'time_iso_8601')))
  if (!dm || !tm) return `${at}: date_iso_8601/time_iso_8601 is not YYYY-MM-DD / HH:MM:SS`
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  const [h, mi, s] = [Number(tm[1]), Number(tm[2]), Number(tm[3])]
  if (!isRealDate(y, mo, d)) return `${at}: ${dm[0]} is not a real date`
  const date = ymd(y, mo, d)
  const et = easternToUtc(y, mo, d, h, mi, s)
  if (!et.ok && et.reason !== 'ambiguous') return `${at}: meeting time ${date} ${tm[0]} Eastern is ${et.reason}`
  // The file prints the same moment three more times; all 43 recorded meetings agree (review 483d7ab F7, time F5). A
  // disagreement means one of them is wrong and we cannot tell which: drift, never a title at the wrong hour.
  const printedTime = clean(child(c, 'time'))
  const pt = PRINTED_TIME.exec(printedTime)
  const pth = pt ? hour24(Number(pt[1]), pt[3] === 'PM') : null
  if (!pt || pth === null) return `${at}: <time> "${printedTime}" is not "hh:mm AM|PM"`
  if (pth !== h || Number(pt[2]) !== mi || s !== 0) return `${at}: time_iso_8601 ${tm[0]} disagrees with <time> "${printedTime}"`
  const printedDate = clean(child(c, 'date'))
  const pd = PRINTED_DATE.exec(printedDate)
  if (!pd || Number(pd[1]) !== d || MON3.indexOf(pd[2]!) + 1 !== mo || Number(pd[3]) !== y || `${pd[4]} ${pd[5]}` !== printedTime) {
    return `${at}: date_iso_8601 ${date} ${tm[0]!.slice(0, 5)} disagrees with <date> "${printedDate}"`
  }
  const dow = clean(child(c, 'day_of_week'))
  if (dow !== weekdayOf(y, mo, d)) return `${at}: <day_of_week> "${dow}" is not the weekday of ${date} (${weekdayOf(y, mo, d)})`

  const lum = LAST_UPDATE.exec(clean(child(c, 'last_update')))
  if (!lum) return `${at}: last_update is not MM-DD-YYYY hh:mm:ss AM`
  const luH12 = Number(lum[4])
  if (luH12 < 1 || luH12 > 12) return `${at}: last_update hour ${lum[4]} is not 1-12`
  const lu = easternToUtc(Number(lum[3]), Number(lum[1]), Number(lum[2]), (luH12 % 12) + (lum[7] === 'PM' ? 12 : 0), Number(lum[5]), Number(lum[6]))
  if (!lu.ok && lu.reason !== 'ambiguous') return `${at}: last_update is ${lu.reason}`

  // official_text = the matter, NBSP -> space, collapsed (§3.4). One 07-25 matter is 4,999 characters, longer than the
  // schema's 4,000: it is cut with an ellipsis and marked in result, never dropped (the rest of the row is exact).
  const matterRaw = child(c, 'matter')
  let official = clean(matterRaw)
  if (official === '') return `${at}: no matter text`
  if (hasUnknownEntity(official) || hasUnknownEntity(committee)) return `${at}: an entity we do not decode`
  const fullLength = official.length
  if (official.length > OFFICIAL_MAX) {
    official = `${official.slice(0, OFFICIAL_MAX - 1)}…`
    notes.truncated++
  }

  // Video: only a well-formed ISVP link whose filename date is the meeting date (T7: 338684 help072926 and 338688
  // foreign073036 for 2026-07-30 meetings), never the comm=xxxx placeholder; otherwise no media, the event stays.
  const video = clean(child(c, 'video_url'))
  const vm = VIDEO.exec(video)
  const media: CedEvent['media'] = vm && vm[1] !== 'xxxx' && vm[2] === mmddyy(y, mo, d)
    ? [{ kind: 'video_live', url: video, is_live: false, provider: 'senate.gov ISVP' }]
    : []
  if (video !== '' && media.length === 0) notes.videoWithheld++

  const rel = relatedOf(c, at)
  if (typeof rel === 'string') return rel
  notes.unknownPrefixes.push(...rel.unknownPrefixes)

  const room = clean(child(c, 'room'))
  const cable = clean(child(c, 'senate_cable_channel'))
  // Every text we publish, not only matter and committee (review 483d7ab F11: `SH&nbsp;216` reached result.room).
  if ([room, cable, sub ?? '', typeText].some(hasUnknownEntity)) return `${at}: an entity we do not decode`
  const result: Record<string, unknown> = {
    cmte_code: cmteCode,
    meeting_type: typeText,
    room: room === '' ? null : room,
    date,
    cable_channel: cable === '' ? null : cable,
  }
  if (sub !== null && sub !== '') result.subcommittee = sub
  if (fullLength > OFFICIAL_MAX) result.matter_truncated_from = fullLength
  const notesText: string[] = []
  if (!et.ok) notesText.push(`${tm[0]} Eastern on ${date} falls in the repeated fall-back hour; the file does not say which`)
  if (!lu.ok) notesText.push('last_update falls in the repeated fall-back hour')
  if (notesText.length > 0) {
    result.time_note = notesText.join('; ')
    notes.ambiguous++
  }

  const objectKey = `hearing:senate:${id}`
  const title = `${whoSet(committee, cmteCode)} ${kind.phrase} for ${fmtWeekdayMonthDay(y, mo, d)}, at ${fmtClock12(h, mi)} Eastern`
  return finalizeEvent({
    // One suffix for hearings and business meetings, so a type change is a revision (§1.4).
    dedup_key: `${objectKey}#scheduled`,
    object_key: objectKey,
    event_type: kind.event_type,
    status: 'scheduled',
    branch: 'legislative',
    body: 'senate',
    features: ['F7'],
    title: title.length <= TITLE_MAX ? title : `${title.slice(0, TITLE_MAX - 1)}…`,
    official_text: official,
    importance: { tier: 'P3', reasons: ['committee_meeting'] },
    times: { occurred_at: null, scheduled_for: et.ok ? et.utc : null, source_published_at: lu.ok ? lu.utc : null, first_seen_at: res.fetchedAt },
    actors: [{ role: 'committee', id: `committee:${cmteCode}`, name: committee }],
    ...(rel.related.length > 0 ? { related: rel.related } : {}),
    ...(media.length > 0 ? { media } : {}),
    result,
    sources: [{ source_id: SOURCE_ID, url: HEARINGS_URL, retrieved_at: res.fetchedAt, license: LICENSE, affiliation: AFFILIATION }],
    revision: 1,
    provenance: { parser: SENATE_SCHEDULE_PARSER, confidence: 'high' },
  })
}

export function parseHearings(res: FetchedResponse): AdapterOutput {
  const ep = ENDPOINT_HEARINGS
  const pre = prelude(ep, res, 'xml')
  if (pre) return pre
  const body = res.body
  const root = rootName(body)
  if (root !== ROOT) return fail(ep, 'drift', `root element is ${root === null ? 'missing' : `<${root}>`}, not <${ROOT}>`)
  if (!endsWithClose(body, [`</${ROOT}>`])) return fail(ep, 'drift', `truncated: the body does not end with </${ROOT}>`)
  const rootBlock = blocks(body, ROOT, 1)
  if (!rootBlock.ok || rootBlock.blocks.length !== 1) return fail(ep, 'drift', rootBlock.ok ? `no <${ROOT}> element` : rootBlock.detail)
  const rootInner = rootBlock.blocks[0]!.inner
  const scan = blocks(rootInner, 'meeting')
  if (!scan.ok) return fail(ep, 'drift', scan.detail)
  const seen = scan.blocks.length
  let between = rootInner
  for (const b of scan.blocks) between = between.replace(b.raw, '')
  if (between.trim() !== '') return fail(ep, 'drift', `<${ROOT}> holds something other than <meeting> elements`, seen)
  // Every recorded copy lists at least the placeholder; a list with no <meeting> at all looks exactly like a renamed
  // element, so it is drift, never "quiet" (CLAUDE.md directive 5).
  if (seen === 0) return fail(ep, 'drift', 'no <meeting> elements (an empty schedule still lists the placeholder)')

  const events: CedEvent[] = []
  const ids = new Set<string>()
  const notes: MeetingNotes = { truncated: 0, videoWithheld: 0, unknownPrefixes: [], ambiguous: 0 }
  let placeholders = 0
  for (const [n, b] of scan.blocks.entries()) {
    const at = `meeting ${n + 1}`
    // Every recorded <meeting> opens bare: `<meeting status="Cancelled">` must not publish as scheduled (review 483d7ab F6).
    if (b.openTag !== '<meeting>') return fail(ep, 'drift', `${at}: the open tag is ${b.openTag.slice(0, 80)}, not <meeting>`, seen)
    const c = childrenOf(b.inner)
    if (typeof c === 'string') return fail(ep, 'drift', `${at}: ${c}`, seen)
    const unknown = [...c.keys()].filter((x) => !MEETING_CHILDREN.has(x))
    if (unknown.length > 0) return fail(ep, 'drift', `${at}: element(s) we have not seen: ${unknown.map((x) => `<${x}>`).join(', ')}`, seen)
    // Each child appears at most once: a repeat is ambiguous.
    for (const [tag, list] of c) if (list.length > 1) return fail(ep, 'drift', `${at}: <${tag}> appears more than once`, seen)

    if (c.get('identifier') === undefined) {
      // The placeholder row (2026-10-02 hearings.xml; also at the top of the 09-14 and 07-25 copies). Any other row
      // without an identifier is something we have not seen.
      const matter = clean(child(c, 'matter'))
      if (matter !== PLACEHOLDER_MATTER) return fail(ep, 'drift', `${at}: a row with no identifier and matter "${matter.slice(0, 80)}"`, seen)
      placeholders++
      continue
    }
    const ev = meetingEvent(c, at, res, notes)
    if (typeof ev === 'string') return fail(ep, 'drift', ev, seen)
    if (ids.has(ev.object_key)) return fail(ep, 'drift', `${at}: duplicate identifier ${ev.object_key.slice('hearing:senate:'.length)} in one payload`, seen)
    ids.add(ev.object_key)
    events.push(ev)
  }

  if (events.length === 0) return { events, health: health(ep, 'empty', 'no committee meetings scheduled (the placeholder row only)', seen) }
  const extra: string[] = []
  if (placeholders > 0) extra.push(`${placeholders} placeholder skipped`)
  if (notes.videoWithheld > 0) extra.push(`${notes.videoWithheld} stream link(s) withheld (placeholder or another day's date)`)
  if (notes.truncated > 0) extra.push(`${notes.truncated} matter text(s) cut to ${OFFICIAL_MAX} characters`)
  if (notes.ambiguous > 0) extra.push(`${notes.ambiguous} with an ambiguous fall-back time`)
  if (notes.unknownPrefixes.length > 0) extra.push(`document prefix(es) with no key: ${[...new Set(notes.unknownPrefixes)].join(', ')}`)
  return { events, health: health(ep, 'ok', `${events.length} meetings${extra.length > 0 ? `; ${extra.join('; ')}` : ''}`, seen) }
}

/** The SourceDefinition's parse: route by endpoint id. */
export function parseSenateSchedule(endpointId: string, res: FetchedResponse): AdapterOutput {
  if (endpointId === ENDPOINT_FLOOR) return parseFloor(res)
  if (endpointId === ENDPOINT_HEARINGS) return parseHearings(res)
  return fail(endpointId, 'error', `unknown endpoint "${endpointId}"`)
}

export const senateSchedule: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'Senate floor and committee schedule (senate.gov)',
  affiliation: AFFILIATION,
  license: LICENSE,
  features: ['F7', 'F1'],
  endpoints: [
    // Both answer If-Modified-Since with 304 (scout measured).
    { id: ENDPOINT_FLOOR, url: FLOOR_URL, validator: 'if-modified-since', cadence: { business_s: 300, off_s: 900 } },
    { id: ENDPOINT_HEARINGS, url: HEARINGS_URL, validator: 'if-modified-since', cadence: { business_s: 900, off_s: 3600 } },
  ],
  cadence: { business_s: 300, off_s: 900 },
  // One number per source; D-049 makes the hearings endpoint's own threshold max(600, 2 x 900) = 1800 s (critique C9).
  freshness_slo_s: 600,
  rate_budget_per_h: 20,
  calendar: { chamber: 'senate', recess_s: 900 },
  parse: parseSenateSchedule,
}

// senate.pressgallery — the Senate Daily Press Gallery's floor log (dailypress.senate.gov WordPress REST): one event per
// timed log entry, typed by our reading of staff prose (confidence `inferred`). Design: scratch/phase2/DESIGN.md §3.5,
// keys §1.4, times §1.3, tiers §1.5; decision row R-9. Scope v1: the Daily gallery only (the Periodical gallery prints
// no clock times on result lines and is often back-filled; deferred, R-9).
// FIXTURE-ONLY (D-058): exported through `@ced/adapters/fixture-only`, never in SOURCES.
//
// The endpoint lists the 3 newest posts. Each post is one Senate day: its title names the day ("Wednesday, September
// 30, 2026") and its HTML holds the floor log newest-first ("9:29 p.m. The Senate began voting on …"), followed (after
// a `*****` separator, or without one) by the next day's schedule ("The Senate will convene at …"). The adapter is
// stateless and idempotent: every poll re-emits every entry of the 3 posts under keys derived only from the post id, the
// session day and the entry's printed clock (k counted from the BOTTOM, so an entry added on top never renumbers the
// older ones), and the Hub's dedupe turns an unchanged replay into zero new events.
//
// Fail closed on structure (DESIGN §0.2): a body that is not a JSON array, an empty array, a post missing a required
// field or with a changed shape, a duplicate post id, or HTML outside the recorded vocabulary (<p>, <ol>/<ul> of <li>,
// inline markup) = health `drift`, zero events. Meaning is labelled, not refused: a post whose day cannot be resolved is
// HELD (zero events from it, named in the health detail; the payload is not drift); a post whose title is not a date is
// not a floor log (skipped with a note); an empty post (a scheduled stub) is skipped with a note.
//
// Never guess a time (§0.3, R-13): a clock without a.m./p.m., an out-of-order clock (a typo), an ambiguous or
// nonexistent Eastern wall time, or one later than our own fetch = occurred_at null + result.time_note.
// No counts are extracted (EVENT_MODEL merge rule: free-text sources never contribute counts); titles never quote the
// gallery and omit the clock (D-043); the gallery's own words are official_text.
import { finalizeEvent, type CedEvent, type FeatureId, type Tier } from '@ced/schema'
import type { AdapterOutput, FetchedResponse, HealthSignal, HealthStatus, SourceDefinition } from '../types.js'
import { MONTHS, easternDate, easternToUtc, hour24, isRealDate, weekdayOf, ymd } from '../lib/eastern.js'
import { collapseWs, decodeEntities } from '../lib/xmlscan.js'

export const SOURCE_ID = 'senate.pressgallery'
export const PRESS_GALLERY_PARSER = 'senate_pressgallery@0.1.0'
const ENDPOINT = 'daily_posts'
const LOG_NAME = 'Senate Daily Press Gallery log'

/** Always send `_fields` (unfiltered is ~243 KB for 10 posts). */
export const DAILY_POSTS_URL =
  'https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=3&_fields=id,date,date_gmt,modified,modified_gmt,slug,status,type,link,title,content,categories'

const OFFICIAL_MAX = 4000 // event.schema.json official_text.maxLength
const GALLERY_HOST = 'www.dailypress.senate.gov'
// WordPress REST `date_gmt` / `modified_gmt`: naive UTC with no zone suffix (every recorded post). A suffix appearing
// (`…Z`, `+00:00`) means the API's shape changed, and appending our own Z would then be wrong: drift (DESIGN §3.5 test).
const WP_GMT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/

// ---------------------------------------------------------------------------------------------------------------------
// HTML -> blocks (string scanning only; DESIGN §0.5)

export interface Block {
  tag: 'p' | 'li'
  /** Tags stripped, <br> -> space, entities decoded, whitespace collapsed. */
  text: string
}
export type BlocksResult = { ok: true; blocks: Block[] } | { ok: false; detail: string }

// Inline markup seen in the recorded posts (a, br, strong, em, u, sup) plus the other phrasing elements the WordPress
// paragraph editor writes. Anything else (a heading, table, figure, div, hr, nested list) is a structure we have not
// seen: drift, not a guess at what it means.
const INLINE = new Set(['a', 'br', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'span', 'mark', 's', 'del', 'ins', 'code', 'small', 'abbr'])
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
// HTML named entities WordPress may write in prose; decodeEntities (lib/xmlscan) handles the XML five and numeric ones.
const HTML_NAMED: Record<string, string> = {
  nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
}

/** Decode prose text: the HTML named entities above, then &amp; &lt; … &#N; &#xN; (lib/xmlscan). */
export function decodeProse(s: string): string {
  return decodeEntities(s.replace(/&(nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip);/g, (_, n: string) => HTML_NAMED[n] ?? _))
}

function blockText(inner: string): string {
  // Line breaks and nested list items separate words; inline tags vanish without a space ("<a>S.528 </a>&#8211;").
  return collapseWs(decodeProse(inner.replace(/<(?:br|\/?li|\/?ul|\/?ol)\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '')))
}

/**
 * Split `content.rendered` into its <p> and <li> blocks in document order. The top level may hold only <p> and <ol>/<ul>
 * (with only <li> children), separated by whitespace; a block may hold only inline markup, except that an <li> may hold
 * a nested <ul>/<ol> list (166969: "The following bills received their first reading:" over a one-item <ul>), which
 * stays part of that ONE block (its items' text joined), as the design's block numbering counts it. Anything else = not
 * ok.
 */
export function scanBlocks(html: string): BlocksResult {
  const src = html.replace(/<!--[\s\S]*?-->/g, '')
  const blocks: Block[] = []
  type Mode = 'top' | 'list' | 'block'
  let mode: Mode = 'top'
  let listTag = ''
  let blockTag: 'p' | 'li' = 'p'
  let blockStart = 0
  let last = 0
  // Inside an <li> block: the open nested lists and items ('ul' | 'ol' | 'li'), innermost last.
  const nested: string[] = []
  TAG.lastIndex = 0
  for (let m = TAG.exec(src); m !== null; m = TAG.exec(src)) {
    const closing = m[1] === '/'
    const name = (m[2] as string).toLowerCase()
    const between = src.slice(last, m.index)
    last = m.index + m[0].length
    const inNestedList = nested.length > 0 && nested[nested.length - 1] !== 'li'
    if ((mode !== 'block' || inNestedList) && between.trim() !== '') {
      return { ok: false, detail: `text outside a paragraph or list item ("${collapseWs(between).slice(0, 40)}")` }
    }
    if (mode === 'top') {
      if (!closing && name === 'p') { mode = 'block'; blockTag = 'p'; blockStart = last; continue }
      if (!closing && (name === 'ol' || name === 'ul')) { mode = 'list'; listTag = name; continue }
      return { ok: false, detail: `unexpected <${m[1]}${name}> at the top level of the post` }
    }
    if (mode === 'list') {
      if (!closing && name === 'li') { mode = 'block'; blockTag = 'li'; blockStart = last; continue }
      if (closing && name === listTag) { mode = 'top'; continue }
      return { ok: false, detail: `unexpected <${m[1]}${name}> inside <${listTag}>` }
    }
    // mode === 'block'
    if (blockTag === 'li' && (name === 'ul' || name === 'ol' || name === 'li')) {
      const top = nested[nested.length - 1]
      if (!closing && name !== 'li' && top !== 'ul' && top !== 'ol') { nested.push(name); continue } // a list in an item
      if (!closing && name === 'li' && (top === 'ul' || top === 'ol')) { nested.push('li'); continue } // an item in a list
      if (closing && name === top) { nested.pop(); continue }
      if (!(closing && name === 'li' && nested.length === 0)) {
        return { ok: false, detail: `unexpected <${m[1]}${name}> in a nested list` }
      }
    }
    if (closing && name === blockTag && nested.length === 0) {
      blocks.push({ tag: blockTag, text: blockText(src.slice(blockStart, m.index)) })
      mode = blockTag === 'li' ? 'list' : 'top'
      continue
    }
    if (INLINE.has(name)) continue
    return { ok: false, detail: `unexpected <${m[1]}${name}> inside <${blockTag}>` }
  }
  if (mode !== 'top') return { ok: false, detail: `unclosed <${mode === 'list' ? listTag : blockTag}>` }
  if (src.slice(last).trim() !== '') return { ok: false, detail: 'text after the last block' }
  return { ok: true, blocks }
}

// ---------------------------------------------------------------------------------------------------------------------
// Session day (DESIGN §3.5 "Session day")

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Anchored at the start of the title: a title that merely mentions a date ("…meeting postponed until Monday, November
// 15") is not a floor log. 162959's two-day title "Thursday, June 4/Friday June 5, 2026" reads as Thursday, June 4.
const TITLE_DATE = new RegExp(
  `^(?:(${WEEKDAY_NAMES.join('|')}),?\\s+)?(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, 'i')

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export type SessionDay = { kind: 'day'; date: string; how: string } | { kind: 'not_a_date' } | { kind: 'hold'; why: string }

/**
 * The Senate day a post logs. Title date if its weekday matches (or it prints none) and it lies within -14..+7 days of
 * the post's Eastern day; else the same with the post's year; else, when the title's weekday is the post's own weekday
 * and the title day is off by exactly one, the post's day (166515: "Thursday, September 16, 2026" posted Thursday the
 * 17th at 00:01; the 16th was a Wednesday); else hold.
 */
export function resolveSessionDay(title: string, postDay: string): SessionDay {
  const m = TITLE_DATE.exec(title.trim())
  if (!m) return { kind: 'not_a_date' }
  const weekday = m[1] ? cap(m[1]) : null
  const mo = MONTHS.findIndex((x) => x.toLowerCase() === (m[2] as string).toLowerCase()) + 1
  const d = Number(m[3])
  const postYear = Number(postDay.slice(0, 4))
  const years = m[4] ? [...new Set([Number(m[4]), postYear])] : [postYear]
  const postN = dayNumber(postDay)
  for (const [i, y] of years.entries()) {
    if (!isRealDate(y, mo, d)) continue
    if (weekday !== null && weekdayOf(y, mo, d) !== weekday) continue
    const diff = dayNumber(ymd(y, mo, d)) - postN
    if (diff < -14 || diff > 7) continue
    return { kind: 'day', date: ymd(y, mo, d), how: i === 0 ? (m[4] ? 'title' : "title with the post's year") : "title with the post's year (the printed year did not fit)" }
  }
  const [py, pm, pd] = postDay.split('-').map(Number) as [number, number, number]
  if (weekday !== null && weekday === weekdayOf(py, pm, pd)) {
    for (const y of years) {
      if (isRealDate(y, mo, d) && Math.abs(dayNumber(ymd(y, mo, d)) - postN) === 1) {
        return { kind: 'day', date: postDay, how: `the post's day (the title's weekday is the post's; its date is off by one)` }
      }
    }
  }
  return { kind: 'hold', why: `title "${title}" does not resolve to a day near the post's date ${postDay}` }
}

// ---------------------------------------------------------------------------------------------------------------------
// Entries (DESIGN §3.5 "Entries")

// A block starting with a clock and a.m./p.m. starts an entry; a range ("5:50 – 6:35 p.m.") uses its start.
const TIMED = /^(\d{1,2}):(\d{2})\s*(?:[-–]\s*(\d{1,2}):(\d{2})\s*)?([ap])\.m\./i
// A clock printed without a.m./p.m. (166593 "5:02 Senator Kelly spoke on AI.") is its OWN entry, occurred_at null.
const UNTIMED_CLOCK = /^(\d{1,2}):(\d{2})\s/
// Ends an entry's continuation and starts the schedule part (critique T9: 166969 has no separator before its schedule).
const SCHEDULE_START = /^(The Senate will|At \d|Following)/
// A part (between separators) that opens with this is the schedule part; its blocks never become entries in v1.
const SCHEDULE_PART = /^(The Senate will|At \d{1,2}:\d{2}|Following)/
// Separators: a block of only `*` (3+), or an em-dash rule. 162959's rule is 58 em dashes ending in one hyphen-minus
// ("——…——-"), so hyphens may ride along as long as there are 3+ em dashes. An em-dash rule inside the log is a day
// break, not a schedule boundary (162959: "The above happened on Friday, June 5th." then the rule); the midnight walk,
// not the rule, moves the day.
function isSeparator(text: string): boolean {
  if (/^\*{3,}$/.test(text)) return true
  return /^[—-]+$/.test(text) && (text.match(/—/g)?.length ?? 0) >= 3
}

export interface Entry {
  /** Index of the timed block among the post's blocks (0-based, document order). */
  block: number
  /** The timed block's full text (clock included). */
  text: string
  /** The text after the clock: the only text typing reads. */
  rest: string
  /** The clock as printed ("9:29 p.m.", "5:50 – 6:35 p.m.", "5:02"). */
  clock: string
  /** 24-hour start time, or null when the clock prints no a.m./p.m. or is not a real time. */
  h: number | null
  mi: number | null
  /** Time part of the key: "T21:29", or "U5:02" for a clock we cannot place on a 24-hour dial. */
  timePart: string
  /** Why h/mi are null. */
  clockNote?: string
  continuation: string[]
}

export type EntriesResult = { ok: true; entries: Entry[]; orphans: number } | { ok: false; why: string }

const pad2 = (n: number) => String(n).padStart(2, '0')

function readClock(text: string): Omit<Entry, 'block' | 'text' | 'continuation'> | null {
  const t = TIMED.exec(text)
  if (t) {
    const pm = (t[5] as string).toLowerCase() === 'p'
    const h1 = Number(t[1])
    const m1 = Number(t[2])
    let h = hour24(h1, pm)
    if (h !== null && t[3] !== undefined) {
      // A range takes the end's a.m./p.m. unless that would put the start after the end ("11:30 – 12:15 p.m.").
      const hEnd = hour24(Number(t[3]), pm)
      if (hEnd !== null && h * 60 + m1 > hEnd * 60 + Number(t[4])) h = hour24(h1, !pm)
    }
    const valid = h !== null && m1 <= 59
    const rest = text.slice(t[0].length).replace(/^[\s.,:;–—-]+/, '')
    return {
      rest, clock: t[0].trim(), h: valid ? h : null, mi: valid ? m1 : null,
      timePart: valid ? `T${pad2(h as number)}:${pad2(m1)}` : `U${h1}:${t[2]}`,
      ...(valid ? {} : { clockNote: 'not a valid clock time' }),
    }
  }
  const u = UNTIMED_CLOCK.exec(text)
  if (u) {
    return { rest: text.slice(u[0].length).replace(/^[\s.,:;–—-]+/, ''), clock: `${u[1]}:${u[2]}`, h: null, mi: null, timePart: `U${Number(u[1])}:${u[2]}`, clockNote: 'clock printed without a.m./p.m.' }
  }
  return null
}

/**
 * Cut a post's blocks into log entries (newest first, as printed). Untimed blocks after an entry are its continuation
 * until the next timed block, a separator or a schedule-start block. A part opening with schedule wording is the
 * schedule; a clock line inside a schedule part (or after a schedule start in the same part) makes the post ambiguous:
 * not ok (the caller holds the post).
 */
export function cutEntries(blocks: readonly Block[]): EntriesResult {
  const entries: Entry[] = []
  let orphans = 0
  const parts: Array<Array<{ b: Block; i: number }>> = [[]]
  blocks.forEach((b, i) => {
    if (isSeparator(b.text)) parts.push([])
    else (parts[parts.length - 1] as Array<{ b: Block; i: number }>).push({ b, i })
  })
  for (const part of parts) {
    const first = part.find((x) => x.b.text !== '')
    if (first === undefined) continue
    if (SCHEDULE_PART.test(first.b.text)) {
      const clocked = part.find((x) => readClock(x.b.text) !== null)
      if (clocked) return { ok: false, why: `block ${clocked.i} is a clock line inside the schedule part` }
      continue
    }
    let current: Entry | null = null
    let inSchedule = false
    for (const { b, i } of part) {
      if (b.text === '') continue
      const clock = readClock(b.text)
      if (clock !== null) {
        if (inSchedule) return { ok: false, why: `block ${i} is a clock line after the schedule began` }
        current = { block: i, text: b.text, continuation: [], ...clock }
        entries.push(current)
      } else if (SCHEDULE_START.test(b.text)) {
        inSchedule = true
        current = null
      } else if (current !== null) {
        current.continuation.push(b.text)
      } else if (!inSchedule) {
        orphans++
      }
    }
  }
  return { ok: true, entries, orphans }
}

// ---------------------------------------------------------------------------------------------------------------------
// Clock -> instant (DESIGN §3.5 "Clock -> instant")

export interface Placed { occurred_at: string | null; time_note?: string }

/**
 * Walk from the bottom (oldest) up: the day rolls forward when the clock drops by more than 6 h (midnight); a smaller
 * drop is an out-of-order typo (162959's "10:30 p.m." between 10:57 and 11:40) -> null. U-clocks are skipped by the
 * walk. Ambiguous / nonexistent wall times -> null; so is a time later than our own fetch.
 */
export function placeEntries(entries: readonly Entry[], sessionDay: string, fetchedAt: string): Placed[] {
  const out: Placed[] = new Array(entries.length)
  let prev: number | null = null
  let roll = 0
  const fetchedMs = Date.parse(fetchedAt)
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i] as Entry
    if (e.h === null || e.mi === null) {
      out[i] = { occurred_at: null, time_note: e.clockNote ?? 'not a valid clock time' }
      continue
    }
    const t = e.h * 60 + e.mi
    if (prev !== null && t < prev) {
      if (prev - t > 360) roll++
      else {
        out[i] = { occurred_at: null, time_note: 'clock out of order (earlier than the entry logged before it)' }
        continue
      }
    }
    prev = t
    const date = addDays(sessionDay, roll)
    const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
    const r = easternToUtc(y, mo, d, e.h, e.mi)
    if (!r.ok) {
      out[i] = { occurred_at: null, time_note: r.reason === 'ambiguous' ? 'ambiguous Eastern wall time (fall-back hour)' : r.reason === 'nonexistent' ? 'Eastern wall time does not exist (spring-forward gap)' : 'not a valid clock time' }
      continue
    }
    out[i] = Date.parse(r.utc) > fetchedMs ? { occurred_at: null, time_note: 'later than our own fetch' } : { occurred_at: r.utc }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Typing (DESIGN §3.5 "Typing"; critique T3): the timed block's text after the clock only, first match wins.

export interface Typing { event_type: string; tier: Tier; features: FeatureId[]; title: string; floorDay: boolean }

const T_PRO_FORMA = /^The Senate (convened|met|has convened)\b.*\bpro forma\b/i
const T_CONVENED = /^The Senate (has )?(convened|returned from (the )?recess|is (now )?in session)\b/i
const T_ADJOURNED = /^The Senate (has )?(adjourned|stands adjourned)\b/i
const T_RECESS = /^The Senate (has )?(recessed|stands in recess|is (now )?in recess)\b/i
const T_VOTE_OPENED = /^The Senate (began (voting|a (roll call )?vote)|is (now )?voting)\b/i
// Result lines. Two widenings over the design's pattern, each from a recorded line that is a result yet fell to rule 8:
// "By a vote 52-47, the motion to waive … was not agreed to" (162959 block 62: no "of") and "By voice vote, the Senate
// passed H.R.7250" (166464 block 11) / "By voice vote, the Senate adopted the Graham Substitute Amendment" (162959).
const T_RESULT = /^(By a (party[- ]line )?vote (of )?\d+-\d+|By voice vote\b|The Senate (confirmed|invoked|did not|passed|adopted|agreed|rejected)\b|The following .*\b(passed|adopted|agreed to|confirmed)\b)/i
const T_SPOKE = /\bspoke\b/i

const log = (what: string) => `${what} (${LOG_NAME})`

export function typeEntry(rest: string): Typing {
  if (T_PRO_FORMA.test(rest)) return { event_type: 'floor.pro_forma', tier: 'P4', features: ['F1'], title: log('Senate held a pro forma session'), floorDay: true }
  const c = T_CONVENED.exec(rest)
  if (c) {
    return /^returned/i.test(c[2] as string)
      ? { event_type: 'floor.convened', tier: 'P3', features: ['F1'], title: log('Senate returned from recess'), floorDay: true }
      : { event_type: 'floor.convened', tier: 'P2', features: ['F1'], title: log('Senate convened'), floorDay: true }
  }
  if (T_ADJOURNED.test(rest)) return { event_type: 'floor.adjourned', tier: 'P2', features: ['F1'], title: log('Senate adjourned'), floorDay: true }
  if (T_RECESS.test(rest)) return { event_type: 'floor.recess', tier: 'P3', features: ['F1'], title: log('Senate recessed'), floorDay: false }
  if (T_VOTE_OPENED.test(rest)) return { event_type: 'vote.opened', tier: 'P2', features: ['F1', 'F5'], title: log('A Senate roll call vote began'), floorDay: false }
  if (T_RESULT.test(rest)) return { event_type: 'floor.action', tier: 'P2', features: ['F1', 'F5'], title: 'Senate Daily Press Gallery logged a floor result', floorDay: false }
  if (T_SPOKE.test(rest)) return { event_type: 'floor.speaking', tier: 'P3', features: ['F1', 'F8'], title: 'Senate Daily Press Gallery logged floor speeches', floorDay: false }
  return { event_type: 'floor.action', tier: 'P3', features: ['F1'], title: 'Senate Daily Press Gallery logged floor activity', floorDay: false }
}

// ---------------------------------------------------------------------------------------------------------------------
// The parse

function health(status: HealthStatus, detail: string, items_seen: number): HealthSignal {
  return { source_id: SOURCE_ID, endpoint: ENDPOINT, status, detail, items_seen }
}
const fail = (status: HealthStatus, detail: string, items_seen = 0): AdapterOutput => ({ events: [], health: health(status, detail, items_seen) })

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
function rendered(v: unknown): string | null {
  return isObj(v) && typeof v.rendered === 'string' ? v.rendered : null
}

interface Post { id: number; dateGmt: string; link: string; title: string; content: string }

/** The required post fields (DESIGN §3.5 "Parsing"); a string says what is wrong. */
function readPost(p: unknown): Post | string {
  if (!isObj(p)) return 'not an object'
  if (typeof p.id !== 'number' || !Number.isSafeInteger(p.id) || p.id <= 0) return 'no integer id'
  const at = `post ${p.id}`
  if (typeof p.date_gmt !== 'string' || !WP_GMT.test(p.date_gmt)) return `${at}: date_gmt ${JSON.stringify(p.date_gmt)} is not the WordPress naive-UTC shape`
  if (typeof p.modified_gmt !== 'string' || !WP_GMT.test(p.modified_gmt)) return `${at}: modified_gmt ${JSON.stringify(p.modified_gmt)} is not the WordPress naive-UTC shape`
  if (p.status !== 'publish') return `${at}: status ${JSON.stringify(p.status)} is not "publish"`
  if (p.type !== 'post') return `${at}: type ${JSON.stringify(p.type)} is not "post"`
  if (typeof p.link !== 'string') return `${at}: no link`
  let url: URL
  try {
    url = new URL(p.link)
  } catch {
    return `${at}: link is not a URL`
  }
  if (url.protocol !== 'https:' || url.hostname !== GALLERY_HOST) return `${at}: link ${p.link} is not https on ${GALLERY_HOST}`
  const title = rendered(p.title)
  if (title === null) return `${at}: no title.rendered`
  const content = rendered(p.content)
  if (content === null) return `${at}: no content.rendered`
  if (isObj(p.content) && p.content.protected !== undefined && p.content.protected !== false) return `${at}: content is password-protected`
  return { id: p.id, dateGmt: p.date_gmt, link: url.href, title, content }
}

/**
 * Pure: one response in, events + one health signal out. Events are not schema-validated here (the Hub validates
 * everything it ingests, and every fixture's events are validated in the tests), but every field is built within the
 * schema's bounds (official_text cut at 4000).
 */
export function parseDailyPosts(endpointId: string, res: FetchedResponse): AdapterOutput {
  if (endpointId !== ENDPOINT) return fail('error', `unknown endpoint "${endpointId}"`)
  if (res.status === 304) return fail('not_modified', 'HTTP 304: nothing changed since the last poll')
  if (res.status !== 200) return fail('error', `HTTP ${res.status}`)
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('html')) return fail('drift', `an HTML page (${ct}) instead of the posts JSON`)
  if (ct !== '' && !ct.includes('json')) return fail('drift', `unexpected content-type "${ct}"`)
  let body: unknown
  try {
    body = JSON.parse(res.body)
  } catch {
    return fail('drift', 'the body is not JSON')
  }
  // A WordPress error object ({"code":…} or the _envelope form {"body":{"code":…},"status":404}) answered with 200.
  if (!Array.isArray(body)) {
    const code = isObj(body) ? (isObj(body.body) ? body.body.code : body.code) : undefined
    return fail('drift', `the body is a JSON ${body === null ? 'null' : typeof body}${typeof code === 'string' ? ` (WordPress error "${code}")` : ''}, not the posts array`)
  }
  // A 1,842-post site cannot list nothing on the newest-posts endpoint: a renamed field or a broken query looks the same.
  if (body.length === 0) return fail('drift', 'the newest-posts list is empty (the site always lists its newest posts)')
  const seen = body.length

  const posts: Post[] = []
  const ids = new Set<number>()
  for (const [n, raw] of body.entries()) {
    const p = readPost(raw)
    if (typeof p === 'string') return fail('drift', `item ${n + 1}: ${p}`, seen)
    if (ids.has(p.id)) return fail('drift', `duplicate post id ${p.id} in one payload`, seen)
    ids.add(p.id)
    posts.push(p)
  }

  const events: CedEvent[] = []
  const notes: string[] = []
  let logs = 0
  for (const post of posts) {
    const title = collapseWs(decodeProse(post.title))
    if (post.content.trim() === '') {
      notes.push(`post ${post.id} skipped: empty content (a scheduled stub)`)
      continue
    }
    const postDay = easternDate(`${post.dateGmt}Z`)
    if (postDay === null) return fail('drift', `post ${post.id}: date_gmt ${post.dateGmt} is not a real instant`, seen)
    const day = resolveSessionDay(title, postDay)
    if (day.kind === 'not_a_date') {
      notes.push(`post ${post.id} skipped: its title is not a date, so it is not a floor log`)
      continue
    }
    const scan = scanBlocks(post.content)
    if (!scan.ok) return fail('drift', `post ${post.id}: ${scan.detail}`, seen)
    if (day.kind === 'hold') {
      notes.push(`post ${post.id} held: ${day.why}`)
      continue
    }
    const cut = cutEntries(scan.blocks)
    if (!cut.ok) {
      notes.push(`post ${post.id} held: ${cut.why}`)
      continue
    }
    logs++
    if (cut.entries.length === 0) notes.push(`post ${post.id}: no timed entries`)
    if (day.how !== 'title') notes.push(`post ${post.id} day ${day.date} from ${day.how}`)
    const placed = placeEntries(cut.entries, day.date, res.fetchedAt)
    // k = 1-based index among entries with the same time part, counted from the BOTTOM (oldest) of the post.
    const ks = new Array<number>(cut.entries.length)
    const counts = new Map<string, number>()
    for (let i = cut.entries.length - 1; i >= 0; i--) {
      const tp = (cut.entries[i] as Entry).timePart
      const k = (counts.get(tp) ?? 0) + 1
      counts.set(tp, k)
      ks[i] = k
    }
    cut.entries.forEach((e, i) => {
      const typing = typeEntry(e.rest)
      const objectKey = `pg_entry:daily:${post.id}:${day.date}${e.timePart}:${ks[i]}`
      const full = [e.text, ...e.continuation].join(' ')
      const official = full.length <= OFFICIAL_MAX ? full : `${full.slice(0, OFFICIAL_MAX - 1)}…`
      const p = placed[i] as Placed
      events.push(finalizeEvent({
        dedup_key: `${objectKey}#logged`,
        object_key: objectKey,
        event_type: typing.event_type,
        status: 'ended',
        branch: 'legislative',
        body: 'senate',
        features: typing.features,
        title: typing.title,
        official_text: official,
        importance: { tier: typing.tier, reasons: ['press_gallery_log'] },
        times: { occurred_at: p.occurred_at, source_published_at: null, first_seen_at: res.fetchedAt },
        ...(typing.floorDay ? { related: [{ rel: 'about', key: `floor_day:senate:${day.date}` }] } : {}),
        result: { session_date: day.date, clock_text: e.clock, post_id: post.id, ...(p.time_note !== undefined ? { time_note: p.time_note } : {}) },
        sources: [{
          source_id: SOURCE_ID,
          url: post.link,
          retrieved_at: res.fetchedAt,
          license: 'us-gov-public-domain',
          affiliation: 'official-nonpartisan',
        }],
        revision: 1,
        provenance: { parser: PRESS_GALLERY_PARSER, confidence: 'inferred' },
      }))
    })
  }
  const detail = `${seen} posts, ${logs} floor logs, ${events.length} entries${notes.length > 0 ? `; ${notes.join('; ')}` : ''}`
  return { events, health: health('ok', detail, seen) }
}

export const senatePressgallery: SourceDefinition = {
  source_id: SOURCE_ID,
  name: LOG_NAME,
  affiliation: 'official-nonpartisan',
  license: 'us-gov-public-domain',
  features: ['F1', 'F5', 'F8'],
  // The REST API sends no ETag / Last-Modified and ignores If-Modified-Since (scout): body-hash.
  endpoints: [{ id: ENDPOINT, url: DAILY_POSTS_URL, validator: 'body-hash', cadence: { business_s: 60, off_s: 300 } }],
  cadence: { business_s: 60, off_s: 300 },
  freshness_slo_s: 120,
  rate_budget_per_h: 70,
  calendar: { chamber: 'senate', recess_s: 900 },
  parse: parseDailyPosts,
}

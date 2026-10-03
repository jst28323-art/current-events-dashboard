// Head-only RSS 2.0 reading, sized for the Workers Free CPU budget (docs/ARCHITECTURE.md "Constraints that shape the
// code": 10 ms per invocation). The whitehouse.gov feed is ~515 KB, almost all of it HTML inside each item's
// <description> and <content:encoded>. We never hand that to an XML parser: one forward scan finds each <item> and cuts
// those bulky elements out (jumping over CDATA sections with indexOf, so the HTML inside is never tokenized), then
// fast-xml-parser parses only the small item heads (title, link, guid, pubDate, categories). Pure: no I/O, no clock.
//
// Fail closed (.claude/skills/add-source/SKILL.md step 3): anything that is not a complete RSS 2.0 document in the
// recorded shape comes back as `not_rss` or `malformed`, and the caller publishes nothing from it.
import { XMLParser, XMLValidator } from 'fast-xml-parser'

/**
 * Elements whose bodies are dropped before parsing (the item's HTML). They are never XML-parsed; the scan hands each
 * one back as raw text (`skipped`), and wh.feeds reads only the opening of <description> by pattern match.
 */
export const BULKY_ITEM_ELEMENTS: readonly string[] = ['description', 'content:encoded']

export type RssScan =
  // items: each <item>…</item> with the bulky elements removed, in document order. skipped[n]: item n's removed
  // elements as raw markup (tags included), in order; slices of the body, so no copy is made.
  | { kind: 'ok'; items: string[]; skipped: string[][] }
  | { kind: 'not_rss'; detail: string } // e.g. an HTML page or another XML document answered with HTTP 200
  | { kind: 'malformed'; detail: string } // RSS, but truncated or structurally broken

const notRss = (detail: string): RssScan => ({ kind: 'not_rss', detail })
const malformed = (detail: string): RssScan => ({ kind: 'malformed', detail })

/** True when `<name` starts at i and the name ends there (so "<item" does not match "<items" or "<itemref"). */
function openTagAt(text: string, i: number, name: string): boolean {
  if (!text.startsWith(name, i + 1) || text.charCodeAt(i) !== 60 /* < */) return false
  const c = text[i + 1 + name.length]
  return c === '>' || c === '/' || c === ' ' || c === '\t' || c === '\n' || c === '\r'
}

/**
 * Index just past the element that opens at i (self-closing or not); -1 if it never closes. CDATA sections, comments
 * and processing instructions inside it are jumped over whole, as a conforming XML parser reads them (XML 1.0
 * §2.5-2.7): a "</description>" or "<![CDATA[" written inside a comment is not markup (review WH-2, 2026-10-02).
 */
function skipElement(text: string, i: number, name: string): number {
  const gt = text.indexOf('>', i)
  if (gt < 0) return -1
  if (text[gt - 1] === '/') return gt + 1
  const close = `</${name}>`
  let p = gt + 1
  for (;;) {
    const k = text.indexOf('<', p)
    if (k < 0) return -1
    if (text.startsWith('<![CDATA[', k)) {
      const j = text.indexOf(']]>', k + 9)
      if (j < 0) return -1
      p = j + 3
    } else if (text.startsWith('<!--', k)) {
      const j = text.indexOf('-->', k + 4)
      if (j < 0) return -1
      p = j + 3
    } else if (text.startsWith('<?', k)) {
      const j = text.indexOf('?>', k + 2)
      if (j < 0) return -1
      p = j + 2
    } else if (text.startsWith(close, k)) {
      return k + close.length
    } else {
      p = k + 1
    }
  }
}

/**
 * One forward pass over the document. Checks the envelope (an <rss> root holding a <channel>, every <item> closed, and
 * the document ending in </channel></rss>, so a truncated download is caught even when the cut falls between items),
 * and returns each item's XML minus `skip` elements.
 */
export function scanRssItems(body: string, skip: readonly string[] = BULKY_ITEM_ELEMENTS): RssScan {
  const text = body.charCodeAt(0) === 0xfeff ? body.slice(1) : body
  const lead = text.slice(0, 512).trimStart().toLowerCase()
  if (lead === '') return notRss('empty body')
  if (lead.startsWith('<!doctype html') || lead.startsWith('<html')) return notRss('an HTML page instead of RSS')

  const items: string[] = []
  const skipped: string[][] = []
  let cut: string[] = []
  let rssOpen = false
  let channelOpen = false
  let channelClosed = false
  let rssClosed = false
  let inItem = false
  let parts: string[] = []
  let segStart = 0
  let pos = 0
  for (;;) {
    const i = text.indexOf('<', pos)
    if (i < 0) break
    if (text.startsWith('<![CDATA[', i)) {
      const j = text.indexOf(']]>', i + 9)
      if (j < 0) return malformed('a CDATA section never closes (truncated download?)')
      pos = j + 3
      continue
    }
    if (text.startsWith('<!--', i)) {
      const j = text.indexOf('-->', i + 4)
      if (j < 0) return malformed('a comment never closes (truncated download?)')
      pos = j + 3
      continue
    }
    if (text.startsWith('<?', i)) {
      // The XML declaration, or any processing instruction: its content is not markup (review WH-2).
      const j = text.indexOf('?>', i + 2)
      if (j < 0) return malformed('a processing instruction never closes (truncated download?)')
      pos = j + 2
      continue
    }
    if (text.startsWith('<!', i)) {
      // DOCTYPE / ENTITY declarations: not in the recorded shape, and entity expansion is an attack surface.
      return /^<!doctype\s+html/i.test(text.slice(i, i + 20)) ? notRss('an HTML page instead of RSS') : notRss('a DOCTYPE or ENTITY declaration (not in the recorded RSS shape)')
    }
    if (!inItem) {
      if (openTagAt(text, i, 'rss')) {
        rssOpen = true
      } else if (openTagAt(text, i, 'channel')) {
        if (!rssOpen) return notRss('a <channel> outside an <rss> root')
        channelOpen = true
      } else if (openTagAt(text, i, 'item')) {
        if (!rssOpen || !channelOpen) return notRss('an <item> outside <rss><channel>')
        if (channelClosed) return malformed('an <item> after </channel>')
        const gt = text.indexOf('>', i)
        if (gt < 0) return malformed(`item ${items.length + 1} is cut off (truncated download?)`)
        if (text[gt - 1] === '/') {
          items.push('<item></item>') // an empty item: the caller rejects it for its missing guid/title/link
          skipped.push([])
          pos = gt + 1
          continue
        }
        inItem = true
        parts = ['<item>']
        cut = []
        segStart = gt + 1
        pos = gt + 1
        continue
      } else if (text.startsWith('</channel>', i)) {
        channelClosed = true
      } else if (text.startsWith('</rss>', i)) {
        if (!channelClosed) return malformed('</rss> before </channel>')
        rssClosed = true
      }
      pos = i + 1
      continue
    }
    // Inside an item.
    if (text.startsWith('</item>', i)) {
      parts.push(text.slice(segStart, i), '</item>')
      items.push(parts.join(''))
      skipped.push(cut)
      inItem = false
      pos = i + 7
      continue
    }
    if (openTagAt(text, i, 'item')) return malformed(`an <item> inside item ${items.length + 1}`)
    const name = skip.find((n) => openTagAt(text, i, n))
    if (name !== undefined) {
      parts.push(text.slice(segStart, i))
      const end = skipElement(text, i, name)
      if (end < 0) return malformed(`<${name}> in item ${items.length + 1} never closes (truncated download?)`)
      cut.push(text.slice(i, end))
      segStart = end
      pos = end
      continue
    }
    pos = i + 1
  }
  if (inItem) return malformed(`item ${items.length + 1} never closes (truncated download?)`)
  if (!rssOpen || !channelOpen) return notRss('no <rss><channel> envelope')
  if (!channelClosed || !rssClosed) return malformed('the document does not end with </channel></rss> (truncated download?)')
  return { kind: 'ok', items, skipped }
}

// trimValues false: with true, fast-xml-parser trims each text piece separately, so "A <![CDATA[b]]> c" became "Abc"
// (probe 2026-10-02, 5.11.2). We collapse XML whitespace ourselves instead. parseTagValue false: a title such as
// "2026" must stay a string. htmlEntities: WordPress writes curly quotes as &#8217;, and fast-xml-parser decodes
// numeric references only with htmlEntities on. Named HTML entities (&nbsp;) are not XML and never reach the parser:
// xmlTextProblem refuses them first. CDATA content is literal, never entity-decoded (XML semantics; probed).
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => name === 'item' || name === 'category',
})

export type RssItem = Record<string, unknown>

const XML_NAMED_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos'])
const REFERENCE = /&(?:#x([0-9A-Fa-f]+)|#([0-9]+)|([A-Za-z_:][\w.:-]*));/y
// XML 1.0 §2.2 Char: tab, LF, CR, U+0020-U+D7FF, U+E000-U+FFFD, U+10000-U+10FFFF. With the u flag, \p{Cs} matches only
// a lone surrogate (a well-formed pair is one code point).
const NOT_XML_CHAR = /[\0-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF\p{Cs}]/u
const isXmlChar = (cp: number): boolean =>
  cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff)

/**
 * What fast-xml-parser 5.11.2's validator lets through but XML forbids (review WH-7, probed 2026-10-02): an undefined
 * entity ("&bogus;" is kept as literal text, "&nbsp;" decoded), a reference to a character XML does not allow ("&#0;"
 * and "&#xD800;" are silently dropped, "&#x110000;" kept literally), a malformed reference ("&#x;"), and a raw control
 * character. Each would make official_text differ from what the source published, so each is drift. There is no DTD
 * (the scan refuses one), so only XML's five named entities exist; WordPress writes every other character as a
 * numeric reference (its feed filters run ent2ncr). Returns null when the text is clean. One forward pass: every
 * indexOf below only moves forward (an earlier version re-searched to the end after each CDATA section: +0.1-0.2 ms).
 */
export function xmlTextProblem(xml: string): string | null {
  const bad = NOT_XML_CHAR.exec(xml)
  if (bad) return `the character U+${(bad[0].codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0')}, which XML does not allow`
  let amp = xml.indexOf('&')
  let bang = xml.indexOf('<!') // the next CDATA section or comment
  let pi = xml.indexOf('<?') // the next processing instruction
  while (amp >= 0) {
    const literal = Math.min(bang < 0 ? Infinity : bang, pi < 0 ? Infinity : pi)
    if (literal < amp) {
      // Inside CDATA, a comment or a processing instruction, "&" is literal text: jump past the whole run.
      let close = literal // any other "<!" was refused by the scan; just step over it
      let len = 2
      if (literal === pi) {
        close = xml.indexOf('?>', literal + 2)
      } else if (xml.startsWith('<![CDATA[', literal)) {
        close = xml.indexOf(']]>', literal + 9)
        len = 3
      } else if (xml.startsWith('<!--', literal)) {
        close = xml.indexOf('-->', literal + 4)
        len = 3
      }
      if (close < 0) return 'a CDATA section, comment or processing instruction that never closes'
      const end = close + len
      if (bang >= 0 && bang < end) bang = xml.indexOf('<!', end)
      if (pi >= 0 && pi < end) pi = xml.indexOf('<?', end)
      if (amp < end) amp = xml.indexOf('&', end)
      continue
    }
    REFERENCE.lastIndex = amp
    const m = REFERENCE.exec(xml)
    if (!m) return `a malformed reference "${(xml.slice(amp, amp + 12).split(/[<\s]/)[0] as string)}"`
    if (m[3] !== undefined) {
      if (!XML_NAMED_ENTITIES.has(m[3])) return `"${m[0]}", which XML does not define (no DTD is allowed)`
    } else {
      const cp = m[1] !== undefined ? parseInt(m[1], 16) : parseInt(m[2] as string, 10)
      if (!isXmlChar(cp)) return `"${m[0]}", a reference to a character XML does not allow`
    }
    amp = xml.indexOf('&', amp + m[0].length)
  }
  return null
}

/**
 * Parses the item heads that scanRssItems() returned. Validates the slice first: the parser alone accepts an unclosed
 * tag, and the validator alone accepts undefined entities and illegal characters (xmlTextProblem).
 */
export function parseItemHeads(items: readonly string[]): { ok: true; items: RssItem[] } | { ok: false; detail: string } {
  if (items.length === 0) return { ok: true, items: [] }
  const slice = `<rss><channel>${items.join('')}</channel></rss>`
  const v = XMLValidator.validate(slice)
  if (v !== true) return { ok: false, detail: `item XML does not parse: ${v.err.msg}` }
  const problem = xmlTextProblem(slice)
  if (problem !== null) return { ok: false, detail: `item XML holds ${problem}` }
  const doc = parser.parse(slice) as { rss?: { channel?: { item?: unknown } } }
  const parsed = doc.rss?.channel?.item
  if (!Array.isArray(parsed) || parsed.length !== items.length) return { ok: false, detail: 'item count changed while parsing' }
  for (const it of parsed) if (typeof it !== 'object' || it === null) return { ok: false, detail: 'an item has no child elements' }
  return { ok: true, items: parsed as RssItem[] }
}

/** XML whitespace (not NBSP) collapsed to single spaces and trimmed: titles keep their exact words. */
export function collapseWs(s: string): string {
  return s.replace(/[ \t\r\n]+/g, ' ').trim()
}

export type Field = { ok: true; value: string | undefined } | { ok: false; detail: string }

/** The text of a child element that must appear at most once and hold only text. */
export function singleText(item: RssItem, tag: string): Field {
  const v = item[tag]
  if (v === undefined) return { ok: true, value: undefined }
  if (typeof v === 'string') return { ok: true, value: collapseWs(v) }
  if (Array.isArray(v)) return { ok: false, detail: `<${tag}> appears ${v.length} times` }
  return { ok: false, detail: `<${tag}> holds markup, not text` }
}

/** All <category> texts (repeatable). */
export function categoryTexts(item: RssItem): { ok: true; value: string[] } | { ok: false; detail: string } {
  const v = item.category
  if (v === undefined) return { ok: true, value: [] }
  if (!Array.isArray(v)) return { ok: false, detail: '<category> parsed as a non-list' }
  const out: string[] = []
  for (const c of v) {
    if (typeof c !== 'string') return { ok: false, detail: '<category> holds markup, not text' }
    const t = collapseWs(c)
    if (t !== '') out.push(t)
  }
  return { ok: true, value: out }
}

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const RFC822 = /^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat), )?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2})(?::(\d{2}))? ([+-]\d{4}|GMT|UTC|UT|Z)$/

/**
 * An RSS pubDate ("Thu, 01 Oct 2026 22:22:29 +0000") as a UTC instant "2026-10-01T22:22:29Z", or null when it is
 * missing or untrustworthy. Never guessed: named US zones (EST/EDT…) return null because feeds mislabel them
 * (docs/TRAPS.md "Time zones lie"); impossible dates (31 Sep) and a weekday that disagrees with the date return null.
 */
export function parseRfc822(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const m = RFC822.exec(collapseWs(raw))
  if (!m) return null
  const [, dow, dd, mon, yyyy, hh, mi, ss, zone] = m
  const day = Number(dd), month = MONTHS[mon as string] as number, year = Number(yyyy)
  const hour = Number(hh), minute = Number(mi), second = Number(ss ?? '0')
  if (hour > 23 || minute > 59 || second > 59) return null
  const local = new Date(Date.UTC(year, month, day, hour, minute, second))
  // Round-trip: Date.UTC rolls 31 Sep over to 1 Oct instead of failing.
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month || local.getUTCDate() !== day) return null
  if (dow !== undefined && DAYS[local.getUTCDay()] !== dow) return null
  let offsetMin = 0
  if (zone !== undefined && /^[+-]\d{4}$/.test(zone)) {
    const oh = Number(zone.slice(1, 3)), om = Number(zone.slice(3, 5))
    if (oh > 23 || om > 59) return null
    offsetMin = (zone[0] === '-' ? -1 : 1) * (oh * 60 + om)
  }
  return new Date(local.getTime() - offsetMin * 60_000).toISOString().replace('.000Z', 'Z')
}

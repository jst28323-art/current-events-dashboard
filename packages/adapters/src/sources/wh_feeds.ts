// wh.feeds — the whitehouse.gov umbrella RSS feed (/news/feed/) → one event per White House post.
// Catalog row: docs/SOURCES.md `wh.feeds`; evidence: docs/research/executive_branch.md §2; plan: ROADMAP P1.4.
//
// The feed is WordPress RSS 2.0: the 30 newest posts across Releases, Briefings & Statements, Fact Sheets and every
// Presidential Actions subcategory, each carrying ~15 KB of HTML. It answers ETag and If-Modified-Since with 304, but its
// validator is SITE-WIDE and changes with no new item (docs/TRAPS.md), so a 200 does not mean "new". This adapter is
// therefore idempotent: it emits every item in the payload, every time, with ids derived only from the WordPress post
// id, and the Hub's dedupe by dedup_key turns an unchanged replay into zero new events.
//
// Every mapping rule below says why; the reviewer is invited to attack each one.
import { finalizeEvent, type CedEvent, type FeatureId, type Tier } from '@ced/schema'
import type { AdapterOutput, FetchedResponse, HealthSignal, HealthStatus, SourceDefinition } from '../types.js'
import { categoryTexts, parseItemHeads, parseRfc822, scanRssItems, singleText } from '../lib/rss.js'

export const WH_FEEDS_PARSER = 'wh_feeds@0.1.0'
const SOURCE_ID = 'wh.feeds'
const ENDPOINT_NEWS = 'news'

// The GUID WordPress writes once, at post creation: "https://www.whitehouse.gov/?p=51617". It never changes when a post
// is re-titled or re-slugged (the link does), so it is the object identity (research §2.1: "stable WP post id, use as
// dedupe key"). http is accepted because the guid is an opaque id, not a link we publish. Any other shape means the
// identity rule no longer holds, so the payload is drift (a changed key would silently duplicate every post).
const GUID = /^https?:\/\/(?:www\.)?whitehouse\.gov\/\?p=(\d{1,12})$/
const WH_HOSTS = new Set(['www.whitehouse.gov', 'whitehouse.gov'])

type PresidentialSub = 'executive_order' | 'proclamation' | 'memorandum' | 'nominations_sent'

// WordPress category names as the feed prints them (both fixtures, 2026-10-02), matched case-insensitively.
const PRESIDENTIAL_PARENT = 'presidential actions'
const PRESIDENTIAL_SUB: Record<string, PresidentialSub> = {
  'executive orders': 'executive_order',
  'proclamations': 'proclamation',
  'presidential memoranda': 'memorandum',
  'nominations & appointments': 'nominations_sent',
}
// D-012: the owner's alert classes include executive orders, proclamations and memoranda. EVENT_MODEL "Importance
// tiers": P0 is exactly the D-012 classes; "other presidential actions" are P1 (nominations notices included).
const P0_SUBS = new Set<PresidentialSub>(['executive_order', 'proclamation', 'memorandum'])

// "Nominations & Appointments" also holds "Withdrawals Sent to the Senate" (presidential-actions fixture, ?p=50428) and
// appointment notices. nominations_sent needs a title saying nominations were sent AND no withdrawal in it: a
// "Withdrawal of Nomination Sent to the Senate" or a combined "Nominations and Withdrawals" post would otherwise be
// typed as nominations only (review WH-3). Anything else in the category is presidential_action.other (same P1 tier).
const NOMINATIONS_SENT = /\bnominations?\b.*\bsent to the senate\b/i
const WITHDRAWAL = /\bwithdr[ae]w/i

// In the presidential-actions fixture (2026-10-02), 12 of the 13 posts filed under Proclamations open their
// <description> with the heading "By the President of the United States of America A Proclamation" (upper or title
// case), and none of the 14 filed under Executive Orders or Presidential Memoranda does. The 13th, "Establishing the
// United States Space Academy" (?p=49230), is Executive Order 14423 (docs/research/executive_branch.md §4). The
// umbrella fixture's 5 presidential posts are among these. So the heading is the check on the White House's filing
// (review WH-4): a proclamation filing without it, or an EO/memorandum filing with it, gets the type
// presidential_action.other, keeping P0 (both kinds are D-012 classes). The operative words are no test: ?p=50532 is
// a real proclamation that reads "it is hereby ordered".
const HEADING = 'by the president of the united states of america a proclamation'
const HEADING_TEXT = '"By the President of the United States of America A Proclamation"'
// Tags (the <description> tag itself, <p>, <br />), CDATA markers, NBSP references and whitespace: one space per run.
// (A plain string compare after this costs about half of one case-insensitive regex on a cold process: 0.22 vs 0.44
// ms for 30 descriptions, n=5 each, Node 26.3, 2026-10-02.)
const SEPARATORS = /(?:<!\[cdata\[|<[^>]*>|&lt;[^&]*&gt;|&#160;|&nbsp;|\s)+/g

/** True when the post's text (its raw <description>) begins with the proclamation heading, in any letter case. */
function opensWithProclamationHeading(description: string | undefined): boolean {
  if (description === undefined) return false
  const text = description.slice(0, 400).toLowerCase().replace(SEPARATORS, ' ').trimStart()
  if (!text.startsWith(HEADING)) return false
  const next = text.charCodeAt(HEADING.length) // NaN at the end of the text
  return !((next >= 97 && next <= 122) || (next >= 48 && next <= 57)) // the heading ends at a word boundary
}

type WhType = 'wh.briefing_statement' | 'wh.fact_sheet' | 'wh.release' | 'wh.article' | 'wh.remarks'
const WH_SECTION: Record<string, WhType> = {
  'briefings & statements': 'wh.briefing_statement',
  'fact sheets': 'wh.fact_sheet',
  'releases': 'wh.release',
  'articles': 'wh.article', // /articles/ now 301s to /releases/ (research §2.1); kept for older posts
  'remarks': 'wh.remarks',
}
// Tiers for White House messaging posts (none is a D-012 alert class, so none is P0):
// - Briefings & Statements P2: the section carries the bill-signing notices ("Congressional Bill S. 2398 Signed into
//   Law"; research §2.1: they are posted here, F11) and presidential messages. Lifting only the signing notices would
//   need title parsing; that waits for Congress.gov bill.signed events (Phase 7).
// - Remarks P2: the President's own words (the section has been dormant since 2025-01-20, docs/TRAPS.md).
// - Fact Sheets P3: the White House's summary of an action that is already in the feed as its own event.
// - Releases / Articles P3: messaging pieces, the analogue of EVENT_MODEL's P3 "agency releases".
// - Anything else (wh.other) P3.
const WH_TIER: Record<WhType, Tier> = {
  'wh.briefing_statement': 'P2',
  'wh.remarks': 'P2',
  'wh.fact_sheet': 'P3',
  'wh.release': 'P3',
  'wh.article': 'P3',
}
const TIER_ORDER: Tier[] = ['P0', 'P1', 'P2', 'P3', 'P4']

export interface Classification {
  event_type: string
  /** True for anything filed under Presidential Actions: the event is the action, not the posting. */
  presidential: boolean
  tier: Tier
  reasons: string[]
  /** The White House's own category names (verbatim) that decided the type; the title says "posted under" them. */
  filedUnder: string[]
  /** False when no category on the item is one we know (reported in the health detail as possible drift). */
  known: boolean
  /** Set when the post cannot be classified safely: the adapter refuses the whole payload as drift with this reason. */
  drift: string | null
}

/**
 * Category → event type. Presidential Actions wins over any messaging section (the White House filed the post as an
 * action). Exactly one known subcategory names the type, checked against the post's heading for the D-012 kinds
 * (opensWithProclamationHeading); two or more different subcategories are ambiguous → presidential_action.other, still
 * P0 if any of them is a D-012 class (an EO also tagged as a proclamation must not lose its alert). A Presidential
 * Actions post with no known subcategory, or with any category we do not know, is refused (`drift`; review WH-1).
 * Messaging sections: one → its type; several → wh.other at the most important of their tiers; none known → wh.other
 * P3, flagged in health. The type is the White House's label, never our reading of the text (see the title comment in
 * parseWhFeeds for why the title attributes it); the heading check only withholds a label the post contradicts.
 *
 * `description` is the item's raw <description> element (markup and all) as the scan cut it out, or undefined.
 */
export function classify(categories: readonly string[], officialTitle: string, description: string | undefined): Classification {
  const shown = categories.map((c) => `category: ${c}`)
  const subNames = categories.filter((c) => PRESIDENTIAL_SUB[c.toLowerCase()] !== undefined)
  const subs = new Set(subNames.map((c) => PRESIDENTIAL_SUB[c.toLowerCase()] as PresidentialSub))
  const parent = categories.filter((c) => c.toLowerCase() === PRESIDENTIAL_PARENT)
  if (subs.size > 0 || parent.length > 0) {
    const pa = (event_type: string, tier: Tier, why: string[], filedUnder: string[], drift: string | null = null): Classification =>
      ({ event_type, presidential: true, tier, reasons: [...shown, ...why], filedUnder, known: true, drift })
    // Review WH-1: every Presidential Actions item in both recorded feeds (35 items, 30 distinct posts) carries exactly
    // one of the four known subcategories, the same four the research found a per-subcategory feed for
    // (docs/research/executive_branch.md §2). A category we do not know on such a post may be a renamed alert class
    // ("Executive Order", singular); typing it presidential_action.other would silently demote an EO or memorandum to
    // P1. So nothing is published until the mapping is checked. (The P0 here is never published; it only keeps a
    // caller that ignored `drift` from demoting the post.)
    const unknown = categories.filter((c) => {
      const l = c.toLowerCase()
      return l !== PRESIDENTIAL_PARENT && PRESIDENTIAL_SUB[l] === undefined && WH_SECTION[l] === undefined
    })
    if (unknown.length > 0) {
      const named = unknown.map((c) => `"${c}"`).join(', ')
      return pa('presidential_action.other', 'P0', ['unknown Presidential Actions category'], [...parent, ...unknown],
        `a Presidential Actions post under a category we do not know (${named}): it could be a renamed alert class, so nothing is published until the mapping is checked`)
    }
    if (subs.size === 0) {
      return pa('presidential_action.other', 'P0', ['no Presidential Actions subcategory'], parent,
        'a Presidential Actions post with no subcategory: its alert tier cannot be decided')
    }
    if (subs.size === 1) {
      const sub = [...subs][0] as PresidentialSub
      const filed = subNames[0] as string
      if (P0_SUBS.has(sub)) {
        const heading = opensWithProclamationHeading(description)
        if (sub === 'proclamation' && !heading) {
          return pa('presidential_action.other', 'P0', [`filed under ${filed}, but the post does not open with the proclamation heading (${HEADING_TEXT})`, 'D-012 alert class (presidential action)'], subNames)
        }
        if (sub !== 'proclamation' && heading) {
          return pa('presidential_action.other', 'P0', [`filed under ${filed}, but the post opens with the proclamation heading (${HEADING_TEXT})`, 'D-012 alert class (presidential action)'], subNames)
        }
        return pa(`presidential_action.${sub}`, 'P0', ['D-012 alert class (presidential action)'], subNames)
      }
      if (NOMINATIONS_SENT.test(officialTitle) && !WITHDRAWAL.test(officialTitle)) {
        return pa('presidential_action.nominations_sent', 'P1', ['nominations sent to the Senate'], subNames)
      }
      return pa('presidential_action.other', 'P1', ['other presidential action'], subNames)
    }
    const alert = [...subs].some((s) => P0_SUBS.has(s))
    return alert
      ? pa('presidential_action.other', 'P0', ['D-012 alert class (presidential action; subcategories disagree)'], subNames)
      : pa('presidential_action.other', 'P1', ['other presidential action (subcategories disagree)'], subNames)
  }
  const sectionNames = categories.filter((c) => WH_SECTION[c.toLowerCase()] !== undefined)
  const types = new Set(sectionNames.map((c) => WH_SECTION[c.toLowerCase()] as WhType))
  if (types.size === 1) {
    const t = [...types][0] as WhType
    return { event_type: t, presidential: false, tier: WH_TIER[t], reasons: [...shown, 'White House messaging'], filedUnder: sectionNames, known: true, drift: null }
  }
  if (types.size > 1) {
    const tier = TIER_ORDER.find((x) => [...types].some((t) => WH_TIER[t] === x)) as Tier
    return { event_type: 'wh.other', presidential: false, tier, reasons: [...shown, 'White House messaging (several sections)'], filedUnder: sectionNames, known: true, drift: null }
  }
  const why = categories.length > 0 ? 'White House post (no known category)' : 'White House post (no category)'
  return { event_type: 'wh.other', presidential: false, tier: 'P3', reasons: [...shown, why], filedUnder: [...categories], known: false, drift: null }
}

function joinList(xs: readonly string[]): string {
  const u = [...new Set(xs)]
  return u.length <= 1 ? (u[0] ?? '') : `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`
}

function health(status: HealthStatus, detail: string, items_seen: number): HealthSignal {
  return { source_id: SOURCE_ID, endpoint: ENDPOINT_NEWS, status, detail, items_seen }
}
const fail = (status: HealthStatus, detail: string, items_seen = 0): AdapterOutput => ({ events: [], health: health(status, detail, items_seen) })

const TITLE_MAX = 1000 // event.schema.json title.maxLength
const OFFICIAL_MAX = 4000 // event.schema.json official_text.maxLength
const KEY_MAX = 300 // event.schema.json $defs.key.maxLength

/**
 * Pure: one response in, events + one health signal out. Fail closed: any item that breaks the recorded shape makes the
 * whole payload `drift` with zero events (a partial publish could hide which posts are missing).
 * Events are NOT schema-validated here: 30 validateEvent calls cost ~4-5 ms on a cold isolate (Node 26, 2026-10-02),
 * half the Workers Free CPU budget, and the Hub must validate everything it ingests anyway (every adapter plus the
 * home-PC /ingest). The tests assert that every event from every fixture and variant validates.
 */
export function parseWhFeeds(endpointId: string, res: FetchedResponse): AdapterOutput {
  if (endpointId !== ENDPOINT_NEWS) return fail('error', `unknown endpoint "${endpointId}"`)
  if (res.status === 304) return fail('not_modified', 'HTTP 304: nothing changed since the last poll')
  if (res.status !== 200) return fail('error', `HTTP ${res.status}`)
  const ct = (res.headers['content-type'] ?? '').toLowerCase()
  if (ct.includes('html')) return fail('drift', `an HTML page (${ct}) instead of RSS`)
  if (ct !== '' && !ct.includes('xml') && !ct.includes('rss')) return fail('drift', `unexpected content-type "${ct}"`)

  const scan = scanRssItems(res.body)
  if (scan.kind !== 'ok') return fail('drift', scan.detail)
  const seen = scan.items.length
  // Review WH-6: the umbrella feed always lists its newest posts (30 in every recorded response and poll), so a
  // channel with none is not a quiet source; a renamed <item> element (<ITEM>, <entry>) looks exactly like this.
  // CLAUDE.md directive 5: a broken source is shown as broken, never as quiet. Hence drift, not empty.
  if (seen === 0) return fail('drift', 'the channel lists no items (the umbrella feed always lists its newest posts; a renamed <item> element looks the same)')
  const parsed = parseItemHeads(scan.items)
  if (!parsed.ok) return fail('drift', parsed.detail, seen)
  const fetchedMs = Date.parse(res.fetchedAt)

  const events: CedEvent[] = []
  const postIds = new Set<string>()
  let untimed = 0
  let uncategorized = 0
  for (const [n, item] of parsed.items.entries()) {
    const at = `item ${n + 1}`
    // Each of these must appear at most once and hold plain text; a repeated <title> or <guid> is ambiguous.
    const title = singleText(item, 'title')
    if (!title.ok) return fail('drift', `${at}: ${title.detail}`, seen)
    const link = singleText(item, 'link')
    if (!link.ok) return fail('drift', `${at}: ${link.detail}`, seen)
    const guid = singleText(item, 'guid')
    if (!guid.ok) return fail('drift', `${at}: ${guid.detail}`, seen)
    const pub = singleText(item, 'pubDate')
    if (!pub.ok) return fail('drift', `${at}: ${pub.detail}`, seen)
    const cats = categoryTexts(item)
    if (!cats.ok) return fail('drift', `${at}: ${cats.detail}`, seen)

    // Identity: the WordPress post id from the GUID. A duplicate within one payload means the feed is not what we
    // recorded; publishing either copy could attach the wrong title to the id, so nothing is published.
    const g = guid.value === undefined ? null : GUID.exec(guid.value)
    if (!g) return fail('drift', `${at}: ${guid.value === undefined ? 'no <guid>' : `guid "${guid.value}" is not a whitehouse.gov ?p= post id`}`, seen)
    const postId = String(Number(g[1]))
    if (postIds.has(postId)) return fail('drift', `${at}: duplicate guid ?p=${postId} in one payload`, seen)
    postIds.add(postId)

    // The primary-source link (CLAUDE.md directive 5: every event links its source): https on whitehouse.gov only.
    if (link.value === undefined || link.value === '') return fail('drift', `${at}: no <link>`, seen)
    let url: URL
    try {
      url = new URL(link.value)
    } catch {
      return fail('drift', `${at}: <link> "${link.value}" is not a URL`, seen)
    }
    if (url.protocol !== 'https:') return fail('drift', `${at}: <link> is not https (${link.value})`, seen)
    if (!WH_HOSTS.has(url.hostname)) return fail('drift', `${at}: <link> is not on whitehouse.gov (${url.hostname})`, seen)

    // official_text is the headline verbatim, entities decoded (&#8217; → ’), XML whitespace collapsed.
    const official = title.value ?? ''
    if (official === '') return fail('drift', `${at}: no <title>`, seen)
    if (official.length > OFFICIAL_MAX) return fail('drift', `${at}: <title> is ${official.length} characters`, seen)

    const description = scan.skipped[n]?.find((raw) => raw.startsWith('<description'))
    const cls = classify(cats.value, official, description)
    if (cls.drift !== null) return fail('drift', `${at} (?p=${postId}): ${cls.drift}`, seen)
    if (!cls.known) uncategorized++

    // Times. pubDate is when the White House says it POSTED the item (WordPress post_date_gmt), not when anything was
    // signed, and the research found it can precede public visibility (a release stamped 22:22Z reached the
    // press-office email ~14.5 h later; docs/research/executive_branch.md §2.1 verifier note).
    // - source_published_at = pubDate, always: it is the source's claim, and the field says so.
    // - White House messaging (wh.*): the posting IS the event, so occurred_at = pubDate. For a back-dated post the
    //   latency ledger (first_seen_at - occurred_at) overstates our lag; it never understates it.
    // - Presidential actions: the event is the action (the signing), whose time the feed does not give (posts came
    //   17-210 min after the scheduled signing, n=10). occurred_at = null: never present a posting time as a signing
    //   time. Ordering falls back to first_seen_at (EventsResponse sort), which is when we learned of it.
    // - A pubDate later than our own fetch cannot be the posting time (we had already seen the post): occurred_at null.
    const posted = parseRfc822(pub.value)
    if (posted === null) untimed++
    const occurred = cls.presidential || posted === null || Date.parse(posted) > fetchedMs ? null : posted

    // Title: what the White House did, in plain words, with its headline in quotes so its wording (e.g. the real
    // Releases headline "Democrats UNANIMOUSLY Vote AGAINST the Stop Insider Trading Act") is attributed, never stated
    // as fact. The kind of document is named as the White House's own filing ("posted under Executive Orders"), not
    // as our assertion, because that filing can be wrong: "Establishing the United States Space Academy" (?p=49230,
    // presidential-actions fixture) is filed under Proclamations, yet its text reads "it is hereby ordered" and the
    // Compilation of Presidential Documents lists it as Executive Order 14423 (docs/research/executive_branch.md §4).
    const lead = cls.filedUnder.length > 0 ? `White House posted under ${joinList(cls.filedUnder)}: ` : 'White House posted: '
    const full = `${lead}“${official}”`
    const eventTitle = full.length <= TITLE_MAX ? full : `${lead}“${official.slice(0, TITLE_MAX - lead.length - 3)}…”`

    // object_key = the post id, so a re-titled or re-slugged post merges with itself. The EVENT_MODEL page key
    // wh:{path} rides along as an alias for the later EO / FR link (docs/research/curation_priorart_future.md §2.4).
    // The dedup_key transition is "published" (status published, D-030) and leaves the event type out, so a post the
    // White House re-files under another category also merges instead of appearing twice.
    const objectKey = `wh_post:${postId}`
    const path = url.pathname.replace(/^\/+|\/+$/g, '')
    const alias = `wh:${path}`
    // F9 = presidential actions. Everything else is F11, including Briefings & Statements: F3 is live press
    // conferences and briefings, and the White House no longer posts briefing transcripts (docs/TRAPS.md).
    const features: FeatureId[] = cls.presidential ? ['F9'] : ['F11']

    events.push(finalizeEvent({
      dedup_key: `${objectKey}#published`,
      object_key: objectKey,
      ...(path !== '' && alias.length <= KEY_MAX ? { alias_keys: [alias] } : {}),
      event_type: cls.event_type,
      status: 'published',
      branch: 'executive',
      body: 'white_house',
      features,
      title: eventTitle,
      official_text: official,
      importance: { tier: cls.tier, reasons: cls.reasons },
      times: { occurred_at: occurred, source_published_at: posted, first_seen_at: res.fetchedAt },
      sources: [{
        source_id: SOURCE_ID,
        url: url.href,
        retrieved_at: res.fetchedAt,
        license: 'us-gov-public-domain', // whitehouse.gov/copyright: government-produced materials are not copyrighted
        affiliation: 'executive-messaging',
      }],
      revision: 1,
      provenance: { parser: WH_FEEDS_PARSER, confidence: 'high' },
    }))
  }

  const notes: string[] = []
  if (untimed > 0) notes.push(`${untimed} without a usable pubDate`)
  if (uncategorized > 0) notes.push(`${uncategorized} with no known category`)
  return { events, health: health('ok', `${seen} items${notes.length > 0 ? `; ${notes.join('; ')}` : ''}`, seen) }
}

export const whFeeds: SourceDefinition = {
  source_id: SOURCE_ID,
  name: 'White House news feed (whitehouse.gov)',
  affiliation: 'executive-messaging',
  license: 'us-gov-public-domain',
  features: ['F9', 'F11'],
  // One umbrella feed covers every section (research §2.1); the per-section feeds share its site-wide ETag, so polling
  // them too would only multiply 304s and 500 KB re-downloads.
  endpoints: [{ id: ENDPOINT_NEWS, url: 'https://www.whitehouse.gov/news/feed/', validator: 'etag' }],
  // 60 s around the clock: posts land in the US evening (EO posts 21:17-22:02Z in the 2026-10-02 fixtures), on holidays
  // (the Labor Day proclamation, Mon 7 Sep) and on weekends (a Briefings & Statements post Sat 26 Sep 16:26Z); D-023
  // alerts ring at any hour; an unchanged feed costs one conditional GET answered 304.
  cadence: { business_s: 60, off_s: 60 },
  freshness_slo_s: 120, // Phase 1 exit 4: stale after 2x cadence
  rate_budget_per_h: 60, // one conditional GET per minute; a retry takes the next slot, never an extra one
  parse: parseWhFeeds,
}

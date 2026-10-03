// What the probe fetches (ROADMAP P1.3): one or two representative URLs for every Tier 1-2 source in docs/SOURCES.md
// that needs no key, and the sources it deliberately skips (with the reason). URLs are the ones the research and the
// recorded fixtures used (fixtures/<source_id>/2026-10-02/*.meta.json, docs/research/*), so a result is comparable with
// what was measured from the dev PC. Where a source's live URL changes daily (a per-day file, a per-week page), a fixed
// recorded URL is probed instead: that tests reachability and validators on a document that exists.

export type Expect = 'json' | 'xml' | 'html' | 'hls'

export interface ProbeTarget {
  source_id: string
  /** Stable id within the source. */
  endpoint_id: string
  tier: 1 | 2
  /** The URL without any cache-buster. */
  url: string
  /** Body shape a working answer has; a 200 of another shape (an HTML block page from a JSON API) is not "reachable". */
  expect: Expect
  /**
   * XML targets: the root element(s) a working answer has (review R2: the Clerk's 200 error body is `<xml>Error ...</xml>`).
   * From the recorded fixture where one exists; FEED_ROOTS for feeds known only as "RSS" in the research.
   */
  root?: readonly string[]
  /**
   * A literal string a working answer contains, searched in the whole body as it streams (HTML targets: any block,
   * challenge or "File Not Found" page is HTML too). Evidence for each marker is in the target's note.
   */
  marker?: string
  /** Append `_=<epoch ms>` to every request (docs/SOURCES.md fr.api: shared caches ignore no-store). */
  cacheBust?: boolean
  note?: string
}

export interface SkippedSource {
  source_id: string
  tier: 1 | 2
  reason: string
}

/** Any syndication feed root (RSS 2.0, Atom, RSS 1.0): for feeds whose exact flavour no fixture records yet. */
export const FEED_ROOTS: readonly string[] = ['rss', 'feed', 'rdf:RDF']

export const TARGETS: readonly ProbeTarget[] = [
  // ---- Tier 1
  { source_id: 'fr.api', endpoint_id: 'pi_current', tier: 1, url: 'https://www.federalregister.gov/api/v1/public-inspection-documents/current.json', expect: 'json', cacheBust: true },
  { source_id: 'fr.api', endpoint_id: 'documents_newest', tier: 1, url: 'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest', expect: 'json', cacheBust: true },
  { source_id: 'wh.feeds', endpoint_id: 'presidential_actions', tier: 1, url: 'https://www.whitehouse.gov/presidential-actions/feed/', expect: 'xml', root: ['rss'] },
  { source_id: 'wh.feeds', endpoint_id: 'news', tier: 1, url: 'https://www.whitehouse.gov/news/feed/', expect: 'xml', root: ['rss'] },
  { source_id: 'wh.live', endpoint_id: 'live_page', tier: 1, url: 'https://www.whitehouse.gov/live/', expect: 'html', marker: 'data-live-duplex=', note: 'marker: fixtures/wh.live/2026-10-02/live_page_not_live.html has it at character 204,455 of 269,669 (docs/SOURCES.md: the live flag)' },
  { source_id: 'senate.lis.votes', endpoint_id: 'vote_menu', tier: 1, url: 'https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml', expect: 'xml', root: ['vote_summary'] },
  { source_id: 'senate.lis.votes', endpoint_id: 'vote_xml', tier: 1, url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00256.xml', expect: 'xml', root: ['roll_call_vote'] },
  { source_id: 'house.clerk.votes', endpoint_id: 'roll', tier: 1, url: 'https://clerk.house.gov/evs/2026/roll314.xml', expect: 'xml', note: 'a recorded roll that exists (the live poller probes the next roll number)', root: ['rollcall-vote'] },
  { source_id: 'house.clerk.floor', endpoint_id: 'day_file', tier: 1, url: 'https://clerk.house.gov/floor/20260916.xml', expect: 'xml', note: 'a recorded session day (the live poller asks for today\'s file)', root: ['legislative_activity'] },
  { source_id: 'house.floorcast', endpoint_id: 'latest_history', tier: 1, url: 'https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net/latest/history', expect: 'json' },
  { source_id: 'senate.schedule', endpoint_id: 'floor_schedule', tier: 1, url: 'https://www.senate.gov/legislative/schedule/floor_schedule.json', expect: 'json' },
  { source_id: 'senate.schedule', endpoint_id: 'hearings', tier: 1, url: 'https://www.senate.gov/general/committee_schedules/hearings.xml', expect: 'xml', root: ['css_meetings_scheduled'] },
  { source_id: 'senate.pressgallery', endpoint_id: 'dailypress_posts', tier: 1, url: 'https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=10', expect: 'json' },
  { source_id: 'senate.pressgallery', endpoint_id: 'periodicalpress_posts', tier: 1, url: 'https://www.periodicalpress.senate.gov/wp-json/wp/v2/posts?per_page=10', expect: 'json' },
  { source_id: 'members', endpoint_id: 'legislators_current', tier: 1, url: 'https://unitedstates.github.io/congress-legislators/legislators-current.json', expect: 'json' },
  // ---- Tier 2
  { source_id: 'house.docs.floor', endpoint_id: 'billsthisweek', tier: 2, url: 'https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/20260914/20260914.xml', expect: 'xml', note: 'a recorded week that exists (missing weeks are 200 HTML "File Not Found")', root: ['floorschedule'] },
  { source_id: 'house.committee', endpoint_id: 'by_week', tier: 2, url: 'https://docs.house.gov/Committee/Calendar/ByWeek.aspx?WeekOf=10042026_10102026', expect: 'html', marker: 'id="MainContent_LabelCalendar"', note: 'marker: the "Week of October 4 - 10, 2026" header span, at character 39,113 of 49,677 bytes in one GET with the project UA on 2026-10-02 23:31Z (200; no fixture recorded)' },
  { source_id: 'house.repcloakroom', endpoint_id: 'vote_sheet', tier: 2, url: 'https://repcloakroom.house.gov/wp-json/wp/v2/vote_sheet?per_page=3', expect: 'json' },
  { source_id: 'senate.dems', endpoint_id: 'feed', tier: 2, url: 'https://www.democrats.senate.gov/feed', expect: 'xml', root: FEED_ROOTS },
  { source_id: 'senate.captions', endpoint_id: 'committee_master', tier: 2, url: 'https://www-senate-gov-media-srs.akamaized.net/hls/live/2036788/judiciary/judiciary093026/master.m3u8', expect: 'hls', note: 'reachability of the caption CDN only: the Sep 30 committee playlist recorded 2026-10-02; a 404 means expired, not blocked (floor playlists exist only on session days)' },
  { source_id: 'bsky.official', endpoint_id: 'senatepress_feed', tier: 2, url: 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=senatepress.bsky.social&limit=5', expect: 'json' },
  { source_id: 'state.feeds', endpoint_id: 'public_schedule', tier: 2, url: 'https://www.state.gov/rss-feed/public-schedule/feed/', expect: 'xml', root: FEED_ROOTS },
  { source_id: 'war.feeds', endpoint_id: 'releases_rss', tier: 2, url: 'https://www.war.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945&max=10', expect: 'xml', root: FEED_ROOTS },
  { source_id: 'fed.feeds', endpoint_id: 'press_all', tier: 2, url: 'https://www.federalreserve.gov/feeds/press_all.xml', expect: 'xml', root: FEED_ROOTS },
  { source_id: 'fed.feeds', endpoint_id: 'calendar', tier: 2, url: 'https://www.federalreserve.gov/json/calendar.json', expect: 'json' },
  {
    source_id: 'scotus.html', endpoint_id: 'slip_opinions', tier: 2, url: 'https://www.supremecourt.gov/opinions/slipopinion/25', expect: 'html', marker: '/opinions/25pdf/',
    note: 'robots Crawl-delay: 1 (the per-host gap is longer than that). marker: the opinion PDF links (docs/research/congress_legislation_committees_courts.md); one GET with the project UA on 2026-10-02 23:32Z: 200, 75 links, the first at character 30,840 of 114,656 bytes (no fixture recorded)',
  },
  {
    source_id: 'scotus.html', endpoint_id: 'orders', tier: 2, url: 'https://www.supremecourt.gov/orders/ordersofthecourt/25', expect: 'html', marker: '/orders/courtorders/',
    note: 'marker: the order PDF links (docs/research/congress_legislation_committees_courts.md: 124 entries); one GET with the project UA on 2026-10-02 23:32Z: 200, 124 links, the first at character 30,675 of 98,129 bytes (no fixture recorded)',
  },
  { source_id: 'govinfo.rss', endpoint_id: 'crec', tier: 2, url: 'https://www.govinfo.gov/rss/crec.xml', expect: 'xml', root: FEED_ROOTS },
  { source_id: 'factbase', endpoint_id: 'calendar', tier: 2, url: 'https://media-cdn.factba.se/rss/json/trump/calendar.json', expect: 'json' },
]

export const SKIPPED: readonly SkippedSource[] = [
  { source_id: 'congress.api', tier: 2, reason: 'needs the owner\'s api.data.gov key (not given to the probe; DEMO_KEY is never used: docs/TRAPS.md)' },
  { source_id: 'youtube.api', tier: 2, reason: 'needs a free Google API key (ask-first signup, ROADMAP P3.3)' },
  { source_id: 'war.feeds', tier: 2, reason: 'only the DVIDS webcast API part is skipped: it needs a free DVIDS key (the War RSS.ashx feed IS probed)' },
  { source_id: 'house.domewatch', tier: 2, reason: 'skipped per the P1.3 brief (ROADMAP P3.1 uses it with a key for SSE); its anonymous REST endpoint is key-free and could be added' },
  { source_id: 'house.media', tier: 2, reason: 'no stable URL to probe: the day\'s HLS asset path is listed only by house.floorcast on a session day' },
]

/** Requests one cron run may make, all targets together (D-032: "~40 polite requests every 30 min"). */
export const REQUEST_CAP_PER_RUN = 40
/** Targets are split into this many groups; run r probes group (r - 1) % GROUPS, so every target is probed every 90 min. */
export const GROUPS = 3

export function targetsForRun(run: number, targets: readonly ProbeTarget[] = TARGETS): ProbeTarget[] {
  const g = (((run - 1) % GROUPS) + GROUPS) % GROUPS
  return targets.filter((_, i) => i % GROUPS === g)
}

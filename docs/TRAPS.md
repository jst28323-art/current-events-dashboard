# TRAPS — facts that cost a day if you don't know them

Uncapped, versioned, never deleted. Add a trap the moment one bites (date + evidence). If a trap stops being true,
strike it through with a dated note and keep it. Each source trap cites the research report that measured it (dated
2026-10-02 evidence in `docs/research/`); re-measure before relying on a number.

## Calendar

- **Congress is in recess until Mon 2026-11-09.** Both chambers hold only short pro forma sessions (the House is in a
  district work period), so there are no recorded votes before Nov 9. Build and test against **recorded fixtures** from the
  Sep 15–16 (House) and Sep 28–30 (Senate) session days. Measure live latency from Nov 9.
  (`docs/research/congress_floor_votes.md`, `docs/research/curation_priorart_future.md`)

## Upstream data sources

- **HTTP 200 does not mean success.** The House Clerk returns 200 with an error body for a roll call that does not
  exist, and docs.house.gov returns 200 `text/html` "File Not Found" for a missing week. Validate the body (root
  element, content type), never just the status. (`docs/research/curation_priorart_future.md`, `docs/research/congress_floor_votes.md`)
- **Which cache validator works differs by source** (some answer `If-Modified-Since` with 304 but ignore `If-None-Match`
  and send the full body every time). The `docs/SOURCES.md` row records which validator each source honours; probe it
  for every new source. (`docs/research/architecture_hosting_frontend.md`, `docs/research/congress_floor_votes.md`)
- **A changed validator does not mean new items.** The White House RSS ETag and Last-Modified change site-wide with no new
  item, and Congress.gov RSS Last-Modified is the CDN refill time. Dedupe by GUID or content hash, never by "the
  validator changed". (`docs/research/curation_priorart_future.md`, `docs/research/congress_legislation_committees_courts.md`)
- **Upstream CDNs set a freshness floor.** Some APIs serve cached copies that are many minutes old even when they
  say `no-store`; polling faster than the cache gains nothing unless the request bypasses it. Per-source figures live
  in the source's row in `docs/SOURCES.md`. (`docs/research/architecture_hosting_frontend.md`)
- **Source timestamps are last-edit, not first-appearance.** `updateDate`, `lastModified` and RSS `pubDate` move on
  every revision (a bill's status file was re-stamped 46 h after the vote by a citation fix). Record our own
  `first_seen_at` for every item; never compute latency from a source's own stamp alone.
  (`docs/research/congress_legislation_committees_courts.md`)
- **Time zones lie.** Clerk times are truncated to the minute; House hearing XML is Eastern time with no offset; the
  Senate Democrats RSS labels daylight-time posts "EST". Normalize everything to UTC at ingest and test the DST edges.
- **api.data.gov `DEMO_KEY` is useless for real work.** The observed limit was 10 requests per UTC day per API (separate
  counters for Congress.gov and GovInfo), shared by everything on the same IP. Never use DEMO_KEY in CI; use the owner's
  free key (5,000/h on Congress.gov) from a secret. (`docs/research/architecture_hosting_frontend.md`, `docs/research/congress_legislation_committees_courts.md`)
- **HouseLive hangs on a day that has not happened yet** (2026-10-02, n=1 each): `/broadcastevents/20261005` and
  `/transcripts/2026-10-05` sent no response within 30 s, while `/floor/2026-10-05` answered 200 `[]` at once. Give every
  FloorCast call a timeout and treat a timeout as "not yet", never as an outage. (`scripts/capture_live.mjs` dry run)
- **The HouseLive backend is undocumented** (row `house.floorcast` in `docs/SOURCES.md`): it can change without notice,
  so the official Clerk XML stays the fallback and the adapter must fail closed on drift.
- **Senate floor caption playlists disappear (404) after the day ends.** Capture live or lose it.
  (`docs/research/live_media_transcripts.md`)
- **Bot walls.** HHS, Commerce and the war.gov homepage return 403 to scripts (DHS does not, despite an early report); the federalregister.gov *website*
  blocks scripts (use its API); C-SPAN serves a bot challenge and its terms forbid bots and AI use (link-out only).
  (`docs/research/executive_branch.md`, `docs/research/curation_priorart_future.md`)
- **YouTube is detect-and-embed only.** Captions of other people's videos cannot be fetched through the API and its terms
  forbid downloading; channel RSS lists a live stream only after it ends; `search.list` is capped at 100 calls/day.
  Detect White House live events from the `data-live-duplex` flag on whitehouse.gov/live/ instead.
  (`docs/research/executive_branch.md`, `docs/research/live_media_transcripts.md`)
- **The White House stopped posting remarks/briefing transcripts** (its remarks feed ends 2025-01-20), and the official
  compilation of presidential documents lags ~34 days. (`docs/research/executive_branch.md`)
- **The FR `documents.json` copies an extra query parameter into `next_page_url`** (2026-10-02, live: with
  `&_=1790977406839` the body's `next_page_url` began `documents?_=1790977406839&fields…`). A cache-buster therefore
  changes the raw body on every poll, and a body-hash validator sees "changed" every time. `workers/api` hashes the body
  with the request's own `_=<stamp>` token removed (`cacheBustToken` in `workers/api/src/policy.ts`). `current.json` has
  no `next_page_url`. (fr.api live smoke, 2026-10-02)
- **An empty FR `documents.json` answer has no `results` key** (2026-10-02, live:
  `{"description":"Documents matching 'qqzzxxnonexistentterm'","count":0}`), while the Public Inspection search answers
  `{"count":0,"results":[]}`. A parser that requires `results` reports drift on a valid empty answer. `fr.api` treats
  exactly `description` + `count: 0` as empty, and anything else without `results` as drift.
- **The FR's `count` means two different things** (2026-10-02 fixtures). In `public-inspection-documents/current.json`
  it is the length of the one unpaginated list (count 107, 107 results). In `documents.json` it is the number of matches
  over all pages, capped at 10000 (`count: 10000` with 20 results and `total_pages: 50`). Never compare `count` to the
  page length on documents.json; on current.json a mismatch is drift.
- **FR agency lists differ between Public Inspection and publication** (2026-10-02 fixtures). PI lists only the issuing
  sub-agency (58 of 107 documents, e.g. U.S. Customs and Border Protection with `parent_id` 227), while `documents.json`
  lists the parent department first (Health and Human Services, then CMS). Keying anything on "the first agency" gives
  one document two different agencies; `fr.api` uses the most specific listed agency (D-034). Most FR titles also end in
  spaces ("Meetings; Sunshine Act  "): trim before comparing or linking by title. (`fixtures/fr.api/2026-10-02/`)
- **A White House category is a label, not a document type** (2026-10-02). "Establishing the United States Space
  Academy" (`?p=49230`, posted 2026-08-28) is filed under Proclamations, but the Compilation of Presidential Documents
  lists it as Executive Order 14423. "Nominations & Appointments" also holds "Withdrawals Sent to the Senate"
  (`?p=50428`). The post's own heading is the check: 12 of the 13 posts filed under Proclamations in the presidential
  actions fixture open with "By the President of the United States of America A Proclamation"; `?p=49230` does not,
  and no EO or memorandum post does. The operative words are not a test: `?p=50532` is a real proclamation that reads
  "it is hereby ordered". So `wh.feeds` titles say "posted under <category>", types a contradicted filing as
  `presidential_action.other` at P0 (D-035), and the EO number and true type come from the Federal Register. The
  WH-category condition in the link rule of `docs/research/curation_priorart_future.md` §2.4 would miss this post.
  (`fixtures/wh.feeds/2026-10-02/presidential-actions_feed.xml`; `docs/research/executive_branch.md` §4)
- **A content-hash skip hides parser fixes, and a hash-only skip freezes conditional GET** (2026-10-02, workers/api
  review W2/W9, reproduced in workerd tests). If "same body hash = do not parse" ignores which code parsed the body, a
  deployed adapter fix waits until the upstream body changes, which can be days for slow sources. If the skip does not
  also store the response's fresh ETag / Last-Modified, then after one site-wide validator change (wh.feeds) every poll
  is a full download. `workers/api` keys accepted bodies by sha-256 + Worker version id and refreshes validators on a
  hash match (D-038).
- **A cache-buster does not get a CONDITIONAL request past the White House CDN, and the CDN sometimes serves a stale
  copy** (2026-10-03, D-058 investigation: a session-bounded watcher on the home PC polled `/news/feed/` every 60 s
  plain and with a unique `?_=` query, each with its own If-None-Match, 13:33Z-20:28Z, 832 responses). Only the very first
  busted request (unconditional, 200) reached the origin (`x-cache: MISS`); every later busted request, conditional,
  was answered at the edge like the plain one (304 `HIT`), and 15 of 832 answers were `x-cache: STALE` (plain and
  busted). No post appeared that day, so the 24-minute lag of 2026-10-03 03:01Z -> 03:26Z (PROGRESS #6, n=1) is still
  unexplained; the feed's `max-age=300` alone cannot cause it. Measure the lag distribution from our own ledger
  (first_seen_at minus source_published_at per White House item, n >= 20 on business days) before paying for
  unconditional origin fetches (~480 KB each).
- **A White House post can carry a publication date days before it went public** (2026-10-05, n=1). "Presidential
  Message on Down Syndrome Awareness Month" (`/briefings-statements/2026/10/...-6778/`): feed `pubDate` and the page's
  `datePublished` 2026-10-02T18:30:00Z, `dateModified` 2026-10-05T15:05:23Z, first seen by us 2026-10-05T15:26:37Z.
  It was not in the feed at our first poll (2026-10-03 00:53Z, which listed items back to Sep 24), so it went public
  on Oct 5 under a backdated date. Its lag is 69 h from `pubDate` but about 21 min from `dateModified`. So a White
  House lag median must list items over 1 h apart (`scripts/ledger_report.mjs` prints the count) and check each one's
  page `dateModified` by hand before calling it a polling delay.
- **YouTube's robots.txt disallows `/feeds/videos.xml` (the keyless channel RSS) for every user agent** (checked
  2026-10-03 23:16Z). The Phase 0 reports recommend that feed (`docs/research/executive_branch.md` §6.2,
  `docs/research/live_media_transcripts.md`, `docs/research/curation_priorart_future.md`); never poll it. Use WebSub push
  and the Data API `videos.list` (a free key, ROADMAP P3.3) instead (`docs/research/leadership_press_conferences.md`).
  Research rule this taught: read a host's robots.txt BEFORE the first request to it, in every agent; the P3.5 research
  sent 45 requests to the disallowed path before it noticed. A per-agent cap is not a per-host cap: 8 agents with ~25
  each sent www.youtube.com 60 requests in one evening, so a multi-agent run shares ONE budget per host (D-104). The
  owner chose WebSub + `videos.list` and never RSS polling (D-101).
- **YouTube's API terms limit what we keep and bind the public site** (Developer Policies and API Services Terms, read
  2026-10-05; policies page dated 2026-09-14). Data fetched with only an API key may be kept at most 30 calendar days
  (III.E.4.d), must be kept confidential (Terms 8) and not disclosed or redistributed (III.E.5.c, III.G.1.a), derived
  metrics are restricted (III.E.4.h), and any aggregate is forbidden except one content owner's own, shown only to
  that owner (III.E.2.a). So nothing from a YouTube API response, and no aggregate of it, is committed, printed to an
  Actions log or put in an unencrypted artifact (D-105, D-106). Showing current API data to the site's users is allowed
  (III.G); a downloadable dump is not. Before Phase 3 shows any YouTube API data publicly, the site needs: a privacy policy that says it uses YouTube API Services, links the Google Privacy Policy and discloses the
  player's third-party cookies (III.A.2); a link to the YouTube Terms of Service and an "agree to be bound" line in the
  site's own terms (III.A.1); YouTube branding that links to YouTube and no "YouTube" in the site's name (III.F.2, the
  Branding Guidelines); an unmodified embed with no overlays, at least 200x200 px, autoplay off, and no
  Referrer-Policy that suppresses the Referer (III.I.6, Required Minimum Functionality); a Made For Kids check for each
  embedded video (III.E.4.j); the latest API state shown, older states only as dated history (III.E.4.f); and the key
  kept server-side, never in the page's JavaScript (III.D.1.d). One API project per API client (III.D.1.c); a project
  idle for 90 days may lose access (III.D.4).
- **GovInfo's Federal Register RSS `pubDate` is a package (re)processing time, not when the issue went up** (2026-10-03,
  `https://www.govinfo.gov/rss/fr.xml`, 100 items). FR-2026-08-24 is stamped 2026-09-29 18:44 ET and FR-2026-09-18 is
  stamped 2026-09-23; only some packages carry a time on their own issue date (00:47-05:24 ET). Never read an FR issue's
  posting time from it; measure it from our own first sighting on the FR API (`docs/SOURCES.md` row `fr.api`).
- **Size a page or a cap on the whole recorded history, not a recent window** (2026-10-03, fr.api review R1). The first
  `documents_newest` page size came from the FR's daily counts for 2025-01-02..2026-10-02 (n=437, largest 279). That
  window began three publication days after the largest issue since 1994 (344 on 2024-12-30). Extremes cluster at year
  end and around a change of administration. The FR's daily facet goes back to 1994 in one ~550 KB request: record it
  and pin the rule to the fixture (`fixtures/fr.api/2026-10-03/facets_daily_since_1994.json`, D-047).
- **The FR API lists the next issue's documents before their publication date** (2026-10-03, the live ced-api's poll
  record and `fixtures/fr.api/2026-10-03/documents_newest_next_issue_early.json`). On Saturday `documents.json`
  (order=newest) began with Monday's issue: 106 documents dated 2026-10-05, absent at 07:15Z and present by 08:15Z.
  A rule that a listed document can never be dated after the poll day (the old FR-6, one day of slack) threw away every
  weekend's list and showed the FR as drift for ~16 h. Such a document is now "scheduled" (D-055, D-059). The same
  reply means something different once its date arrives, so a "same body hash = do not parse" skip must also key on
  the date (`Endpoint.dayDependent`); otherwise the flip waits for the FR's list to change. How early the FR lists a
  weekday issue is not yet measured.
- **An FR document listed early is already public on federalregister.gov** (2026-10-03 13:3xZ, review of 861a6f4).
  Two days before its publication date, the page of 2026-20439 answered 200 and said "This document has been published
  in the Federal Register", Publication Date 10/05/2026, and the issue's govinfo PDF answered 200. So the link of a
  "scheduled" row works, and "not yet published" is the wrong description: the FR has made it public with an official
  date that has not come yet. Our title names that date (D-059). A listed document the FR later drops is never
  revised by the Hub (it changes only events that arrive), so the page says "not seen published" once its date has
  passed (D-060).

### Congress sources (P2.1 scouts and design critique, 2026-10-03; fixtures under `fixtures/<source>/2026-10-03/` unless named)

The P2.1 adapters are fixture-only (D-058); these traps come from the six source scouts (each re-checked in the named
fixture by the adapter builders) and from the design critique (`T` items, each reproduced against a live GET that was
then recorded as a fixture). The parse rules that answer them are decision rows D-066..D-077.

**House Clerk roll calls (`house.clerk.votes`)**

- **A Committee of the Whole roll says `<committee>`, not `<chamber>`** (`roll275.xml`): both read "U.S. House of
  Representatives". A parser that requires `<chamber>` rejects every amendment vote taken in the Committee of the Whole.
- **Delegates vote in the Committee of the Whole** (`roll275.xml`): the 6 delegates and the Resident Commissioner appear
  with `state="XX"`, so 437 voters. Their real territory comes only from the bioguide join.
- **A Speaker election roll has its own shape** (`roll2025_002.xml`): no `<legis-num>`, `vote-result` is a person's
  name, totals are `<totals-by-candidate>` (which also lists `Present` and `Not Voting` as candidates), there are no
  totals by party or by vote, and each `<vote>` is a candidate name.
- **A Speaker roll's result names the leader, not a winner** (critique T1; `roll2023_002.xml`, recorded from live
  `evs/2023/roll002.xml`): result `Jeffries` with 212 of 434 named votes, and the House kept balloting. Whether a ballot
  elected anyone is not in the XML, so a title must never say "elected".
- **Quorum calls and adjournment motions use fake bill numbers** (`roll2025_001.xml`: legis-num `QUORUM`, vote-type
  `QUORUM`, result `Passed`, every vote `Present`; `roll106.xml`: legis-num `ADJOURN`, while the Clerk website shows its
  bill number as empty).
- **The Clerk prints the same question in two casings** (critique T11; `roll2023_001.xml`, recorded from live
  `evs/2023/roll001.xml`): `Call By States` in 2023, `Call by States` in 2025. Match questions and results
  case-insensitively after collapsing whitespace.
- **The Clerk's own files word one result two ways** (`roll106.xml`, `roll107.xml` vs `20260327.xml` in
  `fixtures/house.clerk.floor/2026-10-03/`): the roll XML says `Passed` for the motion to adjourn and the previous
  question; the floor file says "Agreed to by the Yeas and Nays" for the same rolls. Never match result text across sources.
- **`Failed` with more yeas than nays** (`roll009.xml`, a veto override, 248-177; two-thirds needed). `passed` comes
  from `vote-result`, never from comparing counts. A failed suspension can be a majority yes (`20260902.xml` uid 42544,
  212-206), so the title says "failed to pass … two-thirds needed", not "rejected" (critique T12).
- **The vote words change with the vote type** (`roll300.xml` in `fixtures/house.clerk.votes/2026-10-02/`):
  RECORDED VOTE uses Aye/No (headers "Ayes"/"Noes"), YEA-AND-NAY uses Yea/Nay. Both map to yea and nay.
- **The current members file cannot name past voters** (`fixtures/members/2026-10-03/house_roll_2026_090_departed_members_and_party_change.xml`):
  `legislators-current.json` lacks members who left (4 bioguides already in Jan-Mar 2026 rolls) and holds today's party
  (K000401 is R in roll 90 and roll009, I now). Party and state come from the roll XML; an unresolved bioguide is not drift.
- **One calendar day can hold two legislative days** (`fixtures/house.clerk.floor/2026-10-03/20260327.xml`): convened
  9:00 AM, adjourned 8:26:52 PM, a new legislative day at 9:30 PM, all under one `<legislative_day date="20260327">`.
  HouseLive's session-day list keeps only the later start. The roll XML has no legislative-day field at all.
- **Votes after midnight carry the next calendar date** (`roll2025_139.xml`: 00:29 on 22-May-2025), not the
  legislative day's.
- **The 65-byte "Error sanitizing file" body also answers a year that has not started**
  (`roll2027_001_NEGATIVE_future_year.xml`, and `roll315_NEGATIVE_error_body.xml` in
  `fixtures/house.clerk.votes/2026-10-02/`). It names only the file, not the year.
- **The empty vote listing still has a vote row wrapper** (`votes_index_roll315_NEGATIVE_no_votes_found.html`): the
  "No Votes Found" message sits inside `<div class="role-call-vote">`, and its hidden `currentSession` says `1st` under a
  `Session=2nd` query. Count rows by their `aria-label="Roll number, N"`, never by the div; never read the session from it.
- **The listing and the XML format times differently** (`roll290.xml` against the live listing, scout 2026-10-03):
  the listing says `Sep 01, 2026, 05:55 PM` (zero-padded), the XML `1-Sep-2026` with `5:55 PM` and `time-etz="17:55"`.
- **The vote listing sends no validators** (`votes_index_119_2nd.html`): `/Votes/MemberVotes` answers If-Modified-Since
  and If-None-Match with a full 200, so change detection is a body hash. The legacy `evs/{year}/index.asp` is a 254 KB
  404 for 2026 (scout, live 2026-10-03).
- **A roll's action-time is the close of the vote** (inferred, n=4, `roll106.xml` against
  `fixtures/house.clerk.floor/2026-10-03/20260327.xml`): minute precision, about 1 min before the floor file's result
  line and 24 min after the motion was made; not the start of the vote.

**Senate roll calls (`senate.lis.votes`)**

- **senate.gov never answers 404 for a missing roll call** (`vote_119_2_00257_NEGATIVE_redirect_vote_not_available.html`,
  `vote_menu_120_1_NEGATIVE_redirect_file_not_found.html`). A vote not posted yet answers 301 to
  `roll-call-vote-not-available.htm`; a menu for a session that does not exist answers 302 to `file_not_found.htm`; both
  end in 200 `text/html`. The response keeps the requested `.xml` URL, so only content type and root element reveal it.
  A permanent redirect for a vote that will exist later could be cached by an intermediary (inferred): never request a
  vote number the menu does not list.
- **Join senators by `lis_member_id`, never by name** (`vote_119_2_00122.xml` vs `fixtures/senate.lis.votes/2026-10-02/vote_119_2_00256.xml`):
  `Graham (R-SC)` is Lindsey Graham S293 in votes 9, 96 and 122 and Darline Graham S441 (appointed 2026-07-14) in vote 256.
- **The current members file misses senators who left this session**
  (`fixtures/members/2026-10-03/senate_vote_119_2_00063_departed_members_S293_S419.xml`): S293 Lindsey Graham and S419
  Markwayne Mullin. `legislators-historical.json` (13,483,039 B) is too big to load per poll, so a departed-members seed
  is cut from it at build time (`packages/adapters/src/generated/members_departed_119.json`).
- **`<vote_cast>` can carry attributes and compound values** (`vote_115_2_00223.xml`:
  `<vote_cast crp=" " pair="S375">Present, Giving Live Pair</vote_cast>`). A pattern on the bare `<vote_cast>` tag
  silently drops that member, and an equality test against `Present` misses it.
- **The Vice President's tie-break is in neither the counts nor the members** (`vote_119_2_00009.xml`: 50-50 "Well
  Taken"), and three-fifths and two-thirds votes fail with more yeas (`vote_119_2_00254.xml` 57-43 Rejected,
  `vote_119_2_00096.xml` 48-50, `vote_117_1_00059.xml` 57-43 Not Guilty). `passed` comes from `vote_result`, never the tally.
- **A negative result hides inside a positive suffix** (`vote_117_1_00059.xml`): "Not Guilty" ends with "Guilty", and
  "Not Well Taken" ends with "Well Taken" (inferred). Match the negatives first.
- **En bloc votes have no vote-level result in the menu** (`vote_119_2_00225.xml`, `fixtures/senate.lis.votes/2026-10-02/vote_menu_119_2.xml`):
  the issue, question and result sit in `en_bloc/matter`; the per-vote XML repeats `<document>` 74 times at the root, and
  its first `<document>` (PN730-11) is the LAST nomination in the question text. "The first document" is arbitrary.
- **Amendment votes leave the document number empty** (`vote_119_2_00249.xml`, `vote_119_2_00096.xml`): document_type
  `S.Amdt.` with no number; the measure is only in `amendment/amendment_to_document_number`.
- **A cloture vote on an amendment is not cloture on the bill** (critique T2; `vote_119_2_00240.xml`, recorded from
  live): "On the Cloture Motion", S.Amdt. 6776 to S. 4668, 70-21. A title built from the bare measure would read
  "cloture on S. 4668"; the subject must be the amendment ("amendment S.Amdt. 6776 (on S. 4668)").
- **Last-Modified on old vote files is a bulk re-export** (`vote_119_2_00096.xml`, `vote_119_2_00105.xml`): 2026 files
  and 2018/2021 files alike carry Mon 24 Aug 2026 14:12-14:19 GMT. `modify_date` is the edit stamp and can move days
  later (votes of Apr 23, modify_date Apr 29). Last-Modified is not the time of first appearance (members scout: vote 63
  of Mar 23 has LM 24 Aug, vote 193 of Jul 13 has LM 1 Sep).
- **The first votes after the recess will be EST** (`vote_119_2_00009.xml` is EST; nearly all session-2 fixtures are
  EDT): the Senate returns Nov 9, after DST ends Nov 1. Vote-a-ramas run at 12:31 AM and 03:22 AM
  (`vote_119_2_00096.xml`, `vote_119_2_00105.xml`), so the 12 AM rule and the DST hours are real paths.
- **The menu and the vote file disagree on format** (`fixtures/senate.lis.votes/2026-10-02/vote_menu_119_2.xml` vs
  `vote_119_2_00256.xml`): the menu's vote_number is zero-padded (`00256`), the vote's is not (`256`); the menu's
  `<question>` has a trailing newline and spaces and mixed `<measure>` children; its `<result>` is an abbreviation
  ("Rejected") of the vote's `vote_result` ("Cloture on the Motion to Proceed Rejected").
- **If-None-Match alone gets a full 200** (scout, live 2026-10-03, menu and per-vote): with If-Modified-Since too it
  gets 304 (`vote_menu_119_2_304_not_modified.xml`), so INM is ignored, not harmful. Send If-Modified-Since.

**House Clerk floor proceedings (`house.clerk.floor`)**

- **A missing day file is a real HTTP 404** (`20261005_NEGATIVE_404_not_yet.html`: IIS text/html "404 - File or
  directory not found.", 1,245 B, no validators), not a 200 error page; the 200 "File Not Found" above is docs.house.gov's.
  A 404 on the next-day file means "not posted yet".
- **The file is per legislative day, named by the date it convened** (`20260429.xml`: 84 actions after midnight, until
  ~02:42 on Apr 30, while the next file began 09:00 the same date). A poller that asks for today's Eastern date misses them.
- **One file can hold two legislative days or a session boundary** (`20260327.xml`, `20260103.xml`, `20250103.xml`):
  `legislative_day_finished` can appear twice, and the header's session attribute labels session-1 actions as session 2.
- **The next-meeting element can repeat with the same value** (critique T4; `20260103.xml` lines 10 and 47 both say
  `20260106T18:30`). Emitting one event per element gives two events with one dedup_key, and the Hub refuses the whole
  payload. One event per distinct date; two different times for one date = drift.
- **A Congress transition day mixes two Congresses** (`20250103.xml`): header `congress="119:118" session="2:1"` (the
  pair orders do not even match), unique-ids from both Congresses mix (51304..51338 and 4..92), and the 20th-Amendment
  convene sits at index 74 of 85, beyond a 50-action head cut. unique-id resets per Congress, not per session
  (`20260102.xml`, `20260103.xml`). Jan 3 2027 will hit this.
- **Vote links carry the vote's own year, not today's session** (critique T6; `20250103.xml`: `year=2025&rollnumber=1..5`
  = votes of 119-1). Derive the session from the link's year.
- **The latest file is rewritten every 15 minutes with only `<pubDate>` changed** (`20261001.xml` vs
  `20261001_regenerated_IMS_200.xml`): new ETag and Last-Modified each time, so a body-hash skip re-parses it every 15
  min. Events must not contain pubDate, or every regeneration becomes a revision.
- **Past day files are rewritten long after the day** (`20260416.xml`: LM Jul 2 2026, a real edit,
  `update-date-time 20260702T12:09`; `20260327.xml`: LM Jul 24 2026 with no visible change). A poller that moves on to
  the next day never sees late corrections.
- **The per-day file's descriptions are XHTML** (`20260916.xml` in `fixtures/house.clerk.floor/2026-10-02/`):
  `<a rel=bill|vote|report>`, `<b>`, `&#8212;`, `&amp;` inside hrefs, while the bulk file is plain text. Strip tags,
  decode entities, collapse whitespace: that matched the Clerk's plain text on 443 of 443 actions.
- **act-id is not a classifier** (`20260327.xml`): H61000 is used for both adjourn (128 in the 2026 bulk file) and
  recess (141); H20100 for both a new legislative day and a return from recess. "Pro forma" is never written anywhere.
- **unique-id is neither in time order nor gap-free** (`20261001.xml`: the Oct 1 convene entry is 44997 among
  45144-45150, and 45149 is absent). Equal for-search times occur (`20260916.xml`, 2 ties).
- **The legislative day text has a double space before a one-digit day** (`20261001.xml`: "LEGISLATIVE DAY OF
  OCTOBER  1, 2026 "), like the Senate dates. Use the `@date` attribute.
- **The RSS feed and the bulk file start with a UTF-8 BOM** (`Home_Feed_rss.xml`); the per-day files do not. The RSS
  has no ETag or Last-Modified.
- **The bulk file is 2.2 MB decoded but 235 KB gzip on the wire** (scout, live 2026-10-03); its name embeds
  congress-session (`HDoc-119-2-FloorProceedings.xml`). Poll the per-day file.

**Senate schedule (`senate.schedule`)**

- **`floor_schedule.json` mixes two time conventions** (`floor_schedule_winter_est_2026-02-04_wayback.json`,
  `floor_schedule_session_day_2026-09-30_wayback.json`, `floor_status_new.js`): the convene fields are naive
  America/New_York wall time; `lastUpdated` has a fixed `-05:00` offset all year that is a correct instant (each sample
  1-7 min before Last-Modified). Do not "fix" lastUpdated to New York time: summer values would move 1 h.
- **`hearings.xml` `last_update_iso_8601` is malformed** (`hearings_session_week_2026-09-14_wayback.xml`:
  `2026-09-08T13:12:21.000000Z-04:00`, both Z and an offset). Date.parse gives NaN, and dropping either suffix gives
  answers 4 h apart. Read `last_update` as Eastern instead.
- **"No committee hearings scheduled" is a per-day placeholder, not an empty-file marker**
  (`hearings_2026-07-25_wayback.xml`, `hearings_session_week_2026-09-14_wayback.xml`): it sits next to real future
  meetings. Its `<time>` is the hour the file was generated (n=5), in formats that differ from real rows.
- **In recess `hearings.xml` changes every ~2 h with no news** (`fixtures/senate.schedule/2026-10-02/hearings.xml`): the
  placeholder's time is regenerated, so validators and the body hash both change; only the adapter's output stays the same.
- **`hearings.xml` is regenerated on even UTC hours** (Last-Modified +0-6 min; scout, Wayback copies): a session-week
  copy stayed at 04:00:39Z until at least 13:28Z, so the file appears to be rewritten only when content changes (inferred).
- **www.senate.gov may serve the previous version just after the hour** (n=1, scout): `hearings.xml` LM 14:06:01Z, but
  a response at 14:06:40Z still served the 12:05:51Z version (multi-origin lag).
- **Subcommittee meetings name only the parent committee** (`hearings_2026-07-30_wayback.xml`: cmte_code
  SSJU22 says `<committee>Judiciary</committee>`). Titles say "a … subcommittee (code)".
- **`hearings.xml` includes joint commissions** (`hearings_2026-07-30_wayback.xml`: JCSE00, the Helsinki
  Commission, in House room CHOB-210).
- **Placeholder video links are published** (`hearings_2026-07-30_wayback.xml` meeting 338700:
  `comm=xxxx&filename=xxxx080526`, a nominations hearing whose matter was still generic). No media from them.
- **A hearing's stream link can name another day's stream** (critique T7; `hearings_2026-07-25_wayback.xml`,
  `hearings_2026-07-30_wayback.xml`): meeting 338684 (2026-07-30) links `filename=help072926`, and 338688 links
  `filename=foreign073036`, an impossible date. Use a stream link only when its filename date equals the meeting date.
- **`<matter>` is rewritten after posting and contains NBSP** (`hearings_2026-07-25_wayback.xml` vs
  `hearings_2026-07-30_wayback.xml`: 338684 and 338688). Never key or dedupe on matter; normalize U+00A0 before any regex.
  The meeting `<identifier>` survives re-titles: key by it.
- **A nomination's partition is padded** (`hearings_session_week_2026-09-14_wayback.xml`): `partition="0 "` (trailing
  space) means no partition, and the attribute can also be absent.
- **senate.gov answers a missing path with a 200 HTML "404 Error Page"** (`floor_schedule_NEGATIVE_not_found.html`,
  after a redirect to `file_not_found.htm`). Check the content type and body; parse JSON only after.
- **`floor_schedule.json` is always 974 B** (`fixtures/senate.schedule/2026-10-02/floor_schedule.json`; ETag size 3ce
  in all 4 samples): a fixed-width template, so a changed ETag or LM means "rewritten", not "longer".
- **`floor_schedule.json` cannot tell a pro forma from a business session** (`floor_status_new.js`): senate.gov's page
  flips to "Live Floor Proceedings" 15 min before ANY convene and stays "Live" until the file is rewritten after
  adjournment, so a pro forma can read "Live" for the rest of the day. Our convene title never says "pro forma".
- **The Wayback Machine is the only history of the Senate schedule files** (the `_wayback` fixtures): byte-exact
  originals (the Apache ETag size equals the decoded length, 5 of 5), original LM/ETag in `x-archive-orig-*` headers.
  A broad CDX query (from=2025) timed out at 40 s; narrow date ranges answered in ~1 s. Tests serve these copies under
  the senate.gov URL (D-074).

**Senate Daily Press Gallery (`senate.pressgallery`)**

- **The WordPress REST API sends no validators and ignores If-Modified-Since**
  (`dailypress_posts_newest3_fields_ims_200.json`): 200 with the full body every time, on both gallery hosts. Change
  detection is a body hash.
- **The `/feed/` Last-Modified is site-wide** (`dailypress_feed.xml`, `periodicalpress_feed.xml`; scout, live
  2026-10-03): the newest edit of any post OR page (the Daily LM came from page 21643 "Most Votes in Senate History"),
  not of the feed's items; the channel `lastBuildDate` is the newest post's modified_gmt. So a 200 on If-Modified-Since
  does not mean a new post, and If-None-Match is ignored (200 with the exact ETag).
- **`date_gmt` and `modified_gmt` carry no `Z`** (`dailypress_posts_newest3_fields.json`): see "Never Date.parse a naive
  date-time string" in Libraries and code. Always append `Z`.
- **Before 2021-03-12 the Daily site clock was UTC** (823 posts, ids up to 48963, have `date == date_gmt`; scout over the
  full post list). Never derive UTC by adding a fixed offset to `date`.
- **Post timestamps are not session times** (`dailypress_posts_165481_scheduled_modified_before_date.json`): 477 of 1,842
  Daily posts are midnight-scheduled shells, 40 recent posts went live on an earlier day than their session day, 29
  Periodical posts were back-filled up to 12 days later, and modified_gmt can be earlier than date_gmt on scheduled
  posts (165481 and 3 more).
- **A gallery post can go public long after both of its timestamps** (2026-10-05, n=1; `fixtures/senate.pressgallery/
  2026-10-05/`). Post 167295 ("Monday, October 5": "4:00 p.m. The Senate convened for a pro forma session") carries
  date 00:03 and modified 16:04 ET, but the list at 21:30:01Z did not contain it (`X-WP-Total` 1,842) and the list at
  21:33:25Z did (1,843): it went public at about 17:31 ET, 91 minutes after the convene. So the gallery, the Senate's
  sitting sensor in P2.2 (design §3.3), can report a convene well after a short session ended; never read a post's
  `date` or `modified` as the time it became visible, and expect "sitting" to be missed live on pro forma days.
- **Titles are hand-typed and often wrong** (`fixtures/senate.pressgallery/2026-10-02/dailypress_posts.json`: 166515
  "Thursday, September 16" is Sep 17; `periodicalpress_posts_two_posts_one_day_and_wrong_year.json`;
  `dailypress_post_162959_overnight_two_day_title.json`, a two-day title). 21 Daily and 19 Periodical weekday/date
  mismatches, wrong years, missing years, typos ("20204"). Falling back to the post's weekday at any distance picks the
  WRONG day on back-filled posts.
- **Some session days have two posts** (`periodicalpress_posts_two_posts_one_day_and_wrong_year.json`; 13 days on each
  site): an empty or one-line stub plus the real log with slug `-2`. Key by WordPress post id, never by day or slug.
- **Category cannot identify a floor log** (`dailypress_categories.json`, `dailypress_post_56415_announcement_not_floor_log.json`):
  the Daily site files all 1,842 posts, announcements included, under "Uncategorized". The title date and the content
  must decide; the Periodical uses "Floor Logs" (37) for all 691.
- **An overnight session continues past midnight inside the same post** (`dailypress_post_162959_overnight_two_day_title.json`):
  entries are newest first, and the only marker is the prose "The above happened on Friday, June 5th." Clock times can
  also be out of order by typo ("10:30 p.m." between 11:40 and 10:57 p.m.).
- **The schedule separator moves** (`dailypress_posts_newest3_fields.json` post 167105: schedule below the log;
  `fixtures/senate.pressgallery/2026-10-02/dailypress_posts.json` post 166515: above it): `*****`, `******`, `***` or
  an em-dash line, and a post can hold two separators (166593). Post 166969 has no separator at all, so schedule blocks
  ("The Senate will …", "At 10:00", "Following …") must stop an entry's continuation (critique T9).
- **"Recess" inside a sentence is not a recess** (critique T3; `dailypress_posts_newest3_fields.json` 166969 "2:15 p.m.
  The Senate returned from recess."; `fixtures/senate.pressgallery/2026-10-02/dailypress_posts.json` 166515 "… during
  the August recess"). An unanchored keyword typed both as "Senate recessed". Type only the timed sentence, anchored to
  its subject.
- **The two galleries disagree on the same facts** (`fixtures/senate.pressgallery/2026-10-02/dailypress_posts.json` vs
  `periodicalpress_posts.json`): adjournment 11:24 p.m. (Daily) vs 11:25pm (Periodical) on Sep 30, 5:58 vs 5:57 on Sep
  16; nomination numbers differ (PN1201-4 vs PN1021-4); names are misspelled. Gallery text is never an ID source.
- **`?_envelope` returns HTTP 200 with the error inside** (`dailypress_post_999999999_envelope_NEGATIVE_200_error_body.json`:
  `{"body":{"code":"rest_post_invalid_id"},"status":404}`). Shape-check every 200: a list must be a JSON array.
- **Clock ranges need entity decoding before matching** (`dailypress_posts_before_2026-01-10_EST_time_ranges.json`:
  "5:50 - 6:35 p.m.", "3:15- 5:47 p.m.", "5:50 &#8211; 6:35 p.m."). A mid-afternoon "adjourned until 4:27 p.m." only
  starts a new legislative day.

**Member identity (`members`)**

- **congress-legislators deletes a departed member from the current file** (commit d0fa668f "Sen. Graham died" moved
  the record to `legislators-historical.json`): joining any older vote against `fixtures/members/2026-10-02/legislators-current.json`
  misses that member (`house_roll_2026_090_departed_members_and_party_change.xml` 4 misses,
  `senate_vote_119_2_00063_departed_members_S293_S419.xml` 2). Seed from the historical file and keep the map append-only.
- **New members reach the published JSON 30.6–42.6 h after 00:00 ET of their term start** (n=7, GitHub commit and
  gh-pages publish times). A new member's first votes do not resolve until then: 1 unresolved senator is a normal transient.
- **The published JSON once carried a value outside its vocabulary**
  (`legislators-current_ghpages_8125e52b_2026-09-02T2014Z.json`: party `D` for B001328 for ~14 h). The upstream's own
  validation does not guarantee the enum; the map never reads party.
- **`name.official_full` can be missing for weeks** (`fixtures/members/2026-10-02/legislators-current.json`: W000832
  today). Build display names with a fallback.
- **An appointed senator's `terms[].end` is the special-election date** (H001104 and M001244: 2026-11-03,
  `end-type: special-election`), not the day they leave. Never drop members by end date.
- **Vacancies are invisible in every join input** (`senate_vote_119_2_00193_vacancy_99_members.xml`: 99 rows, no
  marker; House rolls have 433 rows for 435 seats). Only `house_clerk_MemberData.xml` lists vacancies. A check for
  exactly 100 senators or 435 House rows is wrong.
- **Party at the vote differs from the dataset's current party** (`house_roll_2026_090_departed_members_and_party_change.xml`:
  K000401 `party="R"` on 2026-03-17; the dataset says Independent from 2026-03-09). Take party and state from the vote XML.
- **Senate first names carry trailing whitespace and differ from the dataset** (`senate_cvc_member_data.xml`: 58 of 100
  end in a space; `Lujan` without the accent; legal `Thomas` Tillis vs `Thom`). Trim, and never join on names.
- **House roll XML has no first names and two disambiguation styles** (`roll300.xml` in
  `fixtures/house.clerk.votes/2026-10-02/`: `Johnson (LA)`; `roll009.xml`: `Gonzales, Tony`).
- **The GitHub Pages ETag is mtime-size, shared by every file of a deploy** (scout headers): a site deploy probably
  changes this file's ETag with the same bytes (inferred), and its Expires header is hours earlier than Date. Compare sha256.
- **clerk.house.gov `MemberData.xml` ignores If-None-Match but honours If-Modified-Since**
  (`house_clerk_MemberData.xml`); its `publish-date` (October 1, 2026) is later than its Last-Modified (Sep 29).
- **`legislators-historical.json` is 13,483,039 B (1.26 MB gzip): build time only, never in a Worker.** The full
  current file parses in 2–23 ms (Node cold) or 2–4 ms (local workerd) of a 10 ms Free CPU budget; the generated map in
  under 1 ms (members scout).
- **raw.githubusercontent.com serves the JSON as `text/plain`** (`legislators-current_ghpages_8125e52b_2026-09-02T2014Z.json`):
  a check that requires a JSON content type rejects a snapshot fetched there.
- **A Senate `vote_result` read by its last word turns "Not …" into a pass** (2026-10-03, review of 483d7ab, fail-closed
  F1). "Nomination Not Confirmed", "Bill Not Passed" and "Motion Not Agreed to" end in a positive word, and "Guilty"
  or "Veto Overridden" fit any question by suffix: each published a P0 "Senate confirmed …". The whole phrase is now
  checked against a closed table per question, with the document kinds that question may carry
  (`packages/adapters/src/sources/senate_lis_votes.ts` QUESTIONS).
- **A head-only cut is only as good as the order it assumes** (2026-10-03, review of 483d7ab F3). The Clerk floor file
  is newest first in all 12 recordings, but nothing guaranteed it: reversed, the "newest 50" were the oldest 50 and the
  adjournment vanished. Check the order you rely on (for-search may never increase) instead of assuming it; the
  Senate menu cut already did.
- **A vote's printed date is not tied to its identity unless you tie it** (2026-10-03, review of 483d7ab F8/time F3). A
  2027 or 2019 date in a 119-2 vote published as such. A session runs from Jan 1 of its year to noon Eastern on Jan 3 of
  the next (senate `vote_116_2_00292.xml`, congress_year 2020, is dated January 1, 2021): the vote adapters now bound
  every vote instant by that window and by the fetch time.
- **The press-gallery midnight walk reads an a.m./p.m. slip as midnight** (2026-10-03, review of 483d7ab F5/time F1/
  keys F2). "11:01 a.m." for 11:01 p.m. put every newer entry 24 h late, and the old "later than our own fetch" bound
  made the same body publish different times depending on when we polled. Bound every entry by the post's own
  `modified_gmt` (a log cannot record what happened after its last edit; smallest recorded margin 2.1 min). A two-day
  post with an overnight recess (no midnight drop) cannot be walked either: an em-dash day-break rule without a
  >6 h drop, or two clocks in a row that run backwards, nulls every newer entry.
- **A date-keyed "next convene" leaves a stale scheduled row when the date moves** (2026-10-03, review of 483d7ab keys
  F3, HubDO repro). `floor_day:senate:{date}#scheduled_convene` for Oct 5, then Oct 6: both rows stay `scheduled`. A
  fixed key would bury the row (D-048 keeps a revised row at its first sighting when its new source time is later), so
  the key stays and the P2.2 page must show only the newest-sighted scheduled convene per chamber as scheduled (decision
  row D-083).
- **A press-gallery entry key carries its printed clock, so a corrected clock is a new event** (2026-10-03, review of
  483d7ab keys F4, HubDO repro): "3:40 p.m." fixed to "2:40 p.m." leaves both rows, two "logged a floor result" (now
  possibly two P0 candidates under D-062). There is no stable entry id in the WordPress HTML; the limitation is decision
  row D-082 and the Phase 4 alert matching must tolerate it.

## Hosting

- **Every push to main redeploys ced-api, so time pushes on a measurement day** (2026-10-05, cold-start r8 lead). Push
  between Public Inspection slots (08:45, 11:15, 14:00, 16:15, 18:00 ET; `docs/SOURCES.md` row `fr.api`), not within a
  few minutes of one, and run an exit read such as `scripts/ledger_report.mjs` a few minutes AFTER the last slot of
  its day, not at it: a redeploy changes no stored first_seen_at, but the first cron after it re-parses every endpoint
  once and a DO call can fail during the deploy.
- **GitHub Actions cron cannot drive a live feed**: most scheduled runs never ran in the measurement (D-008).
- **The Workers Free CPU limit per invocation is tiny** (figures and consequences: `docs/ARCHITECTURE.md`,
  "Constraints that shape the code"). Whether Durable Object alarms get the same limit on Free is undocumented: probe it
  (ROADMAP P1.3) before building on it.

- ~~**JSON-Schema validators that compile with `new Function` / `eval` do not run inside Cloudflare Workers**
  (UNVERIFIED general knowledge, 2026-10-02: Ajv's default compile is one). Use a validator without code generation, or
  precompile standalone validators at build time; prove it in a Workers-pool test before relying on it.~~
  (2026-10-02, measured in workerd 1.20261001.1, compat date 2026-10-01; superseded by the next two entries.)
- **Code generation (`eval` / `new Function`) is blocked at REQUEST time in production Workers, but allowed at startup**
  (`allow_eval_during_startup`, default since compat date 2025-06-01). So Ajv's `compile()` works at global scope and
  throws `EvalError: Code generation from strings disallowed` inside a handler; TypeBox caches "eval works" from its
  first call, so a first compile at startup makes a later in-request compile throw. The project uses
  `@cfworker/json-schema`, which never generates code (D-029).
- **The Workers test pool is MORE permissive than production**: inside `@cloudflare/vitest-plugin` tests, `new Function`
  works even at request time, and the plugin adds node-compat flags production does not have. A green Workers test
  therefore cannot prove a library is eval-free; that needs the real bundle (`wrangler deploy --dry-run --outdir`) run in
  plain Miniflare/workerd. A text search of the bundle is not enough either (esbuild rewrites `new Function` as
  `new globalThis.Function(`).
- **`@cloudflare/vitest-pool-workers` was renamed `@cloudflare/vitest-plugin`** (1.0.0 on 2026-08-20; the old package
  stopped at 0.22.0 and is not marked deprecated). The old `defineWorkersConfig` / `test.poolOptions.workers` config is
  gone: use `cloudflareTest({ wrangler: { configPath } })` in a `defineProject` config. The plugin's vitest peer is
  `^4.1.0`; Vitest 5 fails (ERESOLVE, then `SyntaxError: Unexpected identifier 'file'`). The plugin pins an exact wrangler:
  bump the two together. In tests, import `env` / `exports` from `cloudflare:workers` (`cloudflare:test`'s are deprecated).
- **TypeScript 7 defaults `types` to `[]`**: every tsconfig must list what it uses (`node` for tests that read fixtures;
  `./worker-configuration.d.ts` + `@cloudflare/vitest-plugin/types` for the Worker). `worker-configuration.d.ts` is
  generated by `wrangler types` (gitignored; the Worker's `typecheck` script regenerates it).
- **`nodejs_compat` is on by default from compat date 2026-08-04**; don't add the flag (some workerd builds reject it).
- **A Worker's main module may export ONLY the default handler and entrypoint classes** (Durable Objects,
  WorkerEntrypoints). workerd treats every named export as an entrypoint and refuses to start if one is a plain value.
  2026-10-02: the ced-probe bundle (wrangler 4.147.0 dry-run) in plain Miniflare 5.20261001.0-alpha / workerd
  1.20261001.1, compat date 2026-10-01, failed with "Uncaught TypeError: Incorrect type for map entry 'CPU_GAP_MS': the
  provided value is not of type 'function or ExportedHandler'", while the `@cloudflare/vitest-plugin` suite was green on
  the same code. `workers/api` had the same defect (`HUB_NAME`, now in `workers/api/src/hub_ref.ts`). Keep constants and
  helpers in other modules; `workers/api/test/entry.test.ts` and `workers/probe/test/entry.test.ts` pin each export
  list. Production runs the same runtime, so expect a deploy to fail the same way (UNVERIFIED in production).
- **Miniflare 5 rejects the v4 options shape.** miniflare 5.20261001.0-alpha (the copy wrangler 4.147.0 installs) fails
  `new Miniflare({ modules, scriptPath, compatibilityDate, bindings, durableObjects, outboundService })` with
  `ERR_VALIDATION` "Unrecognized keys ... expected array at workers"; options now live under `workers[]`, and its README
  still documents the old shape. Wrap v4-style options in `convertV4MiniflareOptions({ workers: [ ... ] })` (exported by
  miniflare; the vitest plugin does the same). Running the real bundle this way, with `outboundService` intercepting
  fetches, is the no-network check the test pool cannot replace (see the test-pool entry above). (2026-10-02,
  workers/api and workers/probe scratch smokes)
- **Workers RPC types a Durable Object method's result as `never` when it is not provably structured-cloneable, and
  `never` is assignable to everything.** Anything containing `CedEvent` qualifies (its `result` / `transcript` are
  `Record<string, unknown>`), so passing the stub where an interface is expected still typechecks while lying.
  (2026-10-02, workers/api: tsc reported `Property 'body' does not exist on type '{ ok: false; error: string; } &
  Disposable'`; the `ok: true` branch that carried events had silently become `never`.) `workers/api` sends events across
  RPC as their stored JSON text, and `workers/api/src/hub_ref.ts` has a compile-time guard that fails if any HubDO stub
  result is `never`.
- **An exception that escapes a Worker's fetch handler is answered by Cloudflare's own error page, with none of our
  headers** (by inspection plus the 2026-10-02 workers/api review probe W3; NOT reproduced in production). With no CORS
  grant, a browser app sees an opaque CORS failure instead of a readable error. Every route that calls a Durable Object
  needs a catch that answers JSON with the CORS headers; a DO call can fail on any deploy ("Durable Object reset because
  its code was updated"). `workers/api/src/http.ts` answers 503 JSON.
- **The `version_metadata` binding keys per-deploy behaviour; gradual deployments would break it** (2026-10-02, by
  inspection, not measured). `workers/api` tags each accepted body with `env.CF_VERSION_METADATA.id`, so the first cron
  after a deploy re-parses every endpoint once. Under a gradual (percentage) deployment two version ids would alternate
  between cron runs and re-parse on every poll. Keep `wrangler deploy` at 100%, or change the key. (wrangler 4.147.0
  lists version_metadata as supported locally; in the vitest-plugin runtime the id is a non-empty string,
  `workers/api/test/index.test.ts`.)
- **A cold isolate costs several times the warm CPU.** The wh.feeds parse takes about 1 ms warm but 7-10 ms on the
  first call in a fresh Node process (2026-10-02; the measured figures, with n and Node versions, are in the
  `docs/SOURCES.md` row `wh.feeds`). Most of that is first-use JIT
  cost: fast-xml-parser about 3.5 ms, XMLValidator about 1.2 ms, and 30 validateEvent calls another 4-5 ms when they ran
  inside the adapter. Measure CPU on a cold isolate (ROADMAP P1.3), not only warm.
- **The same JS loop can run at different speeds in Node and in workerd on the same machine, so CPU work calibrated in
  Node is wrong in a Worker** (2026-10-02, review finding R1 on `workers/probe`). An xorshift32 loop whose accumulator was
  wrapped to int32 (`acc = (acc + v) | 0`) ran at 334k-340k iterations/ms in plain workerd 1.20261001.1, and at
  863k-911k in Node 26.3.0 (921k in Node 22.23.3) on the dev PC, so every "N ms" level burned ~2.6N ms. The same loop with
  an unwrapped (double) accumulator ran at 886k vs 880k. Float loops and JSON.parse ran at the same speed in both. The
  cause is UNVERIFIED (workerd's pointer-compressed V8 has 31-bit small integers). Calibrate in workerd
  (`workers/probe/scripts/calibrate.mjs`) and pin runtime equality with a same-machine ratio test
  (`workers/probe/test/busy.test.ts`).
- **Local workerd's clocks advance during pure compute; production's are documented not to** (2026-10-02). In plain
  Miniflare 5.20261001.0-alpha (compat 2026-10-01), two Date.now() reads around a 1e8-step loop with no I/O differed by
  140 ms (performance.now as well), and the vitest pool's performance.now advances in 1 ms steps. Per Cloudflare's docs,
  a deployed Worker's clock only advances on I/O (not measured here). A timing test or log line that works locally can
  therefore read 0 in production. Time CPU work from outside (Node around dispatchFetch) or with Workers Observability
  cpuTime.
- **Plain Miniflare names a module by its path relative to the process's working directory** (2026-10-03, miniflare
  5.20261001.0-alpha, verified both ways). A `scriptPath` outside the cwd (e.g. a harness run from a scratch folder
  against the api Worker's built bundle, dist/index.js) fails to START with
  `service core:user:ced-api: Uncaught Error: internal error; reference = ...` and `ERR_RUNTIME_FAILURE`, while the
  identical bytes start fine under the cwd. Run plain-Miniflare
  checks from the repo directory, or set `modulesRoot` to the bundle's directory.
- **Miniflare 5's `convertV4MiniflareOptions` silently drops a worker's v4 `durableObjectsPersist`** (2026-10-03,
  miniflare 5.20261001.0-alpha, Node 26.3.0). With `durableObjectsPersist: <dir>` the run worked but wrote nothing to
  that directory and raised no error (reading it afterwards: ENOENT); the option name appears nowhere in miniflare 5's
  dist. The miniflare 5 option is the top-level `resourcePersistencePath: <dir>`: with it, the HubDO's SQLite appeared
  there (3 `.sqlite` files), survived `dispose()` and a new Miniflare on the same path, and was readable with
  `node:sqlite`.

## This machine and harness

- **The harness Bash tool is git-bash on Windows.** It sees `C:/Users/...`, not `/mnt/c/...`. Push from Windows git
  (`git -C C:/Users/j/claude/current-events-dashboard push origin main`); WSL git has no credential helper and hangs on a
  prompt that looks like a network stall.
- **The local GitHub token (used by both `git` and `gh`) has limited permissions** (as of 2026-10-02): it can push
  code and workflow files (the owner added "Workflows") and has "Pages", but it lacks "Administration: write" for this
  repo (so it cannot change repo settings such as turning Pages on; the owner did that by hand) and "Actions: write"
  (so `gh workflow run` fails with 403; to re-run a workflow, push a commit). A 403 response's
  `X-Accepted-GitHub-Permissions` header names exactly what a call needs (`gh api -i …`).
- **Claude cloud routines (claude.ai "Default" environment) cannot reach the .gov sources** (2026-10-02, smoke run of
  the D-028 routine, session `cse_01UeHciy55xURehwQHjizF5R`): senate.gov, the Senate Akamai stream host, the HouseLive
  Azure backend, clerk.house.gov and dailypress.senate.gov all answered HTTP 403 with a ~100-byte body and no `server`
  header (the sandbox's outbound proxy). The same URLs answered 200/404 from this PC. A cloud session also runs the
  repo's Claude Code hooks, so `scripts/hooks/push_guard.mjs` refuses any push except `git push origin main`, even a
  `--dry-run` to a side branch. Anything that must fetch upstream on a schedule runs on Cloudflare or on the home PC
  (D-033), never in a cloud routine; and a smoke check must fail on 403, not count it as "reachable" (fixed in
  `scripts/capture_live.mjs`).
- **The Windows scheduled task for the D-033 capture runs only while the owner is signed in on this PC** (2026-10-03,
  `schtasks /query /xml`: LogonType InteractiveToken, "Interactive only", no WakeToRun; StartWhenAvailable is set, so a
  late sign-in before the task's end boundary still starts it). If the PC is off, asleep or signed out for the whole
  window, nothing is recorded and the day cannot be recorded again. The run's final snapshots are taken right after
  its `--until` time, so read `scratch/capture_task.log` only once it ends with an "exit" line (cold-start r3).
- **Where Claude Code is launched decides what the repo's `.claude/` does.** Launched from the repo directory, the hooks
  in `.claude/settings.json` fire (ship_state at session start, the push guard, the dirty-handoff warning) and workflows
  resolve by name. Launched from the parent `C:\Users\j\claude` (as the canonical prompt implies), those hooks do NOT
  fire: run `node scripts/ship_state.mjs` yourself before every push (the push grant requires its `PUSH` verdict anyway),
  and call workflows by absolute `scriptPath`. The git hooks (`core.hooksPath`) fire either way, and the pre-push hook
  refuses to update main to a commit without a gate stamp, so an ungated push fails even from a parent-launched session. The repo's skills may
  not appear in the skill list either: read them by path (`.claude/skills/handoff/SKILL.md`,
  `.claude/skills/add-source/SKILL.md`) and follow them as written.
- **Secrets go in through GitHub's web UI.** ~~Whether the local token has the "Secrets" permission is unrecorded
  (assume not)~~ (2026-10-02: measured: `gh secret list` returns HTTP 403 "Resource not accessible by personal access
  token", so a session cannot even see secret NAMES; confirm a secret by the workflow that uses it, e.g. the
  `deploy-workers` run stops logging "Cloudflare secrets are not set yet"). The owner pastes keys into Settings →
  Secrets and variables → Actions themselves.
- **Long heredocs containing apostrophes or backticks fail in the harness Bash.** Write files with the Write tool.
- **This PC runs Node 26 (npm 11); CI runs Node 22.** Something can pass locally and fail in CI (or the reverse), and
  `package.json` says `>=22`. Avoid Node-26-only APIs; CI is the judge.
- **`node --test <directory>` fails on Node 26** ("test failed" on the directory itself): pass the test files
  explicitly (`npm run test:harness` and `scripts/gate.mjs` already do).
- **This PC can get slow at starting processes.** On 2026-10-02 afternoon every launch (`node -e 0`, `git --version`)
  took 4–11 s with CPU at 8% and 20 GB RAM free, so the gate took ~5 minutes instead of seconds. If the gate is slow, time
  `node -e 0` first: it is the host, not the harness. Several orphaned `grep --line-buffered` monitor processes from
  September aviary sessions were also still running (left alone; the owner may end them).
- **Headless Edge cannot render narrower than ~500 px**, so a `--window-size=390,…` screenshot is cropped, not a phone
  layout. Screenshot phone widths through a 390-px iframe (or Playwright device emulation).
- **The owner's home PC also runs GPU training for another project (aviary).** Anything always-on there must be light
  and must yield the GPU (D-003).
- **Parallel subagents of one session share ONE scratchpad directory** (2026-10-02). Two build agents both wrote
  `scratchpad/mutate.sh`. The probe agent's copy replaced the web agent's, and the web agent then ran the probe agent's
  mutation script by mistake (~17:12-17:17 CDT). It applied and restored mutations M1-M3 in `workers/probe/src` and was
  killed by a `timeout` during M4. A read-only grep afterwards found no mutation markers left, and do.ts matched the
  probe agent's own backup. Rules: give scratch files an agent-unique subdirectory (e.g. one named after the component),
  and never wrap a mutate-and-restore script in `timeout` unless it restores on exit (a shell `trap`).
- **Python text-mode writes on this PC produce CRLF, and git-bash `grep -c $'\r'` does not see CR** (it reported 0
  while `tr -cd '\r' | wc -c` counted 29). Check line endings with `git ls-files --eol <file>` (w/crlf vs w/lf) or
  `tr`, not grep. (2026-10-02: ci.yml, pages.yml and two web tests were briefly CRLF in the working copy; fixed with sed.)
- **On Windows, `process.cpuUsage()` advances in ~15.6 ms scheduler ticks**, so CPU timings of short work read as 0,
  15/16 or 31/32 ms. Measure >= 100 ms per sample, or use the wall clock of a single-threaded loop on an idle core.
  (2026-10-02, `workers/probe/scripts/calibrate.mjs`: busy(2e6) median CPU 0 ms, busy(2e7) 15-32 ms, versus wall 2.3 ms
  and 23 ms.)
- **Unicode escapes can be rewritten on the way to disk** (2026-10-02). A `\uFEFF` escape inside a TS regex and a
  string, written with the harness Write tool, landed as a literal invisible BOM (bytes EF BB BF in
  `workers/probe/src/probe.ts`; `\u0000` escapes in the same file were untouched). Separately, in a GNU sed replacement
  `\u` means "uppercase the next character", so a sed that should have written `\uFEFF` produced `FEFF`. The docs pass
  hit both again on this very entry: the harness Edit tool turned the escape text into a BOM, and a git-bash
  `perl -pi -e` substitution meant to repair it wrote `FEFF` (cause unverified). A node script that builds the text
  with `String.fromCharCode(92)` worked. Build such characters with `String.fromCharCode(0xfeff)`, and check a written
  file with `grep -c $'\xef\xbb\xbf' <file>`.
- **Playwright's WebKit on Windows is not iOS Safari** (2026-10-03, WebKit 26.6 / Playwright 1.63). (a) It has no
  `OffscreenCanvas` ("Can't find variable: OffscreenCanvas"), so an in-page canvas PNG decoder fails;
  `apps/web/e2e/png.ts` decodes in Node (D-052). (b) It accepts `backdrop-filter` (computed value
  `blur(20px) saturate(1.8)`, `CSS.supports` true) but paints nothing: a bare overlay screenshots byte-identical with
  and without it, while Chromium's differ. So default-settings WebKit screenshots show rows printing through the header
  text, and cannot verify the material. The opaque fallback (D-054) applies only under more contrast, reduced
  transparency or no backdrop-filter support, so `webkit-scrolled-*.png` still look that way: that is the instrument,
  not the iPhone. (c) It cannot emulate safe-area insets (always 0). Chromium can, through
  `Emulation.setSafeAreaInsetsOverride` over a CDP session (`apps/web/e2e/safe-area.spec.ts`). (d) It paints
  alpha-blended text one level lighter than Chromium (0.55-alpha black on a 234 gray chip: 106 vs 105). That put a
  4.56:1 word at 4.50:1, so keep at least 5% margin above any contrast bar (D-053). (e) It is ~10x slower per e2e test
  on this PC (median 2.7 s vs 0.25 s); the local gate's e2e step time is in `TESTING.md` layer 5.
- **Playwright's WebKit 26.6 does not know `prefers-reduced-transparency`, and Playwright cannot emulate it in any
  engine** (2026-10-03, probe). In WebKit, `matchMedia('(prefers-reduced-transparency: reduce)')` and
  `...: no-preference)` both match false, which is how an unknown feature behaves. Chromium knows it (no-preference
  matches by default) and emulates it over CDP: `Emulation.setEmulatedMedia` with the feature
  `prefers-reduced-transparency` set to `reduce`, which survives later `page.emulateMedia` calls
  (`apps/web/e2e/layout.spec.ts` WK4). `prefers-contrast: more` is emulated in both engines with
  `page.emulateMedia({ contrast: 'more' })`. Whether iOS Safari honours prefers-reduced-transparency is unverified.
  Related: Chromium answers `CSS.supports('-webkit-backdrop-filter', 'blur(1px)')` false; only WebKit knows the prefix.
- **A test keyed on a Playwright project NAME silently stops applying to a new project** (2026-10-03).
  `info.project.name === 'phone'` gave the new `webkit-phone` the desktop 24 px tap bound and skipped its contrast
  checks, all green. Read the emulated properties instead (`isMobile`, `deviceScaleFactor`: `apps/web/e2e/project.ts`).
- **`page.clock.install({ time })` keeps running in real time until `pauseAt`** (2026-10-03). Installed only 1 s before
  the `pauseAt` target, a slow WebKit worker passed it first: "clock.pauseAt: Cannot fast-forward to the past". Install
  well ahead (`openPaused` uses 60 s, `CLOCK_INSTALL_LEAD_MS` in `apps/web/e2e/mock-api.ts`); the jump fires nothing
  before the page loads.
- **Intermittent Chromium "Protocol error (Page.captureScreenshot): Unable to capture screenshot"** (2026-10-03, cause
  unverified). Seen on a desktop `screens.spec.ts` shot in 2 of 9 e2e runs that included Chromium after WebKit was added
  (one a Chromium-only run, so not WebKit load); 0 of 4 runs before. `apps/web/e2e/shot.ts` now retries exactly that
  error, at most twice, never an assertion (`apps/web/test/shot.test.ts`). Separately, one full gate run failed WK4
  (dark, Chromium desktop) and passed in isolation and in a full rerun; the gate log keeps only 25 lines, so its error
  text was lost. Every local e2e run now also writes `scratch/e2e-last.json`: read it after a red gate.
  [2026-10-03, p2.1 integration: `apps/web/e2e/screens.spec.ts` imported `shot()` but called `page.screenshot`
  directly in all 8 shots, so the retry never covered the very spec this trap was seen in; a p2.1 gate failed on it
  (desktop light feed, "Unable to capture screenshot"). All 8 now go through `shot()`, and `apps/web/test/shot.test.ts`
  fails if any e2e `.screenshot(` call bypasses it.]
- **`spawnSync`'s default 1 MB output buffer fails on a large git history** (2026-10-03). The gate's secret scan read
  ~1.5 MB of unpushed fixtures and failed with "spawnSync git ENOBUFS": fail-closed, but a false red. `run()` in
  `scripts/lib/git.mjs` now passes `maxBuffer` 512 MB; regression test in `tests/harness/gate.test.mjs` (a 4 MB
  committed file scans clean, and a key committed after it is still caught).

- **A workflow agent with `isolation: 'worktree'` left `core.hooksPath` absolute in the clone's shared git config**
  (2026-10-03). After the Phase 2 scouts' worktrees appeared in the gitignored worktrees folder under .claude, the main
  clone's config held the absolute path of this clone's hooks folder instead of `enforcement/git-hooks`. The scouts'
  transcripts show them only READING the value, so the worktree setup most likely wrote it. The hooks still ran, but
  `ship_state` reported SETUP-ERROR (it checks the exact relative value). After any worktree workflow, run
  `git config core.hooksPath enforcement/git-hooks` before the gate. The same launch also failed 4 of its 6 agents
  before they started (journal "failed" with no agent id; their worktrees were created and left locked): six worktrees
  created at once on this PC. Resume reused the 4 worktrees with agents told to `cd` into them (no isolation).
- **The gate printed only the last 25 lines of a failing step, which hid a TypeScript error** (2026-10-03): tsc writes
  its errors to stdout, which the gate joined before stderr, and `wrangler types` filled the tail. The gate now prints
  every error-looking line first (`failureExcerpt`, harness test). A step's full output is still not kept: re-run it
  alone (e.g. `npm run typecheck > scratch/typecheck.log 2>&1`) and read the whole log, not its tail.
- **The harness Bash tool can strip backslashes from a heredoc, even a quoted `<<'EOF'` one** (2026-10-03, P2.1 fixer):
  a regex written into a source file through `node - <<'EOF'` arrived as `/^(d{1,2}):(d{2})/` (every `\d` lost) and
  `'\n'` became a real newline, while the same text through the Write/Edit tools arrived intact. Write any code that
  holds a backslash with the Write/Edit tools, then grep the file for the regex you meant.

## Libraries and code

- **fast-xml-parser 5.11.2 defaults bend text and accept broken XML** (2026-10-02, probes plus mutation checks in
  `packages/adapters/test/wh_feeds.test.ts`). `trimValues: true` (the default) trims each text piece separately, so
  `A <![CDATA[mixed]]> title` becomes "Amixedtitle". `parseTagValue: true` (the default) turns a title "2026" into a
  number. Numeric entities such as `&#8217;` decode only with `htmlEntities: true`. `XMLParser.parse` does not throw on
  an unclosed tag, so run `XMLValidator.validate` first. The validator itself also accepts what XML forbids: an
  undefined entity (`&bogus;` is then kept as literal text, and `&nbsp;` is decoded), a reference to an illegal
  character (`&#0;` and `&#xD800;` are silently dropped, `&#x110000;` is kept literally), a malformed `&#x;`, and raw
  control characters. `packages/adapters/src/lib/rss.ts` sets the options and refuses all of these (`xmlTextProblem`),
  and its tests pin both.
- **A hand-rolled XML scanner must skip comments and processing instructions, not only CDATA.** Inside `<!-- -->` and
  `<? ?>`, a `</description>` or `<![CDATA[` is plain text. A scanner that skipped only CDATA dropped a whole item
  silently, and read a `<guid>` hidden inside a comment as the item's guid (review WH-2, 2026-10-02; regression tests in
  `packages/adapters/test/wh_feeds.test.ts`).
- **Two Preact copies freeze the web page** (2026-10-02, measured). npm put preact 11.0.0 in the root `node_modules` (as
  `@preact/signals`' peer) while `apps/web` pinned preact 10.29.8 in its own `node_modules`. `@preact/signals` resolved
  Preact 11 and attached its hooks there, while the app rendered with Preact 10. The page painted once and never
  re-rendered: it stayed on "Loading live data…" although the Playwright trace showed `/api/v1/status` and
  `/api/v1/events` answered 200. The first e2e run had 34 of 38 tests red. Guards: the root `package.json` `overrides`
  pins preact 10.29.8 (one copy installed), `apps/web/vite.config.ts` sets `resolve.dedupe: ['preact']`, and
  `apps/web/test/bundle.test.ts` plus the e2e suite check it. Any new web dependency that imports preact needs the same
  check.
- **Sorting UTC timestamps as strings breaks once fractional seconds appear** (2026-10-02, by inspection, not yet
  bitten). `'...T15:15:00.123Z' < '...T15:15:00Z'` because '.' (0x2E) sorts before 'Z' (0x5A), and both forms pass the
  schema's UTC pattern: first_seen_at and retrieved_at come from toISOString() with milliseconds, while source times
  usually have none. Compare parsed epoch milliseconds instead (`workers/api` stores `sort_ms` as an integer).
- **A reset API hub rejects every saved cursor with HTTP 400** (2026-10-02, read in `workers/api/src/hub.ts`). After the
  hub's store epoch changes (e.g. the Durable Object storage is reset), `/api/v1/events?since=<old cursor>` answers 400.
  A client that keeps resending its cursor after a 4xx is stranded until it reloads: the first Web v0 build did exactly
  that, and its "Retrying every 15 seconds" banner stayed up for good (apps/web review W1). The rule every client needs (the web
  app, later alerts and the iOS app) is in D-040.
- **@cfworker/json-schema throws on a value JSON has no type for** (2026-10-03, review fuzz: 12,148 of ~199k calls).
  An undefined member (which survives a Workers RPC structured clone) raised `Instances of "undefined" type are not
  supported.` instead of returning invalid. `validateEvent` now catches it and returns invalid, "not validatable: ..."
  (`packages/schema/src/validate.ts`, D-050); the HubDO keeps its own catch as a second line.
- **merge.ts `canonical()` compares facts; it is not an equality for validity** (2026-10-03, by inspection; pinned by
  `workers/api/test/fastpath.test.ts`). It drops null and undefined members, so an event that lacks a required null
  member (times.occurred_at) canonicalizes the same as a valid one with null. Anything that skips validation by
  comparing to a stored copy must compare strict JSON (`workers/api/src/fastpath.ts` sameJson, D-050).
- **The Hub stores each row's order key when it writes the row** (2026-10-03, read in `workers/api/src/hub.ts`: the
  `sort_ms` column is set only on insert and on a rewrite). A change to the order rule (`packages/schema/src/order.ts`,
  D-048) re-sorts only rows written after the deploy; an unchanged stored row keeps its old key, and the API serves by
  that column. Changing the rule for existing rows needs a recompute of `sort_ms` (or a store reset; see the
  "reset API hub" entry above).
- **Never `Date.parse` a naive date-time string** (2026-10-03, senate.schedule and senate.pressgallery scouts). Node
  reads `'15-SEP-2026 09:00 AM'`, `'09-08-2026 01:12:21 PM'` or WordPress `date_gmt` `'2026-10-01T04:07:59'` (no `Z`)
  in the MACHINE's zone: 14:00Z and 18:12:21Z on this Central-time PC, something else in a UTC Worker, so results depend
  on where the code runs. Eastern wall times go through `easternToUtc` in `packages/adapters/src/lib/eastern.ts`
  (nonexistent spring-forward times and ambiguous fall-back times are reported, never guessed: decision row D-075);
  a UTC string without an offset gets `Z` appended before parsing.
- **`Date.parse` rolls impossible dates over** (2026-10-03, review of 483d7ab time F6): `2026-02-30T15:00:00Z` parses
  as March 2 and `…T24:00:00Z` as the next day, so a press-gallery `date_gmt` of Feb 30 passed as "a real instant".
  `easternParts`/`easternDate` (`packages/adapters/src/lib/eastern.ts`) now require the text to round-trip through
  `toISOString`; `isRealDate` range-checks number parts.
- **A regex walk of import lines is not the bundle's module graph** (2026-10-03, review of 483d7ab keys F1). The D-058
  guard skipped `.js`/`.mjs` files, imports not at a line start and imports with a `;` in a comment, so a shim could
  have pulled fixture-only code into the Worker with every test green. The guard now checks esbuild's metafile of a real
  bundle (`packages/adapters/test/import_guard.ts`), refuses non-.ts script files under the app roots, and keeps the
  widened text walk as a second opinion.

// Web v0 (ROADMAP P1.6): a single-column, phone-first live feed. Every upstream string is rendered as text (JSX
// children and attributes), never as HTML. Fail closed: a loading state before the first answer, a "Live data
// unavailable" banner whenever the last poll failed, and never an empty list that could read as "nothing happened".
import type { CedEvent, SourceStatus } from '@ced/schema'
import { emphasis, healthLabel, originChips, rowStatusChip, skippedNote, type HealthLabel } from './lib/labels.js'
import { MAX_EVENTS } from './lib/merge.js'
import { eventTime, formatClock } from './lib/time.js'
import { linkHost, safeHttpsUrl } from './lib/url.js'
import { POLL_INTERVAL_MS } from './poller.js'
import { feed, now } from './store.js'

export function App() {
  return (
    <div class="shell">
      <Header />
      <main class="feed">
        <Feed />
      </main>
    </div>
  )
}

function Header() {
  const f = feed.value
  return (
    <header class="toolbar">
      <h1>Current Events</h1>
      <p class="updated" data-testid="last-updated">
        {f.lastGoodAt !== null ? (
          <>
            Last updated <time dateTime={new Date(f.lastGoodAt).toISOString()}>{formatClock(f.lastGoodAt)}</time>
          </>
        ) : (
          'Not updated yet'
        )}
      </p>
      <HealthChips sources={f.sources} asOf={f.lastAttemptAt !== null && !f.available ? f.lastGoodAt : null} />
      {f.lastAttemptAt !== null && !f.available ? <Unavailable /> : null}
    </header>
  )
}

const HEALTH_TITLE: Record<HealthLabel, string> = {
  ok: 'Polled successfully within its freshness window',
  stale: 'No successful poll within its freshness window: items from this source may be missing',
  error: 'The last poll of this source failed',
  'not polled yet': 'This source has not been polled yet',
}

/** `asOf` is set while the API is unreachable: the chips are then the last known health, shown dimmed and labeled so. */
function HealthChips({ sources, asOf }: { sources: SourceStatus[]; asOf: number | null }) {
  const t = now.value // re-evaluated every second: a source turns stale between polls too
  if (sources.length === 0) return null
  const lastKnown = asOf !== null ? `Last known health, as of ${formatClock(asOf)}` : null
  return (
    <ul class="health" aria-label={lastKnown ?? 'Source health'} data-last-known={lastKnown !== null ? 'true' : undefined}>
      {sources.map((s) => {
        const label = healthLabel(s, t)
        // The full source name leads the tooltip: a long name is shortened with an ellipsis in the chip itself.
        const base = `${s.name}: ${HEALTH_TITLE[label]}${s.detail ? `. ${s.detail}` : ''}`
        const detail = lastKnown ? `${lastKnown}. ${base}` : base
        return (
          <li key={s.source_id} class="chip health-chip" data-state={label} data-source={s.source_id} title={detail}>
            <span class="dot" aria-hidden="true" />
            <span class="name">{s.name}</span>
            <span class="state">{label}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Unavailable() {
  const f = feed.value
  const reason = f.lastError ? f.lastError.charAt(0).toUpperCase() + f.lastError.slice(1) + '.' : ''
  const last =
    f.lastGoodAt !== null
      ? `Showing the data last received at ${formatClock(f.lastGoodAt)}.`
      : 'No live data has been received yet.'
  return (
    <div class="banner" role="alert" data-testid="unavailable">
      <strong>Live data unavailable</strong>
      <span>
        {reason} {last} Retrying every {Math.round(POLL_INTERVAL_MS / 1000)} seconds.
      </span>
    </div>
  )
}

function Feed() {
  const f = feed.value
  if (!f.everLoaded) {
    if (f.lastAttemptAt === null) return <Loading />
    // Failed before any data: the banner says so; no list and no "no events" text that could read as a quiet day.
    return <p class="placeholder" data-testid="no-data">The feed appears here as soon as the API answers.</p>
  }
  const names = new Map(f.sources.map((s) => [s.source_id, s.name]))
  const nowMs = now.peek() // for "is this year": read without subscribing, so rows do not re-render every second
  return (
    <>
      {f.skipped > 0 ? (
        <p class="note" data-testid="skipped">
          {skippedNote(f.skipped)}
        </p>
      ) : null}
      {f.events.length > 0 ? (
        <ol class="rows">
          {f.events.map((e) => (
            <Row key={e.dedup_key} e={e} nowMs={nowMs} sourceName={names.get(e.sources[0]?.source_id ?? '') ?? e.sources[0]?.source_id ?? ''} />
          ))}
        </ol>
      ) : f.available && f.skipped === 0 ? (
        // Only when the API answered with zero events: if events arrived and were all skipped, the note above says so.
        <p class="placeholder" data-testid="feed-empty">
          The API is answering but has no events yet. Source health is shown above.
        </p>
      ) : null}
      {f.trimmed ? (
        <p class="note" data-testid="trimmed">
          This page keeps the newest {MAX_EVENTS} rows; older ones are no longer shown.
        </p>
      ) : null}
    </>
  )
}

function Loading() {
  return (
    <div class="loading" aria-busy="true" data-testid="loading">
      <p class="placeholder">Loading live data…</p>
      {[0, 1, 2].map((i) => (
        <div class="skeleton" key={i} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  )
}

function Row({ e, sourceName, nowMs }: { e: CedEvent; sourceName: string; nowMs: number }) {
  const t = eventTime(e, { now: nowMs })
  const href = safeHttpsUrl(e.sources[0]?.url)
  const chip = rowStatusChip(e, nowMs)
  return (
    <li class={`row ${emphasis(e.importance?.tier)}`} data-testid="event-row" data-tier={e.importance?.tier ?? ''} data-id={e.id}>
      <div class="meta">
        <span class="chips">
          {chip !== null ? (
            <span class={e.status === 'live' ? 'chip live' : 'chip'} data-testid="status-chip">
              {chip}
            </span>
          ) : null}
          {originChips(e).map((c) => (
            <span class="chip" key={c} data-testid="origin-chip">
              {c}
            </span>
          ))}
        </span>
        {t ? (
          <time
            dateTime={t.iso}
            data-testid="event-time"
            title={
              t.kind === 'first_seen' ? 'The source gives no trustworthy time; this is when the feed first saw it.'
                : t.kind === 'posted' ? 'When the source posted it; the source does not say when the action itself happened.'
                : t.kind === 'published_on' ? 'The source gives only the day it was published, not a time.'
                : undefined
            }
          >
            {t.kind === 'first_seen' ? `first seen ${t.text}` : t.kind === 'posted' ? `posted ${t.text}` : t.kind === 'published_on' ? `published ${t.text}` : t.text}
          </time>
        ) : null}
      </div>
      <h2 class="title">{e.title}</h2>
      {e.official_text ? <p class="official">{e.official_text}</p> : null}
      <p class="foot">
        <span class="src">{sourceName}</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" data-testid="source-link">
            {linkHost(href)}
            <span aria-hidden="true"> ↗</span>
            <span class="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span class="withheld" data-testid="link-withheld">
            link withheld: not an https address
          </span>
        )}
      </p>
    </li>
  )
}

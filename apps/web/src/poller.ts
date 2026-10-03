// The polling loop. GET /api/v1/status and /api/v1/events every 15 s (cache: "no-store"); the first events call has no
// `since`, later ones pass the last cursor and merge. Any failure (network, timeout, non-2xx, non-JSON, wrong shape,
// an answer generated too long ago) marks the feed unavailable until a poll fully succeeds: the page fails closed
// (Phase 1 exit criterion 4). A poll commits only when BOTH calls succeed, so everything on the page (rows, health
// chips, cursor) is from the same good poll, the one the banner names. A cursor the API rejects (HTTP 400: its store
// was reset) is dropped and the same poll starts over without `since`, as the API's error says to.
// Platform pieces (fetch, clock, timers, document) are injected so the state machine is unit-tested in Node.
import type { CedEvent, SourceStatus } from '@ced/schema'
import { parseEventsResponse, parseStatusResponse } from './lib/guards.js'
import { mergeEventsCounted } from './lib/merge.js'
import { parseUtc } from './lib/time.js'

export const POLL_INTERVAL_MS = 15_000
export const FETCH_TIMEOUT_MS = 10_000
/** Bound on `has_more` follow-ups in one poll (a server that always says has_more cannot spin the page). */
export const MAX_PAGES_PER_POLL = 10
/**
 * An answer whose generated_at is older than this by the viewer's clock is not current (a cache between us and the
 * Worker served an old copy) and counts as a failure. 5 minutes leaves room for a viewer clock that is a little fast.
 */
export const MAX_ANSWER_AGE_MS = 5 * 60_000

export interface FeedState {
  events: CedEvent[]
  sources: SourceStatus[]
  /** Last cursor from /api/v1/events; null until the first good events response. */
  cursor: string | null
  /** At least one poll fully succeeded (both endpoints). */
  everLoaded: boolean
  /** The last finished poll fully succeeded. False before any poll has finished. */
  available: boolean
  /** Client time (ms) of the last finished poll attempt; null while the first is in flight. */
  lastAttemptAt: number | null
  /** Client time (ms) of the last fully successful poll. */
  lastGoodAt: number | null
  /** Plain-words reason for the last failure (for the banner's detail line). */
  lastError: string | null
  /** Malformed events skipped since the page loaded. */
  skipped: number
  /** The MAX_EVENTS cap has dropped older rows (the page says so instead of dropping them silently). */
  trimmed: boolean
}

export const initialFeedState: FeedState = {
  events: [],
  sources: [],
  cursor: null,
  everLoaded: false,
  available: false,
  lastAttemptAt: null,
  lastGoodAt: null,
  lastError: null,
  skipped: 0,
  trimmed: false,
}

export interface PollDeps {
  base: string
  fetch: (url: string, init: RequestInit) => Promise<Response>
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (h: unknown) => void
  timeoutMs?: number
}

class PollError extends Error {
  constructor(
    message: string,
    /** The HTTP status when the API answered with a non-2xx code. */
    readonly httpStatus?: number,
  ) {
    super(message)
  }
}

/** "20 minutes" / "3 hours" / "2 days" (rounded down, so never older than it is). */
function ageText(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 120) return `${min} minutes`
  const h = Math.floor(min / 60)
  return h < 48 ? `${h} hours` : `${Math.floor(h / 24)} days`
}

/** Throws unless the answer's generated_at is within MAX_ANSWER_AGE_MS of the viewer's clock (later is fine: skew). */
function checkFresh(generatedAt: string, deps: PollDeps): void {
  const at = parseUtc(generatedAt)
  if (at === null) throw new PollError('the API answer was not in the expected shape') // the guards already rule this out
  const age = deps.now() - at
  if (age > MAX_ANSWER_AGE_MS) throw new PollError(`the API sent an answer generated ${ageText(age)} ago`)
}

async function getJson(url: string, deps: PollDeps): Promise<unknown> {
  const ctl = new AbortController()
  const timer = deps.setTimeout(() => ctl.abort(), deps.timeoutMs ?? FETCH_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await deps.fetch(url, { cache: 'no-store', signal: ctl.signal, headers: { Accept: 'application/json' } })
    } catch {
      throw new PollError(ctl.signal.aborted ? 'the API did not answer in time' : 'the API could not be reached')
    }
    if (!res.ok) throw new PollError(`the API answered HTTP ${res.status}`, res.status)
    const text = await res.text()
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new PollError('the API answered with something that is not JSON')
    }
  } finally {
    deps.clearTimeout(timer)
  }
}

async function getStatus(deps: PollDeps): Promise<SourceStatus[]> {
  const parsed = parseStatusResponse(await getJson(`${deps.base}/api/v1/status`, deps))
  if (!parsed) throw new PollError('the status answer was not in the expected shape')
  checkFresh(parsed.generated_at, deps)
  return parsed.sources
}

interface EventsResult {
  events: CedEvent[]
  cursor: string
  skipped: number
  /** The saved cursor was rejected and this is a fresh no-since snapshot: it replaces the rows instead of merging. */
  restarted: boolean
}

async function getEventPages(cursor: string | null, deps: PollDeps): Promise<Omit<EventsResult, 'restarted'>> {
  const out: CedEvent[] = []
  let skipped = 0
  let cur = cursor
  // Without `since`, has_more means "older events exist" (not something to chase); with `since`, it means "call again
  // at once with the new cursor", bounded so a misbehaving server cannot spin the page.
  for (let page = 0; page < (cursor === null ? 1 : MAX_PAGES_PER_POLL); page++) {
    const q = cur === null ? '' : `?since=${encodeURIComponent(cur)}`
    const parsed = parseEventsResponse(await getJson(`${deps.base}/api/v1/events${q}`, deps))
    if (!parsed) throw new PollError('the events answer was not in the expected shape')
    checkFresh(parsed.response.generated_at, deps)
    out.push(...parsed.response.events)
    skipped += parsed.skipped
    const advanced = parsed.response.cursor !== cur
    cur = parsed.response.cursor
    if (!parsed.response.has_more || !advanced) break
  }
  return { events: out, cursor: cur as string, skipped }
}

async function getEvents(cursor: string | null, deps: PollDeps): Promise<EventsResult> {
  try {
    return { ...(await getEventPages(cursor, deps)), restarted: false }
  } catch (err) {
    // workers/api answers 400 "since is not a cursor this API issued; call again without since to start over" when its
    // store was reset. Resending that cursor would fail forever, so start over once, in this same poll.
    if (cursor !== null && err instanceof PollError && err.httpStatus === 400) {
      return { ...(await getEventPages(null, deps)), restarted: true }
    }
    throw err
  }
}

/** One poll of both endpoints; returns the next state. Never throws. Commits only when both calls succeed. */
export async function pollOnce(state: FeedState, deps: PollDeps): Promise<FeedState> {
  const [st, ev] = await Promise.allSettled([getStatus(deps), getEvents(state.cursor, deps)])
  const at = deps.now()
  if (st.status === 'fulfilled' && ev.status === 'fulfilled') {
    // A restart replaces the rows (what a reload would show); otherwise merge into what we have.
    const merged = mergeEventsCounted(ev.value.restarted ? [] : state.events, ev.value.events)
    return {
      ...state,
      events: merged.events,
      sources: st.value,
      cursor: ev.value.cursor,
      everLoaded: true,
      available: true,
      lastAttemptAt: at,
      lastGoodAt: at,
      lastError: null,
      skipped: state.skipped + ev.value.skipped,
      trimmed: (state.trimmed && !ev.value.restarted) || merged.trimmed > 0,
    }
  }
  // Nothing from a half-failed poll is kept: rows, health and cursor stay from the last good poll (the banner names its
  // time), and the cursor not moving means the next good poll still fetches every change.
  const reason = st.status === 'rejected' ? st.reason : ev.status === 'rejected' ? ev.reason : null
  return {
    ...state,
    available: false,
    lastAttemptAt: at,
    lastError: reason instanceof PollError ? reason.message : 'the API answer could not be read',
  }
}

/** The bit of `document` the scheduler needs. */
export interface VisibilitySource {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', fn: () => void): void
  removeEventListener(type: 'visibilitychange', fn: () => void): void
}

export interface SchedulerDeps {
  poll: () => Promise<void>
  doc: VisibilitySource
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (h: unknown) => void
  intervalMs?: number
}

/**
 * Polls at once, then `intervalMs` after each poll finishes. While the tab is hidden nothing is scheduled; when it
 * becomes visible again it polls at once. Never two polls in flight. Returns a stop function.
 */
export function startPolling(d: SchedulerDeps): () => void {
  const interval = d.intervalMs ?? POLL_INTERVAL_MS
  let timer: unknown = undefined
  let inFlight = false
  let stopped = false
  const cancel = () => {
    if (timer !== undefined) d.clearTimeout(timer)
    timer = undefined
  }
  const schedule = () => {
    cancel()
    if (!stopped && !d.doc.hidden) timer = d.setTimeout(tick, interval)
  }
  async function tick() {
    timer = undefined
    if (stopped || inFlight || d.doc.hidden) return
    inFlight = true
    try {
      await d.poll()
    } catch {
      // pollOnce never throws; a throwing poll must not end the loop
    } finally {
      inFlight = false
      schedule()
    }
  }
  const onVisibility = () => {
    if (d.doc.hidden) cancel()
    else if (!inFlight) {
      cancel()
      void tick()
    }
  }
  d.doc.addEventListener('visibilitychange', onVisibility)
  void tick()
  return () => {
    stopped = true
    cancel()
    d.doc.removeEventListener('visibilitychange', onVisibility)
  }
}

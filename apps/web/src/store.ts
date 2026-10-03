// App state as signals: the feed (replaced by each poll) and a 1-second clock that drives the client-side "stale"
// check, so a source turns stale within a second of crossing its freshness SLO even between polls.
import { signal } from '@preact/signals'
import { API_BASE } from './config.js'
import { initialFeedState, pollOnce, startPolling, type FeedState } from './poller.js'

export const feed = signal<FeedState>(initialFeedState)
export const now = signal<number>(Date.now())

/** Starts polling and the clock; returns a stop function. */
export function start(): () => void {
  const tickClock = () => {
    now.value = Date.now()
  }
  const clock = setInterval(tickClock, 1000)
  const onVisible = () => {
    if (!document.hidden) tickClock()
  }
  document.addEventListener('visibilitychange', onVisible)
  const stop = startPolling({
    doc: document,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    poll: async () => {
      feed.value = await pollOnce(feed.value, {
        base: API_BASE.replace(/\/+$/, ''),
        fetch: (url, init) => fetch(url, init),
        now: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      })
      tickClock()
    },
  })
  return () => {
    stop()
    clearInterval(clock)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

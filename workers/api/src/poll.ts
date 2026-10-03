// The poll loop, run by scheduled() once a minute (wrangler.jsonc cron). It runs in the cron isolate and stays light
// (Workers Free: ~10 ms CPU per invocation, docs/ARCHITECTURE.md): one HubDO read for the whole run, network waits
// (not CPU), a native sha-256 of each body, and adapter parsing only when a body actually changed. Validation, merge
// and storage happen in the HubDO, a separate invocation.
//
// Per endpoint: skip while in backoff, before its cadence has elapsed, or over the source's hourly budget; have the
// HubDO count the request (claim) BEFORE sending it, and send nothing it did not count; send the stored conditional
// validator the endpoint honours (only if this code version stored it), the CLAUDE.md User-Agent and a timeout; one
// request in flight per host; a 304, or a 2xx whose body key matches the last accepted body's, is `not_modified` and is
// never parsed; a parse() throw is `drift`. fetch, the clock, the jitter source and the code version are injected, so
// tests need no network.
import type { AdapterOutput, Endpoint, FetchedResponse, SourceDefinition } from '@ced/adapters'
import type { EndpointState, PollOutcome, PollPlan, PollRecord, PollResult } from './hub.js'
import {
  CRON_SLACK_S,
  FETCH_TIMEOUT_MS,
  USER_AGENT,
  bodyKey,
  cacheBustToken,
  cadenceFor,
  parseRetryAfter,
  requestUrl,
  sameCodeVersion,
} from './policy.js'

/** The three HubDO calls the loop makes (a DurableObjectStub<HubDO> satisfies this). */
export interface PollHub {
  plan(nowMs: number): Promise<PollPlan>
  claim(sourceId: string, endpointId: string, atMs: number): Promise<void>
  recordPoll(rec: PollRecord): Promise<PollResult>
}

export interface PollDeps {
  hub: PollHub
  sources: readonly SourceDefinition[]
  fetch: (url: string, init: RequestInit) => Promise<Response>
  /** Epoch milliseconds. */
  now: () => number
  /** [0, 1), for backoff jitter. */
  random: () => number
  timeoutMs?: number
  /** The deployed code's version (the Worker version id). Stored with each accepted body, so a new deploy re-fetches
   * and re-parses every endpoint once (a parser fix applies at once). Undefined: bodies are keyed by hash alone. */
  codeVersion?: string
}

export interface EndpointRun {
  source_id: string
  endpoint_id: string
  action: 'polled' | 'skipped' | 'failed'
  reason?: 'backoff' | 'cadence' | 'budget'
  result?: PollResult
  error?: string
}

interface Job {
  def: SourceDefinition
  ep: Endpoint
  state: EndpointState | null
}

const iso = (ms: number) => new Date(ms).toISOString()
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function hex(buf: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(buf)) s += b.toString(16).padStart(2, '0')
  return s
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** One cron run over every registered source. Never throws: a failure is logged and reported per endpoint. */
export async function pollOnce(deps: PollDeps): Promise<EndpointRun[]> {
  if (deps.sources.length === 0) return []
  const startMs = deps.now()
  let plan: PollPlan
  try {
    plan = await deps.hub.plan(startMs)
  } catch (e) {
    // Without the stored state there is no backoff, cadence, budget or validator to honour: send nothing this run.
    const error = `the store did not answer, nothing was polled: ${message(e)}`
    console.error(`poll plan failed: ${message(e)}`)
    return deps.sources.flatMap((def) =>
      def.endpoints.map((ep): EndpointRun => ({ source_id: def.source_id, endpoint_id: ep.id, action: 'failed', error })),
    )
  }
  const states = new Map(plan.states.map((s) => [`${s.source_id} ${s.endpoint_id}`, s]))
  const used: Record<string, number> = { ...plan.requests_this_hour }
  const runs: EndpointRun[] = []
  const byHost = new Map<string, Job[]>()

  for (const def of deps.sources) {
    const dueAfterMs = Math.max(0, cadenceFor(def, startMs) - CRON_SLACK_S) * 1000
    for (const ep of def.endpoints) {
      const state = states.get(`${def.source_id} ${ep.id}`) ?? null
      const skip = (reason: EndpointRun['reason']) =>
        runs.push({ source_id: def.source_id, endpoint_id: ep.id, action: 'skipped', reason })
      if (state?.backoff_until_ms != null && state.backoff_until_ms > startMs) skip('backoff')
      else if (state?.last_attempt_ms != null && startMs - state.last_attempt_ms < dueAfterMs) skip('cadence')
      else {
        const host = hostOf(ep.url)
        const list = byHost.get(host) ?? []
        list.push({ def, ep, state })
        byHost.set(host, list)
      }
    }
  }

  // Hosts in parallel; within a host, strictly one request at a time.
  await Promise.all(
    [...byHost.values()].map(async (jobs) => {
      for (const { def, ep, state } of jobs) {
        const n = used[def.source_id] ?? 0
        if (n >= def.rate_budget_per_h) {
          runs.push({ source_id: def.source_id, endpoint_id: ep.id, action: 'skipped', reason: 'budget' })
          continue
        }
        used[def.source_id] = n + 1
        const run = { source_id: def.source_id, endpoint_id: ep.id }
        const claimedMs = deps.now()
        try {
          await deps.hub.claim(def.source_id, ep.id, claimedMs)
        } catch (e) {
          console.error(`poll ${def.source_id}/${ep.id} not sent: the store did not count it: ${message(e)}`)
          runs.push({ ...run, action: 'failed', error: `not sent, because the store did not count it first: ${message(e)}` })
          continue
        }
        let rec: PollRecord
        try {
          rec = await pollEndpoint(def, ep, state, deps, claimedMs)
        } catch (e) {
          console.error(`poll ${def.source_id}/${ep.id} failed: ${message(e)}`)
          runs.push({ ...run, action: 'failed', error: message(e) })
          continue
        }
        try {
          runs.push({ ...run, action: 'polled', result: await deps.hub.recordPoll(rec) })
        } catch (e) {
          // The store could not record this poll (reset mid-call, or the payload too big for it). Record a plain error
          // instead, so the endpoint backs off rather than being fetched again next minute.
          console.error(`poll ${def.source_id}/${ep.id}: recording failed: ${message(e)}`)
          const detail = `the store could not record this poll: ${message(e)}`
          try {
            const result = await deps.hub.recordPoll({ ...rec, outcome: { kind: 'error', detail, retry_after_s: null } })
            runs.push({ ...run, action: 'failed', error: message(e), result })
          } catch (e2) {
            runs.push({ ...run, action: 'failed', error: `${message(e)}; recording the failure also failed: ${message(e2)}` })
          }
        }
      }
    }),
  )
  return runs
}

/** Fetch one endpoint and turn the response into a PollRecord (no storage here). `startedMs` is the claimed time. */
export async function pollEndpoint(
  def: SourceDefinition,
  ep: Endpoint,
  state: EndpointState | null,
  deps: Pick<PollDeps, 'fetch' | 'now' | 'random' | 'timeoutMs' | 'codeVersion'>,
  startedMs?: number,
): Promise<PollRecord> {
  const started_ms = startedMs ?? deps.now()
  const { outcome, at } = await fetchAndParse(def, ep, state, deps, started_ms)
  return {
    source_id: def.source_id,
    affiliation: def.affiliation,
    endpoint_id: ep.id,
    started_ms,
    finished_ms: at,
    jitter: deps.random(),
    outcome,
  }
}

async function fetchAndParse(
  def: SourceDefinition,
  ep: Endpoint,
  state: EndpointState | null,
  deps: Pick<PollDeps, 'fetch' | 'now' | 'timeoutMs' | 'codeVersion'>,
  startedMs: number,
): Promise<{ outcome: PollOutcome; at: number }> {
  const url = requestUrl(ep, startedMs)
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: '*/*' }
  // Validators vouch for a body as THIS code parsed it: after a deploy, fetch in full once so a 304 cannot hide a fix.
  const accepted = state?.body_hash != null && sameCodeVersion(state.body_hash, deps.codeVersion) ? state : null
  if (ep.validator === 'etag' && accepted?.etag) headers['If-None-Match'] = accepted.etag
  if (ep.validator === 'if-modified-since' && accepted?.last_modified) headers['If-Modified-Since'] = accepted.last_modified
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS

  let res: Response
  try {
    // cache: 'no-store' keeps Cloudflare's own cache out of the way (upstream caches are enough of a freshness floor).
    res = await deps.fetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    const detail = timedOut ? `no response within ${timeoutMs / 1000} s` : `network error: ${message(e)}`
    return { at: deps.now(), outcome: { kind: 'error', detail, retry_after_s: null } }
  }
  const at = deps.now()
  if (res.status === 304) {
    await res.body?.cancel()
    return { at, outcome: { kind: 'not_modified', detail: 'HTTP 304 Not Modified' } }
  }
  if (res.status < 200 || res.status > 299) {
    await res.body?.cancel()
    const ct = res.headers.get('content-type')?.split(';')[0]?.trim()
    return {
      at,
      outcome: {
        kind: 'error',
        detail: `HTTP ${res.status}${ct ? ` (${ct})` : ''}`,
        retry_after_s: parseRetryAfter(res.headers.get('retry-after'), at),
      },
    }
  }

  let buf: ArrayBuffer
  try {
    buf = await res.arrayBuffer()
  } catch (e) {
    return { at: deps.now(), outcome: { kind: 'error', detail: `body read failed: ${message(e)}`, retry_after_s: null } }
  }
  // A cache-busted request may see its own stamp echoed in the body: hash the body without it (cacheBustToken).
  const token = ep.cacheBust ? cacheBustToken(url) : null
  const text = token ? new TextDecoder().decode(buf) : null
  const hashed = text !== null && token ? new TextEncoder().encode(text.split(token).join('')) : buf
  const body_hash = bodyKey(hex(await crypto.subtle.digest('SHA-256', hashed)), deps.codeVersion)
  const resHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    resHeaders[k.toLowerCase()] = v
  })
  const etag = resHeaders['etag'] ?? null
  const last_modified = resHeaders['last-modified'] ?? null
  if (state?.body_hash != null && state.body_hash === body_hash) {
    // The same body this code already accepted: not parsed, but its current validators replace the stored ones.
    return {
      at,
      outcome: {
        kind: 'not_modified',
        detail: 'body unchanged since the last accepted payload (sha-256)',
        validators: { etag, last_modified, body_hash },
      },
    }
  }
  const fetched: FetchedResponse = {
    url,
    status: res.status,
    headers: resHeaders,
    body: text ?? new TextDecoder().decode(buf),
    fetchedAt: iso(at),
  }
  let output: AdapterOutput
  try {
    output = def.parse(ep.id, fetched)
  } catch (e) {
    return { at, outcome: { kind: 'drift', detail: `parser threw: ${message(e)}` } }
  }
  if (!output || typeof output !== 'object' || !Array.isArray(output.events) || !output.health) {
    return { at, outcome: { kind: 'drift', detail: 'adapter returned no events array or no health signal' } }
  }
  return {
    at,
    outcome: { kind: 'parsed', output, etag, last_modified, body_hash },
  }
}

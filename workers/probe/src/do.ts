// The probe's one SQLite Durable Object (all state lives here): the cron run (source probe + experiment setup), the
// alarm experiments (jitter, then CPU levels), CPU bookkeeping for the fetch and scheduled invocations, and /results.
//
// SAFETY: cron() counts the run in SQLite BEFORE any request is sent (a crashed run still counts); once MAX_CRON_RUNS
// runs have begun it sends nothing more and arms no alarm, and alarm() does nothing but log "stopped".
import { DurableObject } from 'cloudflare:workers'
import { busy, CALIBRATION, CPU_LEVELS_MS, iterationsFor } from './busy.js'
import {
  CPU_GAP_MS, CPU_REPS, CRON, DEFER_MS, JITTER_ALARMS, JITTER_GAP_MS, MAX_CRON_RUNS, PROBE_IN_FLIGHT_MAX_MS, PROBE_NAME, STALE_TASK_MS,
} from './config.js'
import {
  BACKOFF_BASE_MS, BACKOFF_MAX_MS, describeError, HOST_GAP_MS, probeTargets, TIMEOUT_MS, USER_AGENT, type HostBackoff, type ProbeDeps, type RequestRow,
} from './probe.js'
import {
  cpuVerdicts, sourcesMd, summarizeCpu, summarizeEndpoint, summarizeJitter, type AlarmRow, type CpuRow, type EndpointSummary,
} from './results.js'
import { GROUPS, REQUEST_CAP_PER_RUN, SKIPPED, TARGETS, targetsForRun } from './targets.js'

export interface Deps extends ProbeDeps {
  busy: (iterations: number) => number
}

export const realDeps: Deps = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  busy,
}

export interface CronResult {
  run: number
  stopped: boolean
  group?: number
  requests?: number
  note?: string
}

export type TaskRow = {
  id: number
  kind: string // jitter | cpu
  level_ms: number | null
  rep: number | null
  iterations: number | null
  state: string // pending | armed | started | done | killed | lost
  planned_ms: number | null
  started_ms: number | null
  finished_ms: number | null
}

type ProbeRunRow = { run: number; grp: number; started_at: string; done_at: string | null; requests: number | null; note: string | null }

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS probe_runs (run INTEGER PRIMARY KEY, grp INTEGER NOT NULL, started_at TEXT NOT NULL, done_at TEXT, requests INTEGER, note TEXT)',
  'CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY AUTOINCREMENT, run INTEGER NOT NULL, source_id TEXT NOT NULL, endpoint_id TEXT NOT NULL, kind TEXT NOT NULL, status INTEGER, row TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, level_ms INTEGER, rep INTEGER, iterations INTEGER, state TEXT NOT NULL, planned_ms INTEGER, started_ms INTEGER, finished_ms INTEGER)',
  'CREATE TABLE IF NOT EXISTS alarm_log (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, task_kind TEXT, planned_ms INTEGER, entered_ms INTEGER NOT NULL, delta_ms INTEGER, is_retry INTEGER NOT NULL, retry_count INTEGER NOT NULL, info_scheduled_ms INTEGER, action TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS host_backoff (host TEXT PRIMARY KEY, until_ms INTEGER NOT NULL, status INTEGER NOT NULL, retry_after TEXT, strikes INTEGER NOT NULL, set_at_ms INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS cpu_log (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT NOT NULL, level_ms INTEGER NOT NULL, iterations INTEGER NOT NULL, phase TEXT NOT NULL, at TEXT NOT NULL, started_id INTEGER, retry_count INTEGER, checksum INTEGER, detail TEXT)',
]

const iso = (ms: number) => new Date(ms).toISOString()

const HOW_TO_READ = [
  'sources[]: one entry per probed URL. cf_reachable counts plain GETs that returned 2xx AND the expected document: its format, its XML root element, its page marker (a 200 block or error page does not count). sources_md holds paste-ready text for the docs/SOURCES.md columns; GET /results/sources.md prints the whole table.',
  'base: n plain GETs sent; not_sent = skipped while the host asked to wait; errors = no_answer (no HTTP answer) + body_errors (the body failed to read after the headers); shape_failures says why 2xx answers were not the expected document (wrong XML root, no page marker, wrong format).',
  'if_none_match / if_modified_since: conditional GETs sent only when the plain GET was usable (2xx, expected document) and returned that validator; got_304 / sent says whether the source honours it.',
  'host_backoff: hosts that answered 429/503 and when they will be asked again (Retry-After as sent; without one 30 min, doubling while it repeats). It outlives the run.',
  'cpu.levels[]: per invocation kind (alarm = Durable Object alarm, fetch = a fetch invocation through the loopback entrypoint, scheduled = the cron invocation) and target level (ms of the dev PC CPU under workerd, where the loop was calibrated; calibration in config. A cold first call burns ~2 ms more than its target). started_without_done > 0 means runs were cut off mid-work: the CPU limit binds at that level. cpu.verdicts says it in words.',
  'alarms: delta_ms = Date.now() at alarm entry minus the time passed to setAlarm. jitter_alarms covers the 30 dedicated alarms 60 s apart; retries_seen counts runtime alarm retries (isRetry).',
  'Cross-check: Workers Observability (dashboard -> ced-probe -> Observability) logs each invocation\'s real cpuTime and outcome (e.g. exceededCpu); the console lines {"probe":"cpu",...} mark each level.',
]

export class ProbeDO extends DurableObject<Env> {
  /** Replaced in tests (runInDurableObject) with a fake fetch, clock, sleep and busy loop. */
  deps: Deps = realDeps
  private readonly sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    for (const s of SCHEMA) this.sql.exec(s)
  }

  // ---- small SQL helpers
  private meta(key: string): string | null {
    const r = this.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]
    return r ? r.value : null
  }
  private metaInt(key: string): number {
    const v = this.meta(key)
    return v === null ? 0 : Number(v)
  }
  private setMeta(key: string, value: string): void {
    this.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }
  private deleteMeta(key: string): void {
    this.sql.exec('DELETE FROM meta WHERE key = ?', key)
  }
  private isStopped(): boolean {
    return this.metaInt('cron_runs') >= MAX_CRON_RUNS
  }
  private probeInFlight(now: number): boolean {
    const since = this.metaInt('probe_in_flight_since')
    return since > 0 && now - since < PROBE_IN_FLIGHT_MAX_MS
  }
  private activeTask(): TaskRow | null {
    return this.sql.exec<TaskRow>("SELECT * FROM tasks WHERE state IN ('armed', 'started') ORDER BY id LIMIT 1").toArray()[0] ?? null
  }
  private insertCpu(
    kind: string, ref: string, level: number, iterations: number, phase: string,
    startedId: number | null, retryCount: number | null, checksum: number | null, detail: string | null,
  ): number {
    const at = iso(this.deps.now())
    console.log(JSON.stringify({ probe: 'cpu', kind, ref, level_ms: level, iterations, phase }))
    return this.sql
      .exec<{ id: number }>(
        'INSERT INTO cpu_log (kind, ref, level_ms, iterations, phase, at, started_id, retry_count, checksum, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        kind, ref, level, iterations, phase, at, startedId, retryCount, checksum, detail,
      )
      .one().id
  }
  private logAlarm(t: TaskRow | null, entered: number, isRetry: number, retryCount: number, infoScheduled: number | null, action: string): void {
    const planned = t?.planned_ms ?? null
    this.sql.exec(
      'INSERT INTO alarm_log (task_id, task_kind, planned_ms, entered_ms, delta_ms, is_retry, retry_count, info_scheduled_ms, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      t?.id ?? null, t?.kind ?? null, planned, entered, planned === null ? null : entered - planned, isRetry, retryCount, infoScheduled, action,
    )
  }

  // ---- experiments bookkeeping
  private createTasks(now: number): void {
    for (let i = 1; i <= JITTER_ALARMS; i++) this.sql.exec("INSERT INTO tasks (kind, rep, state) VALUES ('jitter', ?, 'pending')", i)
    for (let rep = 1; rep <= CPU_REPS; rep++) {
      for (const level of CPU_LEVELS_MS) {
        this.sql.exec("INSERT INTO tasks (kind, level_ms, rep, iterations, state) VALUES ('cpu', ?, ?, ?, 'pending')", level, rep, iterationsFor(level))
      }
    }
    this.setMeta('experiments_created_at', iso(now))
  }

  private experimentsOpen(): boolean {
    return !this.isStopped() && this.meta('experiments_created_at') !== null && this.meta('experiments_done_at') === null
  }

  private async armNext(): Promise<void> {
    if (this.isStopped()) return
    const next = this.sql.exec<TaskRow>("SELECT * FROM tasks WHERE state = 'pending' ORDER BY id LIMIT 1").toArray()[0]
    const now = this.deps.now()
    if (!next) {
      if (this.meta('experiments_done_at') === null) this.setMeta('experiments_done_at', iso(now))
      return
    }
    const planned = now + (next.kind === 'jitter' ? JITTER_GAP_MS : CPU_GAP_MS)
    this.sql.exec("UPDATE tasks SET state = 'armed', planned_ms = ? WHERE id = ?", planned, next.id)
    await this.ctx.storage.setAlarm(planned)
  }

  /** Arm the next task if the chain has no alarm and no task in progress (first run, or after the supervisor). */
  private async ensureAlarm(): Promise<void> {
    if (!this.experimentsOpen()) return
    if ((await this.ctx.storage.getAlarm()) !== null) return
    if (this.activeTask()) return
    await this.armNext()
  }

  /** Cron-side watchdog: a task that never finished and has no alarm pending is recorded and the chain moves on. */
  private async supervise(now: number): Promise<void> {
    if (!this.experimentsOpen()) return
    if ((await this.ctx.storage.getAlarm()) !== null) return
    const t = this.activeTask()
    if (!t) return
    const since = (t.state === 'started' ? t.started_ms : t.planned_ms) ?? 0
    if (now - since < STALE_TASK_MS) return
    if (t.state === 'started') {
      this.sql.exec("UPDATE tasks SET state = 'killed', finished_ms = ? WHERE id = ?", now, t.id)
      this.insertCpu('alarm', `task:${t.id}`, t.level_ms ?? 0, t.iterations ?? 0, 'no_retry', null, null, null,
        `started ${iso(since)} and never wrote done; no alarm pending and no retry within ${STALE_TASK_MS / 60_000} min (found by the cron supervisor)`)
    } else {
      this.sql.exec("UPDATE tasks SET state = 'lost', finished_ms = ? WHERE id = ?", now, t.id)
    }
    await this.armNext()
  }

  // ---- RPC: the cron run
  async cron(): Promise<CronResult> {
    const now = this.deps.now()
    const runs = this.metaInt('cron_runs')
    if (runs >= MAX_CRON_RUNS) {
      if (this.meta('stopped_at') === null) this.setMeta('stopped_at', iso(now))
      return { run: runs, stopped: true }
    }
    // Count the run BEFORE any request is sent: a run that crashes still counts toward the hard stop (fail closed).
    const run = runs + 1
    this.setMeta('cron_runs', String(run))
    if (this.meta('first_run_at') === null) this.setMeta('first_run_at', iso(now))
    this.setMeta('last_run_at', iso(now))
    if (this.meta('experiments_created_at') === null) this.createTasks(now)
    await this.supervise(now)

    const group = (run - 1) % GROUPS
    if (this.probeInFlight(now)) {
      const note = 'skipped: the previous probe run is still in flight (one request in flight at a time)'
      this.sql.exec('INSERT INTO probe_runs (run, grp, started_at, done_at, requests, note) VALUES (?, ?, ?, ?, 0, ?)', run, group, iso(now), iso(now), note)
      await this.ensureAlarm()
      return { run, stopped: false, group, requests: 0, note }
    }
    this.sql.exec('INSERT INTO probe_runs (run, grp, started_at) VALUES (?, ?, ?)', run, group, iso(now))
    this.setMeta('probe_in_flight_since', String(now))
    let requests = 0
    let note: string | null = null
    try {
      // The per-host back-off (429/503, Retry-After) lives in SQLite so it outlives this run (review R3).
      const backoff = new Map(this.sql.exec<HostBackoff>('SELECT * FROM host_backoff').toArray().map((b) => [b.host, b] as const))
      const r = await probeTargets(targetsForRun(run), run, this.deps, {
        cap: REQUEST_CAP_PER_RUN,
        backoff,
        onBackoff: (host, state) => {
          if (state === null) this.sql.exec('DELETE FROM host_backoff WHERE host = ?', host)
          else {
            this.sql.exec(
              'INSERT INTO host_backoff (host, until_ms, status, retry_after, strikes, set_at_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(host) DO UPDATE SET until_ms = excluded.until_ms, status = excluded.status, retry_after = excluded.retry_after, strikes = excluded.strikes, set_at_ms = excluded.set_at_ms',
              host, state.until_ms, state.status, state.retry_after, state.strikes, state.set_at_ms,
            )
          }
        },
        onRow: (row) => {
          this.sql.exec(
            'INSERT INTO requests (run, source_id, endpoint_id, kind, status, row) VALUES (?, ?, ?, ?, ?, ?)',
            row.run, row.source_id, row.endpoint_id, row.kind, row.status, JSON.stringify(row),
          )
        },
      })
      requests = r.requests
      if (r.capped) note = `request cap ${REQUEST_CAP_PER_RUN} reached`
    } catch (e) {
      note = `probe error: ${describeError(e)}`
    } finally {
      this.deleteMeta('probe_in_flight_since')
    }
    this.sql.exec('UPDATE probe_runs SET done_at = ?, requests = ?, note = ? WHERE run = ?', iso(this.deps.now()), requests, note, run)
    await this.ensureAlarm()
    return note === null ? { run, stopped: false, group, requests } : { run, stopped: false, group, requests, note }
  }

  // ---- RPC: CPU bookkeeping for the fetch and scheduled invocations (the alarm kind is handled in alarm())
  async cpuStarted(kind: 'fetch' | 'scheduled', ref: string, level: number, iterations: number): Promise<number> {
    // The RPC answer is held until this write is durable (output gate), so the caller's busy work starts after it.
    return this.insertCpu(kind, ref, level, iterations, 'started', null, null, null, null)
  }

  async cpuDone(startedId: number, checksum: number): Promise<void> {
    const s = this.sql.exec<CpuRow>('SELECT * FROM cpu_log WHERE id = ?', startedId).toArray()[0]
    if (!s) return
    this.insertCpu(s.kind, s.ref, s.level_ms, s.iterations, 'done', startedId, null, checksum, null)
  }

  async cpuNote(kind: 'fetch' | 'scheduled', ref: string, level: number, iterations: number, phase: string, detail: string): Promise<void> {
    this.insertCpu(kind, ref, level, iterations, phase, null, null, null, detail.slice(0, 300))
  }

  // ---- the alarm: jitter tasks record timing only; cpu tasks write "started", make it durable, work, write "done"
  override async alarm(info?: AlarmInvocationInfo): Promise<void> {
    const entered = this.deps.now()
    const isRetry = info?.isRetry ? 1 : 0
    const retryCount = info?.retryCount ?? 0
    const infoScheduled = info?.scheduledTime ?? null
    if (this.isStopped()) {
      this.logAlarm(null, entered, isRetry, retryCount, infoScheduled, 'stopped')
      return
    }
    const t = this.activeTask()
    if (!t) {
      this.logAlarm(null, entered, isRetry, retryCount, infoScheduled, 'no_task')
      return
    }
    if (t.kind === 'jitter') {
      this.logAlarm(t, entered, isRetry, retryCount, infoScheduled, 'jitter')
      this.sql.exec("UPDATE tasks SET state = 'done', started_ms = ?, finished_ms = ? WHERE id = ?", entered, entered, t.id)
      await this.armNext()
      return
    }
    const level = t.level_ms ?? 0
    const iterations = t.iterations ?? 0
    if (t.state === 'started') {
      // An earlier attempt wrote "started" and never "done": it was cut off. Record it; do not repeat the work
      // (a level that is always killed would otherwise burn every retry and stall the chain).
      this.logAlarm(t, entered, isRetry, retryCount, infoScheduled, 'cpu_after_cutoff')
      this.insertCpu('alarm', `task:${t.id}`, level, iterations, 'retry', null, retryCount, null,
        `attempt started ${t.started_ms === null ? '?' : iso(t.started_ms)} never wrote done; this alarm is ${isRetry ? `runtime retry #${retryCount}` : 'not flagged as a retry'}; work not repeated`)
      this.sql.exec("UPDATE tasks SET state = 'killed', finished_ms = ? WHERE id = ?", entered, t.id)
      await this.armNext()
      return
    }
    if (this.probeInFlight(entered)) {
      this.logAlarm(t, entered, isRetry, retryCount, infoScheduled, 'deferred_probe_in_flight')
      const planned = entered + DEFER_MS
      this.sql.exec('UPDATE tasks SET planned_ms = ? WHERE id = ?', planned, t.id)
      await this.ctx.storage.setAlarm(planned)
      return
    }
    this.logAlarm(t, entered, isRetry, retryCount, infoScheduled, 'cpu')
    this.sql.exec("UPDATE tasks SET state = 'started', started_ms = ? WHERE id = ?", entered, t.id)
    const startedId = this.insertCpu('alarm', `task:${t.id}`, level, iterations, 'started', null, retryCount, null, null)
    // Make "started" durable BEFORE the work: writes are otherwise committed together at the end, and a run killed
    // mid-loop would roll back its own "started" row and leave no trace.
    await this.ctx.storage.sync()
    const checksum = this.deps.busy(iterations)
    this.insertCpu('alarm', `task:${t.id}`, level, iterations, 'done', startedId, retryCount, checksum, null)
    this.sql.exec("UPDATE tasks SET state = 'done', finished_ms = ? WHERE id = ?", this.deps.now(), t.id)
    await this.armNext()
  }

  // ---- RPC: read side
  async status(): Promise<{ cron_runs: number; max_cron_runs: number; stopped: boolean }> {
    const runs = this.metaInt('cron_runs')
    return { cron_runs: runs, max_cron_runs: MAX_CRON_RUNS, stopped: runs >= MAX_CRON_RUNS }
  }

  private sourceSummaries(): { requests: RequestRow[]; span: string; sources: EndpointSummary[] } {
    const requests = this.sql.exec<{ row: string }>('SELECT row FROM requests ORDER BY id').toArray().map((r) => JSON.parse(r.row) as RequestRow)
    const first = this.meta('first_run_at')
    const last = this.meta('last_run_at')
    const span = first === null ? 'not run yet' : `${first.slice(0, 10)}${last !== null && last.slice(0, 10) !== first.slice(0, 10) ? `..${last.slice(0, 10)}` : ''}`
    return { requests, span, sources: TARGETS.map((t) => summarizeEndpoint(t, requests, span)) }
  }

  /** GET /results/sources.md: the paste-ready docs/SOURCES.md probe table. */
  async sourcesMarkdown(): Promise<string> {
    const { span, sources } = this.sourceSummaries()
    return sourcesMd(TARGETS, sources, SKIPPED, { generated_at: iso(this.deps.now()), runs: this.metaInt('cron_runs'), span })
  }

  results(includeRows: boolean): Record<string, unknown> {
    const now = this.deps.now()
    const { requests, sources } = this.sourceSummaries()
    const cpuRows = this.sql.exec<CpuRow>('SELECT * FROM cpu_log ORDER BY id').toArray()
    const alarmRows = this.sql.exec<AlarmRow>('SELECT * FROM alarm_log ORDER BY id').toArray()
    const tasks = this.sql.exec<TaskRow>('SELECT * FROM tasks ORDER BY id').toArray()
    const probeRuns = this.sql.exec<ProbeRunRow>('SELECT * FROM probe_runs ORDER BY run').toArray()
    const runs = this.metaInt('cron_runs')
    const first = this.meta('first_run_at')
    const last = this.meta('last_run_at')
    const levels = summarizeCpu(cpuRows, now)
    return {
      probe: 'ced-probe',
      generated_at: iso(now),
      how_to_read: HOW_TO_READ,
      config: {
        max_cron_runs: MAX_CRON_RUNS, cron: CRON, groups: GROUPS, request_cap_per_run: REQUEST_CAP_PER_RUN,
        user_agent: USER_AGENT, timeout_ms: TIMEOUT_MS, host_gap_ms: HOST_GAP_MS, backoff_base_ms: BACKOFF_BASE_MS, backoff_max_ms: BACKOFF_MAX_MS,
        cpu_levels_ms: CPU_LEVELS_MS, cpu_reps: CPU_REPS, cpu_gap_ms: CPU_GAP_MS, jitter_alarms: JITTER_ALARMS, jitter_gap_ms: JITTER_GAP_MS,
        calibration: CALIBRATION,
      },
      cron: { runs, max_runs: MAX_CRON_RUNS, stopped: runs >= MAX_CRON_RUNS, stopped_at: this.meta('stopped_at'), first_run_at: first, last_run_at: last },
      skipped: SKIPPED,
      sources,
      host_backoff: this.sql.exec<HostBackoff>('SELECT * FROM host_backoff ORDER BY host').toArray(),
      probe_runs: probeRuns,
      cpu: { verdicts: cpuVerdicts(levels), levels, ...(includeRows ? { rows: cpuRows } : {}) },
      alarms: {
        ...summarizeJitter(alarmRows),
        experiments_created_at: this.meta('experiments_created_at'),
        experiments_done_at: this.meta('experiments_done_at'),
        tasks,
        ...(includeRows ? { rows: alarmRows } : {}),
      },
      request_count: requests.length,
      ...(includeRows ? { requests } : {}),
    }
  }

  async resultsJson(includeRows: boolean): Promise<string> {
    // Built and serialized here, so the public fetch invocation only forwards a string.
    return JSON.stringify(this.results(includeRows))
  }
}

export function probeStub(env: Env): DurableObjectStub<ProbeDO> {
  return env.PROBE.getByName(PROBE_NAME)
}

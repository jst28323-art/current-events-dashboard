// The Durable Object and the handlers, inside workerd with an injected fetch (no network): result rows, the 48-run hard
// stop, alarm bookkeeping (started before done, cut-off runs, retries, the cron supervisor), the cron wiring and the
// HTTP routes. The test runtime has no CPU limit, so a "kill" is simulated by a busy loop that throws mid-work.
import { describe, expect, test } from 'vitest'
import { env, exports } from 'cloudflare:workers'
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { CPU_LEVELS_MS, iterationsFor } from '../src/busy.js'
import { CPU_REPS, JITTER_ALARMS, MAX_CRON_RUNS, STALE_TASK_MS } from '../src/config.js'
import { probeStub, type Deps, type ProbeDO, type TaskRow } from '../src/do.js'
import type { HostBackoff, RequestRow } from '../src/probe.js'
import type { AlarmRow, CpuLevelSummary, CpuRow, EndpointSummary, JitterSummary } from '../src/results.js'
import { SKIPPED, TARGETS, targetsForRun } from '../src/targets.js'
import { fakeClock, fakeServer, routesFor } from './fakes.js'

type Results = {
  requests: RequestRow[]
  request_count: number
  sources: EndpointSummary[]
  skipped: unknown
  probe_runs: Array<{ run: number; grp: number; done_at: string | null; requests: number | null; note: string | null }>
  cron: { runs: number; max_runs: number; stopped: boolean; stopped_at: string | null }
  config: { max_cron_runs: number }
  cpu: { verdicts: Record<string, string>; levels: CpuLevelSummary[]; rows: CpuRow[] }
  alarms: { rows: AlarmRow[]; tasks: TaskRow[]; jitter_alarms: JitterSummary; retries_seen: number; experiments_done_at: string | null }
  host_backoff: HostBackoff[]
}

type Stub = DurableObjectStub<ProbeDO>
const stubFor = (name: string): Stub => env.PROBE.getByName(name)
const install = (stub: Stub, deps: Partial<Deps>) =>
  runInDurableObject(stub, (inst: ProbeDO) => {
    inst.deps = { ...inst.deps, ...deps }
  })
const results = (stub: Stub) => runInDurableObject(stub, (inst: ProbeDO) => inst.results(true) as unknown as Results)
const getAlarm = (stub: Stub) => runInDurableObject(stub, (_inst: ProbeDO, state) => state.storage.getAlarm())
const TOTAL_TASKS = JITTER_ALARMS + CPU_LEVELS_MS.length * CPU_REPS

describe('cron run', () => {
  test('stores one row per request, a probe_runs row, and arms the first experiment alarm', async () => {
    const stub = stubFor('t-cron')
    // Each target answers a body that passes its check (format, XML root, page marker), with an ETag it honours.
    const server = fakeServer(routesFor(TARGETS, { headers: { etag: '"e1"' }, honourInm: true }), null)
    const clock = fakeClock()
    await install(stub, { fetch: server.fetch, now: clock.now, sleep: clock.sleep })
    const r = await stub.cron()
    const group = targetsForRun(1)
    expect(r).toEqual({ run: 1, stopped: false, group: 0, requests: group.length * 2 })
    expect(server.calls).toHaveLength(group.length * 2)

    const res = await results(stub)
    expect(res.requests).toHaveLength(group.length * 2)
    for (const row of res.requests) {
      expect(row).toMatchObject({ run: 1, sent: true, error: null })
      expect(['base', 'if-none-match']).toContain(row.kind)
      expect(typeof row.wall_ms).toBe('number')
      expect(row.status).toBe(row.kind === 'base' ? 200 : 304)
    }
    expect(res.sources).toHaveLength(TARGETS.length)
    const probed = res.sources.filter((s) => s.base.n > 0)
    expect(probed.map((s) => s.url).sort()).toEqual(group.map((t) => t.url).sort())
    for (const s of probed) expect(s.if_none_match).toEqual({ sent: 1, got_304: 1, got_200: 0 })
    for (const s of res.sources.filter((x) => x.base.n === 0)) expect(s.cf_reachable).toBe('not probed yet')
    expect(res.probe_runs).toHaveLength(1)
    expect(res.probe_runs[0]).toMatchObject({ run: 1, grp: 0, requests: group.length * 2, note: null })
    expect(res.probe_runs[0]!.done_at).not.toBeNull()
    expect(res.skipped).toEqual(SKIPPED)
    expect(res.alarms.tasks).toHaveLength(TOTAL_TASKS)
    expect(res.alarms.tasks[0]).toMatchObject({ kind: 'jitter', state: 'armed' })
    expect(await getAlarm(stub)).toBe(res.alarms.tasks[0]!.planned_ms)
  })

  test('hard stop: after 48 cron runs it sends nothing, arms nothing and only serves results', async () => {
    const stub = stubFor('t-stop')
    const server = fakeServer({}, { status: 200, body: '{}' })
    const clock = fakeClock()
    await install(stub, { fetch: server.fetch, now: clock.now, sleep: clock.sleep })
    for (let i = 1; i <= MAX_CRON_RUNS; i++) {
      expect(await stub.cron()).toMatchObject({ run: i, stopped: false })
      clock.advance(30 * 60_000)
    }
    // 48 runs over 3 groups: every target 16 times, one request each (no validators offered).
    expect(server.calls).toHaveLength((MAX_CRON_RUNS / 3) * TARGETS.length)
    const sent = server.calls.length
    expect(await stub.cron()).toEqual({ run: MAX_CRON_RUNS, stopped: true })
    expect(await stub.cron()).toEqual({ run: MAX_CRON_RUNS, stopped: true })
    expect(server.calls).toHaveLength(sent)
    // The alarm armed on run 1 still fires once: it records "stopped" and arms nothing.
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    expect(await getAlarm(stub)).toBeNull()
    const res = await results(stub)
    expect(res.cron).toMatchObject({ runs: MAX_CRON_RUNS, max_runs: 48, stopped: true })
    expect(res.cron.stopped_at).not.toBeNull()
    expect(res.probe_runs).toHaveLength(MAX_CRON_RUNS)
    expect(res.alarms.rows.at(-1)).toMatchObject({ action: 'stopped' })
    expect(res.cpu.rows).toHaveLength(0)
  }, 60_000) // 48 runs x ~10 fake requests, each persisted before the next

  // Review R3 (2026-10-02): the back-off lived only inside one run, so a host that asked for 2 h was asked again 30 min
  // later (its URLs sit in several groups). It is now stored in the Durable Object.
  test('a host that answered 429 with Retry-After: 6000 is not asked again for 100 min, whichever group its URLs are in', async () => {
    const stub = stubFor('t-backoff')
    const SENATE = 'www.senate.gov'
    const senate = TARGETS.filter((t) => new URL(t.url).host === SENATE)
    expect(new Set(senate.map((t) => TARGETS.indexOf(t) % 3)).size, 'the host spans all three groups').toBe(3)
    const server = fakeServer(
      { ...routesFor(TARGETS), ...Object.fromEntries(senate.map((t) => [t.url, { status: 429, body: 'slow down', headers: { 'retry-after': '6000' } }])) },
      null,
    )
    const clock = fakeClock()
    await install(stub, { fetch: server.fetch, now: clock.now, sleep: clock.sleep })
    const senateCalls = () => server.calls.filter((c) => new URL(c.url).host === SENATE).length
    // Cron ticks at fixed times, as in production (a run's own fake time must not push the next tick later).
    const t0 = clock.peek()
    const tick = (run: number) => clock.advance(Math.max(0, t0 + (run - 1) * 30 * 60_000 - clock.peek()))

    await stub.cron() // run 1 (group 0): one senate.gov URL, answered 429
    expect(senateCalls()).toBe(1)
    for (let run = 2; run <= 4; run++) {
      tick(run) // runs 2-4: 30, 60 and 90 min after run 1, all inside the 100 min asked for
      expect(await stub.cron()).toMatchObject({ run, stopped: false })
    }
    expect(senateCalls()).toBe(1)
    const res = await results(stub)
    expect(res.host_backoff).toEqual([expect.objectContaining({ host: SENATE, status: 429, retry_after: '6000', strikes: 1 })])
    const notSent = res.requests.filter((r) => !r.sent && new URL(r.url).host === SENATE)
    expect(notSent.length).toBe(senate.length) // every other senate.gov URL came up once in runs 2-4
    for (const r of notSent) expect(r.error).toMatch(/^not sent: www\.senate\.gov answered 429 .*Retry-After "6000"/)
    expect(res.sources.find((x) => x.endpoint_id === 'floor_schedule')!.sources_md.cf_reachable).toBe('not probed yet (1 not sent while the host asked to wait)')
    // Every other host was still probed on schedule.
    const others = [1, 2, 3, 4].reduce((n, run) => n + targetsForRun(run).filter((t) => new URL(t.url).host !== SENATE).length, 0)
    expect(server.calls.length).toBe(others + 1)

    tick(5) // run 5: 120 min after run 1, past the 100 min
    await stub.cron()
    expect(senateCalls()).toBeGreaterThan(1)
  })
})

describe('alarm experiments', () => {
  test('30 jitter alarms, then every CPU level with "started" written before "done"', async () => {
    const stub = stubFor('t-chain')
    const clock = fakeClock()
    const busyCalls: number[] = []
    await install(stub, {
      fetch: fakeServer({}).fetch, now: clock.now, sleep: clock.sleep,
      busy: (n) => {
        busyCalls.push(n)
        return n % 97
      },
    })
    await stub.cron()
    let alarms = 0
    while (await runDurableObjectAlarm(stub)) {
      if (++alarms > 3 * TOTAL_TASKS) throw new Error('the alarm chain does not end')
    }
    expect(alarms).toBe(TOTAL_TASKS)
    const res = await results(stub)
    expect(res.alarms.rows.filter((r) => r.action === 'jitter')).toHaveLength(JITTER_ALARMS)
    expect(res.alarms.jitter_alarms.n).toBe(JITTER_ALARMS)
    for (const r of res.alarms.rows) expect(typeof r.delta_ms).toBe('number')
    const cpu = res.cpu.rows.filter((r) => r.kind === 'alarm')
    const started = cpu.filter((r) => r.phase === 'started')
    const done = cpu.filter((r) => r.phase === 'done')
    expect(started).toHaveLength(CPU_LEVELS_MS.length * CPU_REPS)
    expect(done).toHaveLength(CPU_LEVELS_MS.length * CPU_REPS)
    for (const d of done) {
      const s = started.find((x) => x.id === d.started_id)
      expect(s, `done row ${d.id} pairs with a started row`).toBeDefined()
      expect(s!.id).toBeLessThan(d.id)
      expect(d.checksum).toBe(s!.iterations % 97)
    }
    const expectedIterations = res.alarms.tasks.filter((t) => t.kind === 'cpu').map((t) => t.iterations)
    expect(busyCalls).toEqual(expectedIterations)
    expect(expectedIterations.slice(0, CPU_LEVELS_MS.length)).toEqual(CPU_LEVELS_MS.map((l) => iterationsFor(l)))
    expect(res.alarms.tasks.every((t) => t.state === 'done')).toBe(true)
    expect(res.alarms.experiments_done_at).not.toBeNull()
    expect(res.cpu.verdicts['alarm']).toMatch(/^none cut off; highest level completed: 120 ms/)
    expect(await getAlarm(stub)).toBeNull()
  })

  test('a run cut off mid-work leaves started-without-done; the runtime retry is recorded and the chain moves on', async () => {
    const stub = stubFor('t-kill')
    const clock = fakeClock()
    const killAt = iterationsFor(60)
    const fakes: Partial<Deps> = {
      fetch: fakeServer({}).fetch, now: clock.now, sleep: clock.sleep,
      busy: (n) => {
        if (n >= killAt) throw new Error('simulated CPU-limit kill')
        return 1
      },
    }
    await install(stub, fakes)
    await stub.cron()
    for (let i = 0; i < JITTER_ALARMS; i++) expect(await runDurableObjectAlarm(stub)).toBe(true)
    for (const _level of [0, 5, 15, 30]) expect(await runDurableObjectAlarm(stub)).toBe(true)
    await expect(runDurableObjectAlarm(stub)).rejects.toThrow(/simulated CPU-limit kill/)
    await install(stub, fakes) // a failed handler may reset the object (and its injected deps)
    clock.advance(5 * 60_000) // past the "still in flight" grace window

    let res = await results(stub)
    const task60 = res.alarms.tasks.find((t) => t.kind === 'cpu' && t.level_ms === 60 && t.rep === 1)!
    expect(task60.state).toBe('started')
    let lvl60 = res.cpu.levels.find((l) => l.kind === 'alarm' && l.level_ms === 60)!
    expect(lvl60).toMatchObject({ started: 1, done: 0, started_without_done: 1, retries_seen: 0 })

    // The runtime retries a failed alarm (isRetry, retryCount): it is recorded, the work is not repeated.
    await runInDurableObject(stub, (inst: ProbeDO) => inst.alarm({ isRetry: true, retryCount: 1, scheduledTime: clock.peek() }))
    res = await results(stub)
    expect(res.alarms.rows.at(-1)).toMatchObject({ task_id: task60.id, action: 'cpu_after_cutoff', is_retry: 1, retry_count: 1 })
    expect(res.alarms.retries_seen).toBe(1)
    expect(res.alarms.tasks.find((t) => t.id === task60.id)!.state).toBe('killed')
    lvl60 = res.cpu.levels.find((l) => l.kind === 'alarm' && l.level_ms === 60)!
    expect(lvl60).toMatchObject({ started: 1, done: 0, started_without_done: 1, retries_seen: 1 })
    expect(res.cpu.verdicts['alarm']).toBe('cut off at 60 ms target (1/1 runs); highest level completed at least once: 30 ms')
    expect(res.alarms.tasks.find((t) => t.kind === 'cpu' && t.level_ms === 120 && t.rep === 1)!.state).toBe('armed')
    expect(await getAlarm(stub)).not.toBeNull()
  })

  test('the cron supervisor records a cut-off run that got no retry, and re-arms the chain', async () => {
    const stub = stubFor('t-super')
    const clock = fakeClock()
    await install(stub, { fetch: fakeServer({}).fetch, now: clock.now, sleep: clock.sleep })
    await stub.cron()
    // As a kill without a retry would leave it: the first CPU task "started", no alarm pending.
    const firstCpu = await runInDurableObject(stub, async (_inst: ProbeDO, state) => {
      state.storage.sql.exec("UPDATE tasks SET state = 'done' WHERE kind = 'jitter'")
      const id = state.storage.sql.exec<{ id: number }>("SELECT id FROM tasks WHERE kind = 'cpu' ORDER BY id LIMIT 1").one().id
      state.storage.sql.exec("UPDATE tasks SET state = 'started', started_ms = ? WHERE id = ?", clock.peek(), id)
      await state.storage.deleteAlarm()
      return id
    })
    // Not stale yet: the supervisor leaves it alone.
    await stub.cron()
    let res = await results(stub)
    expect(res.alarms.tasks.find((t) => t.id === firstCpu)!.state).toBe('started')
    // Stale: recorded as no_retry, and the next task is armed.
    clock.advance(STALE_TASK_MS + 60_000)
    await stub.cron()
    res = await results(stub)
    expect(res.cpu.rows.find((r) => r.phase === 'no_retry')).toMatchObject({ kind: 'alarm', level_ms: 0, ref: `task:${firstCpu}` })
    expect(res.alarms.tasks.find((t) => t.id === firstCpu)!.state).toBe('killed')
    expect(res.alarms.tasks.find((t) => t.id === firstCpu + 1)!.state).toBe('armed')
    expect(await getAlarm(stub)).not.toBeNull()
  })
})

describe('handlers', () => {
  const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`https://ced-probe.example${path}`, init))

  test('GET / is an index; GET /results is JSON with the skipped list; other paths 404; writes 405', async () => {
    const idx = await call('/')
    expect(idx.status).toBe(200)
    expect(idx.headers.get('content-type')).toMatch(/application\/json/)
    expect(await idx.json()).toMatchObject({ name: 'ced-probe', status: { max_cron_runs: MAX_CRON_RUNS } })
    const full = await call('/results')
    expect(full.status).toBe(200)
    const body = (await full.json()) as Results
    expect(body.skipped).toEqual(SKIPPED)
    expect(body.sources).toHaveLength(TARGETS.length)
    expect(body.config.max_cron_runs).toBe(MAX_CRON_RUNS)
    expect(Array.isArray(body.requests)).toBe(true)
    const slim = (await (await call('/results?rows=0')).json()) as Partial<Results>
    expect('requests' in slim).toBe(false)
    expect(slim.cpu && 'rows' in slim.cpu).toBe(false)
    const md = await call('/results/sources.md')
    expect(md.status).toBe(200)
    expect(md.headers.get('content-type')).toMatch(/text\/markdown/)
    const text = await md.text()
    expect(text.split('\n').filter((l) => l.startsWith('| `'))).toHaveLength(TARGETS.length)
    for (const s of SKIPPED) expect(text).toContain(`\`${s.source_id}\``)
    expect((await call('/nope')).status).toBe(404)
    expect((await call('/results', { method: 'POST' })).status).toBe(405)
  })

  test('the cron handler runs the probe, then this run\'s fetch and scheduled CPU levels', async () => {
    const stub = probeStub(env)
    const server = fakeServer({}, { status: 200, body: '{}' })
    const clock = fakeClock()
    await install(stub, { fetch: server.fetch, now: clock.now, sleep: clock.sleep })
    const before = (await stub.status()).cron_runs
    // The loopback binding runs the real scheduled() with a real ctx (incl. ctx.exports); its type omits scheduled().
    const loop = exports.default as unknown as { scheduled(o: { scheduledTime?: Date; cron?: string }): Promise<unknown> }
    await loop.scheduled({ scheduledTime: new Date(), cron: '*/30 * * * *' })
    const after = await stub.status()
    expect(after.cron_runs).toBe(before + 1)
    expect(server.calls.length).toBeGreaterThan(0)
    const res = await results(stub)
    const ref = `run:${after.cron_runs}`
    const level = CPU_LEVELS_MS[(after.cron_runs - 1) % CPU_LEVELS_MS.length]
    const mine = (kind: string) => res.cpu.rows.filter((r) => r.kind === kind && r.ref === ref)
    expect(mine('scheduled').map((r) => r.phase)).toEqual(['started', 'done'])
    expect(mine('fetch').map((r) => r.phase)).toEqual(['started', 'done', 'caller_ok'])
    for (const r of [...mine('scheduled'), ...mine('fetch')]) expect(r.level_ms).toBe(level)
  })
})

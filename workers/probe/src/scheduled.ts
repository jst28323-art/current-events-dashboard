// The cron tick and the fetch-invocation CPU entrypoint. Entry classes are re-exported by src/index.ts (the main
// module); everything else stays here, because workerd rejects plain values exported from the main module.
import { WorkerEntrypoint } from 'cloudflare:workers'
import { busy, CPU_LEVELS_MS, iterationsFor } from './busy.js'
import { probeStub, type CronResult, type ProbeDO } from './do.js'
import { describeError } from './probe.js'

/**
 * The fetch-invocation CPU level set. Not routable from the internet (only the default export is): the cron calls it
 * through the loopback binding ctx.exports.CpuFetchEntry, which starts a separate invocation with its own CPU budget.
 */
export class CpuFetchEntry extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const u = new URL(request.url)
    const level = Number(u.searchParams.get('level'))
    const ref = u.searchParams.get('ref') ?? ''
    if (!(CPU_LEVELS_MS as readonly number[]).includes(level) || !/^run:\d+$/.test(ref)) return new Response('bad request', { status: 400 })
    const stub = probeStub(this.env)
    const iterations = iterationsFor(level)
    const id = await stub.cpuStarted('fetch', ref, level, iterations)
    const checksum = busy(iterations)
    await stub.cpuDone(id, checksum)
    return new Response('ok')
  }
}

type Loopback = { fetch: (input: string) => Promise<Response> }

async function fetchLevel(ctx: ExecutionContext, stub: DurableObjectStub<ProbeDO>, ref: string, level: number): Promise<void> {
  const iterations = iterationsFor(level)
  const exportsMap = (ctx as { exports?: Record<string, unknown> }).exports
  const loop = exportsMap?.['CpuFetchEntry'] as Loopback | undefined
  if (!loop || typeof loop.fetch !== 'function') {
    await stub.cpuNote('fetch', ref, level, iterations, 'unavailable', 'ctx.exports.CpuFetchEntry is missing (loopback entrypoints not enabled)')
    return
  }
  try {
    const res = await loop.fetch(`https://ced-probe.internal/cpu?ref=${encodeURIComponent(ref)}&level=${level}`)
    await res.body?.cancel()
    await stub.cpuNote('fetch', ref, level, iterations, res.ok ? 'caller_ok' : 'caller_error', `HTTP ${res.status}`)
  } catch (e) {
    await stub.cpuNote('fetch', ref, level, iterations, 'caller_error', describeError(e))
  }
}

/** One cron tick: the source probe (in the Durable Object), then this run's fetch and scheduled CPU levels. */
export async function runScheduled(env: Env, ctx: ExecutionContext): Promise<CronResult | null> {
  const stub = probeStub(env)
  let r: CronResult
  try {
    r = await stub.cron()
  } catch (e) {
    console.log(JSON.stringify({ probe: 'cron', error: describeError(e) }))
    return null
  }
  if (r.stopped) return r
  const level = CPU_LEVELS_MS[(r.run - 1) % CPU_LEVELS_MS.length]!
  const ref = `run:${r.run}`
  await fetchLevel(ctx, stub, ref, level)
  // Last, because a CPU-limit kill ends this invocation.
  const iterations = iterationsFor(level)
  const id = await stub.cpuStarted('scheduled', ref, level, iterations)
  const checksum = busy(iterations)
  await stub.cpuDone(id, checksum)
  return r
}

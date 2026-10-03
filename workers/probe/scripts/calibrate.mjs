#!/usr/bin/env node
// Calibrates the probe's busy loop (workers/probe/src/busy.ts): how many iterations of busy() burn 1 ms of CPU on this
// machine IN WORKERD, the runtime that runs it in production. Node is measured too, as a cross-check: the loop is
// written so that both agree (review finding R1, 2026-10-02: an earlier loop ran ~2.6x slower in workerd than in Node, so
// a Node-only calibration overstated every level's real cost by ~2.6x).
//
// Run with Node >= 22.18 (type stripping): `node workers/probe/scripts/calibrate.mjs [--fresh]`.
//   default : warm medians of 7 calls at several sizes, in workerd and in Node; Node's cold first call.
//   --fresh : also one cold call per CPU level in 3 fresh workerd instances each, and one cold call in 3 fresh Node
//             processes per size (slow on this PC: every process start can take seconds, docs/TRAPS.md).
//
// workerd: the exact busy() function (its source after Node's type stripping) runs in plain Miniflare (the version
// wrangler bundles; v4 options wrapped in convertV4MiniflareOptions), no network. A workerd isolate cannot time itself
// in production, so the call is timed from Node around dispatchFetch, minus the median round trip of an n = 0 call.
// Node: wall clock (performance.now) of a single-threaded loop on an idle multi-core machine (CPU-bound, so wall ~= CPU);
// process.cpuUsage is printed as a cross-check (on Windows it ticks in ~15.6 ms steps, so the sizes are large).
// Paste the printed `paste` values into src/busy.ts (CALIBRATION).
import { busy, CPU_LEVELS_MS } from '../src/busy.ts'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'

const measure = (fn) => {
  const t0 = process.cpuUsage()
  const w0 = performance.now()
  fn()
  const wall = performance.now() - w0
  const d = process.cpuUsage(t0)
  return { cpu_ms: (d.user + d.system) / 1000, wall_ms: wall }
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const r2 = (x) => Math.round(x * 100) / 100

const argv = process.argv.slice(2)
if (argv[0] === '--one') {
  // Child mode: one cold call in a fresh Node process, print JSON.
  const n = Number(argv[1])
  console.log(JSON.stringify({ n, ...measure(() => busy(n)) }))
  process.exit(0)
}

const wranglerJsonc = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
const compatibilityDate = wranglerJsonc.match(/"compatibility_date"\s*:\s*"([^"]+)"/)?.[1]
if (!compatibilityDate) throw new Error('compatibility_date not found in wrangler.jsonc')
const workerScript = `${busy.toString()}
export default { async fetch(req) { const n = Number(new URL(req.url).searchParams.get('n')); return new Response(String(busy(n))) } }`

async function startWorkerd() {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'busy', modules: true, script: workerScript, compatibilityDate }] }))
  await mf.ready
  return mf
}
async function callMs(mf, n) {
  const t0 = performance.now()
  const res = await mf.dispatchFetch(`http://busy.local/?n=${n}`)
  const text = await res.text()
  return { ms: performance.now() - t0, checksum: Number(text) }
}
async function baseline(mf, k) {
  const xs = []
  for (let i = 0; i < k; i++) xs.push((await callMs(mf, 0)).ms)
  return median(xs)
}

const sizes = [100_000_000, 300_000_000, 1_000_000_000]
const out = {
  machine: cpus()[0]?.model?.trim(), logical_cpus: cpus().length, platform: process.platform, node: process.version, v8: process.versions.v8,
  compatibility_date: compatibilityDate,
  miniflare: (() => { try { return createRequire(import.meta.url)('miniflare/package.json').version } catch { return 'unknown' } })(),
  workerd: { warm: [], cold: [] },
  node_runtime: { cold_first_call: null, warm: [], fresh: [] },
}

// ---- Node
const cn = 100_000_000
const c = measure(() => busy(cn))
out.node_runtime.cold_first_call = { n: cn, wall_ms: r2(c.wall_ms), cpu_ms: r2(c.cpu_ms), iterations_per_wall_ms: Math.round(cn / c.wall_ms) }
for (let i = 0; i < 3; i++) busy(20_000_000) // warm-up
for (const n of sizes) {
  const runs = []
  for (let i = 0; i < 7; i++) runs.push(measure(() => busy(n)))
  const wm = median(runs.map((r) => r.wall_ms))
  const cm = median(runs.map((r) => r.cpu_ms))
  out.node_runtime.warm.push({
    n, median_wall_ms: r2(wm), min_wall_ms: r2(Math.min(...runs.map((r) => r.wall_ms))), max_wall_ms: r2(Math.max(...runs.map((r) => r.wall_ms))),
    median_cpu_ms: r2(cm), iterations_per_wall_ms: Math.round(n / wm), iterations_per_cpu_ms: cm > 0 ? Math.round(n / cm) : null,
  })
}

// ---- workerd, warm
{
  const mf = await startWorkerd()
  try {
    for (let i = 0; i < 3; i++) await callMs(mf, 20_000_000) // warm-up
    const base = await baseline(mf, 9)
    out.workerd.round_trip_ms = r2(base)
    for (const n of sizes) {
      const runs = []
      for (let i = 0; i < 7; i++) {
        runs.push((await callMs(mf, n)).ms - base)
      }
      const m = median(runs)
      out.workerd.warm.push({ n, median_ms: r2(m), min_ms: r2(Math.min(...runs)), max_ms: r2(Math.max(...runs)), iterations_per_ms: Math.round(n / m) })
    }
    const small = await callMs(mf, 1_000_000)
    if (small.checksum !== busy(1_000_000)) throw new Error(`workerd and Node disagree on busy(1e6): ${small.checksum} vs ${busy(1_000_000)}`)
  } finally {
    await mf.dispose()
  }
}

const workerdRate = Math.round(median(out.workerd.warm.map((w) => w.iterations_per_ms)) / 1000) * 1000
const nodeRate = Math.round(median(out.node_runtime.warm.map((w) => w.iterations_per_wall_ms)) / 1000) * 1000

// ---- cold calls (--fresh)
if (argv.includes('--fresh')) {
  for (const level of CPU_LEVELS_MS.filter((l) => l > 0)) {
    const n = Math.round(level * workerdRate)
    const rows = []
    for (let k = 0; k < 3; k++) {
      const mf = await startWorkerd()
      try {
        const base = await baseline(mf, 5)
        const r = await callMs(mf, n)
        rows.push(r2(r.ms - base))
      } finally {
        await mf.dispose()
      }
    }
    out.workerd.cold.push({ level_ms: level, n, busy_ms_est: rows })
  }
  const self = fileURLToPath(import.meta.url)
  for (const n of [10_000_000, 100_000_000]) {
    for (let i = 0; i < 3; i++) {
      const j = JSON.parse(execFileSync(process.execPath, [self, '--one', String(n)], { encoding: 'utf8' }))
      out.node_runtime.fresh.push({ n, wall_ms: r2(j.wall_ms), cpu_ms: r2(j.cpu_ms), iterations_per_wall_ms: Math.round(n / j.wall_ms) })
    }
  }
}

out.recommended_iterations_per_ms = workerdRate
out.node_iterations_per_ms = nodeRate
out.node_over_workerd = r2(nodeRate / workerdRate)
if (out.node_over_workerd < 0.9 || out.node_over_workerd > 1.1) {
  out.warning = 'Node and workerd disagree by more than 10%: the loop is runtime-sensitive again (see review finding R1); fix busy() first'
}
out.targets = CPU_LEVELS_MS.map((ms) => ({ target_ms: ms, iterations: Math.round(ms * workerdRate) }))
out.paste = {
  iterations_per_ms: workerdRate,
  measured_on: new Date().toISOString().slice(0, 10),
  machine: `${out.machine}, ${process.platform}`,
  node_cross_check: { iterations_per_ms: nodeRate, runtime: `Node ${process.version}, V8 ${process.versions.v8}` },
}
console.log(JSON.stringify(out, null, 2))

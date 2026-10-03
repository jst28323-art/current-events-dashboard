// Calibrated busy work for the CPU-limit experiments (ROADMAP P1.3).
//
// CPU time cannot be read inside a deployed Worker: Date.now() and performance.now() only advance on I/O, so a pure loop
// looks like 0 ms from the inside. The probe therefore burns a DETERMINISTIC number of loop iterations and converts
// iterations to milliseconds with a rate measured on the dev PC IN WORKERD, the runtime that executes it
// (`node workers/probe/scripts/calibrate.mjs`). Cloudflare's CPUs are not this PC: read every "target ms" as "ms of
// this PC's CPU under workerd". Workers Observability logs the real per-invocation cpuTime, which is the cross-check.
//
// The returned checksum is stored with the "done" row so the optimizer cannot drop the loop.

/**
 * xorshift32 steps, summed. Integer-valued, allocation-free, identical result in Node and workerd.
 *
 * The accumulator is a plain (exact) double on purpose. The first version wrapped it to int32 (`acc = (acc + v) | 0`),
 * and that loop ran ~2.6x SLOWER in workerd than in Node on the same PC (334k vs 863k iterations/ms, review finding R1,
 * 2026-10-02); the cause is unverified (workerd's pointer-compressed V8 has 31-bit small integers, Node's has 32-bit).
 * With an unwrapped accumulator the loop runs at the same speed in both (pinned by test/busy.test.ts). The sum stays an
 * exact integer: at most 65,535 per step, so below 2^53 for any n under 1.3e11.
 */
export function busy(iterations: number): number {
  let x = 0x9e3779b9 | 0
  let acc = 0
  for (let i = 0; i < iterations; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    acc += x & 0xffff
  }
  return acc
}

/**
 * Measured 2026-10-02 23:36Z by scripts/calibrate.mjs --fresh, in workerd. Warm medians: 885,820 it/ms (n=1e8),
 * 898,115 (n=3e8), 874,163 (n=1e9). A cold first call in a fresh workerd isolate burns ~2 ms more than its target
 * (compile + on-stack replacement): 5 ms target -> 7.2-7.5 ms, 15 -> 17.0-17.2, 30 -> 31.4-32.1, 60 -> 60.7-61.6,
 * 120 -> 118.9-121.4 (3 fresh isolates each). So the targets err slightly high, never low. Node agreed (ratio 0.99).
 */
export const CALIBRATION = {
  iterations_per_ms: 886_000,
  measured_on: '2026-10-02',
  machine: 'AMD Ryzen 9 9900X3D (dev PC), Windows 11',
  runtime: 'workerd 1.20261001.1 (Miniflare 5.20261001.0-alpha, compatibility date 2026-10-01)',
  method:
    'the exact busy() source run in plain workerd, timed from Node around dispatchFetch minus the median round trip of an ' +
    'n = 0 call (1.96 ms); median of 7 warm calls at n = 1e8, 3e8, 1e9, median across sizes; idle 24-thread PC',
  node_cross_check: { iterations_per_ms: 880_000, runtime: 'Node v26.3.0, V8 14.6.202.34 (warm wall-clock medians, same sizes)' },
} as const

/** The experiment's levels (target ms of this PC's CPU under workerd). 0 is the control: the bookkeeping alone. */
export const CPU_LEVELS_MS = [0, 5, 15, 30, 60, 120] as const

export function iterationsFor(levelMs: number): number {
  return Math.round(levelMs * CALIBRATION.iterations_per_ms)
}

// The CPU experiments convert loop iterations to milliseconds with a calibration (src/busy.ts). That is only valid if the
// loop runs at the same speed in the runtime that calibrated it and in the runtime that executes it. Review finding R1
// (2026-10-02): the first loop (xorshift32 with an int32-wrapped accumulator) ran ~2.6x slower in workerd than in Node
// on the same PC, so every "N ms" level really burned ~2.6N ms. This test runs the loop in workerd (here) and in Node
// (the NODE_BUSY binding from vitest.config.ts) on the same machine, interleaved, and compares the fastest samples
// (interference only ever adds time). It is a ratio, so it holds on any machine.
import { env } from 'cloudflare:workers'
import { expect, test } from 'vitest'
import { busy, CALIBRATION, CPU_LEVELS_MS, iterationsFor } from '../src/busy.js'

type NodeBusy = { fetch(input: string): Promise<Response> }

function nodeBinding(): NodeBusy {
  const b = (env as unknown as { NODE_BUSY?: NodeBusy }).NODE_BUSY
  if (!b) throw new Error('the NODE_BUSY test binding is missing (workers/probe/vitest.config.ts)')
  return b
}

test('busy() runs at the same speed in workerd as in Node on the same machine (the calibration holds in both)', async () => {
  const node = nodeBinding()
  const n = iterationsFor(30)
  const inNode = async (k: number) => (await (await node.fetch(`http://node-busy/?n=${k}`)).json()) as { ms: number; checksum: number }
  // Warm both up (the cold first call includes compilation in either runtime).
  for (let i = 0; i < 3; i++) {
    busy(n >> 2)
    await inNode(n >> 2)
  }
  const workerd: number[] = []
  const nodeMs: number[] = []
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    const c = busy(n)
    workerd.push(performance.now() - t0)
    const r = await inNode(n)
    nodeMs.push(r.ms)
    expect(r.checksum, 'same loop, same result in both runtimes').toBe(c)
  }
  const ratio = Math.min(...workerd) / Math.min(...nodeMs)
  const detail = `workerd ${workerd.map((x) => x.toFixed(1)).join('/')} ms, Node ${nodeMs.map((x) => x.toFixed(1)).join('/')} ms, ratio ${ratio.toFixed(2)}`
  expect(Math.min(...workerd), `the clock advanced during the loop (${detail})`).toBeGreaterThan(1)
  expect(ratio, detail).toBeGreaterThan(0.67)
  expect(ratio, detail).toBeLessThan(1.5)
})

test('the calibration was measured in workerd, and Node agreed when it was taken', () => {
  expect(CALIBRATION.runtime).toMatch(/workerd/)
  const agreement = CALIBRATION.node_cross_check.iterations_per_ms / CALIBRATION.iterations_per_ms
  expect(agreement).toBeGreaterThan(0.9)
  expect(agreement).toBeLessThan(1.1)
  for (const level of CPU_LEVELS_MS) expect(iterationsFor(level)).toBe(Math.round(level * CALIBRATION.iterations_per_ms))
})

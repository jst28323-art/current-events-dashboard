// The e2e screenshot retry (e2e/shot.ts) must retry ONLY the browser's capture failure, never anything else.
import { expect, test } from 'vitest'
import { shot } from '../e2e/shot.js'

test('retries the capture failure, then succeeds', async () => {
  let n = 0
  const png = await shot(async () => {
    if (n++ < 2) throw new Error('Protocol error (Page.captureScreenshot): Unable to capture screenshot')
    return Buffer.from('ok')
  })
  expect(png.toString()).toBe('ok')
  expect(n).toBe(3)
})

test('gives up after 2 retries with the original error', async () => {
  let n = 0
  await expect(shot(async () => { n++; throw new Error('Unable to capture screenshot') })).rejects.toThrow(/Unable to capture/)
  expect(n).toBe(3)
})

test('never retries any other error (an assertion or a timeout fails at once)', async () => {
  let n = 0
  await expect(shot(async () => { n++; throw new Error('Timeout 5000ms exceeded') })).rejects.toThrow(/Timeout/)
  expect(n).toBe(1)
})

test('every e2e screenshot goes through shot() (the retry is no use where it is not called)', async () => {
  // screens.spec.ts imported shot() but called page.screenshot directly, so the capture failure the retry exists for
  // still failed the gate there (p2.1 integration gate, 2026-10-03: desktop light feed).
  const { readdirSync, readFileSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e')
  const bare: string[] = []
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts') && n !== 'shot.ts')) {
    const text = readFileSync(join(dir, f), 'utf8')
    for (const m of text.matchAll(/\.screenshot\(/g)) {
      if (!/shot\(\(\) => [\w.'()\s-]*$/.test(text.slice(Math.max(0, m.index! - 80), m.index!))) {
        bare.push(`${f}:${text.slice(0, m.index!).split('\n').length}`)
      }
    }
  }
  expect(bare).toEqual([])
})

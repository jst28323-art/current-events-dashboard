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

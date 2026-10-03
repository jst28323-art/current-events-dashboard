// workerd treats every named export of the main module as an entrypoint and refuses to START the Worker if one is a
// plain value ("Incorrect type for map entry 'CPU_GAP_MS': the provided value is not of type 'function or
// ExportedHandler'", seen 2026-10-02 running the real bundle in plain Miniflare). The vitest plugin does not reproduce
// that failure, so this test pins the main module's export list.
import { expect, test } from 'vitest'
import * as main from '../src/index.js'

test('the main module exports only the default handler and the entrypoint classes', () => {
  expect(Object.keys(main).sort()).toEqual(['CpuFetchEntry', 'ProbeDO', 'default'])
  expect(typeof main.default.fetch).toBe('function')
  expect(typeof main.default.scheduled).toBe('function')
  expect(typeof main.ProbeDO).toBe('function')
  expect(typeof main.CpuFetchEntry).toBe('function')
})

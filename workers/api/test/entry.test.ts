// workerd treats every named export of the main module as an entrypoint and refuses to START the Worker if one is a
// plain value (the probe Worker hit "Incorrect type for map entry" running its real bundle in plain Miniflare,
// 2026-10-02). The vitest plugin does not reproduce that failure, so this test pins the main module's export list.
import { expect, test } from 'vitest'
import * as main from '../src/index.js'

test('the main module exports only the default handler and the HubDO class', () => {
  expect(Object.keys(main).sort()).toEqual(['HubDO', 'default'])
  expect(typeof main.default.fetch).toBe('function')
  expect(typeof main.default.scheduled).toBe('function')
  expect(typeof main.HubDO).toBe('function')
})

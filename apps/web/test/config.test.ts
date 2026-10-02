import { expect, test } from 'vitest'
import { API_BASE } from '../src/config.js'

test('the default API address is the D-027 workers.dev address, over https', () => {
  expect(API_BASE).toBe('https://ced-api.usgovfeed.workers.dev')
})

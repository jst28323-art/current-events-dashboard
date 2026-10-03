import { expect, test } from 'vitest'
import { linkHost, safeHttpsUrl } from '../src/lib/url.js'
import { piEvent } from '../e2e/fixture-events.js'

test('the fixture source URL is an https link', () => {
  const url = piEvent('2026-20439', 'P0').sources[0]!.url
  expect(safeHttpsUrl(url)).toBe(url)
  expect(linkHost(url)).toBe('federalregister.gov')
})

test.each([
  ['http://www.federalregister.gov/x'],
  ['javascript:alert(1)'],
  ['JAVASCRIPT:alert(1)'],
  [' javascript:alert(1)'],
  ['data:text/html,<script>alert(1)</script>'],
  ['//www.federalregister.gov/x'],
  ['/public-inspection/2026-20439'],
  ['https://user:pass@www.federalregister.gov/'],
  ['ftp://example.gov/'],
  ['not a url'],
  [''],
  [null],
  [42],
])('%s is not linked', (u) => {
  expect(safeHttpsUrl(u)).toBeNull()
})

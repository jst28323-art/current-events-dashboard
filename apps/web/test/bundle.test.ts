// One Preact in the bundle (2026-10-02): npm hoists preact 11 to the root node_modules as @preact/signals' peer while
// this app pins 10.x; without `resolve.dedupe`, signals attach to the other copy and the page never re-renders after
// the first paint. The e2e suite catches the symptom; this keeps the guard itself from being dropped.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test } from 'vitest'
import config from '../vite.config.js'

test('vite dedupes preact', () => {
  expect((config as { resolve?: { dedupe?: string[] } }).resolve?.dedupe).toContain('preact')
})

test('the app resolves the pinned Preact 10.x (the copy dedupe makes everything use)', () => {
  const req = createRequire(import.meta.url)
  const appPreact = JSON.parse(readFileSync(req.resolve('preact/package.json'), 'utf8')) as { version: string }
  expect(appPreact.version.startsWith('10.')).toBe(true)
})

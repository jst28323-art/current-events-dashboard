// Pins scripts/deployed_check.mjs: the post-deploy check must refuse every payload shape the web app cannot use, and
// accept the real one. A check that passes an empty or malformed status page would call a broken deploy healthy.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkStatusPayload, DEFAULT_API_URL } from '../../scripts/deployed_check.mjs'

const good = { generated_at: '2026-10-02T21:00:00.000Z', sources: [{ source_id: 'fr.api' }, { source_id: 'wh.feeds' }] }

test('accepts a well-formed status payload', () => {
  assert.equal(checkStatusPayload(good), null)
})

test('refuses non-objects, missing dates, missing or empty sources, and nameless sources', () => {
  assert.match(checkStatusPayload(null), /not a JSON object/)
  assert.match(checkStatusPayload('ok'), /not a JSON object/)
  assert.match(checkStatusPayload({ ...good, generated_at: 'yesterday' }), /generated_at/)
  assert.match(checkStatusPayload({ ...good, generated_at: undefined }), /generated_at/)
  assert.match(checkStatusPayload({ ...good, sources: {} }), /not an array/)
  assert.match(checkStatusPayload({ ...good, sources: [] }), /empty/)
  assert.match(checkStatusPayload({ ...good, sources: [{ id: 'fr.api' }] }), /no source_id/)
})

test('the default address is the D-027 subdomain', () => {
  assert.equal(DEFAULT_API_URL, 'https://ced-api.usgovfeed.workers.dev')
})

// Pins scripts/youtube_videos_list.mjs (D-093, D-097, D-105): the one videos.list call must ask for exactly the
// research's ids; the key (a repository secret in a PUBLIC repo whose Actions logs are public) must never reach a URL, a
// file or the log, even when the response echoes it back; and the result (YouTube API Data: at most 30 days, never
// disclosed) leaves the runner only encrypted, with nothing but counts in the log.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VIDEO_IDS, EXTRA_IDS, PARTS, buildRequest, redact, apiError, derive, encryptTo, decryptWith } from '../../scripts/youtube_videos_list.mjs'
import { REPO_ROOT } from '../../scripts/lib/git.mjs'

const RESEARCH = readFileSync(join(REPO_ROOT, 'docs/research/leadership_press_conferences.md'), 'utf8')

/** The ids listed in research §6 item 3 ("... call on: <ids with group labels>. That is 38 ids"). */
function researchListIds() {
  const line = RESEARCH.split(/\r?\n/).find((l) => l.startsWith('3. **Google API key'))
  assert.ok(line, 'research §6 item 3 not found')
  const seg = line.split('call on: ')[1].split('. That is 38 ids')[0]
  return seg.replace(/\([^)]*\)/g, '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)
}

test('the call asks for the research list (37 ids, though it says 38) plus the two other ids the report cites, once each', () => {
  const listed = researchListIds()
  assert.equal(listed.length, 37)
  assert.deepEqual(VIDEO_IDS, [...listed, ...EXTRA_IDS])
  for (const id of EXTRA_IDS) assert.ok(RESEARCH.includes(id), `${id} is not cited in the research`)
  assert.equal(new Set(VIDEO_IDS).size, 39)
  assert.ok(VIDEO_IDS.every((id) => /^[A-Za-z0-9_-]{11}$/.test(id)))
})

test('buildRequest: one URL with every id and part and no credential; refuses >50, repeated or malformed ids', () => {
  const { url, headers } = buildRequest()
  const u = new URL(url)
  assert.equal(u.origin + u.pathname, 'https://www.googleapis.com/youtube/v3/videos')
  assert.deepEqual([...u.searchParams.keys()], ['part', 'id'])
  assert.equal(u.searchParams.get('part'), PARTS.join(','))
  assert.deepEqual(u.searchParams.get('id').split(','), VIDEO_IDS)
  assert.ok(!/key/i.test(JSON.stringify(headers)))
  assert.throws(() => buildRequest(Array.from({ length: 51 }, (_, i) => `aaaaaaaaa${String(i).padStart(2, '0')}`)))
  assert.throws(() => buildRequest(['T5cTzKYpI3E', 'T5cTzKYpI3E']))
  assert.throws(() => buildRequest(['T5cTzKYpI3E&key=x']))
  assert.throws(() => buildRequest([]))
})

test('redact replaces every copy of the key; no key, no change', () => {
  assert.equal(redact('a KEY b KEY', 'KEY'), 'a [REDACTED] b [REDACTED]')
  assert.equal(redact('abc', ''), 'abc')
})

test('apiError: an error body is an error even with HTTP 200; a list is not', () => {
  assert.match(apiError(403, { error: { code: 403, message: 'The request cannot be completed because you have exceeded your quota.', errors: [{ reason: 'quotaExceeded' }] } }), /403 quotaExceeded/)
  assert.match(apiError(200, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.' } }), /INVALID_ARGUMENT/)
  assert.equal(apiError(200, { kind: 'youtube#videoListResponse' }), 'HTTP 200 without an items list')
  assert.equal(apiError(500, null), 'HTTP 500')
  assert.equal(apiError(200, { items: [] }), null)
})

const item = {
  id: 'T5cTzKYpI3E',
  snippet: { channelId: 'UCAdyfSY2oRwNIB4LddDYZJA', publishedAt: '2026-09-30T18:40:00Z', liveBroadcastContent: 'none' },
  contentDetails: { duration: 'PT21M3S' },
  status: { privacyStatus: 'public', embeddable: false },
  liveStreamingDetails: { scheduledStartTime: '2026-09-30T18:15:00Z', actualStartTime: '2026-09-30T18:20:00Z', actualEndTime: '2026-09-30T18:41:00Z' },
}

test('derive: request order, a returned-nothing id is missing (never guessed), the differences in seconds', () => {
  const rows = derive({ items: [item] }, ['T5cTzKYpI3E', 'SdBiFH4b0Zw'])
  assert.deepEqual(rows[1], { id: 'SdBiFH4b0Zw', missing: true })
  const r = rows[0]
  assert.deepEqual([r.published_minus_start_s, r.published_minus_end_s, r.start_minus_scheduled_s], [1200, -60, 300])
  assert.deepEqual([r.embeddable, r.has_live_details, r.duration, r.privacy_status], [false, true, 'PT21M3S', 'public'])
  const vod = derive({ items: [{ id: 'SdBiFH4b0Zw', snippet: { publishedAt: '2026-09-30T18:40:00Z' }, status: {} }] }, ['SdBiFH4b0Zw'])[0]
  assert.deepEqual([vod.has_live_details, vod.actual_start, vod.published_minus_start_s, vod.embeddable], [false, null, null, null])
  assert.throws(() => derive({ items: [item] }, ['SdBiFH4b0Zw']), /not requested/)
})

const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
const KP = pair()

test('encryptTo / decryptWith: round trip; the box hides the text; a wrong key or a flipped byte fails', () => {
  const box = encryptTo(KP.publicKey, 'secret text 2026-09-30T18:20:00Z')
  assert.ok(!JSON.stringify(box).includes('2026-09-30'))
  assert.equal(decryptWith(KP.privateKey, box), 'secret text 2026-09-30T18:20:00Z')
  assert.throws(() => decryptWith(pair().privateKey, box))
  const ct = Buffer.from(box.ciphertext, 'base64'); ct[0] ^= 1
  assert.throws(() => decryptWith(KP.privateKey, { ...box, ciphertext: ct.toString('base64') }))
})

/** Runs the script against a local stub that records what it was sent and echoes the key back in its body. */
async function runAgainstStub({ key, status = 200, body }) {
  const seen = []
  const server = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers })
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body(key)))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const dir = mkdtempSync(join(tmpdir(), 'ytvl-'))
  const pub = join(dir, 'pub.pem'), enc = join(dir, 'result.enc.json')
  writeFileSync(pub, KP.publicKey)
  const env = { ...process.env, YOUTUBE_API_KEY: key, YOUTUBE_VIDEOS_ENDPOINT_FOR_TEST: `http://127.0.0.1:${server.address().port}/youtube/v3/videos` }
  const child = spawn(process.execPath, [join(REPO_ROOT, 'scripts/youtube_videos_list.mjs'), '--encrypt-to', pub, '--out', enc], { env })
  let out = ''
  child.stdout.on('data', (d) => { out += d })
  child.stderr.on('data', (d) => { out += d })
  const code = await new Promise((r) => child.on('close', r))
  server.close()
  const encText = existsSync(enc) ? readFileSync(enc, 'utf8') : null
  return { code, out, seen, encText, plain: encText ? JSON.parse(decryptWith(KP.privateKey, JSON.parse(encText))) : null }
}

// Real-shaped (39 chars) but split in the source, so the repo's own secret scan (enforcement/secret-patterns.txt) passes.
const KEY = 'AI' + 'za' + 'FAKE-test-key-0123456789abcdefghijk'

test('end to end: key only in the X-Goog-Api-Key header; result only encrypted; log has counts, no per-video value', async () => {
  const { code, out, seen, encText, plain } = await runAgainstStub({
    key: KEY,
    body: (k) => ({ kind: 'youtube#videoListResponse', echoed: k, items: [{ ...item, snippet: { ...item.snippet, title: `title ${k}` } }] }),
  })
  assert.equal(code, 0, out)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].headers['x-goog-api-key'], KEY)
  assert.ok(!seen[0].url.includes(KEY) && !/[?&]key=/.test(seen[0].url))
  for (const text of [out, encText]) {
    assert.ok(!text.includes(KEY), 'the key leaked')
    assert.ok(!text.includes('2026-09-30') && !text.includes('UCAdyfSY2oRwNIB4LddDYZJA'), 'a per-video value is in the clear')
  }
  assert.ok(!VIDEO_IDS.some((id) => out.includes(id)), 'a video id was printed')
  assert.match(out, /HTTP 200, 1 of 39 requested videos returned/)
  assert.equal(plain.body.echoed, '[REDACTED]')
  assert.equal(plain.videos.find((v) => v.id === 'T5cTzKYpI3E').published_minus_start_s, 1200)
  assert.ok(!JSON.stringify(plain).includes(KEY))
})

test('end to end: an API error exits 1 with its reason, writes the encrypted response, and never prints the key', async () => {
  const { code, out, encText, plain } = await runAgainstStub({
    key: KEY, status: 400,
    body: (k) => ({ error: { code: 400, status: 'INVALID_ARGUMENT', message: `API key not valid: ${k}`, errors: [{ reason: 'badRequest' }] } }),
  })
  assert.equal(code, 1)
  assert.match(out, /HTTP 400: 400 badRequest API key not valid: \[REDACTED\]/)
  for (const text of [out, encText]) assert.ok(!text.includes(KEY))
  assert.equal(plain.videos, null)
  assert.match(plain.error, /badRequest/)
})

test('no secret or no public key: exit 2 before any request; a non-loopback test endpoint is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ytvl-'))
  const pub = join(dir, 'pub.pem')
  writeFileSync(pub, KP.publicKey)
  const run = (env, pubPath = pub) => new Promise((r) => {
    const c = spawn(process.execPath, [join(REPO_ROOT, 'scripts/youtube_videos_list.mjs'), '--encrypt-to', pubPath, '--out', join(dir, 'r.json')], { env: { ...process.env, ...env } })
    let out = ''
    c.stderr.on('data', (d) => { out += d })
    c.on('close', (code) => r({ code, out }))
  })
  const none = await run({ YOUTUBE_API_KEY: '' })
  assert.equal(none.code, 2)
  assert.match(none.out, /secret is not set/)
  const nokey = await run({ YOUTUBE_API_KEY: KEY }, join(dir, 'missing.pem'))
  assert.equal(nokey.code, 2)
  assert.match(nokey.out, /no public key/)
  const far = await run({ YOUTUBE_API_KEY: KEY, YOUTUBE_VIDEOS_ENDPOINT_FOR_TEST: 'https://example.com/videos' })
  assert.equal(far.code, 2)
  assert.ok(!existsSync(join(dir, 'r.json')))
})

test('the committed public key is a public key only, and a matching private key is never tracked', () => {
  const pem = readFileSync(join(REPO_ROOT, '.github/youtube-videos-list.pub.pem'), 'utf8')
  assert.match(pem, /^-----BEGIN PUBLIC KEY-----/)
  assert.ok(!/PRIVATE KEY/.test(pem))
  assert.ok(encryptTo(pem, 'x').wrapped_key.length > 300) // RSA-3072: a 384-byte wrapped key
})

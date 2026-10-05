#!/usr/bin/env node
// scripts/youtube_videos_list.mjs — the ONE retrospective YouTube Data API v3 `videos.list` call (D-093, D-097; grant
// G-012) on the 39 leadership press-conference videos of docs/research/leadership_press_conferences.md (§6 item 3). It
// settles that research's timing questions (when a stream really started vs when it went public; embeddability).
//
// It runs in the manual-only GitHub Action .github/workflows/youtube-videos-list.yml, which hands it the repository
// secret YOUTUBE_API_KEY in the environment. The key goes ONLY into the `X-Goog-Api-Key` request header: never into the
// URL, a command line, an output file or the log (this repo and its Actions logs are public, D-002), and any echo of the
// key in a response is replaced before anything is printed or written. One call, 1 quota unit.
//
// YouTube's API terms (D-105): data fetched with a plain key may be stored at most 30 days and must not be redistributed
// or disclosed, and anyone signed in to GitHub can read this public repo's Actions logs and artifacts. So the result
// (the response plus the per-video facts) is written ONLY encrypted, to a public key committed in the repo whose private
// half lives on the home PC outside git; the log gets the HTTP status and counts, never a per-video value. Nothing from
// the response is ever committed.
//
// Usage:  YOUTUBE_API_KEY=... node scripts/youtube_videos_list.mjs --encrypt-to <public.pem> --out <result.enc.json>
//         node scripts/youtube_videos_list.mjs --decrypt <result.enc.json> --key <private.pem> --out <plain.json>
//         node scripts/youtube_videos_list.mjs --new-keypair <private.pem> <public.pem>   (once, on the home PC)
// Exit:   0 = done · 1 = an HTTP or API error (status and the API's reason are printed), or decryption failed
//         · 2 = bad usage, the secret is not set, or no public key
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createCipheriv, createDecipheriv, generateKeyPairSync, publicEncrypt, privateDecrypt, randomBytes, constants } from 'node:crypto'
import { isMain } from './lib/git.mjs'

export const UA = 'Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/jst28323-art/current-events-dashboard)'
export const ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos'
export const PARTS = ['snippet', 'contentDetails', 'status', 'liveStreamingDetails']

/** The ids of research §6 item 3 in its order (it says 38 but lists 37), then the two other ids the report cites (V5
 * ITkB2c573fI, V6 sALqzexDY6Y): 39, one call. tests/harness/youtube_videos_list.test.mjs pins this list to the report. */
export const EXTRA_IDS = ['ITkB2c573fI', 'sALqzexDY6Y']
export const VIDEO_IDS = [
  'T5cTzKYpI3E', 'SdBiFH4b0Zw', 'fLj_TONEDPQ', 'iJOICVOLYtw', 'JNvdKmLGDMc', 'hrzs4JSy7AM', 'N3yYbYFMB2o', '7PjDTlOWJ3Q',
  'AU2wgCBjCQo', 'k9mZ_8-PZXY', 'fUyxQF15vsU', 'gIj5S_oEkFQ', 'eotj_wlGHc0', 'zwa3SbG8Llk', 'MApaaDHPWl4',
  'E9W3ToVAnSI', '9uMh4U7dOSI', 'iHDdqbgolyU', 'yVGxCOoX9yg', 'POFPgwFhXcA', 'Ejjm8bXdp_4', 'q9rY9tADmU4', 'QB84b2b9iUE',
  'aNQqCgWgkOA', 'gzoE_vUHYm4', 'T3c688n5V78', 'XVPKI7qQWE0', 'sorgtmtvr70', 'kkqdxe6dYQU', 'jENjK_1qT5g',
  'hiVDZ_fs7U4', 'N59lzw_tfd0', 'V4DWXH_UKcE', 'hJjEHjZQQ1U', 'MVws9MzAchs', 'xDqKpYV-ueY', 'EN2hblHltxc',
  ...EXTRA_IDS,
]

const ID_RE = /^[A-Za-z0-9_-]{11}$/

/** The request URL (no key in it, ever) and its headers without the key. Fails on a malformed or repeated id, or more
 * than 50 ids (videos.list documents no cap for `id`, only 1..50 for maxResults, which cannot be used with `id`; 50 is
 * our own bound, checked 2026-10-05). */
export function buildRequest(ids = VIDEO_IDS, parts = PARTS, endpoint = ENDPOINT) {
  if (!ids.length || ids.length > 50) throw new Error(`want 1..50 ids, got ${ids.length}`)
  if (new Set(ids).size !== ids.length) throw new Error('repeated id')
  for (const id of ids) if (!ID_RE.test(id)) throw new Error(`bad video id ${JSON.stringify(id)}`)
  const u = new URL(endpoint)
  u.searchParams.set('part', parts.join(','))
  u.searchParams.set('id', ids.join(','))
  return { url: u.toString(), headers: { Accept: 'application/json', 'User-Agent': UA } }
}

/** Replaces every occurrence of the key in a text (a response that echoes it must not reach a log or a file). */
export function redact(text, key) {
  return key ? String(text).split(key).join('[REDACTED]') : String(text)
}

/** null when the response is a usable list; otherwise why not (HTTP 200 with an error body is an error too). */
export function apiError(status, body) {
  if (body && typeof body === 'object' && body.error) {
    const e = body.error
    const reason = e.errors?.[0]?.reason || e.status || ''
    return `HTTP ${status}: ${e.code ?? ''} ${reason} ${e.message ?? ''}`.replace(/\s+/g, ' ').trim()
  }
  if (status !== 200) return `HTTP ${status}`
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) return 'HTTP 200 without an items list'
  return null
}

const secs = (a, b) => (a && b && !Number.isNaN(Date.parse(a)) && !Number.isNaN(Date.parse(b)) ? (Date.parse(a) - Date.parse(b)) / 1000 : null)

/** Per requested id, in request order: the facts the research needs, or `missing` when the API returned no item for it
 * (deleted, private or wrong: the docs do not say which, nor whether such an id is dropped or answered with a 404;
 * nothing is guessed). `has_live_details` false means no broadcast metadata came back, not "never a broadcast". */
export function derive(body, ids = VIDEO_IDS) {
  const byId = new Map((body.items || []).map((it) => [it.id, it]))
  const extra = [...byId.keys()].filter((id) => !ids.includes(id))
  if (extra.length) throw new Error(`items for ids that were not requested: ${extra.join(', ')}`)
  return ids.map((id) => {
    const it = byId.get(id)
    if (!it) return { id, missing: true }
    const s = it.snippet || {}, l = it.liveStreamingDetails || {}, st = it.status || {}
    return {
      id, missing: false,
      channel_id: s.channelId ?? null,
      published_at: s.publishedAt ?? null,
      live_broadcast_content: s.liveBroadcastContent ?? null,
      scheduled_start: l.scheduledStartTime ?? null,
      actual_start: l.actualStartTime ?? null,
      actual_end: l.actualEndTime ?? null,
      duration: it.contentDetails?.duration ?? null,
      privacy_status: st.privacyStatus ?? null,
      embeddable: typeof st.embeddable === 'boolean' ? st.embeddable : null,
      has_live_details: Boolean(it.liveStreamingDetails),
      published_minus_start_s: secs(s.publishedAt, l.actualStartTime),
      published_minus_end_s: secs(s.publishedAt, l.actualEndTime),
      start_minus_scheduled_s: secs(l.actualStartTime, l.scheduledStartTime),
    }
  })
}

/** Hybrid encryption to an RSA public key (PEM): AES-256-GCM for the data, RSA-OAEP-SHA256 for the AES key. */
export function encryptTo(publicPem, plaintext) {
  const aesKey = randomBytes(32), iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', aesKey, iv)
  const ct = Buffer.concat([c.update(Buffer.from(plaintext, 'utf8')), c.final()])
  const wrapped = publicEncrypt({ key: publicPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, aesKey)
  return { alg: 'RSA-OAEP-256+A256GCM', wrapped_key: wrapped.toString('base64'), iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'), ciphertext: ct.toString('base64') }
}

/** The inverse of encryptTo; throws on a wrong key or any tampering (GCM tag). */
export function decryptWith(privatePem, box) {
  if (box?.alg !== 'RSA-OAEP-256+A256GCM') throw new Error(`unknown alg ${box?.alg}`)
  const aesKey = privateDecrypt({ key: privatePem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(box.wrapped_key, 'base64'))
  const d = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(box.iv, 'base64'))
  d.setAuthTag(Buffer.from(box.tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(box.ciphertext, 'base64')), d.final()]).toString('utf8')
}

async function main() {
  const argv = process.argv.slice(2)
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  if (argv[0] === '--new-keypair') {
    const [priv, pub] = argv.slice(1)
    if (!priv || !pub || existsSync(priv)) { console.error('usage: --new-keypair <private.pem (must not exist)> <public.pem>'); process.exit(2) }
    const kp = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
    writeFileSync(priv, kp.privateKey, { mode: 0o600 })
    writeFileSync(pub, kp.publicKey)
    console.log(`youtube_videos_list: wrote ${priv} (keep it out of git) and ${pub}`)
    return
  }
  if (opt('--decrypt')) {
    const keyPath = opt('--key'), out = opt('--out')
    if (!keyPath || !out) { console.error('usage: --decrypt <result.enc.json> --key <private.pem> --out <plain.json>'); process.exit(2) }
    writeFileSync(out, decryptWith(readFileSync(keyPath, 'utf8'), JSON.parse(readFileSync(opt('--decrypt'), 'utf8'))))
    console.log(`youtube_videos_list: decrypted to ${out} (YouTube's terms: delete it within 30 days of the call, D-105)`)
    return
  }
  const pubPath = opt('--encrypt-to'), outPath = opt('--out')
  if (!pubPath || !outPath) {
    console.error('usage: YOUTUBE_API_KEY=... node scripts/youtube_videos_list.mjs --encrypt-to <public.pem> --out <result.enc.json>')
    process.exit(2)
  }
  let publicPem
  try { publicPem = readFileSync(pubPath, 'utf8') } catch { console.error(`youtube_videos_list: no public key at ${pubPath}; nothing was requested`); process.exit(2) }
  const key = process.env.YOUTUBE_API_KEY || ''
  if (!key.trim()) {
    console.error('youtube_videos_list: the YOUTUBE_API_KEY secret is not set (docs/OWNER_GRANTS.md G-012); nothing was requested')
    process.exit(2)
  }
  // The harness test points the call at a local stub; nothing but a loopback address is accepted in place of Google's.
  const testEndpoint = process.env.YOUTUBE_VIDEOS_ENDPOINT_FOR_TEST
  if (testEndpoint && !/^http:\/\/127\.0\.0\.1:\d+\//.test(testEndpoint)) {
    console.error('youtube_videos_list: YOUTUBE_VIDEOS_ENDPOINT_FOR_TEST must be a http://127.0.0.1:<port>/ address')
    process.exit(2)
  }
  const req = buildRequest(VIDEO_IDS, PARTS, testEndpoint || ENDPOINT)
  const fetchedAt = new Date().toISOString()
  const res = await fetch(req.url, { headers: { ...req.headers, 'X-Goog-Api-Key': key }, signal: AbortSignal.timeout(30_000) })
  const text = redact(await res.text(), key)
  let body = null
  try { body = JSON.parse(text) } catch { /* not JSON: apiError reports it */ }
  const meta = { fetched_at: fetchedAt, url: req.url, parts: PARTS, ids_requested: VIDEO_IDS.length, http_status: res.status,
    date_header: res.headers.get('date'), content_type: res.headers.get('content-type') }
  const err = apiError(res.status, body)
  let videos = null
  if (!err) videos = derive(body)
  const plain = redact(JSON.stringify({ ...meta, error: err, body: body ?? text, videos }, null, 2), key)
  writeFileSync(outPath, JSON.stringify(encryptTo(publicPem, plain)) + '\n')
  if (err) {
    console.error(`youtube_videos_list: ${redact(err, key)} (encrypted response written to ${outPath})`)
    process.exit(1)
  }
  // Counts only: a per-video value in this public log would be disclosed API Data (D-105).
  console.log(`youtube_videos_list: HTTP ${res.status}, ${body.items.length} of ${VIDEO_IDS.length} requested videos returned; ` +
    `the result is encrypted in ${outPath}`)
}

if (isMain(import.meta.url)) {
  main().catch((e) => { console.error(`youtube_videos_list: ${redact(e.message, process.env.YOUTUBE_API_KEY)}`); process.exit(1) })
}

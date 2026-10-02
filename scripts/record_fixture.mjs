#!/usr/bin/env node
// scripts/record_fixture.mjs — record one real upstream response as a test fixture (TESTING.md rule 1).
//
// Usage:  node scripts/record_fixture.mjs <source_id> <url> [--name <file>] [--date YYYY-MM-DD] [--ims "<http-date>"]
// Writes  fixtures/<source_id>/<date>/<name>            (the body, byte-exact)
//         fixtures/<source_id>/<date>/<name>.meta.json  (url, final url, status, headers, bytes, sha256, fetched_at, UA)
//
// Rules: record error and empty cases too (they are the fixtures that catch "HTTP 200 with an error body"); never record a
// URL that carries a key (api_key / X-Api-Key) — the script refuses, because this repo is public (D-002).
// Uses the project's polite User-Agent from CLAUDE.md.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { REPO_ROOT, isMain } from './lib/git.mjs'

export const USER_AGENT = 'Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/jst28323-art/current-events-dashboard)'

export function defaultName(url, contentType) {
  const u = new URL(url)
  let base = u.pathname.split('/').filter(Boolean).pop() || 'index'
  if (u.search) base += '__' + u.search.slice(1).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60)
  if (!/\.[A-Za-z0-9]{2,5}$/.test(base)) {
    const ct = (contentType || '').toLowerCase()
    base += ct.includes('json') ? '.json' : ct.includes('xml') || ct.includes('rss') || ct.includes('atom') ? '.xml'
      : ct.includes('html') ? '.html' : ct.includes('vtt') ? '.vtt' : ct.includes('mpegurl') ? '.m3u8' : '.txt'
  }
  return base.replace(/[^A-Za-z0-9._-]/g, '_')
}

// Refuses a URL if ANY query parameter whose name looks like a credential has a non-empty value other than DEMO_KEY
// (the 2026-10-02 review got access_token, api-key, client_secret and "DEMO_KEY plus a real token" past the old regex).
export function refuseSecrets(url) {
  let params
  try { params = new URL(url).searchParams } catch { return true }
  for (const [name, value] of params) {
    if (/key|token|secret|sig|password|passwd|auth|credential/i.test(name) && value && value !== 'DEMO_KEY') return true
  }
  return /\/\/[^/@]+:[^/@]+@/.test(url) // user:password@host
}

async function main() {
  const [sourceId, url, ...rest] = process.argv.slice(2)
  if (!sourceId || !url) {
    console.error('usage: node scripts/record_fixture.mjs <source_id> <url> [--name <file>] [--date YYYY-MM-DD] [--ims "<http-date>"]')
    process.exit(2)
  }
  if (refuseSecrets(url)) { console.error('record_fixture: REFUSED — the URL carries a key; this repo is public.'); process.exit(2) }
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined }
  const date = opt('--date') || new Date().toISOString().slice(0, 10)
  const headers = { 'User-Agent': USER_AGENT, Accept: '*/*' }
  if (opt('--ims')) headers['If-Modified-Since'] = opt('--ims')
  const t0 = Date.now()
  const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
  const buf = Buffer.from(await res.arrayBuffer())
  const ms = Date.now() - t0
  const hdrs = Object.fromEntries([...res.headers.entries()].filter(([k]) => !/^set-cookie$/i.test(k)))
  const name = opt('--name') || defaultName(res.url || url, hdrs['content-type'])
  const dir = join(REPO_ROOT, 'fixtures', sourceId, date)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), buf)
  const meta = {
    source_id: sourceId, url, final_url: res.url, fetched_at: new Date().toISOString(), status: res.status,
    elapsed_ms: ms, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'),
    request_headers: headers, response_headers: hdrs,
  }
  writeFileSync(join(dir, `${name}.meta.json`), JSON.stringify(meta, null, 2) + '\n')
  console.log(`${res.status} ${buf.length}B ${ms}ms  fixtures/${sourceId}/${date}/${name}`)
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(`record_fixture: ${e.message}`); process.exit(1) })

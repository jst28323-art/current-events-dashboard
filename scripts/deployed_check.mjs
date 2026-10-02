#!/usr/bin/env node
// scripts/deployed_check.mjs — TESTING.md layer 6: after a deploy, fetch what the owner actually opens and check it is
// up and answering in the shape the web app expects. Run by .github/workflows/deploy.yml after `wrangler deploy`;
// also safe to run by hand.
//
// Usage:  node scripts/deployed_check.mjs [--url https://ced-api.usgovfeed.workers.dev] [--tries 6]
// The API address comes from --url, else $CED_API_URL, else the D-027 default.
import { isMain } from './lib/git.mjs'

export const DEFAULT_API_URL = 'https://ced-api.usgovfeed.workers.dev'
const UA = 'Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/jst28323-art/current-events-dashboard)'

// The /api/v1/status payload the web app relies on: { generated_at, sources: [{ source_id, ... }] }.
export function checkStatusPayload(json) {
  if (!json || typeof json !== 'object') return 'body is not a JSON object'
  if (typeof json.generated_at !== 'string' || Number.isNaN(Date.parse(json.generated_at))) return 'generated_at missing or not a date'
  if (!Array.isArray(json.sources)) return 'sources is not an array'
  if (json.sources.length === 0) return 'sources is empty (no source registered)'
  const bad = json.sources.find((s) => !s || typeof s.source_id !== 'string')
  if (bad) return 'a sources[] entry has no source_id'
  return null
}

async function main() {
  const argv = process.argv.slice(2)
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const base = (opt('--url') || process.env.CED_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
  const tries = Number(opt('--tries') || 6)
  let last = 'not tried'
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(`${base}/api/v1/status`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
      const text = await res.text()
      if (res.status !== 200) last = `HTTP ${res.status}: ${text.slice(0, 200)}`
      else {
        let json
        try { json = JSON.parse(text) } catch { json = null }
        const problem = checkStatusPayload(json)
        if (!problem) {
          console.log(`deployed_check: OK ${base}/api/v1/status (${json.sources.length} sources, generated_at ${json.generated_at})`)
          return
        }
        last = problem
      }
    } catch (e) { last = String(e && e.message || e) }
    console.log(`deployed_check: try ${i}/${tries} failed: ${last}`)
    if (i < tries) await new Promise((r) => setTimeout(r, 10_000))
  }
  console.error(`deployed_check: FAIL ${base}/api/v1/status: ${last}`)
  process.exit(1)
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(`deployed_check: ${e.message}`); process.exit(1) })

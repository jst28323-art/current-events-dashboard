#!/usr/bin/env node
// scripts/ledger_report.mjs — Phase 1 exit criterion 3 from the live API (docs/ROADMAP.md): per business day (Eastern
// time), Public Inspection documents, White House items, and the PI latency (first_seen_at - occurred_at, where
// occurred_at is the filing slot) with n and the median. /api/v1/status cannot answer this (a rolling 24 h window with
// no n; cold-start round r3 backlog), so this pages through the WHOLE event history: one call without `since` to learn
// the store's cursor epoch, then since=<epoch>.0 with has_more paging (D-037). Read-only; polite (sequential, UA).
// Beside the criterion it prints each day's filing-slot sightings (D-099: a slot's documents arrive in one poll, so n
// documents is not n timings) and the White House lag (first_seen_at - source_published_at, docs/TRAPS.md).
//
// Usage:  node scripts/ledger_report.mjs --days 2026-10-05,2026-10-06 [--api https://ced-api.usgovfeed.workers.dev]
// Exit:   0 = every listed day meets the criterion · 1 = at least one does not (or the API failed) · 2 = bad usage
import { isMain } from './lib/git.mjs'
import { DEFAULT_API_URL } from './deployed_check.mjs'

const UA = 'Mozilla/5.0 (compatible; CurrentEventsDashboard/0.1; +https://github.com/jst28323-art/current-events-dashboard)'
export const CRITERION = { minPi: 5, minWh: 1, maxMedianS: 90, minN: 5 }

const etDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
/** The Eastern-time calendar day of a UTC instant, "YYYY-MM-DD" (null for null). */
export const dayEt = (iso) => (iso ? etDay.format(new Date(iso)) : null)

export function median(xs) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The criterion for one day. PI documents are counted by their filing slot's day (occurred_at); White House items by
 * the day we first saw them. Latency uses PI documents filed that day: first_seen_at - occurred_at, in seconds. */
export function dayReport(events, day) {
  const pi = events.filter((e) => e.event_type === 'fr.public_inspection' && dayEt(e.times.occurred_at) === day)
  const wh = events.filter((e) => e.sources?.[0]?.source_id === 'wh.feeds' && dayEt(e.times.first_seen_at) === day)
  const lat = pi.map((e) => (Date.parse(e.times.first_seen_at) - Date.parse(e.times.occurred_at)) / 1000)
  const med = median(lat)
  const pass = pi.length >= CRITERION.minPi && wh.length >= CRITERION.minWh && lat.length >= CRITERION.minN &&
    med !== null && med <= CRITERION.maxMedianS
  return {
    day, pi: pi.length, wh: wh.length, n: lat.length, median_s: med,
    p90_s: lat.length ? [...lat].sort((a, b) => a - b)[Math.min(lat.length - 1, Math.floor(lat.length * 0.9))] : null,
    max_s: lat.length ? Math.max(...lat) : null, negative: lat.filter((x) => x < 0).length, pass,
    slots: slotSightings(pi), wh_lag: whLag(wh),
  }
}

/** D-099: a filing slot's documents arrive together, usually in one poll, so n documents is not n independent timings.
 * One row per distinct occurred_at (the filing slot), oldest first: how many documents, their median latency and how
 * many distinct first sightings (polls) they came in. Reported beside the criterion; the pass rule does not use it. */
export function slotSightings(piEvents) {
  const bySlot = new Map()
  for (const e of piEvents) {
    const k = e.times.occurred_at
    if (!bySlot.has(k)) bySlot.set(k, [])
    bySlot.get(k).push(e)
  }
  return [...bySlot.entries()].sort(([a], [b]) => Date.parse(a) - Date.parse(b)).map(([slot, es]) => ({
    slot, n: es.length,
    median_s: median(es.map((e) => (Date.parse(e.times.first_seen_at) - Date.parse(e.times.occurred_at)) / 1000)),
    polls: new Set(es.map((e) => e.times.first_seen_at)).size,
  }))
}

/** The White House lag (docs/TRAPS.md: first_seen_at - source_published_at per item; act on it only at n >= 20
 * business-day items). Items without a source_published_at are counted apart, never guessed. */
export function whLag(whEvents) {
  const lag = whEvents.filter((e) => e.times.source_published_at)
    .map((e) => (Date.parse(e.times.first_seen_at) - Date.parse(e.times.source_published_at)) / 1000)
  return { n: lag.length, no_published_at: whEvents.length - lag.length, median_s: median(lag), max_s: lag.length ? Math.max(...lag) : null }
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
  if (res.status !== 200) throw new Error(`HTTP ${res.status} from ${url}`)
  return res.json()
}

/** Every stored event (latest revision each), oldest change first. */
export async function allEvents(base, get = getJson) {
  const first = await get(`${base}/api/v1/events?limit=1`)
  const epoch = String(first.cursor).split('.')[0]
  const byKey = new Map()
  let since = `${epoch}.0`
  for (let page = 0; page < 200; page++) {
    const r = await get(`${base}/api/v1/events?since=${encodeURIComponent(since)}&limit=500`)
    for (const e of r.events) byKey.set(e.dedup_key, e)
    since = r.cursor
    if (!r.has_more) return [...byKey.values()]
  }
  throw new Error('more than 200 pages: refusing to continue (raise the bound on purpose if the store is that big)')
}

async function main() {
  const argv = process.argv.slice(2)
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const days = (opt('--days') || '').split(',').filter(Boolean)
  if (!days.length || days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    console.error('usage: node scripts/ledger_report.mjs --days YYYY-MM-DD[,YYYY-MM-DD...] [--api <base url>]')
    process.exit(2)
  }
  const base = (opt('--api') || process.env.CED_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
  const events = await allEvents(base)
  console.log(`ledger_report: ${events.length} events from ${base} at ${new Date().toISOString()}`)
  console.log(`criterion per day: >= ${CRITERION.minPi} PI documents, >= ${CRITERION.minWh} White House item, PI median <= ${CRITERION.maxMedianS} s with n >= ${CRITERION.minN}`)
  let ok = true
  for (const d of days) {
    const r = dayReport(events, d)
    ok &&= r.pass
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${d}: PI ${r.pi}, WH ${r.wh}, latency n=${r.n} median=${r.median_s ?? '-'} s p90=${r.p90_s ?? '-'} s max=${r.max_s ?? '-'} s, negative=${r.negative}`)
    console.log(`  ${d} filing slots seen: ${r.slots.length} (D-099: n counts documents; each slot is one timing)`)
    for (const s of r.slots) console.log(`    slot ${s.slot}: ${s.n} documents, median ${s.median_s ?? '-'} s, in ${s.polls} poll(s)`)
    console.log(`  ${d} White House lag (first_seen - source_published_at): n=${r.wh_lag.n} median=${r.wh_lag.median_s ?? '-'} s max=${r.wh_lag.max_s ?? '-'} s` +
      (r.wh_lag.no_published_at ? `, ${r.wh_lag.no_published_at} item(s) without source_published_at` : ''))
  }
  process.exit(ok ? 0 : 1)
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(`ledger_report: ${e.message}`); process.exit(1) })

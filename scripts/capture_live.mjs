#!/usr/bin/env node
// scripts/capture_live.mjs — record a live congressional session day as fixtures (ROADMAP P2.3; D-028, D-033).
// Built for the Mon 2026-10-05 pro forma sessions (Senate ~16:00 ET, House ~16:30 ET), run once by a Windows scheduled
// task on the home PC (grant G-011; a cloud routine cannot reach these hosts: docs/TRAPS.md). It runs in chunks of at
// most --max-run-s and resumes from a state file, so a caller with a time cap can simply run it again until it exits 10.
//
// Usage:
//   node scripts/capture_live.mjs --date 2026-10-05 --until 2026-10-05T21:30:00Z [--max-run-s 540] [--state <file>]
//   [--out-root <dir>]   dry run: write fixtures under <dir>/fixtures/ instead of the repo
//   node scripts/capture_live.mjs --date 2026-10-05 --smoke    one request per host, writes nothing: can this box reach them?
// Exit: 0 = chunk done, window still open (run again) · 10 = window closed, final snapshots recorded (stop) · 1 = error
//       · smoke: 0 = every target answered with an expected status, 1 = a target was blocked (e.g. a proxy 403) or unreachable.
//
// What it records (fixtures/<source_id>/<date>/; layout: fixtures/README.md), politely (CLAUDE.md polite polling: one
// request at a time, >= 15 s between polls of one URL, the project User-Agent):
//   senate.captions   the floor stream's master playlist once it exists, the WebVTT caption playlist (a snapshot at
//                     most every 2 min while it changes, plus a final one) and EVERY caption segment (they vanish after
//                     the day: docs/TRAPS.md)
//   house.floorcast   /latest/history every 30 s (If-None-Match); when it changes, /latest/floor, /latest/transcript and
//                     /latest/votes; at the end /broadcastevents/<yyyymmdd>, /floor/<date>, /transcripts/<date>
//   house.media       the day's WebVTT captions file named by /broadcastevents (if any)
//   senate.schedule   floor_schedule.json at the start and the end
//   house.clerk.floor the Clerk's floor XML for the day, at the end
//   senate.pressgallery the newest Daily Press posts, at the end
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { REPO_ROOT, isMain } from './lib/git.mjs'
import { recordFixture, USER_AGENT } from './record_fixture.mjs'

export const SENATE_FLOOR_STREAM = 'https://www-senate-gov-media-srs.akamaized.net/hls/live/2096634/stv'
export const FLOORCAST = 'https://liveproxy-azapp-prod-eastus2-003.azurewebsites.net'
const SENATE_SCHEDULE = 'https://www.senate.gov/legislative/schedule/floor_schedule.json'
const PRESS_GALLERY = 'https://www.dailypress.senate.gov/wp-json/wp/v2/posts?per_page=10'

const CADENCE_S = { senateMaster: 30, senateText: 15, houseHistory: 30 }
const PLAYLIST_SNAPSHOT_EVERY_S = 120
// --out-root <dir> writes fixtures under <dir>/fixtures/ instead of the repo (for a dry run that must not touch fixtures/).
let OUT_ROOT = REPO_ROOT

// ---- pure helpers (pinned by tests/harness/capture_live.test.mjs) ----

/** Senate floor stream file name for a session date: 2026-10-05 -> stv100526. */
export function stvFilename(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`bad --date ${date} (want YYYY-MM-DD)`)
  return `stv${m[2]}${m[3]}${m[1].slice(2)}`
}

/** Segment URIs listed in an HLS media playlist, in order. */
export function playlistSegments(text) {
  return String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

/** "2026-10-05T20:03:07.123Z" -> "200307Z" (for snapshot file names). */
export function timeTag(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`bad time ${iso}`)
  return d.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'
}

/** The WebVTT captions URL that a FloorCast /broadcastevents/<day> payload names, or null. */
export function houseVttUrl(json) {
  const events = Array.isArray(json) ? json : json ? [json] : []
  for (const ev of events) {
    for (const f of (ev && ev.asset && Array.isArray(ev.asset.files) ? ev.asset.files : [])) {
      if (f && typeof f.url === 'string' && (/vtt/i.test(String(f.type)) || /\.vtt(#|$)/i.test(f.url))) return f.url.replace(/#.*$/, '')
    }
  }
  return null
}

/** Seconds until a key is due again (<= 0 means due now). */
export function dueIn(state, key, nowMs) {
  const last = state.lastPoll[key]
  return last ? (last + CADENCE_S[key] * 1000 - nowMs) / 1000 : 0
}

export function freshState(date) {
  return {
    date, startedRecorded: false, finalDone: false, lastPoll: {}, senateMasterUp: false, senateTextGone: false,
    segments: [], lastPlaylistSnapshot: 0, lastPlaylistBody: '', historyEtag: null, historyBody: '', errors: 0, log: [],
  }
}

// ---- I/O ----

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

async function politeGet(url, extraHeaders = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...extraHeaders }, signal: AbortSignal.timeout(20_000) })
  return { status: res.status, headers: res.headers, text: await res.text() }
}

function note(state, msg) {
  const line = `${new Date().toISOString()} ${msg}`
  console.log(line)
  state.log.push(line)
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400)
}

async function rec(state, sourceId, url, name, extraHeaders) {
  try {
    const r = await recordFixture({ sourceId, url, name, date: state.date, extraHeaders, root: OUT_ROOT })
    note(state, `rec ${r.meta.status} ${r.meta.bytes}B ${r.path}`)
    return r
  } catch (e) {
    state.errors++
    note(state, `ERR ${sourceId} ${url}: ${e.message}`)
    return null
  }
}

async function startSnapshots(state) {
  await rec(state, 'senate.schedule', SENATE_SCHEDULE, 'floor_schedule_start.json')
  await rec(state, 'house.floorcast', `${FLOORCAST}/latest/history`, `latest_history_start.json`)
  state.startedRecorded = true
}

async function pollSenate(state, now) {
  const base = `${SENATE_FLOOR_STREAM}/${stvFilename(state.date)}`
  if (!state.senateMasterUp) {
    if (dueIn(state, 'senateMaster', now) > 0) return
    state.lastPoll.senateMaster = now
    try {
      const r = await politeGet(`${base}/master.m3u8`)
      if (r.status === 200) {
        state.senateMasterUp = true
        note(state, 'senate floor stream is UP')
        await rec(state, 'senate.captions', `${base}/master.m3u8`, `${stvFilename(state.date)}_master.m3u8`)
        await rec(state, 'senate.captions', `${base}/master/index_1.m3u8`, `${stvFilename(state.date)}_index_1.m3u8`)
      }
    } catch (e) { state.errors++; note(state, `ERR senate master: ${e.message}`) }
    return
  }
  if (state.senateTextGone || dueIn(state, 'senateText', now) > 0) return
  state.lastPoll.senateText = now
  const plUrl = `${base}/master/text_1.m3u8`
  let r
  try { r = await politeGet(plUrl) } catch (e) { state.errors++; note(state, `ERR senate text playlist: ${e.message}`); return }
  if (r.status === 404 && state.segments.length) { state.senateTextGone = true; note(state, 'senate caption playlist is gone (404)'); return }
  if (r.status !== 200) { note(state, `senate text playlist HTTP ${r.status}`); return }
  const changed = r.text !== state.lastPlaylistBody
  state.lastPlaylistBody = r.text
  if (changed && now - state.lastPlaylistSnapshot >= PLAYLIST_SNAPSHOT_EVERY_S * 1000) {
    state.lastPlaylistSnapshot = now
    await rec(state, 'senate.captions', plUrl, `${stvFilename(state.date)}_text_1_${timeTag(new Date(now).toISOString())}.m3u8`)
  }
  for (const seg of playlistSegments(r.text)) {
    if (state.segments.includes(seg)) continue
    const segUrl = new URL(seg, plUrl).toString()
    const got = await rec(state, 'senate.captions', segUrl, `${stvFilename(state.date)}_${seg.split('/').pop()}`)
    if (got && got.meta.status === 200) state.segments.push(seg)
  }
}

async function pollHouse(state, now) {
  if (dueIn(state, 'houseHistory', now) > 0) return
  state.lastPoll.houseHistory = now
  let r
  try { r = await politeGet(`${FLOORCAST}/latest/history`, state.historyEtag ? { 'If-None-Match': state.historyEtag } : {}) } catch (e) {
    state.errors++; note(state, `ERR house history: ${e.message}`); return
  }
  if (r.status === 304) return
  if (r.status !== 200) { note(state, `house history HTTP ${r.status}`); return }
  state.historyEtag = r.headers.get('etag')
  if (r.text === state.historyBody) return
  state.historyBody = r.text
  const t = timeTag(new Date(now).toISOString())
  note(state, `house history changed: ${r.text.slice(0, 160)}`)
  await rec(state, 'house.floorcast', `${FLOORCAST}/latest/history`, `latest_history_${t}.json`)
  await rec(state, 'house.floorcast', `${FLOORCAST}/latest/floor`, `latest_floor_${t}.json`)
  await rec(state, 'house.floorcast', `${FLOORCAST}/latest/transcript`, `latest_transcript_${t}.json`)
  await rec(state, 'house.floorcast', `${FLOORCAST}/latest/votes`, `latest_votes_${t}.json`)
}

async function finalSnapshots(state) {
  const day = state.date.replace(/-/g, '')
  const stv = stvFilename(state.date)
  if (state.senateMasterUp && !state.senateTextGone) {
    await rec(state, 'senate.captions', `${SENATE_FLOOR_STREAM}/${stv}/master/text_1.m3u8`, `${stv}_text_1_final.m3u8`)
  }
  await rec(state, 'senate.schedule', SENATE_SCHEDULE, 'floor_schedule_end.json')
  const be = await rec(state, 'house.floorcast', `${FLOORCAST}/broadcastevents/${day}`, `broadcastevents_${day}.json`)
  await rec(state, 'house.floorcast', `${FLOORCAST}/floor/${state.date}`, `floor_${state.date}.json`)
  await rec(state, 'house.floorcast', `${FLOORCAST}/transcripts/${state.date}`, `transcripts_${state.date}.json`)
  if (be && be.meta.status === 200) {
    let vtt = null
    try { vtt = houseVttUrl(JSON.parse(be.body.toString('utf8'))) } catch { vtt = null }
    if (vtt) await rec(state, 'house.media', vtt, `captions_${day}.vtt`)
    else note(state, 'no WebVTT file named in broadcastevents')
  }
  await rec(state, 'house.clerk.floor', `https://clerk.house.gov/floor/${day}.xml`, `${day}.xml`)
  await rec(state, 'senate.pressgallery', PRESS_GALLERY, 'dailypress_posts_end.json')
  state.finalDone = true
}

// Expected statuses per smoke target. Any other answer (e.g. a sandbox proxy's 403 with a ~100-byte body, seen from
// the cloud on 2026-10-02) means BLOCKED: the smoke must fail closed, never report "reachable" for a block.
export function smokeTargets(date) {
  const day = date.replace(/-/g, '')
  return [
    { url: SENATE_SCHEDULE, ok: [200, 304] },
    { url: `${SENATE_FLOOR_STREAM}/${stvFilename(date)}/master.m3u8`, ok: [200, 404] }, // 404 until the stream exists
    { url: `${FLOORCAST}/latest/history`, ok: [200, 304] },
    { url: `https://clerk.house.gov/floor/${day}.xml`, ok: [200, 404] }, // 404 until the day's file exists
    { url: PRESS_GALLERY, ok: [200] },
  ]
}

/** 'ok' | 'blocked' for one smoke answer. */
export function smokeVerdict(target, status) {
  return target.ok.includes(status) ? 'ok' : 'blocked'
}

async function smoke(date) {
  let bad = 0
  for (const t of smokeTargets(date)) {
    try {
      const r = await politeGet(t.url)
      const v = smokeVerdict(t, r.status)
      if (v !== 'ok') bad++
      console.log(`smoke ${v === 'ok' ? 'ok     ' : 'BLOCKED'} ${r.status} ${String(r.text.length).padStart(7)}B server=${r.headers.get('server') || '-'} ${t.url}${v === 'ok' ? '' : ` body=${JSON.stringify(r.text.slice(0, 120))}`}`)
    } catch (e) {
      bad++
      console.log(`smoke UNREACHABLE ${t.url}: ${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}`)
    }
    await sleep(500)
  }
  console.log(bad ? `smoke: FAIL: ${bad} target(s) blocked or unreachable from this machine` : 'smoke: PASS: every target answered with an expected status')
  return bad ? 1 : 0
}

async function main() {
  const argv = process.argv.slice(2)
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const date = opt('--date')
  if (!date) { console.error('usage: see the header of scripts/capture_live.mjs'); process.exit(1) }
  stvFilename(date) // validates the date
  if (argv.includes('--smoke')) process.exit(await smoke(date))

  const until = Date.parse(opt('--until') || '')
  if (Number.isNaN(until)) { console.error('capture_live: --until <ISO time> is required'); process.exit(1) }
  const maxRunS = Number(opt('--max-run-s') || 540)
  if (opt('--out-root')) OUT_ROOT = opt('--out-root')
  const statePath = opt('--state') || join(REPO_ROOT, 'scratch', `capture_${date}.json`)
  mkdirSync(dirname(statePath), { recursive: true })
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : freshState(date)
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')

  const t0 = Date.now()
  const deadline = Math.min(t0 + maxRunS * 1000, until)
  if (!state.startedRecorded) { await startSnapshots(state); save() }
  while (Date.now() < deadline) {
    await pollSenate(state, Date.now())
    await pollHouse(state, Date.now())
    save()
    const now = Date.now()
    const waits = [dueIn(state, 'houseHistory', now), state.senateMasterUp ? dueIn(state, 'senateText', now) : dueIn(state, 'senateMaster', now)]
    await sleep(Math.min(Math.max(1, Math.min(...waits)) * 1000, deadline - Date.now()))
  }
  if (Date.now() >= until) {
    if (!state.finalDone) { await finalSnapshots(state); save() }
    note(state, `window closed: ${state.segments.length} senate caption segments, ${state.errors} errors`)
    save()
    process.exit(10)
  }
  note(state, `chunk done (${Math.round((Date.now() - t0) / 1000)} s); ${state.segments.length} senate segments so far; run again`)
  save()
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(`capture_live: ${e.stack || e.message}`); process.exit(1) })

// Pins the pure parts of scripts/capture_live.mjs (D-028): a wrong stream name or a missed segment would silently
// record nothing on the one live day before Nov 9, and the data cannot be fetched again afterwards.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stvFilename, playlistSegments, timeTag, houseVttUrl, dueIn, freshState } from '../../scripts/capture_live.mjs'
import { REPO_ROOT } from '../../scripts/lib/git.mjs'

test('stvFilename follows the stv<MMDDYY> rule from the research (stv100126 = Oct 1, 2026)', () => {
  assert.equal(stvFilename('2026-10-01'), 'stv100126')
  assert.equal(stvFilename('2026-10-05'), 'stv100526')
  assert.equal(stvFilename('2026-11-09'), 'stv110926')
  assert.throws(() => stvFilename('10/05/2026'))
})

test('playlistSegments lists every segment of a recorded caption playlist, in order, and nothing else', () => {
  const text = readFileSync(join(REPO_ROOT, 'fixtures/senate.captions/2026-10-02/judiciary093026_text_1.m3u8'), 'utf8')
  const segs = playlistSegments(text)
  assert.equal(segs[0], 'text_1_00001.vtt')
  assert.ok(segs.every((s) => /^text_1_\d{5}\.vtt$/.test(s)))
  assert.equal(new Set(segs).size, segs.length)
  assert.equal(segs.length, (text.match(/#EXTINF/g) || []).length)
})

test('playlistSegments handles CRLF and a live (no ENDLIST) playlist', () => {
  const live = '#EXTM3U\r\n#EXT-X-MEDIA-SEQUENCE:40\r\n#EXTINF:12.0,\r\ntext_1_00040.vtt\r\n#EXTINF:12.0,\r\ntext_1_00041.vtt\r\n'
  assert.deepEqual(playlistSegments(live), ['text_1_00040.vtt', 'text_1_00041.vtt'])
})

test('timeTag is UTC hhmmss + Z', () => {
  assert.equal(timeTag('2026-10-05T20:03:07.123Z'), '200307Z')
  assert.equal(timeTag('2026-10-05T16:03:07-04:00'), '200307Z')
  assert.throws(() => timeTag('not a time'))
})

test('houseVttUrl finds a WebVTT file in a broadcastevents payload and strips the #t fragment', () => {
  const payload = [{ asset: { files: [
    { type: 'HLS', url: 'https://x.azurefd.net/east/a/manifest.m3u8#t=1' },
    { type: 'WebVTT', url: 'https://x.azurefd.net/east/a/captions.vtt#t=2' },
  ] } }]
  assert.equal(houseVttUrl(payload), 'https://x.azurefd.net/east/a/captions.vtt')
  // the recorded Sep 16 payload names the day's captions file
  const real = JSON.parse(readFileSync(join(REPO_ROOT, 'fixtures/house.floorcast/2026-10-02/broadcastevents_20260916.json'), 'utf8'))
  assert.equal(houseVttUrl(real), 'https://houseliveprod-f9h4cpb9dyb8gegg.a01.azurefd.net/east/2026-09-16T08-51-54/captions.vtt')
  // no files at all: null, never a guess
  assert.equal(houseVttUrl([{ asset: { files: [{ type: 'HLS', url: 'https://x/manifest.m3u8' }] } }]), null)
  assert.equal(houseVttUrl(null), null)
})

test('dueIn honours the per-URL cadence', () => {
  const s = freshState('2026-10-05')
  assert.ok(dueIn(s, 'houseHistory', 1_000_000) <= 0)
  s.lastPoll.houseHistory = 1_000_000
  assert.equal(dueIn(s, 'houseHistory', 1_010_000), 20)
  assert.ok(dueIn(s, 'houseHistory', 1_030_000) <= 0)
})

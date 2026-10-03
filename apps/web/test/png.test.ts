// The e2e contrast instrument (apps/web/e2e/png.ts): the PNG decoder that replaced the in-page canvas decode (WebKit on
// Windows has no OffscreenCanvas) and the WCAG ratio. Round trips through an encoder written from the PNG spec's
// pseudo-code, one image per scanline filter, on data with many predictor ties; known WCAG answers; fail-closed cases.
// The decoder is also checked against Chromium's own PNG decode on a real screenshot (e2e/instrument.spec.ts).
import { crc32, deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { contrastOf, decodePng } from '../e2e/png.js'

function chunk(type: string, data: Uint8Array): Buffer {
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  td.copy(out, 4)
  out.writeUInt32BE(crc32(td) >>> 0, 8 + data.length)
  return out
}

/** PNG spec 9.4 Paeth, written as the spec's pseudo-code (independent of the decoder's version). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

interface Img { width: number; height: number; channels: 3 | 4; px: Uint8Array }

function encode(img: Img, filterOf: (y: number) => number, opts: { depth?: number; colorType?: number; interlace?: number } = {}): Buffer {
  const { width, height, channels, px } = img
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = opts.depth ?? 8
  ihdr[9] = opts.colorType ?? (channels === 4 ? 6 : 2)
  ihdr[12] = opts.interlace ?? 0
  const stride = width * channels
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    const ft = filterOf(y)
    raw[y * (stride + 1)] = ft
    for (let x = 0; x < stride; x++) {
      const cur = px[y * stride + x]!
      const a = x >= channels ? px[y * stride + x - channels]! : 0
      const b = y > 0 ? px[(y - 1) * stride + x]! : 0
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels]! : 0
      const pred = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][ft]!
      raw[y * (stride + 1) + 1 + x] = (cur - pred + 256) % 256
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/** Deterministic pixels from a small value set, so Paeth and Average hit ties and wrap-arounds. */
function pixels(width: number, height: number, channels: 3 | 4, seed: number): Uint8Array {
  const vals = [0, 1, 2, 127, 128, 200, 254, 255]
  let s = seed >>> 0
  const px = new Uint8Array(width * height * channels)
  for (let i = 0; i < px.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    px[i] = channels === 4 && i % 4 === 3 ? 255 : vals[s >>> 29]!
  }
  return px
}

const rgbOf = (img: Img) => (img.channels === 3 ? img.px : img.px.filter((_, i) => i % 4 !== 3))

describe('decodePng', () => {
  for (const channels of [3, 4] as const) {
    for (const ft of [0, 1, 2, 3, 4]) {
      it(`round-trips ${channels === 3 ? 'RGB' : 'RGBA'} with filter ${ft} on every row`, () => {
        const img: Img = { width: 13, height: 9, channels, px: pixels(13, 9, channels, 7 + ft * 31 + channels) }
        const d = decodePng(encode(img, () => ft))
        expect([d.width, d.height]).toEqual([13, 9])
        expect(Array.from(d.rgb)).toEqual(Array.from(rgbOf(img)))
      })
    }
    it(`round-trips ${channels === 3 ? 'RGB' : 'RGBA'} with a different filter on each row`, () => {
      const img: Img = { width: 17, height: 15, channels, px: pixels(17, 15, channels, 99 + channels) }
      const d = decodePng(encode(img, (y) => (y * 3) % 5))
      expect(Array.from(d.rgb)).toEqual(Array.from(rgbOf(img)))
    })
  }

  it('Paeth breaks a pb == pc tie toward b (above), as the spec orders it', () => {
    // a = c + d and b = c - 2d give pa = 2|d| > pb = pc = |d|: the spec picks b. Random data almost never builds this
    // (a mutation `pb < pc` survived the round trips above, 2026-10-03), so it is planted: c = 100, b = 80, a = 110.
    const px = new Uint8Array([100, 100, 100, 80, 80, 80, 110, 110, 110, 7, 7, 7])
    const d = decodePng(encode({ width: 2, height: 2, channels: 3, px }, () => 4))
    expect(Array.from(d.rgb)).toEqual(Array.from(px))
    // And the raw filtered byte really leans on the tie: 7 - 80 (b), not 7 - 100 (c).
    expect(paeth(110, 80, 100)).toBe(80)
  })

  it('fails closed on what it does not support', () => {
    const img: Img = { width: 4, height: 2, channels: 3, px: pixels(4, 2, 3, 1) }
    expect(() => decodePng(encode(img, () => 0, { interlace: 1 }))).toThrow(/interlaced/)
    expect(() => decodePng(encode(img, () => 0, { depth: 16 }))).toThrow(/bit depth 16/)
    expect(() => decodePng(encode(img, () => 0, { colorType: 3 }))).toThrow(/colour type 3/)
    expect(() => decodePng(encode(img, () => 5))).toThrow(/filter type 5/)
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/not a PNG/)
    const good = encode(img, () => 1)
    expect(() => decodePng(good.subarray(0, good.length - 12))).toThrow(/IEND/)
  })

  it('refuses a pixel that is not fully opaque (no contrast against an unknown backdrop)', () => {
    const px = pixels(3, 3, 4, 5)
    px[4 * 4 + 3] = 254
    expect(() => decodePng(encode({ width: 3, height: 3, channels: 4, px }, () => 4))).toThrow(/pixel 4 is not opaque \(alpha 254\)/)
  })
})

describe('contrastOf', () => {
  const solid = (n: number, rgb: [number, number, number]) => Array.from({ length: n }, () => rgb).flat()

  it('black text on white is 21:1, the most common pixel is the background', () => {
    const c = contrastOf(new Uint8Array([...solid(90, [255, 255, 255]), ...solid(10, [0, 0, 0]), ...solid(5, [128, 128, 128])]))
    expect(c.bg).toEqual([255, 255, 255])
    expect(c.fg).toEqual([0, 0, 0])
    expect(c.ratio).toBeCloseTo(21, 6)
  })

  it('#767676 on white is the WCAG AA boundary colour, 4.54:1', () => {
    const c = contrastOf(new Uint8Array([...solid(50, [255, 255, 255]), ...solid(20, [0x76, 0x76, 0x76])]))
    expect(c.ratio).toBeGreaterThan(4.5)
    expect(c.ratio).toBeCloseTo(4.54, 2)
  })

  it('light text on a dark background (fg brighter than bg)', () => {
    const c = contrastOf(new Uint8Array([...solid(30, [30, 30, 30]), ...solid(9, [255, 255, 255])]))
    expect(c.bg).toEqual([30, 30, 30])
    expect(c.ratio).toBeCloseTo(1.05 / (0.0129 + 0.05), 1)
  })
})

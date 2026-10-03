// A minimal PNG decoder and the WCAG 2 contrast measurement for e2e/contrast.ts, in Node (node:zlib only), so the
// measurement does not depend on the browser under test. The first version decoded the screenshot inside the page with
// createImageBitmap + OffscreenCanvas; Playwright's WebKit on Windows has no OffscreenCanvas ("Can't find variable:
// OffscreenCanvas", 2026-10-03), and a canvas may also colour-convert or premultiply what it draws. Decoding the PNG
// bytes Playwright returns reads exactly the pixels the engine painted.
//
// Supports what Playwright writes: 8-bit RGB or RGBA, non-interlaced, any of the five scanline filters. Anything else
// throws (fail closed), and so does any pixel that is not fully opaque: a contrast against an unknown backdrop is not
// a measurement.
import { inflateSync } from 'node:zlib'

export interface Contrast {
  ratio: number
  fg: [number, number, number]
  bg: [number, number, number]
}

export interface DecodedPng {
  width: number
  height: number
  /** 3 bytes (R, G, B) per pixel, rows top to bottom. */
  rgb: Uint8Array
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export function decodePng(png: Uint8Array): DecodedPng {
  if (png.length < 8 || SIGNATURE.some((b, i) => png[i] !== b)) throw new Error('not a PNG')
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let width = 0
  let height = 0
  let channels = 0
  const idat: Uint8Array[] = []
  let sawEnd = false
  for (let off = 8; off + 12 <= png.length && !sawEnd; ) {
    const len = view.getUint32(off)
    const type = String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!)
    const data = png.subarray(off + 8, off + 8 + len)
    if (data.length !== len) throw new Error(`PNG chunk ${type} is truncated`)
    if (type === 'IHDR') {
      width = view.getUint32(off + 8)
      height = view.getUint32(off + 12)
      const [depth, colorType, compression, filter, interlace] = [data[8], data[9], data[10], data[11], data[12]]
      if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`)
      if (colorType === 2) channels = 3
      else if (colorType === 6) channels = 4
      else throw new Error(`unsupported PNG colour type ${colorType}`)
      if (compression !== 0 || filter !== 0) throw new Error('unsupported PNG compression or filter method')
      if (interlace !== 0) throw new Error('interlaced PNG is not supported')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') sawEnd = true
    off += 12 + len
  }
  if (channels === 0 || width === 0 || height === 0) throw new Error('PNG has no usable IHDR')
  if (!sawEnd || idat.length === 0) throw new Error('PNG has no image data or no IEND')
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length !== height * (stride + 1)) throw new Error(`PNG data is ${raw.length} bytes, expected ${height * (stride + 1)}`)

  const out = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)]!
    const src = y * (stride + 1) + 1
    const row = y * stride
    const prev = row - stride // previous unfiltered row (absent for y = 0: reads as 0)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[row + x - channels]! : 0
      const b = y > 0 ? out[prev + x]! : 0
      const c = x >= channels && y > 0 ? out[prev + x - channels]! : 0
      let pred: number
      switch (ft) {
        case 0: pred = 0; break
        case 1: pred = a; break
        case 2: pred = b; break
        case 3: pred = (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default: throw new Error(`bad PNG filter type ${ft} on row ${y}`)
      }
      out[row + x] = (raw[src + x]! + pred) & 255
    }
  }
  if (channels === 3) return { width, height, rgb: out }
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0, j = 0; i < out.length; i += 4, j += 3) {
    if (out[i + 3] !== 255) throw new Error(`PNG pixel ${i / 4} is not opaque (alpha ${out[i + 3]})`)
    rgb[j] = out[i]!
    rgb[j + 1] = out[i + 1]!
    rgb[j + 2] = out[i + 2]!
  }
  return { width, height, rgb }
}

const lin = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
/** WCAG 2 relative luminance of an sRGB colour. */
export const luminance = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

/** The most common pixel is the background; the pixel farthest from it in luminance is the text colour. */
export function contrastOf(rgb: Uint8Array): Contrast {
  if (rgb.length === 0 || rgb.length % 3 !== 0) throw new Error('no pixels')
  const counts = new Map<number, number>()
  for (let i = 0; i < rgb.length; i += 3) {
    const k = (rgb[i]! << 16) | (rgb[i + 1]! << 8) | rgb[i + 2]!
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let bgKey = 0
  let best = -1
  for (const [k, n] of counts) if (n > best) [bgKey, best] = [k, n]
  const split = (k: number): [number, number, number] => [(k >> 16) & 255, (k >> 8) & 255, k & 255]
  const bg = split(bgKey)
  const lb = luminance(...bg)
  let fg = bg
  let far = -1
  for (const k of counts.keys()) {
    const px = split(k)
    const dist = Math.abs(luminance(...px) - lb)
    if (dist > far) [fg, far] = [px, dist]
  }
  const lf = luminance(...fg)
  return { ratio: (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05), fg, bg }
}

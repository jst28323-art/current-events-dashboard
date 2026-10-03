// Forward block scanner for head-only XML parsing (docs/design/P2.1.md §0.5, §3.0; the lib/rss.ts pattern). Bulky
// parts of a payload (member lists, older floor actions) are cut by string scanning before any XML parser runs: a
// 94 KB roll call needs only its <vote-metadata> head parsed, and 433 <recorded-vote> blocks are cheapest as slices.
//
// Nothing here throws; malformed structure comes back as { ok: false, detail } so the adapter can report drift.
// Shared by every Congress adapter: builders do not edit it (DESIGN §6 Stage 2); a needed change goes to the integrator.

export interface XmlBlock {
  /** The whole element, open tag to close tag (or the self-closing tag). */
  raw: string
  /** Offsets of `raw` in the scanned text. */
  start: number
  end: number
  /** The open tag text, `<floor_action unique-id="45150" …>`; read its attributes with attrsOf(). */
  openTag: string
  /** Everything between the open and close tags ('' for a self-closing element). */
  inner: string
}

export type BlocksResult = { ok: true; blocks: XmlBlock[]; more: boolean } | { ok: false; detail: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The first `limit` `<tag …>…</tag>` elements of `text` in document order, as raw slices, scanning forward from `from`.
 * `<tag` must be followed by whitespace, `>` or `/>` (so `vote` never matches `<votes>` or `<vote_number>`); nested
 * elements of the same name are balanced. `more` says whether another such element follows the last one returned
 * (head-only callers report "newest 50 of M"; countBlocks gives M). An open tag without its close = not ok.
 */
export function blocks(text: string, tag: string, limit = Number.POSITIVE_INFINITY, from = 0): BlocksResult {
  const re = new RegExp(`<(/?)${escapeRe(tag)}(?=[\\s/>])[^>]*>`, 'g')
  re.lastIndex = from
  const out: XmlBlock[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1] === '/') return { ok: false, detail: `a </${tag}> with no open tag at offset ${m.index}` }
    if (out.length >= limit) return { ok: true, blocks: out, more: true }
    const start = m.index
    const openTag = m[0]
    if (openTag.endsWith('/>')) {
      out.push({ raw: openTag, start, end: start + openTag.length, openTag, inner: '' })
      continue
    }
    const innerStart = re.lastIndex
    let depth = 1
    let close: RegExpExecArray | null = null
    while (depth > 0) {
      close = re.exec(text)
      if (close === null) return { ok: false, detail: `<${tag}> at offset ${start} is never closed` }
      if (close[1] === '/') depth -= 1
      else if (!close[0].endsWith('/>')) depth += 1
    }
    const end = re.lastIndex
    out.push({ raw: text.slice(start, end), start, end, openTag, inner: text.slice(innerStart, close!.index) })
  }
  return { ok: true, blocks: out, more: false }
}

/** How many `<tag …>` open (or self-closing) tags `text` holds: the M of "newest 50 of M". */
export function countBlocks(text: string, tag: string): number {
  return [...text.matchAll(new RegExp(`<${escapeRe(tag)}(?=[\\s/>])`, 'g'))].length
}

/** The first child element named `tag` in `xml`, as a block; null when absent or unbalanced. */
export function firstBlock(xml: string, tag: string): XmlBlock | null {
  const r = blocks(xml, tag, 1)
  return r.ok ? (r.blocks[0] ?? null) : null
}

/**
 * Text content of the first `<tag>` in `xml`: CDATA unwrapped verbatim, other markup stripped, entities decoded,
 * whitespace kept as is (call collapseWs yourself). '' for an empty or self-closing element (`<absent/>`), null when
 * the element is missing or unbalanced.
 */
export function textOf(xml: string, tag: string): string | null {
  const b = firstBlock(xml, tag)
  return b ? innerText(b.inner) : null
}

/** Text content of every `<tag>` in `xml`, in document order (same rules as textOf); null when unbalanced. */
export function textsOf(xml: string, tag: string): string[] | null {
  const r = blocks(xml, tag)
  return r.ok ? r.blocks.map((b) => innerText(b.inner)) : null
}

/** Markup -> text: CDATA sections verbatim, other tags removed, entities decoded outside CDATA. */
export function innerText(inner: string): string {
  let out = ''
  let i = 0
  while (i < inner.length) {
    const c = inner.indexOf('<![CDATA[', i)
    const head = c < 0 ? inner.slice(i) : inner.slice(i, c)
    out += decodeEntities(stripTags(head))
    if (c < 0) break
    const e = inner.indexOf(']]>', c + 9)
    if (e < 0) {
      out += inner.slice(c + 9) // an unterminated CDATA: keep its text rather than invent an end
      break
    }
    out += inner.slice(c + 9, e)
    i = e + 3
  }
  return out
}

/** Remove every tag (`<…>`), keeping the text between them. Does not decode entities. */
export function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * Decode `&amp; &lt; &gt; &quot; &apos; &#N; &#xN;` (DESIGN §3.0). Any other named entity (`&nbsp;`, `&mdash;`) and any
 * numeric reference that is not a valid Unicode scalar value is left verbatim, so nothing is silently guessed; an
 * adapter that meets one decides for itself (hasUnknownEntity tells it).
 *
 * `&nbsp;` stays undecoded ON PURPOSE (P2.1 fix, 2026-10-03): XML defines only the five above, so `&nbsp;` in an
 * official XML body means the payload is not the XML we recorded, and the XML adapters refuse it (senate.lis.votes head,
 * house.clerk.floor, senate.schedule: drift; pinned in xmlscan.test.ts and each adapter's tests). The HTML press-gallery
 * prose decodes its own HTML names (senate_pressgallery.ts decodeProse) and refuses any other.
 */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || cp === 0) return whole
      return String.fromCodePoint(cp)
    }
    return NAMED[body] ?? whole
  })
}

/** True when `s` still holds an entity decodeEntities leaves verbatim (a named one outside the XML five, a bad number). */
export function hasUnknownEntity(s: string): boolean {
  return /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/.test(decodeEntities(s))
}

/** Every whitespace run (incl. NBSP, newlines) -> one space; trimmed. */
export function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Drop a leading UTF-8 byte-order mark (the House Clerk's RSS feed starts with one). */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

/**
 * Attributes of an open tag as name -> decoded value. null when the tag text is malformed (an attribute without a
 * quoted value, stray text) or names an attribute twice: a strict reader for fail-closed adapters.
 */
export function attrsOf(openTag: string): Record<string, string> | null {
  const m = /^<[A-Za-z_][\w.:-]*([\s\S]*?)\/?>$/.exec(openTag)
  if (!m) return null
  const rest = m[1] ?? ''
  const out: Record<string, string> = {}
  const re = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y
  let i = 0
  while (i < rest.length) {
    if (/^\s*$/.test(rest.slice(i))) break
    re.lastIndex = i
    const a = re.exec(rest)
    if (!a) return null
    const name = a[1]!
    if (Object.hasOwn(out, name)) return null
    out[name] = decodeEntities(a[2] ?? a[3] ?? '')
    i = re.lastIndex
  }
  return out
}

/** The name of the document's root element, skipping a BOM, the XML declaration, comments, processing instructions
 * and a DOCTYPE; null when the text does not start with markup (an empty body, plain text, JSON). */
export function rootName(body: string): string | null {
  let s = stripBom(body)
  for (;;) {
    s = s.replace(/^\s+/, '')
    if (s.startsWith('<?')) {
      const e = s.indexOf('?>')
      if (e < 0) return null
      s = s.slice(e + 2)
    } else if (s.startsWith('<!--')) {
      const e = s.indexOf('-->')
      if (e < 0) return null
      s = s.slice(e + 3)
    } else if (/^<!DOCTYPE/i.test(s)) {
      const e = s.indexOf('>')
      if (e < 0) return null
      s = s.slice(e + 1)
    } else break
  }
  const m = /^<([A-Za-z_][\w.:-]*)(?=[\s/>])/.exec(s)
  return m ? m[1]! : null
}

/**
 * Envelope (truncation) check: the body ends with these closing tags, in document order (innermost first), separated
 * only by whitespace, e.g. endsWithClose(body, ['</floor_actions>', '</legislative_activity>']).
 */
export function endsWithClose(body: string, closes: readonly string[]): boolean {
  let s = body.replace(/\s+$/, '')
  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const c = closes[i]!
    if (!s.endsWith(c)) return false
    s = s.slice(0, -c.length).replace(/\s+$/, '')
  }
  return true
}

/** The text before the first occurrence of `marker` (the head-only cut, e.g. before `</vote-metadata>` + marker
 * itself when `inclusive`); null when the marker is absent (an adapter reports that as drift). */
export function headUntil(body: string, marker: string, inclusive = true): string | null {
  const i = body.indexOf(marker)
  return i < 0 ? null : body.slice(0, inclusive ? i + marker.length : i)
}

// lib/xmlscan.ts (docs/design/P2.1.md §3.0): the forward block scanner, text/entity helpers, the strict attribute
// reader and the envelope check, on real fixtures where one shows the case and in memory otherwise. Note: the Clerk roll
// XML uses CRLF line endings, so per-block regexes must be whitespace tolerant.
import { describe, expect, test } from 'vitest'
import {
  attrsOf, blocks, collapseWs, countBlocks, decodeEntities, endsWithClose, firstBlock, hasUnknownEntity, headUntil,
  innerText, rootName, stripBom, stripTags, textOf, textsOf,
} from '../src/lib/xmlscan.js'
import { replay } from './replay.js'

const roll314 = replay('house.clerk.votes', '2026-10-02', 'roll314.xml').body
const floor = replay('house.clerk.floor', '2026-10-03', '20261001.xml').body
const menu = replay('senate.lis.votes', '2026-10-02', 'vote_menu_119_2.xml').body
const feed = replay('house.clerk.floor', '2026-10-03', 'Home_Feed_rss.xml').body
const errorBody = replay('house.clerk.votes', '2026-10-02', 'roll315_NEGATIVE_error_body.xml').body
const senate009 = replay('senate.lis.votes', '2026-10-03', 'vote_119_2_00009.xml').body

describe('blocks', () => {
  test('roll314: 433 <recorded-vote> blocks, each a raw slice of the body', () => {
    const r = blocks(roll314, 'recorded-vote')
    expect(r.ok && r.blocks.length).toBe(433)
    if (!r.ok) return
    expect(r.more).toBe(false)
    const b = r.blocks[0]!
    expect(roll314.slice(b.start, b.end)).toBe(b.raw)
    expect(b.raw.startsWith('<recorded-vote>') && b.raw.endsWith('</recorded-vote>')).toBe(true)
    expect(b.inner).toMatch(/^\r\n\s*<legislator name-id="[A-Z]\d{6}"/)
  })
  test('a limit returns the head and says more follow', () => {
    const r = blocks(floor, 'floor_action', 3)
    expect(r.ok && r.blocks.length).toBe(3)
    expect(r.ok && r.more).toBe(true)
    expect(countBlocks(floor, 'floor_action')).toBe(7)
    const all = blocks(floor, 'floor_action', 7)
    expect(all.ok && all.more).toBe(false)
    expect(attrsOf(r.ok ? r.blocks[0]!.openTag : '')).toEqual({ 'act-id': 'H61000', 'update-date-time': '20261001T11:54', 'unique-id': '45150' })
  })
  test('the Senate menu: <vote> never matches <votes> or <vote_number>; newest first', () => {
    expect(countBlocks(menu, 'vote')).toBe(256)
    const r = blocks(menu, 'vote', 10)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.blocks.map((b) => textOf(b.inner, 'vote_number'))).toEqual(
      ['00256', '00255', '00254', '00253', '00252', '00251', '00250', '00249', '00248', '00247'],
    )
  })
  test('self-closing elements, nesting, and `from`', () => {
    const x = '<a><b x="1"/><b><b>in</b></b><b>last</b></a>'
    const r = blocks(x, 'b')
    expect(r.ok && r.blocks.map((b) => b.raw)).toEqual(['<b x="1"/>', '<b><b>in</b></b>', '<b>last</b>'])
    const from = blocks(x, 'b', 10, x.indexOf('<b>last'))
    expect(from.ok && from.blocks.map((b) => b.inner)).toEqual(['last'])
  })
  test('an unclosed element or a stray close tag is not ok (fail closed on truncation)', () => {
    const cut = floor.slice(0, floor.lastIndexOf('</floor_action>'))
    expect(blocks(cut, 'floor_action')).toMatchObject({ ok: false })
    expect(blocks('<a></b><b></b></b>', 'b')).toMatchObject({ ok: false })
  })
})

describe('text helpers', () => {
  test('textOf: element text, empty element, missing element', () => {
    expect(textOf(roll314, 'rollcall-num')).toBe('314')
    expect(textOf(roll314, 'vote-question')).toBe('On Motion to Suspend the Rules and Pass')
    expect(textOf(senate009, 'absent')).toBe('') // <absent/>
    expect(textOf('<a><b></b></a>', 'b')).toBe('')
    expect(textOf(roll314, 'no-such-element')).toBeNull()
    expect(textsOf('<a><c>1</c><c>2 &amp; 3</c></a>', 'c')).toEqual(['1', '2 & 3'])
  })
  test('innerText: tags stripped, entities decoded, CDATA verbatim', () => {
    expect(innerText('On <a href="x">H.R. 1</a> &amp; more')).toBe('On H.R. 1 & more')
    expect(innerText('<![CDATA[a &amp; <b>]]> &lt;c&gt;')).toBe('a &amp; <b> <c>')
    expect(stripTags('a<br/>b<i>c</i>')).toBe('abc')
  })
  test('decodeEntities: the XML five and numeric references; nothing else is guessed', () => {
    expect(decodeEntities('&amp;&lt;&gt;&quot;&apos;')).toBe('&<>"\'')
    expect(decodeEntities('&#8211; &#x2014; &#233;')).toBe('– — é')
    expect(decodeEntities('&amp;amp;')).toBe('&amp;') // one pass only
    expect(decodeEntities('&nbsp;&mdash;')).toBe('&nbsp;&mdash;')
    expect(decodeEntities('&#xD800;&#0;&#x110000;')).toBe('&#xD800;&#0;&#x110000;')
    expect(hasUnknownEntity('a &nbsp; b')).toBe(true)
    expect(hasUnknownEntity('a &amp; b &#8211;')).toBe(false)
  })
  test('collapseWs folds every whitespace run, NBSP included', () => {
    expect(collapseWs('  LEGISLATIVE DAY OF OCTOBER  1, 2026 \n')).toBe('LEGISLATIVE DAY OF OCTOBER 1, 2026')
    expect(collapseWs('a  b\tc')).toBe('a b c')
  })
})

describe('attrsOf (strict)', () => {
  test('reads quoted attributes and decodes them', () => {
    expect(attrsOf('<legislator name-id="A000370" party="D" state="NC" role="legislator">')).toEqual({ 'name-id': 'A000370', party: 'D', state: 'NC', role: 'legislator' })
    expect(attrsOf(`<a href='/x?y=1&amp;z=2'/>`)).toEqual({ href: '/x?y=1&z=2' })
    expect(attrsOf('<vote>')).toEqual({})
  })
  test('refuses an unquoted value, stray text, or a repeated attribute', () => {
    expect(attrsOf('<a b=1>')).toBeNull()
    expect(attrsOf('<a b="1" junk>')).toBeNull()
    expect(attrsOf('<a b="1" b="2">')).toBeNull()
    expect(attrsOf('not a tag')).toBeNull()
  })
})

describe('document shape', () => {
  test('rootName skips the declaration, comments and a BOM', () => {
    expect(rootName(roll314)).toBe('rollcall-vote')
    expect(rootName(errorBody)).toBe('xml') // the Clerk's 65-byte "Error sanitizing file" body
    expect(rootName(feed)).toBe('rss') // starts with a UTF-8 BOM
    expect(feed.charCodeAt(0)).toBe(0xfeff)
    expect(stripBom(feed).startsWith('<?xml')).toBe(true)
    expect(rootName('<!DOCTYPE html><!-- c --><html lang="en">')).toBe('html')
    expect(rootName('{"a":1}')).toBeNull()
    expect(rootName('')).toBeNull()
  })
  test('endsWithClose: the envelope check catches truncation', () => {
    expect(endsWithClose(floor, ['</floor_actions>', '</legislative_activity>'])).toBe(true)
    expect(endsWithClose(menu, ['</votes>', '</vote_summary>'])).toBe(true)
    const cut = floor.slice(0, floor.length - 30)
    expect(endsWithClose(cut, ['</floor_actions>', '</legislative_activity>'])).toBe(false)
    expect(endsWithClose(floor, ['</legislative_activity>', '</floor_actions>'])).toBe(false) // order matters
  })
  test('headUntil cuts the head-only slice', () => {
    const head = headUntil(roll314, '</vote-metadata>')!
    expect(head.endsWith('</vote-metadata>')).toBe(true)
    expect(head).not.toContain('<recorded-vote>')
    expect(headUntil(roll314, '</vote-metadata>', false)!.endsWith('</vote-metadata>')).toBe(false)
    expect(headUntil(errorBody, '</vote-metadata>')).toBeNull()
    expect(firstBlock(head, 'vote-totals')).not.toBeNull()
  })
})

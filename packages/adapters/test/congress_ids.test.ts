// lib/congress_ids.ts (scratch/phase2/DESIGN.md §1.4, §3.0, §3.1): the year rule, the closed bill tables (every
// legis-num and document_type in the recorded fixtures is covered; anything else is null = drift) and key formatting.
import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CURRENT, billKey, congressSessionOfYear, floorBillType, fmtBill, nominationKey, parseLegisNum, senateDocumentType,
  sessionNumber, sessionOrdinal,
} from '../src/lib/congress_ids.js'
import { REPO_ROOT } from './replay.js'

/** Every value of `<tag>` in the recorded fixtures of these source directories. */
function fixtureValues(sources: string[], tag: string): string[] {
  const out = new Set<string>()
  for (const s of sources) {
    const root = join(REPO_ROOT, 'fixtures', s)
    for (const d of readdirSync(root)) {
      for (const f of readdirSync(join(root, d))) {
        if (!f.endsWith('.xml')) continue
        for (const m of readFileSync(join(root, d, f), 'utf8').matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))) out.add(m[1]!)
      }
    }
  }
  return [...out].sort()
}

describe('sessions and years', () => {
  test('CURRENT is pinned to 119-2 (the rollover is a P2.2 checklist item, never a wall-clock test)', () => {
    expect(CURRENT).toEqual({ congress: 119, session: 2, year: 2026 })
    expect(Object.isFrozen(CURRENT)).toBe(true)
  })
  test('the §3.1 year rule', () => {
    expect(congressSessionOfYear(2025)).toEqual({ congress: 119, session: 1 })
    expect(congressSessionOfYear(2026)).toEqual({ congress: 119, session: 2 })
    expect(congressSessionOfYear(2023)).toEqual({ congress: 118, session: 1 })
    expect(congressSessionOfYear(2027)).toEqual({ congress: 120, session: 1 })
    expect(congressSessionOfYear(2020)).toEqual({ congress: 116, session: 2 })
    expect(congressSessionOfYear(1788)).toBeNull()
    expect(congressSessionOfYear(2026.5)).toBeNull()
  })
  test('session ordinals', () => {
    expect([sessionNumber('1st'), sessionNumber(' 2nd '), sessionNumber('3rd'), sessionNumber('')]).toEqual([1, 2, null, null])
    expect([sessionOrdinal(1), sessionOrdinal(2)]).toEqual(['1st', '2nd'])
  })
})

describe('closed bill tables', () => {
  test('every House legis-num in the fixtures parses; others are null', () => {
    const vals = fixtureValues(['house.clerk.votes', 'members'], 'legis-num')
    expect(vals.length).toBeGreaterThan(10)
    for (const v of vals) expect(parseLegisNum(v), v).not.toBeNull()
    expect(parseLegisNum('H R 5334')).toEqual({ kind: 'bill', type: 'hr', number: 5334 })
    expect(parseLegisNum('S J RES 31')).toEqual({ kind: 'bill', type: 'sjres', number: 31 })
    expect(parseLegisNum('H  CON RES 93')).toEqual({ kind: 'bill', type: 'hconres', number: 93 })
    expect(parseLegisNum('QUORUM')).toEqual({ kind: 'quorum' })
    expect(parseLegisNum('ADJOURN')).toEqual({ kind: 'adjourn' })
    for (const bad of ['H AMDT 12', 'HR 1', 'H R', 'H R 0', 'H R 12a', '']) expect(parseLegisNum(bad), bad).toBeNull()
  })
  test('every Senate document_type in the fixtures is known; others are null', () => {
    const vals = fixtureValues(['senate.lis.votes', 'members'], 'document_type').filter((v) => v.trim() !== '')
    expect(vals.length).toBeGreaterThan(5)
    for (const v of vals) expect(senateDocumentType(v), v).not.toBeNull()
    expect(senateDocumentType('PN')).toBe('nomination')
    expect(senateDocumentType('S.Amdt.')).toBe('amendment')
    expect(senateDocumentType('H.Con.Res.')).toBe('hconres')
    expect(senateDocumentType('Treaty Doc.')).toBeNull()
    expect(senateDocumentType('toString')).toBeNull() // not an inherited property
  })
  test('floor href segments: known -> type, unknown -> null (no related key, not drift)', () => {
    expect(floorBillType('house-joint-resolution')).toBe('hjres')
    expect(floorBillType('senate-resolution')).toBe('sres')
    expect(floorBillType('house-amendment')).toBeNull()
    expect(floorBillType('constructor')).toBeNull()
  })
})

describe('formatting', () => {
  test('bills', () => {
    expect(fmtBill('hr', 5334)).toBe('H.R. 5334')
    expect(fmtBill('sconres', 33)).toBe('S.Con.Res. 33')
    expect(billKey(119, 'hjres', 1)).toBe('bill:119:hjres:1')
  })
  test('nominations keep a partition suffix as printed; "0 " or empty partition = none', () => {
    expect(nominationKey(119, '1129')).toBe('nomination:119:PN1129')
    expect(nominationKey(119, '730-11')).toBe('nomination:119:PN730-11')
    expect(nominationKey(119, '730', '11')).toBe('nomination:119:PN730-11')
    expect(nominationKey(119, '730', '0 ')).toBe('nomination:119:PN730')
    expect(nominationKey(119, '730', '')).toBe('nomination:119:PN730')
    expect(nominationKey(119, 'PN730')).toBeNull()
    expect(nominationKey(119, '730-11', '2')).toBeNull()
  })
})

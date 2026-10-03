// Safari rules no runtime test here can catch (2026-10-03, D-046 WebKit work). Playwright's WebKit is 26.6, which
// accepts unprefixed backdrop-filter; Safari before 18 (iOS 17 and older) knows only -webkit-backdrop-filter, so a
// dropped prefix would leave older iPhones with a flat, see-through header while every e2e test stays green.
// viewport-fit=cover is what makes iOS report safe-area insets at all; e2e/safe-area.spec.ts checks the padding.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../src/styles.css'), 'utf8')
const html = readFileSync(resolve(here, '../index.html'), 'utf8')

/** Top-level-ish rule bodies: every `{ ... }` without a nested brace, with its declarations. */
function ruleBodies(text: string): string[] {
  return [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!)
}
const decl = (body: string, prop: string) =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop.replace(/-/g, '\\-')}\\s*:\\s*([^;]+)`, 'g'))].map((m) => m[1]!.trim())

describe('Safari-only CSS rules', () => {
  it('every backdrop-filter has a -webkit-backdrop-filter twin with the same value, in the same rule', () => {
    const bodies = ruleBodies(css).filter((b) => decl(b, 'backdrop-filter').length > 0)
    expect(bodies.length).toBeGreaterThan(0) // the toolbar material exists
    for (const b of bodies) expect(decl(b, '-webkit-backdrop-filter')).toEqual(decl(b, 'backdrop-filter'))
  })

  it('the viewport meta asks for viewport-fit=cover (iOS reports safe-area insets only then)', () => {
    const meta = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(meta.split(/\s*,\s*/)).toContain('viewport-fit=cover')
  })

  it('the helper reads declarations exactly (self-check on a planted rule)', () => {
    const [b] = ruleBodies('.x { -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(3px) }')
    expect(decl(b!, 'backdrop-filter')).toEqual(['blur(3px)'])
    expect(decl(b!, '-webkit-backdrop-filter')).toEqual(['blur(2px)'])
  })
})

/** The body of the first at-rule whose prelude matches `prelude` (brace-matched), and where it starts; null if none. */
function atBlock(text: string, prelude: RegExp): { at: number; body: string } | null {
  const m = prelude.exec(text)
  if (!m) return null
  const open = text.indexOf('{', m.index + m[0].length - 1)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return { at: m.index, body: text.slice(open + 1, i) }
  }
  return null
}
/** Declarations of `prop` in the rules for exactly `selector` inside `text`. */
const ruleDecl = (text: string, selector: string, prop: string) =>
  [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.trim() === selector).flatMap((m) => decl(m[2]!, prop))

// (review R2, 2026-10-03) Without its blur, the 0.68-0.72 material shows scrolled rows straight through "Last updated"
// and the chips (Playwright's WebKit on Windows paints no backdrop blur). So wherever the blur may not be painted, the
// bar is opaque. e2e/layout.spec.ts WK4 checks the media-query branch in the browsers; no engine there lacks
// backdrop-filter, so the @supports branch is pinned here.
describe('the header is opaque wherever its blur may not be painted', () => {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const base = plain.search(/(^|\})\s*\.toolbar\s*\{/)

  it('--material-opaque is an opaque colour in light and in dark', () => {
    expect(base, 'the base .toolbar rule').toBeGreaterThan(-1)
    const values = [...plain.matchAll(/--material-opaque\s*:\s*([^;]+);/g)].map((m) => m[1]!.trim())
    expect(values).toHaveLength(2)
    for (const v of values) expect(v).toMatch(/^(rgb\(\d+ \d+ \d+\)|#[0-9a-f]{6})$/i)
  })

  it('an engine without backdrop-filter (either spelling) gets the opaque bar', () => {
    const block = atBlock(plain, /@supports\s+not\s*\(\s*\(\s*-webkit-backdrop-filter\s*:\s*blur\(1px\)\s*\)\s*or\s*\(\s*backdrop-filter\s*:\s*blur\(1px\)\s*\)\s*\)\s*\{/)
    expect(block, '@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))').not.toBeNull()
    expect(ruleDecl(block!.body, '.toolbar', 'background')).toEqual(['var(--material-opaque)'])
    expect(block!.at, 'after the base .toolbar rule, so it wins the cascade').toBeGreaterThan(base)
  })

  it('a viewer asking for more contrast or less transparency gets the opaque bar, without the blur', () => {
    const block = atBlock(plain, /@media\s+\(prefers-contrast:\s*more\),\s*\(prefers-reduced-transparency:\s*reduce\)\s*\{/)
    expect(block, '@media (prefers-contrast: more), (prefers-reduced-transparency: reduce)').not.toBeNull()
    expect(ruleDecl(block!.body, '.toolbar', 'background')).toEqual(['var(--material-opaque)'])
    expect(ruleDecl(block!.body, '.toolbar', 'backdrop-filter')).toEqual(['none'])
    expect(ruleDecl(block!.body, '.toolbar', '-webkit-backdrop-filter')).toEqual(['none'])
    expect(block!.at, 'after the base .toolbar rule, so it wins the cascade').toBeGreaterThan(base)
  })

  it('the block reader brace-matches (self-check on a planted sheet)', () => {
    const b = atBlock('.a{x:1} @media (m) { .toolbar { background: red } .b { y: 2 } } .c{}', /@media\s+\(m\)\s*\{/)
    expect(b!.body.trim()).toBe('.toolbar { background: red } .b { y: 2 }')
    expect(ruleDecl(b!.body, '.toolbar', 'background')).toEqual(['red'])
    expect(atBlock('.a{}', /@supports/)).toBeNull()
  })
})

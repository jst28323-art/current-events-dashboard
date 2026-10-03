// Phase 1 exit criterion 4 (docs/ROADMAP.md: a down API shows "Live data unavailable", a stopped poller shows "stale"
// within 2x its cadence, the feed comes back) is proven by e2e/fail-closed.spec.ts, and it must be proven in every engine
// the suite runs. Review R1 (2026-10-03): the client-clock "stale" test was tagged @engine-agnostic, so both WebKit
// projects filtered it out, and the criterion's stale clause was Chromium-only while every run stayed green.
// This reads the real Playwright config: no project may filter a fail-closed test out by tag or title, and the spec may
// not skip, fixme or focus one.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import config from '../playwright.config.js'

const here = dirname(fileURLToPath(import.meta.url))
const spec = readFileSync(resolve(here, '../e2e/fail-closed.spec.ts'), 'utf8')

/** Each `test(` declaration: its title (template parts left as written) and its tags. */
function declarations(text: string): Array<{ title: string; tags: string[] }> {
  const out: Array<{ title: string; tags: string[] }> = []
  for (const m of text.matchAll(/(?<![\w.])test\(\s*(['"`])([\s\S]*?)(?<!\\)\1\s*,\s*/g)) {
    const rest = text.slice(m.index + m[0].length)
    const options = rest.startsWith('{') ? rest.slice(0, rest.indexOf('}') + 1) : ''
    const tagValue = /tag\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/.exec(options)?.[1] ?? ''
    out.push({ title: m[2]!, tags: [...tagValue.matchAll(/@[\w-]+/g)].map((t) => t[0]) })
  }
  return out
}

const asList = (g: RegExp | RegExp[] | undefined): RegExp[] => (g === undefined ? [] : Array.isArray(g) ? g : [g])
/** What Playwright matches grep / grepInvert against: the title path and the tags (approximated by file + title). */
const grepText = (d: { title: string; tags: string[] }) => ['fail-closed.spec.ts', d.title, ...d.tags].join(' ')

describe('the fail-closed suite (exit criterion 4) runs in every engine', () => {
  const decls = declarations(spec)

  it('finds the fail-closed tests (the reader is not vacuous)', () => {
    expect(decls.length).toBeGreaterThanOrEqual(8)
    expect(decls.some((d) => d.title.includes('stopped poller turns "stale"'))).toBe(true)
  })

  it('no project filters a fail-closed test out (grep / grepInvert, project or top level)', () => {
    const projects = config.projects ?? []
    expect(projects.map((p) => p.use?.browserName)).toEqual(expect.arrayContaining(['chromium', 'webkit']))
    for (const p of projects) {
      const grep = [...asList(config.grep), ...asList(p.grep)]
      const invert = [...asList(config.grepInvert), ...asList(p.grepInvert)]
      for (const d of decls) {
        const text = grepText(d)
        for (const g of grep) expect(new RegExp(g.source, g.flags.replace('g', '')).test(text), `${p.name} grep ${g} keeps "${d.title}"`).toBe(true)
        for (const g of invert) expect(new RegExp(g.source, g.flags.replace('g', '')).test(text), `${p.name} grepInvert ${g} drops "${d.title}"`).toBe(false)
      }
    }
  })

  it('the spec skips, fixmes and focuses nothing', () => {
    expect(spec).not.toMatch(/\btest\.(skip|fixme|only|fail)\b|\.describe\.(skip|fixme|only)\b/)
  })

  it('the reader sees tags and template titles (self-check on a planted spec)', () => {
    const planted = "test('a \\'b\\' c', { tag: '@x' }, async () => {})\ntest(`m ${mode}`, async () => {})\ntest('d', { tag: ['@y', '@z'] }, async () => {})"
    expect(declarations(planted)).toEqual([
      { title: "a \\'b\\' c", tags: ['@x'] },
      { title: 'm ${mode}', tags: [] },
      { title: 'd', tags: ['@y', '@z'] },
    ])
  })
})

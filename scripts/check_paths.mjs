#!/usr/bin/env node
// scripts/check_paths.mjs — every repo path the living docs cite must exist. A dead pointer on a cold-start page is a
// HALT-AND-ASK for the next session, so it is caught here instead.
//
// Scanned: the living docs (README, CLAUDE, HANDOFF, MAP, TESTING, KNOWN_FAILING, docs/*.md, .claude/skills/*/SKILL.md).
// NOT scanned: docs/research/** (a dated evidence snapshot), HANDOFF_ARCHIVE.md and PROGRESS*.md (history may cite
// paths that later moved — that is what history is).
// A backticked token counts as a repo path when its first segment is a real top-level entry of the repo (or a planned
// top-level directory), or when it is a bare root-style doc name like `TESTING.md`. Everything else (URLs, User-Agent
// strings, upstream file names like `hearings.xml`, `owner/repo` slugs) is not a repo path. Markdown links are
// resolved relative to the doc. A line containing "(planned)" is exempt, and so is any path under a planned top-level
// directory (PLANNED_TOP) until that directory exists: the phase that creates it makes its references checkable. Runtime/ignored paths (.gate/, node_modules/, scratch/, dist/) and placeholders (<x>, *, {}) are skipped.
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname, posix } from 'node:path'
import { REPO_ROOT, readText, isMain } from './lib/git.mjs'

const EXT = /\.(md|mjs|cjs|js|ts|tsx|json|jsonl|ya?ml|html|css|py|sh|toml|svelte|txt|xml|webmanifest)$/
const SKIP_PREFIX = ['.gate/', 'node_modules/', 'scratch/', 'dist/', 'build/', 'origin/', 'refs/', '/', '~', 'C:', 'c:', 'http', 'www.']
export const PLANNED_TOP = ['packages', 'workers', 'apps', 'homepc']

export function rootEntries() {
  return new Set([...readdirSync(REPO_ROOT), ...PLANNED_TOP])
}

export function docsToScan() {
  const top = ['README.md', 'CLAUDE.md', 'HANDOFF.md', 'MAP.md', 'TESTING.md', 'KNOWN_FAILING.md']
  const docs = existsSync(join(REPO_ROOT, 'docs'))
    ? readdirSync(join(REPO_ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`) : []
  const skillsDir = join(REPO_ROOT, '.claude', 'skills')
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir).map((d) => `.claude/skills/${d}/SKILL.md`).filter((p) => existsSync(join(REPO_ROOT, p))) : []
  return [...top, ...docs, ...skills].filter((p) => existsSync(join(REPO_ROOT, p)))
}

export function candidatePaths(line, roots = rootEntries()) {
  const out = []
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    for (let tok of m[1].split(/\s+/)) {
      tok = tok.replace(/[),.;:]+$/, '').replace(/:\d+(-\d+)?$/, '').replace(/#.*$/, '')
      if (!tok || /[<>*{}$|=?'"\\]/.test(tok) || tok.startsWith('-') || tok.includes('://')) continue
      if (SKIP_PREFIX.some((p) => tok.startsWith(p))) continue
      const first = tok.replace(/^\.\//, '').split('/')[0]
      const rooted = tok.includes('/') && roots.has(first)
      const rootDoc = !tok.includes('/') && /^[A-Z][A-Z_]*\.md$/.test(tok)
      if (!(rooted || rootDoc)) continue
      out.push({ kind: 'code', path: tok })
    }
  }
  for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
    const t = m[1].replace(/#.*$/, '')
    if (!t || t.includes('://') || t.startsWith('mailto:')) continue
    out.push({ kind: 'link', path: t })
  }
  return out
}

export function checkDoc(rel, text, exists, roots = rootEntries()) {
  const missing = []
  text.split('\n').forEach((line, i) => {
    if (/\(planned\)/i.test(line)) return
    for (const c of candidatePaths(line, roots)) {
      const top = c.path.replace(/^\.\//, '').split('/')[0]
      if (c.kind === 'code' && PLANNED_TOP.includes(top) && !exists(top)) continue
      const p = c.kind === 'link' ? posix.normalize(posix.join(dirname(rel).replace(/\\/g, '/'), c.path)) : c.path.replace(/^\.\//, '')
      if (!exists(p)) missing.push(`${rel}:${i + 1}: ${c.path}`)
    }
  })
  return missing
}

function main() {
  const exists = (p) => existsSync(join(REPO_ROOT, p))
  const missing = []
  const files = docsToScan()
  for (const f of files) missing.push(...checkDoc(f, readText(f), exists))
  for (const m of missing) console.log(`MISSING  ${m}`)
  console.log(`check_paths: ${missing.length ? 'FAIL' : 'PASS'} (${files.length} docs, ${missing.length} dead path(s))`)
  process.exit(missing.length ? 1 : 0)
}

if (isMain(import.meta.url)) main()

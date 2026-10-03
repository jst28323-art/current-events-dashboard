#!/usr/bin/env node
// scripts/gate.mjs — the merge gate. Runs every check in order, tees a log, and on PASS writes a stamp that names HEAD
// (.gate/stamps/<sha>.json). Three things read the stamp: scripts/ship_state.mjs (verdicts), the git pre-push hook
// (refuses to update main to an unstamped commit, for every push from this clone), and scripts/hooks/push_guard.mjs.
// CI (.github/workflows/ci.yml) runs the same gate with --ci.
//
// Usage:  node scripts/gate.mjs [--ci] [--allow-dirty] [--list]
//   --ci           CI mode: no clean-tree requirement, no stamp, no lock, no history scan (the runner's checkout is the tree)
//   --allow-dirty  local dry run on a dirty tree; never writes a stamp (a stamp must name a committed tree)
//   --list         print the checks and exit
//
// A stamp is written only if HEAD and the working tree are UNCHANGED at the end of the run (an edit made while the gate
// ran would otherwise be what got tested; 2026-10-02 review). Checks fail CLOSED: a check that errors is a FAIL.
//
// ADDING CHECKS. Product checks are NOT added here: list npm script names under package.json "gate.npmScripts"
// (e.g. "typecheck", "test", "build", "e2e") and the gate runs `npm run <name>` for each, in order. A package.json script
// named test/typecheck/build/e2e/lint that is NOT listed there fails the gate (no silently skipped suite). Edit this file
// only for harness-level checks. Never loosen a check to pass (TESTING.md); a wrong check is fixed in its own commit.
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync, appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, git, run, readJson, isMain } from './lib/git.mjs'

export const SECRET_PATTERNS_FILE = 'enforcement/secret-patterns.txt'
const MUST_GATE = ['test', 'typecheck', 'build', 'e2e', 'lint']

export function findBash() {
  if (process.platform !== 'win32') return 'bash'
  // Prefer Git for Windows' bash; a bare `bash` on Windows can resolve to WSL, which is a different machine.
  const ep = git(['--exec-path']).out // e.g. C:/Program Files/Git/mingw64/libexec/git-core
  if (ep) {
    const cand = join(ep, '..', '..', '..', 'bin', 'bash.exe')
    if (existsSync(cand)) return cand
  }
  return 'bash'
}

export function findTests(dir = 'tests', root = REPO_ROOT) {
  const out = []
  const walk = (rel) => {
    const abs = join(root, rel)
    if (!existsSync(abs)) return
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'fixtures') walk(r) }
      else if (/\.test\.(mjs|cjs|js)$/.test(e.name)) out.push(r)
    }
  }
  walk(dir)
  return out.sort()
}

export function secretPattern(root = REPO_ROOT) {
  const p = join(root, SECRET_PATTERNS_FILE)
  if (!existsSync(p)) return null
  return readFileSync(p, 'utf8').replace(/[\r\n]/g, '')
}

// Scans tracked files (and, unless ci, the added lines of every unpushed commit) for secret shapes. Fails CLOSED.
export function secretScan({ cwd = REPO_ROOT, ci = false } = {}) {
  const re = secretPattern(cwd)
  if (!re) return { ok: false, detail: `${SECRET_PATTERNS_FILE} missing: cannot scan (fail closed)` }
  const g = (args) => run('git', args, { cwd })
  const r = g(['grep', '-nIE', '-e', re, '--', '.'])
  if (r.code !== 0 && r.code !== 1) return { ok: false, detail: `git grep failed (exit ${r.code}): ${r.err}` }
  const hits = (r.code === 0 ? r.out.split('\n') : []).filter((l) => l && !l.includes('pragma: allowlist secret'))
  if (!ci) {
    const up = g(['rev-parse', '--verify', '--quiet', '@{u}'])
    const range = up.ok && up.out ? [`${up.out}..HEAD`] : ['HEAD']
    const log = g(['log', '-p', '--no-color', '--unified=0', ...range])
    if (!log.ok) return { ok: false, detail: `git log failed: ${log.err}` }
    const rx = new RegExp(re)
    for (const l of log.out.split('\n')) {
      if (l.startsWith('+') && !l.startsWith('+++') && !l.includes('pragma: allowlist secret') && rx.test(l)) hits.push(`(unpushed history) ${l.slice(0, 120)}`)
    }
  }
  return { ok: hits.length === 0, detail: hits.length ? hits.slice(0, 8).join('\n') : 'no secret shapes in tracked files or unpushed history' }
}

// Workspace package.json files (supports "dir" and "dir/*" patterns in package.json "workspaces").
export function workspacePackages(pkg, root = REPO_ROOT) {
  const out = []
  for (const pat of (pkg && Array.isArray(pkg.workspaces) ? pkg.workspaces : [])) {
    const dirs = pat.endsWith('/*')
      ? (existsSync(join(root, pat.slice(0, -2))) ? readdirSync(join(root, pat.slice(0, -2)), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `${pat.slice(0, -2)}/${d.name}`) : [])
      : [pat]
    for (const d of dirs) {
      const j = readJson(`${d}/package.json`)
      if (j && !j.__parse_error) out.push({ dir: d, pkg: j })
    }
  }
  return out
}

// Scripts named test/typecheck/build/e2e/lint that the gate would never run: root scripts not listed in
// gate.npmScripts, and workspace scripts that no gated root script reaches (via --workspaces/-ws, or by naming the
// workspace with --workspace/-w). A suite nobody runs is a guard that fails open (2026-10-02 review).
export function ungatedScripts(pkg, workspaces = []) {
  const declared = ((pkg && pkg.gate && pkg.gate.npmScripts) || [])
  const out = Object.keys((pkg && pkg.scripts) || {}).filter((s) => MUST_GATE.includes(s) && !declared.includes(s))
  const gatedCmds = declared.map((n) => String(((pkg && pkg.scripts) || {})[n] || ''))
  for (const ws of workspaces) {
    for (const s of Object.keys(ws.pkg.scripts || {}).filter((x) => MUST_GATE.includes(x))) {
      const reached = gatedCmds.some((c) => new RegExp(`\\b${s}\\b`).test(c) && (/(--workspaces|\s-ws\b)/.test(c) ||
        c.includes(ws.dir) || (ws.pkg.name && c.includes(ws.pkg.name))))
      if (!reached) out.push(`${ws.dir}:${s}`)
    }
  }
  return out
}

/** What a failing step prints: every line that names an error, wherever it is, then the last `tail` lines. A plain tail
 * hid a TypeScript error on 2026-10-03: tsc writes its errors to stdout, which comes before stderr here, and wrangler's
 * type-generation chatter filled the last 25 lines. */
export function failureExcerpt(text, { tail = 25, maxErrors = 15 } = {}) {
  const lines = String(text || '').split('\n')
  const last = lines.slice(-tail)
  const errorish = /\berror\b|\bFAIL(?:ED)?\b|AssertionError|✗|×/i
  const errors = lines.slice(0, Math.max(0, lines.length - tail)).filter((l) => errorish.test(l)).slice(0, maxErrors)
  return errors.length ? [...errors, '…', ...last].join('\n') : last.join('\n')
}

export function checks({ ci }) {
  const node = process.execPath
  const bash = findBash()
  const pkg = readJson('package.json') || {}
  const npmScripts = (pkg.gate && pkg.gate.npmScripts) || []
  return [
    {
      name: 'harness-tests',
      why: 'the harness scripts are code; their branches are pinned by tests (discovered recursively under tests/)',
      fn: () => {
        const files = findTests()
        if (!files.length) return { ok: false, detail: 'no test files found under tests/ (fail closed)' }
        const r = run(node, ['--test', ...files], { timeoutMs: 15 * 60_000 })
        return { ok: r.ok, detail: failureExcerpt([r.out, r.err].filter(Boolean).join('\n')) }
      },
    },
    { name: 'handoff-lint', why: 'HANDOFF.md shape: <=80 lines, one NEXT ACTION, no hand-written sha', cmd: [node, ['scripts/handoff_lint.mjs']] },
    { name: 'doc-paths', why: 'every repo path the docs cite must exist (or be planned)', cmd: [node, ['scripts/check_paths.mjs']] },
    {
      name: 'json-valid',
      why: 'machine-read state files must parse',
      fn: () => {
        const cs = join(REPO_ROOT, 'docs', 'coldstart')
        const files = ['package.json', '.claude/settings.json', 'docs/STATUS.json',
          ...(existsSync(cs) ? readdirSync(cs, { withFileTypes: true }) : [])
            .filter((d) => d.isDirectory()).map((d) => `docs/coldstart/${d.name}/RESULT.json`)]
        const bad = files.filter((f) => existsSync(join(REPO_ROOT, f))).filter((f) => { const j = readJson(f); return !j || j.__parse_error })
        return { ok: bad.length === 0, detail: bad.length ? `unparseable: ${bad.join(', ')}` : `${files.length} files ok` }
      },
    },
    { name: 'hook-selftest:pre-commit', why: 'the secret scan must still catch a planted key', cmd: [bash, ['enforcement/git-hooks/pre-commit', '--self-test']] },
    { name: 'hook-selftest:pre-push', why: 'force-push, deletion and ungated pushes to main must still be refused', cmd: [bash, ['enforcement/git-hooks/pre-push', '--self-test']] },
    { name: 'tracked-secrets', why: 'public repo: no committed credential, ever', fn: () => secretScan({ ci }) },
    {
      name: 'npm-scripts-gated',
      why: 'a test/typecheck/build/e2e/lint script that the gate does not run is a suite nobody runs',
      fn: () => {
        const u = ungatedScripts(pkg, workspacePackages(pkg))
        return { ok: u.length === 0, detail: u.length ? `not run by the gate (list root scripts in package.json gate.npmScripts; reach workspace scripts from a gated root script, e.g. "npm run test --workspaces"): ${u.join(', ')}` : 'ok' }
      },
    },
    ...npmScripts.map((s) => ({ name: `npm:${s}`, why: 'product check declared in package.json gate.npmScripts', cmd: [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', '--silent', s]], shell: process.platform === 'win32' })),
  ]
}

function main() {
  const argv = new Set(process.argv.slice(2))
  const ci = argv.has('--ci')
  const allowDirty = argv.has('--allow-dirty')
  const list = checks({ ci })
  if (argv.has('--list')) {
    for (const c of list) console.log(`${c.name.padEnd(28)} ${c.why}`)
    return
  }
  const head = git(['rev-parse', 'HEAD']).out
  if (!head) { console.error('gate: not a git repo with commits'); process.exit(2) }
  const status = () => git(['status', '--porcelain=v1', '--untracked-files=all']).out
  const dirty = status()
  if (!ci && dirty && !allowDirty) {
    console.error('gate: the tree is dirty. A stamp must name a committed tree: commit first (or --allow-dirty for a stamp-less dry run).')
    console.error(dirty.split('\n').slice(0, 10).join('\n'))
    process.exit(2)
  }
  const gdir = join(REPO_ROOT, '.gate')
  const lock = join(gdir, 'running.json')
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const log = join(gdir, 'logs', `${ts}-${head.slice(0, 7)}.log`)
  const cleanup = () => { if (!ci) rmSync(lock, { force: true }) }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130) })
  if (!ci) {
    mkdirSync(join(gdir, 'logs'), { recursive: true })
    writeFileSync(lock, JSON.stringify({ pid: process.pid, sha: head, started: new Date().toISOString() }))
  }
  let pass = true
  try {
    const out = (s) => { console.log(s); if (!ci) appendFileSync(log, s + '\n') }
    out(`gate: ${head} ${ts}${ci ? ' (ci)' : ''}${allowDirty ? ' (dirty dry run — no stamp)' : ''}`)
    const results = []
    for (const c of list) {
      const t0 = Date.now()
      let ok, detail
      try {
        if (c.fn) ({ ok, detail } = c.fn())
        else {
          const r = run(c.cmd[0], c.cmd[1], { timeoutMs: 15 * 60_000, shell: !!c.shell })
          ok = r.ok
          detail = failureExcerpt([r.out, r.err].filter(Boolean).join('\n'))
        }
      } catch (e) { ok = false; detail = String((e && e.stack) || e) }
      const ms = Date.now() - t0
      results.push({ name: c.name, ok: !!ok, ms })
      out(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  (${ms} ms)`)
      if (!ok) { pass = false; out(String(detail || '').split('\n').map((l) => `      ${l}`).join('\n')) }
    }
    // The stamp must describe the tree that was actually tested.
    if (!ci) {
      const headNow = git(['rev-parse', 'HEAD']).out
      const dirtyNow = status()
      if (headNow !== head || dirtyNow !== dirty) {
        pass = false
        out(`FAIL  tree-unchanged  (HEAD or the working tree changed while the gate ran: ${headNow !== head ? 'HEAD moved' : 'files changed'}; re-run on a still tree)`)
      }
    }
    const verdict = pass ? 'PASS' : 'FAIL'
    if (!ci) {
      const rec = { sha: head, verdict, at: ts, dirty_dry_run: allowDirty && !!dirty, checks: results, log: log.replace(REPO_ROOT, '.').replace(/\\/g, '/') }
      writeFileSync(join(gdir, 'last.json'), JSON.stringify(rec, null, 2))
      if (pass && !(allowDirty && dirty)) {
        mkdirSync(join(gdir, 'stamps'), { recursive: true })
        writeFileSync(join(gdir, 'stamps', `${head}.json`), JSON.stringify(rec, null, 2))
      }
    }
    out(`gate: ${verdict}`)
  } finally {
    cleanup()
  }
  process.exit(pass ? 0 : 1)
}

if (isMain(import.meta.url)) main()

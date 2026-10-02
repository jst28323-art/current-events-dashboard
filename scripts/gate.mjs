#!/usr/bin/env node
// scripts/gate.mjs — the merge gate. Runs every check in order, tees a log, and on PASS writes a stamp that names
// HEAD (.gate/stamps/<sha>.json). scripts/ship_state.mjs reads the stamp; scripts/hooks/push_guard.mjs refuses a
// push from a Claude session unless ship_state says PUSH. CI (.github/workflows/ci.yml) runs the same gate with --ci.
//
// Usage:  node scripts/gate.mjs [--ci] [--allow-dirty] [--list]
//   --ci           CI mode: no clean-tree requirement, no stamp, no lock (the runner's checkout is the tree)
//   --allow-dirty  local dry run on a dirty tree; never writes a stamp (a stamp must name a committed tree)
//   --list         print the checks and exit
//
// ADDING CHECKS. Product checks are NOT added here: list npm script names under package.json "gate.npmScripts"
// (e.g. "typecheck", "test", "build", "e2e") and the gate runs `npm run <name>` for each, in order. Edit this file
// only for harness-level checks. A check is never loosened to make a gate pass (TESTING.md); a check that is wrong
// is fixed in its own commit that says why.
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { REPO_ROOT, git, run, readJson, isMain } from './lib/git.mjs'

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

function listFiles(dir, re) {
  const abs = join(REPO_ROOT, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs).filter((f) => re.test(f)).map((f) => `${dir}/${f}`)
}

export function checks({ ci }) {
  const node = process.execPath
  const bash = findBash()
  const pkg = readJson('package.json') || {}
  const npmScripts = (pkg.gate && pkg.gate.npmScripts) || []
  const list = [
    {
      name: 'harness-tests',
      why: 'the harness scripts are code; their branches are pinned by tests',
      cmd: [node, ['--test', ...listFiles('tests/harness', /\.test\.mjs$/)]],
    },
    { name: 'handoff-lint', why: 'HANDOFF.md shape: <=80 lines, one NEXT ACTION, no hand-written sha', cmd: [node, ['scripts/handoff_lint.mjs']] },
    { name: 'doc-paths', why: 'every repo path the docs cite must exist (or be marked planned)', cmd: [node, ['scripts/check_paths.mjs']] },
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
    { name: 'hook-selftest:pre-push', why: 'force-push / branch deletion must still be refused', cmd: [bash, ['enforcement/git-hooks/pre-push', '--self-test']] },
    {
      name: 'tracked-secrets',
      why: 'public repo: no committed credential, ever (the pre-commit hook only sees staged diffs)',
      fn: () => {
        const re = '-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|sk-ant-[A-Za-z0-9_-]{20,}' // pragma: allowlist secret
        const r = git(['grep', '-nIE', re, '--', '.', ':!enforcement/git-hooks/pre-commit', ':!scripts/gate.mjs'])
        const hits = r.out.split('\n').filter((l) => l && !l.includes('pragma: allowlist secret'))
        return { ok: hits.length === 0, detail: hits.length ? hits.slice(0, 5).join('\n') : 'no secret shapes in tracked files' }
      },
    },
    ...npmScripts.map((s) => ({ name: `npm:${s}`, why: 'product check declared in package.json gate.npmScripts', cmd: [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', '--silent', s]], shell: process.platform === 'win32' })),
  ]
  return list
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
  const dirty = git(['status', '--porcelain=v1', '--untracked-files=all']).out
  if (!ci && dirty && !allowDirty) {
    console.error('gate: the tree is dirty. A stamp must name a committed tree: commit first (or --allow-dirty for a stamp-less dry run).')
    console.error(dirty.split('\n').slice(0, 10).join('\n'))
    process.exit(2)
  }
  const gdir = join(REPO_ROOT, '.gate')
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const log = join(gdir, 'logs', `${ts}-${head.slice(0, 7)}.log`)
  if (!ci) {
    mkdirSync(join(gdir, 'logs'), { recursive: true })
    writeFileSync(join(gdir, 'running.json'), JSON.stringify({ pid: process.pid, sha: head, started: ts }))
  }
  const out = (s) => { console.log(s); if (!ci) appendFileSync(log, s + '\n') }
  out(`gate: ${head} ${ts}${ci ? ' (ci)' : ''}${allowDirty ? ' (dirty dry run — no stamp)' : ''}`)
  const results = []
  let pass = true
  for (const c of list) {
    const t0 = Date.now()
    let ok, detail
    if (c.fn) {
      try { ({ ok, detail } = c.fn()) } catch (e) { ok = false; detail = String(e && e.stack || e) }
    } else {
      const r = run(c.cmd[0], c.cmd[1], { timeoutMs: 15 * 60_000, shell: !!c.shell })
      ok = r.ok
      detail = [r.out, r.err].filter(Boolean).join('\n').split('\n').slice(-25).join('\n')
    }
    const ms = Date.now() - t0
    results.push({ name: c.name, ok, ms })
    out(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  (${ms} ms)`)
    if (!ok) { pass = false; out(detail.split('\n').map((l) => `      ${l}`).join('\n')) }
  }
  const verdict = pass ? 'PASS' : 'FAIL'
  if (!ci) {
    const rec = { sha: head, verdict, at: ts, dirty_dry_run: allowDirty && !!dirty, checks: results, log: log.replace(REPO_ROOT, '.').replace(/\\/g, '/') }
    writeFileSync(join(gdir, 'last.json'), JSON.stringify(rec, null, 2))
    if (pass && !(allowDirty && dirty)) {
      mkdirSync(join(gdir, 'stamps'), { recursive: true })
      writeFileSync(join(gdir, 'stamps', `${head}.json`), JSON.stringify(rec, null, 2))
    }
    rmSync(join(gdir, 'running.json'), { force: true })
  }
  out(`gate: ${verdict}`)
  process.exit(pass ? 0 : 1)
}

if (isMain(import.meta.url)) main()

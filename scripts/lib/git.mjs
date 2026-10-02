// scripts/lib/git.mjs — tiny, dependency-free helpers shared by the harness scripts.
// Every git call goes through run(): it never throws, it returns {ok, out, err, code}.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export function run(cmd, args, { cwd = REPO_ROOT, timeoutMs = 60_000, input, shell = false } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    shell, // needed for .cmd shims (npm.cmd) on Windows
    encoding: 'utf8',
    timeout: timeoutMs,
    input,
    windowsHide: true,
    // never let git block on a credential prompt; a hung prompt reads like a network stall
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return {
    ok: r.status === 0,
    code: r.status,
    // trim the END only: a porcelain status line starts with a meaningful space (" M path")
    out: (r.stdout || '').replace(/\r/g, '').replace(/\s+$/, ''),
    err: (r.stderr || '').replace(/\r/g, '').trim() + (r.error ? ` ${r.error.message}` : ''),
  }
}

export const git = (args, opts) => run('git', args, opts)

export function readText(rel) {
  const p = join(REPO_ROOT, rel)
  return existsSync(p) ? readFileSync(p, 'utf8').replace(/\r/g, '') : null
}

export function readJson(rel) {
  const t = readText(rel)
  if (t === null) return null
  try { return JSON.parse(t) } catch { return { __parse_error: true } }
}

export function isMain(importMetaUrl) {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(importMetaUrl)
}

export function hasCommand(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore', timeout: 15_000, windowsHide: true })
    return true
  } catch {
    return false
  }
}

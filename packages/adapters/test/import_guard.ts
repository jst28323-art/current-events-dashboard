// The D-058 import guard (docs/design/P2.1.md §4.2), shared by live_list.test.ts and its own bypass test. Two
// layers, both fail closed:
//   1. the REAL module graph: esbuild (the bundler wrangler deploys the Worker with; 0.28.1 via wrangler) bundles each
//      entry with a metafile, and every input path is checked. Anything it cannot resolve throws, so the test fails.
//   2. a text walk of every source file under the app roots, kept as a second opinion: it reads .js/.mjs/.cjs/.jsx/
//      .mts/.cts files too (any script file that is not .ts/.tsx is itself refused), strips comments, and finds
//      import/export/require anywhere on a line, not only at its start.
// Review of 483d7ab (keys F1) got four imports past the old regex-only walk (a .js re-export shim, an .mjs shim, an
// import with a `;` inside a comment, two imports on one line); test/import_guard.test.ts pins each one.
import { build } from 'esbuild'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

/** Specifiers that name fixture-only code directly. */
export const FORBIDDEN_SPECIFIER = /(^@ced\/adapters\/fixture-only$)|(^@ced\/schema\/v02$)|generated\/members|fixture_only|\/v02\//

/** A repo path (forward slashes, relative to the root) that belongs to P2.1 and must never reach the Worker or page. */
export function isP21Path(rel: string): boolean {
  return /^packages\/schema\/src\/v02\//.test(rel) ||
    /^packages\/adapters\/src\/(fixture_only\.ts|generated\/|lib\/(members|stub|eastern|xmlscan|congress_ids)\.ts|sources\/(house_clerk_votes|senate_lis_votes|house_clerk_floor|senate_schedule|senate_pressgallery)\.ts)/.test(rel) ||
    rel.startsWith('UNKNOWN-WORKSPACE-SPECIFIER/')
}

const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/

/** Every file under `dir` (all extensions). */
export function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p, out)
    else out.push(p)
  }
  return out
}

/** Script files that are not .ts/.tsx: refused outright (the app roots are TypeScript only). */
export function nonTsScripts(files: readonly string[]): string[] {
  return files.filter((f) => SCRIPT.test(f) && !/\.(ts|tsx)$/.test(f))
}
export const scriptFiles = (files: readonly string[]): string[] => files.filter((f) => SCRIPT.test(f))

/** Block and line comments removed (naive about strings; callers also scan the raw text, so it can only add hits). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

function specifiersOf(text: string, valueOnly: boolean): string[] {
  const out = new Set<string>()
  for (const t of [text, stripComments(text)]) {
    for (const m of t.matchAll(/\b(import|export)\b(\s+type\b)?([^'"]*?)\bfrom\s*['"]([^'"]+)['"]/g)) if (!valueOnly || !m[2]) out.add(m[4]!)
    for (const m of t.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) out.add(m[1]!)
    for (const m of t.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.add(m[1]!)
  }
  return [...out]
}
/** Every import specifier, type-only included (the literal check of DESIGN §4.2). */
export const allSpecifiers = (text: string): string[] => specifiersOf(text, false)
/** Value imports and re-exports (type-only ones are erased by the compiler and never bundled). */
export const valueSpecifiers = (text: string): string[] => specifiersOf(text, true)

export const WORKSPACE: Record<string, string> = {
  '@ced/adapters': 'packages/adapters/src/index.ts',
  '@ced/adapters/fixture-only': 'packages/adapters/src/fixture_only.ts',
  '@ced/schema': 'packages/schema/src/index.ts',
  '@ced/schema/order': 'packages/schema/src/order.ts',
  '@ced/schema/v02': 'packages/schema/src/v02/index.ts',
  '@ced/schema/event.schema.json': 'packages/schema/src/event.schema.json',
}

/** The repo files reachable by value imports from `entries` by the text walk (workspace packages followed; npm not). */
export function reachable(root: string, entries: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!SCRIPT.test(file) || !existsSync(file)) continue
    for (const spec of valueSpecifiers(readFileSync(file, 'utf8'))) {
      let target: string | null = null
      if (spec.startsWith('.') || isAbsolute(spec)) {
        const base = spec.startsWith('.') ? resolve(dirname(file), spec) : spec
        const candidates = [
          base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base.replace(/\.mjs$/, '.mts'), base.replace(/\.cjs$/, '.cts'),
          base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'),
        ]
        target = candidates.find((p) => existsSync(p) && statSync(p).isFile()) ?? base
      } else if (spec.startsWith('@ced/')) {
        target = join(root, WORKSPACE[spec] ?? `UNKNOWN-WORKSPACE-SPECIFIER/${spec}`)
      }
      if (target) queue.push(target)
    }
  }
  return seen
}

/** The input files of a real esbuild bundle of `entry` (paths relative to `relTo`, default `root`; forward slashes).
 * Throws when any import does not resolve. `nodePaths` lets a synthetic tree outside the repo resolve the workspace
 * packages. */
export async function bundleInputs(root: string, entry: string, nodePaths: string[] = [], relTo: string = root): Promise<string[]> {
  const r = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'browser', 'import'],
    external: ['cloudflare:*', 'node:*'],
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    jsx: 'automatic',
    nodePaths,
    logLevel: 'silent',
  })
  return Object.keys(r.metafile!.inputs).map((p) => relative(relTo, resolve(root, p)).replaceAll('\\', '/'))
}

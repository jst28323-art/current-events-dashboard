// The D-058 import guard catches each bypass the review of 483d7ab (keys F1) found in the old regex-only walk, on a
// synthetic Worker tree written to a temp directory whose imports reach the REAL P2.1 modules of this repo:
//   shim.js       `export { houseClerkVotes as x } from '@ced/adapters/fixture-only'` (a .js file was never read)
//   esm_shim.mjs  re-exports packages/adapters/src/fixture_only.ts (an .mjs file was never read)
//   comment.ts    `import { houseClerkFloor /* ; */ } from '…/house_clerk_floor.ts'` (a `;` in a comment hid it)
//   oneline.ts    `import { q } from './a.js'; import { senateSchedule } from '…/senate_schedule.ts'` (not at a line start)
// The old walk reported nothing for all four (scratch/review_keys/walk.out.txt: literalBad [], p21 []).
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import {
  FORBIDDEN_SPECIFIER, allSpecifiers, bundleInputs, isP21Path, nonTsScripts, reachable, scriptFiles, walkFiles,
} from './import_guard.js'
import { REPO_ROOT } from './replay.js'

const repo = (p: string) => join(REPO_ROOT, p).replaceAll('\\', '/')
let T = ''

beforeAll(() => {
  T = mkdtempSync(join(tmpdir(), 'ced-import-guard-'))
  const files: Record<string, string> = {
    'index.ts': [
      "import { x } from './shim.js'",
      "import { z } from './other.ts'",
      "import { b } from './comment.ts'",
      "import { s } from './oneline.ts'",
      'export default { fetch() { return [x, z, b, s] } }',
    ].join('\n'),
    'shim.js': "export { houseClerkVotes as x } from '@ced/adapters/fixture-only'\n",
    'esm_shim.mjs': `export { senateLisVotes as y } from '${repo('packages/adapters/src/fixture_only.ts')}'\n`,
    'other.ts': "import { y } from './esm_shim.mjs'\nexport const z = y\n",
    'comment.ts': `import { houseClerkFloor /* ; */ } from '${repo('packages/adapters/src/sources/house_clerk_floor.ts')}'\nexport const b = houseClerkFloor\n`,
    'a.ts': 'export const q = 1\n',
    'oneline.ts': `import { q } from './a.js'; import { senateSchedule } from '${repo('packages/adapters/src/sources/senate_schedule.ts')}'\nexport const s = [q, senateSchedule]\n`,
  }
  for (const [name, text] of Object.entries(files)) writeFileSync(join(T, name), text)
})
afterAll(() => {
  if (T) rmSync(T, { recursive: true, force: true })
})

describe('import guard: the review 483d7ab bypasses are caught', () => {
  test('a script file that is not .ts/.tsx is refused outright (shim.js, esm_shim.mjs)', () => {
    expect(nonTsScripts(walkFiles(T)).map((f) => relative(T, f)).sort()).toEqual(['esm_shim.mjs', 'shim.js'])
  })
  test('the literal check reads .js/.mjs files: both shims name a forbidden specifier', () => {
    const bad = scriptFiles(walkFiles(T)).flatMap((f) => allSpecifiers(readFileSync(f, 'utf8')).filter((s) => FORBIDDEN_SPECIFIER.test(s)).map(() => relative(T, f)))
    expect(bad.sort()).toEqual(['esm_shim.mjs', 'shim.js'])
  })
  test('the text walk follows .js/.mjs files, a `;` inside a comment and a second import on one line', () => {
    const p21 = [...reachable(REPO_ROOT, scriptFiles(walkFiles(T)))].map((f) => relative(REPO_ROOT, f).replaceAll('\\', '/')).filter(isP21Path)
    expect(p21).toEqual(expect.arrayContaining([
      'packages/adapters/src/fixture_only.ts',
      'packages/adapters/src/sources/house_clerk_floor.ts',
      'packages/adapters/src/sources/senate_schedule.ts',
    ]))
  })
  test('the real bundle graph (esbuild) of the synthetic Worker holds all three P2.1 modules', async () => {
    const inputs = await bundleInputs(T, 'index.ts', [join(REPO_ROOT, 'node_modules')], REPO_ROOT)
    const p21 = inputs.filter(isP21Path)
    expect(p21).toEqual(expect.arrayContaining([
      'packages/adapters/src/fixture_only.ts',
      'packages/adapters/src/sources/house_clerk_floor.ts',
      'packages/adapters/src/sources/senate_schedule.ts',
    ]))
  })
  test('an import that does not resolve fails the bundle (fail closed), never an empty graph', async () => {
    writeFileSync(join(T, 'broken.ts'), "import { nope } from './missing.js'\nexport default nope\n")
    await expect(bundleInputs(T, 'broken.ts')).rejects.toThrow()
  })
})

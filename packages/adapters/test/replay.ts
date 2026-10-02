// Test helper (Node only): turn a recorded fixture into the FetchedResponse an adapter sees live.
// fixtures/<source_id>/<YYYY-MM-DD>/<name> holds the body bytes; <name>.meta.json holds the url, status, headers and
// fetched_at (layout: fixtures/README.md). Tests never hit the network (TESTING.md rule 1).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { FetchedResponse } from '../src/types.js'

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export function fixturePath(sourceId: string, date: string, name: string): string {
  return join(REPO_ROOT, 'fixtures', sourceId, date, name)
}

export function replay(sourceId: string, date: string, name: string): FetchedResponse {
  const p = fixturePath(sourceId, date, name)
  const meta = JSON.parse(readFileSync(`${p}.meta.json`, 'utf8'))
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta.response_headers ?? {})) headers[k.toLowerCase()] = String(v)
  return {
    url: meta.url,
    status: meta.status,
    headers,
    body: readFileSync(p, 'utf8'),
    fetchedAt: new Date(meta.fetched_at).toISOString(),
  }
}

/** The same response with a different body/status, for hand-built edge cases (never written back to fixtures/). */
export function variant(base: FetchedResponse, patch: Partial<FetchedResponse>): FetchedResponse {
  return { ...base, ...patch, headers: { ...base.headers, ...(patch.headers ?? {}) } }
}

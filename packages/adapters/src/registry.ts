// The source registry: every source the Worker polls, with its polite-polling settings (docs/SOURCES.md is the
// catalog; this list is what actually runs). Add a source only through the add-source skill.
import type { SourceDefinition } from './types.js'
import { frApi } from './sources/fr_api.js'
import { whFeeds } from './sources/wh_feeds.js'

export const SOURCES: readonly SourceDefinition[] = [frApi, whFeeds]

export function sourceById(id: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.source_id === id)
}

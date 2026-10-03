// The foundation-stage parse used by each P2.1 adapter until its builder replaces it (scratch/phase2/DESIGN.md §6 Stage 1):
// every response is health `drift` "adapter not built yet", zero events. Tests that need a real adapter
// (workers/api/test/replay_congress.test.ts) fail while a source still answers with exactly this detail.
import type { AdapterOutput, FetchedResponse } from '../types.js'

export const ADAPTER_NOT_BUILT = 'adapter not built yet'

export function stubParse(sourceId: string): (endpointId: string, res: FetchedResponse) => AdapterOutput {
  return (endpointId) => ({
    events: [],
    health: { source_id: sourceId, endpoint: endpointId, status: 'drift', detail: ADAPTER_NOT_BUILT, items_seen: 0 },
  })
}

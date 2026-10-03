// How the rest of the Worker reaches the one HubDO instance. Kept OUT of the main module (index.ts): workerd treats
// every named export of the main module as an entrypoint and refuses to start the Worker if one is a plain value
// ("Incorrect type for map entry ...": found by the probe Worker's plain-Miniflare run, 2026-10-02; docs/TRAPS.md).
import type { HubDO } from './hub.js'

/** The one HubDO instance (all state lives in it). */
export const HUB_NAME = 'hub'

export function hub(env: Env): DurableObjectStub<HubDO> {
  return env.HUB.getByName(HUB_NAME)
}

// Compile-time guard: Workers RPC types a method whose result is not provably structured-cloneable as `never`, and
// `never` is assignable to anything, so a stub passed as PollHub/ApiHub would typecheck while lying. Each HubDO
// method's awaited stub result must not be never (see EventsAnswer in hub.ts).
type IsNever<T> = [T] extends [never] ? true : false
type MustBeFalse<T extends false> = T
type StubResult<K extends keyof DurableObjectStub<HubDO>> = DurableObjectStub<HubDO>[K] extends (...a: never[]) => infer R ? Awaited<R> : never
export type HubRpcResultsAreTyped = [
  MustBeFalse<IsNever<StubResult<'plan'>>>,
  MustBeFalse<IsNever<StubResult<'claim'>>>,
  MustBeFalse<IsNever<StubResult<'recordPoll'>>>,
  MustBeFalse<IsNever<StubResult<'events'>>>,
  MustBeFalse<IsNever<StubResult<'recent'>>>,
  MustBeFalse<IsNever<StubResult<'history'>>>,
  MustBeFalse<IsNever<StubResult<'status'>>>,
]

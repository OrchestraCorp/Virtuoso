/** Model connection operations; credentials are write-only at this Client boundary. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-model-connections/remote'
import type {
  ConnectionDraft, ConnectionProtocol, ConnectionsSnapshot, ConnectionTestResult, DiscoveredModel,
} from '@deepseek-ai/dsh-model-connections/types'

/** Localized failure category; remote diagnostics never contain input credentials in the UI. */
export type MaasFailure = 'conflict' | 'invalid' | 'credential' | 'default-in-use' | 'unavailable' | 'failed'
/** One completed operation, with a presentation-owned failure category. */
export type MaasResult<T> = { ok: true; value: T } | { ok: false; error: MaasFailure }
/** Model connection operations consumed by the settings controller. */
export interface MaasOperations {
  /** @returns the current redacted configuration and bundled catalog. */
  list(this: void): Promise<MaasResult<ConnectionsSnapshot>>
  /**
   * @param draft - connection draft with no stored credential.
   * @param revision - expected configuration revision.
   * @param apiKey - replacement credential; omission preserves the saved key.
   * @returns committed configuration or a localized failure category.
   */
  save(this: void, draft: ConnectionDraft, revision: number, apiKey?: string): Promise<MaasResult<ConnectionsSnapshot>>
  /**
   * @param id - connection to remove.
   * @param revision - expected configuration revision.
   * @returns committed configuration or a refusal.
   */
  remove(this: void, id: string, revision: number): Promise<MaasResult<ConnectionsSnapshot>>
  /**
   * @param id - saved connection identifier.
   * @param modelId - saved model identifier.
   * @param revision - expected configuration revision.
   * @returns committed default selection or a refusal.
   */
  setDefault(this: void, id: string, modelId: string, revision: number): Promise<MaasResult<ConnectionsSnapshot>>
  /**
   * @param id - saved connection to query after an explicit user action.
   * @param protocol - user-selected model-list protocol.
   * @returns candidates without storing or enabling them.
   */
  discover(this: void, id: string, protocol: ConnectionProtocol): Promise<MaasResult<DiscoveredModel[]>>
  /**
   * @param id - saved connection identifier.
   * @param modelId - saved model identifier.
   * @returns one bounded probe outcome with a safe diagnostic.
   */
  test(this: void, id: string, modelId: string): Promise<MaasResult<ConnectionTestResult>>
}

function failure(code: string): MaasFailure {
  if (code === 'model-connections/conflict') return 'conflict'
  if (code === 'model-connections/invalid') return 'invalid'
  if (code === 'model-connections/default-in-use') return 'default-in-use'
  if (code === 'model-connections/credential-unavailable') return 'credential'
  if (code.startsWith('gateway/')) return 'unavailable'
  return 'failed'
}

async function result<T>(request: Promise<{ ok: true; value: T } | { ok: false; error: { code: string } }>): Promise<MaasResult<T>> {
  try {
    const response = await request
    return response.ok ? response : { ok: false, error: failure(response.error.code) }
  } catch (_error) {
    return { ok: false, error: 'unavailable' }
  }
}

/**
 * Bind the connection domain's Remote methods at the plugin registration site.
 * @param ctx - Client context with the modelConnections Remote namespace available.
 * @returns typed operations that expose no stored credential values.
 */
export function createMaasOperations(ctx: Context): MaasOperations {
  return {
    list: () => result(ctx.remote.modelConnections.list()),
    save: (draft, revision, apiKey) => result(ctx.remote.modelConnections.save(draft, revision, apiKey)),
    remove: (id, revision) => result(ctx.remote.modelConnections.deleteConnection(id, revision)),
    setDefault: (id, modelId, revision) => result(ctx.remote.modelConnections.setDefault(id, modelId, revision)),
    discover: (id, protocol) => result(ctx.remote.modelConnections.discover(id, protocol)),
    test: (id, modelId) => result(ctx.remote.modelConnections.test(id, modelId)),
  }
}

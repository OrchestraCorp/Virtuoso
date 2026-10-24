/** Client-safe model connection configuration and operation results. */
/** Browser-safe input capabilities projected onto the DSH adapter. */
export type ConnectionModality = 'text' | 'image'
/** DSH reasoning levels whose wire spellings are explicitly configured. */
export type ConnectionReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
/** Endpoint wire value for each offered DSH reasoning level; null is legal only for off. */
export type ConnectionReasoningEfforts = Partial<Record<ConnectionReasoningLevel, string | null>>

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Saved connections or their default changed after runtime activation.
     * Readers reload their authorized state; the notification carries no data.
     * @mode emit
     */
    'model-connections/changed'(): void
  }
}

/** Wire protocol spoken by a saved model. */
export type ConnectionProtocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages'

/** Bundled model hint; connection endpoints and credentials remain user-owned. */
export interface CatalogModel {
  id: string
  name: string
  protocol: ConnectionProtocol
}

/** Editable model metadata; an omitted protocol resolves when the draft is saved. */
export interface ConnectionModelDraft {
  id: string
  name?: string
  protocol?: ConnectionProtocol
  contextWindow?: number
  maxTokens?: number
  /** Explicit accepted inputs; omission keeps the adapter's conservative text default. */
  input?: ConnectionModality[]
  /** Offered reasoning levels and endpoint wire values; false declares no reasoning. */
  reasoningEfforts?: false | ConnectionReasoningEfforts
}

/** Saved model metadata with an explicit protocol. */
export interface ConnectionModel extends ConnectionModelDraft {
  protocol: ConnectionProtocol
}

/** Complete editable connection; omission of id creates a new stable route. */
export interface ConnectionDraft {
  id?: string
  name: string
  baseURL: string
  enabled: boolean
  models: ConnectionModelDraft[]
}

/** Public connection configuration; secret values and references never ride. */
export interface ModelConnection {
  id: string
  name: string
  baseURL: string
  enabled: boolean
  models: ConnectionModel[]
  credentialConfigured: boolean
  activationError?: string
}

/** Default for newly created Agents; legacy provider selections remain valid. */
export interface ConnectionDefaultSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** Durable configuration revision and the current runtime activation diagnostics. */
export interface ConnectionsSnapshot {
  revision: number
  defaultBaseURL: string
  connections: ModelConnection[]
  defaultSelection?: ConnectionDefaultSelection
  catalog: CatalogModel[]
  reasoningLevels: ConnectionReasoningLevel[]
}

/** Candidate returned by a saved connection's model-list endpoint. */
export interface DiscoveredModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
}

/** Result of one bounded text-only connectivity probe. */
export interface ConnectionTestResult {
  ok: boolean
  message: string
}

/** Product-owned model connections for one desktop or isolated user runtime. */
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUsableApiKey, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { createPiAiRuntime, resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai'
import type { PiAiProviderProfile, ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { CONNECTION_REASONING_LEVELS, DEFAULT_CONNECTION_BASE_URL, MODEL_CONNECTION_CATALOG } from './catalog.ts'
import { invalid } from './errors.ts'
import { connectionDraft, connectionProtocol, connectionState, modelConnectionsDomain } from './spec.ts'
import type { ConnectionState, StoredConnection, ValidatedModelDraft } from './spec.ts'
import type {
  ConnectionDraft, ConnectionModel, ConnectionProtocol, ConnectionsSnapshot, ConnectionTestResult, DiscoveredModel,
} from './types.ts'

export { DEFAULT_CONNECTION_BASE_URL, MODEL_CONNECTION_CATALOG } from './catalog.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelConnections: ModelConnections
  }
}

/** Bounds for explicit discovery and the billed text connectivity probe. */
export interface Config {
  /** Maximum duration of an explicit model discovery or text probe, in milliseconds. */
  requestTimeoutMs: number
  /** Maximum output tokens requested by an explicit text connectivity probe. */
  probeMaxTokens: number
}

function resolvedModel(model: ValidatedModelDraft): ConnectionModel {
  return {
    id: model.id,
    protocol: model.protocol ?? MODEL_CONNECTION_CATALOG.find(preset => preset.id === model.id)?.protocol ?? 'openai-completions',
    ...model.name === undefined ? {} : { name: model.name },
    ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
    ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
    ...model.input === undefined ? {} : { input: [...model.input] },
    ...model.reasoningEfforts === undefined ? {} : {
      reasoningEfforts: model.reasoningEfforts === false ? false : { ...model.reasoningEfforts },
    },
  }
}

function profileFor(row: StoredConnection): PiAiProviderProfile {
  return {
    displayName: row.name,
    baseURL: row.baseURL,
    apiKeyEnv: row.credentialRef,
    api: 'openai-completions',
    models: row.models.map((model) => {
      const { protocol, ...metadata } = resolvedModel(model)
      return { ...metadata, api: protocol }
    }),
  }
}

/** Host-owned connection state and its pi-ai route projection. */
export class ModelConnections extends TypertRemoteService {
  static inject = ['storageDomain', 'credentials', 'llm', 'agentDefaultModel']
  static Config = z.object({
    requestTimeoutMs: z.number().min(1).max(2_147_483_647).step(1).default(15_000),
    probeMaxTokens: z.number().min(1).step(1).default(32),
  })

  private global!: DomainGlobal<ConnectionState>
  private profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile> = new Map()
  private runtime!: ReturnType<typeof createPiAiRuntime>
  private registration?: AdapterRegistrationHandle
  private readonly activationErrors = new Map<string, string>()
  private writes: Promise<void> = Promise.resolve()
  private readonly stopped = new AbortController()

  /** @param ctx Runtime containing storage, credentials, LLM, and default selection.
   * @param config Explicit network and probe bounds.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'modelConnections', { namespace: 'modelConnections' })
  }

  /** Open durable state before publishing any model route. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(modelConnectionsDomain)
    this.global = domain.global
    this.ctx.effect(() => async () => {
      this.stopped.abort()
      await this.writes
      this.registration?.()
      await domain.close()
    }, 'model-connections.close')
    this.runtime = createPiAiRuntime(this.ctx, { profiles: () => this.profiles })
    this.activate(this.global.get())
    this.ctx.effect(() => this.ctx.agentDefaultModel.registerSource({
      currentSelection: () => {
        const selected = this.global.get().defaultSelection
        if (!selected) return undefined
        return {
          provider: selected.provider,
          model: selected.model,
          ...selected.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected.reasoningEffort) },
        }
      },
      saveSelection: (selection) => {
        if (this.stopped.signal.aborted) throw invalid('This runtime is stopping. Reconnect before changing the default model.')
        return this.enqueue(async () => {
          const state = this.global.get()
          this.validateSelection(state, selection.provider, selection.model)
          await this.commit({ ...state, revision: state.revision + 1, defaultSelection: { ...selection } })
        })
      },
    }), 'model-connections.default-source')
  }

  /** Read saved configuration and activation status without secrets.
   * @returns the current durable revision and public connection metadata.
   */
  @Remote
  async list(): Promise<ConnectionsSnapshot> {
    this.assertOwner()
    return this.snapshot()
  }

  /** Save a complete draft and optionally rotate its key. Credential failure leaves the record unchanged.
   * @param draft Complete connection configuration; no id creates a new route.
   * @param expectedRevision Last revision observed by the editor.
   * @param apiKey New non-empty key; omission retains the current credential.
   * @returns committed configuration with unavailable default reasoning removed and any route activation failure displayed.
   */
  @Remote
  async save(draft: ConnectionDraft, expectedRevision: number, apiKey?: string): Promise<ConnectionsSnapshot> {
    this.assertOwner()
    const parsed = connectionDraft.safeParse(draft)
    if (!parsed.success) throw invalid('Check the connection name, endpoint, model IDs, protocols, token limits, inputs, and reasoning levels.')
    let normalizedKey: string | undefined
    try {
      normalizedKey = apiKey === undefined ? undefined : assertUsableApiKey(apiKey.trim(), 'model-connections', 'API_KEY')
    } catch {
      throw invalid('Enter a non-empty API key without line breaks, or leave the key unchanged.')
    }
    const input = parsed.data
    return this.enqueue(async () => {
      const state = this.atRevision(expectedRevision)
      const existing = input.id === undefined ? undefined : this.find(state, input.id)
      const id = existing?.id ?? `maas-${randomUUID()}`
      const models: ConnectionModel[] = input.models.map(resolvedModel)
      if (state.defaultSelection?.provider === id
        && (!input.enabled || !models.some(model => model.id === state.defaultSelection?.model))) {
        throw invalid('Select another default model before disabling this connection or removing its default model.')
      }
      let defaultSelection = state.defaultSelection
      if (defaultSelection?.provider === id && defaultSelection.reasoningEffort !== undefined) {
        const efforts = models.find(model => model.id === defaultSelection?.model)?.reasoningEfforts
        if (!efforts || !Object.hasOwn(efforts, defaultSelection.reasoningEffort)) {
          defaultSelection = { provider: defaultSelection.provider, model: defaultSelection.model }
        }
      }
      const ref = normalizedKey === undefined && existing
        ? existing.credentialRef
        : `MAAS_${randomUUID().replaceAll('-', '').toUpperCase()}_R${state.revision + 1}`
      const next: StoredConnection = { ...input, id, baseURL: input.baseURL.replace(/\/+$/, ''), models, credentialRef: ref }
      try {
        if (models.length > 0) resolveProfiles({ [id]: profileFor(next) })
      } catch {
        throw invalid('The model capabilities cannot be used with this protocol. Check the inputs, reasoning levels, and token limits.')
      }
      try {
        if (normalizedKey !== undefined) await this.ctx.credentials.set(credentialRef(ref), normalizedKey)
      } catch {
        throw new RemoteError('model-connections/credential-unavailable', 'The API key could not be stored. The connection was not changed.', {})
      }
      try {
        await this.commit({
          ...state,
          revision: state.revision + 1,
          ...defaultSelection === undefined ? {} : { defaultSelection },
          connections: existing ? state.connections.map(row => row.id === id ? next : row) : [...state.connections, next],
        })
      } catch (error) {
        if (normalizedKey !== undefined) {
          try {
            await this.ctx.credentials.unset(credentialRef(ref))
          } catch {
            this.ctx.logger.warn('model-connections: an unused credential could not be removed after a failed save')
          }
        }
        throw error
      }
      return this.snapshot()
    })
  }

  /** Remove a saved connection; a default must be changed first.
   * @param id Stable connection/provider id.
   * @param expectedRevision Last revision observed by the editor.
   * @returns committed configuration after route removal.
   */
  @Remote
  async deleteConnection(id: string, expectedRevision: number): Promise<ConnectionsSnapshot> {
    this.assertOwner()
    return this.enqueue(async () => {
      const state = this.atRevision(expectedRevision)
      this.find(state, id)
      if (state.defaultSelection?.provider === id) {
        throw new RemoteError('model-connections/default-in-use', 'Select another default model before removing this connection.', { id })
      }
      await this.commit({ ...state, revision: state.revision + 1, connections: state.connections.filter(row => row.id !== id) })
      return this.snapshot()
    })
  }

  /** Persist a model for newly created Agents without changing existing Sessions.
   * @param connectionId Enabled connection route.
   * @param modelId Saved model id.
   * @param expectedRevision Last revision observed by the editor.
   * @returns committed default and public connections.
   */
  @Remote
  async setDefault(connectionId: string, modelId: string, expectedRevision: number): Promise<ConnectionsSnapshot> {
    this.assertOwner()
    return this.enqueue(async () => {
      const state = this.atRevision(expectedRevision)
      this.find(state, connectionId)
      this.validateSelection(state, connectionId, modelId)
      await this.commit({ ...state, revision: state.revision + 1, defaultSelection: { provider: connectionId, model: modelId } })
      return this.snapshot()
    })
  }

  /** Fetch model candidates from a saved endpoint; nothing is adopted automatically.
   * @param id Saved connection id.
   * @param protocol Listing protocol; omission consistently uses OpenAI Chat Completions.
   * @param signal Remote caller lifetime.
   * @returns the endpoint's candidate model metadata.
   */
  @Remote
  async discover(id: string, protocol?: ConnectionProtocol, signal?: AbortSignal): Promise<DiscoveredModel[]> {
    this.assertOwner()
    const parsed = connectionProtocol.safeParse(protocol ?? 'openai-completions')
    if (!parsed.success) throw invalid('Choose a supported model-listing protocol.')
    const row = this.find(this.global.get(), id)
    const apiKey = await this.keyFor(row)
    try {
      const candidates = await this.runtime.discoverModels({ baseURL: row.baseURL, api: parsed.data, apiKey }, this.operationSignal(signal))
      return candidates.map(model => ({
        id: model.id,
        ...model.name === undefined ? {} : { name: model.name },
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      }))
    } catch {
      throw new RemoteError('model-connections/operation-failed', 'Model discovery failed or timed out. Check the endpoint and API key, then retry.', {})
    }
  }

  /** Send one bounded text probe through the enabled saved model route. This may consume provider credits.
   * @param id Saved, enabled connection id.
   * @param modelId Saved model id to probe.
   * @param signal Remote caller lifetime.
   * @returns a sanitized success or failure diagnostic.
   */
  @Remote
  async test(id: string, modelId: string, signal?: AbortSignal): Promise<ConnectionTestResult> {
    this.assertOwner()
    const state = this.global.get()
    this.find(state, id)
    if (this.activationErrors.has(id)) return { ok: false, message: 'The saved connection could not be activated. Save a corrected configuration before testing.' }
    this.validateSelection(state, id, modelId)
    const operationSignal = this.operationSignal(signal)
    try {
      const call = await this.ctx.llm.prepareCall({ provider: id, model: modelId, maxTokens: this.config.probeMaxTokens }, operationSignal)
      let finished = false
      for await (const chunk of call.stream({ ...call.config, messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] }], signal: operationSignal })) {
        if (chunk.type === 'finish') {
          finished = chunk.reason.kind === 'stop' || chunk.reason.kind === 'max-tokens'
        }
      }
      return finished ? { ok: true, message: 'The model accepted the text probe.' } : { ok: false, message: 'The model did not complete the text probe. Check its protocol and API access.' }
    } catch {
      return { ok: false, message: operationSignal.aborted ? 'The text probe was cancelled or timed out.' : 'The text probe failed. Check the endpoint, model protocol, and API key.' }
    }
  }

  private assertOwner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('model-connections/owner-required', 'Model connections require this runtime owner.', {})
    }
    if (this.stopped.signal.aborted) throw invalid('This runtime is stopping. Reconnect before changing model connections.')
  }

  private operationSignal(signal?: AbortSignal): AbortSignal {
    const signals = [this.stopped.signal, AbortSignal.timeout(this.config.requestTimeoutMs)]
    if (signal) signals.push(signal)
    return AbortSignal.any(signals)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writes.then(operation)
    this.writes = next.then(() => {}, () => {})
    return next
  }

  private atRevision(expected: number): ConnectionState {
    const state = this.global.get()
    if (!Number.isSafeInteger(expected) || expected !== state.revision) {
      throw new RemoteError('model-connections/conflict', 'Model connections changed. Reload before saving again.', { expected, actual: state.revision })
    }
    return state
  }

  private find(state: ConnectionState, id: string): StoredConnection {
    const row = state.connections.find(connection => connection.id === id)
    if (!row) throw new RemoteError('model-connections/not-found', 'This model connection no longer exists. Reload the list.', { id })
    return row
  }

  private validateSelection(state: ConnectionState, provider: string, model: string): void {
    if (!provider.trim() || !model.trim()) throw invalid('Choose a provider and model.')
    if (!provider.startsWith('maas-')) return
    const row = this.find(state, provider)
    if (!row.enabled || !row.models.some(candidate => candidate.id === model)) throw invalid('Choose a saved model from an enabled connection.')
    if (this.activationErrors.has(provider)) throw invalid('Correct and save this connection before selecting its model.')
  }

  private async keyFor(row: StoredConnection): Promise<string> {
    try {
      const hit = await this.ctx.credentials.resolve(credentialRef(row.credentialRef))
      if (hit) return hit.value
    } catch {
      // Credential provider diagnostics may contain sensitive underlying inputs.
    }
    throw new RemoteError('model-connections/credential-unavailable', 'Save an API key for this connection before using it.', {})
  }

  private async commit(next: ConnectionState): Promise<void> {
    const valid = connectionState.parse(next)
    try {
      await this.global.set(valid)
    } catch {
      throw new RemoteError('model-connections/storage-failed', 'Model connections could not be saved. The previous configuration remains active.', {})
    }
    this.activate(valid)
    this.notifyChanged()
  }

  /** Notify every observer after commit; observer failures cannot change the saved outcome. */
  private notifyChanged(): void {
    const warn = (): void => { this.ctx.logger.warn('model-connections: a change listener failed after the configuration was saved') }
    for (const listener of this.ctx.events.dispatch('emit', ['model-connections/changed']) as Array<() => unknown>) {
      try {
        void Promise.resolve(listener()).catch(warn)
      } catch {
        warn()
      }
    }
  }

  private activate(state: ConnectionState): void {
    const previous = this.profiles
    this.activationErrors.clear()
    try {
      const options: Record<string, PiAiProviderProfile> = {}
      for (const row of state.connections) {
        if (!row.enabled) continue
        if (row.models.length === 0) {
          this.activationErrors.set(row.id, 'Add at least one model to activate this connection.')
          continue
        }
        options[row.id] = profileFor(row)
      }
      const next = resolveProfiles(options)
      this.profiles = next
      if (this.registration) this.registration.replace([...next.keys()])
      else if (next.size > 0) this.registration = this.ctx.llm.registerAdapter([...next.keys()], this.runtime.adapter)
    } catch {
      const retained = new Map([...previous].filter(([id]) =>
        state.connections.some(row => row.id === id && row.enabled && row.models.length > 0)))
      this.profiles = retained
      // A refused new route must not revive a connection the committed aggregate removed.
      try {
        this.registration?.replace([...retained.keys()])
      } catch {
        this.ctx.logger.warn('model-connections: runtime activation is unavailable; committed configuration is retained for restart')
      }
      for (const row of state.connections) {
        this.activationErrors.set(row.id, 'Configuration was saved, but model routes could not be activated. The previous routes remain active; correct the configuration and save again.')
      }
    }
  }

  private async snapshot(): Promise<ConnectionsSnapshot> {
    const state = this.global.get()
    const activationErrors = new Map(this.activationErrors)
    const connections = await Promise.all(state.connections.map(async (row) => {
      let credentialConfigured = false
      try {
        credentialConfigured = (await this.ctx.credentials.describe(credentialRef(row.credentialRef))).configured
      } catch {
        // A failed credential status read must not expose storage diagnostics.
      }
      const activationError = activationErrors.get(row.id)
      return {
        id: row.id, name: row.name, baseURL: row.baseURL, enabled: row.enabled,
        models: row.models.map(resolvedModel), credentialConfigured,
        ...activationError === undefined ? {} : { activationError },
      }
    }))
    return {
      revision: state.revision,
      defaultBaseURL: DEFAULT_CONNECTION_BASE_URL,
      connections,
      ...state.defaultSelection === undefined ? {} : { defaultSelection: {
        provider: state.defaultSelection.provider,
        model: state.defaultSelection.model,
        ...state.defaultSelection.reasoningEffort === undefined ? {} : { reasoningEffort: state.defaultSelection.reasoningEffort },
      } },
      catalog: MODEL_CONNECTION_CATALOG.map(model => ({ ...model })),
      reasoningLevels: [...CONNECTION_REASONING_LEVELS],
    }
  }
}

export default ModelConnections

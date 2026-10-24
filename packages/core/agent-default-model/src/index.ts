/**
 * Default model selection for an Agent without a session-specific selection.
 *
 * @module @deepseek-ai/dsh-agent-default-model
 */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile } from '@deepseek-ai/cordis'

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import { LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-config-editor'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Default model selection for Agents created without an explicit model. */
    agentDefaultModel: AgentDefaultModelConfig
  }
}

/** Default model selection supplied by plugin configuration. */
export interface Config {
  /** Registered provider route. */
  provider: Volatile<string | undefined>
  /** Provider-owned model id. */
  model: Volatile<string | undefined>
  /** Adapter-owned reasoning effort; omission follows the provider default. */
  reasoningEffort: Volatile<string | undefined>
}

/** Product-owned persistence for a default selection, when a profile is not its authority. */
export interface DefaultModelSource {
  /** Return a detached selection, or undefined to inherit the plugin Config. */
  currentSelection(): ModelSelection | undefined
  /** Persist the complete selection before resolving. */
  saveSelection(next: ModelSelection): Promise<void>
}

/** Project stored settings onto the Agent-facing selection type. */
function selection(settings: { provider: string; model: string; reasoningEffort?: string }): ModelSelection {
  return {
    provider: settings.provider,
    model: settings.model,
    ...settings.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(settings.reasoningEffort) },
  }
}

/**
 * Owns the default model selection independently of any Host or transport.
 * A registered product source owns persistence; absent a selection, reads inherit Config.
 */
export class AgentDefaultModelConfig extends Service {
  private saves: Promise<void> = Promise.resolve()
  private source: DefaultModelSource | undefined

  static Config = z.object({
    provider: z.string().volatile(),
    model: z.string().volatile(),
    reasoningEffort: z.string().volatile(),
  })

  constructor(private readonly ownerContext: Context, private config: Config) {
    super(ownerContext, 'agentDefaultModel')

    ownerContext.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ownerContext.fiber)) })
  }

  /**
   * Read the current default model selection.
   * @returns a detached selection, or undefined until a model is explicitly configured.
   */
  currentSelection(): ModelSelection | undefined {
    const sourced = this.source?.currentSelection()
    if (sourced !== undefined) return { ...sourced }
    const provider = this.config.provider.get()
    const model = this.config.model.get()
    if (!provider && !model) return undefined
    if (!provider?.trim() || !model?.trim()) {
      throw new LlmError('Configure both a provider and model, or choose a model in Settings.', 'MODEL_NOT_CONFIGURED')
    }
    const reasoningEffort = this.config.reasoningEffort.get()
    return selection({
      provider, model,
      ...reasoningEffort === undefined ? {} : { reasoningEffort },
    })
  }

  /**
   * Resolve the explicit default before a model request starts.
   * @returns the configured model selection.
   * @throws LlmError MODEL_NOT_CONFIGURED until a default has been selected.
   */
  requireSelection(): ModelSelection {
    const selected = this.currentSelection()
    if (selected !== undefined) return selected
    throw new LlmError('Choose a model in Settings or the conversation model selector before sending a message.', 'MODEL_NOT_CONFIGURED')
  }

  /**
   * Save the complete default through the registered source or profile editor.
   * A non-owner Remote caller cannot persist a registered product default;
   * its entry point may still keep the selected model on that caller's Session.
   * Without either, the deployment keeps its composition entry. Saves commit in submission order; a failed
   * save rejects its caller without blocking later saves.
   * @param next - resolved selection accepted by an entry point.
   * @returns fulfillment after the optional profile write settles.
   */
  async saveSelection(next: ModelSelection): Promise<void> {
    const source = this.source
    if (source !== undefined) {
      if (principalOf(this.ctx.invocation) !== undefined) return
      const captured = { ...next }
      const saved = this.saves.then(() => source.saveSelection(captured))
      this.saves = saved.catch(() => {})
      await saved
      return
    }
    const entry = this.ownerContext.fiber.entry
    if (entry === undefined) return
    const editor = this.ctx.get('configEditor')
    if (editor === undefined) return
    const config = {
      provider: next.provider, model: next.model,
      ...next.reasoningEffort === undefined ? {} : { reasoningEffort: String(next.reasoningEffort) },
    }
    const saved = this.saves.then(() => editor.edit(entry, () => config))
    this.saves = saved.catch(() => {})
    await saved
  }

  /** Register one product-owned default; unloading the registration restores Config behavior.
   * @param source Product persistence owner. A second simultaneous source is refused.
   * @returns the caller-owned disposer.
   */
  registerSource(source: DefaultModelSource): () => void {
    if (this.source !== undefined) throw new Error('a default model source is already registered')
    const dispose = this.ctx.effect(() => {
      this.source = source
      return () => { this.source = undefined }
    }, 'agent-default-model.source')
    return () => void dispose()
  }
}

export default AgentDefaultModelConfig

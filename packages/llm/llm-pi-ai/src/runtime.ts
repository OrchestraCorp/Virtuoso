/** Host integrations shared by configuration-backed and domain-backed pi-ai adapters. */
import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { assertUsableApiKey, LlmError, resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-fs'
import { PiAiAdapter } from './adapter.ts'
import type { PiAiAdapterOptions } from './adapter.ts'
import { authContextFrom, credentialStoreFrom } from './auth.ts'
import type { ResolvedPiAiProviderProfile } from './config.ts'
import { discoverModels } from './discovery.ts'

/** Inputs for one stable adapter over externally owned, compiled profile snapshots. */
export interface PiAiRuntimeOptions {
  /** Current compiled snapshot; replace the map rather than mutating published profiles. */
  profiles: () => ReadonlyMap<string, ResolvedPiAiProviderProfile>
  /** Optional shared native authentication used by an owning authorization integration. */
  auth?: PiAiAdapterOptions['auth']
}

/** Adapter and endpoint discovery over the same Host credential integrations. */
export interface PiAiRuntime {
  /** Stable adapter; the caller owns route registration and snapshot publication. */
  readonly adapter: PiAiAdapter
  /**
   * Discover a draft endpoint's models without storing them.
   * @param request - draft endpoint, protocol, route, and optional one-shot key.
   * @param signal - cancellation for endpoint I/O.
   * @returns candidate models in endpoint order.
   */
  discoverModels(request: LlmModelDiscoveryRequest, signal?: AbortSignal): Promise<readonly LlmDiscoveredModel[]>
}

/**
 * Create a pi-ai adapter without mounting the configuration-backed plugin.
 * Credentials resolve per operation through the optional Host credential service,
 * then the launch environment when that service is absent. Attachments and file
 * access use the Host services mounted in the supplied context. This function
 * registers no routes, settings, authorization flows, or persistence.
 * @param ctx - owning Host context with its optional credential and attachment services.
 * @param options - current compiled profiles and optional shared native auth.
 * @returns a stable adapter and draft endpoint discovery.
 */
export function createPiAiRuntime(ctx: Context, options: PiAiRuntimeOptions): PiAiRuntime {
  const resolveApiKey = async (provider: string, profile: ResolvedPiAiProviderProfile): Promise<string | undefined> => {
    const ref = profile.apiKeyEnv
    if (ref === undefined) return undefined
    const credentials = ctx.get('credentials')
    const hit = credentials !== undefined
      ? (await credentials.resolve(ref))?.value
      : launchEnvironmentOf(ctx).get(ref)?.value
    if (hit !== undefined && hit.length > 0) return assertUsableApiKey(hit, 'llm-pi-ai', ref)
    throw new LlmError(
      `llm-pi-ai: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not`
      + ` set — store ${ref} through the credentials service (the web Models page writes it) or export it,`
      + ' and remove apiKeyEnv only if this provider should authenticate from pi-ai\'s own environment discovery',
      'MISSING_CREDENTIAL',
    )
  }
  const adapter = new PiAiAdapter({
    profiles: options.profiles,
    resolveApiKey,
    auth: options.auth ?? { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) },
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
      attachments, hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath), ref,
    ),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(
        `llm-pi-ai: unusable replay state on assistant history for route "${provider}/${model}";`
        + ` sending that message as provider-neutral content (${reason})`,
      )
    },
  })
  return {
    adapter,
    discoverModels(request, signal) {
      return discoverModels({ ...request, ...signal === undefined ? {} : { signal } }, () => {
        const profile = request.provider === undefined ? undefined : options.profiles().get(request.provider)
        return profile === undefined
          ? undefined
          : { headers: profile.headers, resolveApiKey: () => resolveApiKey(profile.provider, profile) }
      })
    },
  }
}

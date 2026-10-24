/** Native shell locale and analytics operations over the local Web application. */
import type { ProductEvent } from '@deepseek-ai/dsh-client-product-analytics/types'
import { randomUUID } from 'node:crypto'

/** Local Host operations needed by the native shell before showing its workspace. */
export interface DesktopShellBackend {
  /** @returns the current Host analytics collection policy. */
  analyticsEnabled(): Promise<boolean>
  /** @param event - desktop-owned fields. @returns after local Host intake. */
  report(event: ProductEvent): Promise<void>
  /** @returns the saved UI language without account or provider requests. */
  readLocalePreference(): Promise<string | null>
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Authenticate the native HTTP client through the Web application's launch URL.
 * @param authenticatedUrl - URL supplied by the running Desktop Host.
 * @param send - Electron session fetch, retaining the Web authentication cookie.
 * @returns locale and analytics operations over standard RPC.
 */
export async function connectDesktopShell(
  authenticatedUrl: string,
  send: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<DesktopShellBackend> {
  const origin = new URL(authenticatedUrl).origin
  const authenticated = await send(authenticatedUrl, { credentials: 'include' })
  await authenticated.body?.cancel()
  if (!authenticated.ok) throw new Error('desktop shell: Web authentication failed')
  const invoke = async (
    request: { namespace: string; method: string; args: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<unknown> => {
    const rpcId = randomUUID()
    const method = `${request.namespace}/${request.method}`
    const response = await send(new URL(`/api/${method}`, origin).href, {
      method: 'POST', credentials: 'include', redirect: 'error', ...(signal === undefined ? {} : { signal }),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args: request.args } }),
    })
    if (!response.ok) throw new Error('desktop shell: Web request failed')
    const envelope: unknown = await response.json()
    if (!record(envelope) || envelope.type !== 'server-response' || envelope.rpcId !== rpcId
      || !record(envelope.result) || envelope.result.ok !== true) {
      throw new Error('desktop shell: Web RPC failed')
    }
    return envelope.result.value
  }
  const localePreference = (namespaces: unknown[]): string | null => {
    const locale: unknown = namespaces.find((item: unknown) => record(item) && item.ns === 'locale')
    if (!record(locale) || !record(locale.value)
      || (locale.value.preference !== undefined && typeof locale.value.preference !== 'string')) {
      throw new Error('desktop shell: invalid locale preference')
    }
    return locale.value.preference ?? null
  }
  return {
    async analyticsEnabled() {
      const enabled = await invoke({ namespace: 'productAnalytics', method: 'enabled', args: {} }, AbortSignal.timeout(1000))
      if (typeof enabled !== 'boolean') throw new Error('desktop analytics: invalid collection policy')
      return enabled
    },
    async report(event) { await invoke({ namespace: 'productAnalytics', method: 'report', args: { event } }, AbortSignal.timeout(1000)) },
    async readLocalePreference() {
      const settings = await invoke({ namespace: 'settings', method: 'describe', args: {} })
      if (!record(settings) || !Array.isArray(settings.namespaces)) throw new Error('desktop shell: missing settings namespaces')
      return localePreference(settings.namespaces)
    },
  }
}

/** Product model hints, maintained with the product rather than fetched at runtime. */
import type { CatalogModel, ConnectionReasoningLevel } from './types.ts'
import type { PiAiReasoningEfforts } from '@deepseek-ai/dsh-llm-pi-ai'

const reasoningLevelGate: Record<keyof PiAiReasoningEfforts, true> = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
}

/** Reasoning level names accepted by the existing pi-ai adapter, in escalation order. */
export const CONNECTION_REASONING_LEVELS = Object.keys(reasoningLevelGate) as ConnectionReasoningLevel[]

/** Default MaaS endpoint shown when creating a connection. */
export const DEFAULT_CONNECTION_BASE_URL = 'https://llm-api.x-aio.com/v1'

/** Exact model IDs determine protocol defaults only when the user omits one. */
export const MODEL_CONNECTION_CATALOG: readonly CatalogModel[] = [
  { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', protocol: 'openai-completions' },
  { id: 'gpt-5.6-terra', name: 'GPT 5.6 Terra', protocol: 'openai-responses' },
  { id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', protocol: 'openai-responses' },
  { id: 'codex-auto-review', name: 'Codex Auto Review', protocol: 'openai-responses' },
  { id: 'kimi-k3', name: 'Kimi K3', protocol: 'openai-completions' },
  { id: 'glm-5.3', name: 'GLM 5.3', protocol: 'openai-completions' },
  { id: 'glm-5.3-flash', name: 'GLM 5.3 Flash', protocol: 'openai-completions' },
  { id: 'gpt-6-astra', name: 'GPT 6 Astra', protocol: 'openai-responses' },
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', protocol: 'openai-completions' },
  { id: 'gpt-6-sol', name: 'GPT 6 Sol', protocol: 'openai-responses' },
  { id: 'gpt-6-luna', name: 'GPT 6 Luna', protocol: 'openai-responses' },
  { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', protocol: 'openai-responses' },
]

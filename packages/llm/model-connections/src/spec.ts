/** Durable connection aggregate; credentials live in the credential provider. */
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { CONNECTION_REASONING_LEVELS } from './catalog.ts'

/** Protocols supported by this product's model connections. */
export const connectionProtocol = z.enum(['openai-completions', 'openai-responses', 'anthropic-messages'])
const text = z.string().trim().min(1)
const capacity = z.number().int().positive().optional()
const input = z.array(z.enum(['text', 'image'])).min(1)
  .refine(values => new Set(values).size === values.length, 'Input modalities must be unique.')
const reasoningEfforts = z.partialRecord(z.enum(CONNECTION_REASONING_LEVELS), z.union([text, z.null()]))
  .refine(efforts => Object.entries(efforts).some(([level]) => level !== 'off'), 'Declare at least one reasoning level beyond off.')
  .refine(efforts => Object.entries(efforts).every(([level, wire]) => level === 'off' || wire !== null), 'Only off may omit a wire value.')
const modelDraft = z.object({
  id: text,
  name: text.optional(),
  protocol: connectionProtocol.optional(),
  contextWindow: capacity,
  maxTokens: capacity,
  input: input.optional(),
  reasoningEfforts: z.union([z.literal(false), reasoningEfforts]).optional(),
}).strict()

/** Parsed draft metadata, including omitted optional wire fields. */
export type ValidatedModelDraft = z.infer<typeof modelDraft>

/** Validate untrusted drafts before any credential or domain write. */
export const connectionDraft = z.object({
  id: z.string().regex(/^maas-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/).optional(),
  name: text,
  baseURL: z.url().refine((raw) => {
    const url = new URL(raw)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  }, 'Use an HTTP(S) endpoint without credentials, query parameters, or a fragment.'),
  enabled: z.boolean(),
  models: z.array(modelDraft).refine(models => new Set(models.map(model => model.id)).size === models.length, 'Model IDs must be unique.'),
}).strict()

const storedConnection = connectionDraft.extend({
  id: z.string().regex(/^maas-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/),
  models: z.array(modelDraft.extend({ protocol: connectionProtocol }))
    .refine(models => new Set(models.map(model => model.id)).size === models.length),
  credentialRef: z.string().regex(/^MAAS_[A-Z0-9_]+$/),
}).strict()

/** One commit contains connection changes and the selected default together. */
export const connectionState = z.object({
  revision: z.number().int().nonnegative(),
  connections: z.array(storedConnection).refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
  defaultSelection: z.object({ provider: text, model: text, reasoningEffort: text.optional() }).strict().optional(),
}).strict().refine((state) => {
  const selected = state.defaultSelection
  if (!selected || !selected.provider.startsWith('maas-')) return true
  const row = state.connections.find(connection => connection.id === selected.provider)
  return row?.enabled === true && row.models.some(model => model.id === selected.model)
}, 'The selected default must be a saved model from an enabled connection.')

/** Saved connection with a private credential reference. */
export type StoredConnection = z.infer<typeof storedConnection>
/** Durable aggregate validated on every open and commit. */
export type ConnectionState = z.infer<typeof connectionState>

/** Single-runtime authoritative state; opening a mismatched version refuses. */
export const modelConnectionsDomain = defineDomain({
  name: 'model_connections',
  version: 1,
  global: { schema: connectionState, initial: { revision: 0, connections: [] } },
  tables: {},
})

/** Real Loader composition over isolated on-disk connections and credentials. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime, { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { expect, it, onTestFinished, vi } from 'vitest'
import ModelConnections from '../src/index.ts'
import type { ConnectionDraft, ConnectionsSnapshot } from '../src/types.ts'
import { connectionDraft } from '../src/spec.ts'
import { closeMockServers, mockServer, textEvents } from '../../llm-pi-ai/tests/mock-server.ts'

async function boot(root: string, timeout = 1000): Promise<Context> {
  const path = join(root, 'cordis.yml')
  await writeFile(path, [
    '- id: storage', '  name: storage',
    '- id: json', '  name: storage-json', '  config:', `    root: ${JSON.stringify(join(root, 'storage'))}`,
    '- id: domain', '  name: storage-domain', '  config:', '    backend: json',
    '- id: credentials', '  name: credentials', '  config:', `    path: ${JSON.stringify(join(root, 'credentials.yaml'))}`, '    watch: false',
    '- id: llm', '  name: llm',
    '- id: default', '  name: default-model', '  config:', '    provider: legacy', '    model: original',
    '- id: connections', '  name: connections', '  config:', `    requestTimeoutMs: ${timeout}`, '    probeMaxTokens: 8', '',
  ].join('\n'))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  const modules = new Map<string, unknown>([
    ['storage', Storage], ['storage-json', StorageJson], ['storage-domain', StorageDomain],
    ['credentials', LocalCredentials], ['llm', LlmRuntime], ['default-model', DefaultModel], ['connections', ModelConnections],
  ])
  const internal: ModuleLoaderV2 = {
    version: 'v2', loadCache: new Map(),
    import: async (name) => {
      if (!modules.has(name)) throw new Error(`unexpected test module ${name}`)
      return modules.get(name)
    },
    register(): never { throw new Error('unexpected module hook') },
    getOrCreateModuleJob(): never { throw new Error('unexpected module job') },
    resolveSync(): never { throw new Error('unexpected module resolution') },
    load(): never { throw new Error('unexpected module load') },
  }
  ctx.loader.internal = internal
  ctx.loader.builtins.include = Include
  await ctx.loader.create({ name: 'cordis:include', config: { path } })
  await ctx.loader.await()
  expect(ctx.modelConnections).toBeDefined()
  return ctx
}

async function fixture(timeout?: number): Promise<{ root: string; ctx: Context }> {
  const root = await mkdtemp(join(tmpdir(), 'model-connections-'))
  onTestFinished(async () => {
    await closeMockServers()
    await rm(root, { recursive: true, force: true })
  })
  return { root, ctx: await boot(root, timeout) }
}

function draft(baseURL = 'https://models.example/v1'): ConnectionDraft {
  return { name: 'My models', baseURL, enabled: true, models: [{ id: 'my-model' }] }
}

function first(snapshot: ConnectionsSnapshot) {
  const connection = snapshot.connections[0]
  if (!connection) throw new Error('test expected a saved connection')
  return connection
}

async function savedImage(ctx: Context, root: string): Promise<ImageAttachmentRef> {
  await ctx.plugin(LocalAttachmentStore, { dshHome: root })
  return ctx.attachments.saveImage({
    data: new Uint8Array(await readFile(new URL('../../llm-pi-ai/tests/fixtures/qr-code.png', import.meta.url))),
    mediaType: 'image/png', name: 'qr-code.png',
  })
}

class ForeignAdapter extends LlmAdapter {
  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

it('notifies default readers without MaaS routes and contains synchronous and asynchronous observer failures', async () => {
  const { ctx } = await fixture()
  ctx.llm.registerAdapter(['legacy'], new ForeignAdapter())
  const topologyChanged = vi.fn()
  ctx.on('llm/adapters-updated', topologyChanged)
  const synchronousFailure = vi.fn(() => { throw new Error('observer failure') })
  const asynchronousFailure = vi.fn(async () => { throw new Error('async observer failure') })
  const observed: { provider: string; model: string }[] = []
  ctx.on('model-connections/changed', synchronousFailure)
  // oxlint-disable-next-line typescript/no-misused-promises -- this fixture verifies containment of a rejected asynchronous observer.
  ctx.on('model-connections/changed', asynchronousFailure)
  ctx.on('model-connections/changed', () => {
    observed.push(ctx.agentDefaultModel.requireSelection())
  })
  await expect(ctx.agentDefaultModel.saveSelection({ provider: 'legacy', model: 'chosen' })).resolves.toBeUndefined()
  expect(observed).toEqual([{ provider: 'legacy', model: 'chosen' }])
  expect(synchronousFailure).toHaveBeenCalledOnce()
  expect(asynchronousFailure).toHaveBeenCalledOnce()
  expect(topologyChanged).not.toHaveBeenCalled()
  expect(await ctx.modelConnections.list()).toMatchObject({
    revision: 1, connections: [], defaultSelection: { provider: 'legacy', model: 'chosen' },
  })
})

it('emits no connection change when a default write fails', async () => {
  const { ctx } = await fixture()
  const changed = vi.fn()
  ctx.on('model-connections/changed', changed)
  const domain = ctx.storageDomain.get('model_connections')
  if (!domain) throw new Error('test expected the open connection domain')
  const refused = vi.spyOn(domain.global, 'set').mockRejectedValueOnce(new Error('synthetic disk failure'))
  await expect(ctx.agentDefaultModel.saveSelection({ provider: 'legacy', model: 'chosen' }))
    .rejects.toMatchObject({ code: 'model-connections/storage-failed' })
  refused.mockRestore()
  expect(changed).not.toHaveBeenCalled()
  expect(await ctx.modelConnections.list()).toMatchObject({ revision: 0, connections: [] })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'legacy', model: 'original' })
})

it('persists resolved protocols and a default across runtime restart without exposing credentials', async () => {
  const { ctx, root } = await fixture()
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'legacy', model: 'original' })
  const saved = await ctx.modelConnections.save({
    ...draft(), models: [{ id: 'gpt-6.1-sol' }, { id: 'custom', protocol: 'anthropic-messages' }, { id: 'my-model' }],
  }, 0, 'synthetic-secret')
  const connection = first(saved)
  expect(connection.id).toMatch(/^maas-[0-9a-f-]{36}$/)
  expect(connection.models.map(model => model.protocol)).toEqual(['openai-responses', 'anthropic-messages', 'openai-completions'])
  expect(saved.catalog).toHaveLength(12)
  expect(JSON.stringify(saved)).not.toContain('synthetic-secret')
  expect(JSON.stringify(saved)).not.toContain('credentialRef')
  expect(await readFile(join(root, 'storage', 'model_connections.json'), 'utf8')).not.toContain('synthetic-secret')
  await ctx.modelConnections.setDefault(connection.id, 'my-model', 1)
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: connection.id, model: 'my-model' })
  await ctx.fiber.dispose()
  const reopened = await boot(root)
  expect((await reopened.modelConnections.list()).revision).toBe(2)
  expect(first(await reopened.modelConnections.list()).credentialConfigured).toBe(true)
  expect(reopened.agentDefaultModel.currentSelection()).toEqual({ provider: connection.id, model: 'my-model' })
  expect(reopened.llm.listProviders().map(provider => provider.id)).toEqual([connection.id])
})

it('keeps v1 models conservative and persists explicit image and reasoning capabilities into live routes', async () => {
  const { ctx, root } = await fixture()
  const server = await mockServer([{ events: textEvents }])
  const initial = await ctx.modelConnections.save(draft(server.url), 0, 'capability-key')
  const id = first(initial).id
  expect(await ctx.llm.resolveModelInfo(id, 'my-model')).toMatchObject({ inputModalities: ['text'] })
  expect((await ctx.llm.resolveModelInfo(id, 'my-model')).reasoning).toBeUndefined()
  const saved = await ctx.modelConnections.save({
    ...draft(server.url), id,
    models: [{
      id: 'my-model', input: ['text', 'image'],
      contextWindow: 65_536, maxTokens: 4096,
      reasoningEfforts: { off: null, high: 'ultra' },
    }],
  }, 1)
  expect(first(saved).models[0]).toMatchObject({ input: ['text', 'image'], reasoningEfforts: { off: null, high: 'ultra' } })
  expect(saved.reasoningLevels).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  expect(await ctx.llm.resolveModelInfo(id, 'my-model')).toMatchObject({
    inputModalities: ['text', 'image'], context: { contextWindow: 65_536 }, defaultMaxTokens: 4096,
    reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }] },
  })
  const call = await ctx.llm.prepareCall({ provider: id, model: 'my-model', reasoningEffort: ReasoningEffortId('high') })
  for await (const _chunk of call.stream({ ...call.config, messages: [] })) { /* consume the saved capability route */ }
  expect(server.requests[0]).toMatchObject({ reasoning_effort: 'ultra' })
  await ctx.fiber.dispose()
  const reopened = await boot(root)
  expect(first(await reopened.modelConnections.list()).models[0]).toMatchObject({ input: ['text', 'image'], reasoningEfforts: { off: null, high: 'ultra' } })
  expect((await reopened.llm.resolveModelInfo(id, 'my-model')).inputModalities).toEqual(['text', 'image'])
  await reopened.modelConnections.save({
    ...draft(server.url), id, models: [{ id: 'my-model', reasoningEfforts: false }],
  }, 2)
  expect((await reopened.llm.resolveModelInfo(id, 'my-model')).reasoning).toBeUndefined()
})

it('sends a declared image through a saved connection and the real attachment store to loopback HTTP', async () => {
  const { ctx, root } = await fixture()
  const server = await mockServer([{ events: textEvents }])
  const saved = await ctx.modelConnections.save({
    ...draft(server.url), models: [{ id: 'my-model', input: ['text', 'image'] }],
  }, 0, 'image-key')
  const id = first(saved).id
  const ref = await savedImage(ctx, root)
  const version = await ctx.attachments.readImageRequest(ref, ctx.llm.imageRequestTarget(id, 'my-model', ref))
  const call = await ctx.llm.prepareCall({ provider: id, model: 'my-model' })
  const chunks: StreamChunk[] = []
  for await (const chunk of call.stream({
    ...call.config, messages: [{ role: 'user', content: [{ type: 'image', attachment: ref }] }],
  })) chunks.push(chunk)
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  expect(server.paths).toEqual(['/chat/completions'])
  expect(server.headers[0]?.authorization).toBe('Bearer image-key')
  expect(server.requests[0]).toMatchObject({
    model: 'my-model',
    messages: [{
      role: 'user',
    }],
  })
  const body = JSON.stringify(server.requests[0])
  expect(body).toContain('"type":"image_url"')
  expect(body).toContain(JSON.stringify(`data:${version.mediaType};base64,${Buffer.from(version.data).toString('base64')}`))
  expect((await ctx.attachments.readImage(ref)).ref).toEqual(ref)
})

it('refuses undeclared image bytes at the adapter while the DSH stream sends its text fallback', async () => {
  const { ctx, root } = await fixture()
  const server = await mockServer([{ events: textEvents }])
  const registrations = vi.spyOn(ctx.llm, 'registerAdapter')
  const saved = await ctx.modelConnections.save(draft(server.url), 0, 'image-key')
  const ref = await savedImage(ctx, root)
  const id = first(saved).id
  const adapter = registrations.mock.calls[0]?.[1]
  registrations.mockRestore()
  if (!adapter) throw new Error('test expected the connection to register its real adapter')
  const messages: GenerateOptions['messages'] = [{ role: 'user', content: [{ type: 'image', attachment: ref }] }]
  await expect((async () => {
    for await (const _chunk of adapter.stream({ provider: id, model: 'my-model', messages })) { /* consume unexpected adapter output */ }
  })()).rejects.toMatchObject({ code: 'UNSUPPORTED_CONTENT', message: 'pi-ai model "my-model" does not support image input' })
  expect(server.requests).toHaveLength(0)

  // The public DSH stream projects images into omission text before adapter dispatch for text-only models.
  const call = await ctx.llm.prepareCall({ provider: id, model: 'my-model' })
  const chunks: StreamChunk[] = []
  for await (const chunk of call.stream({ ...call.config, messages })) chunks.push(chunk)
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  expect(server.requests).toHaveLength(1)
  expect(server.requests[0]).toMatchObject({
    messages: [{ role: 'user' }],
  })
  expect(JSON.stringify(server.requests[0])).toContain('image omitted because this model accepts text only')
  expect(JSON.stringify(server.requests[0])).not.toContain('image_url')
})

it.each([false, { off: null, low: 'low' }, undefined] as const)('clears a removed default reasoning effort in the same capability save (%j)', async (reasoningEfforts) => {
  const { ctx } = await fixture()
  const server = await mockServer([{ events: textEvents }, { events: textEvents }])
  const saved = await ctx.modelConnections.save({
    ...draft(server.url), models: [{ id: 'my-model', reasoningEfforts: { off: null, low: 'low', high: 'high' } }],
  }, 0, 'reasoning-key')
  const id = first(saved).id
  await ctx.agentDefaultModel.saveSelection({ provider: id, model: 'my-model', reasoningEffort: ReasoningEffortId('high') })
  const captured = await ctx.llm.prepareCall(ctx.agentDefaultModel.requireSelection())
  const revised = await ctx.modelConnections.save({
    ...draft(server.url), id,
    models: [{ id: 'my-model', ...reasoningEfforts === undefined ? {} : { reasoningEfforts } }],
  }, 2)
  expect(revised).toMatchObject({ revision: 3, defaultSelection: { provider: id, model: 'my-model' } })
  expect(revised.defaultSelection).not.toHaveProperty('reasoningEffort')
  expect(ctx.agentDefaultModel.requireSelection()).toEqual({ provider: id, model: 'my-model' })
  const next = await ctx.llm.prepareCall(ctx.agentDefaultModel.requireSelection())
  const chunks: StreamChunk[] = []
  for await (const chunk of next.stream({ ...next.config, messages: [] })) chunks.push(chunk)
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  expect(captured.config.reasoningEffort).toBe('high')
  for await (const _chunk of captured.stream({ ...captured.config, messages: [] })) { /* finish under captured capabilities */ }
  expect(server.requests[1]).toMatchObject({ reasoning_effort: 'high' })
})

it('preserves a default reasoning effort that remains declared after a capability edit', async () => {
  const { ctx } = await fixture()
  const saved = await ctx.modelConnections.save({
    ...draft(), models: [{ id: 'my-model', reasoningEfforts: { off: null, high: 'high' } }],
  }, 0, 'reasoning-key')
  const id = first(saved).id
  await ctx.agentDefaultModel.saveSelection({ provider: id, model: 'my-model', reasoningEffort: ReasoningEffortId('high') })
  const revised = await ctx.modelConnections.save({
    ...draft(), id, models: [{ id: 'my-model', reasoningEfforts: { high: 'ultra' } }],
  }, 2)
  expect(revised.defaultSelection).toEqual({ provider: id, model: 'my-model', reasoningEffort: 'high' })
  expect((await ctx.llm.prepareCall(ctx.agentDefaultModel.requireSelection())).config.reasoningEffort).toBe('high')
})

it.each([
  { input: [] }, { input: ['audio'] }, { input: ['text', 'text'] },
  { reasoningEfforts: {} }, { reasoningEfforts: { off: null } },
  { reasoningEfforts: { high: null } }, { reasoningEfforts: { high: '' } },
  { reasoningEfforts: { high: ' ' } }, { reasoningEfforts: { ultra: 'ultra' } },
])('rejects malformed capability declarations %j at the draft parser', (fields) => {
  expect(connectionDraft.safeParse({ ...draft(), models: [{ id: 'my-model', ...fields }] }).success).toBe(false)
})

it('rejects invalid remote capabilities before rotating credentials or writing durable state', async () => {
  const { ctx } = await fixture()
  const saved = await ctx.modelConnections.save(draft(), 0, 'original-key')
  const domain = ctx.storageDomain.get('model_connections')
  if (!domain) throw new Error('test expected the open connection domain')
  const credentialWrite = vi.spyOn(ctx.credentials, 'set')
  const domainWrite = vi.spyOn(domain.global, 'set')
  await expect(ctx.modelConnections.save({
    ...draft(), id: first(saved).id, models: [{ id: 'my-model', reasoningEfforts: { high: null } }],
  }, 1, 'replacement-key')).rejects.toMatchObject({ code: 'model-connections/invalid' })
  expect(credentialWrite).not.toHaveBeenCalled()
  expect(domainWrite).not.toHaveBeenCalled()
  expect(await ctx.modelConnections.list()).toEqual(saved)
})

it('serializes revision checks and preserves the committed state after credential failure', async () => {
  const { ctx } = await fixture()
  const [left, right] = await Promise.allSettled([
    ctx.modelConnections.save(draft(), 0, 'first-key'),
    ctx.modelConnections.save(draft(), 0, 'second-key'),
  ])
  expect(left.status).toBe('fulfilled')
  expect(right).toMatchObject({ status: 'rejected', reason: { code: 'model-connections/conflict' } })
  const before = await ctx.modelConnections.list()
  const failure = vi.spyOn(ctx.credentials, 'set').mockRejectedValueOnce(new Error('do not expose synthetic-secret'))
  await expect(ctx.modelConnections.save({ ...draft(), id: first(before).id, name: 'Changed' }, 1, 'replacement-key'))
    .rejects.toMatchObject({ code: 'model-connections/credential-unavailable' })
  failure.mockRestore()
  expect(await ctx.modelConnections.list()).toEqual(before)
  await expect(ctx.modelConnections.save(draft(), 1, 'line\nbreak')).rejects.toMatchObject({ code: 'model-connections/invalid' })
})

it('keeps prepared calls on their captured endpoint and key while later requests use the new revision', async () => {
  const { ctx } = await fixture()
  const oldServer = await mockServer([{ events: textEvents }])
  const newServer = await mockServer([{ events: textEvents }])
  const saved = await ctx.modelConnections.save(draft(oldServer.url), 0, 'old-key')
  const id = first(saved).id
  const prepared = await ctx.llm.prepareCall({ provider: id, model: 'my-model' })
  await ctx.modelConnections.save({ ...draft(newServer.url), id, name: 'New endpoint' }, 1, 'new-key')
  for await (const _chunk of prepared.stream({ ...prepared.config, messages: [] })) { /* consume the captured generation */ }
  expect(oldServer.headers[0]?.authorization).toBe('Bearer old-key')
  const probed = await ctx.modelConnections.test(id, 'my-model')
  expect(newServer.paths).toEqual(['/chat/completions'])
  expect(probed).toEqual({ ok: true, message: 'The model accepted the text probe.' })
  expect(newServer.headers[0]?.authorization).toBe('Bearer new-key')
})

it('keeps the previous aggregate and route after durable storage refuses a key rotation', async () => {
  const { ctx } = await fixture()
  const server = await mockServer([{ events: textEvents }])
  const before = await ctx.modelConnections.save(draft(server.url), 0, 'original-key')
  const domain = ctx.storageDomain.get('model_connections')
  if (!domain) throw new Error('test expected the open connection domain')
  const failure = vi.spyOn(domain.global, 'set').mockRejectedValueOnce(new Error('synthetic disk failure'))
  await expect(ctx.modelConnections.save({ ...draft(server.url), id: first(before).id }, 1, 'replacement-key'))
    .rejects.toMatchObject({ code: 'model-connections/storage-failed' })
  failure.mockRestore()
  expect(await ctx.modelConnections.list()).toEqual(before)
  expect(await ctx.modelConnections.test(first(before).id, 'my-model')).toMatchObject({ ok: true })
  expect(server.headers[0]?.authorization).toBe('Bearer original-key')
})

it('discovers saved endpoint models without adopting them and bounds the explicit text probe', async () => {
  const { ctx } = await fixture(50)
  const server = await mockServer([
    { body: JSON.stringify({ data: [{ id: 'candidate' }] }) },
    { holdOpen: true },
  ])
  const saved = await ctx.modelConnections.save(draft(server.url), 0, 'discovery-key')
  const id = first(saved).id
  expect(await ctx.modelConnections.discover(id)).toEqual([{ id: 'candidate', name: 'candidate' }])
  expect(server.paths[0]).toBe('/models')
  expect(first(await ctx.modelConnections.list()).models.map(model => model.id)).toEqual(['my-model'])
  const result = await ctx.modelConnections.test(id, 'my-model')
  expect(result.ok).toBe(false)
  expect(JSON.stringify(result)).not.toContain('discovery-key')
  await server.responseClosed
})

it('uses the selected listing protocol independently of the saved model order', async () => {
  const { ctx } = await fixture()
  const body = JSON.stringify({ data: [{ id: 'candidate' }] })
  const server = await mockServer([{ body }, { body }, { body }])
  const saved = await ctx.modelConnections.save({
    ...draft(`${server.url}/v1`),
    models: [{ id: 'anthropic', protocol: 'anthropic-messages' }, { id: 'chat', protocol: 'openai-completions' }],
  }, 0, 'discovery-key')
  const id = first(saved).id
  await ctx.modelConnections.discover(id)
  await ctx.modelConnections.discover(id, 'anthropic-messages')
  await ctx.modelConnections.save({
    ...draft(`${server.url}/v1`), id,
    models: [{ id: 'chat', protocol: 'openai-completions' }, { id: 'anthropic', protocol: 'anthropic-messages' }],
  }, 1)
  await ctx.modelConnections.discover(id, 'openai-responses')
  expect(server.paths).toEqual(['/v1/models', '/v1/models?limit=1000', '/v1/models'])
  expect(server.headers[0]?.authorization).toBe('Bearer discovery-key')
  expect(server.headers[1]?.['x-api-key']).toBe('discovery-key')
  expect(server.headers[1]?.authorization).toBeUndefined()
  expect(server.headers[2]?.authorization).toBe('Bearer discovery-key')
})

it('keeps prior routes usable and reports a durable save whose new route collides', async () => {
  const { ctx } = await fixture()
  const initial = await ctx.modelConnections.save(draft(), 0, 'key')
  const disabled = await ctx.modelConnections.save({ ...draft(), enabled: false, name: 'Other' }, 1, 'other-key')
  const other = disabled.connections[1]
  if (!other) throw new Error('test expected second connection')
  ctx.llm.registerAdapter([other.id], new ForeignAdapter())
  const result = await ctx.modelConnections.save({ ...draft(), id: other.id, name: 'Other' }, 2)
  expect(result.revision).toBe(3)
  expect(result.connections.every(row => row.activationError?.includes('saved'))).toBe(true)
  expect(ctx.llm.listProviders().map(row => row.id).sort()).toEqual([first(initial).id, other.id].sort())
  expect((await ctx.modelConnections.test(first(initial).id, 'my-model')).ok).toBe(false)
  await ctx.modelConnections.deleteConnection(first(initial).id, 3)
  expect(ctx.llm.listProviders().map(row => row.id)).toEqual([other.id])
})

it('rejects deleting or disabling the selected default and removes non-default routes on unload', async () => {
  const { ctx } = await fixture()
  const saved = await ctx.modelConnections.save(draft(), 0, 'key')
  const id = first(saved).id
  await ctx.modelConnections.setDefault(id, 'my-model', 1)
  await expect(ctx.modelConnections.deleteConnection(id, 2)).rejects.toMatchObject({ code: 'model-connections/default-in-use' })
  await expect(ctx.modelConnections.save({ ...draft(), id, enabled: false }, 2)).rejects.toMatchObject({ code: 'model-connections/invalid' })
  await ctx.agentDefaultModel.saveSelection({ provider: 'legacy', model: 'different' })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'legacy', model: 'different' })
  await ctx.modelConnections.deleteConnection(id, 3)
  expect(ctx.llm.listProviders()).toEqual([])
  const savedAgain = await ctx.modelConnections.save(draft(), 4, 'next-key')
  expect(ctx.llm.listProviders()[0]?.id).toBe(first(savedAgain).id)
  const llm = ctx.llm
  const defaults = ctx.agentDefaultModel
  await ctx.fiber.dispose()
  expect(llm.listProviders()).toEqual([])
  expect(defaults.currentSelection()).toEqual({ provider: 'legacy', model: 'original' })
})

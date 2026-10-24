/** Domain-owned profiles use the public runtime without mounting the Config plugin. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import LocalCredentials from '@deepseek-ai/dsh-credentials-local'
import { createPiAiRuntime, resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai'
import type { Options } from '@deepseek-ai/dsh-llm-pi-ai'
import { assemble } from './assemble.ts'
import { anthropicTextEvents, closeMockServers, mockServer, responsesTextEvents, textEvents } from './mock-server.ts'

const contexts: Context[] = []
const homes: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await closeMockServers()
  await Promise.all(homes.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function host(): Promise<Context> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pi-runtime-'))
  homes.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LocalCredentials, { path: join(root, 'credentials.yml'), watch: false })
  await ctx.credentials.set(credentialRef('PI_RUNTIME_KEY'), 'runtime-key')
  return ctx
}

/** One stable route with a complete, explicitly selected model protocol. */
function profiles(baseURL: string, api: string): Options['providers'] {
  return {
    'connection-runtime': {
      apiKeyEnv: 'PI_RUNTIME_KEY', baseURL,
      models: [{ id: 'm', api, contextWindow: 8192, maxTokens: 128 }],
    },
  }
}

describe('public pi-ai runtime', () => {
  it('dispatches mixed model protocols and discovers with the stored credential', async () => {
    const server = await mockServer([
      { events: textEvents },
      { events: responsesTextEvents },
      { events: anthropicTextEvents },
      { body: JSON.stringify({ data: [{ id: 'discovered' }] }) },
    ])
    const ctx = await host()
    const current = resolveProfiles({
      'connection-runtime': {
        apiKeyEnv: 'PI_RUNTIME_KEY', api: 'openai-completions', baseURL: `${server.url}/v1`,
        models: [{ id: 'chat' }, { id: 'response', api: 'openai-responses' }, { id: 'messages', api: 'anthropic-messages' }],
      },
    })
    const runtime = createPiAiRuntime(ctx, { profiles: () => current })
    expect(ctx.llm.listProviders()).toEqual([])
    ctx.llm.registerAdapter([...current.keys()], runtime.adapter)

    expect((await assemble(ctx, { provider: 'connection-runtime', model: 'chat', messages: [] })).finish).toEqual({ kind: 'stop' })
    expect((await assemble(ctx, { provider: 'connection-runtime', model: 'response', messages: [] })).finish).toEqual({ kind: 'stop' })
    expect((await assemble(ctx, { provider: 'connection-runtime', model: 'messages', messages: [] })).finish).toEqual({ kind: 'stop' })
    await expect(runtime.discoverModels({ provider: 'connection-runtime', baseURL: `${server.url}/v1`, api: 'openai-responses' }))
      .resolves.toEqual([{ id: 'discovered', name: 'discovered' }])
    expect(server.paths).toEqual(['/v1/chat/completions', '/v1/responses', '/v1/messages?beta=true', '/v1/models'])
    expect([server.headers[0]?.authorization, server.headers[1]?.authorization, server.headers[3]?.authorization])
      .toEqual(['Bearer runtime-key', 'Bearer runtime-key', 'Bearer runtime-key'])
    expect(server.headers[2]?.['x-api-key']).toBe('runtime-key')
  })

  it('keeps a prepared model protocol and endpoint while the next call uses the new snapshot', async () => {
    const oldEndpoint = await mockServer([{ events: textEvents }])
    const newEndpoint = await mockServer([{ events: responsesTextEvents }])
    const ctx = await host()
    let current = resolveProfiles(profiles(`${oldEndpoint.url}/v1`, 'openai-completions'))
    const runtime = createPiAiRuntime(ctx, { profiles: () => current })
    const registration = ctx.llm.registerAdapter([...current.keys()], runtime.adapter)
    const prepared = await ctx.llm.prepareCall({ provider: 'connection-runtime', model: 'm' })

    current = resolveProfiles(profiles(`${newEndpoint.url}/v1`, 'openai-responses'))
    registration.replace([...current.keys()])
    const assembler = new BlockAssembler()
    for await (const chunk of prepared.stream({ ...prepared.config, messages: [] })) assembler.push(chunk)
    expect(assembler.finish).toEqual({ kind: 'stop' })
    expect((await assemble(ctx, { provider: 'connection-runtime', model: 'm', messages: [] })).finish).toEqual({ kind: 'stop' })
    expect(oldEndpoint.paths).toEqual(['/v1/chat/completions'])
    expect(newEndpoint.paths).toEqual(['/v1/responses'])

    registration.replace([])
    expect(ctx.llm.listProviders()).toEqual([])
  })
})

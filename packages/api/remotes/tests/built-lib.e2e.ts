import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Built-artifact smokes load the shipping Browser Remote assembly under plain
 * Node and exercise its transport and reversible contribution lifecycle.
 */

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const root = resolve(packageDir, '../../..')
const artifact = (path: string): string => join(root, path)
const artifactUrl = (path: string): string => pathToFileURL(artifact(path)).href

const requiredArtifacts = [
  'packages/client/connection/lib/client.browser.js',
  'packages/client/connection/lib/index.js',
  'packages/api/remotes/lib/client.js',
  'packages/core/agent/lib/index.js',
  'packages/core/session/lib/index.js',
  'packages/goal/goal/lib/index.js',
  'packages/goal/goal/lib/typert.host.js',
  'packages/api/gateway/lib/client.browser.js',
  'packages/api/gateway/lib/index.js',
  'packages/api/remote-access/lib/index.js',
  'packages/typert/registry/lib/client.browser.js',
  'packages/typert/registry/lib/index.js',
  'packages/session/session-projection/lib/index.js',
].every(path => existsSync(artifact(path)))

describe.skipIf(!requiredArtifacts)('Remote assembly built LIB chain', () => {
  it('runs root and Agent-scoped calls through generated bundles and real HTTP', async () => {
    const urls = Object.fromEntries(Object.entries({
      agent: 'packages/core/agent/lib/index.js',
      apiGatewayClient: 'packages/api/gateway/lib/client.browser.js',
      apiGatewayHost: 'packages/api/gateway/lib/index.js',
      connectionClient: 'packages/client/connection/lib/client.browser.js',
      connectionHost: 'packages/client/connection/lib/index.js',
      goal: 'packages/goal/goal/lib/index.js',
      goalTypert: 'packages/goal/goal/lib/typert.host.js',
      remoteAccess: 'packages/api/remote-access/lib/index.js',
      registryClient: 'packages/typert/registry/lib/client.browser.js',
      registryHost: 'packages/typert/registry/lib/index.js',
      remotesClient: 'packages/api/remotes/lib/client.js',
      session: 'packages/core/session/lib/index.js',
      sessionProjections: 'packages/session/session-projection/lib/index.js',
    }).map(([key, path]) => [key, artifactUrl(path)]))
    const script = `
      import { createServer } from 'node:http'
      import * as cordis from '@deepseek-ai/cordis'
      import * as zod from 'zod'

      const urls = ${JSON.stringify(urls)}
      const { Context } = cordis
      const { default: AgentRegistry } = await import(urls.agent)
      const connectionHost = await import(urls.connectionHost)
      const { default: TypertRemoteService } = await import(urls.apiGatewayHost)
      const { default: RemoteAccessService } = await import(urls.remoteAccess)
      const { default: GoalService } = await import(urls.goal)
      const { default: SessionProjectionRegistry } = await import(urls.sessionProjections)
      const { TYPERT } = await import(urls.goalTypert)
      const { default: TypertRegistry } = await import(urls.registryHost)
      const { Session, SessionId } = await import(urls.session)

      const routes = []
      const credentialRecords = new Map()
      const host = new Context()
      host.provide('webServer', {
        register(route) {
          routes.push(route)
          return () => { routes.splice(routes.indexOf(route), 1) }
        },
        tapIndex() { return () => {} },
        port: 0,
      })
      host.provide('credentials', {
        readRecord(key) { return Promise.resolve(credentialRecords.get(key)) },
        async modifyRecord(key, mutate) {
          const current = credentialRecords.get(key)
          const next = await mutate(current)
          if (next !== undefined) credentialRecords.set(key, next)
          return next ?? current
        },
      })
      await host.plugin({ inject: connectionHost.inject, apply: connectionHost.apply })
      await host.plugin(TypertRegistry)
      await host.plugin(AgentRegistry)
      await host.plugin(RemoteAccessService)
      await host.plugin(TypertRemoteService)
      await host.plugin(SessionProjectionRegistry)
      await host.plugin(GoalService)
      host.typert.register(TYPERT)

      const makeAgent = rawId => {
        const session = new Session(SessionId(rawId))
        return {
          id: session.id,
          options: {},
          session,
          ctx: host.extend(),
          status: 'idle',
          acceptsNextStep: false,
          send() {},
          updateInbox() { return 'not-found' },
          followup() {},
          steer() { return { outcome: Promise.resolve({ status: 'rejected' }) } },
          inject(input) { session.append('user/message', input, { surfaceOp: 'append' }) },
          reserveTurnAdmission() {},
          cancel() {},
          whenIdle() { return Promise.resolve() },
        }
      }
      const rootAgent = makeAgent('built-root-agent')
      const scopedAgent = makeAgent('built-scoped-agent')
      host.agents.register(rootAgent)
      host.agents.register(scopedAgent)

      const apiRoutes = routes.filter(route => route.path === '/api')
      if (apiRoutes.length !== 1) {
        throw new Error('Connection did not register exactly one /api route')
      }
      const apiRoute = apiRoutes[0]
      const server = createServer((request, response) => {
        if ((request.url ?? '/').startsWith('/?')) {
          if (host.connection.authorizeIndex(request, response)) {
            response.writeHead(200, { 'content-type': 'text/html' })
            response.end('<body>shell</body>')
          }
          return
        }
        void apiRoute.handler(request, response)
      })
      await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('HTTP server has no TCP address')
      const origin = 'http://127.0.0.1:' + String(address.port)
      // The browser emulation below installs page globals the Client halves
      // read; the finally restores this process's own values.
      const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
      const previousFetch = globalThis.fetch
      try {
        globalThis.document = { baseURI: origin + '/' }
        const login = await fetch(host.connection.authenticatedUrl(origin), { redirect: 'manual' })
        const setCookie = login.headers.get('set-cookie')
        if (login.status !== 303 || setCookie === null) throw new Error('browser token exchange failed')
        const cookie = setCookie.split(';', 1)[0]
        globalThis.fetch = (input, init = {}) => {
          const headers = new Headers(init.headers)
          headers.set('cookie', cookie)
          return previousFetch(new URL(input, document.baseURI), { ...init, headers })
        }

        const handoffs = new Map()
        globalThis.window = {
          __ModuleLoader__: {
            load(handoff) { handoffs.set(handoff.id, handoff) },
          },
        }
        globalThis.location = { hostname: '127.0.0.1', origin, search: '' }
        await import(urls.registryClient)
        await import(urls.connectionClient)
        await import(urls.apiGatewayClient)
        await import(urls.remotesClient)

        const instantiate = id => {
          const handoff = handoffs.get(id)
          if (handoff === undefined) throw new Error('missing Client bundle handoff ' + id)
          return handoff.factory(specifier => {
            if (specifier === '@deepseek-ai/cordis') return cordis
            if (specifier === 'zod') return zod
            throw new Error('unexpected Client external ' + specifier)
          })
        }
        const client = new Context()
        for (const id of [
          '@deepseek-ai/dsh-typert-registry',
          '@deepseek-ai/dsh-client-connection',
          '@deepseek-ai/dsh-api-gateway',
          '@deepseek-ai/dsh-api-remotes',
        ]) {
          const plugin = instantiate(id)
          await client.plugin({ inject: plugin.inject, apply: plugin.apply })
        }
        client.typert.contexts.registerClient('agent', {
          identity: candidate => candidate.builtAgentId,
        })

        const invalidResult = await client.remote.goals.create(rootAgent.id, { objective: 1 })
        // Every generated method resolves to the RemoteResult envelope; the
        // business values below are what the assertions pin.
        const rootResult = await client.remote.goals.create(rootAgent.id, { objective: 'root goal' })
        const rootEdit = await client.remote.goals.edit(
          rootAgent.id,
          rootResult.value.ref,
          { objective: 'edited root goal' },
        )
        const agentContext = client.extend({ builtAgentId: scopedAgent.id })
        const scopedResult = await agentContext.remote.goals.create({ objective: 'scoped goal', maxGoalRounds: 3 })
        const result = {
          invalidResult,
          rootResult: rootResult.value,
          rootEdit: rootEdit.value,
          scopedResult: scopedResult.value,
          rootGoal: host.goals.get(rootAgent)?.objective,
          scopedGoal: host.goals.get(scopedAgent)?.objective,
          rootEvents: rootAgent.session.snapshotEvents().length,
          scopedEvents: scopedAgent.session.snapshotEvents().length,
        }

        await client.fiber.dispose()
        await new Promise((resolveClose, rejectClose) => server.close(error => {
          if (error === undefined) resolveClose()
          else rejectClose(error)
        }))
        await host.fiber.dispose()
        console.log(JSON.stringify(result))
      } finally {
        if (previousDocument === undefined) delete globalThis.document
        else Object.defineProperty(globalThis, 'document', previousDocument)
        globalThis.fetch = previousFetch
      }
    `

    const result = await runPlainNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    const output = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}') as {
      invalidResult: { ok: boolean; error?: { code: string } }
      rootResult: { ref: { id: string; revision: number } }
      rootEdit: { objective: string; revision: number }
      scopedResult: { ref: { id: string; revision: number } }
      rootGoal: string
      scopedGoal: string
      rootEvents: number
      scopedEvents: number
    }
    expect(output).toMatchObject({
      invalidResult: { ok: false, error: { code: 'gateway/input-invalid' } },
      rootResult: { ref: { revision: 1 } },
      rootEdit: { objective: 'edited root goal', revision: 2 },
      scopedResult: { ref: { revision: 1 } },
      rootGoal: 'edited root goal',
      scopedGoal: 'scoped goal',
      rootEvents: 2,
      scopedEvents: 1,
    })
    expect(output.rootResult.ref.id).toMatch(/^goal-/)
    expect(output.scopedResult.ref.id).toMatch(/^goal-/)
  }, 60_000)

  it('mounts model connections beside the selected remotes and withdraws them on unload', async () => {
    const urls = {
      registry: artifactUrl('packages/typert/registry/lib/client.browser.js'),
      gateway: artifactUrl('packages/api/gateway/lib/client.browser.js'),
      remotes: artifactUrl('packages/api/remotes/lib/client.js'),
    }
    const script = `
      import assert from 'node:assert/strict'
      import * as cordis from '@deepseek-ai/cordis'
      import * as zod from 'zod'

      const urls = ${JSON.stringify(urls)}
      const handoffs = new Map()
      globalThis.window = {
        __ModuleLoader__: { load(handoff) { handoffs.set(handoff.id, handoff) } },
      }
      for (const url of Object.values(urls)) await import(url)
      const instantiate = id => {
        const handoff = handoffs.get(id)
        if (handoff === undefined) throw new Error('missing Client bundle handoff ' + id)
        return handoff.factory(specifier => {
          if (specifier === '@deepseek-ai/cordis') return cordis
          if (specifier === 'zod') return zod
          throw new Error('unexpected Client external ' + specifier)
        })
      }

      const calls = []
      const snapshot = { revision: 8, defaultBaseURL: 'https://models.example/v1', connections: [], catalog: [] }
      const client = new cordis.Context()
      client.provide('connection', {
        interactions: 'none',
        isLoopback: true,
        generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
        state: { getSnapshot: () => undefined, subscribe: () => () => {} },
        reconnect() {},
        openWebSocket() { throw new Error('unexpected WebSocket') },
        start() { throw new Error('unexpected connection loop') },
        registerGenerationSource() { throw new Error('unexpected generation source') },
        rpc: {
          async call(path, endpoint, payload, signal) {
            calls.push({ path, endpoint, payload, cancellable: signal instanceof AbortSignal })
            if (endpoint === 'modelConnections/deleteConnection') return { ok: true, value: snapshot }
            if (endpoint === 'goals/create') return { ok: true, value: { ref: { id: 'goal-preserved', revision: 1 } } }
            throw new Error('unexpected RPC endpoint ' + endpoint)
          },
          open() { throw new Error('unexpected stream') },
        },
      })
      try {
        for (const id of ['@deepseek-ai/dsh-typert-registry', '@deepseek-ai/dsh-api-gateway']) {
          const plugin = instantiate(id)
          await client.plugin({ inject: plugin.inject, apply: plugin.apply })
        }
        const remotes = instantiate('@deepseek-ai/dsh-api-remotes')
        const mount = () => client.plugin({ inject: remotes.inject, apply: remotes.apply })
        const assembly = mount()
        await assembly
        const descriptors = client.typert.remotes.list()
        const endpoints = descriptors.map(item => item.namespace + '/' + item.method)
        assert(endpoints.includes('modelConnections/deleteConnection'))
        assert(!endpoints.includes('modelConnections/remove'))
        assert(!endpoints.some(endpoint => endpoint.startsWith('account/')))
        assert.equal(client.remote.account, undefined)
        assert(endpoints.includes('goals/create'))
        assert.equal(typeof client.remote.userQuestions.answer, 'function')
        const retainedDelete = client.remote.modelConnections.deleteConnection
        const retainedCreate = client.remote.goals.create
        assert.deepEqual(await retainedDelete('maas-saved', 7), { ok: true, value: snapshot })
        assert.deepEqual(await retainedCreate('agent-1', { objective: 'preserve another namespace' }), {
          ok: true, value: { ref: { id: 'goal-preserved', revision: 1 } },
        })

        await assembly.dispose()
        assert.equal(client.remote.modelConnections, undefined)
        assert.equal(client.remote.goals, undefined)
        assert.equal(client.remote.userQuestions, undefined)
        assert.equal(client.get('remote.modelConnections'), undefined)
        assert.deepEqual(client.typert.remotes.list(), [])
        const staleDelete = await retainedDelete('maas-saved', 7)
        const staleCreate = await retainedCreate('agent-1', { objective: 'unloaded namespace' })
        assert.equal(staleDelete.ok, false)
        assert.match(staleDelete.error.message, /modelConnections\\/deleteConnection is no longer mounted/)
        assert.equal(staleCreate.ok, false)
        assert.match(staleCreate.error.message, /goals\\/create is no longer mounted/)
        assert.equal(calls.length, 2)

        const reloaded = mount()
        await reloaded
        assert.equal(client.typert.remotes.list().length, descriptors.length)
        assert.deepEqual(await client.remote.modelConnections.deleteConnection('maas-reloaded', 7), {
          ok: true, value: snapshot,
        })
        await reloaded.dispose()
        assert.deepEqual(client.typert.remotes.list(), [])
        console.log(JSON.stringify({ calls }))
      } finally {
        await client.fiber.dispose()
      }
    `

    const result = await runPlainNode(script)
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
    const output: unknown = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}')
    expect(output).toEqual({ calls: [
      {
        path: '/api', endpoint: 'modelConnections/deleteConnection',
        payload: { args: { id: 'maas-saved', expectedRevision: 7 } }, cancellable: true,
      },
      {
        path: '/api', endpoint: 'goals/create',
        payload: { args: { agentId: 'agent-1', request: { objective: 'preserve another namespace' } } }, cancellable: true,
      },
      {
        path: '/api', endpoint: 'modelConnections/deleteConnection',
        payload: { args: { id: 'maas-reloaded', expectedRevision: 7 } }, cancellable: true,
      },
    ] })
  }, 60_000)
})

/** Execute one ESM script without tsx or a TypeScript loader. */
function runPlainNode(script: string): Promise<{
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}> {
  return new Promise((resolveRun) => {
    execFile(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: 55_000,
    }, (error, stdout, stderr) => {
      resolveRun({
        exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : null,
        stdout,
        stderr,
      })
    })
  })
}

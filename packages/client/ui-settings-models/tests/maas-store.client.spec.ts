/** Late replies and concurrent operations cannot replace a newer connection view or discard a draft's revision. */
import { describe, expect, it, vi } from 'vitest'
import type { ConnectionsSnapshot, ConnectionTestResult } from '@deepseek-ai/dsh-model-connections/types'
import { MaasSettingsStore } from '../src/client/maas-store.ts'
import type { MaasOperations, MaasResult } from '../src/client/maas-operations.ts'

function snapshot(revision = 1): ConnectionsSnapshot {
  return { revision, defaultBaseURL: 'https://llm-api.x-aio.com/v1', connections: [], catalog: [], reasoningLevels: ['off', 'low', 'medium', 'high'] }
}

function ok<T>(value: T): MaasResult<T> { return { ok: true, value } }

function operations(): MaasOperations {
  return {
    list: async () => ok(snapshot()), save: async () => ok(snapshot(2)), remove: async () => ok(snapshot(2)),
    setDefault: async () => ok(snapshot(2)), discover: async () => ok([]), test: async () => ok({ ok: true, message: 'success' }),
  }
}

describe('MaaS settings controller', () => {
  it('keeps the newest read when earlier requests settle afterward', async () => {
    const older = Promise.withResolvers<MaasResult<ConnectionsSnapshot>>()
    const newer = Promise.withResolvers<MaasResult<ConnectionsSnapshot>>()
    const api = operations()
    api.list = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const controller = new MaasSettingsStore(api)
    const first = controller.load()
    const second = controller.load()
    newer.resolve(ok(snapshot(8)))
    await second
    older.resolve(ok(snapshot(3)))
    await first
    expect(controller.store.getSnapshot().snapshot?.revision).toBe(8)
    expect(controller.store.getSnapshot().status).toBe('ready')
  })

  it('keeps the confirmed snapshot after a failed refresh and permits a retry', async () => {
    const api = operations()
    const controller = new MaasSettingsStore(api)
    await controller.load()
    api.list = async () => ({ ok: false, error: 'unavailable' })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'error', snapshot: { revision: 1 }, error: 'unavailable' })
    api.list = async () => ok(snapshot(3))
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', snapshot: { revision: 3 }, error: null })
  })

  it('holds the write slot, rejects concurrent actions, and retains the old revision on conflict', async () => {
    const saving = Promise.withResolvers<MaasResult<ConnectionsSnapshot>>()
    const api = operations()
    api.save = () => saving.promise
    const controller = new MaasSettingsStore(api)
    await controller.load()
    const write = controller.save({ name: 'A', baseURL: 'https://api.example/v1', enabled: true, models: [] }, 1, 'fixture-key')
    expect(await controller.remove('unrelated', 1)).toBe(false)
    await controller.load()
    expect(controller.store.getSnapshot().busy).toBe(true)
    saving.resolve({ ok: false, error: 'conflict' })
    expect(await write).toBe(false)
    expect(controller.store.getSnapshot()).toMatchObject({ busy: false, error: 'conflict', snapshot: { revision: 1 } })
    expect(JSON.stringify(controller.store.getSnapshot())).not.toContain('fixture-key')
  })

  it('publishes explicit discovery and test outcomes separately from a saved configuration', async () => {
    const api = operations()
    api.discover = async () => ok([{ id: 'server-model' }])
    api.test = async () => ok({ ok: false, message: 'timeout' })
    const controller = new MaasSettingsStore(api)
    await controller.load()
    await controller.discover('one', 'anthropic-messages')
    expect(controller.store.getSnapshot().discovery).toEqual({ connectionId: 'one', protocol: 'anthropic-messages', models: [{ id: 'server-model' }] })
    controller.closeDiscovery()
    expect(controller.store.getSnapshot().discovery).toBeNull()
    await controller.test('one', 'server-model')
    expect(controller.store.getSnapshot()).toMatchObject({ notice: 'test-failed', diagnostic: 'timeout', snapshot: { revision: 1 } })
  })

  it('ignores pending operation results after disposal', async () => {
    const pending = Promise.withResolvers<MaasResult<ConnectionTestResult>>()
    const api = operations()
    api.test = () => pending.promise
    const controller = new MaasSettingsStore(api)
    await controller.load()
    const test = controller.test('one', 'a')
    controller.dispose()
    pending.resolve(ok({ ok: true, message: 'late success' }))
    await test
    expect(controller.store.getSnapshot().notice).toBeNull()
    expect(await controller.setDefault('one', 'a', 1)).toBe(false)
  })
})

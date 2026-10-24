/** Default model references remain live without a settings service. */
import { Context } from '@deepseek-ai/cordis'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import type { Principal, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it, onTestFinished, vi } from 'vitest'
import DefaultModel from '../src/index.ts'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Non-owner identity used to verify product-default persistence. */
    'test-default-user': { readonly kind: 'test-default-user'; readonly user: string }
  }
}

function callerContext(ctx: Context, principal: Principal): Context {
  const invocation: RemoteInvocation = {
    request: { namespace: 'session', method: 'selectModel', args: {} },
    service: 'session',
    peer: new Peer(ctx, { principal }),
    signal: new AbortController().signal,
    uplink: <In>(): AsyncIterable<In> => ({
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
    }),
  }
  return ctx.extend({ invocation })
}

it('reads complete selections from volatile config and clears omitted reasoning effort', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const live = await liveConfig(ctx, DefaultModel, { provider: 'p', model: 'm' })
  const consumer = ctx.agentDefaultModel
  await live.update({ provider: 'q', model: 'n', reasoningEffort: 'high' })
  expect(consumer.currentSelection()).toEqual({ provider: 'q', model: 'n', reasoningEffort: 'high' })
  await live.replace({ provider: 'p', model: 'm' })
  expect(consumer.currentSelection()).toEqual({ provider: 'p', model: 'm' })
  await consumer.saveSelection({ provider: 'unsaved', model: 'unsaved' })
  expect(consumer.currentSelection()).toEqual({ provider: 'p', model: 'm' })
})

it('persists complete selections through its owning profile entry', async () => {
  const { configurationFixture } = await import('../../../settings/settings/tests/configuration-fixture.ts')
  const { ReasoningEffortId } = await import('@deepseek-ai/dsh-llm')
  const { ctx } = await configurationFixture({ hmr: false })
  await ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'next', reasoningEffort: ReasoningEffortId('high') })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'next', reasoningEffort: 'high' })
  await ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'final' })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'final' })
  const standalone = new Context()
  onTestFinished(() => standalone.fiber.dispose())
  await standalone.plugin(DefaultModel, { provider: 'test', model: 'original' })
  await standalone.agentDefaultModel.saveSelection({ provider: 'test', model: 'ignored' })
  expect(standalone.agentDefaultModel.currentSelection()?.model).toBe('original')
})

it('serializes overlapping saves and continues after a rejected write', async () => {
  const { configurationFixture } = await import('../../../settings/settings/tests/configuration-fixture.ts')
  const { ctx } = await configurationFixture({ hmr: false })
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const editor = ctx.configEditor
  const edit = editor.edit.bind(editor)
  const calls: string[] = []
  const intercepted = vi.spyOn(editor, 'edit').mockImplementationOnce(async () => {
    calls.push('rejected')
    entered.resolve(undefined)
    await release.promise
    throw new Error('read-only document')
  }).mockImplementation(async (entry, change) => {
    calls.push('saved')
    await edit(entry, change)
  })
  const first = ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'rejected' })
  const failed = expect(first).rejects.toThrow('read-only document')
  const lastSelection = { provider: 'test', model: 'final' }
  const last = ctx.agentDefaultModel.saveSelection(lastSelection)
  onTestFinished(async () => {
    release.resolve(undefined)
    await Promise.allSettled([failed, last])
    intercepted.mockRestore()
  })
  lastSelection.model = 'mutated'
  await entered.promise
  expect(calls).toEqual(['rejected'])
  release.resolve(undefined)
  await failed
  await last
  expect(calls).toEqual(['rejected', 'saved'])
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'final' })
})

it('uses one product source, inherits an absent default, and restores Config after disposal', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await liveConfig(ctx, DefaultModel, { provider: 'legacy', model: 'original' })
  let value: ModelSelection | undefined
  const source = {
    currentSelection: () => value,
    saveSelection: async (next: ModelSelection) => { value = next },
  }
  const release = ctx.agentDefaultModel.registerSource(source)
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'legacy', model: 'original' })
  expect(() => ctx.agentDefaultModel.registerSource(source)).toThrow('already registered')
  const selected = { provider: 'product', model: 'saved' }
  const saved = ctx.agentDefaultModel.saveSelection(selected)
  selected.model = 'mutated after submitting'
  await saved
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'product', model: 'saved' })
  release()
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'legacy', model: 'original' })
  ctx.agentDefaultModel.registerSource(source)
})

it('keeps a non-owner selection local while owner and internal callers may save the product default', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await liveConfig(ctx, DefaultModel, { provider: 'legacy', model: 'original' })
  let value: ModelSelection | undefined
  ctx.agentDefaultModel.registerSource({
    currentSelection: () => value,
    saveSelection: async (next) => { value = next },
  })
  await ctx.agentDefaultModel.saveSelection({ provider: 'internal', model: 'initial' })
  const guest = callerContext(ctx, { kind: 'test-default-user', user: 'visitor' })
  const spoofedSelection = { provider: 'guest', model: 'session-only', principal: { kind: 'owner' } }
  await expect(guest.agentDefaultModel.saveSelection(spoofedSelection)).resolves.toBeUndefined()
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'internal', model: 'initial' })
  const owner = callerContext(ctx, { kind: 'owner' })
  await owner.agentDefaultModel.saveSelection({ provider: 'owner', model: 'saved' })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'owner', model: 'saved' })
  await guest.agentDefaultModel.saveSelection({ provider: 'guest', model: 'another-session' })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'owner', model: 'saved' })
})

it('keeps a new runtime unconfigured until an explicit model is selected', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(DefaultModel, {})
  expect(ctx.agentDefaultModel.currentSelection()).toBeUndefined()
  expect(() => ctx.agentDefaultModel.requireSelection()).toThrow('Choose a model')
  let selected: ModelSelection | undefined
  ctx.agentDefaultModel.registerSource({
    currentSelection: () => selected,
    saveSelection: async (next) => { selected = next },
  })
  await ctx.agentDefaultModel.saveSelection({ provider: 'maas-explicit', model: 'chosen' })
  expect(ctx.agentDefaultModel.requireSelection()).toEqual({ provider: 'maas-explicit', model: 'chosen' })
})

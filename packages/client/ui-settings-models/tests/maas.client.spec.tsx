// @vitest-environment jsdom
/** Model connection setup keeps credentials write-only and commits only selected models. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/src/client/bind.ts'
import type { ConnectionDraft, ConnectionsSnapshot, ModelConnection } from '@deepseek-ai/dsh-model-connections/types'
import { MODEL_CONNECTION_CATALOG } from '@deepseek-ai/dsh-model-connections/src/catalog.ts'
import { MaasSection } from '../src/client/MaasSection.tsx'
import { MaasSettingsStore } from '../src/client/maas-store.ts'
import type { MaasOperations, MaasResult } from '../src/client/maas-operations.ts'
import { en } from '../src/client/locales.ts'

// Keep the real controls without loading unrelated markdown and media renderers.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...await import('@deepseek-ai/dsh-client-ui-primitives/src/Button.tsx'),
  ...await import('@deepseek-ai/dsh-client-ui-primitives/src/Switch.tsx'),
  ...await import('@deepseek-ai/dsh-client-ui-primitives/src/Checkbox.tsx'),
  ...await import('@deepseek-ai/dsh-client-ui-primitives/src/Tooltip.tsx'),
  ...await import('@deepseek-ai/dsh-client-ui-primitives/src/icons/index.tsx'),
}))

afterEach(cleanup)

function empty(): ConnectionsSnapshot {
  return {
    revision: 4, defaultBaseURL: 'https://llm-api.x-aio.com/v1', connections: [],
    catalog: MODEL_CONNECTION_CATALOG.map(model => ({ ...model })),
    reasoningLevels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  }
}

function connection(): ModelConnection {
  return {
    id: 'maas-saved', name: 'My API', baseURL: 'https://llm-api.x-aio.com/v1', enabled: true, credentialConfigured: true,
    models: [{ id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', protocol: 'openai-responses', contextWindow: 16384 }],
  }
}

function ok<T>(value: T): MaasResult<T> { return { ok: true, value } }

function fixture(initial = empty()) {
  let snapshot = initial
  const saved: { draft: ConnectionDraft; apiKey: string | undefined }[] = []
  const operations: MaasOperations = {
    list: vi.fn(async () => ok(snapshot)),
    save: vi.fn(async (draft: ConnectionDraft, revision: number, apiKey?: string): Promise<MaasResult<ConnectionsSnapshot>> => {
      if (revision !== snapshot.revision) return { ok: false, error: 'conflict' }
      saved.push({ draft, apiKey })
      const previous = snapshot.connections.find(item => item.id === draft.id)
      const next: ModelConnection = {
        ...draft, id: draft.id ?? 'maas-new', credentialConfigured: !!apiKey || !!previous?.credentialConfigured,
        models: draft.models.map(model => ({
          ...model, protocol: model.protocol ?? snapshot.catalog.find(item => item.id === model.id)?.protocol ?? 'openai-completions',
        })),
      }
      snapshot = {
        ...snapshot, revision: snapshot.revision + 1,
        connections: [...snapshot.connections.filter(item => item.id !== next.id), next],
      }
      return ok(snapshot)
    }),
    remove: vi.fn(async (id: string) => {
      snapshot = { ...snapshot, revision: snapshot.revision + 1, connections: snapshot.connections.filter(item => item.id !== id) }
      return ok(snapshot)
    }),
    setDefault: vi.fn(async (id: string, modelId: string) => {
      snapshot = { ...snapshot, revision: snapshot.revision + 1, defaultSelection: { provider: id, model: modelId } }
      return ok(snapshot)
    }),
    discover: vi.fn(async () => ok([{ id: 'custom-new', name: 'A discovered model' }])),
    test: vi.fn(async () => ok({ ok: true, message: 'Connection succeeded.' })),
  }
  const controller = new MaasSettingsStore(operations)
  render(<MaasSection controller={controller} useSnapshot={bindSnapshotSelector(controller.store)} t={key => en[key]} />)
  return { controller, operations, saved, changeSnapshot: (next: ConnectionsSnapshot) => { snapshot = next } }
}

async function addConnection(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: en.maasAdd }))
}

describe('MaaS connection settings', () => {
  it('starts with an unconfigured state and no enabled catalog models or automatic probes', async () => {
    const { operations } = fixture()
    expect(await screen.findByText(en.maasEmpty)).toBeTruthy()
    expect(screen.queryByText('GPT 6.1 Sol')).toBeNull()
    await addConnection()
    expect(screen.getByLabelText<HTMLInputElement>(en.baseUrl).value).toBe('https://llm-api.x-aio.com/v1')
    expect(screen.getByLabelText<HTMLInputElement>(en.maasName).value).toBe('BlueNeo')
    expect(screen.getByLabelText<HTMLInputElement>(en.keyInput).value).toBe('')
    expect(within(screen.getByLabelText(en.maasCatalog)).getAllByRole('option')).toHaveLength(13)
    expect(screen.queryByLabelText(en.modelId)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', en.maasNoModels)
    expect(operations.discover).not.toHaveBeenCalled()
    expect(operations.test).not.toHaveBeenCalled()
    expect(operations.save).not.toHaveBeenCalled()
  })

  it('uses the catalog protocol as a default while saving an explicit model override and hiding the key afterward', async () => {
    const { saved } = fixture()
    await addConnection()
    fireEvent.change(screen.getByLabelText(en.maasCatalog), { target: { value: 'gpt-6.1-sol' } })
    const protocol = screen.getByLabelText<HTMLSelectElement>(`${en.customApi} 1`)
    expect(protocol.value).toBe('auto')
    expect(within(protocol).getByRole('option', { name: `${en.maasAutomatic} · ${en.protocolOpenAiResponses}` })).toBeTruthy()
    fireEvent.change(protocol, { target: { value: 'anthropic-messages' } })
    expect(screen.getByText(en.maasAnthropicReasoningHint)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'sk-fixture-only-key' } })
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByText(en.maasSaved)).toBeTruthy()
    expect(saved[0]?.draft.models).toEqual([{ id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', protocol: 'anthropic-messages' }])
    expect(screen.getByText(en.protocolAnthropicMessages, { selector: 'small' })).toBeTruthy()
    expect(document.body.textContent).not.toContain('sk-fixture-only-key')
    fireEvent.click(screen.getByRole('button', { name: en.edit }))
    expect(screen.getByLabelText<HTMLInputElement>(en.keyInput).value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>(en.keyInput).placeholder).toBe(en.keyPlaceholderSaved)
    expect(screen.getByLabelText<HTMLSelectElement>(`${en.customApi} 1`).value).toBe('anthropic-messages')
    expect(screen.getByText(en.maasAnthropicReasoningHint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    await waitFor(() => { expect(saved).toHaveLength(2) })
    expect(saved[1]?.apiKey).toBeUndefined()
  })

  it('lets unknown manual models use automatic Chat without inventing capacity metadata', async () => {
    const { saved } = fixture()
    await addConnection()
    fireEvent.click(screen.getByRole('button', { name: en.addModel }))
    fireEvent.change(screen.getByLabelText(`${en.modelId} 1`), { target: { value: 'my-private-model' } })
    expect(screen.getByRole('option', { name: `${en.maasAutomatic} · ${en.protocolOpenAiCompletions}` })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByText(en.maasSaved)).toBeTruthy()
    expect(saved[0]?.draft.models).toEqual([{ id: 'my-private-model', name: 'my-private-model' }])
    expect(screen.getByText(en.protocolOpenAiCompletions, { selector: 'small' })).toBeTruthy()
  })

  it('retains existing capacity and protocol fields while editing without reading stored credentials', async () => {
    const { saved } = fixture({ ...empty(), connections: [connection()] })
    fireEvent.click(await screen.findByRole('button', { name: en.edit }))
    fireEvent.change(screen.getByLabelText(en.maasName), { target: { value: 'Renamed API' } })
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByText('Renamed API')).toBeTruthy()
    expect(saved[0]?.apiKey).toBeUndefined()
    expect(saved[0]?.draft.models[0]).toMatchObject({ protocol: 'openai-responses', contextWindow: 16384 })
    expect(saved[0]?.draft.models[0]).not.toHaveProperty('input')
    expect(saved[0]?.draft.models[0]).not.toHaveProperty('reasoningEfforts')
  })

  it('saves explicit image input, token limits, and per-level API values without deriving them from a model name', async () => {
    const { saved } = fixture()
    await addConnection()
    fireEvent.change(screen.getByLabelText(en.maasCatalog), { target: { value: 'gpt-6.1-sol' } })
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: en.modelInputImage }).checked).toBe(false)
    expect(screen.getByRole<HTMLInputElement>('switch', { name: `${en.modelReasoning} 1` }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('checkbox', { name: en.modelInputImage }))
    fireEvent.change(screen.getByLabelText(`${en.contextWindow} 1`), { target: { value: '128K' } })
    fireEvent.change(screen.getByLabelText(`${en.maxTokens} 1`), { target: { value: '8K' } })
    fireEvent.click(screen.getByRole('switch', { name: `${en.modelReasoning} 1` }))
    fireEvent.change(screen.getByLabelText(`high ${en.modelReasoningValue}`), { target: { value: 'provider-high' } })
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByText(en.maasSaved)).toBeTruthy()
    expect(saved[0]?.draft.models[0]).toMatchObject({
      contextWindow: 128000, maxTokens: 8000, input: ['text', 'image'],
      reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'provider-high' },
    })
    fireEvent.click(screen.getByRole('button', { name: en.edit }))
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: en.modelInputImage }).checked).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>(`${en.contextWindow} 1`).value).toBe('128K')
    expect(screen.getByLabelText<HTMLInputElement>(`high ${en.modelReasoningValue}`).value).toBe('provider-high')
  })

  it('rejects invalid capacity and reasoning declarations while retaining the editable draft', async () => {
    const { saved } = fixture({ ...empty(), connections: [connection()] })
    fireEvent.click(await screen.findByRole('button', { name: en.edit }))
    fireEvent.change(screen.getByLabelText(`${en.contextWindow} 1`), { target: { value: '-2' } })
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', en.modelContextInvalid)
    expect(saved).toHaveLength(0)
    fireEvent.change(screen.getByLabelText(`${en.contextWindow} 1`), { target: { value: '' } })
    fireEvent.click(screen.getByRole('switch', { name: `${en.modelReasoning} 1` }))
    for (const level of ['low', 'medium', 'high']) fireEvent.click(screen.getByRole('button', { name: `${en.modelReasoningRemove} ${level}` }))
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(screen.getAllByText(en.modelReasoningNeedsLevel).length).toBeGreaterThan(0)
    expect(saved).toHaveLength(0)
    fireEvent.click(screen.getByRole('switch', { name: `${en.modelReasoning} 1` }))
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByText(en.maasSaved)).toBeTruthy()
    expect(saved[0]?.draft.models[0]).not.toHaveProperty('contextWindow')
  })

  it('uses an explicit discovery protocol and retains it when adopting a candidate', async () => {
    const { operations, saved } = fixture({ ...empty(), connections: [connection()] })
    const discovery = await screen.findByRole('combobox', { name: `${en.maasDiscoveryProtocol} My API` })
    fireEvent.change(discovery, { target: { value: 'anthropic-messages' } })
    fireEvent.click(screen.getByRole('button', { name: en.maasDiscover }))
    expect(await screen.findByText(en.maasCandidates)).toBeTruthy()
    expect(operations.discover).toHaveBeenCalledWith('maas-saved', 'anthropic-messages')
    fireEvent.click(screen.getByRole('button', { name: `${en.maasCandidateAdd} custom-new` }))
    expect(screen.getByLabelText<HTMLSelectElement>(`${en.customApi} 2`).value).toBe('anthropic-messages')
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByText(en.maasSaved)).toBeTruthy()
    expect(saved[0]?.draft.models[1]).toMatchObject({ id: 'custom-new', protocol: 'anthropic-messages' })
  })

  it('preserves a rejected draft and refuses stale revisions after refresh', async () => {
    const base = { ...empty(), connections: [connection()] }
    const { controller, changeSnapshot } = fixture(base)
    fireEvent.click(await screen.findByRole('button', { name: en.edit }))
    fireEvent.change(screen.getByLabelText(en.maasName), { target: { value: 'Unsaved name' } })
    changeSnapshot({ ...base, revision: 12 })
    fireEvent.click(screen.getByRole('button', { name: en.maasSave }))
    expect(await screen.findByText(en.maasErrorConflict)).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>(en.maasName).value).toBe('Unsaved name')
    await act(async () => { await controller.load() })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: en.maasSave }).disabled).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>(en.maasName).value).toBe('Unsaved name')
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    fireEvent.click(screen.getByRole('button', { name: en.edit }))
    expect(screen.getByLabelText<HTMLInputElement>(en.maasName).value).toBe('My API')
  })

  it('only adds discovered candidates through a user draft and tests or selects a saved model explicitly', async () => {
    const { operations, saved } = fixture({ ...empty(), connections: [connection()] })
    fireEvent.click(await screen.findByRole('button', { name: en.maasDiscover }))
    expect(await screen.findByText(en.maasCandidates)).toBeTruthy()
    expect(saved).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: `${en.maasCandidateAdd} custom-new` }))
    expect(screen.getByLabelText<HTMLInputElement>(`${en.modelId} 2`).value).toBe('custom-new')
    expect(saved).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: en.cancel }))
    fireEvent.click(screen.getByRole('button', { name: `${en.maasTest} gpt-6.1-sol` }))
    expect(await screen.findByText(en.maasTestPassed)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `${en.maasSetDefault} gpt-6.1-sol` }))
    expect(await screen.findByText(en.maasDefault)).toBeTruthy()
    expect(operations.discover).toHaveBeenCalledTimes(1)
    expect(operations.discover).toHaveBeenCalledWith('maas-saved', 'openai-completions')
  })

  it('requires a fresh removal confirmation when the connection revision changes', async () => {
    const initial = { ...empty(), connections: [connection()] }
    const { controller, changeSnapshot } = fixture(initial)
    fireEvent.click(await screen.findByRole('button', { name: en.remove }))
    changeSnapshot({ ...initial, revision: 15 })
    await act(async () => { await controller.load() })
    const confirmation = screen.getByText(en.maasDelete).parentElement!
    expect(within(confirmation).getByRole<HTMLButtonElement>('button', { name: en.remove }).disabled).toBe(true)
    fireEvent.click(within(confirmation).getByRole('button', { name: en.cancel }))
    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    fireEvent.click(within(screen.getByText(en.maasDelete).parentElement!).getByRole('button', { name: en.remove }))
    expect(await screen.findByText(en.maasEmpty)).toBeTruthy()
  })

  it('lets the owner reset an existing default reasoning effort without changing the default model', async () => {
    const { controller, operations } = fixture({
      ...empty(), connections: [connection()],
      defaultSelection: { provider: 'maas-saved', model: 'gpt-6.1-sol', reasoningEffort: 'high' },
    })
    const reset = await screen.findByRole<HTMLButtonElement>('button', { name: `${en.maasResetDefaultEffort} gpt-6.1-sol` })
    expect(reset.disabled).toBe(false)
    fireEvent.click(reset)
    await waitFor(() => { expect(operations.setDefault).toHaveBeenCalledWith('maas-saved', 'gpt-6.1-sol', 4) })
    expect(controller.store.getSnapshot().snapshot?.defaultSelection).toEqual({ provider: 'maas-saved', model: 'gpt-6.1-sol' })
    expect((await screen.findByRole<HTMLButtonElement>('button', { name: `${en.maasSetDefault} gpt-6.1-sol` })).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: `${en.maasResetDefaultEffort} gpt-6.1-sol` })).toBeNull()
  })
})

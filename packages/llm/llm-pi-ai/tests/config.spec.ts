import { describe, expect, it } from 'vitest'
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import { assertServiceable, Config, resolveProfiles, type Options } from '../src/config.ts'

/** Validate one hand-declared route, with the caller's fields layered onto it. */
const routeWith = (profile: Record<string, unknown>): (() => unknown) =>
  () => ({ providers: Config({
    providers: {
      'acme-gateway': {
        api: 'openai-completions',
        baseURL: 'https://acme.test',
        models: [{ id: 'm' }],
        ...profile,
      },
    },
  }).providers.get() })

/** Validate that route with the caller's fields on its single model entry. */
const configWith = (model: Record<string, unknown>): (() => unknown) =>
  routeWith({ models: [{ id: 'm', ...model }] })

describe('model protocol declarations', () => {
  it.each([
    ['https://gateway.test/v1', 'https://gateway.test'],
    ['https://gateway.test/prefix/v1/', 'https://gateway.test/prefix'],
    ['https://gateway.test/prefix/', 'https://gateway.test/prefix'],
  ])('normalizes explicit Anthropic endpoint %s without changing the configured value', (baseURL, root) => {
    const configured = { baseURL, models: [{ id: 'm', api: 'anthropic-messages' }] }
    const profile = resolveProfiles({ gateway: configured }).get('gateway')
    expect(profile?.piProvider?.getModels()[0]?.baseUrl).toBe(root)
    expect(profile?.baseURL).toBe(baseURL)
    expect(configured.baseURL).toBe(baseURL)
  })

  it('preserves native catalog endpoint spelling when no protocol is overridden', () => {
    const baseURL = 'https://gateway.test/native/v1'
    const profile = resolveProfiles({ anthropic: { baseURL } }).get('anthropic')
    expect(profile?.piProvider?.getModels()[0]?.baseUrl).toBe(baseURL)
  })

  it('accepts supported per-model protocols and refuses unknown ones at the schema and resolver', () => {
    expect(configWith({ api: 'openai-responses' })).not.toThrow()
    expect(configWith({ api: 'unknown-api' })).toThrow()
    expect(() => resolveProfiles({ gateway: {
      baseURL: 'https://gateway.test/v1', models: [{ id: 'm', api: 'unknown-api' }],
    } })).toThrow(/model "m" names api "unknown-api".*cannot serve/)
  })

  it('uses model protocol before the route and catalog without adding a generic default', () => {
    const profile = resolveProfiles({ gateway: {
      api: 'anthropic-messages', baseURL: 'https://gateway.test/v1',
      models: [{ id: 'chat', api: 'openai-completions' }, { id: 'response', api: 'openai-responses' }, { id: 'inherited' }],
    } }).get('gateway')
    expect(profile?.piProvider?.getModels().map(model => model.api))
      .toEqual(['openai-completions', 'openai-responses', 'anthropic-messages'])
    expect(() => resolveProfiles({ gateway: { baseURL: 'https://gateway.test/v1', models: [{ id: 'm' }] } }))
      .toThrow(/needs an api/)
  })

  it('lets an explicit model protocol override the route and installed model protocol', () => {
    const model = getBuiltinModels('openai').find(model => model.api === 'openai-responses')
    if (model === undefined) throw new Error('the installed OpenAI catalog has no Responses model')
    const profile = resolveProfiles({ openai: {
      api: 'anthropic-messages', models: [{ id: model.id, api: 'openai-completions' }],
    } }).get('openai')
    expect(profile?.piProvider?.getModels()[0]?.api).toBe('openai-completions')
  })
})

describe('reasoning schema boundary', () => {
  it('accepts an empty provider section and propagates unexpected catalog failures', () => {
    expect(() => { assertServiceable({}) }).not.toThrow()
    const failure = new TypeError('model metadata lookup failed')
    expect(() => resolveProfiles({ openrouter: { models: [{
      id: '111',
      get name(): string { throw failure },
    }], api: 'openai-completions' } }, 'deferred')).toThrow(failure)
  })

  it('rejects a level pi-ai does not know at the write that produced it', () => {
    expect(configWith({ reasoningEfforts: { ultra: 'x' } })).toThrow(/"off"/)
    expect(configWith({ reasoningEfforts: { high: 42 } })).toThrow()
  })

  it('keeps false distinguishable from an absent declaration', () => {
    type Materialized = { providers: Record<string, { models?: { reasoningEfforts?: unknown }[] }> }
    const withFalse = configWith({ reasoningEfforts: false })() as Materialized
    expect(withFalse.providers['acme-gateway']?.models?.[0]?.reasoningEfforts).toBe(false)
    const absent = configWith({})() as Materialized
    expect(absent.providers['acme-gateway']?.models?.[0]?.reasoningEfforts).toBeUndefined()
  })

  it('rejects a thinking format outside the offered set', () => {
    expect(configWith({ compat: { thinkingFormat: 'quantum' } })).toThrow(/expected/)
  })

  it('accepts Baseten template arguments and completion controls', () => {
    expect(configWith({
      compat: {
        supportsFinishReason: false,
        thinkingFormat: 'baseten',
        chatTemplateArgs: { enable_thinking: { $var: 'thinking.enabled' } },
        supportsThinkingTokenBudget: true,
      },
    })).not.toThrow()
  })
})

describe('modality schema boundary', () => {
  it('rejects a modality pi-ai does not know, at either level', () => {
    expect(configWith({ input: ['audio'] })).toThrow(/expected/)
    expect(routeWith({ defaultInput: ['text', 'audio'] })).toThrow(/expected/)
  })

  it('refuses a route whose models could accept nothing', () => {
    // The pair the settings seam runs: the schema accepts the empty list as
    // well-typed, and the namespace validator is what refuses it. Asserting
    // only the schema would report this route as writable.
    expect(routeWith({ defaultInput: [] })).not.toThrow()
    expect(() => { assertServiceable(routeWith({ defaultInput: [] })() as Options) })
      .toThrow(/defaultInput must name at least one modality/)
  })

  type Materialized = {
    providers: Record<string, { defaultInput?: unknown; models?: { input?: unknown }[] }>
  }

  it('materializes an absent entry list as empty and an absent route list as text', () => {
    // The empty-list inheritance rule exists because of exactly this: an entry
    // that declares nothing reaches resolution as `[]`, not as `undefined`.
    const absent = configWith({})() as Materialized
    expect(absent.providers['acme-gateway']?.models?.[0]?.input).toEqual([])
    expect(absent.providers['acme-gateway']?.defaultInput).toEqual(['text'])
  })
})

describe('request image policy bounds', () => {
  it.each([
    ['requestImagePixelBudget', 0, /requestImagePixelBudget must be a positive safe integer/],
    ['requestImagePixelBudget', Number.MAX_SAFE_INTEGER + 1, /requestImagePixelBudget must be a positive safe integer/],
    ['requestImageMaxBytes', 0, /requestImageMaxBytes must be a positive safe integer/],
    ['requestImageMaxBytes', 1.5, /requestImageMaxBytes must be a positive safe integer/],
  ] as const)('rejects %s=%s at service resolution', (field, value, message) => {
    const programmatic = {
      providers: {
        'acme-gateway': {
          api: 'openai-completions',
          baseURL: 'https://acme.test',
          models: [{ id: 'm' }],
          [field]: value,
        },
      },
    } as Options
    expect(() => {
      assertServiceable(programmatic)
    }).toThrow(message)
  })
})

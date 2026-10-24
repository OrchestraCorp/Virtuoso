/** Connection settings presentation; model and credential writes go through the domain Remote. */
import { useEffect, useState } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CatalogModel, ConnectionDraft, ConnectionModelDraft, ConnectionProtocol, ConnectionsSnapshot, ModelConnection,
} from '@deepseek-ai/dsh-model-connections/types'
import { ApiKeyInput } from './ApiKeyInput.tsx'
import { formatCapacity, parseCapacity, type DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import { ModelInputTypes } from './ModelInputTypes.tsx'
import { ModelReasoningEfforts, validateReasoningEfforts } from './ModelReasoningEfforts.tsx'
import { protocolLabel } from './protocol-label.ts'
import type { ModelsKey } from './locales.ts'
import type { MaasFailure } from './maas-operations.ts'
import type { MaasSettingsStore } from './maas-store.ts'
import styles from './ModelsSection.module.css'
import css from './MaasSection.module.css'

/** Settings section dependencies supplied by the registration site. */
export interface MaasSectionInjected {
  controller: MaasSettingsStore
  hooks: { snapshot: MaasSettingsStore['store'] }
  t: (key: ModelsKey) => string
}

/** Renderer-bound MaaS settings props. */
export type MaasSectionProps = Partial<InjectFace<MaasSectionInjected>>

const PROTOCOLS: readonly ConnectionProtocol[] = ['openai-completions', 'openai-responses', 'anthropic-messages']
const FAILURE_KEYS: Record<MaasFailure, ModelsKey> = {
  conflict: 'maasErrorConflict', invalid: 'maasErrorInvalid', credential: 'maasErrorCredential',
  'default-in-use': 'maasErrorDefault', unavailable: 'maasErrorUnavailable', failed: 'maasErrorFailed',
}

interface EditorTarget {
  revision: number
  connection?: ModelConnection
  models: ConnectionModelDraft[]
}

/**
 * Render the connection section once the UI renderer has bound its snapshot hook.
 * @param props - controller, observable snapshot hook, and translated copy.
 * @returns the settings surface, or nothing before dependencies are bound.
 */
export function MaasSection(props: MaasSectionProps) {
  if (!props.controller || !props.useSnapshot || !props.t) return null
  return <Loaded controller={props.controller} useSnapshot={props.useSnapshot} t={props.t} />
}

function Loaded({ controller, useSnapshot, t }: InjectFace<MaasSectionInjected>) {
  const state = useSnapshot(value => value)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [removing, setRemoving] = useState<{ id: string; revision: number } | null>(null)
  const [discoveryProtocols, setDiscoveryProtocols] = useState<Record<string, ConnectionProtocol>>({})
  useEffect(() => { void controller.load() }, [controller])
  const snapshot = state.snapshot
  const blocked = state.busy || state.status !== 'ready'
  const rowBlocked = blocked || editor !== null
  const openEditor = (connection?: ModelConnection, models: ConnectionModelDraft[] = connection?.models ?? []): (void) => {
    if (!snapshot) return
    setRemoving(null)
    setEditor({ revision: snapshot.revision, ...(connection ? { connection } : {}), models })
  }
  return <section className={styles['section']} aria-label={t('maasNav')}>
    <div className={css.heading}>
      <h2 className={styles['title']}>{t('maasNav')}</h2>
      <Button variant="ghost" disabled={state.busy || state.status === 'loading'}
        onClick={() => { void controller.load() }}>{t('maasRefresh')}</Button>
    </div>
    <p className={styles['intro']}>{t('maasIntro')}</p>
    <div className={css.feedback} aria-live="polite">
      {state.status === 'loading' ? <p role="status">{t('maasLoading')}</p> : null}
      {state.error ? <p role="alert" className={styles['error']}>{t(FAILURE_KEYS[state.error])}</p> : null}
      {state.notice ? <p role="status" className={state.notice === 'test-failed' ? styles['error'] : styles['savedNotice']}>
        {t(state.notice === 'saved' ? 'maasSaved' : state.notice === 'test-passed' ? 'maasTestPassed' : 'maasTestFailed')}
      </p> : null}
      {state.diagnostic ? <details><summary>{t('maasDetails')}</summary><p>{state.diagnostic}</p></details> : null}
    </div>
    {snapshot ? <>
      {snapshot.connections.length === 0 ? <p className={styles['intro']}>{t('maasEmpty')}</p> : null}
      <ul className={styles['rows']}>
        {snapshot.connections.map(connection => <li key={connection.id} className={styles['rowCard']}>
          <div className={css.heading}>
            <div className={css.identity}>
              <strong>{connection.name}</strong>
              <code>{connection.baseURL}</code>
              <span>{t(connection.enabled ? 'maasEnabled' : 'maasDisabled')}
                {' · '}{t(connection.credentialConfigured ? 'credentialConfigured' : 'credentialMissing')}</span>
            </div>
            <div className={css.actions}>
              <Button variant="ghost" disabled={rowBlocked} onClick={() => { openEditor(connection) }}>{t('edit')}</Button>
              <Button variant="ghost" disabled={rowBlocked}
                onClick={() => { setRemoving({ id: connection.id, revision: snapshot.revision }) }}>{t('remove')}</Button>
              <label className={styles['field']}><span className={styles['fieldLabel']}>{t('maasDiscoveryProtocol')}</span>
                <select className={`${styles['input']} ${styles['selectInput']}`}
                  aria-label={`${t('maasDiscoveryProtocol')} ${connection.name}`} disabled={rowBlocked}
                  value={discoveryProtocols[connection.id] ?? 'openai-completions'} onChange={(event) => {
                    setDiscoveryProtocols({ ...discoveryProtocols, [connection.id]: event.target.value as ConnectionProtocol })
                  }}>
                  {PROTOCOLS.map(protocol => <option key={protocol} value={protocol}>{protocolLabel(t, protocol)}</option>)}
                </select>
              </label>
              <Button variant="outline" disabled={rowBlocked || !connection.credentialConfigured}
                onClick={() => { void controller.discover(connection.id, discoveryProtocols[connection.id] ?? 'openai-completions') }}>{t('maasDiscover')}</Button>
            </div>
          </div>
          {connection.activationError ? <p role="alert" className={styles['error']}>{t('maasActivationError')}</p> : null}
          {connection.models.length === 0 ? <p>{t('maasNoModels')}</p> : null}
          <ul className={css.models}>
            {connection.models.map((model) => {
              const selected = snapshot.defaultSelection?.provider === connection.id && snapshot.defaultSelection.model === model.id
              const resetEffort = selected && snapshot.defaultSelection?.reasoningEffort !== undefined
              const unavailable = !connection.enabled || !connection.credentialConfigured || !!connection.activationError
              return <li key={model.id} className={css.modelSummary}>
                <div className={css.identity}>
                  <span>{model.name || model.id}</span><code>{model.id}</code><small>{protocolLabel(t, model.protocol)}</small>
                </div>
                <div className={css.actions}>
                  <Button variant="ghost" disabled={rowBlocked || unavailable} title={unavailable ? t('maasEnableToUse') : undefined}
                    aria-label={`${t('maasTest')} ${model.id}`}
                    onClick={() => { void controller.test(connection.id, model.id) }}>{t('maasTest')}</Button>
                  <Button variant="outline" disabled={rowBlocked || unavailable || (selected && !resetEffort)}
                    title={unavailable ? t('maasEnableToUse') : undefined}
                    aria-label={`${t(resetEffort ? 'maasResetDefaultEffort' : 'maasSetDefault')} ${model.id}`}
                    onClick={() => { void controller.setDefault(connection.id, model.id, snapshot.revision) }}>
                    {t(resetEffort ? 'maasResetDefaultEffort' : selected ? 'maasDefault' : 'maasSetDefault')}
                  </Button>
                </div>
              </li>
            })}
          </ul>
          {removing?.id === connection.id ? <div className={css.confirm}>
            <p>{t('maasDelete')}</p>
            {removing.revision !== snapshot.revision ? <p role="alert">{t('maasErrorConflict')}</p> : null}
            <div className={css.actions}>
              <Button variant="ghost" disabled={blocked} onClick={() => { setRemoving(null) }}>{t('cancel')}</Button>
              <Button variant="outline" disabled={blocked || removing.revision !== snapshot.revision} onClick={() => {
                void controller.remove(connection.id, removing.revision).then((ok) => { if (ok) setRemoving(null) })
              }}>{t('remove')}</Button>
            </div>
          </div> : null}
        </li>)}
      </ul>
      {state.discovery ? <div className={styles['rowCard']}>
        <div className={css.heading}>
          <h3>{t('maasCandidates')}</h3>
          <Button variant="ghost" disabled={blocked} onClick={() => { controller.closeDiscovery() }}>{t('close')}</Button>
        </div>
        {state.discovery.models.length === 0 ? <p>{t('maasNoCandidates')}</p> : null}
        {state.discovery.models.map(model => <div key={model.id} className={css.modelSummary}>
          <div className={css.identity}><span>{model.name || model.id}</span><code>{model.id}</code></div>
          <Button variant="outline" disabled={rowBlocked} aria-label={`${t('maasCandidateAdd')} ${model.id}`} onClick={() => {
            const discovery = state.discovery
            const connection = snapshot.connections.find(item => item.id === discovery?.connectionId)
            if (connection && discovery) {
              const models = connection.models.some(item => item.id === model.id)
                ? connection.models : [...connection.models, { ...model, protocol: discovery.protocol }]
              openEditor(connection, models)
              controller.closeDiscovery()
            }
          }}>{t('maasCandidateAdd')}</Button>
        </div>)}
      </div> : null}
      {editor ? <ConnectionEditor key={editor.connection?.id ?? 'new'} target={editor} snapshot={snapshot} busy={blocked} t={t}
        onCancel={() => { setEditor(null) }} onSave={async (draft, key) => {
          const saved = await controller.save(draft, editor.revision, key)
          if (saved) setEditor(null)
        }} /> : <Button variant="outline" disabled={blocked} onClick={() => { openEditor() }}>{t('maasAdd')}</Button>}
    </> : null}
  </section>
}

interface ConnectionEditorProps {
  target: EditorTarget
  snapshot: ConnectionsSnapshot
  busy: boolean
  t: (key: ModelsKey) => string
  onCancel: () => void
  onSave: (draft: ConnectionDraft, apiKey?: string) => Promise<void>
}

function validEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash && !url.search
  } catch (_error) { return false }
}

interface EditableModel {
  key: number
  value: ConnectionModelDraft
  contextWindow: string
  maxTokens: string
}

function editableModel(value: ConnectionModelDraft, key: number): EditableModel {
  return {
    key, value: { ...value },
    contextWindow: value.contextWindow === undefined ? '' : formatCapacity(value.contextWindow),
    maxTokens: value.maxTokens === undefined ? '' : formatCapacity(value.maxTokens),
  }
}

function capabilities(model: ConnectionModelDraft, edited: DeepSeekModelDraft): ConnectionModelDraft {
  const next = { ...model }
  const input = edited['input']
  if (Array.isArray(input)) next.input = input.filter((item): item is 'text' | 'image' => item === 'text' || item === 'image')
  const efforts = edited['reasoningEfforts']
  if (efforts === undefined) delete next.reasoningEfforts
  else if (efforts === false) next.reasoningEfforts = false
  else if (typeof efforts === 'object' && efforts !== null && !Array.isArray(efforts)) {
    const entries = Object.entries(efforts).filter((entry): entry is [string, string | null] => typeof entry[1] === 'string' || entry[1] === null)
    next.reasoningEfforts = Object.fromEntries(entries)
  }
  return next
}

function ConnectionEditor({ target, snapshot, busy, t, onCancel, onSave }: ConnectionEditorProps) {
  const [name, setName] = useState(target.connection?.name ?? t('maasDefaultName'))
  const [baseURL, setBaseURL] = useState(target.connection?.baseURL ?? snapshot.defaultBaseURL)
  const [enabled, setEnabled] = useState(target.connection?.enabled ?? true)
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState(() => target.models.map(editableModel))
  const [sequence, setSequence] = useState(models.length)
  const [validation, setValidation] = useState<ModelsKey | null>(null)
  const stale = target.revision !== snapshot.revision
  const disabled = busy || stale
  const addModel = (model: ConnectionModelDraft): (void) => {
    if (model.id && models.some(item => item.value.id === model.id)) return
    setModels([...models, editableModel(model, sequence)])
    setSequence(sequence + 1)
  }
  const updateModel = (key: number, value: ConnectionModelDraft): (void) => {
    setModels(models.map(model => model.key === key ? { ...model, value } : model))
  }
  const save = (): (void) => {
    let error: ModelsKey | null = null
    if (!name.trim() || !validEndpoint(baseURL.trim())) error = 'maasErrorInvalid'
    else if (models.length === 0) error = 'maasNoModels'
    else if (models.some(model => !model.value.id.trim())) error = 'modelIdRequired'
    else if (new Set(models.map(model => model.value.id.trim())).size !== models.length) error = 'modelIdDuplicate'
    else if (models.some((model) => {
      const value = parseCapacity(model.contextWindow)
      return value !== undefined && (!Number.isSafeInteger(value) || value <= 0)
    })) error = 'modelContextInvalid'
    else if (models.some((model) => {
      const value = parseCapacity(model.maxTokens)
      return value !== undefined && (!Number.isSafeInteger(value) || value <= 0)
    })) error = 'modelMaxTokensInvalid'
    else error = validateReasoningEfforts(models.map(model => model.value))?.key ?? null
    setValidation(error)
    if (error) return
    const draft: ConnectionDraft = {
      ...(target.connection ? { id: target.connection.id } : {}), name: name.trim(), baseURL: baseURL.trim(), enabled,
      models: models.map(({ value, contextWindow, maxTokens }) => {
        const next = { ...value, id: value.id.trim(), name: value.name?.trim() || value.id.trim() }
        delete next.contextWindow
        delete next.maxTokens
        const context = parseCapacity(contextWindow)
        const maximum = parseCapacity(maxTokens)
        return {
          ...next, ...context === undefined ? {} : { contextWindow: context },
          ...maximum === undefined ? {} : { maxTokens: maximum },
        }
      }),
    }
    void onSave(draft, apiKey.trim() || undefined)
  }
  return <div className={styles['rowCard']} aria-label={t('maasSave')}>
    <label className={styles['field']}><span className={styles['fieldLabel']}>{t('maasName')}</span>
      <input className={styles['input']} value={name} disabled={disabled} onChange={(event) => { setName(event.target.value) }} />
    </label>
    <label className={styles['field']}><span className={styles['fieldLabel']}>{t('baseUrl')}</span>
      <input className={styles['input']} type="url" value={baseURL} disabled={disabled}
        onChange={(event) => { setBaseURL(event.target.value) }} />
    </label>
    <label className={styles['field']}><span className={styles['fieldLabel']}>{t('keyInput')}</span>
      <ApiKeyInput t={t} value={apiKey} disabled={disabled}
        placeholder={t(target.connection?.credentialConfigured ? 'keyPlaceholderSaved' : 'keyPlaceholder')}
        onChange={(event) => { setApiKey(event.target.value) }} />
    </label>
    <p className={css.help}>{t('maasKeyHelp')}</p>
    <div className={css.heading}>
      <span>{t('maasEnabled')}</span><Switch checked={enabled} onChange={setEnabled} label={t('maasEnabled')} disabled={disabled} />
    </div>
    <label className={styles['field']}><span className={styles['fieldLabel']}>{t('maasCatalog')}</span>
      <select className={`${styles['input']} ${styles['selectInput']}`} aria-label={t('maasCatalog')} value="" disabled={disabled} onChange={(event) => {
        const model = snapshot.catalog.find(item => item.id === event.target.value)
        if (model) addModel({ id: model.id, name: model.name })
      }}>
        <option value="">{t('maasCatalogPlaceholder')}</option>
        {snapshot.catalog.map(model => <option key={model.id} value={model.id}
          disabled={models.some(item => item.value.id === model.id)}>{model.name} · {model.id}</option>)}
      </select>
    </label>
    <p className={css.help}>{t('maasProtocolHint')}</p>
    <p className={css.help}>{t('maasCapabilitiesHelp')}</p>
    {models.map((row, index) => <ModelFields
      key={row.key} model={row.value} catalog={snapshot.catalog} reasoningLevels={snapshot.reasoningLevels}
      index={index} disabled={disabled} t={t}
      contextWindow={row.contextWindow} maxTokens={row.maxTokens} capacity={(field, value) => {
        setModels(models.map(model => model.key === row.key ? { ...model, [field]: value } : model))
      }}
      update={(next) => { updateModel(row.key, next) }} remove={() => { setModels(models.filter(model => model.key !== row.key)) }} />)}
    <Button variant="ghost" disabled={disabled} onClick={() => { addModel({ id: '' }) }}>{t('addModel')}</Button>
    {validation ? <p role="alert" className={styles['error']}>{t(validation)}</p> : null}
    {stale ? <p role="alert" className={styles['error']}>{t('maasErrorConflict')}</p> : null}
    <div className={styles['editorActions']}>
      <Button variant="ghost" disabled={busy} onClick={onCancel}>{t('cancel')}</Button>
      <Button variant="primary" disabled={disabled} onClick={save}>{t(busy ? 'maasSaving' : 'maasSave')}</Button>
    </div>
  </div>
}

function ModelFields({ model, catalog, reasoningLevels, contextWindow, maxTokens, capacity, index, disabled, t, update, remove }: {
  model: ConnectionModelDraft
  catalog: CatalogModel[]
  reasoningLevels: string[]
  contextWindow: string
  maxTokens: string
  capacity: (field: 'contextWindow' | 'maxTokens', value: string) => void
  index: number
  disabled: boolean
  t: (key: ModelsKey) => string
  update: (model: ConnectionModelDraft) => void
  remove: () => void
}) {
  const automatic = catalog.find(item => item.id === model.id)?.protocol ?? 'openai-completions'
  const anthropic = (model.protocol ?? automatic) === 'anthropic-messages'
  const reasoningCopy = (key: ModelsKey): string => t(key === 'modelReasoningHelpText'
    ? anthropic ? 'maasAnthropicReasoningHint' : 'maasReasoningHelp'
    : key)
  return <div className={css.modelEditor}>
    <label className={styles['field']}><span className={styles['fieldLabel']}>{t('modelId')} {index + 1}</span>
      <input className={styles['input']} value={model.id} disabled={disabled}
        onChange={(event) => { update({ ...model, id: event.target.value }) }} />
    </label>
    <label className={styles['field']}><span className={styles['fieldLabel']}>{t('modelName')} {index + 1}</span>
      <input className={styles['input']} value={model.name ?? ''} disabled={disabled}
        onChange={(event) => { update({ ...model, name: event.target.value }) }} />
    </label>
    <label className={styles['field']}><span className={styles['fieldLabel']}>{t('customApi')} {index + 1}</span>
      <select className={`${styles['input']} ${styles['selectInput']}`} aria-label={`${t('customApi')} ${index + 1}`} value={model.protocol ?? 'auto'}
        disabled={disabled} onChange={(event) => {
          const { protocol: _protocol, ...other } = model
          update(event.target.value === 'auto' ? other : { ...other, protocol: event.target.value as ConnectionProtocol })
        }}>
        <option value="auto">{t('maasAutomatic')} · {protocolLabel(t, automatic)}</option>
        {PROTOCOLS.map(protocol => <option key={protocol} value={protocol}>{protocolLabel(t, protocol)}</option>)}
      </select>
    </label>
    {(['contextWindow', 'maxTokens'] as const).map(field => <label key={field} className={styles['field']}>
      <span className={styles['fieldLabel']}>{t(field)} {index + 1}</span>
      <input className={styles['input']} inputMode="numeric" value={field === 'contextWindow' ? contextWindow : maxTokens}
        placeholder={t(field === 'contextWindow' ? 'contextWindowPlaceholder' : 'maxTokensPlaceholder')} disabled={disabled}
        onChange={(event) => { capacity(field, event.target.value) }} />
    </label>)}
    <div className={css.capabilities}>
      <ModelInputTypes model={{ ...model }} field="input" position={index + 1} disabled={disabled} t={t}
        onChange={(next) => { update(capabilities(model, next)) }} />
      <ModelReasoningEfforts model={{ ...model }} levels={reasoningLevels} position={index + 1} disabled={disabled} t={reasoningCopy}
        onChange={(next) => { update(capabilities(model, next)) }} />
      {anthropic ? <p className={css.help}>{t('maasAnthropicReasoningHint')}</p> : null}
    </div>
    <Button variant="ghost" disabled={disabled} aria-label={`${t('removeModel')} ${index + 1}`} onClick={remove}>{t('removeModel')}</Button>
  </div>
}

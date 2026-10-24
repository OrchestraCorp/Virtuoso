/** Instance-owned connection settings state; Host snapshots remain authoritative. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  ConnectionDraft, ConnectionProtocol, ConnectionsSnapshot, DiscoveredModel,
} from '@deepseek-ai/dsh-model-connections/types'
import type { MaasFailure, MaasOperations, MaasResult } from './maas-operations.ts'

/** Presentation state for one MaaS settings surface. */
export interface MaasState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  snapshot: ConnectionsSnapshot | null
  busy: boolean
  error: MaasFailure | null
  notice: 'saved' | 'test-passed' | 'test-failed' | null
  diagnostic: string | null
  discovery: { connectionId: string; protocol: ConnectionProtocol; models: DiscoveredModel[] } | null
}

/** Serializes user operations and discards reads completed after disposal or a newer read. */
export class MaasSettingsStore {
  /** Observable presentation snapshot, containing no credential values. */
  readonly store: SnapshotStore<MaasState> = createSnapshotStore<MaasState>({
    status: 'idle', snapshot: null, busy: false, error: null, notice: null, diagnostic: null, discovery: null,
  })
  private generation = 0
  private disposed = false

  /** @param operations - connection-domain operations bound by the plugin. */
  constructor(private readonly operations: MaasOperations) {}

  /**
   * Load a snapshot; failed refreshes retain the last successful snapshot and any component draft.
   * @returns completion after the latest owned read is published or discarded.
   */
  async load(): Promise<void> {
    if (this.disposed || this.store.getSnapshot().busy) return
    const generation = ++this.generation
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    const response = await this.operations.list()
    if (!this.owns(generation)) return
    this.store.update((state) => {
      if (response.ok) { state.snapshot = response.value; state.status = 'ready'; state.discovery = null }
      else { state.status = 'error'; state.error = response.error }
    })
  }

  /**
   * Save a whole connection draft, keeping the existing credential when apiKey is omitted.
   * @param draft - editable connection without any stored credential value.
   * @param revision - revision captured when editing began.
   * @param apiKey - a replacement credential; omission retains the saved key.
   * @returns whether the Host committed the write.
   */
  save(draft: ConnectionDraft, revision: number, apiKey?: string): Promise<boolean> {
    return this.write(() => this.operations.save(draft, revision, apiKey))
  }

  /**
   * Remove a connection against the displayed revision.
   * @param id - saved connection identifier.
   * @param revision - revision shown when removal was requested.
   * @returns whether the Host committed the removal.
   */
  remove(id: string, revision: number): Promise<boolean> {
    return this.write(() => this.operations.remove(id, revision))
  }

  /**
   * Set the default for new Agents against the displayed revision.
   * @param id - saved connection identifier.
   * @param modelId - model from that connection's saved catalog.
   * @param revision - revision currently displayed.
   * @returns whether the Host committed the selection.
   */
  setDefault(id: string, modelId: string, revision: number): Promise<boolean> {
    return this.write(() => this.operations.setDefault(id, modelId, revision))
  }

  /**
   * Query only the saved connection's model endpoint; candidates are not saved automatically.
   * @param id - saved connection identifier.
   * @param protocol - explicitly selected model-list protocol.
   * @returns completion after candidate or error publication.
   */
  async discover(id: string, protocol: ConnectionProtocol): Promise<void> {
    if (!this.begin()) return
    const response = await this.operations.discover(id, protocol)
    if (this.disposed) return
    this.store.update((state) => {
      state.busy = false
      if (response.ok) state.discovery = { connectionId: id, protocol, models: response.value }
      else state.error = response.error
    })
  }

  /**
   * Run an explicit bounded model probe and display its safe diagnostic separately.
   * @param id - saved connection identifier.
   * @param modelId - saved model to probe.
   * @returns completion after test-result or error publication.
   */
  async test(id: string, modelId: string): Promise<void> {
    if (!this.begin()) return
    const response = await this.operations.test(id, modelId)
    if (this.disposed) return
    this.store.update((state) => {
      state.busy = false
      if (response.ok) {
        state.notice = response.value.ok ? 'test-passed' : 'test-failed'
        state.diagnostic = response.value.message
      } else state.error = response.error
    })
  }

  /** Close candidate presentation without changing saved models. */
  closeDiscovery(): void { this.store.update((state) => { state.discovery = null }) }

  /** Ignore late operation responses after plugin disposal. */
  dispose(): void { this.disposed = true; this.generation++ }

  private owns(generation: number): boolean { return !this.disposed && generation === this.generation }

  private begin(): boolean {
    const state = this.store.getSnapshot()
    if (this.disposed || state.busy || state.status !== 'ready') return false
    this.generation++
    this.store.update((next) => { next.busy = true; next.error = null; next.notice = null; next.diagnostic = null })
    return true
  }

  private async write(operation: () => Promise<MaasResult<ConnectionsSnapshot>>): Promise<boolean> {
    if (!this.begin()) return false
    const response = await operation()
    if (this.disposed) return false
    this.store.update((state) => {
      state.busy = false
      if (response.ok) {
        state.snapshot = response.value
        state.notice = 'saved'
        state.discovery = null
      } else state.error = response.error
    })
    return response.ok
  }
}

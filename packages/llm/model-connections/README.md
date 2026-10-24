---
description: "Saved model connections, isolated credentials, and live pi-ai routes for one product runtime."
kind: "package-reference"
---

# @deepseek-ai/dsh-model-connections

English | [中文](README.zh.md)

## Summary

`ctx.modelConnections` owns saved model connections for a desktop or a cloud runtime assigned to one user. The `modelConnections` Remote namespace exposes public configuration, explicit discovery, a bounded text probe, and the default model for newly created Agents. Stage does not store or proxy these connections.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Mount the service with `storageDomain`, `credentials`, `llm`, and `agentDefaultModel`. `requestTimeoutMs` bounds discovery and probes; `probeMaxTokens` bounds the probe's output request. The stored domain is `model_connections`, format version 1, with one aggregate containing its revision, connection records, and optional default.

Every connection has a stable `maas-<UUID>` provider ID. The bundled catalog supplies model names and protocol hints, without token-capacity claims. A model's explicit protocol wins over an exact catalog ID match; otherwise it uses Chat Completions. Saving materializes that protocol, so later catalog edits do not reinterpret saved models. Optional capacities are explicit token counts supplied by the user.

Declare a model's accepted `input` modalities (`text`, `image`) and optional `reasoningEfforts` explicitly. Reasoning maps offered levels to endpoint wire values; `off` alone may use `null` to omit a wire parameter, and `false` declares a model without reasoning. The snapshot supplies supported level names for editors. Invalid capability declarations reject before credential or connection writes. Existing format-1 models that omit these fields remain readable and keep conservative text-only input without selectable reasoning; model names do not imply capabilities. Omitted token capacities use the adapter's configurable fallbacks, not verified endpoint limits.

Editors send the revision they read. Concurrent or stale writes reject with `model-connections/conflict`; the caller reloads before reapplying its change. Saving a default, disabling its connection, or removing its model is validated in the same aggregate write. Removing a selected default refuses until the caller selects another model. Editing its capabilities removes an unavailable default reasoning effort in that same write while retaining the provider and model; existing Session selections remain unchanged. Existing builtin provider selections remain valid through `agentDefaultModel`'s registered source; an absent product default inherits the existing profile Config. That service checks the current invocation before persisting a product default, so a non-owner Session caller cannot change the global selection.

Secrets never appear in public snapshots or the domain. An omitted key retains the saved credential reference; replacing a key writes a fresh reference before committing the new record. A credential write failure leaves the connection unchanged. A domain write failure attempts to remove the new unused reference and leaves prior routes active. API failures return sanitized diagnostics, not provider error bodies or credential-store exceptions.

The committed aggregate is authoritative. The service compiles and atomically replaces its route registration after persistence. An activation failure keeps previous compiled settings for retained enabled connections and returns `activationError` on saved connections; removed or disabled routes are still withdrawn. Correct the configuration and save again. Existing prepared requests retain the endpoint and credential reference they captured. Unloading unregisters routes and the default source and closes the domain after pending writes settle.

Discovery uses the saved endpoint and credential and returns candidates without saving them. Its explicit protocol selects the listing path and authentication headers; omission consistently uses OpenAI Chat Completions, independent of saved model order. Testing uses an enabled, saved model and sends a small text-only request without tools or conversation history; it may consume provider credits. Both operations stop on caller cancellation, timeout, or service disposal.

<a id="model-experience"></a>
## Model Experience

### Requests through a selected connection

#### What the model sees

Ordinary requests use the existing pi-ai adapter's prompt and tool projection. Declared image input and reasoning levels use that adapter's existing attachment and protocol handling. Without an image declaration, the model keeps conservative text capability and the DSH stream replaces historical images with omission text; conversation image admission follows the existing Session policy. The explicit connectivity probe sends only `Reply with OK.` as a user text block and declares no tools; a successful probe does not verify images or tool calling. Discovery sends no prompt. Connection names and credentials are not added to prompt content.

#### Token effect

Ordinary request token usage follows the selected model. The explicit probe consumes its text input and output, bounded by `probeMaxTokens`.

#### KV Cache effect

Changing a connection affects subsequent prepared requests. Existing prepared requests retain their captured configuration; switching endpoint or model can affect provider-side cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This is an owner-only single-runtime service, not authentication or multi-tenant isolation. A shared cloud process needs authenticated principals, per-owner storage, and execution-time use authorization before exposing it to different users.
- Replaced or removed credential references remain stored so already prepared calls can finish. Automatic reference cleanup and credential export/sync are not provided. An unused key may also remain if cleanup after a failed domain write fails; that failure emits a sanitized warning.
- No existing profile routes or account credentials are imported or dual-written. Connections and their default have one writer per runtime. The storage domain provides no cross-process sync or automatic format migrations.
- Model capabilities and reasoning wire values are user declarations, not endpoint verification. Protocol-specific compatibility switches remain configured through the existing pi-ai provider profiles. A wrong endpoint, protocol, or capability declaration fails at discovery or request time.

<a id="dev-note"></a>
### Dev Note

The [model connections decision](../../../.agents/notes/implemented/architecture/2026-10-20-model-connections.md) explains domain ownership, static protocol defaults, and request snapshots.

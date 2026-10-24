---
description: "The deployment default model selection for users and maintainers choosing, configuring, or debugging which model freshly created agents start on."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-default-model

English | [中文](README.zh.md)

## Summary

Give newly created agents a shared default provider and model when their sessions do not specify one. Provider, model, and reasoning effort are live Config fields. Saved selections use a registered product source or the active profile patch and apply to subsequent reads; per-session selection remains owned by the entry point.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package wherever agents are created without an explicit model route. The service answers one question — which model should a fresh agent use? — so entry points that create agents consult it instead of re-implementing a default.

### Configure the default

A composition may omit both provider and model until the user explicitly selects one. Set both to supply a deployment default. Consumers read the live references even when no configuration editor is mounted.

```yaml
- name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek
    model: deepseek-chat
```

| Field | Default | Meaning |
|---|---|---|
| `provider` | unset | Registered provider route for fresh agents |
| `model` | unset | Provider-owned model id for fresh agents |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-agent-default-model) lists every accepted field. `reasoningEffort` is optional; saving a selection without it removes that field from the profile’s complete config override.

### Read and change the default

`currentSelection()` returns a detached `{ provider, model, reasoningEffort? }`, or `undefined` before a default is configured. `requireSelection()` refuses an unconfigured request with `MODEL_NOT_CONFIGURED`. `saveSelection()` stores the complete selection for later reads; no provider is selected automatically.

```text
const selection = ctx.agentDefaultModel.currentSelection()
await ctx.agentDefaultModel.saveSelection({ provider, model, reasoningEffort: 'high' })
```

`registerSource(source)` lets one product own default persistence. Its `currentSelection()` may return `undefined` to inherit Config; its `saveSelection(next)` persists selections without a profile write. A second source is refused, and disposing the registration restores Config behavior. Without a source or configuration editor, `saveSelection()` is a no-op. The service does not validate catalog membership; the consumer opening a model request owns availability diagnostics.

With a product source registered, only an owner Remote caller or trusted in-process code can persist the global default. A non-owner's `saveSelection()` resolves without changing that default, allowing an authorized entry point to keep its model choice on the Session. Caller identity comes from the current invocation and cannot be supplied in the selection payload.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the service realizes the behavior above; the observable contract is covered in [Use this package](#use-this-package).

### Design concept

The service retains its validated Config references and samples them in `currentSelection()`. `saveSelection()` captures the submitted values and serializes profile writes in submission order, including overlapping callers. Each caller observes its own write failure; a rejected write does not prevent later saves. Session-specific selection takes precedence in the consumer.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Live default selection and profile-backed writes |

### Behavior notes

An unconfigured runtime keeps its model catalog and blank conversations usable. Request entry points require an explicit selection before calling a model. A captured selection stays stable while later operations read updated Config references.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

The package-level contract is enough for most consumers; read these when you need the surrounding domain.

- [Core subsystem](../../../docs/subsystems/core.md) — the `Agent` handle and `AgentOptions` route selection.
- [agent-loop package](../agent-loop/README.md) — how agents resolve provider and model at request time.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-agent-default-model) — every accepted config field and its source declaration.
- [Core group map](../README.md) — how the core packages compose.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `ModelSelection` the service supplies to an entry point; request assembly and the provider adapters own the model-visible request.

#### KV Cache effect

Changing the default affects only agents that subsequently resolve from it. An existing session whose request log already names a selection keeps that selection, so this service does not invalidate its established prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the service's scope. They are current package constraints, not a task backlog.

- **One process-wide default** — the service owns a single default; per-session model selection remains the entry point's responsibility.
- **Persistence requires an owner** — without a registered source or profile configuration editor, saving a default does not retain the selection.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

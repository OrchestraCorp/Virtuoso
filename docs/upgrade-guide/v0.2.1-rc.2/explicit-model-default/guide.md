---
kind: upgrade-guide
description: "New product runtimes require an explicit model selection and the model catalog can return a null default."
---

# Explicit model selection

English | [中文](guide.zh.md)

## Change

The base bundle no longer sets `deepseek-official / deepseek-flash` as an implicit default. An unconfigured runtime can open Settings, browse models, and create a blank conversation; sending a request requires an explicit model selection. Existing saved defaults and recorded conversation selections remain authoritative.

`agentDefaultModel.currentSelection()` can return `undefined`. `requireSelection()` returns the configured selection or throws `MODEL_NOT_CONFIGURED`. The Session `modelCatalog` response returns `default: null` when no default exists. Custom clients must display an unselected state in that case.

## Migration

1. Open **Settings → Model connections**, save a connection and explicitly choose its default model, or choose a model in the conversation selector. Managed provider models appear in that selector when their provider is ready.
2. Deployments that need a fixed default may set both `provider` and `model` on the `agent-default-model` plugin row. Headless jobs must configure this selection before execution.
3. Update custom `currentSelection()` consumers to handle `undefined`, and model-catalog consumers to handle `default: null`. Use `requireSelection()` at request entry points.
4. Check that a fresh runtime displays the model selector without making a provider request, then select a configured model and send a message.

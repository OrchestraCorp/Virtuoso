# Agent Note: Product model connections

Status: implemented

English | [中文](2026-10-20-model-connections.zh.md)

## Problem

User-owned API connections have identities, credentials, model selections, and update rules that should survive changes to plugin configuration structure. A MaaS endpoint may expose Chat Completions and Responses models through the same account and base URL.

## Decision

The model-connections service owns one revisioned aggregate through the existing domain KV storage. Credentials remain in the credential provider. Committed records compile into a stable pi-ai adapter registration, while Cordis owns service composition and disposal. The default model service accepts one reversible source, preserving its configuration fallback when no product default exists.

The bundled model hints are static application data. An explicit model protocol wins; an exact bundled ID supplies an omitted protocol, and an unknown ID defaults to Chat Completions. Save materializes that choice. Neither startup nor model selection fetches the public catalog. Live discovery is an explicit user action against the user's saved endpoint and does not automatically adopt candidates.

Each connection keeps one provider identity even when its models use different protocols. Protocol serialization, tool streams, usage, cancellation, and request preparation remain in the existing pi-ai adapter. Product code uses its public compiler and runtime factory rather than internal imports.

## Alternatives considered

**Cordis configuration as the connection store.** A facade could hide namespaces but would retain coupling between product records and plugin configuration. The product domain has a single writer and does not dual-write those settings.

**Relational storage redesign.** The existing KV abstraction is sufficient for the first connection aggregate. Replacing all application persistence would expand the change beyond model access and would not provide a transaction across secrets and runtime registration.

**One provider route per protocol.** This would expose internal protocol partitions to defaults and durable Session references. Dispatching by the model's resolved protocol preserves the connection's stable identity.

## Consequences

Persistence precedes runtime publication. Activation failures are visible separately from durable saves; retained connections can keep their previous settings while removed and disabled routes are withdrawn. Replaced credential references remain available to prepared calls and are not automatically reclaimed.

The first service is scoped to one runtime owner. It provides neither shared-process user isolation nor cloud billing, routing, account federation, credential encryption, or automatic data migration. Stage does not own MaaS data.

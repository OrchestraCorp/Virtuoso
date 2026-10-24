---
description: "Virtuoso product identity in the sidebar and conversation hero through existing DSH brand slots."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

## Summary

This package displays the approved Virtuoso mark and name in the sidebar and the same static mark in the conversation hero. The product identity remains the same in local and official client builds. It has no runtime state and does not affect model requests.

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

Mount this plugin in the product browser roster. It occupies the existing sidebar mark/name and conversation hero mark slots without adding navigation or another application host.

### Choosing the profile

Client build profiles select build metadata and do not switch this product identity. Both Web and Desktop use the mark packaged at `src/client/assets/product-logo.svg`; neither resolves an asset from a sibling checkout.

### Replacing the brand

A deployment can replace this package with another occupant of the same brand slots. The product mark is a supplied SVG asset, with no generated replacement glyph. The sidebar owner selects its square size; the hero owner also supplies its presentation class.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The sidebar occupants install together through nested `ctx.slots.inject()` calls. The hero occupant waits independently for its declaration, so either surface can mount or unmount without leaving a partial sidebar identity. Plugin disposal removes all occupants. The SVG is statically imported and inlined by the image bundler; the browser title remains a separate `DSH_CLIENT_TITLE` concern.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

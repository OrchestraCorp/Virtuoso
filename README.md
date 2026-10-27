<p align="center"><img src="assets/brand/virtuoso.png" width="144" height="144" alt="Virtuoso logo"></p>

# Virtuoso

English | [中文](README.zh.md)

**An AI workbench for employees, with people supervising their agents.**

Virtuoso is the employee workspace in [OrchestraCorp](https://github.com/OrchestraCorp). It brings conversations, model connections and tools together so people can use AI in their daily work. The product direction connects that experience to company knowledge and authorized work through Stage.

## The OrchestraCorp projects

The four projects have distinct responsibilities; the complete enterprise workflow is still under development.

| Project | Responsibility |
| --- | --- |
| [Stage](https://github.com/OrchestraCorp/Stage) | The company backend for identity, authorization, controlled operations and audit. |
| [Maestro](https://github.com/OrchestraCorp/Maestro) | The company management and knowledge maintenance workspace. |
| [ScoreBook](https://github.com/OrchestraCorp/ScoreBook) | Versioned organization structures, policies, process templates and knowledge. |
| **Virtuoso** | The employee workspace for conversations, context, tools and human supervision of agents. |

Stage owns authoritative business state. Virtuoso does not create a second company task or permission database, and an agent does not gain independent authority merely by assisting an employee. See the [product scope](ORCHESTRA_PRODUCT.md).

## Developer preview

Virtuoso is an independently maintained fork of DeepSeek Harness. Interfaces and persistence formats may change during development; review the [safety notice](SAFETY.md) before running it.

| Branch | What it contains |
| --- | --- |
| [`main`](https://github.com/OrchestraCorp/Virtuoso/tree/main) | The upstream runtime foundation, product positioning and open-source documentation. |
| [`codex/maas-connections`](https://github.com/OrchestraCorp/Virtuoso/tree/codex/maas-connections) | MaaS model connections, product branding and UI changes, plus product profile and delivery design checks. |

The development branch supports connection settings, per-model protocol selection, model discovery, explicit text tests and default-model selection. It reuses the runtime's streaming, tool calls and cancellation. See [MaaS model connections](https://github.com/OrchestraCorp/Virtuoso/blob/codex/maas-connections/ORCHESTRA_MAAS.md) for configuration and limits.

Stage login and business integration, packaged product releases, and acceptance against real model services remain pending. Model quality and service stability are priorities for that acceptance; the connection implementation alone does not establish either. Product profiles and target platforms remain design declarations: see [build and release rules](https://github.com/OrchestraCorp/Virtuoso/blob/codex/maas-connections/ORCHESTRA_BUILD_RELEASE.md).

<a id="run"></a><a id="run-from-source"></a>

## Source quick start

Use Node.js `^22.19.0 || >=24.0.0` and pnpm `11.28.5`. This checkout selects the development branch containing the model connection UI:

```sh
git clone --branch codex/maas-connections https://github.com/OrchestraCorp/Virtuoso.git
cd Virtuoso
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web
```

The Web UI defaults to `http://127.0.0.1:3080`. `pnpm run build` prepares artifacts; `pnpm dsh web` launches them. Use `--no-open` to suppress browser opening. The inherited `dsh` command runs this checkout; it is not a separately published Virtuoso package.

Configure a connection and explicitly select a model in Settings before using the development branch's model connection routes. Supply credentials for a provider you can access; model tests and conversations can consume that provider's quota. See the [model connection guide](https://github.com/OrchestraCorp/Virtuoso/blob/codex/maas-connections/ORCHESTRA_MAAS.md).

## Development

`pnpm run dev:web` builds and starts the Web development environment; `pnpm run dev:desktop` uses the desktop development launcher. These source commands do not establish that a packaged Virtuoso release is available.

- [Development guide](docs/development.md) and [runtime architecture](docs/architecture.md).
- [Fork maintenance](ORCHESTRA_FORK.md) and [product scope](ORCHESTRA_PRODUCT.md).
- [Agent instructions](AGENTS.md).

## Contributing

Use [Virtuoso issues](https://github.com/OrchestraCorp/Virtuoso/issues) for product feedback and bug reports. Read the [contribution guide](CONTRIBUTING.md) before proposing changes, and include the branch, reproduction steps and relevant checks with your report.

## Upstream and license

Virtuoso builds on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and its [Cordis](https://github.com/cordiverse/cordis) plugin architecture. OrchestraCorp maintains this product independently and preserves upstream attribution.

Released under the [MIT license](LICENSE), including OrchestraCorp contributions. Upstream copyright notices and [third-party license terms](THIRD_PARTY_NOTICES.md) remain in effect.

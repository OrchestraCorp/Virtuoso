<p align="center"><img src="assets/brand/virtuoso.png" width="144" height="144" alt="Virtuoso logo"></p>

# Virtuoso

[English](README.md) | 中文

**员工的 AI 工作台，由人员监督 Agent 完成工作。**

Virtuoso 是 [OrchestraCorp](https://github.com/OrchestraCorp) 的员工工作入口，将会话、模型连接和工具组织在一起，让人员在日常工作中使用 AI。产品方向是通过 Stage，把这种工作体验接入公司知识和经过授权的业务操作。

## OrchestraCorp 四个项目

四个项目各有明确职责，完整的企业业务闭环仍在开发中。

| 项目 | 职责 |
| --- | --- |
| [Stage](https://github.com/OrchestraCorp/Stage) | 公司后端，负责身份、权限、受控操作和审计。 |
| [Maestro](https://github.com/OrchestraCorp/Maestro) | 公司管理与知识维护工作台。 |
| [ScoreBook](https://github.com/OrchestraCorp/ScoreBook) | 版本化的组织结构、制度、流程模板和知识。 |
| **Virtuoso** | 员工工作台，承载会话、上下文、工具及人员对 Agent 的监督。 |

Stage 保存正式业务状态。Virtuoso 不建立第二套公司任务或权限数据库，Agent 也不会仅因协助员工就获得独立业务权限。详见[产品范围](ORCHESTRA_PRODUCT.md)。

## 开发者预览

Virtuoso 是独立维护的 DeepSeek Harness 分支。开发期间接口和持久化格式可能变化；运行前请阅读[安全说明](SAFETY.zh.md)。

| 分支 | 包含内容 |
| --- | --- |
| [`main`](https://github.com/OrchestraCorp/Virtuoso/tree/main) | 上游运行时基础、产品定位和开源文档。 |
| [`codex/maas-connections`](https://github.com/OrchestraCorp/Virtuoso/tree/codex/maas-connections) | MaaS 模型连接、产品品牌和界面改动，以及产品 Profile 与交付设计检查。 |

开发分支支持连接设置、按模型选择协议、模型发现、显式文本测试和默认模型选择，并复用运行时的流式响应、工具调用与取消能力。配置与限制见 [MaaS 模型连接](https://github.com/OrchestraCorp/Virtuoso/blob/codex/maas-connections/ORCHESTRA_MAAS.md)。

Stage 登录与业务集成、产品安装包发布以及真实模型服务验收尚待完成。模型效果和服务稳定性是验收重点，完成连接实现本身还不能证明这两点。产品 Profile 和目标平台仍属于设计声明，详见[构建与发布规则](https://github.com/OrchestraCorp/Virtuoso/blob/codex/maas-connections/ORCHESTRA_BUILD_RELEASE.md)。

<a id="run"></a><a id="run-from-source"></a>

## 源码快速开始

使用 Node.js `^22.19.0 || >=24.0.0` 和 pnpm `11.28.5`。以下命令选择包含模型连接界面的开发分支：

```sh
git clone --branch codex/maas-connections https://github.com/OrchestraCorp/Virtuoso.git
cd Virtuoso
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh web
```

Web 界面默认位于 `http://127.0.0.1:3080`。`pnpm run build` 准备构建产物，`pnpm dsh web` 启动这些产物；使用 `--no-open` 可避免自动打开浏览器。沿用的 `dsh` 命令运行当前仓库源码，并非独立发布的 Virtuoso 软件包。

使用开发分支的模型连接路由前，在设置中配置连接并明确选择模型。提供自己有权访问的服务凭据；模型测试与对话可能消耗该提供方的额度。详见[模型连接指南](https://github.com/OrchestraCorp/Virtuoso/blob/codex/maas-connections/ORCHESTRA_MAAS.md)。

## 开发

`pnpm run dev:web` 构建并启动 Web 开发环境；`pnpm run dev:desktop` 使用桌面开发启动器。这些源码命令不代表已经提供可发布的 Virtuoso 安装包。

- [开发指南](docs/development.zh.md)与[运行时架构](docs/architecture.zh.md)。
- [Fork 维护](ORCHESTRA_FORK.md)与[产品范围](ORCHESTRA_PRODUCT.md)。
- [Agent 开发说明](AGENTS.md)。

## 参与贡献

请通过 [Virtuoso Issues](https://github.com/OrchestraCorp/Virtuoso/issues)反馈产品问题和缺陷。提交修改前阅读[贡献指南](CONTRIBUTING.zh.md)，报告问题时附上分支、复现步骤和相关检查结果。

## 上游与许可证

Virtuoso 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)及其 [Cordis](https://github.com/cordiverse/cordis) 插件架构。OrchestraCorp 独立维护本产品，并保留上游来源声明。

采用 [MIT 许可证](LICENSE)发布，包括 OrchestraCorp 的贡献。上游版权声明和[第三方许可条款](THIRD_PARTY_NOTICES.md)继续有效。

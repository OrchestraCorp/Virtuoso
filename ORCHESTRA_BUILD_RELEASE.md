# Virtuoso 产品 Profile、构建与发布规则

本文件管理本仓库的产品设计约束。Virtuoso 是独立的 DSH 插件应用：`web` 用于云端和 PWA，`desktop` 用于桌面及原生能力。业务 UI 随产品插件维护，不增加独立业务后台站点或第三个共享 Runtime 仓库。

## 当前代码已落实的范围

- `orchestra.product.json` 是本产品设计清单，独立声明产品身份/版本、bundle、Profile、平台目标、运行配置允许字段和发布通道。
- `scripts/orchestra/product-contract.ts` 校验规则并计算设计输入摘要；`product-plan.ts` 提供只读检查与计划，不执行应用、编译、打包或上传。
- `package.json` 的 `product:check`、`product:plan`、`product:test` 是管理入口；测试直接使用 Node 内置测试器，无需安装整个 DSH 工作区。
- `.github/workflows/product-design.yml` 只做设计校验和计划检查，不创建制品、不使用发布凭据；仓库 Actions 是否启用由 GitHub 设置决定，本次不更改该设置。

Schema 1 明确属于设计阶段，只接受 `planned` 状态和未定的兼容性字段。清单有效不等于功能已实现；检查/计划均返回 `ready: false` 和具体阻塞原因。产品 bundle、启动适配、Stage 登录/业务 UI、策略强制执行及打包器尚未接入。

## 四个维度分别管理

| 维度 | 清单位置 | 规则 |
|---|---|---|
| 产品与版本 | `product` | Virtuoso 初始设计版本为 `0.1.0`；与上游引擎版本分别记录 |
| 运行 Profile | `profiles` / `bundles` | 只有 `web`、`desktop`；复用有序的本产品基础 bundle，分别叠加宿主能力 |
| 构建目标 | `targets` | Profile、操作系统、架构和产物类型必须一致；列出的五个目标均是规划，尚未宣称平台支持 |
| 发布通道 | `release` | `beta`、`stable` 是发布选择，不改变构建身份；正式版本可以从 beta 提升到 stable，预发布版本不能进入 stable |
| 运行配置 | `runtimeConfig.allowedFields` | 只声明 Stage ServerURL、代理和工作区等字段名；不包含实际地址、用户、token 或密钥 |

桌面 appId、数据目录、更新命名空间以及 PWA id/scope 按产品区分，两个安装包不复用产品身份。它们目前是设计声明，尚未映射到上游 Electron/PWA 打包配置。

## Profile 和能力

本产品基础 bundle 包含 Stage 连接/身份/API、会话、后台任务与产品 UI。云端执行、远程办公和远程 Computer Use 是两种 Profile 均可拥有的能力上限；`web` 不得包含本机文件系统、本机办公或本机 Computer Use 能力。`desktop` 在共同能力上增加原生宿主与本机执行能力。

清单中的 `base`、`web`、`desktop` 是设计组合 ID，不是假定已存在的 Cordis 包或可直接运行的 DSH Profile。实际插件、受管模板以及打包依赖闭包后续另行实现；不能把“插件关闭”当作依赖已经从安装包删除。

实际允许的操作由 Profile 上限、在线执行节点的能力和 Stage 的有效授权共同决定。客户端可见能力不等于获得操作权限；PWA 可调用经授权的远端执行器，但不能因此取得访问者电脑的原生权限。

受管 Profile 应固定允许的插件与配置来源，用户仅能覆盖白名单字段。现有 DSH home patch、CLI overlay 和插件管理仍可能改变组合；当前 `enterprisePolicy.state` 为 `planned`，本校验器没有将这些运行时入口强制锁定。

## 检查和只读计划

使用仓库要求的 Node 版本。在本仓库根目录执行；这些命令不需要工作区依赖。此处使用 npm 作为已有脚本的运行器，依赖安装仍遵循仓库的 pnpm 锁文件：

```sh
npm run product:check
npm run product:test
npm run product:plan -- --profile web --target cloud-linux-x64 --channel beta
npm run product:plan -- --profile desktop --target desktop-windows-x64 --channel beta
```

计划的 `composition` 分开记录本产品 `source.revision/dirty` 和上游 `engine.version/commit`。`compositionDigestKind: design-inputs` 表示摘要只覆盖设计输入；`artifactFileDigest: null` 表示尚无实际制品文件摘要。源提交不明或工作区有改动时也会列为阻塞原因。

通道和运行配置不进入构建身份，bundle 顺序、产品源码、引擎来源及目标变化会影响身份。密钥不作为任何计划参数，运行配置只列允许字段名。

以下命令用于需要“已经可以构建”条件的调用方；当前设计阶段应输出阻塞原因并返回非零，不得忽略退出码继续发布：

```sh
npm run product:check -- --require-ready
```

当前上游 `pnpm run build --profile official` 的 Profile 是客户端公开构建环境选择器，并不按产品 `web/desktop` 剪裁。上游 desktop 也有专用启动流程，不能从这份清单推导出可用的 `dsh --profile virtuoso-desktop` 命令。现有上游打包命令仍保持原功能，不自动成为本产品发布入口。

## 后续编译和发布适配应遵守的规则

1. 从同一产品 tag/提交构建相同版本的共享插件与 UI，再分别组装 cloud/PWA 和各桌面平台产物；原生资源按目标平台构建并验收。
2. Web 交付包含服务运行时和 PWA 资源；桌面交付包含本产品所需 Runtime/桥接与原生资源。每个目标使用明确依赖闭包，发布输入不来自用户的 DSH home、会话或凭据目录。
3. 产品版本、上游引擎版本和协议版本分别记录。最终发布清单需绑定源码、Profile 组合、平台、实际文件摘要、运行时/ABI、能力、协议与存储兼容信息。
4. 打包和平台签名后，针对最终产物做启动、登录、工具、取消、恢复、权限和升级验收；清单中的平台名称不能代替对应平台真实测试。
5. beta 到 stable 提升同一份已验证制品，不重新编译或覆盖旧文件。上游桌面更新通道目前有包内配置，达到该规则仍需产品适配；本轮只校验通道不影响设计身份。
6. Stage ServerURL 和企业身份在运行时选择；升级声明最低 Stage/客户端协议和数据可读范围，照顾仍打开的旧 PWA 页面。运行中任务明确排空、保留版本或兼容恢复策略。
7. 桌面升级保留已验证版本，并核对存储迁移是否允许回退。二进制回滚不撤销已经产生的业务副作用。

任何真实编译、制品生成、通道激活与发布流水线都需要后续实现及验收。本次没有启用产品发布，没有把现有上游发行流程当作 OrchestraCorp 的已验证发布能力。

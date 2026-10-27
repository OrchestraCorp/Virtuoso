# Virtuoso

Virtuoso 是 OrchestraCorp 的员工核心工作系统，用“大师 / 演奏名家”指代每位员工拥有的 Agent 工作环境。

Virtuoso 在本目录独立维护完整源码、依赖、版本和发布流程，自行选择与同步 DeepSeek Harness 上游版本。Maestro 使用另一份独立仓库；两者之间没有强制共享的 Runtime 仓库、工作目录或依赖。

## 主要能力

- 员工个人 Agent、会话和工作空间。
- 云端、桌面和移动 PWA 工作入口。
- 任务、上下文、承诺、审批、交付和知识卡片。
- DSH 二开插件与受控工具调用。
- 对第三方 Agent 的任务委托和结果接收。

## 权威边界

Virtuoso 提供员工与 Agent 的工作体验，不保存公司的第二套任务数据库。正式任务、权限、承诺、审批和结果写入 Stage；正式文档、知识和制度通过 Maestro 进入 ScoreBook。

早期由人员监督 Agent 完成工作；Agent 不作为独立业务身份，也不会仅因协助员工就继承其全部权限。Stage 在正式业务入口验证人员身份、任职和当前授权。

## 仓库与实现状态

当前已从核验过的上游提交建立独立本地 fork，拥有自己的 `.git`、`main`、上游引用和基线标签。职责与权限设计保存在本文件；根目录 `README.md` 与 `README.zh.md` 是产品介绍、开发状态和源码运行入口，并保留上游归属说明。

当前完整源码仍是上游运行时基线，产品 profile、界面适配和企业连接器尚未实现，依赖安装与应用运行尚未验证。产品 `origin` 指向 GitHub 仓库 `OrchestraCorp/Virtuoso`，源码按 [MIT 许可证](LICENSE)公开。

[仓库维护说明](ORCHESTRA_FORK.md)记录来源、历史状态和独立同步规则。

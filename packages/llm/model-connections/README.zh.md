---
description: "单产品运行实例内的模型连接、独立凭据与动态 pi-ai 路由。"
kind: "package-reference"
---

# @deepseek-ai/dsh-model-connections

[English](README.md) | 中文

## 概述

`ctx.modelConnections` 保存桌面端或分配给单个用户的云端运行实例的模型连接。`modelConnections` Remote 命名空间提供公开配置、显式发现、受限文本测试和新 Agent 的默认模型。Stage 不保存或代理这些连接。

## 目录

- [使用此包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

与 `storageDomain`、`credentials`、`llm` 和 `agentDefaultModel` 一起加载此服务。`requestTimeoutMs` 限定发现与测试时间，`probeMaxTokens` 限定测试请求的输出。`model_connections` 域使用格式版本 1，以单个聚合保存 revision、连接记录和可选默认值。

每个连接的提供方 ID 固定为 `maas-<UUID>`。内置目录提供模型名称与协议提示，不声明未知 token 容量。模型显式协议优先，其次为精确匹配的内置 ID，否则使用 Chat Completions。保存时写入解析后的协议，后续目录更新不重新解释已保存模型。可选容量为用户明确填写的 token 数量。

模型接受的 `input` 输入类型（`text`、`image`）与可选 `reasoningEfforts` 需要显式声明。推理映射把可选档位映射到 endpoint 的实际参数值；仅 `off` 可使用 `null` 表示不发送对应参数，`false` 表示模型不提供推理。快照向编辑器提供支持的档位名称。能力声明不合法时，在写入凭据或连接前拒绝。格式 1 中省略这些字段的原有模型仍可读取，继续使用保守的纯文本输入且不提供推理档位；不根据模型名称推断能力。省略 token 容量时沿用 adapter 可配置的回退值，这些数值不是验证过的 endpoint 限制。

编辑器提交读取时的 revision。并发或过期写入返回 `model-connections/conflict`，调用方重新读取后再修改。默认模型、停用连接和移除模型在同一聚合写入中校验。删除当前默认连接前必须先选择另一个默认模型。编辑默认模型能力时，在同一次写入中移除已不可用的默认推理档位，保留提供方与模型；已有 Session 的选择不变。通过 `agentDefaultModel` 注册的来源仍可保存原有内置提供方选择；产品默认值为空时继承原 profile Config。该服务在保存产品默认值前检查当前 invocation，非 owner 会话调用者不能改变全局模型选择。

公开快照与域中均不保存 secret。省略 key 时保留现有凭据引用，替换 key 时先写新引用再提交连接。凭据写入失败不改变连接；域写入失败尝试删除新建的未使用引用，并保留原运行路由。API 只返回脱敏诊断，不返回提供方错误正文或凭据存储异常。

已提交聚合为权威来源，持久化完成后才编译并原子替换本服务的路由。激活失败时，为保留且启用的连接沿用上一份运行配置，在已保存连接上返回 `activationError`；已删除或停用的路由仍然撤下。修正配置后重新保存。已经准备的请求保留捕获的 endpoint 与凭据引用。卸载时移除路由与默认来源，等待排队写入完成后关闭域。

发现使用已保存的 endpoint 与凭据，仅返回候选，不自动保存。显式协议决定发现路径和认证请求头；省略时固定使用 OpenAI Chat Completions，与已保存模型顺序无关。测试使用已启用连接的已保存模型，仅发送简短文本，不包含工具或会话历史，可能消耗提供方额度。调用取消、超时或服务卸载会停止这两类操作。

<a id="model-experience"></a>
## 模型体验

### 使用选定连接的请求

#### 模型会看到什么

普通请求沿用 pi-ai adapter 的提示词与工具投影。声明的图片输入和推理档位使用该 adapter 已有的附件与协议处理。未声明图片时，模型保持保守的文本能力，DSH 流将历史图片替换为省略说明文本；会话图片准入沿用已有 Session 策略。显式连通性测试只发送用户文本块 `Reply with OK.`，不声明工具；测试成功不表示图片或工具调用已验证。发现不发送提示词。连接名称与凭据不会加入提示词正文。

#### Token 影响

普通请求由所选模型决定 token 用量。显式测试消耗简短输入与输出，输出请求上限为 `probeMaxTokens`。

#### KV 缓存影响

修改连接影响后续准备的请求。已经准备的请求保留其捕获配置；切换 endpoint 或模型可能影响提供方缓存复用。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 服务限定单运行实例的 owner，不提供认证或多租户隔离。共享云进程在接入不同用户前，需要可信主体、按 owner 隔离的存储和执行时使用授权。
- 替换或删除连接后，旧凭据引用继续保存，供已准备的请求完成。不提供自动引用清理或凭据导出/同步。域提交失败后的清理若失败，也可能留下未使用 key；服务记录脱敏警告。
- 不导入或双写现有 profile 路由与账号凭据。连接和默认值由运行实例单一写入；域不提供跨进程同步或自动格式迁移。
- 模型能力和推理参数值来自用户声明，并非 endpoint 验证。协议特定的兼容开关仍通过已有 pi-ai 提供方 profile 配置。错误 endpoint、协议或能力声明会在发现或请求时失败。

<a id="dev-note"></a>
### 开发备注

[模型连接决策](../../../.agents/notes/implemented/architecture/2026-10-20-model-connections.zh.md)说明领域归属、静态协议默认值和请求快照。

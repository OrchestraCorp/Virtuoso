---
kind: upgrade-guide
description: "新的产品运行实例要求显式选择模型，模型目录可以返回空默认值。"
---

# 显式选择模型

[English](guide.md) | 中文

## 变更

基础 bundle 不再隐式设置 `deepseek-official / deepseek-flash` 默认值。未配置的运行实例可以打开设置、浏览模型和创建空会话；发送请求需要显式选择模型。已有默认值和会话已记录的选择继续作为依据。

`agentDefaultModel.currentSelection()` 可以返回 `undefined`。`requireSelection()` 返回已配置的选择，否则抛出 `MODEL_NOT_CONFIGURED`。未配置默认值时，Session 的 `modelCatalog` 响应返回 `default: null`。自定义客户端需要展示未选择状态。

## 迁移

1. 打开**设置 → 模型连接**，保存连接并显式设置默认模型，或在会话选择器中选择模型。受管提供方就绪后，其模型也会出现在该选择器中。
2. 需要固定默认值的部署可以在 `agent-default-model` 插件行同时设置 `provider` 和 `model`。Headless 任务需要在执行前配置选择。
3. 更新自定义 `currentSelection()` 消费者以处理 `undefined`，模型目录消费者以处理 `default: null`。请求入口使用 `requireSelection()`。
4. 确认新运行实例能展示模型选择器且未向提供方发出请求，然后选择已配置的模型并发送消息。

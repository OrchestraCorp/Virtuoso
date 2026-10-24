---
kind: upgrade-guide
description: "产品 Profile 移除 DeepSeek 账号登录，改用 API Key 模型连接。"
---

# 产品 Profile 移除 DeepSeek 账号登录

[English](guide.md) | 中文

## 变更

Maestro 和 Virtuoso 的产品 Profile 不再挂载 DeepSeek 账号提供方、账号令牌模型路由、账号 Remote 控制器或账号设置界面。Desktop 直接打开工作区，移除原生登录与 Platform 余额、充值视图。通过普通设置按钮打开设置。提供方凭据自动引导默认关闭。

API Key 凭据与 MaaS 模型连接继续可用。已有账号授权和会话数据不会被删除，保存的模型选择也不会静默改为其他提供方。

## 迁移

1. 打开**设置 → 模型连接**，填写服务 BaseURL、API Key 和模型，保存后选择默认模型。现有**模型**页面也可配置 API Key。
2. 如果保存的选择使用 `deepseek-account`，请为新任务以及仍选择该路由的会话显式改选已配置的 API Key 模型。
3. 如果私有覆盖层复制过旧默认组合，请移除其中显式添加 `deepseek-account`、`llm-deepseek-account`、`account-controller` 或 `ui-settings-account` 的 Profile 条目。
4. 确认启动直接显示工作区与设置，没有 DeepSeek 登录、余额或充值入口，再通过连接的显式模型测试验证所选配置。

---
description: "通过现有 DSH 品牌 slot 在侧栏和会话首屏展示 Virtuoso 产品身份。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

本包在侧栏显示已批准的 Virtuoso 标志与名称，并在会话首屏显示同一静态标志。本地与官方客户端构建使用相同的产品身份。本包不保留运行时状态，也不影响模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件挂载到产品浏览器插件名单。它占用现有侧栏标志、名称和会话首屏标志 slot，不增加导航或另一个应用宿主。

### 选择 profile

客户端构建 profile 选择构建元数据，不切换此产品身份。Web 和桌面均使用包内 `src/client/assets/product-logo.svg`，不从相邻 checkout 解析资源。

### 替换品牌

部署可用占据相同品牌 slot 的其他包替换本包。产品标志使用提供的 SVG 资源，不生成替代图形。侧栏所有者选择方形尺寸，首屏所有者另提供呈现类名。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

侧栏填充通过嵌套 `ctx.slots.inject()` 一起安装。首屏填充独立等待其声明，因此任一界面均可挂载或卸载，不留下残缺的侧栏身份。插件卸载会移除所有填充。SVG 通过静态导入交由图片打包器内联，浏览器标题仍由独立的 `DSH_CLIENT_TITLE` 决定。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染其回退。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏声明 `conversation.hero.brand.mark`。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

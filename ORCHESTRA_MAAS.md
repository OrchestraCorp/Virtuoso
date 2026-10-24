# MaaS 模型连接

Maestro 与 Virtuoso 都使用 DSH 原生插件提供“设置 → 模型连接”。每位用户在自己拥有的 Runtime 中配置 BaseURL 和 API Key；云端/PWA 用户须使用分配给自己的隔离 Runtime。Web/PWA 编辑所连接服务器上的配置，桌面编辑本机 Runtime 的配置。Stage 不分发或保存模型连接、密钥和目录；该方案不绑定 BlueNeo 账号。共享多用户进程的身份、存储隔离和使用授权仍需另外实现。

## 配置与选择

1. 添加连接，填写名称、BaseURL 和 API Key。预填地址 `https://llm-api.x-aio.com/v1` 保留为可编辑的地址提示，可改为第三方兼容地址；它不代表账号登录或企业分配。
2. 选择内置模型或手动输入模型 ID。每个模型可指定 Chat Completions、Responses 或 Anthropic Messages；显式协议优先，未指定时使用内置精确 ID 的协议提示，未知 ID 使用 Chat Completions。
3. 按提供方实际支持编辑每模型的 `input`（文本/图片）、`reasoningEfforts`（DSH 档位与 API 参数值映射）、`contextWindow` 和 `maxTokens`。容量支持 K/M 输入，保存为正整数 token 数。推理映射逐档配置，不根据模型名称猜测；仅当所选适配器和提供方支持 effort 参数时才使用所填 API 参数值。Anthropic Messages 默认采用 DSH 思考预算策略，不把这些值原样发送为 effort 参数。未声明能力的旧模型保留保守行为。
4. 保存连接后，单独选择模型发现协议再获取服务端模型列表。发现不依赖已存模型的排列顺序；候选携带所选协议进入草稿，须确认保存后采用。也可显式对已保存模型发出小型文本测试；测试会消耗提供方额度，成功只说明该文本路径可用。
5. 新实例没有预选默认模型。保存连接和选择默认是两个动作；首次发送前须在设置或会话模型选择器中明确选择。已有会话的显式选择或已记录模型保留；尚无模型选择的空会话继承当前默认。删除、禁用默认连接或移除默认模型前，须先改选其他模型。

内置目录提供 12 个模型的 ID、名称和协议提示，来源为 BlueNeo 的公开模型选项接口；它不绑定 BlueNeo 身份，也不授予模型访问权。运行时不查询或自动刷新该目录，不自动启用全部模型，不从名称推断图片、推理或容量能力。目录维护位置为 [catalog.ts](packages/llm/model-connections/src/catalog.ts)。

## 数据与调用

`model_connections` 是现有 storage-domain 下的单一 KV 聚合，保存连接、模型、默认选择和 revision。API Key 继续通过原 DSH credentials provider 保存；页面与普通连接数据不返回秘密值或凭据引用，留空保留已有密钥。现有本地凭据文件仍无应用层加密，本功能没有引入新的密钥保管或跨设备同步服务。

模型连接服务从保存的数据生成稳定的 DSH provider 路由，同一连接内按模型分派协议。Agent Loop、流式响应、工具调用和取消复用现有 pi-ai；已经准备好的请求保留当时捕获的地址与凭据引用。

并发写入检查 revision。提交后发送 `model-connections/changed` 通知；连接同一 Runtime 的已打开设置窗口可重新读取最新快照，编辑中的旧版本草稿会提示冲突。该通知不提供跨进程同步。持久化失败保留原状态；路由激活失败单独报告，保留仍有效的旧设置，并撤下已删除或停用的路由。旧凭据引用暂保留以供已准备的请求完成，自动回收与导出同步尚未提供。

默认客户端组合不加载 DeepSeek 官方账号登录、余额、充值和账号令牌模型路由；官方 API Key 路由与原 Models 设置继续可用。新连接不双写 Cordis 配置，也不自动导入旧连接。具体行为见 [连接服务](packages/llm/model-connections/README.md)。

以上描述当前代码行为，不代表真实模型端到端验证、产品制品发布或企业业务闭环已经通过验收。

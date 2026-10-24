# 直连模式（Direct Mode）重构设计规格说明

**日期**：2026-10-24
**状态**：Draft / 待审阅

---

## 1. 背景与目标

### 1.1 现状问题
在当前实现中，上游服务器节点的 `type: 'direct'` 仅表示“使用本地配置的 Gemini `apiKeys` 密钥池轮询并默认指向 `generativelanguage.googleapis.com`”。无论请求命中 `'proxy'` 还是 `'direct'` 节点，`ClaudeController` 都会强制执行完整的 `Claude <-> Google Gemini` 协议转换，并将请求改写至 `/v1beta/models/...:generateContent`。

### 1.2 重构目标
重新定义上游节点的 **直连模式（`type: 'direct'`）**：
- **不做协议转换**：当请求被路由到直连模式节点时，不再将 Claude 请求转换为 Google Gemini 请求，也不对上游响应做 Gemini -> Claude 转换。
- **执行轻量前置步骤**：在转发前仅对请求体执行四项前置处理（模型名称映射、系统提示词指纹清理与自定义追加、历史临时消息过滤、忽略工具过滤），随后按原协议路径直接转发给上游服务器。
- **移除本地密钥池**：去掉直连模式的本地 `apiKeys` 密钥池配置，改为直接透传客户端鉴权与协议请求头。
- **精简账号管理视图**：在管理后台「账号管理（AccountsView）」中，直连模式节点仅展示顶部的**节点模型使用概览卡片（Node Model Usage Overview）**，不展示下方的操作工具栏、账号列表及实时终端日志面板。
- **完整交易日志审计**：在 `payloadLogger` 中保持完整的请求/响应记录（`clientReq` 记录客户端原始请求，`gemReq` 记录前置处理后的请求体，`gemRes` / `claudeRes` 记录上游返回的 SSE 事件数组或 JSON 响应）。

---

## 2. 架构与数据流设计

### 2.1 选路分流架构
由于系统支持多节点混合部署（同一集群中可同时存在 `'proxy'` 节点与 `'direct'` 节点，并按权重或 `allowedModels` 过滤调度），请求进入 `ClaudeController` 后的完整流程如下：

```
客户端请求 (POST /v1/messages 等)
  │
  ├─ 1. 提取并校验客户端鉴权 Key (extractClientKey)
  ├─ 2. 解析模型映射 (getModelMappingInfo): rawModel -> cleanModelName, strategy
  ├─ 3. 校验集群是否支持该模型 (upstreamManager.hasUpstreamForModel)
  ├─ 4. 选定目标上游节点 (upstreamManager.getUpstreamServer)
  │
  ├─── 分支 A: serverSelection.serverType === 'direct' (直连模式)
  │      ├─ 执行 claudeTranslator.preprocessClaudeDirectRequest(clientReq) -> directReq
  │      ├─ 构建透传请求头 buildDirectUpstreamHeaders(req, apiKey, customHeaders)
  │      ├─ 直接转发至 ${serverUrl}/v1/messages (或对应原路径)
  │      ├─ 流式/非流式响应原样透传给客户端
  │      ├─ 记录模型调用统计 (accountUsageService) 与熔断状态 (upstreamManager)
  │      └─ 记录交易日志 (payloadLogger: clientReq, directReq, upstreamRes, upstreamRes)
  │
  └─── 分支 B: serverSelection.serverType === 'proxy' (代理模式)
         └─ 保持现有 Claude <-> Google Gemini 协议转换与转发流程不变
```

---

## 3. 核心模块详细设计

### 3.1 直连前置处理器（`claudeTranslator.preprocessClaudeDirectRequest`）

在 `src/proxy/services/claudeTranslator.ts` 中新增 `preprocessClaudeDirectRequest(claudeBody: ClaudeRequest)` 方法：
- 输入为客户端请求体的深拷贝副本，确保原始 `clientReq` 不被修改。
- **步骤 A：模型名称映射**
  - 调用 `this.getModelMappingInfo(claudeBody.model)` 获取 `targetModel` 与 `strategy`。
  - 将 `directReq.model` 设置为 `targetModel`（若未命中映射则去除可能存在的 `models/` 前缀）。
  - **忽略 `-high` 后缀**：不对 `directReq.model` 的 `-high` 后缀做剥离，也不注入或修改 `directReq.thinking`。
- **步骤 B：顶层 `system` 提示词清洗与追加**
  - **清洗 `x-anthropic-billing-header` 指纹**：
    - 若 `directReq.system` 是字符串：通过 `this.cleanSystemContent(directReq.system)` 处理；若返回 `null`（即命中 `^\s*x-anthropic-billing-header` 且 `config.stripSystemFingerprints` 开启），则删除 `directReq.system`。
    - 若 `directReq.system` 是数组：遍历数组元素，对文本块调用 `this.cleanSystemContent()`，过滤掉返回 `null` 的块；若过滤后数组为空，则删除 `directReq.system`。
  - **追加 `config.customSystemInstruction`**：
    - 若配置了非空的 `config.customSystemInstruction`：
      - 当 `directReq.system` 为数组时，在末尾追加 `{ type: 'text', text: config.customSystemInstruction }`；
      - 当 `directReq.system` 为非空字符串时，拼接为 `${directReq.system}\n\n${config.customSystemInstruction}`；
      - 当 `directReq.system` 未定义或为空时，设为 `config.customSystemInstruction`。
- **步骤 C：历史临时消息过滤**
  - 若 `directReq.messages` 为数组，调用 `this.filterEphemeralMessages(directReq.messages)` 过滤最后一轮 `role: 'user'` 之前的临时消息（`ephemeralUserMessages` / `ephemeralSystemMessages`）。
  - **不处理 `messages` 内的 `role: 'system'`**：不对 `directReq.messages` 中的 `role: 'system'` 消息做提取、合并或 `<system-context>` 标签包裹。
- **步骤 D：忽略工具过滤**
  - 若 `directReq.tools` 为数组且 `config.ignoredTools` 非空：
    - 构造小写集合 `ignoredSet`，过滤掉 `tool.name`（或 `tool.function?.name`）在 `ignoredSet` 中的工具。
    - 若过滤后 `directReq.tools` 长度为 `0`，则 `delete directReq.tools`。

返回值：`{ directRequest: ClaudeRequest, cleanModelName: string, strategy?: SchedulingStrategy, isStream: boolean }`。

### 3.2 直连请求头构建（`buildDirectUpstreamHeaders`）

在 `src/utils/requestHelper.ts` 中新增 `buildDirectUpstreamHeaders(req: Request, effectiveApiKey: string, customHeaders?: Record<string, string>): Record<string, string>`：
- 基础头：`'Content-Type': 'application/json'`。
- 透传客户端鉴权头：
  - 若客户端携带了 `x-api-key`，保留 `x-api-key`；
  - 若客户端携带了 `authorization`，保留 `Authorization`；
  - 若客户端携带了 `x-goog-api-key`，保留 `x-goog-api-key`；
  - 若客户端仅通过 query `?key=` 或 `x-admin-key` 传入凭证，则补充 `'x-api-key': effectiveApiKey` 与 `'Authorization': 'Bearer ' + effectiveApiKey`。
  - 若 `config.adminSecretKey && effectiveApiKey === config.adminSecretKey` 且尚无 `Authorization` 头，自动补齐 `'Authorization': 'Bearer ' + effectiveApiKey`。
- 透传 Claude 协议扩展头（若客户端请求中包含）：
  - `anthropic-version`
  - `anthropic-beta`
- 合并 `customHeaders`（如 `x-scheduling-strategy`）。

### 3.3 `ClaudeController` 各端点的直连转发逻辑

#### 3.3.1 `POST /v1/messages`（`handleMessages`）
- 先根据 `clientReq.model` 解析映射模型名并检查 `upstreamManager.hasUpstreamForModel(clientModel, cleanModelName)`。
- 调用 `upstreamManager.getUpstreamServer({ model: cleanModelName, originalModel: clientModel, resolvedModel: cleanModelName })` 选出目标服务器。
- 当 `serverSelection.serverType === 'direct'` 时：
  - 执行 `claudeTranslator.preprocessClaudeDirectRequest(clientReq)` 得到 `directReq`。
  - 目标 URL 为 `${serverSelection.serverUrl}/v1/messages`（若 `req.originalUrl` 带有 query 参数则保留）。
  - **流式（`isStream === true`）**：
    - 创建 `StreamLifecycleManager({ req, res, transactionId, timeoutMs, enableSseHeartbeat: true })`。
    - 发起 `fetch` 请求；若状态码非 2xx：
      - 5xx 记录 `upstreamManager.recordRequestResult(serverIndex, false, response.status)`，其余状态码记录 `true`。
      - 解析错误文本并通过 `claudeTranslator.normalizeError` 格式化错误响应，记录 `accountUsageService` 与 `payloadLogger`，返回给客户端。
    - 若状态码为 2xx：
      - 调用 `streamManager.attachStream(response.body)` 与 `streamManager.ensureSseHeaders()`。
      - 在 `response.body.on('data')` 中：将收到的数据块直接 `res.write(buffer)` 原样透传给客户端（不做二次转换）；同时旁路按行解析 `data:` 后的 JSON 对象存入 `sseEvents` 数组。
      - 在 `response.body.on('end')` 中：记录 `accountUsageService.record(accountKey, cleanModelName, true)`、`upstreamManager.recordRequestResult(serverIndex, true)`，并将 `(transactionId, clientReq, directReq, sseEvents, sseEvents, duration, requestPath, 200, true, accountKey)` 写入 `payloadLogger`。
  - **非流式（`isStream === false`）**：
    - 发起 `fetch` 请求；若非 2xx 则按上述错误流程处理。
    - 若 2xx：解析上游返回的 JSON `upstreamData`，原样 `res.status(200).json(upstreamData)` 返回给客户端，并将 `(transactionId, clientReq, directReq, upstreamData, upstreamData, duration, requestPath, 200, false, accountKey)` 写入 `payloadLogger`。

#### 3.3.2 `POST /v1/messages/count_tokens`（`handleCountTokens`）
- 选定目标节点后，若 `serverSelection.serverType === 'direct'`：
  - 调用 `claudeTranslator.preprocessClaudeDirectRequest(clientReq)` 得到 `directReq`（若配置了 `config.countTokensModel` 则将 `directReq.model` 替换为映射后的 `countTokensModel`）。
  - 转发至 `POST ${serverSelection.serverUrl}/v1/messages/count_tokens`。
  - 若上游返回 2xx JSON：若已包含 `input_tokens` 则原样返回，若包含 `totalTokens` 则兼容映射为 `{ input_tokens: totalTokens }`；写入 `payloadLogger`。

#### 3.3.3 `GET /v1/models` 与 `GET /v1/models/:model_id`（`handleListModels` / `handleRetrieveModel`）
- 选定目标节点后，若 `serverSelection.serverType === 'direct'`：
  - 分别转发至 `GET ${serverSelection.serverUrl}/v1/models` 与 `GET ${serverSelection.serverUrl}/v1/models/${resolvedModelId}`。
  - 若上游返回标准的 Claude 模型列表/详情结构则原样返回，若返回 Gemini `models` 结构则兼容映射；写入 `payloadLogger`。

#### 3.3.4 `GeminiController`（`/v1beta/*`）
- `geminiController.ts` 原本即不做协议转换；在直连模式重构后：
  - 当 `serverType === 'direct'` 时，跳过 `-high` 后缀剥离与 `thinkingConfig` 注入，且不再使用 `selectedApiKey` 覆盖客户端 Key。

---

## 4. 账号管理（`AccountsView`）与用量统计设计

### 4.1 节点级模型用量记录
- 在 `ClaudeController` 与 `GeminiController` 中，当 `serverType === 'direct'` 时：
  - 若上游响应头包含 `x-account-name`，则使用该值；否则使用固定节点标识 `__direct_node_${serverIndex}__` 调用 `accountUsageService.record(accountKey, cleanModelName, isSuccess)`。
- 在 `src/admin/controllers/accountController.ts` 的 `getStatus` 方法中：
  - 当目标服务器 `targetServer.type === 'direct'` 时，不再遍历 `apiKeys`，而是从 `accountUsageService` 中提取 `__direct_node_${serverIndex}__`（以及可能存在的关联统计）构造虚拟汇总项放入 `accountDetails`（使得前端 `calculateServerModelStats(accounts)` 能够零改动直接计算出该直连节点的模型使用卡片数据），同时在顶层返回 `isDirectMode: true`。

### 4.2 前端 `AccountsView.tsx` 视图裁剪
- 当当前选中节点为直连模式（`isCurrentDirect === true`）时：
  - **顶部多节点切换栏**：保留「直连」徽章与在线绿点，隐藏直连节点的账号/Key 数量角标（不显示 `0 Keys` 或 `1 账号`）。
  - **节点模型使用概览卡片（Node Model Usage Overview）**：**完整保留**，展示该直连节点下各模型的请求数、占比、成功/失败数与成功率。
  - **下方区域全部隐藏**：当 `isCurrentDirect` 为 `true` 时，不渲染 Action Toolbar（搜索框、状态筛选、上传/下载/去重/批量删除按钮）、不渲染桌面端/移动端账号列表表格、不渲染底部实时终端日志面板。

---

## 5. 配置界面与类型清理（`ConfigModal.tsx` & `upstreamManager.ts`）

1. **`src/types/index.ts` & `config/default.ts` & `src/utils/upstreamManager.ts`**：
   - 移除 `UpstreamServerSelection` 中的 `selectedApiKey` 字段与 `UpstreamManager.selectDirectApiKey` 方法。
   - `parseUpstreamServers` 中切换或解析 `type: 'direct'` 时，不再当 URL 为空时强制回退到 `https://generativelanguage.googleapis.com`。
2. **`frontend/src/components/ConfigModal.tsx`**：
   - 移除直连模式下的 `Gemini API Keys (直连密钥池)` 文本域输入组件。
   - 移除节点折叠态摘要栏中的 `Key ×N` 徽章。
   - 移除切换「直连模式 (Direct)」时自动填入 `https://generativelanguage.googleapis.com` 的行为，以及出口通道处的“目标: 官方 Gemini API”提示标签。

---

## 6. 测试策略

1. **单元测试（`tests/claudeTranslator.test.ts`）**：
   - 验证 `preprocessClaudeDirectRequest`：
     - 模型别名映射正常生效；
     - 模型名带 `-high` 后缀时**原样保留 `-high`**，且不注入 `thinking`；
     - `system` 字符串/数组中的 `x-anthropic-billing-header` 被正确剥离，`customSystemInstruction` 被正确追加；
     - `messages` 中的历史临时消息被过滤，而 `messages` 内的 `role: 'system'` **保持原样不被改动**；
     - `tools` 中的 `ignoredTools` 被剔除。
2. **集成测试（`tests/claudeController.test.ts` / `tests/upstreamManager.test.ts`）**：
   - 验证当上游节点配置为 `type: 'direct'` 时：
     - `POST /v1/messages`（流式与非流式）直接向 `${serverUrl}/v1/messages` 发送 Claude 原生格式请求体（经过前置处理），而非 `/v1beta/models/...:generateContent`；
     - 客户端请求头（`x-api-key`、`Authorization`、`anthropic-version`、`anthropic-beta`）被正确透传；
     - 上游返回的 Claude SSE 流与非流式 JSON 被原样透传给客户端；
     - `payloadLogger.saveTransaction` 收到原始 `clientReq`、前置处理后的 `directReq` 以及上游响应数据。
3. **后台与前端测试（`tests/accountController.test.ts` & 前端构建校验）**：
   - 验证直连节点的 `/api/admin/accounts/status` 返回 `isDirectMode: true` 及模型用量汇总数据；
   - 验证前后端 `npm run build` 与全量 `npm test` 通过。

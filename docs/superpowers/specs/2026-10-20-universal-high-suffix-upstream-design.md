# 全上游（直连与代理模式）统一支持 `-high` 思考尾缀设计方案

## 1. 背景与目标

当前系统中，模型映射或请求模型名称带有 `-high` 尾缀（如 `gemini-2.5-pro-high`）时，仅在选中的上游服务器为 **直连模式（`serverType === 'direct'`）** 下才会执行尾缀剥离（`models/gemini-2.5-pro`）及 `generationConfig.thinkingConfig = { thinkingLevel: 'HIGH' }` 注入。当请求被调度到 **代理模式（`serverType === 'proxy'`）** 的上游服务时，`-high` 尾缀被原样保留在 URL 中且未注入 `thinkingConfig`，导致代理上游无法识别模型名或未开启高阶思考模式。

**目标**：将 `-high` 尾缀的解析、URL/Body 模型名剥离以及 `thinkingLevel: 'HIGH'` 的注入逻辑统一应用到**所有上游服务**（同时涵盖 `direct` 模式与 `proxy` 模式），同时保持本地审计日志、账号用量统计与监控面板对 `High 规格` 的区分统计能力不变。

---

## 2. 架构与核心改动

### 2.1 核心辅助模块（`src/utils/modelThinkingHelper.ts`）
保持现有纯函数逻辑不变：
- `parseModelThinkingSuffix(model?: string)`：不区分大小写检测 `-high` 尾缀，返回 `{ baseModel, isHigh, thinkingLevel }`。
- `applyThinkingConfigHigh(generationConfig: any)`：在 `generationConfig.thinkingConfig` 中设置 `thinkingLevel: 'HIGH'`，移除 `includeThoughts`，并保留其余自定义属性。

### 2.2 Claude 翻译代理控制器（`src/proxy/controllers/claudeController.ts`）
1. **`handleMessages`（流式与非流式生成）**：
   - 移除 `if (serverType === 'direct')` 限制条件。
   - 对所有选中的上游服务器，当 `parseModelThinkingSuffix(cleanModelName).isHigh` 为 `true` 时：
     - 将发往上游的 `targetUrl` 中的 `models/${cleanModelName}:` 替换为 `models/${thinkingInfo.baseModel}:`。
     - 初始化 `gemReq.generationConfig` 并调用 `applyThinkingConfigHigh(gemReq.generationConfig)`。
2. **`handleCountTokens`（`/v1/messages/count_tokens`）**：
   - 移除 `if (serverType === 'direct')` 限制条件。
   - 当 `thinkingInfo.isHigh` 为 `true` 时，对所有上游统一将 `targetUrl` 中的 `models/${cleanModelName}:` 替换为 `models/${thinkingInfo.baseModel}:`，并将 `countTokensPayload.generateContentRequest.model` 设为 `models/${thinkingInfo.baseModel}`。
3. **`handleRetrieveModel`（`GET /v1/models/:model_id`）**：
   - 当 `resolvedModelId` 带有 `-high` 尾缀时，构造发往上游的 `targetPath` / `targetUrl` 使用剥离 `-high` 后的 `baseModel`，确保客户端校验带 `-high` 映射的模型时上游返回正常的模型元数据。

### 2.3 原生 Gemini 代理控制器（`src/proxy/controllers/geminiController.ts`）
1. **`handleProxy`（`/v1beta/*` 与 `/v1/models/*`）**：
   - 将原有的 `if (serverType === 'direct' && targetModelName)` 条件改为 `if (targetModelName)`。
   - 当 `parseModelThinkingSuffix(targetModelName).isHigh` 为 `true` 时，无论上游是 `direct` 还是 `proxy`：
     - 将 `targetUrl` 中的 `models/${targetModelName}` 替换为 `models/${thinkingInfo.baseModel}`。
     - ���存在请求体 `clientReq`：
       - 若 `clientReq.model` 带 `-high`，剥离为 `baseModel`。
       - 若 `clientReq.generateContentRequest?.model` 带 `-high`，剥离为 `baseModel`。
       - 若请求路径为内容生成接口（`:generateContent` 或 `:streamGenerateContent`），对 `clientReq.generationConfig` 调用 `applyThinkingConfigHigh(clientReq.generationConfig)`。

---

## 3. 数据流与监控兼容性

1. **上游节点模型过滤（`upstreamManager.serverSupportsModel`）**：
   - 现有实现已支持将带 `-high` 的请求模型剥离为 `baseModel` 后匹配节点的 `allowedModels`，对 `direct` 和 `proxy` 节点均生效，无需改动。
2. **日志与指标统计（`payloadLogger`、`metricsService`、`accountUsageService`）**：
   - 控制器内部的 `cleanModelName`（Claude 链路）与 `targetModelName`（Gemini 链路）局部变量保持包含 `-high` 尾缀的值不变。
   - 因此 `accountUsageService.record(accountName, cleanModelName, ...)`、`payloadLogger.saveTransaction(...)` 和 `metricsService` 依然记录带 `-high` 的模型名，前端 Dashboard 中的 `Standard` vs `High 规格` 流量占比统计完全不受影响。

---

## 4. 错误处理与边界情况

- **非生成类接口保护**：在 `geminiController` 与 `claudeController.handleCountTokens` 中，��剥离模型名中的 `-high` 尾缀，**不注入** `generationConfig.thinkingConfig`，避免 `:countTokens` 等非生成端点因多余的 `generationConfig.thinkingConfig` 字段返回 400 错误。
- **大小写与空白容错**：`parseModelThinkingSuffix` 统一处理大小写（如 `-HIGH`、`-High`）及首尾空格。
- **自定义 `thinkingConfig` 属性保留**：若客户端已在请求中携带自定义 `thinkingConfig` 字段，`applyThinkingConfigHigh` 会保留除 `includeThoughts` 外的其他字段并覆盖 `thinkingLevel: 'HIGH'`。

---

## 5. 测试验证计划

1. 更新 `tests/claudeControllerThinkingDirect.test.ts`：
   - 验证 `/v1/messages`（流式与非流式）在 `direct` 和 `proxy` 模式下均剥离 URL 中的 `-high` 并注入 `thinkingConfig: { thinkingLevel: 'HIGH' }`。
   - 验证 `/v1/messages/count_tokens` 在 `direct` 和 `proxy` 模式下均剥离 URL 和 `generateContentRequest.model` 中的 `-high`。
   - 验证 `/v1/models/:model_id` 在查询带 `-high` 模型时向上游请求 `baseModel`。
2. 更新 `tests/geminiControllerThinkingDirect.test.ts`：
   - 验证 `/v1beta/models/*:generateContent` 及 `:streamGenerateContent` 在 `direct` 和 `proxy` 模式下均剥离 URL 中的 `-high` 并注入 `thinkingConfig: { thinkingLevel: 'HIGH' }`。
   - 验证 `/v1beta/models/*:countTokens` 在 `proxy` 模式下同样剥离 URL 与请求体中的 `-high` 且不注入 `thinkingConfig`。
3. 运行全量测试套件 `npm test` 确保无回归。

# 直连模式模型 -high 尾缀与 Gemini 3 思考等级转换设计规范 (Spec Document)

- **作者**: Claude Assistant & yatao
- **日期**: 2026-10-01
- **状态**: Approved / Ready for Implementation
- **分类**: Architectural Spec

---

## 1. 背景与目标

### 1.1 背景与痛点
1. **直连模式 404 问题**：在当前前端配置面板中，管理员可针对模型映射快捷切换 `-high` 尾缀（如将 `claude-3-7-sonnet` 映射至 `gemini-2.5-flash-high`），看板也会统计 high 规格请求。然而在直连模式（`serverType === 'direct'`，直连 Google 官方 `generativelanguage.googleapis.com`）下，Google 官方不存在带有 `-high` 尾缀的模型实体，直接请求该路径会导致上游返回 `404 Model Not Found`。
2. **思考配置演进（Gemini 3）**：Gemini 3 架构弃用了早期的 `thinkingBudget` 数值配置，改用更简洁的 `thinkingConfig: { thinkingLevel: 'HIGH' }` 枚举配置。
3. **职责分离与透传要求**：在第三方代理模式（`serverType === 'proxy'`）下应继续保持纯净透传，不强制篡改路径与请求体；而在直连官方模式下，需智能剥离 `-high` 尾缀并自动注入 `thinkingLevel: 'HIGH'`。

### 1.2 重构目标
1. **模型名称解构**：统一实现 `parseModelThinkingSuffix` 工具方法，智能识别 `-high` 尾缀并提取 `baseModel` 与 `thinkingLevel: 'HIGH'`。
2. **直连模式智能适配**：
   - 发送给 Google 官方的 URL 路径强制剥离 `-high` 尾缀（使用 `baseModel`）；
   - 请求体 `generationConfig.thinkingConfig` 自动注入 `{ thinkingLevel: 'HIGH' }`。
3. **双路由无缝支持**：
   - Claude 转换路由（`/v1/messages`、`/v1/messages/count_tokens`、`/v1/models/:model_id`）；
   - Gemini 原生路由（`/v1beta/models/...`）。
4. **调度准入增强**：`upstreamManager.hasUpstreamForModel` 自动兼容比对剥离后的 `baseModel`，直连节点白名单仅需配置基础模型名即可放行 `-high` 请求。
5. **看板与审计指标保真**：���易日志 `model` 字段继续保留客户端意图模型（带 `-high`），保证看板 High 规格统计、双色分布条和比例完全正常展示。

---

## 2. 核心架构与转换规则

### 2.1 模型解构规则 (`parseModelThinkingSuffix`)

在公共服务/工具层中导出：
```typescript
export interface ModelThinkingInfo {
  baseModel: string;
  isHigh: boolean;
  thinkingLevel?: 'HIGH';
}

export function parseModelThinkingSuffix(model: string): ModelThinkingInfo {
  const trimmed = String(model || '').trim();
  if (trimmed.toLowerCase().endsWith('-high')) {
    return {
      baseModel: trimmed.slice(0, -5),
      isHigh: true,
      thinkingLevel: 'HIGH'
    };
  }
  return {
    baseModel: trimmed,
    isHigh: false
  };
}
```

### 2.2 直连模式 vs 代理模式行为矩阵

| 模式 | 上游端点 URL 模型路径 | 请求体 `thinkingConfig` | 说明 |
| :--- | :--- | :--- | :--- |
| **直连模式 (`direct`)**<br>`isHigh === true` | **强制剥离 `-high`**<br>使用 `baseModel`（如 `gemini-2.5-flash`） | 注入 `{ thinkingLevel: 'HIGH' }`（合并既有属性） | 避免官方 404，启用官方高思考模式 |
| **直连模式 (`direct`)**<br>`isHigh === false` | 使用原模型名 | 不主动注入，保持客户端原有 `thinkingConfig` | 默认标准模式 |
| **代理模式 (`proxy`)** | 原样透传（保留 `-high`） | 原样透传，不强制注入 | 适配支持自定义 `-high` 别名的第三方反代网关 |

---

## 3. 双路由与调度详细设计

### 3.1 Claude 路由适配 (`claudeController.ts`)

1. **消息路由 (`/v1/messages`)**：
   - 经 `claudeTranslator.translateClaudeToGoogle` 获取 `cleanModelName`。
   - 通过 `upstreamManager.getUpstreamUrl` 获取 `serverSelection`。
   - 若 `serverSelection.serverType === 'direct'`：
     - 解析 `const thinkingInfo = parseModelThinkingSuffix(cleanModelName);`
     - 若 `thinkingInfo.isHigh` 为 `true`：
       - 上游请求路径使用 `thinkingInfo.baseModel` 代替 `cleanModelName`；
       - `googleRequest.generationConfig = googleRequest.generationConfig || {};`
       - `googleRequest.generationConfig.thinkingConfig = { ...(googleRequest.generationConfig.thinkingConfig || {}), thinkingLevel: 'HIGH' };`
2. **Token 计数路由 (`/v1/messages/count_tokens`)**：
   - 直连模式下若目标模型带 `-high`，剥离后使用 `baseModel` 向上游请求。
3. **模型详情路由 (`/v1/models/:model_id`)**：
   - 查询模型详情时若带 `-high`，��持映射与剥离兼容。

### 3.2 原生 Gemini 路由适配 (`geminiController.ts`)

1. **路径匹配与模型解析**：
   - 正则提取 `originalModel`，调用 `getModelMappingInfo` 获取 `targetModelName`。
2. **直连模式路径重写与参数注入**：
   - 若 `serverSelection.serverType === 'direct'`：
     - 解析 `const thinkingInfo = parseModelThinkingSuffix(targetModelName);`
     - 若 `thinkingInfo.isHigh` 为 `true`：
       - 将目标路径 `cleanPath` 中的 `models/${targetModelName}` 替换为 `models/${thinkingInfo.baseModel}`；
       - 若存在 `req.body`，针对其 `generationConfig` 注入：
         ```typescript
         clientReq.generationConfig = clientReq.generationConfig || {};
         clientReq.generationConfig.thinkingConfig = {
           ...(clientReq.generationConfig.thinkingConfig || {}),
           thinkingLevel: 'HIGH'
         };
         ```

### 3.3 节点准入调度增强 (`upstreamManager.ts`)

在 `hasUpstreamForModel(originalModel?: string, resolvedModel?: string)` 与 `getUpstreamUrl` 的模型白名单过滤中：
- 将比对候选集扩充为：
  `candidateModels = [originalModel, resolvedModel, parseModelThinkingSuffix(originalModel).baseModel, parseModelThinkingSuffix(resolvedModel).baseModel].filter(Boolean)`
- 节点配置 `allowedModels: ['gemini-2.5-flash']` 时，客户端发起 `gemini-2.5-flash-high` 亦能自动通过白名单检测。

---

## 4. 影响文件与测试方案

### 4.1 涉及文件
- `src/utils/modelHelpers.ts`：导出后端的 `parseModelThinkingSuffix`（或在 `src/proxy/services/claudeTranslator.ts` / 独立共享工具中定义）。
- `src/proxy/controllers/claudeController.ts`：在直连模式下重写模型路径并注入 `thinkingConfig`。
- `src/proxy/controllers/geminiController.ts`：在直连模式下替换 URL 中的模型名并注入 `req.body.generationConfig.thinkingConfig`。
- `src/utils/upstreamManager.ts`：白名单比对支持剥离后基准模型。
- `tests/modelThinkingSuffixDirect.test.ts`：新增专项全链路自动化回归测试。

### 4.2 验证标准
1. **单元测试通过**：`parseModelThinkingSuffix` 正确识别大小写 `-high` 并剥离基准模型。
2. **Claude 直连端点测试**：映射为 `-high` 模型时，上游收到去尾缀的官方路径并携带 `thinkingLevel: 'HIGH'`。
3. **Gemini 原生端点测试**：原生请求 `-high` 模型时，上游路径正确重写且请求体注入 `thinkingLevel: 'HIGH'`。
4. **代理模式兼容测试**：代理节点维持原样透传。
5. **全量回归无破坏**：全��测试套件 100% 通过，看板与日志模型指标统计无偏差。

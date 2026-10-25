# 行内 System 消息双模式统一包装与位置排序设计规格说明

**日期**：2026-10-25
**状态**：Approved / 待实现

---

## 1. 目标与核心规则

**直连模式（Direct Mode）与代理模式（Proxy Mode）对 `messages` 数组中的行内 `role: 'system'` 消息采用完全一致的转换规则**，由配置开关（`config.systemRoleToInstruction` / UI 开关 `USE_SYSTEM_CONTEXT_TAG`）统一控制：

| 开关状态 | 适用模式 | 包装标签格式 | 合流到 `user` 轮次时的内部顺序 |
| :--- | :--- | :--- | :--- |
| **默认关闭（`false`）** | 直连模式 & 代理模式 | `<system-reminder>\n{text}\n</system-reminder>` | **排在所有 `tool_result` 之后、普通文本之前**：<br>`1. 所有 tool_result 块` $\rightarrow$ `2. 所有 <system-reminder> 块` $\rightarrow$ `3. 普通文本及其他用户内容块` |
| **开关开启（`true`）** | 直连模式 & 代理模式 | `<system-context>\n{text}\n</system-context>`<br>（若配置了自定义 `runtimeContextTag` 则使用该标签） | **排在 `user` 消息的最前面（即 `tool_result` 之前，原有默认逻辑）**：<br>`1. 所有 <system-context> 块` $\rightarrow$ `2. 所有用户内容块（含 tool_result 与普通文本）` |

---

## 2. 详细设计

### 2.1 标签解析（`resolveInlineSystemTag`）
- 当 `config.systemRoleToInstruction === false`（默认关闭）时：
  - 若 `config.runtimeContextTag` 被显式设置为非 `'system-context'` 的自定义值（如单测动态注入的自定义标签），使用 `config.runtimeContextTag`；否则固定使用 `'system-reminder'`。
- 当 `config.systemRoleToInstruction === true`（开关开启）时：
  - 使用 `(config.runtimeContextTag || '').trim() || 'system-context'`。

### 2.2 代理模式（`translateClaudeToGoogle`）合流与排序
在 `translateClaudeToGoogle` 中，将连续的非 `assistant` 消息（`role: 'user'` 与 `role: 'system'`）合流为一个 `role: 'user'` 的 `GeminiContent` 轮次：
- `systemParts`：将 `role: 'system'` 消息内容经过 `cleanSystemContent()`（剥离 `x-anthropic-billing-header` 指纹）后，非空文本包装为 `{ text: \`<${tag}>\\n${cleaned}\\n</${tag}>\` }`。
- `userParts`：通过 `parseUserMessageParts(msg)` 解析出的 `GeminiPart[]`（其中 `tool_result` 被解析为带 `functionResponse` 属性的 Part，普通文本/图片等为普通 Part）。
- **刷新合流段（`flushUserSegment`）时的排序**：
  - **当 `config.systemRoleToInstruction === true`（开启开关，`<system-context>` 模式）**：
    - `combinedParts = sanitizeParts([...pendingUserSegment.systemParts, ...pendingUserSegment.userParts])`（`systemParts` 在最前面，位于 `functionResponse` 之前）。
  - **当 `config.systemRoleToInstruction === false`（默认关闭，`<system-reminder>` 模式）**：
    - 将 `pendingUserSegment.userParts` 拆分为两部分：
      - `toolResponseParts = pendingUserSegment.userParts.filter(p => Boolean(p.functionResponse))`
      - `normalUserParts = pendingUserSegment.userParts.filter(p => !p.functionResponse)`
    - `combinedParts = sanitizeParts([...toolResponseParts, ...pendingUserSegment.systemParts, ...normalUserParts])`（`systemParts` 排在所有 `functionResponse` 之后、普通文本之前）。

### 2.3 直连模式（`preprocessClaudeDirectRequest`）合流与排序
在 `preprocessClaudeDirectRequest` 中，完成 `filterEphemeralMessages` 后，**无论开关开启还是关闭**，始终对 `directRequest.messages` 中的行内 `role: 'system'` 消息执行包装与合流：
- 包裹标签：`const tag = this.resolveInlineSystemTag()`（默认 `'system-reminder'`，开启开关时 `'system-context'`）。
- **当某个用户轮次不存在任何 `systemBlocks` 且仅有 1 条原始 `user` 消息时**：直接保留该原始 `user` 消息（不改变其原本的字符串或数组 `content` 形态）。
- **当存在 `systemBlocks` 或多条连续非 `assistant` 消息需要合流时**：
  - **若 `config.systemRoleToInstruction === true`（开启开关，`<system-context>` 模式）**：
    - `content = [...systemBlocks, ...userBlocks]`（`<system-context>` 块排在最前面，即 `tool_result` 之前）。
  - **若 `config.systemRoleToInstruction === false`（默认关闭，`<system-reminder>` 模式）**：
    - 将 `userBlocks` 拆分为：
      - `toolResultBlocks = userBlocks.filter(b => b && typeof b === 'object' && b.type === 'tool_result')`
      - `normalUserBlocks = userBlocks.filter(b => !(b && typeof b === 'object' && b.type === 'tool_result'))`
    - `content = [...toolResultBlocks, ...systemBlocks, ...normalUserBlocks]`（`<system-reminder>` 块排在所有 `tool_result` 之后、普通文本之前）。

### 2.4 管理后台文案更新（`zh.ts`、`en.ts`）
- 更新 `systemRoleDesc` 说明文案：
  - 中文：`默认将消息数组中的 system 消息用 <system-reminder> 包裹并合流至 user 轮次（排在所有 tool_result 之后、普通文本之前）；开启后切换为使用 <system-context> 包裹并排在 user 消息最前面。`
  - 英文：`By default, wraps inline system messages with <system-reminder> and merges them into user turns after tool_result blocks and before normal text; enable to wrap with <system-context> at the very front of user messages.`

---

## 3. 测试验证点

1. **代理模式默认（开关 `false`）**：
   - 包含 `tool_result`、普通文本与 `role: 'system'` 的用户轮次，转换后 `contents[0].parts` 顺序为：`[functionResponse, <system-reminder>, normalText]`。
2. **代理模式开启开关（开关 `true`）**：
   - 包含 `tool_result`、普通文本与 `role: 'system'` 的用户轮次，转换后 `contents[0].parts` 顺序为：`[<system-context>, functionResponse, normalText]`。
3. **直连模式默认（开关 `false`）**：
   - 包含 `tool_result`、普通文本与 `role: 'system'` 的用户轮次，转换后 `messages[0].content` 顺序为：`[tool_result, <system-reminder>, normalText]`。
4. **直连模式开启开关（开关 `true`）**：
   - 包含 `tool_result`、普通文本与 `role: 'system'` 的用户轮次，转换后 `messages[0].content` 顺序为：`[<system-context>, tool_result, normalText]`。

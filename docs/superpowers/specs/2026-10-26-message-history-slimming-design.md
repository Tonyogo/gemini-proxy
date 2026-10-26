# Claude `/v1/messages` 请求历史消息瘦身（清理旧回合 `thinking` 块）设计规格说明

**日期**：2026-10-26
**状态**：Approved

---

## 1. 背景与目标

在多轮对话及高频工具调用（Tool Use Loop）场景下，Claude 客户端（如 Claude Code CLI）会将历史所有回合的 `thinking` 与 `redacted_thinking` 内容块（含庞大的 `signature` 字段）随 `/v1/messages` 请求体完整重发。
这些历史已完成回合的思考过程不仅大幅膨胀了请求体积、增加上游 Token 消耗与网络传输开销，在跨协议转换时也毫无必要。与此同时，**当前正在进行的工具调用循环（最后一个真实 User Turn 之后）** 中的 `thinking` 块及 `signature` 必须严格保留，否则会触发上游 API 的签名校验错误。

本设计在 `ClaudeTranslator` 中实现统一的历史消息瘦身预处理逻辑，同时作用于 **Gemini 翻译模式（`translateClaudeToGoogle`）** 与 **Direct 直连模式（`preprocessClaudeDirectRequest`）**。

---

## 2. 核心逻辑与边界条件

### 2.1 寻找分界点（最后一个真实 User Turn：`lastHumanIndex`）

新增公开方法 `findLastHumanTurnIndex(messages: ClaudeMessage[]): number`：
- 倒序遍历 `messages`（从 `messages.length - 1` 到 `0`）。
- 找到第一个满足 `msg && msg.role === 'user'` 且符合以下任一条件的消息索引作为 `lastHumanIndex`：
  1. `typeof msg.content === 'string'`（纯字符串内容）；
  2. `Array.isArray(msg.content)`，且数组中包含至少一个非 `tool_result` 的有效内容块：`typeof block === 'string' || (block && typeof block === 'object' && block.type !== 'tool_result')`（例如 `type === 'text'`、`type === 'image'`、`type === 'document'` 等）。
- 若某条 `role === 'user'` 消息的 `content` 数组仅包含 `type === 'tool_result'` 块（或为空数组 `[]`），说明它属于当前正在进行的工具调用循环，**不作为分界点**。
- 若遍历结束未找到满足条件的真实 User Turn，返回 `-1`。

### 2.2 清理旧回合 `thinking` 块与保留当前回合

新增公开方法 `slimHistoricalMessages(messages: ClaudeMessage[]): ClaudeMessage[]`：
- **不可变性保证（Immutability）**：对输入数组及内部消息对象执行深拷贝或仅在副本上修改，严禁破坏调用方传入的原始 `claudeBody` 或 `messages` 对象引用。
- 当 `!Array.isArray(messages) || messages.length === 0` 时，返回空数组 `[]`。
- 计算 `const lastHumanIndex = this.findLastHumanTurnIndex(messages)`：
  - 若 `lastHumanIndex <= 0`，说明不存在任何早于 `lastHumanIndex` 的历史消息，直接返回深拷贝后的消息数组副本。
- 遍历克隆后的消息列表：
  - **历史已完成回合（`index < lastHumanIndex`）**：
    - 对于所有 `msg.role === 'assistant'` 且 `Array.isArray(msg.content)` 的消息：
      - 过滤移除所有 `block && typeof block === 'object' && (block.type === 'thinking' || block.type === 'redacted_thinking')` 的块（连同块内的 `thinking`、`data`、`signature` 等字段一并移除）。
      - **空数组兜底安全处理**：若过滤后 `content` 数组变为空数组 `[]`，将其替换为占位文本块 `[{ type: 'text', text: '...' }]`，防止触发上游协议“消息 content 不能为空”的 `400 Bad Request` 错误。
  - **分界点及当前未结束回合（`index >= lastHumanIndex`）**：
    - 对于 `index > lastHumanIndex` 的所有 `msg.role === 'assistant'` 消息（处于当前未结束的工具调用循环中）：**完整保留** `thinking` 与 `redacted_thinking` 块及其 `signature` 字段，不做任何删改。

### 2.3 链路接入与当前回合 `thinking` 的 Gemini 协议转换

1. **Direct 直连模式（`preprocessClaudeDirectRequest`）**：
   - 在 `this.filterEphemeralMessages(directRequest.messages)` 之后、内联 `system` 消息转换之前，调用 `directRequest.messages = this.slimHistoricalMessages(directRequest.messages)`。
2. **Gemini 翻译模式（`translateClaudeToGoogle`）**：
   - 在 `this.filterEphemeralMessages(claudeBody.messages)` 之后调用 `this.slimHistoricalMessages(...)`。
   - 在 `parseUserMessageParts` 中新增对 `block.type === 'thinking'` 的转换支持（此时仅 `index > lastHumanIndex` 的当前回合 `assistant` 消息仍保有该块）：
     ```ts
     {
       thought: true,
       text: typeof block.thinking === 'string' ? block.thinking : '',
       ...(typeof block.signature === 'string' && block.signature !== '' ? { thoughtSignature: block.signature } : {})
     }
     ```
   - 在 `sanitizeParts` 中保留包含 `thought: true` 或 `thoughtSignature` 的 Part，避免被空文本清理逻辑误删。

---

## 3. 类型定义更新（`src/types/index.ts`）

- 新增 Claude 内容块接口定义：
  - `ClaudeTextBlock`（`{ type: 'text'; text: string; [key: string]: any }`）
  - `ClaudeThinkingBlock`（`{ type: 'thinking'; thinking: string; signature?: string; [key: string]: any }`）
  - `ClaudeRedactedThinkingBlock`（`{ type: 'redacted_thinking'; data: string; [key: string]: any }`）
  - `ClaudeToolUseBlock`（`{ type: 'tool_use'; id: string; name: string; input: Record<string, any>; [key: string]: any }`）
  - `ClaudeToolResultBlock`（`{ type: 'tool_result'; tool_use_id: string; content?: string | any[]; is_error?: boolean; [key: string]: any }`）
  - `ClaudeContentBlock` 联合类型，并在 `ClaudeMessage.content` 中支持 `string | ClaudeContentBlock[] | any[]`。
- 在 `GeminiPart` 接口中新增可选字段 `thought?: boolean;`。

---

## 4. 测试验证范围（`tests/claudeTranslator.test.ts`）

1. **`findLastHumanTurnIndex` 边界测试**：
   - 纯字符串 `user` 消息识别；
   - 含 `text` / `image` + `tool_result` 混合数组的 `user` 消息识别为真实 User Turn；
   - 仅含 `tool_result` 的 `user` 消息被跳过，定位到其前方最近的真实 User Turn；
   - 全部 `user` 消息均为纯 `tool_result` 或空数组时返回 `-1`。
2. **历史回合清理与当前回合保留测试**：
   - `index < lastHumanIndex` 的 `assistant` 消息中 `thinking` 与 `redacted_thinking`（含 `signature`）被完全剔除，同消息内的 `text` / `tool_use` 块正常保留；
   - `index > lastHumanIndex` 的 `assistant` 消息中 `thinking`、`redacted_thinking` 及 `signature` 在 Direct 模式与 Gemini 翻译模式下均完整保留。
3. **空内容兜底与引用隔离测试**：
   - 历史 `assistant` 消息仅含 `thinking` / `redacted_thinking` 块时，过滤后自动填充 `[{ type: 'text', text: '...' }]`；
   - 调用 `slimHistoricalMessages`、`preprocessClaudeDirectRequest`、`translateClaudeToGoogle` 后，原始入参对象深层结构与引用完全不变。

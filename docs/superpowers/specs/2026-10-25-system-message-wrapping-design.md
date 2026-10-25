# 消息内 System 角色包裹策略与开关重构设计规格说明

**日期**：2026-10-25
**状态**：Draft / 待审阅

---

## 1. 背景与目标

### 1.1 现状
目前系统中存在 `SYSTEM_ROLE_TO_INSTRUCTION`（`config.systemRoleToInstruction`）开关：
- 当开启（`true`）时，在代理模式（`translateClaudeToGoogle`）下会将 `messages` 数组中的 inline `role: 'system'` 消息提取并去重合并到 Gemini 顶层的 `systemInstruction` 中；
- 当关闭（`false`，默认）时，会将 `messages` 中的 `role: 'system'` 消息使用 `<system-context>`（`config.runtimeContextTag`）包裹，并合并到相邻的 `role: 'user'` 消息段中；
- 而在直连模式（`preprocessClaudeDirectRequest`）下，始终不处理 `messages` 中的 `role: 'system'` 消息。

### 1.2 重构目标
1. **彻底移除“系统角色转系统提示词”功能**：移除原有的将 `messages` 内 `role: 'system'` 提取并合并到顶层 `systemInstruction` 的逻辑（含去重提取分支）。
2. **替换配置开关**：将原开关改造为控制 `messages` 内 `role: 'system'` 包裹策略的开关（默认关闭 `false`）。
3. **双模式差异化行为**：

| 运行模式 | 开关关闭（默认 `false`） | 开关开启（`true`） |
| :--- | :--- | :--- |
| **代理模式（Proxy Mode）** | 默认将 `messages` 中的 `role: 'system'` 消息使用 `<system-reminder>\n...\n</system-reminder>` 包裹，并按分段合并逻辑合入 `user` 消息（`systemParts` 在前，`userParts` 在后） | 将 `messages` 中的 `role: 'system'` 消息使用 `<system-context>\n...\n</system-context>`（或自定义 `runtimeContextTag`）包裹，并合入 `user` 消息 |
| **直连模式（Direct Mode）** | **默认不转换**：保留 `messages` 中的 `role: 'system'` 消息原样不动 | **强制转换**：将 `messages` 中的 `role: 'system'` 消息使用 `<system-context>\n...\n</system-context>`（或自定义 `runtimeContextTag`）包裹，并按与代理模式一致的分段合并逻辑合入 `role: 'user'` 消息中 |

---

## 2. 配置项与接口设计

### 2.1 配置字段与环境变量兼容性
为保持现有 API / 配置文件 / 环境变量的平滑过渡，同时直观表达开关语义：
- 在 `config/default.ts` 中，将开关布尔值默认设为 `false`：
  - 保留属性名 `systemRoleToInstruction` 的向后兼容读写或统一映射（或使用 `useSystemContextTag` 并兼容 `systemRoleToInstruction` 请求字段，确保已有测试及客户端调用不中断）。
  - 为避免破坏现有的 `/api/admin/status`、`/api/admin/config` 字段契约与持久化结构，配置键名可继续沿用 `systemRoleToInstruction`（或在 `config` 中同时支持 `useSystemContextTag` 与 `systemRoleToInstruction` 同步读写，默认值为 `false`），前端界面与文案更新为 `<system-context>` 包裹切换开关。
  - `config.runtimeContextTag` 默认值保持为 `'system-context'`（当且仅当开关开启时使用 `config.runtimeContextTag || 'system-context'`；当开关关闭时，代理模式固定使用 `'system-reminder'`，除非用户在单测或运行期显式修改了 `runtimeContextTag` 为非 `'system-context'` 的自定义值时按需兼容）。

> **标签解析规则**：
> - 当开关关闭（`false`，默认）：
>   - 若 `config.runtimeContextTag` 被显式设为了非默认的自定义值（即既不是 `'system-context'` 也不是 `'system-reminder'` 且非空），则在代理模式下使用 `config.runtimeContextTag`，否则使用 `'system-reminder'`。
> - 当开关开启（`true`）：
>   - 代理模式与直连模式均使用 `config.runtimeContextTag || 'system-context'`（默认即 `'system-context'`）。

---

## 3. 核心模块详细设计

### 3.1 代理模式转换逻辑（`claudeTranslator.translateClaudeToGoogle`）

1. **移除提取到 `systemInstruction` 的逻辑**：
   - 删除 `if (config.systemRoleToInstruction)` 下调用 `this.deduplicateSystemMessages(inputMessages)` 并 `appendSystemContent(sysMsg.content)` 的代码块。
   - 删除消息遍历循环中 `if (msg.role === 'system') { if (config.systemRoleToInstruction) continue; ... }` 的跳过分支，使所有 `inputMessages` 中的 `role: 'system'` 消息始终进入 `pendingUserSegment.systemParts` 包裹流程。
2. **包裹标签决定**：
   - 当开关为 `false`（默认）时，包裹标签为 `'system-reminder'`（若 `config.runtimeContextTag` 被自定义为非 `'system-context'` 的其他值则优先使用该自定义值）。
   - 当开关为 `true` 时，包裹标签为 `config.runtimeContextTag || 'system-context'`。
3. **包裹与分段合并**：
   - `wrapSystemMessageContent(msg.content)` 先对文本执行 `this.cleanSystemContent()`（清理 `x-anthropic-billing-header` 指纹），非空内容包裹为 `<${tag}>\n${cleaned}\n</${tag}>`。
   - 同一用户轮次（遇到 `assistant` 之前）内，所有 `systemParts` 排在 `userParts` 之前，刷入 `contents` 作为 `role: 'user'`。

### 3.2 直连模式前置处理逻辑（`claudeTranslator.preprocessClaudeDirectRequest`）

1. **开关关闭（默认 `false`）**：
   - 保持现有行为不变：仅对 `directRequest.messages` 执行 `filterEphemeralMessages`，**不对** `messages` 内的 `role: 'system'` 做任何包裹或角色转换。
2. **开关开启（`true`）**：
   - 在执行完 `filterEphemeralMessages` 后，对 `directRequest.messages` 执行强制包裹与分段合并：
   - 包裹标签使用 `const tag = config.runtimeContextTag || 'system-context'`。
   - 定义 `wrapDirectSystemBlocks(content: any): any[]`：
     - 若 `typeof content === 'string'`：调用 `this.cleanSystemContent(content)`，若非空则返回 `[{ type: 'text', text: \`<${tag}>\\n${cleaned}\\n</${tag}>\` }]`。
     - 若 `Array.isArray(content)`：遍历每个块，若为文本块（`typeof block === 'string'` 或 `block?.type === 'text'` 或 `typeof block?.text === 'string'`），提取文本并经 `this.cleanSystemContent()` 清洗后返回 `{ type: 'text', text: \`<${tag}>\\n${cleaned}\\n</${tag}>\` }`；其他非文本块原样保留。
   - 定义 `normalizeDirectUserBlocks(content: any): any[]`：
     - 若 `typeof content === 'string'`：非空时返回 `[{ type: 'text', text: content }]`，空字符串返回 `[]`。
     - 若 `Array.isArray(content)`：过滤掉无效空块后返回数组副本。
   - **分段合并算法（与代理模式一致）**：
     - 维护 `pendingUserSegment: { systemBlocks: any[]; userBlocks: any[] } | null = null`。
     - 遍历 `directRequest.messages`：
       - 若 `msg.role === 'assistant'`：先 `flushUserSegment()`，然后将该 `assistant` 消息推入结果数组。
       - 若 `msg.role === 'system'`：初始化 `pendingUserSegment`（若为空），将 `wrapDirectSystemBlocks(msg.content)` 推入 `pendingUserSegment.systemBlocks`。
       - 其他（`msg.role === 'user'`）：
         - 若当前这轮没有收集到任何 `systemBlocks` 且该 `user` 消息原本就是纯字符串且后续也没有同段 `system` 消息，或者统一合并：为了在无需合并时尽量保留原始 `user` 消息结构，若 `pendingUserSegment` 中存在 `systemBlocks` 或存在多条连续 `user`/`system` 消息，则将 `[...systemBlocks, ...userBlocks]` 作为 `role: 'user'` 的 `content` 数组输出；若某用户段仅含单条 `role: 'user'` 消息且无 `systemBlocks`，则保留该 `user` 消息原始 `content` 格式（字符串或数组）。
     - 最后对相邻的 `role: 'user'` 消息执行同角色合并（若相邻两条均为 `role: 'user'`，将其 `content` 归一化为数组后拼接）。

---

## 4. 前端配置界面与仪表盘更新

1. **`frontend/src/components/ConfigModal.tsx`**：
   - 在「指令（Instructions）」标签页中，将原有的 `SYSTEM_ROLE_TO_INSTRUCTION` 开关项标题与说明更新为包裹策略开关（例如显示 `SYSTEM_CONTEXT_TAG_WRAP` / `使用 <system-context> 包裹行内系统消息`），说明文案更新为：
     - 中文：`默认将消息数组中的 system 消息用 <system-reminder> 包裹（直连模式默认不转换）；开启后统一强制使用 <system-context> 包裹并合入 user 消息。`
     - 英文：`By default, inline system messages are wrapped with <system-reminder> in Proxy mode (untouched in Direct mode). Enable to force <system-context> wrapping across both modes.`
2. **`frontend/src/components/dashboard/SystemRuntimeMatrix.tsx`**：
   - 将矩阵卡片中的状态文案从 `'TRUE (INJECT)' : 'FALSE (INLINE)'` 更新为 `'TRUE (<system-context>)' : 'FALSE (<system-reminder>)'`（默认读取 `Boolean(config?.systemRoleToInstruction)`，修正原先 `!== false` 导致默认显示 `TRUE` 的偏差）。

---

## 5. 测试策略

1. **`tests/claudeTranslator.test.ts`**：
   - 验证代理模式默认（开关 `false`）将 `messages` 中的 `role: 'system'` 用 `<system-reminder>\n...\n</system-reminder>` 包裹并合并到 `role: 'user'`（`systemParts` 在 `userParts` 之前）。
   - 验证代理模式开启开关（`true`）时，将 `messages` 中的 `role: 'system'` 用 `<system-context>\n...\n</system-context>` 包裹并合并到 `role: 'user'`，且**不会**注入到顶层 `systemInstruction`。
   - 验证直连模式默认（开关 `false`）保留 `messages` 中的 `role: 'system'` 原样不转换。
   - 验证直连模式开启开关（`true`）时，将 `messages` 中的 `role: 'system'` 强制用 `<system-context>\n...\n</system-context>` 包裹并合并到 `role: 'user'` 消息中（`systemBlocks` 在 `userBlocks` 之前）。
   - 更新原有依赖默认 `<system-context>` 或旧版 `SYSTEM_ROLE_TO_INSTRUCTION` 提取到 `systemInstruction` 的断言。
2. **全量回归验证**：
   - 运行全量测试与前后端构建，确保零回归。

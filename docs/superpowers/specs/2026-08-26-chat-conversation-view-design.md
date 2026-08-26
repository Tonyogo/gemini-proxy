# 对话回放视图 (Chat Conversation View) 设计规范

## 1. 概述 (Overview)

在现有 `LogsView`（请求日志与 Inspector 界面）中新增「💬 对话视图 (Chat)」Tab，用于将底层的 Claude Messages API 结构化 Payload 与流式/非流式响应还原为类似 Claude 官方客户端或 VS Code Copilot 风格的交互式聊天记录页面。

此功能使用户无需在复杂的 JSON 嵌套树或 SSE 事件流中人工拼接对话上下文，即可直观阅读历史问答、系统提示词、Thinking 深度思考链、工具调用 (`tool_use`)、工具执行结果 (`tool_result`) 以及多模态附件。

---

## 2. 界面与交互设计 (UI & UX)

### 2.1 入口与 Tab 集成
- 在 `LogsView.tsx` 右侧详情区域的 Subtabs 导航中增加第 3 个 Tab：
  - `📤 请求数据 (Payload)`
  - `📥 响应数据 (Response)`
  - `💬 对话视图 (Chat)`
- 当选中 `Chat` Tab 时，隐藏 JSON Tree / Monaco 编辑器，渲染全新的 `<ConversationView log={selectedLog} />` 组件。
- 保留顶部 Metadata 汇总横幅（Status, Path, Model, Stream, Latency, Timestamp）以及 cURL / JSON 快捷复制按钮。

### 2.2 对话流排版架构
1. **System Prompt 折叠卡片（顶部）**：
   - 如果请求中包含 `system` 字段（字符串或数组），渲染为可折叠面板（默认收起或精简展示前两行），带紫盾小图标。
   - 展开后完整显示 System 提示词，支持 Markdown 渲染或预格式化代码块与复制。
2. **多轮历史消息流 (Historical Messages)**：
   - 依次遍历 `client_req.messages` 数组。
   - **用户消息气泡 (User Bubble)**：
     - 右侧/偏右对齐，采用靛蓝主题（`bg-indigo-950/40 border-indigo-500/30`），带 User 头像徽标。
     - 文本内容经 Markdown 渲染。
     - 图片附件（base64 或 url）渲染为可缩放预览图。
     - 工具执行结果（`type: 'tool_result'`）以工具结果卡片内联显示。
   - **历史助手消息气泡 (Assistant Bubble)**：
     - 左侧对齐，采用深石板灰主题（`bg-slate-900/80 border-slate-800`），带 Claude / Sparkles 图标。
     - 包含历史轮次中的 Thinking 思考过程、文本回复与 Tool Call。
3. **本次响应助手气泡 (Current Turn Assistant Response)**：
   - 自动挂载在多轮消息流的末尾。
   - 支持解析非流式 `claude_res`（单个响应对象）或流式 `claude_res`（SSE chunk 事件数组）。
   - **Thinking 思考过程**：
     - 琥珀色/紫色高亮折叠块，标明字符数（如 `思考过程 (2,450 字符)`），点击展开/收起。
   - **Markdown 文本回复**：
     - 支持标准 Markdown（表格、列表、引用、粗斜体），代码块带有语言标头、语法高亮与一键复制按钮。
   - **Tool Use 工具调用卡片**：
     - 深色代码卡片，头部标注 `⚙️ Tool Call: {name}`，参数为格式化的 JSON 参数树，支持一键复制代码。
4. **空状态与异常处理**：
   - 若日志不是 `/v1/messages` 类型或没有消息，展示优雅的空状态提示（例如：“当前请求未包含对话消息上下文”）。

---

## 3. 组件划分与数据流 (Components & Data Flow)

### 3.1 组件结构
- `frontend/src/components/ConversationView.tsx`（主组件）：
  - 提取 `system`、解析 `messages` 历史列表、解析提取 `claude_res`。
- `frontend/src/components/chat/MessageBubble.tsx`（消息气泡）：
  - 渲染单条用户或助手消息。
- `frontend/src/components/chat/ThinkingBlock.tsx`（思考链展开块）：
  - 处理 thinking 文本折叠与字符统计。
- `frontend/src/components/chat/ToolCallCard.tsx`（工具调用与返回结果卡片）：
  - 格式化渲染 `tool_use` 和 `tool_result`。
- `frontend/src/components/chat/MarkdownContent.tsx`（Markdown 渲染与代码高亮）：
  - 使用 `react-markdown` + `remark-gfm` 解析，支持表格、代码块语法高亮与复制。

### 3.2 依赖管理
- 在 `frontend/package.json` 中引入：
  - `react-markdown`: Markdown 解析与渲染。
  - `remark-gfm`: 支持 GFM 规范（表格、删除线、任务列表）。

---

## 4. 国际化 (i18n)

在 `frontend/src/i18n/locales/zh.ts` 和 `en.ts` 中添加词条：
- `logs.chatTab`: `"💬 对话视图"` / `"💬 Chat View"`
- `logs.systemPrompt`: `"系统提示词 (System Prompt)"` / `"System Prompt"`
- `logs.thinking`: `"思考过程"` / `"Thinking Process"`
- `logs.toolCall`: `"工具调用"` / `"Tool Call"`
- `logs.toolResult`: `"工具返回"` / `"Tool Result"`
- `logs.noMessages`: `"此日志不包含对话消息。"` / `"No conversation messages in this log."`
- `logs.copyMessage`: `"复制消息"` / `"Copy Message"`
- `logs.copied`: `"已复制！"` / `"Copied!"`

---

## 5. 测试与验证 (Verification)

1. **前端编译验证**：执行 `npm run build:frontend` 确保 TypeScript 类型与 Vite 构建零报错。
2. **全栈构建与测试**：执行 `npm test` 与 `npm run build` 确保现有代理功能与后端接口不受影响。
3. **真实请求日志回放测试**：
   - 验证包含多轮 user/assistant 对话的日志正确渲染为多气泡。
   - 验证包含 `thinking` 块的请求能够正确折叠/展开。
   - 验证包含 `tool_use` / `tool_result` 的请求卡片正常高亮与参数格式化。
   - 验证流式 SSE 与非流式 JSON 响应均能正确提取并拼接为最新的助手回复。

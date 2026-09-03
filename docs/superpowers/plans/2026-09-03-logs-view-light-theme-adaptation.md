# 请求日志页面与全部 Tab 预览视图深浅双主题彻底适配实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底消除请求日志页面（`LogsView`）及其子组件（`JsonTreeView`、`SseStreamPreview`、`ConversationView`、`MessageBubble`、`ToolCallCard`）在 Light 浅色模式下的所有硬编码深黑框与高对比度缺陷，实现专业、高雅、纯正的深浅双主题体验。

**Architecture:**
1. **列表项（List Items）语义化**：优化 `LogsView.tsx` 左侧列表项中的 `POST` 徽标、时间戳、文件名与请求耗时，使其在 Light 模式下呈现柔和中性浅底高对比度文字，去除生硬黑块。
2. **预览模式结构化树（JsonTreeView）主题化**：重构 `JsonTreeView.tsx` 的主容器、顶栏工具栏、展开/折叠按键、节点 Hover 效果及语法高亮（键名、字符串、数字、布尔值），使其完美适配浅色模式背景。
3. **SSE 流式装配预览（SseStreamPreview）主题化**：全面替换 `SseStreamPreview.tsx` 中的 `bg-slate-950`、`border-slate-800` 和深绿脏斑底色，使用 `ui-card-sub` 和 `var(--code-bg)`。
4. **对话视图（ConversationView / MessageBubble / ToolCallCard）主题化**：优化气泡背景、System Prompt 内容框与工具调用展开卡片，适配深浅双色。
5. **自动化测试断言**：编写测试用例验证 `JsonTreeView`、`SseStreamPreview`、`LogsView` 彻底移除硬编码暗黑样式类，并确保全量测试通过。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Monaco Editor, Jest, Vite.

## Global Constraints
- 保证浅色模式下所有容器、代码高亮、文字具有极佳的可读性，严禁出现深黑大框突兀放置在白底上的情况。
- 保证深色模式下的原有质感不受任何负面影响。
- 构建 `npm run build:frontend` 与测试 `npm test` 保持 100% 通过。

---

### Task 1: 改造 LogsView 左侧请求列表项的 POST 徽标、时间戳与状态配色

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:540-645`

**Interfaces:**
- Consumes: `log: TransactionLogItem`, `isSelected: boolean`
- Produces: 响应式浅色高对比度列表项排版

- [x] **Step 1: 检查 LogsView.tsx 列表项代码结构**
- [x] **Step 2: 改造列表项及徽标配色**
- [x] **Step 3: 运行前端构建验证**
- [x] **Step 4: 提交 Task 1 代码**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(logs): adapt log list items, method badges, and status colors to light theme"
```

---

### Task 2: 改造 JsonTreeView 预览模式结构化树的主题适配

**Files:**
- Modify: `frontend/src/components/JsonTreeView.tsx:25-115, 195-235`

**Interfaces:**
- Consumes: `JsonNodeProps`, `data: any`
- Produces: 支持纯净浅色背景与高对比度语法高亮的 JSON 结构化树

- [x] **Step 1: 检查 JsonTreeView.tsx 主容器与语法高亮**
- [x] **Step 2: 改造容器背景与语法高亮调色盘**
- [x] **Step 3: 运行前端构建验证**
- [x] **Step 4: 提交 Task 2 代码**

```bash
git add frontend/src/components/JsonTreeView.tsx
git commit -m "feat(logs): adapt JsonTreeView container, toolbar, and syntax highlight to light theme"
```

---

### Task 3: 改造 SseStreamPreview 流式响应与 ConversationView 对话视图

**Files:**
- Modify: `frontend/src/components/SseStreamPreview.tsx:280-460`
- Modify: `frontend/src/components/ConversationView.tsx:100-145`
- Modify: `frontend/src/components/chat/MessageBubble.tsx:80-90`
- Modify: `frontend/src/components/chat/ToolCallCard.tsx:30-80`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-card-sub`, `var(--code-bg)`, `var(--code-text)`
- Produces: 彻底消除 SSE 装配与聊天气泡中的残留黑底

- [x] **Step 1: 改造 SseStreamPreview.tsx 中的写死暗黑块**
- [x] **Step 2: 改造 ConversationView.tsx, MessageBubble.tsx, ToolCallCard.tsx**
- [x] **Step 3: 运行前端构建验证**
- [x] **Step 4: 提交 Task 3 代码**

```bash
git add frontend/src/components/SseStreamPreview.tsx frontend/src/components/ConversationView.tsx frontend/src/components/chat/MessageBubble.tsx frontend/src/components/chat/ToolCallCard.tsx
git commit -m "feat(logs): adapt SseStreamPreview, ConversationView, and chat bubbles to light theme"
```

---

### Task 4: 编写请求日志页面无深黑框自动化断言测试与全量构建回归

**Files:**
- Create: `tests/logsViewThemeRefinement.test.ts`

- [x] **Step 1: 编写断言测试**
- [x] **Step 2: 运行测试验证**
- [x] **Step 3: 运行全量测试套件与全量前后端构建**
- [x] **Step 4: 提交测试代码**

```bash
git add tests/logsViewThemeRefinement.test.ts
git commit -m "test(logs): add assertions for logs view and preview modes light theme adaptation"
```

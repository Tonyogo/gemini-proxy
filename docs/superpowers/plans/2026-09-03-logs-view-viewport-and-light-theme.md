# 请求日志视口高度自适应与浅色主题黑框消除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决请求日志 (LogsView) 页面高度超出屏幕产生外层全局滚动条的问题，使其对齐 API 调试器 (PlaygroundView) 的视口自适应标准；并全面消除 Light 主题下详情信息条、分页控件及 Chat 对话视图中的硬编码黑框。

**Architecture:** 
- 布局改造：在 `LogsView.tsx` 中去除固定高度（`h-[520px]`）与 `min-h-[600px]/min-h-[500px]` 限制，对齐 `PlaygroundView` 采用 `min-h-0 h-full md:h-[calc(100dvh-6.5rem)] overflow-hidden`，让左侧列表与右侧详情容器均具备独立的 `min-h-0 flex-1 overflow-y-auto` 滚动区。
- 主题美化：将详情面板顶部 Metadata 标签替换为双主题自适应浅灰框；底部分页 `<select>` 改用 `bg-[var(--bg-surface)]`，翻页按钮改用 `ui-btn-secondary`；Chat Tab 中的代码块、表格与思考展开区改用设计系统 CSS 语义变量。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Vite, Jest.

## Global Constraints

- **Strict TypeScript & Clean Build**: 前端编译 `npm run build:frontend` 必须 0 错误、0 告警通过。
- **Zero Global Scroll**: 严格禁止页面外层出现纵向滚动条，左右分栏必须在各自容器内独立滚动。
- **Theme Cohesion**: 浅色模式下不得出现未加 `dark:` 前缀的深色底框（如 `bg-slate-900`, `bg-slate-950`, `border-slate-800`）。
- **TDD Regression Suite**: 针对修改的组件编写静态 AST/样式断言测试，运行全量测试套件确保无破坏。

---

### Task 1: 编写布局与主题样式断言测试 (TDD)

**Files:**
- Modify: `tests/logsViewThemeRefinement.test.ts:1-33`

**Interfaces:**
- Consumes: `LogsView.tsx`, `chat/MarkdownContent.tsx`, `chat/ThinkingBlock.tsx`
- Produces: 自动化断言规则，确保不出现撑破视口属性和黑框类名。

- [x] **Step 1: 编写失败测试**
- [x] **Step 2: 运行测试并确认失败**
- [x] **Step 3: 提交测试用例**

```bash
git add tests/logsViewThemeRefinement.test.ts
git commit -m "test(logs): add assertions for viewport bounds and light theme black box elimination"
```

---

### Task 2: 重构 LogsView 视口布局与消除黑框 (LogsView Viewport & Colors)

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:358-375,645-695,860-915`

**Interfaces:**
- Consumes: `ui-card`, `ui-btn-secondary`, `bg-[var(--bg-surface)]`, `border-[var(--border-subtle)]`
- Produces: 严格视口自适应的工作台，消除外层滚动；清爽无黑框的信息条与分页控件。

- [x] **Step 1: 修改 LogsView 容器布局 (消除撑屏与外层滚动)**
- [x] **Step 2: 消除分页控件中的黑框**
- [x] **Step 3: 消除详情顶部 Metadata 中的黑框**
- [x] **Step 4: 运行前端构建验证**
- [x] **Step 5: 提交 LogsView 改动**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(logs): adapt logs view to strict viewport bounds and eliminate dark metadata and pagination boxes"
```

---

### Task 3: ChatTab 对话视图去黑框与语义化 Token 适配 (Chat Components Refinement)

**Files:**
- Modify: `frontend/src/components/chat/MarkdownContent.tsx:30-40,70-75`
- Modify: `frontend/src/components/chat/ThinkingBlock.tsx:50-57`

**Interfaces:**
- Consumes: `--code-bg`, `--code-text`, `--bg-surface-sub`, `--border-subtle`
- Produces: 浅色主题下无黑框的聊天对话 Markdown 内容渲染。

- [x] **Step 1: 优化 MarkdownContent 中的表格与代码块**
- [x] **Step 2: 优化 ThinkingBlock 展开折叠区背景**
- [x] **Step 3: 运行测试验证**
- [x] **Step 4: 运行前端构建验证**
- [x] **Step 5: 提交 ChatTab 改动**

```bash
git add frontend/src/components/chat/MarkdownContent.tsx frontend/src/components/chat/ThinkingBlock.tsx
git commit -m "feat(chat): adapt codeblocks, tables, and thinking blocks to light theme variables"
```

---

### Task 4: 全量回归测试与端到端验证 (Full Verification)

**Files:**
- None (执行全面验证)

- [x] **Step 1: 运行全量 Jest 测试套件**
- [x] **Step 2: 运行全量项目构建**

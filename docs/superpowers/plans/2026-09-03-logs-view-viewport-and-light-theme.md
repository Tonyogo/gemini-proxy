# 请求日志视口自适应与浅色主题黑框消除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决请求日志 (LogsView) 页面列表与详情向下无限撑长产生页面全局滚动条的问题，完全对齐翻译工作台 (TranslateView) 的组件内视口闭环与自适应滚动机制；并修复 Light 主题下硬编码黑框及代码评审中发现的优化点。

**Architecture:** 
- 布局改造（对齐 TranslateView）：在 `LogsView.tsx` 中将左侧列表和右侧详情分别设置为 `h-full flex flex-col min-h-0 overflow-hidden`，左侧列表条目区设为 `flex-1 min-h-0 overflow-y-auto`（分页栏 `shrink-0` 固定在底端）；将 `JsonTreeView.tsx` 改造为 `h-full flex-1 min-h-0 flex flex-col overflow-hidden`，内部 JSON 节点视口设为 `flex-1 min-h-0 overflow-auto`，阻断无限向下撑破容器高度；`SseStreamPreview` 与 `ConversationView` 在详情区内自适应滚动。
- 主题与细节修复：消除详情 Metadata 标签、分页栏下拉框及 ChatTab 代码块/思考展开区的深色硬编码；修复 `ConcurrentTestModal` 缺少 `x-admin-key`、`buildUpstreamHeaders` Authorization 大小写不敏感校验，以及 `ThinkingBlock` 的 `py-0.2` 类名问题。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Vite, Jest.

## Global Constraints

- **Non-Invasive Page Layout**: 保持全局外层容器自适应，不锁死 `App.tsx`（确保账号管理 AccountsView 等长列表视图仍能随内容自然延展）。
- **Strict Viewport Containment**: 请求日志组件内部必须做到 100% 视口闭环，所有长列表与大 JSON 树仅在自身分栏内独立垂直滚动。
- **Strict TypeScript**: 保持所有代码在严格 TypeScript 下 0 编译与类型报错（`npm run build:frontend` 与 `npm run build:backend` 必须完全干净通过）。
- **TDD Verification**: 编写完备的 Jest 静态与功能断言测试，保证构建与回归测试全部通过。

---

### Task 1: 重构 LogsView 与 JsonTreeView 视口内独立滚动机制

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:360-395,496-510,645-695,925-985`
- Modify: `frontend/src/components/JsonTreeView.tsx:195-248`
- Test: `tests/logsViewThemeRefinement.test.ts`

**Interfaces:**
- Consumes: `JsonTreeViewProps`, `LogsView`
- Produces: 
  - `JsonTreeView` 具备 `h-full flex-1 min-h-0 flex flex-col overflow-hidden` 结构
  - `LogsView` 左侧列表和右侧详情在视口内高度 100% 闭环

- [x] **Step 1: 在 `tests/logsViewThemeRefinement.test.ts` 中编写视口约束断言**
- [x] **Step 2: 运行测试并验证失败**
- [x] **Step 3: 重构 `JsonTreeView.tsx` 实现视口闭环**
- [x] **Step 4: 重构 `LogsView.tsx` 左侧与右侧容器布局**
- [x] **Step 5: 重新运行测试验证通过**
- [x] **Step 6: 提交视口自适应改动**

```bash
git add frontend/src/components/LogsView.tsx frontend/src/components/JsonTreeView.tsx tests/logsViewThemeRefinement.test.ts
git commit -m "feat(logs): implement internal scroll containment for logs list and JsonTreeView aligned with TranslateView"
```

---

### Task 2: 修复 Code Review 发现的 Header 注入、Modal 传参及类名问题

**Files:**
- Modify: `src/utils/requestHelper.ts:75-90`
- Modify: `frontend/src/components/ConcurrentTestModal.tsx:80-90`
- Modify: `frontend/src/components/PlaygroundView.tsx:930-942`
- Modify: `frontend/src/components/chat/ThinkingBlock.tsx:35-40`
- Test: `tests/claudeController.test.ts`

**Interfaces:**
- Consumes: `apiKey`, `config.adminSecretKey`
- Produces: 
  - `buildUpstreamHeaders` 大小写不敏感检测 `authorization`
  - `ConcurrentTestModal` 同时附带 `x-admin-key: apiKey`
  - `ThinkingBlock` 使用合法的 `py-0.5` 类名
  - `PlaygroundView` 使用 `useMemo` 缓存 `parsedPayload`

- [x] **Step 1: 在 `tests/claudeController.test.ts` 中补充 Header 大小写冲突测试**
- [x] **Step 2: 运行测试并验证失败**
- [x] **Step 3: 修改 `src/utils/requestHelper.ts` 实现大小写不敏感判断**
- [x] **Step 4: 修复 `ConcurrentTestModal.tsx` 中的请求头附加**
- [x] **Step 5: 优化 `PlaygroundView.tsx` 中的 `parsedPayload` 与修复 `ThinkingBlock.tsx`**
- [x] **Step 6: 重新运行所有测试验证通过**
- [x] **Step 7: 提交代码审查优化变更**

```bash
git add src/utils/requestHelper.ts frontend/src/components/ConcurrentTestModal.tsx frontend/src/components/PlaygroundView.tsx frontend/src/components/chat/ThinkingBlock.tsx tests/claudeController.test.ts
git commit -m "fix(review): add x-admin-key to concurrent modal, case-insensitive auth headers, and memoize json payload"
```

---

### Task 3: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [x] **Step 1: 运行全量测试套件**
- [x] **Step 2: 运行前端严格构建**
- [x] **Step 3: 运行后端构建**
- [x] **Step 4: 运行全量构建**

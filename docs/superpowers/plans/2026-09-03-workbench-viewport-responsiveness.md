# 工作台全视口与全宽度自适应实现计划 (Workbench Viewport & Full-Width Responsiveness Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 API 调试器 (Playground)、请求日志 (Logs) 与翻译工作台 (Translate) 统一重构成充满视口宽度（`w-full`）、桌面端占满剩余视口高度（`md:h-[calc(100dvh-6.5rem)]`）、面板内部独立平滑滚动的沉浸式现代工作台，彻底消除外层双重滚动条与大屏留白。

**Architecture:** 
1. 在 `frontend/src/App.tsx` 中定义工作台页面集合并建立统一的 `<main>` 容器高度与溢出规范；
2. 在 `frontend/src/components/PlaygroundView.tsx` 中将外层容器升级为 `w-full flex-1` 和 `dvh` 高度规范；
3. 在 `frontend/src/components/LogsView.tsx` 中移除 `max-w-7xl`，扩大左侧列表响应式宽度，并将 Raw JSON Monaco Editor 设为弹性撑满（`height="100%"`）；
4. 在 `frontend/src/components/TranslateView.tsx` 中重构顶栏为独立的浮动卡片 (`ui-card`)，并将左右两栏重构为充满视口并在内部独立滚动的弹性网格系统；
5. 在 `frontend/src/components/ConversationView.tsx` 中将对话流最大宽度放宽到 `max-w-5xl`。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite, Monaco Editor, Lucide React.

## Global Constraints

- **Viewport Standard**: 桌面端工作台可用高度统一为 `md:h-[calc(100dvh-6.5rem)]`，外层锁定 `overflow-hidden`，绝不允许主窗口出现纵向滚动条。
- **Full Width**: 移除三大工作台最外层的 `max-w-7xl` 限制，采用 `w-full flex-1` 充满整个主工作区。
- **Design System Consistency**: 统一使用 `ui-card`、`ui-card-sub`、`ui-tab-container`、`ui-tab-pill`、`ui-tab-pill-active` 工具类，禁止随意内嵌硬编码底色。
- **Zero Regression**: 确保 Monaco Editor、SSE 实时流预览、JSON 树折叠、翻译多模型对比、移动端 Tab 切换功能 100% 正常。

---

### Task 1: 规范主应用容器高度与工作台视口模式 (`App.tsx`)

**Files:**
- Modify: `frontend/src/App.tsx:565-575`

**Interfaces:**
- Consumes: `activeTab: TabType`
- Produces: 识别工作台页面并在桌面端应用统一的视口尺寸与 `overflow-hidden` 容器类。

- [x] **Step 1: 检查当前 App.tsx main 标签实现**

确认 `frontend/src/App.tsx` 中的 `<main>` 渲染逻辑：
```tsx
<main className={`flex-1 overflow-x-hidden ${
  activeTab === 'terminal'
    ? 'p-0 md:p-6 pb-0 md:pb-6 flex flex-col min-h-0 h-[calc(100dvh-3rem-3.5rem)] max-h-[calc(100dvh-3rem-3.5rem)] md:h-auto md:max-h-none overflow-hidden'
    : 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6'
}`}>
```

- [x] **Step 2: 修改 App.tsx 实现统一工作台视口容器规则**

在 `frontend/src/App.tsx` 中增加工作台页面判断 `isWorkbenchTab = ['playground', 'logs', 'translate'].includes(activeTab);`，并赋予工作台视图在桌面端 `overflow-hidden md:h-[calc(100dvh-3.5rem)]` 或配合 padding 的纯净弹性容器：

```tsx
const isWorkbenchTab = ['playground', 'logs', 'translate'].includes(activeTab);
```

`<main>` 样式修改为：
```tsx
<main className={`flex-1 overflow-x-hidden ${
  activeTab === 'terminal'
    ? 'p-0 md:p-6 pb-0 md:pb-6 flex flex-col min-h-0 h-[calc(100dvh-3rem-3.5rem)] max-h-[calc(100dvh-3rem-3.5rem)] md:h-auto md:max-h-none overflow-hidden'
    : isWorkbenchTab
      ? 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6 flex flex-col min-h-0 md:overflow-hidden'
      : 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6'
}`}>
```

- [x] **Step 3: 运行前端编译检查**

Run: `cd frontend && npm run build`
Expected: 编译通过，无语法与类型错误。

- [x] **Step 4: 提交代码**

```bash
git add frontend/src/App.tsx
git commit -m "feat(app): standardize workbench viewport container styles

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: API 调试器 (`PlaygroundView`) 适配充满全宽与 dvh 标准

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx:470-475`

**Interfaces:**
- Consumes: 全局 Design Tokens
- Produces: 占满宽度的 API 调试工作台界面。

- [x] **Step 1: 检查 PlaygroundView 根容器样式**

在 `frontend/src/components/PlaygroundView.tsx` 第 471 行：
```tsx
<div className="max-w-7xl mx-auto space-y-4 flex flex-col font-sans min-h-[600px] md:h-[calc(100vh-6.5rem)]">
```

- [x] **Step 2: 修改根容器类名为全宽与 dvh 单位**

修改为：
```tsx
<div className="w-full flex-1 space-y-4 flex flex-col font-sans min-h-[600px] md:h-[calc(100dvh-6.5rem)] overflow-hidden">
```

- [x] **Step 3: 运行前端编译检查**

Run: `cd frontend && npm run build`
Expected: 编译通过。

- [x] **Step 4: 提交代码**

```bash
git add frontend/src/components/PlaygroundView.tsx
git commit -m "feat(playground): expand container to full width and update viewport unit to dvh

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 请求日志 (`LogsView` & `ConversationView`) 全宽与弹性撑满改造

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:356-365, 920-985, 1050-1070`
- Modify: `frontend/src/components/ConversationView.tsx:110-115`

**Interfaces:**
- Consumes: 日志数据、Monaco Editor
- Produces: 充满屏幕且左侧列表随屏宽扩展、右侧 Monaco Editor 弹性 100% 撑满的请求日志审查界面。

- [x] **Step 1: 检查 LogsView 最外层容器与左侧列表宽度**

在 `frontend/src/components/LogsView.tsx`:
```tsx
<div className="flex flex-col md:flex-row gap-4 max-w-7xl mx-auto items-stretch min-h-[700px] md:h-[calc(100vh-6.5rem)]">
  {!sidebarCollapsed && (
    <div className={`w-full md:w-80 lg:w-[340px] shrink-0 ui-card p-3.5 flex flex-col h-[520px] md:h-full transition-all ${
```

- [x] **Step 2: 修改 LogsView 外层容器为全宽充满并优化左侧宽度阶梯**

修改为：
```tsx
<div className="w-full flex-1 flex flex-col md:flex-row gap-4 items-stretch h-full min-h-[600px] md:h-[calc(100dvh-6.5rem)] overflow-hidden">
  {!sidebarCollapsed && (
    <div className={`w-full md:w-80 lg:w-[360px] xl:w-[380px] shrink-0 ui-card p-3.5 flex flex-col h-[520px] md:h-full transition-all ${
```

- [x] **Step 3: 改造 LogsView 中 Monaco Editor 的固定高度为 100% 弹性撑满**

将 `activeTab === 'payload'` 和 `activeTab === 'response'` 下的 `Editor` 容器及属性：
原来：
```tsx
<div className="rounded-xl overflow-hidden border border-slate-800 shadow-inner">
  <Editor
    height="620px"
```
改造为：
```tsx
<div className="flex-1 min-h-[420px] rounded-xl overflow-hidden border border-white/[0.08] shadow-inner bg-[#020617]">
  <Editor
    height="100%"
```
同时确保两列的外层容器拥有 `flex-1 min-h-0 flex flex-col`。

- [x] **Step 4: 扩大 ConversationView 的大屏显示宽度**

在 `frontend/src/components/ConversationView.tsx` 中：
将根容器的 `max-w-4xl mx-auto w-full` 修改为：
`max-w-5xl mx-auto w-full`。

- [x] **Step 5: 运行前端编译检查**

Run: `cd frontend && npm run build`
Expected: 编译通过，无类型错误。

- [x] **Step 6: 提交代码**

```bash
git add frontend/src/components/LogsView.tsx frontend/src/components/ConversationView.tsx
git commit -m "feat(logs): enable full-width responsiveness and elastic monaco editor layout

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 翻译工作台 (`TranslateView`) 架构重构与全屏自适应对齐

**Files:**
- Modify: `frontend/src/components/TranslateView.tsx:515-840`

**Interfaces:**
- Consumes: `SUPPORTED_LANGUAGES`, `STYLE_PRESETS`, `useTranslation`
- Produces: 顶栏采用独立浮动卡片 (`ui-card`)，左右双栏充满剩余视口并在内部独立平滑滚动的翻译工作台。

- [x] **Step 1: 检查 TranslateView 原外层结构与顶栏样式**

在 `frontend/src/components/TranslateView.tsx` 第 518 行起：
原有 `h-[calc(100vh-3.5rem)] bg-[#090A0F]` 及内嵌假全屏顶栏 `bg-[#0C0E14]/90 border-b border-white/[0.08] px-4 py-3`，内部包含 `max-w-7xl mx-auto`。

- [x] **Step 2: 重构最外层容器与顶栏控制面板**

重构外层容器为：
```tsx
<div className="w-full flex-1 space-y-4 flex flex-col font-sans h-full min-h-[600px] md:h-[calc(100dvh-6.5rem)] overflow-hidden">
```
顶栏重构为独立的 `.ui-card`：
```tsx
<div className="ui-card p-3.5 flex flex-wrap items-center justify-between gap-3 relative z-30 shrink-0">
```
统一使用全站标准类：
- 语言选择与互换：使用微光边框及全站规范 `.ui-input` 或 `.ui-card-sub`；
- 风格选择器下拉菜单：采用 `.ui-btn-secondary` 与标准暗黑下拉菜单样式；
- 模式切换按钮：采用 `.ui-tab-container` + `.ui-tab-pill`；
- 翻译主按钮：采用 `.ui-btn-primary`。

- [x] **Step 3: 重构主体左右双栏弹性自适应与内部独立滚动**

将主体工作区由原先的外部单一大滚动容器：
```tsx
<div className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-y-auto">
```
重构为：
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
```
- **左侧输入面板**：
  - 容器为 `ui-card flex flex-col h-full overflow-hidden`；
  - 头部工具条和底部字数统计栏固定；
  - `<textarea>` 容器为 `flex-1 min-h-0 relative flex flex-col`，输入框 `className="w-full flex-1 bg-transparent text-slate-100 placeholder-slate-600 text-sm leading-relaxed resize-none focus:outline-none font-sans overflow-y-auto"`。
- **右侧翻译结果面板**：
  - 外层容器为 `flex flex-col h-full min-h-0 overflow-hidden`；
  - 单模型与多模型对比网格在内部滚动：`className="grid gap-4 flex-1 min-h-0 overflow-y-auto ..."`；
  - 单个结果卡片内部设为 `flex flex-col h-full overflow-hidden ui-card`，其译文渲染区域独立设置 `flex-1 min-h-0 overflow-y-auto`。

- [x] **Step 4: 运行前端编译检查**

Run: `cd frontend && npm run build`
Expected: 编译通过，无任何 TypeScript 报错。

- [x] **Step 5: 提交代码**

```bash
git add frontend/src/components/TranslateView.tsx
git commit -m "feat(translate): modernize layout with floating control card and dual-panel independent scrolling

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 综合系统构建与全站测试套件回归验证

**Files:**
- Test: `tests/claudeTranslator.test.ts`
- Test: `tests/admin.test.ts`

- [x] **Step 1: 运行后端与前端完整构建**

Run: `npm run build`
Expected: 前端 Vite 打包至 `dist/frontend`，后端 TypeScript 编译至 `dist/src`，0 错误。

- [x] **Step 2: 运行全量单元测试与集成测试**

Run: `npm test`
Expected: 所有测试全部 PASS。

- [x] **Step 3: 检查 git status 确认工作区干净**

Run: `git status`
Expected: working tree clean。

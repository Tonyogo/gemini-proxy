# 全站页面 UI 风格统一实现计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立全站统一的现代极简暗黑微光风（Linear/Vercel 体系）Design System，并在 `index.css` 中沉淀标准类，全面重构与收敛 Dashboard、Accounts、Logs、Playground、Terminal 与 ConfigModal 6 个核心视图的背景、边框、圆角、Tab 胶囊与按钮样式。

**Architecture:** 在 `frontend/src/index.css` 的 `@layer components` 中沉淀 `.ui-card`、`.ui-card-sub`、`.ui-tab-container`、`.ui-tab-pill`、`.ui-tab-pill-active`、`.ui-btn-primary`、`.ui-btn-secondary`、`.ui-input`；然后逐个视图重构，替换混杂的 `bg-slate-900/95`、`border-slate-800` 等遗留类为统一的深灰黑磨砂底色（`#0C0E14` / `#10121A`）与微光描边（`border-white/[0.08]`）。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Lucide React, Vite.

## Global Constraints

- **Canvas & Surface**: 全站底色为 `#090A0F`，主面板统一为 `#0C0E14`，内嵌子卡片/输入框统一为 `#10121A`。
- **Borders**: 统一采用微光白描边 `border-white/[0.08]`（次级 `border-white/[0.05]`，激活 `border-indigo-500/60`），彻底移除 `border-slate-800` / `border-slate-700`。
- **Component Classes**: 优先使用在 `index.css` 中沉淀的 `.ui-card`、`.ui-tab-container` 等公共工具类。
- **Zero Functionality Regression**: 所有图表、Monaco 编辑器、xterm.js 终端、EventSource/WebSocket 连接和复制功能保持 100% 正常。

---

### Task 1: 在 `frontend/src/index.css` 中定义全局 Design Tokens 与公共组件类

**Files:**
- Modify: `frontend/src/index.css:50-85`

**Interfaces:**
- Produces: CSS utility classes:
  - `.ui-card`
  - `.ui-card-sub`
  - `.ui-tab-container`
  - `.ui-tab-pill`
  - `.ui-tab-pill-active`
  - `.ui-btn-primary`
  - `.ui-btn-secondary`
  - `.ui-input`

- [ ] **Step 1: 在 `frontend/src/index.css` 中添加组件类**

```css
@layer components {
  /* 主卡片面板 */
  .ui-card {
    @apply bg-[#0C0E14]/90 border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-md;
  }

  /* 内嵌子卡片 / 表格行 */
  .ui-card-sub {
    @apply bg-[#10121A]/80 border border-white/[0.06] rounded-xl shadow-sm;
  }

  /* 胶囊 Tab 切换容器与按键 */
  .ui-tab-container {
    @apply flex items-center p-1 bg-[#10121A] rounded-xl border border-white/[0.08] shadow-sm;
  }
  .ui-tab-pill {
    @apply px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-slate-400 hover:text-slate-200 hover:bg-white/[0.04];
  }
  .ui-tab-pill-active {
    @apply bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)];
  }

  /* 统一按钮系统 */
  .ui-btn-primary {
    @apply bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-medium text-xs shadow-[0_0_15px_rgba(99,102,241,0.25)] transition-all active:scale-[0.98];
  }
  .ui-btn-secondary {
    @apply bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all active:scale-[0.98];
  }

  /* 统一输入框与下拉框 */
  .ui-input {
    @apply bg-[#10121A] border border-white/[0.08] hover:border-white/[0.15] focus:border-indigo-500/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 font-mono transition-all;
  }
}
```

- [ ] **Step 2: 执行构建验证 CSS 语法无误**
  Run: `npm run build:frontend`
  Expected: PASS

- [ ] **Step 3: 提交更改**
  ```bash
  git add frontend/src/index.css
  git commit -m "feat(ui): define global design tokens and utility component classes"
  ```

---

### Task 2: 收敛与重构 `DashboardView.tsx` 及子组件

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`
- Modify: `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-tab-container`, `.ui-tab-pill`, `.ui-tab-pill-active`
- Produces: Polished, unified Dashboard UI

- [ ] **Step 1: 重构 `DashboardView.tsx`**
  1. 顶部时间范围筛选栏（Today / 24h / 7d）应用 `.ui-tab-container` 与 `.ui-tab-pill` / `.ui-tab-pill-active`。
  2. 统计磁贴（Requests / Latency / Success Rate / Active Accounts）外层统一采用 `.ui-card`。
  3. 图表分析主区域外层统一为 `.ui-card`，消除 `bg-slate-900` / `border-slate-800`。

- [ ] **Step 2: 重构 `ModelPerformanceMatrix.tsx` 与 `SystemRuntimeMatrix.tsx`**
  1. 卡片外层类名改为 `ui-card p-5`。
  2. 列表项背景收敛为 `bg-white/[0.03]` 与 `border-white/[0.05]`。

- [ ] **Step 3: 运行前端构建检查**
  Run: `npm run build:frontend`
  Expected: PASS

- [ ] **Step 4: 提交更改**
  ```bash
  git add frontend/src/components/DashboardView.tsx frontend/src/components/dashboard/
  git commit -m "style(dashboard): harmonize dashboard view and metrics cards with design tokens"
  ```

---

### Task 3: 收敛与重构 `AccountsView.tsx`

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-card-sub`, `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-input`
- Produces: Clean, modern multi-account management table and toolbars

- [ ] **Step 1: 重构顶部统计与操作工具栏**
  1. 统计卡片、搜索框与状态筛选器统一使用 `.ui-card`、`.ui-input` 与 `.ui-tab-container`。
  2. 批量操作按钮（导入、下载、去重、删除）使用 `.ui-btn-secondary` 与 `.ui-btn-primary`。

- [ ] **Step 2: 重构账号列表表格与 Popover 弹层**
  1. 表格外层容器改为 `.ui-card overflow-hidden`，表头采用 `bg-[#10121A]/90 border-b border-white/[0.08]`。
  2. 表格行交替与悬浮态统一为 `hover:bg-white/[0.03] border-b border-white/[0.05]`。
  3. 确认弹窗与用量详情 Popover 统一改为 `.ui-card` 磨砂暗黑投影规范。

- [ ] **Step 3: 运行前端构建**
  Run: `npm run build:frontend`
  Expected: PASS

- [ ] **Step 4: 提交更改**
  ```bash
  git add frontend/src/components/AccountsView.tsx
  git commit -m "style(accounts): harmonize accounts view table, filters, and modal popovers"
  ```

---

### Task 4: 收敛与重构 `LogsView.tsx`

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-card-sub`, `.ui-tab-container`, `.ui-tab-pill`, `.ui-btn-secondary`
- Produces: Professional DevTools-like log explorer with unified surfaces and borders

- [ ] **Step 1: 重构左侧主请求列表侧边栏**
  1. 将外层容器类名从 `bg-slate-900/90 border border-slate-800/90` 统一改为 `ui-card p-3.5`。
  2. 日期/小时选择下拉框与搜索框统一使用 `.ui-input`。
  3. 状态过滤按钮栏（All / 2xx / 4xx / 5xx）统一为 `.ui-tab-container`。
  4. 日志项列表选中项与悬浮态统一为微光紫蓝描边（`bg-indigo-600/15 border-indigo-500/80`）。

- [ ] **Step 2: 重构右侧详情面板与顶栏操作区**
  1. 顶部 `Payload / Response / Chat` Tab 栏改为 `.ui-tab-container` 与 `.ui-tab-pill`。
  2. `Preview / Raw JSON` 模式切换栏同样统一为 `.ui-tab-container`。
  3. cURL 复制与 JSON 复制按钮统一为 `.ui-btn-secondary`。
  4. 消除所有残留的 `bg-slate-900` 与 `border-slate-800`。

- [ ] **Step 3: 运行前端构建**
  Run: `npm run build:frontend`
  Expected: PASS

- [ ] **Step 4: 提交更改**
  ```bash
  git add frontend/src/components/LogsView.tsx
  git commit -m "style(logs): harmonize logs view sidebar, tabs, and detail inspector"
  ```

---

### Task 5: 收敛与重构 `PlaygroundView.tsx`

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-card-sub`, `.ui-tab-container`, `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-input`
- Produces: Clean, modern interactive playground and testing interface

- [ ] **Step 1: 重构顶部控制条与预设模板选择器**
  1. API 密钥输入框、端点选择下拉框统一为 `.ui-input`。
  2. 预设模板按钮、并发压测入口统一使用 `.ui-btn-secondary`。
  3. 发送请求主按钮统一使用 `.ui-btn-primary`（带渐变与微光）。

- [ ] **Step 2: 重构左右 Monaco 编辑器外壳与响应预览卡片**
  1. 左侧请求体编辑器容器与右侧响应输出容器统一采用 `.ui-card`。
  2. 右侧顶部的 `Preview / Raw Text` 切换器统一改为 `.ui-tab-container`。

- [ ] **Step 3: 运行前端构建**
  Run: `npm run build:frontend`
  Expected: PASS

- [ ] **Step 4: 提交更改**
  ```bash
  git add frontend/src/components/PlaygroundView.tsx
  git commit -m "style(playground): harmonize playground editors, controls, and response panes"
  ```

---

### Task 6: 收敛与重构 `ConfigModal.tsx` 与 `UnifiedTerminalView.tsx`

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-tab-container`, `.ui-tab-pill`, `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-input`
- Produces: Consistent modal dialogs and terminal wrappers

- [ ] **Step 1: 重构 `ConfigModal.tsx`**
  1. 弹窗主卡片应用 `.ui-card max-w-4xl p-0 overflow-hidden`。
  2. 左侧配置分类 Tab 导航统一使用微光暗色高亮风格。
  3. 表单配置组、KV 模型映射编辑项统一采用 `.ui-card-sub` 与 `.ui-input`。
  4. 底部操作栏（取消 / 保存修改 / 恢复默认）统一套用 `.ui-btn-secondary` 与 `.ui-btn-primary`。

- [ ] **Step 2: 校验 `UnifiedTerminalView.tsx` 保持统一**
  确认其子 Tab 切换器使用标准的 `.ui-tab-container` 与 `.ui-tab-pill`。

- [ ] **Step 3: 运行前端构建**
  Run: `npm run build:frontend`
  Expected: PASS

- [ ] **Step 4: 提交更改**
  ```bash
  git add frontend/src/components/ConfigModal.tsx frontend/src/components/UnifiedTerminalView.tsx
  git commit -m "style(config): harmonize config modal and terminal view styling"
  ```

---

### Task 7: 全站端到端视觉与功能回归测试 (Comprehensive Verification)

**Files:**
- None (Verification only)

- [ ] **Step 1: 运行全量构建**
  Run: `npm run build`
  Expected: Frontend (Vite) and Backend (TypeScript) compile cleanly with 0 errors.

- [ ] **Step 2: 运行全套单元测试**
  Run: `npm test`
  Expected: All Jest test suites pass.

- [ ] **Step 3: 跨页面 UI 风格综合巡检**
  巡检 5 个主页面（Dashboard, Accounts, Logs, Terminal, Playground）及设置弹窗，确认全站背景底色、边框微光、圆角层级、按钮与 Tab 胶囊风格 100% 统一和谐。

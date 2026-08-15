# Gemini Proxy Admin Web Console - UI/UX 视觉与体验重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的 Gemini Proxy 控制台全面重塑为 Linear / Raycast 级别的现代精细暗黑 SaaS 开发者工具，升级工作区导航、数据大盘图表、账号池状态机矩阵、网络日志检查器与弹窗体系，同时 100% 保持业务逻辑与 API 接口不变。

**Architecture:** 
- 前端全局注入深邃炭黑 (`#090A0F` ~ `#151824`) 设计 Token、细微发光边框 (`border-white/[0.08]`)、毛玻璃材质与 Indigo/Violet 强调色体系。
- 架构上采用左侧可折叠现代侧边栏（Collapsible Sidebar）+ 顶部磨砂面包屑状态栏。
- 各业务视图组件在保持所有 Props、State、API 与 i18n 逻辑严格一致的前提下，全面升级卡片、SVG 趋势图、状态机 Badge 胶囊、数据表格、Monaco Editor 及深色弹窗。

**Tech Stack:** React 18, TypeScript, TailwindCSS 3, Lucide React, Monaco Editor, Vite.

**Spec:** `docs/superpowers/specs/2026-08-15-ui-ux-redesign.md`

## Global Constraints
- 零业务功能破坏：所有现有的 REST/SSE API、路由、多语言国际化 i18n 键、数据字段结构和业务逻辑必须完全保持不变。
- 严禁引入破坏性的新重型依赖，充分利用已有 TailwindCSS 3、Lucide React 和原生 SVG/CSS 动效。
- 编译与验证要求：每完成一个任务必须执行 `npm run build:frontend` 确保 100% 编译成功无 TS 报错。

---

### Task 1: 全局设计系统 Token 与样式基座升级 (CSS Tokens & Animation System)

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/tailwind.config.js` (如有或内联拓展)

**Interfaces:**
- Consumes: TailwindCSS base, components, utilities
- Produces: 全局暗黑背景、微光边框、发光阴影类、自定义优雅滚动条、打字机光标与状态机脉冲动画

- [ ] **Step 1: 更新 `frontend/src/index.css` 注入全局样式与设计令牌**
  - 配置全局深邃背景 `#090A0F`，定义细微边框高光工具类。
  - 配置全站平滑滚动条（深色窄轨 `scrollbar-thin`）、状态机呼吸动画（`pulse-slow`）与毛玻璃阴影。
- [ ] **Step 2: 运行前端构建命令验证样式**
  - Run: `npm run build:frontend`
  - Expected: 构建成功。
- [ ] **Step 3: 提交更改**
  - Git: `git commit -m "style(design-system): add linear-inspired design tokens and base styles"`

---

### Task 2: 工作区骨架升级 - 现代折叠侧边栏与沉浸式顶栏 (App.tsx & Shell)

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: Lucide Icons, LanguageContext (`t, lang, setLang`), App State (`adminKey, isAuthenticated, activeTab`)
- Produces: 现代折叠侧边栏 (240px/64px)、顶部磨砂面包屑、精致登录鉴权卡片与统一浮动 Toast 体系

- [ ] **Step 1: 升级登录鉴权界面 (Login Card)**
  - 采用深色玻璃卡片居中，带微发光锁图标、精致等宽 Key 输入框与发光登录按钮。
- [ ] **Step 2: 重构主工作台布局 (Collapsible Sidebar + Topbar Shell)**
  - 左侧边栏：品牌 Logo + 版本 Badge、垂直导航 Tab（带激活紫光左竖条指示、悬停发光与快捷键提示）、底部集成连接状态绿灯、配置入口、语言切换与登出按钮。
  - 顶部面包屑：视图名称、活跃状态小胶囊、刷新指示器。
- [ ] **Step 3: 验证构建与功能**
  - Run: `npm run build:frontend`
- [ ] **Step 4: 提交更改**
  - Git: `git commit -m "feat(ui): redesign app workspace shell with collapsible sidebar and linear aesthetic"`

---

### Task 3: 数据大盘与图表视觉重塑 (DashboardView.tsx)

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `/api/admin/status`, `/api/admin/stats?range=...`
- Produces: 现代 4 宫格 KPI 卡片、双曲线面积 SVG 图表、十字准星与 Glassmorphic 悬浮卡片、模型负载横向进度条

- [ ] **Step 1: 重构 KPI 核心指标卡片**
  - 4 宫格微发光容器，单宽大字 `text-2xl font-mono`，带右上角半透明语义图标与状态对比胶囊。
- [ ] **Step 2: 升级 SVG 趋势图表与双层渐变填充**
  - 网格线虚化、双层 Indigo/Emerald 渐变、十字准星锚点发光圆环。
- [ ] **Step 3: 升级 Glassmorphic 浮动 Tooltip 与模型排行榜**
  - 悬浮卡片磨砂玻璃高对比度排版，模型请求量横向分段进度条。
- [ ] **Step 4: 验证构建**
  - Run: `npm run build:frontend`
- [ ] **Step 5: 提交更改**
  - Git: `git commit -m "feat(ui): modernize dashboard with glowing kpi tiles and high-precision charts"`

---

### Task 4: 账号池管理与状态机矩阵升级 (AccountsView.tsx & TerminalLogsView.tsx)

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`
- Modify: `frontend/src/components/TerminalLogsView.tsx`

**Interfaces:**
- Consumes: System status, account details, terminal logs SSE stream/polling
- Produces: 状态机 Badge 胶囊矩阵、现代数据表格、多选浮动操作栏、macOS 终端日志抽屉

- [ ] **Step 1: 升级状态机 Badge 胶囊与标签体系**
  - `ACTIVATED` (呼吸绿)、`ACTIVATING/ROTATION` (电光紫)、`INACTIVE/DISABLED` (冷灰)、`SUSPENDED/EXPIRED` (玫瑰红)。
- [ ] **Step 2: 重构账号池数据表格与浮动操作栏**
  - 极细分割线、表头大写轻量字、整行悬停升温、底部多选浮动操作栏。
- [ ] **Step 3: 升级内嵌式终端日志抽屉 (`TerminalLogsView.tsx`)**
  - macOS 终端风格控制栏、全选复制、自动滚动、语法高亮着色。
- [ ] **Step 4: 验证构建**
  - Run: `npm run build:frontend`
- [ ] **Step 5: 提交更改**
  - Git: `git commit -m "feat(ui): overhaul accounts management table, status badges, and terminal drawer"`

---

### Task 5: 网络事务检查器与流式回放器重塑 (LogsView.tsx, JsonTreeView.tsx, SseStreamPreview.tsx)

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`
- Modify: `frontend/src/components/JsonTreeView.tsx`
- Modify: `frontend/src/components/SseStreamPreview.tsx`

**Interfaces:**
- Consumes: `/api/admin/logs`, JSON payloads, SSE stream chunks
- Produces: DevTools Network 风格两栏布局、定制深色 JSON 树状高亮、LLM EventSource 流式序列时间轴

- [ ] **Step 1: 升级 `LogsView.tsx` 主从两栏布局**
  - 左侧请求列表（带极窄时间筛选、状态码色块、模型 Tag、耗时胶囊），右侧详情面板 Preview/Raw 切换。
- [ ] **Step 2: 升级 `JsonTreeView.tsx` 语法着色与快捷操作**
  - 现代深色高亮配色、一键全部展开/折叠、一键路径复制。
- [ ] **Step 3: 升级 `SseStreamPreview.tsx` 事件流时间轴**
  - Chunk 块序号、Delta 文本、Token 增量与耗时间隔显示。
- [ ] **Step 4: 验证构建**
  - Run: `npm run build:frontend`
- [ ] **Step 5: 提交更改**
  - Git: `git commit -m "feat(ui): modernize network logs viewer, json tree, and sse stream timeline"`

---

### Task 6: API 调试沙盒与弹窗体系升级 (PlaygroundView.tsx, ConfigModal.tsx, ConcurrentTestModal.tsx)

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx`
- Modify: `frontend/src/components/ConfigModal.tsx`
- Modify: `frontend/src/components/ConcurrentTestModal.tsx`

**Interfaces:**
- Consumes: Monaco Editor, Config APIs, Test runner APIs
- Produces: 现代深色沙盒双栏调试器、磨砂玻璃弹窗 (Scale-in 动效)

- [ ] **Step 1: 升级 `PlaygroundView.tsx` 双栏调试界面**
  - Monaco Editor 深度嵌入深色主题、预设快捷按钮、响应流打字机指示。
- [ ] **Step 2: 升级 `ConfigModal.tsx` & `ConcurrentTestModal.tsx` 弹窗体系**
  - 磨砂深色底板、清晰表单排版、并发压测实时进度仪表。
- [ ] **Step 3: 验证构建**
  - Run: `npm run build:frontend`
- [ ] **Step 4: 提交更改**
  - Git: `git commit -m "feat(ui): upgrade playground view and modal dialogs to modern saas design"`

---

### Task 7: 全站端到端构建、静态资源与完整测试验证 (Verification & Build)

**Files:**
- Test/Build: 全局前端与后端构建

- [ ] **Step 1: 执行完整前端生产构建**
  - Run: `npm run build:frontend`
  - Expected: 无任何 TypeScript 报错，成功产出静态文件到 `dist/frontend`。
- [ ] **Step 2: 执行全量后端回归测试**
  - Run: `npm test`
  - Expected: 核心转换器、路由与状态机测试全绿（PASS）。
- [ ] **Step 3: 提交最终升级集成提交**
  - Git: `git commit -m "chore(release): complete full ui/ux visual redesign to linear saas standard"`

---

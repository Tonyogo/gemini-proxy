# 统一终端与终端日志菜单合并实现计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端控制台中的「网页终端」与「终端日志」两个独立导航菜单合并为统一的「终端」(Terminal) 菜单，内部提供 Tab 切换并实现长连接保活与尺寸自适应。

**Architecture:** 创建轻量级统一容器组件 `UnifiedTerminalView.tsx` 托管 `<WebTerminalView />` 和 `<TerminalLogsView />`，采用 CSS 条件隐藏实现状态与网络连接保活（Keep-Alive），并在切回 Web 终端时通知 xterm 自动执行 fit 重绘；精简 `App.tsx` 导航为 5 项并适配键盘快捷键（⌘1~⌘5），更新中英文国际化字典。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, xterm.js, EventSource (SSE), WebSocket, Vite.

## Global Constraints

- **Single Terminal Nav Item**: 主导航中仅保留单个「终端」菜单项，对应 TabType `'terminal'`，快捷键为 `⌘4`。
- **5 Nav Items Total**: 导航总数精简为 5 项：`dashboard` (⌘1), `accounts` (⌘2), `logs` (⌘3), `terminal` (⌘4), `playground` (⌘5)。
- **Sub-Tab Persistence**: 内部子 Tab 状态记忆键名为 `terminal_sub_tab` (`'interactive' | 'logs'`)。
- **Legacy Cache Migration**: 旧的 `admin_active_tab === 'webTerminal'` 需平滑迁移至 `'terminal'`。
- **Zero WebSocket Disconnect on Tab Switch**: 切换子 Tab 时不得触发 WebSocket 断开或 EventSource 重拉。
- **Standalone Route Unchanged**: 独立全屏路由 `/terminal` 和 `#/terminal` 继续直达沉浸式 `WebTerminalView`。

---

### Task 1: 更新中英文国际化 (i18n) 字典

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts:1-30,205-225`
- Modify: `frontend/src/i18n/locales/en.ts:1-30,205-225`

**Interfaces:**
- Consumes: 现有 `Translations` 结构
- Produces: 
  - `nav.terminal`: `"终端"` / `"Terminal"`
  - `terminal.interactiveTab`: `"交互终端"` / `"Web Terminal"`
  - `terminal.logsTab`: `"运行日志"` / `"Terminal Logs"`

- [x] **Step 1: 检查 i18n 类型声明与中英文字典**
  确认 `frontend/src/i18n/locales/en.ts` 和 `frontend/src/i18n/locales/zh.ts` 中 `nav` 与 `terminal` 字段。

- [x] **Step 2: 更新 `frontend/src/i18n/locales/zh.ts`**
  将 `nav.terminal` 改为 `"终端"`，移除 `nav.webTerminal`（或保留为可选）；在 `terminal` 对象中补充 `interactiveTab: "交互终端"` 与 `logsTab: "运行日志"`。

- [x] **Step 3: 更新 `frontend/src/i18n/locales/en.ts`**
  将 `nav.terminal` 改为 `"Terminal"`，移除 `nav.webTerminal`（或保留为可选）；在 `terminal` 对象中补充 `interactiveTab: "Web Terminal"` 与 `logsTab: "Terminal Logs"`。

- [x] **Step 4: 运行类型检查验证 i18n 文件无编译报错**
  Run: `npm run build:frontend`
  Expected: PASS or TypeScript check passes without errors in locales.

- [x] **Step 5: 提交更改**
  ```bash
  git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
  git commit -m "feat(i18n): update terminal navigation and sub-tab translations"
  ```

---

### Task 2: 创建统一终端容器组件 `UnifiedTerminalView.tsx`

**Files:**
- Create: `frontend/src/components/UnifiedTerminalView.tsx`

**Interfaces:**
- Consumes:
  - `<WebTerminalView adminKey={adminKey} standalone={false} onToggleStandalone={...} />`
  - `<TerminalLogsView adminKey={adminKey} />`
- Produces:
  - `export default function UnifiedTerminalView({ adminKey, onEnterStandalone }: UnifiedTerminalViewProps)`

- [x] **Step 1: 编写 `UnifiedTerminalView.tsx` 容器组件**
  实现以下功能：
  1. `subTab` 状态管理（`'interactive' | 'logs'`），初始值从 `localStorage.getItem('terminal_sub_tab')` 读取，默认为 `'interactive'`。
  2. 顶部精致 Pill 胶囊切换栏（带 `TerminalSquare` 和 `FileText` 图标）。
  3. 切换子 Tab 时保存至 `localStorage.setItem('terminal_sub_tab', tab)`。
  4. 视图保活布局：外层 `flex-1 flex flex-col min-h-0 relative`，使用 CSS `subTab === 'interactive' ? 'flex flex-col flex-1 min-h-0' : 'hidden'` 和 `subTab === 'logs' ? 'flex flex-col flex-1 min-h-0' : 'hidden'` 分别容纳两个视图。
  5. 右侧保留全屏切换按钮（在 interactive 模式下触发全屏）。

- [x] **Step 2: 验证组件在 TypeScript 中的类型与导入导出**
  确保引入组件 `WebTerminalView` 和 `TerminalLogsView` 路径正确，无缺少 props 报错。

- [x] **Step 3: 运行前端构建命令验证组件无报错**
  Run: `npm run build:frontend`
  Expected: PASS

- [x] **Step 4: 提交更改**
  ```bash
  git add frontend/src/components/UnifiedTerminalView.tsx
  git commit -m "feat(ui): create UnifiedTerminalView component with tab switching and keep-alive"
  ```

---

### Task 3: 改造 `App.tsx` 整合统一终端导航

**Files:**
- Modify: `frontend/src/App.tsx:30-70,350-405,500-600`

**Interfaces:**
- Consumes: `UnifiedTerminalView`
- Produces: 5-item navigation, updated `TabType`, keyboard shortcuts `⌘1`~`⌘5`

- [x] **Step 1: 更新 `TabType` 与 `NAV_ITEMS`**
  1. 修改 `type TabType = 'dashboard' | 'accounts' | 'logs' | 'terminal' | 'playground';`
  2. 精简 `NAV_ITEMS` 为 5 项：
     ```ts
     const NAV_ITEMS: NavItem[] = [
       { id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
       { id: 'accounts', icon: Users, shortcut: '⌘2' },
       { id: 'logs', icon: FileText, shortcut: '⌘3' },
       { id: 'terminal', icon: Terminal, shortcut: '⌘4' },
       { id: 'playground', icon: Play, shortcut: '⌘5' },
     ];
     ```
  3. 兼容旧缓存：在 `useState<TabType>` 初始化逻辑中，若 `saved === 'webTerminal'` 则自动转为 `'terminal'`。

- [x] **Step 2: 替换主渲染区域中的终端视图**
  将原先的 `activeTab === 'terminal'` 和 `activeTab === 'webTerminal'` 两个分支合并为统一的：
  ```tsx
  {activeTab === 'terminal' && (
    <UnifiedTerminalView
      key={refreshTrigger}
      adminKey={adminKey}
      onEnterStandalone={handleEnterStandalone}
    />
  )}
  ```

- [x] **Step 3: 调整 `<main>` 容器样式**
  当 `activeTab === 'terminal'` 时，应用全高 flex 容器排版规则（如 `p-0 md:p-4 flex flex-col min-h-0 h-[calc(100dvh-3.5rem)]`），使内部终端与日志均能获得最大可用高度。

- [x] **Step 4: 运行前端构建**
  Run: `npm run build:frontend`
  Expected: PASS with zero TypeScript or build errors.

- [x] **Step 5: 提交更改**
  ```bash
  git add frontend/src/App.tsx
  git commit -m "feat(ui): merge web terminal and terminal logs into single terminal menu in App"
  ```

---

### Task 4: 完善终端自适应重绘与交互体验 (Polishing & Resize Fit)

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Modify: `frontend/src/components/WebTerminalView.tsx` (if resize trigger hook needed)
- Modify: `frontend/src/components/TerminalLogsView.tsx` (if height adjustment needed)

**Interfaces:**
- Consumes: Window resize / subTab changes
- Produces: Smooth layout without blank terminal canvas or scroll breaks

- [x] **Step 1: 确保切回 Web 终端时自动触发 resize/fit**
  在 `UnifiedTerminalView.tsx` 切换至 `'interactive'` 时，通过触发一次 `window.dispatchEvent(new Event('resize'))` 或自定义回调通知 `WebTerminalView` 执行 `fitAddon.fit()`。

- [x] **Step 2: 优化 `TerminalLogsView` 在容器内的填充高度**
  调整 `TerminalLogsView.tsx` 的外层容器，使其在嵌入模式下自然撑满可用高度，移除固定过大的 margin/padding。

- [x] **Step 3: 运行完整构建与测试**
  Run: `npm run build && npm test`
  Expected: Frontend & Backend builds pass, Jest test suite all pass.

- [x] **Step 4: 提交更改**
  ```bash
  git add frontend/src/components/
  git commit -m "fix(ui): ensure xterm auto-refit on sub-tab switch and optimize unified terminal height"
  ```

---

### Task 5: 最终端到端验证 (Verification & Acceptance)

**Files:**
- None (Verification only)

- [x] **Step 1: 验证构建产物**
  Run: `npm run build`
  Expected: Build succeeds completely with both frontend and backend bundles ready.

- [x] **Step 2: 验证全套单元测试**
  Run: `npm test`
  Expected: All test suites pass.

- [x] **Step 3: 验证快捷键与导航菜单**
  确认侧边栏只显示 5 个菜单，快捷键 `⌘1`~`⌘5` 依次触发切换；独立路由 `#/terminal` 正常工作。

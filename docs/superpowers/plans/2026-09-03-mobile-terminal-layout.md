# 移动端终端顶栏与 Tab 切换布局优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化移动端（< sm，320px~412px）下终端顶栏与 Tab 切换行的排版布局，隐藏冗余长文本与次要缩放按钮，让 Tab 胶囊与操作区在极窄屏幕下单行无挤压横排。

**Architecture:**
1. 在 `WebTerminalView.tsx` 中，Tab 胶囊文字使用 `<span className="hidden sm:inline">` 隐藏，连接状态徽标隐藏文本仅保留状态呼吸小圆点，Zoom 字体缩放按钮在移动端使用 `hidden sm:inline-flex` 隐藏。
2. 在 `TerminalLogsView.tsx` 中，对齐 Tab 胶囊与连接状态徽标的移动端轻量化渲染，保持与交互终端切换时尺寸一致。
3. 添加针对终端移动端布局与响应式类名的单元断言测试，并通过 `npm run build:frontend` 与 `npm test` 保证构建与测试全部通过。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest, Vite.

## Global Constraints
- 不破坏桌面端（>= sm）现有布局与交互。
- Tab 切换事件 `onSubTabChange`、重连、清空、全屏等核心功能及事件绑定保持 100% 完整。
- 保证构建及现有测试全部通过。

---

### Task 1: 优化 WebTerminalView 顶栏移动端响应式布局

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:665-750`

**Interfaces:**
- Consumes: `onSubTabChange: (tab: 'interactive' | 'logs') => void`, `subTab: 'interactive' | 'logs'`, `isConnected: boolean`, `isConnecting: boolean`
- Produces: 响应式精简顶栏（移动端仅图标 Tab、极简状态点、隐藏 Zoom 按钮）

- [x] **Step 1: 检查当前 WebTerminalView.tsx 中的 Tab 按钮、状态徽标与缩放按钮结构**

定位到 665 行附近的 `ui-tab-container`、702 行附近的连接状态 Badge，以及 728-746 行的 Zoom 按钮。

- [x] **Step 2: 修改 WebTerminalView.tsx 中的 Tab 文本、状态文本与 Zoom 按钮的 Tailwind 响应式类**

在 `frontend/src/components/WebTerminalView.tsx` 中：
1. Tab 切换按键中的文本标签由 `<span>{t('terminal.interactiveTab')}</span>` 改为 `<span className="hidden sm:inline">{t('terminal.interactiveTab')}</span>`；同理 `<span>{t('terminal.logsTab')}</span>` 改为 `<span className="hidden sm:inline">{t('terminal.logsTab')}</span>`。
2. 将 Tab 按钮内边距调整为 `px-2 sm:px-2.5 py-1`，移动端紧凑自适应。
3. 连接状态 Badge 中的文本 `<span className="text-[9px] sm:text-[10px]">` 改为 `<span className="hidden sm:inline text-[10px]">`，移动端仅保留状态呼吸小点。
4. Zoom Out 与 Zoom In 按钮添加 `hidden sm:inline-flex` 类名，在移动端自动隐藏。

- [x] **Step 3: 运行前端构建验证无语法与样式错误**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
预期：构建通过，无 TypeScript 或打包错误。

- [x] **Step 4: 提交 Task 1 代码**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(webTerminal): streamline top bar layout on mobile screens"
```

---

### Task 2: 优化 TerminalLogsView 顶栏移动端响应式对齐

**Files:**
- Modify: `frontend/src/components/TerminalLogsView.tsx:214-275`

**Interfaces:**
- Consumes: `onSubTabChange: (tab: 'interactive' | 'logs') => void`, `subTab: 'interactive' | 'logs'`, `isConnected: boolean`
- Produces: 响应式精简顶栏（移动端仅图标 Tab、极简状态点），与 WebTerminalView 视觉尺寸完全对齐

- [x] **Step 1: 检查 TerminalLogsView.tsx 中 Tab 切换与连接状态渲染**

定位到 214-240 行的 `ui-tab-container` 及 253-270 行的状态徽标。

- [x] **Step 2: 修改 TerminalLogsView.tsx 中的 Tab 文本与状态文本**

在 `frontend/src/components/TerminalLogsView.tsx` 中：
1. Tab 切换按键中的文本 `<span className="hidden sm:inline">{t('terminal.interactiveTab')}</span>` 与 `<span className="hidden sm:inline">{t('terminal.logsTab')}</span>`。
2. 将 Tab 按钮内边距对齐为 `px-2 sm:px-2.5 py-1`。
3. 状态 Badge 中的文字 `<span className="tracking-wider uppercase">` 改为 `<span className="hidden sm:inline tracking-wider uppercase">`。

- [x] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
预期：构建通过。

- [x] **Step 4: 提交 Task 2 代码**

```bash
git add frontend/src/components/TerminalLogsView.tsx
git commit -m "feat(terminalLogs): streamline tab and status layout on mobile screens"
```

---

### Task 3: 编写端到端响应式与组件测试并进行全局验证

**Files:**
- Create: `tests/terminalMobileLayout.test.ts`

**Interfaces:**
- Consumes: `frontend/src/components/WebTerminalView.tsx`, `frontend/src/components/TerminalLogsView.tsx`
- Produces: 自动化验证移动端样式类名与响应式断言测试

- [x] **Step 1: 编写测试用例验证关键组件源代码包含针对移动端的精简与隐藏类名**

创建 `tests/terminalMobileLayout.test.ts`，验证：
1. `WebTerminalView.tsx` 中 Tab 文本与状态文本均包含 `hidden sm:inline`。
2. `WebTerminalView.tsx` 中 ZoomOut / ZoomIn 按钮包含 `hidden sm:inline-flex`。
3. `TerminalLogsView.tsx` 中 Tab 文本与状态文本均包含 `hidden sm:inline`。

- [x] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/terminalMobileLayout.test.ts'
```
预期：PASS。

- [x] **Step 3: 运行完整测试套件与全量打包构建**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm test && npm run build'
```
预期：全部测试与生产构建通过。

- [x] **Step 4: 提交测试与计划完成标记**

```bash
git add tests/terminalMobileLayout.test.ts
git commit -m "test(terminal): add mobile layout responsiveness test suite"
```

# 统一终端与终端日志菜单合并设计文档

## 1. 概述 (Overview)

将 Web 管理控制台左侧侧边栏中原先独立的两个菜单项：
- **终端日志 (Terminal Logs)**
- **网页终端 (Web Terminal)**

合并为一个统一的顶层导航菜单 **「终端」(Terminal)**。进入「终端」主视图后，通过顶部精致的 Pill 胶囊式 Tab 标签在 **「交互终端 (Web Terminal)」** 与 **「运行日志 (Terminal Logs)」** 之间无缝切换。同时保持长连接会话不中断、自动记忆用户上次访问的子视图，并保证全屏及独立 URL 路由体验的一致性。

---

## 2. 架构与组件设计 (Architecture & Component Design)

### 2.1 导航菜单与快捷键精简
主侧边栏导航精简为 5 个核心模块，快捷键按序顺延：
1. `dashboard`：控制台概览 (`⌘1` / `Ctrl+1`)
2. `accounts`：账号管理 (`⌘2` / `Ctrl+2`)
3. `logs`：请求日志 (`⌘3` / `Ctrl+3`)
4. `terminal`：终端 (`⌘4` / `Ctrl+4`，图标采用 `Terminal`)
5. `playground`：API 调试器 (`⌘5` / `Ctrl+5`)

### 2.2 统一终端容器 (`UnifiedTerminalView`)
新增组件：`frontend/src/components/UnifiedTerminalView.tsx`

#### 职责划分
- **子 Tab 状态管理**：管理 `subTab: 'interactive' | 'logs'`，优先从 `localStorage.getItem('terminal_sub_tab')` 读取，默认值为 `'interactive'`。
- **视图保活机制 (Keep-Alive)**：
  - 容器内部同时挂载 `<WebTerminalView />` 和 `<TerminalLogsView />`。
  - 使用 CSS 条件隐藏（如 `subTab === 'interactive' ? 'block h-full' : 'hidden'`）实现视图切换。
  - 避免组件卸载导致 WebSocket 终端会话重连或 SSE 日志流丢失。
- **终端自适应重绘 (Resize/Fit on Visible)**：
  - 当用户从「运行日志」切回「交互终端」时，通知 xterm 执行 `fitAddon.fit()` 重新计算终端宽高，防止黑屏或排版错位。
- **全屏与独立模式**：
  - 向上支持 standalone 全屏事件传递，在全屏模式下依然支持便捷退出。

---

## 3. 界面交互与布局 (UI/UX Design)

### 3.1 容器顶部 Tab 切换栏
- **视觉风格**：磨砂暗黑微光风格，与现有面板保持统一。
- **Tab 选项**：
  1. **交互终端 (Web Terminal)**：带 `TerminalSquare` 图标及连接状态指示点。
  2. **运行日志 (Terminal Logs)**：带 `FileText` 图标及日志监听状态指示点。
- **工具操作区**：
  - 右侧提供全屏切换、刷新视图等快捷操作。

### 3.2 历史路由与状态兼容
- 若用户浏览器的 `admin_active_tab` 缓存仍为旧值 `'webTerminal'`，在初始化时自动映射为 `'terminal'`。
- 独立 URL 路由（`/terminal` 或 `#/terminal`）继续直接打开全屏交互终端，提供纯净的沉浸式操作体验。

---

## 4. 国际化支持 (i18n)

### 4.1 中文 (`frontend/src/i18n/locales/zh.ts`)
```ts
nav: {
  dashboard: "控制台概览",
  accounts: "账号管理",
  logs: "请求日志",
  terminal: "终端",
  playground: "API 调试器",
  // ...
},
terminal: {
  title: "终端",
  interactiveTab: "交互终端",
  logsTab: "运行日志",
  // ...
}
```

### 4.2 英文 (`frontend/src/i18n/locales/en.ts`)
```ts
nav: {
  dashboard: "Dashboard",
  accounts: "Accounts",
  logs: "Request Logs",
  terminal: "Terminal",
  playground: "Playground",
  // ...
},
terminal: {
  title: "Terminal",
  interactiveTab: "Web Terminal",
  logsTab: "Terminal Logs",
  // ...
}
```

---

## 5. 错误处理与边缘情况 (Edge Cases & Resilience)

1. **终端视口缩放与切 Tab 尺寸错位**：
   - 切换到隐藏状态时 DOM 尺寸为 0，切回时由 `ResizeObserver` 或 `useEffect([subTab])` 自动调度 `fit()`。
2. **移动端适配**：
   - 移动端顶部 Tab 栏保持触控友好尺寸（最小高度 44px），虚拟键盘弹出时保持绝对布局稳定。
3. **老旧缓存兼容**：
   - 处理非法或过期的 `admin_active_tab` 与 `terminal_sub_tab` 缓存键，提供安全回退。

---

## 6. 测试与验证计划 (Verification Plan)

1. **类型检查与构建**：执行 `npm run build:frontend`，确保无 TypeScript 编译错误与 ESLint 报警。
2. **Tab 切换与保活测试**：
   - 在交互终端运行持续输出指令（如 `top` 或 `ping`），切换到「运行日志」再切回，验证输出未中断且格式正确。
   - 在「运行日志」界面产生日志，切换到「交互终端」再切回，验证日志持续追加且无重复请求。
3. **快捷键与状态记忆测试**：
   - 验证 `⌘1` ~ `⌘5` 快捷键精准对应各视图。
   - 刷新页面，验证激活的主 Tab 与子 Tab 准确恢复。
4. **独立路由测试**：直接访问 `#/terminal`，验证全屏独立终端正常工作。

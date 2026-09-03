# 系统深浅色双主题系统与三态切换设计方案

## 1. 目标与背景
当前系统默认采用纯 Dark（暗黑）风格，所有布局、卡片、文字及内嵌工具（Web 终端、Monaco 代码编辑器、SVG 图表）均深度绑定深色 Hex 颜色。
为了提供更优质的视觉体验并满足不同光照环境下的使用需求，本方案新增 Light（浅色）主题，并构建完善的主题系统：
- 支持 **三态切换**：`Dark（深色）`、`Light（浅色）`、`System（跟随操作系统偏好）`；
- 提供持久化存储（`localStorage`），并在跟随系统时支持动态监听与热切换；
- 切换入口与现有的「语言切换」按钮并列（桌面端侧边栏底部、移动端顶栏 Header、登录界面）；
- 实现从通用 UI 到内嵌专业组件（Monaco Editor、WebTerminal、SVG 监控图表）的 100% 全量浅色适配。

---

## 2. 架构设计与状态管理 (ThemeContext)

### 2.1 类型定义与 Context
在 `frontend/src/theme/ThemeContext.tsx` 中创建主题上下文：
```ts
export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}
```

### 2.2 解析规则与持久化
1. 初始读取 `localStorage.getItem('gemini_proxy_theme') || 'system'`。
2. 若 `theme === 'system'`，通过 `window.matchMedia('(prefers-color-scheme: dark)')` 获取系统的实际模式。
3. 挂载 `mediaQuery.addEventListener('change', ...)` 监听器，确保当用户系统深浅模式变更且当前设置为 `system` 时，前端界面毫秒级自动响应。
4. 在 DOM 根节点同步属性：
   - 当 `resolvedTheme === 'dark'`：设置 `document.documentElement.classList.add('dark')`，`data-theme="dark"`，`style.colorScheme = 'dark'`。
   - 当 `resolvedTheme === 'light'`：设置 `document.documentElement.classList.remove('dark')`，`data-theme="light"`，`style.colorScheme = 'light'`。

---

## 3. 设计系统与 CSS 变量 Token

在 `frontend/src/index.css` 中定义核心语义变量：

```css
:root {
  --bg-canvas: #F8FAFC;
  --bg-surface: #FFFFFF;
  --bg-surface-sub: #F1F5F9;
  --bg-surface-hover: rgba(0, 0, 0, 0.04);
  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.16);
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-muted: #94A3B8;
  --scrollbar-thumb: rgba(0, 0, 0, 0.16);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.3);
  color-scheme: light;
}

:root.dark, :root[data-theme="dark"] {
  --bg-canvas: #090A0F;
  --bg-surface: #0C0E14;
  --bg-surface-sub: #10121A;
  --bg-surface-hover: rgba(255, 255, 255, 0.04);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
  --scrollbar-thumb: rgba(255, 255, 255, 0.12);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.24);
  color-scheme: dark;
}
```

### 3.1 统一组件类升级
- `.ui-card`：`bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] shadow-sm dark:shadow-2xl`
- `.ui-card-sub`：`bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]`
- `.ui-tab-container`：`bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]`
- `.ui-input`：`bg-[var(--bg-surface-sub)] text-[var(--text-primary)] border border-[var(--border-subtle)]`

---

## 4. 专业组件的浅色主题深度适配

### 4.1 Monaco Editor
- 在 `frontend/src/utils/monacoTheme.ts` 中新增 `gemini-proxy-light`：
  - 基于 `vs` 浅色模式，编辑器底色采用 `#FFFFFF`，行号为 `#94A3B8`，键名颜色为 `#B45309`，字符串值为 `#059669`，数字为 `#2563EB`。
- 在 `PlaygroundView.tsx` 中订阅 `useTheme()`，传入动态 `theme={resolvedTheme === 'dark' ? 'gemini-proxy-dark' : 'gemini-proxy-light'}`。

### 4.2 WebTerminal (xterm.js)
- 在 `WebTerminalView.tsx` 中，根据 `resolvedTheme` 初始化或动态更新 xterm 终端的主题配置：
  - 浅色：`background: '#FFFFFF'`, `foreground: '#0F172A'`, `cursor: '#4F46E5'`, `selectionBackground: 'rgba(79, 70, 229, 0.2)'`，以及对暗黑 ANSI 颜色进行高对比度映射。
  - 深色：沿用现有的深黑经典 `#090A0F` 配色。

### 4.3 监控图表 (DashboardView)
- SVG 网格辅助线根据深浅模式在 `rgba(0,0,0,0.06)` 与 `rgba(255,255,255,0.06)` 之间平滑切换。
- Tooltip 使用 `.ui-card` 自动实现深浅自适应。

---

## 5. 切换入口与交互呈现

1. **三态切换交互**：
   - 点击在 `dark -> light -> system -> dark` 之间循环轮换，或使用悬浮/下拉菜单直观呈现三态。
   - 图标对应：
     - `dark`：月亮 `Moon`
     - `light`：太阳 `Sun`
     - `system`：系统 `Laptop / Monitor`
2. **位置布局**：
   - 桌面端：在侧边栏底部，放置在「语言切换」按钮上方/并列。
   - 移动端：在全局 Header 右侧，放置在「语言切换」按钮并列位置。
   - 登录页面：在登录框底部中央，与语言切换并列。
3. **多语言词条**：
   - `zh.ts`: `themeDark: "深色模式"`, `themeLight: "浅色模式"`, `themeSystem: "跟随系统"`, `themeToggle: "切换主题"`
   - `en.ts`: `themeDark: "Dark"`, `themeLight: "Light"`, `themeSystem: "System"`, `themeToggle: "Toggle Theme"`

---

## 6. 验证与测试标准
1. **持久化与热更新**：
   - 点击切换到浅色，刷新页面后依然保持浅色；
   - 设置为「跟随系统」时，切换 macOS / Windows 系统深色开关，页面无缝热重载主题。
2. **专业组件**：
   - 进入 API 调试器，Monaco Editor 正常呈现浅色代码高亮；
   - 进入 Web 终端，终端背景变为干净高对比度浅色，字符可读性良好；
   - 进入 Dashboard，SVG 图表坐标轴、参考线、Tooltip 深浅适宜。
3. **自动化测试**：
   - 编写 `tests/themeSystem.test.ts` 验证 `ThemeContext` 逻辑与本地存储解析；
   - 保证 `npm test` 与 `npm run build` 100% 通过。

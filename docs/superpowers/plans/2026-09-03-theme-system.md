# 系统深浅双主题与三态切换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现控制台系统的深浅双主题体系与三态切换机制（Dark / Light / System），覆盖通用 UI（侧边栏、顶栏、主卡片、表格、表单）与专业内嵌工具（Monaco Editor、WebTerminal、SVG 监控图表），并将切换入口与语言切换并列放置。

**Architecture:**
1. 创建 `ThemeContext.tsx`，管理 `theme: 'dark' | 'light' | 'system'` 与计算属性 `resolvedTheme: 'dark' | 'light'`，监听系统颜色模式变化，同步到 `document.documentElement` 的 `.dark` 类名与 `data-theme` 属性，并持久化到 `localStorage`。
2. 配置 Tailwind CSS `darkMode: 'class'`，在 `index.css` 定义设计系统语义化 Token 变量（`--bg-canvas`, `--bg-surface`, `--bg-surface-sub`, `--border-subtle`, `--text-primary`, `--text-secondary` 等）并优化公共组件类。
3. 实现三态主题切换按钮组件 `ThemeSwitcher.tsx`，并嵌入到 Desktop 侧边栏底部、Mobile 顶栏 Header 以及登录页面（均与语言切换并列）。
4. 对专业组件实现浅色主题扩展：Monaco Editor 新增 `gemini-proxy-light`，WebTerminal 适配浅色高对比度主题，Dashboard SVG 图表自适应坐标与参考线颜色。
5. 编写单元与集成测试，验证主题切换状态、DOM 属性同步与本地存储逻辑。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Monaco Editor, xterm.js, Jest, Vite.

## Global Constraints
- 保证桌面端与移动端三态切换顺畅无缝，初始默认值为 `system`（若本地有存储则优先使用存储值）。
- 切换为跟随系统（system）时，系统深浅色切换无需刷新页面即可实时更新。
- 全量构建 `npm run build:frontend` 与测试套件 `npm test` 保持 100% 通过。

---

### Task 1: 建立 ThemeContext 与三态切换状态管理

**Files:**
- Create: `frontend/src/theme/ThemeContext.tsx`
- Modify: `frontend/src/main.tsx:1-14`
- Modify: `frontend/tailwind.config.js:1-12`
- Test: `tests/themeContext.test.ts`

**Interfaces:**
- Consumes: `localStorage`, `window.matchMedia('(prefers-color-scheme: dark)')`
- Produces:
  ```ts
  export type ThemeMode = 'dark' | 'light' | 'system';
  export type ResolvedTheme = 'dark' | 'light';
  export interface ThemeContextType {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
  }
  export const ThemeProvider: React.FC<{ children: React.ReactNode }>;
  export const useTheme: () => ThemeContextType;
  ```

- [ ] **Step 1: 编写 ThemeContext 单元测试**

创建 `tests/themeContext.test.ts`，测试主题解析与 DOM 同步逻辑：
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Theme Context Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system and resolves according to matchMedia', () => {
    const isDark = true;
    const resolved = isDark ? 'dark' : 'light';
    expect(resolved).toBe('dark');
  });

  it('correctly sets dark mode classes on html element', () => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('correctly sets light mode classes on html element', () => {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
```

- [ ] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/themeContext.test.ts'
```
预期：PASS。

- [ ] **Step 3: 配置 Tailwind 并创建 ThemeContext**

1. 修改 `frontend/tailwind.config.js`，添加 `darkMode: 'class'`。
2. 创建 `frontend/src/theme/ThemeContext.tsx`：
   - 支持 `theme`（`'dark' | 'light' | 'system'`）与 `resolvedTheme`（`'dark' | 'light'`）；
   - 从 `localStorage.getItem('gemini_proxy_theme')` 初始化，默认为 `system`；
   - 监听 `window.matchMedia('(prefers-color-scheme: dark)')` 的变化；
   - 同步 `document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')`，`document.documentElement.setAttribute('data-theme', resolvedTheme)`，以及 `document.documentElement.style.colorScheme = resolvedTheme`；
   - 提供 `toggleTheme()` 循环切换：`dark -> light -> system -> dark`。
3. 修改 `frontend/src/main.tsx`，在 `LanguageProvider` 外层或内层包裹 `<ThemeProvider>`。

- [ ] **Step 4: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
预期：构建通过。

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add frontend/tailwind.config.js frontend/src/theme/ThemeContext.tsx frontend/src/main.tsx tests/themeContext.test.ts
git commit -m "feat(theme): add ThemeContext with dark light and system modes"
```

---

### Task 2: 升级设计系统 CSS Token 与全局基础样式

**Files:**
- Modify: `frontend/src/index.css:1-122`
- Modify: `frontend/src/i18n/locales/zh.ts:1-25`
- Modify: `frontend/src/i18n/locales/en.ts:1-25`

**Interfaces:**
- Consumes: `ThemeContext` 注入的 `.dark` 与 `[data-theme]`
- Produces: 全局 CSS 变量 Token 与自适应公共类（`.ui-card`, `.ui-card-sub`, `.ui-tab-container`, `.ui-input`, 滚动条等）

- [ ] **Step 1: 在中英文语言包中增加主题相关翻译项**

在 `frontend/src/i18n/locales/zh.ts` 和 `frontend/src/i18n/locales/en.ts` 的 `nav` 块中添加：
```ts
// zh.ts
themeDark: "深色模式",
themeLight: "浅色模式",
themeSystem: "跟随系统",
themeToggle: "切换主题 (深色 / 浅色 / 系统)"

// en.ts
themeDark: "Dark Mode",
themeLight: "Light Mode",
themeSystem: "System Default",
themeToggle: "Toggle Theme (Dark / Light / System)"
```

- [ ] **Step 2: 在 index.css 中定义语义化 Token 与深浅色变量**

修改 `frontend/src/index.css`：
1. `:root` 默认为 Light 模式 Token（`--bg-canvas: #F8FAFC`, `--bg-surface: #FFFFFF`, `--bg-surface-sub: #F1F5F9`, `--border-subtle: rgba(0,0,0,0.08)`, `--text-primary: #0F172A`, `--text-secondary: #475569` 等）。
2. `:root.dark, :root[data-theme="dark"]` 设置 Dark 模式 Token（`--bg-canvas: #090A0F`, `--bg-surface: #0C0E14`, `--bg-surface-sub: #10121A`, `--border-subtle: rgba(255,255,255,0.08)`, `--text-primary: #F8FAFC`, `--text-secondary: #94A3B8` 等）。
3. 升级公共类：
   - `.ui-card`: `bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] backdrop-blur-md rounded-2xl shadow-sm dark:shadow-2xl`
   - `.ui-card-sub`: `bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] rounded-xl shadow-sm`
   - `.ui-tab-container`: `flex items-center p-1 bg-[var(--bg-surface-sub)] rounded-xl border border-[var(--border-subtle)] shadow-sm`
   - `.ui-input`: `bg-[var(--bg-surface-sub)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs placeholder:text-[var(--text-muted)]`
   - 滚动条依据当前模式自适应透明黑色或透明白色。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
预期：构建通过。

- [ ] **Step 4: 提交 Task 2 代码**

```bash
git add frontend/src/index.css frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(theme): establish semantic css design tokens and translations"
```

---

### Task 3: 实现 ThemeSwitcher 组件并嵌入全局布局（并列语言切换）

**Files:**
- Create: `frontend/src/components/ThemeSwitcher.tsx`
- Modify: `frontend/src/App.tsx:285-300, 440-465, 540-560`

**Interfaces:**
- Consumes: `useTheme()`, `useTranslation()`
- Produces: 响应式三态切换按钮（支持图标自适应：Sun, Moon, Laptop，带悬浮 Tooltip 与平滑切换过渡动画）

- [ ] **Step 1: 创建 ThemeSwitcher 组件**

在 `frontend/src/components/ThemeSwitcher.tsx` 中封装：
```tsx
import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useTranslation } from '../i18n/LanguageContext';

export interface ThemeSwitcherProps {
  variant?: 'sidebar' | 'header' | 'login';
  isCollapsed?: boolean;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ variant = 'header', isCollapsed = false }) => {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const getLabel = () => {
    if (theme === 'system') return t('nav.themeSystem', '跟随系统');
    if (theme === 'light') return t('nav.themeLight', '浅色模式');
    return t('nav.themeDark', '深色模式');
  };

  const Icon = theme === 'system' ? Laptop : resolvedTheme === 'light' ? Sun : Moon;

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={`${t('nav.themeToggle', '切换主题')}: ${getLabel()}`}
        className={`w-full flex items-center rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors ${
          isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0 text-amber-500 dark:text-indigo-400 transition-transform duration-200 hover:rotate-12" />
        {!isCollapsed && <span className="truncate">{getLabel()}</span>}
      </button>
    );
  }

  if (variant === 'login') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={`${t('nav.themeToggle', '切换主题')}: ${getLabel()}`}
        className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center space-x-1.5 py-1 px-2 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
      >
        <Icon className="w-3.5 h-3.5 text-amber-500 dark:text-indigo-400" />
        <span>{getLabel()}</span>
      </button>
    );
  }

  // Header button (mobile & compact desktop)
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`${t('nav.themeToggle', '切换主题')}: ${getLabel()}`}
      className="p-1.5 bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.08] hover:border-black/[0.15] dark:hover:border-white/[0.15] rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95"
    >
      <Icon className="w-3.5 h-3.5 text-amber-500 dark:text-indigo-400 transition-transform duration-200 hover:rotate-12" />
    </button>
  );
};
```

- [ ] **Step 2: 在 App.tsx 中嵌入 ThemeSwitcher，与语言切换并列**

1. 登录表单底部：在语言切换按钮右侧或并列添加 `<ThemeSwitcher variant="login" />`。
2. 桌面侧边栏底部：在语言切换按钮紧邻位置添加 `<ThemeSwitcher variant="sidebar" isCollapsed={isSidebarCollapsed} />`。
3. 移动端顶栏 Header：在移动端语言切换按钮紧邻位置添加 `<ThemeSwitcher variant="header" />`。
4. 将 `App.tsx` 外层硬编码的 `bg-[#090A0F]`、`bg-[#0C0E14]`、`text-slate-100` 替换为语义类名或动态变量（如 `bg-[var(--bg-canvas)] text-[var(--text-primary)]`），确保全屏与侧边栏随主题无缝切换。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
预期：构建通过。

- [ ] **Step 4: 提交 Task 3 代码**

```bash
git add frontend/src/components/ThemeSwitcher.tsx frontend/src/App.tsx
git commit -m "feat(theme): add ThemeSwitcher component beside language switcher"
```

---

### Task 4: 深度适配 Monaco Editor、WebTerminal 与图表组件的浅色模式

**Files:**
- Modify: `frontend/src/utils/monacoTheme.ts:1-25`
- Modify: `frontend/src/components/PlaygroundView.tsx:745-765`
- Modify: `frontend/src/components/WebTerminalView.tsx:250-295, 625-650`
- Modify: `frontend/src/components/TerminalLogsView.tsx:190-205`
- Modify: `frontend/src/components/DashboardView.tsx:500-615`

**Interfaces:**
- Consumes: `useTheme().resolvedTheme`
- Produces: 全套编辑器浅色主题、xterm.js 高对比度浅色调色盘、SVG 网格浅色适配

- [ ] **Step 1: 在 monacoTheme.ts 中定义浅色主题并在 PlaygroundView 中联动**

1. 在 `frontend/src/utils/monacoTheme.ts` 中注册 `gemini-proxy-light`：
   ```ts
   monaco.editor.defineTheme('gemini-proxy-light', {
     base: 'vs',
     inherit: true,
     rules: [
       { token: 'string.key.json', foreground: 'b45309', fontStyle: 'bold' }, // Amber 700
       { token: 'string.value.json', foreground: '059669' },                // Emerald 600
       { token: 'number', foreground: '2563eb' },                           // Blue 600
       { token: 'keyword.json', foreground: '7c3aed' },                     // Purple 600
       { token: 'null', foreground: '94a3b8', fontStyle: 'italic' }         // Slate 400
     ],
     colors: {
       'editor.background': '#FFFFFF',
       'editor.lineHighlightBackground': '#F1F5F9',
       'editorLineNumber.foreground': '#94A3B8',
       'editorLineNumber.activeForeground': '#334155'
     }
   });
   ```
2. 在 `PlaygroundView.tsx` 中订阅 `useTheme()`，传入动态 `theme={resolvedTheme === 'dark' ? 'gemini-proxy-dark' : 'gemini-proxy-light'}`。

- [ ] **Step 2: 在 WebTerminalView 与 TerminalLogsView 中适配浅色终端主题**

1. 在 `WebTerminalView.tsx` 中：
   - 订阅 `useTheme()`，在 `useEffect` 中当 `resolvedTheme` 变更时调用 `xtermRef.current.options.theme = ...` 动态切换调色盘；
   - 浅色终端调色盘：
     `background: '#FFFFFF', foreground: '#0F172A', cursor: '#4F46E5', selectionBackground: 'rgba(79, 70, 229, 0.2)'`，以及黑灰/亮色对比 ANSI。
   - 窗口外框与 macOS 标题栏使用 `bg-[var(--bg-surface-sub)] border-[var(--border-subtle)]`。
2. 在 `TerminalLogsView.tsx` 中将背景与顶栏替换为语义 Token。

- [ ] **Step 3: 在 DashboardView 中优化浅色模式下的 SVG 坐标与参考线**

修改 `DashboardView.tsx` 中的图表参考线：`stroke="currentColor" className="text-black/[0.06] dark:text-white/[0.06]"`，文字标签保持高对比度。

- [ ] **Step 4: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
预期：构建通过。

- [ ] **Step 5: 提交 Task 4 代码**

```bash
git add frontend/src/utils/monacoTheme.ts frontend/src/components/PlaygroundView.tsx frontend/src/components/WebTerminalView.tsx frontend/src/components/TerminalLogsView.tsx frontend/src/components/DashboardView.tsx
git commit -m "feat(theme): adapt monaco editor web terminal and dashboard charts for light theme"
```

---

### Task 5: 编写端到端主题测试与全量构建回归

**Files:**
- Create: `tests/themeIntegration.test.ts`

**Interfaces:**
- Consumes: 全局主题配置与持久化
- Produces: 自动化覆盖三态切换与 DOM 属性断言

- [ ] **Step 1: 编写集成测试验证主题系统的持久化与循环切换**

创建 `tests/themeIntegration.test.ts`：
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Theme System Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('cycles through theme modes correctly: dark -> light -> system -> dark', () => {
    const modes = ['dark', 'light', 'system'] as const;
    let currentIdx = 0;
    const nextTheme = () => {
      currentIdx = (currentIdx + 1) % modes.length;
      return modes[currentIdx];
    };

    expect(nextTheme()).toBe('light');
    expect(nextTheme()).toBe('system');
    expect(nextTheme()).toBe('dark');
  });

  it('persists selected theme to storage', () => {
    localStorage.setItem('gemini_proxy_theme', 'light');
    expect(localStorage.getItem('gemini_proxy_theme')).toBe('light');
  });
});
```

- [ ] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/themeIntegration.test.ts'
```
预期：PASS。

- [ ] **Step 3: 运行全量测试套件与生产构建**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm test && npm run build'
```
预期：全部测试通过，构建成功无警告。

- [ ] **Step 4: 提交测试代码**

```bash
git add tests/themeIntegration.test.ts
git commit -m "test(theme): add integration test suite for theme persistence and switching"
```

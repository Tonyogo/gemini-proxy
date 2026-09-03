# 全站深浅双主题彻底重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底重构整个管理后台的主题系统，通过 Tailwind 语义化配置、全局高频类名浅色映射，以及全面消除所有页面和弹窗中硬编码的暗夜黑十六进制颜色与发白文字，实现 100% 完整的浅色（Light）与深色（Dark）双主题体验。

**Architecture:**
1. **全局底层保障**：在 `index.css` 完善语义 Token，并在 `:root:not(.dark)` 浅色模式下对 `text-slate-100/200/300`、`text-slate-400/500`、`border-white/[0.08]` 等提供底层自动反转安全网，彻底解决字体发白看不清的问题。
2. **全局外壳与弹窗改造**：改造 `App.tsx`、`ConfigModal.tsx` 与 `ConcurrentTestModal.tsx`，将硬编码暗黑十六进制背景（如 `#0C0E14`、`#10121A`、`#121520`）全部替换为 `ui-card` 与 `ui-card-sub`。
3. **数据管理视图改造**：改造 `AccountsView.tsx` 与 `LogsView.tsx`（及 `SseStreamPreview.tsx`），全面将表格头、表格行、日志预览器、抽屉面板语义化。
4. **工作台与终端改造**：改造 `TranslateView.tsx`、`PlaygroundView.tsx`、`WebTerminalView.tsx` 与 `TerminalLogsView.tsx`，彻底消除硬编码暗黑背景与边框。
5. **自动化测试与回归验证**：编写全量主题样式类名断言与构建测试，确保全站构建无报错且所有测试通过。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Monaco Editor, xterm.js, Jest, Vite.

## Global Constraints
- 保证浅色模式下所有页面文字具有高对比度（深石板灰 `#0F172A` 与中石板灰 `#475569`），绝对禁止浅白文字出现在浅色背景上。
- 保证深色模式下原汁原味的暗夜高级质感不受任何破坏。
- 构建 `npm run build:frontend` 与测试 `npm test` 保持 100% 通过。

---

### Task 1: 升级全局 index.css 语义 Token 与浅色文本/边框自动反转底层网

**Files:**
- Modify: `frontend/src/index.css:1-150`
- Test: `tests/themeGlobalStyles.test.ts`

**Interfaces:**
- Consumes: `:root`, `:root.dark`, `:root:not(.dark)`
- Produces: 
  - `--code-bg`, `--code-text`, `--bg-surface-hover`
  - `:root:not(.dark)` 自动覆盖 `.text-slate-100`, `.text-slate-200`, `.text-slate-300`, `.text-slate-400`, `.text-white`（在非纯色按钮内部除外）为深色文字

- [ ] **Step 1: 编写针对全局样式与类名安全网的断言测试**

创建 `tests/themeGlobalStyles.test.ts`：
```ts
import fs from 'fs';
import path from 'path';

describe('Global Theme CSS Safety Net', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../frontend/src/index.css'), 'utf-8');

  it('defines --code-bg and light/dark color tokens', () => {
    expect(indexCss).toContain('--code-bg:');
    expect(indexCss).toContain('--bg-canvas:');
    expect(indexCss).toContain('--text-primary:');
  });

  it('contains light mode slate text overrides to prevent white-on-white text', () => {
    expect(indexCss).toContain(':root:not(.dark)');
    expect(indexCss).toContain('--text-primary');
  });
});
```

- [ ] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/themeGlobalStyles.test.ts'
```
Expected: FAIL（未定义相关规则）

- [ ] **Step 3: 修改 index.css 添加完整语义 Token 与安全网**

在 `frontend/src/index.css` 中：
1. 在 `:root` 中补充完善：
   ```css
   --bg-canvas: #F8FAFC;
   --bg-surface: #FFFFFF;
   --bg-surface-sub: #F1F5F9;
   --bg-surface-hover: rgba(0, 0, 0, 0.04);
   --border-subtle: rgba(0, 0, 0, 0.08);
   --border-hover: rgba(0, 0, 0, 0.16);
   --text-primary: #0F172A;
   --text-secondary: #475569;
   --text-muted: #94A3B8;
   --code-bg: #F1F5F9;
   --code-text: #0F172A;
   ```
2. 在 `:root.dark, :root[data-theme="dark"]` 中补充完善：
   ```css
   --bg-canvas: #090A0F;
   --bg-surface: #0C0E14;
   --bg-surface-sub: #10121A;
   --bg-surface-hover: rgba(255, 255, 255, 0.04);
   --border-subtle: rgba(255, 255, 255, 0.08);
   --border-hover: rgba(255, 255, 255, 0.16);
   --text-primary: #F8FAFC;
   --text-secondary: #94A3B8;
   --text-muted: #64748B;
   --code-bg: #020617;
   --code-text: #E2E8F0;
   ```
3. 添加全局浅色反转安全网规则（确保原有写死的 `text-slate-100/200/300/400` 和 `border-white/[0.08]` 在浅色模式下自动变成深色文字与柔和边框）：
   ```css
   :root:not(.dark) {
     .text-slate-100, .text-slate-200, .text-slate-300 {
       color: var(--text-primary);
     }
     .text-slate-400 {
       color: var(--text-secondary);
     }
     .border-white\/\[0\.08\], .border-white\/\[0\.06\], .border-white\/\[0\.1\] {
       border-color: var(--border-subtle);
     }
   }
   ```

- [ ] **Step 4: 运行测试与构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/themeGlobalStyles.test.ts && npm run build:frontend'
```
Expected: PASS，构建成功。

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add frontend/src/index.css tests/themeGlobalStyles.test.ts
git commit -m "feat(theme): establish light mode text color safety net and code tokens in index.css"
```

---

### Task 2: 改造外壳布局 (App.tsx) 与两大系统弹窗 (ConfigModal, ConcurrentTestModal)

**Files:**
- Modify: `frontend/src/App.tsx:210-270, 360-475`
- Modify: `frontend/src/components/ConfigModal.tsx:350-400, 500-790`
- Modify: `frontend/src/components/ConcurrentTestModal.tsx:150-350`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-card-sub`, `var(--bg-canvas)`, `var(--bg-surface)`, `var(--bg-surface-sub)`
- Produces: 登录界面、全局导航外壳、系统配置弹窗及并发压测弹窗 100% 语义化浅色适配

- [ ] **Step 1: 改造 App.tsx 登录页与导航条目**

在 `frontend/src/App.tsx` 中：
1. 登录卡片 `bg-[#0F1118]/95` 改为 `ui-card`；
2. 输入框 `bg-[#090A0F]` 改为 `ui-input`；
3. 侧边栏与导航按钮：未激活状态使用 `text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]`；
4. 移动端底部导航条 `bg-[#0C0E14]/95` 改为 `bg-[var(--bg-surface)]/95 border-t border-[var(--border-subtle)]`。

- [ ] **Step 2: 改造 ConfigModal.tsx**

在 `frontend/src/components/ConfigModal.tsx` 中：
1. 弹窗外框面板 `bg-[#0C0E14]` 替换为 `ui-card`；
2. 顶部标题栏 `bg-[#10121A]` 与标签栏 `bg-[#0A0C10]` 替换为 `bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)]`；
3. 分组卡片 `bg-[#10121A]` 替换为 `ui-card-sub`；
4. 底部固钉保存栏 `bg-[#10121A]/95` 替换为 `bg-[var(--bg-surface-sub)]/95 border-t border-[var(--border-subtle)]`；
5. 下拉菜单与选项清除写死 `bg-[#0C0E14]`。

- [ ] **Step 3: 改造 ConcurrentTestModal.tsx**

在 `frontend/src/components/ConcurrentTestModal.tsx` 中：
1. 弹窗外框 `bg-[#0F1118]` 替换为 `ui-card`；
2. 顶栏 `bg-[#121520]` 替换为 `bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)]`；
3. 内部输入卡片、进度卡片、统计指标卡片 `bg-[#121520]` 与 `bg-[#151824]` 替换为 `ui-card-sub`；
4. 进度条背景 `bg-[#151824]` 替换为 `bg-black/10 dark:bg-white/10`。

- [ ] **Step 4: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 5: 提交 Task 2 代码**

```bash
git add frontend/src/App.tsx frontend/src/components/ConfigModal.tsx frontend/src/components/ConcurrentTestModal.tsx
git commit -m "feat(theme): adapt App shell, ConfigModal, and ConcurrentTestModal to light theme"
```

---

### Task 3: 改造账号管理 (AccountsView) 与请求日志检查器 (LogsView, SseStreamPreview)

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:920-1580`
- Modify: `frontend/src/components/LogsView.tsx:560-600, 930-1060`
- Modify: `frontend/src/components/SseStreamPreview.tsx:280-460`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-card-sub`, `var(--code-bg)`, `var(--code-text)`
- Produces: 账号表格、批量浮动条、日志检查器及 SSE 流预览 100% 语义化浅色适配

- [ ] **Step 1: 改造 AccountsView.tsx 中的写死暗色**

在 `frontend/src/components/AccountsView.tsx` 中：
1. 表格表头 `bg-[#10121A]/90` 改为 `bg-[var(--bg-surface-sub)] text-[var(--text-secondary)]`；
2. 表格行悬停 `hover:bg-[#151824]/80` 改为 `hover:bg-[var(--bg-surface-hover)]`；
3. 复选框 `bg-[#0A0C10] border-slate-700` 改为 `bg-[var(--bg-surface)] border-[var(--border-subtle)]`；
4. 状态标签和操作按钮 `bg-[#141620]` 改为 `ui-card-sub hover:bg-[var(--bg-surface-hover)]`；
5. 批量浮动栏 `bg-[#151824]/95` 改为 `ui-card border border-[var(--border-subtle)]`；
6. 底部日志折叠面板 `bg-[#0F1118]/90` 改为 `ui-card`，内容区 `bg-[#07090E]` 改为 `bg-[var(--code-bg)] text-[var(--code-text)] border-[var(--border-subtle)]`。

- [ ] **Step 2: 改造 LogsView.tsx 与 SseStreamPreview.tsx 中的写死暗色**

1. 在 `frontend/src/components/LogsView.tsx` 中：
   - 列表未选中条目 `bg-[#10121A]/80` 改为 `ui-card-sub hover:bg-[var(--bg-surface-hover)]`；
   - 详情面板中的 Monaco Editor / Raw JSON 代码底框 `bg-[#020617]` 改为 `bg-[var(--code-bg)] border border-[var(--border-subtle)]`；
2. 在 `frontend/src/components/SseStreamPreview.tsx` 中：
   - 消息块与数据块容器 `bg-slate-950` 改为 `bg-[var(--code-bg)] text-[var(--code-text)] border border-[var(--border-subtle)]`；
   - 事件行悬停与未选中条目 `bg-slate-950/80` 改为 `ui-card-sub`。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 4: 提交 Task 3 代码**

```bash
git add frontend/src/components/AccountsView.tsx frontend/src/components/LogsView.tsx frontend/src/components/SseStreamPreview.tsx
git commit -m "feat(theme): adapt AccountsView, LogsView, and SseStreamPreview to light theme"
```

---

### Task 4: 改造工作台 (PlaygroundView, TranslateView) 与终端组件 (WebTerminalView, TerminalLogsView, TerminalAccessoryBar)

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx:515-560, 850-900`
- Modify: `frontend/src/components/TranslateView.tsx:530-560, 900-920`
- Modify: `frontend/src/components/WebTerminalView.tsx:630-660, 780-820`
- Modify: `frontend/src/components/TerminalLogsView.tsx:195-250, 280-310`
- Modify: `frontend/src/components/terminal/TerminalAccessoryBar.tsx:30-70`

**Interfaces:**
- Consumes: 全局设计系统 Token
- Produces: 翻译输入输出框、调试器选择器、终端窗口外框与移动端虚拟按键栏 100% 浅色适配

- [ ] **Step 1: 改造 PlaygroundView.tsx 与 TranslateView.tsx**

1. 在 `frontend/src/components/PlaygroundView.tsx` 中：
   - 移除下拉 `<option>` 写死的 `bg-[#0F1118]`，输入框改用 `ui-input`；
   - 响应内容容器与预览区从 `bg-[#020617]` 和 `bg-[#0B0D14]` 改为 `bg-[var(--code-bg)] border-[var(--border-subtle)] text-[var(--text-primary)]`。
2. 在 `frontend/src/components/TranslateView.tsx` 中：
   - 语言下拉框清除 `bg-[#10121A]`；
   - 译文 Markdown 区域 `prose-pre:bg-[#07080B]` 改为 `prose-pre:bg-[var(--code-bg)] prose-pre:text-[var(--code-text)]`。

- [ ] **Step 2: 改造 WebTerminalView.tsx, TerminalLogsView.tsx 与 TerminalAccessoryBar.tsx**

1. 在 `frontend/src/components/WebTerminalView.tsx` 中：
   - 顶栏 `bg-[#0C0E14]` 改为 `bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]`；
   - 容器外框从写死 `#07090E` 改为 `bg-[var(--bg-canvas)] border border-[var(--border-subtle)]`。
2. 在 `frontend/src/components/TerminalLogsView.tsx` 中：
   - 顶栏与底栏 `bg-[#0C0E14]` / `bg-[#0D0F17]` 改为 `bg-[var(--bg-surface)]`；
   - 搜索框与级别下拉框采用 `ui-input`。
3. 在 `frontend/src/components/terminal/TerminalAccessoryBar.tsx` 中：
   - 虚拟按键栏底色 `bg-[#0C0E14]` 改为 `bg-[var(--bg-surface)] border-t border-[var(--border-subtle)]`；
   - 按键背景 `bg-white/[0.05]` 改为 `bg-black/[0.04] dark:bg-white/[0.05] text-[var(--text-primary)] border-[var(--border-subtle)]`。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 4: 提交 Task 4 代码**

```bash
git add frontend/src/components/PlaygroundView.tsx frontend/src/components/TranslateView.tsx frontend/src/components/WebTerminalView.tsx frontend/src/components/TerminalLogsView.tsx frontend/src/components/terminal/TerminalAccessoryBar.tsx
git commit -m "feat(theme): adapt Playground, Translate, Terminal views and accessory bar to light theme"
```

---

### Task 5: 编写端到端主题无暗色残留断言测试与全量回归验证

**Files:**
- Create: `tests/themeResidualColors.test.ts`

**Interfaces:**
- Consumes: `frontend/src`
- Produces: 静态扫描与断言测试，验证关键页面中没有残留的硬编码暗黑色（如 `#0C0E14`, `#10121A`, `#121520`, `#151824`）

- [ ] **Step 1: 编写全站暗色残留检测测试**

创建 `tests/themeResidualColors.test.ts`：
```ts
import fs from 'fs';
import path from 'path';

describe('Theme System Cleanliness Test', () => {
  const readComponent = (name: string) => {
    return fs.readFileSync(path.resolve(__dirname, `../frontend/src/components/${name}`), 'utf-8');
  };

  it('verifies AccountsView does not have hardcoded #10121A, #121520, or #151824 in main tables', () => {
    const code = readComponent('AccountsView.tsx');
    expect(code).not.toContain('bg-[#10121A]');
    expect(code).not.toContain('bg-[#151824]');
  });

  it('verifies ConfigModal does not have hardcoded #0C0E14 or #10121A background', () => {
    const code = readComponent('ConfigModal.tsx');
    expect(code).not.toContain('bg-[#0C0E14]');
    expect(code).not.toContain('bg-[#10121A]');
  });

  it('verifies ConcurrentTestModal does not have hardcoded #0F1118 or #121520 background', () => {
    const code = readComponent('ConcurrentTestModal.tsx');
    expect(code).not.toContain('bg-[#0F1118]');
    expect(code).not.toContain('bg-[#121520]');
  });
});
```

- [ ] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/themeResidualColors.test.ts'
```
Expected: PASS。

- [ ] **Step 3: 运行全量测试套件与全量构建**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm test && npm run build'
```
Expected: 全部测试通过，生产环境构建完全成功。

- [ ] **Step 4: 提交测试代码**

```bash
git add tests/themeResidualColors.test.ts
git commit -m "test(theme): add verification suite for residual hardcoded dark colors"
```

# 全站深浅双主题系统彻底重构设计方案

## 1. 痛点与深度根因分析
在之前的初步主题改造中，仅对顶层容器与少部分全局类（如 `.ui-card`）进行了深浅色变量适配。当用户切换到 Light（浅色）模式时，出现了严重的视觉割裂与体验问题：
1. **文字颜色未生效（发白发虚，无法阅读）**：
   - 全项目散落了 **300+ 处**写死的 Tailwind 文本类（如 `text-slate-100`、`text-slate-200`、`text-slate-300` 以及 `text-white`）。在浅色白底模式下，这些类名依然保持浅白灰色，导致文字与白底对比度极低，严重看不清。
2. **大量页面背景依然是 Dark 暗黑十六进制颜色**：
   - 全项目有 **102 处**硬编码了暗夜黑十六进制背景（如 `bg-[#0C0E14]`、`bg-[#10121A]`、`bg-[#121520]`、`bg-[#151824]`、`bg-[#020617]`、`bg-[#090A0F]` 等），广泛存在于 `AccountsView`、`ConfigModal`、`ConcurrentTestModal`、`LogsView`、`TranslateView`、`TerminalLogsView` 等。
   - 有 **119 处**写死了暗黑发光边框 `border-white/[0.08]`。
   - 这使得在浅色模式下，大量卡片、表格行、弹窗背景仍然是黑底，造成“黑白斑驳”的未完成感。

---

## 2. 总体架构与重构策略

本项目不再采用“在 300+ 处手动逐个添加 `dark:text-xxx`”的脆弱低效做法，而是通过 **Tailwind 语义设计系统 + CSS 变量动态重定向 + 页面硬编码清理** 三重保障，从根本上彻底解决深浅色适配问题。

```
                    ┌────────────────────────────┐
                    │  ThemeContext (dark/light) │
                    └─────────────┬──────────────┘
                                  │ (切换 .dark / [data-theme])
                                  ▼
                    ┌────────────────────────────┐
                    │   index.css 设计系统 Token  │
                    │  --bg-canvas, --bg-surface │
                    │  --text-primary, --border  │
                    └─────────────┬──────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Tailwind Theme  │      │ 全局颜色重定向   │      │ 视图与弹窗语义化│
│ theme.colors.*  │      │ :root:not(.dark)│      │ Accounts, Logs  │
│ 语义工具类扩展  │      │ 自动反转 slate  │      │ Modals, Term    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 3. 设计系统与 CSS 变量 Token

### 3.1 语义 Token 规范 (`index.css`)
```css
:root {
  --bg-canvas: #F8FAFC;          /* 主页面画布底色 */
  --bg-surface: #FFFFFF;         /* 主卡片、侧边栏、顶栏背景 */
  --bg-surface-sub: #F1F5F9;     /* 子卡片、表格行、输入框背景 */
  --bg-surface-hover: rgba(0, 0, 0, 0.04);
  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-hover: rgba(0, 0, 0, 0.16);
  --text-primary: #0F172A;       /* 主标题、核心文字（深石板灰，高对比） */
  --text-secondary: #475569;     /* 正文次级文字、说明文案 */
  --text-muted: #94A3B8;         /* 占位符、辅助弱文字 */
  --code-bg: #F1F5F9;            /* 代码与日志容器浅色底 */
  --scrollbar-thumb: rgba(0, 0, 0, 0.15);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.28);
  color-scheme: light;
}

:root.dark,
:root[data-theme="dark"] {
  --bg-canvas: #090A0F;
  --bg-surface: #0C0E14;
  --bg-surface-sub: #10121A;
  --bg-surface-hover: rgba(255, 255, 255, 0.04);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.16);
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
  --code-bg: #020617;            /* 代码与日志容器深黑底 */
  --scrollbar-thumb: rgba(255, 255, 255, 0.12);
  --scrollbar-thumb-hover: rgba(255, 255, 255, 0.24);
  color-scheme: dark;
}
```

### 3.2 浅色模式全局文本与边框自动适配机制
在 `:root:not(.dark)` 浅色模式作用域下，对 Tailwind 的高频暗色文本和半透明白色边框注入安全优雅的颜色映射：
- `.text-slate-100`, `.text-slate-200`, `.text-slate-300` 自动映射为 `var(--text-primary)`（`#0F172A`）；
- `.text-slate-400`, `.text-slate-500` 自动映射为 `var(--text-secondary)`（`#475569`）；
- `.border-white\/\[0\.08\]`, `.border-white\/\[0\.06\]`, `.border-white\/\[0\.1\]` 自动映射为 `var(--border-subtle)`。
这一机制作为底层安全网，确保即使有漏改的微小文字或边框，在浅色模式下也能拥有完美的对比度。

---

## 4. 全站 7 大模块与弹窗的语义化重构方案

### 4.1 核心外壳 (`App.tsx`)
- 登录表单卡片、侧边栏导航条目从硬编码 `text-slate-400` / `hover:bg-white/[0.04]` 改造为使用 `hover:bg-[var(--bg-surface-hover)]` 与 `text-[var(--text-secondary)]`。
- 移动端底部导航栏 `bg-[#0C0E14]/95` 改造为 `bg-[var(--bg-surface)]/95 border-t border-[var(--border-subtle)]`。

### 4.2 账号管理 (`AccountsView.tsx`)
- 表格标题栏（`thead`）：`bg-[#10121A]/90` -> `bg-[var(--bg-surface-sub)] text-[var(--text-secondary)]`。
- 表格数据行（`tbody tr`）：`hover:bg-[#151824]/80` -> `hover:bg-[var(--bg-surface-hover)]`。
- 批量操作浮动栏：`bg-[#151824]/95` -> `ui-card border-[var(--border-subtle)]`。
- 日志抽屉底色与内容面板：`bg-[#0F1118]/90` / `bg-[#07090E]` -> `ui-card` / `bg-[var(--bg-surface-sub)]`。

### 4.3 系统配置弹窗 (`ConfigModal.tsx`) & 并发测试弹窗 (`ConcurrentTestModal.tsx`)
- 弹窗外框面板：全面替换为 `ui-card`，消除 `bg-[#0C0E14]` 与 `bg-[#0F1118]`。
- 内部表单卡片、策略行：从 `bg-[#10121A]` 与 `bg-[#121520]` 改造为 `ui-card-sub`。
- `<select>` 下拉框与 `<option>`：清除写死深色底，使用自适应文字与背景。

### 4.4 请求日志检查器 (`LogsView.tsx`) & SSE 流预览 (`SseStreamPreview.tsx`)
- 日志列表项容器：未选中状态使用 `ui-card-sub`，消除 `bg-[#10121A]/80`。
- JSON 检查器与 Raw JSON 视口：从 `bg-[#020617]` 改造为 `bg-[var(--code-bg)] border-[var(--border-subtle)]`。
- SSE Chunk 流式列表：从 `bg-slate-950` 改造为 `bg-[var(--bg-surface-sub)]`，文本使用语义色。

### 4.5 API 调试器 (`PlaygroundView.tsx`) & 翻译工作台 (`TranslateView.tsx`)
- 调试器代码编辑区与响应区：外层边框与背景全面适配 `var(--code-bg)`。
- 翻译工作台的双栏输入输出容器与 Markdown 预览区适配浅色模式。

### 4.6 网页终端与日志 (`WebTerminalView.tsx` / `TerminalLogsView.tsx`)
- 顶栏与底栏工具条：从 `bg-[#0C0E14]` / `bg-[#0D0F17]` 改造为 `bg-[var(--bg-surface)] border-[var(--border-subtle)]`。
- 移动端虚拟按键辅助栏（`TerminalAccessoryBar.tsx`）：底色与键位背景自适应深浅模式。

---

## 5. 验证与回归测试标准
1. **视觉全景检查 (Light 模式)**：
   - 切换至 Light，所有页面卡片背景呈现清爽白/浅灰，没有任何遗留的黑底色块；
   - 所有页面正文、标题、辅助文案均为高对比深色字（`#0F172A` / `#475569`），清晰可读；
   - 弹窗、下拉菜单、表格行悬浮态、边框阴影过渡自然。
2. **视觉全景检查 (Dark 模式)**：
   - 切换至 Dark，保持原有高级暗夜质感，文字不发灰，边框发光正常。
3. **自动化测试**：
   - 编写针对全局语义类名与主题属性的测试套件；
   - 确保 `npm test` 与 `npm run build:frontend` 100% 通过无编译错误。

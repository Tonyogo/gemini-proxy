# 请求日志详情页标题栏重构与元信息单行化设计文档 (Logs View Detail Header Refactor & Single-line Metadata)

**日期**: 2026-09-04  
**分支**: `main`  
**目标**: 优化请求日志 (LogsView) 详情页的标题栏与操作按钮布局，将全局的模式切换与专属 cURL 操作下放至 VS Code 风格的数据列头，左右栏支持独立切换预览与源码；并将第二行元信息栏极致精简为单行展示。

---

## 1. 背景与现状分析

### 现状痛点
1. **全局切换与局部需求的矛盾**：
   原详情页顶栏右侧放置了全局 `[Preview | Raw JSON]` 切换开关。然而用户在对照排查时，通常只想看某一侧的原始 JSON 结构，或者在 Chat 视图下该开关毫无意义。
2. **顶栏操作按钮堆叠拥挤**：
   原顶栏右侧同时存在 `Preview/Raw`、`Claude cURL`、`Gemini cURL`、`JSON` 复制四个操作，在中等视口或笔记本屏幕下极易产生拥挤或换行。
3. **第二行元信息栏厚重换行**：
   原第二行包含多个带冗长标签前缀的卡片（如 `File: transaction_...`、`Model: claude-3-5...`、`Latency: 820ms`），在稍窄视口下会折行，占据宝贵的纵向代码视口空间。

---

## 2. 设计规范与架构改造

### 2.1 详情页顶栏精简 (Detail Top Navigation)
- **左侧**：
  - 移动端返回按钮 (`ArrowLeft`)
  - 桌面端侧边栏折叠按钮 (`PanelLeftClose` / `PanelLeftOpen`)
  - 三标签导航 Tab：`[ ↗️ 请求数据 (Payload) ]`、`[ ↙️ 响应数据 (Response) ]`、`[ 💬 对话视图 (Chat) ]`
- **右侧**：
  - 仅保留全局操作：`[ 📋 完整交易 JSON (JSON) ]`
  - 彻底下放 `Preview/Raw` 开关以及对应的数据 cURL 复制按钮。

### 2.2 VS Code 风格列头设计 (Editor Card Headers)
在双列模式下（无论是 Payload 请求还是 Response 响应），左右两列均采用统一的 VS Code 编辑器标题栏模式：
`h-8 px-3 flex items-center justify-between shrink-0 bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] select-none`

- **左列：Claude 客户端数据卡片**：
  - **左侧**：指示灯圆点（蓝/琥珀） + 标题文字（`Claude 客户端请求` 或 `Claude 最终响应`）
  - **右侧 Action Bar**：
    1. **视图切换胶囊**：`[ 👁️ 预览 | 💻 源码 ]`（微型尺寸，控制 `clientViewMode`）
    2. **竖向分隔线**：`w-[1px] h-3 bg-[var(--border-subtle)]`
    3. **专属操作**：
       - 请求页：`[ ⚡ Claude cURL ]` 一键复制代理 cURL
       - 响应页：若是 SSE 流，显示 `[ 🌊 SSE Stream ]` 状态徽章

- **右列：Gemini 上游数据卡片**：
  - **左侧**：指示灯圆点（翠绿/紫色） + 标题文字（`Gemini 上游请求` 或 `Gemini 上游响应`）
  - **右侧 Action Bar**：
    1. **视图切换胶囊**：`[ 👁️ 预览 | 💻 源码 ]`（微型尺寸，控制 `upstreamViewMode`）
    2. **竖向分隔线**：`w-[1px] h-3 bg-[var(--border-subtle)]`
    3. **专属操作**：
       - 请求页：`[ ⚡ Gemini cURL ]` 一键复制上游 Google cURL
       - 响应页：若是 SSE 流，显示 `[ 🌊 SSE Stream ]` 状态徽章

### 2.3 第二行元信息栏（Metadata Ribbon）极致单行化
- **容器样式**：
  `ui-card-sub px-3 py-1.5 mb-3 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap`
- **7 个语义化精炼徽章**：
  1. `HTTP 状态码`: `200 OK` (绿) / `4xx` (黄) / `5xx` (红)
  2. `文件名微芯片`: `[ 📄 ...abcd12 📋 ]`（截取后 8 位并显示复制按钮，悬浮 Tooltip 展示完整文件名）
  3. `接口路径`: `[ /v1/messages ]`（提取短路径，柔和背景）
  4. `流式标识`: `[ 🌊 STREAM ]`（非流式请求自动隐藏）
  5. `模型标识`: `[ 🟣 claude-3-5-sonnet ]`（去除 "Model:" 冗余字样，支持截断与 Tooltip）
  6. `耗时徽章`: `[ ⚡ 420ms ]` / `[ ⚡ 1.25s ]`（去除 "Latency:" 冗余字样）
  7. `时间戳`: `[ 🕒 15:42:01 ]`（紧凑时分秒，悬浮展示完整日期时间）

---

## 3. 状态管理与数据流

```typescript
// LogsView.tsx
// 左侧与右侧拥有独立的视图模式，互不干扰
const [clientViewMode, setClientViewMode] = useState<'preview' | 'raw'>('preview');
const [upstreamViewMode, setUpstreamViewMode] = useState<'preview' | 'raw'>('preview');
```

- 切换日志条目时，保留当前已设置的视图偏好，不打断用户查阅习惯。
- 主题无缝适配，完全基于 CSS 变量 (`--bg-surface`, `--bg-surface-sub`, `--border-subtle`, `--code-bg`)。

---

## 4. 测试与验证策略

1. **测试驱动断言 (`tests/logsViewHeaderOptimization.test.ts`)**：
   - 验证顶栏不再包含旧的全局 `Preview` / `Raw JSON` 切换组件及顶栏 cURL 按钮。
   - 验证左右两栏列头各自独立包含 `Preview/Raw` 视图切换按钮。
   - 验证左栏包含 Claude cURL 按钮，右栏包含 Gemini cURL 按钮。
   - 验证第二行元信息栏包含单行化徽章且不包含 `Model:`、`Latency:` 等冗余文字。
2. **构建回归测试**：
   - `npm run build:frontend` (Vite 严格编译)
   - `npm run build:backend` (TSC 严格编译)
   - `npm test` (全量 Jest 测试套件)

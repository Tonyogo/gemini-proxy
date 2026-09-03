# 请求日志页面与全部 Tab 预览视图深浅双主题彻底适配设计方案

## 1. 目标与痛点背景
在系统切换至 Light 浅色模式后，请求日志页面（`LogsView`）仍然存在大量刺眼的深黑框与对比度失衡问题：
1. **左侧请求日志列表条目**：
   - HTTP 方法徽标（`POST`、`GET`）硬编码 `bg-slate-800 text-slate-300 border-slate-700/60`，在白底上呈现突兀的黑底；
   - 文件时间、耗时标签（`duration`）、状态码徽标缺乏浅色高对比度排版；
   - 选中条目（`isSelected`）在浅色模式下存在遮罩脏斑；
2. **预览模式（Preview Mode）下的 `JsonTreeView`**：
   - 外部主容器硬编码 `bg-slate-950/90 border-slate-800/80`，表现为巨大深黑盒子；
   - 顶部工具栏硬编码 `bg-slate-900/80`；
   - 节点悬停态与语法高亮（字符串、数字、布尔）专为黑底设计，在白底上反差严重甚至难以阅读；
3. **SSE 流式装配视图 (`SseStreamPreview`)**：
   - 文本内容展示框与事件列表硬编码 `bg-slate-950` 与 `border-slate-800`；
4. **对话视图 (`ConversationView` / `MessageBubble` / `ToolCallCard`)**：
   - 气泡背景、System Prompt 内容框、工具调用（Tool Call）展开内容区充斥写死的深黑底色（`bg-[#0A0C13]`、`bg-slate-950`）。

---

## 2. 详细重构设计规范

### 2.1 请求日志列表项 (`LogsView.tsx`)
- **HTTP Method 徽标 (`POST` / `GET`)**：
  - 改造为自适应语义微胶囊：
    `bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 font-bold`；
- **状态码徽标 (`2xx`, `4xx`, `5xx`)**：
  - `2xx`: `bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30`；
  - `4xx`: `bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30`；
  - `5xx`: `bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30`；
- **请求耗时徽标 (`durationElem`)**：
  - 浅色模式下使用加深的饱满色彩（如 `<1s` 使用 `text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10`）；
- **选中与未选中态**：
  - 选中：`bg-indigo-50/80 border-indigo-400 text-indigo-950 dark:bg-indigo-600/15 dark:border-indigo-500/80 dark:text-indigo-100 shadow-sm ring-1 ring-indigo-400/30`；
  - 未选中：`ui-card-sub hover:bg-[var(--bg-surface-hover)] border-[var(--border-subtle)] text-[var(--text-secondary)]`。

---

### 2.2 预览模式结构化树 (`JsonTreeView.tsx`)
- **容器与工具栏**：
  - 主容器：从 `bg-slate-950/90 border border-slate-800/80` 替换为 `bg-[var(--code-bg)] border border-[var(--border-subtle)]`；
  - 工具栏：从 `bg-slate-900/80 border-b border-slate-800/80` 替换为 `bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)]`；
  - 操作按钮（全部展开/全部折叠/复制）：替换为 `ui-btn-secondary`；
- **语法高亮与节点交互**：
  - 键名：`text-indigo-600 dark:text-indigo-300 font-semibold`；
  - 字符串（String）：`text-emerald-700 dark:text-emerald-300`；
  - 数字（Number）：`text-blue-600 dark:text-blue-300`；
  - 布尔（Boolean）：`text-amber-700 dark:text-amber-400 font-semibold`；
  - Null/Undefined：`text-slate-400 dark:text-slate-500 italic`；
  - 节点 Hover：`hover:bg-black/[0.04] dark:hover:bg-slate-800/50`。

---

### 2.3 SSE 流式装配视图 (`SseStreamPreview.tsx`)
- 主容器与状态条使用 `ui-card-sub` 与 `bg-[var(--code-bg)]`；
- 文本输出容器由 `bg-slate-950` 改造为 `bg-[var(--code-bg)] text-[var(--code-text)] border border-[var(--border-subtle)]`；
- 事件区块列表项由 `bg-slate-950/80 border-slate-800/80` 改造为 `ui-card-sub hover:bg-[var(--bg-surface-hover)]`。

---

### 2.4 对话视图与消息气泡 (`ConversationView.tsx` / `MessageBubble.tsx` / `ToolCallCard.tsx`)
- **System Prompt 折叠卡片**：
  - 容器改为 `bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]`；
  - 内容区使用 `bg-[var(--code-bg)] text-[var(--code-text)]`；
- **消息气泡 (`MessageBubble.tsx`)**：
  - 用户气泡：浅色下为 `bg-indigo-50/90 border border-indigo-200 text-indigo-950`；深色下为经典暗紫渐变；
  - 助手气泡：浅色下为 `bg-[var(--bg-surface)] border border-[var(--border-subtle)] border-l-[3px] border-l-purple-500 text-[var(--text-primary)] shadow-sm`；
- **工具调用卡片 (`ToolCallCard.tsx`)**：
  - 内容区从 `bg-slate-950/80` 改造为 `bg-[var(--code-bg)] text-[var(--code-text)] border-t border-[var(--border-subtle)]`。

---

## 3. 验证与测试标准
1. **Light 模式全面巡检**：
   - 点击任何日志条目，左侧列表条目、`POST` 标签、时间标签、耗时标签均为纯正浅色高质感；
   - 切换到各个 Tab（Request Payload、Upstream Req、Response、Conversation），预览模式下没有深黑大底框；
   - 代码文本高亮饱满清晰，可读性良好。
2. **Dark 模式回归**：
   - 切换至 Dark 模式，原有深色夜间模式体验依旧原汁原味。
3. **自动化测试**：
   - 编写断言测试验证 `JsonTreeView`、`SseStreamPreview` 与 `LogsView` 彻底移除硬编码暗黑样式类；
   - 全量 `npm test` 与 `npm run build` 100% 通过。

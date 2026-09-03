# 请求日志页面与全部 Tab 预览视图深浅双主题彻底适配实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底消除请求日志页面（`LogsView`）及其子组件（`JsonTreeView`、`SseStreamPreview`、`ConversationView`、`MessageBubble`、`ToolCallCard`）在 Light 浅色模式下的所有硬编码深黑框与高对比度缺陷，实现专业、高雅、纯正的深浅双主题体验。

**Architecture:**
1. **列表项（List Items）语义化**：优化 `LogsView.tsx` 左侧列表项中的 `POST` 徽标、时间戳、文件名与请求耗时，使其在 Light 模式下呈现柔和中性浅底高对比度文字，去除生硬黑块。
2. **预览模式结构化树（JsonTreeView）主题化**：重构 `JsonTreeView.tsx` 的主容器、顶栏工具栏、展开/折叠按键、节点 Hover 效果及语法高亮（键名、字符串、数字、布尔值），使其完美适配浅色模式背景。
3. **SSE 流式装配预览（SseStreamPreview）主题化**：全面替换 `SseStreamPreview.tsx` 中的 `bg-slate-950`、`border-slate-800` 和深绿脏斑底色，使用 `ui-card-sub` 和 `var(--code-bg)`。
4. **对话视图（ConversationView / MessageBubble / ToolCallCard）主题化**：优化气泡背景、System Prompt 内容框与工具调用展开卡片，适配深浅双色。
5. **自动化测试断言**：编写测试用例验证 `JsonTreeView`、`SseStreamPreview`、`LogsView` 彻底移除硬编码暗黑样式类，并确保全量测试通过。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Monaco Editor, Jest, Vite.

## Global Constraints
- 保证浅色模式下所有容器、代码高亮、文字具有极佳的可读性，严禁出现深黑大框突兀放置在白底上的情况。
- 保证深色模式下的原有质感不受任何负面影响。
- 构建 `npm run build:frontend` 与测试 `npm test` 保持 100% 通过。

---

### Task 1: 改造 LogsView 左侧请求列表项的 POST 徽标、时间戳与状态配色

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:540-645`

**Interfaces:**
- Consumes: `log: TransactionLogItem`, `isSelected: boolean`
- Produces: 响应式浅色高对比度列表项排版

- [ ] **Step 1: 检查 LogsView.tsx 列表项代码结构**

定位 540-638 行关于 `POST`、`formattedTime`、`durationElem`、`status` 徽标的渲染。

- [ ] **Step 2: 改造列表项及徽标配色**

在 `frontend/src/components/LogsView.tsx` 中：
1. `POST` 徽标：从 `bg-slate-800 text-slate-300 border border-slate-700/60` 替换为：
   `bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 font-bold`；
2. 时间戳 `formattedTime`：使用 `text-slate-500 dark:text-slate-400 font-medium`；
3. 耗时 `durationElem`：在 `<1s` 等级使用 `bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20`；
4. 状态码徽标：
   - 2xx: `bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30`；
   - 4xx: `bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30`；
   - 5xx: `bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30`；
5. 选中条目（`isSelected`）：
   `bg-indigo-50/80 border-indigo-400 text-indigo-950 dark:bg-indigo-600/15 dark:border-indigo-500/80 dark:text-indigo-100 shadow-sm ring-1 ring-indigo-400/30`；
6. 分页栏边框：从 `border-slate-800/80` 改为 `border-[var(--border-subtle)]`。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 4: 提交 Task 1 代码**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(logs): adapt log list items, method badges, and status colors to light theme"
```

---

### Task 2: 改造 JsonTreeView 预览模式结构化树的主题适配

**Files:**
- Modify: `frontend/src/components/JsonTreeView.tsx:25-115, 195-235`

**Interfaces:**
- Consumes: `JsonNodeProps`, `data: any`
- Produces: 支持纯净浅色背景与高对比度语法高亮的 JSON 结构化树

- [ ] **Step 1: 检查 JsonTreeView.tsx 主容器与语法高亮**

定位 25-55 行的数值高亮颜色，65-95 行的节点展开 Hover，以及 195-230 行的外层大黑框。

- [ ] **Step 2: 改造容器背景与语法高亮调色盘**

在 `frontend/src/components/JsonTreeView.tsx` 中：
1. 外层主容器从 `bg-slate-950/90 rounded-xl border border-slate-800/80` 替换为：
   `bg-[var(--code-bg)] rounded-xl border border-[var(--border-subtle)] overflow-hidden flex flex-col`；
2. 顶部工具栏从 `bg-slate-900/80 border-b border-slate-800/80` 替换为：
   `bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] px-3 py-1.5 select-none text-[11px]`；
3. 工具栏按钮替换为 `ui-btn-secondary px-2 py-0.5 text-[10px]`；
4. 语法高亮映射：
   - 键名 `"{name}":`: `text-indigo-600 dark:text-indigo-300 font-semibold shrink-0 select-none`；
   - 字符串 String: `text-emerald-700 dark:text-emerald-300`；
   - 数字 Number: `text-blue-600 dark:text-blue-300 font-semibold`；
   - 布尔 Boolean: `text-amber-700 dark:text-amber-400 font-semibold`；
   - Null / Undefined: `text-slate-400 dark:text-slate-500 italic`；
   - 节点 Hover 效果：`hover:bg-black/[0.04] dark:hover:bg-slate-800/50`。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 4: 提交 Task 2 代码**

```bash
git add frontend/src/components/JsonTreeView.tsx
git commit -m "feat(logs): adapt JsonTreeView container, toolbar, and syntax highlight to light theme"
```

---

### Task 3: 改造 SseStreamPreview 流式响应与 ConversationView 对话视图

**Files:**
- Modify: `frontend/src/components/SseStreamPreview.tsx:280-460`
- Modify: `frontend/src/components/ConversationView.tsx:100-145`
- Modify: `frontend/src/components/chat/MessageBubble.tsx:80-90`
- Modify: `frontend/src/components/chat/ToolCallCard.tsx:30-80`

**Interfaces:**
- Consumes: `.ui-card`, `.ui-card-sub`, `var(--code-bg)`, `var(--code-text)`
- Produces: 彻底消除 SSE 装配与聊天气泡中的残留黑底

- [ ] **Step 1: 改造 SseStreamPreview.tsx 中的写死暗黑块**

在 `frontend/src/components/SseStreamPreview.tsx` 中：
1. 组装响应卡片外框从 `bg-emerald-950/20 border-emerald-800/40` 改为：
   `bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-4 space-y-3`；
2. 文本内容输出区从 `bg-slate-950` 改为 `bg-[var(--code-bg)] text-[var(--code-text)] border border-[var(--border-subtle)]`；
3. 事件流列表条目未选中态从 `bg-slate-950/80 border-slate-800/80` 改为 `ui-card-sub`。

- [ ] **Step 2: 改造 ConversationView.tsx, MessageBubble.tsx, ToolCallCard.tsx**

1. `ConversationView.tsx`:
   - System Prompt 内容区从 `bg-slate-950/80` 改为 `bg-[var(--code-bg)] text-[var(--code-text)] border-t border-[var(--border-subtle)]`；
2. `MessageBubble.tsx`:
   - 用户气泡：浅色下为 `bg-indigo-50/90 border border-indigo-200 text-indigo-950`；深色下保持渐变暗紫；
   - 助手气泡：浅色下为 `bg-[var(--bg-surface)] border border-[var(--border-subtle)] border-l-[3px] border-l-purple-500 text-[var(--text-primary)] shadow-sm`；深色下保持 `#0A0C13/95`；
3. `ToolCallCard.tsx`:
   - 卡片展开内容区从 `bg-slate-950/80 border-slate-800/80` 改为 `bg-[var(--code-bg)] border-t border-[var(--border-subtle)] text-[var(--code-text)]`。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 4: 提交 Task 3 代码**

```bash
git add frontend/src/components/SseStreamPreview.tsx frontend/src/components/ConversationView.tsx frontend/src/components/chat/MessageBubble.tsx frontend/src/components/chat/ToolCallCard.tsx
git commit -m "feat(logs): adapt SseStreamPreview, ConversationView, and chat bubbles to light theme"
```

---

### Task 4: 编写请求日志页面无深黑框自动化断言测试与全量构建回归

**Files:**
- Create: `tests/logsViewThemeRefinement.test.ts`

- [ ] **Step 1: 编写断言测试**

创建 `tests/logsViewThemeRefinement.test.ts`：
```ts
import fs from 'fs';
import path from 'path';

describe('LogsView & Preview Modes Theme Cleanliness Test', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, `../frontend/src/components/${file}`), 'utf-8');

  it('verifies JsonTreeView does not have hardcoded bg-slate-950 container', () => {
    const code = read('JsonTreeView.tsx');
    expect(code).not.toContain('bg-slate-950/90');
    expect(code).toContain('--code-bg');
  });

  it('verifies LogsView list items do not have hardcoded bg-slate-800 on POST method badge', () => {
    const code = read('LogsView.tsx');
    expect(code).not.toContain('bg-slate-800 text-slate-300');
  });

  it('verifies SseStreamPreview does not have hardcoded bg-slate-950', () => {
    const code = read('SseStreamPreview.tsx');
    expect(code).not.toContain('bg-slate-950 p-3.5');
  });
});
```

- [ ] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/logsViewThemeRefinement.test.ts'
```
Expected: PASS。

- [ ] **Step 3: 运行全量测试套件与全量前后端构建**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm test && npm run build'
```
Expected: 全部测试通过，前后端构建 100% 成功。

- [ ] **Step 4: 提交测试代码**

```bash
git add tests/logsViewThemeRefinement.test.ts
git commit -m "test(logs): add assertions for logs view and preview modes light theme adaptation"
```

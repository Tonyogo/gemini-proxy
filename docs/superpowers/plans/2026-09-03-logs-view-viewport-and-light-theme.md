# 请求日志视口高度自适应与浅色主题黑框消除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决请求日志 (LogsView) 页面高度超出屏幕产生外层全局滚动条的问题，使其对齐 API 调试器 (PlaygroundView) 的视口自适应标准；并全面消除 Light 主题下详情信息条、分页控件及 Chat 对话视图中的硬编码黑框。

**Architecture:** 
- 布局改造：在 `LogsView.tsx` 中去除固定高度（`h-[520px]`）与 `min-h-[600px]/min-h-[500px]` 限制，对齐 `PlaygroundView` 采用 `min-h-0 h-full md:h-[calc(100dvh-6.5rem)] overflow-hidden`，让左侧列表与右侧详情容器均具备独立的 `min-h-0 flex-1 overflow-y-auto` 滚动区。
- 主题美化：将详情面板顶部 Metadata 标签替换为双主题自适应浅灰框；底部分页 `<select>` 改用 `bg-[var(--bg-surface)]`，翻页按钮改用 `ui-btn-secondary`；Chat Tab 中的代码块、表格与思考展开区改用设计系统 CSS 语义变量。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Vite, Jest.

## Global Constraints

- **Strict TypeScript & Clean Build**: 前端编译 `npm run build:frontend` 必须 0 错误、0 告警通过。
- **Zero Global Scroll**: 严格禁止页面外层出现纵向滚动条，左右分栏必须在各自容器内独立滚动。
- **Theme Cohesion**: 浅色模式下不得出现未加 `dark:` 前缀的深色底框（如 `bg-slate-900`, `bg-slate-950`, `border-slate-800`）。
- **TDD Regression Suite**: 针对修改的组件编写静态 AST/样式断言测试，运行全量测试套件确保无破坏。

---

### Task 1: 编写布局与主题样式断言测试 (TDD)

**Files:**
- Modify: `tests/logsViewThemeRefinement.test.ts:1-33`

**Interfaces:**
- Consumes: `LogsView.tsx`, `chat/MarkdownContent.tsx`, `chat/ThinkingBlock.tsx`
- Produces: 自动化断言规则，确保不出现撑破视口属性和黑框类名。

- [ ] **Step 1: 编写失败测试**

在 `tests/logsViewThemeRefinement.test.ts` 中追加断言：
1. `LogsView.tsx` 根节点不包含 `min-h-[600px]`，且左侧栏不包含 `h-[520px]`；
2. `LogsView.tsx` 详情 Metadata 和分页控件不包含 `bg-slate-900 border border-slate-800` 或 `bg-slate-950 border border-slate-800`；
3. `chat/MarkdownContent.tsx` 中的代码块不包含 `border border-slate-800 bg-slate-950`；
4. `chat/ThinkingBlock.tsx` 展开区不包含未适配主题的 `bg-slate-950/60`。

```ts
  it('verifies LogsView has viewport-bounded classes without min-h-600px or h-520px', () => {
    const code = read('LogsView.tsx');
    expect(code).not.toContain('min-h-[600px]');
    expect(code).not.toContain('h-[520px]');
    expect(code).toContain('md:h-[calc(100dvh-6.5rem)]');
  });

  it('verifies LogsView does not have hardcoded dark boxes in metadata and pagination', () => {
    const code = read('LogsView.tsx');
    expect(code).not.toContain('bg-slate-900 border border-slate-800');
    expect(code).not.toContain('bg-slate-950 border border-slate-800');
  });

  it('verifies chat components do not have hardcoded black codeblocks or tables in light mode', () => {
    const mdCode = read('chat/MarkdownContent.tsx');
    expect(mdCode).not.toContain('border border-slate-800 bg-slate-950');
    expect(mdCode).toContain('--code-bg');

    const thinkingCode = read('chat/ThinkingBlock.tsx');
    expect(thinkingCode).not.toContain('bg-slate-950/60 border-t border-amber-500/20 text-slate-300');
  });
```

- [ ] **Step 2: 运行测试并确认失败**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest tests/logsViewThemeRefinement.test.ts
```
Expected: FAIL（因为当前文件中存在这些 hardcoded 类名和 `min-h-[600px]`、`h-[520px]`）

- [ ] **Step 3: 提交测试用例**

```bash
git add tests/logsViewThemeRefinement.test.ts
git commit -m "test(logs): add assertions for viewport bounds and light theme black box elimination"
```

---

### Task 2: 重构 LogsView 视口布局与消除黑框 (LogsView Viewport & Colors)

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:358-375,645-695,860-915`

**Interfaces:**
- Consumes: `ui-card`, `ui-btn-secondary`, `bg-[var(--bg-surface)]`, `border-[var(--border-subtle)]`
- Produces: 严格视口自适应的工作台，消除外层滚动；清爽无黑框的信息条与分页控件。

- [ ] **Step 1: 修改 LogsView 容器布局 (消除撑屏与外层滚动)**

在 `frontend/src/components/LogsView.tsx` 约第 360 行：
将：
```tsx
    <div className="w-full flex-1 flex flex-col md:flex-row gap-4 items-stretch h-full min-h-[600px] md:h-[calc(100dvh-6.5rem)] overflow-hidden">
      {/* Left Column (Request Master List) */}
      {!sidebarCollapsed && (
        <div className={`w-full md:w-80 lg:w-[360px] xl:w-[380px] shrink-0 ui-card p-3.5 flex flex-col h-[520px] md:h-full transition-all ${
          mobileDetailOpen ? 'hidden md:flex' : 'flex'
        }`}>
```
修改为：
```tsx
    <div className="w-full flex-1 flex flex-col md:flex-row gap-4 items-stretch min-h-0 h-full md:h-[calc(100dvh-6.5rem)] overflow-hidden">
      {/* Left Column (Request Master List) */}
      {!sidebarCollapsed && (
        <div className={`w-full md:w-80 lg:w-[360px] xl:w-[380px] shrink-0 ui-card p-3.5 flex flex-col min-h-0 h-full overflow-hidden transition-all ${
          mobileDetailOpen ? 'hidden md:flex' : 'flex'
        }`}>
```

在约第 693 行右侧详情栏：
将：
```tsx
      {/* Right Column (Detail Inspector) */}
      <div className={`flex-1 min-w-0 ui-card p-3 sm:p-4 flex flex-col h-full min-h-[500px] ${
        !mobileDetailOpen ? 'hidden md:flex' : 'flex'
      }`}>
```
修改为：
```tsx
      {/* Right Column (Detail Inspector) */}
      <div className={`flex-1 min-w-0 ui-card p-3 sm:p-4 flex flex-col min-h-0 h-full overflow-hidden ${
        !mobileDetailOpen ? 'hidden md:flex' : 'flex'
      }`}>
```

- [ ] **Step 2: 消除分页控件中的黑框**

在 `frontend/src/components/LogsView.tsx` 约第 654-685 行：
将：
```tsx
                <select
                  value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[10px] focus:outline-none focus:border-indigo-500"
                >
                  <option value={30}>30/page</option>
                  <option value={50}>50/page</option>
                  <option value={100}>100/page</option>
                  <option value={200}>200/page</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-1">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => handlePageChange(page - 1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700/60 transition-colors text-[10px]"
                >
                  ‹ {t('logs.prevPage', 'Prev')}
                </button>

                <span className="text-slate-300 font-semibold text-[10px]">
                  {page} / {Math.ceil(totalLogs / limit) || 1}
                </span>

                <button
                  disabled={page >= Math.ceil(totalLogs / limit) || loading}
                  onClick={() => handlePageChange(page + 1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700/60 transition-colors text-[10px]"
                >
                  {t('logs.nextPage', 'Next')} ›
                </button>
              </div>
```
替换为：
```tsx
                <select
                  value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[var(--text-primary)] text-[10px] focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value={30}>30/page</option>
                  <option value={50}>50/page</option>
                  <option value={100}>100/page</option>
                  <option value={200}>200/page</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-1">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => handlePageChange(page - 1)}
                  className="px-2.5 py-1 rounded-lg ui-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed text-[10px] transition-colors"
                >
                  ‹ {t('logs.prevPage', 'Prev')}
                </button>

                <span className="text-[var(--text-primary)] font-semibold text-[10px]">
                  {page} / {Math.ceil(totalLogs / limit) || 1}
                </span>

                <button
                  disabled={page >= Math.ceil(totalLogs / limit) || loading}
                  onClick={() => handlePageChange(page + 1)}
                  className="px-2.5 py-1 rounded-lg ui-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed text-[10px] transition-colors"
                >
                  {t('logs.nextPage', 'Next')} ›
                </button>
              </div>
```

- [ ] **Step 3: 消除详情顶部 Metadata 中的黑框**

在 `frontend/src/components/LogsView.tsx` 约第 866-913 行：
将文件名、延迟和时间标签中的深色硬编码样式替换为双主题自适应类名：
```tsx
              {selectedLog.filename && (
                <div
                  onClick={handleCopyDetailFilename}
                  className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                  title={t('logs.copyFilename', 'Copy filename')}
                >
                  <span className="text-slate-400 dark:text-slate-500 font-semibold">{t('logs.fileLabel', 'File')}:</span>
                  <span>{selectedLog.filename}</span>
                  {copiedDetailFile ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                  )}
                </div>
              )}

              {selectedLog.path && (
                <span className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-md font-medium">
                  {selectedLog.path}
                </span>
              )}

              {selectedLog.isStream && (
                <span className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-md font-bold">
                  STREAM
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
              {selectedLog.model && (
                <span className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-md font-medium">
                  Model: {selectedLog.model}
                </span>
              )}

              {selectedLog.duration !== undefined && selectedLog.duration !== null && (
                <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md text-slate-700 dark:text-slate-300">
                  Latency: {selectedLog.duration}ms
                </span>
              )}

              {selectedLog.timestamp && (
                <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-400">
                  {new Date(selectedLog.timestamp).toLocaleString()}
                </span>
              )}
            </div>
```

- [ ] **Step 4: 运行前端构建验证**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend
```
Expected: PASS，无 TS 错误，打包正常。

- [ ] **Step 5: 提交 LogsView 改动**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(logs): adapt logs view to strict viewport bounds and eliminate dark metadata and pagination boxes"
```

---

### Task 3: ChatTab 对话视图去黑框与语义化 Token 适配 (Chat Components Refinement)

**Files:**
- Modify: `frontend/src/components/chat/MarkdownContent.tsx:30-40,70-75`
- Modify: `frontend/src/components/chat/ThinkingBlock.tsx:50-57`

**Interfaces:**
- Consumes: `--code-bg`, `--code-text`, `--bg-surface-sub`, `--border-subtle`
- Produces: 浅色主题下无黑框的聊天对话 Markdown 内容渲染。

- [ ] **Step 1: 优化 MarkdownContent 中的表格与代码块**

在 `frontend/src/components/chat/MarkdownContent.tsx` 中：
1. 表格与表头/单元格：
```tsx
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-[var(--border-subtle)]">
              <table className="w-full text-left text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="bg-[var(--bg-surface-sub)] px-3 py-1.5 font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)]">{children}</th>,
          td: ({ children }) => <td className="px-3 py-1.5 border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">{children}</td>,
```

2. 代码块容器与代码块头部栏：
```tsx
  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--code-bg)] font-mono text-xs shadow-sm dark:shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)]">
        <span className="font-semibold text-indigo-600 dark:text-indigo-400">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors p-0.5 rounded"
          title="Copy code"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
```

- [ ] **Step 2: 优化 ThinkingBlock 展开折叠区背景**

在 `frontend/src/components/chat/ThinkingBlock.tsx` 约第 53 行：
将：
```tsx
      {expanded && (
        <div className="p-3 bg-slate-950/60 border-t border-amber-500/20 text-slate-300 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
          {thinking}
        </div>
      )}
```
替换为：
```tsx
      {expanded && (
        <div className="p-3 bg-amber-500/5 dark:bg-slate-950/60 border-t border-amber-500/20 text-[var(--text-secondary)] dark:text-slate-300 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
          {thinking}
        </div>
      )}
```

- [ ] **Step 3: 运行测试验证**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest tests/logsViewThemeRefinement.test.ts
```
Expected: PASS，所有断言全部通过。

- [ ] **Step 4: 运行前端构建验证**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend
```
Expected: PASS，构建成功。

- [ ] **Step 5: 提交 ChatTab 改动**

```bash
git add frontend/src/components/chat/MarkdownContent.tsx frontend/src/components/chat/ThinkingBlock.tsx
git commit -m "feat(chat): adapt codeblocks, tables, and thinking blocks to light theme variables"
```

---

### Task 4: 全量回归测试与端到端验证 (Full Verification)

**Files:**
- None (执行全面验证)

- [ ] **Step 1: 运行全量 Jest 测试套件**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test
```
Expected: PASS，全项目 40 个测试套件全部通过。

- [ ] **Step 2: 运行全量项目构建**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build
```
Expected: PASS，前后端完整生产打包成功无报错。

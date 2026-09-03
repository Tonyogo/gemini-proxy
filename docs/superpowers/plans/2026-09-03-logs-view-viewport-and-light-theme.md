# 请求日志视口自适应与浅色主题黑框消除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决请求日志 (LogsView) 页面列表与详情向下无限撑长产生页面全局滚动条的问题，完全对齐翻译工作台 (TranslateView) 的组件内视口闭环与自适应滚动机制；并修复 Light 主题下硬编码黑框及代码评审中发现的优化点。

**Architecture:** 
- 布局改造（对齐 TranslateView）：在 `LogsView.tsx` 中将左侧列表和右侧详情分别设置为 `h-full flex flex-col min-h-0 overflow-hidden`，左侧列表条目区设为 `flex-1 min-h-0 overflow-y-auto`（分页栏 `shrink-0` 固定在底端）；将 `JsonTreeView.tsx` 改造为 `h-full flex-1 min-h-0 flex flex-col overflow-hidden`，内部 JSON 节点视口设为 `flex-1 min-h-0 overflow-auto`，阻断无限向下撑破容器高度；`SseStreamPreview` 与 `ConversationView` 在详情区内自适应滚动。
- 主题与细节修复：消除详情 Metadata 标签、分页栏下拉框及 ChatTab 代码块/思考展开区的深色硬编码；修复 `ConcurrentTestModal` 缺少 `x-admin-key`、`buildUpstreamHeaders` Authorization 大小写不敏感校验，以及 `ThinkingBlock` 的 `py-0.2` 类名问题。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Vite, Jest.

## Global Constraints

- **Non-Invasive Page Layout**: 保持全局外层容器自适应，不锁死 `App.tsx`（确保账号管理 AccountsView 等长列表视图仍能随内容自然延展）。
- **Strict Viewport Containment**: 请求日志组件内部必须做到 100% 视口闭环，所有长列表与大 JSON 树仅在自身分栏内独立垂直滚动。
- **Strict TypeScript**: 保持所有代码在严格 TypeScript 下 0 编译与类型报错（`npm run build:frontend` 与 `npm run build:backend` 必须完全干净通过）。
- **TDD Verification**: 编写完备的 Jest 静态与功能断言测试，保证构建与回归测试全部通过。

---

### Task 1: 重构 LogsView 与 JsonTreeView 视口内独立滚动机制

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:360-395,496-510,645-695,925-985`
- Modify: `frontend/src/components/JsonTreeView.tsx:195-248`
- Test: `tests/logsViewThemeRefinement.test.ts`

**Interfaces:**
- Consumes: `JsonTreeViewProps`, `LogsView`
- Produces: 
  - `JsonTreeView` 具备 `h-full flex-1 min-h-0 flex flex-col overflow-hidden` 结构
  - `LogsView` 左侧列表和右侧详情在视口内高度 100% 闭环

- [ ] **Step 1: 在 `tests/logsViewThemeRefinement.test.ts` 中编写视口约束断言**

```ts
  it('verifies JsonTreeView has h-full flex flex-col overflow-hidden layout', () => {
    const code = read('JsonTreeView.tsx');
    expect(code).toContain('h-full flex-1 min-h-0 flex flex-col overflow-hidden');
    expect(code).toContain('flex-1 min-h-0 overflow-auto');
  });

  it('verifies LogsView list area has flex-1 min-h-0 overflow-y-auto', () => {
    const code = read('LogsView.tsx');
    expect(code).toContain('flex-1 min-h-0 overflow-y-auto');
  });
```

- [ ] **Step 2: 运行测试并验证失败**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest tests/logsViewThemeRefinement.test.ts
```
Expected: FAIL（因为 `JsonTreeView.tsx` 尚未应用 `h-full flex-1 min-h-0 flex flex-col overflow-hidden`）

- [ ] **Step 3: 重构 `JsonTreeView.tsx` 实现视口闭环**

在 `frontend/src/components/JsonTreeView.tsx` 约第 196-248 行：
```tsx
  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--code-bg)] rounded-xl border border-[var(--border-subtle)]">
      {/* Action Toolbar Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] select-none text-[11px] shrink-0">
        <div className="flex items-center space-x-1.5 text-slate-400">
          <ChevronsUpDown className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span className="font-mono text-[10px] text-[var(--text-primary)] font-semibold">{t('logs.jsonInspector', 'JSON 检查器')}</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleExpandAll}
            className="px-2 py-0.5 rounded ui-btn-secondary text-[10px] transition-colors"
            title="Expand all nodes"
          >
            {t('logs.expandAll', '全部展开')}
          </button>
          <button
            onClick={handleCollapseAll}
            className="px-2 py-0.5 rounded ui-btn-secondary text-[10px] transition-colors"
            title="Collapse all nodes"
          >
            {t('logs.collapseAll', '全部折叠')}
          </button>
          <button
            onClick={handleCopyAll}
            className="px-2 py-0.5 rounded ui-btn-secondary text-[10px] flex items-center space-x-1 transition-colors ml-1"
            title="Copy full JSON"
          >
            {copiedAll ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-500 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">{t('logs.copied', '已复制')}</span>
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                <span>{t('logs.copy', '复制 JSON')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* JSON Tree Viewport */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <JsonNode
          value={data}
          depth={0}
          path="root"
          expandedKeys={expandedKeys}
          toggleKey={toggleKey}
        />
      </div>
    </div>
  );
```

- [ ] **Step 4: 重构 `LogsView.tsx` 左侧与右侧容器布局**

在 `frontend/src/components/LogsView.tsx`：
1. 左侧容器 Header、日期下拉框、状态过滤栏显式加上 `shrink-0`：
```tsx
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-white/[0.08] shrink-0">
```
```tsx
          {/* Date & Hour Dropdown Pickers */}
          <div className="grid grid-cols-2 gap-2 mb-2.5 shrink-0">
```
```tsx
          {/* Status Filter Pills & Quick Search */}
          <div className="space-y-2 mb-2.5 pb-2.5 border-b border-white/[0.08] shrink-0">
```
2. 中间日志条目列表容器添加 `flex-1 min-h-0 overflow-y-auto`：
```tsx
          {/* Master Log Entries List */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 text-xs">
```
3. 底部分页栏标记 `shrink-0`：
```tsx
          {/* Bottom Pagination Bar */}
          {totalLogs > 0 && (
            <div className="pt-2.5 mt-2 border-t border-[var(--border-subtle)] flex flex-col gap-2 font-mono text-[11px] text-[var(--text-secondary)] shrink-0">
```
4. 右侧详情视图在 `payload` 与 `response` tab 下保持 `grid flex-1 min-h-0 h-full overflow-hidden`：
```tsx
            {activeTab === 'payload' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 h-full overflow-hidden">
                {/* Claude Client Request */}
                <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                  <div className="text-[11px] font-semibold text-indigo-400 mb-1.5 flex items-center space-x-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span>{t('logs.claudeClientReq')}</span>
                  </div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.client_req} />
                  ) : (
                    <div className="flex-1 min-h-0 h-full rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-inner bg-[var(--code-bg)]">
                      <Editor
                        height="100%"
                        language="json"
                        theme={monacoTheme}
                        beforeMount={defineGeminiProxyTheme}
                        value={JSON.stringify(selectedLog.client_req, null, 2)}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          folding: true,
                          automaticLayout: true
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Gemini Upstream Request */}
                <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1.5 flex items-center space-x-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>{t('logs.geminiUpstreamReq')}</span>
                  </div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.gem_req} />
                  ) : (
                    <div className="flex-1 min-h-0 h-full rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-inner bg-[var(--code-bg)]">
                      <Editor
                        height="100%"
                        language="json"
                        theme={monacoTheme}
                        beforeMount={defineGeminiProxyTheme}
                        value={JSON.stringify(selectedLog.gem_req, null, 2)}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          folding: true,
                          automaticLayout: true
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
```

- [ ] **Step 5: 重新运行测试验证通过**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest tests/logsViewThemeRefinement.test.ts
```
Expected: PASS

- [ ] **Step 6: 提交视口自适应改动**

```bash
git add frontend/src/components/LogsView.tsx frontend/src/components/JsonTreeView.tsx tests/logsViewThemeRefinement.test.ts
git commit -m "feat(logs): implement internal scroll containment for logs list and JsonTreeView aligned with TranslateView"
```

---

### Task 2: 修复 Code Review 发现的 Header 注入、Modal 传参及类名问题

**Files:**
- Modify: `src/utils/requestHelper.ts:75-90`
- Modify: `frontend/src/components/ConcurrentTestModal.tsx:80-90`
- Modify: `frontend/src/components/PlaygroundView.tsx:930-942`
- Modify: `frontend/src/components/chat/ThinkingBlock.tsx:35-40`
- Test: `tests/claudeController.test.ts`

**Interfaces:**
- Consumes: `apiKey`, `config.adminSecretKey`
- Produces: 
  - `buildUpstreamHeaders` 大小写不敏感检测 `authorization`
  - `ConcurrentTestModal` 同时附带 `x-admin-key: apiKey`
  - `ThinkingBlock` 使用合法的 `py-0.5` 类名
  - `PlaygroundView` 使用 `useMemo` 缓存 `parsedPayload`

- [ ] **Step 1: 在 `tests/claudeController.test.ts` 中补充 Header 大小写冲突测试**

```ts
  it('does not inject duplicate Authorization if customHeaders already has lowercased authorization', () => {
    const originalKey = config.adminSecretKey;
    config.adminSecretKey = 'admin-secret-123';
    try {
      const headers = buildUpstreamHeaders('admin-secret-123', { 'authorization': 'Bearer custom-token' });
      expect(headers['authorization']).toEqual('Bearer custom-token');
      expect(headers['Authorization']).toBeUndefined();
    } finally {
      config.adminSecretKey = originalKey;
    }
  });
```

- [ ] **Step 2: 运行测试并验证失败**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest tests/claudeController.test.ts -t "duplicate Authorization"
```
Expected: FAIL

- [ ] **Step 3: 修改 `src/utils/requestHelper.ts` 实现大小写不敏感判断**

在 `src/utils/requestHelper.ts` 约第 78-90 行：
```ts
export function buildUpstreamHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...customHeaders
  };

  const hasAuth = Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
  if (config.adminSecretKey && apiKey === config.adminSecretKey && !hasAuth) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}
```

- [ ] **Step 4: 修复 `ConcurrentTestModal.tsx` 中的请求头附加**

在 `frontend/src/components/ConcurrentTestModal.tsx` 约第 80-87 行：
```ts
        const fetchOptions: RequestInit = {
          method: targetMethod,
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'x-admin-key': apiKey
          }
        };
```

- [ ] **Step 5: 优化 `PlaygroundView.tsx` 中的 `parsedPayload` 与修复 `ThinkingBlock.tsx`**

在 `frontend/src/components/PlaygroundView.tsx` 中使用 `useMemo` 缓存解析结果：
```ts
  const memoizedParsedPayload = useMemo(() => {
    if (!requestBody.trim()) return null;
    try {
      return JSON.parse(requestBody);
    } catch {
      return null;
    }
  }, [requestBody]);
```
传递给 Modal：
```tsx
      <ConcurrentTestModal
        isOpen={showConcurrentModal}
        onClose={() => setShowConcurrentModal(false)}
        targetUrl={endpointOption === 'count_tokens' ? '/v1/messages/count_tokens' : endpointOption === 'custom' ? (customPath.startsWith('/') ? customPath : `/${customPath}`) : '/v1/messages'}
        targetMethod={endpointOption === 'custom' ? customMethod : 'POST'}
        parsedPayload={memoizedParsedPayload}
        apiKey={effectiveApiKey}
      />
```

在 `frontend/src/components/chat/ThinkingBlock.tsx` 约第 37 行：
将 `py-0.2` 替换为 `py-0.5`：
```tsx
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/30">
            {formattedCount}
          </span>
```

- [ ] **Step 6: 重新运行所有测试验证通过**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest
```
Expected: PASS (所有测试套件全部通过)

- [ ] **Step 7: 提交代码审查优化变更**

```bash
git add src/utils/requestHelper.ts frontend/src/components/ConcurrentTestModal.tsx frontend/src/components/PlaygroundView.tsx frontend/src/components/chat/ThinkingBlock.tsx tests/claudeController.test.ts
git commit -m "fix(review): add x-admin-key to concurrent modal, case-insensitive auth headers, and memoize json payload"
```

---

### Task 3: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [ ] **Step 1: 运行全量测试套件**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test
```
Expected: PASS，全项目 40+ 测试套件全部通过。

- [ ] **Step 2: 运行前端严格构建**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend
```
Expected: PASS，Vite React 打包 0 错误。

- [ ] **Step 3: 运行后端构建**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend
```
Expected: PASS，tsc 编译无任何错误。

- [ ] **Step 4: 运行全量构建**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build
```
Expected: PASS，前后端完整生产包构建成功。

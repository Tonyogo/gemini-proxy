# 请求日志详情页标题栏重构与元信息单行化实施计划 (Logs View Header Optimization Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化请求日志 (LogsView) 详情页标题栏与操作按钮布局，将全局模式切换与 cURL 专属按钮下放至数据列头并支持左右独立切换（VS Code 风格），同时将第二行元信息栏精简为单行微晶徽章展示。

**Architecture:** 
- 将 `LogsView.tsx` 中单一的 `viewMode` 解耦为左右独立的 `clientViewMode` 与 `upstreamViewMode`。
- 详情页顶栏移除全局 `[Preview | Raw]` 切换组件及 `Claude cURL` / `Gemini cURL` 复制按钮，仅保留 Tab 导航与全局 `[JSON]` 复制。
- 采用 VS Code 编辑器标题栏模式重构 Payload 与 Response 的双列标题头：左侧放置指示灯与标题，右侧集成独立微型 `[预览 | 源码]` 切换胶囊和对应列专属操作（Claude cURL / Gemini cURL / SSE Stream 标识）。
- 重构第二行元信息栏为 28px 高度的单行 `ui-card-sub`，采用紧凑芯片化徽章，去除冗余前缀并保证 `overflow-x-auto whitespace-nowrap` 永不折行。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Monaco Editor, Jest.

## Global Constraints

- **Independent Column Switching**: 左列（客户端数据）与右列（上游数据）具有独立的视图状态，一侧切源码不影响另一侧。
- **VS Code Header Alignment**: 标题栏左侧标题、右侧操作工具栏，主题完全继承 CSS 变量 (`--bg-surface`, `--bg-surface-sub`, `--border-subtle`)。
- **Single-Line Ribbon**: 元数据栏高度紧凑固定，永不换行撑开高度。
- **Strict TypeScript & TDD**: 严格类型安全，前端后端编译 0 报错，全量 Jest 测试套件通过。

---

### Task 1: 编写标题栏重构与单行元信息栏的测试断言

**Files:**
- Create: `tests/logsViewHeaderOptimization.test.ts`

**Interfaces:**
- Consumes: `frontend/src/components/LogsView.tsx`
- Produces: 静态与组件行为断言，检验顶栏不含全局预览按钮，双列头包含独立预览切换与专属 cURL，元数据栏单行化。

- [ ] **Step 1: 编写测试文件 `tests/logsViewHeaderOptimization.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('LogsView Header & Metadata Optimization', () => {
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(logsViewPath, 'utf-8');
  });

  test('should decouple viewMode into clientViewMode and upstreamViewMode states', () => {
    expect(content).toContain('clientViewMode');
    expect(content).toContain('setClientViewMode');
    expect(content).toContain('upstreamViewMode');
    expect(content).toContain('setUpstreamViewMode');
  });

  test('detail top navigation should only keep global JSON copy and remove global preview toggle', () => {
    // Top bar should not have global setViewMode toggle
    expect(content).not.toMatch(/setViewMode\(['"]preview['"]\)/);
    // Should retain handleCopyJson in top bar
    expect(content).toContain('handleCopyJson');
  });

  test('columns should have VS Code style headers with independent toggles and actions', () => {
    // Claude column header should have clientViewMode toggle and Claude cURL
    expect(content).toContain('setClientViewMode');
    expect(content).toContain('handleCopyClaudeCurl');

    // Gemini column header should have upstreamViewMode toggle and Gemini cURL
    expect(content).toContain('setUpstreamViewMode');
    expect(content).toContain('handleCopyGeminiCurl');
  });

  test('metadata ribbon should be single-line compact and eliminate redundant labels', () => {
    // Should use whitespace-nowrap and overflow-x-auto
    expect(content).toContain('overflow-x-auto');
    expect(content).toContain('whitespace-nowrap');

    // Should eliminate redundant prefixes like "Model:" and "Latency:"
    expect(content).not.toMatch(/>\s*Model:\s*\{selectedLog\.model\}/);
    expect(content).not.toMatch(/>\s*Latency:\s*\{selectedLog\.duration\}ms/);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: FAIL (因为 `LogsView.tsx` 尚未解耦状态和重构列头)

- [ ] **Step 3: 提交初始测试文件**

```bash
git add tests/logsViewHeaderOptimization.test.ts
git commit -m "test(logs): add assertions for header optimization and single-line metadata ribbon"
```

---

### Task 2: 重构 LogsView 详情页顶栏与元信息栏 (Navigation & Metadata Ribbon)

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:50-70,695-920`

**Interfaces:**
- Consumes: `selectedLog`, `adminKey`, `t`
- Produces: 
  - 拆分 `clientViewMode` 与 `upstreamViewMode` 状态
  - 顶栏纯净导航（仅保留 Tab 与 `[JSON]` 按钮）
  - 元信息栏单行化与徽章微晶化

- [ ] **Step 1: 在 `LogsView.tsx` 状态声明中替换 `viewMode` 为左右独立状态**

在 `frontend/src/components/LogsView.tsx` 中：
```typescript
// 将：
// const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
// 替换为：
const [clientViewMode, setClientViewMode] = useState<'preview' | 'raw'>('preview');
const [upstreamViewMode, setUpstreamViewMode] = useState<'preview' | 'raw'>('preview');
```

- [ ] **Step 2: 重构详情页顶栏 (Navigation Bar)**

移除顶栏中的 `Preview / Raw` 切换器与 `Claude cURL` / `Gemini cURL` 按钮，保留侧栏折叠、返回列表、三标签 Tab 以及右侧的全局 `[JSON]` 复制按钮：
```tsx
{/* Top Header & Navigation Bar */}
<div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08] gap-2.5 shrink-0">
  <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
    {/* Mobile back to list button */}
    <button
      onClick={() => setMobileDetailOpen(false)}
      className="md:hidden p-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 flex items-center space-x-1 text-xs shrink-0"
      title="Back to Logs List"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      <span className="font-semibold">{t('logs.backToList', '返回列表')}</span>
    </button>

    {/* Desktop Sidebar toggle button */}
    <button
      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
      className={`hidden md:flex p-1.5 rounded-lg border text-xs transition-colors items-center justify-center ${
        sidebarCollapsed
          ? 'bg-indigo-600/20 border-indigo-500/80 text-indigo-300'
          : 'ui-btn-secondary'
      }`}
      title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
    >
      {sidebarCollapsed ? (
        <PanelLeftOpen className="w-4 h-4" />
      ) : (
        <PanelLeftClose className="w-4 h-4" />
      )}
    </button>

    {/* Subtabs: Payload vs Response vs Chat */}
    <div className="ui-tab-container overflow-x-auto">
      <button
        onClick={() => setActiveTab('payload')}
        className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
          activeTab === 'payload' ? 'ui-tab-pill-active font-semibold' : ''
        }`}
      >
        <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[11px] sm:text-xs">{t('logs.payloadRequest')}</span>
      </button>
      <button
        onClick={() => setActiveTab('response')}
        className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
          activeTab === 'response' ? 'ui-tab-pill-active font-semibold' : ''
        }`}
      >
        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[11px] sm:text-xs">{t('logs.response')}</span>
      </button>
      <button
        onClick={() => setActiveTab('chat')}
        className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
          activeTab === 'chat' ? 'ui-tab-pill-active font-semibold' : ''
        }`}
      >
        <MessageSquare className="w-3.5 h-3.5" />
        <span className="text-[11px] sm:text-xs">{t('logs.chatTab', '对话视图')}</span>
      </button>
    </div>
  </div>

  {/* Global Action: Full Transaction JSON */}
  {selectedLog && (
    <div className="flex items-center space-x-1.5 shrink-0">
      <button
        onClick={handleCopyJson}
        className="px-2.5 py-1.5 ui-btn-secondary text-[11px] sm:text-xs font-mono flex items-center space-x-1"
        title="Copy full transaction JSON"
      >
        {copiedJson ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-semibold">{t('logs.copied', '已复制')}</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>JSON</span>
          </>
        )}
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 3: 重构第二行元信息栏 (Metadata Ribbon)**

精炼为单行、无多余 label、支持微芯片复制与横向滑动的结构：
```tsx
{/* Metadata Summary Header Ribbon (Single-line Compact) */}
{selectedLog && (
  <div className="ui-card-sub px-3 py-1.5 mb-3 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap">
    <div className="flex items-center space-x-2 shrink-0">
      {/* 1. Status Code */}
      {selectedLog.status !== null && selectedLog.status !== undefined && (
        <span className={`px-2 py-0.5 rounded font-bold border text-[10px] ${
          selectedLog.status >= 200 && selectedLog.status < 300 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' :
          selectedLog.status >= 400 && selectedLog.status < 500 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30' :
          'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30'
        }`}>
          {selectedLog.status} {selectedLog.status === 200 ? 'OK' : ''}
        </span>
      )}

      {/* 2. File Name Chip */}
      {selectedLog.filename && (
        <div
          onClick={handleCopyDetailFilename}
          className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
          title={`${t('logs.copyFilename', 'Copy filename')}: ${selectedLog.filename}`}
        >
          <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="max-w-[130px] truncate">
            {selectedLog.filename.replace(/^transaction_/, '').replace(/\.json$/, '')}
          </span>
          {copiedDetailFile ? (
            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <Copy className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
          )}
        </div>
      )}

      {/* 3. Path */}
      {selectedLog.path && (
        <span className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-medium">
          {selectedLog.path}
        </span>
      )}

      {/* 4. Stream Badge */}
      {selectedLog.isStream && (
        <span className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-bold text-[10px]">
          STREAM
        </span>
      )}
    </div>

    <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 shrink-0">
      {/* 5. Model */}
      {selectedLog.model && (
        <span
          className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded font-medium max-w-[180px] truncate"
          title={selectedLog.model}
        >
          {selectedLog.model}
        </span>
      )}

      {/* 6. Latency */}
      {selectedLog.duration !== undefined && selectedLog.duration !== null && (
        <span className={`border px-2 py-0.5 rounded font-medium ${
          selectedLog.duration < 1000
            ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20'
            : selectedLog.duration < 5000
            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20'
            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/20'
        }`}>
          {selectedLog.duration < 1000 ? `${selectedLog.duration}ms` : `${(selectedLog.duration / 1000).toFixed(2)}s`}
        </span>
      )}

      {/* 7. Timestamp */}
      {selectedLog.timestamp && (
        <span
          className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400"
          title={new Date(selectedLog.timestamp).toLocaleString()}
        >
          {new Date(selectedLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </span>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: 运行测试检查阶段性进度**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: 顶栏和元数据断言部分通过，列头部分等待 Task 3 完成

---

### Task 3: 实现 VS Code 风格列头与双栏独立模式切换

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:925-1085`

**Interfaces:**
- Consumes: `clientViewMode`, `upstreamViewMode`, `handleCopyClaudeCurl`, `handleCopyGeminiCurl`
- Produces: 
  - Payload 与 Response 标签下的左右栏独立切换
  - 标题栏右侧整合视图小胶囊及专属 cURL/Stream 徽章

- [ ] **Step 1: 重构 Payload 标签下双列结构**

在 `activeTab === 'payload'` 区域：
```tsx
{activeTab === 'payload' && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 h-full overflow-hidden">
    {/* Left Column: Claude Client Request */}
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]">
      {/* VS Code Style Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
        <div className="flex items-center space-x-2 text-[11px] font-semibold text-indigo-400">
          <span className="w-2 h-2 rounded-full bg-indigo-400" />
          <span>{t('logs.claudeClientReq')}</span>
        </div>
        <div className="flex items-center space-x-2">
          {/* View Mode Pill */}
          <div className="ui-tab-container text-[10px] font-medium p-0.5">
            <button
              onClick={() => setClientViewMode('preview')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                clientViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{t('logs.previewMode', 'Preview')}</span>
            </button>
            <button
              onClick={() => setClientViewMode('raw')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                clientViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3 h-3" />
              <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
            </button>
          </div>

          <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

          {/* Action: Claude cURL */}
          <button
            onClick={handleCopyClaudeCurl}
            className="px-2 py-0.5 ui-btn-secondary text-[10px] font-mono flex items-center space-x-1"
            title="Copy Claude proxy cURL command"
          >
            {copiedClaudeCurl ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">{t('logs.claudeCurlCopied', '已复制')}</span>
              </>
            ) : (
              <>
                <Terminal className="w-3 h-3 text-indigo-400" />
                <span>Claude cURL</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body Viewport */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {clientViewMode === 'preview' ? (
          <JsonTreeView data={selectedLog.client_req} />
        ) : (
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
        )}
      </div>
    </div>

    {/* Right Column: Gemini Upstream Request */}
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]">
      {/* VS Code Style Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
        <div className="flex items-center space-x-2 text-[11px] font-semibold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{t('logs.geminiUpstreamReq')}</span>
        </div>
        <div className="flex items-center space-x-2">
          {/* View Mode Pill */}
          <div className="ui-tab-container text-[10px] font-medium p-0.5">
            <button
              onClick={() => setUpstreamViewMode('preview')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                upstreamViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{t('logs.previewMode', 'Preview')}</span>
            </button>
            <button
              onClick={() => setUpstreamViewMode('raw')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                upstreamViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3 h-3" />
              <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
            </button>
          </div>

          <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

          {/* Action: Gemini cURL */}
          <button
            onClick={handleCopyGeminiCurl}
            className="px-2 py-0.5 ui-btn-secondary text-[10px] font-mono flex items-center space-x-1"
            title="Copy upstream Gemini cURL command"
          >
            {copiedGeminiCurl ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">{t('logs.geminiCurlCopied', '已复制')}</span>
              </>
            ) : (
              <>
                <Terminal className="w-3 h-3 text-emerald-400" />
                <span>Gemini cURL</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body Viewport */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {upstreamViewMode === 'preview' ? (
          <JsonTreeView data={selectedLog.gem_req} />
        ) : (
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
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: 重构 Response 标签下双列结构**

在 `activeTab === 'response'` 区域，应用相同的 VS Code 列头规范与独立切换逻辑，流式下显示 `SSE Stream` 徽章：
```tsx
{activeTab === 'response' && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 h-full overflow-hidden">
    {/* Left Column: Claude Final Response */}
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]">
      {/* VS Code Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
        <div className="flex items-center space-x-2 text-[11px] font-semibold text-amber-400">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>{t('logs.claudeFinalRes')}</span>
        </div>
        <div className="flex items-center space-x-2">
          {isStreamPayload(selectedLog.claude_res) && (
            <span className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-semibold">
              SSE Stream
            </span>
          )}
          <div className="ui-tab-container text-[10px] font-medium p-0.5">
            <button
              onClick={() => setClientViewMode('preview')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                clientViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{t('logs.previewMode', 'Preview')}</span>
            </button>
            <button
              onClick={() => setClientViewMode('raw')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                clientViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3 h-3" />
              <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Body Viewport */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {clientViewMode === 'preview' ? (
          isStreamPayload(selectedLog.claude_res) ? (
            <div className="flex-1 min-h-0 h-full overflow-y-auto pr-1">
              <SseStreamPreview streamData={selectedLog.claude_res} />
            </div>
          ) : (
            <JsonTreeView data={selectedLog.claude_res} />
          )
        ) : (
          <Editor
            height="100%"
            language="json"
            theme={monacoTheme}
            beforeMount={defineGeminiProxyTheme}
            value={JSON.stringify(selectedLog.claude_res, null, 2)}
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
        )}
      </div>
    </div>

    {/* Right Column: Gemini Upstream Response */}
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]">
      {/* VS Code Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
        <div className="flex items-center space-x-2 text-[11px] font-semibold text-purple-400">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          <span>{t('logs.geminiUpstreamRes')}</span>
        </div>
        <div className="flex items-center space-x-2">
          {isStreamPayload(selectedLog.gem_res) && (
            <span className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-semibold">
              SSE Stream
            </span>
          )}
          <div className="ui-tab-container text-[10px] font-medium p-0.5">
            <button
              onClick={() => setUpstreamViewMode('preview')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                upstreamViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{t('logs.previewMode', 'Preview')}</span>
            </button>
            <button
              onClick={() => setUpstreamViewMode('raw')}
              className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                upstreamViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code className="w-3 h-3" />
              <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Body Viewport */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {upstreamViewMode === 'preview' ? (
          isStreamPayload(selectedLog.gem_res) ? (
            <div className="flex-1 min-h-0 h-full overflow-y-auto pr-1">
              <SseStreamPreview streamData={selectedLog.gem_res} />
            </div>
          ) : (
            <JsonTreeView data={selectedLog.gem_res} />
          )
        ) : (
          <Editor
            height="100%"
            language="json"
            theme={monacoTheme}
            beforeMount={defineGeminiProxyTheme}
            value={JSON.stringify(selectedLog.gem_res, null, 2)}
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
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: 运行测试验证通过**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: PASS

- [ ] **Step 4: 提交改动**

```bash
git add frontend/src/components/LogsView.tsx tests/logsViewHeaderOptimization.test.ts
git commit -m "feat(logs): relocate preview toggles and curl actions to vscode-style column headers with single-line metadata ribbon"
```

---

### Task 4: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [ ] **Step 1: 运行全量 Jest 测试套件**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test`
Expected: 41 个测试套件全部 PASS

- [ ] **Step 2: 运行前端 Vite 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend`
Expected: 0 错误构建成功

- [ ] **Step 3: 运行后端 TypeScript 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend`
Expected: 0 错误构建成功

- [ ] **Step 4: 运行全量构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build`
Expected: SUCCESS

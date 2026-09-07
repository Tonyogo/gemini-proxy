# 移动端吸顶标题固定、详情页返回栏常驻与 API 调试器紧凑 2 行布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复移动端下日志请求页面标题与所有详情页返回标题未固定的问题（使顶部导航栏与返回按钮绝对吸顶固定，只有下部内容区局部滚动），并重构优化 API 调试器在移动端的控制栏排版为规整的 2 行紧凑布局。

**Architecture:** 
1. `frontend/src/App.tsx`: 在移动端将主应用外壳约束为 `h-[100dvh] max-h-[100dvh] overflow-hidden`，确保 `<header className="sticky top-0 z-40 shrink-0">` 永不参与内容滚动，使全局面包屑与所有详情页的返回按钮（`<ChevronLeft />`）在任何滚动深度下始终吸顶常驻；
2. `frontend/src/components/LogsView.tsx`: 明确拆分日志请求主列表为“固定头部与过滤区（`shrink-0`）”+“内部唯一定向滚动区（`flex-1 min-h-0 overflow-y-auto`）”+“固定分页区（`shrink-0`）”，使日志条目在独立容器内丝滑滚动而不带动外层标题上移；
3. `frontend/src/components/PlaygroundView.tsx`: 针对移动端（`lg:hidden`）重构为精准的 2 行布局：第 1 行由模型选择（45%）与接口端点/Stream 开关（55%）平分；第 2 行排列预设、cURL、压测与运行测试按钮，大幅释放垂直空间。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Jest.

## Global Constraints

- **常驻吸顶标准**: 移动端顶栏 Header（包含面包屑导航与详情页返回按钮）必须在任何子页面、任意滚动位置下 100% 固定在屏幕顶部，绝不随内容上滑移出视口。
- **列表滚动隔离**: 日志列表的滚动必须由内部条目容器 `overflow-y-auto` 独立承载，过滤控制项与分页栏固定吸附。
- **API 调试器移动端精准 2 行**: 移动端顶栏必须严格保持 2 行高度，绝不在任何机型（360px~430px）折行成 3~4 行。
- **构建零报错**: 必须通过 `npm run build:frontend` 和 Jest 单元测试。

---

### Task 1: 编写吸顶固定与 2 行布局断言测试 (`mobileStickyHeadersAndLayout.test.ts`)

**Files:**
- Create: `tests/mobileStickyHeadersAndLayout.test.ts`

**Interfaces:**
- Validates:
  - `App.tsx`: 移动端根容器具备 `h-[100dvh]` 与 `overflow-hidden`，`<header>` 具备 `sticky top-0 z-40 shrink-0`；
  - `LogsView.tsx`: 左侧请求列表区分出独立的 `overflow-y-auto` 滚动容器，头部与过滤区使用 `shrink-0`；
  - `PlaygroundView.tsx`: 包含移动端精准 2 行布局约束（模型与端点同行并排，操作按钮位于第 2 行）。

- [x] **Step 1: 编写测试用例**

Create `tests/mobileStickyHeadersAndLayout.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('Mobile Sticky Headers and Playground 2-Row Layout', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');

  describe('App.tsx Mobile Sticky Shell & Header', () => {
    const content = fs.readFileSync(appPath, 'utf-8');

    test('locks root viewport height and overflow on mobile', () => {
      expect(content).toContain('h-[100dvh]');
      expect(content).toContain('max-h-[100dvh]');
      expect(content).toContain('overflow-hidden');
    });

    test('header has sticky top-0, z-40 and shrink-0 to guarantee sticky positioning', () => {
      expect(content).toMatch(/<header[^>]*sticky\s+top-0[^>]*z-40[^>]*shrink-0/);
    });

    test('renders back button with ChevronLeft when isMobileDetailActive is true', () => {
      expect(content).toContain('isMobileDetailActive');
      expect(content).toContain('handleMobileBack');
      expect(content).toContain('ChevronLeft');
    });
  });

  describe('LogsView.tsx Isolated Scroll Containers', () => {
    const content = fs.readFileSync(logsViewPath, 'utf-8');

    test('separates master list filter controls and pagination into shrink-0 sections', () => {
      // Header and filter controls must be shrink-0
      expect(content).toMatch(/shrink-0[^>]*Date\s*&\s*Hour/i);
      expect(content).toContain('overflow-y-auto');
    });
  });

  describe('PlaygroundView.tsx Mobile 2-Row Compact Grid', () => {
    const content = fs.readFileSync(playgroundPath, 'utf-8');

    test('structures mobile workbench into exact 2-row compact layout', () => {
      // Row 1 contains model and endpoint
      expect(content).toContain('selectedModel');
      expect(content).toContain('endpointOption');
      expect(content).toContain('handleToggleStreamInBody');

      // Row 2 contains presets, action triggers, and run test button
      expect(content).toContain('handleApplyPreset');
      expect(content).toContain('handleSend');
    });
  });
});
```

- [x] **Step 2: 运行测试并验证测试失败**

Run: `npx jest tests/mobileStickyHeadersAndLayout.test.ts`
Expected: FAIL due to missing `z-40` or layout class definitions.

- [x] **Step 3: 提交测试文件**

```bash
git add tests/mobileStickyHeadersAndLayout.test.ts
git commit -m "test: add test suite for mobile sticky headers and playground 2-row layout"
```

---

### Task 2: 改造 `App.tsx` 实现原生级绝对吸顶外壳

**Files:**
- Modify: `frontend/src/App.tsx:385-395,550-570,700-710`
- Test: `tests/mobileStickyHeadersAndLayout.test.ts`

**Interfaces:**
- Produces:
  - 根外壳在移动端始终为 `h-[100dvh] max-h-[100dvh] overflow-hidden`
  - 顶栏固定在 `sticky top-0 z-40 shrink-0`
  - 详情页返回按钮在移动端详情激活时常驻悬浮可见

- [x] **Step 1: 修改 `App.tsx` 根容器与 Header 样式**

In `frontend/src/App.tsx`:
1. 根容器无论是否处于 `isWorkbenchTab`，在移动端统一保持 `h-[100dvh] max-h-[100dvh] overflow-hidden`：
```tsx
    <div className={`flex bg-[var(--bg-canvas)] text-[var(--text-primary)] font-sans selection:bg-indigo-500 selection:text-white antialiased h-[100dvh] max-h-[100dvh] overflow-hidden`}>
```
2. 主内容区域容器：
```tsx
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'md:pl-16' : 'md:pl-60'
        } pl-0 h-full min-h-0 overflow-hidden`}
      >
```
3. 顶栏 `<header>` 升级为高层级常驻吸顶：
```tsx
        <header className="h-12 sm:h-14 backdrop-blur-md bg-[var(--bg-surface)]/90 border-b border-[var(--border-subtle)] px-3 sm:px-6 flex items-center justify-between sticky top-0 z-40 shrink-0 select-none">
```
4. `<main>` 内容区容器：
```tsx
        <main className={`flex-1 min-h-0 overflow-hidden ${
          isMobileDetailActive
            ? 'p-0 md:p-6 pb-0 md:pb-6 flex flex-col h-full'
            : isWorkbenchTab
              ? 'p-2 sm:p-4 md:p-6 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:pb-6 flex flex-col h-full'
              : 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6 overflow-y-auto'
        }`}>
```

- [x] **Step 2: 运行测试验证 `App.tsx` 部分通过**

Run: `npx jest tests/mobileStickyHeadersAndLayout.test.ts`
Expected: `App.tsx Mobile Sticky Shell & Header` 测试通过。

- [x] **Step 3: 提交更改**

```bash
git add frontend/src/App.tsx
git commit -m "fix(app): lock mobile viewport shell and guarantee sticky top bar with back button"
```

---

### Task 3: 改造 `LogsView.tsx` 建立独立局部滚动隔离

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:385-530,680-725`
- Test: `tests/mobileStickyHeadersAndLayout.test.ts`

**Interfaces:**
- Produces:
  - 左侧请求列表：顶部标题/筛选与底部翻页固定，唯独日志条目区 `overflow-y-auto`；
  - 右侧详情：顶部子 Tab 栏固定，内部 Inspector 独立滚动。

- [x] **Step 1: 修改 `LogsView.tsx` 列表与详情容器**

In `frontend/src/components/LogsView.tsx`:
1. 将左侧主列表的“日期与时间选择器”以及“状态筛选与搜索框”明确包裹在 `shrink-0` 容器中：
```tsx
          {/* Date & Hour Dropdown Pickers */}
          <div className="grid grid-cols-2 gap-2 mb-2.5 shrink-0">
            {/* Date select */}
            ...
            {/* Hour select */}
            ...
          </div>

          {/* Status Filter Pills & Quick Search */}
          <div className="space-y-2 mb-2.5 pb-2.5 border-b border-white/[0.08] shrink-0">
            ...
          </div>
```
2. 确保日志条目滚动区使用 `flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 text-xs`：
```tsx
          {/* Master Log Entries List */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 text-xs overscroll-contain">
```
3. 确保底部翻页控件使用 `shrink-0 pt-2.5 mt-auto border-t border-white/[0.08]`：
```tsx
          {totalLogs > 0 && (
            <div className="pt-2.5 mt-auto border-t border-white/[0.08] flex flex-col gap-2 shrink-0">
```
4. 右侧详情容器中，确保子 Tab 与操作按钮栏保持 `shrink-0`，详情内容为 `flex-1 min-h-0 overflow-y-auto overscroll-contain`。

- [x] **Step 2: 运行测试验证 `LogsView.tsx` 部分通过**

Run: `npx jest tests/mobileStickyHeadersAndLayout.test.ts`
Expected: `LogsView.tsx Isolated Scroll Containers` 测试通过。

- [x] **Step 3: 提交更改**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "fix(logs): isolate scroll container so title and filters remain sticky on mobile"
```

---

### Task 4: 重构 `PlaygroundView.tsx` 移动端 2 行紧凑布局

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx:490-620`
- Test: `tests/mobileStickyHeadersAndLayout.test.ts`

**Interfaces:**
- Produces:
  - 移动端（`lg:hidden`）严格保持 2 行：
    - 行 1：`[模型选择 (45%)]` + `[端点选择 + Stream (55%)]`；
    - 行 2：`[预设] [cURL] [压测]` + `[运行测试 发送按钮]`；
  - 桌面端（`lg:flex`）保持单行流线型工作台。

- [x] **Step 1: 修改 `PlaygroundView.tsx` 顶栏排版**

In `frontend/src/components/PlaygroundView.tsx`:
将顶层控制条重构为自适应的双轨布局：
```tsx
      {/* Top Controls Header Workbench (Clean Control Bar with Strict 2-Row Mobile Grid) */}
      <div className="ui-card p-2 sm:p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2 relative z-30 shrink-0">
        {/* Row 1 (Mobile) / Left Group (Desktop): Model & Endpoint & Stream */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full lg:w-auto flex-1">
          {/* Model Selector (Flexible compact pill) */}
          <div className="flex items-center space-x-1.5 ui-card-sub px-2 py-1 flex-1 sm:flex-none min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer w-full truncate"
            >
              {STANDARD_MODELS.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>

          {/* Endpoint selector & Stream Toggle combined pill */}
          <div className="flex items-center space-x-1 ui-card-sub px-2 py-1 flex-[1.2] sm:flex-none min-w-0">
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={endpointOption}
              onChange={(e) => handleEndpointOptionChange(e.target.value as EndpointOption)}
              className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer truncate flex-1 min-w-0"
            >
              <option value="messages">POST /v1/messages</option>
              <option value="count_tokens">POST /v1/count_tokens</option>
              <option value="custom">{t('playground.customEndpoint')}</option>
            </select>

            {endpointOption === 'custom' && (
              <div className="flex items-center space-x-1 pl-1 border-l border-[var(--border-subtle)]">
                <select
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                  className="bg-transparent text-[11px] text-indigo-500 dark:text-indigo-400 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/v1/..."
                  className="ui-input py-0 px-1 text-[11px] font-mono w-16 sm:w-28"
                />
              </div>
            )}

            {/* Stream Toggle Pill embedded */}
            {endpointOption !== 'custom' && (
              <button
                type="button"
                onClick={handleToggleStreamInBody}
                className={`p-1 rounded-md text-[10px] font-semibold flex items-center space-x-0.5 transition-all border shrink-0 ${
                  isStreamChecked
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-black/[0.04] dark:bg-white/[0.04] border-transparent text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle stream: true/false in payload"
              >
                <Zap className={`w-3 h-3 ${isStreamChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">Stream</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2 (Mobile) / Right Group (Desktop): Presets, Tools, Status & Run Test Button */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full lg:w-auto shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Preset templates selector */}
            <div className="relative">
              <select
                value={activePreset || ''}
                onChange={(e) => {
                  if (e.target.value) {
                    handleApplyPreset(e.target.value as PresetKey);
                  }
                }}
                className="appearance-none ui-input pr-6 py-1 px-2 text-xs font-medium cursor-pointer"
              >
                <option value="" disabled>{t('playground.presets')}</option>
                <option value="basicChat">{t('playground.presetBasicChat')}</option>
                <option value="toolUse">{t('playground.presetToolUse')}</option>
                <option value="vision">{t('playground.presetVision')}</option>
                <option value="thinkingMode">{t('playground.presetThinkingMode')}</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Copy cURL Button */}
            <button
              onClick={handleCopyCurl}
              className="p-1 px-2 ui-btn-secondary flex items-center space-x-1 text-xs shrink-0 active:scale-95"
              title={t('playground.copyCurl')}
            >
              {copiedCurl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 hidden sm:inline">{t('playground.copied')}</span>
                </>
              ) : (
                <>
                  <Code className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">cURL</span>
                </>
              )}
            </button>

            {/* Concurrent Stress Test Modal Trigger */}
            <button
              onClick={handleOpenConcurrentModal}
              className="p-1 px-2 ui-btn-secondary flex items-center space-x-1 text-xs shrink-0 active:scale-95 hover:border-amber-500/30 hover:text-amber-300"
              title={t('playground.concurrentTest')}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{t('playground.stressTest')}</span>
            </button>

            {/* System Key Status Indicator (Desktop only) */}
            <div
              className="hidden lg:flex items-center space-x-1.5 px-2 py-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-mono select-none shrink-0"
              title={t('playground.systemKeyDesc')}
            >
              <Key className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              <span className="font-medium whitespace-nowrap">{t('playground.systemKeyActive')}</span>
            </div>
          </div>

          {/* Send Action Button */}
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-3 sm:px-4 py-1 ui-btn-primary flex items-center space-x-1.5 text-xs font-semibold disabled:opacity-50 shrink-0 shadow-md active:scale-95"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{t('playground.sending')}</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{t('playground.runTest')}</span>
              </>
            )}
          </button>
        </div>
      </div>
```

- [x] **Step 2: 运行测试验证全部测试通过**

Run: `npx jest tests/mobileStickyHeadersAndLayout.test.ts tests/cleanHeadersUnification.test.ts`
Expected: All tests pass.

- [x] **Step 3: 提交更改**

```bash
git add frontend/src/components/PlaygroundView.tsx
git commit -m "refactor(playground): optimize mobile selector layout into compact 2-row grid"
```

---

### Task 5: 前后端全量生产构建与回归验证

**Files:**
- All touched files
- Test: All suites

- [x] **Step 1: 运行完整前端测试套件**

Run: `npx jest tests/mobile*.test.ts tests/cleanHeaders*.test.ts tests/terminal*.test.ts`
Expected: 100% tests PASS.

- [x] **Step 2: 运行前端生产编译**

Run: `npm run build:frontend`
Expected: 0 errors, Vite production bundle generated successfully in `dist/frontend`.

- [x] **Step 3: 提交最终状态**

```bash
git status
git commit -m "chore: verify and finalize mobile sticky headers and playground layout optimization"
```

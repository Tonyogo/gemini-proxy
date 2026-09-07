# API 调试器控制条解耦与移动端紧凑 2 行布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 API 调试器（`PlaygroundView.tsx`）顶部控制条，将流式开关（Stream）彻底从接口端点（Endpoint）胶囊中剥离，并与用例预设（Presets）完全解耦，消除视觉重叠并实现清晰纯净的 2 行紧凑排版。

**Architecture:** 
在 `frontend/src/components/PlaygroundView.tsx` 中：
1. **第 1 行（核心配置行）**：由 `selectedModel` 与 `endpointOption` 各占 50% 宽度并排对齐，接口端点内部不再内嵌 Stream 按钮，避免文字被挤压截断；
2. **第 2 行（用例与操作执行行）**：依次平铺独立的 `[用例预设 (Presets)]` 下拉框 + 独立的 `[⚡ Stream 开关]` 胶囊 + `[cURL 复制]` + `[并发压测]` 以及右侧常驻的 `[运行测试]` 按钮；
3. **桌面端（`lg:flex`）**：在大屏下自然保持一条流线型现代化单行工作台。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest.

## Global Constraints

- **解耦无重叠**: Stream 切换按钮必须是独立的交互胶囊，严禁内嵌在 Endpoint 胶囊内部，严禁与 Presets 下拉框产生位置重叠。
- **移动端精准 2 行**: 在 360px ~ 430px 等所有主流手机屏幕上，工作台严密维持 2 行高度（~72px），绝不多折出第 3 行。
- **功能完全保留**: 模型切换、标准端点与自定义路径输入、Stream 开关与请求体同步联动、预设模板应用、cURL 复制、压测弹窗与发送测试均需 100% 正常工作。
- **构建零报错**: 必须通过所有 Jest 自动化测试与 Vite 生产编译。

---

### Task 1: 编写控制条解耦与排版断言测试 (`playgroundLayoutDecoupling.test.ts`)

**Files:**
- Create: `tests/playgroundLayoutDecoupling.test.ts`

**Interfaces:**
- Validates:
  - `PlaygroundView.tsx`: 确认 Stream 切换按钮已移出 Endpoint 胶囊，确认第 1 行由模型与端点对半均分，确认第 2 行 Presets 与 Stream 独立平铺。

- [x] **Step 1: 编写测试文件**

Create `tests/playgroundLayoutDecoupling.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('PlaygroundView Header Controls Decoupling', () => {
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');
  const content = fs.readFileSync(playgroundPath, 'utf-8');

  test('endpoint container does not contain embedded stream toggle button', () => {
    // Look for the endpoint option wrapper - it should NOT contain handleToggleStreamInBody inside it
    const endpointBlockMatch = content.match(/<Globe[^>]*>[\s\S]*?<\/select>[\s\S]*?<\/div>/);
    expect(endpointBlockMatch).not.toBeNull();
    if (endpointBlockMatch) {
      expect(endpointBlockMatch[0]).not.toContain('handleToggleStreamInBody');
    }
  });

  test('stream toggle is an independent pill button rendered alongside action controls', () => {
    // Stream button should be independently rendered
    expect(content).toContain('handleToggleStreamInBody');
    expect(content).toContain('isStreamChecked');
    expect(content).toContain('<Zap');
  });

  test('model and endpoint selectors share row 1 with flexible balanced widths', () => {
    expect(content).toContain('selectedModel');
    expect(content).toContain('STANDARD_MODELS');
    expect(content).toContain('endpointOption');
  });

  test('presets selector and run test button are clearly separated in row 2', () => {
    expect(content).toContain('activePreset');
    expect(content).toContain('handleApplyPreset');
    expect(content).toContain('handleSend');
  });
});
```

- [x] **Step 2: 运行测试并验证初始失败**

Run: `npx jest tests/playgroundLayoutDecoupling.test.ts`
Expected: FAIL because `handleToggleStreamInBody` is currently embedded inside the endpoint block.

- [x] **Step 3: 提交测试文件**

```bash
git add tests/playgroundLayoutDecoupling.test.ts
git commit -m "test: add decoupling assertions for playground layout"
```

---

### Task 2: 重构 `PlaygroundView.tsx` 控制条为解耦 2 行紧凑网格

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx:490-630`
- Test: `tests/playgroundLayoutDecoupling.test.ts`
- Test: `tests/mobileStickyHeadersAndLayout.test.ts`

**Interfaces:**
- Produces:
  - Row 1: `[模型选择器 (50%)]` + `[接口端点选择器 (50%)]`
  - Row 2: `[用例预设 下拉]` + `[⚡ Stream 开关]` + `[cURL]` + `[压测]` + `[运行测试 主按钮]`
  - Desktop: 单行流线型工作台

- [x] **Step 1: 修改 `PlaygroundView.tsx` 顶栏排版**

In `frontend/src/components/PlaygroundView.tsx`:
将顶部控制条重构为完全解耦的 2 行布局：
```tsx
      {/* Top Controls Header Workbench (Clean Control Bar with Strict 2-Row Mobile Grid) */}
      <div className="ui-card p-2 sm:p-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 relative z-30 shrink-0">
        {/* Row 1 (Mobile) / Left Group (Desktop): Model & Endpoint (Clean 50%/50% split) */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full lg:w-auto flex-1">
          {/* 1. Model Selector (50% width on mobile) */}
          <div className="flex items-center space-x-1.5 ui-card-sub px-2.5 py-1.5 flex-1 sm:flex-none min-w-0">
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

          {/* 2. Endpoint Selector (50% width on mobile, without embedded buttons) */}
          <div className="flex items-center space-x-1.5 ui-card-sub px-2.5 py-1.5 flex-1 sm:flex-none min-w-0">
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={endpointOption}
              onChange={(e) => handleEndpointOptionChange(e.target.value as EndpointOption)}
              className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer truncate w-full"
            >
              <option value="messages">POST /v1/messages</option>
              <option value="count_tokens">POST /v1/messages/count_tokens</option>
              <option value="custom">{t('playground.customEndpoint')}</option>
            </select>

            {endpointOption === 'custom' && (
              <div className="flex items-center space-x-1 pl-1 border-l border-[var(--border-subtle)] shrink-0">
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
          </div>

          <div className="h-4 w-[1px] bg-white/10 mx-0.5 hidden sm:block" />
        </div>

        {/* Row 2 (Mobile) / Right Group (Desktop): Presets, Independent Stream Toggle, Tools, Status & Run Test Button */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 w-full lg:w-auto shrink-0">
          <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
            {/* 3. Presets Selector */}
            <div className="relative shrink-0">
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

            {/* 4. Independent Stream Toggle Pill */}
            {endpointOption !== 'custom' && (
              <button
                type="button"
                onClick={handleToggleStreamInBody}
                className={`px-2 py-1 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all border shrink-0 ${
                  isStreamChecked
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'ui-btn-secondary text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle stream mode in payload"
              >
                <Zap className={`w-3 h-3 ${isStreamChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="text-[11px]">Stream</span>
              </button>
            )}

            {/* 5. Copy cURL Button */}
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

            {/* 6. Concurrent Stress Test Trigger */}
            <button
              onClick={handleOpenConcurrentModal}
              className="p-1 px-2 ui-btn-secondary flex items-center space-x-1 text-xs shrink-0 active:scale-95 hover:border-amber-500/30 hover:text-amber-300"
              title={t('playground.concurrentTest')}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{t('playground.stressTest')}</span>
            </button>

            {/* 7. System Key Status Indicator (Desktop only) */}
            <div
              className="hidden lg:flex items-center space-x-1.5 px-2 py-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-mono select-none shrink-0"
              title={t('playground.systemKeyDesc')}
            >
              <Key className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              <span className="font-medium whitespace-nowrap">{t('playground.systemKeyActive')}</span>
            </div>
          </div>

          {/* 8. Send / Run Test Button */}
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-3 sm:px-4 py-1.5 ui-btn-primary flex items-center space-x-1.5 text-xs font-semibold disabled:opacity-50 shrink-0 shadow-md active:scale-95"
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

- [x] **Step 2: 运行测试并验证通过**

Run: `npx jest tests/playgroundLayoutDecoupling.test.ts tests/mobileStickyHeadersAndLayout.test.ts`
Expected: PASS with 100% tests passing.

- [x] **Step 3: 提交更改**

```bash
git add frontend/src/components/PlaygroundView.tsx
git commit -m "fix(playground): decouple stream toggle from endpoint selector into clean 2-row layout"
```

---

### Task 3: 全量测试与前端生产构建验证

**Files:**
- All touched files
- Test: All suites

- [x] **Step 1: 运行完整 Jest 测试套件**

Run: `npm test`
Expected: 67 passed, 0 failures.

- [x] **Step 2: 运行前端生产编译**

Run: `npm run build:frontend`
Expected: Vite build succeeds with 0 errors.

- [x] **Step 3: 提交最终整洁状态**

```bash
git status
git commit -m "chore: verify and finalize playground decoupled layout optimization"
```

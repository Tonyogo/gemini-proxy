# 发现中心各子工具顶栏去重与纯净操作条统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构发现中心子工具（API 调试器、在线终端、运行日志）的内层头部布局，彻底消除冗余 Logo 与大标题，对齐翻译工作台的纯净操作条风格（Clean Control Bar Paradigm），大幅提升屏幕垂直利用率。

**Architecture:** 
1. 重构 `PlaygroundView.tsx`：移除大 Logo、标题与描述，合并模型选择、端点配置、Stream 开关、预设与运行测试按钮为紧凑单层/自适应两层操作条；
2. 精简 `WebTerminalView.tsx` 与 `TerminalLogsView.tsx`：移除窗口标题栏内部的重复静态标题文本，突出节点选择器与功能标签；
3. 构建严密的 Jest 前端断言测试，验证冗余元素移除且所有功能控制项无缝工作。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Jest.

## Global Constraints

- **纯净操作条标准**: 内层工作台坚决不放静态模块大标题、Logo 和长文本说明，模块归属完全由全局面包屑表达。
- **操作完整性**: 模型选择、端点切换、自定义路径输入、Stream 开关、预设模板、并发压测、cURL 复制、系统密钥提示与运行测试按钮等全部功能 100% 保留。
- **全屏与响应式**: 移动端和桌面端排版平稳，无横向溢出或视觉挤压。

---

### Task 1: 编写顶栏去重与纯净操作条测试用例 (`cleanHeadersUnification.test.ts`)

**Files:**
- Create: `tests/cleanHeadersUnification.test.ts`

**Interfaces:**
- Validates:
  - `PlaygroundView.tsx`: 确认已移除 `playground.title`、`playground.subtitle`、大图标，确认保留 `STANDARD_MODELS`、`handleSend`、`Send` 等交互；
  - `WebTerminalView.tsx`: 确认顶栏不再渲染静态 `webTerminal.title` 标题文本，确认保留 `TerminalHostSelector` 与操作按键；
  - `TerminalLogsView.tsx`: 确认顶栏不再渲染静态 `terminal.title` 标题文本，确认保留 Tab 切换与过滤控件。

- [x] **Step 1: 编写测试文件**

Create `tests/cleanHeadersUnification.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('Clean Headers Unification & Redundant Title Elimination', () => {
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const terminalLogsPath = path.resolve(__dirname, '../frontend/src/components/TerminalLogsView.tsx');

  describe('PlaygroundView Header Cleanliness', () => {
    const content = fs.readFileSync(playgroundPath, 'utf-8');

    test('removes redundant big logo, title and subtitle text from inner workbench', () => {
      // Should NOT render h2 with playground.title or p with playground.subtitle
      expect(content).not.toMatch(/<h2[^>]*>\s*\{t\(['"]playground\.title['"]\)\}\s*<\/h2>/);
      expect(content).not.not.toMatch(/<p[^>]*>\s*\{t\(['"]playground\.subtitle['"]\)\}\s*<\/p>/);
      expect(content).not.toContain('{t(\'playground.subtitle\')}');
      expect(content).not.toContain('v1.0');
    });

    test('preserves all functional controls in the unified workbench bar', () => {
      // Model selector
      expect(content).toContain('selectedModel');
      expect(content).toContain('STANDARD_MODELS');

      // Endpoint selector
      expect(content).toContain('endpointOption');
      expect(content).toContain('customMethod');
      expect(content).toContain('customPath');

      // Stream toggle
      expect(content).toContain('handleToggleStreamInBody');

      // Action buttons
      expect(content).toContain('handleSend');
      expect(content).toContain('handleCopyCurl');
      expect(content).toContain('handleOpenConcurrentModal');
      expect(content).toContain('playground.systemKeyActive');
    });
  });

  describe('WebTerminalView Header Cleanliness', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');

    test('removes duplicate static title text webTerminal.title from top window bar', () => {
      expect(content).not.toContain("{t('webTerminal.title')}");
    });

    test('preserves TerminalHostSelector and window action buttons', () => {
      expect(content).toContain('<TerminalHostSelector');
      expect(content).toContain('handleFullscreenToggle');
      expect(content).toContain('handleResetSession');
    });
  });

  describe('TerminalLogsView Header Cleanliness', () => {
    const content = fs.readFileSync(terminalLogsPath, 'utf-8');

    test('removes duplicate static title text terminal.title from window toolbar', () => {
      expect(content).not.toContain("{t('terminal.title')}");
    });

    test('preserves interactive tab toggle and log filters', () => {
      expect(content).toContain("t('terminal.interactiveTab')");
      expect(content).toContain("t('terminal.logsTab')");
      expect(content).toContain('filterLevel');
    });
  });
});
```

- [x] **Step 2: 运行测试并验证测试按预期失败**

Run: `npx jest tests/cleanHeadersUnification.test.ts`
Expected: FAIL due to existing redundant titles in `PlaygroundView`, `WebTerminalView`, and `TerminalLogsView`.

- [x] **Step 3: 提交初始测试**

```bash
git add tests/cleanHeadersUnification.test.ts
git commit -m "test: add test suite for clean headers unification"
```

---

### Task 2: 重构 `PlaygroundView.tsx` 头部为纯净操作条

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx:478-620`
- Test: `tests/cleanHeadersUnification.test.ts`

**Interfaces:**
- Consumes:
  - `STANDARD_MODELS`, `EndpointOption`, `PRESETS`, `useTranslation`, `useTheme`
- Produces:
  - 扁平化单层操作工具栏：
    - `[模型选择]` + `[端点选择]` + `[Stream 开关]` + `[预设模板]` + `[cURL 复制]` + `[并发压测]` + `[密钥提示]` + `[运行测试]`

- [x] **Step 1: 修改 `PlaygroundView.tsx` 顶栏结构**

In `frontend/src/components/PlaygroundView.tsx`:
将原本的 `Row 1 (Brand Logo & Title)` + `Row 2` + `Row 3` 结构重构为与 `TranslateView` 保持一致的响应式操作卡片：
```tsx
      {/* Top Controls Header Workbench (Clean Control Bar aligned with TranslateView) */}
      <div className="ui-card p-2.5 sm:p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-2.5 relative z-30 shrink-0">
        {/* Left Core Configuration Group (Model & Endpoint) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto flex-1">
          {/* Model Selector */}
          <div className="flex items-center space-x-1.5 ui-card-sub px-2.5 py-1 flex-1 sm:flex-none">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer w-full sm:w-auto"
            >
              {STANDARD_MODELS.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>

          {/* Endpoint selector */}
          <div className="flex items-center space-x-1.5 ui-card-sub px-2.5 py-1 flex-1 sm:flex-none">
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={endpointOption}
              onChange={(e) => handleEndpointOptionChange(e.target.value as EndpointOption)}
              className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer"
            >
              <option value="messages">POST /v1/messages</option>
              <option value="count_tokens">POST /v1/messages/count_tokens</option>
              <option value="custom">{t('playground.customEndpoint')}</option>
            </select>

            {endpointOption === 'custom' && (
              <div className="flex items-center space-x-1 pl-1.5 border-l border-[var(--border-subtle)]">
                <select
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                  className="bg-transparent text-xs text-indigo-500 dark:text-indigo-400 font-bold focus:outline-none cursor-pointer"
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
                  className="ui-input py-0.5 px-2 text-xs font-mono w-20 sm:w-36"
                />
              </div>
            )}
          </div>

          {/* Stream Toggle Pill */}
          {endpointOption !== 'custom' && (
            <button
              type="button"
              onClick={handleToggleStreamInBody}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all border shrink-0 ${
                isStreamChecked
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : 'ui-btn-secondary text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle stream: true/false in payload"
            >
              <Zap className={`w-3 h-3 ${isStreamChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>Stream</span>
            </button>
          )}
        </div>

        {/* Right Auxiliary & Execution Action Group */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 shrink-0">
          {/* Preset templates selector */}
          <div className="relative">
            <select
              value={activePreset || ''}
              onChange={(e) => {
                if (e.target.value) {
                  handleApplyPreset(e.target.value as PresetKey);
                }
              }}
              className="appearance-none ui-input pr-7 py-1 px-2.5 text-xs font-medium cursor-pointer"
            >
              <option value="" disabled>{t('playground.presets')}</option>
              <option value="basicChat">{t('playground.presetBasicChat')}</option>
              <option value="toolUse">{t('playground.presetToolUse')}</option>
              <option value="vision">{t('playground.presetVision')}</option>
              <option value="thinkingMode">{t('playground.presetThinkingMode')}</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Copy cURL Button */}
          <button
            onClick={handleCopyCurl}
            className="p-1.5 sm:px-2.5 sm:py-1 ui-btn-secondary flex items-center space-x-1.5 text-xs shrink-0 active:scale-95"
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
            className="p-1.5 sm:px-2.5 sm:py-1 ui-btn-secondary flex items-center space-x-1.5 text-xs shrink-0 active:scale-95 hover:border-amber-500/30 hover:text-amber-300"
            title={t('playground.concurrentTest')}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">{t('playground.stressTest')}</span>
          </button>

          {/* System Key Status Indicator */}
          <div
            className="hidden sm:flex items-center space-x-1.5 px-2 py-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-mono select-none shrink-0"
            title={t('playground.systemKeyDesc')}
          >
            <Key className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            <span className="font-medium whitespace-nowrap">{t('playground.systemKeyActive')}</span>
          </div>

          {/* Send Action Button */}
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

- [x] **Step 2: 运行测试并验证 `PlaygroundView` 部分通过**
 
 Run: `npx jest tests/cleanHeadersUnification.test.ts`
 Expected: `PlaygroundView Header Cleanliness` tests pass.
 
- [x] **Step 3: 提交更改**
 
 ```bash
 git add frontend/src/components/PlaygroundView.tsx
 git commit -m "refactor(playground): streamline header into clean workbench bar aligned with translate"
 ```
 
 ---
 
 ### Task 3: 精简 `WebTerminalView.tsx` 与 `TerminalLogsView.tsx` 窗口栏
 
 **Files:**
 - Modify: `frontend/src/components/WebTerminalView.tsx:1200-1208`
 - Modify: `frontend/src/components/TerminalLogsView.tsx:240-249`
 - Test: `tests/cleanHeadersUnification.test.ts`
 
- [x] **Step 1: 修改 `WebTerminalView.tsx`**
 
 In `frontend/src/components/WebTerminalView.tsx`:
 移除内部冗余静态文本：
 ```tsx
           ) : null}
 ```
 使左侧紧密连接 `macOS 操作点` 与 `TerminalHostSelector`。
 
- [x] **Step 2: 修改 `TerminalLogsView.tsx`**
 
 In `frontend/src/components/TerminalLogsView.tsx`:
 移除内部冗余静态文本：
 ```tsx
           ) : null}
 ```
 
- [x] **Step 3: 运行测试并验证全部通过**
 
 Run: `npx jest tests/cleanHeadersUnification.test.ts`
 Expected: PASS with 100% tests passing.
 
- [x] **Step 4: 提交更改**
 
 ```bash
 git add frontend/src/components/WebTerminalView.tsx frontend/src/components/TerminalLogsView.tsx
 git commit -m "refactor(terminal): eliminate redundant static titles from terminal and logs headers"
 ```
 
 ---
 
 ### Task 4: 前后端全量回归验证与编译构建测试
 
 **Files:**
 - All touched files
 - Test: All suites
 
- [x] **Step 1: 运行完整测试套件**
 
 Run: `npx jest tests/cleanHeadersUnification.test.ts tests/terminal*.test.ts`
 Expected: All suites PASS.
 
- [x] **Step 2: 执行全量前端生产构建**
 
 Run: `npm run build:frontend`
 Expected: 0 errors, Vite production build successful.
 
- [x] **Step 3: 提交最终整洁状态**

```bash
git status
git commit -m "chore: verify and finalize clean headers unification across discover tools"
```

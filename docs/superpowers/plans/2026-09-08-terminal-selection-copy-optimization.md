# 终端文本选择与高阶复制交互优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 WebTerminal 的文本划选与复制体验：在桌面端实现划选后选区旁弹出轻量复制悬浮微气泡以及顶栏复制按键实时联动；在移动端将原本臃肿易换行的选择浮层重构为 iOS 风格紧凑单行毛玻璃胶囊。

**Architecture:** 
1. **桌面端选区捕获与微气泡定位 (`WebTerminalView.tsx`)**: 监听 xterm.js 选区变化及 `mouseup` 事件，动态计算选区末端像素坐标，在选区右上角展示轻量悬浮气泡 `[ 📋 复制 (N 字) ]`；在顶栏操作区常驻快捷复制按键，随选区状态实时点亮；
2. **移动端选择胶囊紧凑重构 (`WebTerminalView.tsx`)**: 将顶部浮层容器限定为严格单行 `whitespace-nowrap max-w-[95vw]`，精简文案与按钮尺寸（`[ ✏️ ]`、`[ ⬚ 全选 ]`、`[ 📋 复制 N字 ]`、`[ ✕ ]`、`[ ✓ 完成 ]`），彻底消除换行挤压错乱；
3. **多语言词条扩充 (`zh.ts`, `en.ts`)**: 增补 `selectAllShort` 等紧凑短词。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, xterm.js, Jest.

## Global Constraints

- **桌面端交互直观**: 选中文本后在光标/选区末端直接展示复制小气泡，且顶栏按钮同步高亮，点击任一处均可立即复制并清空选区。
- **移动端严禁换行**: 无论屏幕宽度为 360px、375px 还是 390px，移动端选择模式浮层严格维持单行展示（高度 ~32px），绝不多折出第二行。
- **平滑兼容 Alternate Buffer**: 在运行类似 Claude CLI 会话等全屏交互式命令行时，鼠标划选与复制机制始终稳定可用。
- **全量测试与构建通过**: 新增 Jest 断言测试套件，并通过全量 `npm test` 与 `npm run build:frontend`。

---

### Task 1: 编写选区与复制交互断言测试 (`tests/terminalSelectionCopy.test.ts`)

**Files:**
- Create: `tests/terminalSelectionCopy.test.ts`

**Interfaces:**
- Validates:
  - `WebTerminalView.tsx`: 包含桌面端选区悬浮气泡渲染逻辑（基于 `selectionBubblePos` 与 `hasSelection`）
  - `WebTerminalView.tsx`: 顶栏操作区常驻 `handleCopySelection` 快捷按钮与 `hasSelection` 状态联动
  - `WebTerminalView.tsx`: 移动端选择模式浮层包含 `whitespace-nowrap`、`max-w-[95vw]` 单行防折行约束
  - `frontend/src/i18n/locales/zh.ts` 与 `en.ts`: 包含精简版选择文案键值

- [x] **Step 1: 编写自动化测试文件**

Create `tests/terminalSelectionCopy.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('Terminal Selection and Copy Optimization Tests', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const zhLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  const terminalContent = fs.readFileSync(webTerminalPath, 'utf-8');
  const zhContent = fs.readFileSync(zhLocalePath, 'utf-8');
  const enContent = fs.readFileSync(enLocalePath, 'utf-8');

  test('WebTerminalView contains floating copy bubble for desktop selection', () => {
    // Should manage bubble position state or selection bubble anchor
    expect(terminalContent).toContain('selectionBubblePos');
    // Should render floating bubble with copy action
    expect(terminalContent).toMatch(/selectionBubblePos\s*&&\s*hasSelection/);
    expect(terminalContent).toContain('handleCopySelection');
  });

  test('WebTerminalView top control bar contains persistent copy button linked to hasSelection', () => {
    // Top bar action buttons section should have a copy button wired to hasSelection
    const actionButtonsMatch = terminalContent.match(/\{\/\*\s*Action Buttons\s*\*\/\}[\s\S]*?\{\/\*\s*xterm\.js Canvas Container/);
    expect(actionButtonsMatch).not.toBeNull();
    if (actionButtonsMatch) {
      expect(actionButtonsMatch[0]).toContain('handleCopySelection');
      expect(actionButtonsMatch[0]).toContain('hasSelection');
    }
  });

  test('Mobile selection mode bar enforces single-line layout without line wraps', () => {
    // Selection mode floating bar must have strict nowrap and max width
    expect(terminalContent).toContain('whitespace-nowrap');
    expect(terminalContent).toMatch(/max-w-\[(?:92|95)vw\]/);
  });

  test('i18n locales contain compact selection keys', () => {
    expect(zhContent).toContain('selectAllShort');
    expect(enContent).toContain('selectAllShort');
  });
});
```

- [x] **Step 2: 运行测试并验证初始失败**

Run: `npx jest tests/terminalSelectionCopy.test.ts`
Expected: FAIL because `selectionBubblePos` and `selectAllShort` are not implemented yet.

- [x] **Step 3: 提交测试文件**

```bash
git add tests/terminalSelectionCopy.test.ts
git commit -m "test: add test assertions for terminal selection and copy optimization"
```

---

### Task 2: 增补紧凑选区文案国际化 (`zh.ts` 与 `en.ts`)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts:450-480`
- Modify: `frontend/src/i18n/locales/en.ts:450-480`

**Interfaces:**
- Produces:
  - `webTerminal.selectAllShort`: "全选" / "Select All"
  - `webTerminal.selectChars`: "{count} 字" / "{count} chars"
  - `webTerminal.copyChars`: "复制 ({count})" / "Copy ({count})"

- [x] **Step 1: 修改 `frontend/src/i18n/locales/zh.ts`**

In `webTerminal`:
```typescript
    selectAllShort: "全选",
    selectChars: "{count} 字",
    copyChars: "复制 ({count})",
```

- [x] **Step 2: 修改 `frontend/src/i18n/locales/en.ts`**

In `webTerminal`:
```typescript
    selectAllShort: "All",
    selectChars: "{count} chars",
    copyChars: "Copy ({count})",
```

- [x] **Step 3: 提交国际化文件**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add compact selection and copy localization strings"
```

---

### Task 3: 实现桌面端选区悬浮复制微气泡与顶栏快捷按键

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Test: `tests/terminalSelectionCopy.test.ts`

**Interfaces:**
- Produces:
  - 状态 `selectionBubblePos: { x: number; y: number } | null`
  - 状态 `selectedCharCount: number`
  - 顶栏右侧常驻 `[ 📋 复制 ]` 按钮，有选区时高亮并指示已选字符数
  - 终端选区末端右上角自适应定位浮动微气泡，点击即复制并淡出

- [x] **Step 1: 在 `WebTerminalView.tsx` 中增加选区坐标与气泡定位逻辑**

在组件状态中增加：
```tsx
  const [selectionBubblePos, setSelectionBubblePos] = useState<{ x: number; y: number } | null>(null);
  const [selectedCharCount, setSelectedCharCount] = useState<number>(0);
```

在选区监听及鼠标抬起事件中计算气泡坐标：
```tsx
    const selectionDisposable = term.onSelectionChange(() => {
      const selected = term.hasSelection();
      setHasSelection(selected);
      if (selected) {
        const text = term.getSelection();
        setSelectedCharCount(text.length);
      } else {
        setSelectedCharCount(0);
        setSelectionBubblePos(null);
      }
    });
```

监听容器 `mouseup` 计算相对位置（桌面端）：
```tsx
    const handleMouseUp = (e: MouseEvent) => {
      if (isMobile) return;
      setTimeout(() => {
        if (term.hasSelection() && terminalContainerRef.current) {
          const containerRect = terminalContainerRef.current.getBoundingClientRect();
          const bubbleWidth = 110;
          const bubbleHeight = 36;
          let x = e.clientX - containerRect.left + 8;
          let y = e.clientY - containerRect.top - bubbleHeight - 6;

          // Boundary checks
          if (x + bubbleWidth > containerRect.width) {
            x = Math.max(10, containerRect.width - bubbleWidth - 10);
          }
          if (y < 8) {
            y = e.clientY - containerRect.top + 16;
          }

          setSelectionBubblePos({ x, y });
        } else {
          setSelectionBubblePos(null);
        }
      }, 20);
    };

    const containerEl = terminalContainerRef.current;
    if (containerEl) {
      containerEl.addEventListener('mouseup', handleMouseUp);
    }
```

在 `handleCopySelection` 成功时清空 `selectionBubblePos`：
```tsx
      const doCopy = () => {
        showToast(t('webTerminal.copiedToClipboard'));
        setIsSelectMode(false);
        isSelectModeRef.current = false;
        xtermRef.current?.clearSelection();
        setHasSelection(false);
        setSelectionBubblePos(null);
        setSelectedCharCount(0);
      };
```

- [x] **Step 2: 在顶栏操作区常驻快捷复制按钮**

在 `WebTerminalView.tsx` 的 `Action Buttons` 区域中（在 Zoom Out 按钮之前）：
```tsx
          {/* Top Bar Copy Button */}
          <button
            type="button"
            disabled={!hasSelection}
            onClick={handleCopySelection}
            className={`p-1 sm:p-1.5 rounded-lg border transition-all flex items-center space-x-1 shrink-0 ${
              hasSelection
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.4)] active:scale-95 cursor-pointer'
                : 'bg-white/[0.04] text-slate-500 border-white/[0.06] opacity-40 cursor-not-allowed'
            }`}
            title={hasSelection ? t('webTerminal.copySelection') : t('webTerminal.copy')}
          >
            <Copy className="w-3.5 h-3.5" />
            {hasSelection && selectedCharCount > 0 && (
              <span className="text-[10px] font-mono hidden md:inline px-1 py-0.5 bg-black/20 rounded">
                {selectedCharCount}
              </span>
            )}
          </button>
```

- [x] **Step 3: 渲染桌面端选区悬浮复制微气泡**

在 `xterm.js Canvas Container` 内部渲染悬浮气泡：
```tsx
        {/* Desktop Floating Copy Bubble */}
        {!isMobile && selectionBubblePos && hasSelection && (
          <div
            className="absolute z-30 flex items-center shadow-2xl rounded-xl bg-slate-900/95 dark:bg-slate-900/95 border border-indigo-500/40 text-white p-1 text-xs backdrop-blur-md animate-in fade-in zoom-in-95 select-none pointer-events-auto"
            style={{
              left: `${selectionBubblePos.x}px`,
              top: `${selectionBubblePos.y}px`,
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCopySelection}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium text-xs transition-all shadow-sm"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{t('webTerminal.copy')}</span>
              {selectedCharCount > 0 && (
                <span className="text-[10px] opacity-80 font-mono">({selectedCharCount})</span>
              )}
            </button>
          </div>
        )}
```

- [x] **Step 4: 提交桌面端代码**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): add desktop selection floating bubble and topbar copy button"
```

---

### Task 4: 重构移动端选择模式浮层为紧凑单行毛玻璃胶囊

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:1380-1460`
- Test: `tests/terminalSelectionCopy.test.ts`

**Interfaces:**
- Produces:
  - 容器样式：`max-w-[95vw] whitespace-nowrap overflow-x-auto no-scrollbar`
  - 按钮组：
    - `TextSelect` 状态指示
    - `[ ⬚ 全选 ]` (紧凑短按键)
    - `[ 📋 复制 N字 ]` (动态字数，有选区时高亮渐变)
    - `[ ✕ 清除 ]` (有选区时显示)
    - `[ ✓ 完成 ]` (退出选择模式)

- [x] **Step 1: 重构 `WebTerminalView.tsx` 中的移动端浮层**

替换原有 `isSelectMode && (...)` 区域：
```tsx
        {/* Floating Selection Mode Bar (Compact iOS-style Single-Line Capsule) */}
        {isSelectMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-2xl bg-[var(--bg-surface)]/95 border border-indigo-500/30 text-[var(--text-primary)] text-xs backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-top-2 select-none whitespace-nowrap max-w-[95vw] overflow-x-auto no-scrollbar">
            {/* Status Icon Indicator */}
            <div className="flex items-center text-amber-500 dark:text-amber-400 font-semibold px-1 shrink-0" title={t('webTerminal.selectModeActive')}>
              <TextSelect className="w-3.5 h-3.5" />
            </div>

            <div className="h-3.5 w-[1px] bg-[var(--border-subtle)] shrink-0" />

            {/* Select Screen / All (Compact) */}
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2 py-0.5 rounded-lg bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] dark:hover:bg-white/[0.15] active:scale-95 text-[var(--text-primary)] text-[11px] font-medium transition-all shrink-0"
            >
              {t('webTerminal.selectAllShort', '全选')}
            </button>

            {/* Clear Selection (Visible when has selection) */}
            {hasSelection && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="p-1 rounded-lg bg-black/[0.05] dark:bg-white/[0.08] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 active:scale-95 text-[11px] transition-all shrink-0"
                title={t('webTerminal.clearSelection')}
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Copy Button (Highlights and shows count when selected) */}
            <button
              type="button"
              disabled={!hasSelection}
              onClick={handleCopySelection}
              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-all shrink-0 ${
                hasSelection
                  ? 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-sm ring-1 ring-indigo-400/50 cursor-pointer'
                  : 'bg-black/[0.04] dark:bg-white/[0.05] text-slate-400 opacity-40 cursor-not-allowed'
              }`}
              title={t('webTerminal.copy')}
            >
              <Copy className="w-3 h-3" />
              <span>{t('webTerminal.copy')}</span>
              {hasSelection && selectedCharCount > 0 && (
                <span className="text-[10px] font-mono opacity-85">({selectedCharCount})</span>
              )}
            </button>

            {/* Done / Exit Select Mode */}
            <button
              type="button"
              onClick={handleExitSelectMode}
              className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center space-x-1 text-[11px] font-semibold transition-all shrink-0 cursor-pointer"
              title={t('webTerminal.done')}
            >
              <Check className="w-3 h-3 stroke-[2.5]" />
              <span>{t('webTerminal.done')}</span>
            </button>
          </div>
        )}
```

- [x] **Step 2: 运行测试并验证通过**

Run: `npx jest tests/terminalSelectionCopy.test.ts`
Expected: PASS (100% tests passing).

- [x] **Step 3: 提交移动端排版重构代码**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "fix(terminal): refactor mobile selection mode bar into compact single-row capsule"
```

---

### Task 5: 全量回归测试与前端生产编译验证

**Files:**
- All touched files
- Test: All suites

- [x] **Step 1: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: All suites passed (68 suites, 0 failures).

- [x] **Step 2: 运行前端生产编译**

Run: `npm run build:frontend`
Expected: Vite build succeeds cleanly with 0 errors.

- [x] **Step 3: 提交最终整洁状态**

```bash
git status
git commit -m "chore: verify and finalize terminal selection and copy interaction optimization"
```

# 终端统一划选复制模式与透明手势捕获层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过引入透明手势捕获层（Selection Gesture Overlay）彻底解决两端体验问题：在移动端彻底根治“在文字区域只能选中单字、无法滑动多选”的 WebKit DOM 突变丢事件缺陷；在桌面端增加顶栏划选开关，在 Claude 等开启鼠标跟踪的会话中阻断协议穿透，实现自由划选与松手即自动复制。

**Architecture:** 
1. **透明手势捕获层 (`WebTerminalView.tsx`)**: 在划选模式开启（`isSelectMode = true`）时挂载覆盖于终端之上的纯净无子节点手势层 `<div className="absolute inset-0 z-20 cursor-crosshair touch-none select-none" />`，将触摸/鼠标事件与底层的 xterm 字符重绘彻底解耦，杜绝 DOM 节点突变导致浏览器丢弃 `touchmove` 事件；
2. **正反向坐标规范化引擎 (`WebTerminalView.tsx`)**: 统一使用全局索引 `row * cols + col` 判断正反向，始终保证 `selectionStart` 早于 `selectionEnd`，解决反向拖选（从下往上、从右往左）时的模型越界问题；
3. **顶栏模式快捷开关与桌面 Copy on Select (`WebTerminalView.tsx`)**: 顶栏全屏按钮旁增加 `[ ✏️ 划选 ]` 开关；在桌面端拖拽松开鼠标（`onMouseUp`）后自动调用剪贴板写入、弹出 Toast，并平滑退出划选模式。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, xterm.js, Jest.

## Global Constraints

- **手势层彻底稳定**: 进入划选模式后，所有 touch/mouse 事件均由手势捕获层承接，底层 xterm 字符高亮重绘绝不影响手指连续滑动。
- **全区域流畅划选**: 移动端在文字字符上或空白处起手拖拽，滑动体验 100% 一致且流畅多行多字选取。
- **Claude 会话兼容**: 桌面端在 Claude 等全屏会话中开启划选模式后，完全屏蔽应用的鼠标捕获协议，松开鼠标自动复制。
- **全量测试与构建通过**: 新增 Jest 断言测试套件，并通过全量 `npm test` 与 `npm run build:frontend`。

---

### Task 1: 编写手势捕获层与划选复制断言测试 (`tests/terminalSelectionOverlay.test.ts`)

**Files:**
- Create: `tests/terminalSelectionOverlay.test.ts`
- Modify: `tests/terminalCopyOnSelectAndTouchFix.test.ts`

**Interfaces:**
- Validates:
  - `WebTerminalView.tsx`: 包含透明手势捕获层 DOM (`selection-gesture-overlay` 或 `data-testid="selection-overlay"`)
  - `WebTerminalView.tsx`: 顶栏 Action Buttons 包含 `handleToggleSelectMode` 划选开关
  - `WebTerminalView.tsx`: 选区引擎规范化计算（`from` 早于 `to`，杜绝 `selectionStart > selectionEnd` 错误）
  - `WebTerminalView.tsx`: 桌面端在手势层上 `mouseUp` 自动执行复制并关闭模式

- [x] **Step 1: 编写 `tests/terminalSelectionOverlay.test.ts`**

Create `tests/terminalSelectionOverlay.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('Terminal Selection Gesture Overlay Tests', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const terminalContent = fs.readFileSync(webTerminalPath, 'utf-8');

  test('WebTerminalView renders transparent gesture overlay when isSelectMode is active', () => {
    // Should render overlay container with select-none, touch-none, absolute inset-0
    expect(terminalContent).toContain('selection-gesture-overlay');
    expect(terminalContent).toMatch(/isSelectMode\s*&&[\s\S]*?selection-gesture-overlay/);
    expect(terminalContent).toContain('cursor-crosshair');
  });

  test('Top bar action buttons include select mode toggle button', () => {
    const actionButtonsMatch = terminalContent.match(/\{\/\*\s*Action Buttons\s*\*\/\}[\s\S]*?\{\/\*\s*xterm\.js Canvas Container/);
    expect(actionButtonsMatch).not.toBeNull();
    if (actionButtonsMatch) {
      expect(actionButtonsMatch[0]).toContain('handleToggleSelectMode');
      expect(actionButtonsMatch[0]).toContain('TextSelect');
    }
  });

  test('applySelection implements order-safe coordinate calculation', () => {
    // from must precede to in document order
    expect(terminalContent).toContain('startOrder');
    expect(terminalContent).toContain('currentOrder');
    expect(terminalContent).toContain('isReversed');
  });

  test('desktop overlay mouseUp triggers copy and exits select mode', () => {
    expect(terminalContent).toContain('handleOverlayMouseUp');
    expect(terminalContent).toContain('handleCopySelection');
  });
});
```

- [x] **Step 2: 运行测试并验证初始失败**

Run: `npx jest tests/terminalSelectionOverlay.test.ts`
Expected: FAIL because `selection-gesture-overlay` and `handleOverlayMouseUp` are not yet added.

- [x] **Step 3: 提交测试套件**

```bash
git add tests/terminalSelectionOverlay.test.ts
git commit -m "test: add assertions for terminal selection gesture overlay and unified copy"
```

---

### Task 2: 规范化选区坐标引擎与实现透明手势捕获层

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:570-650, 1490-1540`
- Test: `tests/terminalSelectionOverlay.test.ts`

**Interfaces:**
- Produces:
  - 规范化 `applySelection(start, current)`：
    通过 `startOrder = start.bufferRow * cols + start.col` 和 `currentOrder` 正确判断 `isReversed`，使 `selectionStart` 永远在文档序的前方，修复逆向拖拽的 bug。
  - 在 Canvas 容器内增加绝对定位手势层：
    `<div className="selection-gesture-overlay absolute inset-0 z-20 cursor-crosshair touch-none select-none" ... />`
  - 在手势层上挂载稳定的触控与鼠标事件：`onTouchStart`, `onTouchMove`, `onTouchEnd`, `onMouseDown`, `onMouseMove`, `onMouseUp`。

- [x] **Step 1: 在 `WebTerminalView.tsx` 中升级 `applySelection` 坐标引擎**

```tsx
    // Helper: apply terminal selection range supporting multi-line and reverse drag with strict document order
    const applySelection = (
      start: { col: number; bufferRow: number },
      current: { col: number; bufferRow: number }
    ) => {
      const selectionService = (term as any)._core?._selectionService;
      const startOrder = start.bufferRow * term.cols + start.col;
      const currentOrder = current.bufferRow * term.cols + current.col;
      const isReversed = startOrder > currentOrder;

      const from = isReversed ? current : start;
      const to = isReversed ? start : current;

      if (selectionService && selectionService._model) {
        selectionService._model.selectionStart = [from.col, from.bufferRow];
        selectionService._model.selectionEnd = [to.col + 1, to.bufferRow];
        selectionService._model.selectionStartLength = 0;
        selectionService.refresh();
        selectionService._fireEventIfSelectionChanged();
        return;
      }

      // Public API fallback using viewport-relative coordinates
      const viewportY = term.buffer.active.viewportY;
      const fromViewportRow = Math.max(0, Math.min(term.rows - 1, from.bufferRow - viewportY));
      const toViewportRow = Math.max(0, Math.min(term.rows - 1, to.bufferRow - viewportY));
      const length = Math.max(1, (to.bufferRow - from.bufferRow) * term.cols + (to.col - from.col) + 1);
      term.select(from.col, fromViewportRow, length);
    };
```

- [x] **Step 2: 编写手势捕获层的事件处理器**

在 `WebTerminalView.tsx` 中定义手势层专用事件函数：
```tsx
    const handleOverlayTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const cell = getCellCoordsFromTouch(touch.clientX, touch.clientY);
        if (cell) {
          selectionStartPos = cell;
          applySelection(cell, cell);
        }
      }
    };

    const handleOverlayTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && selectionStartPos) {
        const touch = e.touches[0];
        const currentCell = getCellCoordsFromTouch(touch.clientX, touch.clientY);
        if (currentCell) {
          applySelection(selectionStartPos, currentCell);
        }
      }
    };

    const handleOverlayTouchEnd = () => {
      selectionStartPos = null;
    };

    let isMouseSelecting = false;
    let mouseSelectionStart: { col: number; bufferRow: number } | null = null;

    const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      isMouseSelecting = true;
      const cell = getCellCoordsFromTouch(e.clientX, e.clientY);
      if (cell) {
        mouseSelectionStart = cell;
        applySelection(cell, cell);
      }
    };

    const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isMouseSelecting || !mouseSelectionStart) return;
      const currentCell = getCellCoordsFromTouch(e.clientX, e.clientY);
      if (currentCell) {
        applySelection(mouseSelectionStart, currentCell);
      }
    };

    const handleOverlayMouseUp = () => {
      if (isMouseSelecting) {
        isMouseSelecting = false;
        mouseSelectionStart = null;
        // Desktop Copy on Select: if text is selected, copy immediately and exit select mode
        const text = xtermRef.current?.getSelection();
        if (text && text.trim().length > 0) {
          handleCopySelection();
        }
      }
    };
```

- [x] **Step 3: 渲染手势捕获层**

在 Canvas 容器内，当 `isSelectMode` 为 true 时渲染该手势层：
```tsx
        {/* Selection Gesture Overlay: Decouples user gesture tracking from xterm character DOM rendering */}
        {isSelectMode && (
          <div
            className="selection-gesture-overlay absolute inset-0 z-20 cursor-crosshair touch-none select-none bg-transparent"
            onTouchStart={handleOverlayTouchStart}
            onTouchMove={handleOverlayTouchMove}
            onTouchEnd={handleOverlayTouchEnd}
            onMouseDown={handleOverlayMouseDown}
            onMouseMove={handleOverlayMouseMove}
            onMouseUp={handleOverlayMouseUp}
          />
        )}
```

- [x] **Step 4: 提交手势捕获层代码**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): implement transparent selection gesture overlay and order-safe coordinates"
```

---

### Task 3: 顶栏集成划选快捷开关与全流程交互打通

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:1350-1410`
- Test: `tests/terminalSelectionOverlay.test.ts`
- Test: `tests/terminalCopyOnSelectAndTouchFix.test.ts`

**Interfaces:**
- Produces:
  - 顶栏 Action Buttons 区域集成 `[ ✏️ 划选模式 ]` 图标按钮；
  - 移动端选择模式单行条保持不变；
  - 桌面端点击划选按钮后光标变十字准星，划选完松手即自动复制并退出。

- [x] **Step 1: 在顶栏 Action Buttons 中添加划选开关按钮**

在全屏按钮（`handleFullscreenToggle`）左侧添加：
```tsx
          {/* Select / Copy Mode Toggle (Desktop & Mobile unified) */}
          <button
            type="button"
            onClick={handleToggleSelectMode}
            className={`p-1 sm:p-1.5 rounded-lg border transition-all flex items-center space-x-1 shrink-0 ${
              isSelectMode
                ? 'bg-amber-500/20 text-amber-500 dark:text-amber-300 border-amber-500/40 shadow-sm ring-1 ring-amber-500/30'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06]'
            }`}
            title={isSelectMode ? t('webTerminal.exitSelectMode', '退出选择') : t('webTerminal.selectMode', '划选模式')}
          >
            <TextSelect className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden xl:inline">
              {isSelectMode ? t('webTerminal.exitSelectMode', '退出选择') : t('webTerminal.selectMode', '划选模式')}
            </span>
          </button>
```

- [x] **Step 2: 运行测试并验证通过**

Run: `npx jest tests/terminalSelectionOverlay.test.ts tests/terminalCopyOnSelectAndTouchFix.test.ts`
Expected: PASS (100% passing).

- [x] **Step 3: 提交更改**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): integrate select mode toggle in top bar action buttons"
```

---

### Task 4: 全量回归测试与生产构建验证

**Files:**
- All touched files
- Test: All Jest suites

- [x] **Step 1: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: 68 passed, 0 failures.

- [x] **Step 2: 运行前端生产编译**

Run: `npm run build:frontend`
Expected: Vite build succeeds cleanly with 0 errors.

- [x] **Step 3: 提交最终整洁状态**

```bash
git status
git commit -m "chore: verify and finalize terminal selection overlay and unified copy implementation"
```

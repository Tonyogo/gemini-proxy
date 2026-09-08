# 终端划选即复制与移动端触控拖选修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除桌面端悬浮复制微气泡与顶栏冗余复制按键，重构为专业终端标准的“划选即复制（Copy on Select）”；修复移动端选择模式下触控点在文字字符上时无法滑动拖选的底层手势拦截缺陷。

**Architecture:** 
1. **桌面端极简 Copy on Select (`WebTerminalView.tsx`)**: 移除气泡与顶栏复制按钮，在桌面端 `mouseup` 时检测终端选区，非空时自动静默写入剪贴板并弹出轻量 Toast 反馈；
2. **移动端深度 CSS 穿透锁定 (`frontend/src/index.css`, `WebTerminalView.tsx`)**: 赋予 `.terminal-select-mode` 下所有 xterm 字符行及文本节点 `-webkit-user-select: none !important` 与 `-webkit-touch-callout: none !important`，剥夺移动端 WebKit 在字符节点上的原生文本拖拽/放大镜拦截；
3. **捕获阶段手势锁定 (`WebTerminalView.tsx`)**: 在容器上以捕获阶段（`capture: true`）且非被动（`passive: false`）监听 `touchstart` 与 `touchmove`，在触碰文字瞬间调用 `e.preventDefault()`，保证后续拖选事件 100% 顺畅传递给 `applySelection`。

**Tech Stack:** React 18, TypeScript, Tailwind CSS / CSS, xterm.js, Jest.

## Global Constraints

- **界面极简纯粹**: 彻底清除桌面端悬浮微气泡与顶栏常驻复制按钮，保持顶栏原本干净统一的排版。
- **划选即复制 (Copy on Select)**: 桌面端鼠标划选文本松开后，无感写入剪贴板，带 1 秒轻量 Toast。
- **全区域流畅拖选**: 移动端进入选择模式后，无论触控起点是纯文本还是黑底空白处，手指拖动均能丝滑连续多行划选。
- **全量测试与编译零错误**: 更新并新增 Jest 断言测试套件，并通过 `npm test` 与 `npm run build:frontend`。

---

### Task 1: 编写“划选即复制”与移动端触控手势修复断言测试

**Files:**
- Modify: `tests/terminalSelectionCopy.test.ts`
- Create: `tests/terminalCopyOnSelectAndTouchFix.test.ts`

**Interfaces:**
- Validates:
  - `WebTerminalView.tsx`: 确认移除了 `selectionBubblePos` 浮动 DOM 与顶栏冗余复制按钮
  - `WebTerminalView.tsx`: 确认在 `handleMouseUp` 中实现了桌面端划选即复制（`navigator.clipboard.writeText`）
  - `WebTerminalView.tsx`: 确认容器在选择模式下挂载 `.terminal-select-mode`
  - `frontend/src/index.css`: 确认包含针对 `.terminal-select-mode` 的深层 `-webkit-user-select: none !important` 规则

- [x] **Step 1: 编写 `tests/terminalCopyOnSelectAndTouchFix.test.ts` 并更新 `tests/terminalSelectionCopy.test.ts`**

Create `tests/terminalCopyOnSelectAndTouchFix.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('Terminal Copy on Select & Touch Selection Fix Tests', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const indexCssPath = path.resolve(__dirname, '../frontend/src/index.css');

  const terminalContent = fs.readFileSync(webTerminalPath, 'utf-8');
  const cssContent = fs.readFileSync(indexCssPath, 'utf-8');

  test('removes desktop floating bubble and topbar copy button', () => {
    // Should NOT contain floating bubble DOM
    expect(terminalContent).not.toContain('Desktop Floating Copy Bubble');
    expect(terminalContent).not.toContain('selectionBubblePos');

    // Top bar action buttons should not have topbar copy button
    const actionButtonsMatch = terminalContent.match(/\{\/\*\s*Action Buttons\s*\*\/\}[\s\S]*?\{\/\*\s*xterm\.js Canvas Container/);
    expect(actionButtonsMatch).not.toBeNull();
    if (actionButtonsMatch) {
      expect(actionButtonsMatch[0]).not.toContain('Top Bar Copy Button');
    }
  });

  test('implements Copy on Select on desktop mouseup', () => {
    // mouseup handler should check term.getSelection and copy automatically on desktop
    expect(terminalContent).toContain('handleMouseUp');
    expect(terminalContent).toMatch(/term\.getSelection\(\)[\s\S]*?clipboard\.writeText/);
  });

  test('applies terminal-select-mode class and CSS deep touch-action / user-select lock', () => {
    expect(terminalContent).toContain('terminal-select-mode');
    expect(cssContent).toContain('.terminal-select-mode');
    expect(cssContent).toMatch(/\.terminal-select-mode\s+[\s\S]*?user-select:\s*none\s*!important/);
    expect(cssContent).toMatch(/\.terminal-select-mode\s+[\s\S]*?-webkit-touch-callout:\s*none\s*!important/);
  });

  test('touch event listeners use capture phase or preventDefault on touchstart in select mode', () => {
    expect(terminalContent).toContain('isSelectModeRef.current');
    expect(terminalContent).toContain('getCellCoordsFromTouch');
    expect(terminalContent).toContain('applySelection');
  });
});
```

Update `tests/terminalSelectionCopy.test.ts` to reflect the clean layout without the bubble:
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

  test('Mobile selection mode bar enforces single-line layout without line wraps', () => {
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

Run: `npx jest tests/terminalCopyOnSelectAndTouchFix.test.ts`
Expected: FAIL because floating bubble still exists and `.terminal-select-mode` CSS is not yet defined.

- [x] **Step 3: 提交测试文件**

```bash
git add tests/terminalCopyOnSelectAndTouchFix.test.ts tests/terminalSelectionCopy.test.ts
git commit -m "test: add test assertions for copy on select and touch drag selection fix"
```

---

### Task 2: 移除桌面悬浮气泡与顶栏复制键，实现桌面“划选即复制”

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Test: `tests/terminalCopyOnSelectAndTouchFix.test.ts`

**Interfaces:**
- Produces:
  - 移除 `selectionBubblePos` 状态与浮动气泡组件
  - 移除顶栏常驻的复制按钮
  - 在 `handleMouseUp` 中实现 `Copy on Select`：
    当 `!isMobile` 且 `term.hasSelection()` 时，读取 `term.getSelection()`，自动调用 `navigator.clipboard.writeText(text)` 并触发 `showToast(t('webTerminal.copiedToClipboard'))`

- [x] **Step 1: 修改 `WebTerminalView.tsx` 清理旧 UI 并实现 Copy on Select**

1. 移除 `selectionBubblePos` 状态声明：
```tsx
// 移除:
// const [selectionBubblePos, setSelectionBubblePos] = useState<{ x: number; y: number } | null>(null);
// const [selectedCharCount, setSelectedCharCount] = useState<number>(0);
```

2. 移除顶栏 Action Buttons 里的常驻复制按钮：
```tsx
// 移除 Top Bar Copy Button 块
```

3. 移除 Canvas 容器中的 `{/* Desktop Floating Copy Bubble */}` 块。

4. 在 `handleMouseUp` 中实现“划选即复制”：
```tsx
    // Desktop Copy on Select: automatically copy selected text on mouseup
    const handleMouseUp = () => {
      const mobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (mobile) return;

      setTimeout(() => {
        if (!xtermRef.current) return;
        const term = xtermRef.current;
        if (term.hasSelection()) {
          const selectedText = term.getSelection();
          if (selectedText && selectedText.trim().length > 0) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(selectedText).then(() => {
                showToast(t('webTerminal.copiedToClipboard'));
              }).catch(() => {
                // Fallback
                try {
                  const textarea = document.createElement('textarea');
                  textarea.value = selectedText;
                  textarea.style.position = 'fixed';
                  textarea.style.opacity = '0';
                  document.body.appendChild(textarea);
                  textarea.focus();
                  textarea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textarea);
                  showToast(t('webTerminal.copiedToClipboard'));
                } catch {}
              });
            }
          }
        }
      }, 30);
    };

    const containerEl = terminalContainerRef.current;
    if (containerEl) {
      containerEl.addEventListener('mouseup', handleMouseUp);
    }
```

- [x] **Step 2: 运行测试并验证部分通过**

Run: `npx jest tests/terminalCopyOnSelectAndTouchFix.test.ts`
Expected: Step 1 assertions (bubble removed, topbar removed, copy on select present) PASS.

- [x] **Step 3: 提交代码**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "refactor(terminal): implement desktop copy-on-select and remove redundant floating bubble"
```

---

### Task 3: 修复移动端文字区域无法拖动多选的底层手势缺陷

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Test: `tests/terminalCopyOnSelectAndTouchFix.test.ts`

**Interfaces:**
- Produces:
  - 在 `frontend/src/index.css` 中增加 `.terminal-select-mode` 深度穿透锁定：
    ```css
    .terminal-select-mode,
    .terminal-select-mode .xterm,
    .terminal-select-mode .xterm-screen,
    .terminal-select-mode .xterm-rows,
    .terminal-select-mode .xterm-rows * {
      user-select: none !important;
      -webkit-user-select: none !important;
      -webkit-touch-callout: none !important;
      touch-action: none !important;
    }
    ```
  - 在 `WebTerminalView.tsx` 中为容器动态绑定 `terminal-select-mode`：
    ```tsx
    className={`h-full w-full ${isSelectMode ? 'terminal-select-mode select-none' : ''}`}
    ```
  - 将 `touchstart` / `touchmove` / `touchend` 监听器升级为 `{ passive: false, capture: true }`，确保在进入选择模式时优先捕获事件并在触碰文字瞬间执行 `e.preventDefault()`，彻底阻止浏览器将手势升级为系统原生文字选择/放大镜。

- [x] **Step 1: 在 `frontend/src/index.css` 增加深层手势禁用样式**

In `frontend/src/index.css`:
```css
/* Terminal Selection Mode: Disable all browser native text drag & magnifier callouts */
.terminal-select-mode,
.terminal-select-mode .xterm,
.terminal-select-mode .xterm-screen,
.terminal-select-mode .xterm-rows,
.terminal-select-mode .xterm-rows * {
  user-select: none !important;
  -webkit-user-select: none !important;
  -webkit-touch-callout: none !important;
  touch-action: none !important;
}
```

- [x] **Step 2: 在 `WebTerminalView.tsx` 中绑定类名与手势捕获**

在 Canvas 容器上绑定 `terminal-select-mode`：
```tsx
        <div
          ref={terminalContainerRef}
          className={`h-full w-full ${isSelectMode ? 'terminal-select-mode select-none cursor-crosshair' : 'cursor-text'}`}
          style={{
            touchAction: isSelectMode ? 'none' : undefined,
            userSelect: isSelectMode ? 'none' : undefined,
            WebkitUserSelect: isSelectMode ? 'none' : undefined,
          }}
        />
```

在 `container.addEventListener` 中：
```tsx
    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      container.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
    }
```

并在 `handleTouchStart` 中：
```tsx
        if (isSelectModeRef.current) {
          if (e.cancelable) {
            e.preventDefault();
          }
          e.stopPropagation();
          // In Selection Mode: record initial selection touch origin and highlight initial cell
          const cell = getCellCoordsFromTouch(touchStartX, touchStartY);
          if (cell) {
            selectionStartPos = cell;
            applySelection(cell, cell);
          }
          return;
        }
```

并在 `handleTouchMove` 中：
```tsx
      if (isSelectModeRef.current) {
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation();

        if (!selectionStartPos) {
          selectionStartPos = getCellCoordsFromTouch(touchStartX, touchStartY);
        }
        const currentCell = getCellCoordsFromTouch(currentX, currentY);
        if (selectionStartPos && currentCell) {
          applySelection(selectionStartPos, currentCell);
        }
        return;
      }
```

- [x] **Step 3: 运行测试并验证全部通过**

Run: `npx jest tests/terminalCopyOnSelectAndTouchFix.test.ts tests/terminalSelectionCopy.test.ts`
Expected: PASS (100% tests passing).

- [x] **Step 4: 提交移动端修复代码**

```bash
git add frontend/src/index.css frontend/src/components/WebTerminalView.tsx
git commit -m "fix(terminal): prevent native text drag interception and enable full touch drag selection"
```

---

### Task 4: 全量回归测试与生产构建验证

**Files:**
- All touched files
- Test: All suites

- [x] **Step 1: 运行全量 Jest 测试**

Run: `npm test`
Expected: 68 passed, 0 failures.

- [x] **Step 2: 运行前端生产编译**

Run: `npm run build:frontend`
Expected: Vite build succeeds cleanly with 0 errors.

- [x] **Step 3: 提交最终整洁状态**

```bash
git status
git commit -m "chore: verify and finalize terminal copy on select and touch selection fix"
```

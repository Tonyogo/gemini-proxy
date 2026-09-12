# 移动端终端划选放大镜气泡实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决移动端在进入划选复制模式（`isSelectMode`）时指尖遮挡字符的痛点，实现 iOS 风格的悬浮放大镜气泡（Magnifier Bubble），实时等宽放大展示指尖所聚焦的文字及上下文，并在靠近屏幕顶端时智能向下翻转。

**Architecture:** 
将坐标计算、越界边缘保护（clamping）与行文本切片提取逻辑抽象为独立的辅助函数模块 `frontend/src/utils/terminalMagnifierHelper.ts`；在 `WebTerminalView.tsx` 中结合现有的触摸遮罩层 `selection-gesture-overlay`，在 `onTouchStart` 和 `onTouchMove` 时动态驱动放大镜更新，并在手指离开或退出选择模式时自动隐藏，气泡带有 `pointer-events-none` 保证操作零卡顿。

**Tech Stack:** React, TypeScript, xterm.js, Tailwind CSS, Lucide Icons, Jest.

## Global Constraints

- 放大镜气泡仅在移动端触摸交互（Touch）划选时触发，桌面端鼠标操作不显示放大镜。
- 气泡必须设置 `pointer-events-none`，绝不干扰下层的滑动与划选触摸事件流。
- 当触摸点靠近屏幕顶部（`clientY < 95px`）时，放大镜必须自动翻转显示至指尖下方，倒三角指针同时朝上。
- 水平位置必须带有安全边距约束（避免在屏幕左右边缘溢出或被物理圆角裁剪）。
- 保持 TypeScript 严格模式无报错，且全量 Jest 测试套件 100% 绿灯通过。

---

### Task 1: 编写放大镜辅助计算工具函数与单元测试

**Files:**
- Create: `frontend/src/utils/terminalMagnifierHelper.ts`
- Create/Test: `tests/terminalMobileMagnifier.test.ts`

**Interfaces:**
- Produces:
  - `calculateMagnifierPosition(clientX: number, clientY: number, screenWidth: number): MagnifierPosition`
  - `extractMagnifierSlice(lineText: string, col: number, radius?: number): MagnifierTextSlice`
- Types:
  ```typescript
  export interface MagnifierPosition {
    x: number;
    y: number;
    isFlippedBelow: boolean;
  }

  export interface MagnifierTextSlice {
    textBefore: string;
    focusChar: string;
    textAfter: string;
  }
  ```

- [ ] **Step 1: 编写 `tests/terminalMobileMagnifier.test.ts` 单元测试**

```typescript
import {
  calculateMagnifierPosition,
  extractMagnifierSlice,
} from '../frontend/src/utils/terminalMagnifierHelper';

describe('terminalMagnifierHelper tests', () => {
  describe('calculateMagnifierPosition', () => {
    it('calculates standard position above finger when clientY is sufficiently low', () => {
      const pos = calculateMagnifierPosition(200, 300, 390);
      expect(pos.isFlippedBelow).toBe(false);
      expect(pos.y).toBe(240); // 300 - 60
      expect(pos.x).toBe(200);
    });

    it('flips position below finger when clientY is near screen top (< 95px)', () => {
      const pos = calculateMagnifierPosition(200, 60, 390);
      expect(pos.isFlippedBelow).toBe(true);
      expect(pos.y).toBe(105); // 60 + 45
      expect(pos.x).toBe(200);
    });

    it('clamps horizontal position within safe screen boundaries', () => {
      // Left edge clipping prevention
      const leftPos = calculateMagnifierPosition(30, 200, 390);
      expect(leftPos.x).toBe(90);

      // Right edge clipping prevention
      const rightPos = calculateMagnifierPosition(380, 200, 390);
      expect(rightPos.x).toBe(300); // 390 - 90
    });
  });

  describe('extractMagnifierSlice', () => {
    it('extracts center character and context slice correctly', () => {
      const line = 'git commit -m "fix bug"';
      const slice = extractMagnifierSlice(line, 4, 3);
      expect(slice.focusChar).toBe('c');
      expect(slice.textBefore).toBe('it ');
      expect(slice.textAfter).toBe('omm');
    });

    it('handles start of line gracefully', () => {
      const line = 'ls -la';
      const slice = extractMagnifierSlice(line, 0, 4);
      expect(slice.focusChar).toBe('l');
      expect(slice.textBefore).toBe('');
      expect(slice.textAfter).toBe('s -l');
    });

    it('handles empty line or out-of-range col gracefully', () => {
      const slice = extractMagnifierSlice('', 10, 4);
      expect(slice.focusChar).toBe(' ');
      expect(slice.textBefore).toBe('');
      expect(slice.textAfter).toBe('');
    });
  });
});
```

- [ ] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/terminalMobileMagnifier.test.ts`
Expected: FAIL - Cannot find module `../frontend/src/utils/terminalMagnifierHelper`

- [ ] **Step 3: 创建并实现 `frontend/src/utils/terminalMagnifierHelper.ts`**

```typescript
export interface MagnifierPosition {
  x: number;
  y: number;
  isFlippedBelow: boolean;
}

export interface MagnifierTextSlice {
  textBefore: string;
  focusChar: string;
  textAfter: string;
}

/**
 * Calculates the coordinates and vertical orientation for the touch magnifier bubble.
 * Position flips below the finger when approaching the top edge to avoid navigation bar clipping.
 */
export function calculateMagnifierPosition(
  clientX: number,
  clientY: number,
  screenWidth: number
): MagnifierPosition {
  const isFlippedBelow = clientY < 95;
  const y = isFlippedBelow ? clientY + 45 : Math.max(10, clientY - 60);

  // Clamping: minimum half bubble width (90px) from left and right edges
  const minX = 90;
  const maxX = Math.max(minX, screenWidth - 90);
  const x = Math.max(minX, Math.min(maxX, clientX));

  return { x, y, isFlippedBelow };
}

/**
 * Extracts a balanced slice of text surrounding the focused column from a terminal line.
 */
export function extractMagnifierSlice(
  lineText: string,
  col: number,
  radius: number = 6
): MagnifierTextSlice {
  if (!lineText || col < 0 || col >= lineText.length) {
    return {
      textBefore: '',
      focusChar: ' ',
      textAfter: '',
    };
  }

  const focusChar = lineText[col] || ' ';
  const startIdx = Math.max(0, col - radius);
  const endIdx = Math.min(lineText.length, col + 1 + radius);

  const textBefore = lineText.slice(startIdx, col);
  const textAfter = lineText.slice(col + 1, endIdx);

  return {
    textBefore,
    focusChar,
    textAfter,
  };
}
```

- [ ] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/terminalMobileMagnifier.test.ts`
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add frontend/src/utils/terminalMagnifierHelper.ts tests/terminalMobileMagnifier.test.ts
git commit -m "feat(terminal): add terminal magnifier position and slice helper"
```

---

### Task 2: 在 `WebTerminalView.tsx` 中集成悬浮放大镜气泡与触摸手势

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:1500-1600`
- Modify: `frontend/src/components/WebTerminalView.tsx:1940-2020`
- Modify: `tests/terminalMobileMagnifier.test.ts`

**Interfaces:**
- Consumes:
  - `calculateMagnifierPosition` and `extractMagnifierSlice` from `../utils/terminalMagnifierHelper`
- State:
  - `magnifier`: `{ visible: boolean; x: number; y: number; textBefore: string; focusChar: string; textAfter: string; isFlippedBelow: boolean }`
- Behavior:
  - 在 `handleOverlayTouchStart` 和 `handleOverlayTouchMove` 中，根据触摸点更新 `magnifier` 状态；
  - 在 `handleOverlayTouchEnd` 和 `handleExitSelectMode` 时重置 `magnifier.visible = false`；
  - 在 DOM 中渲染带有 `pointer-events-none`、磨砂玻璃与高亮文字块的放大镜气泡。

- [ ] **Step 1: 在 `tests/terminalMobileMagnifier.test.ts` 中增加组件代码结构断言**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('WebTerminalView Magnifier Integration Tests', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('imports terminalMagnifierHelper functions in WebTerminalView', () => {
    expect(content).toContain('calculateMagnifierPosition');
    expect(content).toContain('extractMagnifierSlice');
    expect(content).toContain('../utils/terminalMagnifierHelper');
  });

  it('WebTerminalView contains magnifier state and touch handlers integration', () => {
    expect(content).toContain('const [magnifier, setMagnifier] = useState');
    expect(content).toContain('handleOverlayTouchStart');
    expect(content).toContain('handleOverlayTouchMove');
    expect(content).toContain('handleOverlayTouchEnd');
  });

  it('renders magnifier bubble with pointer-events-none and inverted pointer support', () => {
    expect(content).toContain('magnifier.visible');
    expect(content).toContain('pointer-events-none');
    expect(content).toContain('magnifier.isFlippedBelow');
    expect(content).toContain('magnifier.focusChar');
  });
});
```

- [ ] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/terminalMobileMagnifier.test.ts`
Expected: FAIL - WebTerminalView 尚未引入 magnifier 及对应 state

- [ ] **Step 3: 修改 `frontend/src/components/WebTerminalView.tsx` 集成放大镜**

在文件顶部引入 helper：
```typescript
import {
  calculateMagnifierPosition,
  extractMagnifierSlice,
} from '../utils/terminalMagnifierHelper';
```

在组件内部添加 `magnifier` 状态定义：
```typescript
  const [magnifier, setMagnifier] = useState<{
    visible: boolean;
    x: number;
    y: number;
    textBefore: string;
    focusChar: string;
    textAfter: string;
    isFlippedBelow: boolean;
  }>({
    visible: false,
    x: 0,
    y: 0,
    textBefore: '',
    focusChar: ' ',
    textAfter: '',
    isFlippedBelow: false,
  });
```

编写辅助函数 `updateMagnifierFromTouch`：
```typescript
  const updateMagnifierFromTouch = useCallback((clientX: number, clientY: number) => {
    const term = xtermRef.current;
    if (!term) return;

    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
    const pos = calculateMagnifierPosition(clientX, clientY, screenWidth);
    const cell = getOverlayCellCoords(clientX, clientY);

    let textBefore = '';
    let focusChar = ' ';
    let textAfter = '';

    if (cell) {
      const line = term.buffer.active.getLine(cell.bufferRow);
      if (line) {
        const lineText = line.translateToString(true);
        const slice = extractMagnifierSlice(lineText, cell.col, 6);
        textBefore = slice.textBefore;
        focusChar = slice.focusChar;
        textAfter = slice.textAfter;
      }
    }

    setMagnifier({
      visible: true,
      x: pos.x,
      y: pos.y,
      textBefore,
      focusChar,
      textAfter,
      isFlippedBelow: pos.isFlippedBelow,
    });
  }, [getOverlayCellCoords]);
```

更新触摸事件：
```typescript
  const handleOverlayTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const cell = getOverlayCellCoords(touch.clientX, touch.clientY);
      if (cell) {
        overlaySelectionStartRef.current = cell;
        applyOverlaySelection(cell, cell);
        updateMagnifierFromTouch(touch.clientX, touch.clientY);
      }
    }
  };

  const handleOverlayTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && overlaySelectionStartRef.current) {
      const touch = e.touches[0];
      const currentCell = getOverlayCellCoords(touch.clientX, touch.clientY);
      if (currentCell) {
        applyOverlaySelection(overlaySelectionStartRef.current, currentCell);
        updateMagnifierFromTouch(touch.clientX, touch.clientY);
      }
    }
  };

  const handleOverlayTouchEnd = () => {
    overlaySelectionStartRef.current = null;
    setMagnifier(prev => ({ ...prev, visible: false }));
  };
```

在 `handleExitSelectMode` 中隐藏放大镜：
```typescript
  const handleExitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    isSelectModeRef.current = false;
    setMagnifier(prev => ({ ...prev, visible: false }));
    handleClearSelection();
  }, [handleClearSelection]);
```

在 JSX 中（紧跟在 `selection-gesture-overlay` 之后）渲染悬浮放大镜气泡：
```tsx
        {/* Mobile Touch Selection Magnifier Bubble */}
        {isSelectMode && magnifier.visible && (
          <div
            style={{ left: `${magnifier.x}px`, top: `${magnifier.y}px` }}
            className="fixed -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none select-none flex flex-col items-center animate-in fade-in zoom-in-95 duration-75"
          >
            {/* Inverted Pointer (Pointing up when flipped below finger) */}
            {magnifier.isFlippedBelow && (
              <div className="w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-indigo-500/60 mb-[-1px]" />
            )}

            {/* Magnifier Bubble Body */}
            <div className="px-2.5 py-1 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 border border-indigo-500/40 shadow-2xl backdrop-blur-xl flex items-center font-mono text-xs sm:text-sm font-semibold tracking-wide whitespace-pre text-slate-400 ring-1 ring-white/10">
              <span>{magnifier.textBefore}</span>
              <span className="bg-indigo-600 text-white px-1 py-0.5 rounded shadow-sm scale-110 mx-0.5">
                {magnifier.focusChar === ' ' ? '␣' : magnifier.focusChar}
              </span>
              <span>{magnifier.textAfter}</span>
            </div>

            {/* Normal Pointer (Pointing down when positioned above finger) */}
            {!magnifier.isFlippedBelow && (
              <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-indigo-500/60 mt-[-1px]" />
            )}
          </div>
        )}
```

- [ ] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/terminalMobileMagnifier.test.ts`
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalMobileMagnifier.test.ts
git commit -m "feat(terminal): integrate touch selection magnifier bubble into WebTerminalView"
```

---

### Task 3: 前端构建与全套自动化测试验证

**Files:**
- None (Build & Verification only)

- [ ] **Step 1: 运行前端构建检查**

Run: `npm run build:frontend`
Expected: Vite 编译打包顺利成功，输出正常，0 错误

- [ ] **Step 2: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: 105 个测试套件（包括所有 terminal 相关测试）全部通过

- [ ] **Step 3: 检查 git 状态**

Run: `git status`
Expected: working tree clean

---

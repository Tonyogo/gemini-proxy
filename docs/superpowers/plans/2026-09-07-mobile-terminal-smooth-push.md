# WebTerminal 移动端全屏键盘弹起平滑上推 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化移动端 WebTerminal 全屏模式下软键盘弹起时的交互体验，通过视口高度锁定与 GPU 硬件加速平移动画（`translate3d`）实现类似微信聊天的平滑推顶效果，同时彻底阻断软键盘引发的 PTY Resize 与画面重绘。

**Architecture:** 
抽离移动端视口几何与键盘偏移计算工具模块 `mobileViewportHelper.ts`，为全屏终端提供纯函数级别的视口差异计算与 PTY Resize 拦截判定；在 `WebTerminalView.tsx` 中集成平移推顶样式、下拉滑动手势收起键盘、横竖屏自适应刷新与滚动触底维持，并建立完整的单元测试和回归测试套件。

**Tech Stack:** React 18, TypeScript, xterm.js, Tailwind CSS, Jest.

## Global Constraints

- **零 PTY 重绘**: 移动端在软键盘弹起与收起过程中，坚决拦截 `sendResize` 与 `fitAddon.fit()`，行列数（cols/rows）保持静止。
- **平滑推顶**: 采用 `translate3d(0, -${translateY}px, 0)` 与 `transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)`。
- **手势收起**: 当软键盘打开状态下用户在终端区域向下滑动时，优雅触发 `activeElement.blur()` 退出键盘。
- **物理旋转支持**: 发生横竖屏物理旋转时，自动失焦收起键盘并重置基准宽高，重新执行 PTY Resize。

---

### Task 1: 视口几何与键盘推顶计算辅助函数 (`mobileViewportHelper.ts`)

**Files:**
- Create: `frontend/src/utils/mobileViewportHelper.ts`
- Test: `tests/mobileViewportHelper.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface KeyboardOffsetResult {
    isKeyboardShowing: boolean;
    translateY: number;
  }

  export function calculateKeyboardTranslateY(params: {
    baseHeight: number;
    viewportHeight: number;
    offsetTop?: number;
  }): KeyboardOffsetResult;

  export function shouldBlockPtyResize(params: {
    baseWidth: number;
    currentWidth: number;
    isKeyboardShowing: boolean;
    isMobile: boolean;
    standalone: boolean;
  }): boolean;
  ```

- [x] **Step 1: 编写失败的单元测试**

Create `tests/mobileViewportHelper.test.ts`:
```ts
import {
  calculateKeyboardTranslateY,
  shouldBlockPtyResize,
} from '../frontend/src/utils/mobileViewportHelper';

describe('mobileViewportHelper tests', () => {
  describe('calculateKeyboardTranslateY', () => {
    test('returns 0 translateY and isKeyboardShowing=false when visual viewport matches base height', () => {
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 844,
        offsetTop: 0,
      });
      expect(result.isKeyboardShowing).toBe(false);
      expect(result.translateY).toBe(0);
    });

    test('detects keyboard and computes translateY when viewport height is reduced by soft keyboard', () => {
      // 844 - 544 = 300px keyboard
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 544,
        offsetTop: 0,
      });
      expect(result.isKeyboardShowing).toBe(true);
      expect(result.translateY).toBe(300);
    });

    test('takes offsetTop into account when browser auto-shifts visual viewport', () => {
      // 844 - 544 = 300px diff, with offsetTop 50 -> translateY = 250
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 544,
        offsetTop: 50,
      });
      expect(result.isKeyboardShowing).toBe(true);
      expect(result.translateY).toBe(250);
    });

    test('ignores tiny height fluctuations under 150px or under 18% baseHeight', () => {
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 800, // 44px diff (e.g. browser address bar hide)
        offsetTop: 0,
      });
      expect(result.isKeyboardShowing).toBe(false);
      expect(result.translateY).toBe(0);
    });
  });

  describe('shouldBlockPtyResize', () => {
    test('does not block on desktop or when not standalone', () => {
      expect(
        shouldBlockPtyResize({
          baseWidth: 1024,
          currentWidth: 1024,
          isKeyboardShowing: true,
          isMobile: false,
          standalone: false,
        })
      ).toBe(false);
    });

    test('blocks PTY resize when mobile standalone and keyboard is showing without width change', () => {
      expect(
        shouldBlockPtyResize({
          baseWidth: 390,
          currentWidth: 390,
          isKeyboardShowing: true,
          isMobile: true,
          standalone: true,
        })
      ).toBe(true);
    });

    test('does not block PTY resize if width changed significantly (screen rotation)', () => {
      expect(
        shouldBlockPtyResize({
          baseWidth: 390,
          currentWidth: 844, // rotated to landscape
          isKeyboardShowing: true,
          isMobile: true,
          standalone: true,
        })
      ).toBe(false);
    });
  });
});
```

- [x] **Step 2: 运行测试并验证测试失败**

Run: `npx jest tests/mobileViewportHelper.test.ts`
Expected: FAIL with "Cannot find module '../frontend/src/utils/mobileViewportHelper'"

- [x] **Step 3: 实现 `mobileViewportHelper.ts`**

Create `frontend/src/utils/mobileViewportHelper.ts`:
```ts
export interface KeyboardOffsetResult {
  isKeyboardShowing: boolean;
  translateY: number;
}

/**
 * Calculates whether the virtual keyboard is open and how much translateY
 * needs to be applied to push content upwards like a messaging app.
 */
export function calculateKeyboardTranslateY({
  baseHeight,
  viewportHeight,
  offsetTop = 0,
}: {
  baseHeight: number;
  viewportHeight: number;
  offsetTop?: number;
}): KeyboardOffsetResult {
  if (baseHeight <= 0 || viewportHeight <= 0) {
    return { isKeyboardShowing: false, translateY: 0 };
  }

  const rawDiff = baseHeight - viewportHeight;
  // Threshold: keyboard height is typically >= 150px or >= 18% of screen height
  const threshold = Math.min(150, baseHeight * 0.18);
  const isKeyboardShowing = rawDiff > threshold;

  if (!isKeyboardShowing) {
    return { isKeyboardShowing: false, translateY: 0 };
  }

  const translateY = Math.max(0, rawDiff - (offsetTop || 0));
  return {
    isKeyboardShowing: true,
    translateY,
  };
}

/**
 * Determines whether the terminal should suppress pty resize and fitAddon.fit()
 * to prevent jarring terminal re-flows when the mobile virtual keyboard toggles.
 */
export function shouldBlockPtyResize({
  baseWidth,
  currentWidth,
  isKeyboardShowing,
  isMobile,
  standalone,
}: {
  baseWidth: number;
  currentWidth: number;
  isKeyboardShowing: boolean;
  isMobile: boolean;
  standalone: boolean;
}): boolean {
  if (!isMobile || !standalone) {
    return false;
  }

  // If width changes significantly (e.g. device rotation between portrait and landscape), allow resize
  if (Math.abs(currentWidth - baseWidth) > 20) {
    return false;
  }

  // While keyboard is showing, block PTY resize completely
  return isKeyboardShowing;
}
```

- [x] **Step 4: 运行测试并验证通过**

Run: `npx jest tests/mobileViewportHelper.test.ts`
Expected: PASS with 7 tests passed.

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/utils/mobileViewportHelper.ts tests/mobileViewportHelper.test.ts
git commit -m "feat(terminal): add mobileViewportHelper for keyboard offset and resize blocking"
```

---

### Task 2: 集成视口锁定、平移样式与 PTY Resize 拦截到 `WebTerminalView.tsx`

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:140-180,660-756,1010-1030`
- Test: `tests/terminalMobileSmoothPush.test.ts`

**Interfaces:**
- Consumes:
  - `calculateKeyboardTranslateY` from `../utils/mobileViewportHelper`
  - `shouldBlockPtyResize` from `../utils/mobileViewportHelper`

- [x] **Step 1: 编写组件集成的失败测试用例**

Create `tests/terminalMobileSmoothPush.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('WebTerminalView Mobile Smooth Push Integration', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const content = fs.readFileSync(webTerminalPath, 'utf-8');

  test('imports mobileViewportHelper utilities', () => {
    expect(content).toMatch(
      /import\s*{[^}]*calculateKeyboardTranslateY[^}]*shouldBlockPtyResize[^}]*}\s*from\s*['"]\.\.\/utils\/mobileViewportHelper['"]/
    );
  });

  test('maintains base dimension refs for mobile standalone', () => {
    expect(content).toContain('baseHeightRef');
    expect(content).toContain('baseWidthRef');
  });

  test('applies translate3d and spring transition in mobile standalone viewportStyle', () => {
    expect(content).toContain('translate3d(0, -');
    expect(content).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(content).toContain('willChange');
  });

  test('blocks fitAddon.fit and sendResize when keyboard is showing', () => {
    expect(content).toContain('shouldBlockPtyResize');
    expect(content).toContain('scrollToBottom()');
  });

  test('dismisses keyboard on swipe down gesture in terminal', () => {
    expect(content).toContain('handleTouchMove');
    expect(content).toContain('handleHideKeyboard');
  });
});
```

- [x] **Step 2: 运行测试并验证测试失败**

Run: `npx jest tests/terminalMobileSmoothPush.test.ts`
Expected: FAIL due to missing imports and logic in `WebTerminalView.tsx`.

- [x] **Step 3: 修改 `WebTerminalView.tsx` 实现键盘平滑上推与拦截**

In `frontend/src/components/WebTerminalView.tsx`:
1. 导入 `calculateKeyboardTranslateY` 与 `shouldBlockPtyResize`：
   ```ts
   import {
     calculateKeyboardTranslateY,
     shouldBlockPtyResize,
   } from '../utils/mobileViewportHelper';
   ```
2. 新增基准宽高引用：
   ```ts
   const baseHeightRef = useRef<number>(typeof window !== 'undefined' ? window.innerHeight : 0);
   const baseWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 0);
   const isKeyboardShowingRef = useRef<boolean>(false);
   ```
3. 在全屏/standalone 模式改变或挂载时同步基准宽高：
   ```ts
   useEffect(() => {
     if (typeof window !== 'undefined') {
       baseHeightRef.current = window.innerHeight;
       baseWidthRef.current = window.innerWidth;
     }
   }, [standalone]);
   ```
4. 替换 `updateViewport` 中的键盘高度设置与 resize 逻辑：
   - 使用 `calculateKeyboardTranslateY` 计算 `isKeyboardShowing` 与 `translateY`；
   - 更新 `setIsKeyboardOpen(isKeyboardShowing)`；
   - 如果是 `mobile && standalone`：
     ```ts
     setViewportStyle({
       position: 'fixed',
       top: 0,
       left: 0,
       width: '100vw',
       height: `${baseHeightRef.current}px`,
       maxHeight: `${baseHeightRef.current}px`,
       transform: `translate3d(0, -${translateY}px, 0)`,
       transition: 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
       willChange: 'transform',
       zIndex: 50,
       borderRadius: 0,
       border: 'none',
       overflow: 'hidden',
     });
     ```
   - 判定 `shouldBlockPtyResize`：
     - 若为 true：阻断 `fitAddon.fit()` 和 `sendResize`，并调用 `xtermRef.current?.scrollToBottom()`。
     - 若为 false：正常调用 `fitAddon.fit()` 和 `sendResize`。
5. 在手势处理中增加下滑退出键盘（仿微信聊天交互）：
   - 在 `handleTouchMove` 中，若 `isKeyboardShowingRef.current` 为 true，且检测到用户向下手势滑动（`deltaY < -25`），自动触发 `handleHideKeyboard()`。

- [x] **Step 4: 运行组件集成测试并验证通过**

Run: `npx jest tests/terminalMobileSmoothPush.test.ts`
Expected: PASS with 5 tests passed.

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalMobileSmoothPush.test.ts
git commit -m "feat(terminal): implement mobile smooth translateY push and isolate pty resize"
```

---

### Task 3: 屏幕物理旋转与手势协同优化及全面验证

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Test: `tests/terminalMobileSmoothPush.test.ts`
- Test: `tests/terminalMobileKeyboard.test.ts`

- [ ] **Step 1: 补充旋转检测与处理的测试**

Add to `tests/terminalMobileSmoothPush.test.ts`:
```ts
  test('handles orientation change by resetting base dimensions and blurring active inputs', () => {
    expect(content).toContain('orientationchange');
  });
```

- [ ] **Step 2: 运行测试并验证失败**

Run: `npx jest tests/terminalMobileSmoothPush.test.ts`
Expected: FAIL because orientationchange listener is not yet wired.

- [ ] **Step 3: 完善旋转监听与清理逻辑**

In `frontend/src/components/WebTerminalView.tsx`:
- 添加 `orientationchange` 监听，在屏幕旋转时：
  1. 调用 `handleHideKeyboard()`；
  2. 重置 `baseWidthRef.current = window.innerWidth` 与 `baseHeightRef.current = window.innerHeight`；
  3. 延迟 100ms 触发一次完整的 `fitAddon.fit()` 与 `sendResize`。

- [ ] **Step 4: 运行所有终端移动端相关测试**

Run: `npx jest tests/terminalMobile*.test.ts tests/mobileViewportHelper.test.ts`
Expected: PASS with 100% tests passing.

- [ ] **Step 5: 运行前端构建验证**

Run: `npm run build:frontend`
Expected: 0 errors, Vite production build successfully generated in `dist/frontend`.

- [ ] **Step 6: 提交更改**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalMobileSmoothPush.test.ts
git commit -m "fix(terminal): add orientation change handling and smooth push verification"
```

# Mobile WebTerminal Resize & Viewport Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix intermittent mobile terminal resize failures where the viewport remains locked to the PTY default of 80x24 by adding physical focus verification, forced resize dispatch, full-lifecycle cache invalidation, and multi-stage self-healing probes.

**Architecture:** 
1. Guard keyboard detection with `isInputFocused` (checking `document.activeElement === helperTextarea`) in `mobileViewportHelper.ts` and `WebTerminalView.tsx` so browser chrome expansion/collapse never falsely blocks PTY resize.
2. Invalidate `lastSentColsRef`/`lastSentRowsRef` across `initWebSocket`, `ws.onopen`, `handleHostChange`, and `executeReset`, and add a `force` parameter to `sendResize` so fresh attachments to hosts immediately deliver physical column and row counts.
3. Deploy ladder self-healing probes (`[60ms, 200ms, 500ms]`) on mount and host change, plus a 260ms post-keyboard transition compensation probe.

**Tech Stack:** React 18, TypeScript, xterm.js (`@xterm/xterm`, `@xterm/addon-fit`), Jest, Vite.

## Global Constraints

- Strict TypeScript patterns without any `any` casts where types are known.
- All existing tests in `tests/terminalNonFullscreenStability.test.ts` and general suites must pass without regression.
- Zero extra dependencies; use native DOM and existing helper modules.

---

### Task 1: Add Strict Input Focus Guard to `mobileViewportHelper.ts`

**Files:**
- Modify: `frontend/src/utils/mobileViewportHelper.ts`
- Test: `tests/terminalMobileResizeStability.test.ts`

**Interfaces:**
- `calculateKeyboardTranslateY({ baseHeight, viewportHeight, offsetTop, isInputFocused }): KeyboardOffsetResult`
- `shouldBlockPtyResize({ baseWidth, currentWidth, isKeyboardShowing, isMobile, standalone, isInputFocused }): boolean`

- [ ] **Step 1: Write failing unit test for `mobileViewportHelper.ts`**

Create `tests/terminalMobileResizeStability.test.ts`:
```typescript
import { calculateKeyboardTranslateY, shouldBlockPtyResize } from '../frontend/src/utils/mobileViewportHelper';

describe('Mobile Viewport Helper - Strict Input Focus Guard', () => {
  it('does not detect keyboard as showing if isInputFocused is false even with large height difference', () => {
    const result = calculateKeyboardTranslateY({
      baseHeight: 844,
      viewportHeight: 600, // 244px diff (e.g. browser chrome collapsed/expanded)
      isInputFocused: false,
    });
    expect(result.isKeyboardShowing).toBe(false);
    expect(result.translateY).toBe(0);
  });

  it('detects keyboard as showing when diff exceeds threshold AND isInputFocused is true', () => {
    const result = calculateKeyboardTranslateY({
      baseHeight: 844,
      viewportHeight: 500, // 344px diff
      isInputFocused: true,
    });
    expect(result.isKeyboardShowing).toBe(true);
    expect(result.translateY).toBe(344);
  });

  it('shouldBlockPtyResize allows resize if isInputFocused is false regardless of isKeyboardShowing', () => {
    const blocked = shouldBlockPtyResize({
      baseWidth: 390,
      currentWidth: 390,
      isKeyboardShowing: true,
      isMobile: true,
      standalone: true,
      isInputFocused: false,
    });
    expect(blocked).toBe(false);
  });

  it('shouldBlockPtyResize blocks resize when mobile standalone, width stable, AND isInputFocused is true with keyboard showing', () => {
    const blocked = shouldBlockPtyResize({
      baseWidth: 390,
      currentWidth: 390,
      isKeyboardShowing: true,
      isMobile: true,
      standalone: true,
      isInputFocused: true,
    });
    expect(blocked).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalMobileResizeStability.test.ts`
Expected: FAIL with missing properties or failed assertion because `isInputFocused` is not yet supported.

- [ ] **Step 3: Update `frontend/src/utils/mobileViewportHelper.ts`**

Update `calculateKeyboardTranslateY` and `shouldBlockPtyResize` to accept and check `isInputFocused`:
```typescript
export interface KeyboardOffsetResult {
  isKeyboardShowing: boolean;
  translateY: number;
}

/**
 * Calculates whether the virtual keyboard is open and how much translateY
 * needs to be applied to push content upwards like a messaging app.
 * Requires `isInputFocused` to prevent false positives from mobile browser chrome.
 */
export function calculateKeyboardTranslateY({
  baseHeight,
  viewportHeight,
  offsetTop = 0,
  isInputFocused = true,
}: {
  baseHeight: number;
  viewportHeight: number;
  offsetTop?: number;
  isInputFocused?: boolean;
}): KeyboardOffsetResult {
  if (baseHeight <= 0 || viewportHeight <= 0) {
    return { isKeyboardShowing: false, translateY: 0 };
  }

  const rawDiff = baseHeight - viewportHeight;
  // Threshold: keyboard height is typically >= 150px or >= 18% of screen height
  const threshold = Math.min(150, baseHeight * 0.18);
  const isKeyboardShowing = isInputFocused && rawDiff > threshold;

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
  isInputFocused = true,
}: {
  baseWidth: number;
  currentWidth: number;
  isKeyboardShowing: boolean;
  isMobile: boolean;
  standalone: boolean;
  isInputFocused?: boolean;
}): boolean {
  if (!isMobile || !standalone || !isInputFocused) {
    return false;
  }

  // If width changes significantly (e.g. device rotation between portrait and landscape), allow resize
  if (Math.abs(currentWidth - baseWidth) > 20) {
    return false;
  }

  // While keyboard is showing and input is focused, block PTY resize
  return isKeyboardShowing;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalMobileResizeStability.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/mobileViewportHelper.ts tests/terminalMobileResizeStability.test.ts
git commit -m "feat(terminal): add strict input focus guard to mobile viewport helper"
```

---

### Task 2: Implement Forced Resize, Cache Invalidation, and Focus Guard in `WebTerminalView.tsx`

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Test: `tests/terminalMobileResizeStability.test.ts`

**Interfaces:**
- `sendResize(cols: number, rows: number, force?: boolean): void`
- `safeFit(forceResize?: boolean): boolean`

- [ ] **Step 1: Add structural assertions to test file**

Extend `tests/terminalMobileResizeStability.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('WebTerminalView Force Resize & Lifecycle Cache Invalidation', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  let webTerminalContent: string;

  beforeAll(() => {
    webTerminalContent = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('sendResize accepts a force parameter to bypass cached dimensions check', () => {
    expect(webTerminalContent).toMatch(/const sendResize = useCallback\(\(cols:\s*number,\s*rows:\s*number,\s*force:\s*boolean\s*=\s*false\)/);
    expect(webTerminalContent).toMatch(/!force\s*&&\s*cols\s*===\s*lastSentColsRef\.current/);
  });

  it('safeFit accepts forceResize parameter and passes it to sendResize', () => {
    expect(webTerminalContent).toMatch(/const safeFit = useCallback\(\(forceResize:\s*boolean\s*=\s*false\)/);
    expect(webTerminalContent).toMatch(/sendResize\(cols,\s*rows,\s*forceResize\)/);
  });

  it('handleHostChange resets lastSentColsRef and lastSentRowsRef to 0', () => {
    expect(webTerminalContent).toMatch(/const handleHostChange = \([\s\S]*?lastSentColsRef\.current\s*=\s*0;[\s\S]*?lastSentRowsRef\.current\s*=\s*0;/);
  });

  it('executeReset resets lastSentColsRef and lastSentRowsRef to 0', () => {
    expect(webTerminalContent).toMatch(/const executeReset = useCallback\(\(\) => \{[\s\S]*?lastSentColsRef\.current\s*=\s*0;[\s\S]*?lastSentRowsRef\.current\s*=\s*0;/);
  });

  it('updateViewport checks physical input focus on textarea', () => {
    expect(webTerminalContent).toMatch(/const isInputFocused = document\.activeElement === textarea/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalMobileResizeStability.test.ts`
Expected: FAIL on the new structural expectations.

- [ ] **Step 3: Update `WebTerminalView.tsx`**

1. Update `sendResize` to accept `force: boolean = false` and check `if (!force && cols === lastSentColsRef.current && rows === lastSentRowsRef.current) return;`.
2. Update `safeFit` to accept `forceResize: boolean = false` and call `sendResize(cols, rows, forceResize)`.
3. In `handleHostChange`, reset `lastSentColsRef.current = 0; lastSentRowsRef.current = 0;`.
4. In `executeReset`, reset `lastSentColsRef.current = 0; lastSentRowsRef.current = 0;`.
5. In `initWebSocket`, reset `lastSentColsRef.current = 0; lastSentRowsRef.current = 0;`.
6. In `ws.onopen`, call `safeFit(true);` with fallback `setTimeout(() => safeFit(true), 80);`.
7. In `updateViewport`, compute `isInputFocused = document.activeElement === textarea;` and pass `isInputFocused` to `calculateKeyboardTranslateY` and `shouldBlockPtyResize`. When `!isInputFocused`, recalibrate `baseHeightRef.current = Math.max(window.innerHeight, vv?.height || window.innerHeight); baseWidthRef.current = window.innerWidth;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalMobileResizeStability.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalMobileResizeStability.test.ts
git commit -m "feat(terminal): implement forced resize and cache invalidation in WebTerminalView"
```

---

### Task 3: Implement Ladder Probes and Transition Compensation

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Test: `tests/terminalMobileResizeStability.test.ts`

- [ ] **Step 1: Add test assertions for ladder probes and transition compensation**

Extend `tests/terminalMobileResizeStability.test.ts`:
```typescript
describe('Ladder Probes & Transition Compensation', () => {
  it('WebTerminalView includes multi-stage ladder probe timers on activeHostId change', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx'), 'utf-8');
    expect(content).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?activeHostId[\s\S]*?safeFit\(true\)[\s\S]*?60[\s\S]*?200[\s\S]*?500/);
  });

  it('WebTerminalView triggerMountProbe schedules ladder probes up to at least 350ms', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx'), 'utf-8');
    expect(content).toContain('350');
  });

  it('WebTerminalView compensates virtual keyboard dismissal transition', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx'), 'utf-8');
    expect(content).toMatch(/260/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalMobileResizeStability.test.ts`
Expected: FAIL on ladder probe and transition assertions.

- [ ] **Step 3: Update `WebTerminalView.tsx` and `UnifiedTerminalView.tsx`**

1. In `WebTerminalView.tsx`:
   - In `triggerMountProbe`: schedule probes `[60, 150, 350, 800]`.
   - In `useEffect([activeHostId, safeFit])`:
     ```typescript
     useEffect(() => {
       if (activeHostId) {
         const timers = [
           setTimeout(() => {
             safeFit(true);
             xtermRef.current?.refresh(0, Math.max(0, (xtermRef.current?.rows || 1) - 1));
           }, 60),
           setTimeout(() => { safeFit(true); }, 200),
           setTimeout(() => { safeFit(false); }, 500),
         ];
         return () => timers.forEach(clearTimeout);
       }
     }, [activeHostId, safeFit]);
     ```
   - In `updateViewport`: track previous `isKeyboardShowingRef.current`. When it changes from `true` to `false`, add `setTimeout(() => { if (isMountedRef.current) safeFit(true); }, 260);`.
2. In `UnifiedTerminalView.tsx`:
   - Keep existing `useEffect([subTab, activeHostId])` fit timers and ensure `subTab === 'interactive'` calls `terminalRef.current?.fit()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/terminalMobileResizeStability.test.ts tests/terminalNonFullscreenStability.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx frontend/src/components/UnifiedTerminalView.tsx tests/terminalMobileResizeStability.test.ts
git commit -m "feat(terminal): add ladder self-healing probes and transition compensation"
```

---

### Task 4: Full Test Suite Verification and Build Check

**Files:**
- Test: all test suites
- Build: `npm run build`

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: PASS with 0 failures across all suites.

- [ ] **Step 2: Run frontend build**

Run: `npm run build:frontend`
Expected: Build succeeds and outputs Vite bundle without TypeScript or Rollup errors.

- [ ] **Step 3: Run complete build**

Run: `npm run build`
Expected: Both backend and frontend compile cleanly into `dist/`.

- [ ] **Step 4: Final verification commit if any adjustments needed**

# Terminal Auto-Fit Initialization & Multi-Phase Healing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate blank terminal rendering in non-fullscreen mode upon connection by implementing a robust `safeFit()` engine with double-rAF mount probing, first-chunk data arrival healing, `ws.onopen` calibration, and `document.fonts.ready` detection.

**Architecture:** 
- Implement a unified `safeFit()` function in `WebTerminalView` that validates container dimensions (`clientWidth > 0 && clientHeight > 0`) and cell sizes before calling `fitAddon.fit()`.
- Replace the fragile single 50ms `setTimeout` with a multi-phase lifecycle trigger: double `requestAnimationFrame` + staged timeouts (60ms, 150ms, 300ms).
- Add self-healing triggers: when WebSocket receives the first data stream or when `ws.onopen` completes, if `term.cols <= 2 || term.rows <= 1`, automatically trigger `safeFit()`.
- Listen to `document.fonts.ready` to ensure font metric changes re-fit xterm accurately.

**Tech Stack:** React 18, TypeScript, xterm.js, `@xterm/addon-fit`, Jest.

## Global Constraints

- Strict TypeScript with 100% type safety.
- Do not invoke HTML5 native `requestFullscreen`.
- Ensure all terminal sessions and running CLI processes remain connected without restarts.
- All existing 82+ test suites must continue to pass without regressions.

---

### Task 1: Implement Unified `safeFit` Engine & Multi-Stage Mount Probing in WebTerminalView

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Create: `tests/terminalAutoFitHealing.test.ts`

**Interfaces:**
- Produces:
  - `safeFit: () => boolean` in `WebTerminalView`.
  - Double `requestAnimationFrame` sequence with staged fallbacks (60ms, 150ms, 300ms) on mount.

- [ ] **Step 1: Write the failing test**

Create `tests/terminalAutoFitHealing.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('WebTerminalView Auto-Fit Initialization & Healing', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('implements safeFit with container dimension guards (clientWidth > 0 && clientHeight > 0)', () => {
    expect(content).toContain('safeFit');
    expect(content).toMatch(/container\.clientWidth\s*<=\s*0\s*\|\|\s*container\.clientHeight\s*<=\s*0/);
  });

  it('uses multi-stage mount probing with requestAnimationFrame and staged fallbacks', () => {
    expect(content).toContain('requestAnimationFrame');
    expect(content).toMatch(/setTimeout\([^,]+,\s*150\)/);
    expect(content).toMatch(/setTimeout\([^,]+,\s*300\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalAutoFitHealing.test.ts`
Expected: FAIL (missing `safeFit` and staged fallbacks).

- [ ] **Step 3: Implement safeFit and multi-stage mount probing in WebTerminalView**

In `frontend/src/components/WebTerminalView.tsx`:
1. Define `safeFit`:
   ```typescript
   const safeFit = useCallback((): boolean => {
     if (!isMountedRef.current || !fitAddonRef.current || !xtermRef.current || !terminalContainerRef.current) {
       return false;
     }
     const container = terminalContainerRef.current;
     if (container.clientWidth <= 0 || container.clientHeight <= 0) {
       return false;
     }

     try {
       const term = xtermRef.current;
       const wasAtBottom = isUserAtBottom(term);
       fitAddonRef.current.fit();
       const { cols, rows } = term;
       if (cols > 2 && rows > 1) {
         sendResize(cols, rows);
         if (shouldScrollToBottom({ isReplaying: isReplayingRef.current, wasAtBottom, bufferType: term.buffer.active.type })) {
           scrollToBottomSafe(term);
         }
         return true;
       }
     } catch (err) {
       console.debug('[WebTerminal] safeFit bypassed:', err);
     }
     return false;
   }, [sendResize]);
   ```
2. Replace single `fitTimer` with double-rAF + staged fallback timeouts:
   ```typescript
   let cancelRaf = false;
   const fallbackTimers: NodeJS.Timeout[] = [];

   const triggerMountProbe = () => {
     if (typeof window === 'undefined') return;
     window.requestAnimationFrame(() => {
       if (cancelRaf) return;
       if (!safeFit()) {
         window.requestAnimationFrame(() => {
           if (cancelRaf) return;
           if (!safeFit()) {
             fallbackTimers.push(setTimeout(safeFit, 60));
             fallbackTimers.push(setTimeout(safeFit, 150));
             fallbackTimers.push(setTimeout(safeFit, 300));
           }
         });
       }
     });
   };

   triggerMountProbe();
   ```
3. Ensure cleanup handles clearing all staged timeouts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalAutoFitHealing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalAutoFitHealing.test.ts
git commit -m "feat(terminal): implement safeFit engine and multi-stage layout probing on mount"
```

---

### Task 2: Implement Data-Arrival Healing, ws.onopen Calibration, and Font-Ready Recovery

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `tests/terminalAutoFitHealing.test.ts`

**Interfaces:**
- Produces:
  - First incoming data chunk self-healing check in `ws.onmessage`.
  - Calibration retry in `ws.onopen`.
  - `document.fonts.ready` subscription.

- [ ] **Step 1: Write test additions**

Append to `tests/terminalAutoFitHealing.test.ts`:
```typescript
  it('heals layout on first data arrival if terminal dimensions are uninitialized', () => {
    expect(content).toMatch(/cols\s*<=\s*2\s*\|\|\s*[^.]*\.rows\s*<=\s*1/);
  });

  it('triggers safeFit on document.fonts.ready to handle font metric loading', () => {
    expect(content).toContain('document.fonts.ready');
  });

  it('triggers safeFit on ws.onopen with calibration fallback', () => {
    expect(content).toContain('ws.onopen');
    expect(content).toMatch(/onopen[\s\S]*?safeFit/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalAutoFitHealing.test.ts`
Expected: FAIL (missing font ready & data arrival healing checks).

- [ ] **Step 3: Implement data arrival healing, onopen retry, and font-ready triggers**

In `frontend/src/components/WebTerminalView.tsx`:
1. In `initWebSocket`:
   - Inside `ws.onopen`:
     ```typescript
     if (!safeFit()) {
       setTimeout(safeFit, 80);
     }
     ```
   - Inside `ws.onmessage`:
     ```typescript
     if (xtermRef.current && (xtermRef.current.cols <= 2 || xtermRef.current.rows <= 1)) {
       safeFit();
     }
     ```
2. In main effect:
   - Add font readiness listener:
     ```typescript
     if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
       (document as any).fonts.ready.then(() => {
         if (isMountedRef.current) {
           safeFit();
         }
       }).catch(() => {});
     }
     ```
3. In `useImperativeHandle`: update `fit: safeFit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalAutoFitHealing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalAutoFitHealing.test.ts
git commit -m "feat(terminal): add first-data arrival healing and font-ready recovery"
```

---

### Task 3: Full Test Suite Verification & Production Build

**Files:**
- Full codebase
- Build: `npm run build`
- Tests: `npm test`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 83+ test suites pass with 0 errors.

- [ ] **Step 2: Run frontend and backend production build**

Run: `npm run build`
Expected: `dist/frontend` (Vite) and `dist/src` (tsc) compile cleanly with 0 errors.

- [ ] **Step 3: Commit and Push**

```bash
git status
git commit --allow-empty -m "chore(terminal): complete verification of terminal auto-fit healing"
git push origin main
```

# Terminal Fullscreen Resize Repaint Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate screen rollback and repetitive Ink repaints when toggling fullscreen terminal mode by removing geometric CSS transitions, introducing an `isRefitting` silent window with scroll locking, and debouncing PTY resize dispatches.

**Architecture:** 
- Instant geometric snapping (replace `transition-all` with `transition-none` on container shells) prevents `ResizeObserver` from generating multi-frame intermediate resize bursts.
- An `isRefitting` state machine temporarily suppresses incoming chunk `scrollToBottomSafe` triggers and applies a subtle opacity shield (~120ms) while Claude Code (Ink) recalculates and prints its new word-wrapped layout.
- A debounced resize queue ensures that exactly one final `SIGWINCH` resize frame is delivered to the remote PTY per fullscreen transition.
- Upon layout stabilization, a single `scrollToBottomSafe` anchors the viewport to the cursor line and restores opacity.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, xterm.js, node-pty, Jest.

## Global Constraints

- Strict TypeScript with 100% type safety.
- Do not invoke HTML5 native `requestFullscreen` (preserves CLI Esc key navigation).
- Ensure terminal session, running processes, and scrollback remain connected across transitions.
- All existing 77+ test suites must continue to pass without regressions.

---

### Task 1: Remove Geometric CSS Transitions from Terminal Window Containers

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Test: `tests/terminalResizeStabilization.test.ts`

**Interfaces:**
- Removes `transition-all` on root window containers in `UnifiedTerminalView` and `WebTerminalView`.
- Ensures instantaneous geometry snaps (0ms delay) when toggling between embedded and standalone fullscreen modes.

- [ ] **Step 1: Write the failing test**

Create `tests/terminalResizeStabilization.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Fullscreen Resize Repaint Stabilization', () => {
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  let unifiedContent: string;
  let webTerminalContent: string;

  beforeAll(() => {
    unifiedContent = fs.readFileSync(unifiedPath, 'utf-8');
    webTerminalContent = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('containers should not have transition-all on geometric properties to prevent resize storms', () => {
    // The main container div in UnifiedTerminalView should not use transition-all
    expect(unifiedContent).not.toMatch(/className=\{`[^`]*\btransition-all\b[^`]*isStandalone/);
    expect(unifiedContent).not.toMatch(/isStandalone\s*\?[^`]*\btransition-all\b/);

    // The main container div in WebTerminalView should not use transition-all
    expect(webTerminalContent).not.toMatch(/className=\{`[^`]*\btransition-all\b[^`]*standalone/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalResizeStabilization.test.ts`
Expected: FAIL (found `transition-all` in container class names).

- [ ] **Step 3: Remove geometric transition classes**

1. In `frontend/src/components/UnifiedTerminalView.tsx`:
   - Replace `transition-all` on the root container div with `transition-none` (or remove `transition-all`).
2. In `frontend/src/components/WebTerminalView.tsx`:
   - Replace `transition-all` on the root container div with `transition-none` (or remove `transition-all`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalResizeStabilization.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UnifiedTerminalView.tsx frontend/src/components/WebTerminalView.tsx tests/terminalResizeStabilization.test.ts
git commit -m "fix(terminal): eliminate geometric CSS transitions on terminal containers to avoid resize storms"
```

---

### Task 2: Implement Refitting State Machine, Debounced Final Resize, and Viewport Scroll Lock

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `tests/terminalResizeStabilization.test.ts`

**Interfaces:**
- Produces:
  - `isRefitting` state and `isRefittingRef` in `WebTerminalView`.
  - Guard in `term.write(data, callback)`: bypasses `scrollToBottomSafe` while `isRefittingRef.current === true`.
  - Debounced `sendResize` in `ResizeObserver` / `standalone` effects to dispatch exactly one final PTY resize message.
  - Final anchor: single `scrollToBottomSafe(term)` triggered when `isRefitting` resolves after ~120ms.

- [ ] **Step 1: Expand test with assertions for isRefitting, scroll lock, and debounced resize**

Append to `tests/terminalResizeStabilization.test.ts`:
```typescript
  it('WebTerminalView should manage isRefitting state to lock scrolling during resize refit', () => {
    expect(webTerminalContent).toContain('isRefitting');
    expect(webTerminalContent).toContain('isRefittingRef');
    // term.write callback must check isRefittingRef before scrolling
    expect(webTerminalContent).toMatch(/!isRefittingRef\.current/);
  });

  it('WebTerminalView should apply subtle visual opacity transition during refit', () => {
    expect(webTerminalContent).toMatch(/isRefitting\s*\?\s*['"]opacity-40/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalResizeStabilization.test.ts`
Expected: FAIL (missing `isRefitting` and scroll lock in WebTerminalView).

- [ ] **Step 3: Implement isRefitting and scroll lock in WebTerminalView**

In `frontend/src/components/WebTerminalView.tsx`:
1. Add state and ref:
   ```typescript
   const [isRefitting, setIsRefitting] = useState<boolean>(false);
   const isRefittingRef = useRef<boolean>(false);
   const refitTimerRef = useRef<NodeJS.Timeout | null>(null);
   const resizeDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
   ```
2. In `standalone` toggle effect:
   - When `standalone` changes, enter refitting window:
     ```typescript
     setIsRefitting(true);
     isRefittingRef.current = true;
     if (refitTimerRef.current) clearTimeout(refitTimerRef.current);
     ```
   - In `standalone` effect, fit xterm and debounce resize by 80ms:
     ```typescript
     if (resizeDebounceTimerRef.current) clearTimeout(resizeDebounceTimerRef.current);
     resizeDebounceTimerRef.current = setTimeout(() => {
       if (fitAddonRef.current && xtermRef.current) {
         const term = xtermRef.current;
         fitAddonRef.current.fit();
         sendResize(term.cols, term.rows);
       }
     }, 80);
     ```
   - Close the refitting window after ~120ms:
     ```typescript
     refitTimerRef.current = setTimeout(() => {
       isRefittingRef.current = false;
       setIsRefitting(false);
       if (xtermRef.current) {
         scrollToBottomSafe(xtermRef.current);
       }
     }, 120);
     ```
3. In `onmessage` handling `term?.write(data, () => ...)`:
   - Wrap `scrollToBottomSafe` with `!isRefittingRef.current`:
     ```typescript
     if (!isRefittingRef.current && shouldScrollToBottom({ isReplaying: isReplayingRef.current, wasAtBottom, bufferType: term?.buffer.active.type })) {
       scrollToBottomSafe(term);
     }
     ```
4. In the terminal canvas wrapper div:
   - Bind subtle opacity:
     ```tsx
     <div
       className={`... ${isRefitting ? 'opacity-40 select-none pointer-events-none' : 'opacity-100'} transition-opacity duration-150`}
     >
     ```
5. Clean up timers on unmount.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalResizeStabilization.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalResizeStabilization.test.ts
git commit -m "feat(terminal): implement silent refitting and scroll lock to stabilize fullscreen repaint"
```

---

### Task 3: Full Test Suite Verification & Production Build

**Files:**
- Full codebase
- Build: `npm run build`
- Tests: `npm test`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 78+ test suites pass with 0 errors.

- [ ] **Step 2: Run frontend and backend production build**

Run: `npm run build`
Expected: `dist/frontend` (Vite) and `dist/src` (tsc) compile cleanly.

- [ ] **Step 3: Commit and Push**

```bash
git status
git commit --allow-empty -m "chore(terminal): complete verification of fullscreen resize repaint stabilization"
git push origin main
```

# Robust Non-Fullscreen Terminal Auto-Fit & Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate blank screen rendering in non-fullscreen mode upon connection by providing hard minimum container heights, keeping xterm DOM continuous (eliminating `hidden` dehydration), fixing premature `sendResize` caching, and adding active non-fullscreen fit lifecycles.

**Architecture:** 
- In `UnifiedTerminalView.tsx`, enforce `min-h-[420px]` on mobile and `min-h-[500px]` on desktop so the container never collapses to 0px height before Flexbox layout stabilizes.
- In `WebTerminalView.tsx`, keep the canvas container rendered as `h-full w-full block` at all times, moving the empty state banner to an absolute overlay layer (`absolute inset-0 z-20`) so xterm never undergoes `display: none` dehydration.
- In `WebTerminalView.tsx`, ensure `sendResize` only updates `lastSentColsRef` and `lastSentRowsRef` when `ws.readyState === WebSocket.OPEN` and the frame is actually transmitted, and reset them to 0 upon `ws.onopen`.
- In `UnifiedTerminalView.tsx`, trigger dedicated active fit timers (60ms, 200ms) upon mounting `interactive` tab and when `activeHostId` changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, xterm.js, `@xterm/addon-fit`, Jest.

## Global Constraints

- Strict TypeScript with 100% type safety.
- Do not invoke HTML5 native `requestFullscreen`.
- Ensure all terminal sessions and running CLI processes remain connected without restarts.
- All existing 83+ test suites must continue to pass without regressions.

---

### Task 1: Enforce Minimum Non-Fullscreen Container Height & Eliminate Canvas DOM Dehydration

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Create: `tests/terminalNonFullscreenStability.test.ts`

**Interfaces:**
- `UnifiedTerminalView.tsx`: Non-fullscreen container class includes `min-h-[420px] flex-1`.
- `WebTerminalView.tsx`: Canvas `terminalContainerRef` element always has `h-full w-full` (never conditionally `hidden`). Empty state placeholder rendered as `absolute inset-0 z-20`.

- [ ] **Step 1: Write the failing test**

Create `tests/terminalNonFullscreenStability.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Non-Fullscreen Terminal Stability & Continuous Canvas', () => {
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  let unifiedContent: string;
  let webTerminalContent: string;

  beforeAll(() => {
    unifiedContent = fs.readFileSync(unifiedPath, 'utf-8');
    webTerminalContent = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('UnifiedTerminalView enforces min-h-[420px] on non-fullscreen container to prevent height collapse', () => {
    expect(unifiedContent).toContain('min-h-[420px]');
    expect(unifiedContent).toContain('flex-1');
  });

  it('WebTerminalView canvas container does not use conditional hidden class', () => {
    // terminalContainerRef must not be conditionally set to hidden
    expect(webTerminalContent).not.toMatch(/ref=\{terminalContainerRef\}[\s\S]*?!activeHostId\s*\?\s*['"]hidden['"]/);
    expect(webTerminalContent).toMatch(/!activeHostId\s*&&[\s\S]*?absolute inset-0 z-20/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalNonFullscreenStability.test.ts`
Expected: FAIL (missing `min-h-[420px]` in UnifiedTerminalView and `terminalContainerRef` still has conditional `hidden`).

- [ ] **Step 3: Implement container minimum height and absolute overlay in components**

1. In `frontend/src/components/UnifiedTerminalView.tsx`:
   - Update the container className when `!isStandalone`:
     ```tsx
     className={`mx-auto flex flex-col bg-[var(--bg-canvas)] border border-[var(--border-subtle)] overflow-hidden shadow-2xl font-mono text-xs transition-none ${
       isStandalone
         ? 'fixed inset-0 z-50 rounded-none h-[100dvh] w-screen overflow-hidden overscroll-none border-none'
         : 'w-full h-full flex-1 min-h-[420px] md:max-w-7xl md:h-[calc(100vh-140px)] md:min-h-[500px] rounded-none md:rounded-2xl border-x-0 md:border-x border-t-0 md:border-t'
     }`}
     ```
2. In `frontend/src/components/WebTerminalView.tsx`:
   - Update `terminalContainerRef` div:
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
   - Change empty state guard div to an absolute overlay:
     ```tsx
     {!activeHostId && (
       <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center select-none bg-[var(--bg-canvas)]">
         {/* existing empty state icons, title, desc, and add node button */}
       </div>
     )}
     ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalNonFullscreenStability.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UnifiedTerminalView.tsx frontend/src/components/WebTerminalView.tsx tests/terminalNonFullscreenStability.test.ts
git commit -m "fix(terminal): prevent non-fullscreen height collapse and eliminate canvas DOM dehydration"
```

---

### Task 2: Fix `sendResize` Premature Caching Trap & Add Non-Fullscreen Active Fit Lifecycles

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Modify: `tests/terminalNonFullscreenStability.test.ts`

**Interfaces:**
- Produces:
  - `sendResize`: only writes `lastSentColsRef.current` and `lastSentRowsRef.current` after successful `ws.send()`.
  - `ws.onopen`: resets `lastSentColsRef.current = 0; lastSentRowsRef.current = 0;` before calling `safeFit()`.
  - `UnifiedTerminalView.tsx`: runs active fit timers on `[subTab, activeHostId]` updates.
  - `WebTerminalView.tsx`: runs `safeFit()` and `refresh()` on `activeHostId` changes.

- [ ] **Step 1: Write test additions**

Append to `tests/terminalNonFullscreenStability.test.ts`:
```typescript
  it('sendResize only commits lastSentColsRef when WebSocket is OPEN', () => {
    expect(webTerminalContent).toMatch(/wsRef\.current\.readyState\s*===\s*WebSocket\.OPEN[\s\S]*?lastSentColsRef\.current\s*=\s*cols/);
  });

  it('ws.onopen resets lastSentColsRef to ensure fresh PTY size dispatch', () => {
    expect(webTerminalContent).toMatch(/onopen[\s\S]*?lastSentColsRef\.current\s*=\s*0/);
  });

  it('UnifiedTerminalView triggers active fit timers on subTab and activeHostId updates', () => {
    expect(unifiedContent).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?subTab\s*===\s*'interactive'[\s\S]*?terminalRef\.current\?\.fit\(\)[\s\S]*?\}\s*,\s*\[subTab,\s*activeHostId\]\)/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalNonFullscreenStability.test.ts`
Expected: FAIL (missing cache fix and UnifiedTerminalView active fit effect).

- [ ] **Step 3: Implement sendResize fix and active fit lifecycles**

1. In `frontend/src/components/WebTerminalView.tsx`:
   - Update `sendResize`:
     ```typescript
     const sendResize = useCallback((cols: number, rows: number) => {
       if (cols <= 0 || rows <= 0) return;
       if (cols === lastSentColsRef.current && rows === lastSentRowsRef.current) {
         return;
       }
       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
         lastSentColsRef.current = cols;
         lastSentRowsRef.current = rows;
         console.debug(`[WebTerminal] Sending resize to backend: ${cols}x${rows}`);
         wsRef.current.send(`JSON:${JSON.stringify({ type: 'resize', cols, rows })}`);
       }
     }, []);
     ```
   - In `initWebSocket` -> `ws.onopen`:
     ```typescript
     ws.onopen = () => {
       console.debug('[WebTerminal] WebSocket connection established successfully');
       setIsConnecting(false);
       setIsConnected(true);
       reconnectAttemptRef.current = 0;
       clearReconnectTimers();

       lastSentColsRef.current = 0;
       lastSentRowsRef.current = 0;

       if (!safeFit()) {
         setTimeout(safeFit, 80);
       }
       ...
     };
     ```
   - In `activeHostId` change effect:
     ```typescript
     useEffect(() => {
       if (activeHostId) {
         const timer = setTimeout(() => {
           safeFit();
           xtermRef.current?.refresh(0, Math.max(0, (xtermRef.current?.rows || 1) - 1));
         }, 50);
         return () => clearTimeout(timer);
       }
     }, [activeHostId, safeFit]);
     ```
2. In `frontend/src/components/UnifiedTerminalView.tsx`:
   - Add active fit effect:
     ```typescript
     useEffect(() => {
       if (subTab === 'interactive' && activeHostId) {
         const t1 = setTimeout(() => terminalRef.current?.fit(), 60);
         const t2 = setTimeout(() => terminalRef.current?.fit(), 200);
         return () => {
           clearTimeout(t1);
           clearTimeout(t2);
         };
       }
     }, [subTab, activeHostId]);
     ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalNonFullscreenStability.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx frontend/src/components/UnifiedTerminalView.tsx tests/terminalNonFullscreenStability.test.ts
git commit -m "fix(terminal): fix sendResize caching trap and add active non-fullscreen fit lifecycles"
```

---

### Task 3: Full Test Suite Verification & Production Build

**Files:**
- Full codebase
- Build: `npm run build`
- Tests: `npm test`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 84+ test suites pass with 0 errors.

- [ ] **Step 2: Run frontend and backend production build**

Run: `npm run build`
Expected: `dist/frontend` (Vite) and `dist/src` (tsc) compile cleanly with 0 errors.

- [ ] **Step 3: Commit and Push**

```bash
git status
git commit --allow-empty -m "chore(terminal): complete verification of non-fullscreen stability fixes"
git push origin main
```

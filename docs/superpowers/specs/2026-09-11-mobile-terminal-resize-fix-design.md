# Mobile WebTerminal Resize & Viewport Stability Design

## 1. Context & Problem Statement

Users intermittently encounter a critical issue on mobile devices when accessing WebTerminal: **the terminal viewport does not resize, remaining locked to the backend PTY default size of 80x24**, resulting in clipped lines, horizontal overflow, garbled text formatting, or an awkward letterboxed layout. The issue only temporarily resolves if the user manually toggles fullscreen or rotates the screen.

### Root Cause Analysis

1. **Virtual Keyboard Misdetection Deadlock**:
   - On mobile browsers (especially iOS Safari and Chrome for Android), browser chrome (address bar and navigation toolbar) dynamically expands and collapses, triggering `visualViewport.onresize` with a height difference of 100-200px.
   - `calculateKeyboardTranslateY` and `updateViewport` calculate `rawDiff = baseHeight - viewportHeight`. When `rawDiff > threshold` (150px or 18% of screen), it flags `isKeyboardShowing = true`.
   - In `mobileViewportHelper.ts`, `shouldBlockPtyResize` checks `isKeyboardShowing` and suppresses all PTY resizes to avoid text wrapping jitter while typing.
   - Crucially, base dimensions are only allowed to update when `!isKeyboardShowing`. If address bar expansion occurs while the user is not typing, the system permanently latches into `isKeyboardShowing = true`, completely blocking all future PTY resizes.

2. **`lastSentColsRef` / `lastSentRowsRef` Premature Cache & Timing Disconnect**:
   - When the terminal mounts, `ResizeObserver` and initial probe timers measure the actual mobile layout (e.g. 42 cols x 25 rows).
   - If the WebSocket connection has not transitioned to `OPEN` yet, or if `activeHostId` subsequently changes (such as `TerminalHostSelector` asynchronously fetching the list of online nodes), the PTY on the newly attached host defaults to `80x24`.
   - When the socket opens, `sendResize` checks `if (cols === lastSentColsRef.current && rows === lastSentRowsRef.current) return;`. Because the mobile container dimensions have not changed since mount, `sendResize` aborts early and never transmits the 42x25 dimensions to the PTY.
   - Handlers like `handleHostChange`, `executeReset`, and reconnection paths do not zero out `lastSentColsRef` and `lastSentRowsRef`.

3. **Missing CSS Transition Compensation & Weak Single-Shot Probes**:
   - When the virtual keyboard dismisses, the container expands with a 220ms CSS transition: `transition: height 0.22s cubic-bezier(...)`. When `updateViewport` fires immediately upon keyboard hide, the container has not expanded to its final height yet.
   - `useEffect([activeHostId])` currently relies on a single 50ms timer, which frequently fires before WebSocket connection and CSS reflow complete.

---

## 2. Architecture & Design Principles (Approach A: Comprehensive Defense & Self-Healing)

```
                       ┌────────────────────────────────────────────────┐
                       │ User Enters Terminal / Visual Viewport Changes │
                       └───────────────────────┬────────────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
  [Physical Focus Guard]                                            [Force Dispatch & Cache Invalidation]
  - isInputFocused = document.activeElement                         - lastSentColsRef = 0, lastSentRows = 0
    === terminalTextarea                                              on: initWebSocket, handleHostChange,
  - isKeyboardShowing = rawDiff > threshold                           executeReset, ws.onopen
    && isInputFocused                                               - sendResize(cols, rows, force = false):
  - If !isInputFocused: always allow resize;                          bypasses cache when force === true
    safely recalibrate baseHeight/baseWidth                         - ws.onopen dispatches force = true
               │                                                               │
               └───────────────────────────────┬───────────────────────────────┘
                                               │
                                               ▼
                              [Ladder Self-Healing Probes]
                              - Terminal Mount: [0ms, 60ms, 150ms, 350ms, 800ms]
                              - Host Switch / Tab Change: [60ms, 200ms, 500ms]
                              - Keyboard Dismiss: 260ms post-transition probe
```

---

## 3. Detailed Specifications

### 3.1 Strict Physical Focus Guard for Keyboard Detection

In `frontend/src/utils/mobileViewportHelper.ts` and `frontend/src/components/WebTerminalView.tsx`:

1. `calculateKeyboardTranslateY` and `shouldBlockPtyResize` must incorporate `isInputFocused: boolean`.
2. Even if `viewportHeight` drops significantly due to browser chrome/navigation bars, if the terminal's helper textarea is **not focused**, it must never be treated as keyboard visible:
   ```typescript
   export function calculateKeyboardTranslateY({
     baseHeight,
     viewportHeight,
     offsetTop = 0,
     isInputFocused = false,
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
     const threshold = Math.min(150, baseHeight * 0.18);
     // Only consider keyboard showing if rawDiff exceeds threshold AND terminal input is actively focused
     const isKeyboardShowing = isInputFocused && rawDiff > threshold;
     ...
   }
   ```
3. In `WebTerminalView.tsx` `updateViewport`:
   ```typescript
   const textarea = terminalContainerRef.current?.querySelector('textarea');
   const isInputFocused = document.activeElement === textarea;

   if (!isInputFocused) {
     // Safely update base dimensions if not typing
     baseHeightRef.current = Math.max(window.innerHeight, vv?.height || window.innerHeight);
     baseWidthRef.current = window.innerWidth;
   }
   ```

### 3.2 Forced PTY Resize & Cache Invalidation

In `frontend/src/components/WebTerminalView.tsx`:

1. Enhance `sendResize` to support a `force` parameter:
   ```typescript
   const sendResize = useCallback((cols: number, rows: number, force: boolean = false) => {
     if (cols <= 0 || rows <= 0) return;
     if (!force && cols === lastSentColsRef.current && rows === lastSentRowsRef.current) {
       return;
     }
     if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
       lastSentColsRef.current = cols;
       lastSentRowsRef.current = rows;
       console.debug(`[WebTerminal] Sending resize to backend: ${cols}x${rows} (force=${force})`);
       wsRef.current.send(`JSON:${JSON.stringify({ type: 'resize', cols, rows })}`);
     }
   }, []);
   ```

2. Reset cache (`lastSentColsRef.current = 0; lastSentRowsRef.current = 0;`) on:
   - `initWebSocket`
   - `ws.onopen` (with immediate `force = true` dispatch)
   - `handleHostChange`
   - `executeReset`

3. Update `safeFit`:
   ```typescript
   const safeFit = useCallback((forceResize: boolean = false): boolean => {
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
         sendResize(cols, rows, forceResize);
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

### 3.3 Multi-Stage Ladder Probes & Transition Compensation

1. **Mount Ladder Probe**:
   Replace short-lived RAF with ladder intervals in `triggerMountProbe`:
   - Schedules probes at `[60ms, 150ms, 350ms, 800ms]` to ensure slow mobile DOM rendering captures proper dimensions.
2. **Active Host Change Ladder**:
   In `WebTerminalView.tsx`:
   ```typescript
   useEffect(() => {
     if (activeHostId) {
       const timers = [
         setTimeout(() => { safeFit(true); xtermRef.current?.refresh(0, Math.max(0, (xtermRef.current?.rows || 1) - 1)); }, 60),
         setTimeout(() => { safeFit(true); }, 200),
         setTimeout(() => { safeFit(false); }, 500),
       ];
       return () => timers.forEach(clearTimeout);
     }
   }, [activeHostId, safeFit]);
   ```
3. **Keyboard Dismiss Transition Compensation**:
   When `isKeyboardShowing` transitions from `true` to `false`, the 220ms CSS transition is compensated:
   ```typescript
   // On keyboard hide
   setTimeout(() => {
     if (isMountedRef.current) {
       safeFit(true);
     }
   }, 260);
   ```
4. **UnifiedTerminalView SubTab & Window Synchronization**:
   Ensure `UnifiedTerminalView`'s subTab switch and window resize handlers trigger `terminalRef.current?.fit()`.

---

## 4. Verification Plan

1. **Automated Unit & Structural Regression Tests**:
   - Create and update tests in `tests/terminalMobileResizeStability.test.ts`.
   - Verify `calculateKeyboardTranslateY` returns `isKeyboardShowing: false` when `isInputFocused: false` even with huge height diffs.
   - Verify `sendResize` accepts and respects `force` flag.
   - Verify `lastSentColsRef` is reset to 0 in all host change and reconnect lifecycle hooks.
2. **End-to-End Build & Validation**:
   - Run `npm run build` to verify clean frontend bundle generation.
   - Run `npm test` across entire test suite with 0 regressions.

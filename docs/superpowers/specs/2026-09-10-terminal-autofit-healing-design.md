# Terminal Auto-Fit Initialization & Multi-Phase Healing Design

## 1. Problem Statement

When connecting to the web terminal in normal (embedded/non-fullscreen) mode, users sometimes encounter an issue where the terminal connects successfully (`连接成功`), but **the screen remains completely blank (no text rendered)**. As soon as the user clicks the "Fullscreen" button (`全屏`), the terminal content immediately appears.

### Root Cause Analysis
1. **DOM Layout Race Condition during Initial Mount**:
   - `WebTerminalView` is deeply nested in the SPA React component tree (`App` -> `main` -> `UnifiedTerminalView` -> `Dual Panels Workspace` -> `WebTerminalView`).
   - During component mount, the terminal container div may have `clientWidth === 0` or `clientHeight === 0` while the surrounding Flexbox styles and parent layouts are still resolving.
   - `@xterm/addon-fit`'s `proposeDimensions()` aborts early if `clientWidth === 0`, `clientHeight === 0`, or if cell dimensions have not yet been measured by xterm's render service (`cell.width === 0`).
2. **Single Fragile 50ms Timeout**:
   - The initial fit relied on a single `setTimeout(..., 50)`. If the DOM layout took more than 50ms (or if font metrics were delayed), this timer fired while the container had zero dimensions and silently returned without resizing xterm.
3. **Absence of Self-Healing Mechanisms**:
   - When historical terminal chunks arrived via WebSocket, they were written to xterm's buffer. However, because xterm remained at 0x0 or collapsed dimensions, the rendered DOM viewport displayed nothing.
   - Clicking "Fullscreen" changed `standalone` to `true`, forcing fixed 100vw/100vh bounds and triggering an explicit `fitAddon.fit()`, which finally forced xterm to compute correct dimensions and render the buffered screen.

---

## 2. Multi-Phase Auto-Fit Healing Architecture

```
Component Mount
     │
     ├─► [Phase 1: Double-rAF & Staged Fallback Timers]
     │     - Frame 1: requestAnimationFrame -> safeFit()
     │     - Frame 2: requestAnimationFrame -> safeFit()
     │     - Staged fallbacks: 60ms, 150ms, 300ms
     │
     ├─► [Phase 2: WebSocket Connection Event (ws.onopen)]
     │     - Handshake complete -> execute safeFit()
     │
     ├─► [Phase 3: First Incoming Data Stream (ws.onmessage)]
     │     - Before writing data: if term.cols <= 2 || term.rows <= 1 -> safeFit()
     │
     ├─► [Phase 4: Document Fonts Ready Event (document.fonts.ready)]
     │     - Font loaded & cell metrics confirmed -> safeFit()
     │
     └─► [Phase 5: Container ResizeObserver Guard]
           - Whenever container transitions from 0 to positive dimensions -> safeFit()
```

---

## 3. Detailed Specifications

### 3.1 Unified `safeFit()` Engine
Implement a robust `safeFit()` helper in `WebTerminalView.tsx`:
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

### 3.2 Multi-Phase Triggers
1. **Double-rAF Mount Sequence**:
   - Call `safeFit()` across two animation frames, with fallback timeouts at 60ms, 150ms, and 300ms.
2. **First-Chunk Data Arrival**:
   - In `ws.onmessage`, before `term.write(data)`, verify if `term.cols <= 2 || term.rows <= 1`. If so, trigger `safeFit()`.
3. **WebSocket onopen Handshake**:
   - Call `safeFit()` on connection open; if not yet fitted, retry at 80ms.
4. **Font Loading Complete (`document.fonts.ready`)**:
   - On `document.fonts.ready`, execute `safeFit()`.
5. **UnifiedTerminalView Tab Change**:
   - In `handleSubTabChange('interactive')`, call `terminalRef.current?.fit()`.

---

## 4. Testing & Verification

1. **Unit Tests (`tests/terminalAutoFitHealing.test.ts`)**:
   - Verify `WebTerminalView` implements `safeFit` with positive dimension checks.
   - Verify multi-stage triggers (double-rAF, first-data check, `fonts.ready`, and `ws.onopen`).
2. **Regression & Build**:
   - Full test suite passes (`npm test`).
   - Clean production build (`npm run build`).

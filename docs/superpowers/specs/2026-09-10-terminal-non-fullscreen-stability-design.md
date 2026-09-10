# Robust Non-Fullscreen Terminal Auto-Fit & Layout Collapse Prevention Design

## 1. Problem Statement

When connecting to the web terminal in normal (non-fullscreen/embedded) mode, users intermittently experience a state where the terminal connects successfully, but **the screen remains blank with no output rendered**. As soon as the user clicks the "Fullscreen" button (`全屏`), the terminal content immediately displays properly.

### Discrepancy Between Fullscreen and Non-Fullscreen Modes
1. **Geometric Grounding**:
   - **Fullscreen (`standalone`)**: Uses `fixed inset-0 w-screen h-[100dvh]`. It breaks out of the normal DOM flow and anchors directly to the viewport, giving xterm guaranteed positive physical pixel bounds immediately. Furthermore, fullscreen mode has dedicated `useEffect([standalone])` listeners that forcefully trigger `fitAddon.fit()`.
   - **Non-Fullscreen (`embedded`)**: Relies on relative flexbox chains across multiple React component layers (`App` -> `main` -> `UnifiedTerminalView` -> `Workspace` -> `WebTerminalView`). On mobile devices, `UnifiedTerminalView` had `h-full` without a guaranteed minimum pixel height, causing initial height collapse to `0px`.
2. **DOM Dehydration (`hidden` / `display: none`)**:
   - In `WebTerminalView.tsx`, the terminal container element was conditionally hidden with `className={`${!activeHostId ? 'hidden' : 'h-full w-full'}`}`.
   - When the component initially renders while `activeHostId` is being resolved, `terminalContainerRef` enters `display: none`. In this state, xterm's `CharMeasure` and `RenderService` fail to compute character cell dimensions (`cell.width === 0`), causing xterm to enter a dehydrated idle state that doesn't self-recover when `hidden` is removed.
3. **`sendResize` Premature Caching Trap**:
   - `sendResize` updated `lastSentColsRef` and `lastSentRowsRef` even if the WebSocket was in `CONNECTING` (`readyState === 0`) status. When `ws.onopen` later fired with the identical dimensions, `sendResize` aborted early, failing to dispatch the initial terminal size to the PTY.

---

## 2. Architecture & Design Principles

```
Component Lifecycle
       │
       ├─► [1. CSS Min-Height Anchor]
       │     UnifiedTerminalView: min-h-[420px] on mobile, min-h-[500px] on desktop
       │     Ensures clientHeight > 0 on frame 0 regardless of flex layout delays
       │
       ├─► [2. Continuous DOM Presence (Eliminate `hidden`)]
       │     Terminal canvas container is always rendered (h-full w-full block)
       │     Empty state banner rendered as absolute overlay (absolute inset-0 z-20)
       │
       ├─► [3. SendResize Delivery Guarantee]
       │     Only commit lastSentCols/Rows when ws.readyState === OPEN and sent
       │     Reset lastSentCols = 0, lastSentRows = 0 in ws.onopen
       │
       └─► [4. Non-Fullscreen Dedicated Active Fit Lifecycle]
             UnifiedTerminalView: useEffect([subTab, activeHostId]) triggers fit
             WebTerminalView: host change triggers safeFit() + term.refresh()
```

---

## 3. Detailed Specifications

### 3.1 CSS Height Hardening in `UnifiedTerminalView.tsx`
Replace the non-fullscreen container classes:
```tsx
className={`mx-auto flex flex-col bg-[var(--bg-canvas)] border border-[var(--border-subtle)] overflow-hidden shadow-2xl font-mono text-xs transition-none ${
  isStandalone
    ? 'fixed inset-0 z-50 rounded-none h-[100dvh] w-screen overflow-hidden overscroll-none border-none'
    : 'w-full h-full flex-1 min-h-[420px] md:max-w-7xl md:h-[calc(100vh-140px)] md:min-h-[500px] rounded-none md:rounded-2xl border-x-0 md:border-x border-t-0 md:border-t'
}`}
```

### 3.2 Continuous Canvas DOM in `WebTerminalView.tsx`
1. The canvas container is always rendered with `h-full w-full`:
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
2. The empty state card is rendered as an overlay:
   ```tsx
   {!activeHostId && (
     <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center select-none bg-[var(--bg-canvas)]">
       {/* empty state content */}
     </div>
   )}
   ```

### 3.3 `sendResize` Delivery Guarantee
In `WebTerminalView.tsx`:
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
In `ws.onopen`:
```typescript
lastSentColsRef.current = 0;
lastSentRowsRef.current = 0;
safeFit();
```

### 3.4 Non-Fullscreen Active Fit Lifecycle
In `UnifiedTerminalView.tsx`:
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

---

## 4. Testing & Verification

1. **Unit & Structural Tests (`tests/terminalNonFullscreenStability.test.ts`)**:
   - Verify `UnifiedTerminalView` non-fullscreen classes contain `min-h-[420px]` and `flex-1`.
   - Verify `WebTerminalView` canvas element does not contain `hidden` class binding.
   - Verify `sendResize` only updates `lastSentColsRef` upon `WebSocket.OPEN`.
2. **Regression & Build Verification**:
   - Full test suite (`npm test`) passes with 0 failures.
   - Frontend and backend production build (`npm run build`) succeeds cleanly.

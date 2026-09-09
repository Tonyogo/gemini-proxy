# Terminal Fullscreen Resize Repaint Stabilization Design

## 1. Problem Statement

When toggling between embedded (normal) and standalone (fullscreen) terminal modes, users experience a disorienting visual artifact where the screen content appears to "roll down and repaint from top to bottom" (`从上往下重新回滚一遍`).

In contrast, reconnecting or refreshing the terminal does not exhibit this behavior and renders stably in an instant.

### Root Causes
1. **PTY Window Size Change & SIGWINCH**:
   - Toggling fullscreen causes an immediate jump in terminal dimensions (`cols` and `rows`).
   - The frontend calls `fitAddon.fit()` and transmits a `resize` message over the WebSocket.
   - The agent process (`terminal-agent.js`) resizes the OS PTY, throwing `SIGWINCH` to the foreground process.
   - Claude Code CLI (built on Node.js Ink) runs in standard buffer mode (`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`). When `cols` changes, Ink must recalculate word wraps and rerender the active conversation tree. It moves the ANSI cursor up and redraws the view from line 1 downward.
2. **Intermediate Jitter from CSS Transitions**:
   - The terminal window container had CSS `transition-all`. As the window animated between normal and fullscreen geometry, `ResizeObserver` fired repeatedly (10+ times in 150ms), flooding the PTY with multiple `SIGWINCH` signals and triggering overlapping Ink repaints.
3. **Unchecked Scroll Follow During Repaint**:
   - During this redraw phase, every incoming chunk called `scrollToBottomSafe(term)`. As Ink cleared lines and printed from top to bottom, the viewport was repeatedly forced to the bottom, causing visible scrolling and jumping.

---

## 2. Stabilization Architecture

```
User toggles Fullscreen / Standalone
         │
         ▼
[1] Instant Geometric Transition (0ms)
    - Remove CSS transition-all from terminal containers
    - Geometry snaps to final bounds immediately
         │
         ▼
[2] Enter Silent Refitting Window (isRefitting = true, ~120ms)
    - Terminal canvas opacity subtly dimmed (opacity: 0.45)
    - Viewport scroll lock engaged (suppress scrollToBottomSafe on incoming chunks)
         │
         ▼
[3] Debounced Single Final Resize
    - fitAddon.fit() calculates final (cols, rows)
    - Send exactly ONE resize payload to PTY after debounce window
         │
         ▼
[4] Ink redraw arrives & buffer stabilizes
    - Ink writes new layout to xterm.js buffer silently
         │
         ▼
[5] Final Anchor & Visual Restoration
    - Execute single scrollToBottomSafe(term) to lock bottom cursor
    - Restore opacity to 1.0 (isRefitting = false)
```

---

## 3. Detailed Specifications

### 3.1 Eliminating Geometric Transitions
- In `UnifiedTerminalView.tsx` and `WebTerminalView.tsx`, replace `transition-all` on the main container with `transition-none`.
- Transitions for background color or borders are permitted, but width, height, inset, and padding must snap with zero delay (`0ms`).

### 3.2 Refitting State Machine (`isRefitting`)
- Introduce a reactive state `isRefitting` and ref `isRefittingRef`:
  - Default: `false`.
  - On `standalone` toggle or host resize jump: set to `true`.
  - Visual styling:
    ```tsx
    <div
      className={`... ${isRefitting ? 'opacity-40 select-none pointer-events-none' : 'opacity-100'} transition-opacity duration-150`}
    >
      {/* terminal canvas */}
    </div>
    ```

### 3.3 Debounced Resize & Scroll Lock
1. **Send Resize Debounce**:
   - Debounce `sendResize` by 80ms during window resize events so intermediate values are not sent.
   - If `cols` and `rows` match the last acknowledged dimensions, suppress dispatch entirely.
2. **Scroll Lock during Refit**:
   - In `term.write(data, callback)`, check `!isRefittingRef.current`:
     ```typescript
     term?.write(data, () => {
       if (!isRefittingRef.current && shouldScrollToBottom({ isReplaying: isReplayingRef.current, wasAtBottom, bufferType: term?.buffer.active.type })) {
         scrollToBottomSafe(term);
       }
     });
     ```
3. **Refit Completion**:
   - After the 120ms refit timer fires:
     - `isRefittingRef.current = false;`
     - `setIsRefitting(false);`
     - `scrollToBottomSafe(term);`

---

## 4. Verification & Testing Strategy

1. **Unit / Structural Tests (`tests/terminalResizeStabilization.test.ts`)**:
   - Ensure `WebTerminalView` and `UnifiedTerminalView` containers do NOT have `transition-all` on resizing dimensions.
   - Verify `isRefitting` state and scroll lock logic exist and guard `scrollToBottomSafe` during refitting windows.
   - Verify debounced resize logic sends only final terminal geometry.
2. **Regression & Build Verification**:
   - `npm test` passes with zero regressions across all suites.
   - `npm run build` succeeds cleanly.

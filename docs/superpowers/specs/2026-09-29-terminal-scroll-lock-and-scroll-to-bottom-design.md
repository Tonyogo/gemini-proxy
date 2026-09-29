# Web Terminal: Scroll Lock and Floating Scroll-to-Bottom Button Spec

**Date:** 2026-09-29
**Status:** Approved

## 1. Goal
Solve the issue where active web terminal sessions with frequent or streaming output force the viewport to repeatedly jump to the bottom, preventing users from freely scrolling up to inspect history. Provide a sticky-bottom scroll lock mechanism and a floating one-click "Scroll to Bottom" button when the viewport is scrolled away from the bottom.

## 2. Root Cause Analysis
1. In `frontend/src/components/WebTerminalView.tsx`, the WebSocket `ws.onmessage` handler for text and binary data sets a 150ms timeout (`replayTimerRef.current = setTimeout(...)`) that unconditionally executes:
   ```typescript
   scrollToBottomSafe(xtermRef.current);
   ```
   This triggers on every single data chunk even during normal streaming execution (not just initial replay), forcefully pulling the viewport back to the bottom.
2. The `isReplayingRef` flag is repeatedly re-armed during normal session streaming instead of being confined to the initial connection/reconnect replay window.
3. Lack of a reactive `isAtBottom` state tracking xterm scroll position (`term.onScroll`), causing the UI to be unaware of when the user has scrolled up to inspect previous output.

## 3. Architecture & Requirements

### 3.1 Terminal Scroll Helper (`frontend/src/utils/terminalScrollHelper.ts`)
- Enhance `isUserAtBottom(term, threshold = 1)` to allow a slight tolerance threshold (default 1-2 lines) to prevent jitter on high-DPI screens.
- Keep `shouldScrollToBottom` strictly adhering to:
  - If buffer is `alternate` (vim, nano, htop): `false`.
  - If `isReplaying`: `true`.
  - Otherwise: `wasAtBottom`.

### 3.2 WebTerminalView State Machine (`frontend/src/components/WebTerminalView.tsx`)
1. **Replay Window Lifecycle**:
   - `isReplayingRef` should only be true upon initial connection / reconnection / explicit session reset (600ms window).
   - In `ws.onmessage`, remove the unconditional `scrollToBottomSafe(xtermRef.current)` in the 150ms timer.
2. **Scroll Tracking & Sticky Lock**:
   - Add `isAtBottom` state (boolean, default `true`) and `isAtBottomRef` (ref).
   - Listen to `term.onScroll(() => { ... })`:
     - Evaluate `isUserAtBottom(term)`.
     - Update `isAtBottom` state and ref.
     - When `term.buffer.active.type === 'alternate'`, keep button hidden.
   - When new data arrives in `ws.onmessage`:
     - Only call `scrollToBottomSafe(term)` if `shouldScrollToBottom({ isReplaying: isReplayingRef.current, wasAtBottom: isAtBottomRef.current, bufferType: term?.buffer.active.type })`.
     - Never force scroll if `isAtBottomRef.current === false`.
3. **User Keystroke / Input Auto-Scroll**:
   - When user types input (`term.onData` or accessory bar), xterm should scroll to bottom to reveal the cursor prompt line, and re-anchor `isAtBottom` to `true`.
4. **Floating "Scroll to Bottom" Button**:
   - Visible only when `!isAtBottom` and `activeHostId` is present and buffer is not `alternate` and not `isSelectMode`.
   - Placed at bottom-right corner: `absolute right-4 bottom-4 z-20` (or `bottom-14` when mobile accessory bar is showing).
   - Visual design:
     - Circular button (~36px diameter) with `ArrowDown` icon.
     - Frosted glass design (`bg-[var(--bg-surface)]/85 border border-[var(--border-subtle)] shadow-xl text-slate-300 hover:text-white`).
     - Click handler: calls `scrollToBottomSafe(xtermRef.current)`, sets `isAtBottom` to `true`, and refocuses `xtermRef.current?.focus()`.
     - Title tooltip: `t('webTerminal.scrollToBottom', '跳到最后')`.

### 3.3 Internationalization (`frontend/src/i18n/locales/`)
- Ensure `webTerminal.scrollToBottom` exists in `zh.ts` ("跳到���后") and `en.ts` ("Scroll to bottom").

### 3.4 Automated Testing
- Unit tests in `tests/terminalScrollHelper.test.ts` verifying `isUserAtBottom` threshold and `shouldScrollToBottom`.
- Component / integration tests in `tests/terminalScrollLock.test.ts` verifying scroll event handling, unconditional timer removal, and floating button visibility.

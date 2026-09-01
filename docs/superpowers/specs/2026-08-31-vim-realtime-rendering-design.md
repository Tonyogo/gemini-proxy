# Web Terminal Real-Time Sync & Vim Rendering Optimization Design Spec

## 1. Problem Statement & Root Cause

When interacting with full-screen TUI applications like `vim`, `htop`, or `nano` in the Web Terminal:
- Keystrokes reach the backend PTY and are processed, but the UI appears unresponsive because the **PTY dimensions (`cols` and `rows`) are desynchronized from the client xterm.js viewport**.
- Vim draws its status line and active cursor line at the boundary defined by the backend PTY (e.g. Row 24), whereas the mobile frontend may have 35 rows. Without receiving a `TIOCSWINSZ` / `SIGWINCH` resize signal, vim does not redraw lines to match the actual mobile screen geometry.
- WebSocket chunks were processed without synchronous flush callbacks, causing visual lag during multi-byte ANSI cursor positioning sequences.

---

## 2. Architecture & Technical Solution

### 2.1 Full-Lifecycle Strict Resize Synchronization
- In `WebTerminalView.tsx`:
  - Hook `term.onResize(({ cols, rows }) => sendResize(cols, rows))`.
  - On `ws.onopen`, immediately calculate bounding geometry via `fitAddon.fit()` and dispatch `{ type: "resize", cols, rows }`.
  - When `window.visualViewport` or font size changes, `updateViewport()` immediately invokes `fitAddon.fit()` and updates PTY dimensions.
- In `terminalWs.ts` & `terminalService.ts`:
  - On receiving `{ type: "resize", cols, rows }`, invoke `pty.resize(cols, rows)` which triggers OS-level `ioctl(TIOCSWINSZ)` and dispatches `SIGWINCH` to foreground processes (`vim`), causing immediate full-screen viewport re-layout and cursor realignment.

### 2.2 Low-Latency Stream Ingestion & Flush
- In `WebTerminalView.tsx`:
  - Handle both text and `ArrayBuffer` data types.
  - Pass completion callback to `xterm.write(data, callback)` to ensure cursor position and screen buffer are painted with zero lag.

---

## 3. Testing & Verification

1. **Build & Type Check**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 25 test suites pass.
2. **Real-time Vim Verification**:
   - Open `vim test.txt` on mobile/desktop.
   - Verify every character entered in Insert mode (`i`) reflects on screen instantly with zero delay.
   - Verify bottom status line `-- INSERT --` and `:wq` display at the exact bottom row of the visible terminal viewport.

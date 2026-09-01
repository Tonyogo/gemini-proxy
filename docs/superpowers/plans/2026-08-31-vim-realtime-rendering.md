# Web Terminal Real-Time Sync & Vim Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure real-time, zero-latency visual rendering during interactive full-screen CLI programs (like `vim` and `htop`) by synchronizing exact PTY dimensions via `SIGWINCH` and eliminating stream buffering lag.

**Architecture:** Connect `term.onResize` to automatically send `{ type: "resize", cols, rows }` to the backend PTY, set `ws.binaryType = 'arraybuffer'`, and handle immediate xterm paint callbacks.

**Tech Stack:** React 18, `@xterm/xterm`, `node-pty`, `ws`, TypeScript.

## Global Constraints

- **Strict Resize Sync**: Initial handshake and any viewport adjustment must immediately update backend PTY dimensions (`ioctl(TIOCSWINSZ)` / `SIGWINCH`).
- **Low-Latency Decoding**: Process binary and text WebSocket payloads with immediate paint completion callback.
- **Strict TypeScript & Zero Build Errors**: `npm run build:frontend` and `npm run build:backend` must pass cleanly.

---

### Task 1: Update WebTerminalView with onResize Auto-Sync & Flush Callback

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Produces: Instant terminal resize dispatch via `term.onResize` and immediate write callbacks.

- [x] **Step 1: Update `WebTerminalView.tsx` resize and message listeners**

In `frontend/src/components/WebTerminalView.tsx`:
1. In `initWebSocket()`:
   - Set `ws.binaryType = 'arraybuffer'`.
   - In `ws.onmessage`:
```typescript
ws.onmessage = (event) => {
  const data = event.data;
  if (typeof data === 'string') {
    if (data.startsWith('{') && data.endsWith('}')) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'status' && parsed.event === 'exit') {
          xtermRef.current?.writeln('\r\n\x1b[33m[Process Completed]\x1b[0m\r\n');
          isProcessExitedRef.current = true;
          setIsConnected(false);
          clearReconnectTimers();
          return;
        }
      } catch {
        // Not json, write as raw text
      }
    }
    xtermRef.current?.write(data);
  } else if (data instanceof ArrayBuffer) {
    xtermRef.current?.write(new Uint8Array(data));
  }
};
```
2. In `useEffect` (xterm initialization):
```typescript
term.onResize(({ cols, rows }) => {
  sendResize(cols, rows);
});
```

- [x] **Step 2: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "fix(terminal): add onResize auto-sync and arraybuffer decoding for vim"
```

---

### Task 2: Full End-to-End Verification

**Files:**
- Run complete test suite and project build.

- [x] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: All 25 test suites pass.

- [x] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Zero build errors.

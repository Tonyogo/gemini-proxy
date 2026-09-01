# Code-Server Style Persistent Web Terminal Sessions Design Spec

## 1. Overview & Motivation

Currently, when a client disconnects from the Web Terminal WebSocket (due to mobile screen lock, background app switching, page refresh, or logging out), the backend immediately destroys the underlying `node-pty` shell process.

To match the professional ergonomics of **code-server** and **tmux**:
- The server must maintain a long-running, persistent default PTY session in memory.
- An in-memory **Ring Buffer** retains recent terminal output history.
- When any client disconnects, the shell process continues executing uninterrupted in the background.
- When the user reconnects or logs back in from any device, the server instantly replays the buffered screen history and re-attaches the live I/O stream.
- An explicit "Reset Session" button allows the user to cleanly kill the existing session and spawn a fresh shell.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile Web Client                        │
│                                                             │
│   [Re-attaches via WebSocket]                               │
│   1. Receives buffered history -> xterm.write(history)      │
│   2. Sends resize(cols, rows) -> PTY resizes & triggers     │
│   3. Resumes live interactive streaming                     │
└──────────────────────────────┬──────────────────────────────┘
                               │ WebSocket Connection
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Backend Persistent Terminal Manager             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Global Singleton: persistentTerminalManager           │  │
│  │                                                       │  │
│  │ ┌───────────────────────────────────────────────────┐ │  │
│  │ │ Output History Ring Buffer (Max ~1MB / 5000 lines)│ │  │
│  │ └───────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  │ Persistent node-pty Process (Bash/Zsh)                │  │
│  │ - Stays alive across client disconnects               │  │
│  │ - Continues executing background tasks / vim / top    │  │
│  │ - Only disposed on explicit {"type": "reset"} / exit  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Design

### 3.1 Backend `terminalSessionManager.ts`
- **`PersistentTerminalSession` class**:
  - Properties: `ptyProcess: pty.IPty`, `historyBuffer: string[]`, `totalBufferSize: number`, `connectedSocket: WebSocket | null`.
  - Max buffer capacity: `1,048,576` bytes (~1MB). Older chunks are shifted out when capacity is reached.
  - Methods:
    - `attach(ws: WebSocket)`: Flushes existing `historyBuffer` chunks to the new socket, hooks live data listener, and updates `connectedSocket`.
    - `detach(ws: WebSocket)`: Removes active socket listener, leaves PTY alive in background.
    - `write(data: string)`: Sends input data to PTY `stdin`.
    - `resize(cols: number, rows: number)`: Updates PTY dimensions.
    - `reset()`: Kills current PTY, resets `historyBuffer`, and spawns a new shell.

### 3.2 WebSocket Protocol Enhancements (`terminalWs.ts`)
- On connection open: Automatically attaches socket to the persistent terminal session and replays history buffer.
- On message:
  - If payload is `{"type": "reset"}`: Triggers `session.reset()`.
  - If payload is `{"type": "resize", cols, rows}`: Updates session dimensions.
- On close: Calls `session.detach(ws)`.

### 3.3 Frontend Reset Session Integration (`WebTerminalView.tsx`)
- Update the "Clear / Trash" button in the top bar:
  - Add explicit "Reset Session" button with confirmation or instant reset:
    - Sends `{"type": "reset"}` to server.
    - Clears xterm local buffer with `xterm.clear()`.

---

## 4. Testing & Verification

1. **Automated Integration Test (`tests/terminalPersistence.test.ts`)**:
   - Verify PTY stays alive after WebSocket client disconnect.
   - Verify connecting a second WebSocket receives the output history emitted during client 1's session.
   - Verify `{"type": "reset"}` cleans the buffer and restarts PTY.
2. **Build Verification**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 25 test suites pass.

# Mobile-First Web Terminal Design Specification

## 1. Overview & Goals

This specification details the architecture, UI/UX, and implementation design for a **mobile-first Web Terminal** integrated into the `gemini-proxy` console.

### Key Objectives
- **True Interactive Shell**: Spawn a native server-side pseudo-terminal (PTY) session via `node-pty` over WebSocket, providing full support for interactive TTY applications (`htop`, `vim`, `nano`, `tmux`, `top`).
- **Mobile Ergonomics**: Tailored for smartphones and tablets with a dynamic touch accessory bar (ESC, TAB, Ctrl, Alt, Arrow keys, modifiers), visual viewport auto-resizing preventing soft-keyboard clipping, font size zooming, and quick command snippet drawer.
- **Security & Lifecycle**: Authenticated via existing `ADMIN_SECRET_KEY` during WebSocket handshake, with automatic process cleanup on connection drops to avoid orphaned processes.
- **Seamless Navigation Integration**: Added as a distinct top-level tab (`Web Terminal`, shortcut `⌘6`) alongside existing Dashboard, Accounts, Logs, Terminal Logs (SSE stream), and Playground views.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile Web Client                        │
│                                                             │
│  ┌─────────────────────────┐   ┌─────────────────────────┐  │
│  │   Accessory Keys Bar    │   │  Quick Snippet Drawer   │  │
│  │   [ESC][TAB][Ctrl][...] │   │  [pm2 logs][git pull]   │  │
│  └────────────┬────────────┘   └────────────┬────────────┘  │
│               │                             │               │
│               ▼                             ▼               │
│     ┌──────────────────────────────────────────────┐        │
│     │     xterm.js Viewport (@xterm/xterm)         │        │
│     │   - FitAddon for dynamic col/row sizing      │        │
│     │   - visualViewport resize sync & keyboard lock│       │
│     └──────────────────────┬───────────────────────┘        │
└────────────────────────────┼────────────────────────────────┘
                             │ WebSocket Connection
                             │ (ws://host/api/admin/terminal/ws)
                             │ Auth: ?x-admin-key=...
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend Express Server                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   WebSocket Gateway (ws) + Admin Key Auth Validator   │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │   TerminalSessionManager                              │  │
│  │   - Spawns OS shell (/bin/bash, /bin/zsh, etc.)       │  │
│  │   - PTY Process I/O piping with node-pty              │  │
│  │   - Handles dynamic resize (cols, rows)               │  │
│  │   - Cleans up PTY process on socket close             │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │ Pseudo-TTY (stdin / stdout)    │
│                            ▼                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │       Host OS Local Shell Process (/bin/bash)         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Communication Protocol

### 3.1 Endpoint & Authentication
- **Path**: `/api/admin/terminal/ws`
- **Handshake Authentication**:
  - The client passes `x-admin-key` either as a query parameter `?x-admin-key=<KEY>` or in `Sec-WebSocket-Protocol`.
  - The server validates the key against `ADMIN_SECRET_KEY` (from `config.adminSecretKey`). If invalid, the connection is rejected with HTTP `401 Unauthorized`.

### 3.2 Message Framing
1. **Client -> Server**:
   - **Terminal Input**: Plain string or binary data (user typing, accessory key codes like `\x1b` for ESC, `\t` for TAB, `\x03` for Ctrl+C).
   - **Resize Control**: JSON payload `{"type": "resize", "cols": number, "rows": number}`.
   - **Ping / Keepalive**: JSON payload `{"type": "ping"}` (server responds with `{"type": "pong"}` or WebSocket native ping/pong frames).
2. **Server -> Client**:
   - **Terminal Output**: Raw ANSI string / binary chunks directly emitted from PTY `onData`, passed directly into `xterm.write(data)`.
   - **Status Updates**: JSON payload `{"type": "status", "event": "exit", "code": number}` when the shell process terminates.

---

## 4. Frontend Component Design

### 4.1 Packages & Addons
- `@xterm/xterm`: Modern terminal core renderer.
- `@xterm/addon-fit`: Auto-calculates optimal columns and rows based on container bounding box.
- `@xterm/addon-web-links`: Clickable URL detection in terminal output.

### 4.2 UI Structure & Touch Controls (`WebTerminalView.tsx`)
1. **Compact Top Bar (Toolbar)**:
   - Status badge (Connected / Disconnected / Reconnecting).
   - Font Size Zoom (`A-` / `A+`, range 9px to 22px, persisted in `localStorage`).
   - Snippet Toolbox Toggle (opens quick commands drawer).
   - Reconnect / Clear Screen / Fullscreen toggle buttons.
2. **Terminal Viewport**:
   - Monospace terminal with smooth touch scrolling and custom Linear-dark theme (`#090A0F` background).
   - `visualViewport` listener: Automatically recalculates height when on-screen keyboard appears or disappears, triggering `fitAddon.fit()` and sending a `resize` packet to the server.
3. **Mobile Touch Accessory Bar (`TerminalAccessoryBar.tsx`)**:
   - Horizontally scrollable touch toolbar docked above the virtual keyboard / bottom of the screen.
   - **Modifier / Special Keys**: `ESC`, `TAB`, `Ctrl` (sticky active state), `Alt`, `|`, `/`, `-`, `~`, `$`, `_`, `\`.
   - **One-Touch Combinations**: `Ctrl+C` (SIGINT), `Ctrl+D` (EOF), `Ctrl+L` (Clear Screen), `Ctrl+Z` (SIGTSTP).
   - **Arrow Navigation**: `▲`, `▼`, `◄`, `►` (ANSI escape sequences `\x1b[A`, `\x1b[B`, `\x1b[D`, `\x1b[C`).
   - **Keyboard Toggle**: Focus/blur trigger to quickly dismiss or open the virtual keyboard for screen viewing.
4. **Command Snippets Drawer (`TerminalSnippetsDrawer.tsx`)**:
   - Drawer slide-over with pre-configured maintenance scripts:
     - PM2 commands: `pm2 status`, `pm2 logs`, `npm run pm2:reload`, `npm run pm2:stop`
     - System monitoring: `htop`, `top`, `df -h`, `free -m`, `uptime`, `netstat -tuln`
     - Git ops: `git status`, `git log -n 5 --oneline`, `git pull`
   - Actions: "Insert" (paste into terminal) or "Execute" (paste + send `\r`).
   - Custom snippet creation and deletion saved to `localStorage`.

---

## 5. Backend Service Implementation

### 5.1 New Dependencies
- `node-pty`: Pseudo-terminal fork and spawn library.
- `ws`: High performance WebSocket server.
- `@types/ws`: TypeScript definitions.

### 5.2 Terminal Manager (`src/admin/services/terminalService.ts`)
- Spawns the system default shell:
  - Linux/macOS: `process.env.SHELL || '/bin/bash' || '/bin/sh'`
  - Windows: `powershell.exe || cmd.exe`
- Spawns in directory `process.cwd()`.
- Sets initial terminal size (e.g. `cols: 80, rows: 24`).
- Handles process lifecycle and cleans up on socket closure (SIGTERM -> SIGKILL fallback).

### 5.3 WebSocket Integration (`src/index.ts` & `src/admin/routes/terminalWs.ts`)
- Attaches to the main HTTP server on `/api/admin/terminal/ws`.
- Authenticates incoming upgrade requests with `adminAuth`.

---

## 6. Testing & Verification

1. **Unit & Integration Tests**:
   - WebSocket connection tests with valid and invalid `x-admin-key`.
   - PTY spawn, data transmission, resize handling, and termination cleanup tests.
2. **Build Verification**:
   - `npm run build:frontend` (clean Vite React compile).
   - `npm run build:backend` (clean TypeScript compile).
   - `npm test` (all Jest tests passing).
3. **Manual Mobile Verification**:
   - Test basic commands (`ls -la`, `echo`, `pwd`).
   - Test interactive full-screen TUI apps (`top`, `htop`, `vim`).
   - Test soft keyboard toggle, accessory bar touch triggers (`ESC`, `TAB`, `Ctrl+C`, `Arrows`), and snippet executions.

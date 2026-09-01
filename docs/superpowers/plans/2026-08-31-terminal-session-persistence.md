# Code-Server Style Persistent Web Terminal Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement server-side persistent PTY terminal sessions with an in-memory Ring Buffer for output replay on reconnect, matching the session persistence experience of code-server and tmux.

**Architecture:** Create a `PersistentTerminalSession` class inside `terminalService.ts` to manage long-running PTY lifecycle and in-memory history chunks. In `terminalWs.ts`, attach/detach incoming WebSockets without killing the PTY process on socket close, and replay accumulated history to re-attaching clients.

**Tech Stack:** Node.js, `node-pty`, `ws`, React 18, `@xterm/xterm`, TypeScript.

## Global Constraints

- **Persistent Singleton**: Backend maintains a long-running default PTY session in memory.
- **Ring Buffer Size**: Cap output history buffer at ~1MB (1,048,576 bytes) with automatic FIFO pruning.
- **Explicit Reset**: PTY process is only killed on receiving `{"type": "reset"}` from client or on shell process `exit`.
- **Strict TypeScript & Zero Build Errors**: `npm run build:backend` and `npm run build:frontend` must pass cleanly.

---

### Task 1: Implement Persistent Terminal Session Manager with Output Ring Buffer

**Files:**
- Modify: `src/admin/services/terminalService.ts`
- Test: `tests/terminalPersistence.test.ts`

**Interfaces:**
- Produces: `PersistentTerminalSession` and singleton getter `getDefaultTerminalSession()` in `src/admin/services/terminalService.ts`.

- [x] **Step 1: Write failing test for session persistence and replay**

Create `tests/terminalPersistence.test.ts`:
```typescript
import { getDefaultTerminalSession } from '../src/admin/services/terminalService';

describe('PersistentTerminalSession', () => {
  it('should maintain state and buffer output across attach/detach cycles', (done) => {
    const session = getDefaultTerminalSession();
    expect(session).toBeDefined();

    // Reset session to clean slate
    session.reset();

    session.write('echo "PERSISTENCE_TEST_RECORD"\r');

    setTimeout(() => {
      const history = session.getHistory();
      expect(history).toContain('PERSISTENCE_TEST_RECORD');

      // Replay check
      let replayedData = '';
      session.replayTo({
        send: (data: string) => {
          replayedData += data;
        },
      });

      expect(replayedData).toContain('PERSISTENCE_TEST_RECORD');
      done();
    }, 500);
  });

  it('should cleanly reset session and clear buffer on reset()', (done) => {
    const session = getDefaultTerminalSession();
    session.reset();
    expect(session.getHistory()).toBe('');
    done();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalPersistence.test.ts`
Expected: FAIL with `getDefaultTerminalSession` not found.

- [x] **Step 3: Implement PersistentTerminalSession in terminalService.ts**

Update `src/admin/services/terminalService.ts`:
```typescript
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as pty from 'node-pty';
import logger from '../../utils/logger';

export interface TerminalSessionOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

function ensureSpawnHelperPermissions(): void {
  if (os.platform() === 'win32') return;
  try {
    const candidateDirs = [
      path.resolve(__dirname, '../../../node_modules/node-pty/prebuilds'),
      path.resolve(__dirname, '../../../../node_modules/node-pty/prebuilds'),
      path.resolve(process.cwd(), 'node_modules/node-pty/prebuilds'),
    ];

    for (const prebuildsDir of candidateDirs) {
      if (fs.existsSync(prebuildsDir)) {
        const archDirs = fs.readdirSync(prebuildsDir);
        for (const arch of archDirs) {
          const helper = path.join(prebuildsDir, arch, 'spawn-helper');
          if (fs.existsSync(helper)) {
            const stat = fs.statSync(helper);
            if ((stat.mode & 0o111) === 0) {
              fs.chmodSync(helper, 0o755);
            }
          }
        }
      }
    }
  } catch {
    // Silently continue
  }
}

export function getDefaultShell(): string {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function spawnTerminalSession(options: TerminalSessionOptions = {}): pty.IPty {
  ensureSpawnHelperPermissions();

  const shell = getDefaultShell();
  const cols = options.cols || 80;
  const rows = options.rows || 24;
  const cwd = options.cwd || process.cwd();

  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...options.env,
  } as { [key: string]: string };

  logger.info(`Spawning PTY shell: ${shell} (${cols}x${rows}) in ${cwd}`);

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env,
  });

  return ptyProcess;
}

export class PersistentTerminalSession {
  private ptyProcess: pty.IPty | null = null;
  private historyBuffer: string[] = [];
  private totalBufferSize: number = 0;
  private maxBufferSize: number = 1024 * 1024; // 1MB
  private activeSockets: Set<any> = new Set();
  private cols: number = 80;
  private rows: number = 24;

  constructor() {
    this.ensureProcess();
  }

  private ensureProcess(): void {
    if (this.ptyProcess) return;

    try {
      this.ptyProcess = spawnTerminalSession({ cols: this.cols, rows: this.rows });

      this.ptyProcess.onData((data: string) => {
        this.appendHistory(data);
        for (const ws of this.activeSockets) {
          try {
            if (ws.readyState === 1) { // WebSocket.OPEN
              ws.send(data);
            }
          } catch {
            // Ignore socket write errors
          }
        }
      });

      this.ptyProcess.onExit((exitCode: { exitCode: number; signal?: number }) => {
        logger.info(`[PersistentTerminal] Shell process exited with code ${exitCode.exitCode}`);
        for (const ws of this.activeSockets) {
          try {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'status', event: 'exit', code: exitCode.exitCode }));
            }
          } catch {
            // Ignore
          }
        }
        this.ptyProcess = null;
        this.historyBuffer = [];
        this.totalBufferSize = 0;
      });
    } catch (err: any) {
      logger.error(`[PersistentTerminal] Failed to spawn PTY: ${err.message}`);
    }
  }

  private appendHistory(data: string): void {
    this.historyBuffer.push(data);
    this.totalBufferSize += data.length;

    while (this.totalBufferSize > this.maxBufferSize && this.historyBuffer.length > 0) {
      const removed = this.historyBuffer.shift();
      if (removed) {
        this.totalBufferSize -= removed.length;
      }
    }
  }

  public attach(ws: any): void {
    this.ensureProcess();
    this.activeSockets.add(ws);

    // Replay buffer to newly attached socket
    if (this.historyBuffer.length > 0 && ws.readyState === 1) {
      const combinedHistory = this.historyBuffer.join('');
      ws.send(combinedHistory);
    }
  }

  public detach(ws: any): void {
    this.activeSockets.delete(ws);
  }

  public write(data: string): void {
    this.ensureProcess();
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  public resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
      } catch (err: any) {
        logger.warn(`[PersistentTerminal] Resize failed: ${err.message}`);
      }
    }
  }

  public reset(): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch {
        // Ignore kill error
      }
      this.ptyProcess = null;
    }
    this.historyBuffer = [];
    this.totalBufferSize = 0;
    this.ensureProcess();
  }

  public getHistory(): string {
    return this.historyBuffer.join('');
  }

  public replayTo(target: { send: (data: string) => void }): void {
    if (this.historyBuffer.length > 0) {
      target.send(this.historyBuffer.join(''));
    }
  }
}

let defaultSessionInstance: PersistentTerminalSession | null = null;

export function getDefaultTerminalSession(): PersistentTerminalSession {
  if (!defaultSessionInstance) {
    defaultSessionInstance = new PersistentTerminalSession();
  }
  return defaultSessionInstance;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalPersistence.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/admin/services/terminalService.ts tests/terminalPersistence.test.ts
git commit -m "feat(terminal): add PersistentTerminalSession manager with output ring buffer"
```

---

### Task 2: Update WebSocket Gateway & Frontend Reset Integration

**Files:**
- Modify: `src/admin/routes/terminalWs.ts`
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`

**Interfaces:**
- Consumes: `getDefaultTerminalSession()` in `src/admin/routes/terminalWs.ts`.
- Produces: Persistent connection lifecycle with `{"type": "reset"}` action handling and frontend reset button.

- [x] **Step 1: Update `terminalWs.ts` to use PersistentTerminalSession**

Update `src/admin/routes/terminalWs.ts`:
```typescript
import http from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import config from '../../../config/default';
import logger from '../../utils/logger';
import { getDefaultTerminalSession } from '../services/terminalService';

export function setupTerminalWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = req.url || '';
    if (!reqUrl.startsWith('/api/admin/terminal/ws')) {
      return;
    }

    const secretKey = config.adminSecretKey;
    if (secretKey) {
      const parsedUrl = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
      const providedKey =
        req.headers['x-admin-key'] ||
        parsedUrl.searchParams.get('x-admin-key') ||
        parsedUrl.searchParams.get('key');

      if (providedKey !== secretKey) {
        logger.warn(`[TerminalWS] Unauthorized WebSocket connection attempt rejected`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    logger.info(`[TerminalWS] Interactive terminal client attached to session`);
    const session = getDefaultTerminalSession();

    session.attach(ws);

    ws.on('message', (message: RawData) => {
      try {
        const msgStr = message.toString();
        if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
          const control = JSON.parse(msgStr);
          if (
            control.type === 'resize' &&
            typeof control.cols === 'number' &&
            !Number.isNaN(control.cols) &&
            typeof control.rows === 'number' &&
            !Number.isNaN(control.rows)
          ) {
            const cols = Math.max(10, Math.min(500, Math.floor(control.cols)));
            const rows = Math.max(5, Math.min(200, Math.floor(control.rows)));
            session.resize(cols, rows);
            return;
          }
          if (control.type === 'reset') {
            logger.info(`[TerminalWS] Reset session requested by client`);
            session.reset();
            return;
          }
          if (control.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
        }

        session.write(msgStr);
      } catch {
        session.write(message.toString());
      }
    });

    ws.on('close', () => {
      logger.info(`[TerminalWS] Client detached. Session remains active in background.`);
      session.detach(ws);
    });

    ws.on('error', (err) => {
      logger.error(`[TerminalWS] WebSocket error: ${err.message}`);
      session.detach(ws);
    });
  });

  return wss;
}
```

- [x] **Step 2: Update frontend translation keys and WebTerminalView reset session button**

In `frontend/src/i18n/locales/en.ts`:
Add to `webTerminal`:
```typescript
    resetSession: "Reset Session",
    resetConfirm: "Are you sure you want to restart the terminal session? All active background tasks in this shell will be terminated.",
```

In `frontend/src/i18n/locales/zh.ts`:
Add to `webTerminal`:
```typescript
    resetSession: "重置会话",
    resetConfirm: "确定要重启终端会话吗？当前 Shell 中运行的后台任务将会被终止。",
```

In `frontend/src/components/WebTerminalView.tsx`:
Add `handleResetSession`:
```typescript
  const handleResetSession = () => {
    if (window.confirm(t('webTerminal.resetConfirm'))) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'reset' }));
      }
      xtermRef.current?.clear();
    }
  };
```
Bind `handleResetSession` to the Trash2 icon button with title `t('webTerminal.resetSession')`.

- [x] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add src/admin/routes/terminalWs.ts frontend/src/components/WebTerminalView.tsx frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(terminal): integrate persistent session re-attach and explicit reset action"
```

---

### Task 3: Full End-to-End Verification

**Files:**
- Run complete test suite and production build.

- [x] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: All 25 test suites pass.

- [x] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Zero build errors.

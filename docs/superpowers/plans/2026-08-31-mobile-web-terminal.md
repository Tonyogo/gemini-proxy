# Mobile-First Web Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fully interactive, mobile-first Web Terminal powered by `xterm.js` and `node-pty` over WebSocket with touch accessories, snippet toolbox, and keyboard-aware viewport adaptation.

**Architecture:** A native PTY child process is spawned and managed per WebSocket connection using `node-pty` and `ws` in the Node.js backend. In the React frontend, `@xterm/xterm` renders the terminal with `@xterm/addon-fit` while a mobile accessory bar and viewport manager handle mobile ergonomics.

**Tech Stack:** Node.js, Express, `ws`, `node-pty`, React 18, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, Tailwind CSS, TypeScript.

## Global Constraints

- **Backend Dependencies**: `node-pty` and `ws` (plus `@types/ws`) in root `package.json`.
- **Frontend Dependencies**: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` in `frontend/package.json`.
- **Authentication**: Validates `x-admin-key` during WebSocket upgrade against `config.adminSecretKey`.
- **Navigation**: Web Terminal registered as a top-level tab (`webTerminal`, shortcut `⌘6`) in `App.tsx` and i18n dictionaries.
- **Strict TypeScript & Zero Build Errors**: Both `npm run build:backend` and `npm run build:frontend` must pass with zero errors.

---

### Task 1: Backend Dependencies and Terminal Service (node-pty integration)

**Files:**
- Modify: `package.json`
- Create: `src/admin/services/terminalService.ts`
- Test: `tests/terminalService.test.ts`

**Interfaces:**
- Produces: `TerminalSession` class and helper methods `spawnTerminal(cols, rows): IPtySession` in `src/admin/services/terminalService.ts`.

- [x] **Step 1: Install backend dependencies**

Run:
```bash
npm install ws node-pty
npm install --save-dev @types/ws
```

- [x] **Step 2: Write failing test for terminalService**

Create `tests/terminalService.test.ts`:
```typescript
import { spawnTerminalSession } from '../src/admin/services/terminalService';

describe('terminalService', () => {
  it('should spawn a terminal session and receive initial data or exit code', (done) => {
    const session = spawnTerminalSession({ cols: 80, rows: 24 });
    expect(session).toBeDefined();
    expect(typeof session.pid).toBe('number');

    let receivedData = false;
    session.onData((data: string) => {
      receivedData = true;
      expect(typeof data).toBe('string');
      session.kill();
      done();
    });

    session.write('echo "hello terminal"\r');
  }, 10000);
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx jest tests/terminalService.test.ts`
Expected: FAIL with module/function not found.

- [x] **Step 4: Implement terminalService**

Create `src/admin/services/terminalService.ts`:
```typescript
import * as os from 'os';
import * as pty from 'node-pty';
import logger from '../../utils/logger';

export interface TerminalSessionOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export function getDefaultShell(): string {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function spawnTerminalSession(options: TerminalSessionOptions = {}): pty.IPty {
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
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx jest tests/terminalService.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json src/admin/services/terminalService.ts tests/terminalService.test.ts
git commit -m "feat(terminal): add node-pty terminal service and shell spawner"
```

---

### Task 2: Backend WebSocket Server & Authentication Gateway

**Files:**
- Create: `src/admin/routes/terminalWs.ts`
- Modify: `src/index.ts`
- Test: `tests/terminalWs.test.ts`

**Interfaces:**
- Consumes: `spawnTerminalSession` from `src/admin/services/terminalService.ts`, `config.adminSecretKey` from `config/default.ts`.
- Produces: `setupTerminalWebSocket(server: http.Server)` in `src/admin/routes/terminalWs.ts`.

- [x] **Step 1: Write integration tests for Terminal WebSocket Gateway**

Create `tests/terminalWs.test.ts`:
```typescript
import http from 'http';
import WebSocket from 'ws';
import express from 'express';
import { setupTerminalWebSocket } from '../src/admin/routes/terminalWs';
import config from '../config/default';

describe('Terminal WebSocket Gateway', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = express();
    server = http.createServer(app);
    setupTerminalWebSocket(server);
    server.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should reject connection when admin secret key is set but invalid', (done) => {
    const originalKey = config.adminSecretKey;
    config.adminSecretKey = 'test-secret-key-123';

    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/admin/terminal/ws?x-admin-key=wrong-key`);

    ws.on('error', () => {
      // Expected error on 401 rejection
    });

    ws.on('close', (code) => {
      expect(code).toBe(1008); // Policy Violation or handshake rejection
      config.adminSecretKey = originalKey;
      done();
    });
  });

  it('should connect and echo terminal output when admin key is valid', (done) => {
    const originalKey = config.adminSecretKey;
    config.adminSecretKey = 'valid-key';

    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/admin/terminal/ws?x-admin-key=valid-key`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
      ws.send('echo "WS_TEST_OK"\r');
    });

    ws.on('message', (msg) => {
      const text = msg.toString();
      if (text.includes('WS_TEST_OK')) {
        ws.close();
        config.adminSecretKey = originalKey;
        done();
      }
    });
  }, 10000);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalWs.test.ts`
Expected: FAIL with module not found.

- [x] **Step 3: Implement setupTerminalWebSocket**

Create `src/admin/routes/terminalWs.ts`:
```typescript
import http from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import config from '../../config/default';
import logger from '../../utils/logger';
import { spawnTerminalSession } from '../services/terminalService';

export function setupTerminalWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = req.url || '';
    if (!reqUrl.startsWith('/api/admin/terminal/ws')) {
      return;
    }

    // Validate Admin Key
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
    logger.info(`[TerminalWS] New interactive terminal client connected`);

    let ptySession: any = null;

    try {
      ptySession = spawnTerminalSession({ cols: 80, rows: 24 });
    } catch (err: any) {
      logger.error(`[TerminalWS] Failed to spawn PTY: ${err.message}`);
      ws.send(JSON.stringify({ type: 'status', event: 'error', message: err.message }));
      ws.close(1011, 'PTY Spawn Failed');
      return;
    }

    // Pipe PTY output to WebSocket client
    const ptyDataListener = ptySession.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    ptySession.onExit((exitCode: { exitCode: number; signal?: number }) => {
      logger.info(`[TerminalWS] PTY process exited with code ${exitCode.exitCode}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'status', event: 'exit', code: exitCode.exitCode }));
        ws.close(1000, 'Process Exited');
      }
    });

    // Handle incoming client messages (input, resize, ping)
    ws.on('message', (message: WebSocket.RawData) => {
      try {
        const msgStr = message.toString();
        // Check if message is JSON control frame
        if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
          const control = JSON.parse(msgStr);
          if (control.type === 'resize' && typeof control.cols === 'number' && typeof control.rows === 'number') {
            const cols = Math.max(10, Math.min(500, control.cols));
            const rows = Math.max(5, Math.min(200, control.rows));
            ptySession.resize(cols, rows);
            return;
          }
          if (control.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
        }

        // Otherwise treat as standard terminal input
        ptySession.write(msgStr);
      } catch {
        // Raw input write
        ptySession.write(message.toString());
      }
    });

    // Clean up PTY on WebSocket disconnect
    ws.on('close', () => {
      logger.info(`[TerminalWS] Client disconnected. Disposing PTY process...`);
      try {
        if (ptyDataListener && typeof ptyDataListener.dispose === 'function') {
          ptyDataListener.dispose();
        }
        if (ptySession) {
          ptySession.kill();
        }
      } catch (err: any) {
        logger.warn(`[TerminalWS] Error disposing PTY: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`[TerminalWS] WebSocket error: ${err.message}`);
    });
  });

  return wss;
}
```

- [x] **Step 4: Update `src/index.ts` to attach terminal WebSocket**

Modify `src/index.ts`:
```typescript
import http from 'http';
import app from './app';
import config from '../config/default';
import logger from './utils/logger';
import metricsService from './admin/services/metricsService';
import { setupTerminalWebSocket } from './admin/routes/terminalWs';

const server = http.createServer(app);
setupTerminalWebSocket(server);

metricsService.init().then(() => {
  server.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port}`);
    logger.info(`Proxying upstream requests to Gemini: ${config.geminiBaseUrl}`);
  });
});
```

- [x] **Step 5: Run tests and verify**

Run: `npx jest tests/terminalWs.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/admin/routes/terminalWs.ts src/index.ts tests/terminalWs.test.ts
git commit -m "feat(terminal): add WebSocket gateway for interactive PTY sessions"
```

---

### Task 3: Frontend Dependencies and i18n Locales

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`

**Interfaces:**
- Produces: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` in frontend dependencies and `nav.webTerminal` + `webTerminal.*` translation keys.

- [x] **Step 1: Install frontend xterm packages**

Run:
```bash
cd frontend && npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links && cd ..
```

- [x] **Step 2: Add translation keys to `frontend/src/i18n/locales/en.ts` and `zh.ts`**

Update `frontend/src/i18n/locales/en.ts`:
Add to `nav`:
```typescript
    webTerminal: "Web Terminal",
```
Add to export:
```typescript
  webTerminal: {
    title: "Interactive Web Terminal",
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting...",
    reconnect: "Reconnect",
    clear: "Clear",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit Fullscreen",
    fontSize: "Font Size",
    snippets: "Snippets",
    snippetsTitle: "Quick Command Snippets",
    snippetsDesc: "Tap to insert into terminal or execute directly.",
    insert: "Insert",
    run: "Run",
    addSnippet: "Add Snippet",
    snippetName: "Name",
    snippetCommand: "Command",
    saveSnippet: "Save",
    deleteSnippet: "Delete",
    noSnippets: "No snippets found.",
    accessoryKeys: {
      esc: "ESC",
      tab: "TAB",
      ctrl: "CTRL",
      alt: "ALT",
      ctrlC: "^C",
      ctrlD: "^D",
      ctrlL: "^L",
      ctrlZ: "^Z"
    }
  },
```

Update `frontend/src/i18n/locales/zh.ts`:
Add to `nav`:
```typescript
    webTerminal: "网页终端",
```
Add to export:
```typescript
  webTerminal: {
    title: "交互式网页终端",
    connected: "已连接",
    disconnected: "已断开",
    connecting: "连接中...",
    reconnect: "重新连接",
    clear: "清屏",
    fullscreen: "全屏",
    exitFullscreen: "退出全屏",
    fontSize: "字号",
    snippets: "快捷命令",
    snippetsTitle: "运维快捷命令库",
    snippetsDesc: "点击直接填入终端或直接执行。",
    insert: "填入",
    run: "执行",
    addSnippet: "添加快捷命令",
    snippetName: "名称",
    snippetCommand: "命令内容",
    saveSnippet: "保存",
    deleteSnippet: "删除",
    noSnippets: "暂无自定义命令",
    accessoryKeys: {
      esc: "ESC",
      tab: "TAB",
      ctrl: "CTRL",
      alt: "ALT",
      ctrlC: "^C",
      ctrlD: "^D",
      ctrlL: "^L",
      ctrlZ: "^Z"
    }
  },
```

- [x] **Step 3: Verify frontend typecheck**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add xterm.js dependencies and web terminal translations"
```

---

### Task 4: Mobile Touch Accessory Bar and Snippets Drawer Components

**Files:**
- Create: `frontend/src/components/terminal/TerminalAccessoryBar.tsx`
- Create: `frontend/src/components/terminal/TerminalSnippetsDrawer.tsx`

**Interfaces:**
- `TerminalAccessoryBar`: Props `{ onSendInput: (data: string) => void; isCtrlActive: boolean; onToggleCtrl: () => void; isAltActive: boolean; onToggleAlt: () => void; onToggleKeyboard: () => void; }`
- `TerminalSnippetsDrawer`: Props `{ isOpen: boolean; onClose: () => void; onRunCommand: (cmd: string, execute: boolean) => void; }`

- [x] **Step 1: Implement `TerminalAccessoryBar.tsx`**

Create `frontend/src/components/terminal/TerminalAccessoryBar.tsx`:
```tsx
import React from 'react';
import {
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Keyboard,
  Sparkles
} from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

interface TerminalAccessoryBarProps {
  onSendInput: (data: string) => void;
  isCtrlActive: boolean;
  onToggleCtrl: () => void;
  isAltActive: boolean;
  onToggleAlt: () => void;
  onToggleKeyboard: () => void;
  onOpenSnippets: () => void;
}

export const TerminalAccessoryBar: React.FC<TerminalAccessoryBarProps> = ({
  onSendInput,
  isCtrlActive,
  onToggleCtrl,
  isAltActive,
  onToggleAlt,
  onToggleKeyboard,
  onOpenSnippets,
}) => {
  const { t } = useTranslation();

  const handleKeyClick = (key: string, rawCode: string) => {
    if (isCtrlActive) {
      onToggleCtrl();
      // Handle Ctrl + key
      const charCode = key.toUpperCase().charCodeAt(0);
      if (charCode >= 64 && charCode <= 95) {
        onSendInput(String.fromCharCode(charCode - 64));
        return;
      }
    }
    if (isAltActive) {
      onToggleAlt();
      onSendInput(`\x1b${key}`);
      return;
    }
    onSendInput(rawCode);
  };

  return (
    <div className="bg-[#0C0E14] border-t border-white/[0.08] px-2 py-1.5 flex items-center justify-between gap-1 select-none overflow-x-auto scrollbar-none z-20">
      {/* Scrollable Accessory Key Row */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
        {/* Modifier: ESC */}
        <button
          type="button"
          onClick={() => onSendInput('\x1b')}
          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 hover:text-white font-mono text-xs font-semibold border border-white/[0.08] transition-all shadow-sm"
        >
          {t('webTerminal.accessoryKeys.esc')}
        </button>

        {/* Modifier: TAB */}
        <button
          type="button"
          onClick={() => onSendInput('\t')}
          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 hover:text-white font-mono text-xs font-semibold border border-white/[0.08] transition-all shadow-sm"
        >
          {t('webTerminal.accessoryKeys.tab')}
        </button>

        {/* Sticky Modifier: CTRL */}
        <button
          type="button"
          onClick={onToggleCtrl}
          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all shadow-sm active:scale-95 ${
            isCtrlActive
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
              : 'bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white border-white/[0.08]'
          }`}
        >
          {t('webTerminal.accessoryKeys.ctrl')}
        </button>

        {/* Sticky Modifier: ALT */}
        <button
          type="button"
          onClick={onToggleAlt}
          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all shadow-sm active:scale-95 ${
            isAltActive
              ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
              : 'bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white border-white/[0.08]'
          }`}
        >
          {t('webTerminal.accessoryKeys.alt')}
        </button>

        {/* Action: Ctrl+C */}
        <button
          type="button"
          onClick={() => onSendInput('\x03')}
          className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 font-mono text-xs font-semibold border border-rose-500/30 transition-all"
          title="SIGINT (Ctrl+C)"
        >
          ^C
        </button>

        {/* Action: Ctrl+D */}
        <button
          type="button"
          onClick={() => onSendInput('\x04')}
          className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-400 font-mono text-xs font-semibold border border-amber-500/30 transition-all"
          title="EOF (Ctrl+D)"
        >
          ^D
        </button>

        {/* Action: Ctrl+L */}
        <button
          type="button"
          onClick={() => onSendInput('\x0c')}
          className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 font-mono text-xs font-semibold border border-white/[0.08] transition-all"
          title="Clear Screen (Ctrl+L)"
        >
          ^L
        </button>

        {/* Quick Characters: |, /, -, ~, $, \\ */}
        {['|', '/', '-', '~', '$', '\\'].map((char) => (
          <button
            key={char}
            type="button"
            onClick={() => handleKeyClick(char, char)}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] active:scale-95 text-slate-300 font-mono text-xs flex items-center justify-center border border-white/[0.06] transition-all"
          >
            {char}
          </button>
        ))}

        {/* Arrow Keys: Up, Down, Left, Right */}
        <button
          type="button"
          onClick={() => onSendInput('\x1b[A')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Up Arrow"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onSendInput('\x1b[B')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Down Arrow"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onSendInput('\x1b[D')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Left Arrow"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onSendInput('\x1b[C')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Right Arrow"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right Fixed Controls: Snippets & Keyboard Toggle */}
      <div className="flex items-center space-x-1 pl-1 border-l border-white/[0.08] shrink-0">
        <button
          type="button"
          onClick={onOpenSnippets}
          className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1 text-xs font-medium transition-all shadow-sm active:scale-95"
          title={t('webTerminal.snippets')}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">{t('webTerminal.snippets')}</span>
        </button>

        <button
          type="button"
          onClick={onToggleKeyboard}
          className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 border border-white/[0.08] transition-all active:scale-95"
          title="Toggle Keyboard Focus"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
```

- [x] **Step 2: Implement `TerminalSnippetsDrawer.tsx`**

Create `frontend/src/components/terminal/TerminalSnippetsDrawer.tsx`:
```tsx
import React, { useState, useEffect } from 'react';
import { X, Play, Copy, Plus, Trash2, Terminal as TerminalIcon } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

export interface CommandSnippet {
  id: string;
  name: string;
  command: string;
  category: 'pm2' | 'system' | 'git' | 'custom';
}

const DEFAULT_SNIPPETS: CommandSnippet[] = [
  { id: '1', name: 'PM2 Status', command: 'pm2 status', category: 'pm2' },
  { id: '2', name: 'PM2 Logs', command: 'pm2 logs --lines 50', category: 'pm2' },
  { id: '3', name: 'PM2 Reload', command: 'npm run pm2:reload', category: 'pm2' },
  { id: '4', name: 'System Info (top)', command: 'top -b -n 1 | head -n 20', category: 'system' },
  { id: '5', name: 'Disk Usage', command: 'df -h', category: 'system' },
  { id: '6', name: 'Memory Free', command: 'free -m', category: 'system' },
  { id: '7', name: 'Git Status', command: 'git status', category: 'git' },
  { id: '8', name: 'Git Recent Log', command: 'git log -n 5 --oneline', category: 'git' },
];

interface TerminalSnippetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (cmd: string, execute: boolean) => void;
}

export const TerminalSnippetsDrawer: React.FC<TerminalSnippetsDrawerProps> = ({
  isOpen,
  onClose,
  onRunCommand,
}) => {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<CommandSnippet[]>(() => {
    const saved = localStorage.getItem('terminal_custom_snippets');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_SNIPPETS;
      }
    }
    return DEFAULT_SNIPPETS;
  });

  const [newName, setNewName] = useState('');
  const [newCmd, setNewCmd] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem('terminal_custom_snippets', JSON.stringify(snippets));
  }, [snippets]);

  if (!isOpen) return null;

  const handleAddSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCmd.trim()) return;

    const newEntry: CommandSnippet = {
      id: Date.now().toString(),
      name: newName.trim(),
      command: newCmd.trim(),
      category: 'custom',
    };

    setSnippets((prev) => [...prev, newEntry]);
    setNewName('');
    setNewCmd('');
    setIsAdding(false);
  };

  const handleDeleteSnippet = (id: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-[#0C0E14] border-l border-white/[0.08] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0F1118]">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-100">{t('webTerminal.snippetsTitle')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Snippet List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <p className="text-xs text-slate-400 mb-2">{t('webTerminal.snippetsDesc')}</p>

          {snippets.map((item) => (
            <div
              key={item.id}
              className="bg-[#141622] border border-white/[0.06] rounded-xl p-3 flex flex-col space-y-2 hover:border-white/[0.12] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">{item.name}</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      onRunCommand(item.command, false);
                      onClose();
                    }}
                    className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-slate-300 flex items-center space-x-1"
                    title={t('webTerminal.insert')}
                  >
                    <Copy className="w-3 h-3" />
                    <span>{t('webTerminal.insert')}</span>
                  </button>
                  <button
                    onClick={() => {
                      onRunCommand(item.command, true);
                      onClose();
                    }}
                    className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-[11px] text-indigo-300 font-medium flex items-center space-x-1"
                    title={t('webTerminal.run')}
                  >
                    <Play className="w-3 h-3 text-indigo-400" />
                    <span>{t('webTerminal.run')}</span>
                  </button>
                  {item.category === 'custom' && (
                    <button
                      onClick={() => handleDeleteSnippet(item.id)}
                      className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <code className="text-[11px] font-mono text-cyan-300/80 bg-black/40 px-2 py-1 rounded border border-white/[0.04] break-all">
                {item.command}
              </code>
            </div>
          ))}

          {/* Add custom snippet form */}
          {isAdding ? (
            <form onSubmit={handleAddSnippet} className="bg-[#141622] border border-indigo-500/30 rounded-xl p-3 space-y-2">
              <input
                type="text"
                placeholder={t('webTerminal.snippetName')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-black/40 border border-white/[0.08] text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <input
                type="text"
                placeholder={t('webTerminal.snippetCommand')}
                value={newCmd}
                onChange={(e) => setNewCmd(e.target.value)}
                className="w-full bg-black/40 border border-white/[0.08] text-xs font-mono text-cyan-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white rounded-lg"
                >
                  {t('webTerminal.saveSnippet')}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2 border border-dashed border-white/[0.1] hover:border-white/[0.2] rounded-xl text-xs text-slate-400 hover:text-white flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('webTerminal.addSnippet')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [x] **Step 3: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/terminal/TerminalAccessoryBar.tsx frontend/src/components/terminal/TerminalSnippetsDrawer.tsx
git commit -m "feat(terminal): add mobile accessory bar and snippet drawer components"
```

---

### Task 5: Interactive WebTerminalView and Viewport Adaptation

**Files:**
- Create: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: `WebTerminalView` component with `@xterm/xterm`, `FitAddon`, `WebLinksAddon`, `visualViewport` dynamic resize sync, font zoom, and reconnect mechanism.

- [x] **Step 1: Implement `WebTerminalView.tsx`**

Create `frontend/src/components/WebTerminalView.tsx`:
```tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  Terminal as TerminalIcon,
  RefreshCw,
  Trash2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { TerminalAccessoryBar } from './terminal/TerminalAccessoryBar';
import { TerminalSnippetsDrawer } from './terminal/TerminalSnippetsDrawer';

interface WebTerminalViewProps {
  adminKey: string;
}

export default function WebTerminalView({ adminKey }: WebTerminalViewProps) {
  const { t } = useTranslation();
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSnippetsOpen, setIsSnippetsOpen] = useState<boolean>(false);
  const [isCtrlActive, setIsCtrlActive] = useState<boolean>(false);
  const [isAltActive, setIsAltActive] = useState<boolean>(false);

  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('terminal_font_size');
    return saved ? parseInt(saved, 10) : 13;
  });

  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);

  const initWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsConnecting(true);
    setIsConnected(false);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/admin/terminal/ws?x-admin-key=${encodeURIComponent(adminKey)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      setIsConnected(true);
      if (xtermRef.current && fitAddonRef.current) {
        fitAddonRef.current.fit();
        sendResize(xtermRef.current.cols, xtermRef.current.rows);
      }
    };

    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.startsWith('{') && data.endsWith('}')) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'status' && parsed.event === 'exit') {
              xtermRef.current?.writeln('\r\n\x1b[33m[Process Completed]\x1b[0m\r\n');
              setIsConnected(false);
              return;
            }
          } catch {
            // Not json, print as raw text
          }
        }
        xtermRef.current?.write(data);
      }
    };

    ws.onclose = () => {
      setIsConnecting(false);
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnecting(false);
      setIsConnected(false);
    };
  }, [adminKey, sendResize]);

  // Initialize xterm instance
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
        background: '#090A0F',
        foreground: '#F1F5F9',
        cursor: '#818CF8',
        cursorAccent: '#090A0F',
        selectionBackground: 'rgba(99, 102, 241, 0.4)',
        black: '#090A0F',
        red: '#F43F5E',
        green: '#10B981',
        yellow: '#F59E0B',
        blue: '#6366F1',
        magenta: '#D946EF',
        cyan: '#06B6D4',
        white: '#F8FAFC',
        brightBlack: '#475569',
        brightRed: '#FB7185',
        brightGreen: '#34D399',
        brightYellow: '#FBBF24',
        brightBlue: '#818CF8',
        brightMagenta: '#E879F9',
        brightCyan: '#22D3EE',
        brightWhite: '#FFFFFF',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalContainerRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    setTimeout(() => {
      fitAddon.fit();
    }, 50);

    initWebSocket();

    // Resize observer
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        sendResize(xtermRef.current.cols, xtermRef.current.rows);
      }
    };

    window.addEventListener('resize', handleResize);

    // visualViewport support for mobile soft keyboards
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, []);

  // Sync font size change
  useEffect(() => {
    if (xtermRef.current && fitAddonRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      localStorage.setItem('terminal_font_size', fontSize.toString());
      fitAddonRef.current.fit();
      sendResize(xtermRef.current.cols, xtermRef.current.rows);
    }
  }, [fontSize, sendResize]);

  const handleSendInput = (data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
    xtermRef.current?.focus();
  };

  const handleRunCommand = (cmd: string, execute: boolean) => {
    const textToSend = execute ? `${cmd}\r` : cmd;
    handleSendInput(textToSend);
  };

  const handleToggleKeyboard = () => {
    if (xtermRef.current) {
      xtermRef.current.focus();
    }
  };

  return (
    <div
      className={`mx-auto flex flex-col bg-[#07090E] border border-white/[0.08] overflow-hidden shadow-2xl font-mono text-xs transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none h-screen w-screen'
          : 'max-w-7xl h-[calc(100vh-140px)] min-h-[500px] rounded-2xl'
      }`}
    >
      {/* Top Window Bar */}
      <div className="bg-[#0C0E14] border-b border-white/[0.08] px-3 sm:px-4 py-2 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          {/* macOS action dots */}
          <div className="flex items-center space-x-1.5 mr-1">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/90 border border-[#DC2626]/60 shadow-[0_0_6px_rgba(239,68,68,0.3)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/90 border border-[#D97706]/60 shadow-[0_0_6px_rgba(245,158,11,0.3)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]/90 border border-[#059669]/60 shadow-[0_0_6px_rgba(16,185,129,0.3)]" />
          </div>

          <div className="flex items-center space-x-1.5 text-slate-200">
            <TerminalIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-semibold text-slate-200 text-xs hidden sm:inline">
              {t('webTerminal.title')}
            </span>
          </div>

          {/* Connection Status Badge */}
          <div
            className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : isConnecting
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : isConnecting ? 'bg-amber-400 animate-ping' : 'bg-rose-400'
              }`}
            />
            <span>
              {isConnected
                ? t('webTerminal.connected')
                : isConnecting
                ? t('webTerminal.connecting')
                : t('webTerminal.disconnected')}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 sm:space-x-1.5">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => setFontSize((prev) => Math.max(9, prev - 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={() => setFontSize((prev) => Math.min(22, prev + 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Reconnect */}
          <button
            type="button"
            onClick={initWebSocket}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title={t('webTerminal.reconnect')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Clear screen */}
          <button
            type="button"
            onClick={() => xtermRef.current?.clear()}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title={t('webTerminal.clear')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title={isFullscreen ? t('webTerminal.exitFullscreen') : t('webTerminal.fullscreen')}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-indigo-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* xterm.js Canvas Container */}
      <div className="flex-1 p-2 bg-[#090A0F] overflow-hidden min-h-0 relative">
        <div ref={terminalContainerRef} className="h-full w-full" />
      </div>

      {/* Mobile Touch Accessory Bar */}
      <TerminalAccessoryBar
        onSendInput={handleSendInput}
        isCtrlActive={isCtrlActive}
        onToggleCtrl={() => setIsCtrlActive(!isCtrlActive)}
        isAltActive={isAltActive}
        onToggleAlt={() => setIsAltActive(!isAltActive)}
        onToggleKeyboard={handleToggleKeyboard}
        onOpenSnippets={() => setIsSnippetsOpen(true)}
      />

      {/* Snippet Drawer */}
      <TerminalSnippetsDrawer
        isOpen={isSnippetsOpen}
        onClose={() => setIsSnippetsOpen(false)}
        onRunCommand={handleRunCommand}
      />
    </div>
  );
}
```

- [x] **Step 2: Update `frontend/src/App.tsx` with Web Terminal navigation**

Update `frontend/src/App.tsx`:
Add `TerminalSquare` icon from `lucide-react`.
Update `TabType`: `'dashboard' | 'accounts' | 'logs' | 'terminal' | 'webTerminal' | 'playground'`.
Update `NAV_ITEMS`:
```typescript
const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
  { id: 'accounts', icon: Users, shortcut: '⌘2' },
  { id: 'logs', icon: FileText, shortcut: '⌘3' },
  { id: 'terminal', icon: Terminal, shortcut: '⌘4' },
  { id: 'webTerminal', icon: TerminalSquare, shortcut: '⌘5' },
  { id: 'playground', icon: Play, shortcut: '⌘6' },
];
```
Render `<WebTerminalView key={refreshTrigger} adminKey={adminKey} />` when `activeTab === 'webTerminal'`.

- [x] **Step 3: Verify frontend build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx frontend/src/App.tsx
git commit -m "feat(ui): add interactive mobile-first WebTerminalView and navigation tab"
```

---

### Task 6: Full System Integration, Build Verification & Test Run

**Files:**
- Test all components and integration pipelines.

- [x] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: All Jest tests pass.

- [x] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Both frontend Vite app and backend TypeScript build succeed cleanly.

- [x] **Step 3: Verification commit if any fixes were needed**

```bash
git status
```
(If clean, proceed to final status report.)

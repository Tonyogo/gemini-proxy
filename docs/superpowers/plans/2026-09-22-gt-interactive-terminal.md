# Docker-Style Interactive Terminal CLI (`gt exec -it`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full Docker-style interactive pseudo-terminal execution (`gt exec -it <host> <command...>`) supporting raw mode, terminal ANSI sequences, dynamic window resizing, isolated PTY sessions, graceful non-pty fallback, and clean process lifecycle cleanup.

**Architecture:** A lightweight WebSocket multiplexing bridge connects the CLI client to the Server Hub (`/api/terminal/exec-ws`). The Server Hub routes frames via `TerminalExecBridge` across the remote Agent's primary reverse WebSocket tunnel (`/api/terminal/agent-ws`) using `taskId`-tagged control and stream envelopes. The Agent daemon executes commands in an isolated child PTY (or fallback spawned pipe), piping raw input/output bi-directionally.

**Tech Stack:** Node.js (TypeScript backend, vanilla Node CLI script), `ws` (WebSocket server & client), `node-pty` (optional native PTY on agent), Node `child_process`, Jest, Supertest.

## Global Constraints

- **Syntax & Flag Compatibility**: `gt exec` strictly requires `<host>` and `<command...>` (at least 2 arguments).
- **Flag Semantics**: `-t` and `--tty` mean pseudo-terminal allocation; `-i` and `--interactive` mean keep STDIN open; `-it` and `-ti` are composite aliases for `-i -t`.
- **Timeout Disambiguation**: `--timeout <ms>` (and `--timeout=<ms>`) specifies timeout. Short flag `-t` no longer sets timeout.
- **Process Isolation**: Every `exec -it` session runs in an independent PTY/child process with a dedicated `taskId`, never hijacking or sharing the WebTerminal console session.
- **Zero Zombie Processes**: CLI disconnection (Ctrl+C, killed terminal) triggers `cmd_stream_kill` to terminate the remote process. Agent disconnection immediately cleans up and restores the local terminal.

---

### Task 1: CLI Flag Parsing & Validation for `-it` and `--timeout`

**Files:**
- Modify: `scripts/gt.js:1454-1540`
- Test: `tests/gtCli.test.ts`

**Interfaces:**
- Produces: Updated `parseExecArgs(args)` returning `{ host, fullCommand, commandParts, options: { detach, workdir, timeoutMs, verbose, pollInterval, env, interactive, tty } }`.

- [ ] **Step 1: Write the failing test in `tests/gtCli.test.ts`**

Add unit tests for interactive flags, argument validation, and `--timeout` disambiguation:

```typescript
  it('parses -it, -ti, -i, -t, and --tty flags correctly for exec', async () => {
    // Both host and command provided
    const res = await runGt(['exec', '-it', 'srv-1', 'bash']);
    // Since mock server does not yet handle interactive WS, it should at least accept arguments
    // and attempt interactive execution without throwing syntax/argument errors
    expect(res.stderr).not.toContain('requires at least 2 arguments');
    expect(res.stderr).not.toContain('Unknown option');
  });

  it('strictly requires both host and command for exec', async () => {
    const resNoArgs = await runGt(['exec']);
    expect(resNoArgs.code).toBe(1);
    expect(resNoArgs.stderr).toContain('"gt exec" requires at least 2 arguments');

    const resNoCmd = await runGt(['exec', 'srv-1']);
    expect(resNoCmd.code).toBe(1);
    expect(resNoCmd.stderr).toContain('"gt exec" requires at least 2 arguments');

    const resWithFlagsNoCmd = await runGt(['exec', '-it', 'srv-1']);
    expect(resWithFlagsNoCmd.code).toBe(1);
    expect(resWithFlagsNoCmd.stderr).toContain('"gt exec" requires at least 2 arguments');
  });

  it('treats -t as --tty, not as timeout', async () => {
    // When -t is passed without value, it sets tty: true
    // When --timeout 60000 is passed, it sets timeoutMs: 60000
    const res = await runGt(['exec', '--timeout', '60000', '-t', 'node-1', 'echo hi'], {
      TERMINAL_SERVER: `http://localhost:${serverPort}`,
    });
    expect(res.stderr).not.toContain('Unknown option');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtCli.test.ts`
Expected: FAIL because `parseExecArgs` still requires single command and errors with `Missing command to execute`, does not support `-it`, and treats `-t` as timeout.

- [ ] **Step 3: Update `parseExecArgs` in `scripts/gt.js`**

Modify `parseExecArgs` in `scripts/gt.js`:
```javascript
function parseExecArgs(args) {
  let detach = false;
  let workdir = undefined;
  let timeoutMs = 300000;
  let verbose = false;
  let pollInterval = 500;
  let interactive = false;
  let tty = false;
  const envVars = {};
  let host = '';
  const commandParts = [];

  let i = 0;
  // Phase 1: parse gt exec options until host is found or -- is encountered
  while (i < args.length) {
    const a = args[i];
    if (a === '--') {
      i++;
      if (!host && i < args.length) {
        host = args[i++];
      }
      break;
    }
    if (a === '-d' || a === '--detach' || a === '-a' || a === '--async') {
      detach = true;
    } else if (a === '--verbose') {
      verbose = true;
    } else if (a === '-q' || a === '--quiet') {
      // Retained for backward compatibility
    } else if (a === '-it' || a === '-ti') {
      interactive = true;
      tty = true;
    } else if (a === '-i' || a === '--interactive' || a === '--stdin') {
      interactive = true;
    } else if (a === '-t' || a === '--tty') {
      tty = true;
    } else if (a === '-w' || a === '--workdir' || a === '--cwd') {
      workdir = args[++i];
    } else if (a.startsWith('-w=')) {
      workdir = a.slice(3);
    } else if (a.startsWith('--workdir=')) {
      workdir = a.slice(10);
    } else if (a.startsWith('--cwd=')) {
      workdir = a.slice(6);
    } else if (a === '--timeout') {
      timeoutMs = parseInt(args[++i], 10);
    } else if (a.startsWith('--timeout=')) {
      timeoutMs = parseInt(a.slice(10), 10);
    } else if (a === '--poll-interval') {
      pollInterval = parseInt(args[++i], 10);
    } else if (a === '-e' || a === '--env') {
      const pair = args[++i] || '';
      const eq = pair.indexOf('=');
      if (eq !== -1) {
        envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
    } else if (a.startsWith('-e=')) {
      const pair = a.slice(3);
      const eq = pair.indexOf('=');
      if (eq !== -1) envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown option before host: ${a}`);
    } else {
      host = a;
      i++;
      break;
    }
    i++;
  }

  // If a double dash directly follows host (e.g. gt exec node-1 -- cmd), skip it
  if (i < args.length && args[i] === '--') {
    i++;
  }

  // Phase 2: everything after host is remote command arguments
  while (i < args.length) {
    commandParts.push(args[i++]);
  }

  const fullCommand = commandParts.length === 1
    ? commandParts[0].trim()
    : commandParts.map(quoteShellArg).join(' ').trim();

  return {
    host,
    fullCommand,
    commandParts,
    options: { detach, workdir, timeoutMs, verbose, pollInterval, env: envVars, interactive, tty }
  };
}
```

Update the argument check in `case 'exec'` (`scripts/gt.js`):
```javascript
      const { host, fullCommand, commandParts, options } = parseExecArgs(cmdArgs);
      const { detach, workdir, timeoutMs, verbose, pollInterval, env: envVars, interactive, tty } = options;

      if (!host || commandParts.length === 0) {
        console.error('Error: "gt exec" requires at least 2 arguments.');
        console.error('Usage: gt exec [OPTIONS] <host> <command...>');
        process.exit(1);
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtCli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gt.js tests/gtCli.test.ts
git commit -m "feat(gt): support -t/--tty and -it composite flags and require command arguments"
```

---

### Task 2: Server Hub `TerminalExecBridge` Service

**Files:**
- Create: `src/terminal/services/terminalExecBridge.ts`
- Modify: `src/terminal/services/terminalHostManager.ts`
- Test: `tests/terminalExecBridge.test.ts`

**Interfaces:**
- Produces:
  - `terminalExecBridge.handleCliConnection(ws: WebSocket, req: http.IncomingMessage): void`
  - `terminalExecBridge.handleAgentStreamMessage(hostId: string, message: any): void`
  - `terminalExecBridge.handleAgentDisconnected(hostId: string): void`
- Consumes:
  - `terminalHostManager.getHost(hostId)`
  - `terminalHostManager.getSession(hostId)`

- [ ] **Step 1: Write the failing test for `TerminalExecBridge`**

Create `tests/terminalExecBridge.test.ts`:
```typescript
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { TerminalExecBridge } from '../src/terminal/services/terminalExecBridge';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('TerminalExecBridge', () => {
  let bridge: TerminalExecBridge;

  beforeEach(() => {
    bridge = new TerminalExecBridge();
  });

  it('rejects connection if hostId is missing or host is offline', () => {
    const mockWs = {
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      readyState: 1,
    } as any;

    const req = {
      url: '/api/terminal/exec-ws?hostId=non-existent-host',
      headers: { host: 'localhost' },
    } as any;

    bridge.handleCliConnection(mockWs, req);
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('[Host Offline]'));
    expect(mockWs.close).toHaveBeenCalledWith(1008, expect.any(String));
  });

  it('routes agent stream data and exit to corresponding CLI socket', (done) => {
    const mockCliWs = new EventEmitter() as any;
    mockCliWs.send = jest.fn();
    mockCliWs.close = jest.fn();
    mockCliWs.readyState = 1;

    // Register a mock online agent
    const mockAgentWs = new EventEmitter() as any;
    mockAgentWs.send = jest.fn();
    terminalHostManager.registerAgent({
      hostId: 'test-agent-1',
      name: 'test-agent',
      agentWs: mockAgentWs,
    });

    const req = {
      url: '/api/terminal/exec-ws?hostId=test-agent-1',
      headers: { host: 'localhost' },
    } as any;

    bridge.handleCliConnection(mockCliWs, req);

    // Simulate CLI sending exec_start
    mockCliWs.emit('message', Buffer.from(JSON.stringify({
      type: 'exec_start',
      command: 'bash',
      tty: true,
      cols: 80,
      rows: 24,
    })));

    // Verify message was forwarded to agent via session or agentWs
    expect(mockAgentWs.send).toHaveBeenCalledWith(expect.stringContaining('"action":"start_stream"'));

    // Extract taskId from the message sent to agent
    const sentMsg = mockAgentWs.send.mock.calls.find((call: any[]) => call[0].includes('start_stream'))[0];
    const parsed = JSON.parse(sentMsg.slice(5));
    const taskId = parsed.taskId;

    // Simulate Agent returning stdout stream
    const base64Data = Buffer.from('hello world\n').toString('base64');
    bridge.handleAgentStreamMessage('test-agent-1', {
      type: 'cmd_stream_data',
      taskId,
      data: base64Data,
    });

    expect(mockCliWs.send).toHaveBeenCalledWith(Buffer.from('hello world\n'));

    // Simulate Agent exiting
    bridge.handleAgentStreamMessage('test-agent-1', {
      type: 'cmd_stream_exit',
      taskId,
      exitCode: 0,
    });

    expect(mockCliWs.send).toHaveBeenCalledWith(JSON.stringify({
      type: 'exec_exit',
      exitCode: 0,
      signal: null,
    }));
    expect(mockCliWs.close).toHaveBeenCalledWith(1000, 'Process exited');

    done();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalExecBridge.test.ts`
Expected: FAIL with `Cannot find module '../src/terminal/services/terminalExecBridge'`.

- [ ] **Step 3: Create `src/terminal/services/terminalExecBridge.ts`**

Implement `TerminalExecBridge`:
```typescript
import http from 'http';
import { URL } from 'url';
import { RawData, WebSocket } from 'ws';
import logger from '../../utils/logger';
import { terminalHostManager } from './terminalHostManager';

export interface ActiveExecSession {
  taskId: string;
  hostId: string;
  cliWs: any;
  createdAt: number;
}

export class TerminalExecBridge {
  private activeSessions: Map<string, ActiveExecSession> = new Map();
  private hostToTasks: Map<string, Set<string>> = new Map();

  public handleCliConnection(ws: any, req: http.IncomingMessage): void {
    const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const rawHostId = (parsedUrl.searchParams.get('hostId') || parsedUrl.searchParams.get('id') || '').trim();

    const canonicalHostId = terminalHostManager.resolveCanonicalHostId(rawHostId);
    const host = canonicalHostId ? terminalHostManager.getHost(canonicalHostId) : null;

    if (!canonicalHostId || !host || host.status !== 'online') {
      logger.warn(`[ExecBridge] CLI attempted connection to offline/unknown host: "${rawHostId}"`);
      try {
        ws.send(`\r\n\x1b[33m[Host Offline] Host "${rawHostId}" is offline or unavailable.\x1b[0m\r\n`);
        ws.close(1008, 'Host is offline or unavailable');
      } catch {}
      return;
    }

    let assignedTaskId: string | null = null;

    ws.on('message', (message: RawData, isBinary: boolean) => {
      try {
        if (isBinary) {
          if (assignedTaskId) {
            const buf = Buffer.isBuffer(message) ? message : Buffer.from(message as any);
            this.sendToAgent(canonicalHostId, {
              type: 'cmd_stream_input',
              taskId: assignedTaskId,
              data: buf.toString('base64'),
            });
          }
          return;
        }

        const msgStr = typeof message === 'string' ? message : message.toString('utf-8');
        let control: any = null;
        if (msgStr.startsWith('JSON:')) {
          control = JSON.parse(msgStr.slice(5));
        } else {
          try {
            control = JSON.parse(msgStr);
          } catch {}
        }

        if (!control) {
          if (assignedTaskId) {
            this.sendToAgent(canonicalHostId, {
              type: 'cmd_stream_input',
              taskId: assignedTaskId,
              data: Buffer.from(msgStr, 'utf-8').toString('base64'),
            });
          }
          return;
        }

        if (control.type === 'exec_start') {
          assignedTaskId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          this.activeSessions.set(assignedTaskId, {
            taskId: assignedTaskId,
            hostId: canonicalHostId,
            cliWs: ws,
            createdAt: Date.now(),
          });

          if (!this.hostToTasks.has(canonicalHostId)) {
            this.hostToTasks.set(canonicalHostId, new Set());
          }
          this.hostToTasks.get(canonicalHostId)!.add(assignedTaskId);

          this.sendToAgent(canonicalHostId, {
            type: 'cmd_exec',
            action: 'start_stream',
            taskId: assignedTaskId,
            command: control.command,
            cwd: control.cwd,
            env: control.env,
            timeoutMs: control.timeoutMs,
            tty: control.tty !== false,
            interactive: control.interactive !== false,
            cols: control.cols || 80,
            rows: control.rows || 24,
          });

          ws.send(JSON.stringify({ type: 'exec_started', taskId: assignedTaskId }));
          return;
        }

        if (control.type === 'resize' && assignedTaskId) {
          this.sendToAgent(canonicalHostId, {
            type: 'cmd_stream_resize',
            taskId: assignedTaskId,
            cols: control.cols,
            rows: control.rows,
          });
          return;
        }
      } catch (err: any) {
        logger.error(`[ExecBridge] Error handling message from CLI: ${err.message}`);
      }
    });

    const cleanup = () => {
      if (assignedTaskId) {
        this.sendToAgent(canonicalHostId, {
          type: 'cmd_stream_kill',
          taskId: assignedTaskId,
          signal: 'SIGHUP',
        });
        this.activeSessions.delete(assignedTaskId);
        const set = this.hostToTasks.get(canonicalHostId);
        if (set) {
          set.delete(assignedTaskId);
          if (set.size === 0) this.hostToTasks.delete(canonicalHostId);
        }
      }
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }

  public handleAgentStreamMessage(hostId: string, message: any): void {
    const { taskId, type } = message;
    if (!taskId) return;

    const session = this.activeSessions.get(taskId);
    if (!session || !session.cliWs || session.cliWs.readyState !== 1) {
      return;
    }

    if (type === 'cmd_stream_data') {
      try {
        const buf = Buffer.from(message.data, 'base64');
        session.cliWs.send(buf);
      } catch (err: any) {
        logger.warn(`[ExecBridge] Failed to write stream data to CLI [${taskId}]: ${err.message}`);
      }
      return;
    }

    if (type === 'cmd_stream_exit') {
      try {
        session.cliWs.send(JSON.stringify({
          type: 'exec_exit',
          exitCode: message.exitCode !== undefined ? message.exitCode : 0,
          signal: message.signal || null,
        }));
        session.cliWs.close(1000, 'Process exited');
      } catch {}
      this.activeSessions.delete(taskId);
      const set = this.hostToTasks.get(hostId);
      if (set) {
        set.delete(taskId);
        if (set.size === 0) this.hostToTasks.delete(hostId);
      }
    }
  }

  public handleAgentDisconnected(hostId: string): void {
    const tasks = this.hostToTasks.get(hostId);
    if (!tasks) return;

    for (const taskId of tasks) {
      const session = this.activeSessions.get(taskId);
      if (session && session.cliWs) {
        try {
          session.cliWs.send('\r\n\x1b[31m[Agent Disconnected] Remote host lost connection.\x1b[0m\r\n');
          session.cliWs.close(1006, 'Agent disconnected');
        } catch {}
      }
      this.activeSessions.delete(taskId);
    }
    this.hostToTasks.delete(hostId);
  }

  private sendToAgent(hostId: string, payload: any): void {
    const session = terminalHostManager.getSession(hostId);
    if (session) {
      session.write(`JSON:${JSON.stringify(payload)}`);
    }
  }
}

export const terminalExecBridge = new TerminalExecBridge();
export default terminalExecBridge;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalExecBridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/services/terminalExecBridge.ts tests/terminalExecBridge.test.ts
git commit -m "feat(terminal): add TerminalExecBridge service for interactive exec streaming"
```

---

### Task 3: Server Hub Route Integration (`/api/terminal/exec-ws`)

**Files:**
- Modify: `src/terminal/routes/terminalWs.ts`
- Test: `tests/terminalExecWsRoute.test.ts`

**Interfaces:**
- Consumes: `terminalExecBridge`
- Produces: Upgraded WebSocket endpoints for `/api/terminal/exec-ws` and `/api/admin/terminal/exec-ws`.

- [ ] **Step 1: Write failing test in `tests/terminalExecWsRoute.test.ts`**

Create `tests/terminalExecWsRoute.test.ts`:
```typescript
import http from 'http';
import { WebSocket } from 'ws';
import express from 'express';
import { setupTerminalWebSocket } from '../src/terminal/routes/terminalWs';
import config from '../../config/default';

describe('Exec WebSocket Route Upgrade', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    config.adminSecretKey = 'test-secret-key';
    const app = express();
    server = http.createServer(app);
    setupTerminalWebSocket(server);

    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        port = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    config.adminSecretKey = '';
    server.close(done);
  });

  it('rejects unauthorized connections without x-admin-key', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/api/terminal/exec-ws?hostId=srv-1`);
    ws.on('unexpected-response', (_req, res) => {
      expect(res.statusCode).toBe(401);
      done();
    });
    ws.on('error', () => {
      // Expected on 401 upgrade reject
    });
  });

  it('accepts authorized connections with x-admin-key header', (done) => {
    const ws = new WebSocket(`ws://localhost:${port}/api/terminal/exec-ws?hostId=srv-1`, {
      headers: { 'x-admin-key': 'test-secret-key' },
    });
    ws.on('open', () => {
      ws.close();
      done();
    });
    ws.on('error', (err) => {
      done(err);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalExecWsRoute.test.ts`
Expected: FAIL because `/api/terminal/exec-ws` is not recognized and upgrade is ignored.

- [ ] **Step 3: Modify `src/terminal/routes/terminalWs.ts`**

1. Create `execWss = new WebSocketServer({ noServer: true });`
2. Add `isExecWs = reqUrl.startsWith('/api/terminal/exec-ws') || reqUrl.startsWith('/api/admin/terminal/exec-ws')`
3. If `isExecWs`, delegate to `execWss.handleUpgrade(req, socket, head, (ws) => terminalExecBridge.handleCliConnection(ws, req))`
4. In `agentWss.on('connection')`:
   - Route `control.type === 'cmd_stream_data'` and `control.type === 'cmd_stream_exit'` to `terminalExecBridge.handleAgentStreamMessage(hostId, control)`.
   - On agent `close` / `error`, call `terminalExecBridge.handleAgentDisconnected(hostId)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalExecWsRoute.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/routes/terminalWs.ts tests/terminalExecWsRoute.test.ts
git commit -m "feat(terminal): integrate /api/terminal/exec-ws route and agent event bridge"
```

---

### Task 4: Agent Daemon PTY & Fallback Stream Manager

**Files:**
- Modify: `scripts/gt.js:932-1440`
- Test: `tests/gtAgentStream.test.ts`

**Interfaces:**
- Produces: `StreamSessionManager` within Agent daemon handling:
  - `start_stream` (PTY or spawn fallback)
  - `cmd_stream_input` (base64 decode and write)
  - `cmd_stream_resize` (cols, rows)
  - `cmd_stream_kill` (killProcessTree)
  - Automatic session cleanup on exit

- [ ] **Step 1: Write the failing test for Agent StreamSessionManager**

Create `tests/gtAgentStream.test.ts`:
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

describe('Agent StreamSessionManager', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let port: number;
  let agentWs: WebSocket | null = null;
  let agentProcess: any = null;

  beforeAll((done) => {
    server = http.createServer();
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      agentWs = ws;
    });

    server.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;

      // Start agent process connecting to mock server
      agentProcess = spawn('node', [gtPath, 'agent', `--server=http://localhost:${port}`, '--name=stream-test-agent', '--id=agent-stream-1'], {
        stdio: 'pipe',
      });

      // Wait for agent registration
      const checkInterval = setInterval(() => {
        if (agentWs) {
          clearInterval(checkInterval);
          done();
        }
      }, 50);
    });
  });

  afterAll((done) => {
    if (agentProcess) {
      agentProcess.kill('SIGKILL');
    }
    server.close(done);
  });

  it('handles start_stream and emits cmd_stream_data and cmd_stream_exit', (done) => {
    let receivedData = '';
    const taskId = 'test-stream-echo';

    agentWs!.on('message', (raw) => {
      const str = raw.toString();
      if (!str.startsWith('JSON:')) return;
      const msg = JSON.parse(str.slice(5));

      if (msg.taskId === taskId && msg.type === 'cmd_stream_data') {
        receivedData += Buffer.from(msg.data, 'base64').toString('utf-8');
      }

      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        expect(receivedData).toContain('STREAM_WORKS');
        expect(msg.exitCode).toBe(0);
        done();
      }
    });

    // Send start_stream to agent
    agentWs!.send(`JSON:${JSON.stringify({
      type: 'cmd_exec',
      action: 'start_stream',
      taskId,
      command: 'echo STREAM_WORKS',
      tty: true,
    })}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtAgentStream.test.ts`
Expected: FAIL with timeout or unknown action `start_stream`.

- [ ] **Step 3: Implement `StreamSessionManager` in `scripts/gt.js`**

Add `StreamSessionManager` to `scripts/gt.js`:
```javascript
class StreamSessionManager {
  constructor(sendFn) {
    this.send = sendFn;
    this.sessions = new Map();
  }

  startStream({ taskId, command, cwd, env = {}, cols = 80, rows = 24, timeoutMs = 0, tty = true }) {
    const workingDir = cwd ? path.resolve(cwd) : (process.env.HOME || process.cwd());
    const isWindows = os.platform() === 'win32';
    const shell = getDefaultShell();
    const taskEnv = {
      ...process.env,
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    let ptyProc = null;
    let childProc = null;
    const isPty = Boolean(tty && pty);

    if (isPty) {
      const shellArgs = isWindows
        ? (shell.toLowerCase().includes('powershell') ? ['-Command', command] : ['/c', command])
        : ['-c', command];
      try {
        ptyProc = pty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: cols || 80,
          rows: rows || 24,
          cwd: workingDir,
          env: taskEnv,
        });
      } catch (err) {
        ptyProc = null;
      }
    }

    if (!ptyProc) {
      if (tty && !pty) {
        const warnMsg = Buffer.from('\r\n\x1b[33m[Warning] node-pty not available on agent; running in streaming pipe mode.\x1b[0m\r\n');
        this.send({ type: 'cmd_stream_data', taskId, data: warnMsg.toString('base64') });
      }
      const shellArgs = isWindows
        ? (shell.toLowerCase().includes('powershell') ? ['-Command', command] : ['/c', command])
        : ['-c', command];
      try {
        childProc = spawn(shell, shellArgs, {
          cwd: workingDir,
          env: taskEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: !isWindows,
        });
      } catch (err) {
        this.send({ type: 'cmd_stream_exit', taskId, exitCode: 1, signal: null });
        return;
      }
    }

    const session = {
      taskId,
      isPty: Boolean(ptyProc),
      proc: ptyProc || childProc,
      timeoutTimer: null,
    };

    if (timeoutMs > 0) {
      session.timeoutTimer = setTimeout(() => {
        this.kill(taskId, 'SIGTERM');
      }, timeoutMs);
    }

    const onData = (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8');
      this.send({
        type: 'cmd_stream_data',
        taskId,
        data: buf.toString('base64'),
      });
    };

    const onExit = (code, signal) => {
      if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
      this.sessions.delete(taskId);
      this.send({
        type: 'cmd_stream_exit',
        taskId,
        exitCode: code !== null && code !== undefined ? code : (signal ? 130 : 0),
        signal: signal || null,
      });
    };

    if (ptyProc) {
      ptyProc.onData(onData);
      ptyProc.onExit(({ exitCode, signal }) => onExit(exitCode, signal));
    } else if (childProc) {
      childProc.stdout.on('data', onData);
      childProc.stderr.on('data', onData);
      childProc.on('close', (code, signal) => onExit(code, signal));
    }

    this.sessions.set(taskId, session);
  }

  writeInput(taskId, base64Data) {
    const session = this.sessions.get(taskId);
    if (!session || !session.proc) return;
    try {
      const buf = Buffer.from(base64Data, 'base64');
      if (session.isPty) {
        session.proc.write(buf.toString('utf-8'));
      } else if (session.proc.stdin) {
        session.proc.stdin.write(buf);
      }
    } catch {}
  }

  resize(taskId, cols, rows) {
    const session = this.sessions.get(taskId);
    if (!session || !session.proc) return;
    if (session.isPty && typeof session.proc.resize === 'function') {
      try {
        session.proc.resize(Math.max(10, cols || 80), Math.max(5, rows || 24));
      } catch {}
    }
  }

  kill(taskId, signal = 'SIGTERM') {
    const session = this.sessions.get(taskId);
    if (!session || !session.proc) return;
    try {
      if (session.isPty) {
        session.proc.kill(signal);
      } else {
        killProcessTree(session.proc, signal);
      }
    } catch {}
    if (session.timeoutTimer) clearTimeout(session.timeoutTimer);
    this.sessions.delete(taskId);
  }

  killAll() {
    for (const taskId of this.sessions.keys()) {
      this.kill(taskId, 'SIGTERM');
    }
  }
}
```

Integrate into `runAgent`:
- Initialize `streamSessionManager = new StreamSessionManager((data) => ws.send('JSON:' + JSON.stringify(data)));`
- Handle `action === 'start_stream'` in `cmd_exec`.
- Handle `type === 'cmd_stream_input'`, `type === 'cmd_stream_resize'`, `type === 'cmd_stream_kill'`.
- Call `streamSessionManager.killAll()` in `cleanup()` and on WS disconnect.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtAgentStream.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gt.js tests/gtAgentStream.test.ts
git commit -m "feat(gt): implement StreamSessionManager in agent for isolated PTY sessions"
```

---

### Task 5: CLI Interactive Mode (`runInteractiveExec`) & Terminal Raw Mode

**Files:**
- Modify: `scripts/gt.js`
- Test: `tests/gtInteractiveCli.test.ts`

**Interfaces:**
- Produces: `runInteractiveExec({ serverUrl, apiKey, hostId, fullCommand, options })` in `scripts/gt.js`.
- Handles raw mode toggling, SIGWINCH resize sync, binary I/O piping, and clean terminal exit code return.

- [ ] **Step 1: Write integration test for CLI interactive exec**

Create `tests/gtInteractiveCli.test.ts`:
```typescript
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import path from 'path';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

describe('gt exec -it CLI runner', () => {
  let server: http.Server;
  let execWss: WebSocketServer;
  let port: number;

  beforeAll((done) => {
    server = http.createServer();
    execWss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      execWss.handleUpgrade(req, socket, head, (ws) => {
        execWss.emit('connection', ws, req);
      });
    });

    execWss.on('connection', (ws, req) => {
      ws.on('message', (data, isBinary) => {
        if (!isBinary) {
          const str = data.toString();
          if (str.includes('exec_start')) {
            ws.send(JSON.stringify({ type: 'exec_started', taskId: 'mock-task-1' }));
            // Send mock output
            setTimeout(() => {
              ws.send(Buffer.from('INTERACTIVE_OK\n'));
              ws.send(JSON.stringify({ type: 'exec_exit', exitCode: 0 }));
            }, 100);
          }
        }
      });
    });

    server.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('runs interactive exec and pipes output to stdout, exiting with remote code', (done) => {
    const child = spawn('node', [gtPath, 'exec', '-it', `--server=http://localhost:${port}`, 'node-1', 'bash'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', chunk => stdout += chunk);

    child.on('close', (code) => {
      expect(stdout).toContain('INTERACTIVE_OK');
      expect(code).toBe(0);
      done();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtInteractiveCli.test.ts`
Expected: FAIL because `gt exec -it` currently falls into the non-interactive HTTP POST polling branch.

- [ ] **Step 3: Implement `runInteractiveExec` in `scripts/gt.js`**

Implement `runInteractiveExec`:
```javascript
function runInteractiveExec({ serverUrl, apiKey, hostId, fullCommand, options }) {
  return new Promise(async (resolve, reject) => {
    const { tty, timeoutMs, workdir, env } = options;
    const isTTY = Boolean(process.stdin.isTTY);

    let wsUrl = serverUrl.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = `ws://${wsUrl}`;
    }
    wsUrl = wsUrl.replace(/\/+$/, '');

    const query = new URLSearchParams({ hostId });
    if (apiKey) query.set('key', apiKey);

    const targetUrl = `${wsUrl}/api/terminal/exec-ws?${query.toString()}`;
    const headers = {};
    if (apiKey) headers['x-admin-key'] = apiKey;

    const ws = new WebSocket(targetUrl, { headers });

    const restoreTerminal = () => {
      if (isTTY && process.stdin.setRawMode) {
        try { process.stdin.setRawMode(false); } catch {}
      }
      try { process.stdin.pause(); } catch {}
      if (tty) {
        process.stdout.write('\x1b[?25h\x1b[0m');
      }
    };

    ws.on('open', () => {
      const cols = process.stdout.columns || 80;
      const rows = process.stdout.rows || 24;

      // 1. Send exec_start
      ws.send(JSON.stringify({
        type: 'exec_start',
        command: fullCommand,
        cwd: workdir,
        env,
        timeoutMs: timeoutMs || 0,
        tty: Boolean(tty),
        interactive: true,
        cols,
        rows,
      }));

      // 2. Set raw mode if TTY
      if (isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
      }

      // 3. Pipe stdin to ws binary
      process.stdin.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      });

      // 4. Handle resize
      const onResize = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'resize',
            cols: process.stdout.columns || 80,
            rows: process.stdout.rows || 24,
          }));
        }
      };
      process.stdout.on('resize', onResize);
      ws.on('close', () => {
        process.stdout.removeListener('resize', onResize);
      });
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        process.stdout.write(data);
        return;
      }

      const str = data.toString();
      try {
        const json = JSON.parse(str);
        if (json.type === 'exec_exit') {
          restoreTerminal();
          resolve(json.exitCode !== undefined ? json.exitCode : 0);
          return;
        }
        if (json.type === 'exec_started') {
          return;
        }
      } catch {}

      process.stdout.write(data);
    });

    ws.on('error', (err) => {
      restoreTerminal();
      console.error(`\n[Error] Connection error: ${err.message}`);
      resolve(1);
    });

    ws.on('close', (code, reason) => {
      restoreTerminal();
      if (code !== 1000) {
        console.error(`\n[Connection Closed] ${reason?.toString() || `code ${code}`}`);
        resolve(1);
      }
    });

    process.on('SIGINT', () => {
      restoreTerminal();
      process.exit(130);
    });
  });
}
```

In `case 'exec'` dispatcher:
```javascript
      if (interactive && tty) {
        const exitCode = await runInteractiveExec({
          serverUrl: server,
          apiKey: key,
          hostId: targetHost,
          fullCommand,
          options,
        });
        process.exit(exitCode);
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtInteractiveCli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gt.js tests/gtInteractiveCli.test.ts
git commit -m "feat(gt): add runInteractiveExec with raw mode and resize event forwarding"
```

---

### Task 6: Comprehensive End-to-End Verification & Documentation

**Files:**
- Modify: `CLAUDE.md`
- Test: `tests/gtCli.test.ts`
- Run: `npm test`

- [ ] **Step 1: Update CLI documentation in `CLAUDE.md` and `gt --help`**

Ensure `CLAUDE.md` and `scripts/gt.js` printHelp clearly reflect:
- `gt exec [-it] [-d] [-w <dir>] [--timeout <ms>] <host> [--] <cmd...>`
- `-i, --interactive`: Keep STDIN open for live input
- `-t, --tty`: Allocate a pseudo-TTY with raw terminal input
- `-it`: Interactive pseudo-terminal session (like `docker exec -it`)
- `--timeout <ms>`: Execution timeout

- [ ] **Step 2: Run all test suites across the project**

Run: `npm test`
Expected: PASS (all tests green, no regressions)

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md scripts/gt.js
git commit -m "docs(gt): document interactive terminal flags and usage"
```

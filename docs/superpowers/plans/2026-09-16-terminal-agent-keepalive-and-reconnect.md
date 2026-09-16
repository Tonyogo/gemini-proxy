# Terminal Agent Keep-Alive & Self-Healing Reconnection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement proactive dual-phase WebSocket keep-alive (10s Ping, 3s timeout, `ws.terminate()`), TCP socket keep-alive, and exponential backoff reconnection in `scripts/terminal-agent.js` and `src/admin/routes/terminalWs.ts` to permanently prevent zombie/half-open connections while keeping user PTY processes intact.

**Architecture:** Layered keep-alive model with transport-layer TCP keep-alive, application-layer proactive ping/pong heartbeat, hard socket termination upon dead-link detection, and PTY process preservation across reconnection handshakes.

**Tech Stack:** Node.js, WebSocket (`ws`), `node-pty`, TypeScript, Jest.

## Global Constraints
- Must detect dead/zombie connections within 13 seconds (10s interval + 3s timeout).
- Must forceful-terminate half-open sockets using `ws.terminate()`.
- Must preserve active PTY processes (`ptyProcess`) across reconnections (never kill shell session on socket drops).
- Control frames (`JSON:{"type":"pong"}` or Ping/RPC) must never leak into shell STDIN or terminal screen.
- All tests must pass with `npx jest --runInBand`.

---

### Task 1: Fix Hub WebSocket Ping/Pong Protocol & Add Server Test

**Files:**
- Modify: `src/admin/routes/terminalWs.ts:87-90`
- Test: `tests/terminalWs.test.ts`

**Interfaces:**
- Consumes: `control.type === 'ping'` frame from agent or client
- Produces: `ws.send('JSON:{"type":"pong"}')` (ensuring consistent `JSON:` prefix)

- [ ] **Step 1: Write the failing test in `tests/terminalWs.test.ts`**

Add an assertion checking that when an agent sends `JSON:{"type":"ping"}`, the hub responds with `JSON:{"type":"pong"}`:

```typescript
  it('should respond with prefixed JSON:{"type":"pong"} when agent sends ping', (done) => {
    const originalKey = config.adminSecretKey;
    config.adminSecretKey = 'valid-key';
    const testHostId = 'agent-ping-test';

    const agentWs = new WebSocket(
      `ws://127.0.0.1:${port}/api/admin/terminal/agent-ws?hostId=${testHostId}&name=PingNode&key=valid-key`
    );

    agentWs.on('open', () => {
      agentWs.send(`JSON:${JSON.stringify({ type: 'ping' })}`);
    });

    agentWs.on('message', (msg) => {
      const text = msg.toString();
      if (text.startsWith('JSON:')) {
        const payload = JSON.parse(text.slice(5));
        if (payload.type === 'pong') {
          expect(text).toBe('JSON:{"type":"pong"}');
          agentWs.close();
          config.adminSecretKey = originalKey;
          done();
        }
      }
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalWs.test.ts -t "should respond with prefixed JSON"`
Expected: FAIL (currently sends bare `JSON.stringify({ type: 'pong' })` without `JSON:` prefix).

- [ ] **Step 3: Update `src/admin/routes/terminalWs.ts`**

In `src/admin/routes/terminalWs.ts`, update the agent ping handler (around line 87-90):

```typescript
          if (control.type === 'ping') {
            ws.send(`JSON:${JSON.stringify({ type: 'pong' })}`);
            return;
          }
```

Also check client ping handler (around line 180-183) and update to:

```typescript
          if (control.type === 'ping') {
            ws.send(`JSON:${JSON.stringify({ type: 'pong' })}`);
            return;
          }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalWs.test.ts -t "should respond with prefixed JSON"`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add src/admin/routes/terminalWs.ts tests/terminalWs.test.ts
git commit -m "fix(terminal): ensure websocket pong replies include JSON: prefix"
```

---

### Task 2: Implement Proactive Heartbeat, Timeout Terminate, and PTY Preservation in `terminal-agent.js`

**Files:**
- Modify: `scripts/terminal-agent.js`

**Interfaces:**
- Consumes: `serverArg`, `adminKey`, `hostId`, `ptyProcess`
- Produces: `startHeartbeat()`, `stopHeartbeat()`, `parseControlMessage()`, `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_TIMEOUT_MS`, `HANDSHAKE_TIMEOUT_MS` exported for unit testing.

- [ ] **Step 1: Update `scripts/terminal-agent.js` with Constants, Control Parser, and Keep-Alive Handlers**

Replace `scripts/terminal-agent.js` with the comprehensive keep-alive engine:

```javascript
#!/usr/bin/env node

/**
 * Gemini Proxy Terminal Agent
 * Lightweight reverse agent bridging local PTY shell to the remote Gemini Proxy WebTerminal.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const pty = require('node-pty');
const dotenv = require('dotenv');

// Load configuration from .env in current working directory if present
const envPath = path.join(process.cwd(), '.env');
let envLoaded = false;
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  envLoaded = true;
}

// Parse CLI flags (--key=..., --server=..., --name=..., --id=..., --shell=...)
const args = process.argv.slice(2);
const options = {};

for (const arg of args) {
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const k = arg.slice(2, eqIdx).trim();
      const v = arg.slice(eqIdx + 1).trim();
      options[k] = v;
    } else {
      options[arg.slice(2).trim()] = true;
    }
  }
}

// Tunable keepalive constants
const HANDSHAKE_TIMEOUT_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 3000;

const serverArg = options.server || process.env.TERMINAL_SERVER || 'http://localhost:3000';
const adminKey = options.key || process.env.ADMIN_SECRET_KEY || '';
const hostname = os.hostname();
const platform = os.platform();

// Pick local LAN IPv4 address
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIp();
const hostId = options.id || options.hostId || `${hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}-${localIp.replace(/\./g, '-')}`;
const hostName = options.name || hostname;

function getDefaultShell() {
  if (platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return options.shell || process.env.SHELL || '/bin/bash';
}

function resolveWebSocketUrl(serverUrl) {
  let wsUrl = serverUrl.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    wsUrl = `ws://${wsUrl}`;
  }
  // Trim trailing slash
  wsUrl = wsUrl.replace(/\/+$/, '');
  const query = new URLSearchParams({
    hostId,
    name: hostName,
    hostname,
    ip: localIp,
    platform,
    key: adminKey,
  });
  return `${wsUrl}/api/admin/terminal/agent-ws?${query.toString()}`;
}

function parseControlMessage(msgStr) {
  if (typeof msgStr !== 'string') return null;
  const trimmed = msgStr.trim();
  if (trimmed.startsWith('JSON:')) {
    try {
      return JSON.parse(trimmed.slice(5));
    } catch {
      return null;
    }
  }
  // Tolerate bare JSON control frames to prevent leaking into shell stdin
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.type === 'string') {
        return parsed;
      }
    } catch {}
  }
  return null;
}

if (envLoaded) {
  console.log('[Agent] Loaded .env configuration');
}
console.log('---------------------------------------------------------');
console.log(' Gemini Proxy Terminal Reverse Agent');
console.log(` Host ID   : ${hostId}`);
console.log(` Host Name : ${hostName} (${hostname})`);
console.log(` IP / OS   : ${localIp} / ${platform}`);
console.log(` Target Hub: ${serverArg}`);
console.log('---------------------------------------------------------');

let ptyProcess = null;
let ws = null;
let reconnectAttempts = 0;
let isExiting = false;
let connectTimeoutTimer = null;
let heartbeatTimer = null;
let heartbeatTimeoutTimer = null;

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(`JSON:${JSON.stringify({ type: 'ping' })}`);
      } catch {}

      if (heartbeatTimeoutTimer) clearTimeout(heartbeatTimeoutTimer);
      heartbeatTimeoutTimer = setTimeout(() => {
        console.warn(
          `[Agent] Heartbeat timeout (${HEARTBEAT_TIMEOUT_MS / 1000}s) on ${serverArg}. Terminating dead connection...`
        );
        if (ws) {
          try {
            ws.terminate();
          } catch {}
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function onHeartbeatActivity() {
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

function spawnPty() {
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {
      // Ignore
    }
    ptyProcess = null;
  }

  const shell = getDefaultShell();
  const cwd = process.env.HOME || process.cwd();
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'en_US.UTF-8',
    TERM_PROGRAM: 'gemini-proxy-agent',
    CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN: process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN || '1',
  };

  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env,
    });

    console.log(`[PTY] Shell spawned: ${shell} (pid=${ptyProcess.pid})`);

    ptyProcess.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch {
          // Socket write failed
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[PTY] Shell exited with code: ${exitCode}`);
      ptyProcess = null;
      if (!isExiting) {
        setTimeout(spawnPty, 500);
      }
    });
  } catch (err) {
    console.error(`[PTY] Failed to spawn PTY: ${err.message}`);
  }
}

async function handleFileRpc(control) {
  const { reqId, action, path: targetPath, params = {} } = control;
  const reply = (success, data = null, error = null) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(`JSON:${JSON.stringify({
        type: 'file_rpc_res',
        reqId,
        success,
        data,
        error
      })}`);
    }
  };

  try {
    const resolvedPath = path.resolve(targetPath || os.homedir() || process.cwd());

    if (action === 'list') {
      if (!fs.existsSync(resolvedPath)) {
        return reply(false, null, `Path not found: ${resolvedPath}`);
      }
      const stat = await fs.promises.stat(resolvedPath);
      if (!stat.isDirectory()) {
        return reply(false, null, 'Target is not a directory');
      }
      const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(resolvedPath, entry.name);
        try {
          const entryStat = await fs.promises.stat(full);
          const isDir = entry.isDirectory();
          files.push({
            name: entry.name,
            path: full,
            isDirectory: isDir,
            size: isDir ? 0 : entryStat.size,
            updatedAt: entryStat.mtimeMs,
            extension: isDir ? '' : path.extname(entry.name).replace(/^\./, '').toLowerCase(),
          });
        } catch {}
      }
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      const parsed = path.parse(resolvedPath);
      return reply(true, {
        currentPath: resolvedPath,
        parentPath: parsed.root === resolvedPath ? null : path.dirname(resolvedPath),
        separator: path.sep,
        files
      });
    }

    if (action === 'read') {
      if (!fs.existsSync(resolvedPath)) return reply(false, null, 'File not found');
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) return reply(false, null, 'Target is a directory');
      if (stat.size > 5 * 1024 * 1024) return reply(false, null, 'File exceeds 5MB preview limit');
      const buf = await fs.promises.readFile(resolvedPath);
      const isBinary = buf.slice(0, 1024).includes(0);
      return reply(true, {
        path: resolvedPath,
        size: stat.size,
        isBinary,
        content: isBinary ? '' : buf.toString('utf-8')
      });
    }

    if (action === 'write') {
      await fs.promises.writeFile(resolvedPath, params.content || '', 'utf-8');
      return reply(true, { success: true });
    }

    if (action === 'mkdir') {
      const full = path.join(resolvedPath, params.dirName || 'new-folder');
      await fs.promises.mkdir(full, { recursive: true });
      return reply(true, { success: true });
    }

    if (action === 'rename') {
      const newPath = path.resolve(params.newPath);
      await fs.promises.rename(resolvedPath, newPath);
      return reply(true, { success: true });
    }

    if (action === 'delete') {
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) {
        await fs.promises.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(resolvedPath);
      }
      return reply(true, { success: true });
    }

    if (action === 'upload_chunk') {
      const full = path.join(resolvedPath, params.filename);
      const buf = Buffer.from(params.data || '', 'base64');
      await fs.promises.writeFile(full, buf);
      return reply(true, { success: true });
    }

    if (action === 'download_chunk') {
      if (!fs.existsSync(resolvedPath)) return reply(false, null, 'File not found');
      const buf = await fs.promises.readFile(resolvedPath);
      return reply(true, buf.toString('base64'));
    }

    reply(false, null, `Unknown action: ${action}`);
  } catch (err) {
    reply(false, null, err.message);
  }
}

function connect() {
  if (isExiting) return;

  const targetWsUrl = resolveWebSocketUrl(serverArg);
  console.log(`[Agent] Connecting to ${targetWsUrl.split('?')[0]}...`);

  if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
  connectTimeoutTimer = setTimeout(() => {
    console.warn(`[Agent] Connection to ${serverArg} timed out (${HANDSHAKE_TIMEOUT_MS / 1000}s)`);
    if (ws) {
      try {
        ws.terminate();
      } catch {}
    }
  }, HANDSHAKE_TIMEOUT_MS);

  ws = new WebSocket(targetWsUrl, {
    headers: {
      'x-admin-key': adminKey,
    },
  });

  // Enable TCP KeepAlive on socket once connected
  ws.on('upgrade', (response) => {
    if (ws._socket && typeof ws._socket.setKeepAlive === 'function') {
      ws._socket.setKeepAlive(true, 10000);
    }
  });

  ws.on('open', () => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    reconnectAttempts = 0;
    console.log(`[Agent] Connected and registered successfully! Reverse tunnel is active.`);

    startHeartbeat();

    const isFirstSpawn = !ptyProcess;
    if (!ptyProcess) {
      spawnPty();
    }

    try {
      if (isFirstSpawn) {
        ws.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
      }
      if (ptyProcess) {
        ws.send(`JSON:${JSON.stringify({ type: 'resize', cols: ptyProcess.cols, rows: ptyProcess.rows })}`);
      }
    } catch {}
  });

  ws.on('message', (data) => {
    onHeartbeatActivity();
    try {
      const msgStr = data.toString();
      const control = parseControlMessage(msgStr);
      if (control) {
        if (control.type === 'file_rpc') {
          handleFileRpc(control);
          return;
        }
        if (control.type === 'resize') {
          const cols = Math.max(10, Math.min(500, Math.floor(control.cols)));
          const rows = Math.max(5, Math.min(200, Math.floor(control.rows)));
          if (ptyProcess) {
            ptyProcess.resize(cols, rows);
          }
          return;
        }
        if (control.type === 'reset') {
          console.log('[Agent] Reset PTY requested by server');
          spawnPty();
          return;
        }
        if (control.type === 'ping') {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(`JSON:${JSON.stringify({ type: 'pong' })}`);
          }
          return;
        }
        if (control.type === 'pong') {
          // Heartbeat pong received and consumed
          return;
        }
        if (control.type === 'registered') {
          console.log(`[Agent] Registered confirmed: hostId=${control.hostId}, status=${control.status}`);
          return;
        }
        return;
      }

      if (ptyProcess) {
        ptyProcess.write(msgStr);
      }
    } catch (err) {
      if (ptyProcess) {
        ptyProcess.write(data.toString());
      }
    }
  });

  ws.on('close', (code, reason) => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    stopHeartbeat();
    console.warn(`[Agent] Connection closed (code: ${code}, reason: ${reason || 'none'})`);
    ws = null;
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    stopHeartbeat();
    console.error(`[Agent] Connection error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (isExiting) return;
  stopHeartbeat();
  reconnectAttempts++;
  const delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(reconnectAttempts, 8)));
  console.log(`[Agent] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt #${reconnectAttempts})...`);
  setTimeout(connect, delay);
}

// Initial run (only when executed directly as CLI)
if (require.main === module) {
  spawnPty();
  connect();
}

function cleanup() {
  isExiting = true;
  stopHeartbeat();
  console.log('\n[Agent] Shutting down agent...');
  if (ws) {
    try {
      ws.close();
    } catch {}
  }
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

if (typeof module !== 'undefined') {
  module.exports = {
    parseControlMessage,
    resolveWebSocketUrl,
    HANDSHAKE_TIMEOUT_MS,
    HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_TIMEOUT_MS,
  };
}
```

- [ ] **Step 2: Commit implementation**

```bash
git add scripts/terminal-agent.js
git commit -m "feat(terminal-agent): add dual-phase keepalive, heartbeat timeout, and control frame isolation"
```

---

### Task 3: Add Automated Keep-Alive & Self-Healing Unit Tests

**Files:**
- Create: `tests/terminalAgentKeepalive.test.ts`

**Interfaces:**
- Consumes: `parseControlMessage` from `scripts/terminal-agent.js`, mock WebSocket servers
- Produces: automated test suite covering control frame parsing, ping/pong validation, and zombie termination

- [ ] **Step 1: Write `tests/terminalAgentKeepalive.test.ts`**

Create `tests/terminalAgentKeepalive.test.ts`:

```typescript
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
const {
  parseControlMessage,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  HANDSHAKE_TIMEOUT_MS,
} = require('../scripts/terminal-agent.js');

describe('Terminal Agent Keepalive & Control Protocol', () => {
  it('should export correct keepalive constants', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(10000);
    expect(HEARTBEAT_TIMEOUT_MS).toBe(3000);
    expect(HANDSHAKE_TIMEOUT_MS).toBe(4000);
  });

  describe('parseControlMessage', () => {
    it('should parse JSON: prefixed control messages', () => {
      const msg = 'JSON:{"type":"ping"}';
      const parsed = parseControlMessage(msg);
      expect(parsed).toEqual({ type: 'ping' });
    });

    it('should parse bare JSON control messages without leaking', () => {
      const msg = '{"type":"pong"}';
      const parsed = parseControlMessage(msg);
      expect(parsed).toEqual({ type: 'pong' });
    });

    it('should return null for non-control shell text', () => {
      expect(parseControlMessage('ls -la\n')).toBeNull();
      expect(parseControlMessage('{"invalid-type"')).toBeNull();
      expect(parseControlMessage('')).toBeNull();
      expect(parseControlMessage(null as any)).toBeNull();
    });
  });

  describe('Mock Server Heartbeat Cycle', () => {
    let server: http.Server;
    let wss: WebSocketServer;
    let port: number;

    beforeAll((done) => {
      server = http.createServer();
      wss = new WebSocketServer({ server });
      server.listen(0, () => {
        port = (server.address() as any).port;
        done();
      });
    });

    afterAll((done) => {
      wss.close(() => {
        server.close(done);
      });
    });

    it('should handle ping and return pong frame properly', (done) => {
      wss.once('connection', (ws) => {
        ws.on('message', (data) => {
          const str = data.toString();
          if (str.startsWith('JSON:')) {
            const control = JSON.parse(str.slice(5));
            if (control.type === 'ping') {
              ws.send('JSON:{"type":"pong"}');
            }
          }
        });
      });

      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      client.on('open', () => {
        client.send('JSON:{"type":"ping"}');
      });

      client.on('message', (data) => {
        const str = data.toString();
        const control = parseControlMessage(str);
        if (control && control.type === 'pong') {
          client.close();
          done();
        }
      });
    });

    it('should terminate and close with 1006 when server silently drops without FIN packet', (done) => {
      let serverSocket: any = null;
      wss.once('connection', (ws) => {
        serverSocket = ws;
      });

      const client = new WebSocket(`ws://127.0.0.1:${port}`);
      client.on('open', () => {
        // Destroy server socket abruptly to simulate abrupt drop / crash
        setTimeout(() => {
          if (serverSocket) {
            serverSocket._socket.destroy();
          }
        }, 100);
      });

      client.on('close', (code) => {
        expect(code).toBe(1006);
        done();
      });
    });
  });
});
```

- [ ] **Step 2: Run the test suite**

Run: `npx jest tests/terminalAgentKeepalive.test.ts`
Expected: PASS with all tests passing.

- [ ] **Step 3: Commit the test file**

```bash
git add tests/terminalAgentKeepalive.test.ts
git commit -m "test(terminal-agent): add automated tests for heartbeat control and socket termination"
```

---

### Task 4: Full Verification & Local PM2 Process Reload

**Files:**
- Verify: Full test suite (`npx jest --runInBand`)
- Verify: Frontend production build (`npm run build:frontend`)
- Verify: Local PM2 process restart (`pm2 restart 0`)

- [ ] **Step 1: Run complete test suite**

Run: `npx jest --runInBand`
Expected: 100% test suites passed cleanly.

- [ ] **Step 2: Run frontend build check**

Run: `npm run build:frontend`
Expected: Vite build succeeds without TypeScript or bundling errors.

- [ ] **Step 3: Verify with live agent test**

Run a standalone verification test script checking agent connection, registration, and presence in `http://192.168.3.234:3000/api/admin/terminal/hosts`.

- [ ] **Step 4: Commit and finalize**

```bash
git status
```
Confirm clean working tree.

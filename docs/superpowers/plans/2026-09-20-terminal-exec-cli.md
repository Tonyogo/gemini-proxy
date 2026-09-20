# Terminal Remote Command Execution CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a standalone, ergonomic CLI tool (`scripts/terminal-exec.js`) with an npm script entry (`npm run terminal-exec`) that executes remote shell commands via Gemini Proxy's standalone exec engine, streaming output live with proper exit code forwarding, supporting non-blocking async execution, and providing task lifecycle subcommands (`status`, `list`, `kill`).

**Architecture:**
1. `scripts/terminal-exec.js`: Node.js CLI script using native `http`/`https` (zero external HTTP dependencies) with subcommands (`exec` [default], `status`, `kill`, `list`).
2. Live follow loop: Post command -> get `taskId` -> poll `GET /api/terminal/exec/:hostId/:taskId?offset=...` incrementally every 500ms -> stream stdout/stderr chunks -> exit with remote command's `exitCode`.
3. Signal handling: On local `SIGINT` (Ctrl+C), send a kill request to the remote task to prevent orphaned processes, then exit cleanly.
4. Host enforcement: Validate `-H, --host` or `TERMINAL_HOST` environment variable before issuing requests.
5. Integration: Add `"terminal-exec": "node scripts/terminal-exec.js"` to `package.json` scripts and document usage in CLAUDE.md.

**Tech Stack:** Node.js (CommonJS), Express (Server API), Jest.

## Global Constraints
- **Zero Third-Party HTTP Dependencies**: Use native Node.js `http` / `https` module in `scripts/terminal-exec.js` so it runs seamlessly in minimal Node environments without installing extra packages.
- **Strict Host Enforcement**: If `--host` / `-H` is missing and `TERMINAL_HOST` is unset, immediately display an actionable error message and exit with code 1.
- **Accurate Exit Codes**: CLI process must exit with the remote process's exact `exitCode` upon completion.
- **Non-blocking Async Mode**: With `--async`, print task ID immediately and exit with code 0 without waiting.

---

### Task 1: CLI Execution Script Core & Argument Parsing

**Files:**
- Create: `scripts/terminal-exec.js`
- Test: `tests/terminalExecCli.test.ts`

**Interfaces:**
- CLI Syntax:
  - `terminal-exec [options] <command>`
  - `terminal-exec status [options] <taskId>`
  - `terminal-exec kill [options] <taskId>`
  - `terminal-exec list [options]`
- Options:
  - `-H, --host <hostId>` (or `options.host`, env `TERMINAL_HOST`)
  - `-s, --server <url>` (or `options.server`, env `TERMINAL_SERVER`, default `http://localhost:3000`)
  - `-k, --key <secret>` (or `options.key`, env `ADMIN_SECRET_KEY`)
  - `--cwd <path>`
  - `--timeout <ms>` (default `300000`)
  - `-a, --async`
  - `--poll-interval <ms>` (default `500`)
  - `--json`
  - `-h, --help`

- [ ] **Step 1: Write failing test for argument parsing and missing host validation**

Create `tests/terminalExecCli.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';

const cliPath = path.resolve(__dirname, '../scripts/terminal-exec.js');

function runCli(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [cliPath, ...args], {
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error.code ?? 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString()
      });
    });
  });
}

describe('Terminal Exec CLI', () => {
  it('shows help information with --help', async () => {
    const res = await runCli(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Usage:');
    expect(res.stdout).toContain('--host');
  });

  it('fails with code 1 if --host is missing and TERMINAL_HOST is unset', async () => {
    const res = await runCli(['echo 1'], { TERMINAL_HOST: '' });
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Missing target host');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalExecCli.test.ts`
Expected: FAIL because `scripts/terminal-exec.js` does not exist yet.

- [ ] **Step 3: Implement `scripts/terminal-exec.js`**

Create `scripts/terminal-exec.js`:
```javascript
#!/usr/bin/env node

/**
 * Gemini Proxy Remote Terminal Command Execution CLI
 * Executes standalone commands on remote reverse terminal agent nodes with real-time log streaming.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Attempt loading .env if dotenv is present or via manual fallback
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: envPath });
  } catch {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = (match[2] || '').replace(/^["']|["']$/g, '').trim();
      }
    }
  }
}

function printHelp() {
  console.log(`
Gemini Proxy - Remote Terminal Command Execution CLI

Usage:
  terminal-exec [options] <command>
  terminal-exec status [options] <taskId>
  terminal-exec kill [options] <taskId>
  terminal-exec list [options]

Commands:
  <command>               Execute a command on the remote host and stream logs (default)
  status <taskId>         Inspect the status and full output of a remote task
  kill <taskId>           Terminate a running remote task
  list                    List recent execution tasks on the target host

Options:
  -H, --host <hostId>     Target host ID (Required, or set TERMINAL_HOST)
  -s, --server <url>      Proxy server base URL (Default: env TERMINAL_SERVER or http://localhost:3000)
  -k, --key <secret>      Admin secret key (Default: env ADMIN_SECRET_KEY)
  --cwd <path>            Working directory on the remote host
  --timeout <ms>          Remote process timeout in ms (Default: 300000)
  -a, --async             Submit task and exit immediately without streaming output
  --poll-interval <ms>    Polling interval in ms for live log stream (Default: 500)
  --json                  Output raw JSON responses instead of formatted text
  -h, --help              Show this help menu
`);
}

function parseArgs(rawArgs) {
  const options = {
    server: process.env.TERMINAL_SERVER || process.env.GEMINI_PROXY_URL || 'http://localhost:3000',
    key: process.env.ADMIN_SECRET_KEY || '',
    host: process.env.TERMINAL_HOST || '',
    cwd: undefined,
    timeoutMs: 300000,
    async: false,
    pollInterval: 500,
    json: false,
    help: false,
  };

  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-a' || arg === '--async') {
      options.async = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '-H' || arg === '--host') {
      options.host = rawArgs[++i];
    } else if (arg.startsWith('--host=')) {
      options.host = arg.slice(7);
    } else if (arg === '-s' || arg === '--server') {
      options.server = rawArgs[++i];
    } else if (arg.startsWith('--server=')) {
      options.server = arg.slice(9);
    } else if (arg === '-k' || arg === '--key') {
      options.key = rawArgs[++i];
    } else if (arg.startsWith('--key=')) {
      options.key = arg.slice(6);
    } else if (arg === '--cwd') {
      options.cwd = rawArgs[++i];
    } else if (arg.startsWith('--cwd=')) {
      options.cwd = arg.slice(6);
    } else if (arg === '--timeout') {
      options.timeoutMs = parseInt(rawArgs[++i], 10);
    } else if (arg.startsWith('--timeout=')) {
      options.timeoutMs = parseInt(arg.slice(10), 10);
    } else if (arg === '--poll-interval') {
      options.pollInterval = parseInt(rawArgs[++i], 10);
    } else if (arg.startsWith('--poll-interval=')) {
      options.pollInterval = parseInt(arg.slice(16), 10);
    } else {
      positional.push(arg);
    }
  }

  let subcommand = 'exec';
  let targetArg = '';

  if (positional.length > 0) {
    const first = positional[0].toLowerCase();
    if (['status', 'kill', 'list'].includes(first)) {
      subcommand = first;
      targetArg = positional.slice(1).join(' ').trim();
    } else {
      subcommand = 'exec';
      targetArg = positional.join(' ').trim();
    }
  }

  return { options, subcommand, targetArg };
}

function makeRequest({ serverUrl, endpoint, method = 'GET', body = null, apiKey = '' }) {
  return new Promise((resolve, reject) => {
    const fullUrl = new url.URL(endpoint, serverUrl);
    const isHttps = fullUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['x-admin-key'] = apiKey;
    }

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const reqOptions = {
      protocol: fullUrl.protocol,
      hostname: fullUrl.hostname,
      port: fullUrl.port || (isHttps ? 443 : 80),
      path: `${fullUrl.pathname}${fullUrl.search}`,
      method: method.toUpperCase(),
      headers,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = { raw: data };
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { options, subcommand, targetArg } = parseArgs(rawArgs);

  if (options.help || (rawArgs.length === 0 && !options.host)) {
    printHelp();
    process.exit(0);
  }

  if (!options.host || !options.host.trim()) {
    console.error('Error: Missing target host. Please specify --host=<hostId> or set TERMINAL_HOST environment variable.');
    process.exit(1);
  }

  const hostId = options.host.trim();
  const server = options.server.replace(/\/+$/, '');
  const key = options.key;

  try {
    if (subcommand === 'list') {
      const res = await makeRequest({
        serverUrl: server,
        endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}`,
        method: 'GET',
        apiKey: key,
      });

      if (options.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else if (res.data && res.data.success && Array.isArray(res.data.tasks)) {
        console.log(`\n=== Recent Tasks on [${hostId}] ===\n`);
        if (res.data.tasks.length === 0) {
          console.log('No recent execution tasks recorded.');
        } else {
          for (const t of res.data.tasks) {
            const time = new Date(t.startTime).toLocaleTimeString();
            console.log(`- ${t.taskId} [${t.status}] (exit: ${t.exitCode ?? '-'}) @ ${time} -> ${t.command}`);
          }
        }
        console.log();
      } else {
        console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
        process.exit(1);
      }
      process.exit(0);
    }

    if (subcommand === 'status') {
      if (!targetArg) {
        console.error('Error: Missing <taskId> for status subcommand.');
        process.exit(1);
      }
      const taskId = targetArg.trim();
      const res = await makeRequest({
        serverUrl: server,
        endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}`,
        method: 'GET',
        apiKey: key,
      });

      if (options.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else if (res.data && res.data.success) {
        const d = res.data;
        console.log(`Task:     ${d.taskId}`);
        console.log(`Host:     ${d.hostId}`);
        console.log(`Status:   ${d.status}`);
        console.log(`ExitCode: ${d.exitCode !== null ? d.exitCode : 'N/A'}`);
        console.log(`Duration: ${d.startTime ? ((d.endTime ? d.endTime - d.startTime : Date.now() - d.startTime) / 1000).toFixed(2) + 's' : 'N/A'}`);
        if (d.output) {
          console.log('\n--- Output ---');
          console.log(d.output);
        }
      } else {
        console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
        process.exit(1);
      }
      process.exit(0);
    }

    if (subcommand === 'kill') {
      if (!targetArg) {
        console.error('Error: Missing <taskId> for kill subcommand.');
        process.exit(1);
      }
      const taskId = targetArg.trim();
      const res = await makeRequest({
        serverUrl: server,
        endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}/kill`,
        method: 'POST',
        body: { signal: 'SIGTERM' },
        apiKey: key,
      });

      if (options.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else if (res.data && res.data.success) {
        console.log(`Kill signal sent to task [${taskId}] on host [${hostId}].`);
      } else {
        console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
        process.exit(1);
      }
      process.exit(0);
    }

    // Default: 'exec' subcommand
    if (!targetArg) {
      console.error('Error: No command specified to execute.');
      process.exit(1);
    }

    const command = targetArg;
    const startRes = await makeRequest({
      serverUrl: server,
      endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}`,
      method: 'POST',
      body: {
        command,
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
      },
      apiKey: key,
    });

    if (!startRes.data || !startRes.data.success) {
      console.error(`Error starting task on [${hostId}]: ${startRes.data?.error || `HTTP ${startRes.status}`}`);
      process.exit(1);
    }

    const { taskId } = startRes.data;

    // Asynchronous mode: print taskId and exit
    if (options.async) {
      if (options.json) {
        console.log(JSON.stringify(startRes.data, null, 2));
      } else {
        console.log(`Task submitted to [${hostId}]: ${taskId}`);
      }
      process.exit(0);
    }

    // Streaming follow mode
    let offset = 0;
    let isTerminated = false;

    // Hook SIGINT to kill remote process
    process.on('SIGINT', async () => {
      if (isTerminated) process.exit(130);
      isTerminated = true;
      process.stderr.write('\n[Interrupted] Sending termination signal to remote task...\n');
      try {
        await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}/kill`,
          method: 'POST',
          body: { signal: 'SIGTERM' },
          apiKey: key,
        });
      } catch {}
      process.exit(130);
    });

    const poll = async () => {
      try {
        const pollRes = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}?offset=${offset}`,
          method: 'GET',
          apiKey: key,
        });

        if (pollRes.data && pollRes.data.success) {
          const t = pollRes.data;
          if (t.stdout) {
            process.stdout.write(t.stdout);
          }
          if (t.stderr) {
            process.stderr.write(t.stderr);
          }
          offset = t.outputOffset !== undefined ? t.outputOffset : (offset + (t.stdout ? t.stdout.length : 0) + (t.stderr ? t.stderr.length : 0));

          if (t.status !== 'running') {
            const code = t.exitCode !== null && t.exitCode !== undefined ? t.exitCode : (t.status === 'completed' ? 0 : 1);
            process.exit(code);
          }
        }
      } catch (err) {
        // Network blip, retry next tick
      }
      setTimeout(poll, options.pollInterval);
    };

    poll();
  } catch (err) {
    console.error(`Execution failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, makeRequest };
```

- [ ] **Step 4: Add npm script in `package.json`**

In `package.json`, add `"terminal-exec": "node scripts/terminal-exec.js"` under `"scripts"`.

- [ ] **Step 5: Run tests to verify basic parsing and help**

Run: `npx jest tests/terminalExecCli.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/terminal-exec.js tests/terminalExecCli.test.ts package.json
git commit -m "feat(terminal): add standalone remote command execution CLI tool"
```

---

### Task 2: CLI Integration Testing with Mock Server

**Files:**
- Modify: `tests/terminalExecCli.test.ts`

**Interfaces:**
- Test HTTP server verifying:
  - `POST /api/terminal/exec/:hostId` starts task and returns 202.
  - `GET /api/terminal/exec/:hostId/:taskId?offset=...` streams logs and finishes.
  - Exit code inherits remote task exit code.
  - `list`, `status`, `kill` subcommands.

- [ ] **Step 1: Write integration tests in `tests/terminalExecCli.test.ts`**

Add tests covering server interaction:
```typescript
import http from 'http';

describe('Terminal Exec CLI Integration', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/node-1') {
        res.statusCode = 202;
        res.end(JSON.stringify({ success: true, taskId: 'task-123' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-1/task-123') {
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        if (offset === 0) {
          res.statusCode = 200;
          res.end(JSON.stringify({
            success: true,
            status: 'completed',
            exitCode: 0,
            stdout: 'Hello World\n',
            stderr: '',
            outputOffset: 12,
          }));
        } else {
          res.statusCode = 200;
          res.end(JSON.stringify({
            success: true,
            status: 'completed',
            exitCode: 0,
            stdout: '',
            stderr: '',
            outputOffset: 12,
          }));
        }
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          tasks: [{ taskId: 'task-123', status: 'completed', exitCode: 0, command: 'ls' }]
        }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/node-1/task-123/kill') {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('runs command in streaming mode, prints stdout, and exits with 0', async () => {
    const res = await runCli(['--host=node-1', `--server=http://localhost:${serverPort}`, 'echo test']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Hello World');
  });

  it('submits task in async mode without polling', async () => {
    const res = await runCli(['--host=node-1', `--server=http://localhost:${serverPort}`, '--async', 'echo test']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('task-123');
  });

  it('lists tasks with list subcommand', async () => {
    const res = await runCli(['list', '--host=node-1', `--server=http://localhost:${serverPort}`]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('task-123');
  });

  it('kills task with kill subcommand', async () => {
    const res = await runCli(['kill', '--host=node-1', `--server=http://localhost:${serverPort}`, 'task-123']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Kill signal sent');
  });
});
```

- [ ] **Step 2: Run test to verify integration passes**

Run: `npx jest tests/terminalExecCli.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/terminalExecCli.test.ts
git commit -m "test(terminal): add integration tests for terminal-exec CLI"
```

---

### Task 3: Documentation Update in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document `npm run terminal-exec` in CLAUDE.md**

In `CLAUDE.md`, under `Development Commands` and `Architecture & Structure -> WebTerminal & Multi-Host Reverse Agent`, document the new CLI command:
- `npm run terminal-exec -- --host=<host-id> "command"`
- Provide options summary (`--async`, `status`, `list`, `kill`).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with terminal-exec CLI usage"
```

---

### Task 4: Full Regression & Verification

**Files:**
- Full test suite
- Full build

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All test suites pass.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: 0 errors.

- [ ] **Step 3: Commit any lingering changes**

```bash
git status
git commit -m "chore: complete terminal remote command execution CLI implementation"
```

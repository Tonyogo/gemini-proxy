# `gt` (Gemini Terminal) Unified Docker-Style CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the unified Docker-style CLI tool `gt` (`scripts/gt.js`) supporting client subcommands (`hosts`, `exec`, `ps`, `logs`, `kill`) and agent hosting (`agent`), with POSIX `--` argument pass-through, live output streaming, explicit execution banners, exit-code inheritance, and update `package.json` and documentation.

**Architecture:**
1. `scripts/gt.js`: Single executable Node.js script using native `http`/`https` (zero external HTTP dependencies) with subcommands dispatched via standard Docker CLI patterns.
2. `gt agent`: Bridges directly to the agent runtime in `scripts/terminal-agent.js` or shares the agent daemon logic seamlessly.
3. `gt exec`: Dispatches execution to `/api/terminal/exec/:hostId`, prints `>>> [host] $ cmd` to `stderr`, polls output progressively every 500ms, streams stdout/stderr, intercepts `SIGINT` to kill the remote process, and prints `<<< [host] completed with code 0 (1.42s)`.
4. `gt hosts`: Queries `/api/terminal/hosts` and renders an aligned ASCII table (ID, Name, Status, Platform, IP, Last Seen).
5. `gt ps`, `gt logs`, `gt kill`: Manages remote task lifecycles cleanly.

**Tech Stack:** Node.js (CommonJS), Express, Jest.

## Global Constraints
- **Zero New HTTP Dependencies**: Use native Node.js `http`/`https` modules.
- **Docker-Style Argument Parsing**: Strict positional arguments for subcommands; `--` cleanly demarcates remote commands.
- **Diagnostics to `stderr`**: All banner text (`>>>`, `<<<`) goes to `stderr`; stdout contains only actual command output.
- **Exit Code Integrity**: `gt exec` must exit with the remote command's actual `exitCode`.

---

### Task 1: Core `gt` CLI Implementation & Dispatch Engine

**Files:**
- Create: `scripts/gt.js`
- Test: `tests/gtCli.test.ts`
- Modify: `package.json`

**Interfaces:**
- `gt hosts [--json]`
- `gt exec [-d|--detach] [-w|--workdir <dir>] [-t|--timeout <ms>] [-q|--quiet] [-e KEY=VAL] <host> [--] <cmd...>`
- `gt ps <host> [--json]`
- `gt logs <host> <taskId> [--json]`
- `gt kill <host> <taskId> [--json]`
- `gt agent [options]`
- `gt --help` / `gt -v` / `gt --version`

- [ ] **Step 1: Write failing unit & dispatch test for `gt` CLI**

Create `tests/gtCli.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

function runGt(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [gtPath, ...args], {
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

describe('gt (Gemini Terminal) CLI', () => {
  it('displays help information with --help', async () => {
    const res = await runGt(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('gt [GLOBAL_OPTIONS] COMMAND [ARGS...]');
    expect(res.stdout).toContain('hosts');
    expect(res.stdout).toContain('exec');
    expect(res.stdout).toContain('ps');
    expect(res.stdout).toContain('logs');
    expect(res.stdout).toContain('kill');
    expect(res.stdout).toContain('agent');
  });

  it('displays version information with --version', async () => {
    const res = await runGt(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/gt version \d+\.\d+\.\d+/);
  });

  it('rejects unknown commands with helpful error', async () => {
    const res = await runGt(['unknown-cmd']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Unknown command: unknown-cmd');
  });

  it('requires HOST argument for exec', async () => {
    const res = await runGt(['exec']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Missing target host');
  });

  it('requires COMMAND argument for exec', async () => {
    const res = await runGt(['exec', 'my-server']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Missing command to execute');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtCli.test.ts`
Expected: FAIL because `scripts/gt.js` does not exist.

- [ ] **Step 3: Implement `scripts/gt.js`**

Create `scripts/gt.js`:
```javascript
#!/usr/bin/env node

/**
 * gt (Gemini Terminal) - Unified Docker-Style Terminal CLI
 * Client operations (hosts, exec, ps, logs, kill) and agent runner (agent).
 */

const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Version metadata
const VERSION = '1.0.0';

// Auto-load .env from working directory
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
gt (Gemini Terminal) - Unified Docker-Style Terminal CLI

Usage:
  gt [GLOBAL_OPTIONS] COMMAND [ARGS...]

Commands:
  hosts                   List connected terminal agent hosts (like 'docker node ls')
  exec [OPTIONS] HOST CMD Execute a command on a remote host (like 'docker exec')
  ps HOST                 List active and recent tasks on a host (like 'docker ps')
  logs HOST TASK_ID       View execution logs for a task (like 'docker logs')
  kill HOST TASK_ID       Terminate a running task on a host (like 'docker kill')
  agent [OPTIONS]         Run reverse terminal agent daemon on this machine

Global Options:
  -s, --server <url>      Proxy server URL (Default: env TERMINAL_SERVER or http://localhost:3000)
  -k, --key <secret>      Admin secret key (Default: env ADMIN_SECRET_KEY)
  --json                  Output in JSON format
  -v, --version           Print version information
  -h, --help              Show this help menu

Exec Options:
  -d, --detach            Run command in background and print task ID
  -w, --workdir <dir>     Working directory on remote host (alias: --cwd)
  -t, --timeout <ms>      Execution timeout in ms (Default: 300000 / 5 min)
  -e, --env <KEY=VAL>     Set remote environment variable (can be repeated)
  -q, --quiet             Suppress execution header and footer banners
  --poll-interval <ms>    Polling interval for log stream in ms (Default: 500)

Examples:
  gt hosts
  gt exec my-server uptime
  gt exec -w /var/www my-server ls -la
  gt exec my-server -- curl -s https://example.com
  gt exec -d my-server "sleep 60 && echo done"
  gt ps my-server
  gt logs my-server task-1726830000-abc123
  gt kill my-server task-1726830000-abc123
  gt agent --server=http://proxy:3000 --key=admin --name=my-server
`);
}

function makeRequest({ serverUrl, endpoint, method = 'GET', body = null, apiKey = '' }) {
  return new Promise((resolve, reject) => {
    const serverParsed = new url.URL(serverUrl);
    const isHttps = serverParsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const [epPath, epQuery] = endpoint.split('?');
    const basePath = serverParsed.pathname.replace(/\/+$/, '');
    const finalPathname = (basePath + '/' + epPath.replace(/^\/+/, '')).replace(/\/+/g, '/');
    const finalSearch = epQuery ? `?${epQuery}` : '';

    const headers = { 'Accept': 'application/json' };
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
      protocol: serverParsed.protocol,
      hostname: serverParsed.hostname,
      port: serverParsed.port || (isHttps ? 443 : 80),
      path: `${finalPathname}${finalSearch}`,
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

    req.on('error', (err) => { reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  if (diff < 10000) return 'Just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

async function main() {
  const rawArgs = process.argv.slice(2);

  // Global flag scan prior to command
  let server = process.env.TERMINAL_SERVER || process.env.GEMINI_PROXY_URL || 'http://localhost:3000';
  let key = process.env.ADMIN_SECRET_KEY || '';
  let jsonOutput = false;

  const filteredArgs = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '-v' || a === '--version') {
      console.log(`gt version ${VERSION}`);
      process.exit(0);
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (a === '--json') {
      jsonOutput = true;
    } else if (a === '-s' || a === '--server') {
      server = rawArgs[++i];
    } else if (a.startsWith('--server=')) {
      server = a.slice(9);
    } else if (a === '-k' || a === '--key') {
      key = rawArgs[++i];
    } else if (a.startsWith('--key=')) {
      key = a.slice(6);
    } else {
      filteredArgs.push(a);
    }
  }

  if (filteredArgs.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = filteredArgs[0].toLowerCase();
  const cmdArgs = filteredArgs.slice(1);

  // Dispatch Commands
  switch (command) {
    case 'hosts':
    case 'nodes': {
      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: '/api/terminal/hosts',
          method: 'GET',
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && Array.isArray(res.data.hosts)) {
          const hosts = res.data.hosts;
          if (hosts.length === 0) {
            console.log('No connected terminal agent hosts found.');
            process.exit(0);
          }

          // Format aligned table
          console.log(
            'HOST ID'.padEnd(20) +
            'NAME'.padEnd(20) +
            'STATUS'.padEnd(12) +
            'PLATFORM'.padEnd(12) +
            'IP'.padEnd(18) +
            'LAST SEEN'
          );
          console.log('-'.repeat(90));

          for (const h of hosts) {
            const statusStr = h.status === 'online' ? 'online' : 'offline';
            console.log(
              (h.id || '').padEnd(20) +
              (h.name || h.hostname || '').padEnd(20) +
              statusStr.padEnd(12) +
              (h.platform || '').padEnd(12) +
              (h.ip || '').padEnd(18) +
              formatRelativeTime(h.lastSeen)
            );
          }
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to query hosts: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'ps': {
      if (cmdArgs.length === 0) {
        console.error('Error: Missing target host. Usage: gt ps HOST');
        process.exit(1);
      }
      const hostId = cmdArgs[0];
      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}`,
          method: 'GET',
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && res.data.success && Array.isArray(res.data.tasks)) {
          const tasks = res.data.tasks;
          if (tasks.length === 0) {
            console.log(`No recent tasks recorded on [${hostId}].`);
            process.exit(0);
          }

          console.log(
            'TASK ID'.padEnd(26) +
            'STATUS'.padEnd(12) +
            'EXIT'.padEnd(8) +
            'START TIME'.padEnd(14) +
            'COMMAND'
          );
          console.log('-'.repeat(80));

          for (const t of tasks) {
            const timeStr = new Date(t.startTime).toLocaleTimeString();
            const exitStr = t.exitCode !== null && t.exitCode !== undefined ? String(t.exitCode) : '-';
            console.log(
              t.taskId.padEnd(26) +
              t.status.padEnd(12) +
              exitStr.padEnd(8) +
              timeStr.padEnd(14) +
              t.command
            );
          }
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to list tasks on [${hostId}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'logs': {
      if (cmdArgs.length < 2) {
        console.error('Error: Missing arguments. Usage: gt logs HOST TASK_ID');
        process.exit(1);
      }
      const hostId = cmdArgs[0];
      const taskId = cmdArgs[1];

      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}`,
          method: 'GET',
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && res.data.success) {
          const d = res.data;
          console.log(`Task:     ${d.taskId}`);
          console.log(`Host:     ${d.hostId}`);
          console.log(`Status:   ${d.status}`);
          console.log(`ExitCode: ${d.exitCode !== null && d.exitCode !== undefined ? d.exitCode : 'N/A'}`);
          if (d.output) {
            console.log('\n--- Output ---');
            process.stdout.write(d.output);
            if (!d.output.endsWith('\n')) console.log();
          }
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to get logs for [${taskId}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'kill': {
      if (cmdArgs.length < 2) {
        console.error('Error: Missing arguments. Usage: gt kill HOST TASK_ID');
        process.exit(1);
      }
      const hostId = cmdArgs[0];
      const taskId = cmdArgs[1];

      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}/kill`,
          method: 'POST',
          body: { signal: 'SIGTERM' },
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && res.data.success) {
          console.log(`Kill signal sent to task [${taskId}] on host [${hostId}].`);
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to kill task [${taskId}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'agent': {
      // Delegate execution directly to scripts/terminal-agent.js
      const agentScript = path.resolve(__dirname, 'terminal-agent.js');
      const { fork } = require('child_process');
      const child = fork(agentScript, cmdArgs, { stdio: 'inherit' });
      child.on('exit', (code) => { process.exit(code || 0); });
      break;
    }

    case 'exec': {
      // Docker-style argument parsing
      let detach = false;
      let workdir = undefined;
      let timeoutMs = 300000;
      let quiet = false;
      let pollInterval = 500;
      const envVars = {};

      let host = '';
      const commandParts = [];
      let isPassthrough = false;

      for (let i = 0; i < cmdArgs.length; i++) {
        const a = cmdArgs[i];
        if (isPassthrough) {
          commandParts.push(a);
          continue;
        }

        if (a === '--') {
          isPassthrough = true;
          continue;
        }

        if (a === '-d' || a === '--detach') {
          detach = true;
        } else if (a === '-q' || a === '--quiet') {
          quiet = true;
        } else if (a === '-w' || a === '--workdir' || a === '--cwd') {
          workdir = cmdArgs[++i];
        } else if (a.startsWith('-w=')) {
          workdir = a.slice(3);
        } else if (a.startsWith('--workdir=')) {
          workdir = a.slice(10);
        } else if (a.startsWith('--cwd=')) {
          workdir = a.slice(6);
        } else if (a === '-t' || a === '--timeout') {
          timeoutMs = parseInt(cmdArgs[++i], 10);
        } else if (a.startsWith('--timeout=')) {
          timeoutMs = parseInt(a.slice(10), 10);
        } else if (a === '--poll-interval') {
          pollInterval = parseInt(cmdArgs[++i], 10);
        } else if (a === '-e' || a === '--env') {
          const pair = cmdArgs[++i] || '';
          const eq = pair.indexOf('=');
          if (eq !== -1) {
            envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
          }
        } else if (a.startsWith('-e=')) {
          const pair = a.slice(3);
          const eq = pair.indexOf('=');
          if (eq !== -1) envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
        } else if (!host) {
          host = a;
        } else {
          commandParts.push(a);
        }
      }

      if (!host) {
        console.error('Error: Missing target host. Usage: gt exec [OPTIONS] HOST COMMAND [ARGS...]');
        process.exit(1);
      }

      const fullCommand = commandParts.join(' ').trim();
      if (!fullCommand) {
        console.error('Error: Missing command to execute.');
        process.exit(1);
      }

      const startTime = Date.now();

      if (!quiet) {
        process.stderr.write(`>>> [${host}] $ ${fullCommand}\n`);
      }

      try {
        const startRes = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(host)}`,
          method: 'POST',
          body: {
            command: fullCommand,
            cwd: workdir,
            timeoutMs,
            env: envVars,
          },
          apiKey: key,
        });

        if (!startRes.data || !startRes.data.success) {
          console.error(`Error starting task on [${host}]: ${startRes.data?.error || `HTTP ${startRes.status}`}`);
          process.exit(1);
        }

        const { taskId } = startRes.data;

        if (detach) {
          if (jsonOutput) {
            console.log(JSON.stringify(startRes.data, null, 2));
          } else {
            console.log(taskId);
          }
          process.exit(0);
        }

        // Live stream following
        let offset = 0;
        let isTerminated = false;
        let consecutiveErrors = 0;

        process.on('SIGINT', async () => {
          if (isTerminated) process.exit(130);
          isTerminated = true;
          process.stderr.write(`\n[Interrupted] Terminating remote task [${taskId}]...\n`);
          try {
            await makeRequest({
              serverUrl: server,
              endpoint: `/api/terminal/exec/${encodeURIComponent(host)}/${encodeURIComponent(taskId)}/kill`,
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
              endpoint: `/api/terminal/exec/${encodeURIComponent(host)}/${encodeURIComponent(taskId)}?offset=${offset}`,
              method: 'GET',
              apiKey: key,
            });

            if (pollRes.data && pollRes.data.success) {
              consecutiveErrors = 0;
              const t = pollRes.data;
              if (t.stdout) process.stdout.write(t.stdout);
              if (t.stderr) process.stderr.write(t.stderr);

              offset = t.outputOffset !== undefined ? t.outputOffset : (offset + (t.stdout ? t.stdout.length : 0) + (t.stderr ? t.stderr.length : 0));

              if (t.status !== 'running') {
                const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
                const exitCode = t.exitCode !== null && t.exitCode !== undefined ? t.exitCode : (t.status === 'completed' ? 0 : 1);

                if (!quiet) {
                  if (exitCode === 0) {
                    process.stderr.write(`<<< [${host}] Command completed with code 0 (took ${durationSec}s)\n`);
                  } else {
                    process.stderr.write(`<<< [${host}] Command failed with code ${exitCode} (${t.status}, took ${durationSec}s)\n`);
                  }
                }
                process.exit(exitCode);
              }
            } else {
              consecutiveErrors++;
            }
          } catch (err) {
            consecutiveErrors++;
          }

          if (consecutiveErrors >= 5) {
            console.error(`\n<<< [${host}] Connection lost while streaming task [${taskId}]. Aborting.`);
            process.exit(1);
          }

          setTimeout(poll, pollInterval);
        };

        poll();
      } catch (err) {
        console.error(`Failed to execute on [${host}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Error: Unknown command: ${command}`);
      console.error("Run 'gt --help' for usage.");
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { formatRelativeTime, makeRequest };
```

- [ ] **Step 4: Update `package.json` with `bin` and script entries**

In `package.json`:
```json
  "bin": {
    "gt": "./scripts/gt.js"
  },
  "scripts": {
    "gt": "node scripts/gt.js",
    "terminal-exec": "node scripts/gt.js exec",
    ...
  }
```

- [ ] **Step 5: Run tests to verify basic command dispatch**

Run: `npx jest tests/gtCli.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/gt.js tests/gtCli.test.ts package.json
git commit -m "feat(cli): implement gt unified docker-style CLI tool"
```

---

### Task 2: Comprehensive Mock Integration Testing for `gt`

**Files:**
- Modify: `tests/gtCli.test.ts`

**Interfaces:**
- Test HTTP server verifying:
  - `gt hosts` renders formatted table and `--json`.
  - `gt exec` streams logs with `>>>` and `<<<` banners to stderr, and forwards exit code.
  - `gt exec -q` suppresses banners.
  - `gt exec -d` outputs taskId and exits immediately.
  - POSIX `--` pass-through prevents flag collision (e.g. `gt exec host -- -a -s`).
  - `gt ps`, `gt logs`, `gt kill`.

- [ ] **Step 1: Expand `tests/gtCli.test.ts` with mock server integration suite**

Update `tests/gtCli.test.ts`:
```typescript
import http from 'http';

describe('gt CLI Mock Server Integration', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && url.pathname === '/api/terminal/hosts') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          hosts: [
            { id: 'node-1', name: 'prod-srv', status: 'online', platform: 'linux', ip: '10.0.0.1', lastSeen: Date.now() - 5000 },
            { id: 'node-2', name: 'dev-box', status: 'offline', platform: 'darwin', ip: '192.168.1.2', lastSeen: Date.now() - 600000 }
          ]
        }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/node-1') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const parsed = JSON.parse(body);
          if (parsed.command.includes('fail-command')) {
            res.statusCode = 202;
            res.end(JSON.stringify({ success: true, taskId: 'task-fail' }));
          } else {
            res.statusCode = 202;
            res.end(JSON.stringify({ success: true, taskId: 'task-ok' }));
          }
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-1/task-ok') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          status: 'completed',
          exitCode: 0,
          stdout: 'Hello From Remote\n',
          stderr: '',
          outputOffset: 18,
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-1/task-fail') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          status: 'failed',
          exitCode: 42,
          stdout: '',
          stderr: 'Something went wrong\n',
          outputOffset: 21,
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          tasks: [{ taskId: 'task-ok', status: 'completed', exitCode: 0, startTime: Date.now() - 10000, command: 'echo hi' }]
        }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/node-1/task-ok/kill') {
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

  it('queries and prints formatted hosts table', async () => {
    const res = await runGt(['hosts', `--server=http://localhost:${serverPort}`]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('node-1');
    expect(res.stdout).toContain('online');
    expect(res.stdout).toContain('node-2');
  });

  it('queries hosts in JSON format with --json', async () => {
    const res = await runGt(['hosts', '--json', `--server=http://localhost:${serverPort}`]);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(Array.isArray(parsed.hosts)).toBe(true);
    expect(parsed.hosts[0].id).toBe('node-1');
  });

  it('runs command in streaming mode, prints banners to stderr, and stdout to stdout', async () => {
    const res = await runGt(['exec', `--server=http://localhost:${serverPort}`, 'node-1', 'echo hi']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('Hello From Remote\n');
    expect(res.stderr).toContain('>>> [node-1] $ echo hi');
    expect(res.stderr).toContain('<<< [node-1] Command completed with code 0');
  });

  it('suppresses banners with -q / --quiet', async () => {
    const res = await runGt(['exec', '-q', `--server=http://localhost:${serverPort}`, 'node-1', 'echo hi']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('Hello From Remote\n');
    expect(res.stderr).toBe('');
  });

  it('supports -- separator to pass flags safely to remote command without collision', async () => {
    const res = await runGt(['exec', `--server=http://localhost:${serverPort}`, 'node-1', '--', 'curl', '-s', '-a']);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('>>> [node-1] $ curl -s -a');
  });

  it('forwards non-zero remote exit code', async () => {
    const res = await runGt(['exec', `--server=http://localhost:${serverPort}`, 'node-1', 'fail-command']);
    expect(res.code).toBe(42);
    expect(res.stderr).toContain('Command failed with code 42');
  });

  it('supports detached mode with -d', async () => {
    const res = await runGt(['exec', '-d', `--server=http://localhost:${serverPort}`, 'node-1', 'sleep 10']);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe('task-ok');
  });

  it('lists tasks with gt ps', async () => {
    const res = await runGt(['ps', `--server=http://localhost:${serverPort}`, 'node-1']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('task-ok');
  });

  it('views task logs with gt logs', async () => {
    const res = await runGt(['logs', `--server=http://localhost:${serverPort}`, 'node-1', 'task-ok']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Hello From Remote');
  });

  it('terminates task with gt kill', async () => {
    const res = await runGt(['kill', `--server=http://localhost:${serverPort}`, 'node-1', 'task-ok']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Kill signal sent to task');
  });
});
```

- [ ] **Step 2: Run test to verify integration tests pass**

Run: `npx jest tests/gtCli.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/gtCli.test.ts
git commit -m "test(cli): add comprehensive integration test suite for gt CLI"
```

---

### Task 3: Documentation and Cleanup

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md with `gt` usage guide**

Update `CLAUDE.md`:
- Document `gt` as the primary unified CLI:
  - `gt hosts` (query nodes)
  - `gt exec <host> <cmd>` (execute remote commands)
  - `gt ps <host>`, `gt logs <host> <task>`, `gt kill <host> <task>`
  - `gt agent` (launch reverse agent)

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document gt unified CLI tool in CLAUDE.md"
```

---

### Task 4: Full Regression & Build Verification

**Files:**
- Full test suite
- Full build

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All test suites pass.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: 0 errors.

- [ ] **Step 3: Commit and verify status**

```bash
git status
git commit -m "chore: complete gt unified Docker-style CLI tool implementation"
```

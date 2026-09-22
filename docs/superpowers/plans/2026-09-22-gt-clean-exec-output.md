# gt exec Clean Pure Stream Output & Server Audit Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `gt exec` to match Docker CLI stream output ergonomics (pure stdout/stderr stream with no default prefix/suffix banners, optional `--verbose` debug mode) and integrate complete lifecycle execution audit logging on the server side via `terminalLogService`.

**Architecture:** 
1. Server Audit Logging: Extend `TerminalExecService` in `src/terminal/services/terminalExecService.ts` to record structured audit logs into `terminalLogService` and winston `logger` on task start, failure, terminal completion (with exit code and duration, deduplicated during polling), and task kill signals.
2. CLI Pure Output: Update `parseExecArgs` and `main` in `scripts/gt.js` so `gt exec` defaults to pure unpolluted streaming without `>>>` or `<<<` banner prints, while supporting `--verbose` for debugging.
3. Test Suite Alignment: Update existing CLI tests that checked for `>>>` and add comprehensive tests for pure stream output and server audit logs.

**Tech Stack:** Node.js (v18+), TypeScript, Jest, Supertest.

## Global Constraints

- Zero external runtime dependencies in `scripts/gt.js`.
- Output must be 100% clean by default (no header/footer banners printed on stdout/stderr).
- All execution events (start, finish, kill) must be captured in `terminalLogService` for web console visibility.
- POSIX-compliant exit codes: 0 (success), 1 (general error), 125 (CLI usage/syntax error), 130 (SIGINT), N (remote process exit code).

---

### Task 1: Server-Side Execution Audit Logging

**Files:**
- Modify: `src/terminal/services/terminalExecService.ts`
- Test: `tests/terminalExecAuditLogs.test.ts`

**Interfaces:**
- `terminalLogService.addLog(level: 'info' | 'warn' | 'error' | 'debug', message: string)`
- `TerminalExecService`:
  - `startExecution`: logs `[Exec] Started task <taskId> on [<hostId>]: <command> (timeout: <ms>ms)` on success, or `[Exec] Failed to start command on [<hostId>]: <error>` on error.
  - `getExecutionStatus`: tracks finished tasks in a Set (`loggedFinishedTasks`) so completion is logged once: `[Exec] Task <taskId> on [<hostId>] finished: status=<status>, exitCode=<exitCode>, duration=<durationMs>ms`.
  - `killExecution`: logs `[Exec] Sent kill signal <signal> to task <taskId> on [<hostId>]`.

- [x] **Step 1: Write the failing unit tests for server execution audit logging**

Create `tests/terminalExecAuditLogs.test.ts`:
```typescript
import { terminalExecService } from '../src/terminal/services/terminalExecService';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';
import terminalLogService from '../src/terminal/services/terminalLogService';

describe('TerminalExecService audit logging', () => {
  beforeEach(() => {
    terminalLogService.clearHistory();
    jest.restoreAllMocks();
  });

  it('records audit log when task starts successfully', async () => {
    jest.spyOn(terminalHostManager, 'executeCmdRpc').mockResolvedValue({
      success: true,
      data: { taskId: 'task-audit-1' },
    });

    const res = await terminalExecService.startExecution('host-prod-1', {
      command: 'echo "hello"',
      timeoutMs: 5000,
    });

    expect(res.success).toBe(true);
    const logs = terminalLogService.getHistory();
    const startLog = logs.find(l => l.message.includes('[Exec] Started task task-audit-1 on [host-prod-1]: echo "hello"'));
    expect(startLog).toBeDefined();
    expect(startLog?.level).toBe('info');
  });

  it('records error log when task start fails', async () => {
    jest.spyOn(terminalHostManager, 'executeCmdRpc').mockResolvedValue({
      success: false,
      error: 'Host offline',
    });

    const res = await terminalExecService.startExecution('host-prod-1', {
      command: 'uptime',
    });

    expect(res.success).toBe(false);
    const logs = terminalLogService.getHistory();
    const errLog = logs.find(l => l.message.includes('[Exec] Failed to start command on [host-prod-1]: Host offline'));
    expect(errLog).toBeDefined();
    expect(errLog?.level).toBe('error');
  });

  it('records finished audit log only once on terminal status poll', async () => {
    jest.spyOn(terminalHostManager, 'executeCmdRpc').mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-audit-2',
        status: 'completed',
        exitCode: 0,
        durationMs: 1200,
      },
    });

    await terminalExecService.getExecutionStatus('host-prod-1', 'task-audit-2', 0);
    // Poll again to ensure deduplication
    await terminalExecService.getExecutionStatus('host-prod-1', 'task-audit-2', 10);

    const logs = terminalLogService.getHistory().filter(l => l.message.includes('task-audit-2'));
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain('[Exec] Task task-audit-2 on [host-prod-1] finished: status=completed, exitCode=0, duration=1200ms');
    expect(logs[0].level).toBe('info');
  });

  it('records warning audit log on kill execution', async () => {
    jest.spyOn(terminalHostManager, 'executeCmdRpc').mockResolvedValue({
      success: true,
      data: { message: 'Kill signal sent' },
    });

    await terminalExecService.killExecution('host-prod-1', 'task-audit-3', 'SIGKILL');

    const logs = terminalLogService.getHistory();
    const killLog = logs.find(l => l.message.includes('[Exec] Sent kill signal SIGKILL to task task-audit-3 on [host-prod-1]'));
    expect(killLog).toBeDefined();
    expect(killLog?.level).toBe('warn');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalExecAuditLogs.test.ts`
Expected: FAIL

- [x] **Step 3: Implement execution audit logging in terminalExecService.ts**

Update `src/terminal/services/terminalExecService.ts`:
```typescript
import { terminalHostManager } from './terminalHostManager';
import terminalLogService from './terminalLogService';
import logger from '../../utils/logger';

export interface StartExecutionOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
}

export class TerminalExecService {
  private loggedFinishedTasks = new Set<string>();

  public async startExecution(hostId: string, options: StartExecutionOptions): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!options || !options.command || !options.command.trim()) {
      return { success: false, error: 'command is required' };
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = Math.min(Math.max(options.timeoutMs || 300000, 1000), 3600000); // 1s to 1 hour
    const trimmedHost = hostId.trim();
    const trimmedCmd = options.command.trim();

    const res = await terminalHostManager.executeCmdRpc(trimmedHost, {
      action: 'start',
      taskId,
      command: trimmedCmd,
      cwd: options.cwd ? options.cwd.trim() : undefined,
      timeoutMs,
      env: options.env || {},
      stdin: typeof options.stdin === 'string' ? options.stdin : undefined,
    });

    if (res && res.success && res.data) {
      const logMsg = `[Exec] Started task ${taskId} on [${trimmedHost}]: ${trimmedCmd} (timeout: ${timeoutMs}ms${options.cwd ? `, cwd: ${options.cwd.trim()}` : ''})`;
      terminalLogService.addLog('info', logMsg);
      logger.info(logMsg);

      return {
        success: true,
        taskId,
        hostId: trimmedHost,
        ...res.data,
      };
    }

    const errorMsg = res?.error || 'Failed to start command on agent';
    const failLog = `[Exec] Failed to start command on [${trimmedHost}]: ${errorMsg} (cmd: ${trimmedCmd})`;
    terminalLogService.addLog('error', failLog);
    logger.error(failLog);

    return {
      success: false,
      error: errorMsg,
    };
  }

  public async getExecutionStatus(hostId: string, taskId: string, offset: number = 0): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!taskId || !taskId.trim()) {
      return { success: false, error: 'taskId is required' };
    }

    const trimmedHost = hostId.trim();
    const trimmedTaskId = taskId.trim();

    const res = await terminalHostManager.executeCmdRpc(trimmedHost, {
      action: 'poll',
      taskId: trimmedTaskId,
      offset: Math.max(0, offset || 0),
    });

    if (res && res.success && res.data) {
      const data = res.data;
      if (data.status && data.status !== 'running') {
        const taskKey = `${trimmedHost}:${trimmedTaskId}`;
        if (!this.loggedFinishedTasks.has(taskKey)) {
          this.loggedFinishedTasks.add(taskKey);
          if (this.loggedFinishedTasks.size > 2000) {
            const firstKey = this.loggedFinishedTasks.values().next().value;
            if (firstKey) this.loggedFinishedTasks.delete(firstKey);
          }

          const isSuccess = data.exitCode === 0 || data.status === 'completed';
          const level = isSuccess ? 'info' : 'warn';
          const finishMsg = `[Exec] Task ${trimmedTaskId} on [${trimmedHost}] finished: status=${data.status}, exitCode=${data.exitCode !== null && data.exitCode !== undefined ? data.exitCode : 'N/A'}, duration=${data.durationMs ?? 0}ms`;
          terminalLogService.addLog(level, finishMsg);
          if (isSuccess) {
            logger.info(finishMsg);
          } else {
            logger.warn(finishMsg);
          }
        }
      }

      return {
        success: true,
        hostId: trimmedHost,
        ...data,
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to poll command status from agent',
    };
  }

  public async killExecution(hostId: string, taskId: string, signal: string = 'SIGTERM'): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!taskId || !taskId.trim()) {
      return { success: false, error: 'taskId is required' };
    }

    const trimmedHost = hostId.trim();
    const trimmedTaskId = taskId.trim();
    const targetSignal = signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM';

    const res = await terminalHostManager.executeCmdRpc(trimmedHost, {
      action: 'kill',
      taskId: trimmedTaskId,
      signal: targetSignal,
    });

    const killMsg = `[Exec] Sent kill signal ${targetSignal} to task ${trimmedTaskId} on [${trimmedHost}]`;
    terminalLogService.addLog('warn', killMsg);
    logger.warn(killMsg);

    if (res && res.success) {
      return {
        success: true,
        taskId: trimmedTaskId,
        status: 'killed',
        message: res.data?.message || 'Kill signal sent to task',
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to kill command on agent',
    };
  }

  public async listExecutions(hostId: string, limit: number = 20): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'list',
      limit: Math.min(Math.max(limit || 20, 1), 100),
    });

    if (res && res.success && res.data) {
      return {
        success: true,
        hostId: hostId.trim(),
        tasks: res.data.tasks || [],
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to list tasks from agent',
    };
  }
}

export const terminalExecService = new TerminalExecService();
export default terminalExecService;
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalExecAuditLogs.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add src/terminal/services/terminalExecService.ts tests/terminalExecAuditLogs.test.ts
git commit -m "feat(terminal): add server-side execution audit logs in terminalExecService"
```

---

### Task 2: CLI Pure Stream Output with Optional `--verbose`

**Files:**
- Modify: `scripts/gt.js:parseExecArgs`, `scripts/gt.js:printHelp`, `scripts/gt.js:main`
- Modify: `tests/gtCli.test.ts`
- Test: `tests/gtExecPureStream.test.ts`

**Interfaces:**
- `parseExecArgs(args: string[])`: returns `{ host, fullCommand, commandParts, options: { detach, workdir, timeoutMs, verbose, pollInterval, env, interactive } }`
- `gt exec <host> <cmd...>`:
  - Default: zero banner prints (no `>>> [host] $ cmd` and no `<<< [host] Command completed`). Direct output stream.
  - With `--verbose`: prints `>>> [host] $ cmd` on start and `<<< [host] Command completed with code ...` on finish to `stderr`.

- [x] **Step 1: Write tests for pure stream output and verbose mode**

Create `tests/gtExecPureStream.test.ts`:
```typescript
import http from 'http';
import { execFile } from 'child_process';
import path from 'path';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

function runGt(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [gtPath, ...args], {
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}

describe('gt exec pure stream output', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && url.pathname === '/api/terminal/hosts') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          hosts: [{ id: 'node-1', name: 'srv-1', status: 'online' }]
        }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/node-1') {
        res.statusCode = 202;
        res.end(JSON.stringify({ success: true, taskId: 'task-mock-1', hostId: 'node-1' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-1/task-mock-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          taskId: 'task-mock-1',
          status: 'completed',
          exitCode: 0,
          stdout: 'pure output line\n',
          stderr: '',
          offset: 17,
        }));
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

  it('outputs pure stdout with NO >>> or <<< banners by default', async () => {
    const res = await runGt(['exec', 'node-1', 'echo', 'hi'], {
      TERMINAL_SERVER: `http://localhost:${serverPort}`,
    });

    expect(res.code).toBe(0);
    expect(res.stdout).toBe('pure output line\n');
    expect(res.stderr).not.toContain('>>>');
    expect(res.stderr).not.toContain('<<<');
  });

  it('outputs >>> and <<< banners when --verbose is specified', async () => {
    const res = await runGt(['exec', '--verbose', 'node-1', 'echo', 'hi'], {
      TERMINAL_SERVER: `http://localhost:${serverPort}`,
    });

    expect(res.code).toBe(0);
    expect(res.stdout).toBe('pure output line\n');
    expect(res.stderr).toContain('>>> [node-1] $ echo hi');
    expect(res.stderr).toContain('<<< [node-1] Command completed with code 0');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtExecPureStream.test.ts`
Expected: FAIL (default output currently still contains `>>>` in stderr)

- [x] **Step 3: Update scripts/gt.js parseExecArgs and main**

In `scripts/gt.js`:
Update `parseExecArgs`:
```javascript
function parseExecArgs(args) {
  let detach = false;
  let workdir = undefined;
  let timeoutMs = 300000;
  let verbose = false;
  let pollInterval = 500;
  let interactive = false;
  const envVars = {};
  let host = '';
  const commandParts = [];

  let i = 0;
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
      // Retained for backward flag compatibility (now default behavior)
    } else if (a === '-i' || a === '--interactive') {
      interactive = true;
    } else if (a === '-w' || a === '--workdir' || a === '--cwd') {
      workdir = args[++i];
    } else if (a.startsWith('-w=')) {
      workdir = a.slice(3);
    } else if (a.startsWith('--workdir=')) {
      workdir = a.slice(10);
    } else if (a.startsWith('--cwd=')) {
      workdir = a.slice(6);
    } else if (a === '-t' || a === '--timeout') {
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

  if (i < args.length && args[i] === '--') {
    i++;
  }

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
    options: { detach, workdir, timeoutMs, verbose, pollInterval, env: envVars, interactive }
  };
}
```

In `scripts/gt.js:main` for `case 'exec'`:
```javascript
      const { host, fullCommand, options } = parsed;
      const { detach, workdir, timeoutMs, verbose, pollInterval, env: envVars, interactive } = options;
...
      if (verbose) {
        process.stderr.write(`>>> [${targetHost}] $ ${fullCommand}\n`);
      }
...
              if (t.status !== 'running') {
                const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
                const exitCode = t.exitCode !== null && t.exitCode !== undefined ? t.exitCode : (t.status === 'completed' ? 0 : 1);

                if (verbose) {
                  if (exitCode === 0) {
                    process.stderr.write(`<<< [${targetHost}] Command completed with code 0 (took ${durationSec}s)\n`);
                  } else {
                    process.stderr.write(`<<< [${targetHost}] Command failed with code ${exitCode} (${t.status}, took ${durationSec}s)\n`);
                  }
                }
                process.exit(exitCode);
              }
```

Update `printHelp`:
```javascript
  exec [OPTIONS] <host> <cmd...> Execute a command on a remote host (like 'docker exec')
...
Exec Options:
  -i, --interactive       Keep STDIN open for piped input
  -d, --detach            Run command in background and print task ID
  -w, --workdir <dir>     Working directory on remote host
  -t, --timeout <ms>      Execution timeout in ms (Default: 300000 / 5 min)
  -e, --env <KEY=VAL>     Set remote environment variable (can be repeated)
  --verbose               Show execution header and duration footer banners
  --poll-interval <ms>    Polling interval for log stream in ms (Default: 500)
```

- [x] **Step 4: Update tests/gtCli.test.ts assertions for banners**

In `tests/gtCli.test.ts`, update the tests that verified exec banners to pass `--verbose` when asserting on `>>>`:
```typescript
  it('executes command on host and streams output with --verbose', async () => {
    const res = await runGt(['exec', '--verbose', 'node-1', 'echo', 'hi'], {
      TERMINAL_SERVER: `http://localhost:${serverPort}`,
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('hello world');
    expect(res.stderr).toContain('>>> [node-1] $ echo hi');
    expect(res.stderr).toContain('<<< [node-1] Command completed with code 0');
  });

  it('supports double dash for complex remote commands with --verbose', async () => {
    const res = await runGt(['exec', '--verbose', 'node-1', '--', 'curl', '-s', '-a'], {
      TERMINAL_SERVER: `http://localhost:${serverPort}`,
    });
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('>>> [node-1] $ curl -s -a');
  });
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/gtExecPureStream.test.ts tests/gtCli.test.ts`
Expected: PASS

- [x] **Step 6: Commit changes**

```bash
git add scripts/gt.js tests/gtCli.test.ts tests/gtExecPureStream.test.ts
git commit -m "feat(gt): make exec output pure stream by default and add --verbose option"
```

---

### Task 3: Full Regression and Verification

**Files:**
- Test: all test files (`tests/*.test.ts`)
- Modify: `CLAUDE.md`, `README.md`

- [x] **Step 1: Run complete test suite**

Run: `npm test`
Expected: 135+ test suites pass with 0 failures.

- [x] **Step 2: Update documentation in CLAUDE.md and README.md**

Update `CLAUDE.md` and `README.md` to reflect the updated `gt exec` options (replacing `-q/--quiet` with `--verbose`).

- [x] **Step 3: Commit documentation updates**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document gt exec pure stream behavior and --verbose flag"
```

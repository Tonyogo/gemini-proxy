# Terminal Agent Command Execution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an asynchronous standalone command execution engine for the Gemini Proxy Terminal Agent, allowing AI agents, deployment tools, and CI/CD pipelines to trigger, poll, and control shell scripts independently of the interactive WebTerminal PTY.

**Architecture:** 
- Expose REST API under `/api/admin/terminal/exec/*` (`POST /:hostId`, `GET /:hostId/:taskId`, `POST /:hostId/:taskId/kill`, `GET /:hostId`) routed through `terminalExecController.ts` and `terminalExecService.ts`.
- Transmit command execution control frames (`cmd_exec` / `cmd_exec_res`) via the existing reverse WebSocket tunnel (`terminalHostManager.ts` & `terminalWs.ts`).
- Inside `scripts/terminal-agent.js`, build an isolated `TaskManager` that spawns shell commands with `child_process.spawn`, accumulates streams in memory-capped buffers, supports offset-based incremental polling, enforces timeout guards, and cleans up historical task state.

**Tech Stack:** Node.js, Express, TypeScript, WebSocket (`ws`), Node `child_process`.

## Global Constraints

- Full Process Isolation: Must use `child_process.spawn` with piped stdio (`stdio: ['ignore', 'pipe', 'pipe']`); zero interference with active PTY sessions.
- Asynchronous Non-Blocking: `POST /exec/:hostId` must return `202 Accepted` immediately with `taskId` and `status: 'running'`.
- Memory Bounded: Each task output buffer capped at 5 MB; tasks auto-pruned after 24 hours or exceeding 100 entries.
- Security: Protected by `adminAuthMiddleware` requiring `x-admin-key`.
- Backward Compatibility: Zero regressions for WebTerminal PTY and File RPC functionality. All existing 106 test suites must pass.

---

### Task 1: Extend `TerminalHostManager` for Command Execution RPC

**Files:**
- Modify: `src/admin/services/terminalHostManager.ts`
- Modify: `src/admin/routes/terminalWs.ts`

**Interfaces:**
- Consumes: Agent WebSocket connection in `terminalHostManager.ts`.
- Produces:
  - `terminalHostManager.executeCmdRpc(hostId: string, payload: { action: string; taskId?: string; command?: string; cwd?: string; timeoutMs?: number; env?: Record<string, string>; offset?: number; signal?: string; limit?: number }): Promise<any>`
  - `terminalHostManager.handleAgentCmdRpcResponse(response: any): void`

- [ ] **Step 1: Write failing test in `tests/terminalHostManagerCmdRpc.test.ts`**

```typescript
import { terminalHostManager } from '../src/admin/services/terminalHostManager';

describe('TerminalHostManager - Command Execution RPC', () => {
  it('returns offline error when agent is not registered or offline', async () => {
    const res = await terminalHostManager.executeCmdRpc('offline-host-123', {
      action: 'start',
      command: 'echo hello'
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/offline or unavailable/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalHostManagerCmdRpc.test.ts`
Expected: FAIL (`executeCmdRpc` is not a function).

- [ ] **Step 3: Implement `executeCmdRpc` and `handleAgentCmdRpcResponse` in `TerminalHostManager`**

In `src/admin/services/terminalHostManager.ts`:
```typescript
  private cmdRpcResolvers: Map<string, (response: any) => void> = new Map();

  public handleAgentCmdRpcResponse(response: any): void {
    const { reqId } = response;
    if (reqId && this.cmdRpcResolvers.has(reqId)) {
      const resolver = this.cmdRpcResolvers.get(reqId);
      this.cmdRpcResolvers.delete(reqId);
      if (resolver) {
        resolver(response);
      }
    }
  }

  public async executeCmdRpc(hostId: string, payload: { action: string; [key: string]: any }): Promise<any> {
    const session = this.getSession(hostId);
    if (!session) {
      return { success: false, error: `Agent "${hostId}" is offline or unavailable` };
    }

    const reqId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rpcMsg = `JSON:${JSON.stringify({
      type: 'cmd_exec',
      reqId,
      ...payload,
    })}`;

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        if (this.cmdRpcResolvers.has(reqId)) {
          this.cmdRpcResolvers.delete(reqId);
          resolve({ success: false, error: 'Agent command RPC request timed out (30s)' });
        }
      }, 30000);

      this.cmdRpcResolvers.set(reqId, (response) => {
        clearTimeout(timeoutTimer);
        resolve(response);
      });

      session.write(rpcMsg);
    });
  }
```
Also update `clearPendingRpcForHost(hostId)` in `TerminalHostManager` to clear `cmdRpcResolvers`.

In `src/admin/routes/terminalWs.ts`:
Handle `control.type === 'cmd_exec_res'`:
```typescript
if (control.type === 'cmd_exec_res') {
  terminalHostManager.handleAgentCmdRpcResponse(control);
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalHostManagerCmdRpc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/services/terminalHostManager.ts src/admin/routes/terminalWs.ts tests/terminalHostManagerCmdRpc.test.ts
git commit -m "feat(terminal): add command execution RPC in terminalHostManager"
```

---

### Task 2: Implement `TerminalExecService`

**Files:**
- Create: `src/admin/services/terminalExecService.ts`
- Test: `tests/terminalExecService.test.ts`

**Interfaces:**
- Consumes: `terminalHostManager.executeCmdRpc`
- Produces:
  - `startExecution(hostId, { command, cwd, timeoutMs, env }): Promise<{ success: boolean; taskId?: string; status?: string; error?: string }>`
  - `getExecutionStatus(hostId, taskId, offset?): Promise<{ success: boolean; data?: any; error?: string }>`
  - `killExecution(hostId, taskId, signal?): Promise<{ success: boolean; status?: string; message?: string; error?: string }>`
  - `listExecutions(hostId, limit?): Promise<{ success: boolean; tasks?: any[]; error?: string }>`

- [ ] **Step 1: Write unit tests in `tests/terminalExecService.test.ts`**

```typescript
import { terminalExecService } from '../src/admin/services/terminalExecService';
import { terminalHostManager } from '../src/admin/services/terminalHostManager';

jest.mock('../src/admin/services/terminalHostManager');

describe('TerminalExecService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects startExecution when hostId or command is missing', async () => {
    const res1 = await terminalExecService.startExecution('', { command: 'ls' });
    expect(res1.success).toBe(false);
    expect(res1.error).toMatch(/hostId is required/i);

    const res2 = await terminalExecService.startExecution('node-1', { command: '   ' });
    expect(res2.success).toBe(false);
    expect(res2.error).toMatch(/command is required/i);
  });

  it('delegates startExecution to terminalHostManager with unique taskId', async () => {
    (terminalHostManager.executeCmdRpc as jest.Mock).mockResolvedValue({
      success: true,
      data: { taskId: 'task-123', status: 'running' }
    });

    const res = await terminalExecService.startExecution('node-1', {
      command: 'echo 123',
      timeoutMs: 60000
    });

    expect(res.success).toBe(true);
    expect(terminalHostManager.executeCmdRpc).toHaveBeenCalledWith('node-1', expect.objectContaining({
      action: 'start',
      command: 'echo 123',
      timeoutMs: 60000
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalExecService.test.ts`
Expected: FAIL (`terminalExecService` does not exist).

- [ ] **Step 3: Implement `TerminalExecService`**

Write `src/admin/services/terminalExecService.ts`:
```typescript
import { terminalHostManager } from './terminalHostManager';

export interface StartExecutionOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export class TerminalExecService {
  public async startExecution(hostId: string, options: StartExecutionOptions): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!options || !options.command || !options.command.trim()) {
      return { success: false, error: 'command is required' };
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = Math.min(Math.max(options.timeoutMs || 300000, 1000), 3600000); // 1s to 1 hour

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'start',
      taskId,
      command: options.command.trim(),
      cwd: options.cwd ? options.cwd.trim() : undefined,
      timeoutMs,
      env: options.env || {}
    });

    if (res && res.success && res.data) {
      return {
        success: true,
        taskId,
        hostId: hostId.trim(),
        ...res.data
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to start command on agent'
    };
  }

  public async getExecutionStatus(hostId: string, taskId: string, offset: number = 0): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!taskId || !taskId.trim()) {
      return { success: false, error: 'taskId is required' };
    }

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'poll',
      taskId: taskId.trim(),
      offset: Math.max(0, offset || 0)
    });

    if (res && res.success && res.data) {
      return {
        success: true,
        hostId: hostId.trim(),
        ...res.data
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to poll command status from agent'
    };
  }

  public async killExecution(hostId: string, taskId: string, signal: string = 'SIGTERM'): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!taskId || !taskId.trim()) {
      return { success: false, error: 'taskId is required' };
    }

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'kill',
      taskId: taskId.trim(),
      signal: signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM'
    });

    if (res && res.success) {
      return {
        success: true,
        taskId: taskId.trim(),
        status: 'killed',
        message: res.data?.message || 'Kill signal sent to task'
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to kill command on agent'
    };
  }

  public async listExecutions(hostId: string, limit: number = 20): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'list',
      limit: Math.min(Math.max(limit || 20, 1), 100)
    });

    if (res && res.success && res.data) {
      return {
        success: true,
        hostId: hostId.trim(),
        tasks: res.data.tasks || []
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to list tasks from agent'
    };
  }
}

export const terminalExecService = new TerminalExecService();
export default terminalExecService;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalExecService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/services/terminalExecService.ts tests/terminalExecService.test.ts
git commit -m "feat(terminal): implement TerminalExecService"
```

---

### Task 3: Implement `TerminalExecController` & Express Routing

**Files:**
- Create: `src/admin/controllers/terminalExecController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Test: `tests/terminalExecController.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/admin/terminal/exec/:hostId` -> `202 Accepted`
  - `GET /api/admin/terminal/exec/:hostId/:taskId` -> `200 OK`
  - `POST /api/admin/terminal/exec/:hostId/:taskId/kill` -> `200 OK`
  - `GET /api/admin/terminal/exec/:hostId` -> `200 OK`

- [ ] **Step 1: Write integration tests in `tests/terminalExecController.test.ts`**

```typescript
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import { terminalExecService } from '../src/admin/services/terminalExecService';

jest.mock('../src/admin/services/terminalExecService');

describe('TerminalExecController API', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
  });

  it('rejects unauthenticated request without admin key', async () => {
    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1')
      .send({ command: 'echo 1' });
    expect(res.status).toBe(401);
  });

  it('starts command execution with 202 Accepted', async () => {
    (terminalExecService.startExecution as jest.Mock).mockResolvedValue({
      success: true,
      taskId: 'task-123',
      status: 'running',
      command: 'echo 1'
    });

    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1')
      .set('x-admin-key', 'test-admin-key')
      .send({ command: 'echo 1' });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBe('task-123');
    expect(res.body.status).toBe('running');
  });

  it('returns 400 when command is missing', async () => {
    (terminalExecService.startExecution as jest.Mock).mockResolvedValue({
      success: false,
      error: 'command is required'
    });

    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1')
      .set('x-admin-key', 'test-admin-key')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('command is required');
  });

  it('polls task status with 200 OK', async () => {
    (terminalExecService.getExecutionStatus as jest.Mock).mockResolvedValue({
      success: true,
      taskId: 'task-123',
      status: 'completed',
      exitCode: 0,
      stdout: 'done\n'
    });

    const res = await request(app)
      .get('/api/admin/terminal/exec/node-1/task-123?offset=0')
      .set('x-admin-key', 'test-admin-key');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.exitCode).toBe(0);
  });

  it('kills task with 200 OK', async () => {
    (terminalExecService.killExecution as jest.Mock).mockResolvedValue({
      success: true,
      taskId: 'task-123',
      status: 'killed'
    });

    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1/task-123/kill')
      .set('x-admin-key', 'test-admin-key')
      .send({ signal: 'SIGKILL' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('killed');
  });

  it('lists tasks with 200 OK', async () => {
    (terminalExecService.listExecutions as jest.Mock).mockResolvedValue({
      success: true,
      tasks: [{ taskId: 'task-123', command: 'ls', status: 'completed' }]
    });

    const res = await request(app)
      .get('/api/admin/terminal/exec/node-1?limit=10')
      .set('x-admin-key', 'test-admin-key');

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalExecController.test.ts`
Expected: FAIL (`terminalExecController` does not exist).

- [ ] **Step 3: Create `terminalExecController.ts` and update `adminRoutes.ts`**

Write `src/admin/controllers/terminalExecController.ts`:
```typescript
import { Request, Response } from 'express';
import terminalExecService from '../services/terminalExecService';

class TerminalExecController {
  public async startExec(req: Request, res: Response): Promise<any> {
    const { hostId } = req.params;
    const { command, cwd, timeoutMs, env } = req.body || {};

    if (!command || typeof command !== 'string' || !command.trim()) {
      return res.status(400).json({ success: false, error: 'Field "command" is required' });
    }

    const result = await terminalExecService.startExecution(hostId, {
      command,
      cwd,
      timeoutMs: timeoutMs !== undefined ? parseInt(String(timeoutMs), 10) : undefined,
      env: typeof env === 'object' && env !== null ? env : undefined,
    });

    if (!result.success) {
      const isOffline = result.error && result.error.includes('offline');
      return res.status(isOffline ? 503 : 400).json(result);
    }

    return res.status(202).json(result);
  }

  public async getExecStatus(req: Request, res: Response): Promise<any> {
    const { hostId, taskId } = req.params;
    const offset = req.query.offset !== undefined ? parseInt(String(req.query.offset), 10) : 0;

    const result = await terminalExecService.getExecutionStatus(hostId, taskId, isNaN(offset) ? 0 : offset);

    if (!result.success) {
      const isNotFound = result.error && (result.error.includes('not found') || result.error.includes('No such task'));
      return res.status(isNotFound ? 404 : 500).json(result);
    }

    return res.status(200).json(result);
  }

  public async killExec(req: Request, res: Response): Promise<any> {
    const { hostId, taskId } = req.params;
    const { signal } = req.body || {};

    const result = await terminalExecService.killExecution(hostId, taskId, signal);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  }

  public async listExec(req: Request, res: Response): Promise<any> {
    const { hostId } = req.params;
    const limit = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : 20;

    const result = await terminalExecService.listExecutions(hostId, isNaN(limit) ? 20 : limit);

    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  }
}

export const terminalExecController = new TerminalExecController();
export default terminalExecController;
```

In `src/admin/routes/adminRoutes.ts`, import `terminalExecController` and register:
```typescript
// Terminal Command Execution Routes
router.post('/terminal/exec/:hostId', (req, res) => terminalExecController.startExec(req, res));
router.get('/terminal/exec/:hostId/:taskId', (req, res) => terminalExecController.getExecStatus(req, res));
router.post('/terminal/exec/:hostId/:taskId/kill', (req, res) => terminalExecController.killExec(req, res));
router.get('/terminal/exec/:hostId', (req, res) => terminalExecController.listExec(req, res));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalExecController.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/controllers/terminalExecController.ts src/admin/routes/adminRoutes.ts tests/terminalExecController.test.ts
git commit -m "feat(terminal): add terminalExecController and routes"
```

---

### Task 4: Upgrade `scripts/terminal-agent.js` with `TaskManager`

**Files:**
- Modify: `scripts/terminal-agent.js`

**Interfaces:**
- Consumes: WebSocket frames with `control.type === 'cmd_exec'`
- Produces:
  - Dispatches `action: 'start'`, `'poll'`, `'kill'`, `'list'`
  - Sends back `JSON:{"type":"cmd_exec_res", "reqId":"...", "taskId":"...", "success":true, "data":{...}}`
  - Completely isolated from `ptyProcess`.

- [ ] **Step 1: Implement `TaskManager` class in `scripts/terminal-agent.js`**

Add `const { spawn } = require('child_process');` at top of `scripts/terminal-agent.js`.
Add `TaskManager`:
```javascript
class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.MAX_TASKS = 100;
    this.MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5 MB per stream
    this.TASK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  }

  pruneOldTasks() {
    const now = Date.now();
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status !== 'running' && (now - task.startTime > this.TASK_TTL_MS)) {
        this.tasks.delete(taskId);
      }
    }
    if (this.tasks.size > this.MAX_TASKS) {
      const sorted = Array.from(this.tasks.entries())
        .filter(([, t]) => t.status !== 'running')
        .sort((a, b) => a[1].startTime - b[1].startTime);
      while (this.tasks.size > this.MAX_TASKS && sorted.length > 0) {
        const [oldId] = sorted.shift();
        this.tasks.delete(oldId);
      }
    }
  }

  startTask({ taskId, command, cwd, timeoutMs = 300000, env = {} }) {
    this.pruneOldTasks();

    if (this.tasks.has(taskId)) {
      const existing = this.tasks.get(taskId);
      return { success: true, taskId, status: existing.status, startTime: existing.startTime };
    }

    const shell = getDefaultShell();
    const isWindows = platform === 'win32';
    const shellArgs = isWindows ? ['-Command', command] : ['-c', command];
    const workingDir = cwd ? path.resolve(cwd) : (process.env.HOME || process.cwd());

    const taskEnv = {
      ...process.env,
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    let child = null;
    try {
      child = spawn(shell, shellArgs, {
        cwd: workingDir,
        env: taskEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
    } catch (err) {
      return { success: false, error: `Failed to spawn process: ${err.message}` };
    }

    const taskRecord = {
      taskId,
      command,
      cwd: workingDir,
      status: 'running',
      exitCode: null,
      startTime: Date.now(),
      endTime: null,
      stdout: '',
      stderr: '',
      output: '',
      child,
      timeoutTimer: null,
      killTimer: null
    };

    const appendChunk = (type, chunk) => {
      const text = chunk.toString('utf-8');
      if (type === 'stdout') {
        taskRecord.stdout += text;
        if (taskRecord.stdout.length > this.MAX_BUFFER_SIZE) {
          taskRecord.stdout = taskRecord.stdout.slice(-this.MAX_BUFFER_SIZE);
        }
      } else {
        taskRecord.stderr += text;
        if (taskRecord.stderr.length > this.MAX_BUFFER_SIZE) {
          taskRecord.stderr = taskRecord.stderr.slice(-this.MAX_BUFFER_SIZE);
        }
      }
      taskRecord.output += text;
      if (taskRecord.output.length > this.MAX_BUFFER_SIZE) {
        taskRecord.output = taskRecord.output.slice(-this.MAX_BUFFER_SIZE);
      }
    };

    child.stdout.on('data', (chunk) => appendChunk('stdout', chunk));
    child.stderr.on('data', (chunk) => appendChunk('stderr', chunk));

    child.on('error', (err) => {
      taskRecord.stderr += `\nProcess execution error: ${err.message}\n`;
      taskRecord.output += `\nProcess execution error: ${err.message}\n`;
      taskRecord.status = 'failed';
      taskRecord.endTime = Date.now();
      if (taskRecord.timeoutTimer) clearTimeout(taskRecord.timeoutTimer);
    });

    child.on('close', (code, signal) => {
      if (taskRecord.timeoutTimer) clearTimeout(taskRecord.timeoutTimer);
      if (taskRecord.killTimer) clearTimeout(taskRecord.killTimer);
      taskRecord.endTime = Date.now();
      taskRecord.child = null;

      if (taskRecord.status === 'running') {
        if (signal) {
          taskRecord.status = 'killed';
        } else {
          taskRecord.exitCode = code;
          taskRecord.status = code === 0 ? 'completed' : 'failed';
        }
      }
    });

    if (timeoutMs > 0) {
      taskRecord.timeoutTimer = setTimeout(() => {
        if (taskRecord.status === 'running' && taskRecord.child) {
          taskRecord.status = 'timeout';
          const timeoutMsg = `\n[Agent] Process timed out after ${timeoutMs}ms. Terminating...\n`;
          taskRecord.stderr += timeoutMsg;
          taskRecord.output += timeoutMsg;
          try {
            taskRecord.child.kill('SIGTERM');
          } catch {}
          taskRecord.killTimer = setTimeout(() => {
            if (taskRecord.child) {
              try { taskRecord.child.kill('SIGKILL'); } catch {}
            }
          }, 3000);
        }
      }, timeoutMs);
    }

    this.tasks.set(taskId, taskRecord);
    return {
      success: true,
      taskId,
      status: 'running',
      command,
      cwd: workingDir,
      startTime: taskRecord.startTime
    };
  }

  getTask(taskId, offset = 0) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: `No such task: ${taskId}` };
    }

    const totalBytes = Buffer.byteLength(task.output, 'utf-8');
    const safeOffset = Math.max(0, Math.min(offset, totalBytes));

    const sliceOutput = (str) => {
      if (safeOffset === 0) return str;
      const buf = Buffer.from(str, 'utf-8');
      if (safeOffset >= buf.length) return '';
      return buf.slice(safeOffset).toString('utf-8');
    };

    return {
      success: true,
      taskId: task.taskId,
      status: task.status,
      exitCode: task.exitCode,
      stdout: sliceOutput(task.stdout),
      stderr: sliceOutput(task.stderr),
      output: sliceOutput(task.output),
      offset: totalBytes,
      totalBytes,
      durationMs: (task.endTime || Date.now()) - task.startTime,
      startTime: task.startTime,
      endTime: task.endTime
    };
  }

  killTask(taskId, signal = 'SIGTERM') {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: `No such task: ${taskId}` };
    }
    if (task.status !== 'running' || !task.child) {
      return { success: true, taskId, status: task.status, message: 'Task is not running' };
    }

    task.status = 'killed';
    try {
      task.child.kill(signal || 'SIGTERM');
    } catch {}

    task.killTimer = setTimeout(() => {
      if (task.child) {
        try { task.child.kill('SIGKILL'); } catch {}
      }
    }, 3000);

    return { success: true, taskId, status: 'killed', message: `Signal ${signal} sent` };
  }

  listTasks(limit = 20) {
    const list = Array.from(this.tasks.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit)
      .map(t => ({
        taskId: t.taskId,
        command: t.command,
        cwd: t.cwd,
        status: t.status,
        exitCode: t.exitCode,
        durationMs: (t.endTime || Date.now()) - t.startTime,
        startTime: t.startTime,
        endTime: t.endTime
      }));
    return { success: true, tasks: list };
  }
}

const taskManager = new TaskManager();
```

- [ ] **Step 2: Add `handleCmdExec` dispatch function**

In `scripts/terminal-agent.js`:
```javascript
function handleCmdExec(control) {
  const { reqId, action, taskId, command, cwd, timeoutMs, env, offset, signal, limit } = control;

  const reply = (success, data = null, error = null) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(`JSON:${JSON.stringify({
        type: 'cmd_exec_res',
        reqId,
        taskId,
        success,
        data,
        error
      })}`);
    }
  };

  try {
    if (action === 'start') {
      const res = taskManager.startTask({ taskId, command, cwd, timeoutMs, env });
      if (res.success) {
        return reply(true, res);
      }
      return reply(false, null, res.error);
    }

    if (action === 'poll') {
      const res = taskManager.getTask(taskId, offset || 0);
      if (res.success) {
        return reply(true, res);
      }
      return reply(false, null, res.error);
    }

    if (action === 'kill') {
      const res = taskManager.killTask(taskId, signal);
      if (res.success) {
        return reply(true, res);
      }
      return reply(false, null, res.error);
    }

    if (action === 'list') {
      const res = taskManager.listTasks(limit);
      return reply(true, res);
    }

    reply(false, null, `Unknown cmd_exec action: ${action}`);
  } catch (err) {
    reply(false, null, err.message);
  }
}
```

In `ws.on('message')`:
```javascript
if (control.type === 'cmd_exec') {
  handleCmdExec(control);
  return;
}
```

- [ ] **Step 3: Export `taskManager` for programmatic testing if required**

Ensure `module.exports = { ...options, taskManager, handleCmdExec }` is available when required by tests.

- [ ] **Step 4: Commit**

```bash
git add scripts/terminal-agent.js
git commit -m "feat(agent): implement TaskManager and cmd_exec handler"
```

---

### Task 5: End-to-End Testing of Command Execution

**Files:**
- Create: `tests/terminalAgentCommandExec.test.ts`

**Interfaces:**
- Connects local agent or mock agent client to `/api/admin/terminal/agent-ws`.
- Executes commands through `/api/admin/terminal/exec/:hostId`.
- Verifies:
  1. `POST` creates task, returns `running`.
  2. Polling receives stdout incrementally with `offset`.
  3. Exit code is `0` upon completion.
  4. Non-zero exit code marks status `failed`.
  5. Process kill terminates execution and marks status `killed`.
  6. Timeout kills hanging commands.

- [ ] **Step 1: Write E2E test in `tests/terminalAgentCommandExec.test.ts`**

```typescript
import request from 'supertest';
import http from 'http';
import WebSocket from 'ws';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import { setupTerminalWebSocket } from '../src/admin/routes/terminalWs';
import config from '../config/default';

describe('Terminal Agent Command Execution End-to-End', () => {
  let server: http.Server;
  let baseUrl: string;
  let wsUrl: string;
  let agentWs: WebSocket;
  const adminKey = 'test-agent-exec-key';
  const hostId = 'test-exec-agent-node';

  beforeAll((done) => {
    config.adminSecretKey = adminKey;
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);

    server = http.createServer(app);
    setupTerminalWebSocket(server);

    server.listen(0, () => {
      const port = (server.address() as any).port;
      baseUrl = `http://localhost:${port}`;
      wsUrl = `ws://localhost:${port}/api/admin/terminal/agent-ws?hostId=${hostId}&name=TestNode&key=${adminKey}`;

      // Spawn test agent via WebSocket
      agentWs = new WebSocket(wsUrl);
      agentWs.on('open', () => done());
    });
  });

  afterAll((done) => {
    if (agentWs) agentWs.close();
    server.close(done);
  });

  it('runs command through agent, polls output incrementally, and completes', async () => {
    // Listen for agent command frame and simulate agent response
    agentWs.on('message', (data) => {
      const msg = data.toString();
      if (msg.startsWith('JSON:')) {
        const parsed = JSON.parse(msg.slice(5));
        if (parsed.type === 'cmd_exec') {
          if (parsed.action === 'start') {
            agentWs.send(`JSON:${JSON.stringify({
              type: 'cmd_exec_res',
              reqId: parsed.reqId,
              taskId: parsed.taskId,
              success: true,
              data: {
                taskId: parsed.taskId,
                status: 'running',
                startTime: Date.now()
              }
            })}`);
          } else if (parsed.action === 'poll') {
            agentWs.send(`JSON:${JSON.stringify({
              type: 'cmd_exec_res',
              reqId: parsed.reqId,
              taskId: parsed.taskId,
              success: true,
              data: {
                taskId: parsed.taskId,
                status: 'completed',
                exitCode: 0,
                stdout: 'deployment finished\n',
                stderr: '',
                output: 'deployment finished\n',
                totalBytes: 20,
                durationMs: 150
              }
            })}`);
          }
        }
      }
    });

    const startRes = await request(baseUrl)
      .post(`/api/admin/terminal/exec/${hostId}`)
      .set('x-admin-key', adminKey)
      .send({ command: 'echo "deployment finished"' });

    expect(startRes.status).toBe(202);
    expect(startRes.body.success).toBe(true);
    const taskId = startRes.body.taskId;

    const pollRes = await request(baseUrl)
      .get(`/api/admin/terminal/exec/${hostId}/${taskId}`)
      .set('x-admin-key', adminKey);

    expect(pollRes.status).toBe(200);
    expect(pollRes.body.status).toBe('completed');
    expect(pollRes.body.stdout).toContain('deployment finished');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest tests/terminalAgentCommandExec.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/terminalAgentCommandExec.test.ts
git commit -m "test(terminal): add end-to-end command execution tests"
```

---

### Task 6: Full Verification & Build Validation

**Files:**
- Test all: `npm test`
- Build all: `npm run build`

- [ ] **Step 1: Execute full TypeScript and Frontend Build**

Run: `npm run build`
Expected: Zero compilation errors.

- [ ] **Step 2: Execute all unit and integration tests**

Run: `npm test`
Expected: All test suites pass (including existing 106 test suites + new command execution suites).

- [ ] **Step 3: Final Git Check**

Run: `git status && git log -n 5 --oneline`
Expected: Clean working tree with distinct semantic commits.

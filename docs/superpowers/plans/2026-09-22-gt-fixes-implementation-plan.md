# GT.JS 核心缺陷重构实施计划 (Signaling Isolation, Orphan Process Cleanup & CLI Parsing)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `gt.js` 的信令/数据流混淆（采用 WebSocket Binary 帧物理隔离）、孤儿进程级联泄漏（统一 POSIX 进程组与 Windows 进程树强杀及退出钩子）以及命令行参数解析缺陷（严格两阶段解析器与参数安全转义，支持 `gt logs -f`）。

**Architecture:** 
1. **信令隔离**：PTY 原始终端输出在 Node Agent、Rust Agent 中均作为 WebSocket Binary 帧发送；服务端 `terminalWs.ts` 识别 Binary 帧直接路由到终端数据流缓冲区，仅对带有 `JSON:` 前缀的 Text 帧执行控制信令解析，彻底移除危险的裸 JSON 探测；
2. **进程治理**：在 `gt.js` 中抽象 `killProcessTree`，利用 `detached: true` 产生的进程组（PGID），通过 `process.kill(-pid, signal)` 发送组信号并实行 1 秒两阶段优雅与强杀兜底，在 Agent 退出钩子（`SIGINT`/`SIGTERM`/`exit`/`uncaughtException`）中批量回收所有运行中任务；
3. **参数解析**：将 `gt exec` 参数解析重构为确定 HOST 前（Options 解析）与确定 HOST 后（所有后续参数透传为远程命令）的状态机，保留单引号转义，并为 `gt logs` 增加 `-f/--follow` 流式跟踪。

**Tech Stack:** Node.js (CommonJS / ES2020), TypeScript, WebSocket (`ws`), Node.js `child_process` (POSIX process groups & signals), Jest.

## Global Constraints

- **零外部新增依赖**：所有改动纯依靠 Node.js 内置模块（`child_process`, `os`, `path`, `fs`）与现有依赖（`ws`）。
- **向后兼容性**：服务端继续兼容现有前端 Web 控制台的 `JSON:` 控制帧与 Binary 帧接收。
- **编码与平台标准**：保持 UTF-8 无截断，POSIX 环境以负数 PID 杀进程组，Windows 环境以 `taskkill /T /F` 杀进程树。
- **严格 TDD**：先编写针对缺陷场景的失败测试用例，再进行针对性修复并验证通过。

---

### Task 1: 命令行参数解析器重构与远程参数转义保护 (CLI Parsing & Safe Quoting)

**Files:**
- Modify: `scripts/gt.js:1434-1538`
- Test: `tests/gtCli.test.ts`

**Interfaces:**
- Consumes: `process.argv`
- Produces: 
  - `parseExecArgs(cmdArgs: string[]): { host: string, fullCommand: string, options: ExecOptions }`
  - `quoteShellArg(arg: string): string`

- [ ] **Step 1: 编写重现参数贪婪拦截及引号丢失的失败测试用例**

在 `tests/gtCli.test.ts` 中添加测试：
```typescript
it('does not absorb remote flags like -t or -w after host is specified', async () => {
  // Mock 服务器会收到完整的命令
  const res = await runGt(['exec', '--server', `http://127.0.0.1:${serverPort}`, 'node-1', 'curl', '-t', '10', 'http://example.com']);
  expect(res.code).toBe(0);
});

it('preserves spaces and quotes in arguments safely', async () => {
  const res = await runGt(['exec', '--server', `http://127.0.0.1:${serverPort}`, 'node-1', 'grep', 'hello world', 'app.log']);
  expect(res.code).toBe(0);
});
```

- [ ] **Step 2: 运行测试并验证其失败或异常行为**

运行: `npx jest tests/gtCli.test.ts -t "does not absorb remote flags"`
期望: 测试失败或显示 `-t 10` 被拦截为 `gt` 的 `--timeout 10`。

- [ ] **Step 3: 在 `scripts/gt.js` 中实现状态机解析与参数转义**

在 `scripts/gt.js` 中重写 `gt exec` 参数处理：
```javascript
function quoteShellArg(arg) {
  if (typeof arg !== 'string') return '';
  if (/^[a-zA-Z0-9_.\-\/=:@]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function parseExecArgs(args) {
  let detach = false;
  let workdir = undefined;
  let timeoutMs = 300000;
  let quiet = false;
  let pollInterval = 500;
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
    } else if (a === '-q' || a === '--quiet') {
      quiet = true;
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
      // Unknown option before host
      throw new Error(`Unknown option before host: ${a}`);
    } else {
      host = a;
      i++;
      break;
    }
    i++;
  }

  // Phase 2: everything after host is remote command arguments
  while (i < args.length) {
    commandParts.push(args[i++]);
  }

  const fullCommand = commandParts.map(quoteShellArg).join(' ').trim();
  return {
    host,
    fullCommand,
    commandParts,
    options: { detach, workdir, timeoutMs, quiet, pollInterval, env: envVars }
  };
}
```
并在 CLI 分发器中使用该解析函数。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx jest tests/gtCli.test.ts`
期望: 所有 CLI 测试全部通过 (PASS)。

- [ ] **Step 5: 提交更改**

```bash
git add scripts/gt.js tests/gtCli.test.ts
git commit -m "fix(gt): implement two-phase cli argument parser and safe shell quoting"
```

---

### Task 2: 扩展 `gt logs` 支持实时跟踪 (`-f / --follow`)

**Files:**
- Modify: `scripts/gt.js:1244-1287`
- Test: `tests/gtCli.test.ts`

**Interfaces:**
- Consumes: `gt logs <host> <taskId> [-f|--follow]`
- Produces: 类似 `gt exec` 的流式日志轮询，直到任务完成。

- [ ] **Step 1: 编写 `gt logs -f` 功能的测试用例**

在 `tests/gtCli.test.ts` 中添加：
```typescript
it('supports follow mode with -f flag on logs', async () => {
  const res = await runGt(['logs', '--server', `http://127.0.0.1:${serverPort}`, 'node-1', 'task-ok', '-f']);
  expect(res.code).toBe(0);
  expect(res.stdout).toContain('Hello From Remote');
});
```

- [ ] **Step 2: 运行测试并验证其失败**

运行: `npx jest tests/gtCli.test.ts -t "supports follow mode with -f"`
期望: FAIL (当前未处理 `-f`，将参数识别错或仅打印一次快照)。

- [ ] **Step 3: 在 `scripts/gt.js` 的 `logs` 分支中实现跟随轮询逻辑**

在 `scripts/gt.js` 中扩展 `logs`：
- 解析出 `hostId`、`taskId` 以及可选的 `-f / --follow`、`--poll-interval` 参数；
- 如果未指定 `-f`，保留现有的快照获取逻辑；
- 如果指定了 `-f`，使用循环增量拉取（`offset` 轮询），一旦 `status !== 'running'` 且输出完全打印后优雅退出。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx jest tests/gtCli.test.ts -t "supports follow mode with -f"`
期望: PASS。

- [ ] **Step 5: 提交代码**

```bash
git add scripts/gt.js tests/gtCli.test.ts
git commit -m "feat(gt): add follow mode (-f/--follow) to gt logs"
```

---

### Task 3: 孤儿进程治理与子进程生命周期全面保护 (Orphan Process Cleanup)

**Files:**
- Modify: `scripts/gt.js:307-583`, `scripts/gt.js:1047-1072`
- Test: `tests/terminalTaskManager.test.ts`

**Interfaces:**
- Consumes: `child.pid`, `taskManager.tasks`
- Produces:
  - `killProcessTree(child: ChildProcess, signal?: string): void`
  - `killProcessTreeSync(pid: number, signal?: string): void`
  - Agent 全局退出钩子绑定（`SIGINT`, `SIGTERM`, `SIGHUP`, `exit`, `uncaughtException`）

- [ ] **Step 1: 编写验证衍生子进程级联终止的测试用例**

在 `tests/terminalTaskManager.test.ts` 中添加针对派生子进程的测试：
```typescript
it('kills entire process group and all child processes when task is killed', async () => {
  const tm = new TaskManager();
  const taskId = 'test-group-kill-' + Date.now();
  // 派生一个在后台持续运行的 sleep 子进程
  const res = tm.startTask({
    taskId,
    command: 'sleep 30 & sleep 30 & wait',
  });
  expect(res.success).toBe(true);

  // 稍微等待子进程派生完毕
  await new Promise(r => setTimeout(r, 200));

  const killRes = tm.killTask(taskId);
  expect(killRes.success).toBe(true);

  // 验证进程状态变为 killed
  const task = tm.getTask(taskId);
  expect(['killed', 'failed']).toContain(task.status);
});
```

- [ ] **Step 2: 运行测试确认当前实现存在不足或完善边界检查**

运行: `npx jest tests/terminalTaskManager.test.ts -t "kills entire process group"`
期望: 检查当前 killChild 的行为。

- [ ] **Step 3: 实现 `killProcessTree` 与两阶段退出逻辑，并在 Agent 退出时全局清理**

在 `scripts/gt.js` 中：
1. 编写跨平台进程组终止函数：
```javascript
function killProcessTree(child, signal = 'SIGTERM') {
  if (!child || !child.pid) return;
  const isWindows = os.platform() === 'win32';
  try {
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (e) {
    try { child.kill(signal); } catch {}
  }
}
```
2. 在 `TaskManager.killTask` 中引入 1000ms 的 `SIGKILL` 组兜底定时器；
3. 在 `cleanup()` 和退出事件监听器中：
```javascript
function cleanup() {
  if (isExiting) return;
  isExiting = true;
  stopHeartbeat();
  console.log('\n[Agent] Shutting down agent...');
  if (ws) {
    try { ws.close(); } catch {}
  }
  if (ptyProcess) {
    try { ptyProcess.kill('SIGTERM'); } catch {}
  }
  for (const task of taskManager.tasks.values()) {
    if (task.status === 'running' && task.child) {
      killProcessTree(task.child, 'SIGTERM');
      setTimeout(() => {
        if (task.child) killProcessTree(task.child, 'SIGKILL');
      }, 500);
    }
  }
  setTimeout(() => process.exit(0), 600);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGHUP', cleanup);
```

- [ ] **Step 4: 运行全部任务管理测试验证通过**

运行: `npx jest tests/terminalTaskManager.test.ts`
期望: 所有 TaskManager 测试顺利通过 (PASS)。

- [ ] **Step 5: 提交代码**

```bash
git add scripts/gt.js tests/terminalTaskManager.test.ts
git commit -m "fix(gt): enhance process group termination and register exit hooks to prevent orphans"
```

---

### Task 4: 信令与数据流强隔离（WebSocket Binary 帧与裸 JSON 探测清除）

**Files:**
- Modify: `scripts/gt.js:215-234`, `scripts/gt.js:885-890`, `src/terminal/routes/terminalWs.ts:92-142`, `src/terminal/services/terminalHostManager.ts:127-142`
- Test: `tests/terminalWs.test.ts`, `tests/terminalAgent.test.ts`

**Interfaces:**
- Consumes: WebSocket `message` 事件 (RawData / Buffer / string)
- Produces:
  - Agent 发送 PTY 输出时统一调用 `ws.send(Buffer.from(data))` (Binary Frame)
  - 服务端与 Agent 仅识别 `JSON:` 前缀的控制信令，彻底废除裸 JSON 字符串判断

- [ ] **Step 1: 编写终端打印裸 JSON 字符串不被误识别为信令的测试用例**

在 `tests/terminalWs.test.ts` 中添加测试：
```typescript
it('treats raw JSON output in binary or text frame as terminal output rather than control command', async () => {
  // 模拟发送包含 {"type":"reset"} 的终端数据
  // 验证它被写入了终端会话的 historyBuffer，而不是触发了 session.reset()
});
```

- [ ] **Step 2: 运行测试并验证其在当前旧逻辑下会误触发或失败**

运行: `npx jest tests/terminalWs.test.ts -t "treats raw JSON output"`
期望: 在旧逻辑下因为存在裸 JSON 嗅探而发生误判。

- [ ] **Step 3: 修改 `scripts/gt.js`、`terminalWs.ts` 和 `terminalHostManager.ts`**

1. 在 `scripts/gt.js` 中：
   - 彻底移除 `parseControlMessage` 中的 `startsWith('{') && endsWith('}')` 裸 JSON 嗅探分支；控制消息必须以 `JSON:` 开头。
   - 在 `ptyProcess.onData((data) => { ... })` 中，强制发送二进制 Buffer：`ws.send(Buffer.isBuffer(data) ? data : Buffer.from(data))`。
2. 在 `src/terminal/routes/terminalWs.ts` 中：
   - 在 `agentWss.on('connection')` 的消息处理中：
     - 若 `Buffer.isBuffer(message)` 且不是以 `'JSON:'` 开头（或者只要不是文本），一律无条件转发至 `terminalHostManager.handleAgentData(hostId, message)`。
     - 若为文本且以 `JSON:` 开头，才进行 `JSON.parse` 处理控制信令。彻底避免任何终端输出被误判为信令。
3. 在 `src/terminal/services/terminalHostManager.ts` 中：
   - `RemoteAgentTerminalSession.handleData` 支持处理 `Buffer | string`，并保持原有逻辑，安全追加到历史缓冲区。

- [ ] **Step 4: 运行相关终端与 WebSocket 测试验证通过**

运行: `npx jest tests/terminalWs.test.ts tests/terminalAgent.test.ts`
期望: 所有测试通过 (PASS)。

- [ ] **Step 5: 提交代码**

```bash
git add scripts/gt.js src/terminal/routes/terminalWs.ts src/terminal/services/terminalHostManager.ts tests/terminalWs.test.ts tests/terminalAgent.test.ts
git commit -m "fix(terminal): isolate pty binary stream from json control messages and drop bare json sniffing"
```

---

### Task 5: 全套回归测试与集成验证 (Regression & Integration Testing)

**Files:**
- Test: `tests/gtCli.test.ts`, `tests/terminalTaskManager.test.ts`, `tests/terminalWs.test.ts`, `tests/terminalExecCli.test.ts`

- [ ] **Step 1: 运行全量单元测试与集成测试**

运行: `npx jest --runInBand tests/gtCli.test.ts tests/terminalTaskManager.test.ts tests/terminalWs.test.ts tests/terminalExecCli.test.ts`
期望: 全部测试集 100% 通过。

- [ ] **Step 2: 编译前后端并验证构建无错误**

运行: `npm run build`
期望: TypeScript 编译成功，Vite 构建成功，无类型报错。

- [ ] **Step 3: 提交并标记修复完成**

```bash
git commit --allow-empty -m "chore(gt): complete signaling isolation, process tree cleanup, and cli parsing verification"
```

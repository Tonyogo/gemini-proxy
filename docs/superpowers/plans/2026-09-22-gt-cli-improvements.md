# gt 终端 CLI 与 Agent 脚本优化及缺陷修复实现计划 (gt CLI Improvements & Bugfixes Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `scripts/gt.js` 中的增量输出切片丢失 bug、孤儿进程无法终止问题，实现 `login`、`logout`、`config` 及 `~/.gt/config.json` 持久化，并移除 WebSocket URL 中的明文敏感秘钥，与 Rust 原生 `gt` 行为 100% 对齐。

**Architecture:** 
1. 内置 `ConfigStore` 类管理 `~/.gt/config.json`（0700 目录与 0600 文件权限），支持 CLI/环境变量/配置文件的标准继承层级；
2. 在 `TaskManager` 中引入基于 chunk 增量范围的输出切片机制，在 `getTask` 中正确返回指定 `offset` 之后的 stdout、stderr 与 output，并在 `gt exec` 客户端使用服务端返回的 `outputOffset` 进行后续轮询；
3. 子进程通过 `detached: true` 成为独立进程组 Leader，终止时使用负 PID 广播信号杀死全部子孙进程（Windows 下调用 `taskkill /T /F`）；
4. Agent 连接 WebSocket 移除 URL 上的 `key=` query 参数，统一通过 `x-admin-key` 请求头鉴权。

**Tech Stack:** Node.js, Express, WebSocket, child_process, Jest, Supertest.

## Global Constraints

- **配置路径与权限**: 持久化文件固定为 `~/.gt/config.json`，目录权限 `0700`，文件权限 `0600`。
- **配置覆盖层级**: `CLI flags (-s, -k) > 环境变量 (TERMINAL_SERVER, ADMIN_SECRET_KEY) > ~/.gt/config.json > 默认值 (http://localhost:3000 / 空)`。
- **零额外外部依赖**: 仅使用 Node.js 内置标准模块（`fs`, `path`, `os`, `crypto`, `child_process`, `http`, `https`, `readline` 等）及已有的 `ws`。
- **全量测试**: 每次任务完成后必须有对应的单元测试验证，全量 Jest 测试套件 `npm test` 保持 100% 通过。

---

### Task 1: 实现 `ConfigStore` 与 `login` / `logout` / `config` 命令支持

**Files:**
- Modify: `scripts/gt.js`
- Test: `tests/gtConfig.test.ts`

**Interfaces:**
- Produces: 
  - `ConfigStore`: `load()`, `save(data)`, `clear()`, `get(key)`, `set(key, val)`, `getEffectiveConfig(cliOpts)`
  - CLI 命令: `gt login [server] [key]`, `gt logout`, `gt config <list|get|set> [key] [val]`

- [x] **Step 1: 编写 `tests/gtConfig.test.ts` 针对 `ConfigStore` 及相关 CLI 命令的单元测试**

新建 `tests/gtConfig.test.ts`：
```typescript
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');
const configDir = path.join(os.homedir(), '.gt');
const configFile = path.join(configDir, 'config.json');

function runGt(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [gtPath, ...args], {
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString()
      });
    });
  });
}

describe('gt ConfigStore and login/logout/config commands', () => {
  let server: http.Server;
  let serverUrl: string;
  let backupConfig: string | null = null;

  beforeAll((done) => {
    if (fs.existsSync(configFile)) {
      backupConfig = fs.readFileSync(configFile, 'utf-8');
    }

    server = http.createServer((req, res) => {
      if (req.url === '/api/terminal/hosts') {
        const key = req.headers['x-admin-key'];
        if (key === 'valid-secret') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hosts: [] }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.listen(0, () => {
      const port = (server.address() as any).port;
      serverUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    if (backupConfig !== null) {
      fs.writeFileSync(configFile, backupConfig, 'utf-8');
    } else if (fs.existsSync(configFile)) {
      fs.unlinkSync(configFile);
    }
    server.close(done);
  });

  it('rejects login with invalid key (401)', async () => {
    const res = await runGt(['login', serverUrl, 'wrong-key']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Authentication failed');
  });

  it('successfully logs in and creates ~/.gt/config.json with 0600 permissions', async () => {
    const res = await runGt(['login', serverUrl, 'valid-secret']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully verified and logged in');
    expect(fs.existsSync(configFile)).toBe(true);

    const stat = fs.statSync(configFile);
    if (os.platform() !== 'win32') {
      expect((stat.mode & 0o777)).toBe(0o600);
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    expect(config.server).toBe(serverUrl);
    expect(config.key).toBe('valid-secret');
  });

  it('runs config list and masks secret key', async () => {
    const res = await runGt(['config', 'list']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(`server = "${serverUrl}"`);
    expect(res.stdout).toContain('key    = "val***"');
  });

  it('runs config set and get', async () => {
    const setRes = await runGt(['config', 'set', 'server', 'http://custom-server:3000']);
    expect(setRes.code).toBe(0);

    const getRes = await runGt(['config', 'get', 'server']);
    expect(getRes.code).toBe(0);
    expect(getRes.stdout.trim()).toBe('http://custom-server:3000');
  });

  it('runs logout and removes credentials from config.json', async () => {
    const res = await runGt(['logout']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully logged out');

    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    expect(config.key).toBeUndefined();
  });
});
```

- [x] **Step 2: 运行测试验证失败**

Run: `npx jest tests/gtConfig.test.ts`
Expected: FAIL（`gt login` 为未知命令）。

- [x] **Step 3: 在 `scripts/gt.js` 中实现 `ConfigStore` 及对应 CLI 命令**

在 `scripts/gt.js` 中：
1. 实现 `ConfigStore`：
   ```javascript
   class ConfigStore {
     static getConfigDir() {
       return path.join(os.homedir(), '.gt');
     }
     static getConfigFile() {
       return path.join(this.getConfigDir(), 'config.json');
     }
     static load() {
       try {
         const p = this.getConfigFile();
         if (fs.existsSync(p)) {
           return JSON.parse(fs.readFileSync(p, 'utf-8'));
         }
       } catch {}
       return {};
     }
     static save(data) {
       const dir = this.getConfigDir();
       if (!fs.existsSync(dir)) {
         fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
       }
       const file = this.getConfigFile();
       fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
       if (os.platform() !== 'win32') {
         try { fs.chmodSync(file, 0o600); } catch {}
         try { fs.chmodSync(dir, 0o700); } catch {}
       }
     }
     static clear() {
       try {
         const file = this.getConfigFile();
         if (fs.existsSync(file)) {
           fs.unlinkSync(file);
         }
       } catch {}
     }
   }
   ```
2. 在 `main()` 的配置解析中集成层级继承：
   ```javascript
   const stored = ConfigStore.load();
   let server = cliServer || process.env.TERMINAL_SERVER || process.env.GEMINI_PROXY_URL || stored.server || 'http://localhost:3000';
   let key = cliKey || process.env.ADMIN_SECRET_KEY || stored.key || '';
   ```
3. 在 `main()` 的 `switch (command)` 分支中添加 `login`、`logout`、`config`：
   - `login`: 校验 `/api/terminal/hosts`，成功则 `ConfigStore.save({ server, key })`；
   - `logout`: 调用 `ConfigStore.clear()`；
   - `config`: 处理 `list`（密码遮蔽）、`get`、`set`��
4. 更新 `printHelp()` 文档。

- [x] **Step 4: 运行测试验证通过**

Run: `npx jest tests/gtConfig.test.ts`
Expected: PASS

- [x] **Step 5: 提交 Task 1 代码**

```bash
git add scripts/gt.js tests/gtConfig.test.ts
git commit -m "feat(gt): add ConfigStore and implement login, logout, and config commands"
```

---

### Task 2: 修复 `TaskManager` 增量偏移量切片与客户端 `gt exec` 联动

**Files:**
- Modify: `scripts/gt.js`
- Test: `tests/terminalTaskManager.test.ts`

**Interfaces:**
- Consumes: `TaskManager.startTask`, `TaskManager.getTask`
- Produces:
  - `getTask(taskId, offset)`: 基于有序 chunks 正确计算在 `[offset, totalBytes)` 之间的增量 `stdout`、`stderr` 和 `output`，以及精确的 `outputOffset`
  - `gt exec`: 严格使用服务端返回的 `t.outputOffset` 递进更新，保证长命令流式输出无截断无丢失

- [x] **Step 1: 在 `tests/terminalTaskManager.test.ts` 中编写针对 stdout 与 stderr 混合增量切片的测试**

在 `tests/terminalTaskManager.test.ts` 中新增测试用例：
```typescript
it('correctly slices stdout and stderr independently when mixed output occurs', async () => {
  const res = tm.startTask({
    taskId: 'test-mixed',
    command: 'echo "out1" && echo "err1" >&2 && echo "out2" && echo "err2" >&2',
  });

  expect(res.success).toBe(true);

  // 等待执行结束
  let poll: any;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    poll = tm.getTask('test-mixed', 0);
    if (poll.status === 'completed' || poll.status === 'failed') break;
  }

  expect(poll.status).toBe('completed');
  expect(poll.stdout).toContain('out1\nout2');
  expect(poll.stderr).toContain('err1\nerr2');

  // 模拟第一批已读取一半字节
  const halfBytes = Math.floor(poll.totalBytes / 2);
  const secondHalf = tm.getTask('test-mixed', halfBytes);
  expect(secondHalf.outputOffset).toBe(poll.totalBytes);
  expect(secondHalf.output.length).toBeGreaterThan(0);

  // 模拟读取到末尾，再次轮询应返回空内容且 outputOffset 保持最新
  const endChunk = tm.getTask('test-mixed', poll.totalBytes);
  expect(endChunk.stdout).toBe('');
  expect(endChunk.stderr).toBe('');
  expect(endChunk.output).toBe('');
  expect(endChunk.outputOffset).toBe(poll.totalBytes);
});
```

- [x] **Step 2: 运行测试验证是否暴露问题**

Run: `npx jest tests/terminalTaskManager.test.ts`
Expected: 运行对比旧代���切片行为。

- [x] **Step 3: 重构 `TaskManager` 内部缓冲与切片机制**

在 `scripts/gt.js` 的 `TaskManager` 中：
1. 为每个 `taskRecord` 维护按顺序追加的 `chunks: []` 列表，每个 chunk 包含 `{ type, text, startOffset, endOffset }`；
2. 当接收到 stdout/stderr chunk 时：
   ```javascript
   const appendChunk = (type, chunk) => {
     const text = chunk.toString('utf-8');
     const bytes = Buffer.byteLength(text, 'utf-8');
     const startOffset = taskRecord.totalBytes;
     const endOffset = startOffset + bytes;
     taskRecord.totalBytes = endOffset;
     taskRecord.chunks.push({ type, text, startOffset, endOffset });

     if (type === 'stdout') taskRecord.stdout += text;
     else taskRecord.stderr += text;
     taskRecord.output += text;

     // 超过缓冲区限制时保留最新 5MB
     if (taskRecord.output.length > this.MAX_BUFFER_SIZE) {
       taskRecord.output = taskRecord.output.slice(-this.MAX_BUFFER_SIZE);
     }
   };
   ```
3. 在 `getTask(taskId, offset = 0)` 中：
   - 筛选所有 `endOffset > offset` 的 chunk；
   - 分别拼装增量的 `stdout`、`stderr` 与 `output`；
   - 返回 `{ success: true, taskId, status, exitCode, stdout, stderr, output, offset: totalBytes, outputOffset: totalBytes, totalBytes }`。
4. 在 `gt exec` 客户端的 `poll()` 逻辑中：
   ```javascript
   if (pollRes.data && pollRes.data.success) {
     const t = pollRes.data;
     if (t.stdout) process.stdout.write(t.stdout);
     if (t.stderr) process.stderr.write(t.stderr);
     offset = t.outputOffset !== undefined ? t.outputOffset : t.offset;
     ...
   }
   ```

- [x] **Step 4: 运行 `terminalTaskManager` 与 `terminalAgentCommandExec` 测试验证**

Run: `npx jest tests/terminalTaskManager.test.ts tests/terminalAgentCommandExec.test.ts`
Expected: PASS

- [x] **Step 5: 提交 Task 2 代码**

```bash
git add scripts/gt.js tests/terminalTaskManager.test.ts
git commit -m "fix(gt): resolve incremental log slicing and align client offset polling"
```

---

### Task 3: 启用独立进程组（`detached: true`）与子孙进程树强杀

**Files:**
- Modify: `scripts/gt.js`
- Test: `tests/terminalTaskManager.test.ts`

**Interfaces:**
- Produces: `TaskManager.killTask(taskId, signal)` 确保整个进程树（包含后台派生子进程）被彻底终止

- [x] **Step 1: 在 `tests/terminalTaskManager.test.ts` 中编写验证子孙进程被杀死的测试用例**

在 `tests/terminalTaskManager.test.ts` 中添加测试：
```typescript
it('terminates the entire process tree including spawned child processes on killTask', async () => {
  if (process.platform === 'win32') return; // Unix 进程组测试

  // 派生一个带后台 sleep 的复杂子进程
  const res = tm.startTask({
    taskId: 'test-tree-kill',
    command: 'sh -c "sleep 30 & wait"',
  });

  expect(res.success).toBe(true);
  await new Promise((r) => setTimeout(r, 200));

  const killRes = tm.killTask('test-tree-kill', 'SIGKILL');
  expect(killRes.success).toBe(true);

  // 轮询等待任务标记终止
  let poll: any;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100));
    poll = tm.getTask('test-tree-kill');
    if (poll.status !== 'running') break;
  }
  expect(poll.status).toBe('killed');
});
```

- [x] **Step 2: 运行测试验证行为**

Run: `npx jest tests/terminalTaskManager.test.ts`
Expected: 验证子进程退出状态。

- [x] **Step 3: 更新 `scripts/gt.js` 中的进程派生与终止逻辑**

1. 在 `startTask` 中：
   - 非 Windows 平台设置 `detached: true`；
2. 在 `killTask` 及超时清理中：
   - 非 Windows：优先使用 `process.kill(-task.child.pid, signal)`，若异常则降级为 `task.child.kill(signal)`；3秒后若未退出使用 `-task.child.pid` 发送 `SIGKILL`；
   - Windows 平台：调用 `taskkill /pid ${task.child.pid} /T /F`；
3. 处理捕获异常并清理计时器。

- [x] **Step 4: 运行测试验证**

Run: `npx jest tests/terminalTaskManager.test.ts`
Expected: PASS

- [x] **Step 5: 提交 Task 3 代码**

```bash
git add scripts/gt.js tests/terminalTaskManager.test.ts
git commit -m "fix(gt): spawn tasks with detached process group and terminate full process tree"
```

---

### Task 4: 安全加固、全量回归测试与构建验证

**Files:**
- Modify: `scripts/gt.js`
- Test: 全量测试套件

**Interfaces:**
- Produces: WebSocket 连接安全传输（去除 Query String 中的 `key=`），全量回归测试通过

- [x] **Step 1: 移除 `resolveWebSocketUrl` 中的明文 key**

在 `scripts/gt.js` 中：
1. `resolveWebSocketUrl` 仅将 `hostId`, `name`, `hostname`, `ip`, `platform` 加入 query string，不再携带 `key`；
2. WebSocket 实例创建时已设置 `headers: { 'x-admin-key': adminKey }`，确保握手阶段安全认证。

- [x] **Step 2: 运行所有 CLI 和 Agent 测试**

Run: `npx jest tests/gtCli.test.ts tests/terminalAgent.test.ts tests/terminalAgentCommandExec.test.ts tests/terminalAgentConflict.test.ts tests/terminalAgentKeepalive.test.ts`
Expected: 100% PASS

- [x] **Step 3: 运行完整自动化测试套件**

Run: `npm test`
Expected: 129 个测试套件全部通过（0 failures）。

- [x] **Step 4: 运行全量构建验证**

Run: `npm run build`
Expected: 前后端编译打包顺利完成。

- [x] **Step 5: 提交 Task 4 代码并确认工作区干净**

```bash
git add scripts/gt.js
git commit -m "fix(gt): pass admin key via header only and update cli help"
```

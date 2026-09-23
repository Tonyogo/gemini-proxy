# gt agent 后台守护进程运行与 Docker 风格生命周期管理实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `gt agent` 引入自包含、零外部依赖的 Docker 风格后台守护进程支持（`gt agent -d / start`、`status / ps`、`stop`、`restart`、`logs -f`），并统一强制依赖 `gt auth login` 认证体系，彻底废除 `--server` 和 `--key` 参数以防多源配置冲突。

**Architecture:**
1. 在 `ConfigStore` 扩展 `agent.json` 元数据管理与进程状态探测工具（`isProcessAlive`, `AgentDaemonManager`）。
2. 在 `runAgent` 入口前��执行认证强制检查（必须有已登录的 server & key，否则友好拦截引导使用 `gt auth login`，并明确拒绝 `--server`/`--key` 参数）。
3. 使用 Node.js 原生 `child_process.spawn(..., { detached: true, stdio: ['ignore', logFd, logFd] })` 结合 `child.unref()` 实现无外部依赖的真守护进程派生与会话脱离。
4. 提供生命周期子命令：`start` (或 `-d`)、`status` (或 `ps`)、`stop`、`restart`、`logs` (`-f`)。

**Tech Stack:** Node.js (CommonJS, child_process, fs, os, path), WebSocket (`ws`), Jest

## Global Constraints
- 零新增 npm 依赖，严禁在 `package.json` 中引入新的外部依赖。
- 彻底废除 `gt agent` 的 `--server` 和 `--key` 参数，统一读取 `ConfigStore` 中的登录凭据。
- 跨平台兼容：Linux/macOS 使用 `detached: true` (`setsid`)，Windows 同样支持进程独立常驻。
- 测试必须支持隔离环境（通过 `GT_CONFIG_DIR` 覆盖默认的 `~/.gt` 目录，防止污染开发者环境）。

---

### Task 1: 编写认证前置校验与废除参数的单测套件 (TDD Red)

**Files:**
- Create: `tests/gtAgentDaemon.test.ts`
- Test: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Consumes: `ConfigStore` from `scripts/gt.js`
- Produces: 验证 `gt agent` 阻断 `--server`/`--key`、在未登录时阻断并提示 `gt auth login`，在已登录时允许启动

- [x] **Step 1: 编写测试用例**

```typescript
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

describe('gt agent unified authentication and parameter guards', () => {
  let testConfigDir: string;

  beforeEach(() => {
    testConfigDir = path.join(os.tmpdir(), `gt-test-daemon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    } catch {}
  });

  it('rejects --server and --key flags with informative error message', () => {
    const res = spawnSync('node', [gtPath, 'agent', '--server=http://localhost:3000'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Error: '--server' is removed. Please use 'gt auth login <server> <key>' to authenticate.");

    const resKey = spawnSync('node', [gtPath, 'agent', '--key=secret'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });

    expect(resKey.status).toBe(1);
    expect(resKey.stderr).toContain("Error: '--key' is removed. Please use 'gt auth login <server> <key>' to authenticate.");
  });

  it('rejects agent execution if not authenticated via gt auth login', () => {
    // Config directory has no config.json and no valid env vars
    const cleanEnv: Record<string, string> = { ...process.env, GT_CONFIG_DIR: testConfigDir };
    delete cleanEnv.TERMINAL_SERVER;
    delete cleanEnv.ADMIN_SECRET_KEY;
    delete cleanEnv.GEMINI_PROXY_URL;

    const res = spawnSync('node', [gtPath, 'agent'], {
      env: cleanEnv,
      encoding: 'utf-8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Error: No authenticated server found. Please run 'gt auth login <server> <key>' first.");
  });
});
```

- [x] **Step 2: 运行测试验证失败 (Red)**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: FAIL（因为当前 `gt agent` 仍接受 `--server` / `--key`，且未登录时默认 fallback 到 `http://localhost:3000`）。

- [x] **Step 3: 提交失败测试**

```bash
git add tests/gtAgentDaemon.test.ts
git commit -m "test(gt): add failing tests for agent auth guards and removed flags"
```

---

### Task 2: 在 `scripts/gt.js` 中支持 `GT_CONFIG_DIR` 并实现 Agent 统一认证前置校验

**Files:**
- Modify: `scripts/gt.js:656-725` (ConfigStore 支持 `GT_CONFIG_DIR`)
- Modify: `scripts/gt.js:1630-1700` (runAgent 强制认证校验与参数拦截)

**Interfaces:**
- Produces: `ConfigStore.getConfigDir()` 支持 `process.env.GT_CONFIG_DIR`
- Produces: `validateAgentAuth(options)`: 严格阻断 `--server`/`--key`，并校验是否有已认证凭证，否则退出码 1

- [x] **Step 1: 修改 ConfigStore 支持自定义配置目录**

```javascript
  static getConfigDir() {
    return process.env.GT_CONFIG_DIR || path.join(os.homedir(), '.gt');
  }
```

- [x] **Step 2: 在 `runAgent` 中添加参数校验与单一认证源检查**

在 `runAgent` 顶部：
```javascript
  // 1. Check for removed flags
  if (options.server || agentArgs.some(a => a === '-s' || a.startsWith('--server') || a.startsWith('-s='))) {
    console.error("Error: '--server' is removed. Please use 'gt auth login <server> <key>' to authenticate.");
    process.exit(1);
  }
  if (options.key || agentArgs.some(a => a === '-k' || a.startsWith('--key') || a.startsWith('-k='))) {
    console.error("Error: '--key' is removed. Please use 'gt auth login <server> <key>' to authenticate.");
    process.exit(1);
  }

  // 2. Enforce authentication from ConfigStore
  const stored = ConfigStore.load();
  const effectiveServer = stored.server || process.env.TERMINAL_SERVER || process.env.GEMINI_PROXY_URL;
  const effectiveKey = stored.key || process.env.ADMIN_SECRET_KEY;

  if (!effectiveServer || !effectiveKey) {
    console.error("Error: No authenticated server found. Please run 'gt auth login <server> <key>' first.");
    process.exit(1);
  }

  const serverArg = effectiveServer;
  const adminKey = effectiveKey;
```

- [x] **Step 3: 运行单测验证通过 (Green)**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: PASS（参数拦截与未登录拦截生效）。

- [x] **Step 4: 提交代码**

```bash
git add scripts/gt.js
git commit -m "feat(gt): enforce unified auth login in gt agent and remove --server/--key flags"
```

---

### Task 3: 实现 `AgentDaemonManager`（状态记录、存活探测与生命周期操作）

**Files:**
- Modify: `scripts/gt.js:725-780`
- Test: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Produces: `AgentDaemonManager.getStatusFile()`: 返回 `~/.gt/agent.json`
- Produces: `AgentDaemonManager.getLogFile()`: 返回 `~/.gt/agent.log`
- Produces: `AgentDaemonManager.isProcessAlive(pid)`: 探测 PID 是否存活
- Produces: `AgentDaemonManager.getStatus()`: 获取后台 agent 状态对象
- Produces: `AgentDaemonManager.stop()`: 优雅停止并清理状态
- Produces: `AgentDaemonManager.getLogs(lines, follow)`: 读取或持续跟踪日志

- [x] **Step 1: 编写针对 DaemonManager 的单元测试**

在 `tests/gtAgentDaemon.test.ts` 中增加测试用例：
```typescript
  it('detects process alive correctly and manages agent state file', () => {
    // 导入 AgentDaemonManager 进行单元测试
    const { AgentDaemonManager } = require('../scripts/gt.js');
    expect(AgentDaemonManager.isProcessAlive(process.pid)).toBe(true);
    expect(AgentDaemonManager.isProcessAlive(99999999)).toBe(false);
  });
```

- [x] **Step 2: 在 `scripts/gt.js` 中实现 `AgentDaemonManager` 类**

```javascript
class AgentDaemonManager {
  static getStatusFile() {
    return path.join(ConfigStore.getConfigDir(), 'agent.json');
  }

  static getLogFile() {
    return path.join(ConfigStore.getConfigDir(), 'agent.log');
  }

  static isProcessAlive(pid) {
    if (!pid || typeof pid !== 'number') return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  static getStatus() {
    const p = this.getStatusFile();
    if (!fs.existsSync(p)) return { running: false };
    try {
      const state = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (this.isProcessAlive(state.pid)) {
        return { running: true, ...state };
      } else {
        // Stale state file, clean it up
        try { fs.unlinkSync(p); } catch {}
        return { running: false, stale: true, ...state };
      }
    } catch {
      return { running: false };
    }
  }

  static saveStatus(state) {
    const dir = ConfigStore.getConfigDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.getStatusFile(), JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  static clearStatus() {
    try {
      const p = this.getStatusFile();
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }

  static async stop() {
    const status = this.getStatus();
    if (!status.running) {
      this.clearStatus();
      return { success: true, message: 'Agent is not running.' };
    }

    const pid = status.pid;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}

    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (!this.isProcessAlive(pid)) {
        this.clearStatus();
        return { success: true, pid, message: `Agent (PID: ${pid}) stopped successfully.` };
      }
      await new Promise(r => setTimeout(r, 100));
    }

    // Force kill if still alive
    killProcessTreeSync(pid, 'SIGKILL');
    this.clearStatus();
    return { success: true, pid, message: `Agent (PID: ${pid}) forcibly terminated.` };
  }
}
```

- [x] **Step 3: 运行单测验证**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: PASS

- [x] **Step 4: 提交代码**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): implement AgentDaemonManager for state and process control"
```

---

### Task 4: 实现 `gt agent -d / start / status / stop / restart / logs` 命令行调度

**Files:**
- Modify: `scripts/gt.js:1630-1750`
- Modify: `scripts/gt.js:2980-3050`
- Test: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Produces: CLI 支持 `gt agent -d`, `gt agent start`, `gt agent status` (或 `ps`), `gt agent stop`, `gt agent restart`, `gt agent logs`

- [x] **Step 1: 在 `tests/gtAgentDaemon.test.ts` 中编写集成测试**

```typescript
  it('supports background execution via gt agent -d and lifecycle management', async () => {
    // 1. First login to set credentials
    const loginRes = spawnSync('node', [gtPath, 'auth', 'login', 'http://127.0.0.1:3000', 'mock-key'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });
    // Write valid mock config directly if server not running
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // 2. Start agent in daemon mode
    const startRes = spawnSync('node', [gtPath, 'agent', '-d', '--name=my-daemon'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });

    expect(startRes.status).toBe(0);
    expect(startRes.stdout).toContain('Agent started in background (PID:');

    // 3. Check status
    const statusRes = spawnSync('node', [gtPath, 'agent', 'status'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });
    expect(statusRes.status).toBe(0);
    expect(statusRes.stdout).toContain('Running');
    expect(statusRes.stdout).toContain('my-daemon');

    // 4. Prevent duplicate start
    const dupRes = spawnSync('node', [gtPath, 'agent', '-d'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });
    expect(dupRes.status).toBe(1);
    expect(dupRes.stderr).toContain('already running');

    // 5. Read logs
    const logsRes = spawnSync('node', [gtPath, 'agent', 'logs', '-n', '20'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });
    expect(logsRes.status).toBe(0);

    // 6. Stop agent
    const stopRes = spawnSync('node', [gtPath, 'agent', 'stop'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });
    expect(stopRes.status).toBe(0);
    expect(stopRes.stdout).toContain('stopped');

    // 7. Status should show not running
    const statusAfter = spawnSync('node', [gtPath, 'agent', 'status'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
    });
    expect(statusAfter.stdout).toContain('No background agent running');
  });
```

- [x] **Step 2: 在 `scripts/gt.js` 中实现后台派生与子命令分发**

在 `runAgent` 中添加后台派生判断：
- 当用户调用 `gt agent -d` 或 `gt agent start` 时：
  1. 检查 `AgentDaemonManager.getStatus()`，若已有进程存活则报错退出。
  2. 打开 `agent.log` 得到文件描述符。
  3. 执行 `spawn(process.execPath, [path.resolve(__filename), 'agent', '--internal-daemon', ...cleanArgs], { detached: true, stdio: ['ignore', logFd, logFd] })`。
  4. 写入 `agent.json`。
  5. `child.unref()` 并打印输出：
     ```
     Agent started in background (PID: ${child.pid}, Host: ${hostName})
     Logs: ${logFile}
     Run 'gt agent logs -f' to follow logs.
     Run 'gt agent stop' to stop agent.
     ```
  6. 主进程 `process.exit(0)`。

在 CLI 主路由处理子命令：
- `gt agent status` / `ps`: 打印状态表格。
- `gt agent stop`: 调用 `AgentDaemonManager.stop()`。
- `gt agent restart`: 先 `stop()`，再拉起新后台进程。
- `gt agent logs`: 输出尾部日志（`-n`），支持 `-f` 实时跟踪。

- [x] **Step 3: 运行自动化测试验证 (Green)**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: PASS

- [x] **Step 4: 提交代码**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): support daemon lifecycle subcommands start, status, stop, restart, logs"
```

---

### Task 5: 更新使用帮助与回归测试

**Files:**
- Modify: `scripts/gt.js:158-210` (printHelp 帮助菜单更新)
- Modify: `CLAUDE.md` (同步更新 CLI 文档)
- Test: `tests/gtCli.test.ts`
- Test: `tests/gtAgentPtyFallback.test.ts`
- Test: `tests/gtAgentDaemon.test.ts`

- [x] **Step 1: 在 `printHelp()` 中补充后台 agent 操作说明**

```text
  agent [SUBCOMMAND] [OPTIONS]   Run reverse terminal agent (foreground or daemon)
    gt agent                     Run in foreground (logs to console)
    gt agent start / -d          Start agent daemon in background
    gt agent status / ps         Show background agent status
    gt agent stop                Stop background agent
    gt agent restart             Restart background agent
    gt agent logs [-f] [-n 50]   View background agent logs
```

- [x] **Step 2: 运行全量终端相关测试套件进行全面回归**

Run: `npx jest tests/gtCli.test.ts tests/gtAgentPtyFallback.test.ts tests/gtAgentDaemon.test.ts`
Expected: ALL PASS

- [x] **Step 3: 提交代码**

```bash
git add scripts/gt.js CLAUDE.md
git commit -m "docs(gt): update CLI help and CLAUDE.md for gt agent daemon mode"
```

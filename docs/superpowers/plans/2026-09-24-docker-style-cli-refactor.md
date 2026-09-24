# Docker 风格命令行体系重构实施计划 (gt CLI Refactoring Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `scripts/gt.js` 为 Docker 风格简洁命令体系，以远程 Hub 与 Node 节点为第一公民（`gt ps`, `gt exec`, `gt logs`, `gt kill`, `gt prune`, `gt login`, `gt logout`），本地 Agent 守护进程统一收敛在 `gt agent` 命名空间下，并实现旧命令严格迁移拦截（错误码 125）与自动化别名静默兼容。

**Architecture:** 
重构 `scripts/gt.js` 的顶层分发与参数路由解析。顶层一级命令专注远程操作，提取通用的主机与任务解析机制；通过统一的迁移映射表 `commandMigrationMap` 拦截历史顶层 agent 动词（`run`, `stop`, `restart`, `rm`, `hosts`, `nodes`）并返回 125 退出码与明确迁移提示；为自动化脚本提供透明隐式别名支持；完善 `gt logs <node>` 缺省 `taskId` 时的智能自动推断���

**Tech Stack:** Node.js, CLI arg parsing, WebSocket, REST API, Jest (TypeScript)

**Spec:** `docs/superpowers/specs/2026-09-24-docker-style-cli-refactor-design.md`

## Global Constraints

- **Node 兼容性**: 维持 Node.js 18+ 原生运行，无外部 runtime 重依赖。
- **退出码严格一致**: 成功 0；常规/网络错误 1；语法/迁移拦截错误 125；Ctrl+C 中断 130。
- **第一公民定义**: 顶层 `gt ps` 必须查询远程 Hub 节点；顶层 `gt logs` 必须查询远程节点任务日志。
- **本地 Agent 命名空间**: 本地守护进程一律使用 `gt agent <run|ps|logs|stop|restart|rm>`。
- **零破坏性别名**: `gt host ls`, `gt host prune`, `gt auth login`, `gt auth logout`, `gt task logs`, `gt task kill` 必须静默透明兼容。

## Review Focus

1. **`gt ps` 默认过滤行为**: 默认仅显示 `online` 状态的远程节点，传入 `-a` 或 `--all` 时显示全部（包括离线）。
2. **`gt logs <node>` 缺省 `taskId` 边界**: 当远程节点没有任何任务记录时，优雅提示 `No tasks found on node [<node>]` 并返回退出码 1，不得抛出未捕获异常。
3. **顶层旧命令拦截**: 调用 `gt run`, `gt stop`, `gt restart`, `gt rm`, `gt hosts`, `gt nodes` 必须严格返回退出码 125 并打印针对性迁移指引。
4. **`gt login` 单参数自适应**: 仅提供 1 个参数时，根据其是否以 `http://` 或 `https://` 开头智能识别是服务器 URL 还是 Admin Key。
5. **别名参数透传**: 兼容命令（如 `gt host ls --all --json`）的 flag 和 option 必须无损转发给底层实现。

---

### Task 1: 顶层迁移拦截器与 Help 帮助信息重构 (Migration Interceptor & Help Overhaul)

**Files:**
- Modify: `scripts/gt.js:158-230` (printHelp), `scripts/gt.js:2870-2886` (legacyMap & main dispatch)
- Test: `tests/gtManagementCommands.test.ts`

**Interfaces:**
- Consumes: `process.argv`
- Produces: `commandMigrationMap: Record<string, string>`, 新版分层 `printHelp()`

- [ ] **Step 1: 编写针对迁移拦截与新版 Help 的失败测试用例**

在 `tests/gtManagementCommands.test.ts` 中更新与添加测试用例：
```typescript
it('displays Docker-style commands in --help', async () => {
  const res = await runGt(['--help']);
  expect(res.code).toBe(0);
  expect(res.stdout).toContain('gt ps [-a|--all]');
  expect(res.stdout).toContain('gt exec');
  expect(res.stdout).toContain('gt logs');
  expect(res.stdout).toContain('gt kill');
  expect(res.stdout).toContain('gt prune');
  expect(res.stdout).toContain('gt login');
  expect(res.stdout).toContain('gt logout');
  expect(res.stdout).toContain('gt agent run');
});

it('rejects top-level agent commands with code 125 and migration guidance', async () => {
  const commands = ['run', 'stop', 'restart', 'rm'];
  for (const cmd of commands) {
    const res = await runGt([cmd, 'test-node']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain(`Error: 'gt ${cmd}' has been moved to 'gt agent ${cmd}'.`);
    expect(res.stderr).toContain(`Run 'gt agent ${cmd}' instead.`);
  }
});

it('rejects legacy "hosts" and "nodes" with code 125 pointing to "gt ps"', async () => {
  const resHosts = await runGt(['hosts']);
  expect(resHosts.code).toBe(125);
  expect(resHosts.stderr).toContain("Use 'gt ps' instead");

  const resNodes = await runGt(['nodes']);
  expect(resNodes.code).toBe(125);
  expect(resNodes.stderr).toContain("Use 'gt ps' instead");
});
```

- [ ] **Step 2: 运行测试并验证失败**

运行：`npx jest tests/gtManagementCommands.test.ts`
预期：FAIL（目前 `run`、`stop`、`rm` 依然作为顶层 agent 命令运行，或断言不匹配）。

- [ ] **Step 3: 在 `scripts/gt.js` 中实现迁移拦截与帮助信息重写**

修改 `scripts/gt.js` 的 `printHelp()` 函数：
```javascript
function printHelp() {
  console.log(`
gt (Gemini Terminal) - Unified Docker-Style Terminal CLI

Usage:
  gt [GLOBAL_OPTIONS] COMMAND [ARGS...]

Remote Commands (Docker-Style):
  ps [-a|--all] [OPTIONS]         List remote agent hosts (default: online only, like 'docker ps')
  exec [OPTIONS] <node> <cmd...>  Execute a command on a remote host (like 'docker exec')
  logs [-f] <node> [taskId]       View or follow task execution logs (like 'docker logs')
  kill [--signal <SIG>] <n> <id>  Terminate a running task on a remote host (like 'docker kill')
  cp <src> <dest>                 Copy files between local and remote host (like 'docker cp')
  prune                           Remove disconnected/offline agent hosts (like 'docker system prune')
  task ls <node> [OPTIONS]        List execution tasks on a host

Authentication & Config:
  login [SERVER] [KEY]            Verify and save admin credentials (like 'docker login')
  logout                          Remove stored credentials (like 'docker logout')
  config <list|get|set>           Manage local client configuration settings

Local Agent Commands (Daemon):
  agent run [-d] [NAME]           Run reverse terminal agent (foreground or daemon)
  agent ps                        List local agent daemons (PID, status, target hub)
  agent logs [-f] [-n 50] [NAME]  View local agent daemon logs
  agent stop [NAME] [--all]       Stop running local agent daemon(s)
  agent restart [NAME]            Restart local agent daemon
  agent rm [NAME] [--all]         Remove stopped agent daemon record(s)

Global Options:
  -s, --server <url>              Hub server URL (Default: env TERMINAL_SERVER or http://localhost:3000)
  -k, --key <secret>              Admin secret key (Default: env ADMIN_SECRET_KEY)
  --json                          Output in JSON format
  --format <template>             Format output using Go/Docker template (e.g. 'table {{.ID}}\\t{{.Name}}')
  -v, --version                   Print version information
  -h, --help                      Show this help menu
`);
}
```

修改 `scripts/gt.js` 中的 `main()` 入口命令校验逻辑：
```javascript
  const commandMigrationMap = {
    run: "gt agent run",
    stop: "gt agent stop",
    restart: "gt agent restart",
    rm: "gt agent rm",
    hosts: "gt ps",
    nodes: "gt ps",
  };

  if (commandMigrationMap[command]) {
    console.error(`Error: 'gt ${command}' has been moved to '${commandMigrationMap[command]}'.`);
    console.error(`Run '${commandMigrationMap[command]}' instead.`);
    console.error(`Run 'gt --help' for modern Docker-style command usage.`);
    process.exit(125);
  }
```

- [ ] **Step 4: 运行测试并验证通过**

运行：`npx jest tests/gtManagementCommands.test.ts`
预期：PASS。

- [ ] **Step 5: 提交更改**

```bash
git add scripts/gt.js tests/gtManagementCommands.test.ts
git commit -m "feat(gt): implement command migration interceptor and update help text"
```

---

### Task 2: 顶层 `gt ps` 与 `gt prune` 远程节点管理 (Remote Node Management)

**Files:**
- Modify: `scripts/gt.js:2880-2990`
- Test: `tests/gtPsCommand.test.ts`

**Interfaces:**
- Consumes: `/api/terminal/hosts` (GET), `/api/terminal/hosts/offline` (DELETE)
- Produces: `gt ps [-a|--all]`, `gt prune`, 别名 `gt host ls`, `gt node ls`, `gt host prune`, `gt node prune`

- [ ] **Step 1: 编写 `gt ps` 与 `gt prune` 的测试用例**

创建 `tests/gtPsCommand.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';
import http from 'http';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

describe('gt ps & gt prune remote node management', () => {
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
            { id: 'node-1', name: 'worker-online', status: 'online', platform: 'linux', ip: '10.0.0.1', lastSeen: Date.now() },
            { id: 'node-2', name: 'worker-offline', status: 'offline', platform: 'linux', ip: '10.0.0.2', lastSeen: Date.now() - 3600000 },
          ],
        }));
        return;
      }

      if (req.method === 'DELETE' && url.pathname === '/api/terminal/hosts/offline') {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, prunedCount: 1 }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      serverPort = addr.port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      execFile('node', [gtPath, ...args], {
        env: { ...process.env, TERMINAL_SERVER: `http://127.0.0.1:${serverPort}`, ADMIN_SECRET_KEY: 'test-key' }
      }, (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      });
    });
  }

  it('filters to online nodes by default in "gt ps"', async () => {
    const res = await run(['ps']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('worker-online');
    expect(res.stdout).not.toContain('worker-offline');
  });

  it('shows all nodes including offline when passing -a or --all', async () => {
    const res = await run(['ps', '-a']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('worker-online');
    expect(res.stdout).toContain('worker-offline');

    const resAll = await run(['ps', '--all']);
    expect(resAll.stdout).toContain('worker-offline');
  });

  it('supports transparent alias "gt host ls"', async () => {
    const res = await run(['host', 'ls', '-a']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('worker-offline');
  });

  it('prunes offline nodes with "gt prune"', async () => {
    const res = await run(['prune']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Pruned 1 offline host(s)');
  });
});
```

- [ ] **Step 2: 运行测试并验证失败**

运行：`npx jest tests/gtPsCommand.test.ts`
Expected: FAIL（目前 `gt ps` 输出本地 agent 守护进程表格，而非远程 hosts）。

- [ ] **Step 3: 提取并实现远程节点列表与 prune 函数**

在 `scripts/gt.js` 中抽离 `handleRemotePs` 和 `handleRemotePrune`：
```javascript
async function handleRemotePs({ server, key, args, jsonOutput, formatTemplateStr }) {
  let showAll = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-a' || a === '--all') {
      showAll = true;
    } else if (a === '--json') {
      jsonOutput = true;
    } else if (a === '--format') {
      formatTemplateStr = args[++i];
    } else if (a.startsWith('--format=')) {
      formatTemplateStr = a.slice(9);
    }
  }

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
      let hosts = res.data.hosts;
      if (!showAll) {
        hosts = hosts.filter(h => h.status === 'online');
      }

      if (formatTemplateStr) {
        const formatted = formatTemplate(formatTemplateStr, hosts);
        if (formatted) console.log(formatted);
        process.exit(0);
      }

      if (hosts.length === 0) {
        console.log(showAll ? 'No terminal agent hosts recorded.' : 'No online terminal agent hosts found. (Use -a to show offline)');
        process.exit(0);
      }

      console.log(
        'NODE ID'.padEnd(20) +
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
      process.exit(0);
    } else {
      console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to query hosts: ${err.message}`);
    process.exit(1);
  }
}

async function handleRemotePrune({ server, key, args, jsonOutput }) {
  if (args.includes('--json')) jsonOutput = true;
  try {
    const res = await makeRequest({
      serverUrl: server,
      endpoint: '/api/terminal/hosts/offline',
      method: 'DELETE',
      apiKey: key,
    });

    if (jsonOutput) {
      console.log(JSON.stringify(res.data, null, 2));
      process.exit(0);
    }

    if (res.status === 200 && res.data && res.data.success) {
      console.log(`Pruned ${res.data.prunedCount ?? res.data.removed ?? 0} offline host(s).`);
      process.exit(0);
    } else {
      console.error(`Failed to prune offline hosts: ${res.data?.error || `HTTP ${res.status}`}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Failed to prune offline hosts: ${err.message}`);
    process.exit(1);
  }
}
```

在 `main()` 中注册分发：
- `case 'ps':` 调用 `handleRemotePs`；
- `case 'prune':` 调用 `handleRemotePrune`；
- `case 'host':` 或 `case 'node':`：
  - 子命令为 `ls` / `list` 时调用 `handleRemotePs`；
  - 子命令为 `prune` 时调用 `handleRemotePrune`。

- [ ] **Step 4: 运行测试并验证通过**

运行：`npx jest tests/gtPsCommand.test.ts`
预期：PASS。

- [ ] **Step 5: 提交更改**

```bash
git add scripts/gt.js tests/gtPsCommand.test.ts
git commit -m "feat(gt): implement remote gt ps and gt prune with transparent host aliases"
```

---

### Task 3: 顶层 `gt login` 与 `gt logout` 凭据认证 (Authentication Commands)

**Files:**
- Modify: `scripts/gt.js` (main dispatch)
- Test: `tests/gtAuthCommand.test.ts`

**Interfaces:**
- Consumes: `ConfigStore.load()`, `ConfigStore.save()`, `GET /api/terminal/hosts`
- Produces: `gt login [SERVER] [KEY]`, `gt logout`, 兼容 `gt auth <login|logout>`

- [ ] **Step 1: 编写 `gt login` 与 `gt logout` 的测试用例**

创建 `tests/gtAuthCommand.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

describe('gt login & logout commands', () => {
  let server: http.Server;
  let serverPort: number;
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-auth-test-'));

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.headers['x-admin-key'] === 'valid-secret') {
        res.statusCode = 200;
        res.end(JSON.stringify({ hosts: [] }));
      } else {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'Unauthorized' }));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
      done();
    });
  });

  function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      execFile('node', [gtPath, ...args], {
        env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome, TERMINAL_SERVER: '', ADMIN_SECRET_KEY: '' }
      }, (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      });
    });
  }

  it('successfully logs in with "gt login <server> <key>"', async () => {
    const res = await run(['login', `http://127.0.0.1:${serverPort}`, 'valid-secret']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully verified and logged in');

    const configPath = path.join(tmpHome, '.gt', 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(cfg.key).toBe('valid-secret');
  });

  it('fails with invalid credentials', async () => {
    const res = await run(['login', `http://127.0.0.1:${serverPort}`, 'wrong-secret']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Authentication failed');
  });

  it('logs out with "gt logout"', async () => {
    const res = await run(['logout']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully logged out');

    const configPath = path.join(tmpHome, '.gt', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(cfg.key).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试并验证失败**

运行：`npx jest tests/gtAuthCommand.test.ts`
Expected: FAIL（未实现顶层 `login` / `logout`）。

- [ ] **Step 3: 实现通用 `handleLogin` 与 `handleLogout` 并绑定路由**

在 `scripts/gt.js` 中抽离并统一处理：
```javascript
async function handleLogin({ server, key, subArgs }) {
  let targetServer = server;
  let targetKey = key;

  if (subArgs.length === 2) {
    targetServer = subArgs[0];
    targetKey = subArgs[1];
  } else if (subArgs.length === 1) {
    if (subArgs[0].startsWith('http://') || subArgs[0].startsWith('https://')) {
      targetServer = subArgs[0];
    } else {
      targetKey = subArgs[0];
    }
  }

  if (!targetKey) {
    console.error('Error: Missing secret key. Usage: gt login [server] [key]');
    process.exit(1);
  }

  targetServer = targetServer.replace(/\/+$/, '');

  try {
    const res = await makeRequest({
      serverUrl: targetServer,
      endpoint: '/api/terminal/hosts',
      method: 'GET',
      apiKey: targetKey,
    });

    if (res.status === 200) {
      const config = ConfigStore.load();
      config.server = targetServer;
      config.key = targetKey;
      ConfigStore.save(config);
      console.log(`Successfully verified and logged in to ${targetServer}`);
      process.exit(0);
    } else {
      console.error(`Authentication failed: HTTP ${res.status} ${res.data?.error || 'Unauthorized'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Authentication failed: ${err.message}`);
    process.exit(1);
  }
}

function handleLogout() {
  const config = ConfigStore.load();
  delete config.key;
  ConfigStore.save(config);
  console.log('Successfully logged out.');
  process.exit(0);
}
```

在 `main()` 中注册分发：
- `case 'login':` 调用 `handleLogin({ server, key, subArgs: cmdArgs })`
- `case 'logout':` 调用 `handleLogout()`
- `case 'auth':` 兼容判断子命令 `login` / `logout` 并转发给对应函数。

- [ ] **Step 4: 运行测试并验证通过**

运行：`npx jest tests/gtAuthCommand.test.ts`
预期：PASS。

- [ ] **Step 5: 提交更改**

```bash
git add scripts/gt.js tests/gtAuthCommand.test.ts
git commit -m "feat(gt): support top-level gt login and gt logout"
```

---

### Task 4: 顶层 `gt logs` (支持缺省 taskId 智能推断) 与 `gt kill` (Remote Logs & Kill)

**Files:**
- Modify: `scripts/gt.js`
- Test: `tests/gtLogsSmartDefault.test.ts`

**Interfaces:**
- Consumes: `/api/terminal/exec/:hostId` (GET tasks list), `/api/terminal/exec/:hostId/:taskId` (GET logs), `/api/terminal/exec/:hostId/:taskId/kill` (POST kill)
- Produces: `gt logs [-f] <node> [taskId]`, `gt kill [--signal <sig>] <node> <taskId>`, 兼容 `gt task logs`, `gt task kill`

- [ ] **Step 1: 编写 `gt logs` 缺省任务推断与 `gt kill` 的测试用例**

创建 `tests/gtLogsSmartDefault.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';
import http from 'http';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

describe('gt logs smart default & gt kill', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && url.pathname === '/api/terminal/hosts') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          hosts: [{ id: 'srv-1', name: 'my-server', status: 'online' }]
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/srv-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          tasks: [
            { taskId: 'task-latest-999', status: 'completed', exitCode: 0, startTime: Date.now() - 1000 },
            { taskId: 'task-older-111', status: 'completed', exitCode: 0, startTime: Date.now() - 50000 },
          ]
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/srv-1/task-latest-999') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          taskId: 'task-latest-999',
          hostId: 'srv-1',
          status: 'completed',
          exitCode: 0,
          output: 'Hello latest task output!\n'
        }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/srv-1/task-latest-999/kill') {
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      execFile('node', [gtPath, ...args], {
        env: { ...process.env, TERMINAL_SERVER: `http://127.0.0.1:${serverPort}`, ADMIN_SECRET_KEY: 'test-key' }
      }, (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      });
    });
  }

  it('automatically picks the latest task when taskId is omitted in "gt logs <node>"', async () => {
    const res = await run(['logs', 'my-server']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('task-latest-999');
    expect(res.stdout).toContain('Hello latest task output!');
  });

  it('kills a remote task with "gt kill <node> <taskId>"', async () => {
    const res = await run(['kill', 'my-server', 'task-latest-999']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Kill signal sent to task [task-latest-999]');
  });
});
```

- [ ] **Step 2: 运行测试并验证失败**

运行：`npx jest tests/gtLogsSmartDefault.test.ts`
Expected: FAIL（未支持省略 taskId 的推断，且当前顶层 `logs` 仍被路由给本地 agent）。

- [ ] **Step 3: 重构 `handleRemoteLogs` 与 `handleRemoteKill` 并绑定顶层路由**

在 `scripts/gt.js` 中抽离实现：
```javascript
async function handleRemoteLogs({ server, key, args, jsonOutput }) {
  let follow = false;
  let pollInterval = 500;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-f' || a === '--follow') {
      follow = true;
    } else if (a === '--poll-interval') {
      pollInterval = parseInt(args[++i], 10) || 500;
    } else if (a.startsWith('--poll-interval=')) {
      pollInterval = parseInt(a.slice(16), 10) || 500;
    } else if (a === '--json') {
      jsonOutput = true;
    } else if (!a.startsWith('-')) {
      positional.push(a);
    }
  }

  if (positional.length < 1) {
    console.error('Error: Missing target host. Usage: gt logs [OPTIONS] <node> [taskId]');
    process.exit(125);
  }

  const hostInput = positional[0];
  let resolvedHost;
  try {
    resolvedHost = await resolveHost(server, key, hostInput);
  } catch (err) {
    if (err.message && (err.message.includes('Ambiguous') || err.message.includes('No such host'))) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    resolvedHost = { id: hostInput, name: hostInput };
  }

  let taskId = positional[1];
  // 缺省 taskId 时自动推断最新一个任务
  try {
    const taskListRes = await makeRequest({
      serverUrl: server,
      endpoint: `/api/terminal/exec/${encodeURIComponent(resolvedHost.id)}`,
      method: 'GET',
      apiKey: key,
    });
    if (taskListRes.data && taskListRes.data.success && Array.isArray(taskListRes.data.tasks)) {
      if (!taskId) {
        if (taskListRes.data.tasks.length === 0) {
          console.error(`No tasks found on node [${resolvedHost.id}].`);
          process.exit(1);
        }
        taskId = taskListRes.data.tasks[0].taskId;
      } else {
        taskId = resolveTaskId(taskListRes.data.tasks, taskId);
      }
    }
  } catch (err) {
    if (err.message && (err.message.includes('Ambiguous') || err.message.includes('No such task'))) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  if (!taskId) {
    console.error(`Error: No taskId specified and could not deduce latest task on node [${resolvedHost.id}].`);
    process.exit(1);
  }

  // 执行日志拉取或流式打印（与现有 task logs 逻辑对齐）
  ...
}

async function handleRemoteKill({ server, key, args, jsonOutput }) {
  let signal = 'SIGTERM';
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--signal') {
      signal = args[++i];
    } else if (a.startsWith('--signal=')) {
      signal = a.slice(9);
    } else if (a === '--json') {
      jsonOutput = true;
    } else if (!a.startsWith('-')) {
      positional.push(a);
    }
  }

  if (positional.length < 2) {
    console.error('Error: Missing arguments. Usage: gt kill [--signal <SIG>] <node> <taskId>');
    process.exit(125);
  }

  const [hostInput, taskInput] = positional;
  ...
}
```

在 `main()` 分发中：
- `case 'logs':` 调用 `handleRemoteLogs`；
- `case 'kill':` 调用 `handleRemoteKill`；
- `case 'task':`
  - 若子命令为 `logs`，转发给 `handleRemoteLogs`；
  - 若子命令为 `kill`，转发给 `handleRemoteKill`；
  - 若子命令为 `ls` / `list`，保留原有的 task 列表逻辑。

- [ ] **Step 4: 运行测试并验证通过**

运行：`npx jest tests/gtLogsSmartDefault.test.ts`
预期：PASS。

- [ ] **Step 5: 提交更改**

```bash
git add scripts/gt.js tests/gtLogsSmartDefault.test.ts
git commit -m "feat(gt): implement remote gt logs with smart task inference and gt kill"
```

---

### Task 5: 完善 `gt agent` 本地守护进程体系并适配所有既有测试 (Agent Namespace & Test Adaptation)

**Files:**
- Modify: `scripts/gt.js:1954-2050`
- Modify: `tests/gtAgentDaemon.test.ts`
- Modify: `tests/gtManagementCommands.test.ts`

**Interfaces:**
- Consumes: `AgentDaemonManager`
- Produces: `gt agent run [-d] [NAME]`, `gt agent ps`, `gt agent logs`, `gt agent stop`, `gt agent restart`, `gt agent rm`

- [ ] **Step 1: 确保 `gt agent ps / logs / stop / restart / rm / run` 行为健全**

检查 `scripts/gt.js` 中的 `runAgent` 函数，验证所有子命令：
- `gt agent run [-d] [NAME]`
- `gt agent ps`
- `gt agent logs [-f] [-n 50] [NAME]`
- `gt agent stop [NAME] [--all]`
- `gt agent restart [NAME]`
- `gt agent rm [NAME] [--all]`

- [ ] **Step 2: 更新 `tests/gtAgentDaemon.test.ts` 中涉及顶层调用的代码**

将 `tests/gtAgentDaemon.test.ts` 中直接测试顶层旧命令 `run`, `stop`, `rm`, `ps`, `logs` 的地方统一修正为 `agent <subcmd>`（例如 `['run', ...]` 改为 `['agent', 'run', ...]`，`['stop', ...]` 改为 `['agent', 'stop', ...]`，`['rm', ...]` 改为 `['agent', 'rm', ...]`）。

- [ ] **Step 3: 运行 agent 守护进程与 CLI 完整测试套���**

运行：
```bash
npx jest tests/gtAgentDaemon.test.ts
npx jest tests/gtManagementCommands.test.ts
npx jest tests/gtCli.test.ts
```
预期：全部 PASS。

- [ ] **Step 4: 提交更改**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts tests/gtManagementCommands.test.ts
git commit -m "refactor(gt): solidify gt agent namespace and update daemon test suites"
```

---

### Task 6: 文档与前端空状态卡片命令更新与全量验证 (Docs & UI Updates & Verification)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `scripts/install-gt.sh`
- Modify: `frontend/src/components/terminal/TerminalHostSelector.tsx`

**Interfaces:**
- Consumes: 完整的 Docker 风格 CLI 命令体系
- Produces: 同步的文档、安装脚本和终端前端 UI

- [ ] **Step 1: 更新 `CLAUDE.md` 中的 CLI 说明**

将 `CLAUDE.md` 中相关的命令章节更新为：
- `gt login [server] [key]`
- `gt logout`
- `gt ps [-a] [--json] [--format <tpl>]`
- `gt prune`
- `gt exec [-it] [-d] <node> <cmd...>`
- `gt logs [-f] <node> [taskId]`
- `gt kill <node> <taskId>`
- `gt cp <src> <dest>`
- `gt agent run [-d] [NAME]`
- `gt agent ps`
- `gt agent logs [-f] [NAME]`
- `gt agent stop [NAME] [--all]`
- `gt agent restart [NAME]`
- `gt agent rm [NAME] [--all]`
- 更新 Agent 启动指引：`gt login http://<host>:3000 <admin-key> && gt agent run -d Node-Name`

- [ ] **Step 2: 更新 `scripts/install-gt.sh` 与 `README.md`**

同步更新输出的登录与后台运行引导提示为 `gt login` 和 `gt agent run -d`。

- [ ] **Step 3: 更新前端 `TerminalHostSelector.tsx` 空状态卡片**

将没有主机在线时显示的推荐复制启动命令从：
`gt auth login ... && gt run -d ...`
更新为：
`gt login ... && gt agent run -d ...`

- [ ] **Step 4: 执行全量测试与构建验证**

运行：
```bash
npm run build
npm test
```
预期：构建成功，所有 Jest 测试套件 100% 通过。

- [ ] **Step 5: 提交更改**

```bash
git add CLAUDE.md README.md scripts/install-gt.sh frontend/src/components/terminal/TerminalHostSelector.tsx
git commit -m "docs(gt): update CLI documentation and frontend terminal guidance cards to Docker-style commands"
```

# gt.js 多 Agent 实例并发支持与主机名默认回退实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解除 `gt.js` 仅能启动单个 Agent 的限制，支持多实例按名称并发启动与独立隔离，并在未传名称时自动回退为规范化主机名。

**Architecture:** 
1. 客户端在解析名称时，优先使用传入名称，缺省时使用规范化的 `os.hostname()`。
2. 确定性派生 `hostId`：默认主机名实例复用 `machineId` 保留历史兼容性；自定义命名实例派生为 `${machineId}-${hostName}` 保证服务端连接隔离不覆盖。
3. 移除粗暴的全局单例拦截，改为仅按目标实例名（`hostName`）进行精准互斥检查。
4. 完善多实例场景下 `gt stop`、`gt restart`、`gt logs` 等子命令的目标解析与管理。

**Tech Stack:** Node.js (CommonJS CLI `scripts/gt.js`), TypeScript/Jest (test suite in `tests/gtAgentDaemon.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-02-gt-multi-agent-support-design.md`

## Global Constraints

- 默认主机名实例在未指定 `--id` 时，其 `hostId` 必须严格等于 `ConfigStore.getMachineId()`。
- 自定义名称实例在未指定 `--id` 时，其 `hostId` 必须严格等于 `${machineId}-${hostName}`。
- 同名实例在后台运行时，再次以同名启动必须被拒绝并退出码为 1。
- 异名实例（包含默认主机名实例与各自定义实例）必须能在一台机器上同时并发运行。
- 单例守护进程历史限制代码（`isDaemon && !options.name && !positionalName` 遍历所有 running 报错）必须被完全移除。

## Review Focus

1. **自定义名称大小写与特殊字符**：若传入 `Worker_1.Test`，规范化后为 `worker-1-test`，生成的 `hostId` 应为 `${machineId}-worker-1-test`。
2. **默认主机名启动后再次无参启动**：两次均执行 `gt run -d`，第二次启动必须精确识别默认主机名实例已在运行并拒绝，退出码 1。
3. **多实例共存时的无参 stop**：在同时运行多个 Agent 时执行 `gt stop`（不带参数），必须提示有多实例运行并列出名字，不应误停任何一个。
4. **多实例共存时的 stop --all**：执行 `gt stop --all` 或 `gt agent stop -a`，必须将所有运行中的 Agent 一次性安全终止。
5. **无参 restart 的目标解析**：执行 `gt agent restart`（无参）时，若仅有 1 个运行中实例，应自动识别并重启该实例；若有多个，报错提示指定实例名。

---

### Task 1: 修改 `scripts/gt.js` 实现确定性 hostId 生成、精细化互斥与多实例生命周期协同

**Files:**
- Modify: `scripts/gt.js:2385-2445`

**Interfaces:**
- Consumes: `ConfigStore.getMachineId()`, `AgentDaemonManager.sanitizeName()`, `AgentDaemonManager.resolveTarget()`, `AgentDaemonManager.getAgent()`
- Produces: 
  - `hostId`: `options.id || options.hostId || (hostName === sanitizedHostname ? machineId : `${machineId}-${hostName}`)`
  - 启动互斥检查：只对当前 `hostName` 调用 `AgentDaemonManager.getAgent(hostName)` 进行 running 判断

- [ ] **Step 1: 编写/更新针对确定性 hostId 派生和移除全局限制的单元测试**

在 `tests/gtAgentDaemon.test.ts` 中添加/更新测试用例，断言未传名称时使用 `machineId`，传入名称时使用 `${machineId}-${hostName}`，并且可以并发启动默认名称与自定义名称 Agent。

```typescript
it('derives hostId deterministically: machineId for hostname, machineId-name for custom name', () => {
  fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
    server: 'http://127.0.0.1:3000',
    key: 'mock-key',
  }));

  const { ConfigStore, AgentDaemonManager } = require('../scripts/gt.js');
  process.env.GT_CONFIG_DIR = testConfigDir;
  const mid = ConfigStore.getMachineId();

  // 1. Default hostname agent (no name specified)
  const res1 = spawnSync('node', [gtPath, 'agent', 'run', '-d'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(res1.status).toBe(0);

  const hostname = os.hostname().toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'host';
  const defaultAgent = AgentDaemonManager.getAgent(hostname);
  expect(defaultAgent).not.toBeNull();
  expect(defaultAgent.running).toBe(true);
  expect(defaultAgent.id).toBe(mid);

  // 2. Custom name agent running concurrently
  const res2 = spawnSync('node', [gtPath, 'agent', 'run', '-d', 'worker-extra'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(res2.status).toBe(0);

  const customAgent = AgentDaemonManager.getAgent('worker-extra');
  expect(customAgent).not.toBeNull();
  expect(customAgent.running).toBe(true);
  expect(customAgent.id).toBe(`${mid}-worker-extra`);

  // Cleanup
  if (defaultAgent.pid) process.kill(defaultAgent.pid, 'SIGKILL');
  if (customAgent.pid) process.kill(customAgent.pid, 'SIGKILL');
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "derives hostId deterministically"`
Expected: FAIL（因为当前代码在启动第二个 agent 时被全局单例检查拦截，或其 hostId 未派生）。

- [ ] **Step 3: 修改 `scripts/gt.js` 中的逻辑**

1. 修改 `scripts/gt.js` 中的 `hostId` 计算逻辑：
```javascript
  const hostname = os.hostname();
  const sanitizedHostname = hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'host';
  const defaultName = sanitizedHostname;

  let sanitizedName = options.name
    ? AgentDaemonManager.sanitizeName(options.name)
    : (positionalName ? AgentDaemonManager.sanitizeName(positionalName) : '');

  // If subcommand is restart and no name was explicitly given, resolve target dynamically
  if (subCmd === 'restart' && !sanitizedName) {
    const resolved = AgentDaemonManager.resolveTarget(undefined, 'restart');
    if (resolved.agent) {
      sanitizedName = resolved.agent.name;
    }
  }

  const hostName = sanitizedName || defaultName;

  const machineId = ConfigStore.getMachineId();
  let hostId = options.id || options.hostId;
  if (!hostId) {
    if (hostName === sanitizedHostname) {
      hostId = machineId;
    } else {
      hostId = `${machineId}-${hostName}`;
    }
  }
```

2. 删除全局单例检查代码：
```javascript
  // 移除以下已失效的旧限制逻辑：
  // if (isDaemon && !options.name && !positionalName) {
  //   const running = AgentDaemonManager.getAllAgents().filter(a => a.running);
  //   if (running.length > 0) { ... }
  // }
```

3. 检查并适配现有 `tests/gtAgentDaemon.test.ts` 中第 118 行附近的测试代码（将其更新为测试同名 `my-daemon` 冲突，而不是旧的无参冲突）：
```javascript
    // 4. Prevent duplicate start for same name
    const dupRes = spawnSync('node', [gtPath, 'agent', '-d', '--name=my-daemon'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(dupRes.status).toBe(1);
    expect(dupRes.stderr).toContain('already running');
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): support deterministic hostId and concurrent multi-agent daemons

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: 补充全面的多实例生命周期测试用例

**Files:**
- Modify: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Consumes: `gt run`, `gt stop`, `gt stop --all`, `gt ps -l`, `gt restart`
- Produces: 验证 Review Focus 中的所有边界条件覆盖（同名冲突、异名共存、stop 智能解析、stop --all、无参 restart）。

- [ ] **Step 1: 编写多实例生命周期完整测试集**

在 `tests/gtAgentDaemon.test.ts` 末尾添加如下测试集：
1. **多实例同时运行与 `gt ps` 表格展示**
2. **默认主机名重复启动拦截**（`gt run -d` 两次，第二次拦截）
3. **多实例时 `gt stop`（无参）的歧义拦截与提示**
4. **多实例时 `gt stop <name>` 精确停止一个，其余不受影响**
5. **多实例时 `gt stop --all` 一键停止所有**

```typescript
it('handles full multi-agent concurrency and lifecycle operations', async () => {
  fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
    server: 'http://127.0.0.1:3000',
    key: 'mock-key',
  }));

  const { AgentDaemonManager } = require('../scripts/gt.js');
  process.env.GT_CONFIG_DIR = testConfigDir;

  // 1. Start agent-1 and agent-2
  const r1 = spawnSync('node', [gtPath, 'run', '-d', 'agent-one'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(r1.status).toBe(0);

  const r2 = spawnSync('node', [gtPath, 'run', '-d', 'agent-two'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(r2.status).toBe(0);

  // Both should be running
  const running = AgentDaemonManager.getAllAgents().filter((a: any) => a.running);
  expect(running.length).toBe(2);
  const names = running.map((a: any) => a.name);
  expect(names).toContain('agent-one');
  expect(names).toContain('agent-two');

  // 2. gt stop without name should fail because 2 are running
  const stopAmbiguous = spawnSync('node', [gtPath, 'stop'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(stopAmbiguous.status).toBe(1);
  expect(stopAmbiguous.stderr).toContain('Multiple running agents');

  // 3. gt stop agent-one should stop only agent-one
  const stopOne = spawnSync('node', [gtPath, 'stop', 'agent-one'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(stopOne.status).toBe(0);
  expect(stopOne.stdout).toContain('agent-one');
  expect(stopOne.stdout).toContain('stopped');

  const afterStopOne = AgentDaemonManager.getAllAgents().filter((a: any) => a.running);
  expect(afterStopOne.length).toBe(1);
  expect(afterStopOne[0].name).toBe('agent-two');

  // 4. Now with only 1 running, gt stop without name should succeed
  const stopAuto = spawnSync('node', [gtPath, 'stop'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(stopAuto.status).toBe(0);
  expect(stopAuto.stdout).toContain('agent-two');

  const afterStopAll = AgentDaemonManager.getAllAgents().filter((a: any) => a.running);
  expect(afterStopAll.length).toBe(0);
});

it('stops all running agents cleanly with gt stop --all', async () => {
  fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
    server: 'http://127.0.0.1:3000',
    key: 'mock-key',
  }));

  const { AgentDaemonManager } = require('../scripts/gt.js');
  process.env.GT_CONFIG_DIR = testConfigDir;

  spawnSync('node', [gtPath, 'run', '-d', 'batch-1'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  spawnSync('node', [gtPath, 'run', '-d', 'batch-2'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });

  expect(AgentDaemonManager.getAllAgents().filter((a: any) => a.running).length).toBe(2);

  const stopAllRes = spawnSync('node', [gtPath, 'stop', '--all'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(stopAllRes.status).toBe(0);
  expect(stopAllRes.stdout).toContain('batch-1');
  expect(stopAllRes.stdout).toContain('batch-2');

  expect(AgentDaemonManager.getAllAgents().filter((a: any) => a.running).length).toBe(0);
});
```

- [ ] **Step 2: 运行测试并验证**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: 全部测试通过 (All tests PASS).

- [ ] **Step 3: 提交测试代码**

```bash
git add tests/gtAgentDaemon.test.ts
git commit -m "test(gt): add comprehensive multi-agent concurrency and lifecycle tests

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: 全量测试集与构建回归验证

**Files:**
- None (verify overall build & test health)

- [ ] **Step 1: 运行全量单元测试套件**

Run: `npm test`
Expected: 所有测试文件均 PASS，无报错与内存泄漏。

- [ ] **Step 2: 运行全量编译构建**

Run: `npm run build`
Expected: 前端 Vite SPA 和后端 TypeScript 编译均成功，无语法与类型错误。

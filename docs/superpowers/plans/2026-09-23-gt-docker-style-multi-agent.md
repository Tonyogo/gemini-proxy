# Docker-Style Multi-Instance Agent CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `gt` into a first-class Docker-style CLI supporting multi-instance agents with positional `[NAME]` arguments (`gt run [-d] [NAME]`, `gt ps`, `gt logs`, `gt stop`, `gt restart`, `gt rm`), isolated under `~/.gt/agents/<name>.(json|log)` without legacy backward compatibility baggage.

**Architecture:** 
- Storage: Agent daemon state files and logs are cleanly isolated in `~/.gt/agents/` as `<name>.json` and `<name>.log`.
- Daemon Manager (`AgentDaemonManager`): Redesigned as a multi-instance manager capable of inspecting, starting, stopping, restarting, and pruning named agent instances.
- CLI Dispatcher: Top-level commands (`run`, `ps`, `logs`, `stop`, `restart`, `rm`) are introduced alongside existing `agent` aliases. Positional non-flag arguments are parsed as agent `NAME`. Single-instance commands auto-infer the target when only one agent is running, and require an explicit `NAME` or `--all` when multiple agents exist.

**Tech Stack:** Node.js (CommonJS, Child Process, FS, Crypto), Jest for automated test suites.

**Spec:** In-chat approved design: Docker-style top-level commands + positional `[NAME]` argument (`gt run [-d] [NAME]`, `gt ps`, `gt logs [NAME]`, `gt stop [NAME] [--all]`, `gt restart [NAME]`, `gt rm [NAME] [--all]`), with no backward compatibility requirements.

## Global Constraints

- Storage directory for all agents: `~/.gt/agents/` (or `${GT_CONFIG_DIR}/agents/` when `GT_CONFIG_DIR` is set).
- File permissions: 0700 for directories, 0600 for state files and log files on POSIX systems.
- Naming rules: Agent names are sanitized lowercase strings matching `[a-z0-9-_]+`. Default name format: `<hostname>-<random4hex>`.
- Positional argument precedence: Explicit `--name=<val>` takes precedence over positional `[NAME]`.
- Exit codes: 0 on success, 1 on error/conflict/missing arguments.

## Review Focus

1. Duplicate agent name conflict: Starting a new daemon with the name of an already-running agent must be rejected with an exit code of 1 and an informative error.
2. Single-instance target auto-inference: When only 1 agent is running, `gt stop` / `gt logs` without arguments must automatically target that agent.
3. Multi-instance ambiguity guard: When >1 agents are running, calling `gt stop` / `gt logs` without arguments must display an error asking to specify `NAME` or `--all`.
4. Dead PID cleanup during inspection: If a process terminates abnormally, `gt ps` must detect the stale PID and mark it as `Stopped` or clean up properly without throwing exceptions.
5. Foreground vs Daemon flag isolation: `gt run worker-1` without `-d` runs foreground with console output; with `-d` / `--detach`, it spawns detached child process redirecting output to `~/.gt/agents/worker-1.log`.

---

### Task 1: Redesign `AgentDaemonManager` for Named Multi-Instance Isolation

**Files:**
- Modify: `scripts/gt.js:771-909`
- Modify: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Consumes: `ConfigStore.getConfigDir()`, `killProcessTreeSync()`, `process.kill()`
- Produces: 
  - `AgentDaemonManager.getAgentsDir(): string`
  - `AgentDaemonManager.getStatusFile(name: string): string`
  - `AgentDaemonManager.getLogFile(name: string): string`
  - `AgentDaemonManager.getAllAgents(): Array<{ name: string, pid: number, running: boolean, ... }>`
  - `AgentDaemonManager.getAgent(name: string): { running: boolean, ... } | null`
  - `AgentDaemonManager.saveStatus(name: string, state: object): void`
  - `AgentDaemonManager.clearStatus(name: string): void`
  - `AgentDaemonManager.stop(name: string): Promise<{ success: boolean, message: string, pid?: number }>`
  - `AgentDaemonManager.stopAll(): Promise<Array<{ name: string, success: boolean, message: string }>>`
  - `AgentDaemonManager.remove(name: string, opts?: { removeLogs?: boolean }): { success: boolean, message: string }`
  - `AgentDaemonManager.removeAll(): { removed: string[] }`
  - `AgentDaemonManager.resolveTarget(name?: string, actionName?: string): { agent: object | null, error?: string }`

- [ ] **Step 1: Write the failing tests for `AgentDaemonManager` multi-instance operations**

Edit `tests/gtAgentDaemon.test.ts` to test multi-instance methods:

```typescript
it('manages multiple named agent status files and processes independently', () => {
  process.env.GT_CONFIG_DIR = testConfigDir;
  const { AgentDaemonManager } = require('../scripts/gt.js');

  const agentsDir = AgentDaemonManager.getAgentsDir();
  expect(agentsDir).toBe(path.join(testConfigDir, 'agents'));

  // Save two different agents
  AgentDaemonManager.saveStatus('worker-a', { pid: process.pid, name: 'worker-a', server: 'http://hub1' });
  AgentDaemonManager.saveStatus('worker-b', { pid: 99999999, name: 'worker-b', server: 'http://hub2' });

  const agentA = AgentDaemonManager.getAgent('worker-a');
  expect(agentA).not.toBeNull();
  expect(agentA.running).toBe(true);
  expect(agentA.name).toBe('worker-a');

  const agentB = AgentDaemonManager.getAgent('worker-b');
  expect(agentB).not.toBeNull();
  expect(agentB.running).toBe(false); // PID 99999999 is dead
  expect(agentB.stale).toBe(true);

  const all = AgentDaemonManager.getAllAgents();
  expect(all.length).toBe(2);

  // Test target resolution
  // 1 running agent (worker-a) -> resolveTarget() without name resolves to worker-a
  const resolved = AgentDaemonManager.resolveTarget(undefined, 'stop');
  expect(resolved.error).toBeUndefined();
  expect(resolved.agent.name).toBe('worker-a');

  // Explicit name resolves
  const resolvedExplicit = AgentDaemonManager.resolveTarget('worker-b', 'stop');
  expect(resolvedExplicit.agent.name).toBe('worker-b');

  // Remove worker-b
  AgentDaemonManager.remove('worker-b');
  expect(AgentDaemonManager.getAgent('worker-b')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "manages multiple named agent status files"`
Expected: FAIL (`AgentDaemonManager.getAgentsDir is not a function` or similar)

- [ ] **Step 3: Implement `AgentDaemonManager` multi-instance methods in `scripts/gt.js`**

Replace `AgentDaemonManager` class in `scripts/gt.js` with multi-instance implementation:

```javascript
class AgentDaemonManager {
  static getAgentsDir() {
    return path.join(ConfigStore.getConfigDir(), 'agents');
  }

  static sanitizeName(name) {
    if (!name || typeof name !== 'string') return '';
    return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '');
  }

  static getStatusFile(name) {
    const sName = this.sanitizeName(name);
    return path.join(this.getAgentsDir(), `${sName}.json`);
  }

  static getLogFile(name) {
    const sName = this.sanitizeName(name);
    return path.join(this.getAgentsDir(), `${sName}.log`);
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

  static getAgent(name) {
    const sName = this.sanitizeName(name);
    if (!sName) return null;
    const p = this.getStatusFile(sName);
    if (!fs.existsSync(p)) return null;
    try {
      const state = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const alive = this.isProcessAlive(state.pid);
      return {
        name: sName,
        running: alive,
        stale: !alive,
        ...state,
      };
    } catch {
      return null;
    }
  }

  static getAllAgents() {
    const dir = this.getAgentsDir();
    if (!fs.existsSync(dir)) return [];
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      const list = [];
      for (const file of files) {
        const name = file.slice(0, -5);
        const agent = this.getAgent(name);
        if (agent) list.push(agent);
      }
      return list.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  static saveStatus(name, state) {
    const sName = this.sanitizeName(name);
    const dir = this.getAgentsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = this.getStatusFile(sName);
    const data = { name: sName, ...state };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    if (os.platform() !== 'win32') {
      try { fs.chmodSync(file, 0o600); } catch {}
      try { fs.chmodSync(dir, 0o700); } catch {}
    }
  }

  static clearStatus(name) {
    const sName = this.sanitizeName(name);
    try {
      const p = this.getStatusFile(sName);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {}
  }

  static resolveTarget(name, actionName = 'operate') {
    if (name) {
      const sName = this.sanitizeName(name);
      const agent = this.getAgent(sName);
      if (!agent) {
        return { agent: null, error: `Error: Agent "${sName}" not found.` };
      }
      return { agent };
    }

    const all = this.getAllAgents();
    const running = all.filter(a => a.running);
    if (running.length === 1) {
      return { agent: running[0] };
    }
    if (running.length === 0) {
      if (all.length === 1) return { agent: all[0] };
      return { agent: null, error: `No active agent found to ${actionName}.` };
    }

    const names = running.map(a => `"${a.name}"`).join(', ');
    return {
      agent: null,
      error: `Error: Multiple running agents (${names}). Please specify agent NAME (e.g. gt ${actionName} <NAME>).`,
    };
  }

  static async stop(name) {
    const sName = this.sanitizeName(name);
    const agent = this.getAgent(sName);
    if (!agent || !agent.running) {
      return { success: true, message: `Agent "${sName}" is not running.` };
    }

    const pid = agent.pid;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}

    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (!this.isProcessAlive(pid)) {
        return { success: true, pid, name: sName, message: `Agent "${sName}" (PID: ${pid}) stopped successfully.` };
      }
      await new Promise(r => setTimeout(r, 100));
    }

    killProcessTreeSync(pid, 'SIGKILL');
    return { success: true, pid, name: sName, message: `Agent "${sName}" (PID: ${pid}) forcibly terminated.` };
  }

  static async stopAll() {
    const all = this.getAllAgents();
    const running = all.filter(a => a.running);
    const results = [];
    for (const a of running) {
      results.push(await this.stop(a.name));
    }
    return results;
  }

  static remove(name, { removeLogs = false } = {}) {
    const sName = this.sanitizeName(name);
    const agent = this.getAgent(sName);
    if (agent && agent.running) {
      return { success: false, message: `Error: Cannot remove running agent "${sName}". Stop it first.` };
    }
    this.clearStatus(sName);
    if (removeLogs) {
      try {
        const lf = this.getLogFile(sName);
        if (fs.existsSync(lf)) fs.unlinkSync(lf);
      } catch {}
    }
    return { success: true, message: `Agent "${sName}" removed.` };
  }

  static removeAll() {
    const all = this.getAllAgents();
    const removed = [];
    for (const a of all) {
      if (!a.running) {
        this.remove(a.name, { removeLogs: true });
        removed.push(a.name);
      }
    }
    return { removed };
  }

  static async getLogs(name, lines = 50, follow = false) {
    const sName = this.sanitizeName(name);
    const logFile = this.getLogFile(sName);
    if (!fs.existsSync(logFile)) {
      console.log(`No logs found for agent "${sName}".`);
      return;
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    const allLines = content.split('\n');
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
      allLines.pop();
    }
    const count = parseInt(lines, 10) || 50;
    const slice = allLines.slice(-count);
    if (slice.length > 0) {
      process.stdout.write(slice.join('\n') + '\n');
    }

    if (!follow) return;

    let currentSize = fs.statSync(logFile).size;
    const pollInterval = 200;

    await new Promise((resolve) => {
      const timer = setInterval(() => {
        try {
          if (!fs.existsSync(logFile)) return;
          const newSize = fs.statSync(logFile).size;
          if (newSize > currentSize) {
            const stream = fs.createReadStream(logFile, {
              start: currentSize,
              end: newSize - 1,
              encoding: 'utf-8',
            });
            stream.on('data', chunk => process.stdout.write(chunk));
            currentSize = newSize;
          } else if (newSize < currentSize) {
            currentSize = newSize;
          }
        } catch {}
      }, pollInterval);

      const cleanup = () => {
        clearInterval(timer);
        resolve();
      };

      process.on('SIGINT', () => {
        cleanup();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        cleanup();
        process.exit(0);
      });
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "manages multiple named agent status files"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): redesign AgentDaemonManager for multi-instance named agent isolation"
```

---

### Task 2: Implement Positional `[NAME]` Parsing and Conflict Detection in Agent Launch

**Files:**
- Modify: `scripts/gt.js:1780-1990`
- Modify: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Consumes: `AgentDaemonManager.getAgent(name)`, `AgentDaemonManager.saveStatus(name, state)`, `AgentDaemonManager.getLogFile(name)`
- Produces: `runAgent(agentArgs, globalOpts)` with positional `[NAME]` argument and duplicate running prevention.

- [ ] **Step 1: Write failing tests for positional `NAME` and conflict rejection in `gt run`**

Add tests to `tests/gtAgentDaemon.test.ts`:

```typescript
it('supports positional [NAME] argument and prevents duplicate running instances', () => {
  fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
    server: 'http://127.0.0.1:3000',
    key: 'mock-key',
  }));

  // Start agent with positional name 'worker-pos'
  const res1 = spawnSync('node', [gtPath, 'run', '-d', 'worker-pos'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(res1.status).toBe(0);
  expect(res1.stdout).toContain('Agent started in background');
  expect(res1.stdout).toContain('worker-pos');

  // Verify state file created in agents/worker-pos.json
  const statePath = path.join(testConfigDir, 'agents', 'worker-pos.json');
  expect(fs.existsSync(statePath)).toBe(true);

  // Attempt duplicate start with same name 'worker-pos'
  const dupRes = spawnSync('node', [gtPath, 'run', '-d', 'worker-pos'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(dupRes.status).toBe(1);
  expect(dupRes.stderr).toContain('already running');
  expect(dupRes.stderr).toContain('worker-pos');

  // Start another agent with different name 'worker-pos-2'
  const res2 = spawnSync('node', [gtPath, 'run', '-d', 'worker-pos-2'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(res2.status).toBe(0);
  expect(res2.stdout).toContain('worker-pos-2');

  // Stop both
  const { AgentDaemonManager } = require('../scripts/gt.js');
  process.env.GT_CONFIG_DIR = testConfigDir;
  const agent1 = AgentDaemonManager.getAgent('worker-pos');
  const agent2 = AgentDaemonManager.getAgent('worker-pos-2');
  if (agent1 && agent1.pid) process.kill(agent1.pid, 'SIGKILL');
  if (agent2 && agent2.pid) process.kill(agent2.pid, 'SIGKILL');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports positional \[NAME\] argument"`
Expected: FAIL (`Unknown command: run` or positional name not handled)

- [ ] **Step 3: Update `runAgent` in `scripts/gt.js` to parse positional `[NAME]` and enforce conflict checks**

Update `runAgent` in `scripts/gt.js`:
- Extract options (`--name`, `--detach`, `-d`, etc.) and positional arguments.
- Any non-flag argument that is not a subcommand (`start`, `restart`, `run`) is treated as the positional `NAME`.
- Generate `hostName`: `sanitized(options.name || positionalName || defaultName)`.
- If daemon mode (`isDaemon && !isInternalDaemon`):
  - Check `const current = AgentDaemonManager.getAgent(hostName);`
  - If `current && current.running`:
    `console.error(`Error: Agent "${hostName}" is already running (PID: ${current.pid}). Use 'gt stop ${hostName}' or 'gt restart ${hostName}'.`); process.exit(1);`
  - Spawn detached process redirecting stdio to `AgentDaemonManager.getLogFile(hostName)`.
  - Save status using `AgentDaemonManager.saveStatus(hostName, { pid: child.pid, ... })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports positional \[NAME\] argument"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): support positional [NAME] argument and instance conflict prevention"
```

---

### Task 3: Implement Docker-Style Top-Level Commands (`run`, `ps`, `logs`, `stop`, `restart`, `rm`)

**Files:**
- Modify: `scripts/gt.js:1780-1845, 3290-3350`
- Modify: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Consumes: `AgentDaemonManager`, `runAgent`
- Produces: Top-level CLI routing for `run`, `ps`, `logs`, `stop`, `restart`, `rm`.

- [ ] **Step 1: Write failing tests for top-level Docker-style commands**

Add tests to `tests/gtAgentDaemon.test.ts`:

```typescript
it('provides full Docker-style top-level command workflow: run, ps, logs, stop, rm', async () => {
  fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
    server: 'http://127.0.0.1:3000',
    key: 'mock-key',
  }));

  // 1. gt run -d app-node
  const runRes = spawnSync('node', [gtPath, 'run', '-d', 'app-node'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(runRes.status).toBe(0);
  expect(runRes.stdout).toContain('Agent started in background');

  // 2. gt ps
  const psRes = spawnSync('node', [gtPath, 'ps'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(psRes.status).toBe(0);
  expect(psRes.stdout).toContain('app-node');
  expect(psRes.stdout).toContain('Running');

  // 3. gt logs app-node
  const logsRes = spawnSync('node', [gtPath, 'logs', 'app-node', '-n', '10'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(logsRes.status).toBe(0);

  // 4. gt stop app-node (or auto-target since only 1 running)
  const stopRes = spawnSync('node', [gtPath, 'stop'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(stopRes.status).toBe(0);
  expect(stopRes.stdout).toContain('stopped');

  // 5. gt ps should show Stopped / Stale or empty running
  const psStopped = spawnSync('node', [gtPath, 'ps'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(psStopped.status).toBe(0);
  expect(psStopped.stdout).toContain('Stopped');

  // 6. gt rm app-node
  const rmRes = spawnSync('node', [gtPath, 'rm', 'app-node'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(rmRes.status).toBe(0);
  expect(rmRes.stdout).toContain('removed');

  // Now ps shows nothing
  const psEmpty = spawnSync('node', [gtPath, 'ps'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(psEmpty.stdout).toContain('No agent daemons found');
});

it('enforces explicit NAME when multiple agents are running for stop and logs', () => {
  fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
    server: 'http://127.0.0.1:3000',
    key: 'mock-key',
  }));

  // Start two agents
  spawnSync('node', [gtPath, 'run', '-d', 'worker-multi-1'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  spawnSync('node', [gtPath, 'run', '-d', 'worker-multi-2'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });

  // Call gt stop without name -> should fail with ambiguity error
  const ambiguousStop = spawnSync('node', [gtPath, 'stop'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(ambiguousStop.status).toBe(1);
  expect(ambiguousStop.stderr).toContain('Multiple running agents');

  // Stop with --all
  const stopAll = spawnSync('node', [gtPath, 'stop', '--all'], {
    env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(stopAll.status).toBe(0);
  expect(stopAll.stdout).toContain('stopped');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "provides full Docker-style top-level command workflow"`
Expected: FAIL (`Unknown command: run`)

- [ ] **Step 3: Implement top-level command handlers in `scripts/gt.js`**

In `scripts/gt.js`:
1. In `main()`, add top-level switch cases:
   - `case 'run':` -> parse `-d` / `--detach`, call `runAgent(['run', ...cmdArgs], ...)`
   - `case 'ps':` -> format and print table of `AgentDaemonManager.getAllAgents()`.
   - `case 'logs':` -> resolve target with `AgentDaemonManager.resolveTarget(targetName, 'logs')` and call `AgentDaemonManager.getLogs(name, lines, follow)`.
   - `case 'stop':` -> if `--all`, call `AgentDaemonManager.stopAll()`; else resolve target and call `AgentDaemonManager.stop(name)`.
   - `case 'restart':` -> resolve target, stop and restart with same name.
   - `case 'rm':` -> if `--all`, `AgentDaemonManager.removeAll()`; else `AgentDaemonManager.remove(name, { removeLogs: true })`.
   - `case 'agent':` -> forward subcommands (`run`, `start`, `ps`, `status`, `logs`, `stop`, `restart`, `rm`) to the corresponding logic.

Format table for `gt ps`:
```javascript
console.log(
  'NAME'.padEnd(20) +
  'STATUS'.padEnd(12) +
  'PID'.padEnd(10) +
  'TARGET HUB'.padEnd(30) +
  'STARTED'
);
console.log('-'.repeat(95));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): add Docker-style top-level commands run, ps, logs, stop, restart, rm"
```

---

### Task 4: Update Documentation and CLI Help Menu

**Files:**
- Modify: `scripts/gt.js:160-230` (Help text)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write test to verify `gt --help` outputs Docker-style commands**

Add to `tests/gtAgentDaemon.test.ts`:

```typescript
it('outputs Docker-style command guidelines in gt --help', () => {
  const helpRes = spawnSync('node', [gtPath, '--help'], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  expect(helpRes.status).toBe(0);
  expect(helpRes.stdout).toContain('run [-d] [NAME]');
  expect(helpRes.stdout).toContain('ps');
  expect(helpRes.stdout).toContain('logs [-f] [NAME]');
  expect(helpRes.stdout).toContain('stop [NAME] [--all]');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "outputs Docker-style command guidelines"`
Expected: FAIL

- [ ] **Step 3: Update `gt --help` in `scripts/gt.js` and `CLAUDE.md`**

In `scripts/gt.js`:
Update usage text:
```text
Agent Commands (Docker-Style):
  run [-d] [NAME]                Run agent in foreground or background daemon
  ps                             List local agent daemons (like 'docker ps')
  logs [-f] [-n 50] [NAME]       View or follow agent logs (like 'docker logs')
  stop [NAME] [--all]            Stop running agent daemon(s) (like 'docker stop')
  restart [NAME]                 Restart agent daemon (like 'docker restart')
  rm [NAME] [--all]              Remove stopped agent records (like 'docker rm')
```

In `CLAUDE.md`:
Update the `gt` CLI reference section to document `gt run [-d] [NAME]`, `gt ps`, `gt logs`, `gt stop`, `gt restart`, `gt rm`.

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npx jest tests/gtAgentDaemon.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gt.js CLAUDE.md tests/gtAgentDaemon.test.ts
git commit -m "docs(gt): update CLI help and CLAUDE.md for Docker-style agent commands"
```

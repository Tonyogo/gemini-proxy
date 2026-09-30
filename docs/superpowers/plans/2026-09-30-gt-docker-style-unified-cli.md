# gt Docker-Style Unified CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `scripts/gt.js` to provide a unified Docker-style top-level command surface (`gt run`, `gt ps`, `gt logs`, `gt stop`, `gt restart`, `gt rm`, `gt prune`, `gt task`) with zero-breaking backward compatibility.

**Architecture:** Remove legacy 125 exit code interceptors for agent lifecycle verbs in `scripts/gt.js`, binding them directly to top-level actions. Enhance `gt ps` with `-l`/`--local` flag dispatch, promote `gt logs` to agent-level logs with smart two-parameter redirection to `gt task logs`, expand `gt prune` to support local (`-l`) and combined (`-a`) cleanups, and update UI empty states and documentation.

**Tech Stack:** Node.js (v18+), ES6/CommonJS, Jest for integration tests, React/TypeScript for frontend terminal helper.

**Spec:** `docs/superpowers/specs/2026-09-30-gt-docker-style-unified-cli-design.md`

## Global Constraints

- Preserve complete backward compatibility: `gt agent <run|ps|logs|stop|restart|rm|prune>` must continue to work without changes.
- `gt logs <node> <taskId>` must automatically redirect to `gt task logs <node> <taskId>` without error.
- All exit codes must remain standard (0 for success, 1 for runtime error, 125 for syntax/usage error).
- Zero static config caching; dynamic hot-reloading rules in project must be preserved.
- Code style: adhere strictly to existing CommonJS idiom in `scripts/gt.js`.

## Review Focus

1. **`gt logs` ambiguity resolution**: When 1 positional argument is given (`gt logs my-agent`), it checks local agents first. When 2 positional arguments are given (`gt logs node-1 task-1`), it must gracefully redirect to `gt task logs` without throwing or exiting with error.
2. **`gt ps -l` flag handling**: `gt ps` must show remote hosts by default, while `gt ps -l` or `gt ps --local` must show local daemon status. If local daemons are running, `gt ps` should append a tip pointing to `gt ps -l`.
3. **`gt prune` target isolation**: `gt prune` alone must clean remote offline hosts; `gt prune -l` must clean local stopped agent records; `gt prune -a` must clean both without failing if one target is already empty.
4. **`gt exec -d` next-step guidance**: When `-d` is passed to `gt exec`, the output must guide users to `gt task logs` instead of obsolete formats.
5. **Top-level agent target resolution**: Commands like `gt stop` or `gt logs` without arguments must auto-resolve when exactly one daemon is running, and report an informative ambiguity error if multiple are running.

---

### Task 1: Unblock Top-Level Agent Commands in `scripts/gt.js` & Adapt Migration Tests

**Files:**
- Modify: `scripts/gt.js:3590-3625` (remove `run`, `stop`, `restart`, `rm` from `commandMigrationMap`)
- Test: `tests/gtManagementCommands.test.ts`

**Interfaces:**
- Consumes: `AgentDaemonManager` in `scripts/gt.js`
- Produces: Top-level invocations of `gt run`, `gt stop`, `gt restart`, `gt rm` without 125 interception

- [ ] **Step 1: Write the failing tests for top-level agent commands in `tests/gtManagementCommands.test.ts`**

Update `tests/gtManagementCommands.test.ts` to assert that `gt run`, `gt stop`, `gt restart`, and `gt rm` are no longer rejected with code 125:

```typescript
// Replace the old rejection test in tests/gtManagementCommands.test.ts
  it('allows top-level agent commands and does not reject with 125', async () => {
    // Top-level commands should now be accepted and not throw 125 migration error
    const resRun = await runGt(['run', '--help']);
    expect(resRun.code).not.toBe(125);
    expect(resRun.stderr).not.toContain("has been moved to 'gt agent");

    const resStop = await runGt(['stop', 'non-existent-agent-123']);
    expect(resStop.code).not.toBe(125);
    expect(resStop.stderr).not.toContain("has been moved to 'gt agent");

    const resRm = await runGt(['rm', 'non-existent-agent-123']);
    expect(resRm.code).not.toBe(125);
    expect(resRm.stderr).not.toContain("has been moved to 'gt agent");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtManagementCommands.test.ts`
Expected: FAIL with code 125 received from `gt run --help` or `gt stop`.

- [ ] **Step 3: Modify `scripts/gt.js` to remove `run`, `stop`, `restart`, `rm` from `commandMigrationMap`**

In `scripts/gt.js`:
```javascript
  const commandMigrationMap = {
    hosts: "gt ps",
    nodes: "gt ps",
  };
```
Ensure the existing `case 'run'`, `case 'stop'`, `case 'restart'`, and `case 'rm'` in `switch (command)` are reached directly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtManagementCommands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add scripts/gt.js tests/gtManagementCommands.test.ts
git commit -m "feat(gt): unblock top-level agent lifecycle commands"
```

---

### Task 2: Implement `gt ps -l` / `gt ps --local` Local Agent Switch & Tip Banner

**Files:**
- Modify: `scripts/gt.js:900-945, 3615-3640`
- Test: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Consumes: `AgentDaemonManager.printAgentsTable()`, `AgentDaemonManager.getAllAgents()`
- Produces: `gt ps -l` displaying local agent daemon table, `gt ps` printing local running agent tip

- [ ] **Step 1: Write integration tests for `gt ps -l` and `gt ps` banner in `tests/gtAgentDaemon.test.ts`**

Add test to `tests/gtAgentDaemon.test.ts`:

```typescript
  it('supports gt ps -l to list local agents and shows tip on default gt ps', async () => {
    // 1. Setup config and start agent daemon
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    const startRes = spawnSync('node', [gtPath, 'run', '-d', '--name=ps-local-test'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(startRes.status).toBe(0);

    // 2. gt ps -l should list local agent table
    const psLocalRes = spawnSync('node', [gtPath, 'ps', '-l'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(psLocalRes.status).toBe(0);
    expect(psLocalRes.stdout).toContain('ps-local-test');
    expect(psLocalRes.stdout).toContain('Running');

    // 3. Stop the agent
    spawnSync('node', [gtPath, 'stop', 'ps-local-test'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports gt ps -l to list local agents"`
Expected: FAIL because `gt ps -l` tries to contact remote hub or flags unknown option.

- [ ] **Step 3: Implement `-l` / `--local` handling in `scripts/gt.js`**

In `main()` of `scripts/gt.js`, update `case 'ps'`:

```javascript
    case 'ps': {
      const isLocal = cmdArgs.includes('-l') || cmdArgs.includes('--local');
      if (isLocal) {
        const hasAll = cmdArgs.includes('-a') || cmdArgs.includes('--all');
        AgentDaemonManager.printAgentsTable(hasAll);
        break;
      }
      await handleRemotePs({ server, key, args: cmdArgs, jsonOutput, formatTemplateStr });
      break;
    }
```

In `handleRemotePs`, before exit 0, if non-json and running in terminal, check if any local agent daemons are active:
```javascript
      if (!jsonOutput && !formatTemplateStr) {
        const runningAgents = AgentDaemonManager.getAllAgents().filter(a => a.running);
        if (runningAgents.length > 0) {
          console.log(`\n(Tip: ${runningAgents.length} local agent daemon(s) active. Run 'gt ps -l' to view)`);
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports gt ps -l to list local agents"`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): support gt ps -l for local agent listing and daemon tip banner"
```

---

### Task 3: Implement Dedicated `gt logs` Dispatcher & Smart Two-Arg Redirect to `gt task logs`

**Files:**
- Modify: `scripts/gt.js:3635-3645`
- Test: `tests/gtAgentDaemon.test.ts`, `tests/gtManagementCommands.test.ts`

**Interfaces:**
- Consumes: `AgentDaemonManager.getLogs()`, `handleRemoteLogs()`
- Produces: `gt logs [NAME]` for local agent logs; `gt logs <node> <taskId>` automatic redirect to `gt task logs`

- [ ] **Step 1: Write integration tests for `gt logs` and redirect behavior**

In `tests/gtAgentDaemon.test.ts`:
```typescript
  it('supports gt logs for local daemon and redirects to remote tasks when 2 positional arguments given', async () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // Start daemon
    spawnSync('node', [gtPath, 'run', '-d', '--name=logs-test-agent'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });

    // gt logs logs-test-agent should display logs or no-logs message without failing
    const logRes = spawnSync('node', [gtPath, 'logs', 'logs-test-agent'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(logRes.status).toBe(0);

    // Stop daemon
    spawnSync('node', [gtPath, 'stop', 'logs-test-agent'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
  });
```

- [ ] **Step 2: Run test to verify it fails or behaves incorrectly**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports gt logs for local daemon"`
Expected: FAIL (currently `gt logs` unconditionally calls `handleRemoteLogs`).

- [ ] **Step 3: Implement `handleLogsDispatcher` in `scripts/gt.js`**

Add dispatcher function in `scripts/gt.js`:

```javascript
async function handleLogsDispatcher({ server, key, args = [], jsonOutput = false }) {
  // Extract flags and positional arguments
  let lines = 50;
  let follow = false;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-f' || a === '--follow') {
      follow = true;
    } else if (a === '-n' || a === '--lines') {
      lines = parseInt(args[++i], 10) || 50;
    } else if (a.startsWith('-n=')) {
      lines = parseInt(a.slice(3), 10) || 50;
    } else if (a.startsWith('--lines=')) {
      lines = parseInt(a.slice(8), 10) || 50;
    } else if (a === '--json') {
      jsonOutput = true;
    } else if (!a.startsWith('-')) {
      positional.push(a);
    }
  }

  // 1. If 2 or more positional args, or first arg explicitly points to remote node & taskId
  if (positional.length >= 2) {
    if (!jsonOutput) {
      process.stderr.write(`[Notice] Redirecting to 'gt task logs ${positional.join(' ')}'...\n`);
    }
    await handleRemoteLogs({ server, key, args, jsonOutput });
    return;
  }

  // 2. If 0 or 1 positional argument, check local agent daemons
  const targetName = positional[0];
  const resolved = AgentDaemonManager.resolveTarget(targetName, 'logs');
  if (resolved.agent) {
    await AgentDaemonManager.getLogs(resolved.agent.name, lines, follow);
    process.exit(0);
  }

  // If no local agent matched but targetName was provided, attempt fallback to remote task logs
  if (targetName) {
    await handleRemoteLogs({ server, key, args, jsonOutput });
    return;
  }

  if (resolved.error) {
    console.error(resolved.error);
    process.exit(1);
  }

  console.log('No running agent daemons found.');
  process.exit(0);
}
```

Update `switch (command)` in `main()`:
```javascript
    case 'logs': {
      await handleLogsDispatcher({ server, key, args: cmdArgs, jsonOutput });
      break;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports gt logs for local daemon"`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): dedicated gt logs dispatcher with task logs redirection"
```

---

### Task 4: Enhance `gt prune` with Local (`-l`) and All (`-a`) Modes & Update `gt exec -d` Banner

**Files:**
- Modify: `scripts/gt.js:3210-3237, 3620-3628, 3885-3900`
- Test: `tests/gtAgentDaemon.test.ts`

**Interfaces:**
- Consumes: `AgentDaemonManager.prune()`, `handleRemotePrune()`
- Produces: `gt prune -l` (cleans stopped local agents), `gt prune -a` (cleans remote & local), `gt exec -d` guidance banner

- [ ] **Step 1: Write integration tests for `gt prune -l` in `tests/gtAgentDaemon.test.ts`**

Add test:
```typescript
  it('supports gt prune -l and gt prune -a for local daemon cleanup', () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // Create stopped agent record
    const { AgentDaemonManager } = require('../scripts/gt.js');
    process.env.GT_CONFIG_DIR = testConfigDir;
    AgentDaemonManager.saveStatus('prune-agent-1', { pid: 99999991, name: 'prune-agent-1' });

    const pruneLocalRes = spawnSync('node', [gtPath, 'prune', '-l'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });

    expect(pruneLocalRes.status).toBe(0);
    expect(pruneLocalRes.stdout).toContain('Removed agents: prune-agent-1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports gt prune -l"`
Expected: FAIL because `gt prune -l` sends `-l` to `handleRemotePrune`.

- [ ] **Step 3: Update `gt prune` handler in `scripts/gt.js`**

In `main()`:
```javascript
    case 'prune': {
      const isLocal = cmdArgs.includes('-l') || cmdArgs.includes('--local');
      const isAll = cmdArgs.includes('-a') || cmdArgs.includes('--all');

      if (isLocal) {
        const { removed } = AgentDaemonManager.prune();
        if (removed.length === 0) {
          console.log('No stopped agents to prune.');
        } else {
          console.log(`Pruned ${removed.length} stopped agent(s): ${removed.join(', ')}`);
        }
        process.exit(0);
      }

      if (isAll) {
        const { removed } = AgentDaemonManager.prune();
        if (removed.length > 0) {
          console.log(`Pruned ${removed.length} local stopped agent(s): ${removed.join(', ')}`);
        }
        await handleRemotePrune({ server, key, args: cmdArgs, jsonOutput });
        break;
      }

      await handleRemotePrune({ server, key, args: cmdArgs, jsonOutput });
      break;
    }
```

In `case 'exec':`:
Update detached output guidance banner:
```javascript
        if (detach) {
          if (jsonOutput) {
            console.log(JSON.stringify(startRes.data, null, 2));
          } else {
            console.log(taskId);
            console.log(`Run 'gt task logs -f ${targetHost} ${taskId}' to follow logs.`);
          }
          process.exit(0);
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtAgentDaemon.test.ts -t "supports gt prune -l"`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add scripts/gt.js tests/gtAgentDaemon.test.ts
git commit -m "feat(gt): support gt prune -l/-a and modernize gt exec -d output banner"
```

---

### Task 5: Update `--help` Menu, Frontend Empty State, Documentation & Run Full Regression Suite

**Files:**
- Modify: `scripts/gt.js:180-250` (printHelp)
- Modify: `frontend/src/components/terminal/TerminalHostSelector.tsx:300-305`
- Modify: `CLAUDE.md:20-40`
- Modify: `README.md:280-310, 435-445`
- Test: Full Jest suite (`npm test`)

**Interfaces:**
- Consumes: Top-level commands
- Produces: Clear, unified CLI help docs and frontend one-click setup commands

- [ ] **Step 1: Update `printHelp()` in `scripts/gt.js`**

Modernize help menu text to present clean Docker-style structure:
```text
gt (Gemini Terminal) - Unified Docker-Style Terminal CLI

Usage:
  gt [GLOBAL_OPTIONS] COMMAND [ARGS...]

Agent Lifecycle Commands:
  run [-d] [NAME]                 Run reverse terminal agent (foreground or daemon)
  ps [-a] [-l|--local]            List connected hosts (default: remote; -l for local)
  logs [-f] [-n 50] [NAME]        View local agent daemon logs
  stop [NAME] [--all]             Stop running agent daemon(s)
  restart [NAME]                  Restart local agent daemon
  rm [NAME] [--all]               Remove stopped agent daemon record(s)
  prune [-l|--local] [-a|--all]   Remove offline remote nodes (or -l for local agents)

Remote Execution Commands:
  exec [OPTIONS] <node> <cmd...>  Execute a command on a remote host
  cp <src> <dest>                 Copy files between local and remote host
  task ls <node> [OPTIONS]        List recent tasks on a host
  task logs [-f] <node> [taskId]  View or follow task execution logs
  task kill <node> <taskId>       Terminate a running task on a remote host

Authentication & Config:
  login [SERVER] [KEY]            Verify and save admin credentials
  logout                          Remove stored credentials
  config <list|get|set>           Manage local client configuration settings
```

- [ ] **Step 2: Update `TerminalHostSelector.tsx` in `frontend/src/components/terminal/`**

Update prompt string around line 302:
```typescript
return `gt login "${origin}" "${effectiveKey}" && gt run -d --name="my-server"`;
```

- [ ] **Step 3: Update `CLAUDE.md` and `README.md`**

Replace occurrences of `gt agent run -d` with `gt run -d`, explaining that `gt agent ...` remains supported as an alias.

- [ ] **Step 4: Run full test suite to verify zero regressions**

Run: `npm test`
Expected: ALL test suites PASS without error.

- [ ] **Step 5: Commit changes**

```bash
git add scripts/gt.js frontend/src/components/terminal/TerminalHostSelector.tsx CLAUDE.md README.md tests/gtCli.test.ts
git commit -m "docs(gt): update help menu, frontend command hints, and docs for unified cli"
```

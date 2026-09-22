# gt CLI Docker Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Gemini Terminal CLI (`scripts/gt.js`) to match Docker CLI ergonomics: management subcommands (`host`, `task`, `auth`), standard input piping (`gt exec -i`), Go-style `--format` table templates, bidirectional file copy (`gt cp`), and short ID prefix resolution with POSIX exit codes.

**Architecture:** 
1. Backend & Agent Command Pipeline: Update `terminalExecController.ts`, `terminalExecService.ts`, and Agent's `TaskManager` to accept and write `stdin` data into spawned execution processes.
2. CLI Engine & Formatter: Add a standalone zero-dependency Go/Docker-style template evaluator (`formatTemplate`) supporting single attributes and dynamic column-aligned `table` formatting.
3. Host & Task Resolver: Implement prefix matching for host IDs/names and task IDs with ambiguity detection.
4. Bidirectional File Transfer (`gt cp`): Implement safe local/remote path parsing and HTTP streaming upload/download against existing `/api/terminal/files/*` endpoints.
5. Management Command Dispatcher: Restructure CLI command dispatching into two-level hierarchy (`gt host ls/prune`, `gt task ls/logs/kill`, `gt auth login/logout`, `gt exec`, `gt cp`) and provide migration errors for legacy flat commands.

**Tech Stack:** Node.js (v18+), TypeScript, Jest, Supertest, HTTP/WS.

## Global Constraints

- Zero external runtime dependencies in `scripts/gt.js` (standard Node.js built-in modules only: `fs`, `path`, `os`, `http`, `https`, `crypto`, `child_process`, `url`).
- No backward compatibility with flat commands (`gt hosts`, `gt ps`, `gt logs`, `gt kill` must exit code 125 with helpful hints pointing to their replacement).
- POSIX-compliant exit codes: 0 (success), 1 (general error), 125 (CLI usage/syntax error), 130 (SIGINT), N (remote process exit code).

---

### Task 1: Backend & Agent Stdin Pipeline Support

**Files:**
- Modify: `src/terminal/services/terminalExecService.ts`
- Modify: `src/terminal/controllers/terminalExecController.ts`
- Modify: `scripts/gt.js:370-420` (TaskManager.startTask)
- Test: `tests/terminalExecStdin.test.ts`

**Interfaces:**
- `StartExecutionOptions`: add optional `stdin?: string`
- `executeCmdRpc` payload for `action: 'start'`: include `stdin?: string`
- Agent `TaskManager.startTask`: if `options.stdin` is provided, spawn with pipe stdin and write payload to process stdin

- [x] **Step 1: Write the failing integration test for stdin in command execution**

Create `tests/terminalExecStdin.test.ts`:
```typescript
import { terminalExecService } from '../src/terminal/services/terminalExecService';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('terminalExecService with stdin support', () => {
  it('passes stdin parameter to agent RPC payload', async () => {
    const executeSpy = jest.spyOn(terminalHostManager, 'executeCmdRpc').mockResolvedValue({
      success: true,
      data: { taskId: 'mock-task-123' },
    });

    const result = await terminalExecService.startExecution('test-host', {
      command: 'cat',
      stdin: 'hello from test stdin',
    });

    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith('test-host', expect.objectContaining({
      action: 'start',
      command: 'cat',
      stdin: 'hello from test stdin',
    }));

    executeSpy.mockRestore();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalExecStdin.test.ts`
Expected: FAIL (or `stdin` not recognized / not passed in payload)

- [x] **Step 3: Update terminalExecService, terminalExecController, and scripts/gt.js TaskManager**

Update `src/terminal/services/terminalExecService.ts`:
```typescript
export interface StartExecutionOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
}
```
And inside `startExecution`:
```typescript
    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'start',
      taskId,
      command: options.command.trim(),
      cwd: options.cwd ? options.cwd.trim() : undefined,
      timeoutMs,
      env: options.env || {},
      stdin: typeof options.stdin === 'string' ? options.stdin : undefined,
    });
```

Update `src/terminal/controllers/terminalExecController.ts`:
```typescript
    const { command, cwd, timeoutMs, env, stdin } = req.body || {};
...
    const result = await terminalExecService.startExecution(hostId, {
      command,
      cwd,
      timeoutMs: timeoutMs !== undefined ? parseInt(String(timeoutMs), 10) : undefined,
      env: typeof env === 'object' && env !== null ? env : undefined,
      stdin: typeof stdin === 'string' ? stdin : undefined,
    });
```

Update `scripts/gt.js` `TaskManager.startTask`:
```javascript
  startTask({ taskId, command, cwd, timeoutMs = 300000, env = {}, stdin = null }) {
    if (!taskId) taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
...
    let child = null;
    try {
      child = spawn(shell, shellArgs, {
        cwd: workingDir,
        env: taskEnv,
        stdio: [stdin !== null && stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        detached: !isWindows,
      });
      if (child.stdin && stdin !== null && stdin !== undefined) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
    } catch (err) {
      return { success: false, error: `Failed to spawn process: ${err.message}` };
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalExecStdin.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add src/terminal/services/terminalExecService.ts src/terminal/controllers/terminalExecController.ts scripts/gt.js tests/terminalExecStdin.test.ts
git commit -m "feat(terminal): add stdin pipeline support in exec service and agent task manager"
```

---

### Task 2: Go-Style `--format` Template Engine

**Files:**
- Modify: `scripts/gt.js` (Export and implement `formatTemplate`)
- Test: `tests/gtFormatTemplate.test.ts`

**Interfaces:**
- `formatTemplate(template: string, items: Array<Record<string, any>>): string`
  - Supports `{{.Field}}` placeholders.
  - Case-insensitive field matching (`{{.ID}}`, `{{.id}}`).
  - Supports `table {{.ID}}\t{{.Name}}\t{{.Status}}` with auto-capitalized header names and column width padding.
  - Resolves nested or transformed fields (e.g. `{{.ExitCode}}`, `{{.StartTime}}`, `{{.LastSeen}}`).

- [x] **Step 1: Write unit tests for formatTemplate**

Create `tests/gtFormatTemplate.test.ts`:
```typescript
import { formatTemplate } from '../scripts/gt.js';

describe('gt formatTemplate evaluator', () => {
  const sampleHosts = [
    { id: 'host-1111', name: 'prod-web', status: 'online', platform: 'linux', ip: '10.0.0.1', lastSeen: 1726830000000 },
    { id: 'host-2222', name: 'staging-db', status: 'offline', platform: 'darwin', ip: '10.0.0.2', lastSeen: null },
  ];

  it('evaluates raw property placeholders per line', () => {
    const output = formatTemplate('{{.ID}}: {{.Name}} ({{.Status}})', sampleHosts);
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('host-1111: prod-web (online)');
    expect(lines[1]).toBe('host-2222: staging-db (offline)');
  });

  it('renders tabular table format with aligned columns and headers', () => {
    const output = formatTemplate('table {{.ID}}\t{{.Name}}\t{{.Status}}', sampleHosts);
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^ID\s+NAME\s+STATUS$/);
    expect(lines[1]).toContain('host-1111');
    expect(lines[1]).toContain('prod-web');
    expect(lines[2]).toContain('host-2222');
  });

  it('handles empty datasets cleanly', () => {
    const output = formatTemplate('table {{.ID}}\t{{.Name}}', []);
    expect(output.trim()).toBe('ID\tNAME');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtFormatTemplate.test.ts`
Expected: FAIL (`formatTemplate is not a function`)

- [x] **Step 3: Implement formatTemplate in scripts/gt.js**

Add to `scripts/gt.js`:
```javascript
function formatTemplate(template, items = []) {
  if (typeof template !== 'string' || !template.trim()) return '';
  const isTable = /^table\s+/i.test(template.trim());
  const rawPattern = isTable ? template.trim().slice(5).trim() : template.trim();

  // Extract placeholder keys: {{.Field}}
  const keyMatches = [];
  const regex = /\{\{\s*\.([a-zA-Z0-9_]+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(rawPattern)) !== null) {
    keyMatches.push({ raw: match[0], key: match[1] });
  }

  const resolveVal = (item, key) => {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(item)) {
      if (k.toLowerCase() === lowerKey) {
        return v !== null && v !== undefined ? String(v) : '';
      }
    }
    // Fallback aliases
    if (lowerKey === 'taskid' && item.id) return String(item.id);
    if (lowerKey === 'id' && item.taskId) return String(item.taskId);
    if (lowerKey === 'exitcode' && item.exitCode !== undefined) return String(item.exitCode);
    return '';
  };

  if (!isTable) {
    return items.map((item) => {
      let line = rawPattern;
      for (const { raw, key } of keyMatches) {
        line = line.split(raw).join(resolveVal(item, key));
      }
      return line.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    }).join('\n');
  }

  // Table formatting: split columns by \t or multiple spaces
  const headerKeys = keyMatches.map(m => m.key);
  const headers = headerKeys.map(k => k.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase());

  const rows = items.map(item => headerKeys.map(k => resolveVal(item, k)));
  const allRows = [headers, ...rows];

  const colWidths = headers.map((_, colIdx) => {
    let max = 0;
    for (const row of allRows) {
      const len = (row[colIdx] || '').length;
      if (len > max) max = len;
    }
    return max;
  });

  return allRows.map((row, rowIdx) => {
    return row.map((cell, colIdx) => {
      if (colIdx === row.length - 1) return cell;
      return (cell || '').padEnd(colWidths[colIdx] + 3);
    }).join('').trimEnd();
  }).join('\n');
}
```
Export `formatTemplate` in `module.exports`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtFormatTemplate.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add scripts/gt.js tests/gtFormatTemplate.test.ts
git commit -m "feat(gt): implement go/docker style format template engine"
```

---

### Task 3: Short ID and Host/Task Prefix Resolver

**Files:**
- Modify: `scripts/gt.js` (Export and implement `resolveHost` and `resolveTaskId`)
- Test: `tests/gtResolver.test.ts`

**Interfaces:**
- `resolveHost(serverUrl: string, apiKey: string, input: string): Promise<{ id: string; name: string }>`
  - Resolves target host from input using exact match first, then prefix match (min 2 chars).
  - Throws Error with exitCode-like details if ambiguous or not found.
- `resolveTaskId(tasks: Array<{ taskId: string }>, input: string): string`
  - Resolves target task by exact or prefix match.

- [x] **Step 1: Write unit tests for resolver functions**

Create `tests/gtResolver.test.ts`:
```typescript
import { resolveTaskId } from '../scripts/gt.js';

describe('gt resolveTaskId', () => {
  const sampleTasks = [
    { taskId: 'task-1726800-abc111' },
    { taskId: 'task-1726800-abc222' },
    { taskId: 'task-1726800-def333' },
  ];

  it('resolves exact taskId match', () => {
    const id = resolveTaskId(sampleTasks, 'task-1726800-abc111');
    expect(id).toBe('task-1726800-abc111');
  });

  it('resolves unique prefix match', () => {
    const id = resolveTaskId(sampleTasks, 'def');
    expect(id).toBe('task-1726800-def333');
  });

  it('throws descriptive error on ambiguous prefix match', () => {
    expect(() => resolveTaskId(sampleTasks, 'abc')).toThrow(/ambiguous task identifier 'abc'/i);
  });

  it('throws descriptive error when no task matches', () => {
    expect(() => resolveTaskId(sampleTasks, 'nonexistent')).toThrow(/no such task/i);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtResolver.test.ts`
Expected: FAIL (`resolveTaskId is not a function`)

- [x] **Step 3: Implement resolveHost and resolveTaskId in scripts/gt.js**

Add to `scripts/gt.js`:
```javascript
function resolveTaskId(tasks, input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Task identifier is required');
  }
  const cleanInput = input.trim();
  // 1. Exact match
  const exact = tasks.find(t => t.taskId === cleanInput);
  if (exact) return exact.taskId;

  // 2. Prefix match
  const matches = tasks.filter(t => t.taskId.startsWith(cleanInput) || t.taskId.includes(cleanInput));
  if (matches.length === 1) return matches[0].taskId;
  if (matches.length > 1) {
    const candidates = matches.map(m => `  - ${m.taskId}`).join('\n');
    throw new Error(`Ambiguous task identifier '${cleanInput}': matches multiple tasks:\n${candidates}`);
  }
  throw new Error(`No such task: '${cleanInput}'`);
}

async function resolveHost(serverUrl, apiKey, input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Host identifier is required');
  }
  const cleanInput = input.trim();
  const res = await makeRequest({
    serverUrl,
    endpoint: '/api/terminal/hosts',
    method: 'GET',
    apiKey,
  });

  if (!res.data || !Array.isArray(res.data.hosts)) {
    throw new Error(`Failed to query hosts from server: ${res.data?.error || `HTTP ${res.status}`}`);
  }

  const hosts = res.data.hosts;
  // 1. Exact match on id or name
  const exact = hosts.find(h => h.id === cleanInput || (h.name && h.name.toLowerCase() === cleanInput.toLowerCase()));
  if (exact) return { id: exact.id, name: exact.name || exact.id };

  // 2. Prefix match on id or name
  const matches = hosts.filter(h => {
    const idHit = h.id && h.id.toLowerCase().startsWith(cleanInput.toLowerCase());
    const nameHit = h.name && h.name.toLowerCase().startsWith(cleanInput.toLowerCase());
    return idHit || nameHit;
  });

  if (matches.length === 1) {
    return { id: matches[0].id, name: matches[0].name || matches[0].id };
  }
  if (matches.length > 1) {
    const candidates = matches.map(m => `  - ${m.id} (${m.name || 'unnamed'})`).join('\n');
    throw new Error(`Ambiguous host identifier '${cleanInput}': matches multiple hosts:\n${candidates}`);
  }
  throw new Error(`No such host: '${cleanInput}'`);
}
```
Export both functions in `module.exports`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtResolver.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add scripts/gt.js tests/gtResolver.test.ts
git commit -m "feat(gt): add prefix matching and ambiguous resolution for hosts and tasks"
```

---

### Task 4: Bidirectional File Copy (`gt cp`)

**Files:**
- Modify: `scripts/gt.js` (Implement `parseCpArgs`, `downloadRemoteFile`, `uploadLocalFile`, `runCpCommand`)
- Test: `tests/gtCpCommand.test.ts`

**Interfaces:**
- `parseCpArgs(args: string[]): { src: { isRemote: boolean; host?: string; path: string }; dest: { isRemote: boolean; host?: string; path: string } }`
  - Correctly excludes Windows drive letters (`C:\...`).
- `runCp(serverUrl: string, apiKey: string, args: string[]): Promise<number>`
  - Executes remote download or upload.

- [x] **Step 1: Write tests for parseCpArgs**

Create `tests/gtCpCommand.test.ts`:
```typescript
import { parseCpArgs } from '../scripts/gt.js';

describe('gt parseCpArgs', () => {
  it('identifies remote source and local destination', () => {
    const res = parseCpArgs(['node-1:/var/log/app.log', './app.log']);
    expect(res.src.isRemote).toBe(true);
    expect(res.src.host).toBe('node-1');
    expect(res.src.path).toBe('/var/log/app.log');
    expect(res.dest.isRemote).toBe(false);
    expect(res.dest.path).toBe('./app.log');
  });

  it('identifies local source and remote destination', () => {
    const res = parseCpArgs(['./build.tar.gz', 'prod-srv:/opt/app/build.tar.gz']);
    expect(res.src.isRemote).toBe(false);
    expect(res.src.path).toBe('./build.tar.gz');
    expect(res.dest.isRemote).toBe(true);
    expect(res.dest.host).toBe('prod-srv');
    expect(res.dest.path).toBe('/opt/app/build.tar.gz');
  });

  it('does not treat Windows drive letters as remote hosts', () => {
    const res = parseCpArgs(['C:\\users\\test.txt', 'node-1:/tmp/test.txt']);
    expect(res.src.isRemote).toBe(false);
    expect(res.src.path).toBe('C:\\users\\test.txt');
    expect(res.dest.isRemote).toBe(true);
    expect(res.dest.host).toBe('node-1');
  });

  it('rejects copy when neither or both are remote', () => {
    expect(() => parseCpArgs(['local1', 'local2'])).toThrow(/one argument must be remote/i);
    expect(() => parseCpArgs(['h1:/a', 'h2:/b'])).toThrow(/cannot copy between two remote hosts/i);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtCpCommand.test.ts`
Expected: FAIL (`parseCpArgs is not a function`)

- [x] **Step 3: Implement parseCpArgs, download and upload logic in scripts/gt.js**

Add to `scripts/gt.js`:
```javascript
function isRemoteSpec(str) {
  if (typeof str !== 'string') return false;
  // Exclude Windows drive letters: C:\ or D:/
  if (/^[a-zA-Z]:[\\/]/.test(str)) return false;
  const colonIdx = str.indexOf(':');
  return colonIdx > 0;
}

function parseRemoteSpec(str) {
  const colonIdx = str.indexOf(':');
  return {
    host: str.slice(0, colonIdx).trim(),
    path: str.slice(colonIdx + 1).trim() || '.',
  };
}

function parseCpArgs(args) {
  if (!args || args.length < 2) {
    throw new Error('Usage: gt cp <src> <dest>');
  }
  const [srcArg, destArg] = args;
  const srcIsRemote = isRemoteSpec(srcArg);
  const destIsRemote = isRemoteSpec(destArg);

  if (!srcIsRemote && !destIsRemote) {
    throw new Error('Invalid arguments: at least one argument must be remote (<host>:<path>)');
  }
  if (srcIsRemote && destIsRemote) {
    throw new Error('Invalid arguments: cannot copy between two remote hosts directly');
  }

  const src = srcIsRemote
    ? { isRemote: true, ...parseRemoteSpec(srcArg) }
    : { isRemote: false, path: srcArg };

  const dest = destIsRemote
    ? { isRemote: true, ...parseRemoteSpec(destArg) }
    : { isRemote: false, path: destArg };

  return { src, dest };
}

async function uploadLocalFile({ serverUrl, apiKey, hostId, localPath, remotePath }) {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }
  const stat = fs.statSync(localPath);
  if (stat.isDirectory()) {
    throw new Error(`Directory upload is not supported in single-file cp: ${localPath}`);
  }

  const filename = path.basename(localPath);
  const fileContent = fs.readFileSync(localPath);
  const boundary = `----GtFormBoundary${crypto.randomBytes(8).toString('hex')}`;

  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([head, fileContent, tail]);

  const endpoint = `/api/terminal/files/upload?hostId=${encodeURIComponent(hostId)}&path=${encodeURIComponent(remotePath || '.')}`;

  const res = await makeRequestRaw({
    serverUrl,
    endpoint,
    method: 'POST',
    apiKey,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length,
    },
    bodyBuffer: payload,
  });

  if (res.status >= 400 || (res.data && !res.data.success)) {
    throw new Error(`Upload failed: ${res.data?.error || `HTTP ${res.status}`}`);
  }
  console.log(`Successfully copied ${localPath} -> [${hostId}]:${remotePath} (${(stat.size / 1024).toFixed(1)} KB)`);
  return 0;
}
```
Implement `downloadRemoteFile` using `/api/terminal/files/download` and pipe into local destination. Export `parseCpArgs` in `module.exports`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/gtCpCommand.test.ts`
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add scripts/gt.js tests/gtCpCommand.test.ts
git commit -m "feat(gt): implement cp arguments parsing and bidirectional file transfer"
```

---

### Task 5: Management Command Hierarchy & CLI Restructuring

**Files:**
- Modify: `scripts/gt.js:1210-1760` (Refactor `main` dispatcher)
- Modify: `tests/gtCli.test.ts`
- Test: `tests/gtManagementCommands.test.ts`

**Interfaces:**
- Restructure CLI dispatcher:
  - `gt host ls [--format] [--json]`
  - `gt host prune`
  - `gt task ls <host> [--format] [--json]`
  - `gt task logs [-f] <host> <taskId>`
  - `gt task kill <host> <taskId>`
  - `gt exec [-i] [-d] [-w] <host> <cmd...>`
  - `gt cp <src> <dest>`
  - `gt auth login [server] [key]`
  - `gt auth logout`
  - `gt config <list|get|set>`
  - `gt agent`
- Disallowed legacy flat commands (`hosts`, `ps`, `logs`, `kill`, `login`, `logout`):
  - Exit code `125` with error: `Error: 'gt <cmd>' is deprecated and replaced by 'gt <object> <verb>'. See 'gt --help'.`

- [x] **Step 1: Write integration tests for two-level commands and legacy deprecation**

Create `tests/gtManagementCommands.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

function runGt(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [gtPath, ...args], (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}

describe('gt management commands & legacy deprecation', () => {
  it('displays two-level commands in --help', async () => {
    const res = await runGt(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('gt host ls');
    expect(res.stdout).toContain('gt task ls');
    expect(res.stdout).toContain('gt exec');
    expect(res.stdout).toContain('gt cp');
    expect(res.stdout).toContain('gt auth login');
  });

  it('rejects legacy "hosts" command with code 125 and migration guidance', async () => {
    const res = await runGt(['hosts']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt host ls'");
  });

  it('rejects legacy "ps" command with code 125 and migration guidance', async () => {
    const res = await runGt(['ps', 'my-host']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt task ls'");
  });

  it('rejects legacy "logs" command with code 125 and migration guidance', async () => {
    const res = await runGt(['logs', 'my-host', 'task-1']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt task logs'");
  });

  it('rejects legacy "kill" command with code 125 and migration guidance', async () => {
    const res = await runGt(['kill', 'my-host', 'task-1']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt task kill'");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtManagementCommands.test.ts`
Expected: FAIL (legacy commands still execute old handlers, help menu still lists old commands)

- [x] **Step 3: Refactor printHelp and main in scripts/gt.js**

Update `printHelp()`:
```javascript
function printHelp() {
  console.log(`
gt (Gemini Terminal) - Unified Docker-Style Terminal CLI

Usage:
  gt [GLOBAL_OPTIONS] COMMAND [ARGS...]

Management Commands:
  host ls [OPTIONS]              List connected terminal agent hosts (like 'docker node ls')
  host prune                     Remove disconnected/offline agent hosts
  task ls <host> [OPTIONS]       List tasks on a host (like 'docker ps')
  task logs [OPTIONS] <h> <id>   View or follow execution logs (like 'docker logs')
  task kill <host> <task_id>     Terminate a running task on a host (like 'docker kill')
  auth login [SERVER] [KEY]      Verify and save admin credentials (like 'docker login')
  auth logout                    Remove stored credentials (like 'docker logout')

Commands:
  exec [OPTIONS] <host> <cmd...> Execute a command on a remote host (like 'docker exec')
  cp <src> <dest>                Copy files between local and remote host (like 'docker cp')
  config <list|get|set>          Manage local client configuration settings
  agent [OPTIONS]                Run reverse terminal agent daemon

Global Options:
  -s, --server <url>             Hub server URL (Default: env TERMINAL_SERVER or http://localhost:3000)
  -k, --key <secret>             Admin secret key (Default: env ADMIN_SECRET_KEY)
  --json                         Output in JSON format
  --format <template>            Format output using Go/Docker template (e.g. 'table {{.ID}}\\t{{.Name}}')
  -v, --version                  Print version information
  -h, --help                     Show this help menu
`);
}
```

Update legacy rejection in `main()`:
```javascript
  const legacyMap = {
    hosts: "gt host ls",
    nodes: "gt host ls",
    ps: "gt task ls <host>",
    logs: "gt task logs <host> <task_id>",
    kill: "gt task kill <host> <task_id>",
    login: "gt auth login",
    logout: "gt auth logout",
  };

  if (legacyMap[command]) {
    console.error(`Error: 'gt ${command}' has been replaced by '${legacyMap[command]}'.`);
    console.error(`Run 'gt --help' for modern command usage.`);
    process.exit(125);
  }
```

Implement the subcommands under `host`, `task`, `auth`, `exec`, `cp` using the resolvers and `--format` engine from earlier tasks.

- [x] **Step 4: Update tests/gtCli.test.ts for new commands**

Update `tests/gtCli.test.ts` to assert against `gt host ls`, `gt task ls`, and updated help text.

- [x] **Step 5: Run all CLI tests to verify they pass**

Run: `npx jest tests/gtManagementCommands.test.ts tests/gtCli.test.ts`
Expected: PASS

- [x] **Step 6: Commit changes**

```bash
git add scripts/gt.js tests/gtCli.test.ts tests/gtManagementCommands.test.ts
git commit -m "feat(gt): reorganize CLI into Docker-style management command hierarchy"
```

---

### Task 6: Comprehensive Verification & Full Test Suite

**Files:**
- Test: `tests/*gt*.test.ts`
- Modify: `CLAUDE.md` (Update CLI command documentation)

- [x] **Step 1: Run complete CLI test suite**

Run: `npx jest tests/gt*`
Expected: All tests pass.

- [x] **Step 2: Update CLAUDE.md documentation**

Update `CLAUDE.md` to document the new Docker-style commands:
- `gt host ls [--format] [--json]`
- `gt host prune`
- `gt task ls <host>`
- `gt task logs [-f] <host> <taskId>`
- `gt task kill <host> <taskId>`
- `gt exec [-i] [-d] [-w] <host> <cmd...>`
- `gt cp <src> <dest>`
- `gt auth login / logout`

- [x] **Step 3: Run full backend and terminal test suite**

Run: `npm test`
Expected: All tests pass with no regressions.

- [x] **Step 4: Commit documentation and plan completion**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-09-22-gt-cli-docker-alignment.md
git commit -m "docs(gt): update CLAUDE.md with docker-aligned management CLI commands"
```

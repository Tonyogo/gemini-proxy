# Design Doc: Terminal Remote Command Execution CLI Tool

- **Date:** 2026-09-20
- **Topic:** CLI Wrapper for Remote Command Execution over Reverse Terminal Agent
- **Status:** Approved

## 1. Overview & Objectives

The Gemini-Proxy platform includes an asynchronous command execution engine (`/api/terminal/exec/:hostId`) where agents execute isolated child processes (`child_process.spawn`) decoupled from the interactive PTY.

To enable automated script execution, continuous integration, and AI-driven remote deployments, we need an intuitive CLI tool (`scripts/terminal-exec.js`) that wraps these REST APIs.

### Key Requirements:
1. **Interactive Real-Time Stream Following (Default)**:
   - When executing a command, the CLI submits `POST /api/terminal/exec/:hostId`, obtains `taskId`, and enters a continuous polling loop with progressive byte offset (`GET /api/terminal/exec/:hostId/:taskId?offset=...`).
   - Streams `stdout` and `stderr` directly to the local terminal.
   - Exits with the remote command's actual `exitCode` upon completion (e.g. exit code 0 on success, non-zero on failure).
2. **Asynchronous Non-Blocking Mode (`--async`)**:
   - Submits the task and immediately outputs the JSON or plain text summary containing `taskId`, without polling.
3. **Subcommands for Lifecycle Management**:
   - `terminal-exec <command>` (Default: execute and follow).
   - `terminal-exec status <taskId>`: Query status and inspect logs for an existing task.
   - `terminal-exec kill <taskId>`: Terminate a running task on the target host.
   - `terminal-exec list`: List recent tasks on the target host.
4. **Mandatory Host Parameter**:
   - `--host=<hostId>` (or `-H <hostId>` or env `TERMINAL_HOST`) is strictly required. Exits with clear validation error if omitted.
5. **Configuration Discovery**:
   - Server URL: `--server`, env `TERMINAL_SERVER`, `GEMINI_PROXY_URL`, or default `http://localhost:3000`.
   - Admin Secret Key: `--key`, env `ADMIN_SECRET_KEY`, or loaded from `.env`.
6. **Package Integration**:
   - Add npm script: `"terminal-exec": "node scripts/terminal-exec.js"` in `package.json`.
   - Shebang `#!/usr/bin/env node` for executable standalone invocation.

---

## 2. CLI Command Specification & Usage

### 2.1 Synopsis
```bash
terminal-exec [options] <command>
terminal-exec status [options] <taskId>
terminal-exec kill [options] <taskId>
terminal-exec list [options]
```

### 2.2 Global Options
- `-H, --host <hostId>`: Target agent Host ID (**Required**, or via `TERMINAL_HOST`).
- `-s, --server <url>`: Proxy server base URL (Default: `http://localhost:3000` or env `TERMINAL_SERVER`).
- `-k, --key <secret>`: Admin secret key (Default: env `ADMIN_SECRET_KEY`).
- `--cwd <path>`: Working directory on remote host.
- `--timeout <ms>`: Remote process timeout in milliseconds (Default: `300000` / 5 minutes).
- `-a, --async`: Submit task and exit immediately without following logs.
- `--poll-interval <ms>`: Log follow polling interval in milliseconds (Default: `500`).
- `--json`: Output raw JSON response instead of formatted text.
- `-h, --help`: Display help and usage instructions.

### 2.3 Command Examples
```bash
# 1. Run a remote command and stream output live
npm run terminal-exec -- --host=my-server "git pull && npm run build"

# 2. Run command with custom cwd and timeout
npm run terminal-exec -- -H my-server --cwd=/home/app --timeout=60000 "ls -la"

# 3. Fire-and-forget asynchronous execution
npm run terminal-exec -- -H my-server --async "sleep 30 && echo done"

# 4. Check status and output of an existing task
npm run terminal-exec -- status -H my-server task-1726830000-abc123

# 5. List recent execution tasks on the target host
npm run terminal-exec -- list -H my-server

# 6. Kill a running task
npm run terminal-exec -- kill -H my-server task-1726830000-abc123
```

---

## 3. Architecture & Data Flow

```text
[ Developer / AI Agent ]
         │
         ▼
[ scripts/terminal-exec.js ]
         │
         ├─ 1. POST /api/terminal/exec/:hostId (Command, cwd, timeout)
         │       └─► Returns { success: true, taskId: "task-..." }
         │
         ├─ 2. Loop: GET /api/terminal/exec/:hostId/:taskId?offset=N (every 500ms)
         │       ├─► stdout chunk -> process.stdout.write()
         │       ├─► stderr chunk -> process.stderr.write()
         │       └─► advance offset = offset + chunk.length
         │
         └─ 3. Remote status === "completed" | "failed" | "killed" | "timeout"
                 └─► process.exit(task.exitCode || 0)
```

---

## 4. Error Handling & Signals

- **Missing Host**: Print error: `Error: Missing target host. Please specify --host=<hostId> or set TERMINAL_HOST environment variable.` and exit with code 1.
- **Connection Failure**: Print clear HTTP / network error and exit with code 1.
- **Local SIGINT (Ctrl+C)**:
  - If user hits `Ctrl+C` while following logs, prompt or send `POST /api/terminal/exec/:hostId/:taskId/kill` to ensure remote orphan processes are cleanly cleaned up, then exit.

---

## 5. Testing & Verification

1. **CLI Script Unit & Integration Tests (`tests/terminalExecCli.test.ts`)**:
   - Verify argument parsing (host, command, server, key, cwd, timeout, async).
   - Test validation failure when `--host` is missing.
   - Mock HTTP server to test task submission, incremental log streaming, and exitCode inheritance.
   - Test subcommands `status`, `list`, `kill`.
2. **Package Script**:
   - Verify `npm run terminal-exec -- --help` executes cleanly.

# Design Doc: Terminal Agent Asynchronous Command Execution Engine

- **Date:** 2026-09-18
- **Topic:** Terminal Agent Standalone Command Execution for AI & Deployment Automation
- **Status:** Approved

## 1. Overview & Objectives

In automated deployment, CI/CD, and AI Agent workflows (such as LLM Tool Calling to execute build scripts, pull repositories, or run database migrations), executing commands via an interactive terminal session (e.g., simulating keystrokes into a PTY session) is fragile and prone to interference. 

This design introduces a **standalone, isolated, asynchronous command execution engine** across the Gemini Proxy Hub and the Terminal Reverse Agent (`scripts/terminal-agent.js`).

### Core Goals:
1. **Full Process Isolation**: Executes commands in independent child processes (`child_process.spawn`) without interfering with interactive WebTerminal PTY sessions.
2. **Pure Asynchronous Task Lifecycle**: Immediate dispatch returning a unique `taskId`, allowing callers (AI models, webhooks, deployment scripts) to poll incrementally without holding long-lived HTTP connections prone to gateway timeouts.
3. **Incremental Output & Memory-Bounded Buffering**: Collects `stdout`, `stderr`, and sequential combined output with offset-based slicing (preventing repetitive transfers) and memory bounds (capped buffer).
4. **Concurrency & Process Control**: Supports running multiple tasks concurrently per agent node, configurable execution timeout (SIGTERM followed by SIGKILL), and explicit cancellation (`/kill`).
5. **Security & Integration**: Protected by `ADMIN_SECRET_KEY` via `x-admin-key`. Zero extra network ports required; piggybacks on the existing reverse WebSocket tunnel (`/api/admin/terminal/agent-ws`).

---

## 2. Architecture & Communication Protocol

```
[ AI Caller / Deployment Script ]
               │
               ▼  HTTP REST (x-admin-key)
   [ Proxy Admin Exec Controller ]
               │
               ▼
      [ TerminalExecService ]
               │
               ▼
    [ TerminalHostManager ]
               │
               │  WebSocket Frame (JSON:{"type":"cmd_exec", ...})
               ▼
    [ scripts/terminal-agent.js ]
               │
               ▼
       [ TaskManager Engine ]
         ├── child_process.spawn()
         ├── Stream Buffers (stdout, stderr, combined)
         ├── Timeout Guard
         └── Ring Buffer Pruner
```

---

## 3. REST API Specifications

All endpoints are hosted under `/api/admin/terminal/exec` and require `x-admin-key` header (or `ADMIN_SECRET_KEY`).

### 3.1 Start Execution
- **Endpoint:** `POST /api/admin/terminal/exec/:hostId`
- **Request Body:**
  ```json
  {
    "command": "string (required, shell command to execute)",
    "cwd": "string (optional, working directory; defaults to agent root or home)",
    "timeoutMs": 300000,
    "env": { "KEY": "VALUE" }
  }
  ```
- **Response (202 Accepted):**
  ```json
  {
    "success": true,
    "taskId": "task-1726671234000-a9b2c3",
    "hostId": "node-1",
    "status": "running",
    "command": "string",
    "cwd": "/path/to/cwd",
    "startTime": 1726671234000
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Missing or empty `command`.
  - `404 / 503 Not Found / Unavailable`: Specified `hostId` is offline or not registered.

---

### 3.2 Poll Task Status & Output
- **Endpoint:** `GET /api/admin/terminal/exec/:hostId/:taskId?offset=0`
- **Query Parameters:**
  - `offset`: (optional integer, default `0`). Start byte index from which to slice `stdout`, `stderr`, and `output`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "taskId": "task-1726671234000-a9b2c3",
    "hostId": "node-1",
    "status": "running",
    "exitCode": null,
    "stdout": "incremental stdout since offset",
    "stderr": "incremental stderr since offset",
    "output": "incremental chronological combined output",
    "offset": 5420,
    "totalBytes": 5420,
    "durationMs": 15400,
    "startTime": 1726671234000,
    "endTime": null
  }
  ```
  *Status values*: `'running'`, `'completed'`, `'failed'`, `'killed'`, `'timeout'`.

---

### 3.3 Kill / Abort Task
- **Endpoint:** `POST /api/admin/terminal/exec/:hostId/:taskId/kill`
- **Request Body:**
  ```json
  {
    "signal": "SIGTERM"
  }
  ```
  *(Supported signals: `"SIGTERM"` or `"SIGKILL"`, default `"SIGTERM"`)*
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "taskId": "task-1726671234000-a9b2c3",
    "status": "killed",
    "message": "Kill signal sent to task"
  }
  ```

---

### 3.4 List Recent Node Tasks
- **Endpoint:** `GET /api/admin/terminal/exec/:hostId?limit=20`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "hostId": "node-1",
    "tasks": [
      {
        "taskId": "task-1726671234000-a9b2c3",
        "command": "npm test",
        "status": "completed",
        "exitCode": 0,
        "durationMs": 4200,
        "startTime": 1726671234000,
        "endTime": 1726671238200
      }
    ]
  }
  ```

---

## 4. WebSocket Tunnel RPC Protocol

Framed over the existing Agent WebSocket using prefix `JSON:{...}`:

### 4.1 Actions (Proxy → Agent)
1. `start`:
   ```json
   {
     "type": "cmd_exec",
     "reqId": "req-xxx",
     "action": "start",
     "taskId": "task-xxx",
     "command": "...",
     "cwd": "...",
     "timeoutMs": 300000,
     "env": {}
   }
   ```
2. `poll`:
   ```json
   {
     "type": "cmd_exec",
     "reqId": "req-xxx",
     "action": "poll",
     "taskId": "task-xxx",
     "offset": 1024
   }
   ```
3. `kill`:
   ```json
   {
     "type": "cmd_exec",
     "reqId": "req-xxx",
     "action": "kill",
     "taskId": "task-xxx",
     "signal": "SIGTERM"
   }
   ```
4. `list`:
   ```json
   {
     "type": "cmd_exec",
     "reqId": "req-xxx",
     "action": "list",
     "limit": 20
   }
   ```

### 4.2 Responses (Agent → Proxy)
```json
{
  "type": "cmd_exec_res",
  "reqId": "req-xxx",
  "taskId": "task-xxx",
  "success": true,
  "data": { ... },
  "error": null
}
```

---

## 5. Agent Task Engine Specifications (`scripts/terminal-agent.js`)

1. **Process Spawning**:
   - Uses `child_process.spawn`:
     - POSIX: `/bin/sh` or `/bin/bash` with `['-c', command]`.
     - Windows: `powershell.exe` with `['-Command', command]` or `cmd.exe` with `['/c', command]`.
   - `stdio`: `['ignore', 'pipe', 'pipe']`.
2. **Buffer Management**:
   - Standard output and standard error are captured via event listeners (`child.stdout.on('data')`, `child.stderr.on('data')`).
   - Combined buffer interleaves streams chronologically.
   - Max output buffer size capped at 5 MB per task (oldest bytes dropped if exceeded).
3. **Timeout & Cleanup**:
   - Automatically kills child process when `Date.now() - startTime >= timeoutMs`.
   - Finished tasks retained in an LRU/time-based array (max 100 tasks, TTL 24 hours).

---

## 6. Verification & Test Plan

1. **Unit & API Tests (`tests/terminalExec.test.ts`)**:
   - Reject unauthenticated requests with `401 Unauthorized`.
   - Validate `POST /api/admin/terminal/exec/:hostId` with valid and invalid command payloads.
   - Test offline agent rejection (`404 / 503`).
   - Test RPC message dispatch and `taskId` registration.
   - Test incremental polling with `offset` parameters.
   - Test kill endpoint handling.
2. **Integration Verification (`scripts/terminal-agent.js`)**:
   - Spawn test agent connected to local hub.
   - Dispatch multi-step script (`echo "A" && sleep 1 && echo "B"`).
   - Verify initial status is `running`.
   - Verify polling with offset yields incremental data.
   - Verify completion with `exitCode: 0`.
   - Dispatch long-running command (`sleep 60`) and issue kill; verify status becomes `killed`.
3. **Full Regression Check**:
   - Execute `npm run build` and `npm test` to ensure all existing routes, terminal PTY, and file RPC tests pass without regression.

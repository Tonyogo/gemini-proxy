# Docker-Style Interactive Terminal CLI (`gt exec -it`) Design

**Date:** 2026-09-22  
**Status:** Approved  
**Author:** Claude Code & Team  

---

## 1. Context & Motivation

`gt` (Gemini Terminal) is a unified Docker-style command-line utility for managing and executing operations on remote agents connected to the Gemini Proxy Hub.

Currently, `gt exec` operates in a **non-interactive batch mode**:
- An execution request is created via HTTP `POST /api/terminal/exec/:hostId`.
- The CLI polls execution logs incrementally via HTTP `GET /api/terminal/exec/:hostId/:taskId?offset=...`.
- Although `-i / --interactive` can pipe static STDIN (e.g. `cat file | gt exec -i host cmd`), it does not support real-time, bidirectional, full-screen, interactive pseudo-terminal (PTY) workflows like `docker exec -it <container> /bin/bash`.

This design document outlines the end-to-end architecture and implementation details for upgrading `gt exec` to support full Docker-grade interactive sessions (`gt exec -it <host> <command...>`) with low latency, raw keyboard input streaming, automatic window resizing, process isolation, and clean fallback degradation.

---

## 2. Requirements & Key Principles

1. **Docker Command Alignment**:
   - Syntax: `gt exec [OPTIONS] <host> <command...>`
   - `-i, --interactive`: Keep STDIN open for live user interaction.
   - `-t, --tty`: Allocate a pseudo-TTY with raw terminal input and ANSI escape sequence passthrough.
   - `-it` / `-ti`: The canonical composite flag combination (equivalent to `-i -t`).
   - Strict argument validation: `<host>` and `<command...>` are both strictly required (no implicit default shell if no command is specified, matching Docker's behavior).
   - Flag disambiguation: Short option `-t` is dedicated to `--tty`. Timeout is strictly specified via `--timeout <ms>` (no `-t` for timeout).
2. **Process & Session Isolation (True Docker Exec Semantics)**:
   - Each `gt exec -it` invocation creates a brand-new, isolated child PTY process with an assigned `taskId`.
   - It runs completely independently from the persistent WebTerminal session of the agent and other concurrent `exec` sessions.
   - When the process exits, resources are completely reclaimed without affecting any other session.
3. **Graceful Environment Degradation**:
   - If the remote agent has `node-pty` installed, a full pseudo-terminal is allocated (supporting vim, htop, cursor movement, raw mode, etc.).
   - If `node-pty` is not installed on the agent, it cleanly degrades to an interactive stream pipe using Node.js `child_process.spawn`, emitting a warning message to stderr while still supporting interactive text I/O.
4. **Resilience & Resource Safety**:
   - If the local CLI disconnects (e.g. terminal closed, network failure, or killed), the Server Hub notifies the Agent to immediately kill the corresponding child process, preventing orphan processes.
   - If the Agent drops connection, the Server Hub immediately notifies the CLI to restore local terminal state and exit with a non-zero code.

---

## 3. System Architecture & Communication Flow

The solution leverages a WebSocket Multiplexing Bridge model:

```
+----------------+              +----------------------+              +----------------------+
|     gt CLI     |              |   Server Hub (Proxy) |              |     Remote Agent     |
+----------------+              +----------------------+              +----------------------+
       |                                   |                                     |
       |  WebSocket Connect                |                                     |
       |  /api/terminal/exec-ws?hostId=... |                                     |
       |---------------------------------->|                                     |
       |                                   |                                     |
       |  exec_start frame                 |                                     |
       |  {cmd, tty: true, cols, rows}     |  cmd_exec (start_stream)            |
       |---------------------------------->|------------------------------------>|
       |                                   |  (Multiplexed over primary agent-ws)|
       |                                   |                                     | Spawns independent
       |                                   |                                     | PTY process
       |                                   |  cmd_stream_started                 |
       |  exec_started {taskId}            |<------------------------------------|
       |<----------------------------------|                                     |
       |                                   |                                     |
       |  [Local Terminal -> Raw Mode]     |                                     |
       |                                   |                                     |
       |  Raw Keypress Bytes (Binary)      |  cmd_stream_input                   |
       |---------------------------------->|------------------------------------>| PTY.write(bytes)
       |                                   |                                     |
       |                                   |  cmd_stream_data (stdout/stderr)    |
       |  Raw Terminal Output (Binary)     |<------------------------------------| PTY.onData(chunk)
       |<----------------------------------|                                     |
       |  process.stdout.write(chunk)      |                                     |
       |                                   |                                     |
       |  Window Resize Event              |  cmd_stream_resize                  |
       |  JSON:{"type":"resize",cols,rows} |------------------------------------>| PTY.resize(cols, rows)
       |---------------------------------->|                                     |
       |                                   |                                     |
       |                                   |  Process Exits                      |
       |                                   |  cmd_stream_exit {exitCode}         |
       |  JSON:{"type":"exec_exit",code}   |<------------------------------------|
       |<----------------------------------|                                     |
       |                                   |                                     |
       |  [Restore Local Terminal]         |                                     |
       |  process.exit(code)               |                                     |
```

---

## 4. Detailed Component Design

### 4.1 CLI Layer (`scripts/gt.js`)

#### Flag Parsing
- Update `parseExecArgs`:
  - Support `-t`, `--tty`.
  - Support composite `-it`, `-ti`.
  - Ensure `-t` is no longer parsed as timeout; only `--timeout <ms>` and `--timeout=<ms>` set `timeoutMs`.
  - Validate that `host` and `commandParts` are both non-empty:
    ```javascript
    if (!host || commandParts.length === 0) {
      console.error('Error: "gt exec" requires at least 2 arguments.');
      console.error('Usage: gt exec [OPTIONS] <host> <command...>');
      process.exit(1);
    }
    ```

#### Interactive Terminal Lifecycle (`runInteractiveExec`)
1. **Connection**: Establish WebSocket connection to `${wsUrl}/api/terminal/exec-ws?hostId=${hostId}` with `x-admin-key`.
2. **Handshake**:
   - Send initial JSON control packet:
     ```json
     JSON:{"type":"exec_start","command":fullCommand,"tty":true,"interactive":true,"cols":process.stdout.columns || 80,"rows":process.stdout.rows || 24,"cwd":workdir,"env":envVars,"timeoutMs":timeoutMs}
     ```
3. **Terminal Mode Transition**:
   - Call `process.stdin.setRawMode(true)`.
   - Call `process.stdin.resume()`.
   - Pipe `process.stdin` data directly as binary frames over WebSocket.
   - Listen to `process.stdout.on('resize')` to dispatch `JSON:{"type":"resize","cols":...,"rows":...}`.
4. **Cleanup & Exit**:
   - Restore raw mode: `if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause();`
   - Write reset styles: `process.stdout.write('\x1b[?25h\x1b[0m');`
   - Exit cleanly with the remote exit code returned by `exec_exit`.

---

### 4.2 Server Hub Layer (`src/terminal/`)

#### 1. WebSocket Route Upgrade (`src/terminal/routes/terminalWs.ts`)
- Add handling for `/api/terminal/exec-ws` and legacy `/api/admin/terminal/exec-ws`.
- Authenticate requests using `x-admin-key` header or query parameter against `config.adminSecretKey`.
- Pass authorized connections to `terminalExecBridge.handleCliConnection(ws, req)`.

#### 2. Exec Bridge Manager (`src/terminal/services/terminalExecBridge.ts`)
- Manages mappings:
  - `activeExecs: Map<taskId, { cliWs: WebSocket, hostId: string, createdAt: number }>`
- Dispatches:
  - When CLI sends `exec_start`: Generates `taskId`, registers in `activeExecs`, and calls `terminalHostManager.sendToAgent(hostId, { type: 'cmd_exec', action: 'start_stream', taskId, ... })`.
  - When CLI sends binary input: Wraps as `cmd_stream_input` with `taskId` and Base64-encoded payload to the Agent.
  - When CLI sends resize frame: Forwards as `cmd_stream_resize` with `taskId` to the Agent.
  - When Agent pushes `cmd_stream_data`: Looks up `cliWs` by `taskId` and forwards raw buffer as binary.
  - When Agent sends `cmd_stream_exit`: Sends `exec_exit` to `cliWs`, gracefully closes `cliWs`, and deletes tracking.
  - When CLI disconnects unexpectedly: Sends `cmd_stream_kill` with `signal: 'SIGHUP'` to Agent to terminate the task.
  - When Agent disconnects: Sends error message and closes all corresponding active CLI WebSockets.

---

### 4.3 Agent Daemon Layer (`scripts/gt.js`)

#### Stream Session Execution (`StreamSessionManager`)
- Dedicated sub-manager inside Agent:
  - `sessions: Map<taskId, { process, isPty, timeoutTimer, taskId }>`
- **PTY Execution**:
  - Uses `node-pty.spawn` with target shell/command and passed args.
  - Injects `TERM: 'xterm-256color'`, `COLORTERM: 'truecolor'`.
  - Emits `cmd_stream_data` whenever `ptyProcess.onData` receives output.
  - Listens to `ptyProcess.onExit(({ exitCode, signal }) => ...)` to emit `cmd_stream_exit`.
- **Fallback Stream Execution**:
  - If `node-pty` is absent, uses `child_process.spawn`.
  - Emits a yellow warning banner at start to inform user.
  - Pipes `child.stdout` and `child.stderr` as `cmd_stream_data`.
  - Forwards `child.on('close', (exitCode, signal) => ...)` as `cmd_stream_exit`.
- **Signal Handling**:
  - Supports `cmd_stream_kill`: kills the process tree using `killProcessTree`.
  - Supports `cmd_stream_resize`: triggers `ptyProcess.resize(cols, rows)`.

---

## 5. Error Handling & Edge Cases

| Scenario | Handling |
| :--- | :--- |
| Target host offline | CLI receives `400/503` or immediate WS close with error message `[Host Offline] Host "xxx" is offline or unavailable.` |
| Agent lacks `node-pty` | Gracefully falls back to `child_process.spawn` streaming with a warning banner. |
| CLI exits via Ctrl+C / kill | Server Hub catches CLI WS close and sends `cmd_stream_kill` to Agent. Process terminated. |
| Agent crashes / drops WS | Server Hub notifies CLI WS with disconnection banner and closes WS. CLI restores terminal raw mode and exits with code 1. |
| Non-interactive piping (`cat file \| gt exec -i host cmd`) | When `process.stdin.isTTY` is false, runs without raw mode or PTY resize, preserving existing pure stream behavior. |

---

## 6. Testing Strategy

1. **Unit & Parsing Tests (`tests/gtCli.test.ts`)**:
   - Validate parsing of `-it`, `-t`, `-i`, `--tty`, `--interactive`, `--timeout`.
   - Assert missing command or host triggers an explicit error and exit code 1.
   - Assert `-t <ms>` is rejected as an invalid option or treated as `--tty` (not `--timeout`).
2. **Integration Tests**:
   - Mock Hub and Agent WebSocket interactions for `exec_start`, `cmd_stream_data`, `cmd_stream_resize`, and `cmd_stream_exit`.
   - Verify terminal raw mode restore on process close.

# Design Doc: `gt` (Gemini Terminal) Unified Docker-Style CLI Tool

- **Date:** 2026-09-20
- **Topic:** Unified Docker-Style CLI Tool (`gt`) for Terminal Agent and Remote Command Execution
- **Status:** Approved

## 1. Overview & Objectives

In the Gemini-Proxy terminal subsystem, remote terminal nodes connect via reverse WebSockets (`scripts/terminal-agent.js` and `agent-rs`), and standalone command executions are handled asynchronously via `/api/terminal/exec/:hostId`.

To unify both **client operations** (command execution, node inspection, task monitoring) and **agent hosting** (reverse PTY and command execution daemon) under a single cohesive tool with zero learning curve, we adopt the Docker CLI convention and create **`gt` (Gemini Terminal)**.

### Key Requirements:
1. **Docker-Style Command Syntax**:
   - `gt hosts`: List connected nodes and health status (analogous to `docker node ls`).
   - `gt exec [OPTIONS] HOST COMMAND [ARGS...]`: Execute a command on a remote node with live output streaming and exit code inheritance (analogous to `docker exec`).
   - `gt ps HOST`: List active and recent tasks on the target host (analogous to `docker ps`).
   - `gt logs HOST TASK_ID`: Retrieve execution logs of a remote task (analogous to `docker logs`).
   - `gt kill HOST TASK_ID`: Terminate a running remote task (analogous to `docker kill`).
   - `gt agent [OPTIONS]`: Launch the reverse terminal agent daemon (analogous to `docker run` / `dockerd`).
2. **Flag Collision Prevention & Parameter Pass-Through**:
   - Explicit positional parsing: First non-option argument after `exec` is `HOST`, all subsequent arguments form the remote command.
   - Support POSIX `--` separator: Any flags after `--` (e.g., `-a`, `-s`, `--cwd`) are passed verbatim to the remote command without being captured by `gt`.
3. **Transparent Execution Header & Footer Banners**:
   - When running `gt exec`, print clear execution context to `stderr`:
     ```text
     >>> [my-server-01] $ git status
     ... (stdout / stderr streamed in real-time) ...
     <<< [my-server-01] Command completed with code 0 (took 1.42s)
     ```
   - Provide `-q, --quiet` flag to suppress banners for piping and shell redirection.
4. **Reliable Signal Handling**:
   - If user triggers `SIGINT` (Ctrl+C) locally, the CLI immediately sends a termination request to the target host to kill the remote process, avoiding orphaned tasks.
5. **Distribution & Rust Evolution**:
   - Node.js implementation: `scripts/gt.js`, registered in `package.json` under `"bin": { "gt": "./scripts/gt.js" }` and `"scripts": { "gt": "node scripts/gt.js" }`.
   - Backward compatibility: Alias `npm run terminal-agent` and `npm run terminal-exec` to `gt`.
   - Forward roadmap: Designed for straightforward porting to a single-file, zero-dependency native Rust binary in `agent-rs`.

---

## 2. CLI Command Specification

### 2.1 Synopsis
```bash
gt [GLOBAL_OPTIONS] COMMAND [ARGS...]
```

### 2.2 Global Options
- `-s, --server <url>`: Proxy server base URL (Default: `http://localhost:3000`, or env `TERMINAL_SERVER` / `GEMINI_PROXY_URL`).
- `-k, --key <secret>`: Admin secret key (Default: env `ADMIN_SECRET_KEY`, or loaded from `.env`).
- `--json`: Output structured JSON where applicable.
- `-v, --version`: Print version information.
- `-h, --help`: Display help and usage instructions.

---

### 2.3 Subcommands

#### 1. `gt hosts`
Query connected reverse agents from the proxy server (`GET /api/terminal/hosts`).
```text
HOST ID        NAME           STATUS    PLATFORM    IP           LAST SEEN
my-server-01   production-1   online    linux       10.88.0.3    Just now
mac-node-02    dev-mac        online    darwin      192.168.1.5  Just now
ubuntu-backup  backup-srv     offline   linux       10.88.0.12   10m ago
```

#### 2. `gt exec [OPTIONS] HOST COMMAND [ARG...]`
Execute a command on `HOST` and stream stdout/stderr in real-time.
- `-d, --detach`: Run command in the background, print `taskId` and exit immediately.
- `-w, --workdir <dir>`: Remote working directory (alias: `--cwd`).
- `-t, --timeout <ms>`: Process execution timeout in milliseconds (default: `300000` / 5 minutes).
- `-e, --env <KEY=VAL>`: Set environment variable on remote command (can be specified multiple times).
- `-q, --quiet`: Do not print `>>>` and `<<<` execution banners.
- `--poll-interval <ms>`: Live log streaming poll interval (default: `500`).
- Remote command exit code is forwarded as local CLI exit code (`process.exit(remoteExitCode)`).

#### 3. `gt ps HOST`
List tasks executed on `HOST` (`GET /api/terminal/exec/:hostId`).
```text
TASK ID                 STATUS      EXIT    START TIME    COMMAND
task-1726830000-abc123  completed   0       18:30:00      git pull && npm run build
task-1726830100-xyz789  running     -       18:31:40      npm test
```

#### 4. `gt logs HOST TASK_ID`
Display detailed execution status and output logs of `TASK_ID` on `HOST` (`GET /api/terminal/exec/:hostId/:taskId`).

#### 5. `gt kill HOST TASK_ID`
Terminate a running task on `HOST` (`POST /api/terminal/exec/:hostId/:taskId/kill`).

#### 6. `gt agent [OPTIONS]`
Launch the reverse terminal agent connecting back to the proxy server.
- `--server=<url>`: Target proxy server URL.
- `--key=<secret>`: Admin secret key.
- `--name=<name>`: Host identifier / label.
- `--id=<hostId>`: Optional explicit host ID.
- `--shell=<path>`: Custom shell executable.

---

## 3. Architecture & Error Handling

```text
               ┌─────────────────────── gt CLI ───────────────────────┐
               │                                                      │
               ├─► gt hosts     ──► GET  /api/terminal/hosts          │
               ├─► gt exec      ──► POST /api/terminal/exec/:hostId   │
               │                    └─► GET poll loop (live stream)   │
               ├─► gt ps        ──► GET  /api/terminal/exec/:hostId   │
               ├─► gt logs      ──► GET  /api/terminal/exec/:hId/:tId │
               ├─► gt kill      ──► POST /api/terminal/exec/:hId/:tId │
               └─► gt agent     ──► WS   /api/terminal/agent-ws       │
                                                                      │
                                         ▲
                                         │
                                [ Gemini Proxy Hub ]
```

- **Network Resilience**: In `gt exec`, the live streaming loop implements an exponential backoff retry counter; if network is down for 5 consecutive polls, it notifies the user and aborts cleanly.
- **Pipe-Friendly**: All diagnostic information (`>>>`, `<<<`, errors) is sent to `process.stderr`. Only the actual command stdout is sent to `process.stdout`.
- **Exit Code Integrity**: Ensures `gt exec host "false"` exits with 1, and `gt exec host "true"` exits with 0.

---

## 4. Testing & Verification

1. **CLI Argument & Command Dispatch Tests (`tests/gtCli.test.ts`)**:
   - `gt --help`, `gt --version`.
   - `gt hosts` with formatted table and `--json`.
   - `gt exec` with streaming, banner suppression (`-q`), `--detach` mode, and `--` pass-through argument separation.
   - `gt ps`, `gt logs`, `gt kill`.
   - Error handling: Missing host, unknown command, remote task failure.
2. **Backward Compatibility**:
   - Verify `npm run terminal-agent` and `npm run terminal-exec` continue to function as aliases or direct commands.
3. **Full Regression**:
   - `npm test` across all test suites.
   - `npm run build` production build.

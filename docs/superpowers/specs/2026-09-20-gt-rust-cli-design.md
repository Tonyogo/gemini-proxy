# Design Doc: Native Rust Implementation for `gt` (Gemini Terminal) Unified CLI

- **Date:** 2026-09-20
- **Topic:** High-Performance Single-Binary Native Rust Implementation for `gt` Unified CLI
- **Status:** Approved

## 1. Overview & Objectives

In the prior design, we unified the client operations (`hosts`, `exec`, `ps`, `logs`, `kill`) and the agent hosting runtime (`agent`) under the Docker-style `gt` CLI convention.

This document specifies the **native Rust implementation** of `gt`, transforming `agent-rs` from a standalone reverse-tunnel agent into a **single-file, zero-dependency, high-performance static binary** that serves both as the operator client and the reverse agent daemon.

### Key Goals:
1. **Unified Binary Name & Cargo Package**:
   - Package name: `gt`.
   - Binary output: `target/release/gt`.
2. **Pure Rust Network Stack**:
   - HTTP Client: `reqwest 0.12` configured with `default-features = false`, `features = ["json", "rustls-tls-native-roots"]`.
   - TLS Provider: `rustls 0.23` with `ring` crypto provider.
   - Zero OpenSSL runtime dependencies, ensuring cross-platform statically-linkable binaries across Linux and macOS.
3. **Full Docker-Style Feature Parity**:
   - `gt hosts [--json]`: Query registered nodes and render an aligned ASCII table.
   - `gt exec [OPTIONS] HOST COMMAND...`: Progressive polling output streaming to `stdout`/`stderr`, execution banners (`>>>` and `<<<`) to `stderr`, parameter pass-through via `--`, `-d/--detach`, `-q/--quiet`, `-w/--workdir`, `-e/--env`, and exact exit-code inheritance (`std::process::exit(exit_code)`).
   - `gt ps HOST [--json]`: Query recent tasks.
   - `gt logs HOST TASK_ID [--json]`: Display full logs.
   - `gt kill HOST TASK_ID [--json]`: Terminate tasks remotely.
   - `gt agent [OPTIONS]`: Launch the existing WebSocket reverse agent (PTY + standalone exec + file RPC).

---

## 2. Architecture & Module Structure

```text
agent-rs/
├── Cargo.toml               # Renamed to "gt" with reqwest & rustls
└── src/
    ├── main.rs              # Unified entry point; installs crypto provider & dispatches subcommands
    ├── cli.rs               # clap CLI struct & enum definitions (Commands: Hosts, Exec, Ps, Logs, Kill, Agent)
    ├── client.rs            # HTTP REST client implementations for hosts, exec, ps, logs, kill
    ├── config.rs            # Agent daemon configuration resolution (host ID, local IP, hostname)
    ├── ws.rs                # WebSocket connection manager & reverse tunnel loop
    ├── protocol.rs          # Binary and JSON frame encodings
    ├── pty/                 # Linux/macOS PTY session manager
    ├── rpc/                 # File system RPC handler
    └── task/                # Standalone child process execution manager (child_process::spawn equivalent)
```

---

## 3. Data Flow & Subcommand Details

### 3.1 `gt exec` Streaming Loop
1. Parse `ExecArgs`:
   - `host`: Target host ID.
   - `command`: Extracted command arguments joined into string.
   - `workdir`, `timeout`, `env`, `detach`, `quiet`.
2. Print Banner to `stderr` (unless `--quiet`):
   ```text
   >>> [my-server-01] $ git status
   ```
3. Issue `POST /api/terminal/exec/:hostId`:
   - Obtain `taskId`. If `--detach`, print `taskId` and exit with 0 immediately.
4. Continuous Polling Loop:
   - Poll `GET /api/terminal/exec/:hostId/:taskId?offset=...` every 500ms.
   - Stream `stdout` chunks directly to `std::io::stdout()`.
   - Stream `stderr` chunks directly to `std::io::stderr()`.
   - Update `offset += chunk.len()`.
5. Exit Condition:
   - When `status != "running"`, print footer banner to `stderr` (unless `--quiet`):
     ```text
     <<< [my-server-01] Command completed with code 0 (took 1.25s)
     ```
   - Invoke `std::process::exit(remote_exit_code)`.
6. Signal Handling:
   - Handle `SIGINT` (Ctrl+C) via `tokio::signal::ctrl_c()`.
   - Send `POST /api/terminal/exec/:hostId/:taskId/kill` before exiting to terminate the remote task cleanly.

### 3.2 `gt hosts` ASCII Table Formatting
Output format matching Docker style:
```text
HOST ID        NAME           STATUS    PLATFORM    IP           LAST SEEN
my-server-01   production-1   online    linux       10.88.0.3    Just now
mac-node-02    dev-mac        online    darwin      192.168.1.5  Just now
ubuntu-backup  backup-srv     offline   linux       10.88.0.12   10m ago
```

---

## 4. Verification & Testing Plan

1. **Compilation Test**:
   - `cargo check --manifest-path agent-rs/Cargo.toml`: Ensure all types, dependencies, and modules compile with 0 warnings.
   - `cargo build --manifest-path agent-rs/Cargo.toml`: Build debug binary `agent-rs/target/debug/gt`.
2. **CLI Functionality Tests**:
   - `./agent-rs/target/debug/gt --help`
   - `./agent-rs/target/debug/gt --version`
   - `./agent-rs/target/debug/gt exec --help`
   - Test against running Gemini-Proxy server:
     - `./agent-rs/target/debug/gt hosts`
     - `./agent-rs/target/debug/gt exec <host> echo "Rust gt exec works"`
3. **Release Binary Verification**:
   - `cargo build --release --manifest-path agent-rs/Cargo.toml`
   - Verify binary size, strip status, and standalone execution.

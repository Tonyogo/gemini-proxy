# Design Doc: Fix Rust Agent Command Execution RPC Protocol Alignment

- **Date:** 2026-09-20
- **Topic:** Fix Remote Command Execution Failures on Rust Agent by Aligning CmdExec RPC Protocol Actions and Offset Slicing
- **Status:** Approved

## 1. Problem Statement & Root Cause

When remote terminal commands are executed via CLI (`gt exec`) or the Web Console targeting a Rust-based reverse agent daemon, the task fails immediately upon first poll.

### Root Cause Analysis:
1. **Action Name Mismatch**: The backend proxy (`TerminalExecService.getExecutionStatus`) sends RPC frames with `action: "poll"`, while `agent-rs/src/task/manager.rs` only handled `status`, `start`, `kill`, and `stream`, rejecting `"poll"` with `Unknown action: poll`.
2. **Missing `list` Action**: When querying tasks (`gt ps` / `/api/terminal/exec/:hostId`), the proxy sends `action: "list"`, which was completely unhandled in the Rust TaskManager.
3. **Missing Protocol Fields**: `CmdExecRequest` in `agent-rs/src/protocol/cmd_exec.rs` omitted `offset`, `limit`, and `signal`.
4. **Missing Incremental Log Offset Slicing**: The Rust TaskManager did not slice `stdout`/`stderr`/`output` by byte offset, and omitted `outputOffset`, `offset`, and `totalBytes` in responses, preventing the server and CLI from advancing log stream offsets.

---

## 2. Technical Design & Protocol Alignment

### 2.1 Protocol Request Structure (`agent-rs/src/protocol/cmd_exec.rs`)
```rust
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CmdExecRequest {
    #[serde(rename = "reqId")]
    pub req_id: Option<String>,
    pub action: String,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    pub command: Option<String>,
    pub cwd: Option<String>,
    #[serde(rename = "timeoutMs")]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub signal: Option<String>,
}
```

### 2.2 TaskManager Action Handlers (`agent-rs/src/task/manager.rs`)

1. **`action: "poll" | "status" | "stream"`**:
   - Accepts `offset: Option<usize>`.
   - Computes UTF-8 safe incremental slice of `stdout`, `stderr`, and `output` from `offset` to end of string.
   - Computes total byte length of output.
   - Response payload:
     ```json
     {
       "taskId": "...",
       "status": "running | completed | failed | killed | timeout",
       "exitCode": 0 | null,
       "stdout": "...",
       "stderr": "...",
       "output": "...",
       "offset": total_bytes,
       "outputOffset": total_bytes,
       "totalBytes": total_bytes,
       "durationMs": 1234,
       "startTime": 1726830000000,
       "endTime": 1726830001234
     }
     ```

2. **`action: "list"`**:
   - Accepts `limit: Option<usize>` (default 20, max 100).
   - Sorts tasks by `start_time` descending.
   - Returns `{ "tasks": [ ... ] }`.

3. **`action: "kill"`**:
   - Accepts `signal: Option<String>` (supports `SIGTERM` and `SIGKILL`).
   - Sends process group signal via `killpg`.

4. **`action: "start"`**:
   - Spawns child process in its own process group (`setpgid`).
   - Collects stdout/stderr asynchronously.

---

## 3. Testing & Verification

1. **Rust Unit Tests (`agent-rs/src/task/manager.rs`)**:
   - Test `poll` action with offset 0 and progressive offsets.
   - Test `list` action returning sorted tasks.
   - Test `kill` action on running and non-running tasks.
   - Test `start` action spawning commands.
2. **Integration Verification**:
   - Launch Rust agent against Gemini Proxy hub.
   - Run `gt exec <rust-node> "echo 'Rust Exec Working'"` and verify 0 error code, correct streaming stdout, and proper banner termination.
   - Run `gt ps <rust-node>` and verify task listing returns 200 with tasks array.

# Fix Rust Agent Command Execution RPC Protocol Alignment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix remote command execution failures on the Rust agent by adding support for `poll`, `list`, and signal-aware `kill` actions, adding `offset`/`limit`/`signal` to `CmdExecRequest`, and computing incremental log slices with `outputOffset`, `offset`, and `totalBytes`.

**Architecture:**
1. Protocol Layer (`agent-rs/src/protocol/cmd_exec.rs`): Extend `CmdExecRequest` with optional `offset: Option<usize>`, `limit: Option<usize>`, and `signal: Option<String>`. Define `TaskPollData` / `TaskListData` structures.
2. Execution Manager (`agent-rs/src/task/manager.rs`):
   - Route `poll`, `status`, and `stream` actions to `get_task_poll(task_id, offset)` which safely slices `stdout`, `stderr`, and `output` starting at byte `offset` along UTF-8 character boundaries, returning `outputOffset` / `totalBytes`.
   - Route `list` action to `list_tasks(limit)` returning recent tasks sorted by `start_time` descending.
   - Route `kill` action reading optional `signal` (`SIGTERM` / `SIGKILL`).
3. Unit & Integration Verification: Add Rust unit tests in `agent-rs/src/task/manager.rs` and verify execution with `cargo test`.

**Tech Stack:** Rust 2021, Tokio, Serde, Nix, Jest.

## Global Constraints
- **Cargo Toolchain Path**: Always invoke cargo via: `PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo ...`
- **Safe UTF-8 Slicing**: When slicing logs at a given byte `offset`, ensure slicing is clamped to valid UTF-8 character boundaries to prevent panics.
- **Protocol Parity**: Ensure response object fields match `scripts/terminal-agent.js` (`taskId`, `status`, `exitCode`, `stdout`, `stderr`, `output`, `offset`, `outputOffset`, `totalBytes`, `durationMs`, `startTime`, `endTime`).

---

### Task 1: Protocol Request & Response Schema Extension

**Files:**
- Modify: `agent-rs/src/protocol/cmd_exec.rs`
- Test: Verification via `cargo check`

**Interfaces:**
- Produces:
  - `CmdExecRequest`: `offset: Option<usize>`, `limit: Option<usize>`, `signal: Option<String>`.
  - `TaskPollData`: `{ task_id, status, exit_code, stdout, stderr, output, offset, output_offset, total_bytes, duration_ms, start_time, end_time }`.
  - `TaskListData`: `{ tasks: Vec<TaskSummaryItem> }`.

- [ ] **Step 1: Update `agent-rs/src/protocol/cmd_exec.rs`**

Update `agent-rs/src/protocol/cmd_exec.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CmdExecResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "reqId")]
    pub req_id: Option<String>,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    pub action: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl CmdExecResponse {
    pub fn success(req_id: Option<String>, task_id: Option<String>, action: String, data: serde_json::Value) -> Self {
        Self {
            msg_type: "cmd_exec_res".to_string(),
            req_id,
            task_id,
            action,
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(req_id: Option<String>, task_id: Option<String>, action: String, error: impl Into<String>) -> Self {
        Self {
            msg_type: "cmd_exec_res".to_string(),
            req_id,
            task_id,
            action,
            success: false,
            data: None,
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPollData {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub status: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub output: String,
    pub offset: usize,
    #[serde(rename = "outputOffset")]
    pub output_offset: usize,
    #[serde(rename = "totalBytes")]
    pub total_bytes: usize,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    #[serde(rename = "startTime")]
    pub start_time: u64,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSummaryItem {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "durationMs")]
    pub duration_ms: Option<u64>,
    #[serde(rename = "startTime")]
    pub start_time: u64,
    #[serde(rename = "endTime")]
    pub end_time: Option<u64>,
}
```

- [ ] **Step 2: Run compilation check**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo check --manifest-path agent-rs/Cargo.toml
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add agent-rs/src/protocol/cmd_exec.rs
git commit -m "feat(protocol): add offset, limit, signal fields to CmdExecRequest and define TaskPollData"
```

---

### Task 2: TaskManager Action Routing & Incremental Slicing

**Files:**
- Modify: `agent-rs/src/task/manager.rs`
- Test: Unit tests in `agent-rs/src/task/manager.rs`

**Interfaces:**
- Produces:
  - `TaskManager::handle_cmd_exec(&self, req: CmdExecRequest) -> CmdExecResponse` (handles `poll`, `status`, `stream`, `list`, `kill`, `start`).
  - `TaskManager::get_task_poll(&self, task_id: &str, offset: usize) -> Option<TaskPollData>`.
  - `TaskManager::list_tasks(&self, limit: usize) -> Vec<TaskSummaryItem>`.
  - `TaskManager::kill_task(&self, task_id: &str, signal: Option<&str>) -> Result<serde_json::Value, String>`.
  - Safe UTF-8 substring helper `slice_utf8_from_offset(s: &str, offset: usize) -> String`.

- [ ] **Step 1: Write unit tests for `TaskManager` in `agent-rs/src/task/manager.rs`**

Add tests to `agent-rs/src/task/manager.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_task_manager_start_poll_list_kill() {
        let tm = TaskManager::new();

        // 1. Start a task
        let start_req = CmdExecRequest {
            req_id: Some("req-1".into()),
            action: "start".into(),
            task_id: Some("task-test-1".into()),
            command: Some("echo 'hello world'".into()),
            cwd: None,
            timeout_ms: Some(10000),
            env: None,
            offset: None,
            limit: None,
            signal: None,
        };

        let start_res = tm.handle_cmd_exec(start_req).await;
        assert!(start_res.success);

        // Wait a short moment for echo to finish
        tokio::time::sleep(Duration::from_millis(200)).await;

        // 2. Poll action
        let poll_req = CmdExecRequest {
            req_id: Some("req-2".into()),
            action: "poll".into(),
            task_id: Some("task-test-1".into()),
            command: None,
            cwd: None,
            timeout_ms: None,
            env: None,
            offset: Some(0),
            limit: None,
            signal: None,
        };

        let poll_res = tm.handle_cmd_exec(poll_req).await;
        assert!(poll_res.success);
        let data = poll_res.data.expect("data present");
        let stdout = data.get("stdout").and_then(|v| v.as_str()).unwrap_or("");
        assert!(stdout.contains("hello world"));
        let total_bytes = data.get("totalBytes").and_then(|v| v.as_u64()).unwrap_or(0);
        assert!(total_bytes > 0);

        // 3. Poll with offset at end of stream should return empty slice
        let poll_req_2 = CmdExecRequest {
            req_id: Some("req-3".into()),
            action: "poll".into(),
            task_id: Some("task-test-1".into()),
            command: None,
            cwd: None,
            timeout_ms: None,
            env: None,
            offset: Some(total_bytes as usize),
            limit: None,
            signal: None,
        };
        let poll_res_2 = tm.handle_cmd_exec(poll_req_2).await;
        assert!(poll_res_2.success);
        let data_2 = poll_res_2.data.expect("data present");
        assert_eq!(data_2.get("stdout").and_then(|v| v.as_str()), Some(""));

        // 4. List tasks
        let list_req = CmdExecRequest {
            req_id: Some("req-4".into()),
            action: "list".into(),
            task_id: None,
            command: None,
            cwd: None,
            timeout_ms: None,
            env: None,
            offset: None,
            limit: Some(10),
            signal: None,
        };
        let list_res = tm.handle_cmd_exec(list_req).await;
        assert!(list_res.success);
        let list_data = list_res.data.expect("list data");
        let tasks = list_data.get("tasks").and_then(|v| v.as_array()).expect("tasks array");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].get("taskId").and_then(|v| v.as_str()), Some("task-test-1"));
    }
}
```

- [ ] **Step 2: Implement updated `TaskManager` in `agent-rs/src/task/manager.rs`**

Refactor `agent-rs/src/task/manager.rs`:
```rust
use crate::protocol::cmd_exec::{CmdExecRequest, CmdExecResponse, TaskPollData, TaskSummaryItem};
use nix::sys::signal::{killpg, Signal};
use nix::unistd::Pid;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::RwLock;
use tracing::warn;

const MAX_TASKS: usize = 100;
const MAX_BUFFER_SIZE: usize = 5 * 1024 * 1024; // 5 MB per stream
const TASK_TTL_MS: u64 = 24 * 60 * 60 * 1000; // 24 hours

#[derive(Debug, Clone)]
pub struct TaskRecord {
    pub task_id: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    pub exit_code: Option<i32>,
    pub start_time: u64,
    pub end_time: Option<u64>,
    pub stdout: String,
    pub stderr: String,
    pub output: String,
    pub pgid: Option<u32>,
}

#[derive(Clone)]
pub struct TaskManager {
    tasks: Arc<RwLock<HashMap<String, TaskRecord>>>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn handle_cmd_exec(&self, req: CmdExecRequest) -> CmdExecResponse {
        let req_id = req.req_id;
        let action = req.action.clone();
        let task_id = req.task_id.clone();

        match action.as_str() {
            "start" => {
                let tid = match task_id {
                    Some(id) if !id.is_empty() => id,
                    _ => format!("task_{}", current_time_ms()),
                };
                let command = req.command.unwrap_or_default();
                let cwd = req.cwd.unwrap_or_default();
                let timeout_ms = req.timeout_ms.unwrap_or(300000);
                let env = req.env.unwrap_or_default();

                match self.start_task(tid.clone(), command, cwd, timeout_ms, env).await {
                    Ok(data) => CmdExecResponse::success(req_id, Some(tid), action, data),
                    Err(e) => CmdExecResponse::error(req_id, Some(tid), action, e),
                }
            }
            "poll" | "status" | "stream" => {
                let tid = match task_id {
                    Some(id) => id,
                    None => return CmdExecResponse::error(req_id, None, action, "Missing taskId"),
                };
                let offset = req.offset.unwrap_or(0);
                match self.get_task_poll(&tid, offset).await {
                    Some(data) => CmdExecResponse::success(req_id, Some(tid), action, serde_json::to_value(data).unwrap()),
                    None => {
                        let err_msg = format!("Task not found: {}", tid);
                        CmdExecResponse::error(req_id, Some(tid), action, err_msg)
                    }
                }
            }
            "list" => {
                let limit = req.limit.unwrap_or(20);
                let tasks = self.list_tasks(limit).await;
                CmdExecResponse::success(req_id, task_id, action, serde_json::json!({ "tasks": tasks }))
            }
            "kill" => {
                let tid = match task_id {
                    Some(id) => id,
                    None => return CmdExecResponse::error(req_id, None, action, "Missing taskId"),
                };
                match self.kill_task(&tid, req.signal.as_deref()).await {
                    Ok(data) => CmdExecResponse::success(req_id, Some(tid), action, data),
                    Err(e) => CmdExecResponse::error(req_id, Some(tid), action, e),
                }
            }
            unknown => {
                let err_msg = format!("Unknown action: {}", unknown);
                CmdExecResponse::error(req_id, task_id, action, err_msg)
            }
        }
    }

    async fn prune_old_tasks(&self) {
        let now = current_time_ms();
        let mut tasks = self.tasks.write().await;

        tasks.retain(|_, task| {
            if task.status != "running" && (now - task.start_time > TASK_TTL_MS) {
                false
            } else {
                true
            }
        });

        if tasks.len() > MAX_TASKS {
            let mut non_running: Vec<(String, u64)> = tasks
                .iter()
                .filter(|(_, t)| t.status != "running")
                .map(|(k, t)| (k.clone(), t.start_time))
                .collect();
            non_running.sort_by_key(|(_, time)| *time);

            while tasks.len() > MAX_TASKS && !non_running.is_empty() {
                let (oldest_id, _) = non_running.remove(0);
                tasks.remove(&oldest_id);
            }
        }
    }

    async fn start_task(
        &self,
        task_id: String,
        command: String,
        cwd: String,
        timeout_ms: u64,
        extra_env: HashMap<String, String>,
    ) -> Result<serde_json::Value, String> {
        self.prune_old_tasks().await;

        {
            let tasks = self.tasks.read().await;
            if let Some(existing) = tasks.get(&task_id) {
                return Ok(serde_json::json!({
                    "success": true,
                    "taskId": task_id,
                    "status": existing.status,
                    "startTime": existing.start_time,
                }));
            }
        }

        let working_dir = if !cwd.is_empty() {
            cwd.clone()
        } else {
            std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
        };

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        let mut cmd = Command::new(&shell);
        cmd.arg("-c").arg(&command);
        cmd.current_dir(&working_dir);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        // Place child process into its own process group for clean killpg
        unsafe {
            cmd.pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            });
        }

        for (k, v) in extra_env {
            cmd.env(k, v);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if std::env::var_os("LANG").is_none() {
            cmd.env("LANG", "en_US.UTF-8");
        }
        cmd.env_remove("TMUX");
        cmd.env_remove("TMUX_PANE");
        cmd.env_remove("STY");
        cmd.env_remove("WINDOW");
        cmd.env_remove("TERM_SESSION_ID");

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let pgid = child.id().map(|id| id as u32);
        let start_time = current_time_ms();

        let initial_record = TaskRecord {
            task_id: task_id.clone(),
            command: command.clone(),
            cwd: working_dir,
            status: "running".to_string(),
            exit_code: None,
            start_time,
            end_time: None,
            stdout: String::new(),
            stderr: String::new(),
            output: String::new(),
            pgid,
        };

        {
            let mut tasks = self.tasks.write().await;
            tasks.insert(task_id.clone(), initial_record);
        }

        let stdout_pipe = child.stdout.take();
        let stderr_pipe = child.stderr.take();

        let tasks_ref = self.tasks.clone();
        let tid_for_out = task_id.clone();
        let tid_for_err = task_id.clone();

        if let Some(mut stdout) = stdout_pipe {
            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                while let Ok(n) = stdout.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    let mut tasks = tasks_ref.write().await;
                    if let Some(task) = tasks.get_mut(&tid_for_out) {
                        append_buffer(&mut task.stdout, &chunk);
                        append_buffer(&mut task.output, &chunk);
                    }
                }
            });
        }

        let tasks_ref_err = self.tasks.clone();
        if let Some(mut stderr) = stderr_pipe {
            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                while let Ok(n) = stderr.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    let mut tasks = tasks_ref_err.write().await;
                    if let Some(task) = tasks.get_mut(&tid_for_err) {
                        append_buffer(&mut task.stderr, &chunk);
                        append_buffer(&mut task.output, &chunk);
                    }
                }
            });
        }

        let tasks_ref_wait = self.tasks.clone();
        let tid_for_wait = task_id.clone();

        tokio::spawn(async move {
            let timeout_duration = Duration::from_millis(timeout_ms);
            let child_wait = child.wait();

            tokio::select! {
                res = child_wait => {
                    let mut tasks = tasks_ref_wait.write().await;
                    if let Some(task) = tasks.get_mut(&tid_for_wait) {
                        if task.status == "running" {
                            match res {
                                Ok(status) => {
                                    task.exit_code = status.code();
                                    task.status = if status.success() { "completed" } else { "failed" }.to_string();
                                }
                                Err(_) => {
                                    task.status = "failed".to_string();
                                }
                            }
                            task.end_time = Some(current_time_ms());
                        }
                    }
                }
                _ = tokio::time::sleep(timeout_duration) => {
                    warn!("[TaskManager] Task {} timed out after {}ms", tid_for_wait, timeout_ms);
                    if let Some(p) = pgid {
                        let _ = killpg(Pid::from_raw(p as i32), Signal::SIGTERM);
                    }
                    {
                        let mut tasks = tasks_ref_wait.write().await;
                        if let Some(task) = tasks.get_mut(&tid_for_wait) {
                            if task.status == "running" {
                                task.status = "timeout".to_string();
                                task.end_time = Some(current_time_ms());
                                task.stderr.push_str(&format!("\nTask timed out after {}ms\n", timeout_ms));
                                task.output.push_str(&format!("\nTask timed out after {}ms\n", timeout_ms));
                            }
                        }
                    }
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    if let Some(p) = pgid {
                        let _ = killpg(Pid::from_raw(p as i32), Signal::SIGKILL);
                    }
                    let _ = child.kill().await;
                }
            }
        });

        Ok(serde_json::json!({
            "success": true,
            "taskId": task_id,
            "status": "running",
            "startTime": start_time,
        }))
    }

    pub async fn get_task_poll(&self, task_id: &str, offset: usize) -> Option<TaskPollData> {
        let tasks = self.tasks.read().await;
        let t = tasks.get(task_id)?;

        let end_time = t.end_time;
        let duration_ms = end_time.map(|e| e.saturating_sub(t.start_time)).or_else(|| {
            Some(current_time_ms().saturating_sub(t.start_time))
        });

        let total_bytes = t.output.len();
        let stdout_slice = slice_utf8_from_offset(&t.stdout, offset);
        let stderr_slice = slice_utf8_from_offset(&t.stderr, offset);
        let output_slice = slice_utf8_from_offset(&t.output, offset);

        Some(TaskPollData {
            task_id: t.task_id.clone(),
            status: t.status.clone(),
            exit_code: t.exit_code,
            stdout: stdout_slice,
            stderr: stderr_slice,
            output: output_slice,
            offset: total_bytes,
            output_offset: total_bytes,
            total_bytes,
            duration_ms,
            start_time: t.start_time,
            end_time,
        })
    }

    pub async fn list_tasks(&self, limit: usize) -> Vec<TaskSummaryItem> {
        let tasks = self.tasks.read().await;
        let mut list: Vec<TaskSummaryItem> = tasks
            .values()
            .map(|t| {
                let duration_ms = t.end_time.map(|e| e.saturating_sub(t.start_time)).or_else(|| {
                    Some(current_time_ms().saturating_sub(t.start_time))
                });
                TaskSummaryItem {
                    task_id: t.task_id.clone(),
                    command: t.command.clone(),
                    cwd: t.cwd.clone(),
                    status: t.status.clone(),
                    exit_code: t.exit_code,
                    duration_ms,
                    start_time: t.start_time,
                    end_time: t.end_time,
                }
            })
            .collect();

        list.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        list.truncate(limit.clamp(1, 100));
        list
    }

    pub async fn kill_task(&self, task_id: &str, signal_name: Option<&str>) -> Result<serde_json::Value, String> {
        let mut tasks = self.tasks.write().await;
        let t = match tasks.get_mut(task_id) {
            Some(task) => task,
            None => return Err(format!("Task not found: {}", task_id)),
        };

        if t.status != "running" {
            return Ok(serde_json::json!({
                "taskId": task_id,
                "status": t.status,
                "message": format!("Task is not running (status: {})", t.status),
            }));
        }

        let sig = match signal_name {
            Some("SIGKILL") => Signal::SIGKILL,
            _ => Signal::SIGTERM,
        };

        if let Some(pgid) = t.pgid {
            let _ = killpg(Pid::from_raw(pgid as i32), sig);
            if sig == Signal::SIGTERM {
                tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    let _ = killpg(Pid::from_raw(pgid as i32), Signal::SIGKILL);
                });
            }
        }

        t.status = "killed".to_string();
        t.end_time = Some(current_time_ms());

        Ok(serde_json::json!({
            "taskId": task_id,
            "status": "killed",
        }))
    }
}

fn slice_utf8_from_offset(s: &str, offset: usize) -> String {
    if offset >= s.len() {
        return String::new();
    }
    // Find closest character boundary >= offset
    let start = s
        .char_indices()
        .map(|(i, _)| i)
        .find(|&i| i >= offset)
        .unwrap_or(s.len());
    s[start..].to_string()
}

fn append_buffer(buf: &mut String, chunk: &str) {
    buf.push_str(chunk);
    if buf.len() > MAX_BUFFER_SIZE {
        let overflow = buf.len() - MAX_BUFFER_SIZE;
        let start = buf
            .char_indices()
            .map(|(i, _)| i)
            .find(|&i| i >= overflow)
            .unwrap_or(overflow);
        *buf = buf[start..].to_string();
    }
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
```

- [ ] **Step 3: Run Rust unit tests to verify protocol alignment**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo test --manifest-path agent-rs/Cargo.toml task::manager::tests
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add agent-rs/src/task/manager.rs
git commit -m "fix(rust): align TaskManager with poll, list, kill RPC actions and UTF-8 incremental slicing"
```

---

### Task 3: Full End-to-End Build and Verification

**Files:**
- Test: `tests/terminalHostManagerCmdRpc.test.ts`
- Full test suite & release build

- [ ] **Step 1: Run all existing TypeScript backend terminal tests**

Run:
```bash
npm test tests/terminalHostManagerCmdRpc.test.ts tests/terminalAgentCommandExec.test.ts
```
Expected: PASS.

- [ ] **Step 2: Build release binary for `gt`**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo build --release --manifest-path agent-rs/Cargo.toml
```
Expected: Compiles stripped, optimized binary at `agent-rs/target/release/gt`.

- [ ] **Step 3: Run full Rust and Node test suites**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo test --manifest-path agent-rs/Cargo.toml
npm test
```
Expected: 100% tests pass.

- [ ] **Step 4: Commit**

```bash
git status
git commit -m "chore: complete Rust agent cmd_exec RPC protocol alignment and tests"
```

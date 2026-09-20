# Native Rust Implementation for `gt` Unified CLI Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `agent-rs` into a unified, high-performance, single-file static binary `gt` that implements the Docker-style terminal CLI (`hosts`, `exec`, `ps`, `logs`, `kill`, `agent`) using `clap`, `reqwest`, and `rustls 0.23`.

**Architecture:**
1. Cargo Configuration: Rename package to `gt` and add `reqwest` with `rustls-tls-native-roots` (zero OpenSSL dependencies).
2. Command Definitions (`agent-rs/src/cli.rs`): `clap` models for global options (`--server`, `--key`, `--json`) and subcommands (`hosts`, `exec`, `ps`, `logs`, `kill`, `agent`).
3. HTTP Client Engine (`agent-rs/src/client.rs`): REST client handling node discovery (`hosts`), task management (`ps`, `logs`, `kill`), and live streaming command execution (`exec`) with execution banners (`>>>` and `<<<`), Ctrl+C remote process termination, and exit-code forwarding.
4. Main Dispatcher (`agent-rs/src/main.rs`): Installs `rustls` ring crypto provider, parses `Cli`, routes `Commands::Agent` to existing reverse WebSocket tunnel daemon and routes other commands to `client.rs`.

**Tech Stack:** Rust (Edition 2021), Tokio, Reqwest 0.12, Clap 4.5, Rustls 0.23, Nix, Serde.

## Global Constraints
- **Zero OpenSSL Dynamic Dependencies**: Use `rustls-tls-native-roots` in `reqwest` to maintain portable static linking.
- **Cargo Toolchain Path**: In bash commands, invoke cargo with: `PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo ...`
- **Output Channel Separation**: All diagnostics and banners (`>>>`, `<<<`) must be written to `stderr`; stdout contains only actual command payload or `--json` output.
- **Exit Code Integrity**: `gt exec` must exit with the remote command's actual `exitCode` via `std::process::exit(code)`.

---

### Task 1: Cargo Package Renaming & Dependencies Setup

**Files:**
- Modify: `agent-rs/Cargo.toml`
- Test: Compilation check via `cargo check`

**Interfaces:**
- Produces: Package `gt` with `reqwest` dependency and `[[bin]] name = "gt"`.

- [x] **Step 1: Update `agent-rs/Cargo.toml`**

Update `agent-rs/Cargo.toml`:
```toml
[package]
name = "gt"
version = "1.0.0"
edition = "2021"
description = "Gemini Terminal (gt) - Unified Docker-Style Terminal CLI and Reverse Agent"

[[bin]]
name = "gt"
path = "src/main.rs"

[dependencies]
tokio = { version = "1.38", features = ["full"] }
tokio-tungstenite = { version = "0.23", features = ["rustls-tls-webpki-roots"] }
rustls = { version = "0.23", default-features = false, features = ["ring", "std"] }
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls-native-roots"] }
clap = { version = "4.5", features = ["derive", "env"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
base64 = "0.22"
url = "2.5"
chrono = "0.4"
nix = { version = "0.29", features = ["term", "process", "signal", "fs", "ioctl", "poll", "net", "hostname"] }
libc = "0.2"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

- [x] **Step 2: Verify compilation and dependency resolution**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo check --manifest-path agent-rs/Cargo.toml
```
Expected: PASS (resolves `reqwest` without error).

- [x] **Step 3: Commit**

```bash
git add agent-rs/Cargo.toml
git commit -m "feat(rust): configure gt package and add reqwest dependency"
```

---

### Task 2: CLI Model & Subcommand Parser (`agent-rs/src/cli.rs`)

**Files:**
- Create: `agent-rs/src/cli.rs`
- Modify: `agent-rs/src/main.rs`
- Test: Verification via `cargo check` and CLI tests

**Interfaces:**
- Produces:
  - `Cli` struct with global options (`server`, `key`, `json`).
  - `Commands` enum: `Hosts`, `Exec(ExecArgs)`, `Ps { host }`, `Logs { host, task_id }`, `Kill { host, task_id }`, `Agent(AgentArgs)`.
  - `ExecArgs` with `host`, `workdir`, `detach`, `timeout`, `quiet`, `env`, `command`.
  - `AgentArgs` with `id`, `name`, `shell`.

- [x] **Step 1: Create `agent-rs/src/cli.rs`**

Write `agent-rs/src/cli.rs`:
```rust
use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug, Clone)]
#[command(name = "gt")]
#[command(author = "Gemini Proxy Team")]
#[command(version = "1.0.0")]
#[command(about = "gt (Gemini Terminal) - Unified Docker-Style Terminal CLI and Reverse Agent", long_about = None)]
pub struct Cli {
    /// Remote Gemini Proxy server target URL
    #[arg(short, long, global = true, env = "TERMINAL_SERVER", default_value = "http://localhost:3000")]
    pub server: String,

    /// Admin secret key for authentication
    #[arg(short, long, global = true, env = "ADMIN_SECRET_KEY", default_value = "")]
    pub key: String,

    /// Output responses in structured JSON format
    #[arg(long, global = true)]
    pub json: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// List connected terminal agent hosts (like 'docker node ls')
    Hosts,

    /// Execute a command on a remote host (like 'docker exec')
    Exec(ExecArgs),

    /// List active and recent tasks on a host (like 'docker ps')
    Ps {
        /// Target host ID
        host: String,
    },

    /// View execution logs for a task (like 'docker logs')
    Logs {
        /// Target host ID
        host: String,
        /// Task ID
        task_id: String,
    },

    /// Terminate a running task on a host (like 'docker kill')
    Kill {
        /// Target host ID
        host: String,
        /// Task ID
        task_id: String,
    },

    /// Run reverse terminal agent daemon on this machine
    Agent(AgentArgs),
}

#[derive(Args, Debug, Clone)]
pub struct ExecArgs {
    /// Target host ID
    pub host: String,

    /// Remote working directory (alias: --cwd)
    #[arg(short = 'w', long = "workdir", alias = "cwd")]
    pub workdir: Option<String>,

    /// Run command in background and print task ID (like 'docker exec -d')
    #[arg(short = 'd', long = "detach")]
    pub detach: bool,

    /// Execution timeout in ms (default: 300000 / 5 min)
    #[arg(short = 't', long = "timeout", default_value_t = 300000)]
    pub timeout: u64,

    /// Suppress execution header and footer banners
    #[arg(short = 'q', long = "quiet")]
    pub quiet: bool,

    /// Remote environment variables (KEY=VAL)
    #[arg(short = 'e', long = "env")]
    pub env: Vec<String>,

    /// Polling interval for live log stream in ms
    #[arg(long = "poll-interval", default_value_t = 500)]
    pub poll_interval: u64,

    /// Command and arguments to execute
    #[arg(trailing_var_arg = true, required = true)]
    pub command: Vec<String>,
}

#[derive(Args, Debug, Clone)]
pub struct AgentArgs {
    /// Explicit unique Host ID (defaults to <hostname>-<local_ip>)
    #[arg(long, env = "HOST_ID")]
    pub id: Option<String>,

    /// Friendly host name (defaults to hostname)
    #[arg(long, env = "HOST_NAME")]
    pub name: Option<String>,

    /// Shell executable to spawn (defaults to /bin/bash or $SHELL)
    #[arg(long, env = "SHELL")]
    pub shell: Option<String>,
}
```

- [x] **Step 2: Register module in `agent-rs/src/main.rs`**

Add `mod cli;` and compile check.

- [x] **Step 3: Run compilation check**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo check --manifest-path agent-rs/Cargo.toml
```
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add agent-rs/src/cli.rs agent-rs/src/main.rs
git commit -m "feat(rust): define Docker-style CLI commands and arguments for gt"
```

---

### Task 3: Client HTTP Implementation (`agent-rs/src/client.rs`)

**Files:**
- Create: `agent-rs/src/client.rs`
- Modify: `agent-rs/src/main.rs`

**Interfaces:**
- Produces:
  - `pub async fn run_hosts(server: &str, key: &str, json: bool) -> i32`
  - `pub async fn run_ps(server: &str, key: &str, host: &str, json: bool) -> i32`
  - `pub async fn run_logs(server: &str, key: &str, host: &str, task_id: &str, json: bool) -> i32`
  - `pub async fn run_kill(server: &str, key: &str, host: &str, task_id: &str, json: bool) -> i32`
  - `pub async fn run_exec(server: &str, key: &str, args: ExecArgs, json: bool) -> i32`

- [x] **Step 1: Implement `agent-rs/src/client.rs`**

Write `agent-rs/src/client.rs`:
```rust
use crate::cli::ExecArgs;
use chrono::{DateTime, Local};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{self, Write};
use std::time::{Duration, Instant};

#[derive(Deserialize, Serialize, Debug)]
pub struct ManagedHost {
    pub id: Option<String>,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub status: Option<String>,
    pub platform: Option<String>,
    pub ip: Option<String>,
    #[serde(rename = "lastSeen")]
    pub last_seen: Option<i64>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct HostsResponse {
    pub hosts: Option<Vec<ManagedHost>>,
    pub error: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct ExecStartResponse {
    pub success: bool,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct ExecStatusResponse {
    pub success: bool,
    pub status: Option<String>,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub output: Option<String>,
    #[serde(rename = "outputOffset")]
    pub output_offset: Option<usize>,
    pub error: Option<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct TaskSummary {
    #[serde(rename = "taskId")]
    pub task_id: String,
    pub status: String,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    #[serde(rename = "startTime")]
    pub start_time: i64,
    pub command: String,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct PsResponse {
    pub success: bool,
    pub tasks: Option<Vec<TaskSummary>>,
    pub error: Option<String>,
}

fn build_client(key: &str) -> (reqwest::Client, HeaderMap) {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if !key.is_empty() {
        if let Ok(val) = HeaderValue::from_str(key) {
            headers.insert("x-admin-key", val);
        }
    }
    let client = reqwest::Client::builder()
        .default_headers(headers.clone())
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    (client, headers)
}

fn format_relative_time(timestamp: Option<i64>) -> String {
    let ts = match timestamp {
        Some(t) => t,
        None => return "Never".to_string(),
    };
    let now = chrono::Utc::now().timestamp_millis();
    let diff = now - ts;
    if diff < 10000 {
        "Just now".to_string()
    } else if diff < 60000 {
        format!("{}s ago", diff / 1000)
    } else if diff < 3600000 {
        format!("{}m ago", diff / 60000)
    } else if diff < 86400000 {
        format!("{}h ago", diff / 3600000)
    } else {
        format!("{}d ago", diff / 86400000)
    }
}

pub async fn run_hosts(server: &str, key: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let url = format!("{}/api/terminal/hosts", server.trim_end_matches('/'));

    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to query hosts: {}", e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: HostsResponse = match res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse response: {}", e);
            return 1;
        }
    };

    if let Some(err) = resp.error {
        eprintln!("Error: {}", err);
        return 1;
    }

    let hosts = resp.hosts.unwrap_or_default();
    if hosts.is_empty() {
        println!("No connected terminal agent hosts found.");
        return 0;
    }

    println!(
        "{:<20}{:<20}{:<12}{:<12}{:<18}{}",
        "HOST ID", "NAME", "STATUS", "PLATFORM", "IP", "LAST SEEN"
    );
    println!("{}", "-".repeat(90));

    for h in hosts {
        let host_id = h.id.unwrap_or_default();
        let name = h.name.or(h.hostname).unwrap_or_default();
        let status = h.status.unwrap_or_else(|| "offline".to_string());
        let platform = h.platform.unwrap_or_default();
        let ip = h.ip.unwrap_or_default();
        let seen = format_relative_time(h.last_seen);

        println!(
            "{:<20}{:<20}{:<12}{:<12}{:<18}{}",
            host_id, name, status, platform, ip, seen
        );
    }
    0
}

pub async fn run_ps(server: &str, key: &str, host: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let url = format!("{}/api/terminal/exec/{}", server.trim_end_matches('/'), host);

    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to list tasks on [{}]: {}", host, e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: PsResponse = match res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse response: {}", e);
            return 1;
        }
    };

    if !resp.success {
        eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
        return 1;
    }

    let tasks = resp.tasks.unwrap_or_default();
    if tasks.is_empty() {
        println!("No recent tasks recorded on [{}].", host);
        return 0;
    }

    println!(
        "{:<26}{:<12}{:<8}{:<14}{}",
        "TASK ID", "STATUS", "EXIT", "START TIME", "COMMAND"
    );
    println!("{}", "-".repeat(80));

    for t in tasks {
        let exit_str = t.exit_code.map(|c| c.to_string()).unwrap_or_else(|| "-".into());
        let d = DateTime::from_timestamp_millis(t.start_time).unwrap_or_default();
        let local_d: DateTime<Local> = DateTime::from(d);
        let time_str = local_d.format("%H:%M:%S").to_string();

        println!(
            "{:<26}{:<12}{:<8}{:<14}{}",
            t.task_id, t.status, exit_str, time_str, t.command
        );
    }
    0
}

pub async fn run_logs(server: &str, key: &str, host: &str, task_id: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let url = format!(
        "{}/api/terminal/exec/{}/{}",
        server.trim_end_matches('/'),
        host,
        task_id
    );

    let res = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to get logs for [{}]: {}", task_id, e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: ExecStatusResponse = match res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse response: {}", e);
            return 1;
        }
    };

    if !resp.success {
        eprintln!("Error: {}", resp.error.unwrap_or_else(|| "Unknown error".into()));
        return 1;
    }

    println!("Task:     {}", task_id);
    println!("Host:     {}", host);
    println!("Status:   {}", resp.status.unwrap_or_default());
    println!(
        "ExitCode: {}",
        resp.exit_code.map(|c| c.to_string()).unwrap_or_else(|| "N/A".into())
    );

    if let Some(out) = resp.output {
        println!("\n--- Output ---");
        print!("{}", out);
        if !out.ends_with('\n') {
            println!();
        }
    }
    0
}

pub async fn run_kill(server: &str, key: &str, host: &str, task_id: &str, json: bool) -> i32 {
    let (client, _) = build_client(key);
    let url = format!(
        "{}/api/terminal/exec/{}/{}/kill",
        server.trim_end_matches('/'),
        host,
        task_id
    );

    let mut body = HashMap::new();
    body.insert("signal", "SIGTERM");

    let res = match client.post(&url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to kill task [{}]: {}", task_id, e);
            return 1;
        }
    };

    if json {
        let val: Value = res.json().await.unwrap_or_else(|_| Value::Null);
        println!("{}", serde_json::to_string_pretty(&val).unwrap());
        return 0;
    }

    let resp: Value = res.json().await.unwrap_or_else(|_| Value::Null);
    if resp.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        println!("Kill signal sent to task [{}] on host [{}].", task_id, host);
        0
    } else {
        eprintln!(
            "Error: {}",
            resp.get("error").and_then(|v| v.as_str()).unwrap_or("Failed to kill task")
        );
        1
    }
}

pub async fn run_exec(server: &str, key: &str, args: ExecArgs, json: bool) -> i32 {
    let host = args.host.trim();
    let full_command = args.command.join(" ");
    if full_command.trim().is_empty() {
        eprintln!("Error: Missing command to execute.");
        return 1;
    }

    let (client, _) = build_client(key);
    let start_url = format!("{}/api/terminal/exec/{}", server.trim_end_matches('/'), host);

    let mut env_map = HashMap::new();
    for e in args.env {
        if let Some((k, v)) = e.split_once('=') {
            env_map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }

    #[derive(Serialize)]
    struct StartBody<'a> {
        command: &'a str,
        cwd: Option<&'a str>,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
        env: HashMap<String, String>,
    }

    let body = StartBody {
        command: &full_command,
        cwd: args.workdir.as_deref(),
        timeout_ms: args.timeout,
        env: env_map,
    };

    let start_instant = Instant::now();

    if !args.quiet {
        eprintln!(">>> [{}] $ {}", host, full_command);
    }

    let start_res = match client.post(&start_url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to connect to proxy: {}", e);
            return 1;
        }
    };

    let start_data: ExecStartResponse = match start_res.json().await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Failed to parse start response: {}", e);
            return 1;
        }
    };

    if !start_data.success {
        eprintln!(
            "Error starting task on [{}]: {}",
            host,
            start_data.error.unwrap_or_else(|| "Unknown error".into())
        );
        return 1;
    }

    let task_id = match start_data.task_id {
        Some(id) => id,
        None => {
            eprintln!("Server did not return a taskId.");
            return 1;
        }
    };

    if args.detach {
        if json {
            let mut res_obj = HashMap::new();
            res_obj.insert("success", Value::Bool(true));
            res_obj.insert("taskId", Value::String(task_id));
            println!("{}", serde_json::to_string_pretty(&res_obj).unwrap());
        } else {
            println!("{}", task_id);
        }
        return 0;
    }

    // Ctrl+C cancellation handler
    let cancel_client = client.clone();
    let cancel_url = format!(
        "{}/api/terminal/exec/{}/{}/kill",
        server.trim_end_matches('/'),
        host,
        task_id
    );
    let cancel_host = host.to_string();
    let cancel_task = task_id.clone();

    tokio::spawn(async move {
        if let Ok(()) = tokio::signal::ctrl_c().await {
            eprintln!("\n[Interrupted] Terminating remote task [{}]...", cancel_task);
            let mut b = HashMap::new();
            b.insert("signal", "SIGTERM");
            let _ = cancel_client.post(&cancel_url).json(&b).send().await;
            eprintln!("\n<<< [{}] Terminated by user.", cancel_host);
            std::process::exit(130);
        }
    });

    // Output polling loop
    let mut offset = 0usize;
    let mut consecutive_errors = 0;
    let poll_interval = Duration::from_millis(args.poll_interval);

    loop {
        let poll_url = format!(
            "{}/api/terminal/exec/{}/{}?offset={}",
            server.trim_end_matches('/'),
            host,
            task_id,
            offset
        );

        match client.get(&poll_url).send().await {
            Ok(res) => {
                if let Ok(status_data) = res.json::<ExecStatusResponse>().await {
                    if status_data.success {
                        consecutive_errors = 0;

                        if let Some(ref stdout) = status_data.stdout {
                            if !stdout.is_empty() {
                                print!("{}", stdout);
                                let _ = io::stdout().flush();
                            }
                        }

                        if let Some(ref stderr) = status_data.stderr {
                            if !stderr.is_empty() {
                                eprint!("{}", stderr);
                                let _ = io::stderr().flush();
                            }
                        }

                        if let Some(new_offset) = status_data.output_offset {
                            offset = new_offset;
                        }

                        let status = status_data.status.unwrap_or_else(|| "running".into());
                        if status != "running" {
                            let duration = start_instant.elapsed().as_secs_f64();
                            let exit_code = status_data.exit_code.unwrap_or(if status == "completed" { 0 } else { 1 });

                            if !args.quiet {
                                if exit_code == 0 {
                                    eprintln!(
                                        "<<< [{}] Command completed with code 0 (took {:.2}s)",
                                        host, duration
                                    );
                                } else {
                                    eprintln!(
                                        "<<< [{}] Command failed with code {} ({}, took {:.2}s)",
                                        host, exit_code, status, duration
                                    );
                                }
                            }
                            return exit_code;
                        }
                    } else {
                        consecutive_errors += 1;
                    }
                } else {
                    consecutive_errors += 1;
                }
            }
            Err(_) => {
                consecutive_errors += 1;
            }
        }

        if consecutive_errors >= 5 {
            eprintln!(
                "\n<<< [{}] Connection lost while streaming task [{}]. Aborting.",
                host, task_id
            );
            return 1;
        }

        tokio::time::sleep(poll_interval).await;
    }
}
```

- [x] **Step 2: Run compilation check**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo check --manifest-path agent-rs/Cargo.toml
```
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add agent-rs/src/client.rs
git commit -m "feat(rust): implement client REST operations and streaming execution"
```

---

### Task 4: Main Entry Point & Agent Integration (`agent-rs/src/main.rs`)

**Files:**
- Modify: `agent-rs/src/main.rs`
- Modify: `agent-rs/src/config.rs`

**Interfaces:**
- Consumes: `cli::Cli`, `client`, `ws::TerminalAgentClient`.
- Produces: Executable `gt` that routes subcommands (`hosts`, `exec`, `ps`, `logs`, `kill`) or runs the reverse WebSocket daemon on `agent`.

- [x] **Step 1: Update `agent-rs/src/main.rs`**

Refactor `agent-rs/src/main.rs`:
```rust
mod cli;
mod client;
mod config;
mod protocol;
mod pty;
mod rpc;
mod task;
mod ws;

use clap::Parser;
use cli::{Cli, Commands};
use config::Config;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use task::TaskManager;
use tracing::info;
use tracing_subscriber::FmtSubscriber;
use ws::TerminalAgentClient;

#[tokio::main]
async fn main() {
    // Install default rustls crypto provider (ring) to support wss/https connections
    let _ = rustls::crypto::ring::default_provider().install_default();

    let cli = Cli::parse();

    match cli.command {
        Commands::Hosts => {
            let code = client::run_hosts(&cli.server, &cli.key, cli.json).await;
            std::process::exit(code);
        }
        Commands::Exec(args) => {
            let code = client::run_exec(&cli.server, &cli.key, args, cli.json).await;
            std::process::exit(code);
        }
        Commands::Ps { host } => {
            let code = client::run_ps(&cli.server, &cli.key, &host, cli.json).await;
            std::process::exit(code);
        }
        Commands::Logs { host, task_id } => {
            let code = client::run_logs(&cli.server, &cli.key, &host, &task_id, cli.json).await;
            std::process::exit(code);
        }
        Commands::Kill { host, task_id } => {
            let code = client::run_kill(&cli.server, &cli.key, &host, &task_id, cli.json).await;
            std::process::exit(code);
        }
        Commands::Agent(agent_args) => {
            // Initialize tracing logger for Agent daemon
            let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

            let subscriber = FmtSubscriber::builder()
                .with_env_filter(env_filter)
                .with_target(false)
                .without_time()
                .finish();

            let _ = tracing::subscriber::set_global_default(subscriber);

            let agent_config = Config {
                server: cli.server,
                key: cli.key,
                id: agent_args.id,
                name: agent_args.name,
                shell: agent_args.shell,
            };

            let host_id = agent_config.get_host_id();
            let host_name = agent_config.get_host_name();
            let hostname = agent_config.get_hostname();
            let local_ip = agent_config.get_local_ip();
            let platform = std::env::consts::OS;

            println!("---------------------------------------------------------");
            println!(" Gemini Proxy Terminal Reverse Agent (gt agent)");
            println!(" Host ID   : {}", host_id);
            println!(" Host Name : {} ({})", host_name, hostname);
            println!(" IP / OS   : {} / {}", local_ip, platform);
            println!(" Target Hub: {}", agent_config.server);
            println!("---------------------------------------------------------");

            let task_manager = TaskManager::new();
            let shutdown = Arc::new(AtomicBool::new(false));

            // Listen for SIGINT and SIGTERM for graceful exit
            let shutdown_signal = shutdown.clone();
            tokio::spawn(async move {
                let mut sigint = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt()).unwrap();
                let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();

                tokio::select! {
                    _ = sigint.recv() => {
                        info!("[Agent] Received SIGINT. Shutting down...");
                    }
                    _ = sigterm.recv() => {
                        info!("[Agent] Received SIGTERM. Shutting down...");
                    }
                }
                shutdown_signal.store(true, Ordering::SeqCst);
            });

            let client = TerminalAgentClient::new(agent_config, task_manager, shutdown);
            client.run_loop().await;

            println!("[Agent] Goodbye!");
        }
    }
}
```

- [x] **Step 2: Build debug binary**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo build --manifest-path agent-rs/Cargo.toml
```
Expected: Produces executable binary at `agent-rs/target/debug/gt`.

- [x] **Step 3: Test binary invocation**

Run:
```bash
./agent-rs/target/debug/gt --help
./agent-rs/target/debug/gt --version
```
Expected: Displays `gt` version `1.0.0` and subcommand listing.

- [x] **Step 4: Commit**

```bash
git add agent-rs/src/main.rs
git commit -m "feat(rust): integrate main CLI dispatcher for client commands and agent daemon"
```

---

### Task 5: Integration Testing & Production Build

**Files:**
- Create: `tests/gtRustCli.test.ts`
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [x] **Step 1: Write integration tests in `tests/gtRustCli.test.ts`**

Create `tests/gtRustCli.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';
import http from 'http';

const rustGtPath = path.resolve(__dirname, '../agent-rs/target/debug/gt');

function runRustGt(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(rustGtPath, args, {
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error.code ?? 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString()
      });
    });
  });
}

describe('Rust gt Binary Integration', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && url.pathname === '/api/terminal/hosts') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          hosts: [
            { id: 'node-rust', name: 'rust-srv', status: 'online', platform: 'linux', ip: '10.0.0.5', lastSeen: Date.now() }
          ]
        }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/node-rust') {
        res.statusCode = 202;
        res.end(JSON.stringify({ success: true, taskId: 'task-rust-1' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-rust/task-rust-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          status: 'completed',
          exitCode: 0,
          stdout: 'Rust Exec OK\n',
          stderr: '',
          outputOffset: 13,
        }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('prints hosts from Rust binary', async () => {
    const res = await runRustGt(['--server', `http://localhost:${serverPort}`, 'hosts']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('node-rust');
    expect(res.stdout).toContain('online');
  });

  it('streams exec output and exits with code 0 from Rust binary', async () => {
    const res = await runRustGt(['--server', `http://localhost:${serverPort}`, 'exec', 'node-rust', 'echo 1']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('Rust Exec OK\n');
    expect(res.stderr).toContain('>>> [node-rust] $ echo 1');
    expect(res.stderr).toContain('<<< [node-rust] Command completed with code 0');
  });

  it('suppresses banners with -q', async () => {
    const res = await runRustGt(['--server', `http://localhost:${serverPort}`, 'exec', '-q', 'node-rust', 'echo 1']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('Rust Exec OK\n');
    expect(res.stderr).toBe('');
  });
});
```

- [x] **Step 2: Run test to verify integration**

Run: `npx jest tests/gtRustCli.test.ts`
Expected: PASS.

- [x] **Step 3: Update `package.json` build scripts**

In `package.json`:
- Update `"build:agent"`: `"cd agent-rs && cargo build --release"`
- Update `"agent:rs"`: `"./agent-rs/target/release/gt agent"`

- [x] **Step 4: Build release binary**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo build --release --manifest-path agent-rs/Cargo.toml
```
Expected: Compiles stripped, optimized release binary to `agent-rs/target/release/gt`.

- [x] **Step 5: Run full test suite to ensure 0 regressions**

Run: `npm test`
Expected: 100% test suites pass.

- [x] **Step 6: Commit**

```bash
git add tests/gtRustCli.test.ts package.json CLAUDE.md
git commit -m "feat(rust): complete gt native Rust binary implementation and tests"
```

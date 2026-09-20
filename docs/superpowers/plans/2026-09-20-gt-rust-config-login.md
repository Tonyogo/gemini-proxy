# Native Rust `gt` Config Persistence & Login Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement persistent configuration storage in `~/.gt/config.json` with Unix 0600 permissions, provide `gt login`, `gt logout`, and `gt config` subcommands with pre-flight authentication verification, and resolve server/key across all operational commands so `--server` and `--key` are no longer required on the command line.

**Architecture:**
1. Configuration Engine (`agent-rs/src/config_store.rs`): Handles atomic file read/writes to `~/.gt/config.json`, enforces 0700 directory and 0600 file permissions on Unix, masks secret keys for display, and applies strict resolution hierarchy: `CLI option > Environment variable > Persistent config > Default fallback`.
2. CLI Command Definitions (`agent-rs/src/cli.rs`): Extends `clap` subcommands with `Login`, `Logout`, and `Config` (`List`, `Get`, `Set`), while making global `--server` and `--key` optional overrides.
3. Client Subsystem (`agent-rs/src/client.rs`): Implements `run_login` (with pre-flight verification against `/api/terminal/hosts`), `run_logout`, and `run_config`, while injecting resolved credentials into `hosts`, `exec`, `ps`, `logs`, and `kill`.
4. Entry Dispatcher (`agent-rs/src/main.rs`): Routes commands and exits with appropriate status codes.

**Tech Stack:** Rust 2021, Tokio, Reqwest 0.12 (rustls-tls), Clap 4.5, Serde/Serde_json, Dirs 5.0, Nix, Chrono.

## Global Constraints
- **Cargo Toolchain Path**: Always invoke cargo in bash via: `PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo ...`
- **Zero OpenSSL Dynamic Dependencies**: Maintain pure Rust TLS via `rustls-tls-native-roots`.
- **Strict File Permissions**: Ensure `~/.gt` is `0700` and `~/.gt/config.json` is `0600` on Unix systems.
- **Pre-flight Validation**: `gt login` must verify credentials against `GET /api/terminal/hosts` before persisting to disk; invalid keys (401) must fail with exit code 1 without saving.
- **Output Channel Separation**: Informational messages and banners go to `stderr` or formatted `stdout`; errors go to `stderr`.

---

### Task 1: Cargo Dependencies & ConfigStore Module

**Files:**
- Modify: `agent-rs/Cargo.toml`
- Create: `agent-rs/src/config_store.rs`
- Test: Unit tests in `agent-rs/src/config_store.rs`

**Interfaces:**
- Produces:
  - `pub struct ConfigStore { pub server: Option<String>, pub key: Option<String> }`
  - `ConfigStore::load() -> Self`
  - `ConfigStore::save(&self) -> io::Result<()>`
  - `ConfigStore::clear() -> io::Result<()>`
  - `ConfigStore::resolve_server(cli: Option<&str>, env_val: Option<&str>, stored: Option<&str>) -> String`
  - `ConfigStore::resolve_key(cli: Option<&str>, env_val: Option<&str>, stored: Option<&str>) -> String`
  - `ConfigStore::mask_key(key: &str) -> String`

- [x] **Step 1: Add `dirs` crate to `agent-rs/Cargo.toml`**

Add `dirs = "5.0"` under `[dependencies]` in `agent-rs/Cargo.toml`.

- [x] **Step 2: Write failing unit test for `ConfigStore`**

In `agent-rs/src/config_store.rs`, create the module with unit tests covering:
- Resolution precedence (`CLI > ENV > Stored > Default`)
- Key masking (`AIzaSy***7890`)
- Path resolution in home directory

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key() {
        assert_eq!(ConfigStore::mask_key(""), "");
        assert_eq!(ConfigStore::mask_key("short"), "***");
        assert_eq!(ConfigStore::mask_key("AIzaSy1234567890"), "AIzaSy***7890");
    }

    #[test]
    fn test_resolve_server_precedence() {
        // CLI wins over everything
        assert_eq!(
            ConfigStore::resolve_server(Some("http://cli:3000"), Some("http://env:3000"), Some("http://file:3000")),
            "http://cli:3000"
        );
        // ENV wins over File
        assert_eq!(
            ConfigStore::resolve_server(None, Some("http://env:3000"), Some("http://file:3000")),
            "http://env:3000"
        );
        // File wins over Default
        assert_eq!(
            ConfigStore::resolve_server(None, None, Some("http://file:3000")),
            "http://file:3000"
        );
        // Default fallback
        assert_eq!(
            ConfigStore::resolve_server(None, None, None),
            "http://localhost:3000"
        );
    }

    #[test]
    fn test_resolve_key_precedence() {
        assert_eq!(
            ConfigStore::resolve_key(Some("cli-key"), Some("env-key"), Some("file-key")),
            "cli-key"
        );
        assert_eq!(
            ConfigStore::resolve_key(None, Some("env-key"), Some("file-key")),
            "env-key"
        );
        assert_eq!(
            ConfigStore::resolve_key(None, None, Some("file-key")),
            "file-key"
        );
        assert_eq!(
            ConfigStore::resolve_key(None, None, None),
            ""
        );
    }
}
```

- [x] **Step 3: Implement `agent-rs/src/config_store.rs`**

```rust
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Default, Debug, Clone, PartialEq)]
pub struct ConfigStore {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}

impl ConfigStore {
    pub fn get_config_dir() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".gt"))
    }

    pub fn get_config_file_path() -> Option<PathBuf> {
        Self::get_config_dir().map(|d| d.join("config.json"))
    }

    pub fn load() -> Self {
        let path = match Self::get_config_file_path() {
            Some(p) => p,
            None => return Self::default(),
        };

        if !path.exists() {
            return Self::default();
        }

        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) -> io::Result<()> {
        let dir = Self::get_config_dir()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Could not determine home directory"))?;

        if !dir.exists() {
            fs::create_dir_all(&dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
            }
        }

        let file_path = dir.join("config.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let mut file = File::create(&file_path)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&file_path, fs::Permissions::from_mode(0o600));
        }

        file.write_all(json.as_bytes())?;
        file.flush()?;
        Ok(())
    }

    pub fn clear() -> io::Result<()> {
        if let Some(path) = Self::get_config_file_path() {
            if path.exists() {
                fs::remove_file(path)?;
            }
        }
        Ok(())
    }

    pub fn resolve_server(cli: Option<&str>, env_val: Option<&str>, stored: Option<&str>) -> String {
        if let Some(s) = cli {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = env_val {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = stored {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        "http://localhost:3000".to_string()
    }

    pub fn resolve_key(cli: Option<&str>, env_val: Option<&str>, stored: Option<&str>) -> String {
        if let Some(s) = cli {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = env_val {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Some(s) = stored {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        String::new()
    }

    pub fn mask_key(key: &str) -> String {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return String::new();
        }
        if trimmed.len() <= 10 {
            return "***".to_string();
        }
        format!("{}***{}", &trimmed[..6], &trimmed[trimmed.len() - 4..])
    }
}
```

- [x] **Step 4: Run unit tests to verify module passes**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo test --manifest-path agent-rs/Cargo.toml config_store::tests
```
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add agent-rs/Cargo.toml agent-rs/src/config_store.rs
git commit -m "feat(rust): add config_store module with permission handling and resolution precedence"
```

---

### Task 2: CLI Model Extension for `login`, `logout`, `config`

**Files:**
- Modify: `agent-rs/src/cli.rs`
- Modify: `agent-rs/src/main.rs`
- Test: Verification via `cargo check`

**Interfaces:**
- Produces:
  - Global `server` and `key` in `Cli` are `Option<String>`.
  - `Commands::Login { server: Option<String>, key: Option<String> }`
  - `Commands::Logout`
  - `Commands::Config { action: ConfigAction }`
  - `ConfigAction::List`, `ConfigAction::Get { key }`, `ConfigAction::Set { key, value }`

- [x] **Step 1: Update `agent-rs/src/cli.rs`**

Update `agent-rs/src/cli.rs`:
```rust
use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug, Clone)]
#[command(name = "gt")]
#[command(author = "Gemini Proxy Team")]
#[command(version = "1.0.0")]
#[command(about = "gt (Gemini Terminal) - Unified Docker-Style Terminal CLI and Reverse Agent", long_about = None)]
pub struct Cli {
    /// Remote Gemini Proxy server target URL (optional override)
    #[arg(short, long, global = true, env = "TERMINAL_SERVER")]
    pub server: Option<String>,

    /// Admin secret key for authentication (optional override)
    #[arg(short, long, global = true, env = "ADMIN_SECRET_KEY")]
    pub key: Option<String>,

    /// Output responses in structured JSON format
    #[arg(long, global = true)]
    pub json: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand, Debug, Clone)]
pub enum Commands {
    /// Authenticate and save Proxy server URL and admin secret key
    Login {
        /// Proxy server URL (e.g. http://localhost:3000)
        #[arg(index = 1)]
        server: Option<String>,

        /// Admin secret key
        #[arg(index = 2)]
        key: Option<String>,
    },

    /// Clear saved Proxy server URL and credentials
    Logout,

    /// View or manage persistent configurations (~/.gt/config.json)
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },

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

#[derive(Subcommand, Debug, Clone)]
pub enum ConfigAction {
    /// Display all configured values
    List,
    /// Get a configuration value (server, key)
    Get { key: String },
    /// Set a configuration value (server, key)
    Set { key: String, value: String },
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

- [x] **Step 2: Run compilation check**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo check --manifest-path agent-rs/Cargo.toml
```
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add agent-rs/src/cli.rs
git commit -m "feat(rust): add login, logout, and config CLI subcommand structures"
```

---

### Task 3: Login, Logout, and Config Command Execution Logic

**Files:**
- Modify: `agent-rs/src/client.rs`
- Modify: `agent-rs/src/main.rs`
- Test: Verification via `cargo check` and integration tests

**Interfaces:**
- Produces:
  - `pub async fn run_login(cli_server: Option<String>, cli_key: Option<String>) -> i32`
  - `pub fn run_logout() -> i32`
  - `pub fn run_config(action: ConfigAction, json: bool) -> i32`
  - `run_hosts`, `run_exec`, `run_ps`, `run_logs`, `run_kill` accept resolved `&str` references for server and key.

- [x] **Step 1: Implement `run_login`, `run_logout`, `run_config` in `agent-rs/src/client.rs`**

Add functions in `agent-rs/src/client.rs`:
```rust
use crate::cli::ConfigAction;
use crate::config_store::ConfigStore;

pub async fn run_login(server_opt: Option<String>, key_opt: Option<String>) -> i32 {
    let mut store = ConfigStore::load();

    let server = match server_opt {
        Some(s) if !s.trim().is_empty() => s.trim().to_string(),
        _ => {
            print!("? Enter Proxy Server URL (e.g. http://localhost:3000): ");
            let _ = io::stdout().flush();
            let mut input = String::new();
            if io::stdin().read_line(&mut input).is_err() || input.trim().is_empty() {
                "http://localhost:3000".to_string()
            } else {
                input.trim().to_string()
            }
        }
    };

    let key = match key_opt {
        Some(k) => k.trim().to_string(),
        _ => {
            print!("? Enter Admin Secret Key (leave blank if none): ");
            let _ = io::stdout().flush();
            let mut input = String::new();
            let _ = io::stdin().read_line(&mut input);
            input.trim().to_string()
        }
    };

    let normalized_server = if server.starts_with("http://") || server.starts_with("https://") {
        server
    } else {
        format!("http://{}", server)
    };

    let test_url = format!("{}/api/terminal/hosts", normalized_server.trim_end_matches('/'));
    let (client, _) = build_client(&key);

    println!("Connecting to {}...", normalized_server);
    match client.get(&test_url).send().await {
        Ok(res) => {
            if res.status() == reqwest::StatusCode::UNAUTHORIZED {
                eprintln!("✖ Error: Authentication failed. Invalid admin secret key (401).");
                return 1;
            }
            if !res.status().is_success() && res.status() != reqwest::StatusCode::NOT_FOUND {
                eprintln!("✖ Error: Server returned status {}.", res.status());
                return 1;
            }
        }
        Err(err) => {
            eprintln!("✖ Error: Could not connect to server at {}: {}", normalized_server, err);
            return 1;
        }
    }

    store.server = Some(normalized_server.clone());
    store.key = if key.is_empty() { None } else { Some(key) };

    if let Err(e) = store.save() {
        eprintln!("✖ Error saving configuration: {}", e);
        return 1;
    }

    println!("✔ Successfully verified and logged in to {}", normalized_server);
    if let Some(p) = ConfigStore::get_config_file_path() {
        println!("Configuration saved to {}", p.display());
    }
    0
}

pub fn run_logout() -> i32 {
    if let Err(e) = ConfigStore::clear() {
        eprintln!("✖ Error clearing credentials: {}", e);
        return 1;
    }
    println!("✔ Successfully logged out. Removed credentials from ~/.gt/config.json");
    0
}

pub fn run_config(action: ConfigAction, json: bool) -> i32 {
    let mut store = ConfigStore::load();

    match action {
        ConfigAction::List => {
            if json {
                let mut map = HashMap::new();
                map.insert("server", store.server.clone().unwrap_or_default());
                map.insert("key", ConfigStore::mask_key(&store.key.clone().unwrap_or_default()));
                println!("{}", serde_json::to_string_pretty(&map).unwrap());
            } else {
                let s = store.server.as_deref().unwrap_or("<not configured>");
                let k = store.key.as_deref().map(ConfigStore::mask_key).unwrap_or_else(|| "<not configured>".to_string());
                println!("server = \"{}\"", s);
                println!("key    = \"{}\"", k);
            }
            0
        }
        ConfigAction::Get { key } => {
            let val = match key.to_lowercase().as_str() {
                "server" => store.server.clone(),
                "key" => store.key.clone(),
                other => {
                    eprintln!("Unknown config key: {}. Valid keys are 'server' or 'key'.", other);
                    return 1;
                }
            };
            if let Some(v) = val {
                println!("{}", v);
            } else {
                println!("<not configured>");
            }
            0
        }
        ConfigAction::Set { key, value } => {
            match key.to_lowercase().as_str() {
                "server" => {
                    let s = value.trim().to_string();
                    let norm = if s.starts_with("http://") || s.starts_with("https://") { s } else { format!("http://{}", s) };
                    store.server = Some(norm.clone());
                    if let Err(e) = store.save() {
                        eprintln!("Error saving config: {}", e);
                        return 1;
                    }
                    println!("✔ Updated server = \"{}\"", norm);
                }
                "key" => {
                    let k = value.trim().to_string();
                    store.key = if k.is_empty() { None } else { Some(k) };
                    if let Err(e) = store.save() {
                        eprintln!("Error saving config: {}", e);
                        return 1;
                    }
                    println!("✔ Updated key");
                }
                other => {
                    eprintln!("Unknown config key: {}. Valid keys are 'server' or 'key'.", other);
                    return 1;
                }
            }
            0
        }
    }
}
```

- [x] **Step 2: Update `agent-rs/src/main.rs` to route all commands using `ConfigStore` resolution**

In `agent-rs/src/main.rs`:
```rust
mod cli;
mod client;
mod config;
mod config_store;
mod protocol;
mod pty;
mod rpc;
mod task;
mod ws;

use clap::Parser;
use cli::{Cli, Commands};
use config::Config;
use config_store::ConfigStore;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use task::TaskManager;
use tracing::info;
use tracing_subscriber::FmtSubscriber;
use ws::TerminalAgentClient;

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let cli = Cli::parse();
    let stored_config = ConfigStore::load();

    let resolved_server = ConfigStore::resolve_server(
        cli.server.as_deref(),
        std::env::var("TERMINAL_SERVER").ok().as_deref(),
        stored_config.server.as_deref(),
    );

    let resolved_key = ConfigStore::resolve_key(
        cli.key.as_deref(),
        std::env::var("ADMIN_SECRET_KEY").ok().as_deref(),
        stored_config.key.as_deref(),
    );

    match cli.command {
        Commands::Login { server, key } => {
            let code = client::run_login(server, key).await;
            std::process::exit(code);
        }
        Commands::Logout => {
            let code = client::run_logout();
            std::process::exit(code);
        }
        Commands::Config { action } => {
            let code = client::run_config(action, cli.json);
            std::process::exit(code);
        }
        Commands::Hosts => {
            let code = client::run_hosts(&resolved_server, &resolved_key, cli.json).await;
            std::process::exit(code);
        }
        Commands::Exec(args) => {
            let code = client::run_exec(&resolved_server, &resolved_key, args, cli.json).await;
            std::process::exit(code);
        }
        Commands::Ps { host } => {
            let code = client::run_ps(&resolved_server, &resolved_key, &host, cli.json).await;
            std::process::exit(code);
        }
        Commands::Logs { host, task_id } => {
            let code = client::run_logs(&resolved_server, &resolved_key, &host, &task_id, cli.json).await;
            std::process::exit(code);
        }
        Commands::Kill { host, task_id } => {
            let code = client::run_kill(&resolved_server, &resolved_key, &host, &task_id, cli.json).await;
            std::process::exit(code);
        }
        Commands::Agent(agent_args) => {
            let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

            let subscriber = FmtSubscriber::builder()
                .with_env_filter(env_filter)
                .with_target(false)
                .without_time()
                .finish();

            let _ = tracing::subscriber::set_global_default(subscriber);

            let agent_config = Config {
                server: resolved_server,
                key: resolved_key,
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

- [x] **Step 3: Run compilation check**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo check --manifest-path agent-rs/Cargo.toml
```
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add agent-rs/src/client.rs agent-rs/src/main.rs
git commit -m "feat(rust): implement login verification, logout, and persistent config commands"
```

---

### Task 4: Integration Testing & Verification

**Files:**
- Create: `tests/gtRustConfigLogin.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Test:
  - `gt login` with valid and invalid credentials against a Mock HTTP server.
  - `gt config get/set/list`.
  - `gt logout`.
  - `gt hosts` picking up stored config automatically without `--server` or `--key`.

- [x] **Step 1: Write integration tests in `tests/gtRustConfigLogin.test.ts`**

Create `tests/gtRustConfigLogin.test.ts`:
```typescript
import { execFile } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs';
import os from 'os';

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

describe('gt Rust Binary Config & Login Subsystem', () => {
  let server: http.Server;
  let serverPort: number;
  let tempHome: string;

  beforeAll((done) => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-test-home-'));

    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const key = req.headers['x-admin-key'];

      if (url.pathname === '/api/terminal/hosts') {
        if (key === 'valid-secret') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ hosts: [{ id: 'node-login', status: 'online' }] }));
          return;
        } else {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      res.statusCode = 404;
      res.end();
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
    server.close(() => {
      fs.rmSync(tempHome, { recursive: true, force: true });
      done();
    });
  });

  it('rejects login with 401 on invalid secret key and does not create config file', async () => {
    const res = await runRustGt(
      ['login', `http://localhost:${serverPort}`, 'wrong-secret'],
      { HOME: tempHome, TERMINAL_SERVER: '', ADMIN_SECRET_KEY: '' }
    );
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Authentication failed');
    const configFile = path.join(tempHome, '.gt', 'config.json');
    expect(fs.existsSync(configFile)).toBe(false);
  });

  it('successfully logs in and creates config file with valid credentials', async () => {
    const res = await runRustGt(
      ['login', `http://localhost:${serverPort}`, 'valid-secret'],
      { HOME: tempHome, TERMINAL_SERVER: '', ADMIN_SECRET_KEY: '' }
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully verified and logged in');

    const configFile = path.join(tempHome, '.gt', 'config.json');
    expect(fs.existsSync(configFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    expect(content.server).toBe(`http://localhost:${serverPort}`);
    expect(content.key).toBe('valid-secret');
  });

  it('runs gt hosts using persistent config without any flags', async () => {
    const res = await runRustGt(
      ['hosts'],
      { HOME: tempHome, TERMINAL_SERVER: '', ADMIN_SECRET_KEY: '' }
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('node-login');
    expect(res.stdout).toContain('online');
  });

  it('reads and updates config with gt config get / set / list', async () => {
    const listRes = await runRustGt(['config', 'list'], { HOME: tempHome });
    expect(listRes.code).toBe(0);
    expect(listRes.stdout).toContain(`server = "http://localhost:${serverPort}"`);

    const getRes = await runRustGt(['config', 'get', 'server'], { HOME: tempHome });
    expect(getRes.code).toBe(0);
    expect(getRes.stdout.trim()).toBe(`http://localhost:${serverPort}`);

    const setRes = await runRustGt(['config', 'set', 'server', 'http://127.0.0.1:9999'], { HOME: tempHome });
    expect(setRes.code).toBe(0);
    expect(setRes.stdout).toContain('Updated server = "http://127.0.0.1:9999"');
  });

  it('clears config on logout', async () => {
    const res = await runRustGt(['logout'], { HOME: tempHome });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully logged out');
    const configFile = path.join(tempHome, '.gt', 'config.json');
    expect(fs.existsSync(configFile)).toBe(false);
  });
});
```

- [x] **Step 2: Build debug binary and run integration tests**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo build --manifest-path agent-rs/Cargo.toml
npx jest tests/gtRustConfigLogin.test.ts
```
Expected: PASS.

- [x] **Step 3: Update documentation in CLAUDE.md**

Document `gt login`, `gt logout`, and `gt config` in `CLAUDE.md`.

- [x] **Step 4: Build release binary & run complete test suite**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo build --release --manifest-path agent-rs/Cargo.toml
npm test
```
Expected: All tests pass.

- [x] **Step 5: Commit**

```bash
git add tests/gtRustConfigLogin.test.ts CLAUDE.md
git commit -m "feat(rust): complete gt config persistence and login subsystem integration"
```

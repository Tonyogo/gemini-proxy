# Design Doc: Native Rust `gt` Config Persistence & Login Subsystem

- **Date:** 2026-09-20
- **Topic:** Persistent Configuration Management (`~/.gt/config.json`), `login`, `logout`, and `config` Subcommands for Native Rust `gt` CLI
- **Status:** Approved

## 1. Overview & Objectives

In the prior CLI design, `--server` and `--key` were defined as global command-line options. In practice, requiring or allowing server and key flags on every command call creates severe usability friction and argument collision risks:
1. **Flag Collision with Remote Commands**: In commands like `gt exec my-server curl -s ...` or `gt exec my-server -k ...`, global flags can clash with remote flags unless guarded by `--`.
2. **Repetitive Friction**: Developers and automation scripts should not have to retype the proxy server URL and secret key on every single invocation.

This design introduces a **Docker / GitHub CLI-style persistent configuration subsystem** for the native Rust `gt` binary:
- Primary credential and endpoint storage: `~/.gt/config.json`.
- `gt login [server] [key]`: Interactive or parameterized login that validates credentials against `/api/terminal/hosts` before writing to disk.
- `gt logout`: Clears saved credentials.
- `gt config <list|get|set>`: Explicit configuration inspection, retrieval, and updates.
- All operational subcommands (`hosts`, `exec`, `ps`, `logs`, `kill`, `agent`) automatically load from persistent config, making commands like `gt exec my-server uptime` completely clean and free of server/key parameters.

---

## 2. Configuration Hierarchy & Precedence

When executing any command, `gt` resolves the active `server` and `key` using the following strict precedence:

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Explicit CLI Flags (--server, --key)                     │ ◄── Highest (ad-hoc override)
├─────────────────────────────────────────────────────────────┤
│ 2. Environment Variables (TERMINAL_SERVER, ADMIN_SECRET_KEY)│ ◄── CI/CD & Docker automation
├─────────────────────────────────────────────────────���───────┤
│ 3. Persistent File (~/.gt/config.json)                      │ ◄── Developer daily usage
├─────────────────────────────────────────────────────────────┤
│ 4. Built-in Defaults (http://localhost:3000, empty key)     │ ◄── Lowest fallback
└─────────────────────────────────────────────────────────────┘
```

### 2.1 File Location & Security Permissions
- File path: `$HOME/.gt/config.json` (using `dirs::home_dir()` or resolving `$HOME`).
- Directory permissions: `0700` (`rwx------`) on Unix systems to restrict directory traversal.
- File permissions: `0600` (`rw-------`) on Unix systems via `std::os::unix::fs::PermissionsExt` to prevent other non-root users from reading the admin secret key.

---

## 3. Subcommand Specifications

### 3.1 `gt login`
```bash
# 1. Positional syntax
gt login http://proxy.example.com:3000 my-secret-key

# 2. Named flag syntax
gt login --server http://proxy.example.com:3000 --key my-secret-key

# 3. Interactive prompt syntax (if server or key omitted)
gt login
```
- **Validation Step**:
  - Sends a test `GET /api/terminal/hosts` with `x-admin-key` header to the candidate server URL.
  - If server returns `200 OK`: Save configuration and print:
    ```text
    ✔ Successfully connected to http://proxy.example.com:3000
    ✔ Authentication verified. Configuration saved to ~/.gt/config.json
    ```
  - If server returns `401 Unauthorized`:
    ```text
    ✖ Error: Authentication failed. Invalid admin secret key.
    ```
    Exits with code 1 without saving invalid credentials.
  - If network fails:
    ```text
    ✖ Error: Could not connect to server at http://proxy.example.com:3000 (Connection refused)
    ```
    Exits with code 1.

### 3.2 `gt logout`
```bash
gt logout
```
- Removes `~/.gt/config.json` or clears the `key` and `server` fields.
- Output:
  ```text
  ✔ Successfully logged out. Removed credentials from ~/.gt/config.json
  ```

### 3.3 `gt config`
```bash
# List all configurations (with masked secret key)
gt config list
# Output:
# server = "http://10.88.0.2:3000"
# key    = "AIzaSy***7890"

# Get a specific value
gt config get server
# Output: http://10.88.0.2:3000

gt config get key
# Output: my-secret-key (raw, unmasked)

# Set a specific value
gt config set server http://new-proxy:3000
# Output: ✔ Updated server = http://new-proxy:3000 in ~/.gt/config.json

gt config set key new-secret-key
# Output: ✔ Updated key in ~/.gt/config.json
```

---

## 4. Rust Module Architecture (`agent-rs/`)

```text
agent-rs/
├── Cargo.toml
└── src/
    ├── main.rs              # Top-level command dispatcher; initializes crypto & config
    ├── cli.rs               # clap CLI struct & Commands enum (Login, Logout, Config, Hosts, Exec, Ps, Logs, Kill, Agent)
    ├── config_store.rs      # Persistent JSON storage in ~/.gt/config.json, permission handling, credential masking
    ├── client.rs            # HTTP REST client implementations using resolved (server, key)
    ├── config.rs            # Agent daemon configuration (hostId, IP, hostname)
    ├── ws.rs                # WebSocket connection manager
    ├── protocol.rs          # Frame protocol definitions
    ├── pty/                 # PTY session management
    ├── rpc/                 # File RPC handlers
    └── task/                # Asynchronous task execution engine
```

### 4.1 `config_store.rs` Interface
```rust
#[derive(Serialize, Deserialize, Default, Debug, Clone)]
pub struct ConfigStore {
    pub server: Option<String>,
    pub key: Option<String>,
}

impl ConfigStore {
    pub fn load() -> Self;
    pub fn save(&self) -> Result<(), io::Error>;
    pub fn clear() -> Result<(), io::Error>;
    pub fn resolve_server(cli_opt: Option<&str>, env_opt: Option<&str>, stored: Option<&str>) -> String;
    pub fn resolve_key(cli_opt: Option<&str>, env_opt: Option<&str>, stored: Option<&str>) -> String;
    pub fn mask_key(key: &str) -> String;
}
```

---

## 5. Resulting User Experience

Once logged in, all everyday operational commands are concise, zero-noise, and immune to flag collisions:

```bash
gt login http://10.88.0.3:3000 my-secret-key

# Daily workflows:
gt hosts
gt exec my-server uptime
gt exec -w /var/www my-server ls -la
gt exec my-server -- curl -s https://example.com
gt ps my-server
gt logs my-server task-123
gt kill my-server task-123
```

---

## 6. Testing & Verification Plan

1. **ConfigStore Unit Tests (`tests/config_store_test.rs`)**:
   - Verify loading when file is absent returns default.
   - Verify saving and loading round-trip.
   - Verify file permissions are set to `0600` on Unix.
   - Verify credential masking for `config list`.
   - Verify resolution order (CLI > ENV > File > Default).
2. **Integration Tests**:
   - `gt login` against mock HTTP server:
     - 200 OK creates `~/.gt/config.json`.
     - 401 Unauthorized exits with code 1 and leaves config untouched.
   - `gt config get/set/list`.
   - `gt logout` removes or clears credentials.
   - Subsequent `gt hosts` and `gt exec` successfully pick up persisted server and key without any CLI flags.
3. **Full Build & Regression**:
   - `cargo test --manifest-path agent-rs/Cargo.toml`
   - `cargo build --release --manifest-path agent-rs/Cargo.toml`
   - `npm test` across all Node.js suites.

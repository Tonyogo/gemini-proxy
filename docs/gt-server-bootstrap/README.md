# Standalone `gt-server` Bootstrap & Architecture Guide

This document provides complete instructions and specifications for initializing the extracted terminal subsystem into an independent standalone repository: **`gt-server`** (or **`gemini-terminal`**).

---

## 1. Overview & Architecture

`gt-server` is a lightweight, high-performance remote terminal and node management hub. It coordinates reverse agent tunnels, interactive pseudo-terminals (PTY), RPC file management, and Docker-like remote command execution via the unified `gt` CLI.

```
+-------------------------------------------------------------+
|                        gt-server Hub                        |
|   (Express + WebSocket Daemon, Default Port: 3001)          |
+------------------------------+------------------------------+
                               |
        +----------------------+----------------------+
        | WebSocket (/api/terminal/agent-ws)          | WebSocket (/api/terminal/ws)
        v                                             v
+-----------------------+                    +-----------------------+
|  Remote Agent Node    |                    |  Browser WebTerminal  |
|  (`gt run -d [name]`) |                    |  (Xterm.js Frontend)  |
|  - PTY Session Spawner|                    |  - Live Interactive UI|
|  - RPC File Ops       |                    |  - File Manager UI    |
|  - Task Exec Engine   |                    |  - Task Viewer        |
+-----------------------+                    +-----------------------+
```

### Key Capabilities
- **Pure Reverse Agent Architecture**: Target nodes (servers, containers, edge devices) establish outbound WebSocket connections to `gt-server`. No public IP or open SSH port is required on managed nodes.
- **Unified `gt` CLI**: Docker-style developer CLI supporting `gt login`, `gt run`, `gt ps`, `gt exec`, `gt cp`, `gt logs`, and `gt task`.
- **Bidirectional File Management**: Real-time remote file browsing, previewing, editing, downloading, and uploading powered by WebSocket RPC.
- **Audited Task Execution**: Non-blocking asynchronous command execution with streaming logs and exit status propagation.

---

## 2. Extraction & Initialization Options

### Option A: Clean Scaffold from Extracted Artifacts (Recommended)

To start `gt-server` as a fresh repository using the architecture decoupled from `gemini-proxy`:

```bash
mkdir gt-server && cd gt-server
git init -b main

# 1. Initialize package.json
npm init -y
npm pkg set name="gt-server" \
  version="1.0.0" \
  bin.gt="./scripts/gt.js" \
  scripts.build="tsc && npm run build:frontend" \
  scripts.start="node dist/index.js" \
  scripts.dev="ts-node-dev src/index.ts"

# 2. Install production dependencies
npm install express ws dotenv
# Optional: install node-pty for direct server-side PTY fallback
npm install node-pty

# 3. Install developer dependencies
npm install -D typescript @types/express @types/ws @types/node ts-node-dev jest ts-jest @types/jest
```

### Option B: Exporting from Git History

If preserving historical git commits from `gemini-proxy` for `src/terminal/` and `scripts/gt.js` is desired:

```bash
# In a clone of gemini-proxy prior to extraction (commit 2303f57 or tag):
git clone https://github.com/your-org/gemini-proxy.git gt-server-export
cd gt-server-export

# Use git-filter-repo to keep only terminal files:
pip install git-filter-repo
git-filter-repo --path src/terminal/ --path scripts/gt.js --path scripts/install-gt.sh
```

---

## 3. Recommended Repository Layout

```
gt-server/
├── bin/
│   └── gt.js                       # Executable CLI entrypoint
├── scripts/
│   ├── gt.js                       # Source CLI script
│   └── install-gt.sh               # One-line installer script
├── src/
│   ├── index.ts                    # Server startup and HTTP + WS server binding
│   ├── app.ts                      # Express app setup and middleware
│   ├── config.ts                   # Environment variables and configuration
│   ├── controllers/
│   │   ├── terminalController.ts   # HTTP routes (/hosts, /offline, /exec)
│   │   ├── terminalFileController.ts # RPC file manager handlers
│   │   └── terminalLogController.ts  # Real-time and audit logs
│   ├── services/
│   │   ├── terminalHostManager.ts  # Dynamic agent registry and lifecycle
│   │   ├── terminalExecService.ts  # Task execution engine
│   │   └── terminalFileService.ts  # Remote file streaming service
│   ├── routes/
│   │   └── terminalRoutes.ts       # Express router definition
│   └── ws/
│       ├── terminalWs.ts           # Browser WebSocket bridge
│       └── agentWs.ts              # Reverse agent WebSocket handler
├── web/                            # Optional standalone Xterm.js web dashboard
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── WebTerminal.tsx
│       └── FileManager.tsx
├── tests/                          # Jest test suites
├── .env.example
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Environment Variables & Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | number | `3001` | HTTP and WebSocket listening port |
| `ADMIN_SECRET_KEY` | string | `""` | Authentication secret key (`x-admin-key` header or bearer token) |
| `LOG_LEVEL` | string | `"info"` | Logging verbosity (`error`, `warn`, `info`, `debug`) |
| `LOG_DIR` | string | `"logs"` | Directory for audit and task logs |
| `TASK_TIMEOUT_MS` | number | `600000` | Default timeout for background exec tasks (10 minutes) |

---

## 5. API & WebSocket Specification

To maintain 100% compatibility with existing `gt` CLI and agent daemons:

### HTTP Endpoints
- `GET /install.sh`: Serves `scripts/install-gt.sh` with auto-detected server URL.
- `GET /gt`: Serves `scripts/gt.js` for dynamic download.
- `GET /api/terminal/hosts`: Lists all currently connected online agents. Requires `x-admin-key`.
- `DELETE /api/terminal/hosts/offline`: Cleans up records for disconnected agents. Requires `x-admin-key`.
- `POST /api/terminal/exec/:hostId`: Enqueues an asynchronous command on target host.
- `GET /api/terminal/exec/:hostId/:taskId`: Polls command execution status and incremental output.
- `POST /api/terminal/exec/:hostId/:taskId/kill`: Sends termination signal to running task.

### WebSocket Endpoints
- `WS /api/terminal/agent-ws`: Reverse agent connection endpoint.
  - Query params: `hostId`, `token`, `name`, `platform`, `shell`.
- `WS /api/terminal/ws`: Web client connection endpoint.
  - Protocol: JSON messages (`type: "input"`, `"resize"`, `"reset"`, `"ping"`).

---

## 6. Compatibility & CI/CD Integration

When deploying applications with GitHub Actions via `gt exec`:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via Standalone gt-server
        env:
          TERMINAL_SERVER: ${{ secrets.TERMINAL_SERVER }} # e.g. https://terminal.example.com
          ADMIN_SECRET_KEY: ${{ secrets.ADMIN_SECRET_KEY }}
          DEPLOY_PATH: /opt/my-app
        run: |
          curl -fsSL "$TERMINAL_SERVER/gt" -o /tmp/gt.js
          node /tmp/gt.js exec -w "$DEPLOY_PATH" prod-server npm run deploy
```

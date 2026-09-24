# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build All**: `npm run build` (builds both frontend Vite React app to `dist/frontend` and compiles TypeScript backend to `dist/src`)
- **Build Frontend**: `npm run build:frontend` (compiles Vite React SPA in `frontend/`)
- **Build Backend**: `npm run build:backend` (compiles TypeScript server code via `tsc`)
- **Deploy**: `npm run deploy` (executes `scripts/deploy.sh`: pulls latest code from `origin/main`, installs dependencies, builds all assets, and reloads PM2 with zero downtime)
- **CI/CD Deployment**: `.github/workflows/deploy.yml` (GitHub Actions workflow connecting to target VPS via Gemini Terminal CLI `gt exec` and running `npm run deploy`. Requires Secrets: `TERMINAL_SERVER`, `ADMIN_SECRET_KEY`, `DEPLOY_PATH`, and optional `GT_HOST` defaulting to `gemini-proxy-server`)
- **PM2 Process Management**: `pm2 start ecosystem.config.js` / `pm2 reload ecosystem.config.js` / `pm2 stop gemini-proxy` / `pm2 logs gemini-proxy`
- **Start Production**: `npm start` (automatically builds before running `dist/src/index.js`)
- **Dev Mode Backend**: `npm run dev` (starts hot-reloading development server via `ts-node-dev`)
- **Dev Mode Frontend**: `npm run dev:frontend` (starts Vite dev server on port 5173 proxying API requests to `:3000`)
- **`gt` Unified Terminal CLI**: `npm run gt -- <command>` or `gt <command>` (unified Docker-style CLI for Gemini Terminal):
  - `gt login [server] [key]`: Verifies credentials against `/api/terminal/hosts` and persists to `~/.gt/config.json` (0600 permissions). Also supports `gt login <key>` (defaults to localhost:3000) or `gt login <url>`
  - `gt logout`: Clears persistent credentials and configuration
  - `gt ps [-a|--all] [--json] [--format <template>]`: Lists connected remote nodes (filters online only by default; `-a` shows all including offline)
  - `gt prune`: Removes disconnected/offline remote nodes
  - `gt exec [-it] [-d] [-w <dir>] [--timeout <ms>] [--verbose] <node> [--] <cmd...>`: Executes remote command supporting Docker-style interactive pseudo-terminal (`-it` / `-t` / `-i`), background detached mode (`-d`), live stdin piping, pure streaming output, and remote exit code forwarding
  - `gt cp <src> <dest>`: Copies files bidirectionally between local and remote node (`<node>:<path>`)
  - `gt logs [-f] <node> [taskId] [--json]`: Inspects or follows execution logs for a task (smartly defaults to latest task on target node if taskId omitted)
  - `gt kill <node> <taskId> [--signal <SIG>]`: Aborts or terminates a running task on target node
  - `gt config <list|get|set> [key] [value]`: Manages persistent client configuration
  - **Local Agent Daemon Management (`gt agent <command>`)**:
    - `gt agent run [-d] [NAME]`: Run agent in foreground or background daemon (persists state in `~/.gt/agents/<name>.json`, logs to `~/.gt/agents/<name>.log`)
    - `gt agent ps`: List local agent daemons with status, PID, target hub, and start time
    - `gt agent logs [-f] [-n 50] [NAME]`: View or follow local agent daemon logs
    - `gt agent stop [NAME] [--all]`: Stop running local agent daemon(s)
    - `gt agent restart [NAME]`: Restart local agent daemon
    - `gt agent rm [NAME] [--all]`: Remove stopped agent daemon records and logs
  - **Backward-Compatible Aliases**: `gt host ls/prune`, `gt node ls/prune`, `gt auth login/logout`, `gt task ls/logs/kill`
- **Configuration Hierarchy**:
  - Remote commands: `CLI flag (--server/--key) > Environment variable (TERMINAL_SERVER/ADMIN_SECRET_KEY) > Persistent config (~/.gt/config.json) > Default fallback (http://localhost:3000 / empty key)`
  - Agent daemon commands: Exclusively uses persistent credentials authenticated via `gt login` (or `TERMINAL_SERVER` / `ADMIN_SECRET_KEY`). `--server` and `--key` flags are strictly disallowed on `gt agent run` to prevent multi-source conflicts.
- **Terminal Agent Daemon**: `gt login http://<host>:3000 <admin-key> && gt agent run -d Node-Name`
- **Run All Tests**: `npm test` (runs complete Jest test suite; use `npx jest --runInBand` if experiencing SIGSEGV clustering issues)
- **Run Single Test**: `npx jest tests/<test-name>.test.ts` (e.g., `npx jest tests/claudeTranslator.test.ts`)

## Architecture & Structure

This is a **stateless API proxy** that translates Anthropic Claude Messages API requests into Google Gemini (AI Studio) API requests, and translates responses (SSE stream or non-stream) back to Claude format, alongside native Google Gemini API transparent reverse proxying, equipped with an out-of-band Admin Web Console, API Debugger, and multi-host WebTerminal.

### Key Components

- **Core Proxy Pipelines (`src/proxy/routes/`, `src/proxy/controllers/`, `src/proxy/services/`):** 
  - **Claude Translation Proxy (`claudeRoutes.ts`, `claudeController.ts`, `claudeTranslator.ts`):** Routes incoming `/v1/messages`, `/v1/messages/count_tokens`, `/v1/models`, and `/v1/models/:model_id` requests to `claudeController.ts`. Core translation engine (`claudeTranslator.ts`) converts tool schemas, system instructions, images, PDF documents, and thinking modes. Returns structured Claude JSON event arrays during stream translation, which are written as standard SSE events to client sockets while recorded natively as JSON arrays in transaction logs.
  - **Native Gemini API Proxy (`geminiRoutes.ts`, `geminiController.ts`):** Handles native Google Gemini protocol requests under `/v1beta/*` and `/v1/models/*:*` without translation. Integrates model alias mapping (`MODEL_MAPPINGS`), client-abort streaming lifecycle (`StreamLifecycleManager`), and full transaction audit logging (`payloadLogger`).

- **Out-of-Band Admin & Web Console (`src/admin/`, `frontend/`):**
  - **Admin Controller & Routes (`src/admin/controllers/`, `src/admin/routes/`):** Exposes `/api/admin/status`, `/api/admin/stats`, `/api/admin/models`, `/api/admin/logs`, and `/api/admin/config`.
  - **Admin Auth Middleware (`src/admin/middlewares/adminAuth.ts`):** Validates incoming `x-admin-key` header against `ADMIN_SECRET_KEY` (shared by `admin` and `terminal` subsystems).
  - **In-Memory Metrics (`src/admin/services/metricsService.ts`):** O(1) in-memory performance counter initialized on server startup with a fast capped file scan (max 1,000 recent logs via `Promise.all`), giving sub-millisecond `/api/admin/stats` responses.
  - **Log Viewer & Inspector (`frontend/src/components/LogsView.tsx`):** Chrome DevTools Network-style inspector featuring an interactive `JsonTreeView` (level 1 default expansion) and `SseStreamPreview` for real-time stream assembly and EventSource chunk timelines. Supports VS Code style zero-width sidebar toggling.
  - **Raw Body API Playground (`frontend/src/components/PlaygroundView.tsx`):** Monaco Editor-powered raw JSON request body tester supporting live typewriter stream output.

- **WebTerminal & Multi-Host Reverse Agent (`src/terminal/`, `scripts/gt.js`, `frontend/src/components/terminal/`):**
  - **Pure Reverse Agent Architecture:** Zero built-in server PTY spawning or hardcoded local host. All machines (host server and remote nodes alike) connect dynamically through `scripts/gt.js agent` via reverse WebSocket (`/api/terminal/agent-ws`, backward compatible with `/api/admin/terminal/agent-ws`).
  - **Remote Terminal Session (`RemoteAgentTerminalSession`):** Handles 200KB scrollback history buffers, replay on client attach, multi-client attach/detach, and PTY resize/reset frame forwarding.
  - **Host Manager (`TerminalHostManager`):** Pure dynamic agent registry with agent registration/unregistration, metadata tracking, RPC response dispatching, and online/offline status. Exposes `/api/terminal/hosts` and `/api/terminal/hosts/offline`.
  - **100% RPC File Management (`terminalFileService.ts` & `terminalFileController.ts`):** Pure RPC-driven file browsing, preview, editing, directory creation, deletion, download, and upload through WebSocket channels (`/api/terminal/files/*`).
  - **Standalone Command Execution Engine (`terminalExecService.ts`, `terminalExecController.ts`, `TaskManager` in `scripts/gt.js`):** Isolated asynchronous command execution engine (`child_process.spawn` or native POSIX fork/exec) supporting immediate non-blocking task creation (`POST /api/terminal/exec/:hostId`), incremental offset output polling (`GET /api/terminal/exec/:hostId/:taskId`), process termination (`POST /api/terminal/exec/:hostId/:taskId/kill`), recent tasks listing (`GET /api/terminal/exec/:hostId`), and unified Docker-style CLI tool `gt` (`scripts/gt.js`), with 5MB buffer truncation and timeout guards for AI/script deployment workflows.
  - **System Console Log Stream (`terminalLogService.ts` & `terminalLogController.ts`):** Real-time server log broadcaster and history provider (`/api/terminal/logs`).
  - **Backward Compatibility Aliases:** `adminRoutes.ts` routes legacy `/api/admin/terminal/*` and `/api/admin/terminal-logs` requests to `terminalRoutes` seamlessly.
  - **Frontend UI & Empty State:** `TerminalHostSelector` with automatic online host switching, rich frosted empty state guidance cards with one-click startup commands when no agents are connected, `TerminalAccessoryBar` for touch modifier keys, and `mobileViewportHelper` with dynamic keyboard push-up compensation.

- **Payload Debug Logger (`src/proxy/services/payloadLogger.ts`):**
  - Asynchronously saves JSON transaction details partitioned into date/hour subdirectories under `TRANSACTION_LOGS_DIR` formatted using the configured `TIME_ZONE` (defaults to `Asia/Shanghai`).
  - Automatically performs day-based log expiration pruning (`LOG_RETENTION_DAYS`, defaults to 3 days).
  - Automatically sanitizes sensitive keys and Bearer tokens via `sanitizeData()` before persisting logs to disk.

### Configuration & Environment Variables

- `config/default.ts`: Source of truth for standard Express app configuration, with dynamic in-memory hot-reload (`updateConfig`) and explicit user overrides stored in `config/runtime.json` (or `config/runtime.test.json` during test runs):
  - `PORT`: Proxy server port (default `3000`).
  - `GEMINI_BASE_URL`: Base upstream URL (default `https://generativelanguage.googleapis.com`).
  - `LOG_LEVEL`: Console logging verbosity (`error`, `warn`, `info`, `debug`). Dynamically evaluated on every log statement without caching.
  - `TRANSACTION_LOGS_DIR`: Partitioned log directory path (default `logs`).
  - `TIME_ZONE`: Timezone used for log directory partitioning and console timestamps (default `Asia/Shanghai`).
  - `LOG_RETENTION_DAYS`: Days to preserve transaction logs before auto-pruning (default `3`, set `0` to disable).
  - `ADMIN_SECRET_KEY`: Key protecting `/api/admin/*` management endpoints (`x-admin-key`).
  - `ENABLE_UI`: Boolean flag to enable/disable static web console hosting at `/ui` (default `true`).
  - `SYSTEM_ROLE_TO_INSTRUCTION`: Boolean switch (`true`/`false`) to route inline `role: 'system'` messages to `systemInstruction`.
  - `RUNTIME_CONTEXT_TAG`: Configurable wrapper tag name (default `system-context`).
  - `UPSTREAM_TIMEOUT_MS`: Timeout for upstream Gemini requests in milliseconds (default `180000`).
  - `CUSTOM_SYSTEM_INSTRUCTION`: Optional custom system instructions injected into upstream calls.
  - `MODEL_MAPPINGS`: Optional JSON mapping dictionary to alias or redirect model requests (supports string target or `{ target, strategy }` with `least-used`, `round-robin`, `weighted` sent via `x-scheduling-strategy` header).

## Code Style & Guidelines

- **Strict TypeScript**: Maintain strict TypeScript patterns. Ensure complete type safety and update `src/types/index.ts` first when adding support for new API payload extensions.
- **Zero Static Config Caching**: Do not cache `config` properties at module top-level scope or inside class constructors. Always access properties dynamically via functions or `config.x` getters to support live hot-reloading.
- **Security**: Upstream requests must always pass API keys in the `x-goog-api-key` HTTP header. Never append sensitive API keys as URL query parameters (`?key=`).
- **Testing**: Every translator and admin feature should have corresponding assertion test suites inside `tests/`. Ensure mock headers are set appropriately in `supertest` routes.

# Design Doc: Terminal Subsystem Extraction (`src/terminal/`)

- **Date:** 2026-09-18
- **Topic:** Extract Terminal Logic into a First-Class Symmetrical Subsystem (`src/terminal/`)
- **Status:** Approved

## 1. Overview & Objectives

Following the backend restructuring that created `src/proxy/` for core translation and proxy pipelines, this design extracts all multi-host terminal management, WebTerminal tunnels, file RPC, isolated command execution, and terminal logs out of `src/admin/` into a first-class, symmetrical subsystem: `src/terminal/`.

### Architecture Goals:
1. **Three Pillars Architecture**: Clear separation into three symmetrical backend modules under `src/`:
   - `src/proxy/`: Core API translation and proxy gateway (`/v1/*`, `/v1beta/*`).
   - `src/terminal/`: WebTerminal, dynamic reverse agent management, RPC file system, and isolated command execution (`/api/terminal/*`).
   - `src/admin/`: System dashboard, in-memory metrics, transaction log inspection, accounts, and runtime configuration (`/api/admin/*`).
2. **Top-Level Route Transition with 100% Backward Compatibility**:
   - New primary route: `/api/terminal/*` (REST APIs and WebSocket endpoints: `/api/terminal/ws`, `/api/terminal/agent-ws`).
   - Backward compatibility: Preserves `/api/admin/terminal/*` and `/api/admin/terminal-logs` routes via aliases in `src/admin/routes/adminRoutes.ts` and `src/terminal/routes/terminalWs.ts`.
3. **Frontend & Agent Migration**:
   - Updates `frontend/` components (`WebTerminalView`, `TerminalHostSelector`, `TerminalFileManagerView`, `TerminalLogsView`) to target `/api/terminal/*`.
   - Updates `scripts/terminal-agent.js` default connection target to `/api/terminal/agent-ws`.
4. **Clean Code & Zero Regression**:
   - Deletes relocated terminal files from `src/admin/`.
   - Updates all unit, integration, and E2E tests in `tests/`.
   - Guarantees 100% passing build and test suites.

---

## 2. Target Directory Structure

```text
src/
├── proxy/                           # Core API translation and proxy gateway
│   ├── controllers/
│   ├── routes/
│   └── services/
├── terminal/                        # [NEW] Multi-Host Terminal & Execution Subsystem
│   ├── controllers/
│   │   ├── terminalHostController.ts# Host registry & offline pruning (/hosts)
│   │   ├── terminalFileController.ts# Remote File RPC operations (/files/*)
│   │   ├── terminalExecController.ts# Isolated command execution engine (/exec/*)
│   │   └── terminalLogController.ts # Server console logs (/logs)
│   ├── routes/
│   │   ├── terminalRoutes.ts        # Primary REST route mount
│   │   └── terminalWs.ts            # WebSocket reverse agent & client PTY gateway
│   └── services/
│       ├── terminalHostManager.ts   # Dynamic agent registry & session router
│       ├── terminalFileService.ts   # RPC file system operations
│       ├── terminalExecService.ts   # Command execution lifecycle manager
│       ├── terminalLogService.ts    # Console log collection & broadcast
│       └── terminalService.ts       # Local PTY helper
├── admin/                           # Administrative & Inspection Subsystem
│   ├── controllers/
│   │   ├── adminController.ts       (retains status, models, logs, stats, config)
│   │   └── accountController.ts     (retains accounts management)
│   ├── middlewares/
│   │   └── adminAuth.ts             (shared admin key authentication)
│   ├── routes/
│   │   └── adminRoutes.ts           (mounts admin endpoints + alias to terminalRoutes)
│   └── services/
│       ├── accountService.ts
│       ├── logService.ts
│       └── metricsService.ts
├── types/
├── utils/
���── app.ts                           # Express app mounting (/v1, /v1beta, /api/admin, /api/terminal)
└── index.ts                         # HTTP & WebSocket server entry point
```

---

## 3. Migration & Routing Specifications

### 3.1 File Relocation
- `src/admin/services/terminalHostManager.ts` -> `src/terminal/services/terminalHostManager.ts`
- `src/admin/services/terminalFileService.ts` -> `src/terminal/services/terminalFileService.ts`
- `src/admin/services/terminalExecService.ts` -> `src/terminal/services/terminalExecService.ts`
- `src/admin/services/terminalLogService.ts` -> `src/terminal/services/terminalLogService.ts`
- `src/admin/services/terminalService.ts` -> `src/terminal/services/terminalService.ts`
- `src/admin/controllers/terminalFileController.ts` -> `src/terminal/controllers/terminalFileController.ts`
- `src/admin/controllers/terminalExecController.ts` -> `src/terminal/controllers/terminalExecController.ts`
- `src/admin/routes/terminalWs.ts` -> `src/terminal/routes/terminalWs.ts`
- Extract `getTerminalHosts` and `pruneOfflineTerminalHosts` from `adminController.ts` into `src/terminal/controllers/terminalHostController.ts`.
- Extract `getTerminalLogs` from `adminController.ts` into `src/terminal/controllers/terminalLogController.ts`.

### 3.2 REST API Routes (`src/terminal/routes/terminalRoutes.ts`)
Protected by `adminAuthMiddleware`:
- `/hosts` -> `terminalHostController.getHosts`
- `/hosts/offline` -> `terminalHostController.pruneOfflineHosts`
- `/files/list`, `/content`, `/save`, `/mkdir`, `/rename`, `/delete`, `/download`, `/upload` -> `terminalFileController.*`
- `/exec/:hostId`, `/exec/:hostId/:taskId`, `/exec/:hostId/:taskId/kill`, `/exec/:hostId` -> `terminalExecController.*`
- `/logs` -> `terminalLogController.getTerminalLogs`

### 3.3 Express & WebSocket Assembly
1. **`src/app.ts`**:
   - `app.use('/api/terminal', terminalRoutes);`
   - `app.use('/api/admin', adminRoutes);`
2. **`src/admin/routes/adminRoutes.ts` (Compatibility Aliases)**:
   - `router.use('/terminal', terminalRoutes);`
   - `router.get('/terminal-logs', (req, res) => terminalLogController.getTerminalLogs(req, res));`
3. **`src/terminal/routes/terminalWs.ts` (WebSocket Upgrade Handler)**:
   - Client WebTerminal: accepts `/api/terminal/ws` and `/api/admin/terminal/ws`.
   - Agent Reverse Tunnel: accepts `/api/terminal/agent-ws` and `/api/admin/terminal/agent-ws`.

---

## 4. Frontend & Agent Updates

1. **`frontend/src/components/WebTerminalView.tsx`**: Update WebSocket URL to `/api/terminal/ws`.
2. **`frontend/src/components/terminal/TerminalHostSelector.tsx`**: Update fetch paths to `/api/terminal/hosts` and `/api/terminal/hosts/offline`.
3. **`frontend/src/components/terminal/TerminalFileManagerView.tsx`**: Update fetch paths to `/api/terminal/files/*`.
4. **`frontend/src/components/TerminalLogsView.tsx`**: Update SSE stream path to `/api/terminal/logs`.
5. **`scripts/terminal-agent.js`**: Update default WebSocket path to `/api/terminal/agent-ws`.

---

## 5. Testing & Verification Plan

1. **Path Updates in `tests/`**:
   - Update imports in all terminal test files from `../src/admin/...` to `../src/terminal/...`.
2. **Dual-Route Compatibility Tests**:
   - Add assertion verifying both `/api/terminal/*` and `/api/admin/terminal/*` respond correctly with 200 OK.
   - Add assertion verifying both `/api/terminal/agent-ws` and `/api/admin/terminal/agent-ws` accept connections.
3. **Build & Regression**:
   - `npm run build`: Frontend and backend compile cleanly with 0 errors.
   - `npm test`: All 111 test suites pass with 0 regressions.
4. **Documentation**:
   - Update `CLAUDE.md` and `README.md` to reflect `src/terminal/`.

# Technical Design Specification: Extracting Terminal Subsystem into Standalone Project

- **Date**: 2026-10-03
- **Branch**: `feat/extract-terminal-module`
- **Status**: Proposed / Pending Review
- **Target Projects**:
  1. `gemini-proxy`: Lightweight, stateless LLM translation proxy (preparing for Cloudflare Workers / Serverless).
  2. `gt-server` (or `gemini-terminal`): Dedicated multi-host reverse-agent WebTerminal, RPC file management, and CLI execution hub.

---

## 1. Background & Motivation

The `gemini-proxy` repository currently couples two fundamentally different engineering concerns:
1. **Stateless API Gateway & Translator**: Converts Anthropic Claude Messages API requests to Google Gemini format, handles SSE streaming, load balances multi-account upstreams, logs transactions, and records token metrics.
2. **Stateful Remote Terminal & Agent Infrastructure**:
   - In-memory WebSocket hub (`terminalHostManager`, `terminalWs`).
   - Reverse agent tunnel and POSIX command execution engine (`scripts/gt.js`, `terminalExecBridge`).
   - RPC file management (`terminalFileService`).
   - Complex interactive WebTerminal UI with mobile gesture support, magnifying glass, IME composition, virtual keyboard compensation, and font zooming (`xterm.js`).
   - Native C++ addon dependency (`node-pty`) requiring compilation tools on host machines.

### Problems with Current Coupling
- **Blocks Serverless / Cloudflare Workers Migration**: Edge runtimes (V8 isolates) do not support `node-pty`, native C++ binaries, local disk persistence, or single-process stateful `Map<hostId, WebSocket>` connections.
- **Heavyweight Dependencies**: Installing `node-pty` adds significant compilation overhead during `npm install` and occasionally fails across different OS/Node environments.
- **Fragile CI/CD Self-Dependency**: `.github/workflows/deploy.yml` directly invokes `node scripts/gt.js exec` inside the same repository that it is trying to build and deploy.
- **Convoluted Test Suite**: Over 50 unit and integration tests are dedicated to PTY emulation, terminal touch gestures, and CLI daemon lifecycle, bloating the core proxy test run time.

---

## 2. Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    gemini-proxy (Lightweight)                │
│                                                              │
│  - Routes: /v1/* (Claude), /v1beta/* (Gemini), /api/admin/*  │
│  - Core Services: claudeTranslator, accountService, metrics  │
│  - Frontend SPA: Logs Inspector, Metrics Dashboard,          │
│                  Playground, Account Manager                 │
│  - Zero Native Dependencies (Pure JS/TS, fast install)       │
│  - CI/CD: Deploys via standalone gt CLI                      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                  gt-server (Standalone Hub)                  │
│                                                              │
│  - WebSocket Hub: /api/terminal/ws, /agent-ws, /exec-ws      │
│  - RPC Core: Host Manager, Task Manager, File Service        │
│  - CLI / Agent: scripts/gt.js, scripts/install-gt.sh         │
│  - Frontend SPA: Host Selector, xterm.js WebTerminal,        │
│                  Remote File Manager, Touch Accessory Bar    │
│  - Dependencies: express, ws, node-pty, @xterm/*             │
└────────────────��─────────────────────────────────────────────┘
```

---

## 3. Scope & Decoupling Strategy

### 3.1 Decisions Agreed
1. **Repository Topology**: Complete separation into two independent repositories.
2. **CI/CD Deployment**: `gemini-proxy` deployment workflow will fetch and execute the `gt` CLI provided by the standalone `gt-server` infrastructure.
3. **System Console Logs**: The in-memory broadcast log (`terminalLogService` and `TerminalLogsView`) will be removed along with the Terminal subsystem; `gemini-proxy` will rely on standard `console.log` / PM2 logs.

---

## 4. Phase-by-Phase Implementation Plan

### Phase 1: Clean Up & Decouple `gemini-proxy`

#### 4.1 Backend Decoupling
- **Delete Terminal Module**:
  - Delete `src/terminal/` recursively:
    - Controllers: `terminalExecController.ts`, `terminalFileController.ts`, `terminalHostController.ts`, `terminalLogController.ts`.
    - Routes: `terminalRoutes.ts`, `terminalWs.ts`.
    - Services: `terminalExecBridge.ts`, `terminalExecService.ts`, `terminalFileService.ts`, `terminalHostManager.ts`, `terminalLogService.ts`, `terminalService.ts`.
- **Remove HTTP & WS Mounts**:
  - In `src/index.ts`: Remove `setupTerminalWebSocket(server)`.
  - In `src/app.ts`:
    - Remove imports of `terminalRoutes`.
    - Remove `app.use('/api/terminal', terminalRoutes)`.
    - Remove script direct download routes: `/install.sh`, `/api/terminal/install`, `/gt`, `/api/terminal/gt`.
    - Remove terminal path exceptions from frontend wildcard fallback handler.
  - In `src/admin/routes/adminRoutes.ts`:
    - Remove `router.use('/terminal', terminalRoutes)`.
    - Remove `router.get('/terminal-logs', ...)`.
- **Clean Logger Integration**:
  - In `src/utils/logger.ts`:
    - Remove `import terminalLogService from '../terminal/services/terminalLogService'`.
    - Remove `terminalLogService.addLog(...)` invocation.
    - Keep stdout / stderr formatting and log levels intact.
- **Dependency & Script Clean Up (`package.json`)**:
  - Remove dependencies: `node-pty`, `ws`.
  - Remove devDependencies: `@types/ws`.
  - Remove `"bin": { "gt": "./scripts/gt.js" }` and `"gt"` npm script.
  - Delete `scripts/gt.js` and `scripts/install-gt.sh` (keep `scripts/deploy.sh`).

#### 4.2 Frontend Decoupling
- **Delete Terminal Components & Helpers**:
  - Delete `frontend/src/components/terminal/` (entire directory):
    - `TerminalAccessoryBar.tsx`
    - `TerminalFileManagerView.tsx`
    - `TerminalHostSelector.tsx`
    - `TerminalImagePreviewModal.tsx`
  - Delete top-level views:
    - `frontend/src/components/WebTerminalView.tsx`
    - `frontend/src/components/UnifiedTerminalView.tsx`
    - `frontend/src/components/TerminalLogsView.tsx`
  - Delete terminal utility scripts:
    - `frontend/src/utils/terminalFilter.ts`
    - `frontend/src/utils/terminalKeyEncoder.ts`
    - `frontend/src/utils/terminalScrollHelper.ts`
    - `frontend/src/utils/terminalMagnifierHelper.ts`
    - `frontend/src/utils/terminalImeHelper.ts`
    - `frontend/src/utils/mobileViewportHelper.ts`
- **Refactor Navigation & Views**:
  - In `frontend/src/App.tsx`:
    - Update `DiscoverSubView`:
      ```typescript
      export type DiscoverSubView = 'hub' | 'playground' | 'translate' | 'embeddedWeb';
      ```
    - Remove `#terminal` / `/terminal` route handling.
    - Remove `UnifiedTerminalView` and `TerminalLogsView` conditional renderings.
  - In `frontend/src/components/DiscoverHubView.tsx`:
    - Remove `'terminal'` and `'systemLogs'` from `DiscoverToolId`.
    - Remove "Web Terminal" and "System Console Logs" discovery cards.
  - In `frontend/src/components/AccountsView.tsx`:
    - Remove `terminalLogsEndRef` and live terminal log polling timer.
  - In `frontend/src/components/ConfigModal.tsx`:
    - Remove terminal host fetch checks.
- **Style & Package Clean Up**:
  - In `frontend/src/index.css`: Remove `.terminal-select-mode` rules.
  - In `frontend/src/i18n/locales/{zh,en}.ts`: Remove `terminal` dictionary objects.
  - In `frontend/package.json`:
    - Remove `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`.

#### 4.3 CI/CD & Deploy Workflow (`.github/workflows/deploy.yml`)
- Update GitHub Actions workflow to obtain `gt` from the standalone terminal hub:
  ```yaml
  - name: Setup Node.js & Install gt CLI
    run: |
      curl -fsSL "${{ secrets.TERMINAL_SERVER }}/install.sh" | bash -s -- --cli-only
      echo "$HOME/.gt/bin" >> $GITHUB_PATH

  - name: Deploy via Gemini Terminal (gt)
    env:
      TERMINAL_SERVER: ${{ secrets.TERMINAL_SERVER }}
      ADMIN_SECRET_KEY: ${{ secrets.ADMIN_SECRET_KEY }}
      DEPLOY_PATH: ${{ secrets.DEPLOY_PATH }}
      TARGET_HOST: ${{ secrets.GT_HOST || 'gemini-proxy-server' }}
    run: |
      gt exec \
        --server "$TERMINAL_SERVER" \
        --key "$ADMIN_SECRET_KEY" \
        --verbose \
        -w "$DEPLOY_PATH" \
        "$TARGET_HOST" \
        npm run deploy
  ```

#### 4.4 Test Suite Pruning
- Prune terminal-specific tests in `tests/`:
  - `terminal*.test.ts` (30+ test suites)
  - `gt*.test.ts` (15+ test suites)
- Verify remaining proxy and admin tests pass cleanly:
  - `npm test` runs with 0 terminal dependencies.
  - Verify build: `npm run build` succeeds cleanly.

---

### Phase 2: Creation of Standalone `gt-server`

#### 4.5 Repository Initialization
- Initialize new repository: `gt-server`.
- Transfer backend components:
  - Server entry: `src/index.ts` with HTTP server and WebSocket upgrade handler.
  - Controllers: Host, File, Exec, Log controllers.
  - Services: HostManager, ExecBridge, FileService, TaskManager.
  - CLI script: `scripts/gt.js`, `scripts/install-gt.sh`.
- Transfer frontend components:
  - Build a clean Vite + React app in `frontend/` focusing entirely on host management, terminal tabs, and file exploration.
  - Migrate all terminal utility algorithms (`terminalScrollHelper`, `terminalImeHelper`, etc.).
- Migrate all terminal tests (`tests/terminal*.test.ts`, `tests/gt*.test.ts`) into `gt-server` and verify 100% test coverage.

---

## 5. Risk Assessment & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **CI/CD Interruption during Deploy** | High | Ensure the standalone `gt-server` (or current server's global `gt`) is functional and accessible before switching `.github/workflows/deploy.yml`. |
| **Frontend Residual Broken Imports** | Medium | Run `npm run build:frontend` (Vite + `tsc --noEmit`) to verify zero compiler errors or missing symbols. |
| **Logger Side Effects** | Low | `logger.ts` will strictly write to `console.log` with formatted timestamps, preventing any silent logging dropouts. |

---

## 6. Verification Checklist
- [ ] `npm run build:backend` compiles with zero TypeScript errors without `node-pty` / `ws`.
- [ ] `npm run build:frontend` compiles with zero TypeScript / Vite bundling errors without `@xterm/*`.
- [ ] `npm test` executes cleanly and all Claude / Gemini proxy integration tests pass.
- [ ] No occurrences of `terminal` or `terminalRoutes` remain in `src/app.ts`, `src/index.ts`, or `src/utils/logger.ts`.
- [ ] `package.json` has removed `node-pty`, `ws`, and `@types/ws`.

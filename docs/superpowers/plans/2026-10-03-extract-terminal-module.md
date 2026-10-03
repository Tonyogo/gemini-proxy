# Implementation Plan: Extracting Terminal Subsystem into Standalone Project

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely decouple and remove the stateful Terminal subsystem (WebTerminal, RPC file manager, `gt` CLI/agent daemon, `node-pty`, and in-memory terminal logs) from `gemini-proxy`, turning it into a pure, lightweight, stateless LLM proxy ready for Cloudflare Workers / Serverless, and establish the standalone `gt-server` project.

**Architecture:** 
1. Remove all terminal backend routes, services, and C++/WebSocket dependencies (`src/terminal/`, `node-pty`, `ws`) from `gemini-proxy`.
2. Clean `logger.ts` to output solely to formatted stdout/stderr.
3. Clean frontend UI by removing terminal and system log views, `xterm.js` packages, and associated mobile helpers.
4. Clean proxy controller/upstream manager's dependency on the internal terminal host manager.
5. Update GitHub Actions CI/CD to fetch and execute standalone `gt` CLI.

**Tech Stack:** Node.js 20, TypeScript, Express, Vite, React, Jest.

**Spec:** `docs/superpowers/specs/2026-10-03-extract-terminal-module-design.md`

## Global Constraints
- Target branch: `feat/extract-terminal-module`
- Zero leftover references to `src/terminal/` in `src/` or `frontend/src/`
- Zero native C++ build requirements (`node-pty` removed from `package.json`)
- All existing core proxy functionality (`/v1/messages`, `/v1beta/*`, multi-account scheduling, transaction logging) must remain 100% working
- Zero compiler errors across both `npm run build:backend` and `npm run build:frontend`

## Review Focus
- **Input/Failure 1: `logger.ts` when terminalLogService is gone** — logging calls across the app must continue formatting to stdout without throwing null pointer exceptions.
- **Input/Failure 2: Upstream server selection with legacy `agentId`** — upstreamManager must gracefully handle or ignore configured servers without referencing `terminalHostManager`.
- **Input/Failure 3: Frontend direct URL navigation** — accessing `/#terminal` or direct legacy paths must gracefully fallback to default view without crashing.
- **Input/Failure 4: Account usage live polling** — Accounts view must not poll or scroll non-existent terminal logs.
- **Input/Failure 5: CI/CD deployment script** — `.github/workflows/deploy.yml` must not invoke deleted `scripts/gt.js`.

---

### Task 1: Clean Up Backend HTTP & WebSocket Mounting and Logger

**Files:**
- Modify: `src/utils/logger.ts`
- Modify: `src/index.ts`
- Modify: `src/app.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Test: `tests/loggerHotReload.test.ts`
- Test: `tests/appStaticMount.test.ts`

**Interfaces:**
- Consumes: `src/utils/logger.ts` logger methods (`error`, `warn`, `info`, `debug`).
- Produces: Decoupled `logger` writing directly to stdout/stderr; `src/index.ts` and `src/app.ts` without terminal routes or WebSocket upgrade handlers.

- [ ] **Step 1: Write tests verifying decoupled logger and app routes**

Verify in `tests/loggerHotReload.test.ts` and `tests/appStaticMount.test.ts` that logger writes to console and `/api/terminal/*` or `/gt` endpoints return 404.

- [ ] **Step 2: Update `src/utils/logger.ts`**

Remove import of `terminalLogService`. Remove `terminalLogService.addLog(...)` call. Retain log level filtering and timestamp formatting to `console.log`.

- [ ] **Step 3: Update `src/index.ts`**

Remove `import { setupTerminalWebSocket } from './terminal/routes/terminalWs';` and `setupTerminalWebSocket(server);`.

- [ ] **Step 4: Update `src/app.ts`**

Remove `import terminalRoutes from './terminal/routes/terminalRoutes';`.
Remove `app.use('/api/terminal', terminalRoutes);`.
Remove `/install.sh`, `/api/terminal/install`, `/gt`, `/api/terminal/gt` download routes.
Remove terminal paths from the wildcard SPA fallback filter.

- [ ] **Step 5: Update `src/admin/routes/adminRoutes.ts`**

Remove:
```typescript
import terminalRoutes from '../../terminal/routes/terminalRoutes';
import terminalLogController from '../../terminal/controllers/terminalLogController';
...
router.use('/terminal', terminalRoutes);
router.get('/terminal-logs', (req, res) => terminalLogController.getTerminalLogs(req, res));
```

- [ ] **Step 6: Run existing mount and logger tests to verify**

Run: `npx jest tests/loggerHotReload.test.ts tests/appStaticMount.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/utils/logger.ts src/index.ts src/app.ts src/admin/routes/adminRoutes.ts
git commit -m "refactor(server): decouple logger and unmount terminal routes and websockets"
```

---

### Task 2: Decouple Proxy Controller and Upstream Manager from Terminal Host Manager

**Files:**
- Modify: `src/utils/upstreamManager.ts`
- Modify: `src/proxy/controllers/claudeController.ts`
- Modify: `src/proxy/controllers/geminiController.ts`
- Delete: `src/proxy/services/agentProxyService.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: `upstreamManager.getUpstreamUrl()`, `claudeController.handleMessages()`, `geminiController.handleGenerateContent()`.
- Produces: Proxy controllers using standard HTTP fetch without internal agent tunnel bridge.

- [ ] **Step 1: Check upstream manager references to terminalHostManager**

In `src/utils/upstreamManager.ts`, remove `import { terminalHostManager } from '../terminal/services/terminalHostManager';`.
Remove `terminalHostManager.isAgentOnline` checks (defaulting to standard URL availability).

- [ ] **Step 2: Clean `claudeController.ts` and `geminiController.ts`**

Remove `import agentProxyService from '../services/agentProxyService';`.
Remove branch conditions executing `agentProxyService.agentFetch(serverSelection.agentId, ...)`, relying purely on upstream HTTP fetch.

- [ ] **Step 3: Remove `src/proxy/services/agentProxyService.ts`**

Delete the file as egress proxying is part of the agent ecosystem moving to `gt-server`.

- [ ] **Step 4: Clean `src/types/index.ts`**

Remove deprecated `agentId?: string` from `UpstreamServerConfig` and `UpstreamServerSelection`.

- [ ] **Step 5: Verify proxy tests compile and pass**

Run: `npx jest tests/claudeController.test.ts tests/geminiController.test.ts tests/upstreamManager.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/upstreamManager.ts src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts src/types/index.ts
git rm src/proxy/services/agentProxyService.ts
git commit -m "refactor(proxy): remove internal agent proxy service and terminalHostManager couplings"
```

---

### Task 3: Delete Terminal Backend Directory and Dependencies

**Files:**
- Delete: `src/terminal/` (entire directory)
- Delete: `scripts/gt.js`
- Delete: `scripts/install-gt.sh`
- Modify: `package.json`

**Interfaces:**
- Consumes: Node.js runtime and packages.
- Produces: Lean `package.json` without `node-pty`, `ws`, `@types/ws`, or `gt` bin link.

- [ ] **Step 1: Delete `src/terminal/` directory**

Remove all 12 files in `src/terminal/`:
- `src/terminal/controllers/*`
- `src/terminal/routes/*`
- `src/terminal/services/*`

- [ ] **Step 2: Remove `scripts/gt.js` and `scripts/install-gt.sh`**

Delete both files from `scripts/` (retain `scripts/deploy.sh`).

- [ ] **Step 3: Update root `package.json`**

Remove:
- `"bin": { "gt": "./scripts/gt.js" }`
- `"scripts": { "gt": "node scripts/gt.js", ... }`
- `dependencies`: `"node-pty"`, `"ws"`
- `devDependencies`: `"@types/ws"`

- [ ] **Step 4: Run backend TypeScript compilation**

Run: `npm run build:backend`
Expected: PASS with 0 errors.

- [ ] **Step 5: Commit**

```bash
git rm -r src/terminal scripts/gt.js scripts/install-gt.sh
git add package.json
git commit -m "refactor: delete terminal backend module and remove node-pty and ws dependencies"
```

---

### Task 4: Clean Frontend Terminal Views, Navigation, and Dependencies

**Files:**
- Delete: `frontend/src/components/terminal/` (entire directory)
- Delete: `frontend/src/components/WebTerminalView.tsx`
- Delete: `frontend/src/components/UnifiedTerminalView.tsx`
- Delete: `frontend/src/components/TerminalLogsView.tsx`
- Delete: `frontend/src/utils/terminalFilter.ts`
- Delete: `frontend/src/utils/terminalKeyEncoder.ts`
- Delete: `frontend/src/utils/terminalScrollHelper.ts`
- Delete: `frontend/src/utils/terminalMagnifierHelper.ts`
- Delete: `frontend/src/utils/terminalImeHelper.ts`
- Delete: `frontend/src/utils/mobileViewportHelper.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Modify: `frontend/src/components/AccountsView.tsx`
- Modify: `frontend/src/components/ConfigModal.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: React, Vite, Tailwind CSS.
- Produces: Clean frontend without xterm dependencies, rendering only Dashboard, Accounts, Logs, Playground, Translate, and Custom Web Apps.

- [ ] **Step 1: Delete frontend terminal components and utility files**

Delete:
- `frontend/src/components/terminal/`
- `frontend/src/components/WebTerminalView.tsx`
- `frontend/src/components/UnifiedTerminalView.tsx`
- `frontend/src/components/TerminalLogsView.tsx`
- `frontend/src/utils/terminal*.ts`
- `frontend/src/utils/mobileViewportHelper.ts`

- [ ] **Step 2: Update `frontend/src/App.tsx`**

- Update `DiscoverSubView` to `'hub' | 'playground' | 'translate' | 'embeddedWeb'`.
- Remove `#terminal` / `/terminal` route handlers and listeners.
- Remove imports and rendering of `UnifiedTerminalView` and `TerminalLogsView`.

- [ ] **Step 3: Update `frontend/src/components/DiscoverHubView.tsx`**

- Update `DiscoverToolId` to `'playground' | 'translate'`.
- Remove "Web Terminal" and "System Console Logs" card blocks from the grid.

- [ ] **Step 4: Clean `frontend/src/components/AccountsView.tsx` and `ConfigModal.tsx`**

- In `AccountsView.tsx`: remove `terminalLogsEndRef` and periodic 3s terminal log fetch interval.
- In `ConfigModal.tsx`: remove `fetchAvailableHosts`, `availableHosts`, and `agentId` inputs for upstream servers.

- [ ] **Step 5: Clean `frontend/src/index.css` and i18n locales**

- In `index.css`: remove `.terminal-select-mode` rules.
- In `zh.ts` and `en.ts`: remove `terminal` namespace and title/desc entries.

- [ ] **Step 6: Update `frontend/package.json`**

Remove `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`.

- [ ] **Step 7: Build frontend and verify zero errors**

Run: `npm run build:frontend`
Expected: PASS with 0 TypeScript and bundling errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "refactor(frontend): remove terminal and system log views and xterm dependencies"
```

---

### Task 5: Clean Test Suite and Update CI/CD Workflow

**Files:**
- Delete: `tests/terminal*.test.ts`
- Delete: `tests/gt*.test.ts`
- Delete: `tests/agent*.test.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: GitHub Actions runner, Jest test framework.
- Produces: Streamlined test suite executing in seconds; CI/CD workflow fetching CLI from standalone terminal server.

- [ ] **Step 1: Remove terminal-specific test files**

Delete all `tests/terminal*.test.ts`, `tests/gt*.test.ts`, `tests/agent*.test.ts`, `tests/claudeControllerAgentEgress.test.ts`.

- [ ] **Step 2: Update `.github/workflows/deploy.yml`**

Update the deployment step to download and execute `gt` CLI externally:
```yaml
      - name: Validate configuration & Deploy via gt
        env:
          TERMINAL_SERVER: ${{ secrets.TERMINAL_SERVER }}
          ADMIN_SECRET_KEY: ${{ secrets.ADMIN_SECRET_KEY }}
          DEPLOY_PATH: ${{ secrets.DEPLOY_PATH }}
          TARGET_HOST: ${{ secrets.GT_HOST || 'gemini-proxy-server' }}
        run: |
          # 1. Validate required GitHub Secrets
          MISSING=""
          [ -z "$TERMINAL_SERVER" ] && MISSING="$MISSING TERMINAL_SERVER"
          [ -z "$ADMIN_SECRET_KEY" ] && MISSING="$MISSING ADMIN_SECRET_KEY"
          [ -z "$DEPLOY_PATH" ] && MISSING="$MISSING DEPLOY_PATH"

          if [ -n "$MISSING" ]; then
            echo "::error::Missing required GitHub Secrets:${MISSING}"
            exit 1
          fi

          # 2. Fetch standalone gt CLI
          curl -fsSL "${TERMINAL_SERVER}/install.sh" | bash -s -- --cli-only
          export PATH="$HOME/.gt/bin:$PATH"

          # 3. Trigger remote deployment
          gt exec \
            --server "$TERMINAL_SERVER" \
            --key "$ADMIN_SECRET_KEY" \
            --verbose \
            -w "$DEPLOY_PATH" \
            "$TARGET_HOST" \
            npm run deploy
```

- [ ] **Step 3: Update `CLAUDE.md`**

Update repository documentation to reflect the pure stateless LLM proxy architecture, removing `gt` CLI internal commands and terminal module sections.

- [ ] **Step 4: Run all remaining unit tests**

Run: `npm test`
Expected: 100% test suites pass cleanly.

- [ ] **Step 5: Run full project build**

Run: `npm run build`
Expected: Both frontend and backend compile cleanly.

- [ ] **Step 6: Commit**

```bash
git add tests/ .github/workflows/deploy.yml CLAUDE.md
git commit -m "chore: prune terminal tests and update deploy workflow and CLAUDE.md"
```

---

### Task 6: Initialize Standalone `gt-server` Repository Structure (Export Preparation)

**Files:**
- Create: `docs/gt-server-bootstrap/` (or dedicated staging bundle for new repo)

**Interfaces:**
- Consumes: The original terminal backend and frontend files stored in git history.
- Produces: Ready-to-publish project structure for `gt-server`.

- [ ] **Step 1: Document migration guide and bootstrap script**

Create `docs/gt-server-bootstrap/README.md` containing instructions on how to initialize the standalone `gt-server` repo with the extracted files and unit tests.

- [ ] **Step 2: Commit**

```bash
git add docs/gt-server-bootstrap/
git commit -m "docs: add standalone gt-server bootstrap documentation"
```

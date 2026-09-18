# Terminal Subsystem Extraction (`src/terminal/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract terminal logic, dynamic reverse agent tunnels, remote file RPC, standalone command execution, and terminal logging out of `src/admin/` into a dedicated, first-class subsystem `src/terminal/`, providing new primary `/api/terminal/*` routes with seamless backward compatibility for existing `/api/admin/terminal/*` endpoints.

**Architecture:** 
- Organize `src/terminal/` into `controllers/`, `routes/`, and `services/`, mirroring `src/proxy/` and `src/admin/`.
- Mount `terminalRoutes` at `/api/terminal` in `src/app.ts`, and retain backward-compatible route aliases under `/api/admin/terminal/*` in `adminRoutes.ts`.
- Upgrade `terminalWs.ts` to accept WebSocket handshakes on both `/api/terminal/{ws,agent-ws}` and `/api/admin/terminal/{ws,agent-ws}`.
- Migrate `frontend/` components and `scripts/terminal-agent.js` to target the new primary routes while retaining compatibility.
- Update all associated test suites and architectural documentation.

**Tech Stack:** TypeScript, Node.js, Express, WebSocket (`ws`), React, Jest.

## Global Constraints

- **Three Subsystems**: Backend must be cleanly partitioned into `src/proxy/`, `src/terminal/`, and `src/admin/`.
- **100% Backward Compatibility**: Existing agents or external tools calling `/api/admin/terminal/*`, `/api/admin/terminal-logs`, `/api/admin/terminal/ws`, or `/api/admin/terminal/agent-ws` must continue to work without breaking.
- **Zero Dead Code**: Old terminal controllers and services must be deleted from `src/admin/`.
- **Strict Quality**: All 111 test suites must pass, with 0 compilation errors across `npm run build`.

---

### Task 1: Migrate Terminal Services to `src/terminal/services/`

**Files:**
- Create:
  - `src/terminal/services/terminalHostManager.ts` (moved from `src/admin/services/terminalHostManager.ts`)
  - `src/terminal/services/terminalFileService.ts` (moved from `src/admin/services/terminalFileService.ts`)
  - `src/terminal/services/terminalExecService.ts` (moved from `src/admin/services/terminalExecService.ts`)
  - `src/terminal/services/terminalLogService.ts` (moved from `src/admin/services/terminalLogService.ts`)
  - `src/terminal/services/terminalService.ts` (moved from `src/admin/services/terminalService.ts`)
- Delete:
  - `src/admin/services/terminalHostManager.ts`
  - `src/admin/services/terminalFileService.ts`
  - `src/admin/services/terminalExecService.ts`
  - `src/admin/services/terminalLogService.ts`
  - `src/admin/services/terminalService.ts`

**Interfaces:**
- Produces:
  - `src/terminal/services/terminalHostManager.ts` (`terminalHostManager`, `RemoteAgentTerminalSession`, `stripTerminalQuerySequences`)
  - `src/terminal/services/terminalFileService.ts` (`terminalFileService`)
  - `src/terminal/services/terminalExecService.ts` (`terminalExecService`)
  - `src/terminal/services/terminalLogService.ts` (`terminalLogService`)
  - `src/terminal/services/terminalService.ts` (`spawnTerminalSession`)

- [ ] **Step 1: Move service files to `src/terminal/services/`**

Create directory `src/terminal/services/` and move the 5 service files.
Check and update relative imports in the moved services:
1. `src/terminal/services/terminalHostManager.ts`:
   - `import logger from '../../utils/logger';` (correct relative path from `src/terminal/services/`)
2. `src/terminal/services/terminalFileService.ts`:
   - `import logger from '../../utils/logger';`
   - `import { terminalHostManager } from './terminalHostManager';`
3. `src/terminal/services/terminalExecService.ts`:
   - `import { terminalHostManager } from './terminalHostManager';`
4. `src/terminal/services/terminalLogService.ts`:
   - Pure EventEmitter, no relative imports.
5. `src/terminal/services/terminalService.ts`:
   - `import logger from '../../utils/logger';`
   - Check `ensureSpawnHelperPermissions`: resolve paths relative to root or `process.cwd()`.

- [ ] **Step 2: Delete old terminal services from `src/admin/services/`**

Remove the 5 old terminal files from `src/admin/services/`.

- [ ] **Step 3: Update existing imports in `src/admin/controllers/` temporarily to ensure build passes**

In `src/admin/controllers/adminController.ts`:
```typescript
import terminalLogService from '../../terminal/services/terminalLogService';
import { terminalHostManager } from '../../terminal/services/terminalHostManager';
```
In `src/admin/controllers/terminalExecController.ts`:
```typescript
import terminalExecService from '../../terminal/services/terminalExecService';
```
In `src/admin/controllers/terminalFileController.ts`:
```typescript
import terminalFileService from '../../terminal/services/terminalFileService';
```
In `src/admin/routes/terminalWs.ts`:
```typescript
import { terminalHostManager } from '../../terminal/services/terminalHostManager';
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npm run build:backend`
Expected: Passes with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/terminal/services/ src/admin/
git commit -m "refactor(terminal): migrate terminal services to src/terminal/services"
```

---

### Task 2: Create Terminal Controllers & Routes in `src/terminal/`

**Files:**
- Create:
  - `src/terminal/controllers/terminalHostController.ts`
  - `src/terminal/controllers/terminalLogController.ts`
  - `src/terminal/controllers/terminalFileController.ts` (moved from `src/admin/controllers/terminalFileController.ts`)
  - `src/terminal/controllers/terminalExecController.ts` (moved from `src/admin/controllers/terminalExecController.ts`)
  - `src/terminal/routes/terminalRoutes.ts`
  - `src/terminal/routes/terminalWs.ts` (moved and enhanced from `src/admin/routes/terminalWs.ts`)
- Delete:
  - `src/admin/controllers/terminalFileController.ts`
  - `src/admin/controllers/terminalExecController.ts`
  - `src/admin/routes/terminalWs.ts`

**Interfaces:**
- Produces:
  - `terminalHostController`: `getHosts(req, res)`, `pruneOfflineHosts(req, res)`
  - `terminalLogController`: `getTerminalLogs(req, res)`
  - `terminalFileController`: full RPC file controllers
  - `terminalExecController`: `startExec`, `getExecStatus`, `killExec`, `listExec`
  - `terminalRoutes`: Express router exposing `/hosts`, `/hosts/offline`, `/files/*`, `/exec/*`, `/logs`
  - `terminalWs`: `setupTerminalWebSocket(server: http.Server): WebSocketServer` supporting dual paths (`/api/terminal/*` and `/api/admin/terminal/*`)

- [ ] **Step 1: Create `src/terminal/controllers/terminalHostController.ts`**

Extract host methods from `adminController.ts`:
```typescript
import { Request, Response } from 'express';
import { terminalHostManager } from '../services/terminalHostManager';

class TerminalHostController {
  public async getHosts(req: Request, res: Response): Promise<void> {
    const hosts = terminalHostManager.getHosts();
    res.json({ hosts });
  }

  public async pruneOfflineHosts(req: Request, res: Response): Promise<void> {
    const prunedIds = terminalHostManager.pruneOfflineHosts(0);
    res.json({
      success: true,
      prunedCount: prunedIds.length,
      prunedIds,
    });
  }
}

export const terminalHostController = new TerminalHostController();
export default terminalHostController;
```

- [ ] **Step 2: Create `src/terminal/controllers/terminalLogController.ts`**

Extract terminal log streaming & retrieval from `adminController.ts`:
```typescript
import { Request, Response } from 'express';
import terminalLogService, { TerminalLogEntry } from '../services/terminalLogService';

class TerminalLogController {
  public async getTerminalLogs(req: Request, res: Response): Promise<void> {
    const stream = req.query.stream === 'true';

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const logs = terminalLogService.getHistory();
      for (const log of logs) {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      }

      const onLog = (entry: TerminalLogEntry) => {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      };

      terminalLogService.on('log', onLog);

      req.on('close', () => {
        terminalLogService.off('log', onLog);
      });
    } else {
      res.json({ logs: terminalLogService.getHistory() });
    }
  }
}

export const terminalLogController = new TerminalLogController();
export default terminalLogController;
```

- [ ] **Step 3: Move `terminalFileController.ts` and `terminalExecController.ts` to `src/terminal/controllers/`**

Move `src/admin/controllers/terminalFileController.ts` to `src/terminal/controllers/terminalFileController.ts`:
- Update import: `import terminalFileService from '../services/terminalFileService';`

Move `src/admin/controllers/terminalExecController.ts` to `src/terminal/controllers/terminalExecController.ts`:
- Update import: `import terminalExecService from '../services/terminalExecService';`

Delete the two files from `src/admin/controllers/`.

- [ ] **Step 4: Create `src/terminal/routes/terminalRoutes.ts`**

```typescript
import { Router } from 'express';
import terminalHostController from '../controllers/terminalHostController';
import terminalFileController from '../controllers/terminalFileController';
import terminalExecController from '../controllers/terminalExecController';
import terminalLogController from '../controllers/terminalLogController';
import adminAuthMiddleware from '../../admin/middlewares/adminAuth';

const router = Router();

router.use(adminAuthMiddleware);

// Host Management
router.get('/hosts', (req, res) => terminalHostController.getHosts(req, res));
router.delete('/hosts/offline', (req, res) => terminalHostController.pruneOfflineHosts(req, res));

// Remote File Management
router.get('/files/list', (req, res) => terminalFileController.listFiles(req, res));
router.get('/files/content', (req, res) => terminalFileController.readFileContent(req, res));
router.post('/files/save', (req, res) => terminalFileController.saveFileContent(req, res));
router.post('/files/mkdir', (req, res) => terminalFileController.createDirectory(req, res));
router.post('/files/rename', (req, res) => terminalFileController.renameFile(req, res));
router.delete('/files/delete', (req, res) => terminalFileController.deleteItem(req, res));
router.get('/files/download', (req, res) => terminalFileController.downloadFile(req, res));
router.post('/files/upload', (req, res) => terminalFileController.uploadFile(req, res));

// Standalone Command Execution
router.post('/exec/:hostId', (req, res) => terminalExecController.startExec(req, res));
router.get('/exec/:hostId/:taskId', (req, res) => terminalExecController.getExecStatus(req, res));
router.post('/exec/:hostId/:taskId/kill', (req, res) => terminalExecController.killExec(req, res));
router.get('/exec/:hostId', (req, res) => terminalExecController.listExec(req, res));

// System Console Logs
router.get('/logs', (req, res) => terminalLogController.getTerminalLogs(req, res));

export default router;
```

- [ ] **Step 5: Move and upgrade `terminalWs.ts` to `src/terminal/routes/terminalWs.ts`**

Move `src/admin/routes/terminalWs.ts` to `src/terminal/routes/terminalWs.ts`.
Update imports:
```typescript
import config from '../../../config/default';
import logger from '../../utils/logger';
import { terminalHostManager } from '../services/terminalHostManager';
```
Update WebSocket URL prefix detection to support both `/api/terminal/` and legacy `/api/admin/terminal/`:
```typescript
    const reqUrl = req.url || '';
    const isClientWs = reqUrl.startsWith('/api/terminal/ws') || reqUrl.startsWith('/api/admin/terminal/ws');
    const isAgentWs = reqUrl.startsWith('/api/terminal/agent-ws') || reqUrl.startsWith('/api/admin/terminal/agent-ws');
```
Delete `src/admin/routes/terminalWs.ts`.

- [ ] **Step 6: Verify backend compilation**

Run: `npm run build:backend`
Expected: Compilation passes or only reports imports in `src/app.ts` / `src/index.ts` / `src/admin/routes/adminRoutes.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/terminal/
git commit -m "feat(terminal): add terminal controllers and routes with dual websocket path support"
```

---

### Task 3: Mount Routes in `src/app.ts`, `src/admin/routes/adminRoutes.ts`, Update `src/index.ts`, and Slim Down `adminController.ts`

**Files:**
- Modify: `src/app.ts`
- Modify: `src/index.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Modify: `src/admin/controllers/adminController.ts`

**Interfaces:**
- Updates:
  - `src/app.ts` mounts `app.use('/api/terminal', terminalRoutes)`
  - `src/admin/routes/adminRoutes.ts` mounts compatibility aliases (`router.use('/terminal', terminalRoutes)`, `router.get('/terminal-logs', ...)`)
  - `src/index.ts` imports `setupTerminalWebSocket` from `./terminal/routes/terminalWs`
  - `src/admin/controllers/adminController.ts` removes extracted terminal logic

- [ ] **Step 1: Update `src/app.ts`**

In `src/app.ts`:
```typescript
import claudeRoutes from './proxy/routes/claudeRoutes';
import geminiRoutes from './proxy/routes/geminiRoutes';
import adminRoutes from './admin/routes/adminRoutes';
import terminalRoutes from './terminal/routes/terminalRoutes';
```
Mount routes:
```typescript
app.use('/v1beta', geminiRoutes);
app.use('/v1', claudeRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/admin', adminRoutes);
```
Update static fallback check:
```typescript
if (req.path.startsWith('/v1beta') || req.path.startsWith('/v1') || req.path.startsWith('/api') || req.path === '/health') {
  return next();
}
```

- [ ] **Step 2: Update `src/index.ts`**

In `src/index.ts`:
```typescript
import { setupTerminalWebSocket } from './terminal/routes/terminalWs';
```

- [ ] **Step 3: Update `src/admin/routes/adminRoutes.ts` with backward compatibility aliases**

In `src/admin/routes/adminRoutes.ts`:
```typescript
import { Router } from 'express';
import adminController from '../controllers/adminController';
import accountController from '../controllers/accountController';
import terminalRoutes from '../../terminal/routes/terminalRoutes';
import terminalLogController from '../../terminal/controllers/terminalLogController';
import adminAuthMiddleware from '../middlewares/adminAuth';

const router = Router();

router.use(adminAuthMiddleware);

// Admin Core Routes
router.get('/status', (req, res) => adminController.getStatus(req, res));
router.get('/models', (req, res) => adminController.getModels(req, res));
router.get('/logs', (req, res) => adminController.getLogs(req, res));
router.get('/logs/:date/:hour/:filename', (req, res) => adminController.getLogDetail(req, res));
router.get('/stats', (req, res) => adminController.getStats(req, res));
router.post('/config', (req, res) => adminController.updateConfig(req, res));

// Backward Compatibility Aliases for Terminal
router.use('/terminal', terminalRoutes);
router.get('/terminal-logs', (req, res) => terminalLogController.getTerminalLogs(req, res));

// Account Management Routes
router.get('/accounts/status', (req, res) => accountController.getStatus(req, res));
router.post('/accounts/upload', (req, res) => accountController.upload(req, res));
router.post('/accounts/toggle-disabled', (req, res) => accountController.toggleDisabled(req, res));
router.post('/accounts/:index/close-context', (req, res) => accountController.closeContext(req, res));
router.delete('/accounts/:index', (req, res) => accountController.deleteAccount(req, res));
router.post('/accounts/batch-delete', (req, res) => accountController.batchDelete(req, res));
router.post('/accounts/deduplicate', (req, res) => accountController.deduplicate(req, res));
router.put('/accounts/current', (req, res) => accountController.switchCurrent(req, res));
router.get('/accounts/files/:filename', (req, res) => accountController.downloadFile(req, res));
router.post('/accounts/batch-download', (req, res) => accountController.batchDownload(req, res));

export default router;
```

- [ ] **Step 4: Clean up `src/admin/controllers/adminController.ts`**

Remove unused imports: `terminalLogService`, `terminalHostManager`.
Remove `getTerminalHosts`, `pruneOfflineTerminalHosts`, `getTerminalLogs`.

- [ ] **Step 5: Verify backend compilation**

Run: `npm run build:backend`
Expected: Passes with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/index.ts src/admin/routes/adminRoutes.ts src/admin/controllers/adminController.ts
git commit -m "refactor(admin): mount terminalRoutes and establish backward compatibility aliases"
```

---

### Task 4: Upgrade Frontend Endpoints & Agent Connection URL

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/components/terminal/TerminalHostSelector.tsx`
- Modify: `frontend/src/components/terminal/TerminalFileManagerView.tsx`
- Modify: `frontend/src/components/TerminalLogsView.tsx`
- Modify: `scripts/terminal-agent.js`

**Interfaces:**
- Produces: Frontend and Agent pointing primarily to `/api/terminal/*`

- [ ] **Step 1: Update `frontend/src/components/WebTerminalView.tsx`**

Change WebSocket connection path:
```typescript
const wsUrl = `${protocol}//${host}/api/terminal/ws?x-admin-key=${encodeURIComponent(adminKey)}&hostId=${encodeURIComponent(activeHostIdRef.current)}`;
```

- [ ] **Step 2: Update `frontend/src/components/terminal/TerminalHostSelector.tsx`**

Change fetch paths:
- `/api/admin/terminal/hosts` -> `/api/terminal/hosts`
- `/api/admin/terminal/hosts/offline` -> `/api/terminal/hosts/offline`

- [ ] **Step 3: Update `frontend/src/components/terminal/TerminalFileManagerView.tsx`**

Replace occurrences of `/api/admin/terminal/files/` with `/api/terminal/files/`:
- `list`: `/api/terminal/files/list`
- `download`: `/api/terminal/files/download`
- `content`: `/api/terminal/files/content`
- `save`: `/api/terminal/files/save`
- `upload`: `/api/terminal/files/upload`
- `mkdir`: `/api/terminal/files/mkdir`
- `rename`: `/api/terminal/files/rename`
- `delete`: `/api/terminal/files/delete`

- [ ] **Step 4: Update `frontend/src/components/TerminalLogsView.tsx`**

Change stream URL:
```typescript
const streamUrl = `/api/terminal/logs?stream=true${adminKey ? `&x-admin-key=${encodeURIComponent(adminKey)}` : ''}`;
```

- [ ] **Step 5: Update `scripts/terminal-agent.js`**

In `resolveWebSocketUrl(serverUrl)`:
Change:
```javascript
return `${wsUrl}/api/admin/terminal/agent-ws?${query.toString()}`;
```
to:
```javascript
return `${wsUrl}/api/terminal/agent-ws?${query.toString()}`;
```

- [ ] **Step 6: Build frontend to verify compilation**

Run: `npm run build:frontend`
Expected: Passes with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ scripts/terminal-agent.js
git commit -m "feat(frontend,agent): update terminal endpoints to /api/terminal"
```

---

### Task 5: Update Test Suites & Verify Dual-Route Compatibility

**Files:**
- Modify:
  - `tests/terminalHostsApi.test.ts`
  - `tests/terminalWs.test.ts`
  - `tests/terminalFileManager.test.ts`
  - `tests/terminalExecController.test.ts`
  - `tests/terminalExecService.test.ts`
  - `tests/terminalHostManager.test.ts`
  - `tests/terminalHostManagerCmdRpc.test.ts`
  - `tests/terminalAgentCommandExec.test.ts`
  - `tests/terminalAgentReconnectReset.test.ts`
  - `tests/terminalPersistence.test.ts`
  - `tests/terminalReplayMute.test.ts`
  - `tests/terminalLogService.test.ts`
  - `tests/terminalService.test.ts`
  - `tests/terminalZshEolEnv.test.ts`
  - `tests/terminalSyntheticEchoProtection.test.ts`
  - `tests/adminController.test.ts`

**Interfaces:**
- Verifies:
  - All terminal unit tests import from `../src/terminal/*`.
  - Integration tests verify requests succeed against both `/api/terminal/*` and legacy `/api/admin/terminal/*`.
  - WebSocket tests verify connections succeed against both `/api/terminal/ws` and legacy `/api/admin/terminal/ws`.

- [ ] **Step 1: Update import paths in terminal unit tests**

Update imports across the listed test files:
- Change `../src/admin/services/terminal*` to `../src/terminal/services/terminal*`
- Change `../src/admin/controllers/terminal*` to `../src/terminal/controllers/terminal*`
- Change `../src/admin/routes/terminalWs` to `../src/terminal/routes/terminalWs`

- [ ] **Step 2: Update `tests/terminalHostsApi.test.ts` with dual-route checks**

Verify that both `GET /api/terminal/hosts` and `GET /api/admin/terminal/hosts` succeed:
```typescript
const resNew = await request(app).get('/api/terminal/hosts').set('x-admin-key', 'valid-key');
expect(resNew.status).toBe(200);

const resLegacy = await request(app).get('/api/admin/terminal/hosts').set('x-admin-key', 'valid-key');
expect(resLegacy.status).toBe(200);
```

- [ ] **Step 3: Update `tests/terminalWs.test.ts` with dual-route checks**

Verify that connecting to either `ws://.../api/terminal/agent-ws` or `ws://.../api/admin/terminal/agent-ws` succeeds.
Verify that connecting to either `ws://.../api/terminal/ws` or `ws://.../api/admin/terminal/ws` succeeds.

- [ ] **Step 4: Update `tests/terminalExecController.test.ts` and `tests/terminalFileManager.test.ts`**

Update endpoint URLs or mock handlers to test `/api/terminal/*` while confirming `/api/admin/terminal/*` alias routes correctly.

- [ ] **Step 5: Run all terminal tests**

Run: `npx jest tests/terminal*.test.ts`
Expected: All terminal test suites PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test(terminal): update test imports to src/terminal and verify dual-route compatibility"
```

---

### Task 6: Documentation Synchronization & Full E2E Validation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Reflect the three backend subsystems (`src/proxy/`, `src/terminal/`, `src/admin/`) in the architecture section:
```markdown
- **Out-of-Band Admin & Web Console (`src/admin/`, `frontend/`):**
  - **Admin Controller & Routes (`src/admin/controllers/`, `src/admin/routes/`):** Exposes `/api/admin/status`, `/api/admin/stats`, `/api/admin/models`, `/api/admin/logs`, and `/api/admin/config`.
  ...
- **WebTerminal & Multi-Host Reverse Agent (`src/terminal/`, `frontend/src/components/terminal/`):**
  - **Terminal Subsystem (`src/terminal/`):** Exposes `/api/terminal/hosts`, `/api/terminal/files/*`, `/api/terminal/exec/*`, and `/api/terminal/logs` (with backward compatibility aliases under `/api/admin/terminal/*`).
  ...
```

- [ ] **Step 2: Update `README.md`**

Update project structure tree to display `src/terminal/` alongside `src/proxy/` and `src/admin/`.
Update API documentation for terminal endpoints to reference `/api/terminal/*` (with a note regarding `/api/admin/terminal/*` backward compatibility).

- [ ] **Step 3: Run full clean build**

Run: `npm run build`
Expected: Frontend (`vite build`) and backend (`tsc`) pass with 0 errors.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: 111 / 111 test suites pass (614+ tests passed, 0 failures).

- [ ] **Step 5: Final Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update architecture documentation for src/terminal subsystem"
git status
```
Expected: Clean working tree.

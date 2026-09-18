# Backend Architecture Restructuring (`src/proxy/`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the backend project structure into two clean, symmetrical subsystems (`src/proxy/` and `src/admin/`), moving core proxy controllers, routes, and services under `src/proxy/` and eliminating obsolete top-level directories.

**Architecture:** 
- Establish `src/proxy/{controllers, routes, services}` to mirror `src/admin/{controllers, routes, services, middlewares}`.
- Relocate `claudeTranslator.ts` and `payloadLogger.ts` to `src/proxy/services/`, update admin log service imports.
- Relocate `claudeController.ts` and `geminiController.ts` to `src/proxy/controllers/`, `claudeRoutes.ts` and `geminiRoutes.ts` to `src/proxy/routes/`, and update `src/app.ts`.
- Cleanly delete root-level `src/controllers/`, `src/routes/`, and `src/services/`.
- Update all test mocks and imports in `tests/` to guarantee all 111 test suites pass with zero regressions.

**Tech Stack:** TypeScript, Node.js, Express, Jest.

## Global Constraints

- Symmetrical Subsystems: All core proxy logic resides strictly within `src/proxy/`, admin logic strictly within `src/admin/`.
- Zero Dead Code: Top-level `src/controllers/`, `src/routes/`, and `src/services/` directories must be completely removed.
- Zero Regressions: All existing proxy API contracts (`/v1/*`, `/v1beta/*`, `/api/admin/*`) and all 111 test suites must pass cleanly.
- Strict Type Safety: No type errors under `npm run build:backend` or `npm run build`.

---

### Task 1: Migrate Core Proxy Services (`src/services/` -> `src/proxy/services/`) & Update Admin References

**Files:**
- Create: `src/proxy/services/claudeTranslator.ts` (moved from `src/services/claudeTranslator.ts`)
- Create: `src/proxy/services/payloadLogger.ts` (moved from `src/services/payloadLogger.ts`)
- Modify: `src/admin/services/logService.ts`
- Delete: `src/services/claudeTranslator.ts`, `src/services/payloadLogger.ts`, `src/services/`

**Interfaces:**
- Produces:
  - `src/proxy/services/claudeTranslator.ts` exporting `default claudeTranslator`
  - `src/proxy/services/payloadLogger.ts` exporting `default payloadLogger` and `LogIndexRecord`
- Updates:
  - `src/admin/services/logService.ts` importing from `../../proxy/services/payloadLogger` and `../../proxy/services/claudeTranslator`

- [ ] **Step 1: Move services to `src/proxy/services/` and adjust internal imports**

1. Create directory `src/proxy/services/`.
2. Move `src/services/claudeTranslator.ts` to `src/proxy/services/claudeTranslator.ts`:
   - Update config import: `import config from '../../../config/default';`
   - Update models.json import: `import modelsData from '../../../config/models.json';`
   - Update logger import: `import logger from '../../utils/logger';`
   - Update requestHelper import: `import { getUpstreamUrl } from '../../utils/requestHelper';`
3. Move `src/services/payloadLogger.ts` to `src/proxy/services/payloadLogger.ts`:
   - Update config import: `import config from '../../../config/default';`
   - Update logger import: `import logger from '../../utils/logger';`
   - Update requestHelper import: `import { sanitizeData } from '../../utils/requestHelper';`
   - Update metricsService import: `import metricsService from '../../admin/services/metricsService';`
   - Update claudeTranslator import: `import claudeTranslator from './claudeTranslator';`
4. Delete old `src/services/` directory.

- [ ] **Step 2: Update `src/admin/services/logService.ts` imports**

In `src/admin/services/logService.ts`, change:
```typescript
import { LogIndexRecord } from '../../services/payloadLogger';
import claudeTranslator from '../../services/claudeTranslator';
```
to:
```typescript
import { LogIndexRecord } from '../../proxy/services/payloadLogger';
import claudeTranslator from '../../proxy/services/claudeTranslator';
```

- [ ] **Step 3: Update `src/controllers/` temporary references so current code builds**

In `src/controllers/claudeController.ts` and `src/controllers/geminiController.ts`, change:
```typescript
import claudeTranslator from '../services/claudeTranslator';
import payloadLogger from '../services/payloadLogger';
```
to:
```typescript
import claudeTranslator from '../proxy/services/claudeTranslator';
import payloadLogger from '../proxy/services/payloadLogger';
```

- [ ] **Step 4: Verify backend compilation**

Run: `npm run build:backend`
Expected: Passes without errors in `src/proxy/services/` or `src/admin/services/`.

- [ ] **Step 5: Commit**

```bash
git add src/proxy/services/ src/admin/services/logService.ts src/controllers/
git rm -r src/services/
git commit -m "refactor(proxy): migrate core services to src/proxy/services"
```

---

### Task 2: Migrate Core Proxy Controllers & Routes (`src/controllers/`, `src/routes/` -> `src/proxy/`) & Update `src/app.ts`

**Files:**
- Create: `src/proxy/controllers/claudeController.ts` (moved from `src/controllers/claudeController.ts`)
- Create: `src/proxy/controllers/geminiController.ts` (moved from `src/controllers/geminiController.ts`)
- Create: `src/proxy/routes/claudeRoutes.ts` (moved from `src/routes/claudeRoutes.ts`)
- Create: `src/proxy/routes/geminiRoutes.ts` (moved from `src/routes/geminiRoutes.ts`)
- Modify: `src/app.ts`
- Delete: `src/controllers/`, `src/routes/`

**Interfaces:**
- Produces:
  - `src/proxy/controllers/claudeController.ts`
  - `src/proxy/controllers/geminiController.ts`
  - `src/proxy/routes/claudeRoutes.ts`
  - `src/proxy/routes/geminiRoutes.ts`
- Updates:
  - `src/app.ts` mounting `claudeRoutes` and `geminiRoutes` from `./proxy/routes/*`

- [ ] **Step 1: Move controllers to `src/proxy/controllers/` and adjust imports**

1. Create directory `src/proxy/controllers/`.
2. Move `src/controllers/claudeController.ts` to `src/proxy/controllers/claudeController.ts`:
   - Config: `import config from '../../../config/default';`
   - Services:
     ```typescript
     import payloadLogger from '../services/payloadLogger';
     import claudeTranslator from '../services/claudeTranslator';
     ```
   - Utils:
     ```typescript
     import logger from '../../utils/logger';
     import { StreamLifecycleManager } from '../../utils/streamLifecycleManager';
     import {
       extractClientKey,
       extractTimeoutMs,
       extractClientSchedulingStrategy,
       getUpstreamUrl,
       generateShortId,
       buildUpstreamHeaders
     } from '../../utils/requestHelper';
     ```
3. Move `src/controllers/geminiController.ts` to `src/proxy/controllers/geminiController.ts`:
   - Config: `import config from '../../../config/default';`
   - Services:
     ```typescript
     import payloadLogger from '../services/payloadLogger';
     import claudeTranslator from '../services/claudeTranslator';
     ```
   - Utils:
     ```typescript
     import logger from '../../utils/logger';
     import { StreamLifecycleManager } from '../../utils/streamLifecycleManager';
     import {
       extractClientKey,
       extractTimeoutMs,
       extractClientSchedulingStrategy,
       getUpstreamUrl,
       generateShortId,
       buildUpstreamHeaders
     } from '../../utils/requestHelper';
     ```
4. Delete old `src/controllers/` directory.

- [ ] **Step 2: Move routes to `src/proxy/routes/` and adjust imports**

1. Create directory `src/proxy/routes/`.
2. Move `src/routes/claudeRoutes.ts` to `src/proxy/routes/claudeRoutes.ts`:
   ```typescript
   import { Router, Request, Response } from 'express';
   import claudeController from '../controllers/claudeController';
   import geminiController from '../controllers/geminiController';
   ```
3. Move `src/routes/geminiRoutes.ts` to `src/proxy/routes/geminiRoutes.ts`:
   ```typescript
   import { Router, Request, Response } from 'express';
   import geminiController from '../controllers/geminiController';
   ```
4. Delete old `src/routes/` directory.

- [ ] **Step 3: Update `src/app.ts`**

In `src/app.ts`, change:
```typescript
import claudeRoutes from './routes/claudeRoutes';
import geminiRoutes from './routes/geminiRoutes';
```
to:
```typescript
import claudeRoutes from './proxy/routes/claudeRoutes';
import geminiRoutes from './proxy/routes/geminiRoutes';
```

- [ ] **Step 4: Verify backend compilation**

Run: `npm run build:backend`
Expected: Passes with 0 errors.

- [ ] **Step 5: Verify old directories are completely gone**

Run: `ls src/controllers src/routes src/services 2>&1`
Expected: "No such file or directory" for all three.

- [ ] **Step 6: Commit**

```bash
git add src/proxy/ src/app.ts
git rm -r src/controllers/ src/routes/
git commit -m "refactor(proxy): migrate controllers and routes to src/proxy"
```

---

### Task 3: Update Test Suite Mocks and Imports in `tests/`

**Files:**
- Modify:
  - `tests/claudeController.test.ts`
  - `tests/geminiController.test.ts`
  - `tests/claudeTranslator.test.ts`
  - `tests/payloadLogger.test.ts`
  - `tests/logCleanup.test.ts`
  - `tests/claudeLogging.test.ts`
  - `tests/dynamicConfigHotReload.test.ts`
  - `tests/claudeControllerStreamLifecycle.test.ts`
  - `tests/claudeCountTokens.test.ts`
  - `tests/claudeModels.test.ts`
  - `tests/claudeStreaming.test.ts`
  - `tests/geminiRoutesIntegration.test.ts`

**Interfaces:**
- Consumes: `src/proxy/controllers/*`, `src/proxy/services/*`
- Produces: 100% passing tests for all test files under `tests/`

- [ ] **Step 1: Update `tests/claudeController.test.ts`**

Update imports and mocks:
```typescript
import claudeController from '../src/proxy/controllers/claudeController';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));
```

- [ ] **Step 2: Update `tests/geminiController.test.ts`**

Update imports and mocks:
```typescript
import geminiController from '../src/proxy/controllers/geminiController';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));
```
And inside test: `const payloadLogger = require('../src/proxy/services/payloadLogger');`

- [ ] **Step 3: Update `tests/claudeTranslator.test.ts` & `tests/dynamicConfigHotReload.test.ts`**

Update imports:
```typescript
import translator from '../src/proxy/services/claudeTranslator';
```

- [ ] **Step 4: Update `tests/payloadLogger.test.ts`, `tests/logCleanup.test.ts`, `tests/claudeLogging.test.ts`**

Update imports:
```typescript
import payloadLogger from '../src/proxy/services/payloadLogger';
```

- [ ] **Step 5: Update `jest.mock('../src/services/payloadLogger')` in remaining tests**

In:
- `tests/claudeControllerStreamLifecycle.test.ts`
- `tests/claudeCountTokens.test.ts`
- `tests/claudeModels.test.ts`
- `tests/claudeStreaming.test.ts`
- `tests/geminiRoutesIntegration.test.ts`

Change:
`jest.mock('../src/services/payloadLogger', ...)`
to:
`jest.mock('../src/proxy/services/payloadLogger', ...)`

- [ ] **Step 6: Run test suite to verify tests pass**

Run: `npx jest tests/claudeController.test.ts tests/geminiController.test.ts tests/claudeTranslator.test.ts tests/payloadLogger.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/
git commit -m "test(proxy): update test imports and mocks to src/proxy"
```

---

### Task 4: Documentation Synchronization & Full Verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update `CLAUDE.md` Architecture description**

Update section:
```markdown
- **Core Proxy Pipelines (`src/proxy/routes/`, `src/proxy/controllers/`, `src/proxy/services/`):** 
  - **Claude Translation Proxy (`claudeRoutes.ts`, `claudeController.ts`, `claudeTranslator.ts`):** Routes incoming `/v1/messages`, `/v1/messages/count_tokens`, `/v1/models`, and `/v1/models/:model_id` requests to `claudeController.ts`...
  - **Native Gemini API Proxy (`geminiRoutes.ts`, `geminiController.ts`):** Handles native Google Gemini protocol requests under `/v1beta/*` and `/v1/models/*:*` without translation...
```

- [ ] **Step 2: Update `README.md` Project Tree**

Update directory tree in `README.md`:
```text
src/
├── admin/                 # 管理控制台后端逻辑
│   ├── controllers/       # Admin 控制器 (状态、统计、日志分卷、主机列表等)
│   ├── middlewares/       # 管理员密钥鉴权中间件 (x-admin-key)
│   ├── routes/            # Admin REST API 及 WebTerminal WebSocket 网关
│   └── services/          # TerminalHostManager, TerminalFileService, LogService 等
├── proxy/                 # 核心 API 代理与转译系统
│   ├── controllers/       # ClaudeController, GeminiController
│   ├── routes/            # ClaudeRoutes, GeminiRoutes
│   └── services/          # ClaudeTranslator, PayloadLogger
├── types/                 # 强类型定义声明
├── utils/                 # 通用工具 (logger, streamLifecycleManager, requestHelper)
├── app.ts                 # Express 应用注册、中间件绑定
└── index.ts               # 服务监听主启动入口
```

- [ ] **Step 3: Execute Full Build & Test Suite**

Run: `npm run build && npm test`
Expected:
1. `npm run build`: Frontend (`vite build`) and backend (`tsc`) pass with 0 errors.
2. `npm test`: All 111 test suites pass (614 passed, 1 skipped, 0 failed).

- [ ] **Step 4: Final Git Check & Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update architecture and project structure for src/proxy"
git status
```
Expected: Clean working tree.

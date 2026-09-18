# Design Doc: Backend Architecture Restructuring (`src/proxy/` & `src/admin/`)

- **Date:** 2026-09-18
- **Topic:** Optimize Backend Project Structure with Symmetrical `src/proxy/` and `src/admin/` Subsystems
- **Status:** Approved

## 1. Overview & Objectives

Currently, backend code in `src/` has a structural asymmetry:
- Administrative and auxiliary features are encapsulated under `src/admin/` (with its own `controllers/`, `routes/`, `services/`, and `middlewares/`).
- In contrast, the core API proxy and translation pipeline is scattered across root-level folders: `src/controllers/`, `src/routes/`, and `src/services/`.

This design restructures the backend into two clean, symmetrical, high-cohesion subsystems:
1. `src/proxy/`: Houses all proxy pipeline logic (Claude translation, native Gemini forwarding, transaction logging, streaming lifecycle).
2. `src/admin/`: Retains all out-of-band management, WebTerminal, file RPC, host management, metrics, and account features.
3. Clean removal of obsolete root-level `src/controllers/`, `src/routes/`, and `src/services/`.
4. Updating all internal imports, route assemblies in `src/app.ts`, and test suite mocks in `tests/`.

---

## 2. Target Directory Structure

```text
src/
├── admin/                           # Administrative, monitoring, terminal & account management
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   └── services/
├── proxy/                           # [NEW] Core API Proxy & Translation Subsystem
│   ├── controllers/
│   │   ├── claudeController.ts      (moved from src/controllers/)
│   │   └── geminiController.ts      (moved from src/controllers/)
│   ├── routes/
│   │   ├── claudeRoutes.ts          (moved from src/routes/)
│   │   └── geminiRoutes.ts          (moved from src/routes/)
│   └── services/
│       ├── claudeTranslator.ts      (moved from src/services/)
│       └── payloadLogger.ts         (moved from src/services/)
├── types/
│   └── index.ts                     # Global shared types
├── utils/                           # Global shared utilities (logger, requestHelper, streamLifecycleManager)
├── app.ts                           # Express app mounting
└── index.ts                         # Server entry point
```

---

## 3. Migration & Refactoring Details

### 3.1 File Movement Mapping
- `src/controllers/claudeController.ts` -> `src/proxy/controllers/claudeController.ts`
- `src/controllers/geminiController.ts` -> `src/proxy/controllers/geminiController.ts`
- `src/routes/claudeRoutes.ts` -> `src/proxy/routes/claudeRoutes.ts`
- `src/routes/geminiRoutes.ts` -> `src/proxy/routes/geminiRoutes.ts`
- `src/services/claudeTranslator.ts` -> `src/proxy/services/claudeTranslator.ts`
- `src/services/payloadLogger.ts` -> `src/proxy/services/payloadLogger.ts`
- Directories `src/controllers/`, `src/routes/`, and `src/services/` are completely removed.

### 3.2 Import Path Adjustments
1. **`src/app.ts`**:
   - `import claudeRoutes from './proxy/routes/claudeRoutes';`
   - `import geminiRoutes from './proxy/routes/geminiRoutes';`
2. **`src/proxy/controllers/`**:
   - Adjust relative paths: config (`../../../config/default`), utils (`../../utils/*`), services (`../services/*`).
3. **`src/proxy/services/`**:
   - `claudeTranslator.ts`: adjust relative paths to config (`../../../config/*`) and utils (`../../utils/*`).
   - `payloadLogger.ts`: adjust relative paths to config, utils, and `../../admin/services/metricsService`.
4. **`src/admin/services/logService.ts`**:
   - `import { LogIndexRecord } from '../../proxy/services/payloadLogger';`
   - `import claudeTranslator from '../../proxy/services/claudeTranslator';`

---

## 4. Test Suite Path Updates

All tests referencing `src/services/` or `src/controllers/` must be updated to reference `src/proxy/`:
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

---

## 5. Verification & Acceptance Criteria

1. **Clean Workspace**: No leftover files in `src/controllers`, `src/routes`, `src/services`.
2. **Build Success**: `npm run build` (`build:backend` and `build:frontend`) compiles with 0 errors.
3. **Full Test Suite**: `npm test` passes 111 / 111 test suites with 0 regressions.
4. **Documentation**: `README.md` and `CLAUDE.md` accurately reflect `src/proxy/`.

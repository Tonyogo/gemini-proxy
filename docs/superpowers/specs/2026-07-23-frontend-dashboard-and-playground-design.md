# Design Spec: Web Dashboard and Playground Integration

## Executive Summary
This design specifies the architecture and implementation details for adding an Admin Web Dashboard & Interactive API Playground to the `gemini-proxy` project. 

The primary objective is to preserve 100% of the core Claude-to-Gemini API proxy translation logic in a clean, stateless, and unpolluted condition while adding rich observability, transaction log debugging, and live API testing capabilities.

## Architecture & Isolation Strategy

### 1. Directory Structure (Monorepo Separation)
To enforce strict separation of concerns, the frontend codebase lives in a standalone `frontend/` directory, and the new backend management endpoints live inside `src/admin/`.

```
gemini-proxy/
├── frontend/                   # Standalone frontend application (Vite + React/Vue + Tailwind CSS)
│   ├── src/                    # Frontend UI sources (Dashboard, Logs, Playground)
│   ├── package.json            # Frontend independent dependencies
│   └── vite.config.ts          # Build output directed to ../dist/frontend
├── src/
│   ├── admin/                  # [NEW] Out-of-band management module
│   │   ├── controllers/        # Admin endpoints controller (logs parser, system stats, model viewer)
│   │   ├── middlewares/        # adminAuth.ts (ADMIN_SECRET_KEY validator)
│   │   ├── routes/             # adminRoutes.ts (/api/admin/*)
│   │   └── services/           # Log directory analyzer & aggregator
│   ├── controllers/            # [EXISTING] Core Proxy controllers (Unchanged)
│   ├── routes/                 # [EXISTING] Core Proxy routes (Unchanged)
│   ├── services/               # [EXISTING] Claude Translator logic (Unchanged)
│   ├── utils/                  # [EXISTING] Stream lifecycle tools (Unchanged)
│   └── app.ts                  # [UPDATED] Mounts /api/admin and static files middleware only
└── config/
    └── default.ts              # [UPDATED] Adds ADMIN_SECRET_KEY & ENABLE_UI settings
```

### 2. Core Proxy Engine Preservation
The core proxy pipeline (`/v1/messages`, `/v1/models`, `claudeTranslator.ts`, `streamLifecycleManager.ts`) remains **100% untouched**. 
- The admin module operates purely as a passive observer by reading transaction logs written to disk (`TRANSACTION_LOGS_DIR`) and server environment configuration files.
- The Playground acts as a standard HTTP client making real requests directly to the `/v1/messages` endpoints.

## Backend Management Module (`src/admin/`)

### 1. Security & Authentication Middleware (`src/admin/middlewares/adminAuth.ts`)
- Configured via environment variable: `ADMIN_SECRET_KEY`.
- Validates the incoming Request Header `x-admin-key`.
- If `ADMIN_SECRET_KEY` is set, non-matching requests are rejected with `401 Unauthorized`.
- Keeps authentication strictly decoupled from `/v1/*` proxy calls, which continue to use `x-api-key` / `Authorization` for upstream Gemini authentication.

### 2. Admin Endpoints (`src/admin/routes/adminRoutes.ts`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/admin/status` | `GET` | Returns proxy status, memory usage, uptime, and active env switches (`SYSTEM_ROLE_TO_INSTRUCTION`, `RUNTIME_CONTEXT_TAG`, etc.) |
| `/api/admin/models` | `GET` | Returns list of configured models and aliases from `config/models.json` & `MODEL_MAPPINGS`. |
| `/api/admin/logs` | `GET` | Paginated listing of transaction logs partitioned by date/hour in `TRANSACTION_LOGS_DIR`. |
| `/api/admin/logs/:date/:hour/:filename` | `GET` | Fetch specific raw transaction log details (Claude client payload, Gemini upstream payload, latency, status code). |
| `/api/admin/stats` | `GET` | Aggregated proxy metrics over time (hourly request count, average latency, 2xx/4xx/5xx error distribution). |

### 3. Static Hosting in Express (`src/app.ts`)
Static assets built from `frontend/` will be hosted at `/ui` path:
- Serves static assets from `dist/frontend` directory when `ENABLE_UI !== 'false'`.
- Includes SPA wildcard fallback for `/ui/*` to `index.html`.

## Frontend UI Architecture (`frontend/`)

### 1. Key Views & Features
1. **Dashboard View (`/ui/dashboard`)**:
   - Server health, memory, uptime, active proxy configurations.
   - Interactive charts showing request volume, latency trends, and success/error status codes.
   - Supported models and mapping rules overview.
2. **Log Inspection & Debugger View (`/ui/logs`)**:
   - Filterable transaction log explorer.
   - Side-by-side JSON tree viewer comparing incoming Claude requests/responses vs. translated Gemini requests/responses.
   - "Replay in Playground" feature to clone historical payloads directly into the API tester.
3. **API Playground View (`/ui/playground`)**:
   - Interactive prompt tester supporting stream mode, system prompts, temperature, and thinking budget.
   - Renders live SSE stream output with typewriter effect, thinking blocks, and tool call invocations.
   - Directly calls standard `/v1/messages` endpoints using browser-stored API Key.

### 2. Build & Workflow Integration
- **Frontend Dev Mode**: `npm run dev:frontend` (Vite server running on `:5173` proxying `/api/admin` and `/v1` to `:3000`).
- **Production Build**: `npm run build` updated in root `package.json` to build frontend first into `dist/frontend`, followed by backend TypeScript compilation into `dist/src`.

## Testing Strategy
1. **Admin Auth Unit & Integration Tests**: Verify `/api/admin/*` paths require `x-admin-key` when `ADMIN_SECRET_KEY` is provided.
2. **Log Parser Tests**: Verify log listing and JSON reading gracefully handle missing files or corrupted log records.
3. **Core Regression Safety**: Run existing test suites (`npm test`) to guarantee `/v1/*` proxy behavior remains unaffected.

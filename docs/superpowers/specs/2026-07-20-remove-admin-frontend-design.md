# Admin System and Frontend Removal Design Spec

## Overview
Gemini-Proxy was originally designed with an admin logs viewer frontend (`src/public/index.html`) and associated APIs under the `/admin` routing prefix. 

To maintain the project's identity as a **purely stateless, zero-persistence API proxy** focused solely on large language model protocol translation, all frontend pages and related HTTP API routes will be removed. Background file logging will be preserved on disk for manual offline auditing.

## Architecture & Security Changes

### 1. Retention of Background Logging
*   **Active Log Saving:** The payload logger `src/services/payloadLogger.ts` remains active and untouched. It will continue saving detailed JSON records of API calls under `logs/` for security and debugging audits.
*   **Zero HTTP Exposure:** No HTTP routes or controllers will expose these logs to the network, eliminating the need for HTTP Basic Authentication and localhost IP filtering.

### 2. File Removal Checklist
The following files and folders will be completely deleted from the workspace:
*   `src/public/` (frontend HTML & CSS viewer)
*   `src/controllers/adminController.ts` (JSON log query controller)
*   `src/routes/adminRoutes.ts` (endpoints mounting)
*   `src/middleware/auth.ts` (`localhostOnly` and `basicAuth` middlewares, now defunct)
*   `tests/admin.test.ts` (admin log controller integration test)
*   `tests/auth.test.ts` (Basic Auth unit test)

### 3. Component Updates
*   **App Core Routing (`src/app.ts`):** 
    *   Remove `import adminRoutes from './routes/adminRoutes';`
    *   Remove `app.use('/admin', adminRoutes);`
*   **Environment Configuration (`config/default.ts` & `.env.example`):**
    *   Remove `ADMIN_CREDENTIALS` support from environment loader template.
    *   Remove `adminCredentials` properties from configuration loader.

---

## Testing & Verification Strategy
*   **Compilation Integrity:** Run `npm run build` to verify there are no dangling TypeScript imports or dead code dependencies.
*   **Test Suite Passes:** Run `npm test` to verify that all remaining 8 core test suites (message translation, token counting, stream parsing, model listings, health checking) pass without error.
*   **Verify Route Rejection:** Ensure that requesting `GET /admin/logs-viewer` or `GET /admin/api/logs` returns `404 Not Found`.
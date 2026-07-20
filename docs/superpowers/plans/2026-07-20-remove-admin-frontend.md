# Remove Admin and Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `/admin` routing prefix, the HTML log-viewer frontend, associated controller/routes/middlewares, and obsolete tests to streamline the codebase into a pure LLM protocol proxy.

**Architecture:** De-register `/admin` routes from `src/app.ts`, delete defunct files, and remove the `ADMIN_CREDENTIALS` support from configuration.

**Tech Stack:** Node.js, Express, TypeScript, Jest.

## Global Constraints

- Background file payload logging (`src/services/payloadLogger.ts`) MUST remain active and functional on disk.
- All core translation and routing capabilities (e.g. `/v1/*`) MUST pass existing tests.
- Dead files and directories MUST be completely deleted from git.

---

### Task 1: De-register Routes and Update Application Entrypoint

**Files:**
- Modify: `src/app.ts`
- Modify: `config/default.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Config object without `adminCredentials`
- Produces: `app` instance without `/admin` middleware setup

- [ ] **Step 1: Modify `config/default.ts` to remove `adminCredentials`**

```typescript
// Read and modify config/default.ts to delete adminCredentials property
export default {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  logLevel: process.env.LOG_LEVEL || 'info',
};
```

- [ ] **Step 2: Update `.env.example`**
Remove `ADMIN_CREDENTIALS` block from `.env.example`.

- [ ] **Step 3: Modify `src/app.ts` to remove admin route mounting**

```typescript
import express, { Request, Response } from 'express';
import claudeRoutes from './routes/claudeRoutes';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use('/v1', claudeRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
```

- [ ] **Step 4: Commit**

```bash
git add src/app.ts config/default.ts .env.example
git commit -m "feat: de-register admin routes and clean up config"
```

---

### Task 2: Physically Delete Defunct Admin Files and Folders

**Files:**
- Delete: `src/public/`
- Delete: `src/controllers/adminController.ts`
- Delete: `src/routes/adminRoutes.ts`
- Delete: `src/middleware/auth.ts`
- Delete: `tests/admin.test.ts`
- Delete: `tests/auth.test.ts`

- [ ] **Step 1: Delete all defunct code files**

```bash
rm -rf src/public
rm -f src/controllers/adminController.ts
rm -f src/routes/adminRoutes.ts
rm -f src/middleware/auth.ts
rm -f tests/admin.test.ts
rm -f tests/auth.test.ts
```

- [ ] **Step 2: Run build to verify no compilation errors**

Run: `npm run build`
Expected: Success with no type errors.

- [ ] **Step 3: Run Jest tests**

Run: `npm test`
Expected: 8/8 suites pass (the 2 deleted tests `admin.test.ts` and `auth.test.ts` are successfully removed).

- [ ] **Step 4: Commit deletions**

```bash
git add -A
git commit -m "feat: delete defunct admin routes, controllers, middleware, and tests"
```

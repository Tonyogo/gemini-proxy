# Log Detail Caching Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable 1-hour HTTP caching headers on the backend log detail endpoint and a React memory cache in LogsView to allow instant log detail switching without unnecessary re-fetching.

**Architecture:** Add `res.setHeader('Cache-Control', 'public, max-age=3600, immutable')` in `AdminController.getLogDetail` and implement a Map-backed `detailCacheRef` in `LogsView.tsx` to cache fetched JSON payloads.

**Tech Stack:** TypeScript, Express, React, Vite, Jest.

## Global Constraints

- HTTP Cache-Control header value must be exactly: `public, max-age=3600, immutable`.
- All tests must pass with `npx jest --runInBand`.
- Frontend build must succeed with `npm run build:frontend`.

---

### Task 1: Add 1-Hour Cache-Control Header to Backend Log Detail Endpoint

**Files:**
- Modify: `src/admin/controllers/adminController.ts:44-55`
- Test: `tests/adminController.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/logs/:date/:hour/:filename`
- Produces: `Cache-Control: public, max-age=3600, immutable` HTTP response header

- [ ] **Step 1: Write failing unit test checking Cache-Control header in adminController.test.ts**

In `tests/adminController.test.ts`, add a test case under `Admin API Endpoints`:

```typescript
    it('GET /api/admin/logs/:date/:hour/:filename sets 1-hour immutable Cache-Control header', async () => {
      // First create a dummy log or use existing test fixture path
      const res = await request(app)
        .get('/api/admin/logs/2026-08-01/12/nonexistent.json')
        .set('x-admin-key', 'test-secret-key');

      // Check header when log detail endpoint returns successfully or on handler setup
    });
```
Specifically, create a valid log file via `payloadLogger` or test helper if needed, then perform GET request and assert:
```typescript
expect(res.headers['cache-control']).toBe('public, max-age=3600, immutable');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/adminController.test.ts -t "Cache-Control"`
Expected: FAIL (header `cache-control` is currently not set or default)

- [ ] **Step 3: Implement Cache-Control header in AdminController.getLogDetail**

Update `src/admin/controllers/adminController.ts`:

```typescript
  public async getLogDetail(req: Request, res: Response): Promise<void> {
    const date = Array.isArray(req.params.date) ? req.params.date[0] : req.params.date;
    const hour = Array.isArray(req.params.hour) ? req.params.hour[0] : req.params.hour;
    const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;

    try {
      const detail = await logService.getLogDetail(date, hour, filename);
      res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
      res.json(detail);
    } catch (err) {
      res.status(404).json({ error: 'Log file not found' });
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/adminController.test.ts -t "Cache-Control"`
Expected: PASS

- [ ] **Step 5: Commit backend changes**

```bash
git add src/admin/controllers/adminController.ts tests/adminController.test.ts
git commit -m "feat(admin): set 1-hour immutable Cache-Control header for log detail endpoint"
```

---

### Task 2: Implement React Memory Cache in Frontend LogsView Component

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`

**Interfaces:**
- Consumes: `log.path`, `/api/admin/logs/:date/:hour/:filename`
- Produces: Instant log detail rendering from `detailCacheRef` Map

- [ ] **Step 1: Add detailCacheRef Map and update loadDetail in LogsView.tsx**

In `frontend/src/components/LogsView.tsx`:
1. Add `useRef`:
   ```typescript
   const detailCacheRef = React.useRef<Map<string, any>>(new Map());
   ```
2. Update `loadDetail`:
   ```typescript
   const loadDetail = (log: any) => {
     setSelectedFile(log.path);
     if (detailCacheRef.current.has(log.path)) {
       setSelectedLog(detailCacheRef.current.get(log.path));
       setDetailLoading(false);
       return;
     }

     setDetailLoading(true);
     const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
     fetch(`/api/admin/logs/${log.date}/${log.hour}/${log.filename}`, { headers })
       .then(r => r.json())
       .then(data => {
         detailCacheRef.current.set(log.path, data);
         setSelectedLog(data);
       })
       .catch(() => setSelectedLog(null))
       .finally(() => setDetailLoading(false));
   };
   ```
3. Update manual refresh button handler to clear cache:
   ```typescript
   const handleRefresh = () => {
     detailCacheRef.current.clear();
     fetchLogs(true);
   };
   ```

- [ ] **Step 2: Build frontend to verify TypeScript compilation and Vite bundling**

Run: `npm run build:frontend`
Expected: Successful Vite React frontend build into `dist/frontend`.

- [ ] **Step 3: Run full backend and integration test suite**

Run: `npx jest --runInBand`
Expected: All 19 test suites PASS.

- [ ] **Step 4: Commit frontend changes**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "perf(frontend): add memory cache for log detail switching in LogsView"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (1-hour HTTP Cache-Control header & frontend memory map)
- [x] No placeholders or vague TODOs
- [x] Exact code modifications and test steps provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

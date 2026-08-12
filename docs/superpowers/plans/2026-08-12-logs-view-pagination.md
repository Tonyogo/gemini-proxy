# Logs View Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable pagination and customizable page sizes in the admin console request logs view, allowing users to view all log entries under a selected hour or day without 30-item truncation.

**Architecture:** Extend backend `logService.listLogs` and `adminController.getLogs` to return pagination metadata (`page`, `limit`, `total`, `hourCount`), and add a bottom pagination bar with page navigation buttons and page size selector to `LogsView.tsx`.

**Tech Stack:** Express, TypeScript, React, Tailwind CSS, Jest, Supertest.

## Global Constraints

- Preserve clean architecture separation between `logService.ts`, `adminController.ts`, and `LogsView.tsx`.
- Maintain strict TypeScript type safety without using `any` where structured types exist.
- Support both Chinese (`zh`) and English (`en`) i18n locales via `LanguageContext`.
- Always reset active page to `1` when switching selected date, hour, or page limit.

---

### Task 1: Backend Log Pagination Support & Unit Tests

**Files:**
- Modify: `src/admin/services/logService.ts:32-37,201-207`
- Modify: `src/admin/controllers/adminController.ts:35-43`
- Test: `tests/adminController.test.ts`

**Interfaces:**
- Consumes: `GET /api/admin/logs?date=...&hour=...&page=...&limit=...` query parameters.
- Produces: `LogListResponse` with `page`, `limit`, `total`, `hourCount`, `tree`, and `logs`.

- [ ] **Step 1: Write the failing tests for backend pagination metadata**

Edit `tests/adminController.test.ts` to add assertions verifying `page` and `limit` in response body:

```typescript
test('GET /api/admin/logs respects page and limit query parameters and returns pagination metadata', async () => {
  const res = await request(app)
    .get('/api/admin/logs?page=2&limit=10')
    .set('x-admin-key', 'test-secret-key');

  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('page', 2);
  expect(res.body).toHaveProperty('limit', 10);
  expect(res.body).toHaveProperty('total');
  expect(res.body).toHaveProperty('hourCount');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/adminController.test.ts -t "respects page and limit"`
Expected: FAIL with missing `page` or `limit` property in `res.body`.

- [ ] **Step 3: Update `logService.ts` and `adminController.ts`**

In `src/admin/services/logService.ts`:
Update `listLogs` interface and return object:

```typescript
public async listLogs(
  page = 1,
  limit = 50,
  filterDate?: string,
  filterHour?: string
): Promise<{ tree: LogTreeStructure; hourCount: number; total: number; page: number; limit: number; logs: LogItem[] }> {
  // ... existing scanning logic ...

  return {
    tree,
    hourCount,
    total: hourCount,
    page,
    limit,
    logs: enrichedLogs
  };
}
```

In `src/admin/controllers/adminController.ts`:
Ensure `page` defaults to `1` and `limit` defaults to `50` (or uses query param):

```typescript
public async getLogs(req: Request, res: Response): Promise<void> {
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '50', 10);
  const filterDate = req.query.date as string | undefined;
  const filterHour = req.query.hour as string | undefined;

  const result = await logService.listLogs(page, limit, filterDate, filterHour);
  res.json(result);
}
```

- [ ] **Step 4: Run backend tests to verify pass**

Run: `npx jest tests/adminController.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit backend changes**

```bash
git add src/admin/services/logService.ts src/admin/controllers/adminController.ts tests/adminController.test.ts
git commit -m "feat(admin): add pagination metadata to log listing endpoint"
```

---

### Task 2: Frontend i18n & LogsView Pagination UI Integration

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts:46-72`
- Modify: `frontend/src/i18n/locales/en.ts:44-70`
- Modify: `frontend/src/components/LogsView.tsx:8-59,166-180`

**Interfaces:**
- Consumes: Backend response `{ tree, hourCount, total, page, limit, logs }`.
- Produces: Interactive pagination bar below log list with page switching and page size selection.

- [ ] **Step 1: Add i18n keys to `zh.ts` and `en.ts`**

In `frontend/src/i18n/locales/zh.ts` (under `logs` object):
```typescript
prevPage: "上一页",
nextPage: "下一页",
showingRange: "{start}-{end} / 共 {total} 条",
```

In `frontend/src/i18n/locales/en.ts` (under `logs` object):
```typescript
prevPage: "Prev",
nextPage: "Next",
showingRange: "{start}-{end} of {total}",
```

- [ ] **Step 2: Add pagination state and controls to `LogsView.tsx`**

In `frontend/src/components/LogsView.tsx`:

1. Add state variables:
```typescript
const [page, setPage] = useState<number>(1);
const [limit, setLimit] = useState<number>(50);
const [totalLogs, setTotalLogs] = useState<number>(0);
```

2. Update `fetchLogs` signature and fetch query:
```typescript
const fetchLogs = (forceAutoJump = false, customDate?: string, customHour?: string, pageNum = page, limitNum = limit) => {
  setLoading(true);
  const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};

  const targetDate = customDate !== undefined ? customDate : selectedDate;
  const targetHour = customHour !== undefined ? customHour : selectedHour;

  let query = `/api/admin/logs?page=${pageNum}&limit=${limitNum}`;
  if (!forceAutoJump) {
    if (targetDate) query += `&date=${targetDate}`;
    if (targetHour) query += `&hour=${targetHour}`;
  }

  fetch(query, { headers })
    .then(r => r.json())
    .then(data => {
      const logTree = data.tree || {};
      setTree(logTree);
      const totalCount = data.hourCount !== undefined ? data.hourCount : (data.total || 0);
      setHourCount(totalCount);
      setTotalLogs(totalCount);
      setPage(data.page || pageNum);
      setLimit(data.limit || limitNum);
      const fetchedLogs = data.logs || [];
      setLogs(fetchedLogs);

      if (fetchedLogs.length > 0) {
        setSelectedDate(fetchedLogs[0].date);
        setSelectedHour(fetchedLogs[0].hour);
        loadDetail(fetchedLogs[0]);
      } else {
        setSelectedLog(null);
        setSelectedFile('');
      }
    })
    .catch(() => {})
    .finally(() => setLoading(false));
};
```

3. Add handler functions for Date, Hour, Page, and Limit changes:
```typescript
const handleDateChange = (date: string) => {
  setSelectedDate(date);
  const hours = Object.keys(tree[date] || {})
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  const newHour = hours.length > 0 ? hours[0] : '';
  setSelectedHour(newHour);
  setPage(1);
  fetchLogs(false, date, newHour, 1, limit);
};

const handleHourChange = (hour: string) => {
  setSelectedHour(hour);
  setPage(1);
  fetchLogs(false, selectedDate, hour, 1, limit);
};

const handlePageChange = (newPage: number) => {
  setPage(newPage);
  fetchLogs(false, selectedDate, selectedHour, newPage, limit);
};

const handleLimitChange = (newLimit: number) => {
  setLimit(newLimit);
  setPage(1);
  fetchLogs(false, selectedDate, selectedHour, 1, newLimit);
};
```

4. Render bottom pagination controls inside left sidebar below log entries list:
```tsx
{/* Bottom Pagination Bar */}
{totalLogs > 0 && (
  <div className="pt-2.5 mt-2 border-t border-slate-700/60 flex flex-col gap-2 font-mono text-[11px] text-slate-400 shrink-0">
    <div className="flex items-center justify-between">
      <span>
        {t('logs.showingRange', `{start}-{end} of {total}`)
          .replace('{start}', String((page - 1) * limit + 1))
          .replace('{end}', String(Math.min(page * limit, totalLogs)))
          .replace('{total}', String(totalLogs))}
      </span>
      <select
        value={limit}
        onChange={(e) => handleLimitChange(Number(e.target.value))}
        className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[10px] focus:outline-none focus:border-blue-500"
      >
        <option value={30}>30/页</option>
        <option value={50}>50/页</option>
        <option value={100}>100/页</option>
        <option value={200}>200/页</option>
      </select>
    </div>

    <div className="flex items-center justify-between gap-1">
      <button
        disabled={page <= 1 || loading}
        onClick={() => handlePageChange(page - 1)}
        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition-colors text-[10px]"
      >
        ‹ {t('logs.prevPage', 'Prev')}
      </button>

      <span className="text-slate-300 font-semibold text-[10px]">
        {page} / {Math.ceil(totalLogs / limit) || 1}
      </span>

      <button
        disabled={page >= Math.ceil(totalLogs / limit) || loading}
        onClick={() => handlePageChange(page + 1)}
        className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition-colors text-[10px]"
      >
        {t('logs.nextPage', 'Next')} ›
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Build frontend and run full test suite**

Run: `npm run build:frontend && npm test`
Expected: Frontend builds cleanly without TS/JSX errors, all backend tests pass.

- [ ] **Step 4: Commit frontend changes**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/LogsView.tsx
git commit -m "feat(ui): add pagination bar and page size controls to logs view"
```

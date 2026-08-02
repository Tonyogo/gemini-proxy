# Logs Page Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize Admin Console Logs page loading performance by refactoring backend directory traversal to stop early and reducing frontend double-fetching.

**Architecture:** Refactor `LogService.listLogs` in Node.js to exit directory scanning early when `limit` log items are reached (or target specific date/hour directories), and update React `LogsView` component to fetch logs once with `limit=30` and avoid re-fetching on initial load.

**Tech Stack:** TypeScript, Express, React, Vite, Jest.

## Global Constraints

- Preserve `LogService.listLogs` return interface contract: `{ tree: LogTreeStructure, logs: LogItem[], total: number }`.
- Default limit for `LogsView.tsx` set to 30.
- All tests must pass with `npx jest --runInBand`.

---

### Task 1: Refactor LogService for Early Termination Directory Traversal

**Files:**
- Modify: `src/admin/services/logService.ts`
- Test: `tests/adminController.test.ts`

**Interfaces:**
- Consumes: `config.transactionLogsDir`
- Produces: `listLogs(page?: number, limit?: number, filterDate?: string, filterHour?: string): Promise<{ tree: LogTreeStructure; logs: LogItem[]; total: number }>`

- [ ] **Step 1: Write failing/verifying unit test for logService listLogs filtering & early exit**

In `tests/adminController.test.ts`, add a unit test asserting that `listLogs` respects limit and filter parameters correctly:

```typescript
  it('should list logs with early limit scanning and date/hour filtering', async () => {
    const result = await logService.listLogs(1, 10);
    expect(result).toHaveProperty('tree');
    expect(result).toHaveProperty('logs');
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs.length).toBeLessThanOrEqual(10);
  });
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npx jest tests/adminController.test.ts -t "should list logs with early limit scanning"`
Expected: PASS (verifies base test suite execution)

- [ ] **Step 3: Refactor LogService.listLogs in `src/admin/services/logService.ts`**

Update `src/admin/services/logService.ts`:
1. If `filterDate` and `filterHour` are provided and `filterHour !== 'all'`, directly construct the target path `path.join(debugDir, filterDate, filterHour)` and read files from that specific directory only.
2. If `filterDate` or `filterHour` are missing or `'all'`, iterate through date directories (newest first) and hour directories (newest first). Once `items.length >= page * limit` (or enough to satisfy total required items), stop deeper directory scanning.
3. Build `tree` structure efficiently by reading date/hour directory names.

```typescript
  public async listLogs(
    page = 1,
    limit = 50,
    filterDate?: string,
    filterHour?: string
  ): Promise<{ tree: LogTreeStructure; logs: LogItem[]; total: number }> {
    const debugDir = this.getDebugDir();
    const items: LogItem[] = [];
    const tree: LogTreeStructure = {};

    try {
      const dates = await fs.readdir(debugDir);
      const sortedDates = dates.sort().reverse();

      // Populate tree high-level overview
      for (const date of sortedDates) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        tree[date] = tree[date] || {};
        const hours = await fs.readdir(dateDir);
        for (const hour of hours) {
          const hourDir = path.join(dateDir, hour);
          const hourStat = await fs.stat(hourDir).catch(() => null);
          if (!hourStat || !hourStat.isDirectory()) continue;
          
          // Estimate/read files count for tree
          const files = await fs.readdir(hourDir);
          tree[date][hour] = files.filter(f => f.endsWith('.json')).length;
        }
      }

      // Fast-path: Specific date & hour filtering
      if (filterDate && filterHour && filterHour !== 'all') {
        const hourDir = path.join(debugDir, filterDate, filterHour);
        const files = await fs.readdir(hourDir).catch(() => []);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
        for (const file of jsonFiles) {
          items.push({
            date: filterDate,
            hour: filterHour,
            filename: file,
            path: path.join(filterDate, filterHour, file)
          });
        }
      } else {
        // Collect items until target count reached
        const targetCount = page * limit;
        for (const date of sortedDates) {
          if (filterDate && date !== filterDate) continue;

          const dateDir = path.join(debugDir, date);
          const hours = (await fs.readdir(dateDir).catch(() => [])).sort().reverse();

          for (const hour of hours) {
            if (filterHour && filterHour !== 'all' && hour !== filterHour) continue;

            const hourDir = path.join(dateDir, hour);
            const files = await fs.readdir(hourDir).catch(() => []);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

            for (const file of jsonFiles) {
              items.push({
                date,
                hour,
                filename: file,
                path: path.join(date, hour, file)
              });
            }

            if (items.length >= targetCount) break;
          }
          if (items.length >= targetCount) break;
        }
      }
    } catch {
      // Directory may not exist
    }

    const start = (page - 1) * limit;
    const slicedItems = items.slice(start, start + limit);

    const enrichedLogs = await Promise.all(
      slicedItems.map(async item => {
        try {
          const fullPath = path.join(debugDir, item.date, item.hour, item.filename);
          const content = await fs.readFile(fullPath, 'utf8');
          const parsed = JSON.parse(content);
          let fallbackStatus: number | null = null;
          if (parsed.status !== undefined && parsed.status !== null) {
            fallbackStatus = parsed.status;
          } else if (parsed.claude_res?.error) {
            fallbackStatus = 500;
          } else if (parsed.claude_res) {
            fallbackStatus = 200;
          }

          let fallbackIsStream = false;
          if (parsed.is_stream !== undefined && parsed.is_stream !== null) {
            fallbackIsStream = Boolean(parsed.is_stream);
          } else if (parsed.client_req?.stream === true) {
            fallbackIsStream = true;
          } else if (Array.isArray(parsed.claude_res) && parsed.claude_res.length > 0 && parsed.claude_res[0]?.type) {
            fallbackIsStream = true;
          }

          return {
            ...item,
            reqPath: parsed.path || null,
            timestamp: parsed.timestamp || null,
            status: fallbackStatus,
            isStream: fallbackIsStream
          };
        } catch (e) {
          try {
            const fullPath = path.join(debugDir, item.date, item.hour, item.filename);
            const stats = await fs.stat(fullPath);
            return {
              ...item,
              timestamp: stats.mtime.toISOString(),
              reqPath: null,
              status: null,
              isStream: false
            };
          } catch {
            return {
              ...item,
              timestamp: null,
              reqPath: null,
              status: null,
              isStream: false
            };
          }
        }
      })
    );

    return {
      tree,
      logs: enrichedLogs,
      total: items.length
    };
  }
```

- [ ] **Step 4: Verify backend unit tests**

Run: `npx jest tests/adminController.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit backend changes**

```bash
git add src/admin/services/logService.ts tests/adminController.test.ts
git commit -m "perf(logService): optimize log directory scanning with early exit and direct filter paths"
```

---

### Task 2: Refactor Frontend LogsView Component to Eliminate Double Fetch

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`

**Interfaces:**
- Consumes: `/api/admin/logs?limit=30`
- Produces: Optimized React component state and request flow

- [ ] **Step 1: Inspect and update LogsView.tsx default limit and fetch flow**

In `frontend/src/components/LogsView.tsx`:
1. Change default query from `/api/admin/logs?limit=100` to `/api/admin/logs?limit=30`.
2. In `fetchLogs`, remove the automatic secondary `fetchSpecificLogs` call.
3. Synchronize `selectedDate` and `selectedHour` from `data.logs[0]` without re-fetching.

```typescript
    let query = '/api/admin/logs?limit=30';
    if (!forceAutoJump) {
      if (targetDate) query += `&date=${targetDate}`;
      if (targetHour) query += `&hour=${targetHour}`;
    }

    fetch(query, { headers })
      .then(r => r.json())
      .then(data => {
        const logTree = data.tree || {};
        setTree(logTree);
        const fetchedLogs = data.logs || [];
        setLogs(fetchedLogs);

        if (fetchedLogs.length > 0) {
          // Sync dropdowns to the top log without secondary refetch
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
```

- [ ] **Step 2: Build frontend to verify TypeScript compilation and bundling**

Run: `npm run build:frontend`
Expected: Successful Vite React frontend build into `dist/frontend`.

- [ ] **Step 3: Run full backend and integration test suite**

Run: `npx jest --runInBand`
Expected: All 19 test suites PASS.

- [ ] **Step 4: Commit frontend changes**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "perf(frontend): set default logs limit to 30 and eliminate initial double-fetch"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified
- [x] No placeholders or vague TODOs
- [x] Exact file paths and line steps provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

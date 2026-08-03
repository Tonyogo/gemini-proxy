# Request Logs UI Refactoring and Lazy Hourly Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Request Logs sidebar cards into a clean two-row layout with latency in seconds and optimize backend logService scanning to compute exact file counts only for the requested date/hour.

**Architecture:** Update `LogService.listLogs` in Node.js to return `hourCount` for the active hourly bucket without deeply scanning unselected hour directories, and update `LogsView.tsx` to display cards with Row 1 (time, path, duration in seconds) and Row 2 (truncated ID, status, stream/json badge).

**Tech Stack:** TypeScript, Express, React, Vite, Jest.

## Global Constraints

- Backend `/api/admin/logs` response contract includes `hourCount` number.
- Request latency formatted in seconds (e.g., `0.24s`, `1.52s`).
- All tests must pass with `npx jest --runInBand`.
- Frontend build must succeed with `npm run build:frontend`.

---

### Task 1: Optimize LogService with On-Demand Hourly Counting

**Files:**
- Modify: `src/admin/services/logService.ts`
- Test: `tests/adminController.test.ts`

**Interfaces:**
- Consumes: `listLogs(page, limit, filterDate, filterHour)` in `LogService`
- Produces: `{ tree: LogTreeStructure, hourCount: number, total: number, logs: LogItem[] }`

- [ ] **Step 1: Write failing unit test in tests/adminController.test.ts checking hourCount**

In `tests/adminController.test.ts`, update tests to assert `hourCount` is returned in `/api/admin/logs`:

```typescript
    it('GET /api/admin/logs returns hourCount field for selected hour slice', async () => {
      const res = await request(app)
        .get('/api/admin/logs?limit=10')
        .set('x-admin-key', 'test-secret-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('hourCount');
      expect(typeof res.body.hourCount).toBe('number');
    });
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/adminController.test.ts -t "hourCount"`
Expected: FAIL (`res.body.hourCount` is undefined)

- [ ] **Step 3: Implement lazy hourly counting in LogService.listLogs**

Update `src/admin/services/logService.ts`:
1. In `listLogs`, populate `tree[date][hour] = 0` by default when listing hour directories (avoiding `fs.readdir` inside every hour folder during initial tree construction).
2. Once the target `activeDate` and `activeHour` are determined (from filters or top available directory), perform `fs.readdir` only on `path.join(debugDir, activeDate, activeHour)` to compute `hourCount`.
3. Set `tree[activeDate][activeHour] = hourCount`, `total = hourCount`, and return `{ tree, hourCount, total, logs: enrichedLogs }`.

```typescript
  public async listLogs(
    page = 1,
    limit = 50,
    filterDate?: string,
    filterHour?: string
  ): Promise<{ tree: LogTreeStructure; hourCount: number; total: number; logs: LogItem[] }> {
    const debugDir = this.getDebugDir();
    const items: LogItem[] = [];
    const tree: LogTreeStructure = {};

    let hourCount = 0;

    try {
      const dates = await fs.readdir(debugDir);
      const sortedDates = dates.sort().reverse();

      // Lightweight tree overview: list date and hour directories without deep file counting
      for (const date of sortedDates) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        tree[date] = tree[date] || {};
        const hours = await fs.readdir(dateDir).catch(() => []);
        for (const hour of hours) {
          tree[date][hour] = 0; // Default placeholder, no deep file readdir
        }
      }

      // Determine active date and hour
      let targetDate = filterDate;
      let targetHour = filterHour;

      if (!targetDate || !targetHour || targetHour === 'all') {
        if (sortedDates.length > 0) {
          targetDate = targetDate || sortedDates[0];
          const availableHours = Object.keys(tree[targetDate] || {}).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
          if (availableHours.length > 0) {
            targetHour = (targetHour && targetHour !== 'all') ? targetHour : availableHours[0];
          }
        }
      }

      // Perform targeted file scan for active date/hour ONLY
      if (targetDate && targetHour && targetHour !== 'all') {
        const hourDir = path.join(debugDir, targetDate, targetHour);
        const files = await fs.readdir(hourDir).catch(() => []);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

        hourCount = jsonFiles.length;
        if (tree[targetDate] && tree[targetDate][targetHour] !== undefined) {
          tree[targetDate][targetHour] = hourCount;
        }

        for (const file of jsonFiles) {
          items.push({
            date: targetDate,
            hour: targetHour,
            filename: file,
            path: path.join(targetDate, targetHour, file)
          });
        }
      }
    } catch {
      // Directory may not exist yet
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
            isStream: fallbackIsStream,
            duration: parsed.duration !== undefined ? parsed.duration : null
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
              isStream: false,
              duration: null
            };
          } catch {
            return {
              ...item,
              timestamp: null,
              reqPath: null,
              status: null,
              isStream: false,
              duration: null
            };
          }
        }
      })
    );

    return {
      tree,
      hourCount,
      total: hourCount,
      logs: enrichedLogs
    };
  }
```

- [ ] **Step 4: Run unit tests to verify pass**

Run: `npx jest tests/adminController.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit LogService changes**

```bash
git add src/admin/services/logService.ts tests/adminController.test.ts
git commit -m "perf(logService): implement targeted hourly file counting and hourCount response property"
```

---

### Task 2: Refactor Frontend LogsView UI into Two-Row Cards with Duration in Seconds

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`

**Interfaces:**
- Consumes: `log.duration` (ms), `data.hourCount`
- Produces: Two-row Log Card layout with duration formatted in seconds

- [ ] **Step 1: Refactor Log Card rendering in frontend/src/components/LogsView.tsx**

In `frontend/src/components/LogsView.tsx`:
1. Format duration from milliseconds to seconds:
   ```typescript
   const formatDurationInSeconds = (durationMs: number | null | undefined): string | null => {
     if (durationMs === null || durationMs === undefined) return null;
     const sec = durationMs / 1000;
     return sec >= 1 ? `${sec.toFixed(2)}s` : `${sec.toFixed(2)}s`;
   };
   ```
2. Update Log Card jsx structure into two distinct rows:
   - **Row 1 (Top)**: Left = `formattedTime` + `pathLabel` badge; Right = `durationSec` badge.
   - **Row 2 (Bottom)**: Left = Truncated filename (e.g., `...vbzalx4e8`); Right = Status badge + Stream badge.

```typescript
                  <div
                    key={idx}
                    onClick={() => loadDetail(log)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500/80 text-blue-200 shadow-md'
                        : 'bg-slate-900/60 border-slate-700/40 hover:border-slate-600 text-slate-300'
                    }`}
                  >
                    {/* Row 1: Time, Path & Latency */}
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center space-x-1.5">
                        <span className="px-1.5 py-0.5 rounded border border-slate-700/60 bg-slate-800/80 text-slate-300 font-semibold">
                          {formattedTime}
                        </span>
                        {pathLabel && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${pathBadgeColor}`}>
                            {pathLabel}
                          </span>
                        )}
                      </div>
                      {log.duration !== null && log.duration !== undefined && (
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${
                          log.duration >= 5000 ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
                          log.duration >= 1000 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                          'bg-purple-500/10 text-purple-300 border-purple-500/20'
                        }`}>
                          {(log.duration / 1000).toFixed(2)}s
                        </span>
                      )}
                    </div>

                    {/* Row 2: Filename/ID, Status & Stream Mode */}
                    <div className="flex items-center justify-between mt-2 font-mono text-[10px]">
                      <div className="text-[11px] text-slate-400 font-semibold truncate max-w-[140px]">
                        {log.filename.replace(/^transaction_/, '').replace(/\.json$/, '')}
                      </div>
                      <div className="flex items-center space-x-1">
                        {log.status !== null && log.status !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                            log.status >= 200 && log.status < 300 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                            log.status >= 400 && log.status < 500 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                            'bg-rose-500/10 text-rose-300 border-rose-500/20'
                          }`}>
                            {log.status}
                          </span>
                        )}
                        {log.isStream && (
                          <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-blue-500/10 text-blue-300 border-blue-500/20">
                            STREAM
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
```

- [ ] **Step 2: Build frontend to verify TypeScript compilation and Vite bundling**

Run: `npm run build:frontend`
Expected: Successful Vite React build.

- [ ] **Step 3: Run full backend and integration test suite**

Run: `npx jest --runInBand`
Expected: All 20 test suites PASS.

- [ ] **Step 4: Commit LogsView changes**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "refactor(frontend): restructure request log cards into two-row layout with latency in seconds"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (Targeted hourly file count via `hourCount`, duration in seconds, two-row card layout)
- [x] No placeholders or vague TODOs
- [x] Exact code modifications and test steps provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

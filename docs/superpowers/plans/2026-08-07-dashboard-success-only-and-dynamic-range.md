# Dashboard Success-Only Metrics & Dynamic Time Range Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the metrics service and API endpoint to support success-only query statistics and dynamic ranges (6h, 12h, 24h, 48h) for trend charts and main KPI metric sync, updating the frontend dashboard with a range picker and bilingual i18n support.

**Architecture:** Modify `metricsService.ts` to strictly record latencies and models on success and accept a variable hour-range argument, update `/api/admin/stats` to pass range queries, and add range selection on the frontend dashboard.

**Tech Stack:** TypeScript, Node.js, React, Tailwind CSS, Jest.

## Global Constraints

- Limit latency and model distributions to successful transactions (`status < 400`).
- Return 6h, 12h, 24h, 48h trend buckets chronologically aligned with `config.timeZone` ending with the current hour.
- Support complete i18n across en.ts and zh.ts.
- Ensure all Jest tests pass and frontend build succeeds with zero errors.

---

### Task 1: Refactor Metrics Service for Success-Only Telemetry and Dynamic Range Support

**Files:**
- Modify: `src/admin/services/metricsService.ts`
- Modify: `tests/metricsService.test.ts`

**Interfaces:**
- Consumes: Raw transaction parameters (`isError`, `duration`, `timestamp`, `modelName`)
- Produces: Success-only latencies & model distributions, and `getStats(rangeHours?: number)` with aggregated summaries over the selected hour range.

- [ ] **Step 1: Write failing tests in `tests/metricsService.test.ts`**

Update the test suite to assert that:
1. `record()` does not register models or latency durations for failed requests (`isError = true`).
2. `getStats(range)` dynamically aggregates only for the specified range length and updates summary totals accordingly.

```typescript
  it('only records durations and model metrics for successful requests', () => {
    metricsService.record(false, 150, new Date(), 'gemini-3.5-pro'); // Success
    metricsService.record(true, 500, new Date(), 'gemini-3.5-pro');  // Error

    const stats = metricsService.getStats();
    const latest = stats.timeSeries[stats.timeSeries.length - 1];

    expect(stats.totalLogs).toBe(2);
    expect(stats.successCount).toBe(1);
    expect(stats.errorCount).toBe(1);
    expect(stats.sampleSize).toBe(1); // Only success duration counted
    expect(stats.avgDurationMs).toBe(150); // 150 / 1

    expect(latest.models['gemini-3.5-pro']).toBe(1); // Failed model not counted
  });

  it('calculates range-bound sum counts and correct average latency on getStats(range)', () => {
    const now = new Date();
    // Record successful transaction 10 hours ago with 100ms
    metricsService.record(false, 100, new Date(now.getTime() - 10 * 3600 * 1000), 'model-a');
    // Record successful transaction 2 hours ago with 200ms
    metricsService.record(false, 200, new Date(now.getTime() - 2 * 3600 * 1000), 'model-b');

    const stats6h = metricsService.getStats(6);
    expect(stats6h.timeSeries).toHaveLength(6);
    expect(stats6h.totalLogs).toBe(1); // Only transaction from 2h ago
    expect(stats6h.avgDurationMs).toBe(200);

    const stats12h = metricsService.getStats(12);
    expect(stats12h.timeSeries).toHaveLength(12);
    expect(stats12h.totalLogs).toBe(2); // Both transactions inside 12h
    expect(stats12h.avgDurationMs).toBe(150); // (100 + 200) / 2
  });
```

- [ ] **Step 2: Run test suite to verify it fails**

Run: `npx jest tests/metricsService.test.ts`
Expected: FAIL due to failed requests duration counting and missing dynamic range parameter aggregation.

- [ ] **Step 3: Implement success-only updates in `src/admin/services/metricsService.ts`**

Modify `updateBucket` to strictly count `totalDuration`, `durationCount` and `models` on `!isError`:

```typescript
  private updateBucket(hourKey: string, isError: boolean, duration?: number | null, modelName?: string | null): void {
    let bucket = this.timeSeriesMap.get(hourKey);
    if (!bucket) {
      bucket = { total: 0, success: 0, error: 0, totalDuration: 0, durationCount: 0, models: {} };
      this.timeSeriesMap.set(hourKey, bucket);
    }

    bucket.total++;
    if (isError) {
      bucket.error++;
    } else {
      bucket.success++;
      
      // Update duration and models ONLY on success
      if (duration !== undefined && duration !== null && typeof duration === 'number') {
        bucket.totalDuration += duration;
        bucket.durationCount++;
      }

      if (modelName) {
        bucket.models[modelName] = (bucket.models[modelName] || 0) + 1;
      }
    }
  }
```

- [ ] **Step 4: Refactor record and init methods to correctly track totals**

Modify `record()` and `init()` in `src/admin/services/metricsService.ts` to strictly record duration totals and samples when `isError` is false:

In `record()`:
```typescript
  public record(isError: boolean, duration?: number | null, timestamp?: Date, modelName?: string | null): void {
    this.totalLogs++;
    if (isError) {
      this.errorCount++;
    } else {
      this.successCount++;
      if (duration !== undefined && duration !== null && typeof duration === 'number') {
        this.totalDurationMs += duration;
        this.durationCount++;
      }
    }

    const hourKey = this.getHourKey(timestamp || new Date());
    this.updateBucket(hourKey, isError, duration, modelName);
  }
```

In `init()` record iteration:
```typescript
          // Hydrate stats for Today and Yesterday
          if (date === todayStr || date === yesterdayStr) {
            for (const record of records) {
              const isError = record.status >= 400;
              if (isError) {
                this.errorCount++;
              } else {
                this.successCount++;
                if (record.duration !== undefined && record.duration !== null && typeof record.duration === 'number') {
                  this.totalDurationMs += record.duration;
                  this.durationCount++;
                }
              }

              const dateObj = record.timestamp ? new Date(record.timestamp) : undefined;
              const hourKey = this.getHourKey(dateObj);
              this.updateBucket(hourKey, isError, record.duration, record.model);
            }
          }
```

- [ ] **Step 5: Refactor `getStats()` to dynamically calculate aggregates over hour-range**

Update `getStats(rangeHours = 24)` to aggregate totals on-the-fly over the chosen chronological hours window:

```typescript
  public getStats(rangeHours = 24) {
    const now = new Date();
    const trailingHours: string[] = [];
    for (let i = rangeHours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 3600 * 1000);
      trailingHours.push(this.getHourKey(d));
    }

    let rangeTotalLogs = 0;
    let rangeSuccessCount = 0;
    let rangeErrorCount = 0;
    let rangeTotalDurationMs = 0;
    let rangeDurationCount = 0;

    const timeSeries = trailingHours.map(time => {
      const bucket = this.timeSeriesMap.get(time);
      if (bucket) {
        rangeTotalLogs += bucket.total;
        rangeSuccessCount += bucket.success;
        rangeErrorCount += bucket.error;
        rangeTotalDurationMs += bucket.totalDuration;
        rangeDurationCount += bucket.durationCount;

        return {
          time,
          total: bucket.total,
          success: bucket.success,
          error: bucket.error,
          avgDurationMs: bucket.durationCount > 0 ? Math.round(bucket.totalDuration / bucket.durationCount) : 0,
          models: bucket.models
        };
      } else {
        return {
          time,
          total: 0,
          success: 0,
          error: 0,
          avgDurationMs: 0,
          models: {}
        };
      }
    });

    return {
      totalLogs: rangeTotalLogs,
      sampleSize: rangeDurationCount,
      successCount: rangeSuccessCount,
      errorCount: rangeErrorCount,
      avgDurationMs: rangeDurationCount > 0 ? Math.round(rangeTotalDurationMs / rangeDurationCount) : 0,
      timeSeries
    };
  }
```

- [ ] **Step 6: Run Jest test suite**

Run: `npx jest tests/metricsService.test.ts`
Expected: PASS with 100% success.

- [ ] **Step 7: Commit changes**

```bash
git add src/admin/services/metricsService.ts tests/metricsService.test.ts
git commit -m "feat(metrics): add success-only statistical filters and dynamic range metrics calculation"
```

---

### Task 2: Update Controller Layer to Handle Range Query Parameter

**Files:**
- Modify: `src/admin/controllers/adminController.ts`
- Modify: `src/admin/services/logService.ts`

**Interfaces:**
- Consumes: `req.query.range` (GET `/api/admin/stats`)
- Produces: Filtered dynamic range analytics response.

- [ ] **Step 1: Update `src/admin/services/logService.ts` stats method signature**

Update `getStats(rangeHours?: number)` in `logService.ts`:

```typescript
  public async getStats(rangeHours?: number): Promise<any> {
    return metricsService.getStats(rangeHours);
  }
```

- [ ] **Step 2: Update `getStats` inside `src/admin/controllers/adminController.ts`**

Update `getStats` controller handler to extract, parse, validate, and pass the `range` parameter:

```typescript
  public async getStats(req: Request, res: Response): Promise<void> {
    const rangeParam = req.query.range as string | undefined;
    let range = 24;
    if (rangeParam) {
      const parsedRange = parseInt(rangeParam, 10);
      if ([6, 12, 24, 48].includes(parsedRange)) {
        range = parsedRange;
      }
    }
    const stats = await logService.getStats(range);
    res.json(stats);
  }
```

- [ ] **Step 3: Run full backend tests**

Run: `npx jest --runInBand`
Expected: All 20 test suites pass.

- [ ] **Step 4: Commit changes**

```bash
git add src/admin/controllers/adminController.ts src/admin/services/logService.ts
git commit -m "feat(controller): expose dynamic range parameter on stats endpoint"
```

---

### Task 3: Complete Frontend Time Range Selection & i18n Localization

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `/api/admin/stats?range=X`
- Produces: Polished interactive segment picker on Dashboard view.

- [ ] **Step 1: Add new translation keys under the `dashboard` object**

In `frontend/src/i18n/locales/en.ts`:
```typescript
    range6h: "6h",
    range12h: "12h",
    range24h: "24h",
    range48h: "48h",
    timeRange: "Time Range"
```

In `frontend/src/i18n/locales/zh.ts`:
```typescript
    range6h: "6h",
    range12h: "12h",
    range24h: "24h",
    range48h: "48h",
    timeRange: "时间区间"
```

- [ ] **Step 2: Update `frontend/src/components/DashboardView.tsx` range logic**

Add range state, pass range query parameter on fetch, and render a Segmented Control Tab Group:

In `DashboardView.tsx` fetch call:
```typescript
export default function DashboardView({ adminKey }: { adminKey: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<number>(24);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const loadData = (currentRange = range) => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    Promise.all([
      fetch('/api/admin/status', { headers }).then(r => r.json()).catch(() => null),
      fetch(`/api/admin/stats?range=${currentRange}`, { headers }).then(r => r.json()).catch(() => null),
    ]).then(([statusData, statsData]) => {
      setStatus(statusData);
      setStats(statsData);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData(range);
  }, [adminKey, range]);
```

- [ ] **Step 3: Implement Range Picker Segmented Selector UI**

Lace in the segment control tabs at the right side of the dashboard title row:

```tsx
  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">{t('dashboard.title')}</h2>
        
        {/* Time Range Selector */}
        <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800/80 p-1 rounded-xl">
          <span className="text-[10px] text-slate-500 uppercase font-bold px-2 select-none">{t('dashboard.timeRange')}</span>
          {([6, 12, 24, 48] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                range === r
                  ? 'bg-blue-600/90 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              {t(`dashboard.range${r}h`)}
            </button>
          ))}
        </div>
      </div>
```

- [ ] **Step 4: Verify Frontend compilation build succeeds**

Run: `npm run build:frontend`
Expected: Compiled cleanly into `dist/frontend` with 0 warnings or errors.

- [ ] **Step 5: Run full test verification**

Run: `npx jest --runInBand`
Expected: Success.

- [ ] **Step 6: Commit frontend and translation changes**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts frontend/src/components/DashboardView.tsx
git commit -m "feat(dashboard): integrate time range segment controller and localize selection"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-07-dashboard-success-only-and-dynamic-range.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

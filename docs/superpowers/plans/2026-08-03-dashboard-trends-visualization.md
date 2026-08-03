# Dashboard Metrics Trends Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove static configuration cards from the main Dashboard view and display detailed, real-time trend charts for Transaction Volume, Average Latency, and Success vs. Error Count built using native SVG components and backend time-series aggregation.

**Architecture:** Extend `MetricsService` in Node.js to record hourly buckets (`timeSeries`) for the last 24 hours, update `/api/admin/stats` to return `timeSeries`, and rebuild `DashboardView.tsx` with native SVG area/line/bar trend charts.

**Tech Stack:** TypeScript, Node.js, Express, React, SVG, Vite, Jest.

## Global Constraints

- Return `timeSeries` array in `metricsService.getStats()`.
- Native SVG charts without third-party chart dependencies.
- All backend tests must pass with `npx jest --runInBand`.
- Frontend build must succeed with `npm run build:frontend`.

---

### Task 1: Extend MetricsService to Collect Hourly Time-Series Aggregations

**Files:**
- Modify: `src/admin/services/metricsService.ts`
- Test: `tests/metricsService.test.ts`

**Interfaces:**
- Consumes: `record(isError, duration)` & `init()` in `MetricsService`
- Produces: `getStats()` returning `{ totalLogs, sampleSize, successCount, errorCount, avgDurationMs, timeSeries: TimeSeriesPoint[] }`

- [ ] **Step 1: Write failing unit test for timeSeries aggregation in tests/metricsService.test.ts**

Update `tests/metricsService.test.ts`:

```typescript
import metricsService from '../src/admin/services/metricsService';

describe('MetricsService Time-Series Aggregations', () => {
  beforeEach(() => {
    metricsService.resetForTesting();
  });

  it('includes timeSeries array in getStats output', () => {
    metricsService.record(false, 150);
    metricsService.record(true, 300);

    const stats = metricsService.getStats();
    expect(stats).toHaveProperty('timeSeries');
    expect(Array.isArray(stats.timeSeries)).toBe(true);
    expect(stats.timeSeries.length).toBeGreaterThan(0);

    const latest = stats.timeSeries[stats.timeSeries.length - 1];
    expect(latest).toHaveProperty('time');
    expect(latest).toHaveProperty('total');
    expect(latest).toHaveProperty('success');
    expect(latest).toHaveProperty('error');
    expect(latest).toHaveProperty('avgDurationMs');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/metricsService.test.ts`
Expected: FAIL (`stats.timeSeries` is undefined)

- [ ] **Step 3: Implement timeSeries bucket aggregation in src/admin/services/metricsService.ts**

Update `src/admin/services/metricsService.ts`:

```typescript
export interface TimeSeriesPoint {
  time: string;
  total: number;
  success: number;
  error: number;
  avgDurationMs: number;
}

class MetricsService {
  private totalLogs = 0;
  private successCount = 0;
  private errorCount = 0;
  private totalDurationMs = 0;
  private durationCount = 0;
  private isInitialized = false;

  private timeSeriesMap: Map<string, { total: number; success: number; error: number; totalDuration: number; durationCount: number }> = new Map();

  private getHourKey(dateObj: Date = new Date()): string {
    const hours = String(dateObj.getHours()).padStart(2, '0');
    return `${hours}:00`;
  }

  public record(isError: boolean, duration?: number | null, timestamp?: Date): void {
    this.totalLogs++;
    if (isError) {
      this.errorCount++;
    } else {
      this.successCount++;
    }

    if (duration !== undefined && duration !== null && typeof duration === 'number') {
      this.totalDurationMs += duration;
      this.durationCount++;
    }

    // Time series bucket update
    const hourKey = this.getHourKey(timestamp || new Date());
    let bucket = this.timeSeriesMap.get(hourKey);
    if (!bucket) {
      bucket = { total: 0, success: 0, error: 0, totalDuration: 0, durationCount: 0 };
      this.timeSeriesMap.set(hourKey, bucket);
    }

    bucket.total++;
    if (isError) {
      bucket.error++;
    } else {
      bucket.success++;
    }

    if (duration !== undefined && duration !== null && typeof duration === 'number') {
      bucket.totalDuration += duration;
      bucket.durationCount++;
    }
  }

  public getStats() {
    const timeSeries: TimeSeriesPoint[] = Array.from(this.timeSeriesMap.entries()).map(([time, bucket]) => ({
      time,
      total: bucket.total,
      success: bucket.success,
      error: bucket.error,
      avgDurationMs: bucket.durationCount > 0 ? Math.round(bucket.totalDuration / bucket.durationCount) : 0
    }));

    return {
      totalLogs: this.totalLogs,
      sampleSize: this.durationCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      avgDurationMs: this.durationCount > 0 ? Math.round(this.totalDurationMs / this.durationCount) : 0,
      timeSeries
    };
  }

  public resetForTesting(): void {
    this.totalLogs = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalDurationMs = 0;
    this.durationCount = 0;
    this.timeSeriesMap.clear();
    this.isInitialized = false;
  }
}
```

- [ ] **Step 4: Run unit tests to verify pass**

Run: `npx jest tests/metricsService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit backend time-series changes**

```bash
git add src/admin/services/metricsService.ts tests/metricsService.test.ts
git commit -m "feat(admin): extend MetricsService with hourly time-series aggregation"
```

---

### Task 2: Rebuild DashboardView with Native SVG Trend Visualization Charts

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `/api/admin/stats` returning `timeSeries`
- Produces: Native SVG Area, Line, and Bar charts for Volume, Latency, and Success/Error ratio

- [ ] **Step 1: Add chart translations in en.ts & zh.ts**

In `frontend/src/i18n/locales/en.ts`:
```typescript
  dashboard: {
    // ... existing
    volumeChartTitle: "Transaction Volume Trend",
    latencyChartTitle: "Average Latency Trend (ms)",
    successErrorChartTitle: "Success vs. Error Distribution",
    noData: "No time-series metric data available yet."
  }
```

In `frontend/src/i18n/locales/zh.ts`:
```typescript
  dashboard: {
    // ... existing
    volumeChartTitle: "总交易量趋势",
    latencyChartTitle: "平均延迟趋势 (毫秒)",
    successErrorChartTitle: "成功与错误交易分布",
    noData: "暂无可用的时间序列指标数据。"
  }
```

- [ ] **Step 2: Rebuild DashboardView.tsx to render Native SVG Trend Charts**

In `frontend/src/components/DashboardView.tsx`:
1. Remove all static config sections (`LOG_LEVEL`, `TIME_ZONE`, `SYSTEM_ROLE_TO_INSTRUCTION`, `CUSTOM_SYSTEM_INSTRUCTION`, `MODEL_MAPPINGS`).
2. Keep top 4 metric tiles (Status/Uptime, Total Volume, Average Latency, Success/Error).
3. Render 3 custom SVG Trend Chart Cards using `stats?.timeSeries || []`:
   - **Volume Trend Area Chart**: SVG `<polygon>` / `<path>` with cyan/blue gradient fill.
   - **Average Latency Line Chart**: SVG `<polyline>` with purple nodes and duration values.
   - **Success vs Error Dual Bar Chart**: SVG `<rect>` bars comparing emerald success and rose error counts per time bucket.

```typescript
// Sample SVG Area Chart Render logic
const renderVolumeChart = (data: TimeSeriesPoint[]) => {
  if (!data || data.length === 0) return <div className="text-slate-500 italic p-8 text-center">{t('dashboard.noData')}</div>;
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  const width = 600;
  const height = 150;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - (d.total / maxTotal) * (height - 20);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible">
      <defs>
        <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#volGrad)" />
      <polyline points={points} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
      {data.map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * width;
        const y = height - (d.total / maxTotal) * (height - 20);
        return (
          <g key={i} className="group">
            <circle cx={x} cy={y} r="4" className="fill-cyan-400 stroke-slate-900 stroke-2 group-hover:r-6 transition-all cursor-pointer" />
            <title>{`${d.time}: ${d.total} reqs`}</title>
          </g>
        );
      })}
    </svg>
  );
};
```

- [ ] **Step 3: Build frontend to verify TypeScript compilation and Vite bundling**

Run: `npm run build:frontend`
Expected: Successful Vite React frontend build.

- [ ] **Step 4: Run full backend and integration test suite**

Run: `npx jest --runInBand`
Expected: All 20 test suites PASS.

- [ ] **Step 5: Commit DashboardView changes**

```bash
git add frontend/src/components/DashboardView.tsx frontend/src/i18n/locales/
git commit -m "feat(frontend): replace config cards with native SVG trend visualization charts in Dashboard"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (Removed config cards, added Volume, Latency, and Success/Error SVG trend charts)
- [x] No placeholders or vague TODOs
- [x] Exact file paths and line steps provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

# Model Display in Request Logs & Model Distribution Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract and expose model names in request logs and display a native SVG model request distribution trend chart on the Admin Dashboard.

**Architecture:** Extend `LogService` to parse `model` from transaction JSON, extend `MetricsService` to track hourly per-model request counts (`models`), display Model Badges on log list items in `LogsView.tsx`, and render a Model Distribution SVG chart in `DashboardView.tsx`.

**Tech Stack:** TypeScript, Express, React, SVG, Vite, Jest.

## Global Constraints

- Model name extracted from `client_req.model` or `claude_res.model`.
- Native SVG chart without external charting libraries.
- All backend tests must pass with `npx jest --runInBand`.
- Frontend build must succeed with `npm run build:frontend`.

---

### Task 1: Extend LogService and MetricsService to Track Model Names and Distribution

**Files:**
- Modify: `src/admin/services/logService.ts`
- Modify: `src/admin/services/metricsService.ts`
- Test: `tests/adminController.test.ts`
- Test: `tests/metricsService.test.ts`

**Interfaces:**
- Consumes: `client_req.model` in transaction payload JSON
- Produces: `LogItem.model` in `listLogs` and `models: Record<string, number>` in `timeSeries` points from `metricsService.getStats()`

- [ ] **Step 1: Write failing unit test in tests/metricsService.test.ts for per-model tracking**

Update `tests/metricsService.test.ts`:

```typescript
  it('tracks per-model counts inside timeSeries buckets', () => {
    metricsService.record(false, 100, new Date(), 'gemini-3.1-flash');
    metricsService.record(false, 200, new Date(), 'claude-3-5-sonnet');

    const stats = metricsService.getStats();
    const latest = stats.timeSeries[stats.timeSeries.length - 1];
    expect(latest).toHaveProperty('models');
    expect(latest.models['gemini-3.1-flash']).toBe(1);
    expect(latest.models['claude-3-5-sonnet']).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/metricsService.test.ts -t "per-model"`
Expected: FAIL (`latest.models` is undefined)

- [ ] **Step 3: Implement model property in LogService and MetricsService**

In `src/admin/services/logService.ts`:
1. Add `model?: string | null;` to `LogItem` interface.
2. In `listLogs`, extract model when parsing JSON:
   ```typescript
   const modelName = parsed.client_req?.model || parsed.claude_res?.model || null;
   // ... inside return object
   model: modelName
   ```

In `src/admin/services/metricsService.ts`:
1. Add `models: Record<string, number>` to `TimeSeriesPoint` interface.
2. Update `timeSeriesMap` bucket type to include `models: Map<string, number>`.
3. Update `record(isError, duration, timestamp, modelName)`:
   ```typescript
   public record(isError: boolean, duration?: number | null, timestamp?: Date, modelName?: string | null): void {
     // ...
     if (modelName) {
       bucket.models[modelName] = (bucket.models[modelName] || 0) + 1;
     }
   }
   ```
4. Update `getStats()` to return `models` mapping object in each `timeSeries` point.

- [ ] **Step 4: Run unit tests to verify pass**

Run: `npx jest tests/metricsService.test.ts tests/adminController.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit backend model tracking changes**

```bash
git add src/admin/services/logService.ts src/admin/services/metricsService.ts tests/metricsService.test.ts tests/adminController.test.ts
git commit -m "feat(admin): extract model in logService and aggregate per-model timeSeries in metricsService"
```

---

### Task 2: Render Model Badges in LogsView and Model Distribution Trend Chart in DashboardView

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/components/LogsView.tsx`
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `log.model` in `LogsView`, `timeSeries[i].models` in `DashboardView`
- Produces: Visual Model Badge in log list & Native SVG Model Distribution Chart in Dashboard

- [ ] **Step 1: Add i18n translation keys in en.ts & zh.ts**

In `frontend/src/i18n/locales/en.ts`:
```typescript
  dashboard: {
    // ...
    modelChartTitle: "Model Distribution Trend"
  },
  logs: {
    // ...
    modelLabel: "Model"
  }
```

In `frontend/src/i18n/locales/zh.ts`:
```typescript
  dashboard: {
    // ...
    modelChartTitle: "模型请求分布趋势"
  },
  logs: {
    // ...
    modelLabel: "模型"
  }
```

- [ ] **Step 2: Render Model Badge in frontend/src/components/LogsView.tsx**

In `frontend/src/components/LogsView.tsx`:
In Row 1 of each Log Card, next to `pathLabel` or `formattedTime`, display `log.model` badge:
```typescript
{log.model && (
  <span className="px-1.5 py-0.5 rounded border text-[9px] font-mono font-medium bg-amber-500/10 text-amber-300 border-amber-500/20 truncate max-w-[120px]" title={log.model}>
    {log.model}
  </span>
)}
```

- [ ] **Step 3: Render Model Distribution Chart in frontend/src/components/DashboardView.tsx**

In `frontend/src/components/DashboardView.tsx`:
Add a 4th trend chart card:
1. Extract distinct active models from `timeSeries` points: `const allModels = Array.from(new Set(timeSeries.flatMap(p => Object.keys(p.models || {}))));`
2. Assign palette colors (e.g. Cyan `#06b6d4`, Purple `#a855f7`, Amber `#f59e0b`, Emerald `#10b981`).
3. Render multi-line SVG polylines for each active model over time.
4. Display Legend header with colored dots for each model name.
5. In Hover Tooltip, list per-model breakdown for the hovered hour.

- [ ] **Step 4: Build frontend and run full test suite**

Run: `npm run build:frontend`
Expected: Successful Vite React build.

Run: `npx jest --runInBand`
Expected: All 20 test suites PASS.

- [ ] **Step 5: Commit frontend changes**

```bash
git add frontend/src/components/LogsView.tsx frontend/src/components/DashboardView.tsx frontend/src/i18n/locales/
git commit -m "feat(frontend): display model badge in log list and model distribution trend chart on dashboard"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (Model extracted in LogItem, Model Badge in LogsView, Model distribution SVG chart on Dashboard)
- [x] No placeholders or vague TODOs
- [x] Exact code modifications provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

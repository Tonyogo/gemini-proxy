# Design Spec: Model Display in Request Logs & Model Distribution Chart

## Overview
This specification details adding model transparency across the Admin Web Console:
1. Displaying the invoked model name (e.g., `gemini-3.1-flash`, `claude-3-5-sonnet`) directly on each item in the Request Logs sidebar list (`frontend/src/components/LogsView.tsx`).
2. Adding a 4th native SVG trend chart to the Dashboard (`frontend/src/components/DashboardView.tsx`) visualizing model request volume distribution over the trailing 24-hour window.

---

## Architectural Changes

### 1. Backend Service Extensions

#### LogService (`src/admin/services/logService.ts`)
- Updates `LogItem` interface:
  ```typescript
  export interface LogItem {
    date: string;
    hour: string;
    filename: string;
    path: string;
    reqPath?: string | null;
    timestamp?: string | null;
    status?: number | null;
    isStream?: boolean;
    duration?: number | null;
    model?: string | null;
  }
  ```
- Extracts model from payload JSON: `parsed.client_req?.model || parsed.claude_res?.model || null`.

#### MetricsService (`src/admin/services/metricsService.ts`)
- Updates `TimeSeriesPoint` schema:
  ```typescript
  export interface TimeSeriesPoint {
    time: string;
    total: number;
    success: number;
    error: number;
    avgDurationMs: number;
    models: Record<string, number>;
  }
  ```
- Updates `record(isError, duration, timestamp, modelName)` and `init()` parser to track model frequencies within hourly buckets and in global `modelDistribution`.
- Updates `getStats()` response to return `modelDistribution: Record<string, number>` and `models` inside each `timeSeries` bucket.

---

### 2. Frontend UI Enhancements

#### Request Logs Sidebar (`frontend/src/components/LogsView.tsx`)
- Displays Model Badge (e.g. `gemini-3.1-flash`) on Row 1 or Row 2 of each Log Card using amber/indigo themed badge styles.

#### Dashboard Model Distribution Chart (`frontend/src/components/DashboardView.tsx`)
- Adds a 4th trend chart card: **Model Distribution Trend**.
- Renders multi-line SVG trend curves, assigning distinct brand color palettes to top active models.
- Interactive Hover Tooltip shows exact per-model request counts for the hovered hour.

#### i18n Translations (`frontend/src/i18n/locales/en.ts` & `zh.ts`)
- Adds `dashboard.modelChartTitle` ("Model Distribution Trend" / "模型请求分布趋势").
- Adds `logs.modelLabel` ("Model" / "模型").

---

## Testing Strategy
- **Unit Tests**: Update `tests/logService.test.ts` and `tests/metricsService.test.ts` to assert that `model` is returned in log items and `models` mapping is present in `timeSeries`.
- **Build Verification**: Run `npx jest --runInBand` and `npm run build:frontend`.

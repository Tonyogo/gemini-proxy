# Design Spec: Dashboard Metrics Trends Visualization

## Overview
This specification details the refactoring of the Admin Web Console Dashboard (`frontend/src/components/DashboardView.tsx`). The static configuration display cards are removed from the main dashboard (since configuration can be viewed and edited in the Config Modal), and replaced with detailed, real-time trend visualization charts for **Transaction Volume**, **Average Latency**, and **Success vs. Error Ratio** built using native SVG components and backend time-series aggregation.

---

## Architectural Changes

### 1. Backend Time-Series Metrics Engine (`src/admin/services/metricsService.ts`)

#### Schema & Aggregation
- Defines `TimeSeriesPoint` schema:
  ```typescript
  export interface TimeSeriesPoint {
    time: string;          // Formatted hour label e.g., "14:00"
    total: number;         // Total request volume
    success: number;       // Success count
    error: number;         // Error count
    avgDurationMs: number; // Average latency in milliseconds
  }
  ```
- Maintains an hourly map/array of time-series buckets (for the last 24 hours).
- During log scanning (`init()`) and real-time request recording (`record()`), increments counts and latency sums within the active hourly bucket.
- Updates `getStats()` endpoint response contract:
  ```json
  {
    "totalLogs": 1280,
    "sampleSize": 1000,
    "successCount": 1250,
    "errorCount": 30,
    "avgDurationMs": 240,
    "timeSeries": [
      { "time": "10:00", "total": 120, "success": 118, "error": 2, "avgDurationMs": 210 },
      ...
    ]
  }
  ```

---

### 2. Frontend Dashboard Refactoring (`frontend/src/components/DashboardView.tsx`)

#### Removal of Static Configuration Sections
- Removes `logLevel`, `timeZone`, `systemRoleToInstruction`, `customSystemInstruction`, and `modelMappings` static JSON code cards.

#### Top Stat Banner
- Retains top 4 quick metric tiles:
  - System Status & Uptime.
  - Total Volume.
  - Average Latency.
  - Success / Error Count ratio.

#### Native SVG Trend Visualization Section
Adds 3 custom, high-performance SVG chart cards formatted in Tailwind dark theme (`bg-slate-800/80`):
1. **Transaction Volume Trend Chart (Area Line Chart)**:
   - Cyan/Blue gradient filled area line showing request throughput across hourly buckets.
2. **Average Latency Trend Chart (Polyline Chart)**:
   - Purple/Amber line chart with data points and latency labels.
3. **Success vs. Error Distribution Chart (Dual Bar/Line Chart)**:
   - Emerald Green (Success) and Rose Red (Error) side-by-side or stacked bars showing request outcomes.
- Includes interactive Hover Tooltips to inspect precise data values for each hourly bucket.

#### i18n Dictionary Updates (`frontend/src/i18n/locales/en.ts` & `zh.ts`)
- Adds translations for chart titles, axis labels, and empty data states.

---

## Testing Strategy
- **Unit Test**: Update `tests/metricsService.test.ts` to assert that `timeSeries` array is returned in `getStats()` and correctly groups metrics.
- **Build Verification**: Run `npm run build:frontend` and `npx jest --runInBand`.

# Design Spec: Dashboard Success-Only Metrics & Dynamic Time Range Support

## Overview
This specification details the optimizations of the Admin Dashboard trend charts and core analytics telemetry. It introduces dynamic time range selection (6h, 12h, 24h, 48h) with back-to-front integration, ensuring all primary KPI metrics dynamically sync with the selected range. Additionally, average latency and model distribution charts are updated to strictly count successful requests (`status < 400`).

---

## Technical Architecture & Core Changes

### 1. Stats Refactoring for Success-Only Requests (`src/admin/services/metricsService.ts`)
To prevent failed requests (e.g., timeouts, 400 Bad Requests, 500 Server Errors) from skewing operational latency and model usage metrics, we must separate total volume tracking from successfully served telemetry.

Inside `metricsService.ts`:
- **Hourly Bucket Properties**:
  - `bucket.totalDuration` and `bucket.durationCount` will strictly increment **only when `isError = false`** (`status < 400`).
  - `bucket.models[modelName]` distribution frequencies will strictly increment **only when `isError = false`** (`status < 400`).
  - `bucket.total`, `bucket.success`, and `bucket.error` continue to track all incoming transactions.

### 2. Dynamic Time Range Parameter (`/api/admin/stats?range=X`)
Currently, `/api/admin/stats` returns a hardcoded 24-hour timeSeries and a global cumulative KPI summary. To achieve precise range-bound reporting:

- **Query Parameter**: Introduce an optional `range` query parameter to `/api/admin/stats` supporting values `6`, `12`, `24`, and `48` (default: `24`).
- **Controller Layer (`src/admin/controllers/adminController.ts`)**:
  - Read `req.query.range` as string, parse as integer, and validate against allowed options (`[6, 12, 24, 48]`). Fall back to `24` if missing or invalid.
  - Pass the dynamic `range` parameter down to `logService.getStats(range)`.
- **Metrics Telemetry (`src/admin/services/metricsService.ts`)**:
  - Refactor `getStats(rangeHours = 24)` to dynamically generate exactly `rangeHours` chronological hourly points ending at the current hour.
  - Recalculate range-bound KPI summary values on-the-fly across the selected `rangeHours` points:
    - `totalLogs`: Sum of `total` in range-bound points.
    - `successCount`: Sum of `success` in range-bound points.
    - `errorCount`: Sum of `error` in range-bound points.
    - `sampleSize`: Sum of `durationCount` (success-only) in range-bound points.
    - `avgDurationMs`: Range-bound average latency calculated as `(sum of hourly totalDuration) / (sum of hourly durationCount)` for successful requests.

### 3. Frontend Time Range Select & Dynamic Synchronized KPIs (`frontend/src/components/DashboardView.tsx`)
- **Range Picker UI**: Implement a premium, low-profile segment control tab group at the top-right of the Dashboard header: `[ 6h | 12h | 24h | 48h ]`.
- **State Management**: Manage an active `range` state hook (defaulting to `24`). Trigger a fetch of `/api/admin/stats?range=${range}` whenever the user clicks a range option.
- **KPI Card Real-Time Sync**: Replace the static server uptime card or other unlinked KPIs with range-bound success ratios and linked statistics.
- **Bilingual i18n Support**:
  - Define range picker labels in both English (`en.ts`) and Chinese (`zh.ts`):
    - `rangeLabel6h`: `"6h"`, `"6小时"`
    - `rangeLabel12h`: `"12h"`, `"12小时"`
    - `rangeLabel24h`: `"24h"`, `"24小时"`
    - `rangeLabel48h`: `"48h"`, `"48小时"`
    - `rangeSelection`: `"Time Range"`, `"时间区间"`

---

## Verification & Testing Strategy
1. **Unit and Integration Tests**: Update existing `tests/metricsService.test.ts` to assert:
   - Average latency and models metrics are only populated for successful transactions (`status < 400`).
   - `getStats(range)` correctly restricts `timeSeries` length, accurately sums range-bound counts, and returns correct average latency.
2. **Execution**: Run `npx jest --runInBand` and ensure all suites pass with 100% success.
3. **Build Integrity**: Compile Vite using `npm run build:frontend` to verify strict TypeScript and Vite compliance.

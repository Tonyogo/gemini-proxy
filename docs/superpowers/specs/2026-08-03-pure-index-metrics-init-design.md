# Design Spec: Pure Index-Based Metrics Initialization

## Overview
Previously, `MetricsService.init()` retained a folder-based fallback scanner that performed deep directory traversals (`fs.readdir`) and bulk file reads (`fs.readFile`) of individual `transaction_*.json` log bodies whenever an `index.jsonl` manifest was absent or incomplete. This created potential I/O bottlenecks and OOM vulnerabilities during server startup when processing large volumes of historical logs.

With the `index.jsonl` daily index manifest fully operational, this specification refactors `MetricsService.init()` to rely **strictly and exclusively** on reading daily `index.jsonl` files. It completely eliminates all folder-based fallback scans and individual transaction JSON body file reads during startup.

---

## Architectural Changes

### 1. Pure Index Initialization (`src/admin/services/metricsService.ts`)

#### Simplified Startup Execution Flow
In `MetricsService.init()`:
1. Lists top-level date directories under `TRANSACTION_LOGS_DIR` (e.g. `2026-08-03`).
2. For each date directory:
   - Reads `logs/<date>/index.jsonl` directly.
   - Accurately increments `this.totalLogs += records.length`.
   - For recent days (Today and Yesterday), iterates line-by-line over the index records to hydrate:
     - `this.successCount` and `this.errorCount` (via `record.status >= 400`).
     - `this.totalDurationMs` and `this.durationCount` (via `record.duration`).
     - `this.timeSeriesMap` hourly trends and model frequencies (via `record.timestamp` and `record.model`).
   - If `index.jsonl` does not exist for a date directory, it is skipped immediately with zero folder recursion or JSON file reading.

#### Absolute Elimination of File Body Reads
- Removes all `fs.readdir(hourDir)` calls and `fs.readFile` promises for `transaction_*.json` payload files within `MetricsService.ts`.
- Caps startup memory footprint to less than 1 MB regardless of historical transaction log count.

---

## Testing Strategy
- **Unit Test**: Update `tests/metricsService.test.ts` to assert that `MetricsService.init()` populates stats cleanly from `index.jsonl`.
- **Build Verification**: Run `npx jest --runInBand` and `npm run build:frontend`.

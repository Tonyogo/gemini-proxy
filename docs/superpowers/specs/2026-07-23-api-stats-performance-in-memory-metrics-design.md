# Design Spec: High-Performance In-Memory Metrics Aggregator

## Executive Summary
This design solves the performance degradation of the `/api/admin/stats` endpoint by replacing on-demand disk scanning with an In-Memory Metrics Counter (`metricsService.ts`) initialized with a one-time startup baseline scan.

This reduces the response latency of `/api/admin/stats` from seconds (N x IO disk reads) to **< 1 millisecond** (instant O(1) in-memory property access).

## Component Architecture

### 1. In-Memory Metrics Service (`src/admin/services/metricsService.ts`)
- **State Properties**:
  - `totalLogs`: Total number of processed API transactions.
  - `successCount`: Total successful API transactions (non-error).
  - `errorCount`: Total error API transactions (4xx/5xx responses or connection errors).
  - `totalDurationMs`: Accumulated transaction duration in milliseconds.
  - `avgDurationMs`: Computed average latency per transaction.
- **Methods**:
  - `init()`: Triggered once on server startup. Asynchronously scans `TRANSACTION_LOGS_DIR` to populate baseline metrics from existing historical log files.
  - `record(isError: boolean, duration?: number)`: Increments in-memory counters in O(1) time when a transaction completes.
  - `getStats()`: Instantaneously returns the current in-memory metrics state.

### 2. Integration Points
- **`src/services/payloadLogger.ts`**: Calls `metricsService.record(hasError, duration)` upon completion of `saveTransaction()`.
- **`src/admin/services/logService.ts`**: Refactors `getStats()` to return `metricsService.getStats()`, removing all blocking serial file reads.
- **`src/app.ts` / `src/index.ts`**: Calls `metricsService.init()` on startup to perform baseline priming.

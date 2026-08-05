# Design Spec: Lightweight JSON Lines Log Index Manifest (`index.jsonl`)

## Overview
As request logs accumulate, initializing the service or loading the Request Logs list previously required traversing thousands of subdirectories (`logs/<date>/<hour>/`) and reading/parsing individual `transaction_*.json` files. This caused disk I/O bottlenecks, high memory consumption, and potential OOM crashes.

This specification introduces a lightweight, append-only JSON Lines index file (`logs/<YYYY-MM-DD>/index.jsonl`) created daily. Every log transaction appends a tiny single-line JSON index record, allowing log listings and startup metrics to be served in sub-millisecond speeds without reading individual transaction JSON bodies or deeply scanning hourly directories.

---

## Architectural Changes

### 1. Log Index Record Schema (`src/types/index.ts` or `src/services/payloadLogger.ts`)

Each line in `logs/<YYYY-MM-DD>/index.jsonl` follows the schema:
```typescript
export interface LogIndexRecord {
  id: string;             // Transaction ID e.g. "1785490665483_vbzalx4e8"
  timestamp: string;      // ISO timestamp e.g. "2026-08-03T14:20:00.123Z"
  date: string;           // Date string "YYYY-MM-DD"
  hour: string;           // Hour string "HH"
  filename: string;       // Log filename e.g. "transaction_1785490665483_vbzalx4e8.json"
  path: string;           // Relative path e.g. "2026-08-03/14/transaction_1785490665483_vbzalx4e8.json"
  status: number;         // HTTP status code (200, 500, etc.)
  duration: number | null;// Duration in milliseconds
  reqPath: string | null; // Route path e.g. "/v1/messages"
  model: string | null;   // Model name e.g. "gemini-3.1-flash"
  isStream: boolean;      // Stream flag
}
```

---

### 2. Append-Only Index Writer (`src/services/payloadLogger.ts`)

In `PayloadLogger.saveTransaction`:
1. Saves detailed log JSON to `logs/<date>/<hour>/transaction_<id>.json` as before.
2. Constructs `LogIndexRecord` and appends it to `logs/<date>/index.jsonl` using `fs.appendFile`:
   ```typescript
   const indexRecord: LogIndexRecord = { ... };
   const indexPath = path.join(this.getDebugDir(), dateStr, 'index.jsonl');
   await fs.appendFile(indexPath, JSON.stringify(indexRecord) + '\n', 'utf8');
   ```

---

### 3. Fast Index Reader Engine

#### Log Listing (`src/admin/services/logService.ts`)
- In `listLogs`:
  - Directly checks if `logs/<filterDate>/index.jsonl` exists.
  - If present: Reads and parses lines into `LogIndexRecord[]`. Filters by `hour` if `filterHour !== 'all'`, computes total count (`hourCount`), and slices current page without touching individual `transaction_*.json` files.
  - If missing (legacy logs): Falls back to folder directory scan and automatically generates/writes `index.jsonl` for seamless backward compatibility.

#### Service Initialization (`src/admin/services/metricsService.ts`)
- In `init()`:
  - Checks and reads `index.jsonl` for Today and Yesterday.
  - Hydrates `timeSeries` metrics and global counts instantly.

---

## Retention & Garbage Collection
- Log expiration pruning (`LOG_RETENTION_DAYS`) deletes entire `logs/<YYYY-MM-DD>/` date directories.
- `index.jsonl` resides inside the date folder and is deleted automatically with zero orphan index files or manual cleanup logic.

---

## Testing Strategy
- **Unit Test**: Update `tests/payloadLogger.test.ts` and `tests/adminController.test.ts` to verify `index.jsonl` creation, line appending, and listing fallback.
- **Build Verification**: Run `npx jest --runInBand` and `npm run build:frontend`.

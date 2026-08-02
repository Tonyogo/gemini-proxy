# Design Spec: Logs Page Performance Optimization

## Overview
The Admin Web Console Logs page (`frontend/src/components/LogsView.tsx`) loads slowly when transaction logs accumulate. The bottleneck stems from two areas:
1. **Backend Heavy I/O**: `LogService.listLogs` performs a full recursive traversal of all date (`YYYY-MM-DD`) and hour (`HH`) subdirectories under `TRANSACTION_LOGS_DIR`, plus reads and parses JSON for up to 100 files per request.
2. **Frontend Double Fetch**: On initial load, `LogsView.tsx` issues `GET /api/admin/logs?limit=100` and immediately re-fetches `GET /api/admin/logs?limit=100&date=X&hour=Y` upon auto-jumping to the latest date/hour, causing back-to-back heavy disk scans.

This optimization refactors both backend log listing logic and frontend initial fetch workflows to deliver fast, sub-100ms response times for the logs view.

---

## Architectural Changes

### 1. Backend Optimization (`src/admin/services/logService.ts`)

#### Early Termination & Target Directory Traversal
- When `filterDate` and `filterHour` are provided:
  - Access `TRANSACTION_LOGS_DIR/<filterDate>/<filterHour>` directly via `fs.readdir`.
  - Skip scanning unrelated date and hour directories.
- When `filterDate` and `filterHour` are **not** provided (default initial page load):
  - Read date directories sorted in descending order (newest first).
  - Iterate through hour directories (newest first) and collect JSON filenames until `items.length >= limit`.
  - Stop directory traversal early once `limit` items are gathered, avoiding deep I/O on thousands of older log files.
- Build directory `tree` structure using high-level directory listings without reading full file arrays where possible.

#### Lightweight Metadata Extraction & Default Limit
- Default listing limit reduced from 100 to 30 items per request for faster payload serialization.
- Metadata extraction (`timestamp`, `status`, `reqPath`, `isStream`) is strictly executed on the sliced array (max `limit` files).

---

### 2. Frontend Optimization (`frontend/src/components/LogsView.tsx`)

#### Single Initial Fetch Pattern
- On mount, `LogsView` issues a single request: `GET /api/admin/logs?limit=30`.
- The response returns the latest logs slice along with the directory `tree`.
- Instead of issuing a second `fetchSpecificLogs` call, `LogsView` sets `selectedDate` and `selectedHour` from the first returned log item (or top of `tree`) without triggering a re-fetch.
- Subsequent fetches only occur when the user explicitly changes the `Date` or `Hour` select inputs or clicks manual refresh.

---

## Data Flow

```
[User opens Logs Tab]
       │
       ▼
[LogsView.tsx: fetchLogs(false)]
       │
       ▼  GET /api/admin/logs?limit=30
[AdminController -> logService.listLogs]
       │
       ├── Reads newest date/hour dirs until limit=30 reached
       ├── Reads JSON metadata for 30 files concurrently
       └── Returns { tree, logs, total }
       │
       ▼
[LogsView.tsx]
       ├── Stores logs & tree state
       ├── Syncs selectedDate/selectedHour from top log (No re-fetch!)
       └── Triggers loadDetail(logs[0]) for inspector view
```

---

## Error Handling & Backward Compatibility
- If log directory structure is empty or missing, returns `{ tree: {}, logs: [], total: 0 }` gracefully.
- If JSON parsing fails for a corrupt log file, falls back to `fs.stat` modified time and null status as before.
- API response contract for `/api/admin/logs` remains unchanged (`{ tree, logs, total }`), ensuring full backward compatibility.

---

## Testing Strategy
- **Unit Tests**:
  - Update/extend `tests/adminController.test.ts` to test log listing with limit, date/hour filtering, and empty log directory edge cases.
- **Verification**:
  - Run `npx jest --runInBand` to confirm all 19 test suites pass.

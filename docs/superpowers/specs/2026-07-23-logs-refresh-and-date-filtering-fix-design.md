# Design Spec: Logs Auto-Jump to Latest Hour and Server-Side Date/Hour Filtering

## Executive Summary
This design resolves two issues in the Logs view:
1. **Refresh Auto-Jump**: Clicking "Refresh" or re-fetching logs enforces auto-selecting the most recent date and hour with data rather than locking to stale state (`prev || latest`).
2. **Server-Side Date/Hour Filtering**: Updates `GET /api/admin/logs` to support `date` and `hour` query parameters, ensuring switching to historical dates/hours fetches all records for that timeframe rather than failing due to limit truncation.

## Backend Enhancements (`src/admin/services/logService.ts` & `adminController.ts`)

### 1. Extended `logService.listLogs` Filtering
- **Query Parameters**: `page`, `limit`, `date` (optional string), `hour` (optional string).
- **Behavior**:
  - When `date` or `hour` parameters are passed, filter items directly during the file system scan so that all logs matching the requested timeframe are included.

## Frontend Enhancements (`frontend/src/components/LogsView.tsx`)

### 1. Dynamic Refetch on Date/Hour Change
- When the user selects a different date or hour from the dropdowns, `LogsView` triggers a fetch with `?date={selectedDate}&hour={selectedHour}`.

### 2. Explicit Auto-Jump to Latest
- Initial load or manual "Refresh" action resets and forces `selectedDate` to the top-most (latest) date key and `selectedHour` to the top-most (latest) hour key in `tree`.

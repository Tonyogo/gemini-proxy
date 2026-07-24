# Design Spec: Historical Log Inspection with Date Tree Hierarchy

## Executive Summary
This design specifies the Date Tree Hierarchy feature for the Transaction Log Debugger in `gemini-proxy`. It allows administrators to seamlessly browse, filter, and inspect historical transaction logs across different dates and hours (`YYYY-MM-DD/HH`).

## Backend API Enhancement (`src/admin/services/logService.ts`)

### 1. Extended Output Structure for `GET /api/admin/logs`
Update `logService.listLogs()` to scan and return available date/hour groupings alongside the flattened logs list.

```typescript
export interface LogTreeStructure {
  [date: string]: {
    [hour: string]: number; // count of log files in this hour
  };
}

export interface ListLogsResult {
  tree: LogTreeStructure;
  logs: LogItem[];
  total: number;
}
```

## Frontend Logs Inspection UI (`frontend/src/components/LogsView.tsx`)

### 1. Collapsible Date/Hour Tree Sidebar
- Renders dates in descending chronological order (e.g., `2026-07-22`).
- Clicking a date toggles its expansion to reveal active hours (`15:00`, `16:00`).
- Clicking an hour or selecting a date filters the file list to show logs belonging strictly to that timeframe.
- Includes a manual "Refresh" button to fetch newly generated logs without reloading the browser.

### 2. Side-by-Side Payload Inspector
- Retains the multi-tab / stacked JSON viewer for:
  - Incoming Claude API Request
  - Translated Gemini Upstream Request
  - Final Claude Response
- Displays latency duration badges for selected transaction files.

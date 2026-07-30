# Design Spec: Enhanced Transaction Logging with Status and Stream Indicators

**Date**: 2026-07-28  
**Topic**: Add HTTP Status Code and IsStream indicators to logs storage and viewer  
**Status**: Approved

## Problem Statement
Currently, transaction logs capture the request path, payload JSONs, and latency. However, developers and administrators lack immediate visibility into the upstream Gemini API HTTP Status Code and whether the request was handled via SSE Streaming or Sync JSON directly from the log file list.

## Solution Design

### 1. Payload Logger Extension (`src/services/payloadLogger.ts`)
Update the `saveTransaction` method signature to include `status` and `isStream`:
```typescript
public async saveTransaction(
  transactionId: string,
  clientReq: any,
  gemReq: any,
  gemRes: any,
  claudeRes: any,
  duration?: number,
  reqPath?: string,
  status?: number,
  isStream?: boolean
): Promise<void>
```
Store these values in the JSON output as `status` and `is_stream`.

### 2. Controller Dispatch Updates (`src/controllers/claudeController.ts`)
Inject the correct values into all `saveTransaction` calls:
- In `handleMessages` (Stream branch): pass `status: 200, isStream: true`.
- In `handleMessages` (Non-stream branch): pass `status: 200, isStream: false`.
- In `handleCountTokens`: pass `status: 200, isStream: false`.
- In Error catching paths (Authentication, Timeout, Upstream Errors, Unhandled catches): pass `errStatus` (e.g. `401`, `504`, `500`) and the corresponding boolean flag derived from the payload.

### 3. Log Service Metadata Enrichment (`src/admin/services/logService.ts`)
Update the pagination file read loop to extract `parsed.status` and `parsed.is_stream` from each loaded JSON document and expose them in the `enrichedLogs` list.

### 4. Admin UI Visualization (`frontend/src/components/LogsView.tsx`)
Modify the log list item component:
- Remove the redundant `<span>{log.date}</span>` element to save horizontal space.
- Add an HTTP Status Badge component:
  - If `status >= 200 && status < 300`: emerald badge (e.g., `200`).
  - If `status >= 400 && status < 500`: amber badge (e.g., `401`, `400`).
  - If `status >= 500`: rose/red badge (e.g., `500`, `504`).
- Add an `isStream` Badge component:
  - If `log.isStream === true`, render a distinctive `Stream` badge.

## Impacted Files
- `src/services/payloadLogger.ts`
- `src/controllers/claudeController.ts`
- `src/admin/services/logService.ts`
- `frontend/src/components/LogsView.tsx`
- `tests/payloadLogger.test.ts` (Update mock signatures)
- `tests/claudeLogging.test.ts` / `tests/claudeCountTokens.test.ts` (Update mock signatures)

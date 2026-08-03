# Design Spec: Log Detail Caching Strategy

## Overview
When viewing transaction logs in the Admin Console (`frontend/src/components/LogsView.tsx`), users frequently switch back and forth between different log items. Previously, every click triggered a new HTTP request and re-read from the server, even though individual transaction logs are immutable static records.

This specification introduces a 1-hour HTTP cache header (`Cache-Control: public, max-age=3600, immutable`) on the backend log detail endpoint and a React component-level memory cache on the frontend to allow instant, zero-latency log switching.

---

## Key Changes

### 1. Backend HTTP Cache-Control Header (`src/admin/controllers/adminController.ts`)
In `AdminController.getLogDetail`:
- Before sending JSON response for `/api/admin/logs/:date/:hour/:filename`, set the `Cache-Control` header:
  ```typescript
  res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
  ```
- This informs the browser that the log detail resource is static and immutable, enabling browser disk/memory caching for 1 hour (3600 seconds).

### 2. Frontend React Component Memory Cache (`frontend/src/components/LogsView.tsx`)
In `LogsView`:
- Maintain a mutable Map cache using `useRef`:
  ```typescript
  const detailCacheRef = useRef<Map<string, any>>(new Map());
  ```
- In `loadDetail(log)`:
  - Check if `log.path` exists in `detailCacheRef.current`.
  - If cached: Immediately update `selectedLog` with cached data without setting `detailLoading` or triggering an HTTP request.
  - If not cached: Fetch log detail from `/api/admin/logs/...`, store result in `detailCacheRef.current.set(log.path, data)`, and update `selectedLog`.
- When clicking the manual "Refresh" button, clear `detailCacheRef.current` to ensure fresh server data can be retrieved if needed.

---

## Error Handling & Edge Cases
- If fetch fails, the error response is not cached, allowing subsequent retries.
- 404 response errors will return standard HTTP status without `immutable` headers.

---

## Testing Strategy
- **Unit Test**: Update `tests/adminController.test.ts` to assert that `GET /api/admin/logs/:date/:hour/:filename` returns `Cache-Control: public, max-age=3600, immutable`.
- **Verification**: Run `npx jest --runInBand` and `npm run build:frontend`.

# Design Spec: Playground Copy as cURL and Concurrent Testing

**Date**: 2026-07-28  
**Topic**: Add Copy as cURL button and Concurrent Testing Modal with Aggregate Statistics to Playground  
**Status**: Approved

## Problem Statement
Users debugging APIs in the Playground currently have no easy way to export the configured HTTP request into a terminal-executable `curl` command. Furthermore, there is no way to perform multi-request concurrency load/latency testing directly within the proxy web management console.

## Solution Design

### 1. Copy as cURL Functionality
In `frontend/src/components/PlaygroundView.tsx`:
- Add a `Copy cURL` button next to the request headers / controls.
- Implement `generateCurlCommand()` helper:
  - Dynamically computes origin URL (e.g. `window.location.origin`).
  - Resolves path (`/v1/messages`, `/v1/messages/count_tokens`, or custom URL).
  - Includes `-H "x-api-key: ..."` and `-H "Content-Type: application/json"`.
  - Attaches single-line escaped payload body for non-GET methods.
- Write to system clipboard via `navigator.clipboard.writeText(...)` with a temporary `Copied!` tooltip/toast.

### 2. Concurrent Testing Modal (`frontend/src/components/ConcurrentTestModal.tsx`)
Create a dedicated concurrency test runner modal:
- **Inputs**:
  - `concurrency`: Number of simultaneous requests (default `5`, min `1`, max `50`).
  - `totalRequests`: Total test iterations (default `10`, min `1`, max `200`).
- **Execution Engine**:
  - Batches and dispatches requests in concurrency buckets.
  - Automatically forces `stream: false` during concurrency testing to record precise full-response HTTP durations.
  - Computes real-time progress (`completedRequests / totalRequests`).
- **Aggregate KPI Stats**:
  - Success Count / Failed Count
  - Total Elapsed Duration (ms) & Calculated QPS
  - Min / Average / Max Latency (ms)
- **Detailed Result Table**:
  - Renders a list of completed requests showing `Index`, `Status Code`, `Latency (ms)`, and `Error Details` (if failed).

## Impacted Files
- `frontend/src/components/ConcurrentTestModal.tsx` (New component)
- `frontend/src/components/PlaygroundView.tsx` (Integrate cURL export and Modal trigger)

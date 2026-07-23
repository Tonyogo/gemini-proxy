# Design Spec: Upstream Interface Timeout Management

## Overview

This specification details the addition of interface timeout functionality to `gemini-proxy`. The feature allows the proxy to enforce a timeout on upstream Google Gemini API calls (both streaming and non-streaming) to prevent hangs, resource exhaustion, and hanging client connections.

The design supports a global default timeout configured via environment variables, as well as per-request overrides via the `x-timeout-ms` HTTP request header.

## Requirements

1. **Global Default Timeout**:
   - Environment variable `UPSTREAM_TIMEOUT_MS` defines the default timeout in milliseconds.
   - Default value: `180000` (180,000 ms / 3 minutes).
   - Setting `UPSTREAM_TIMEOUT_MS=0` (or `x-timeout-ms: 0`) disables the timeout.

2. **Per-Request Header Override**:
   - Clients can pass the HTTP header `x-timeout-ms` (case-insensitive) to set a custom timeout for that specific request.
   - Example: `x-timeout-ms: 30000` sets a 30-second timeout.
   - If missing, invalid, or negative, falls back to `UPSTREAM_TIMEOUT_MS`.

3. **Streaming & Non-Streaming Behavior**:
   - Applies to total request duration from fetch start until response stream ends or non-stream response returns.
   - Aborts upstream Gemini HTTP fetch call using `AbortController.abort()`.

4. **Error Handling & Status Code**:
   - Status code: `504 Gateway Timeout`.
   - Error payload format:
     ```json
     {
       "type": "error",
       "error": {
         "type": "timeout_error",
         "message": "Upstream request to Gemini API timed out after 180000ms"
       }
     }
     ```
   - For streaming requests where response headers (200 OK text/event-stream) have already been sent to the client, an SSE error event is emitted before closing:
     ```text
     event: error
     data: {"type":"error","error":{"type":"timeout_error","message":"Upstream stream timed out after 180000ms"}}
     ```

## Architecture & Components

### 1. Configuration (`config/default.ts` & `.env.example`)

Add `upstreamTimeoutMs` to config object:

```typescript
export const config = {
  // ... existing configs
  upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS || '180000', 10)
};
```

Update `.env.example`:
```env
# Upstream API request timeout in milliseconds (default: 180000ms / 3 minutes, 0 to disable)
UPSTREAM_TIMEOUT_MS=180000
```

### 2. Request Helper (`src/utils/requestHelper.ts`)

Add helper function `extractTimeoutMs`:

```typescript
export function extractTimeoutMs(req: Request): number {
  const headerValue = req.headers['x-timeout-ms'];
  if (headerValue !== undefined && headerValue !== null) {
    const parsed = parseInt(String(headerValue), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return config.upstreamTimeoutMs;
}
```

### 3. Lifecycle Manager Enhancement (`src/utils/streamLifecycleManager.ts`)

Extend `StreamLifecycleManager` to handle both client socket close events and request timeouts.

```typescript
export interface StreamLifecycleOptions {
  req: Request;
  res: Response;
  transactionId: string;
  timeoutMs?: number;
}

export type AbortReason = 'client_disconnect' | 'timeout' | null;

export class StreamLifecycleManager {
  private controller: AbortController;
  private req: Request;
  private res: Response;
  private transactionId: string;
  private finished: boolean = false;
  private aborted: boolean = false;
  private abortReason: AbortReason = null;
  private timer: NodeJS.Timeout | null = null;
  private upstreamStream: Readable | null = null;

  constructor(options: StreamLifecycleOptions) {
    this.controller = new AbortController();
    this.req = options.req;
    this.res = options.res;
    this.transactionId = options.transactionId;

    this.res.on('close', this.handleClose);

    if (options.timeoutMs && options.timeoutMs > 0) {
      this.timer = setTimeout(() => {
        this.handleTimeout(options.timeoutMs!);
      }, options.timeoutMs);
    }
  }

  private handleClose = () => {
    if (this.finished) return;
    this.aborted = true;
    this.abortReason = 'client_disconnect';
    this.clearTimer();
    logger.info(`[Client Disconnect] [Transaction: ${this.transactionId}] Client socket closed before stream completed. Aborting upstream request.`);
    this.controller.abort();
    if (this.upstreamStream && typeof (this.upstreamStream as any).destroy === 'function') {
      (this.upstreamStream as any).destroy();
    }
  };

  private handleTimeout = (timeoutMs: number) => {
    if (this.finished) return;
    this.aborted = true;
    this.abortReason = 'timeout';
    logger.warn(`[Timeout] [Transaction: ${this.transactionId}] Request timed out after ${timeoutMs}ms. Aborting upstream request.`);
    this.controller.abort();
    if (this.upstreamStream && typeof (this.upstreamStream as any).destroy === 'function') {
      (this.upstreamStream as any).destroy();
    }
  };

  public get reason(): AbortReason {
    return this.abortReason;
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public get isAborted(): boolean {
    return this.aborted;
  }

  public attachStream(stream: any): void {
    this.upstreamStream = stream;
  }

  public markFinished(): void {
    this.finished = true;
    this.cleanup();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public cleanup(): void {
    this.clearTimer();
    this.res.off('close', this.handleClose);
  }
}
```

### 4. Controller Integration (`src/controllers/claudeController.ts`)

Extract request timeout in `handleMessages`:
```typescript
const timeoutMs = extractTimeoutMs(req);
const lifecycleManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
```

Pass `signal: lifecycleManager.signal` to both streaming and non-streaming `fetch()` calls.

Handle abort exceptions in catch blocks:
```typescript
if (err.name === 'AbortError' || lifecycleManager.isAborted) {
  if (lifecycleManager.reason === 'timeout') {
    const errPayload = {
      type: 'error',
      error: {
        type: 'timeout_error',
        message: `Upstream request to Gemini API timed out after ${timeoutMs}ms`
      }
    };
    if (!res.headersSent) {
      return res.status(504).json(errPayload);
    } else if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
      res.end();
      return;
    }
  }
  // handle client disconnect as before
}
```

## Testing Strategy

1. **Unit Tests**:
   - `extractTimeoutMs`: Verify parsing of `x-timeout-ms` header (valid integers, invalid strings, negative numbers, missing header fallback).
   - `StreamLifecycleManager`: Verify `setTimeout` trigger sets `reason = 'timeout'`, calls `controller.abort()`, and `markFinished()` clears timer.

2. **Integration Tests**:
   - `claudeController.test.ts`:
     - Test request timing out returns `504` with `timeout_error` type.
     - Test per-request `x-timeout-ms` header overrides `UPSTREAM_TIMEOUT_MS`.
     - Test streaming timeout after headers sent emits SSE error event.

## Security & Reliability Considerations

- Prevents resource leaks and connection exhaustion on hanging Gemini upstream requests.
- Correctly clears timers upon response completion to prevent memory leaks from active timers.
- Correctly distinguishes client disconnects from upstream timeouts in transaction logs and metrics.

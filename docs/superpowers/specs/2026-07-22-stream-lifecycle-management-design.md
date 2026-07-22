# Design Document: Stream Lifecycle & Client Disconnect Management

## Summary
Fix Issue #3: Missing Client Disconnect & Stream Lifecycle Management in `gemini-proxy`.

When a client cancels or drops an HTTP connection mid-stream during `/v1/messages` streaming requests, the proxy currently leaves the upstream Gemini fetch connection running and accumulating memory/quota. This design introduces a `StreamLifecycleManager` helper that uses Express request/response close hooks and `AbortController` to cancel upstream fetch requests immediately on client disconnect and clean up all event listeners.

## Component Architecture

### Component: `src/utils/streamLifecycleManager.ts`
The `StreamLifecycleManager` class encapsulates client disconnect detection and upstream abort management.

```typescript
import { Request, Response } from 'express';
import { Readable } from 'stream';
import logger from './logger';

export interface StreamLifecycleOptions {
  req: Request;
  res: Response;
  transactionId: string;
  onClientDisconnect?: () => void;
}

export class StreamLifecycleManager {
  private controller: AbortController;
  private req: Request;
  private res: Response;
  private transactionId: string;
  private finished: boolean = false;
  private aborted: boolean = false;
  private upstreamStream: Readable | null = null;

  private handleClose = () => {
    if (this.finished) return;
    this.aborted = true;
    logger.info(`[Client Disconnect] [Transaction: ${this.transactionId}] Client socket closed before stream completed. Aborting upstream request.`);
    this.controller.abort();
    if (this.upstreamStream && typeof (this.upstreamStream as any).destroy === 'function') {
      (this.upstreamStream as any).destroy();
    }
  };

  constructor(options: StreamLifecycleOptions) {
    this.controller = new AbortController();
    this.req = options.req;
    this.res = options.res;
    this.transactionId = options.transactionId;

    this.req.on('close', this.handleClose);
    this.res.on('close', this.handleClose);
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

  public cleanup(): void {
    this.req.off('close', this.handleClose);
    this.res.off('close', this.handleClose);
  }
}
```

### Integration in `src/controllers/claudeController.ts`

1. For streaming requests, instantiate `StreamLifecycleManager` before calling `fetch`:
   ```typescript
   const streamManager = new StreamLifecycleManager({ req, res, transactionId });
   
   const response = await fetch(targetUrl, {
     method: 'POST',
     headers: buildUpstreamHeaders(apiKey),
     body: JSON.stringify(gemReq),
     signal: streamManager.signal
   });
   ```

2. Attach `response.body` stream:
   ```typescript
   streamManager.attachStream(response.body);
   ```

3. Call `streamManager.markFinished()` on `end` or `error` events.

4. In the catch block:
   - Check if `err.name === 'AbortError'` or `streamManager.isAborted`.
   - Log as `[Client Disconnect]` instead of logging a 500 internal server error, and refrain from attempting to write to a closed socket.

## Testing Plan
1. **Unit Tests (`tests/streamLifecycleManager.test.ts`)**:
   - Verify `AbortSignal` is aborted when `req` emits `'close'`.
   - Verify `cleanup()` removes listener on `'close'`.
2. **Integration Tests (`tests/claudeControllerStreamLifecycle.test.ts`)**:
   - Test streaming request cancellation.

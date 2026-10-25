# Timeout Strategy & Stream Keep-Alive Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `StreamLifecycleManager` from a fixed wall-clock timeout to an idle-resetting timeout that refreshes on every incoming stream `data` chunk, add `StreamLifecycleManager` timeout and client-disconnect handling to `handleCountTokens`, `handleListModels`, and `handleRetrieveModel` in `ClaudeController`, and enable SSE heartbeat keep-alive plus full timeout/disconnect handling in `GeminiController`.

**Architecture:** `StreamLifecycleManager` stores `timeoutMs` and exposes `resetTimeout()`, which resets the inactivity timer without disturbing the periodic `heartbeatTimer`, and automatically binds `stream.on('data', () => this.resetTimeout())` inside `attachStream()`. All upstream `fetch` calls across `ClaudeController` and `GeminiController` attach `signal: streamManager.signal`, call `streamManager.markFinished()` on completion, record circuit breaker failures (`upstreamManager.recordRequestResult(serverIndex, false, 'Timeout')`) and return HTTP 504 on timeout, and exit cleanly without penalizing the upstream circuit breaker on `client_disconnect`.

**Tech Stack:** TypeScript, Express, node-fetch, Node.js Streams & AbortController, Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-25-timeout-strategy-optimization-design.md`

## Global Constraints

- Zero static config caching: always read `extractTimeoutMs(req)` dynamically per request.
- Calling `resetTimeout()` on `StreamLifecycleManager` must only reset `this.timer` (the timeout timer) and must NOT clear or reset `this.heartbeatTimer`.
- Client disconnects (`streamManager.reason === 'client_disconnect'`) must NOT call `upstreamManager.recordRequestResult(serverIndex, false, ...)`.
- Upstream timeouts (`streamManager.reason === 'timeout'`) must call `upstreamManager.recordRequestResult(serverIndex, false, 'Timeout')`, log the transaction via `payloadLogger.saveTransaction` with status `504`, and return HTTP 504 (or write an SSE error frame if `res.headersSent` is already `true`).

## Review Focus

- In `StreamLifecycleManager.attachStream(stream)`, `stream` in unit/integration tests may be a Node `Readable`, a custom `EventEmitter`, or `null`/`undefined`; guard `if (stream && typeof stream.on === 'function')` before registering the `'data'` listener, and remove or ignore listeners once `markFinished()` is called.
- In `GeminiController` streaming mode (`isStream === true`), enabling `enableSseHeartbeat: true` causes `StreamLifecycleManager` to flush SSE headers (`res.headersSent = true`) immediately upon construction; therefore, when `response` arrives, `GeminiController` must check `if (!res.headersSent)` before calling `res.status(...)` or `res.setHeader(...)`, and when `!isOk` (e.g. upstream 4xx/5xx) and `res.headersSent` is `true`, it must write `data: ${JSON.stringify(errJson)}\n\n` and call `res.end()` instead of `res.status(...).json(...)`.
- In `ClaudeController` (`handleCountTokens`, `handleListModels`, `handleRetrieveModel`), `streamManager.markFinished()` must be called both on the happy path (after reading the response body) and in every early-return error branch so the timeout timer and `res.on('close')` listener never leak after the request finishes.

---

### Task 1: Idle Timeout Reset in `StreamLifecycleManager`

**Files:**
- Modify: `src/utils/streamLifecycleManager.ts:18-148`
- Test: `tests/streamLifecycleManager.test.ts`

**Interfaces:**
- Produces in `src/utils/streamLifecycleManager.ts`:
  ```ts
  public resetTimeout(): void
  public attachStream(stream: any): void // resets timeout immediately and on each 'data' event
  ```

- [ ] **Step 1: Write the failing unit tests in `tests/streamLifecycleManager.test.ts`**

Append the following tests inside `describe('StreamLifecycleManager', ...)` in `tests/streamLifecycleManager.test.ts`:

```ts
  it('should reset the timeout timer whenever attached stream emits data and only timeout after full idle period', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_idle_reset',
      timeoutMs: 5000
    });

    const mockUpstreamStream = new EventEmitter();

    // Advance 3s before response headers arrive
    jest.advanceTimersByTime(3000);
    expect(manager.isAborted).toBe(false);

    // Attach stream at t=3s -> resets 5s timer
    manager.attachStream(mockUpstreamStream);

    // Emit data chunks every 3s (t=6s, t=9s, t=12s) — total elapsed 12s > 5s initial timeoutMs
    jest.advanceTimersByTime(3000);
    mockUpstreamStream.emit('data', Buffer.from('chunk 1'));
    expect(manager.isAborted).toBe(false);

    jest.advanceTimersByTime(3000);
    mockUpstreamStream.emit('data', Buffer.from('chunk 2'));
    expect(manager.isAborted).toBe(false);

    jest.advanceTimersByTime(3000);
    mockUpstreamStream.emit('data', Buffer.from('chunk 3'));
    expect(manager.isAborted).toBe(false);

    // Now go idle for 4.9s -> still not aborted
    jest.advanceTimersByTime(4900);
    expect(manager.isAborted).toBe(false);

    // Advance remaining 0.1s (total 5s idle since last data) -> aborts with timeout
    jest.advanceTimersByTime(100);
    expect(manager.isAborted).toBe(true);
    expect(manager.signal.aborted).toBe(true);
    expect(manager.reason).toBe('timeout');
  });

  it('should not disturb periodic SSE heartbeats when resetTimeout is triggered by stream data', () => {
    const writeSpy = jest.fn();
    mockRes.setHeader = jest.fn();
    mockRes.flushHeaders = jest.fn();
    mockRes.write = writeSpy;
    (mockRes as any).headersSent = false;
    (mockRes as any).writableEnded = false;

    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_heartbeat_idle',
      timeoutMs: 20000,
      enableSseHeartbeat: true,
      heartbeatIntervalMs: 15000
    });

    const mockUpstreamStream = new EventEmitter();
    manager.attachStream(mockUpstreamStream);
    expect(writeSpy).toHaveBeenCalledTimes(1); // initial : ping

    jest.advanceTimersByTime(10000);
    mockUpstreamStream.emit('data', Buffer.from('chunk'));
    expect(writeSpy).toHaveBeenCalledTimes(1);

    // At t=15s, periodic heartbeat still fires on schedule despite resetTimeout at t=10s
    jest.advanceTimersByTime(5000);
    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy).toHaveBeenLastCalledWith(': ping\n\n');

    manager.markFinished();
  });
```

- [ ] **Step 2: Run `npx jest tests/streamLifecycleManager.test.ts` to verify the new test fails**

Run: `npx jest tests/streamLifecycleManager.test.ts`
Expected: FAIL (`expect(manager.isAborted).toBe(false)` fails at t=6s because timer fired at t=5s)

- [ ] **Step 3: Implement `resetTimeout()` and stream `'data'` listener in `src/utils/streamLifecycleManager.ts`**

In `src/utils/streamLifecycleManager.ts`:
- Add `private timeoutMs: number = 0;` and `private handleStreamData = () => { this.resetTimeout(); };`.
- In `constructor(options: StreamLifecycleOptions)`:
  - Set `this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 0;`.
  - Call `this.resetTimeout();` instead of inline `setTimeout`.
- Implement `public resetTimeout(): void`:
  ```ts
  public resetTimeout(): void {
    if (this.finished || this.aborted || this.timeoutMs <= 0) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      this.handleTimeout(this.timeoutMs);
    }, this.timeoutMs);
  }
  ```
- In `public attachStream(stream: any): void`:
  ```ts
  public attachStream(stream: any): void {
    if (this.upstreamStream && typeof (this.upstreamStream as any).off === 'function') {
      (this.upstreamStream as any).off('data', this.handleStreamData);
    }
    this.upstreamStream = stream;
    this.resetTimeout();
    if (stream && typeof stream.on === 'function') {
      stream.on('data', this.handleStreamData);
    }
  }
  ```
- In `public cleanup(): void`:
  - Also detach `this.handleStreamData` from `this.upstreamStream` if `typeof (this.upstreamStream as any)?.off === 'function'`.

- [ ] **Step 4: Run `npx jest tests/streamLifecycleManager.test.ts` to verify it passes**

Run: `npx jest tests/streamLifecycleManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/streamLifecycleManager.ts tests/streamLifecycleManager.test.ts
git commit -m "feat(stream): reset inactivity timeout on stream data chunks in StreamLifecycleManager

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Add Timeout & Disconnect Control to `count_tokens` and `models` in `ClaudeController`

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts:791-1364`
- Test: `tests/claudeCountTokens.test.ts`
- Test: `tests/claudeModels.test.ts`

**Interfaces:**
- Consumes `StreamLifecycleManager` from `src/utils/streamLifecycleManager.ts` and `extractTimeoutMs` from `src/utils/requestHelper.ts`.
- Returns HTTP `504` with `{ type: 'error', error: { type: 'timeout_error', message: 'Upstream request timed out after <timeoutMs>ms' } }` when `handleCountTokens`, `handleListModels`, or `handleRetrieveModel` times out in either Direct or Proxy mode.

- [ ] **Step 1: Add timeout tests to `tests/claudeCountTokens.test.ts` and `tests/claudeModels.test.ts`**

1. In `tests/claudeCountTokens.test.ts`, add:
   ```ts
   it('aborts upstream fetch and returns 504 timeout_error when count_tokens exceeds x-timeout-ms', async () => {
     (fetch as unknown as jest.Mock).mockImplementation((_url: string, opts: any) => {
       return new Promise((_resolve, reject) => {
         if (opts?.signal) {
           opts.signal.addEventListener('abort', () => {
             const err: any = new Error('The user aborted a request.');
             err.name = 'AbortError';
             reject(err);
           });
         }
       });
     });

     const res = await request(app)
       .post('/v1/messages/count_tokens')
       .set('Authorization', 'Bearer dummy-key')
       .set('x-timeout-ms', '30')
       .send({
         model: 'gemini-3.5-flash',
         messages: [{ role: 'user', content: 'Slow count tokens' }]
       });

     expect(res.statusCode).toBe(504);
     expect(res.body.type).toBe('error');
     expect(res.body.error.type).toBe('timeout_error');
     expect(res.body.error.message).toContain('timed out after 30ms');
   });
   ```
2. In `tests/claudeModels.test.ts`, add:
   ```ts
   it('aborts upstream fetch and returns 504 timeout_error when GET /v1/models or GET /v1/models/:model_id exceeds x-timeout-ms', async () => {
     (fetch as unknown as jest.Mock).mockImplementation((_url: string, opts: any) => {
       return new Promise((_resolve, reject) => {
         if (opts?.signal) {
           opts.signal.addEventListener('abort', () => {
             const err: any = new Error('The user aborted a request.');
             err.name = 'AbortError';
             reject(err);
           });
         }
       });
     });

     const listRes = await request(app)
       .get('/v1/models')
       .set('x-api-key', 'client-test-key')
       .set('x-timeout-ms', '30');

     expect(listRes.statusCode).toBe(504);
     expect(listRes.body.error.type).toBe('timeout_error');

     const detailRes = await request(app)
       .get('/v1/models/gemini-2.5-flash')
       .set('x-api-key', 'client-test-key')
       .set('x-timeout-ms', '30');

     expect(detailRes.statusCode).toBe(504);
     expect(detailRes.body.error.type).toBe('timeout_error');
   });
   ```

- [ ] **Step 2: Run `npx jest tests/claudeCountTokens.test.ts tests/claudeModels.test.ts` to verify the new tests fail**

Run: `npx jest tests/claudeCountTokens.test.ts tests/claudeModels.test.ts`
Expected: FAIL (requests hang because `signal` is not passed to `fetch` in `handleCountTokens`, `handleListModels`, `handleRetrieveModel`)

- [ ] **Step 3: Wire `StreamLifecycleManager` and timeout handling into `handleCountTokens`, `handleListModels`, and `handleRetrieveModel` in `src/proxy/controllers/claudeController.ts`**

In `src/proxy/controllers/claudeController.ts`:
- In `handleCountTokens`, `handleListModels`, and `handleRetrieveModel`:
  - Extract `const timeoutMs = extractTimeoutMs(req);` and instantiate `const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });` right before the upstream `fetch` (for both `serverType === 'direct'` and `proxy` branches).
  - Pass `signal: streamManager.signal` into `fetch(...)`.
  - Call `streamManager.markFinished()` as soon as `fetch` and `response.text()` / `response.json()` finish, and inside `catch (fetchErr: any)`:
    ```ts
    streamManager.markFinished();
    if (fetchErr.name === 'AbortError' || streamManager.isAborted) {
      const duration = Date.now() - startTime;
      if (streamManager.reason === 'timeout') {
        upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
        const errPayload = {
          type: 'error',
          error: {
            type: 'timeout_error',
            message: `Upstream request timed out after ${timeoutMs}ms`
          }
        };
        logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
        if (!res.headersSent) {
          return res.status(504).json(errPayload);
        }
        return;
      }
      logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
      return;
    }
    upstreamManager.recordRequestResult(serverIndex, false, fetchErr.message || 'Fetch error');
    throw fetchErr;
    ```

- [ ] **Step 4: Run `npx jest tests/claudeCountTokens.test.ts tests/claudeModels.test.ts` to verify they pass**

Run: `npx jest tests/claudeCountTokens.test.ts tests/claudeModels.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/controllers/claudeController.ts tests/claudeCountTokens.test.ts tests/claudeModels.test.ts
git commit -m "feat(claude): add timeout and client disconnect handling to count_tokens and models endpoints

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Enable SSE Heartbeat Keep-Alive & Non-Stream Timeout in `GeminiController`

**Files:**
- Modify: `src/proxy/controllers/geminiController.ts:126-283`
- Test: `tests/geminiController.test.ts`

**Interfaces:**
- Modifies `GeminiController.handleProxy(req: Request, res: Response)` in `src/proxy/controllers/geminiController.ts`.
- Streaming requests (`isStream === true`) pass `enableSseHeartbeat: true` to `StreamLifecycleManager`.
- Non-streaming requests (`isStream === false`) create `new StreamLifecycleManager({ req, res, transactionId, timeoutMs })`, pass `signal: streamManager.signal` to `fetch`, and return HTTP `504` with `{ error: { code: 504, message: 'Upstream request timed out after <timeoutMs>ms', status: 'DEADLINE_EXCEEDED' } }` on timeout.

- [ ] **Step 1: Add streaming heartbeat and non-streaming timeout tests to `tests/geminiController.test.ts`**

Append the following tests to `tests/geminiController.test.ts`:

```ts
  it('enables SSE heartbeat (: ping) on streaming requests and resets idle timeout on data chunks', async () => {
    const fetchMock = require('node-fetch');
    const { Readable } = require('stream');
    const stream = new Readable({
      read() {
        this.push('data: {"candidates":[{"content":{"parts":[{"text":"Heartbeat stream chunk"}]}}]}\n\n');
        this.push(null);
      }
    });

    fetchMock.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => h.toLowerCase() === 'content-type' ? 'text/event-stream' : null,
        raw: () => ({ 'content-type': ['text/event-stream'] })
      },
      body: stream
    }));

    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse')
      .set('x-goog-api-key', 'test-gemini-key')
      .send({ contents: [{ parts: [{ text: 'Hello Stream Heartbeat' }] }] });

    expect(res.status).toBe(200);
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.text).toMatch(/^: ping\n\n/);
    expect(res.text).toContain('Heartbeat stream chunk');
  });

  it('aborts non-streaming request and returns 504 DEADLINE_EXCEEDED when upstream exceeds x-timeout-ms', async () => {
    const fetchMock = require('node-fetch');
    fetchMock.mockImplementationOnce((_url: string, opts: any) => {
      return new Promise((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            const err: any = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:generateContent')
      .set('x-goog-api-key', 'test-gemini-key')
      .set('x-timeout-ms', '30')
      .send({ contents: [{ parts: [{ text: 'Slow non-stream request' }] }] });

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe(504);
    expect(res.body.error.status).toBe('DEADLINE_EXCEEDED');
    expect(res.body.error.message).toContain('timed out after 30ms');
  });
```

- [ ] **Step 2: Run `npx jest tests/geminiController.test.ts` to verify the new tests fail**

Run: `npx jest tests/geminiController.test.ts`
Expected: FAIL (`x-accel-buffering` / `: ping` missing on stream, and non-stream request hangs without `signal`)

- [ ] **Step 3: Implement streaming SSE heartbeat and non-streaming `StreamLifecycleManager` in `src/proxy/controllers/geminiController.ts`**

In `src/proxy/controllers/geminiController.ts`:
1. In `if (isStream)` (around line 127):
   - Before `new StreamLifecycleManager(...)`, set `res.setHeader('x-transaction-id', transactionId);` so the header is included when `StreamLifecycleManager` flushes SSE headers.
   - Instantiate `const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs, enableSseHeartbeat: true });`.
   - When `!isOk`:
     - If `!res.headersSent`, `return res.status(response.status).json(errJson);`.
     - Else if `!res.writableEnded`, write `res.write(\`data: \${JSON.stringify(errJson)}\\n\\n\`); res.end(); return;`.
   - When `isOk`:
     - Guard header setting with `if (!res.headersSent)` before calling `res.status(response.status)` and `res.setHeader(...)`, and call `streamManager.ensureSseHeaders()`.
     - Call `streamManager.setUpstreamStream(response.body)`.
   - In `response.body.on('error')` and `catch (err)`:
     - If `streamManager.reason === 'timeout'`:
       - Call `upstreamManager.recordRequestResult(serverIndex, false, 'Timeout')` and `accountUsageService.record(accountName, targetModelName || 'unknown', false)`.
       - Build `const errJson = { error: { code: 504, message: \`Upstream request timed out after \${timeoutMs}ms\`, status: 'DEADLINE_EXCEEDED' } };`.
       - Log via `payloadLogger.saveTransaction(transactionId, clientReq, clientReq, { error: 'Timeout' }, errJson, duration, requestPath, 504, true, ...(accountName ? [accountName] : []))`.
       - If `!res.headersSent` return `res.status(504).json(errJson)`; else if `!res.writableEnded` write `data: ${JSON.stringify(errJson)}\n\n` and `res.end()`.
     - If `streamManager.reason === 'client_disconnect'`: return without recording upstream failure.
2. In the non-streaming block (around line 230):
   - Create `const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });`.
   - Pass `signal: streamManager.signal` to `fetch(targetUrl, { ..., signal: streamManager.signal, agent })`.
   - After `await response.text()` completes, call `streamManager.markFinished()`.
   - In `catch (err: any)`:
     - Call `streamManager.markFinished()`.
     - If `err.name === 'AbortError' || streamManager.isAborted`:
       - If `streamManager.reason === 'timeout'`:
         - Call `upstreamManager.recordRequestResult(serverIndex, false, 'Timeout')`.
         - Build `const errJson = { error: { code: 504, message: \`Upstream request timed out after \${timeoutMs}ms\`, status: 'DEADLINE_EXCEEDED' } };`.
         - Log via `payloadLogger.saveTransaction(transactionId, clientReq, clientReq, { error: 'Timeout' }, errJson, duration, requestPath, 504, false)`.
         - Return `res.status(504).json(errJson)`.
       - If `streamManager.reason === 'client_disconnect'`: log and return without recording upstream failure.

- [ ] **Step 4: Run full test suite and build**

Run: `npx jest --runInBand && npm run build`
Expected: All 120 test suites PASS and `npm run build` succeeds with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/proxy/controllers/geminiController.ts tests/geminiController.test.ts docs/superpowers/plans/2026-10-25-timeout-strategy-optimization.md
git commit -m "feat(gemini): enable stream SSE heartbeat keep-alive and non-stream timeout handling

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

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

- [x] **Step 1: Write the failing unit tests in `tests/streamLifecycleManager.test.ts`**
- [x] **Step 2: Run `npx jest tests/streamLifecycleManager.test.ts` to verify the new test fails**
- [x] **Step 3: Implement `resetTimeout()` and stream `'data'` listener in `src/utils/streamLifecycleManager.ts`**
- [x] **Step 4: Run `npx jest tests/streamLifecycleManager.test.ts` to verify it passes**
- [x] **Step 5: Commit**

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

- [x] **Step 1: Add timeout tests to `tests/claudeCountTokens.test.ts` and `tests/claudeModels.test.ts`**
- [x] **Step 2: Run `npx jest tests/claudeCountTokens.test.ts tests/claudeModels.test.ts` to verify the new tests fail**
- [x] **Step 3: Wire `StreamLifecycleManager` and timeout handling into `handleCountTokens`, `handleListModels`, and `handleRetrieveModel` in `src/proxy/controllers/claudeController.ts`**
- [x] **Step 4: Run `npx jest tests/claudeCountTokens.test.ts tests/claudeModels.test.ts` to verify they pass**
- [x] **Step 5: Commit**

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

- [x] **Step 1: Add streaming heartbeat and non-streaming timeout tests to `tests/geminiController.test.ts`**
- [x] **Step 2: Run `npx jest tests/geminiController.test.ts` to verify the new tests fail**
- [x] **Step 3: Implement streaming SSE heartbeat and non-streaming `StreamLifecycleManager` in `src/proxy/controllers/geminiController.ts`**
- [x] **Step 4: Run full test suite and build**
- [x] **Step 5: Commit**

```bash
git add src/proxy/controllers/geminiController.ts tests/geminiController.test.ts docs/superpowers/plans/2026-10-25-timeout-strategy-optimization.md
git commit -m "feat(gemini): enable stream SSE heartbeat keep-alive and non-stream timeout handling

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

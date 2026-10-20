# Universal `-high` Thinking Suffix Across All Upstreams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply `-high` model suffix stripping and `generationConfig.thinkingConfig = { thinkingLevel: 'HIGH' }` injection universally to all upstream servers (both `direct` and `proxy` modes) across Claude and native Gemini proxy pipelines while preserving `-high` model identifiers in local audit logs and metrics.

**Architecture:** Remove the `serverType === 'direct'` restriction around `parseModelThinkingSuffix` and `applyThinkingConfigHigh` in `src/proxy/controllers/claudeController.ts` (covering streaming/non-streaming `/v1/messages`, `/v1/messages/count_tokens`, and `/v1/models/:model_id`) and `src/proxy/controllers/geminiController.ts` (covering `/v1beta/*` and `/v1/models/*`). Keep `cleanModelName` and `targetModelName` variables retaining the `-high` suffix so `accountUsageService`, `payloadLogger`, and `metricsService` continue tracking High spec requests accurately.

**Tech Stack:** TypeScript, Express, Jest, Supertest

## Global Constraints

- Maintain strict TypeScript patterns (`npm run build:backend` must compile cleanly).
- Do not strip `-high` from `cleanModelName` or `targetModelName` passed to `accountUsageService.record` or `payloadLogger.saveTransaction`.
- Do not inject `generationConfig.thinkingConfig` into non-generation endpoints such as `:countTokens` or `GET /v1/models/:model_id`.
- Strip `includeThoughts` when injecting `thinkingLevel: 'HIGH'` via `applyThinkingConfigHigh`.

---

### Task 1: Universal `-high` Suffix Handling in `claudeController`

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts:89-98`, `src/proxy/controllers/claudeController.ts:310-319`, `src/proxy/controllers/claudeController.ts:485-492`, `src/proxy/controllers/claudeController.ts:699-705`
- Test: `tests/claudeControllerThinkingDirect.test.ts`

**Interfaces:**
- Consumes: `parseModelThinkingSuffix(model?: string): ModelThinkingInfo`, `applyThinkingConfigHigh(generationConfig: any): any` from `src/utils/modelThinkingHelper.ts`
- Produces: Universal `-high` stripping and `thinkingLevel: 'HIGH'` injection in `ClaudeController.handleMessages`, `ClaudeController.handleCountTokens`, and `ClaudeController.handleRetrieveModel` across both `direct` and `proxy` upstream servers.

- [x] **Step 1: Update and add failing tests in `tests/claudeControllerThinkingDirect.test.ts`**

Update the `proxy` mode test and add `/v1/messages/count_tokens` (proxy mode) and `/v1/models/:model_id` tests in `tests/claudeControllerThinkingDirect.test.ts`:

```typescript
import request from 'supertest';
import express from 'express';
import fetch from 'node-fetch';
import claudeController from '../src/proxy/controllers/claudeController';
import { upstreamManager } from '../src/utils/upstreamManager';

jest.mock('node-fetch');
jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('claudeController Universal Thinking Suffix (-high)', () => {
  let app: express.Express;
  let capturedUpstreamUrl = '';
  let capturedBody: any = null;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post('/v1/messages', (req, res) => claudeController.handleMessages(req, res));
    app.post('/v1/messages/count_tokens', (req, res) => claudeController.handleCountTokens(req, res));
    app.get('/v1/models/:model_id', (req, res) => claudeController.handleRetrieveModel(req, res));

    capturedUpstreamUrl = '';
    capturedBody = null;
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string, options: any) => {
      capturedUpstreamUrl = url;
      capturedBody = options?.body ? JSON.parse(options.body) : null;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' } }],
          usageMetadata: { candidatesTokenCount: 5, promptTokenCount: 10 }
        }),
        text: async () => JSON.stringify({ totalTokens: 15 })
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips -high and injects thinkingLevel: HIGH in direct mode for non-stream /v1/messages', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });

  it('strips -high and injects thinkingLevel: HIGH in proxy mode for /v1/messages', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });

  it('strips -high for /v1/messages/count_tokens in both direct and proxy modes', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:countTokens',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        messages: [{ role: 'user', content: 'Count this' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash:countTokens');
    expect(capturedBody.generateContentRequest?.model).toBe('models/gemini-2.5-flash');
  });

  it('strips -high when retrieving model metadata via GET /v1/models/:model_id in proxy mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .get('/v1/models/gemini-2.5-flash-high')
      .set('x-api-key', 'client-key');

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash');
  });

  it('strips includeThoughts and injects thinkingLevel: HIGH when thinking is enabled', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }],
        thinking: { type: 'enabled', budget_tokens: 1024 }
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeControllerThinkingDirect.test.ts`
Expected: FAIL on `strips -high and injects thinkingLevel: HIGH in proxy mode for /v1/messages`, `strips -high for /v1/messages/count_tokens in both direct and proxy modes`, and `strips -high when retrieving model metadata via GET /v1/models/:model_id in proxy mode`.

- [x] **Step 3: Update `src/proxy/controllers/claudeController.ts` to apply `-high` handling across all upstreams**

In `src/proxy/controllers/claudeController.ts`:
1. In `handleMessages` (streaming branch around line 89):
```typescript
        // Strip -high and inject thinkingConfig for all upstream servers
        const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
        if (thinkingInfo.isHigh) {
          targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
          gemReq.generationConfig = gemReq.generationConfig || {};
          applyThinkingConfigHigh(gemReq.generationConfig);
        }
```
2. In `handleMessages` (non-streaming branch around line 310):
```typescript
      // Strip -high and inject thinkingConfig for all upstream servers
      const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
        gemReq.generationConfig = gemReq.generationConfig || {};
        applyThinkingConfigHigh(gemReq.generationConfig);
      }
```
3. In `handleCountTokens` (around line 485):
```typescript
      const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
        countTokensPayload.generateContentRequest.model = `models/${thinkingInfo.baseModel}`;
      }
```
4. In `handleRetrieveModel` (around line 699):
```typescript
      const targetPath = `/v1beta/models/${resolvedModelId}`;
      const serverSelection = upstreamManager.getUpstreamUrl(targetPath, { model: resolvedModelId, originalModel: cleanModelId, resolvedModel: resolvedModelId });
      let { targetUrl, serverUrl, serverIndex, serverType, selectedApiKey } = serverSelection;
      const thinkingInfo = parseModelThinkingSuffix(resolvedModelId);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${resolvedModelId}`, `models/${thinkingInfo.baseModel}`);
      }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/claudeControllerThinkingDirect.test.ts`
Expected: PASS (all 5 tests pass)

- [x] **Step 5: Commit**

```bash
git add src/proxy/controllers/claudeController.ts tests/claudeControllerThinkingDirect.test.ts
git commit -m "feat(claude): apply -high suffix stripping and thinkingLevel HIGH across all upstream modes"
```

---

### Task 2: Universal `-high` Suffix Handling in `geminiController`

**Files:**
- Modify: `src/proxy/controllers/geminiController.ts:102-125`
- Test: `tests/geminiControllerThinkingDirect.test.ts`

**Interfaces:**
- Consumes: `parseModelThinkingSuffix(model?: string): ModelThinkingInfo`, `applyThinkingConfigHigh(generationConfig: any): any` from `src/utils/modelThinkingHelper.ts`
- Produces: Universal `-high` stripping and `thinkingLevel: 'HIGH'` injection in `GeminiController.handleProxy` across both `direct` and `proxy` upstream servers.

- [x] **Step 1: Update failing test in `tests/geminiControllerThinkingDirect.test.ts`**

Update the proxy mode test in `tests/geminiControllerThinkingDirect.test.ts` so it asserts `-high` is stripped and `thinkingLevel: 'HIGH'` is injected in `proxy` mode as well:

```typescript
  it('strips -high from path and injects thinkingLevel: HIGH in proxy mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash-high:generateContent')
      .set('x-goog-api-key', 'client-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody?.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody?.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/geminiControllerThinkingDirect.test.ts`
Expected: FAIL on `strips -high from path and injects thinkingLevel: HIGH in proxy mode`.

- [x] **Step 3: Update `src/proxy/controllers/geminiController.ts` to apply `-high` handling across all upstreams**

In `src/proxy/controllers/geminiController.ts` around line 102, remove `serverType === 'direct' &&`:

```typescript
    // Strip -high from URL, strip from body models, and inject thinkingConfig for generate endpoints across all upstreams
    if (targetModelName) {
      const thinkingInfo = parseModelThinkingSuffix(targetModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${targetModelName}`, `models/${thinkingInfo.baseModel}`);
        if (clientReq) {
          // Strip -high from request body models if present (e.g. in :countTokens or other endpoints)
          if (typeof clientReq.model === 'string' && clientReq.model.toLowerCase().endsWith('-high')) {
            clientReq.model = parseModelThinkingSuffix(clientReq.model).baseModel;
          }
          if (clientReq.generateContentRequest && typeof clientReq.generateContentRequest.model === 'string' && clientReq.generateContentRequest.model.toLowerCase().endsWith('-high')) {
            clientReq.generateContentRequest.model = parseModelThinkingSuffix(clientReq.generateContentRequest.model).baseModel;
          }

          // Only inject generationConfig for content generation routes
          const isGenerateRoute = cleanPath.includes(':generateContent') || cleanPath.includes(':streamGenerateContent');
          if (isGenerateRoute) {
            clientReq.generationConfig = clientReq.generationConfig || {};
            applyThinkingConfigHigh(clientReq.generationConfig);
          }
        }
      }
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/geminiControllerThinkingDirect.test.ts`
Expected: PASS (all 4 tests pass)

- [x] **Step 5: Run full test suite and backend build**

Run: `npm run build:backend && npx jest --runInBand`
Expected: Clean TypeScript compilation and all test suites pass.

- [x] **Step 6: Commit**

```bash
git add src/proxy/controllers/geminiController.ts tests/geminiControllerThinkingDirect.test.ts
git commit -m "feat(gemini): apply -high suffix stripping and thinkingLevel HIGH across all upstream modes"
```

# Direct Mode Model -high Thinking Suffix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support model `-high` suffix conversion in direct mode by stripping `-high` from Google API endpoint paths and injecting `generationConfig.thinkingConfig: { thinkingLevel: 'HIGH' }` across Claude and native Gemini routes without altering proxy mode behavior.

**Architecture:** 
1. Create a dedicated backend model thinking parser `src/utils/modelThinkingHelper.ts` to deconstruct models into `baseModel`, `isHigh`, and `thinkingLevel: 'HIGH'`.
2. Enhance `upstreamManager.ts` to match both raw/resolved models and their stripped `baseModel` against node `allowedModels`.
3. In `claudeController.ts` and `geminiController.ts`, when `serverType === 'direct'` and `isHigh === true`, strip `-high` from upstream target paths and inject `thinkingLevel: 'HIGH'` into `generationConfig.thinkingConfig` (preserving any existing fields, excluding `includeThoughts`).
4. Preserve client requested model name (with `-high`) in `payloadLogger` transactions to maintain telemetry and dashboard metrics fidelity.

**Tech Stack:** TypeScript, Express, Jest, Supertest

**Spec:** `docs/superpowers/specs/2026-10-01-model-thinking-suffix-direct-design.md`

## Global Constraints

- Never inject `includeThoughts` parameter.
- Only strip `-high` and inject `thinkingLevel: 'HIGH'` when `serverType === 'direct'`.
- Proxy mode (`serverType === 'proxy'`) must remain pure passthrough without stripping `-high` or injecting `thinkingConfig`.
- Upstream requests to Google must always pass API keys in `x-goog-api-key` HTTP header.
- Zero static configuration caching.
- Payload transaction logging must record the client's original/resolved model (with `-high`) for dashboard metrics fidelity.

## Review Focus

1. **Case-insensitive and whitespace tolerance**: Models like `gemini-2.5-flash-HIGH` or with trailing spaces must be correctly recognized as `isHigh: true` and stripped to clean `baseModel`.
2. **Existing `thinkingConfig` non-destructive merge**: If the client request already has `generationConfig.thinkingConfig` with other custom properties, they must be preserved when merging `thinkingLevel: 'HIGH'`.
3. **No `includeThoughts` leakage**: Ensure `includeThoughts` is never injected into `thinkingConfig`.
4. **Proxy mode passthrough preservation**: Ensure requests going through `serverType: 'proxy'` retain the `-high` suffix in the URL and do not have `thinkingLevel: 'HIGH'` injected.
5. **Whitelist matching with stripped base model**: An upstream node with `allowedModels: ['gemini-2.5-flash']` must successfully allow requests for `gemini-2.5-flash-high`.

---

### Task 1: Create `modelThinkingHelper` Utility

**Files:**
- Create: `src/utils/modelThinkingHelper.ts`
- Test: `tests/modelThinkingHelper.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ModelThinkingInfo {
    baseModel: string;
    isHigh: boolean;
    thinkingLevel?: 'HIGH';
  }
  export function parseModelThinkingSuffix(model?: string): ModelThinkingInfo;
  ```

- [ ] **Step 1: Write the failing unit tests for `parseModelThinkingSuffix`**

Create `tests/modelThinkingHelper.test.ts`:
```typescript
import { parseModelThinkingSuffix } from '../src/utils/modelThinkingHelper';

describe('modelThinkingHelper', () => {
  it('parses normal models without high suffix', () => {
    const res = parseModelThinkingSuffix('gemini-2.5-flash');
    expect(res).toEqual({
      baseModel: 'gemini-2.5-flash',
      isHigh: false
    });
  });

  it('parses models with -high suffix (case-insensitive and trimmed)', () => {
    const res1 = parseModelThinkingSuffix('gemini-2.5-flash-high');
    expect(res1).toEqual({
      baseModel: 'gemini-2.5-flash',
      isHigh: true,
      thinkingLevel: 'HIGH'
    });

    const res2 = parseModelThinkingSuffix('gemini-3-pro-HIGH ');
    expect(res2).toEqual({
      baseModel: 'gemini-3-pro',
      isHigh: true,
      thinkingLevel: 'HIGH'
    });
  });

  it('handles empty, undefined, or malformed models gracefully', () => {
    expect(parseModelThinkingSuffix('')).toEqual({ baseModel: '', isHigh: false });
    expect(parseModelThinkingSuffix(undefined)).toEqual({ baseModel: '', isHigh: false });
    expect(parseModelThinkingSuffix('  ')).toEqual({ baseModel: '', isHigh: false });
    expect(parseModelThinkingSuffix('-high')).toEqual({ baseModel: '', isHigh: true, thinkingLevel: 'HIGH' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/modelThinkingHelper.test.ts`
Expected: FAIL (Cannot find module `../src/utils/modelThinkingHelper`)

- [ ] **Step 3: Implement `src/utils/modelThinkingHelper.ts`**

Create `src/utils/modelThinkingHelper.ts`:
```typescript
export interface ModelThinkingInfo {
  baseModel: string;
  isHigh: boolean;
  thinkingLevel?: 'HIGH';
}

/**
 * Parses a model name and detects whether it has a `-high` suffix.
 * Returns the base model name and whether thinking level should be 'HIGH'.
 */
export function parseModelThinkingSuffix(model?: string): ModelThinkingInfo {
  const trimmed = String(model || '').trim();
  if (trimmed.toLowerCase().endsWith('-high')) {
    return {
      baseModel: trimmed.slice(0, -5),
      isHigh: true,
      thinkingLevel: 'HIGH'
    };
  }
  return {
    baseModel: trimmed,
    isHigh: false
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/modelThinkingHelper.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/modelThinkingHelper.ts tests/modelThinkingHelper.test.ts
git commit -m "feat: add modelThinkingHelper utility"
```

---

### Task 2: Enhance Upstream Manager Whitelist Matching for Base Models

**Files:**
- Modify: `src/utils/upstreamManager.ts:215-238`
- Test: `tests/upstreamManagerThinkingModel.test.ts`

**Interfaces:**
- Consumes: `parseModelThinkingSuffix` from `src/utils/modelThinkingHelper.ts`
- Modifies: `serverSupportsModel` and `hasUpstreamForModel` in `UpstreamManager`

- [ ] **Step 1: Write the failing test for `serverSupportsModel` with `-high` models**

Create `tests/upstreamManagerThinkingModel.test.ts`:
```typescript
import { upstreamManager } from '../src/utils/upstreamManager';
import { UpstreamServerConfig } from '../src/types';

describe('UpstreamManager model matching for -high suffix', () => {
  const serverWithBase: UpstreamServerConfig = {
    url: 'https://generativelanguage.googleapis.com',
    weight: 1,
    enabled: true,
    type: 'direct',
    allowedModels: ['gemini-2.5-flash', 'gemini-2.5-pro']
  };

  it('allows model with -high suffix when server configures the base model', () => {
    expect(upstreamManager.serverSupportsModel(serverWithBase, 'gemini-2.5-flash-high')).toBe(true);
    expect(upstreamManager.serverSupportsModel(serverWithBase, undefined, 'gemini-2.5-pro-high')).toBe(true);
  });

  it('rejects unsupported models even with -high suffix', () => {
    expect(upstreamManager.serverSupportsModel(serverWithBase, 'gemini-1.5-flash-high')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamManagerThinkingModel.test.ts`
Expected: FAIL (serverSupportsModel returns false for `gemini-2.5-flash-high`)

- [ ] **Step 3: Update `serverSupportsModel` in `src/utils/upstreamManager.ts`**

Import `parseModelThinkingSuffix` in `src/utils/upstreamManager.ts`:
```typescript
import { parseModelThinkingSuffix } from './modelThinkingHelper';
```

Update `serverSupportsModel`:
```typescript
  public serverSupportsModel(server: UpstreamServerConfig, originalModel?: string, resolvedModel?: string): boolean {
    if (!server.allowedModels || server.allowedModels.length === 0) {
      return true;
    }
    const allowedSet = new Set(server.allowedModels.map(m => m.trim().toLowerCase()).filter(Boolean));
    if (allowedSet.size === 0) return true;

    const normOriginal = originalModel ? originalModel.trim().toLowerCase() : '';
    const normResolved = resolvedModel ? resolvedModel.trim().toLowerCase() : '';

    if (normOriginal && allowedSet.has(normOriginal)) return true;
    if (normResolved && allowedSet.has(normResolved)) return true;

    // Check base models if either model has a -high suffix
    const baseOriginal = parseModelThinkingSuffix(normOriginal).baseModel.toLowerCase();
    if (baseOriginal && allowedSet.has(baseOriginal)) return true;

    const baseResolved = parseModelThinkingSuffix(normResolved).baseModel.toLowerCase();
    if (baseResolved && allowedSet.has(baseResolved)) return true;

    return false;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/upstreamManagerThinkingModel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/upstreamManager.ts tests/upstreamManagerThinkingModel.test.ts
git commit -m "feat(upstream): allow -high suffix models when base model is in allowedModels"
```

---

### Task 3: Support Direct Mode Thinking Suffix in Claude Controller

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts:80-105, 290-315, 440-465`
- Test: `tests/claudeControllerThinkingDirect.test.ts`

**Interfaces:**
- Consumes: `parseModelThinkingSuffix` from `src/utils/modelThinkingHelper.ts`
- Behavior:
  - If `serverSelection.serverType === 'direct'` and `thinkingInfo.isHigh === true`:
    - Strip `-high` from target model in Google URL (`/v1beta/models/${thinkingInfo.baseModel}:...`)
    - Inject `generationConfig.thinkingConfig = { ...(generationConfig.thinkingConfig || {}), thinkingLevel: 'HIGH' }` into `gemReq`
    - In `count_tokens`, strip `-high` from `generateContentRequest.model` and URL path.

- [ ] **Step 1: Write integration tests for Claude Controller direct mode `-high` handling**

Create `tests/claudeControllerThinkingDirect.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import { claudeController } from '../src/proxy/controllers/claudeController';
import { upstreamManager } from '../src/utils/upstreamManager';
import { config } from '../config/default';

describe('claudeController Direct Mode Thinking Suffix', () => {
  let app: express.Express;
  let capturedUpstreamUrl = '';
  let capturedBody: any = null;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post('/v1/messages', (req, res) => claudeController.handleMessages(req, res));
    app.post('/v1/messages/count_tokens', (req, res) => claudeController.handleCountTokens(req, res));

    // Mock global.fetch to capture upstream call
    capturedUpstreamUrl = '';
    capturedBody = null;
    (global as any).fetch = jest.fn().mockImplementation(async (url: string, options: any) => {
      capturedUpstreamUrl = url;
      capturedBody = options.body ? JSON.parse(options.body) : null;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
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
    // Verified stripped URL
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    // Verified thinkingLevel injected
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    // Ensure includeThoughts is NOT injected
    expect(capturedBody.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });

  it('does NOT strip -high and does NOT inject thinkingLevel in proxy mode', async () => {
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
    // Preserves -high in proxy mode
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent');
    // No thinkingConfig injected
    expect(capturedBody.generationConfig?.thinkingConfig).toBeUndefined();
  });

  it('strips -high for /v1/messages/count_tokens in direct mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:countTokens',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        messages: [{ role: 'user', content: 'Count this' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens');
    expect(capturedBody.generateContentRequest?.model).toBe('models/gemini-2.5-flash');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeControllerThinkingDirect.test.ts`
Expected: FAIL (capturedUpstreamUrl contains `gemini-2.5-flash-high` instead of `gemini-2.5-flash`, thinkingConfig is undefined)

- [ ] **Step 3: Modify `src/proxy/controllers/claudeController.ts`**

Import `parseModelThinkingSuffix` at top of `src/proxy/controllers/claudeController.ts`:
```typescript
import { parseModelThinkingSuffix } from '../../utils/modelThinkingHelper';
```

In `handleMessages` (streaming block, around line 83-97):
```typescript
      if (isStream) {
        const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
        const targetPath = `/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`;
        const serverSelection = upstreamManager.getUpstreamUrl(targetPath, { model: cleanModelName, originalModel: clientModel, resolvedModel: cleanModelName });
        let { targetUrl, serverUrl, serverIndex, serverType, selectedApiKey } = serverSelection;
        logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini [server ${serverIndex + 1}: ${serverUrl}]: POST ${targetPath}`);

        // Direct mode: strip -high and inject thinkingConfig
        if (serverType === 'direct') {
          const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
          if (thinkingInfo.isHigh) {
            targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
            gemReq.generationConfig = gemReq.generationConfig || {};
            gemReq.generationConfig.thinkingConfig = {
              ...(gemReq.generationConfig.thinkingConfig || {}),
              thinkingLevel: 'HIGH'
            };
          }
        }
```

In `handleMessages` (non-streaming block, around line 295-310):
```typescript
      // Non-Streaming generation
      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      const targetPath = `/v1beta/models/${cleanModelName}:generateContent`;
      const serverSelection = upstreamManager.getUpstreamUrl(targetPath, { model: cleanModelName, originalModel: clientModel, resolvedModel: cleanModelName });
      let { targetUrl, serverUrl, serverIndex, serverType, selectedApiKey } = serverSelection;
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini [server ${serverIndex + 1}: ${serverUrl}]: POST ${targetPath}`);

      // Direct mode: strip -high and inject thinkingConfig
      if (serverType === 'direct') {
        const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
        if (thinkingInfo.isHigh) {
          targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
          gemReq.generationConfig = gemReq.generationConfig || {};
          gemReq.generationConfig.thinkingConfig = {
            ...(gemReq.generationConfig.thinkingConfig || {}),
            thinkingLevel: 'HIGH'
          };
        }
      }
```

In `handleCountTokens` (around line 460-480):
```typescript
      const targetPath = `/v1beta/models/${cleanModelName}:countTokens`;
      const serverSelection = upstreamManager.getUpstreamUrl(targetPath, { model: cleanModelName, originalModel: requestedModel, resolvedModel: cleanModelName });
      let { targetUrl, serverUrl, serverIndex, serverType, selectedApiKey } = serverSelection;

      if (serverType === 'direct') {
        const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
        if (thinkingInfo.isHigh) {
          targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
          countTokensPayload.generateContentRequest.model = `models/${thinkingInfo.baseModel}`;
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/claudeControllerThinkingDirect.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/controllers/claudeController.ts tests/claudeControllerThinkingDirect.test.ts
git commit -m "feat(claude): strip -high and inject thinkingLevel HIGH in direct mode"
```

---

### Task 4: Support Direct Mode Thinking Suffix in Gemini Controller

**Files:**
- Modify: `src/proxy/controllers/geminiController.ts:50-100`
- Test: `tests/geminiControllerThinkingDirect.test.ts`

**Interfaces:**
- Consumes: `parseModelThinkingSuffix` from `src/utils/modelThinkingHelper.ts`
- Behavior:
  - If `serverSelection.serverType === 'direct'` and `targetModelName` has `-high`:
    - Replace `models/${targetModelName}` with `models/${thinkingInfo.baseModel}` in `targetUrl`
    - Inject `generationConfig.thinkingConfig: { thinkingLevel: 'HIGH' }` into `clientReq` if present

- [ ] **Step 1: Write integration tests for Gemini Controller direct mode `-high` handling**

Create `tests/geminiControllerThinkingDirect.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import { geminiController } from '../src/proxy/controllers/geminiController';
import { upstreamManager } from '../src/utils/upstreamManager';

describe('geminiController Direct Mode Thinking Suffix', () => {
  let app: express.Express;
  let capturedUpstreamUrl = '';
  let capturedBody: any = null;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.all('*', (req, res) => geminiController.handleProxy(req, res));

    capturedUpstreamUrl = '';
    capturedBody = null;
    (global as any).fetch = jest.fn().mockImplementation(async (url: string, options: any) => {
      capturedUpstreamUrl = url;
      capturedBody = options.body ? JSON.parse(options.body) : null;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Native Gemini Hello' }], role: 'model' } }]
        }),
        text: async () => 'ok'
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips -high from path and injects thinkingLevel: HIGH in direct mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash-high:generateContent')
      .set('x-goog-api-key', 'client-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          temperature: 0.7
        }
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody.generationConfig.temperature).toBe(0.7);
    expect(capturedBody.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody.generationConfig.thinkingConfig.includeThoughts).toBeUndefined();
  });

  it('preserves -high in proxy mode without injecting thinkingLevel', async () => {
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
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent');
    expect(capturedBody?.generationConfig?.thinkingConfig).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/geminiControllerThinkingDirect.test.ts`
Expected: FAIL (capturedUpstreamUrl contains `gemini-2.5-flash-high`, thinkingConfig is undefined)

- [ ] **Step 3: Modify `src/proxy/controllers/geminiController.ts`**

Import `parseModelThinkingSuffix`:
```typescript
import { parseModelThinkingSuffix } from '../../utils/modelThinkingHelper';
```

In `handleProxy` (around line 89-105):
```typescript
    const serverSelection = upstreamManager.getUpstreamUrl(cleanPath, {
      model: targetModelName || undefined,
      originalModel: originalModel || undefined,
      resolvedModel: targetModelName || undefined
    });
    let { targetUrl, serverUrl, serverIndex, serverType, selectedApiKey } = serverSelection;
    const customUpstreamHeaders: Record<string, string> = {};
    if (effectiveStrategy) {
      customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
    }
    const effectiveApiKey = (serverType === 'direct' && selectedApiKey)
      ? selectedApiKey
      : apiKey;
    const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders);

    const clientReq = req.body && Object.keys(req.body).length > 0 ? JSON.parse(JSON.stringify(req.body)) : null;

    // Direct mode: strip -high from URL and inject thinkingConfig
    if (serverType === 'direct' && targetModelName) {
      const thinkingInfo = parseModelThinkingSuffix(targetModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${targetModelName}`, `models/${thinkingInfo.baseModel}`);
        if (clientReq) {
          clientReq.generationConfig = clientReq.generationConfig || {};
          clientReq.generationConfig.thinkingConfig = {
            ...(clientReq.generationConfig.thinkingConfig || {}),
            thinkingLevel: 'HIGH'
          };
        }
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/geminiControllerThinkingDirect.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/controllers/geminiController.ts tests/geminiControllerThinkingDirect.test.ts
git commit -m "feat(gemini): strip -high and inject thinkingLevel HIGH in direct mode"
```

---

### Task 5: Full Regression Testing and Build Verification

**Files:**
- Test: all test suites (`npm test`)
- Build: `npm run build`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: 100% tests passing across all test files without leaks or regressions.

- [ ] **Step 2: Build project**

Run: `npm run build`
Expected: Clean build of both frontend and backend (`dist/frontend` and `dist/src`).

- [ ] **Step 3: Commit plan and finish**

```bash
git add docs/superpowers/plans/2026-10-01-model-thinking-suffix-direct.md
git commit -m "docs: add direct mode model thinking suffix implementation plan"
```

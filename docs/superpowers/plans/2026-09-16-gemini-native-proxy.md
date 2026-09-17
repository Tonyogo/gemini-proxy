# Native Gemini API Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a native Google Gemini API reverse proxy in Express, supporting `/v1beta/*` and `/v1/models/*` endpoints with model mapping, streaming lifecycle management, and payload audit logging.

**Architecture:** A dedicated `geminiController.ts` handling both non-streaming and streaming requests, mounted via `geminiRoutes.ts` onto `/v1beta` and integrated with `/v1` in `app.ts`. Integrates directly with `extractClientKey`, `extractTimeoutMs`, `config.modelMappings`, `StreamLifecycleManager`, and `payloadLogger`.

**Tech Stack:** TypeScript, Express, node-fetch, Jest, supertest.

## Global Constraints
- Support `/v1beta/*` (e.g. `/v1beta/models`, `/v1beta/models/:modelWithAction`, etc.) and `/v1/models/:modelWithAction`.
- Seamlessly forward Gemini endpoints without translating to/from Claude format.
- Support model mapping with `x-scheduling-strategy` header propagation.
- Handle SSE streaming (`alt=sse` / `:streamGenerateContent`) with client disconnect aborts and complete transaction persistence in `payloadLogger`.
- All tests must pass with `npx jest --runInBand`.

---

### Task 1: Create Gemini Controller and Core Proxy Engine

**Files:**
- Create: `src/controllers/geminiController.ts`
- Test: `tests/geminiController.test.ts`

**Interfaces:**
- Produces: `geminiController.handleProxy(req: Request, res: Response)`
- Consumes: `extractClientKey`, `extractTimeoutMs`, `extractClientSchedulingStrategy`, `getUpstreamUrl`, `generateShortId`, `buildUpstreamHeaders`, `config.modelMappings`, `payloadLogger.saveTransaction`, `StreamLifecycleManager`

- [x] **Step 1: Write the failing test for `GeminiController` non-streaming proxy**

Create `tests/geminiController.test.ts`:

```typescript
import request from 'supertest';
import express from 'express';
import geminiController from '../src/controllers/geminiController';
import config from '../config/default';

jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation((url, opts) => {
    return Promise.resolve({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null,
        raw: () => ({ 'content-type': ['application/json'] }),
      },
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Native Gemini Output' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 }
      }),
      text: () => Promise.resolve(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Native Gemini Output' }] } }]
      }))
    });
  });
});

describe('GeminiController - Native Gemini API Proxy', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.all('/v1beta/*', (req, res) => geminiController.handleProxy(req, res));
    app.all('/v1/models/:modelWithAction', (req, res) => geminiController.handleProxy(req, res));
  });

  it('rejects 401 when API key is missing', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:generateContent')
      .send({ contents: [{ parts: [{ text: 'Hello' }] }] });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('API key');
  });

  it('proxies non-streaming generateContent request successfully', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:generateContent')
      .set('x-goog-api-key', 'test-gemini-key')
      .send({ contents: [{ parts: [{ text: 'Hello Gemini' }] }] });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('Native Gemini Output');
  });

  it('applies model mapping when target model is configured in MODEL_MAPPINGS', async () => {
    config.modelMappings = {
      'gemini-pro-mapped': { target: 'gemini-3.7-flash', strategy: 'least-used' }
    } as any;

    const res = await request(app)
      .post('/v1beta/models/gemini-pro-mapped:generateContent')
      .set('x-goog-api-key', 'test-gemini-key')
      .send({ contents: [{ parts: [{ text: 'Hello Mapped' }] }] });

    expect(res.status).toBe(200);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/geminiController.test.ts`
Expected: FAIL (controller does not exist yet).

- [x] **Step 3: Implement `src/controllers/geminiController.ts`**

Create `src/controllers/geminiController.ts`:

```typescript
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import config from '../../config/default';
import payloadLogger from '../services/payloadLogger';
import logger from '../utils/logger';
import { StreamLifecycleManager } from '../utils/streamLifecycleManager';
import {
  extractClientKey,
  extractTimeoutMs,
  extractClientSchedulingStrategy,
  getUpstreamUrl,
  generateShortId,
  buildUpstreamHeaders
} from '../utils/requestHelper';

class GeminiController {
  public async handleProxy(req: Request, res: Response): Promise<any> {
    const transactionId = generateShortId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Received ${clientEndpoint}`);

    const apiKey = extractClientKey(req);
    const timeoutMs = extractTimeoutMs(req);

    if (!apiKey) {
      const errPayload = {
        error: {
          code: 401,
          message: 'API key not valid. Please pass a valid API key via x-goog-api-key header, Authorization Bearer, or key query parameter.',
          status: 'UNAUTHENTICATED'
        }
      };
      const duration = Date.now() - startTime;
      logger.warn(`[GeminiProxy] [Transaction: ${transactionId}] Request rejected: API Key missing.`);
      payloadLogger.saveTransaction(transactionId, req.body, null, null, errPayload, duration, requestPath, 401, false);
      return res.status(401).json(errPayload);
    }

    // Resolve model mapping if applicable
    let cleanPath = requestPath.replace(/^\/+/, '');
    // Ensure cleanPath preserves /v1beta or /v1 prefix
    let effectiveStrategy: string | null = extractClientSchedulingStrategy(req);
    let targetModelName = '';

    const modelMatch = cleanPath.match(/models\/([^:/]+)(:.*)?$/);
    if (modelMatch) {
      const originalModel = modelMatch[1];
      const actionSuffix = modelMatch[2] || '';
      targetModelName = originalModel;

      const mappingEntry = config.modelMappings[originalModel];
      if (mappingEntry) {
        let mappedTarget = '';
        if (typeof mappingEntry === 'string') {
          mappedTarget = mappingEntry;
        } else if (mappingEntry && typeof mappingEntry === 'object') {
          mappedTarget = mappingEntry.target;
          if (mappingEntry.strategy) {
            effectiveStrategy = mappingEntry.strategy;
          }
        }
        if (mappedTarget) {
          logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Model mapping: ${originalModel} -> ${mappedTarget}`);
          cleanPath = cleanPath.replace(`models/${originalModel}${actionSuffix}`, `models/${mappedTarget}${actionSuffix}`);
          targetModelName = mappedTarget;
        }
      }
    }

    const isStream = cleanPath.includes(':streamGenerateContent') || req.query.alt === 'sse';
    const targetUrl = getUpstreamUrl(cleanPath);
    const customUpstreamHeaders: Record<string, string> = {};
    if (effectiveStrategy) {
      customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
    }
    const upstreamHeaders = buildUpstreamHeaders(apiKey, customUpstreamHeaders);

    const clientReq = req.body && Object.keys(req.body).length > 0 ? JSON.parse(JSON.stringify(req.body)) : null;

    if (isStream) {
      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Proxying stream to: ${req.method} ${targetUrl}`);

      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: upstreamHeaders,
          body: req.method !== 'GET' && req.method !== 'HEAD' && clientReq ? JSON.stringify(clientReq) : undefined,
          signal: streamManager.signal
        });

        if (!response.ok) {
          streamManager.markFinished();
          const errText = await response.text();
          let errJson;
          try { errJson = JSON.parse(errText); } catch { errJson = { error: errText }; }
          const duration = Date.now() - startTime;
          payloadLogger.saveTransaction(transactionId, clientReq, null, null, errJson, duration, requestPath, response.status, true);
          return res.status(response.status).json(errJson);
        }

        // Forward headers
        res.status(response.status);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('x-transaction-id', transactionId);

        streamManager.setUpstreamStream(response.body);

        let accumulatedStreamText = '';

        response.body.on('data', (chunk: Buffer) => {
          accumulatedStreamText += chunk.toString('utf8');
          res.write(chunk);
        });

        response.body.on('end', () => {
          streamManager.markFinished();
          res.end();
          const duration = Date.now() - startTime;
          logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Stream finished (duration: ${(duration / 1000).toFixed(2)}s)`);
          let parsedResponse: any = null;
          try {
            parsedResponse = JSON.parse(accumulatedStreamText);
          } catch {
            parsedResponse = accumulatedStreamText;
          }
          payloadLogger.saveTransaction(transactionId, clientReq, null, null, parsedResponse, duration, requestPath, 200, true);
        });

        response.body.on('error', (err: any) => {
          streamManager.markFinished();
          logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Stream error: ${err.message}`);
          if (!res.headersSent) {
            res.status(502).json({ error: { code: 502, message: err.message, status: 'BAD_GATEWAY' } });
          } else {
            res.end();
          }
        });

      } catch (err: any) {
        streamManager.markFinished();
        const duration = Date.now() - startTime;
        logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Stream exception: ${err.message}`);
        const errJson = { error: { code: 500, message: err.message, status: 'INTERNAL' } };
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errJson, duration, requestPath, 500, true);
        if (!res.headersSent) {
          return res.status(500).json(errJson);
        }
      }
      return;
    }

    // Non-streaming request
    try {
      logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Proxying request to: ${req.method} ${targetUrl}`);
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: upstreamHeaders,
        body: req.method !== 'GET' && req.method !== 'HEAD' && clientReq ? JSON.stringify(clientReq) : undefined
      });

      const resText = await response.text();
      let resJson: any;
      try {
        resJson = JSON.parse(resText);
      } catch {
        resJson = resText;
      }

      const duration = Date.now() - startTime;
      payloadLogger.saveTransaction(transactionId, clientReq, null, null, resJson, duration, requestPath, response.status, false);

      res.setHeader('x-transaction-id', transactionId);
      return res.status(response.status).json(resJson);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Proxy error: ${err.message}`);
      const errJson = { error: { code: 500, message: err.message, status: 'INTERNAL' } };
      payloadLogger.saveTransaction(transactionId, clientReq, null, null, errJson, duration, requestPath, 500, false);
      return res.status(500).json(errJson);
    }
  }
}

export default new GeminiController();
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/geminiController.test.ts`
Expected: PASS.

- [x] **Step 5: Commit changes**

```bash
git add src/controllers/geminiController.ts tests/geminiController.test.ts
git commit -m "feat(proxy): create geminiController with non-streaming and streaming native proxying"
```

---

### Task 2: Create Routes and Mount in Express App

**Files:**
- Create: `src/routes/geminiRoutes.ts`
- Modify: `src/app.ts:1-25`
- Modify: `src/routes/claudeRoutes.ts`
- Test: `tests/geminiRoutesIntegration.test.ts`

**Interfaces:**
- Produces: `geminiRoutes` router handling `/v1beta/*` and fallback Gemini paths
- Modifies: `app.ts` to mount `app.use('/v1beta', geminiRoutes)` and route `/v1/models/*:generateContent`

- [x] **Step 1: Create `src/routes/geminiRoutes.ts`**

```typescript
import { Router, Request, Response } from 'express';
import geminiController from '../controllers/geminiController';

const router = Router();

// Handle all methods under /v1beta
router.all('*', (req: Request, res: Response) => geminiController.handleProxy(req, res));

export default router;
```

- [x] **Step 2: Update `src/routes/claudeRoutes.ts` and `src/app.ts`**

In `src/routes/claudeRoutes.ts`, forward Gemini actions on `/v1/models/*` (e.g. `:generateContent`, `:streamGenerateContent`, `:countTokens`) to `geminiController`:

```typescript
import { Router, Request, Response } from 'express';
import claudeController from '../controllers/claudeController';
import geminiController from '../controllers/geminiController';

const router = Router();

router.post('/messages', (req: Request, res: Response) => claudeController.handleMessages(req, res));
router.post('/messages/count_tokens', (req: Request, res: Response) => claudeController.handleCountTokens(req, res));

// Handle native Gemini action paths on /v1/models (e.g. /v1/models/gemini-2.0-flash:generateContent)
router.all('/models/*:*', (req: Request, res: Response) => geminiController.handleProxy(req, res));

router.get('/models', (req: Request, res: Response) => claudeController.handleListModels(req, res));
router.get('/models/:model_id', (req: Request, res: Response) => claudeController.handleRetrieveModel(req, res));

export default router;
```

In `src/app.ts`, mount `geminiRoutes`:

```typescript
import express, { Request, Response } from 'express';
import path from 'path';
import claudeRoutes from './routes/claudeRoutes';
import geminiRoutes from './routes/geminiRoutes';
import adminRoutes from './admin/routes/adminRoutes';
import config from '../config/default';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use('/v1beta', geminiRoutes);
app.use('/v1', claudeRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

if (config.enableUi) {
  const frontendDist = path.join(__dirname, '../../dist/frontend');
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/v1beta') || req.path.startsWith('/v1') || req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) {
        res.status(404).send('UI not built yet. Run npm run build.');
      }
    });
  });
}

export default app;
```

- [x] **Step 3: Write integration tests in `tests/geminiRoutesIntegration.test.ts`**

Create `tests/geminiRoutesIntegration.test.ts`:

```typescript
import request from 'supertest';
import app from '../src/app';

jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation((url) => {
    if (url.includes('/models') && !url.includes(':')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ models: [{ name: 'models/gemini-2.0-flash' }] }),
        text: () => Promise.resolve(JSON.stringify({ models: [{ name: 'models/gemini-2.0-flash' }] }))
      });
    }
    return Promise.resolve({
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Native Response' }] } }] }),
      text: () => Promise.resolve(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Native Response' }] } }] }))
    });
  });
});

describe('Native Gemini Routes Integration', () => {
  it('handles GET /v1beta/models', async () => {
    const res = await request(app)
      .get('/v1beta/models')
      .set('x-goog-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.models[0].name).toBe('models/gemini-2.0-flash');
  });

  it('handles POST /v1beta/models/gemini-2.0-flash:generateContent', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:generateContent')
      .set('x-goog-api-key', 'valid-key')
      .send({ contents: [{ parts: [{ text: 'Hello' }] }] });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('Native Response');
  });

  it('handles POST /v1/models/gemini-2.0-flash:generateContent', async () => {
    const res = await request(app)
      .post('/v1/models/gemini-2.0-flash:generateContent')
      .set('x-goog-api-key', 'valid-key')
      .send({ contents: [{ parts: [{ text: 'Hello via v1' }] }] });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('Native Response');
  });

  it('preserves existing Claude endpoint POST /v1/messages', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'valid-key')
      .send({
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Hi Claude' }]
      });

    expect(res.status).toBe(200);
    expect(res.body.content[0].text).toBe('Native Response');
  });
});
```

- [x] **Step 4: Run integration test**

Run: `npx jest tests/geminiRoutesIntegration.test.ts`
Expected: PASS.

- [x] **Step 5: Commit changes**

```bash
git add src/routes/geminiRoutes.ts src/routes/claudeRoutes.ts src/app.ts tests/geminiRoutesIntegration.test.ts
git commit -m "feat(routes): mount geminiRoutes on /v1beta and forward /v1/models action endpoints"
```

---

### Task 3: Full Regression Verification & Build Check

**Files:**
- Full suite verification

- [x] **Step 1: Run complete test suite**

Run: `npx jest --runInBand`
Expected: 100% tests pass (106 test suites).

- [x] **Step 2: Run frontend build check**

Run: `npm run build:frontend`
Expected: Vite build succeeds cleanly.

- [x] **Step 3: Run backend build check**

Run: `npm run build:backend`
Expected: TypeScript compile succeeds without any errors.

- [x] **Step 4: Commit and finalize**

Verify git working tree status:
```bash
git status
```
Confirm everything is committed cleanly.

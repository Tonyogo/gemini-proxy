# Transaction Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a stateless, asynchronous transaction payload logging service inside `src/services/payloadLogger.js`, integrated with `src/controllers/claudeController.js`.

**Architecture:** A separate file-writing service that handles directory creation and saves standardized JSON payloads containing client requests, mapped requests, and aggregated responses asynchronously.

**Tech Stack:** Node.js, Jest, Supertest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Standard packages only.
- **Framework:** Express.js
- **Statelessness:** Files are written asynchronously without blocking the request-response lifecycle.

---

### Task 1: Create PayloadLogger Service

Implement the `src/services/payloadLogger.js` file and write its unit tests.

**Files:**
- Create: `src/services/payloadLogger.js`
- Create: `tests/payloadLogger.test.js`

**Interfaces:**
- Consumes: None (starting task)
- Produces: `payloadLogger` module with function `saveTransaction(transactionId, clientReq, gemReq, gemRes)`.

- [ ] **Step 1: Create unit test file `tests/payloadLogger.test.js`**
```javascript
const payloadLogger = require('../src/services/payloadLogger');
const fs = require('fs').promises;
const path = require('path');

describe('PayloadLogger Service', () => {
  const testId = 'test_transaction_abc123';
  const filePath = path.join(process.cwd(), 'data', 'debug', `transaction_${testId}.json`);

  afterEach(async () => {
    try {
      await fs.unlink(filePath);
    } catch (e) {
      // ignore
    }
  });

  it('correctly creates the directory and writes pretty-printed json payload', async () => {
    const clientReq = { messages: [{ role: 'user', content: 'Hi' }] };
    const gemReq = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
    const gemRes = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test tests/payloadLogger.test.js`
Expected: FAIL with "Cannot find module" error.

- [ ] **Step 3: Implement `src/services/payloadLogger.js`**
```javascript
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class PayloadLogger {
  constructor() {
    this.debugDir = path.join(process.cwd(), 'data', 'debug');
    this.initialized = false;
  }

  async _ensureDirectory() {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.debugDir, { recursive: true });
      this.initialized = true;
    } catch (err) {
      logger.error(`[PayloadLogger] Failed to create debug directory: ${err.message}`);
    }
  }

  async saveTransaction(transactionId, clientReq, gemReq, gemRes) {
    try {
      await this._ensureDirectory();
      
      const payload = {
        client_req: clientReq || null,
        gem_req: gemReq || null,
        gem_res: gemRes || null
      };

      const filePath = path.join(this.debugDir, `transaction_${transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug(`[PayloadLogger] Saved transaction log: transaction_${transactionId}.json`);
    } catch (err) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
}

module.exports = new PayloadLogger();
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test tests/payloadLogger.test.js`
Expected: PASS

- [ ] **Step 5: Commit service and tests**
```bash
git add src/services/payloadLogger.js tests/payloadLogger.test.js
git commit -m "feat: implement payload logging utility service and unit tests"
```

---

### Task 2: Integrate Transaction Logging in ClaudeController

Generate unique IDs on request and hook the payload logger inside the controller handlers (supporting both streaming and non-streaming responses).

**Files:**
- Modify: `src/controllers/claudeController.js`
- Create: `tests/claudeLogging.test.js`

**Interfaces:**
- Consumes: `payloadLogger.saveTransaction` function.
- Produces: Asynchronously logged transaction files on actual request lifecycles.

- [ ] **Step 1: Write integration tests in `tests/claudeLogging.test.js`**
```javascript
const request = require('supertest');
const app = require('../src/app');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

jest.mock('node-fetch');

describe('ClaudeController Transaction Logging', () => {
  const debugDir = path.join(process.cwd(), 'data', 'debug');

  beforeEach(async () => {
    try {
      await fs.mkdir(debugDir, { recursive: true });
    } catch (e) {}
  });

  afterEach(async () => {
    try {
      const files = await fs.readdir(debugDir);
      for (const f of files) {
        if (f.startsWith('transaction_')) {
          await fs.unlink(path.join(debugDir, f));
        }
      }
    } catch (e) {}
  });

  it('correctly logs non-streaming requests and responses', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Non-streaming response' }] } }]
      })
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key-abc')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is 1+1?' }]
      });

    expect(res.statusCode).toEqual(200);

    // Wait a brief moment for async file-write to complete
    await new Promise(r => setTimeout(r, 100));

    const files = await fs.readdir(debugDir);
    const transFile = files.find(f => f.startsWith('transaction_') && f.endsWith('.json'));
    expect(transFile).toBeDefined();

    const data = JSON.parse(await fs.readFile(path.join(debugDir, transFile), 'utf8'));
    expect(data.client_req.model).toEqual('claude-3-5-sonnet');
    expect(data.gem_res.candidates[0].content.parts[0].text).toEqual('Non-streaming response');
  });

  it('correctly aggregates and logs streaming chunks', async () => {
    const { Readable } = require('stream');
    const mockStream = new Readable();
    mockStream._read = () => {};

    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      body: mockStream
    });

    const promise = request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key-abc')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'Tell a story' }],
        stream: true
      });

    const chunk = {
      candidates: [{ content: { parts: [{ text: 'Streaming chunk content' }] } }]
    };

    mockStream.push(`data: ${JSON.stringify(chunk)}\n\n`);
    mockStream.push(null); // end

    await promise;

    // Wait a brief moment for async file-write to complete
    await new Promise(r => setTimeout(r, 100));

    const files = await fs.readdir(debugDir);
    const transFile = files.find(f => f.startsWith('transaction_') && f.endsWith('.json'));
    expect(transFile).toBeDefined();

    const data = JSON.parse(await fs.readFile(path.join(debugDir, transFile), 'utf8'));
    expect(data.client_req.model).toEqual('claude-3-5-sonnet');
    expect(data.gem_res[0].candidates[0].content.parts[0].text).toEqual('Streaming chunk content');
  });
});
```

- [ ] **Step 2: Run integration tests to verify they fail**
Run: `npm test tests/claudeLogging.test.js`
Expected: FAIL since controller does not log payloads.

- [ ] **Step 3: Update `src/controllers/claudeController.js` to implement logging**
Import `payloadLogger` and inject transaction logging inside methods:
```javascript
// ... top imports in src/controllers/claudeController.js:
const payloadLogger = require('../services/payloadLogger');

// Add helper inside ClaudeController class to generate IDs:
  _generateTransactionId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
```

Now integrate within `handleMessages`:
```javascript
  async handleMessages(req, res) {
    try {
      const apiKey = this._extractClientKey(req);

      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        });
      }

      const transactionId = this._generateTransactionId();
      const clientReq = req.body;
      logger.debug(`[Request] Incoming Claude payload body: ${JSON.stringify(clientReq)}`);

      const { googleRequest, cleanModelName, isStream } = claudeTranslator.translateClaudeToGoogle(clientReq);
      const gemReq = googleRequest;

      logger.debug(`[Adapter] Mapped Gemini request body: ${JSON.stringify(gemReq)}`);

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;

      if (isStream) {
        const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse&key=${apiKey}`);
        const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
        logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gemReq)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
          
          // Log failed stream transaction
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
          return res.status(normalized.status).json(normalized.payload);
        }

        // Set SSE streaming headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamState = {};
        const gemResChunks = [];

        // Read downstream response body stream chunk by chunk
        response.body.on('data', (buffer) => {
          const text = buffer.toString('utf8');
          const lines = text.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Extract and parse Gemini chunk for logs
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.substring(6).trim();
              if (jsonStr !== '[DONE]') {
                try {
                  gemResChunks.push(JSON.parse(jsonStr));
                } catch (e) {}
              }
            }

            const translated = claudeTranslator.translateGoogleToClaudeStream(trimmed, cleanModelName, streamState);
            if (translated) {
              res.write(translated);
            }
          }
        });

        response.body.on('end', () => {
          // Log complete streaming transaction asynchronously
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks);
          res.end();
        });

        response.body.on('error', (err) => {
          logger.error(`Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message, partial_chunks: gemResChunks });
          res.end();
        });

        return;
      }

      // Non-Streaming generation
      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gemReq)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
        
        // Log failed transaction
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);

      // Log successful transaction
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData);
      return res.status(200).json(translatedResponse);
    } catch (err) {
      logger.error(`Unhandled error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
```

Integrate within `handleCountTokens`:
```javascript
  async handleCountTokens(req, res) {
    try {
      const apiKey = this._extractClientKey(req);

      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        });
      }

      const transactionId = this._generateTransactionId();
      const clientReq = req.body;
      logger.debug(`[Request] Incoming Claude CountTokens payload body: ${JSON.stringify(clientReq)}`);

      const { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(clientReq);
      const gemReq = googleRequest;

      logger.debug(`[Adapter] Mapped Gemini CountTokens request body: ${JSON.stringify(gemReq)}`);

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:countTokens?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gemReq)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
        
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData);
      return res.status(200).json({
        input_tokens: geminiData.totalTokens || 0
      });
    } catch (err) {
      logger.error(`Unhandled count tokens error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
```

- [ ] **Step 4: Run integration tests to verify they pass**
Run: `npm test tests/claudeLogging.test.js`
Expected: PASS

- [ ] **Step 5: Run all test suites recursively to confirm absolute safety**
Run: `npm test`
Expected: ALL PASS (26/26 assertions)

- [ ] **Step 6: Commit changes**
```bash
git add src/controllers/claudeController.js tests/claudeLogging.test.js
git commit -m "feat: integrate PayloadLogger inside ClaudeController messages and count_tokens endpoints"
```

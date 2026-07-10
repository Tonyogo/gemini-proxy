# Claude API to Gemini Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Claude-to-Gemini translation and streaming features from the browser-backed GeminiToAPI project into a stateless, standalone Express.js microservice (`gemini-proxy`) targeting the official Google AI Studio API.

**Architecture:** A lightweight Node.js Express server with a clear layer separation (Router -> Controller -> Translation Service). It translates Claude payload parameters (thinking, system instructions, tools, base64 images) to Google's format, fetches the official Google AI Studio endpoints, and converts the streaming (SSE) or non-streaming responses back into Claude's format.

**Tech Stack:** Node.js, Express.js, `node-fetch`, `dotenv`, Jest (for TDD).

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native or simple standard packages only (express, node-fetch, dotenv, jest)
- **Framework:** Express.js
- **Statelessness:** No DB or Playwright/browser dependencies

---

### Task 1: Scaffolding, Package Setup, and App Scaffolding

Initialize the repository structure, `package.json`, environment variables, and config loader.

**Files:**
- Create: `package.json`
- Create: `.env`
- Create: `config/default.js`
- Create: `src/utils/logger.js`
- Create: `src/app.js`
- Create: `index.js`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Base configuration loading via `dotenv` and standard Express application bootstrap.

- [ ] **Step 1: Create `package.json`**
```json
{
  "name": "gemini-proxy",
  "version": "1.0.0",
  "description": "Stateless Claude-to-Gemini API proxy",
  "main": "index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node index.js",
    "test": "jest"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "node-fetch": "^2.7.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `.env`**
```env
PORT=3000
GEMINI_API_KEY=AIzaSyFakeKeyForLocalTesting
DEFAULT_GEMINI_MODEL=gemini-2.5-flash
LOG_LEVEL=debug
```

- [ ] **Step 3: Create `config/default.js`**
```javascript
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY,
  defaultModel: process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.5-flash',
  logLevel: process.env.LOG_LEVEL || 'info',
  modelMapping: {
    "claude-3-5-sonnet": "gemini-2.5-pro",
    "claude-3-5-sonnet-20241022": "gemini-2.5-pro",
    "claude-3-5-haiku": "gemini-2.5-flash",
    "claude-3-5-haiku-20241022": "gemini-2.5-flash",
    "claude-3-opus": "gemini-2.5-pro",
    "claude-3-sonnet": "gemini-2.5-flash",
    "claude-3-haiku": "gemini-2.5-flash"
  }
};
```

- [ ] **Step 4: Create `src/utils/logger.js`**
```javascript
const config = require('../../config/default');

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : 2;

const log = (level, message) => {
  if (levels[level] <= currentLevel) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
  }
};

module.exports = {
  error: (msg) => log('error', msg),
  warn: (msg) => log('warn', msg),
  info: (msg) => log('info', msg),
  debug: (msg) => log('debug', msg)
};
```

- [ ] **Step 5: Create `src/app.js`**
```javascript
const express = require('express');
const app = express();

app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
```

- [ ] **Step 6: Create `index.js`**
```javascript
const app = require('./src/app');
const config = require('./config/default');
const logger = require('./src/utils/logger');

app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
});
```

- [ ] **Step 7: Run health check test**
Create a test for the health check.
Create `tests/health.test.js`:
```javascript
const request = require('supertest');
const app = require('../src/app');

describe('GET /health', () => {
  it('should return status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```
Run `npm install` and run `npm test`. Verify test passes.

- [ ] **Step 8: Commit**
```bash
git add .
git commit -m "feat: project scaffolding, express app and health check"
```

---

### Task 2: Claude to Gemini Translator Service

Implement the payload translation service (`claudeTranslator.js`). We will write unit tests using Jest first to ensure translation is completely correct.

**Files:**
- Create: `src/services/claudeTranslator.js`
- Create: `tests/claudeTranslator.test.js`

**Interfaces:**
- Consumes: Configuration mapping from `config/default.js`
- Produces: `claudeTranslator` module with functions:
  - `translateClaudeToGoogle(claudeBody)` -> Returns `{ googleRequest, cleanModelName, isStream }`
  - `convertGoogleToClaudeNonStream(googleResponse, modelName)` -> Returns Claude response payload
  - `translateGoogleToClaudeStream(googleChunk, modelName, streamState)` -> Returns SSE compatible event string or null
  - `normalizeError(error)` -> Returns `{ status, payload }`

- [ ] **Step 1: Create the failing unit tests for `claudeTranslator.test.js`**
```javascript
const translator = require('../src/services/claudeTranslator');

describe('Claude to Gemini Request Translation', () => {
  it('translates basic message requests', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'Hello' }]
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.cleanModelName).toEqual('gemini-2.5-pro');
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('Hello');
  });

  it('translates system prompts', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hi' }]
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction.parts[0].text).toEqual('You are a helpful assistant');
  });

  it('translates images', () => {
    const claudePayload = {
      model: 'claude-3-5-haiku',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'iVBORw0KGgoAAAANS...'
            }
          }
        ]
      }]
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.cleanModelName).toEqual('gemini-2.5-flash');
    const parts = result.googleRequest.contents[0].parts;
    expect(parts[0].text).toEqual('What is this?');
    expect(parts[1].inlineData.mimeType).toEqual('image/png');
    expect(parts[1].inlineData.data).toEqual('iVBORw0KGgoAAAANS...');
  });

  it('translates thinking config', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'Explain string theory' }],
      thinking: { type: 'enabled', budget_tokens: 1024 }
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.thinkingConfig.thinkingBudget).toEqual(1024);
  });
});

describe('Gemini to Claude Non-Stream Response Translation', () => {
  it('converts standard text response', () => {
    const geminiResponse = {
      candidates: [{
        content: {
          parts: [{ text: 'This is the answer.' }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 15
      }
    };
    const result = translator.convertGoogleToClaudeNonStream(geminiResponse, 'gemini-2.5-pro');
    expect(result.content[0].type).toEqual('text');
    expect(result.content[0].text).toEqual('This is the answer.');
    expect(result.usage.input_tokens).toEqual(10);
    expect(result.usage.output_tokens).toEqual(15);
  });
});
```

- [ ] **Step 2: Run test to verify they fail**
Run: `npm test tests/claudeTranslator.test.js`
Expected: FAIL with "Cannot find module" or "translator.translateClaudeToGoogle is not a function"

- [ ] **Step 3: Write implementation for `src/services/claudeTranslator.js`**
```javascript
const config = require('../../config/default');
const logger = require('../utils/logger');

class ClaudeTranslator {
  translateClaudeToGoogle(claudeBody) {
    const rawModel = claudeBody.model || config.defaultModel;
    const cleanModelName = config.modelMapping[rawModel] || config.defaultModel;

    let systemInstruction = null;
    if (claudeBody.system) {
      systemInstruction = {
        parts: [{ text: claudeBody.system }]
      };
    }

    const contents = [];
    const toolIdToNameMap = new Map();

    if (claudeBody.messages && Array.isArray(claudeBody.messages)) {
      for (const msg of claudeBody.messages) {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts = [];

        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: block.source.media_type,
                  data: block.source.data
                }
              });
            } else if (block.type === 'tool_use') {
              toolIdToNameMap.set(block.id, block.name);
              parts.push({
                functionCall: {
                  name: block.name,
                  args: block.input || {}
                }
              });
            } else if (block.type === 'tool_result') {
              const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
              parts.push({
                functionResponse: {
                  name: matchedName,
                  response: { content: block.content }
                }
              });
            }
          }
        }
        contents.push({ role, parts });
      }
    }

    const googleRequest = { contents };
    if (systemInstruction) {
      googleRequest.systemInstruction = systemInstruction;
    }

    // Set configuration parameters (maxTokens, system prompt configurations, temperature, etc.)
    const generationConfig = {};
    if (claudeBody.max_tokens) {
      generationConfig.maxOutputTokens = claudeBody.max_tokens;
    }
    if (claudeBody.temperature !== undefined) {
      generationConfig.temperature = claudeBody.temperature;
    }
    if (claudeBody.top_p !== undefined) {
      generationConfig.topP = claudeBody.top_p;
    }
    if (Object.keys(generationConfig).length > 0) {
      googleRequest.generationConfig = generationConfig;
    }

    // Handle thinking budget
    if (claudeBody.thinking && claudeBody.thinking.type === 'enabled') {
      googleRequest.thinkingConfig = {
        thinkingBudget: claudeBody.thinking.budget_tokens || 1024
      };
    }

    // Handle tools mapping
    if (claudeBody.tools && Array.isArray(claudeBody.tools)) {
      googleRequest.tools = [{
        functionDeclarations: claudeBody.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema
        }))
      }];
    }

    return {
      googleRequest,
      cleanModelName,
      isStream: claudeBody.stream === true
    };
  }

  convertGoogleToClaudeNonStream(googleResponse, modelName) {
    const candidate = googleResponse.candidates?.[0];
    const usage = googleResponse.usageMetadata || {};

    const content = [];
    const messageId = `msg_fake_${Math.random().toString(36).substr(2, 9)}`;

    if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (part.thought === true && part.text) {
          content.push({
            type: 'thinking',
            thinking: part.text,
            signature: part.thoughtSignature || 'dummy_signature'
          });
        } else if (part.text) {
          content.push({
            type: 'text',
            text: part.text
          });
        } else if (part.functionCall) {
          content.push({
            id: `toolu_fake_${Math.random().toString(36).substr(2, 9)}`,
            type: 'tool_use',
            name: part.functionCall.name,
            input: part.functionCall.args || {}
          });
        }
      }
    }

    if (content.length === 0) {
      content.push({ type: 'text', text: '' });
    }

    let stopReason = 'end_turn';
    if (candidate && candidate.finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    } else if (candidate && candidate.content && candidate.content.parts.some(p => p.functionCall)) {
      stopReason = 'tool_use';
    }

    return {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: modelName,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0)
      }
    };
  }

  translateGoogleToClaudeStream(googleChunk, modelName, streamState) {
    if (!googleChunk || googleChunk.trim() === '') return null;

    let jsonString = googleChunk;
    if (jsonString.startsWith('data: ')) {
      jsonString = jsonString.substring(6).trim();
    }
    if (jsonString === '[DONE]') return null;

    let googleResponse;
    try {
      googleResponse = JSON.parse(jsonString);
    } catch (e) {
      return null;
    }

    const candidate = googleResponse.candidates?.[0];
    const usage = googleResponse.usageMetadata;
    const events = [];

    if (!streamState.messageId) {
      streamState.messageId = `msg_stream_${Math.random().toString(36).substr(2, 9)}`;
      streamState.contentBlockIndex = 0;
    }

    if (!streamState.messageStartSent) {
      events.push({
        type: 'message_start',
        message: {
          id: streamState.messageId,
          type: 'message',
          role: 'assistant',
          model: modelName,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage ? usage.promptTokenCount || 0 : 0,
            output_tokens: 0
          }
        }
      });
      streamState.messageStartSent = true;
    }

    if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (part.thought === true && part.text) {
          if (!streamState.thinkingBlockStarted) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'thinking', thinking: '', signature: part.thoughtSignature || 'dummy' }
            });
            streamState.thinkingBlockStarted = true;
          }
          events.push({
            type: 'content_block_delta',
            index: streamState.contentBlockIndex,
            delta: { type: 'thinking_delta', thinking: part.text }
          });
        } else if (part.text) {
          if (streamState.thinkingBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.thinkingBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          if (!streamState.textBlockStarted) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'text', text: '' }
            });
            streamState.textBlockStarted = true;
          }
          events.push({
            type: 'content_block_delta',
            index: streamState.contentBlockIndex,
            delta: { type: 'text_delta', text: part.text }
          });
        } else if (part.functionCall) {
          if (streamState.textBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.textBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          events.push({
            type: 'content_block_start',
            index: streamState.contentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: `toolu_stream_${Math.random().toString(36).substr(2, 9)}`,
              name: part.functionCall.name,
              input: part.functionCall.args || {}
            }
          });
          // Note: In a real tool streaming implementation we would send delta inputs,
          // but Google sends functionCalls fully formed. So start block contains complete payload.
          events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
          streamState.contentBlockIndex++;
        }
      }
    }

    if (usage && googleResponse.candidates?.[0]?.finishReason) {
      if (streamState.textBlockStarted) {
        events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
        streamState.textBlockStarted = false;
      }
      let stopReason = 'end_turn';
      if (candidate.finishReason === 'MAX_TOKENS') {
        stopReason = 'max_tokens';
      }
      events.push({
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0) }
      });
      events.push({ type: 'message_stop' });
    }

    if (events.length === 0) return null;

    return events.map(ev => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join('');
  }

  normalizeError(error) {
    logger.error(`API Error: ${error.message}`);
    const status = error.status || 500;
    let type = 'api_error';
    if (status === 400) type = 'invalid_request_error';
    if (status === 401 || status === 403) type = 'authentication_error';
    if (status === 429) type = 'rate_limit_error';

    return {
      status,
      payload: {
        type: 'error',
        error: {
          type,
          message: error.message || 'Internal Server Error'
        }
      }
    };
  }
}

module.exports = new ClaudeTranslator();
```

- [ ] **Step 4: Run test to verify they pass**
Run: `npm test tests/claudeTranslator.test.js`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/services/claudeTranslator.js tests/claudeTranslator.test.js
git commit -m "feat: implement and unit test ClaudeToGemini request/response translator"
```

---

### Task 3: Claude Routes and Controller (Non-Streaming Interface)

Implement Claude API messages router, controller, integration with node-fetch, and standard (non-streaming) endpoint.

**Files:**
- Create: `src/routes/claudeRoutes.js`
- Create: `src/controllers/claudeController.js`
- Modify: `src/app.js` (to register `claudeRoutes`)
- Create: `tests/claudeController.test.js`

**Interfaces:**
- Consumes: `claudeTranslator` translation functions.
- Produces: API routing under `/v1/messages`.

- [ ] **Step 1: Create router file `src/routes/claudeRoutes.js`**
```javascript
const express = require('express');
const router = express.Router();
const claudeController = require('../controllers/claudeController');

router.post('/messages', claudeController.handleMessages);

module.exports = router;
```

- [ ] **Step 2: Modify `src/app.js` to register `claudeRoutes`**
```javascript
const express = require('express');
const app = express();
const claudeRoutes = require('./routes/claudeRoutes');

app.use(express.json({ limit: '50mb' }));

app.use('/v1', claudeRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = app;
```

- [ ] **Step 3: Create failing integration tests in `tests/claudeController.test.js`**
We will mock `node-fetch` calls to Gemini API to assert the integration.
```javascript
const request = require('supertest');
const app = require('../src/app');

// Mock node-fetch globally
jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation(() => {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: { parts: [{ text: 'Mock response from Gemini!' }] }
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 }
      })
    });
  });
});

describe('POST /v1/messages (Non-Streaming)', () => {
  it('successfully translates and proxies request to Gemini API', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.model).toEqual('gemini-2.5-pro');
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });
});
```

- [ ] **Step 4: Create controller file `src/controllers/claudeController.js`**
```javascript
const fetch = require('node-fetch');
const config = require('../../config/default');
const claudeTranslator = require('../services/claudeTranslator');
const logger = require('../utils/logger');

class ClaudeController {
  async handleMessages(req, res) {
    try {
      const authHeader = req.headers.authorization || '';
      const clientApiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
      const apiKey = clientApiKey || config.geminiApiKey;

      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'No Google API key provided. Set GEMINI_API_KEY env or send Bearer Authorization token.'
          }
        });
      }

      const { googleRequest, cleanModelName, isStream } = claudeTranslator.translateClaudeToGoogle(req.body);

      // We only handle non-streaming requests in this task
      if (isStream) {
        // Simple stub for stream support (will implement in Task 4)
        return res.status(501).json({ error: 'Streaming not yet implemented in this milestone.' });
      }

      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;
      logger.info(`Sending generation request to Gemini Model: ${cleanModelName}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);
      
      return res.status(200).json(translatedResponse);
    } catch (err) {
      logger.error(`Unhandled error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  async handleCountTokens(req, res) {
    res.status(501).json({ error: 'Token counting not yet implemented.' });
  }
}

module.exports = new ClaudeController();
```

- [ ] **Step 5: Run tests to verify they pass**
Run: `npm test tests/claudeController.test.js`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add src/routes/claudeRoutes.js src/controllers/claudeController.js src/app.js tests/claudeController.test.js
git commit -m "feat: implement routes and controllers for standard non-streaming requests"
```

---

### Task 4: Real-time SSE Streaming Implementation

Implement downstream streaming SSE chunks reading and upstream SSE chunks output to the client.

**Files:**
- Modify: `src/controllers/claudeController.js` (implement streaming route handler)
- Create: `tests/claudeStreaming.test.js`

**Interfaces:**
- Consumes: `claudeTranslator.translateGoogleToClaudeStream()` function to translate each SSE chunk.
- Produces: Mapped real-time Server-Sent Events output for the client.

- [ ] **Step 1: Create streaming integration test in `tests/claudeStreaming.test.js`**
Mock `node-fetch` to return a stream of SSE chunks.
```javascript
const request = require('supertest');
const app = require('../src/app');
const fetch = require('node-fetch');

jest.mock('node-fetch');

describe('POST /v1/messages (Streaming)', () => {
  it('correctly returns translated Server-Sent Events', async () => {
    // Mock SSE response stream
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
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'Tell me a story' }],
        stream: true
      });

    // Write mock SSE chunks to the stream
    const chunk1 = {
      candidates: [{
        content: { parts: [{ text: 'Once ' }] }
      }]
    };
    const chunk2 = {
      candidates: [{
        content: { parts: [{ text: 'upon a time' }] }
      }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
    };
    googleResponseChunk = chunk2;
    googleResponseChunk.candidates[0].finishReason = 'STOP';

    mockStream.push(`data: ${JSON.stringify(chunk1)}\n\n`);
    mockStream.push(`data: ${JSON.stringify(chunk2)}\n\n`);
    mockStream.push(null); // End stream

    const res = await promise;
    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('message_start');
    expect(res.text).toContain('content_block_delta');
    expect(res.text).toContain('Once ');
    expect(res.text).toContain('upon a time');
    expect(res.text).toContain('message_stop');
  });
});
```

- [ ] **Step 2: Update `handleMessages` in `src/controllers/claudeController.js` to support SSE**
Replace the simple `if (isStream)` stub in `src/controllers/claudeController.js` with the full stream translation logic:
```javascript
      // Inside handleMessages method in src/controllers/claudeController.js:
      if (isStream) {
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
        logger.info(`Starting streaming request to Gemini Model: ${cleanModelName}`);

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(googleRequest)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
          return res.status(normalized.status).json(normalized.payload);
        }

        // Set SSE streaming headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders(); // Establish stream

        const streamState = {};
        
        // Read downstream response body stream chunk by chunk
        response.body.on('data', (buffer) => {
          const text = buffer.toString('utf8');
          // Split multiple SSE chunks separated by newlines
          const lines = text.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            const translated = claudeTranslator.translateGoogleToClaudeStream(trimmed, cleanModelName, streamState);
            if (translated) {
              res.write(translated);
            }
          }
        });

        response.body.on('end', () => {
          res.end();
        });

        response.body.on('error', (err) => {
          logger.error(`Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          res.end();
        });

        return;
      }
```

- [ ] **Step 3: Run the streaming test**
Run: `npm test tests/claudeStreaming.test.js`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add src/controllers/claudeController.js tests/claudeStreaming.test.js
git commit -m "feat: implement real-time server-sent events (SSE) streaming"
```

---

### Task 5: Count Tokens Endpoint

Implement the `/v1/messages/count_tokens` route.

**Files:**
- Modify: `src/routes/claudeRoutes.js` (register count tokens endpoint)
- Modify: `src/controllers/claudeController.js` (implement count tokens handler)
- Create: `tests/claudeCountTokens.test.js`

**Interfaces:**
- Consumes: Mapped payloads from `claudeTranslator.translateClaudeToGoogle`.
- Produces: Mapped payload output for `/v1/messages/count_tokens` by proxying to Gemini's `countTokens` endpoint.

- [ ] **Step 1: Register route in `src/routes/claudeRoutes.js`**
```javascript
router.post('/messages/count_tokens', claudeController.handleCountTokens);
```

- [ ] **Step 2: Create unit/integration test in `tests/claudeCountTokens.test.js`**
```javascript
const request = require('supertest');
const app = require('../src/app');
const fetch = require('node-fetch');

jest.mock('node-fetch');

describe('POST /v1/messages/count_tokens', () => {
  it('correctly translates request and counts tokens via Gemini API', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ totalTokens: 42 })
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the answer to the ultimate question?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.input_tokens).toEqual(42);
  });
});
```

- [ ] **Step 3: Implement handler in `src/controllers/claudeController.js`**
```javascript
  // Inside ClaudeController class in src/controllers/claudeController.js:
  async handleCountTokens(req, res) {
    try {
      const authHeader = req.headers.authorization || '';
      const clientApiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
      const apiKey = clientApiKey || config.geminiApiKey;

      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'No Google API key provided. Set GEMINI_API_KEY env or send Bearer Authorization token.'
          }
        });
      }

      const { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(req.body);

      // We call countTokens endpoint instead of generateContent
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:countTokens?key=${apiKey}`;
      logger.info(`Counting tokens for Gemini Model: ${cleanModelName}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
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

- [ ] **Step 4: Run the token counting test**
Run: `npm test tests/claudeCountTokens.test.js`
Expected: PASS

- [ ] **Step 5: Run all test suites to make sure everything passes**
Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**
```bash
git add src/routes/claudeRoutes.js src/controllers/claudeController.js tests/claudeCountTokens.test.js
git commit -m "feat: implement token counting endpoint and verify with tests"
```

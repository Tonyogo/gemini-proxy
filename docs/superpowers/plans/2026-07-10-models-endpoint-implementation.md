# Claude Models Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Claude-compatible `GET /v1/models` and `GET /v1/models/:model_id` endpoints in `gemini-proxy`.

**Architecture:** Registers endpoints in the routing layer, binds controller methods to query a static supported-models list, and handles valid/invalid model responses following Anthropic's model API specs.

**Tech Stack:** Node.js, Express.js, Jest, Supertest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native or simple standard packages only (express, jest, supertest)
- **Framework:** Express.js
- **Statelessness:** Static model response, no database calls needed.

---

### Task 1: Create failing integration tests for Models Endpoint

Write full integration test suites to check models list responses, retrieve specific model info, require authentication headers, and verify standard 404 responses for non-existent model queries.

**Files:**
- Create: `tests/claudeModels.test.js`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Test specs verifying the models endpoints.

- [ ] **Step 1: Write integration tests in `tests/claudeModels.test.js`**
```javascript
const request = require('supertest');
const app = require('../src/app');

describe('GET /v1/models (Models API)', () => {
  it('denies access to GET /v1/models without API key', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.statusCode).toEqual(401);
    expect(res.body.error.type).toEqual('authentication_error');
  });

  it('successfully returns the supported static models list', async () => {
    const res = await request(app)
      .get('/v1/models')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].type).toEqual('model');
    expect(res.body.data[0].id).toBeDefined();
    expect(res.body.data[0].display_name).toBeDefined();
    expect(res.body.has_more).toEqual(false);
  });

  it('denies access to GET /v1/models/:model_id without API key', async () => {
    const res = await request(app).get('/v1/models/claude-3-5-sonnet-20241022');
    expect(res.statusCode).toEqual(401);
  });

  it('successfully retrieves a specific model detail by ID', async () => {
    const res = await request(app)
      .get('/v1/models/claude-3-5-sonnet-20241022')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toEqual('claude-3-5-sonnet-20241022');
    expect(res.body.type).toEqual('model');
    expect(res.body.display_name).toEqual('Claude 3.5 Sonnet (New)');
  });

  it('returns 404 with invalid_request_error for non-existent model ID', async () => {
    const res = await request(app)
      .get('/v1/models/claude-non-existent')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(404);
    expect(res.body.type).toEqual('error');
    expect(res.body.error.type).toEqual('invalid_request_error');
    expect(res.body.error.message).toContain("does not exist");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `npm test tests/claudeModels.test.js`
Expected: FAIL with "404 Not Found" status codes for the endpoints.

- [ ] **Step 3: Commit test scaffolding**
```bash
git add tests/claudeModels.test.js
git commit -m "test: add integration test suite for Claude models endpoints"
```

---

### Task 2: Implement Routers and Controllers for Models Endpoint

Implement routes registration, static models definition list, and handlers in controllers.

**Files:**
- Modify: `src/routes/claudeRoutes.js`
- Modify: `src/controllers/claudeController.js`

**Interfaces:**
- Consumes: Test specifications verifying input assertions.
- Produces: Dynamic routes processing HTTP GET requests under `/v1/models`.

- [ ] **Step 1: Register routes in `src/routes/claudeRoutes.js`**
Update the router file to map list models and retrieve model endpoints:
```javascript
// ... existing registrations
router.get('/models', (req, res) => claudeController.handleListModels(req, res));
router.get('/models/:model_id', (req, res) => claudeController.handleRetrieveModel(req, res));
```

- [ ] **Step 2: Add static model list and implement handlers in `src/controllers/claudeController.js`**
Add the `SUPPORTED_MODELS` static list inside `claudeController.js` (or import it if separated, keeping it inside the file is extremely clean and isolated for this task):
```javascript
// Static list of supported Claude models and their metadata properties
const SUPPORTED_MODELS = [
  {
    "type": "model",
    "id": "claude-3-5-sonnet-20241022",
    "display_name": "Claude 3.5 Sonnet (New)",
    "created_at": "2024-10-22T00:00:00Z"
  },
  {
    "type": "model",
    "id": "claude-3-5-sonnet",
    "display_name": "Claude 3.5 Sonnet",
    "created_at": "2024-06-20T00:00:00Z"
  },
  {
    "type": "model",
    "id": "claude-3-5-haiku-20241022",
    "display_name": "Claude 3.5 Haiku",
    "created_at": "2024-10-22T00:00:00Z"
  },
  {
    "type": "model",
    "id": "claude-3-5-haiku",
    "display_name": "Claude 3.5 Haiku (Standard)",
    "created_at": "2024-10-22T00:00:00Z"
  },
  {
    "type": "model",
    "id": "claude-3-opus",
    "display_name": "Claude 3 Opus",
    "created_at": "2024-03-07T00:00:00Z"
  },
  {
    "type": "model",
    "id": "claude-3-sonnet",
    "display_name": "Claude 3 Sonnet",
    "created_at": "2024-02-29T00:00:00Z"
  },
  {
    "type": "model",
    "id": "claude-3-haiku",
    "display_name": "Claude 3 Haiku",
    "created_at": "2024-03-07T00:00:00Z"
  }
];
```

Now append the controller methods `handleListModels` and `handleRetrieveModel` inside the class definition:
```javascript
  async handleListModels(req, res) {
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      return res.status(200).json({
        data: SUPPORTED_MODELS,
        has_more: false,
        first_id: SUPPORTED_MODELS[0].id,
        last_id: SUPPORTED_MODELS[SUPPORTED_MODELS.length - 1].id
      });
    } catch (err) {
      logger.error(`Unhandled list models error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  async handleRetrieveModel(req, res) {
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      const modelId = req.params.model_id;
      const model = SUPPORTED_MODELS.find(m => m.id === modelId);

      if (!model) {
        return res.status(404).json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Model '${modelId}' does not exist.`
          }
        });
      }

      return res.status(200).json(model);
    } catch (err) {
      logger.error(`Unhandled retrieve model error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
```

- [ ] **Step 3: Run the models integration tests to verify they pass**
Run: `npm test tests/claudeModels.test.js`
Expected: PASS

- [ ] **Step 4: Run all test suites to confirm total project integrity**
Run: `npm test`
Expected: ALL PASS (17/17 assertions)

- [ ] **Step 5: Commit implementation**
```bash
git add src/routes/claudeRoutes.js src/controllers/claudeController.js
git commit -m "feat: implement list and retrieve models endpoints in controller and routes"
```

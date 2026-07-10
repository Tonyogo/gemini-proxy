# Claude API Models Endpoint Design Specification

**Date:** 2026-07-10  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This specification details the design for implementing the `GET /v1/models` and `GET /v1/models/:model_id` endpoints in **gemini-proxy**. These endpoints follow the standard Anthropic Claude Models API specification, allowing clients to query supported models and retrieve their properties. The models list is static and hardcoded, matching the models mapped within the proxy.

---

## 2. Supported Models List
The proxy statically supports the following Claude models, which map directly to Gemini models:
- `claude-3-5-sonnet-20241022`
- `claude-3-5-sonnet`
- `claude-3-5-haiku-20241022`
- `claude-3-5-haiku`
- `claude-3-opus`
- `claude-3-sonnet`
- `claude-3-haiku`

---

## 3. Endpoints & Route Definitions

### 3.1. List Models
- **Endpoint:** `GET /v1/models`
- **Controller:** `claudeController.handleListModels`
- **Headers:** Requires authentication headers matching the pass-through auth specifications (e.g. `x-api-key`, `Authorization: Bearer`, or `x-goog-api-key`).
- **Response Structure (HTTP 200):**
  ```json
  {
    "data": [
      {
        "type": "model",
        "id": "claude-3-5-sonnet-20241022",
        "display_name": "Claude 3.5 Sonnet (New)",
        "created_at": "2024-10-22T00:00:00Z"
      },
      ...
    ],
    "has_more": false,
    "first_id": "claude-3-5-sonnet-20241022",
    "last_id": "claude-3-haiku"
  }
  ```

### 3.2. Retrieve Model
- **Endpoint:** `GET /v1/models/:model_id`
- **Controller:** `claudeController.handleRetrieveModel`
- **Headers:** Requires validation check on authentication headers.
- **Response Structure (HTTP 200):**
  ```json
  {
    "type": "model",
    "id": "claude-3-5-sonnet-20241022",
    "display_name": "Claude 3.5 Sonnet (New)",
    "created_at": "2024-10-22T00:00:00Z"
  }
  ```
- **Error Response (HTTP 404 - If model_id is invalid):**
  ```json
  {
    "type": "error",
    "error": {
      "type": "invalid_request_error",
      "message": "Model 'invalid-model-id' does not exist."
    }
  }
  ```

---

## 4. Key Components Modifications

### 4.1. `src/routes/claudeRoutes.js`
Register routes for list models and retrieve model endpoints:
```javascript
router.get('/models', (req, res) => claudeController.handleListModels(req, res));
router.get('/models/:model_id', (req, res) => claudeController.handleRetrieveModel(req, res));
```

### 4.2. `src/controllers/claudeController.js`
Implement:
1. `handleListModels(req, res)`: Authenticates, pulls the supported models array, and responds with the formatted Claude list payload.
2. `handleRetrieveModel(req, res)`: Authenticates, extracts `req.params.model_id`, finds the matching model in the array, and returns it. Returns 404 with standard Claude Error payload if not found.

---

## 5. Verification Plan
- **Integration Tests (`tests/claudeModels.test.js`):**
  - Verify that `GET /v1/models` returns the complete array, `has_more` field, and correct headers.
  - Verify that `GET /v1/models/:model_id` returns the specific model's metadata when querying a valid model ID.
  - Verify that `GET /v1/models/:model_id` returns 404 with `invalid_request_error` when querying an invalid model ID.
  - Verify that both endpoints require authentication headers.

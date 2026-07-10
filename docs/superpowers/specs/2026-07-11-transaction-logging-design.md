# Gemini-Proxy Transaction Logging Specification

**Date:** 2026-07-11  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the implementation of a stateless, asynchronous transaction payload logging system in **gemini-proxy**. The proxy will capture complete request-response lifecycles (original Claude request, converted Gemini request, and the final upstream response payload) and save them as individual JSON files under `data/debug/transaction_{id}.json` for debugging, inspection, and fidelity auditing.

---

## 2. Technical Architecture

### 2.1. Payload Logger Service (`src/services/payloadLogger.js`)
We will create a separate service class `PayloadLogger` to isolate filesystem operations from the HTTP routing lifecycle.
- **Location:** `src/services/payloadLogger.js`
- **Responsibilities:**
  - Verify and recursively construct the target logging directory `data/debug/` on start.
  - Expose an asynchronous, non-blocking function `saveTransaction(transactionId, clientReq, gemReq, gemRes)`.
  - Format the payloads into a standardized transaction layout and write the pretty-printed JSON file.

### 2.2. Standardized Transaction Layout
```json
{
  "client_req": {
    "model": "claude-3-5-sonnet",
    "messages": [ ... ]
  },
  "gem_req": {
    "contents": [ ... ]
  },
  "gem_res": {
    "candidates": [ ... ],
    "usageMetadata": { ... }
  }
}
```

---

## 3. Integration & Stream Accumulation Pipeline

### 3.1. Unique Transaction ID Generation
At the start of `handleMessages` and `handleCountTokens`, we will generate a unique ID:
```javascript
const transactionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

### 3.2. Non-Streaming Logging Flow (Messages & CountTokens)
1. Capture `req.body` as `clientReq`.
2. Capture the translated `googleRequest` as `gemReq`.
3. Capture the returned raw Gemini API JSON response as `gemRes`.
4. Asynchronously invoke `payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemRes)`.

### 3.3. Streaming (SSE) Logging Flow
Since streaming yields multiple chunks sequentially, we cannot capture a single response object at once.
1. Initialize an accumulation buffer array `gemResChunks = []` at stream start.
2. In the `'data'` data-receiving hook, whenever we parse a downstream Gemini chunk, push the parsed JSON object to `gemResChunks`.
3. In the `'end'` stream termination hook, call `payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks)`.

---

## 4. Verification Plan
- **Integration Tests (`tests/claudeLogging.test.js`):**
  - Verify that sending a standard request triggers the creation of a `transaction_{id}.json` file inside `data/debug`.
  - Verify that the written file contains correct `client_req`, `gem_req`, and `gem_res` properties matching the query payloads.
  - Verify that sending a streaming (SSE) request correctly aggregates and logs all streaming response chunks inside the final `gem_res` list.
- **Full suite regression check:** Run `npm test` to verify all 22 existing assertions remain 100% successful.

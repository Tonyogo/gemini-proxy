# Gemini-Proxy High-Fidelity Transaction Logging Specification

**Date:** 2026-07-12  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the corrections for the logging lifecycle inside **gemini-proxy**. During debugging, we found that the logged request (`client_req`) was mutated by references during translation, and the final response returned to the client in **Claude format** (`claude_res`) was omitted. This specification ensures a high-fidelity, complete 4-key payload tracking contract.

---

## 2. Root Cause Analysis
1. **Reference Mutation:** In Javascript, assigning `clientReq = req.body` copies by reference. Subsequent translation calls mutably altered properties of the request, leading to mutated logged request data.
2. **Missing Outbound Logs:** We saved `gem_res` (the raw Gemini response) but did not write `claude_res` (the mapped Claude response actually sent back to the client), making it difficult to audit translator accuracy.

---

## 3. Core Modifications

### 3.1. Deep Cloning
We will deep-clone the original request body immediately upon handler entry to prevent downstream mutation:
```typescript
const clientReq = JSON.parse(JSON.stringify(req.body));
```

### 3.2. 4-Key Log Schema
We update `PayloadLogger.saveTransaction` to log 4 core keys:
```json
{
  "client_req": { ... },
  "gem_req": { ... },
  "gem_res": { ... },
  "claude_res": { ... }
}
```

### 3.3. Outbound Claude Response Interception
- **Non-Streaming Generation:** Capture the fully formed `translatedResponse` object and pass it as the 5th argument `claudeRes`.
- **Streaming (SSE) Generation:** Maintain an array buffer `claudeResChunks: string[] = []`. Whenever a translated SSE string is generated, push it. Upon stream end, save the collected array.

---

## 4. Verification Plan
- **Integration Tests (`tests/claudeLogging.test.ts`):**
  - Verify that the generated log contains `claude_res` matching the expected response data.
  - Verify that `client_req` contains the true, unmodified original body.
- **Full suite regression check:** Run `npm test` to ensure total project integrity.

# Design Spec: Fix Gemini countTokens Request Payload Structure

**Date**: 2026-07-28  
**Topic**: Wrap Gemini countTokens request in generateContentRequest structure  
**Status**: Approved

## Problem Statement
When client applications call `/v1/messages/count_tokens`, the proxy translates the request via `claudeTranslator.translateClaudeToGoogle` and posts the `googleRequest` object directly to Gemini's `/v1beta/models/{model}:countTokens` endpoint. 

Gemini API expects the request payload for `:countTokens` to be wrapped inside a `generateContentRequest` root property:
```json
{
  "generateContentRequest": {
    "contents": [...],
    "systemInstruction": {...},
    "tools": [...]
  }
}
```
Directly posting `{ contents: [...] }` causes Gemini upstream to respond with HTTP 400 `INVALID_ARGUMENT`.

## Solution Design

### 1. Controller Modification (`src/controllers/claudeController.ts`)
In `handleCountTokens`:
- Deep clone / format `googleRequest` produced by `claudeTranslator.translateClaudeToGoogle(clientReq)`.
- If `googleRequest.generationConfig` exists, remove `maxOutputTokens` as output limits do not apply to input token count.
- Wrap `googleRequest` into a `countTokensPayload` object:
  ```typescript
  const countTokensPayload = {
    generateContentRequest: googleRequest
  };
  ```
- Pass `JSON.stringify(countTokensPayload)` in the `fetch` request body to Gemini.
- Record `countTokensPayload` as `gemReq` in `payloadLogger.saveTransaction`.

### 2. Testing Updates (`tests/claudeCountTokens.test.ts`)
- Update mock assertions to verify that `fetch` body contains `generateContentRequest`.
- Verify `input_tokens` is extracted accurately from Gemini's response (`totalTokens`).

## Impacted Files
- `src/controllers/claudeController.ts`
- `tests/claudeCountTokens.test.ts`

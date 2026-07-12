# Tool Use Empty Text Prefix Bugfix Specification

**Date:** 2026-07-12  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the corrections for the `tool_use` event output from Gemini proxy. Several Claude SDKs and chat UI clients experience crashes or fail to invoke tool chains if the model response does not contain at least one leading `text` content block before a `tool_use` block. Because Gemini natively emits `functionCall` arrays devoid of text when it chooses to trigger a tool, this fix introduces an invisible bridging block (empty text) to ensure 100% protocol compliance.

---

## 2. Root Cause Analysis
- **Claude Protocol Expectation:** Anthropic models typically provide chain-of-thought text (e.g. "I will call the weather tool now") prior to emitting a JSON `tool_use` command. Clients rigidly expect `content[0]` to be a `type: "text"`.
- **Gemini Engine Reality:** Gemini routinely responds with raw `functionCall` JSON immediately, skipping any preceding message blocks. Our proxy faithfully transformed this into `content: [{ type: 'tool_use' }]`, which violated the implicit Claude client assumption.

---

## 3. Structural Modifications

### 3.1. Non-Streaming Translation
Inside `src/services/claudeTranslator.ts` -> `convertGoogleToClaudeNonStream`:
Whenever `part.functionCall` is parsed, the proxy will examine the output `content` buffer. If the buffer is completely empty (`content.length === 0`), it will prepend a blank text object:
```typescript
{ type: 'text', text: '' }
```
This guarantees the output is structured as:
```json
{
  "content": [
    { "type": "text", "text": "" },
    { "type": "tool_use", "name": "...", "input": {...} }
  ]
}
```

### 3.2. Streaming Translation
Inside `src/services/claudeTranslator.ts` -> `translateGoogleToClaudeStream`:
A new tracking flag `hasEmittedText` will be added to the persistent `streamState`. 
- When `part.text` or `part.thought` occurs, `streamState.hasEmittedText = true` is marked.
- When `part.functionCall` is triggered, if `streamState.hasEmittedText` is falsy, the proxy will immediately synthesize and emit three Server-Sent Events (SSE) before the tool block:
  1. `content_block_start` (type: text)
  2. `content_block_stop`
  This increments the `contentBlockIndex` so the `tool_use` correctly occupies index 1.

---

## 4. Verification Plan
- **Unit Tests (`tests/claudeTranslator.test.ts`):**
  - Verify that a Gemini payload containing only a `functionCall` without text translates to a Non-Stream Claude payload starting with an empty text block.
  - Verify that a Gemini streaming payload containing only a `functionCall` translates to an SSE stream containing a synthetic text `content_block_start` and `content_block_stop` before the `tool_use` event.
- **Full suite regression check:** Run `npm test` to ensure existing mapping logics are unbroken.

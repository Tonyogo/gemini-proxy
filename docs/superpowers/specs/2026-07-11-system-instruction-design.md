# Gemini-Proxy SystemInstruction Format Specification

**Date:** 2026-07-11  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the corrections for the `systemInstruction` (system prompts) data structure within `gemini-proxy`. During testing, raw requests with system prompts resulted in downstream Gemini API errors due to mismatched REST structures and the pollution of conversation rolls inside the `contents` list. This specification ensures 100% compliance with Google AI Studio's API.

---

## 2. Root Cause Analysis
1. **Role Key Mismatch:** Gemini's API expects the `systemInstruction` object to have `{ parts: [...], role: "user" }` in the REST payload. The previous proxy implementation omitted `role`, or left it as `role: "system"`, resulting in a validation error.
2. **Conversation Flow Pollution:** Under the Claude API specification, system prompts are allowed to be sent inside the `messages` list with a `role: "system"` property. Previously, our translation code did not strip these system messages, pushing them into the conversational `contents` array with a `role: "user"` or `role: "model"` mapping, resulting in downstream Gemini schema validation errors.

---

## 3. Corrected Mapping Design

### 3.1. System Instructions Aggregation helper
We will implement an aggregation helper in `src/services/claudeTranslator.js` called `appendSystemContent`:
1. Parse system content inputs of both string type and block-array structures.
2. Build a merged system prompt string.
3. Build the valid `systemInstruction` object structured exactly as:
   ```json
   {
     "parts": [
       {
         "text": "Merged system prompt instructions here"
       }
     ],
     "role": "user"
   }
   ```

### 3.2. Extraction Pipeline
1. Apply `appendSystemContent` to the top-level `claudeBody.system` (if present).
2. Scan `claudeBody.messages`. For each message:
   - If `role === "system"`, extract its content and run it through `appendSystemContent`.
   - Skip adding this message to the conversational `contents` list entirely, preventing conversation pollution.

---

## 4. Verification Plan
- **Unit Tests (`tests/claudeTranslator.test.js`):**
  - Verify that `systemInstruction` includes `role: "user"` in the returned Google request body.
  - Verify that system messages sent inside `claudeBody.messages` (e.g. `messages: [{ role: "system", content: "System text" }]`) are successfully extracted into `systemInstruction.parts[0].text` and **excluded/stripped** from `googleRequest.contents`.
  - Verify that multiple system prompts (top-level `system` and message `"system"` roles) are merged correctly with a newline separator.
- **Full suite regression check:** Run `npm test` to ensure all 18 assertions continue to pass successfully.

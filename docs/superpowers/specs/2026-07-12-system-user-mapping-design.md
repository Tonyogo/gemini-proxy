# System-Role to User Wrapping Protocol Specification

**Date:** 2026-07-12  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the corrections for translating the `"role": "system"` messages located within the conversational `messages` array in **gemini-proxy**. Previously, our mapping pipeline absorbed all mid-conversation system messages into the top-level `systemInstruction` payload. This resulted in chronological context displacement for agents that dynamically insert instructions (such as CLI stdout or context updates) between message turns. This specification introduces sequential, tagged user mapping to preserve dialogue chronological integrity.

---

## 2. Root Cause Analysis
- **Top-level Coalescing Issues:** Compiling all system-role prompts to the top-level `systemInstruction` strips away the exact conversational checkpoint at which those directives were issued.
- **REST Array Constraints:** Gemini REST payload structure strictly requires that the `contents` list contains alternating `"user"` and `"model"` roles. Any `"system"` role inside the list results in a validation reject.
- **XML Tag Encapsulation:** Following Anthropic's prompt engineering standards (demonstrated in `log/demo.json`), mid-conversation instructions must be isolated inside `<system-directive>` XML tags to let the model cleanly differentiate system updates from user prompts.

---

## 3. Corrected Mapping Design

### 3.1. Dual-Channel Pipeline (Hybrid Approach)
- **基座层 (基准人设)**: The top-level `claudeBody.system` is retained and translated exclusively into Gemini's official `systemInstruction` config block, maintaining structural人设 focus.
- **时序层 (上下文时序)**: Any message inside `claudeBody.messages` where `role === "system"` is converted into a standard `"role": "user"` conversational part, with its content wrapped inside `<system-directive>` tags.

### 3.2. Content-Block Wrapping Rules
The system prompt wrapping helper will handle both string structures and complex content-block arrays:
- **String Content:**
  ```text
  <system-directive>
  [System content text here]
  </system-directive>
  ```
- **Array Blocks (Claude Multi-modal structure):** Each text component is wrapped in `<system-directive>` tags, while non-text elements (e.g. inline images) are passed through un-mutated.

---

## 4. Verification Plan
- **Unit Tests (`tests/claudeTranslator.test.ts`):**
  - Verify that a message with `role: "system"` inside `messages` is successfully translated as `{ role: "user" }` (role `"user"` inside Gemini `contents`).
  - Verify that the translated system-role content is wrapped with `<system-directive>\n` and `\n</system-directive>`.
  - Verify that the top-level `claudeBody.system` is kept in `systemInstruction` and *not* wrapped in user XML tags.
- **Full suite regression check:** Run `npm test` to ensure that all 25 assertions continue to pass successfully.

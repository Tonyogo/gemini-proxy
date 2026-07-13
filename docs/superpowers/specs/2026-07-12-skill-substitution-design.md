# Skill Tool Result Substitution Specification

**Date:** 2026-07-12  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the corrections for the `Skill` tool result parameters mapping within `gemini-proxy`. During testing with complex multi-turn skill-invoking dialogues, we found that returning standard `Skill` tool placeholders (e.g. `"Launching skill: superpowers:using-superpowers"`) followed by large disjoint `text` blocks containing up-to-date skill guide instructions confused Gemini's context parser, frequently causing the engine to respond with empty `""` tokens or early NATURAL_STOP states. This specification introduces content-level substitution to resolve the issue.

---

## 2. Root Cause Analysis
1. **Disjoint Instructions:** When a skill is loaded, the proxy receives a `tool_result` (with "Launching skill: ...") and a subsequent, massive `text` block containing instructions. This forces the model to digest an uninformative function result followed by an unexpected instruction block, lowering model attention and cognitive compliance.
2. **REST Validation Integrity:** Instead of emitting these as two separate parts inside a user-role contents element, the instruction payload must be encapsulated *directly* within the `functionResponse` body of the tool invocation itself, making the instruction appear as the high-value returned dataset of the `Skill` function.

---

## 3. Tool Result Substitution Design

### 3.1. Lookahead Analysis Pipeline
During the messages contents block processing inside `claudeTranslator.ts` -> `translateClaudeToGoogle`:
Whenever a block of `type === "tool_result"` is evaluated:
1. Look up its mapped function name.
2. If the name is `"Skill"` or ends with `":Skill"`:
   - Check if the subsequent sibling block at `i + 1` exists and is of `type === "text"`.
   - If true, execute **content substitution**:
     - Assign `nextBlock.text` as the `response.content` of the `functionResponse` part.
     - Prune / skip the sibling `text` block so it is not emitted as a separate part element.

### 3.2. Target REST Object Mapped Schema
```json
{
  "functionResponse": {
    "name": "Skill",
    "response": {
      "content": "Base directory for this skill: /Users/yogo/... [Complete skill guide text directly here]"
    }
  }
}
```

---

## 4. Verification Plan
- **Unit Tests (`tests/claudeTranslator.test.ts`):**
  - Verify that a `tool_result` corresponding to `"Skill"` followed by a `text` block successfully merges the text content directly inside `functionResponse.response.content`.
  - Verify that the redundant `text` block is stripped and *not* output as a separate part element in the final `contents` bubble.
- **Full suite regression check:** Run `npm test` to ensure that all 25 assertions continue to pass successfully.

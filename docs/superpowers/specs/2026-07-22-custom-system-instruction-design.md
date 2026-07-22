# Design Spec: Custom System Instruction Injection for Protocol Parity

**Date:** 2026-07-22  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

During API translation from Anthropic Claude Messages API to Google Gemini API, certain structural differences exist in model capabilities, tool calling behaviors, and formatting constraints. Injecting a customizable system instruction (`system_instruction`) at the proxy level allows operators to supplement protocol conversion, enforcing rules and behaviors across all requests without altering client-side prompts.

The goal is to:
1. Add support for a configurable environment variable `CUSTOM_SYSTEM_INSTRUCTION` in `config/default.ts` and document it in `.env.example`.
2. Inject `config.customSystemInstruction` into Gemini's `systemInstruction` field inside `ClaudeTranslator.translateClaudeToGoogle`.
3. Ensure it seamlessly combines with any client-supplied `system` prompt while guaranteeing presence even when the client passes no system prompt.

## 2. Architecture & Data Flow

```
Client Request { system: "Client System Prompt" }
                        │
                        ▼
       +---------------------------------+
       |        ClaudeTranslator         |
       |  Reads config.customSystemInstruction
       +---------------------------------+
                        │
                        ▼
Build systemInstruction:
`
${customSystemInstruction}
${clientSystemPrompt}
`
                        │
                        ▼
Proxied Gemini Request { systemInstruction: { parts: [{ text: "..." }], role: "user" } }
```

### 2.1 Configuration Schema (`config/default.ts`)
* Add `customSystemInstruction`:
  ```typescript
  customSystemInstruction: process.env.CUSTOM_SYSTEM_INSTRUCTION || ''
  ```

### 2.2 Translation Layer Integration (`src/services/claudeTranslator.ts`)
* In `translateClaudeToGoogle`:
  ```typescript
  if (config.customSystemInstruction) {
    appendSystemContent(config.customSystemInstruction);
  }

  if (claudeBody.system) {
    appendSystemContent(claudeBody.system);
  }
  ```

## 3. Testing Strategy
* Write a unit test suite in `tests/claudeTranslator.test.ts` verifying that:
  1. `config.customSystemInstruction` is injected into `systemInstruction` when client passes no system prompt.
  2. `config.customSystemInstruction` is prepended before client-supplied system prompts when client passes a system prompt.
  3. No empty `systemInstruction` is generated when both are empty.

# Design Spec: Tool Parameter Type Coercion for Claude Proxy

**Date:** 2026-07-20  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

In standard tool-use workflows, Anthropic's Claude expects tool arguments to strictly adhere to the types declared in their JSON schema definitions. However, Google Gemini's tool invocation response sometimes returns values whose types do not strictly align with the client's declared parameter types (e.g., returning numeric `25` instead of expected string `"25"` for standard tool parameters like task IDs). This type mismatch causes downstream tooling, such as Claude Code, to crash or reject the tool call.

The goal is to design a stateless, schema-driven coercion layer within our translation service (`src/services/claudeTranslator.ts`) that intercepts Gemini's `functionCall` parameters and dynamically coerces them to match the exact types specified by the client in their request.

## 2. Architecture & Coercion Flow

```
                      +-----------------------------+
                      |       Client Request        |
                      +--------------+--------------+
                                     |
                                     v [Extract tools array]
+-------------------+  Tools Schema  +------------------------------+
| ClaudeController  +--------------> |      claudeTranslator        |
+---------+---------+                +--------------+---------------+
          |                                         |
          | Upstream Response                       | Coerce arguments to
          v                                         | match tools schema
+---------+---------+                +--------------+---------------+
|   Gemini Response +--------------> |       _coerceArguments()     |
+-------------------+                +--------------+---------------+
                                                    |
                                                    v
                                     +--------------+---------------+
                                     |  Claude-Compliant Tool Use   |
                                     +------------------------------+
```

### 2.1 Schema-Driven Type Coercion Utility
We will implement a public helper method `_coerceArguments(toolName: string, args: Record<string, any>, tools?: any[])` within `ClaudeTranslator`:
* Find the original client-provided tool definition inside the `tools` array matching `toolName`.
* Read the expected parameter schema types under `input_schema.properties[propName].type`.
* Check if Gemini returned a parameter mismatch and perform **safe type coercion**:
  * **Expected `string`**, but got `number`/`boolean` ➔ coerce to `String(value)`.
  * **Expected `number`/`integer`**, but got `string` ➔ coerce to `Number(value)` (if numeric).
  * **Expected `boolean`**, but got `string`/`number` ➔ coerce to `boolean` (`"true"` ➔ `true`, `"false"` ➔ `false`, `1` ➔ `true`, `0` ➔ `false`).

### 2.2 Controller Interception (Non-Streaming & Streaming)
* **Non-Streaming (`convertGoogleToClaudeNonStream`)**: We will pass `clientReq.tools` directly to the conversion method.
* **Streaming (`translateGoogleToClaudeStream`)**: We will initialize the persistent stream state with the tools array: `const streamState = { tools: clientReq.tools }`. The stream translator will extract `streamState.tools` to coerce stream-based tool calls.

## 3. Testing Strategy
* Write a dedicated unit test suite in `tests/claudeTranslator.test.ts` verifying that:
  1. Numbers are coerced to strings when a string is expected.
  2. Numeric strings are coerced to numbers when a number is expected.
  3. String booleans or binary values are coerced to actual booleans when a boolean is expected.
  4. Non-matching fields are safely left alone if no schema is provided or the property does not exist in schema.

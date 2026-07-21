# Design Spec: Model Name Mapping and Fallback Configuration

**Date:** 2026-07-20  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

In standard proxy routing, request payloads are translated directly to the requested upstream model. However, high-tier models (such as Pro models) may occasionally experience rate limiting, quota exhaustion, or service outages. In such cases, we want to support transparent **declarative model name mapping** (aliasing/fallback). This allows client requests targeting a high-tier model like `gemini-pro-latest` to be seamlessly redirected/downgraded to a high-availability fallback model like `gemini-flash-latest` at translation time without requiring code changes.

The goal is to:
1. Support a JSON-based environment variable configuration `MODEL_MAPPINGS` or default map in `config/default.ts` declaring requested-to-target model mappings.
2. Initialize `ClaudeTranslator`'s model mappings to dynamically register and resolve these aliases.
3. Verify that requests using aliases resolve to the mapped model name, and responses return referencing the mapped model.

## 2. Architecture & Config Schema

```
Client Requests "gemini-pro-latest"
                 |
                 v
     +-----------+-----------+
     |   ClaudeTranslator    | <--- Reads config.modelMappings
     |                       |      (Resolves alias -> "gemini-flash-latest")
     +-----------+-----------+
                 |
                 v
Proxies POST to /v1beta/models/gemini-flash-latest:generateContent
```

### 2.1 Configuration Schema (`config/default.ts`)
* Introduce a `modelMappings` property containing a key-value record of model mappings:
  ```typescript
  modelMappings: Record<string, string>;
  ```
* Parse `process.env.MODEL_MAPPINGS` (e.g. `'{"gemini-pro-latest":"gemini-flash-latest"}'`) if provided, falling back to `{ 'gemini-pro-latest': 'gemini-flash-latest' }` by default.

### 2.2 Translation Layer Integration (`src/services/claudeTranslator.ts`)
* In the `ClaudeTranslator` constructor, after loading standard models from `models.json`, iterate through `config.modelMappings` and register them in `this.modelMapping`.
* When `translateClaudeToGoogle` is called with a requested model alias (e.g., `gemini-pro-latest`), it resolves directly to the mapped target model (e.g., `gemini-flash-latest`), and sets `cleanModelName = "gemini-flash-latest"`.

## 3. Testing Strategy
* Write a dedicated unit test suite in `tests/claudeTranslator.test.ts` verifying that:
  1. Configured aliases correctly map to their target models.
  2. Multiple custom model mappings can be registered and resolved seamlessly.
  3. The proxy URL is correctly built using the resolved model name.

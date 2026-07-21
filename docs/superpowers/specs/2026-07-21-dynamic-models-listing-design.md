# Design Spec: Dynamic Models Listing and Soft Pass-through

**Date:** 2026-07-21  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

In the current architecture, supported models are loaded statically from a local JSON configuration file `config/models.json`. This introduces an ongoing maintenance overhead (as new Gemini models are launched frequently) and locks the proxy's `/v1/models` and translation capabilities to a hardcoded list.

The goal is to transition to a **fully dynamic, maintenance-free, soft pass-through** model translation architecture:
1. **Remove `config/models.json` completely.**
2. **Implement Soft Pass-through:** If a model requested by the client is configured in local mappings, use the mapped alias target. Otherwise, pass the raw requested model name directly through to Gemini.
3. **Dynamic Models Listing:** In `/v1/models` and `/v1/models/:model_id` endpoints, query the upstream Google Gemini API dynamically using the request's API Key. Parse, filter (for `generateContent` capabilities), map on-the-fly to Claude formats, and return the response.

## 2. Architecture & Data Flow

```
1. Model Query Route (/v1/models)
Client (with API Key) ➔ GET /v1/models
                         │
                         ├─► Proxies request dynamically to:
                         │   GET https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}
                         │
                         └─► Maps Gemini list on-the-fly and returns back.

2. Model Translation Route (/v1/messages)
Client ➔ POST /v1/messages { model: "gemini-x" }
                         │
                         ├─► Checks local modelMappings first.
                         ├─► If mapped, uses alias. Otherwise soft passes "gemini-x" as target.
                         └─► Proxies request directly upstream.
```

### 2.1 ClaudeTranslator (`src/services/claudeTranslator.ts`)
* Remove references and imports of `config/models.json`.
* In `constructor`, initialize `this.modelMapping` map using only declarative mappings from `config.modelMappings`.
* In `translateClaudeToGoogle`, resolve requested model:
  ```typescript
  let cleanModelName = this.modelMapping.get(rawModel);
  if (!cleanModelName) {
    cleanModelName = rawModel.replace(/^models\//, '');
  }
  ```
  *(Removes local 404 throwing for unlisted models, allowing full soft pass-through).*

### 2.2 ClaudeController (`src/controllers/claudeController.ts`)
* Remove references and imports of `config/models.json` and static `SUPPORTED_MODELS` calculation.
* In `handleListModels`, use `fetch` to request Gemini's dynamic `/v1beta/models` endpoint. Map results to Claude model schema structure dynamically and return.
* In `handleRetrieveModel`, use `fetch` to request Gemini's dynamic `/v1beta/models/${model_id}` endpoint. Return mapped model metadata.

## 3. Testing Strategy
* Update `tests/claudeModels.test.ts` to mock the upstream dynamic Google models list & retrieve fetch payloads.
* Remove the local 404 translation lookup test in `tests/claudeTranslator.test.ts`.
* Verify that all 8 test suites pass perfectly.

# Dynamic Models Listing and Soft Pass-through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transition to a completely dynamic, maintenance-free, soft pass-through models architecture by deleting `config/models.json`, converting `/v1/models` and `/v1/models/:model_id` to fetch dynamically from Gemini, and allowing soft model pass-through inside translator.

**Architecture:** Refactor `ClaudeTranslator` and `ClaudeController` to remove static JSON model list, implement dynamic Gemini models proxy endpoints, and rewrite integration tests with fetch mock handlers.

**Tech Stack:** TypeScript, Express, node-fetch, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Clean Up Translator and Controller Models Import

**Files:**
- Modify: `src/services/claudeTranslator.ts`
- Modify: `src/controllers/claudeController.ts`
- Delete: `config/models.json`

**Interfaces:**
- Consumes: `config.modelMappings` from `config/default`
- Produces: Soft pass-through in `ClaudeTranslator.translateClaudeToGoogle`.

- [ ] **Step 1: Delete `config/models.json`**

Delete the file `config/models.json` from workspace.

- [ ] **Step 2: Update `src/services/claudeTranslator.ts` to implement Soft Pass-through**

Read `src/services/claudeTranslator.ts` and refactor:
1. Remove `import modelsList from '../../config/models.json';`.
2. Update the `constructor` to only register configured model mappings:
   ```typescript
     constructor() {
       this.modelMapping = new Map<string, string>();
       // Apply declarative model mappings from configuration
       if (config.modelMappings && typeof config.modelMappings === 'object') {
         for (const [alias, target] of Object.entries(config.modelMappings)) {
           this.modelMapping.set(alias, target);
           logger.info(`[Translator] [Model Mapping Registered] Alias '${alias}' mapped to target model '${target}'`);
         }
       }
     }
   ```
3. Update `translateClaudeToGoogle`'s model resolution:
   Replace:
   ```typescript
       const cleanModelName = this.modelMapping.get(rawModel);
       if (!cleanModelName) {
         throw { status: 404, message: `Model '${rawModel}' is not supported or not found in configured models.` };
       }
   ```
   With:
   ```typescript
       let cleanModelName = this.modelMapping.get(rawModel);
       if (!cleanModelName) {
         cleanModelName = rawModel.replace(/^models\//, '');
       }
   ```

- [ ] **Step 3: Update `src/controllers/claudeController.ts` to remove static `SUPPORTED_MODELS` list**

Read `src/controllers/claudeController.ts` and refactor:
1. Remove `import modelsList from '../../config/models.json';`.
2. Remove the static `SUPPORTED_MODELS` block (lines 11-21).
3. Ensure no static model validation remains.

- [ ] **Step 4: Run build to verify compilation**

Run: `npm run build`  
Expected: Succeeded. (If compilation failures occur, we will address them in Task 2).

---

### Task 2: Implement Dynamic Upstream Models Querying in ClaudeController

**Files:**
- Modify: `src/controllers/claudeController.ts`

**Interfaces:**
- Produces: Dynamic `handleListModels` and `handleRetrieveModel` endpoints fetching from Gemini with request API keys.

- [ ] **Step 1: Rewrite `handleListModels` endpoint in `src/controllers/claudeController.ts`**

Implement `handleListModels` to dynamically query Google's models endpoint and map the results on the fly:

```typescript
  public async handleListModels(req: Request, res: Response): Promise<any> {
    const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
    logger.info(`[Request] Received models list query: ${clientEndpoint}`);
    try {
      const apiKey = extractClientKey(req);
      if (!apiKey) {
        logger.warn(`[Authentication Error] Models list request rejected: API Key is missing.`);
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      const targetUrl = getUpstreamUrl(`/v1beta/models?key=${apiKey}`);
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json() as GeminiModelsResponse;
      
      const dynamicModels: ModelConfig[] = (geminiData.models || [])
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => {
          const id = m.name.replace(/^models\//, '');
          return {
            type: 'model' as const,
            id: id,
            display_name: m.displayName || id,
            created_at: '2026-07-18T00:00:00Z'
          };
        });

      logger.info(`[Response] Models list query finished successfully: Returning ${dynamicModels.length} dynamic models from Gemini`);
      return res.status(200).json({
        data: dynamicModels,
        has_more: false,
        first_id: dynamicModels.length > 0 ? dynamicModels[0].id : '',
        last_id: dynamicModels.length > 0 ? dynamicModels[dynamicModels.length - 1].id : ''
      });
    } catch (err: any) {
      logger.error(`[Error] Unhandled list models error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
```

- [ ] **Step 2: Rewrite `handleRetrieveModel` endpoint in `src/controllers/claudeController.ts`**

Implement `handleRetrieveModel` to dynamically fetch individual model metadata from Google:

```typescript
  public async handleRetrieveModel(req: Request, res: Response): Promise<any> {
    const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
    const modelId = req.params.model_id;
    logger.info(`[Request] Received specific model metadata query: ${clientEndpoint} for ID: '${modelId}'`);
    try {
      const apiKey = extractClientKey(req);
      if (!apiKey) {
        logger.warn(`[Authentication Error] Retrieve model metadata request rejected: API Key is missing.`);
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      // Check if it's an alias configured locally first
      let resolvedModelId = claudeTranslator.modelMapping.get(modelId) || modelId;

      const targetUrl = getUpstreamUrl(`/v1beta/models/${resolvedModelId}?key=${apiKey}`);
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        logger.warn(`[Retrieve Model Error] Requested model '${resolvedModelId}' does not exist or fetch failed`);
        return res.status(404).json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Model '${modelId}' does not exist.`
          }
        });
      }

      const m = await response.json() as GeminiModelEntry;
      const cleanId = m.name.replace(/^models\//, '');
      const mappedModel: ModelConfig = {
        type: 'model',
        id: cleanId,
        display_name: m.displayName || cleanId,
        created_at: '2026-07-18T00:00:00Z'
      };

      logger.info(`[Response] Retrieve model metadata finished: Returning specs for '${modelId}'`);
      return res.status(200).json(mappedModel);
    } catch (err: any) {
      logger.error(`Unhandled retrieve model error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
```

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Succeeded.

---

### Task 3: Update and Refactor Integration Tests

**Files:**
- Modify: `tests/claudeModels.test.ts`
- Modify: `tests/claudeTranslator.test.ts`

- [ ] **Step 1: Rewrite `tests/claudeModels.test.ts` to mock upstream fetch payloads**

Replace the entire content of `tests/claudeModels.test.ts` with the mock-based implementation detailed in Section 2's design document.

- [ ] **Step 2: Clean up model validation tests inside `tests/claudeTranslator.test.ts`**

Read `tests/claudeTranslator.test.ts`. Delete the test block:
`throws a 404 error when requested model is not found in configured models` (lines 11-17), because we are using Soft Pass-through and don't locally validate unlisted model IDs.

Also update basic testing assertions inside other tests if they relied on static validation.

- [ ] **Step 3: Run all Jest unit tests**

Run: `npm test`  
Expected: All tests pass perfectly.

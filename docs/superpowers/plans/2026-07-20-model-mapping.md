# Model Name Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement declarative model name mapping (aliasing) configured via `config/default.ts` or `process.env.MODEL_MAPPINGS` JSON string, allowing high-availability fallback of requests (e.g. `gemini-pro-latest` mapping to `gemini-flash-latest`).

**Architecture:** Extend config definitions to parse and register mappings, update `ClaudeTranslator` initialization, and add assertion unit tests.

**Tech Stack:** TypeScript, Express, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Add Model Mapping to Configuration

**Files:**
- Modify: `config/default.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `process.env.MODEL_MAPPINGS`
- Produces: `config.modelMappings: Record<string, string>`

- [ ] **Step 1: Edit `config/default.ts` to parse model mappings**

Read `config/default.ts` and add `modelMappings` parsing:

```typescript
import * as dotenv from 'dotenv';
dotenv.config();

// Parse model mapping env var if provided, or default to standard fallback mappings
let parsedModelMappings: Record<string, string> = {
  'gemini-pro-latest': 'gemini-flash-latest' // Default fallback mapping
};

if (process.env.MODEL_MAPPINGS) {
  try {
    parsedModelMappings = JSON.parse(process.env.MODEL_MAPPINGS);
  } catch (err) {
    // Falls back to defaults if parsing fails
  }
}

export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  logLevel: process.env.LOG_LEVEL || 'info',
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  modelMappings: parsedModelMappings,
  allowedKeys: [] as string[]
};

export default config;
// ts-lint: ignore
```

- [ ] **Step 2: Append explanation and mapping format inside `.env.example`**

Read `.env.example` and append the `MODEL_MAPPINGS` documentation:

```properties
# 声明式模型名称映射 (JSON 格式字典)。用于将某些负载较高或不稳定的模型请求，重定向/降级到备用模型上。
# 例如: 将 gemini-pro-latest 的调用重定向到 mid-size 降级模型 gemini-flash-latest
# 默认值: {"gemini-pro-latest":"gemini-flash-latest"}
MODEL_MAPPINGS={"gemini-pro-latest":"gemini-flash-latest"}
```

- [ ] **Step 3: Run build to verify compilation**

Run: `npm run build`  
Expected: Succeeded.

---

### Task 2: Update ClaudeTranslator Constructor to Register Mappings

**Files:**
- Modify: `src/services/claudeTranslator.ts`

**Interfaces:**
- Consumes: `config.modelMappings`
- Produces: Updates `this.modelMapping` map on translator instantiation.

- [ ] **Step 1: Edit `src/services/claudeTranslator.ts` to register mapped models**

Read `src/services/claudeTranslator.ts` and update the constructor:

```typescript
  constructor() {
    this.modelMapping = new Map<string, string>();
    const response = modelsList as GeminiModelsResponse;
    if (response && Array.isArray(response.models)) {
      for (const model of response.models) {
        if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
          const cleanName = model.name.replace(/^models\//, '');
          this.modelMapping.set(cleanName, cleanName);
        }
      }
    }

    // Apply declarative model mappings from configuration
    if (config.modelMappings && typeof config.modelMappings === 'object') {
      for (const [alias, target] of Object.entries(config.modelMappings)) {
        this.modelMapping.set(alias, target);
        logger.info(`[Translator] [Model Mapping Registered] Alias '${alias}' mapped to target model '${target}'`);
      }
    }
  }
```

- [ ] **Step 2: Run build to ensure zero compile warnings**

Run: `npm run build`  
Expected: Succeeded.

---

### Task 3: Add Unit Tests and Validate

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

- [ ] **Step 1: Add a test suite verifying model mapping resolution inside `tests/claudeTranslator.test.ts`**

Add the following tests at the end of `tests/claudeTranslator.test.ts`:

```typescript
describe('Claude Translator Model Name Mapping', () => {
  it('correctly maps configured aliases to target models', () => {
    // 1. Mock/configure modelMappings in the config
    config.modelMappings = {
      'gemini-pro-latest': 'gemini-flash-latest',
      'claude-to-gemini-custom': 'gemini-2.5-pro'
    };

    // 2. Instantiate a fresh ClaudeTranslator to pick up the updated configuration
    const translatorWithMapping = new (translator.constructor as any)();

    // 3. Translate Claude request using mapped model 'gemini-pro-latest'
    const payloadPro = {
      model: 'gemini-pro-latest',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const resultPro = translatorWithMapping.translateClaudeToGoogle(payloadPro);
    expect(resultPro.cleanModelName).toEqual('gemini-flash-latest'); // Mapped to flash-latest!

    // 4. Translate Claude request using custom model 'claude-to-gemini-custom'
    const payloadCustom = {
      model: 'claude-to-gemini-custom',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const resultCustom = translatorWithMapping.translateClaudeToGoogle(payloadCustom);
    expect(resultCustom.cleanModelName).toEqual('gemini-2.5-pro'); // Mapped to 2.5-pro!
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`  
Expected: All 8 test suites pass successfully.

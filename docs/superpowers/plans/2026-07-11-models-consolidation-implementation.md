# Unified Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate model listings and key translation mappings into a single unified JSON file `config/models.json` statically imported using TypeScript.

**Architecture:** Enables JSON resolve module inside TypeScript compiler configurations, imports the JSON list, sanitizes private properties on request responses, and implements an indexed Map lookup inside translators.

**Tech Stack:** Node.js, TypeScript, Jest, ts-jest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** `typescript`, `ts-jest` dev dependencies.
- **Framework:** Express.js
- **Statelessness:** Models list is imported statically at compile time.

---

### Task 1: Initialize JSON Config and tsconfig up-grades

Enable resolve JSON modules inside `tsconfig.json`, create `config/models.json`, declare `ModelConfig` type inside `src/types/index.ts`, and remove `modelMapping` from `config/default.ts`.

**Files:**
- Create: `config/models.json`
- Modify: `tsconfig.json`
- Modify: `src/types/index.ts`
- Modify: `config/default.ts`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Type contract `ModelConfig` and static JSON array.

- [ ] **Step 1: Create `config/models.json`**
```json
[
  {
    "type": "model",
    "id": "claude-opus-4-7",
    "display_name": "Claude 4.7 Opus (Gemini Flash)",
    "created_at": "2026-07-10T00:00:00Z",
    "gemini_mapping": "gemini-2.5-flash"
  },
  {
    "type": "model",
    "id": "claude-sonnet-4-6",
    "display_name": "Claude 4.6 Sonnet (Gemini Flash Lite)",
    "created_at": "2026-07-10T00:00:00Z",
    "gemini_mapping": "gemini-2.5-flash-lite"
  },
  {
    "type": "model",
    "id": "claude-3-5-sonnet-20241022",
    "display_name": "Claude 3.5 Sonnet (New)",
    "created_at": "2024-10-22T00:00:00Z",
    "gemini_mapping": "gemini-2.5-pro"
  },
  {
    "type": "model",
    "id": "claude-3-5-sonnet",
    "display_name": "Claude 3.5 Sonnet",
    "created_at": "2024-06-20T00:00:00Z",
    "gemini_mapping": "gemini-2.5-pro"
  },
  {
    "type": "model",
    "id": "claude-3-5-haiku-20241022",
    "display_name": "Claude 3.5 Haiku",
    "created_at": "2024-10-22T00:00:00Z",
    "gemini_mapping": "gemini-2.5-flash"
  },
  {
    "type": "model",
    "id": "claude-3-5-haiku",
    "display_name": "Claude 3.5 Haiku (Standard)",
    "created_at": "2024-10-22T00:00:00Z",
    "gemini_mapping": "gemini-2.5-flash"
  },
  {
    "type": "model",
    "id": "claude-3-opus",
    "display_name": "Claude 3 Opus",
    "created_at": "2024-03-07T00:00:00Z",
    "gemini_mapping": "gemini-2.5-pro"
  },
  {
    "type": "model",
    "id": "claude-3-sonnet",
    "display_name": "Claude 3 Sonnet",
    "created_at": "2024-02-29T00:00:00Z",
    "gemini_mapping": "gemini-2.5-flash"
  },
  {
    "type": "model",
    "id": "claude-3-haiku",
    "display_name": "Claude 3 Haiku",
    "created_at": "2024-03-07T00:00:00Z",
    "gemini_mapping": "gemini-2.5-flash"
  }
]
```

- [ ] **Step 2: Update `tsconfig.json` to resolve JSON modules**
Add `"resolveJsonModule": true` under `"compilerOptions"` in `tsconfig.json`:
```json
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "rootDir": "./",
    "outDir": "./dist",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
```

- [ ] **Step 3: Update `src/types/index.ts` to declare ModelConfig**
Add the interface to `src/types/index.ts`:
```typescript
export interface ModelConfig {
  type: 'model';
  id: string;
  display_name: string;
  created_at: string;
  gemini_mapping: string;
}
```

- [ ] **Step 4: Remove `modelMapping` from `config/default.ts`**
In `config/default.ts`:
```typescript
import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  defaultModel: process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.5-flash',
  logLevel: process.env.LOG_LEVEL || 'info',
  allowedKeys: [] as string[]
};

export default config;
```

- [ ] **Step 5: Commit changes**
```bash
git add config/models.json tsconfig.json src/types/index.ts config/default.ts
git commit -m "chore: enable resolveJsonModule and initialize unified models.json config"
```

---

### Task 2: Update route controller, translators, and tests to consume JSON

Statically import `config/models.json`, strip the `gemini_mapping` key during API outputs, build indexable Map structures inside translation services, and add custom assertions ensuring secrecy of the inner mapping key.

**Files:**
- Modify: `src/controllers/claudeController.ts`
- Modify: `src/services/claudeTranslator.ts`
- Modify: `tests/claudeModels.test.ts`

**Interfaces:**
- Consumes: Interface definitions and JSON resources.
- Produces: Integrated mapping structures and clean list outputs.

- [ ] **Step 1: Refactor `src/controllers/claudeController.ts`**
Replace lines 9-19 (the hardcoded array) with the dynamically sanitized static array:
```typescript
import modelsList from '../../config/models.json';
import { ModelConfig } from '../types';

const sanitizeModel = (model: ModelConfig) => {
  const { gemini_mapping, ...cleanModel } = model;
  return cleanModel;
};

const SUPPORTED_MODELS = (modelsList as ModelConfig[]).map(sanitizeModel);
```

- [ ] **Step 2: Refactor `src/services/claudeTranslator.ts`**
Statically import `models.json` and initialize an index Map inside constructor:
```typescript
// ... top imports in src/services/claudeTranslator.ts:
import modelsList from '../../config/models.json';
import { ModelConfig } from '../types';

class ClaudeTranslator {
  private modelMapping: Map<string, string>;

  constructor() {
    this.modelMapping = new Map<string, string>();
    for (const model of modelsList as ModelConfig[]) {
      this.modelMapping.set(model.id, model.gemini_mapping);
    }
  }

  public translateClaudeToGoogle(claudeBody: ClaudeRequest) {
    const rawModel = claudeBody.model || config.defaultModel;
    const cleanModelName = this.modelMapping.get(rawModel) || config.defaultModel;
    // ...
```

- [ ] **Step 3: Update `tests/claudeModels.test.ts`**
Add an assertion verifying that `"gemini_mapping"` is NOT exposed to clients:
```typescript
  it('successfully returns the supported static models list without private gemini_mapping', async () => {
    const res = await request(app)
      .get('/v1/models')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data[0].gemini_mapping).toBeUndefined(); // Verify private key is stripped!
  });
```

- [ ] **Step 4: Run the test suite to verify success**
Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 5: Run the build to verify compiler safety**
Run: `npm run build`
Expected: Success.

- [ ] **Step 6: Commit final implementations**
```bash
git add src/controllers/claudeController.ts src/services/claudeTranslator.ts tests/claudeModels.test.ts
git commit -m "feat: consolidate models listings and translations under config/models.json"
```

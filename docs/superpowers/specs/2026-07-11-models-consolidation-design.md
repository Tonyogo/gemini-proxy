# Gemini-Proxy Unified Model Configuration Design Specification

**Date:** 2026-07-11  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the consolidation of supported model listings and their downstream Google Gemini mappings into a single unified JSON configuration file. By grouping metadata details and upstream mappings into a single configuration source (`config/models.json`), we achieve a single source of truth, highly dynamic extendability, and eliminate hardcoded arrays inside controllers and service environments.

---

## 2. Configuration & Structuring

### 2.1. Consolidated JSON Schema (`config/models.json`)
The model configurations will contain both Claude metadata specs (returned to clients) and their downstream translation mapping names (`gemini_mapping`):
```json
[
  {
    "type": "model",
    "id": "claude-opus-4-7",
    "display_name": "Claude 4.7 Opus (Gemini Flash)",
    "created_at": "2026-07-10T00:00:00Z",
    "gemini_mapping": "gemini-2.5-flash"
  },
  ...
]
```

### 2.2. TypeScript Integration Configuration
In `tsconfig.json`, we enable `"resolveJsonModule": true` inside `"compilerOptions"` to allow static, type-safe imports of JSON files.

### 2.3. Model Interface Definition (`src/types/index.ts`)
```typescript
export interface ModelConfig {
  type: 'model';
  id: string;
  display_name: string;
  created_at: string;
  gemini_mapping: string;
}
```

---

## 3. Data Flow & Integration Pipeline

### 3.1. Route Controller (`src/controllers/claudeController.ts`)
We statically import the models list. To ensure complete fidelity to Claude's official Models API, we filter out and delete the private `gemini_mapping` property before responding to client queries (`GET /v1/models` & `GET /v1/models/:model_id`):
```typescript
import modelsList from '../../config/models.json';
import { ModelConfig } from '../types';

const sanitizeModel = (model: ModelConfig) => {
  const { gemini_mapping, ...cleanModel } = model;
  return cleanModel;
};

const SUPPORTED_MODELS = (modelsList as ModelConfig[]).map(sanitizeModel);
```

### 3.2. Translation Service (`src/services/claudeTranslator.ts`)
We statically import the JSON list and construct an efficient, indexable lookup map during instantiation:
```typescript
class ClaudeTranslator {
  private modelMapping: Map<string, string>;

  constructor() {
    this.modelMapping = new Map<string, string>();
    for (const model of modelsList as ModelConfig[]) {
      this.modelMapping.set(model.id, model.gemini_mapping);
    }
  }
}
```

---

## 4. Verification & Testing Strategy
- **Unit Tests (`tests/claudeModels.test.ts`):**
  - Verify that querying `GET /v1/models` does *not* contain the private `"gemini_mapping"` property inside returned model objects.
  - Verify that standard model lookup list queries match the elements inside `models.json` exactly.
- **Full Suite Verification Check:** Run `npm test` to ensure that all 25 existing assertions continue to pass successfully.

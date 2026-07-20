# TypeScript Quality & Request Helpers Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor stateless helper methods out of `ClaudeController` into a clean, standalone helper module, resolve all `// @ts-ignore` TypeScript workarounds, and update/extend unit tests for full type safety and coverage.

**Architecture:** Extraction of stateless logic to a standalone helpers module (`src/utils/requestHelper.ts`). Clean ESM-style typescript imports for `node-fetch`. Updates to controller and tests.

**Tech Stack:** TypeScript, Express, node-fetch, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Do not use `// @ts-ignore` or `// @ts-nocheck` anywhere in production or test files.
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Create Request Helper Module

**Files:**
- Create: `src/utils/requestHelper.ts`

**Interfaces:**
- Consumes: `Request` from `express`, `config` from `config/default`
- Produces: 
  - `extractClientKey(req: Request): string | null`
  - `getUpstreamUrl(pathAndQuery: string): string`
  - `generateTransactionId(): string`

- [ ] **Step 1: Write the Request Helpers implementation**

Create the file `src/utils/requestHelper.ts` with the following content:

```typescript
import { Request } from 'express';
import config from '../../config/default';

/**
 * Extracts the Google Gemini API key from various client request headers or query parameters.
 */
export function extractClientKey(req: Request): string | null {
  if (req.headers["x-api-key"]) {
    return req.headers["x-api-key"] as string;
  }
  if (req.headers["x-goog-api-key"]) {
    return req.headers["x-goog-api-key"] as string;
  }
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    return req.headers.authorization.substring(7).trim();
  }
  if (req.query && req.query.key) {
    return req.query.key as string;
  }
  return null;
}

/**
 * Normalizes and builds the absolute upstream Gemini URL for proxying.
 */
export function getUpstreamUrl(pathAndQuery: string): string {
  const base = config.geminiBaseUrl.replace(/\/+$/, '');
  const cleanPath = pathAndQuery.replace(/^\/+/, '');
  return `${base}/${cleanPath}`;
}

/**
 * Generates a unique transaction ID for tracing request-response cycles.
 */
export function generateTransactionId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
```

- [ ] **Step 2: Run build to ensure file compiles correctly**

Run: `npm run build`  
Expected: Succeeded with no compilation errors related to `requestHelper.ts`.

- [ ] **Step 3: Commit request helpers module**

```bash
git add src/utils/requestHelper.ts
git commit -m "feat: extract requestHelper utility module"
```

---

### Task 2: Refactor Claude Controller to Use New Request Helpers

**Files:**
- Modify: `src/controllers/claudeController.ts`

**Interfaces:**
- Consumes: 
  - `extractClientKey`, `getUpstreamUrl`, `generateTransactionId` from `../utils/requestHelper`
- Produces: Updated, cleaner `ClaudeController` with zero `// @ts-ignore` comments.

- [ ] **Step 1: Edit `src/controllers/claudeController.ts` to replace imports and remove private methods**

Read `src/controllers/claudeController.ts` and replace:

1. Import section:
   Import the helper functions at the top of the file.
   ```typescript
   import {
     extractClientKey,
     getUpstreamUrl,
     generateTransactionId
   } from '../utils/requestHelper';
   ```

2. Clean up `node-fetch` import:
   Currently it uses:
   ```typescript
   // @ts-ignore
   import fetch from 'node-fetch';
   ```
   Replace it with:
   ```typescript
   import fetch from 'node-fetch';
   ```

3. Remove the old private methods from the class:
   Delete `_extractClientKey`, `_getUpstreamUrl`, and `_generateTransactionId` methods.

4. Replace references to these methods within the file:
   - Change `this._generateTransactionId()` to `generateTransactionId()`
   - Change `this._extractClientKey(req)` to `extractClientKey(req)`
   - Change `this._getUpstreamUrl(...)` to `getUpstreamUrl(...)`

Let's do a mock-up of what the top imports and method usage replacements should look like:
```typescript
import { Request, Response } from 'express';
import fetch from 'node-fetch';
import config from '../../config/default';
import modelsList from '../../config/models.json';
import { ModelConfig, GeminiModelsResponse } from '../types';
import claudeTranslator from '../services/claudeTranslator';
import payloadLogger from '../services/payloadLogger';
import logger from '../utils/logger';
import {
  extractClientKey,
  getUpstreamUrl,
  generateTransactionId
} from '../utils/requestHelper';
```

And in `handleMessages` and other methods, replace usages:
```typescript
const transactionId = generateTransactionId();
```
```typescript
const apiKey = extractClientKey(req);
```
```typescript
const targetUrl = getUpstreamUrl(`/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse&key=${apiKey}`);
```

- [ ] **Step 2: Run typescript compiler to verify zero compile errors**

Run: `npm run build`  
Expected: Successfully compiles with no errors. (If `node-fetch` import issues arise, check that `esModuleInterop` allows standard import or use `import fetch = require('node-fetch');`).

- [ ] **Step 3: Commit the controller refactoring**

```bash
git add src/controllers/claudeController.ts
git commit -m "refactor: integrate requestHelper into claudeController and remove ts-ignores"
```

---

### Task 3: Refactor and Enhance Unit Tests

**Files:**
- Modify: `tests/claudeController.test.ts`

**Interfaces:**
- Consumes: 
  - `getUpstreamUrl`, `extractClientKey`, `generateTransactionId` from `../src/utils/requestHelper`

- [ ] **Step 1: Update the imports and rewrite URL helper tests**

Edit `tests/claudeController.test.ts` to:
1. Import the request helpers at the top:
   ```typescript
   import { getUpstreamUrl, extractClientKey, generateTransactionId } from '../src/utils/requestHelper';
   ```
2. Replace the `ClaudeController URL helper methods` block (which used `@ts-ignore` to invoke the private controller methods) to invoke `getUpstreamUrl` directly and cleanly:

   ```typescript
   describe('URL helper methods', () => {
     it('correctly normalizes base URLs and path slashes', () => {
       config.geminiBaseUrl = 'https://my-custom-endpoint.com/';
       let url = getUpstreamUrl('/v1beta/models');
       expect(url).toEqual('https://my-custom-endpoint.com/v1beta/models');

       config.geminiBaseUrl = 'https://my-custom-endpoint.com';
       url = getUpstreamUrl('v1beta/models');
       expect(url).toEqual('https://my-custom-endpoint.com/v1beta/models');
     });
   });
   ```

- [ ] **Step 2: Add explicit unit tests for the extracted helper functions**

In the same file (`tests/claudeController.test.ts`), append explicit unit tests for `extractClientKey` and `generateTransactionId`:

```typescript
describe('extractClientKey helper', () => {
  it('extracts key from x-api-key header', () => {
    const mockReq = {
      headers: { 'x-api-key': 'test-key-1' },
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-1');
  });

  it('extracts key from x-goog-api-key header', () => {
    const mockReq = {
      headers: { 'x-goog-api-key': 'test-key-2' },
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-2');
  });

  it('extracts key from authorization bearer header', () => {
    const mockReq = {
      headers: { authorization: 'Bearer test-key-3' },
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-3');
  });

  it('extracts key from query parameter', () => {
    const mockReq = {
      headers: {},
      query: { key: 'test-key-4' }
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-4');
  });

  it('returns null when no key is provided', () => {
    const mockReq = {
      headers: {},
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toBeNull();
  });
});

describe('generateTransactionId helper', () => {
  it('generates unique transaction IDs containing timestamp and random string', () => {
    const id1 = generateTransactionId();
    const id2 = generateTransactionId();
    expect(id1).not.toEqual(id2);
    expect(id1).toMatch(/^\d+_[a-z0-9]+$/);
  });
});
```

- [ ] **Step 3: Run the test suite**

Run: `npm test`  
Expected: PASS all tests, including the updated `tests/claudeController.test.ts`.

- [ ] **Step 4: Commit test updates**

```bash
git add tests/claudeController.test.ts
git commit -m "test: update and expand requestHelper unit tests, removing ts-ignores"
```

---

### Task 4: Final Validation

**Files:**
- None

- [ ] **Step 1: Clean build**

Run: `npm run clean && npm run build`  
Expected: Success with empty `dist` recreated and no errors.

- [ ] **Step 2: Full Test Suite Run**

Run: `npm test`  
Expected: All 8 test suites and all tests pass perfectly.

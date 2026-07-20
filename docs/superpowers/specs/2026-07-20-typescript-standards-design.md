# Design Spec: Refactor Request Helpers and Improve TypeScript Quality

**Date:** 2026-07-20  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

In the current codebase, `ClaudeController` handles multiple responsibilities including request routing, upstream API calling, payload parsing, streaming, API key extraction, transaction ID generation, and URL normalization. This violates the **Single Responsibility Principle (SRP)**.

Additionally, the codebase contains multiple `// @ts-ignore` comments which bypass TypeScript's type-safety features:
1. `src/controllers/claudeController.ts` - Importing `node-fetch`.
2. `tests/claudeController.test.ts` - Calling the private helper `_getUpstreamUrl` on the controller.

The goal of this design is to:
1. Decouple helper logic from `ClaudeController` by moving stateless utility functions to a standalone module: `src/utils/requestHelper.ts`.
2. Clean up `node-fetch` imports so they conform to TypeScript and compile with zero warnings or ignores.
3. Clean up the unit tests to test the extracted functions directly and type-safely.

## 2. Architecture & Components

```
+-----------------------------------+
|            Express App            |
+-----------------+-----------------+
                  |
                  v
+-----------------+-----------------+
|         claudeController          | <---+
+-----------------+-----------------+     | Uses
                  |                       |
                  v                       |
+-----------------+-----------------+     |
|       src/utils/requestHelper     | ----+
+-----------------------------------+
- extractClientKey(req)
- getUpstreamUrl(pathAndQuery)
- generateTransactionId()
```

### 2.1 Helpers Module (`src/utils/requestHelper.ts`)

This new file will export three stateless, pure utility functions:

* `extractClientKey(req: Request): string | null` - Extracts API keys from request headers or query params.
* `getUpstreamUrl(pathAndQuery: string): string` - Normalizes base URL paths and query parameters.
* `generateTransactionId(): string` - Generates unique tracing IDs.

### 2.2 Controller Changes (`src/controllers/claudeController.ts`)

* Remove the private helper methods: `_extractClientKey`, `_getUpstreamUrl`, and `_generateTransactionId`.
* Import the new helpers from `../utils/requestHelper`.
* Update all references to use the standalone functions.
* Clean up the `node-fetch` import to resolve any type-checking warnings without using `@ts-ignore`.

### 2.3 Unit Test Changes (`tests/claudeController.test.ts`)

* Import `getUpstreamUrl`, `extractClientKey`, and `generateTransactionId` directly from `src/utils/requestHelper`.
* Test `getUpstreamUrl` directly and cleanly without accessing private controller properties.
* Add explicit unit tests for `extractClientKey` and `generateTransactionId`.

## 3. Testing Strategy & Verification

1. Run standard Type-checking compiler: `npm run build` to verify there are no TypeScript warnings or compilation errors.
2. Run Jest test suite: `npm test` to ensure that all 31 existing tests and newly added unit tests pass perfectly.

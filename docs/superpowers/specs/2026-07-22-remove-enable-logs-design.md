# Design Spec: Remove `ENABLE_LOGS` Environment Variable

**Date:** 2026-07-22  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

The environment variable `ENABLE_LOGS` was previously introduced to toggle console log emissions during unit test execution (`NODE_ENV === 'test'`). In practice, unit tests should consistently suppress console output by default to maintain clean and readable test results, making `ENABLE_LOGS` redundant configuration clutter.

The goal is to:
1. Remove `ENABLE_LOGS` from `src/utils/logger.ts` and simplify the test-environment log guard.
2. Remove `ENABLE_LOGS` from `.env.example`.

## 2. Architecture & Code Changes

### 2.1 Logger Modifications (`src/utils/logger.ts`)
* Remove `const enableLogsInTest = process.env.ENABLE_LOGS === 'true';`.
* Simplify suppression check:
  ```typescript
  if (isTestEnv) {
    return;
  }
  ```

### 2.2 Configuration Template Cleanup (`.env.example`)
* Remove `ENABLE_LOGS` documentation lines and default declaration.

## 3. Testing Strategy
* Run `npm run clean && npm run build && npm test` to verify that all 8 test suites pass cleanly and silently.

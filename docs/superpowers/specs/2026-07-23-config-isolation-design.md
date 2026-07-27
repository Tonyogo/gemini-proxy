# Design Spec: Environment Isolation for Runtime Configuration Files

## Executive Summary
This design prevents automated test executions (`npm test`) from deleting or corrupting the production/development `config/runtime.json` file.

It introduces environment-aware path resolution in `config/default.ts` so test suites operate exclusively on isolated test configuration files (`config/runtime.test.json`).

## Component Specifications

### 1. Environment-Aware Runtime Path Resolution (`config/default.ts`)
- **Path Resolution**:
  ```typescript
  const isTest = process.env.NODE_ENV === 'test';
  const runtimeFileName = isTest ? 'runtime.test.json' : 'runtime.json';
  const runtimeJsonPath = path.join(process.cwd(), 'config', runtimeFileName);
  ```
- **Behavior**:
  - Development and production servers read and write exclusively to `config/runtime.json`.
  - Jest test runners read, write, and clean up isolated `config/runtime.test.json` files, insulating user configurations from test side-effects.

### 2. Selective Overrides Filter
- In `updateConfig(partialConfig)`, if a value matches the underlying `.env` default, omit it from `runtimeOverrides` so `runtime.json` remains clean and minimal.

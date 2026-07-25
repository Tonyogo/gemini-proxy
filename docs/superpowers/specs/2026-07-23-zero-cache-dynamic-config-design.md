# Design Spec: Explicit Overrides Runtime Configuration Persistence & Reset to Defaults

## Executive Summary
This design solves the issue where `config/runtime.json` inadvertently overwrote `.env` updates upon server restarts.

`config/runtime.json` will now strictly store **explicit user overrides** created via the Web UI/API. Fields that have not been modified via the Web UI will remain absent from `runtime.json`, allowing `.env` changes to take effect naturally on service restarts. Additionally, a "Reset to .env Defaults" feature is provided.

## Component Architecture

### 1. Incremental Overrides Store (`config/default.ts`)
- **Initial Load Flow**:
  1. Load base configuration parsed from `process.env`.
  2. If `config/runtime.json` exists, load `runtimeOverrides` JSON dictionary.
  3. Merge `config = { ...envConfig, ...runtimeOverrides }`. Unmodified properties default directly to `envConfig`.
- **`updateConfig(partialConfig, options)`**:
  - Updates `config` in memory.
  - Merges `partialConfig` into `runtimeOverrides`.
  - If `options.resetToEnv` is true or if fields are explicitly reset, removes those keys from `runtimeOverrides` and deletes `runtime.json` if empty.
  - Persists the minimal `runtimeOverrides` dictionary to `config/runtime.json`.

### 2. Admin Endpoint & UI Integration (`ConfigModal.tsx` & `adminController.ts`)
- **API Endpoint**: `POST /api/admin/config` accepts optional `resetToEnv: boolean`.
- **Config Modal**: Adds a **"Reset to .env Defaults"** button in `ConfigModal.tsx` to clear custom overrides and restore `.env` configurations instantly.

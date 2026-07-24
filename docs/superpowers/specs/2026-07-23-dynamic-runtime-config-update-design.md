# Design Spec: Dynamic Runtime Configuration Updates with Hot-Reload & Persistence

## Executive Summary
This design introduces live runtime configuration modification into `gemini-proxy`. 

Administrators can dynamically tweak proxy transformation rules (system role mappings, runtime tags, custom instructions, model aliases, log verbosity, timeouts) through the Web Dashboard. Changes take effect in-memory **instantaneously (0ms delay)** for subsequent requests and are persisted to `config/runtime.json` to survive service restarts.

## Backend Architecture

### 1. Configuration Store with Local Persistence (`config/default.ts`)
- **Initial Load Order**:
  1. Default fallback constants.
  2. `.env` environment variables.
  3. `config/runtime.json` (overrides previous levels if file exists).
- **Exported `updateConfig(partialConfig)` Helper**:
  - Updates the in-memory singleton `config` object in-place.
  - Asynchronously writes the merged custom configurations to `config/runtime.json`.

### 2. Admin API Endpoint (`POST /api/admin/config`)
- Protected by `adminAuthMiddleware` (`x-admin-key`).
- Accepts a JSON body containing updated parameters:
  - `systemRoleToInstruction` (boolean)
  - `runtimeContextTag` (string)
  - `customSystemInstruction` (string)
  - `upstreamTimeoutMs` (number)
  - `logLevel` (enum: debug, info, warn, error)
  - `modelMappings` (record dictionary)
- Returns `200 OK` with the updated status.

## Frontend UI Architecture (`frontend/src/components/DashboardView.tsx`)

### 1. Interactive Config Panel
Replaces static badges with an editable, form-backed Settings Panel:
- Toggle switch for `SYSTEM_ROLE_TO_INSTRUCTION`.
- Text input for `RUNTIME_CONTEXT_TAG`.
- Textarea for `CUSTOM_SYSTEM_INSTRUCTION`.
- Number input for `UPSTREAM_TIMEOUT_MS`.
- Dropdown select for `LOG_LEVEL`.
- "Save & Apply Live" submit button with feedback toast.

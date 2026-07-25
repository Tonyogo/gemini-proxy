# Design Spec: Categorized Read-Only Configuration Dashboard View

## Executive Summary
This design enriches `/api/admin/status` to include missing config fields (`customSystemInstruction` and `modelMappings`) and refactors `DashboardView.tsx` into an organized, categorized, read-only system configuration viewer without any inline form inputs.

## Backend Changes (`src/admin/controllers/adminController.ts`)
- Update `getStatus` method to include all config properties in the JSON response:
  - `logLevel`, `timeZone`, `upstreamTimeoutMs`, `enableUi`
  - `systemRoleToInstruction`, `runtimeContextTag`, `customSystemInstruction`, `modelMappings`

## Frontend UI Architecture (`frontend/src/components/DashboardView.tsx`)

### Categorized Configuration Sections
1. **System & Server Settings Panel**:
   - `LOG_LEVEL` Badge
   - `TIME_ZONE` Badge
   - `UPSTREAM_TIMEOUT_MS` Badge
   - `ENABLE_UI` Badge
2. **Translation & Context Strategy Panel**:
   - `SYSTEM_ROLE_TO_INSTRUCTION` Status Badge
   - `RUNTIME_CONTEXT_TAG` Custom XML Tag Badge
   - `CUSTOM_SYSTEM_INSTRUCTION` Full Multi-Line Code Block Preview (Highlighted)
3. **Model Routing & Mapping Section**:
   - Clean JSON block of `MODEL_MAPPINGS` and supported models.

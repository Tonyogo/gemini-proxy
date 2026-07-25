# Design Spec: Cleanup Stale Configs & Models JSON Removal

## Executive Summary
This design purges obsolete/non-existent `config/models.json` references and unneeded legacy fields (`allowedKeys`), streamlining the Dashboard and Admin Controllers.

## Codebase Audit & Cleanup Scope

### 1. `config/default.ts`
- Remove legacy unused `allowedKeys` array property from the exported `config` object.

### 2. `src/admin/controllers/adminController.ts`
- Refactor `getModels()`:
  - Remove filesystem checks for non-existent `config/models.json`.
  - Simplify response to return `mappings: config.modelMappings`.

### 3. `frontend/src/components/DashboardView.tsx`
- Remove the empty `models.json` code block display from the bottom of the Dashboard.
- Cleanly focus Section 3 on **Declared Model Mappings (`MODEL_MAPPINGS`)**.

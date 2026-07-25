# Design Spec: Enhanced Config Modal with Toggle Switches & Model Mappings JSON Editor

## Executive Summary
This design refactors the Web Console settings experience by removing all inline edit buttons from `DashboardView.tsx`, upgrading boolean inputs to smooth toggle switches, and adding support for editing `MODEL_MAPPINGS` in `ConfigModal.tsx`.

## Component Architecture

### 1. Dashboard View Cleanup (`frontend/src/components/DashboardView.tsx`)
- Removes the "Edit Configuration" header button entirely.
- Serves as a purely read-only system monitoring dashboard.

### 2. Config Modal Enhancements (`frontend/src/components/ConfigModal.tsx`)
- **Toggle Switches for Booleans**:
  - Replaces native checkboxes with animated pill-style toggle switches for `SYSTEM_ROLE_TO_INSTRUCTION`.
- **`MODEL_MAPPINGS` JSON Dictionary Editor**:
  - Provides a dedicated JSON code block textarea for editing model redirection rules (e.g. `{"gemini-pro-latest": "gemini-flash-latest"}`).
  - Validates JSON syntax prior to posting payload to `POST /api/admin/config`.

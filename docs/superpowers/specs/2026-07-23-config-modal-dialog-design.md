# Design Spec: Settings Modal Dialog & Read-Only Configuration Dashboard

## Executive Summary
This design separates configuration reading from editing in `gemini-proxy`'s Web Console. 

The Dashboard page (`DashboardView.tsx`) is reverted to a clean, read-only status metrics view, while live configuration edits are moved into an overlay Modal component (`ConfigModal.tsx`), triggered via the top Header or Dashboard setting buttons.

## Component Architecture

### 1. Standalone Settings Modal (`frontend/src/components/ConfigModal.tsx`)
- **Overlay & Backdrop**: Semi-transparent dark frosted glass backdrop (`bg-slate-950/80 backdrop-blur-sm`).
- **Interactive Form Inputs**:
  - `SYSTEM_ROLE_TO_INSTRUCTION` (toggle switch)
  - `RUNTIME_CONTEXT_TAG` (string input)
  - `UPSTREAM_TIMEOUT_MS` (number input)
  - `LOG_LEVEL` (select dropdown)
  - `CUSTOM_SYSTEM_INSTRUCTION` (textarea)
- **Submit Actions**: "Cancel" and "Save & Apply Live" (posting to `POST /api/admin/config` and triggering parent state refresh).

### 2. Header & Dashboard Triggers (`App.tsx` & `DashboardView.tsx`)
- **Global Header**: Adds a `⚙️ Settings` button next to the "Lock Console" action.
- **Dashboard View**: Renders static badges for environment variables, with an `Edit Configuration` button at the top-right of the config section.

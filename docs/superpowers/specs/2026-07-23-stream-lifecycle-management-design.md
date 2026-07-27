# Design Spec: Automated Day-Based Log Retention & Expiration Cleanup

## Executive Summary
This design introduces an automated log expiration and retention manager into `gemini-proxy`. 

Logs older than `LOG_RETENTION_DAYS` (default: **3 days**) are automatically pruned at the directory level (`YYYY-MM-DD/`) asynchronously upon saving transaction logs.

## Component Specifications

### 1. Configuration (`config/default.ts` & `.env.example`)
- **New Property**: `logRetentionDays` (parsed from `process.env.LOG_RETENTION_DAYS`, default `3`).
- **Support in `updateConfig()`**: Editable via `ConfigModal.tsx` and `POST /api/admin/config`.

### 2. Fast Folder-Level Cleanup Algorithm (`src/services/payloadLogger.ts`)
- **Cutoff Calculation**:
  - Calculates the cutoff date string based on `config.timeZone` and `config.logRetentionDays` (e.g. `now - N days`).
- **Directory Pruning**:
  - Scans top-level subdirectories in `TRANSACTION_LOGS_DIR`.
  - For any directory matching `YYYY-MM-DD` that is strictly earlier than the cutoff date, asynchronously issues `fs.rm(dateDir, { recursive: true, force: true })`.

### 3. UI Integration (`ConfigModal.tsx` & `DashboardView.tsx`)
- Adds `LOG_RETENTION_DAYS` input field to `ConfigModal.tsx`.
- Displays active retention setting badge under "System & Core Settings" in `DashboardView.tsx`.

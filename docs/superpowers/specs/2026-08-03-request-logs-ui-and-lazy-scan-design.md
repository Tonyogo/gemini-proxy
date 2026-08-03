# Design Spec: Request Logs UI Refactoring and Lazy Hourly Scanning

## Overview
This specification addresses two key usability and performance issues on the Request Logs page (`frontend/src/components/LogsView.tsx` and `src/admin/services/logService.ts`):
1. **UI Clutter**: The single-line log card currently stacks 5 badges together, creating visual noise when request duration was added.
2. **Disk I/O Slowdown**: `LogService.listLogs` previously iterated through all historical date and hour subdirectories on every request to compute exact file counts for the directory `tree`.

This design refactors the log sidebar item into an elegant two-row layout (formatting duration in seconds) and optimizes backend directory scanning to only count log files for the explicitly requested date/hour.

---

## Architectural Changes

### 1. Backend Lazy Hourly Scanning (`src/admin/services/logService.ts`)

#### Directory Tree Light Weighting
- `tree` output lists directory structures (`dates` and `hours`) without opening hour directories or counting files across all historical folders.
- `tree[date][hour]` defaults to `0` for unselected hours.

#### Targeted Hourly Log Count (`hourCount` / `total`)
- Only accesses `TRANSACTION_LOGS_DIR/<activeDate>/<activeHour>` via `fs.readdir`.
- Filters `.json` files to calculate the exact count for the selected hour (`hourCount`).
- `total` represents the total count for the selected hourly slice.

#### API Response Payload Contract (`GET /api/admin/logs`)
```json
{
  "tree": {
    "2026-08-03": { "14": 0, "15": 0 },
    "2026-08-02": { "10": 0, "11": 0 }
  },
  "hourCount": 42,
  "total": 42,
  "logs": [ ... ]
}
```

---

### 2. Frontend Log Card Two-Row Layout (`frontend/src/components/LogsView.tsx`)

#### Two-Row Log Card Structure
- **Row 1 (Top Line)**:
  - **Left**: Formatted timestamp (`HH:mm:ss`) + Path Badge (e.g. `/messages`).
  - **Right**: Duration formatted in **seconds** (e.g., `0.24s`, `1.52s`).
    - Color coding: `< 1s` (purple/slate), `≥ 1s` (amber), `≥ 5s` (rose).
- **Row 2 (Bottom Line)**:
  - **Left**: Truncated log filename/ID (e.g., `...vbzalx4e8`).
  - **Right**: HTTP Status Badge (`200 OK`, `4xx/5xx`) + Mode Badge (`STREAM` / `JSON`).

#### Header Counter Integration
- Displays `hourCount` next to selected hour or sidebar title (e.g. `Request Logs (42)`).

---

## Testing Strategy
- **Unit Test**: Update `tests/adminController.test.ts` to assert that `GET /api/admin/logs` returns `hourCount` and populates `logs` array correctly.
- **Verification**: Run `npx jest --runInBand` and `npm run build:frontend`.

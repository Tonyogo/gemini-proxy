# Log Filename Redesign and UI Copy/Filter Specification

## 1. Overview & Objectives

Currently, transaction logs in `gemini-proxy` are saved as `transaction_<timestamp>_<random>.json` (e.g., `transaction_1788172233653_26eyt08eu.json`). 

This specification redesigns the log file naming scheme to a concise `mmss_ID.json` (minute + second + short random ID) format within hourly directories, and enhances the Admin Logs viewer (`/ui` Logs tab) to allow seamless one-click copying of log filenames and real-time filtering by filename in the search box.

---

## 2. Log Filename Architecture & Directory Layout

### 2.1 File Path & Naming Convention

Under the configured `TIME_ZONE` (defaulting to `Asia/Shanghai`):
- Date directory: `logs/YYYY-MM-DD/` (e.g., `logs/2026-09-02/`)
- Hour directory: `logs/YYYY-MM-DD/HH/` (e.g., `logs/2026-09-02/15/`)
- Filename format: `${mm}${ss}_${shortId}.json`
  - `mm`: 2-digit minute (`00`..`59`)
  - `ss`: 2-digit second (`00`..`59`)
  - `shortId`: 9-character random alphanumeric string (e.g., `26eyt08eu`)
  - Example filename: `0405_26eyt08eu.json`
  - Full path: `logs/2026-09-02/15/0405_26eyt08eu.json`

### 2.2 Index Record (`index.jsonl`)

`PayloadLogger.saveTransaction` records the metadata to `logs/YYYY-MM-DD/index.jsonl`:
```json
{
  "id": "0405_26eyt08eu",
  "timestamp": "2026-09-02T15:04:05.123Z",
  "date": "2026-09-02",
  "hour": "15",
  "filename": "0405_26eyt08eu.json",
  "path": "2026-09-02/15/0405_26eyt08eu.json",
  "status": 200,
  "duration": 420,
  "reqPath": "/v1/messages",
  "model": "gemini-2.5-pro",
  "isStream": true
}
```

### 2.3 Backward Compatibility

The backend log retrieval (`logService.getLogDetail` and `logService.listLogs` self-healing scan) continues to parse and serve existing legacy `transaction_*.json` files seamlessly.

---

## 3. Frontend Logs Viewer UI / UX (`LogsView.tsx`)

### 3.1 Master List Card Improvements
- Displays the concise filename `0405_26eyt08eu.json` on the bottom-left of each log card.
- An inline copy button (`Copy` / `Check` icon) is displayed next to the filename on hover or focus.
- Clicking the copy button calls `navigator.clipboard.writeText(log.filename)`, triggers a temporary green checkmark feedback, and calls `e.stopPropagation()` so the selection state is not disrupted.

### 3.2 Detail Header Ribbon (Metadata Bar)
- Adds a dedicated File badge: `File: 0405_26eyt08eu.json`.
- Hovering/clicking the badge provides a quick copy action with tooltip feedback.

### 3.3 Search & Filter Input
- Update search placeholder to `t('logs.searchPlaceholder', 'Filter model / path / filename...')`.
- Filter matching includes `log.filename`, `log.id`, `log.model`, `log.reqPath`, and `log.path` (case-insensitive).
- Pasting any copied filename (e.g. `0405_26eyt08eu.json` or `0405_26eyt08eu`) instantly isolates the exact transaction.

---

## 4. Internationalization (i18n)

### 4.1 Chinese (`frontend/src/i18n/locales/zh.ts`)
- `logs.searchPlaceholder`: `"按模型 / 路径 / 文件名过滤..."`
- `logs.copyFilename`: `"复制文件名"`
- `logs.filenameCopied`: `"文件名已复制！"`
- `logs.fileLabel`: `"文件"`

### 4.2 English (`frontend/src/i18n/locales/en.ts`)
- `logs.searchPlaceholder`: `"Filter model / path / filename..."`
- `logs.copyFilename`: `"Copy filename"`
- `logs.filenameCopied`: `"Filename copied!"`
- `logs.fileLabel`: `"File"`

---

## 5. Testing & Verification

1. **Backend Unit Tests**:
   - `tests/payloadLogger.test.ts`: Verify generated filename matches `/^\d{4}_[a-z0-9]+\.json$/`.
   - `tests/adminController.test.ts`: Verify `getLogs` and `getLogDetail` with new filename format and legacy format.
2. **Frontend Build Verification**:
   - `npm run build`: Zero TypeScript or React compilation errors.

# Log Filename Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign log filenames to `mmss_ID.json` format, maintain backward compatibility, and implement one-click filename copy and search box filename filtering in the WebUI.

**Architecture:**
- **Backend Logging (`payloadLogger.ts`, `requestHelper.ts`)**: Generates filenames based on the transaction minute, second, and a short 9-character ID. Modifies directory creation to accept the new format and store it in `index.jsonl`.
- **Backend Log Parsing (`logService.ts`)**: Ensures legacy `transaction_*.json` files are properly identified in fallback mode alongside new `mmss_ID.json` structures.
- **Frontend Master List & Detail View (`LogsView.tsx`)**: Integrates filename display, hover-copy action on lists, header badge copy action, and updates search logic to include `log.filename` and `log.id`.

**Tech Stack:** Node.js filesystem `fs`, Express, React 18, Tailwind CSS, Lucide React (`Copy`, `Check`).

## Global Constraints

- Retain support for serving legacy `transaction_<timestamp>_<id>.json` formatted files.
- The default `config.timeZone` (`Asia/Shanghai`) must dictate the minute and second parsing for filename alignment with directory names.
- Zero breaking changes to existing pagination or tree structures.
- Maintain strict TypeScript checks and complete test coverage.

---

### Task 1: Backend Filename Generation & Integration

**Files:**
- Modify: `src/utils/requestHelper.ts`
- Modify: `src/services/payloadLogger.ts`
- Modify: `src/controllers/claudeController.ts`
- Test: `tests/payloadLogger.test.ts`

**Interfaces:**
- Produces: `generateShortId()` -> string (e.g. `26eyt08eu`)
- Consumes: Replaces `generateTransactionId()` calls with `generateShortId()` in endpoints.
- Produces: Files stored as `logs/YYYY-MM-DD/HH/mmss_ID.json`

- [ ] **Step 1: Write `generateShortId` in `requestHelper.ts`**

In `src/utils/requestHelper.ts`, modify or replace `generateTransactionId`:
```typescript
/**
 * Generates a unique short ID (9 characters) for logging.
 */
export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Deprecate or replace `generateTransactionId` logic (or alias it) if external tests depend on it.
export function generateTransactionId(): string {
  return `${Date.now()}_${generateShortId()}`;
}
```

- [ ] **Step 2: Update `claudeController.ts` to use short ID as transactionId**

In `src/controllers/claudeController.ts`:
Change line 22 from:
```typescript
const transactionId = generateTransactionId();
```
To:
```typescript
const transactionId = generateShortId();
```
*Note: Make sure `generateShortId` is imported from `../utils/requestHelper`.*

- [ ] **Step 3: Update `payloadLogger.ts` filename formatting**

In `src/services/payloadLogger.ts`, modify `_getTargetDirParts` to also return `minStr` and `secStr`:
```typescript
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = getPart('hour');
    if (hour === '24') hour = '00';
    const minStr = getPart('minute').padStart(2, '0');
    const secStr = getPart('second').padStart(2, '0');

    const dateStr = `${year}-${month}-${day}`;
    const hourStr = hour;
    const targetDir = path.join(this.getDebugDir(), dateStr, hourStr);

    return { dateStr, hourStr, minStr, secStr, targetDir };
```
*Note: Ensure `minute: '2-digit', second: '2-digit'` are added to `Intl.DateTimeFormat` options inside `_getTargetDirParts` if they don't exist yet.*

Update `saveTransaction` string formatting:
```typescript
      const { dateStr, hourStr, minStr, secStr, targetDir } = this._getTargetDirParts();
      // ...
      // Instead of transaction_123.json:
      const filename = `${minStr}${secStr}_${transactionId}.json`;
      const filePath = path.join(targetDir, filename);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      
      // ...
      const indexRecord: LogIndexRecord = {
        id: transactionId,
        timestamp: payload.timestamp,
        date: dateStr,
        hour: hourStr,
        filename: filename,
        path: path.join(dateStr, hourStr, filename),
        // ...
```

- [ ] **Step 4: Fix `tests/payloadLogger.test.ts` assertions**

Since the filename now relies on `minStr` and `secStr`, extract them inside the test, then assert against `${minStr}${secStr}_${testId}.json`.

- [ ] **Step 5: Run tests to verify**

Run: `npx jest tests/payloadLogger.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/requestHelper.ts src/services/payloadLogger.ts src/controllers/claudeController.ts tests/payloadLogger.test.ts
git commit -m "feat(logger): redesign log filename format to mmss_ID.json"
```

---

### Task 2: Update Backend LogService Fallback Parser

**Files:**
- Modify: `src/admin/services/logService.ts`

**Interfaces:**
- Consumes: Raw files in `logs/`
- Produces: Correct `LogIndexRecord` IDs fallback extraction.

- [ ] **Step 1: Modify fallback parser in `logService.ts`**

In `src/admin/services/logService.ts` (around line 136):
```typescript
                const rawModel = parsed.claude_res?.model || parsed.client_req?.model || null;
                const modelName = rawModel ? claudeTranslator.getCleanModelName(rawModel) : null;
                
                // Extract transactionId correctly, supporting both transaction_<id>.json and mmss_<id>.json
                let transactionId = file.replace(/\.json$/, '');
                if (transactionId.startsWith('transaction_')) {
                  transactionId = transactionId.substring(12); // length of 'transaction_'
                } else if (/^\d{4}_/.test(transactionId)) {
                  transactionId = transactionId.substring(5); // length of 'mmss_'
                }

                targetRecords.push({
```

- [ ] **Step 2: Commit**

```bash
git add src/admin/services/logService.ts
git commit -m "fix(logs): ensure logService fallback parser supports new mmss_ID format"
```

---

### Task 3: Frontend Internationalization & Search Box Filtering

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/components/LogsView.tsx`

**Interfaces:**
- Consumes: Localized strings, user search input.

- [ ] **Step 1: Add i18n keys**

In `frontend/src/i18n/locales/zh.ts` (under `logs`):
```typescript
    searchPlaceholder: "按模型 / 路径 / 文件名过滤...",
    copyFilename: "复制文件名",
    filenameCopied: "文件名已复制！",
    fileLabel: "文件",
```

In `frontend/src/i18n/locales/en.ts` (under `logs`):
```typescript
    searchPlaceholder: "Filter model / path / filename...",
    copyFilename: "Copy filename",
    filenameCopied: "Filename copied!",
    fileLabel: "File",
```

- [ ] **Step 2: Update `LogsView.tsx` Search Filter Logic**

In `LogsView.tsx`, update the memoized `filteredLogs`:
```tsx
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        const model = (log.model || '').toLowerCase();
        const path = (log.reqPath || log.path || '').toLowerCase();
        const filename = (log.filename || '').toLowerCase();
        // Extract ID directly from filename or use log.id if available
        const logId = (log.filename || '').replace(/\.json$/, '').replace(/^\d{4}_/, '').replace(/^transaction_/, '').toLowerCase();
        
        if (!model.includes(query) && !path.includes(query) && !filename.includes(query) && !logId.includes(query)) {
          return false;
        }
      }
```

- [ ] **Step 3: Update `LogsView.tsx` Search Input UI**

Update the placeholder:
```tsx
              <input
                type="text"
                placeholder={t('logs.searchPlaceholder', 'Filter model / path / filename...')}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts frontend/src/components/LogsView.tsx
git commit -m "feat(ui): add filename filter capabilities to logs search input"
```

---

### Task 4: Frontend Master List & Detail Header Copy Integration

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`

**Interfaces:**
- Consumes: `log.filename`
- Produces: Clipboard copy action, stateful UI feedback (`Check` vs `Copy` icons).

- [ ] **Step 1: Setup filename copy state & handler**

In `LogsView.tsx` state declarations:
```tsx
  const [copiedFileIndex, setCopiedFileIndex] = useState<number | null>(null);
  const [copiedDetailFile, setCopiedDetailFile] = useState(false);

  const handleCopyFilename = (e: React.MouseEvent, filename: string, index: number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(filename);
    setCopiedFileIndex(index);
    setTimeout(() => setCopiedFileIndex(null), 1500);
  };
  
  const handleCopyDetailFilename = () => {
    if (!selectedLog || !selectedLog.filename) return;
    navigator.clipboard.writeText(selectedLog.filename);
    setCopiedDetailFile(true);
    setTimeout(() => setCopiedDetailFile(false), 1500);
  };
```

- [ ] **Step 2: Add copy icon to Master List Cards**

In the Master List mapping `filteredLogs.map((log, idx) => {`, replace the bottom row display `displayId` area (around line 582):
```tsx
                      {/* Row 2 (Bottom) */}
                      <div className="flex items-center justify-between mt-1.5 font-mono text-[10px]">
                        <div 
                          className="flex items-center space-x-1 text-slate-500 hover:text-slate-300 transition-colors"
                          onClick={(e) => handleCopyFilename(e, log.filename || '', idx)}
                          title={t('logs.copyFilename', 'Copy filename')}
                        >
                          <span className="truncate max-w-[120px]">
                            {log.filename}
                          </span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {copiedFileIndex === idx ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </span>
                        </div>
```

- [ ] **Step 3: Add File Badge to Detail Header Ribbon**

In the Metadata Summary Header Ribbon (around line 818), add the new badge block:
```tsx
              {selectedLog.filename && (
                <div 
                  onClick={handleCopyDetailFilename}
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 px-2 py-0.5 rounded-md text-slate-300 cursor-pointer flex items-center space-x-1.5 transition-colors"
                  title={t('logs.copyFilename', 'Copy filename')}
                >
                  <span className="text-slate-500 font-semibold">{t('logs.fileLabel', 'File')}:</span>
                  <span>{selectedLog.filename}</span>
                  {copiedDetailFile ? (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-500 shrink-0" />
                  )}
                </div>
              )}
```

- [ ] **Step 4: Run full frontend build**

Run: `npm run build:frontend`
Expected: Successful compile.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(ui): implement one-click filename copy in logs master list and detail header"
```

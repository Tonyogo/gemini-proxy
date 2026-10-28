# LogsView Path Truncation and Detail Status Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the log management page so that long request paths are truncated with tooltips to prevent obscuring model names and timestamps, and isolate detail page loading state so that previous log metadata is never displayed when a file is still loading or fails to load.

**Architecture:** In `frontend/src/components/LogsView.tsx`, enforce responsive maximum width boundaries (`max-w` + `truncate` + `title`) on path tags in both the master list and the detail metadata header ribbon. In `loadDetail`, reset `selectedLog` to `null` prior to in-flight fetching, introduce `AbortController` cancellation for in-flight requests to eliminate race conditions, and present an explicit error state without stale metadata if a file fails to load or is not found.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest, Vite.

**Spec:** In-chat bounded design agreed during brainstorming.

## Global Constraints

- Retain full path strings in `title` attributes for desktop mouse hover inspection.
- Do not break existing responsive layout rules (mobile, tablet, desktop).
- Maintain dual-language coverage (`zh.ts` and `en.ts`) for any newly introduced user-facing error strings.
- Pass all existing test suites without regressions (`npm test` and `npm run build:frontend`).

## Review Focus

1. **Extreme path length:** URLs with query strings exceeding 150 characters (e.g. native Gemini `streamGenerateContent?alt=sse`) must not push the model name badge or timestamp out of the viewport.
2. **Rapid log item clicking:** Fast consecutive clicks across 3+ logs must abort in-flight requests and only render the metadata and payload of the latest selected log.
3. **404 / Missing log file on disk:** Clicking a log whose file was pruned by log retention policy must display an error card and must NOT render the previous log's status/filename/model ribbon.
4. **Cached log instant switch:** Clicking an already-cached log must switch immediately without flashing empty loading state.
5. **Dark and light theme consistency:** Error cards and path badges must comply with the existing Tailwind theme palette in both light and dark modes.

---

### Task 1: Enforce Path Length Truncation in Metadata Ribbon and List Items

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:675-738, 950-956`
- Test: `tests/logsViewHeaderOptimization.test.ts`

**Interfaces:**
- Consumes: `selectedLog.path`, `log.reqPath`, `pathLabel`
- Produces: Truncated path badges with responsive `max-w`, `truncate`, `inline-block`, and `title` attributes

- [x] **Step 1: Write failing test in `tests/logsViewHeaderOptimization.test.ts` asserting path truncation and tooltip**

Add unit tests asserting:
1. The detail metadata header ribbon renders `selectedLog.path` with `max-w-[160px] sm:max-w-[220px] md:max-w-[280px] lg:max-w-[360px]`, `truncate`, `inline-block`, and `title={selectedLog.path}`.
2. The master list row 1 renders `pathLabel` with `max-w-[100px] sm:max-w-[120px]`, `truncate`, and `title={log.reqPath || pathLabel}`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/logsViewHeaderOptimization.test.ts`
Expected: FAIL due to missing truncation classes and title attributes.

- [x] **Step 3: Implement path truncation in `frontend/src/components/LogsView.tsx`**

1. In the detail metadata ribbon (around line 950):
```tsx
{/* 3. Path */}
{selectedLog.path && (
  <span
    className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-medium max-w-[160px] sm:max-w-[220px] md:max-w-[280px] lg:max-w-[360px] truncate inline-block"
    title={selectedLog.path}
  >
    {selectedLog.path}
  </span>
)}
```
2. In the list entry row 1 (around line 725):
```tsx
{pathLabel && (
  <span
    className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0 max-w-[100px] sm:max-w-[120px] truncate ${pathBadgeColor}`}
    title={log.reqPath || pathLabel}
  >
    {pathLabel}
  </span>
)}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/logsViewHeaderOptimization.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/LogsView.tsx tests/logsViewHeaderOptimization.test.ts
git commit -m "fix(logs): truncate request paths in list and detail view to prevent obscuring model and timestamp"
```

---

### Task 2: Reset Detail State and Handle Load Failures Without Stale Status

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:156-235, 1028-1036, 1410-1416`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/logsViewHeaderOptimization.test.ts`

**Interfaces:**
- Consumes: `detailAbortControllerRef: React.MutableRefObject<AbortController | null>`, `detailError: string | null`
- Produces: `detailError` state, clean unmounting of previous log ribbon when loading new log or when load fails

- [x] **Step 1: Add i18n translations for detail load failure**

In `frontend/src/i18n/locales/zh.ts` under `logs`:
```ts
detailLoadError: "日志详情文件未找到或加载失败",
detailLoadErrorDesc: "该日志详情文件可能已被自动清理策略移除，或磁盘文件不存在。",
```
In `frontend/src/i18n/locales/en.ts` under `logs`:
```ts
detailLoadError: "Log detail file not found or failed to load",
detailLoadErrorDesc: "This log file may have been pruned by retention policies or does not exist on disk.",
```

- [x] **Step 2: Write failing test in `tests/logsViewHeaderOptimization.test.ts`**

Add tests verifying:
1. `LogsView.tsx` defines and manages `detailError` state and `detailAbortControllerRef`.
2. When uncached log detail is fetched, `setSelectedLog(null)` and `setDetailError(null)` are executed.
3. When fetch response is `!r.ok`, it sets error state rather than synthesizing a fallback payload into `selectedLog`.
4. Renders error message container with `AlertCircle` icon when `detailError` is present.

- [x] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/logsViewHeaderOptimization.test.ts`
Expected: FAIL

- [x] **Step 4: Implement state isolation and request cancellation in `frontend/src/components/LogsView.tsx`**

1. Add `detailError` state and `detailAbortControllerRef`:
```tsx
const [detailError, setDetailError] = useState<string | null>(null);
const detailAbortControllerRef = useRef<AbortController | null>(null);
```
2. In `loadDetail`:
```tsx
  const loadDetail = (log: any, openMobile = true) => {
    setSelectedFile(log.path);
    if (openMobile) {
      setMobileDetailOpen(true);
    }
    // Cancel any pending in-flight request
    if (detailAbortControllerRef.current) {
      detailAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    detailAbortControllerRef.current = controller;

    if (detailCacheRef.current.has(log.path)) {
      setSelectedLog(detailCacheRef.current.get(log.path));
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    // Isolate previous state: clear previous selectedLog and errors
    setSelectedLog(null);
    setDetailError(null);
    setDetailLoading(true);

    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch(`/api/admin/logs/${log.date}/${log.hour}/${log.filename}`, {
      headers,
      signal: controller.signal
    })
      .then(async r => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        const enriched = {
          ...data,
          filename: log.filename || data.filename,
          model: log.model || data.model || data.client_req?.model,
          account: data.account || log.account || null,
          isStream: data.isStream !== undefined ? data.isStream : (data.is_stream !== undefined ? data.is_stream : log.isStream)
        };
        detailCacheRef.current.set(log.path, enriched);
        setSelectedLog(enriched);
        setDetailError(null);
        const realReqBytes = calculatePayloadSize(enriched).reqBytes;
        if (realReqBytes > 0) {
          setLogs(prevLogs => prevLogs.map(l => ((log.path && l.path === log.path) || (log.filename && l.filename === log.filename)) ? { ...l, reqSize: realReqBytes } : l));
        }
      })
      .catch((err: any) => {
        if (err.name === 'AbortError') {
          return; // Ignore aborted requests
        }
        setSelectedLog(null);
        setDetailError(t('logs.detailLoadError'));
      })
      .finally(() => {
        if (detailAbortControllerRef.current === controller) {
          setDetailLoading(false);
        }
      });
  };
```
3. Update Inspector Panel rendering:
If `detailLoading`:
Render spinner.
Else if `detailError`:
Render error card:
```tsx
<div className="flex flex-col items-center justify-center flex-1 text-slate-400 text-xs space-y-2 p-6 text-center">
  <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-2">
    <AlertCircle className="w-6 h-6" />
  </div>
  <span className="text-sm font-semibold text-slate-200">{detailError}</span>
  <span className="text-slate-500 text-xs max-w-sm">
    {t('logs.detailLoadErrorDesc')}
  </span>
</div>
```
Else if `selectedLog`:
Render tabs and payload inspector.
Else:
Render `t('logs.selectPrompt')`.

- [x] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/logsViewHeaderOptimization.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/LogsView.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/logsViewHeaderOptimization.test.ts
git commit -m "fix(logs): isolate detail loading state and abort in-flight requests to eliminate stale metadata ribbon"
```

---

### Task 3: Regression Testing and Frontend Build Verification

**Files:**
- Test: All test suites (`npm test`)
- Build: `npm run build:frontend`

- [x] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All tests pass without regressions.

- [x] **Step 2: Run frontend build check**

Run: `npm run build:frontend`
Expected: TypeScript and Vite compile with 0 errors.

- [x] **Step 3: Commit any final test cleanups or documentation adjustments**

```bash
git add -A
git commit -m "chore: verify tests and frontend build for logs view path and detail state fixes"
```

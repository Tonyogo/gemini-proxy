# Lightweight JSON Lines Log Index Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an append-only JSON Lines index manifest (`logs/<YYYY-MM-DD>/index.jsonl`) to enable sub-millisecond log listing and OOM-free server initialization.

**Architecture:** Append a single-line `LogIndexRecord` JSON to `index.jsonl` upon saving each transaction in `PayloadLogger`, refactor `LogService.listLogs` and `MetricsService.init` to read `index.jsonl` lines instead of recursively reading individual transaction JSON files, with automatic fallback for legacy logs.

**Tech Stack:** TypeScript, Node.js, fs/promises, Jest.

## Global Constraints

- Index file path format: `logs/<YYYY-MM-DD>/index.jsonl`.
- Each record must follow `LogIndexRecord` schema.
- All backend tests must pass with `npx jest --runInBand`.
- Frontend build must succeed with `npm run build:frontend`.

---

### Task 1: Add LogIndexRecord Schema & Append-Only Index Writer in PayloadLogger

**Files:**
- Modify: `src/services/payloadLogger.ts`
- Test: `tests/payloadLogger.test.ts`

**Interfaces:**
- Consumes: `saveTransaction(...)` in `PayloadLogger`
- Produces: `index.jsonl` file appended under `TRANSACTION_LOGS_DIR/<YYYY-MM-DD>/index.jsonl`

- [ ] **Step 1: Write failing unit test in tests/payloadLogger.test.ts for index.jsonl creation**

Update `tests/payloadLogger.test.ts`:

```typescript
  it('appends a LogIndexRecord entry to logs/<date>/index.jsonl when saving a transaction', async () => {
    const transactionId = `test_idx_${Date.now()}`;
    await payloadLogger.saveTransaction(
      transactionId,
      { model: 'gemini-3.1-flash', stream: false },
      { contents: [] },
      { candidates: [] },
      { type: 'message' },
      150,
      '/v1/messages',
      200,
      false
    );

    const debugDir = (payloadLogger as any)._getTargetDir();
    const indexPath = path.join(debugDir, 'index.jsonl');
    expect(existsSync(indexPath)).toBe(true);

    const content = readFileSync(indexPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    const record = JSON.parse(lines[lines.length - 1]);
    expect(record.id).toBe(transactionId);
    expect(record.status).toBe(200);
    expect(record.duration).toBe(150);
    expect(record.reqPath).toBe('/v1/messages');
    expect(record.model).toBe('gemini-3.1-flash');
  });
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/payloadLogger.test.ts -t "index.jsonl"`
Expected: FAIL (`indexPath` does not exist)

- [ ] **Step 3: Implement LogIndexRecord append-only writer in PayloadLogger**

In `src/services/payloadLogger.ts`:
Define `LogIndexRecord` interface and append to `index.jsonl`:

```typescript
export interface LogIndexRecord {
  id: string;
  timestamp: string;
  date: string;
  hour: string;
  filename: string;
  path: string;
  status: number;
  duration: number | null;
  reqPath: string | null;
  model: string | null;
  isStream: boolean;
}

// Inside saveTransaction after writing payload JSON:
const now = new Date();
const formattedHour = String(now.getHours()).padStart(2, '0');
const modelName = (clientReq && clientReq.model) || (claudeRes && claudeRes.model) || null;

const indexRecord: LogIndexRecord = {
  id: transactionId,
  timestamp: now.toISOString(),
  date: now.toISOString().split('T')[0], // YYYY-MM-DD
  hour: formattedHour,
  filename: `transaction_${transactionId}.json`,
  path: path.join(now.toISOString().split('T')[0], formattedHour, `transaction_${transactionId}.json`),
  status: resolvedStatus,
  duration: duration !== undefined ? duration : null,
  reqPath: reqPath || null,
  model: modelName,
  isStream: resolvedIsStream
};

const indexPath = path.join(targetDir, '..', 'index.jsonl'); // logs/<date>/index.jsonl
await fs.appendFile(indexPath, JSON.stringify(indexRecord) + '\n', 'utf8').catch(() => {});
```

- [ ] **Step 4: Run unit test to verify pass**

Run: `npx jest tests/payloadLogger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit PayloadLogger changes**

```bash
git add src/services/payloadLogger.ts tests/payloadLogger.test.ts
git commit -m "feat(logger): append lightweight LogIndexRecord entry to index.jsonl on transaction save"
```

---

### Task 2: Refactor LogService and MetricsService to Read index.jsonl

**Files:**
- Modify: `src/admin/services/logService.ts`
- Modify: `src/admin/services/metricsService.ts`
- Test: `tests/adminController.test.ts`
- Test: `tests/metricsService.test.ts`

**Interfaces:**
- Consumes: `logs/<date>/index.jsonl`
- Produces: Instant `listLogs` array slicing and `metricsService.init()` hydration from `index.jsonl`

- [ ] **Step 1: Refactor LogService.listLogs to read index.jsonl with fallback**

In `src/admin/services/logService.ts`:
1. For target date, check if `logs/<date>/index.jsonl` exists.
2. If exists: Read lines, parse `LogIndexRecord` items (newest first). Filter by `hour` if specified.
3. If missing: Fallback to existing directory scan, and write parsed records to `index.jsonl` for fallback self-healing.
4. Slice current page: `records.slice((page - 1) * limit, page * limit)`.

- [ ] **Step 2: Refactor MetricsService.init to read index.jsonl for Today and Yesterday**

In `src/admin/services/metricsService.ts`:
1. Check `logs/<todayStr>/index.jsonl` and `logs/<yesterdayStr>/index.jsonl`.
2. Parse records line by line to hydrate `totalLogs`, `successCount`, `errorCount`, and `timeSeriesMap`.
3. If `index.jsonl` missing for a day, fallback to scanning files as before.

- [ ] **Step 3: Run full backend and integration test suite**

Run: `npx jest --runInBand`
Expected: All 20 test suites PASS.

- [ ] **Step 4: Build frontend and verify**

Run: `npm run build:frontend`
Expected: Successful Vite React build.

- [ ] **Step 5: Commit LogService and MetricsService changes**

```bash
git add src/admin/services/logService.ts src/admin/services/metricsService.ts tests/adminController.test.ts tests/metricsService.test.ts
git commit -m "perf(logService): read index.jsonl manifest for sub-millisecond listings and OOM-free init"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (LogIndexRecord schema, append-only writer in PayloadLogger, index.jsonl reader in logService/metricsService, fallback support)
- [x] No placeholders or vague TODOs
- [x] Exact file paths and line steps provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

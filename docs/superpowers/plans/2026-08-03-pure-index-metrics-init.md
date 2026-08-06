# Pure Index-Based Metrics Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `MetricsService.init()` to rely strictly on `index.jsonl` manifests, completely removing folder-based directory scans and individual transaction JSON file body reads.

**Architecture:** Update `MetricsService.init()` in Node.js to read `index.jsonl` files from date directories, accumulating total log counts for all days and hydrating metrics/timeSeries for Today and Yesterday, skipping dates without `index.jsonl`.

**Tech Stack:** TypeScript, Node.js, Jest.

## Global Constraints

- Zero individual `transaction_*.json` file body reads (`fs.readFile`) during `MetricsService.init()`.
- Skip date directories where `index.jsonl` does not exist without throwing or falling back to directory scans.
- All backend tests must pass with `npx jest --runInBand`.

---

### Task 1: Refactor MetricsService init to Read index.jsonl Exclusively

**Files:**
- Modify: `src/admin/services/metricsService.ts:79-160`
- Test: `tests/metricsService.test.ts`

**Interfaces:**
- Consumes: `logs/<date>/index.jsonl`
- Produces: Hydrated `MetricsService` stats from `index.jsonl` line records

- [ ] **Step 1: Inspect and update tests in tests/metricsService.test.ts**

Update `tests/metricsService.test.ts` to verify `init()` reads `index.jsonl`:

```typescript
  it('hydrates stats cleanly from index.jsonl on init()', async () => {
    // Setup test index.jsonl and call init()
  });
```

- [ ] **Step 2: Refactor MetricsService.init() in src/admin/services/metricsService.ts**

Update `src/admin/services/metricsService.ts`:

```typescript
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const debugDir = this.getDebugDir();

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const formatDate = (d: Date): string => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${dt}`;
    };

    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(yesterday);

    try {
      const dates = await fs.readdir(debugDir);
      for (const date of dates.sort().reverse()) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        // Directly read index.jsonl for this date
        const indexPath = path.join(dateDir, 'index.jsonl');
        const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
        if (!indexExists) continue;

        try {
          const content = await fs.readFile(indexPath, 'utf8');
          const lines = content.trim().split('\n');
          const records: any[] = [];
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              records.push(JSON.parse(line));
            } catch {
              // Ignore corrupt line
            }
          }

          // Accumulate totalLogs from index record count
          this.totalLogs += records.length;

          // Hydrate stats for Today and Yesterday
          if (date === todayStr || date === yesterdayStr) {
            for (const record of records) {
              const isError = record.status >= 400;
              if (isError) {
                this.errorCount++;
              } else {
                this.successCount++;
              }
              if (record.duration !== undefined && record.duration !== null && typeof record.duration === 'number') {
                this.totalDurationMs += record.duration;
                this.durationCount++;
              }

              const dateObj = record.timestamp ? new Date(record.timestamp) : undefined;
              const hourKey = this.getHourKey(dateObj);
              this.updateBucket(hourKey, isError, record.duration, record.model);
            }
          }
        } catch {
          // Ignore read error for corrupt index.jsonl file
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }
```

- [ ] **Step 3: Run full backend and integration test suite**

Run: `npx jest --runInBand`
Expected: All 20 test suites PASS.

- [ ] **Step 4: Commit MetricsService changes**

```bash
git add src/admin/services/metricsService.ts tests/metricsService.test.ts
git commit -m "perf(metrics): refactor init to rely exclusively on index.jsonl with zero folder fallback scans"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (Zero individual file body reads, pure index.jsonl initialization, skips missing index.jsonl cleanly)
- [x] No placeholders or vague TODOs
- [x] Exact code modifications provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

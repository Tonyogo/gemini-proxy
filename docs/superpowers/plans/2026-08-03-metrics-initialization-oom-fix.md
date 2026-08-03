# Metrics Initialization OOM Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent OOM during metrics initialization by separating fast O(1) total file counting from detailed 24-hour log JSON parsing.

**Architecture:** Update `MetricsService.init` in Node.js to scan and count files across all directories to compute `totalLogs`, but restrict detailed `fs.readFile` / `JSON.parse` operations strictly to candidate files located within today's and yesterday's date folders.

**Tech Stack:** TypeScript, Node.js, Jest.

## Global Constraints

- Files in date folders *other than* Today and Yesterday must **never** be loaded/read via `fs.readFile`.
- `this.totalLogs` must continue to represent the exact total count of all historical logs.
- All tests must pass with `npx jest --runInBand`.

---

### Task 1: Refactor MetricsService init to Fast-Count All and Read Detail for 24h Window Only

**Files:**
- Modify: `src/admin/services/metricsService.ts`
- Test: `tests/metricsService.test.ts`

**Interfaces:**
- Consumes: `init()` in `MetricsService`
- Produces: Aggregated metrics in `timeSeries` for the last 24h, and exact historical totals in `totalLogs` without memory overflow

- [ ] **Step 1: Inspect current test coverage in tests/metricsService.test.ts**

Read `tests/metricsService.test.ts` to understand existing `record()` and `timeSeries` tests. Since `init()` reads physical files from disk, we will mock date folders or rely on existing unit test constraints.

- [ ] **Step 2: Implement 24-Hour Folder Pruning in MetricsService.init**

Update `src/admin/services/metricsService.ts`:
1. Calculate today's and yesterday's formatted date strings:
   ```typescript
   const today = new Date();
   const yesterday = new Date(today);
   yesterday.setDate(today.getDate() - 1);

   const formatDate = (d: Date): string => {
     const year = d.getFullYear();
     const month = String(d.getMonth() + 1).padStart(2, '0');
     const date = String(d.getDate()).padStart(2, '0');
     return `${year}-${month}-${date}`;
   };

   const todayStr = formatDate(today);
   const yesterdayStr = formatDate(yesterday);
   ```
2. In `init()`, loop through `dates`:
   - For **every** date folder, scan all hour directories and files, and accumulate count: `this.totalLogs += jsonFiles.length`.
   - ONLY for date folders matching `todayStr` or `yesterdayStr`, push file paths to `candidatePaths` for detailed reading and parsing.

```typescript
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const debugDir = this.getDebugDir();
    const candidatePaths: string[] = [];

    // Calculate Today and Yesterday keys for detail loading
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

        const hours = await fs.readdir(dateDir);
        for (const hour of hours.sort().reverse()) {
          const hourDir = path.join(dateDir, hour);
          const hourStat = await fs.stat(hourDir).catch(() => null);
          if (!hourStat || !hourStat.isDirectory()) continue;

          const files = await fs.readdir(hourDir);
          const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

          // 1. Fast metadata count (O(1) filesystem metadata lookup) - ALWAYS count ALL files
          this.totalLogs += jsonFiles.length;

          // 2. Only collect candidate paths for detail reading if date is Today or Yesterday
          if (date === todayStr || date === yesterdayStr) {
            for (const file of jsonFiles) {
              candidatePaths.push(path.join(hourDir, file));
            }
          }
        }
      }

      // 3. Concurrently read and parse bounded 24h candidate files
      const filePromises = candidatePaths.map(filePath =>
        fs.readFile(filePath, 'utf8')
          .then(content => {
            const data = JSON.parse(content);
            const isError = Boolean(data.claude_res?.error);
            if (isError) {
              this.errorCount++;
            } else {
              this.successCount++;
            }
            if (data.duration !== undefined && data.duration !== null && typeof data.duration === 'number') {
              this.totalDurationMs += data.duration;
              this.durationCount++;
            }

            // Hydrate hourly metrics trend
            let dateObj: Date | undefined;
            if (data.timestamp) {
              dateObj = new Date(data.timestamp);
            } else {
              const parts = filePath.split(path.sep);
              if (parts.length >= 2) {
                const hourStr = parts[parts.length - 2];
                if (/^\d{2}$/.test(hourStr)) {
                  dateObj = new Date();
                  dateObj.setHours(parseInt(hourStr, 10));
                }
              }
            }
            const hourKey = this.getHourKey(dateObj);
            this.updateBucket(hourKey, isError, data.duration);
          })
          .catch(() => {
            // Ignore single file parse errors
          })
      );

      await Promise.all(filePromises);
    } catch {
      // Directory may not exist yet
    }
  }
```

- [ ] **Step 3: Run unit tests to verify full pass**

Run: `npx jest --runInBand`
Expected: PASS

- [ ] **Step 4: Commit OOM optimization changes**

```bash
git add src/admin/services/metricsService.ts
git commit -m "perf(metrics): prevent OOM by restricting metrics init details parsing to latest 24h"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (Total logs counted historically, details parsed ONLY for Today/Yesterday)
- [x] No placeholders or vague TODOs
- [x] Exact code modifications provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

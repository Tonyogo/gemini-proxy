# Design Spec: Metrics Initialization OOM Fix

## Overview
The recent change to lift the `1000` log threshold in `MetricsService.init()` caused an OOM (Out of Memory) vulnerability. When transaction logs accumulate over days or weeks, `init()` schedules thousands of asynchronous `fs.readFile` and `JSON.parse` operations concurrently via unlimited `Promise.all`, instantly exhausting Node.js heap memory.

This specification optimizes `init()` by restricting detail parsing and JSON reading strictly to **the last 24 hours of logs** (today and yesterday folders), while maintaining fast, high-level file counting for the total log metrics.

---

## Architectural Changes

### 1. Two-Tier Initialization Pruning (`src/admin/services/metricsService.ts`)

#### Fast-Path File Counting
- Enter every date folder and read directory metrics to update `this.totalLogs` instantly using filesystem folder listing counts without reading file payloads.

#### Strict 24-Hour Folder Pruning
- Limit the detailed parsing of JSON transaction logs strictly to directories matching:
  - **Today** (using formatted date string).
  - **Yesterday** (using formatted date string).
- Only paths inside these two active day-folders (and optionally restricted to the trailing 24 hours slice) will be pushed to the `candidatePaths` array.
- This bounds the active parsed set to only recent telemetry, capping memory footprint at a fraction of a megabyte while keeping startup sub-millisecond.

---

## Technical Flow

```
[Server Starts -> MetricsService.init()]
       │
       ├── Retrieve current Date (Today) and Yesterday string keys
       │
       ├── fs.readdir(debugDir)
       │     │
       │     ├── For ALL Date folders:
       │     │     ├── Accumulate total count: `this.totalLogs += jsonFiles.length` (Fast!)
       │     │
       │     └── ONLY for Date folders matching (Today / Yesterday):
       │           ├── Collect file paths to `candidatePaths`
       │
       └── Promise.all(candidatePaths.map(fs.readFile))
             ├── Concurrently parse JSON for recent 24-hour log files only
             └── Update recent success, error, latency metrics and hour-by-hour timeSeries
```

---

## Testing Strategy
- **Verification**: Run `npx jest --runInBand` and `npm run build:frontend`.

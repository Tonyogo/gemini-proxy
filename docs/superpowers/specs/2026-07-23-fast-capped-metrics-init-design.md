# Design Spec: High-Speed Capped Metrics Initialization

## Executive Summary
This design eliminates the startup delay of `metricsService.init()` caused by serially reading and parsing every historical transaction file on disk.

It replaces full-disk contents parsing with a 2-stage fast initialization:
1. **Metadata-Only Total Counter**: Uses fast `fs.readdir` file counts to compute `totalLogs` without opening files.
2. **Capped 1000-Sample Concurrent Parsing**: Collects file paths in reverse chronological order and concurrently parses at most the **latest 1,000 files** using `Promise.all` to initialize baseline latency and error rates.

## Component Architecture (`src/admin/services/metricsService.ts`)

### 1. Fast Directory Metadata Counting
- Traverses `logs/` directory partitions (`YYYY-MM-DD/HH`).
- Increments `totalLogs` strictly by `jsonFiles.length` (O(1) filesystem metadata lookup).

### 2. Bounded Sample Processing (Max 1000 Files)
- Pushes relative file paths into a candidate queue ordered from newest to oldest date/hour.
- Slices candidate queue to `Math.min(1000, candidates.length)`.
- Concurrently reads and parses candidate files using `Promise.all`:
  - Calculates `successCount`, `errorCount`, and `totalDurationMs` over the sample size.

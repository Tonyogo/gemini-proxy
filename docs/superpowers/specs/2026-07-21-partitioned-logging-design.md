# Design Spec: Date/Hour Partitioned Transaction Logging

**Date:** 2026-07-21  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

Currently, `PayloadLogger` saves all request-response transaction JSON log payloads inside a single flat debug directory (defaulting to `logs/` or `data/debug/` as resolved). For high-volume proxy services, saving thousands of files in a flat structure causes filesystem degradation and slow directory queries.

The goal is to structure and partition all transaction log files into subdirectories dynamically structured by **date and hour** of the transaction:
`YYYY-MM-DD/HH/transaction_${transactionId}.json`

This ensures logs are neatly structured, scalable, and extremely fast to query.

## 2. Architecture & Directory Mapping

```
Save Transaction Log
       │
       ▼
Calculate date & hour components (YYYY-MM-DD, HH)
       │
       ▼
Build target directory path:
`${debugDir}/${YYYY-MM-DD}/${HH}`
       │
       ▼
Ensure directory exists (fs.mkdir recursive: true)
       │
       ▼
Write `transaction_${transactionId}.json`
```

### 2.1 Logger Modifications (`src/services/payloadLogger.ts`)
* Add helper `_getTargetDir()` returning the resolved absolute directory string for the current local time:
  ```typescript
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  ```
* Remove static state property `this.initialized` and method `_ensureDirectory()`.
* In `saveTransaction()`, dynamically calculate `targetDir = this._getTargetDir()`, run `fs.mkdir(targetDir, { recursive: true })`, and write the JSON file to `path.join(targetDir, "transaction_" + transactionId + ".json")`.

### 2.2 Test Modifications (`tests/payloadLogger.test.ts`)
* Update `tests/payloadLogger.test.ts` to calculate `targetDir` and `filePath` using the identical date-hour schema components.
* Update `afterEach` to unlink the written test file and recursively attempt to clean up the empty hours/date subdirectories, keeping the local workspace clean.

## 3. Testing Strategy
* Run standard compilation `npm run build`.
* Run Jest test suite `npm test` verifying that `tests/payloadLogger.test.ts` compiles, writes files to the dynamic paths, asserts properties successfully, and unlinks cleanly.

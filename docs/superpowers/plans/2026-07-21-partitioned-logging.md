# Date/Hour Partitioned Transaction Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `PayloadLogger` to partition JSON transaction logging files into subfolders structured by date and hour (`YYYY-MM-DD/HH/...`), and synchronize test paths to match.

**Architecture:** Implement `_getTargetDir()` in `PayloadLogger` and remove static initialization checks. Update `saveTransaction()` to call `fs.mkdir` recursively for each write, and update `tests/payloadLogger.test.ts`.

**Tech Stack:** TypeScript, Express, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Refactor PayloadLogger to Support Partitioned Subfolders

**Files:**
- Modify: `src/services/payloadLogger.ts`

**Interfaces:**
- Produces: Partitioned folders and files for every transaction write.

- [ ] **Step 1: Edit `src/services/payloadLogger.ts` to implement partitioned logging**

Read `src/services/payloadLogger.ts` and refactor the class:

```typescript
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../config/default';
import logger from '../utils/logger';

class PayloadLogger {
  private debugDir: string;

  constructor() {
    const logsDir = config.transactionLogsDir || 'logs';
    this.debugDir = path.isAbsolute(logsDir)
      ? logsDir
      : path.join(process.cwd(), logsDir);
  }

  /**
   * Computes the target partition subdirectory based on the current date and hour.
   */
  private _getTargetDir(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');

    return path.join(this.debugDir, `${year}-${month}-${day}`, hour);
  }

  public async saveTransaction(
    transactionId: string,
    clientReq: any,
    gemReq: any,
    gemRes: any,
    claudeRes: any,
    duration?: number
  ): Promise<void> {
    try {
      const targetDir = this._getTargetDir();
      await fs.mkdir(targetDir, { recursive: true });

      const payload = {
        duration: duration !== undefined ? duration : null,
        client_req: clientReq || null,
        gem_req: gemReq || null,
        gem_res: gemRes || null,
        claude_res: claudeRes || null
      };

      const filePath = path.join(targetDir, `transaction_${transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug(`[PayloadLogger] Saved transaction log: ${path.join(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`, String(new Date().getHours()).padStart(2, '0'), `transaction_${transactionId}.json`)}`);
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
}

export default new PayloadLogger();
```

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Succeeded.

---

### Task 2: Synchronize and Enhance Unit Tests

**Files:**
- Modify: `tests/payloadLogger.test.ts`

- [ ] **Step 1: Rewrite `tests/payloadLogger.test.ts` to compute dynamic file paths**

Read `tests/payloadLogger.test.ts` and modify it:

```typescript
import payloadLogger from '../src/services/payloadLogger';
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../config/default';

describe('PayloadLogger Service', () => {
  const testId = 'test_transaction_abc123';
  const logsDir = config.transactionLogsDir || 'logs';
  const resolvedLogsDir = path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);

  // Dynamically compute the date/hour subfolder path matching PayloadLogger's formatting
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');

  const targetDir = path.join(resolvedLogsDir, `${year}-${month}-${day}`, hour);
  const filePath = path.join(targetDir, `transaction_${testId}.json`);

  afterEach(async () => {
    try {
      await fs.unlink(filePath);
      // Clean up empty directories created during test run
      await fs.rmdir(targetDir).catch(() => {});
      await fs.rmdir(path.dirname(targetDir)).catch(() => {});
    } catch (e) {
      // ignore
    }
  });

  it('correctly creates the directory and writes pretty-printed json payload with 4 keys', async () => {
    const clientReq = { messages: [{ role: 'user', content: 'Hi' }] };
    const gemReq = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
    const gemRes = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
    const claudeRes = { content: [{ type: 'text', text: 'Hello' }] };

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes, claudeRes);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.duration).toBeNull();
    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
    expect(data.claude_res).toEqual(claudeRes);
  });

  it('correctly saves duration in the payload when provided', async () => {
    const clientReq = { messages: [{ role: 'user', content: 'Hi' }] };
    const gemReq = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
    const gemRes = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
    const claudeRes = { content: [{ type: 'text', text: 'Hello' }] };

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes, claudeRes, 350);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.duration).toBe(350);
    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
    expect(data.claude_res).toEqual(claudeRes);
  });
});
```

- [ ] **Step 2: Run build and verify test suite passes successfully**

Run: `npm run clean && npm run build && npm test`  
Expected: All 8 test suites pass perfectly.

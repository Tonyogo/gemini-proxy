# Remove ENABLE_LOGS Environment Variable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the codebase and configuration template by completely removing the `ENABLE_LOGS` environment variable and simplifying the logger's test environment guard.

**Architecture:** Refactor `src/utils/logger.ts` to simplify test log suppression and remove `ENABLE_LOGS` from `.env.example`.

**Tech Stack:** TypeScript, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Remove ENABLE_LOGS from Logger and .env.example

**Files:**
- Modify: `src/utils/logger.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: Cleaned logger module without `ENABLE_LOGS`.

- [ ] **Step 1: Refactor `src/utils/logger.ts`**

Read `src/utils/logger.ts` and replace lines 6-13:

```typescript
import config from '../../config/default';

const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : 2;

const isTestEnv = process.env.NODE_ENV === 'test';

const log = (level: string, message: string, ...meta: any[]) => {
  // Suppress all console logs during testing
  if (isTestEnv) {
    return;
  }

  if (levels[level] <= currentLevel) {
    const timestamp = new Date().toISOString();
    const formattedMeta = meta.length
      ? ' ' + meta.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(' ')
      : '';
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${formattedMeta}`);
  }
};

const logger = {
  error: (msg: string, ...meta: any[]) => log('error', msg, ...meta),
  warn: (msg: string, ...meta: any[]) => log('warn', msg, ...meta),
  info: (msg: string, ...meta: any[]) => log('info', msg, ...meta),
  debug: (msg: string, ...meta: any[]) => log('debug', msg, ...meta)
};

export default logger;
```

- [ ] **Step 2: Remove ENABLE_LOGS from `.env.example`**

Read `.env.example` and remove the lines documenting and declaring `ENABLE_LOGS`:

Remove:
```properties
# 是否在 Jest 单元测试执行期间开启详细的控制台日志输出 (true/false)
# 默认值: false
ENABLE_LOGS=false
```

- [ ] **Step 3: Run clean build and test suite**

Run: `npm run clean && npm run build && npm test`  
Expected: All 8 test suites pass cleanly.

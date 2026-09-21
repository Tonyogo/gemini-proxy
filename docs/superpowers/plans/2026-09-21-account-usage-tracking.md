# 账号模型使用量本地统计与追踪实现计划 (Account Usage Tracking Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于上游响应头 `X-Account-Name` 实现账号模型使用量本地精确记录，以北京时间 15:00~次日 15:00 为业务周期，区分成功/失败请求数，支持异步安全落盘与服务重启恢复，并全面联动交易审计日志与账号管理面板。

**Architecture:** 
1. `AccountUsageService` 作为单例在内存维护当前业务周期内各账号及各模型的请求计数，采用 1 秒防抖原子落盘保存至 `data/account-usage/current-period.json` 并在进程退出时确保数据刷新；
2. `claudeController` 和 `geminiController` 在收到上游响应时通过 `response.headers.get('x-account-name')` 提取账号，并在流式与非流式请求生命周期结束（成功/错误）时向 `accountUsageService` 记录指标；
3. `payloadLogger` 扩展明细 JSON 及 `index.jsonl` 索引，记录请求对应的 `account` 标识；
4. `accountController.getStatus` 获取上游账号列表后，与本地 `accountUsageService` 聚合的当日用量自动合并，提供给前端展示。

**Tech Stack:** Node.js, Express, TypeScript, Jest, Supertest, React 18, Tailwind CSS.

## Global Constraints

- **基准时区**: 统一使用 `Asia/Shanghai`（北京时间 UTC+8）划分周期，每天 15:00:00 至次日 15:00:00 为同一个业务周期。
- **统计口径**: 仅统计请求次数（成功与失败），按账号名跨上游服务器全局汇总，按模型细分。
- **配置与数据隔离**: 运行期持久化目录为 `data/account-usage/`，确保写入容错且不阻塞主代理链路。
- **测试完整性**: 新增功能必须有严格的单元测试与集成测试覆盖，且 `npm run build` 与 `npx jest --runInBand` 全部通过。

---

### Task 1: 账号使用量 TypeScript 接口定义 (Type Definitions)

**Files:**
- Create: `src/types/accountUsage.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `ModelUsageStats`, `AccountUsageStats`, `PeriodUsageStore`

- [ ] **Step 1: 创建 `src/types/accountUsage.ts`**

```typescript
// src/types/accountUsage.ts

export interface ModelUsageStats {
  success: number;
  error: number;
  total: number;
}

export interface AccountUsageStats {
  accountName: string;
  totalSuccess: number;
  totalError: number;
  totalRequests: number;
  byModel: Record<string, ModelUsageStats>;
}

export interface PeriodUsageStore {
  periodKey: string;      // 例如 "2026-09-21_15"
  periodStart: string;    // 例如 "2026-09-21 15:00:00"
  periodEnd: string;      // 例如 "2026-09-22 15:00:00"
  updatedAt: string;      // ISO 8601
  accounts: Record<string, AccountUsageStats>;
}
```

- [ ] **Step 2: 在 `src/types/index.ts` 中导出**

```typescript
export * from './accountUsage';
```

- [ ] **Step 3: 运行 TypeScript 编译检查**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/accountUsage.ts src/types/index.ts
git commit -m "feat(types): add account usage data models and period interfaces"
```

---

### Task 2: 核心服务层 `AccountUsageService` 实现与单元测试 (Service & Persistence)

**Files:**
- Create: `src/admin/services/accountUsageService.ts`
- Create: `tests/accountUsageService.test.ts`

**Interfaces:**
- Consumes: `PeriodUsageStore`, `AccountUsageStats`, `ModelUsageStats` from `src/types`
- Produces: `accountUsageService` singleton with methods:
  - `record(accountName: string | null | undefined, model: string | null | undefined, isSuccess: boolean): void`
  - `getUsageForAccount(accountName: string): AccountUsageStats | null`
  - `getAllUsage(): PeriodUsageStore`
  - `getPeriodKey(date?: Date): string`
  - `init(): Promise<void>`
  - `flush(): Promise<void>`
  - `resetForTest(): void`

- [ ] **Step 1: 编写 `tests/accountUsageService.test.ts` 测试用例**

```typescript
import accountUsageService from '../src/admin/services/accountUsageService';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('AccountUsageService', () => {
  beforeEach(async () => {
    accountUsageService.resetForTest();
  });

  afterAll(async () => {
    accountUsageService.resetForTest();
  });

  describe('Period calculation (15:00 to next day 15:00 Asia/Shanghai)', () => {
    it('should compute correct periodKey before 15:00', () => {
      // 2026-09-21 14:59:59 (UTC: 2026-09-21 06:59:59Z)
      const date = new Date('2026-09-21T06:59:59.000Z');
      const key = accountUsageService.getPeriodKey(date);
      expect(key).toBe('2026-09-20_15');
    });

    it('should compute correct periodKey at and after 15:00', () => {
      // 2026-09-21 15:00:00 (UTC: 2026-09-21 07:00:00Z)
      const date = new Date('2026-09-21T07:00:00.000Z');
      const key = accountUsageService.getPeriodKey(date);
      expect(key).toBe('2026-09-21_15');
    });
  });

  describe('Record and aggregation', () => {
    it('should aggregate success and error requests per account and model', () => {
      accountUsageService.record('user-a@example.com', 'claude-3-5-sonnet', true);
      accountUsageService.record('user-a@example.com', 'claude-3-5-sonnet', true);
      accountUsageService.record('user-a@example.com', 'claude-3-5-sonnet', false);
      accountUsageService.record('user-a@example.com', 'gemini-1.5-pro', true);

      const usage = accountUsageService.getUsageForAccount('user-a@example.com');
      expect(usage).not.toBeNull();
      expect(usage!.totalSuccess).toBe(3);
      expect(usage!.totalError).toBe(1);
      expect(usage!.totalRequests).toBe(4);

      expect(usage!.byModel['claude-3-5-sonnet']).toEqual({
        success: 2,
        error: 1,
        total: 3
      });
      expect(usage!.byModel['gemini-1.5-pro']).toEqual({
        success: 1,
        error: 0,
        total: 1
      });
    });

    it('should ignore record calls when accountName is empty or null', () => {
      accountUsageService.record('', 'gemini-1.5-pro', true);
      accountUsageService.record(null as any, 'gemini-1.5-pro', true);
      const all = accountUsageService.getAllUsage();
      expect(Object.keys(all.accounts).length).toBe(0);
    });
  });

  describe('Persistence and flush', () => {
    it('should persist current period to disk and recover after init', async () => {
      accountUsageService.record('persist-user@example.com', 'gemini-1.5-flash', true);
      await accountUsageService.flush();

      // Reset in memory without deleting disk
      const periodKey = accountUsageService.getPeriodKey();
      const currentUsage = accountUsageService.getUsageForAccount('persist-user@example.com');
      expect(currentUsage?.totalSuccess).toBe(1);

      // Re-initialize
      await accountUsageService.init();
      const restoredUsage = accountUsageService.getUsageForAccount('persist-user@example.com');
      expect(restoredUsage?.totalSuccess).toBe(1);
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/accountUsageService.test.ts`
Expected: FAIL ("Cannot find module '../src/admin/services/accountUsageService'")

- [ ] **Step 3: 实现 `src/admin/services/accountUsageService.ts`**

```typescript
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';
import logger from '../../utils/logger';
import { AccountUsageStats, ModelUsageStats, PeriodUsageStore } from '../../types';

class AccountUsageService {
  private currentStore: PeriodUsageStore | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private dataDir = path.join(process.cwd(), 'data', 'account-usage');
  private historyDir = path.join(process.cwd(), 'data', 'account-usage', 'history');
  private currentFilePath = path.join(process.cwd(), 'data', 'account-usage', 'current-period.json');

  constructor() {
    this.registerExitHooks();
  }

  private registerExitHooks(): void {
    const handleExit = () => {
      this.flushSync();
    };
    process.once('beforeExit', handleExit);
    process.once('SIGINT', () => {
      handleExit();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      handleExit();
      process.exit(0);
    });
  }

  public getPeriodKey(dateObj: Date = new Date()): string {
    const timeZone = config.timeZone || 'Asia/Shanghai';
    let year: number;
    let month: number;
    let day: number;
    let hour: number;

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
      });
      const parts = formatter.formatToParts(dateObj);
      const getVal = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
      year = getVal('year');
      month = getVal('month');
      day = getVal('day');
      hour = getVal('hour');
    } catch {
      year = dateObj.getFullYear();
      month = dateObj.getMonth() + 1;
      day = dateObj.getDate();
      hour = dateObj.getHours();
    }

    // 15:00 cutoff logic
    const refDate = new Date(Date.UTC(year, month - 1, day));
    if (hour < 15) {
      refDate.setUTCDate(refDate.getUTCDate() - 1);
    }
    const yStr = refDate.getUTCFullYear();
    const mStr = String(refDate.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(refDate.getUTCDate()).padStart(2, '0');

    return `${yStr}-${mStr}-${dStr}_15`;
  }

  private calculatePeriodBoundaries(periodKey: string): { periodStart: string; periodEnd: string } {
    const [datePart] = periodKey.split('_');
    const [y, m, d] = datePart.split('-').map(v => parseInt(v, 10));
    const startDate = new Date(Date.UTC(y, m - 1, d, 7, 0, 0)); // 15:00 UTC+8 is 07:00 UTC
    const endDate = new Date(startDate.getTime() + 24 * 3600 * 1000);

    return {
      periodStart: `${datePart} 15:00:00 (UTC+8)`,
      periodEnd: `${endDate.toISOString().slice(0, 10)} 15:00:00 (UTC+8)`
    };
  }

  private ensureCurrentStore(): PeriodUsageStore {
    const activePeriodKey = this.getPeriodKey();
    if (!this.currentStore || this.currentStore.periodKey !== activePeriodKey) {
      if (this.currentStore && this.currentStore.periodKey !== activePeriodKey) {
        // Archive previous period
        this.archiveCurrentPeriod().catch(() => {});
      }
      const boundaries = this.calculatePeriodBoundaries(activePeriodKey);
      this.currentStore = {
        periodKey: activePeriodKey,
        periodStart: boundaries.periodStart,
        periodEnd: boundaries.periodEnd,
        updatedAt: new Date().toISOString(),
        accounts: {}
      };
    }
    return this.currentStore;
  }

  private async archiveCurrentPeriod(): Promise<void> {
    if (!this.currentStore) return;
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      const archivePath = path.join(this.historyDir, `period-${this.currentStore.periodKey}.json`);
      await fs.writeFile(archivePath, JSON.stringify(this.currentStore, null, 2), 'utf8');
      logger.info(`[AccountUsage] Archived past period usage to ${archivePath}`);
    } catch (err: any) {
      logger.error(`[AccountUsage] Failed to archive period: ${err.message}`);
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.historyDir, { recursive: true });

      const fileExists = await fs.access(this.currentFilePath).then(() => true).catch(() => false);
      if (fileExists) {
        const raw = await fs.readFile(this.currentFilePath, 'utf8');
        const parsed: PeriodUsageStore = JSON.parse(raw);
        const activePeriodKey = this.getPeriodKey();

        if (parsed.periodKey === activePeriodKey) {
          this.currentStore = parsed;
          logger.info(`[AccountUsage] Restored current period usage: ${parsed.periodKey} (${Object.keys(parsed.accounts).length} accounts)`);
        } else {
          // It's from a past period -> archive it and start fresh
          await fs.mkdir(this.historyDir, { recursive: true });
          const archivePath = path.join(this.historyDir, `period-${parsed.periodKey}.json`);
          await fs.writeFile(archivePath, raw, 'utf8').catch(() => {});
          this.ensureCurrentStore();
          await this.flush();
        }
      } else {
        this.ensureCurrentStore();
      }
    } catch (err: any) {
      logger.warn(`[AccountUsage] Failed to init or restore account usage store: ${err.message}`);
      this.ensureCurrentStore();
    }
  }

  public record(accountName: string | null | undefined, model: string | null | undefined, isSuccess: boolean): void {
    if (!accountName || typeof accountName !== 'string' || !accountName.trim()) {
      return;
    }

    const normAccount = accountName.trim();
    const normModel = (model && model.trim()) ? model.trim() : 'unknown';

    const store = this.ensureCurrentStore();
    let accountStats = store.accounts[normAccount];
    if (!accountStats) {
      accountStats = {
        accountName: normAccount,
        totalSuccess: 0,
        totalError: 0,
        totalRequests: 0,
        byModel: {}
      };
      store.accounts[normAccount] = accountStats;
    }

    accountStats.totalRequests++;
    if (isSuccess) {
      accountStats.totalSuccess++;
    } else {
      accountStats.totalError++;
    }

    let modelStats = accountStats.byModel[normModel];
    if (!modelStats) {
      modelStats = { success: 0, error: 0, total: 0 };
      accountStats.byModel[normModel] = modelStats;
    }

    modelStats.total++;
    if (isSuccess) {
      modelStats.success++;
    } else {
      modelStats.error++;
    }

    store.updatedAt = new Date().toISOString();
    this.scheduleFlush();
  }

  public getUsageForAccount(accountName: string): AccountUsageStats | null {
    if (!accountName) return null;
    const store = this.ensureCurrentStore();
    return store.accounts[accountName.trim()] || null;
  }

  public getAllUsage(): PeriodUsageStore {
    return this.ensureCurrentStore();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => {});
    }, 1000);
  }

  public async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.currentStore) return;

    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const tempPath = `${this.currentFilePath}.${Date.now()}.tmp`;
      const data = JSON.stringify(this.currentStore, null, 2);
      await fs.writeFile(tempPath, data, 'utf8');
      await fs.rename(tempPath, this.currentFilePath);
    } catch (err: any) {
      logger.error(`[AccountUsage] Failed to flush current usage to disk: ${err.message}`);
    }
  }

  private flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.currentStore) return;
    try {
      const fsSync = require('fs');
      if (!fsSync.existsSync(this.dataDir)) {
        fsSync.mkdirSync(this.dataDir, { recursive: true });
      }
      const data = JSON.stringify(this.currentStore, null, 2);
      fsSync.writeFileSync(this.currentFilePath, data, 'utf8');
    } catch {
      // ignore
    }
  }

  public resetForTest(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.currentStore = null;
    this.isInitialized = false;
  }
}

export default new AccountUsageService();
```

- [ ] **Step 4: 运行单元测试**

Run: `npx jest tests/accountUsageService.test.ts`
Expected: PASS with all test cases passed.

- [ ] **Step 5: Commit**

```bash
git add src/admin/services/accountUsageService.ts tests/accountUsageService.test.ts
git commit -m "feat(admin): implement AccountUsageService with period tracking and atomic persistence"
```

---

### Task 3: 交易审计日志联动 `PayloadLogger` 与 `LogService`

**Files:**
- Modify: `src/proxy/services/payloadLogger.ts`
- Modify: `src/admin/services/logService.ts`
- Create/Modify: `tests/payloadLoggerAccount.test.ts`

**Interfaces:**
- Consumes: `LogIndexRecord`
- Produces: `saveTransaction(..., accountName?: string | null)`

- [ ] **Step 1: 编写 `tests/payloadLoggerAccount.test.ts` 测试用例**

```typescript
import payloadLogger from '../src/proxy/services/payloadLogger';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('PayloadLogger Account Recording', () => {
  it('should save account name in transaction payload and index.jsonl', async () => {
    const txId = 'test_tx_acc_123';
    const clientReq = { model: 'claude-3-5-sonnet' };
    const gemReq = {};
    const claudeRes = { id: 'msg_1', model: 'claude-3-5-sonnet' };
    const accountName = 'audit-user@example.com';

    await payloadLogger.saveTransaction(
      txId,
      clientReq,
      gemReq,
      null,
      claudeRes,
      120,
      '/v1/messages',
      200,
      false,
      accountName
    );

    // Verify index.jsonl contains account
    const debugDir = path.join(process.cwd(), 'logs');
    const dates = await fs.readdir(debugDir);
    let foundIndex = false;
    for (const d of dates) {
      const indexPath = path.join(debugDir, d, 'index.jsonl');
      const exists = await fs.access(indexPath).then(() => true).catch(() => false);
      if (exists) {
        const content = await fs.readFile(indexPath, 'utf8');
        const lines = content.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const rec = JSON.parse(line);
          if (rec.id === txId) {
            expect(rec.account).toBe(accountName);
            foundIndex = true;
            break;
          }
        }
      }
      if (foundIndex) break;
    }
    expect(foundIndex).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/payloadLoggerAccount.test.ts`
Expected: FAIL (assertion or parameter mismatch)

- [ ] **Step 3: 修改 `src/proxy/services/payloadLogger.ts`**

1. 更新 `LogIndexRecord` 接口：
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
  account?: string | null;
}
```

2. 在 `saveTransaction` 方法签名中增加 `account?: string | null`，并保存到 payload 及 indexRecord 中：
```typescript
  public async saveTransaction(
    transactionId: string,
    clientReq: any,
    gemReq: any,
    gemRes: any,
    claudeRes: any,
    duration?: number,
    reqPath?: string,
    status?: number,
    isStream?: boolean,
    account?: string | null
  ): Promise<void>
```
将 `account: account || null` 加入 `payload` 对象，并在 `indexRecord` 中设置 `account: account || null`。

- [ ] **Step 4: 修改 `src/admin/services/logService.ts`**

在 `LogItem` 接口中添加 `account?: string | null`，并在 `listLogs` 的映射中读取 `record.account`：
```typescript
export interface LogItem {
  date: string;
  hour: string;
  filename: string;
  path: string;
  reqPath?: string | null;
  timestamp?: string | null;
  status?: number | null;
  isStream?: boolean;
  duration?: number | null;
  model?: string | null;
  account?: string | null;
}
```

- [ ] **Step 5: 运行测试**

Run: `npx jest tests/payloadLoggerAccount.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/proxy/services/payloadLogger.ts src/admin/services/logService.ts tests/payloadLoggerAccount.test.ts
git commit -m "feat(logger): record account identifier in transaction details and index.jsonl"
```

---

### Task 4: 在控制器中捕获 `X-Account-Name` 并记录使用量

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts`
- Modify: `src/proxy/controllers/geminiController.ts`
- Create: `tests/proxyAccountUsageIntegration.test.ts`

**Interfaces:**
- Consumes: `response.headers.get('x-account-name')`, `accountUsageService.record(...)`, `payloadLogger.saveTransaction(..., account)`

- [ ] **Step 1: 编写 `tests/proxyAccountUsageIntegration.test.ts` 测试**

```typescript
import request from 'supertest';
import app from '../src/app';
import accountUsageService from '../src/admin/services/accountUsageService';
import nock from 'nock';

describe('Proxy X-Account-Name Interception', () => {
  beforeEach(() => {
    accountUsageService.resetForTest();
    nock.cleanAll();
  });

  afterAll(() => {
    nock.cleanAll();
  });

  it('should extract X-Account-Name and record usage on non-stream Claude response', async () => {
    nock('https://generativelanguage.googleapis.com')
      .post(/\/v1beta\/models\/gemini-1\.5-pro:generateContent/)
      .reply(200, {
        candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
      }, {
        'X-Account-Name': 'tester-acc@google.com'
      });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }]
      });

    expect(res.status).toBe(200);
    const usage = accountUsageService.getUsageForAccount('tester-acc@google.com');
    expect(usage).not.toBeNull();
    expect(usage!.totalSuccess).toBe(1);
    expect(usage!.totalError).toBe(0);
    expect(usage!.byModel['gemini-1.5-pro'].success).toBe(1);
  });

  it('should record error usage if upstream returns 500 with X-Account-Name', async () => {
    nock('https://generativelanguage.googleapis.com')
      .post(/\/v1beta\/models\/gemini-1\.5-pro:generateContent/)
      .reply(500, {
        error: { code: 500, message: 'Internal Server Error' }
      }, {
        'X-Account-Name': 'tester-err@google.com'
      });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }]
      });

    expect(res.status).toBe(500);
    const usage = accountUsageService.getUsageForAccount('tester-err@google.com');
    expect(usage).not.toBeNull();
    expect(usage!.totalSuccess).toBe(0);
    expect(usage!.totalError).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest tests/proxyAccountUsageIntegration.test.ts`
Expected: FAIL

- [ ] **Step 3: 更新 `claudeController.ts`**

1. 引入 `accountUsageService`：
```typescript
import accountUsageService from '../../admin/services/accountUsageService';
```
2. 在流式请求中：
```typescript
const accountName = response.headers.get('x-account-name') || null;
```
- 若 `!response.ok`:
  `accountUsageService.record(accountName, cleanModelName, false);`
  `payloadLogger.saveTransaction(..., accountName);`
- 在 `response.body!.on('end')`:
  `accountUsageService.record(accountName, cleanModelName, true);`
  `payloadLogger.saveTransaction(..., accountName);`
- 在 `response.body!.on('error')`:
  `accountUsageService.record(accountName, cleanModelName, false);`
  `payloadLogger.saveTransaction(..., accountName);`
3. 在非流式请求中：
```typescript
const accountName = response.headers.get('x-account-name') || null;
accountUsageService.record(accountName, cleanModelName, response.ok);
payloadLogger.saveTransaction(..., accountName);
```

- [ ] **Step 4: 更新 `geminiController.ts`**

1. 引入 `accountUsageService`。
2. 提取 `const accountName = response.headers.get('x-account-name') || null;`。
3. 流式：在非 ok、end 及 error 回调中调用 `accountUsageService.record(accountName, targetModelName || 'unknown', isSuccess)` 并传递给 `payloadLogger.saveTransaction`。
4. 非流式：在响应解析后调用 `accountUsageService.record(accountName, targetModelName || 'unknown', response.ok)` 并传递给 `payloadLogger.saveTransaction`。

- [ ] **Step 5: 运行测试**

Run: `npx jest tests/proxyAccountUsageIntegration.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts tests/proxyAccountUsageIntegration.test.ts
git commit -m "feat(proxy): intercept X-Account-Name and track per-account request metrics"
```

---

### Task 5: 账号管理接口融合与独立使用量端点 (API Integration)

**Files:**
- Modify: `src/admin/controllers/accountController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Create/Modify: `tests/accountStatusUsage.test.ts`

**Interfaces:**
- Consumes: `accountUsageService.getUsageForAccount(acc.name)`, `accountUsageService.getAllUsage()`
- Produces:
  - Augmented `GET /api/admin/accounts/status`
  - `GET /api/admin/accounts/usage`

- [ ] **Step 1: 编写 `tests/accountStatusUsage.test.ts`**

```typescript
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import accountService from '../src/admin/services/accountService';
import accountUsageService from '../src/admin/services/accountUsageService';
import config from '../config/default';

jest.mock('../src/admin/services/accountService');
const mockedAccountService = accountService as jest.Mocked<typeof accountService>;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Account Controller Usage Integration', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  beforeEach(() => {
    accountUsageService.resetForTest();
  });

  it('should merge local usage into account status response', async () => {
    accountUsageService.record('user1@gmail.com', 'claude-3-5-sonnet', true);
    accountUsageService.record('user1@gmail.com', 'claude-3-5-sonnet', false);

    mockedAccountService.getStatus.mockResolvedValueOnce({
      status: 200,
      data: {
        status: {
          accountDetails: [
            { index: 0, name: 'user1@gmail.com' },
            { index: 1, name: 'user2@gmail.com' }
          ]
        }
      },
      headers: {}
    } as any);

    const res = await request(app)
      .get('/api/admin/accounts/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    const acc0 = res.body.status.accountDetails[0];
    expect(acc0.usage).toBeDefined();
    expect(acc0.usage.totalRequests).toBe(2);
    expect(acc0.usage.total).toBe(1); // totalSuccess
    expect(acc0.usage.byModel['claude-3-5-sonnet'].success).toBe(1);
    expect(acc0.usage.byModel['claude-3-5-sonnet'].error).toBe(1);

    const acc1 = res.body.status.accountDetails[1];
    expect(acc1.usage).toBeUndefined();
  });

  it('should return all period usage from GET /api/admin/accounts/usage', async () => {
    accountUsageService.record('user1@gmail.com', 'gemini-1.5-pro', true);

    const res = await request(app)
      .get('/api/admin/accounts/usage')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.periodKey).toBeDefined();
    expect(res.body.accounts['user1@gmail.com']).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/accountStatusUsage.test.ts`
Expected: FAIL

- [ ] **Step 3: 修改 `src/admin/controllers/accountController.ts`**

1. 引入 `accountUsageService`。
2. 在 `getStatus` 方法中：
```typescript
  public async getStatus(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const result = serverIndex !== undefined
      ? await accountService.getStatus(serverIndex)
      : await accountService.getStatus();

    if (result.status === 200 && result.data?.status?.accountDetails && Array.isArray(result.data.status.accountDetails)) {
      for (const acc of result.data.status.accountDetails) {
        if (acc.name) {
          const localStats = accountUsageService.getUsageForAccount(acc.name);
          if (localStats) {
            const byModelCompat: Record<string, any> = {};
            for (const [model, stats] of Object.entries(localStats.byModel)) {
              byModelCompat[model] = {
                usage: stats.success,
                requests: stats.total,
                success: stats.success,
                error: stats.error
              };
            }
            acc.usage = {
              total: localStats.totalSuccess,
              totalRequests: localStats.totalRequests,
              totalSuccess: localStats.totalSuccess,
              totalError: localStats.totalError,
              byModel: byModelCompat
            };
          }
        }
      }
    }

    res.status(result.status).json(result.data);
  }
```
3. 增加 `getUsage` 方法：
```typescript
  public async getUsage(req: Request, res: Response): Promise<void> {
    res.json(accountUsageService.getAllUsage());
  }
```

- [ ] **Step 4: 修改 `src/admin/routes/adminRoutes.ts`**

在 `adminRoutes.ts` 添加：
```typescript
router.get('/accounts/usage', (req, res) => accountController.getUsage(req, res));
```

- [ ] **Step 5: 运行测试**

Run: `npx jest tests/accountStatusUsage.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/admin/controllers/accountController.ts src/admin/routes/adminRoutes.ts tests/accountStatusUsage.test.ts
git commit -m "feat(admin): merge local account usage into getStatus and add /accounts/usage endpoint"
```

---

### Task 6: 前端审计日志与账号管理展示增强 (UI Enhancements)

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`
- Modify: `frontend/src/components/AccountsView.tsx`

- [ ] **Step 1: 在 `LogsView.tsx` 中展示账号标识 (Account Badge)**

在 LogItem 列表中，当 `log.account` 存在时，在模型名后方增加一个小巧的账号标识胶囊徽章（例如 `<User className="w-2.5 h-2.5 inline" /> {log.account}`）。
在搜索框筛选中，支持根据 `log.account` 进行实时过滤。

- [ ] **Step 2: 在 `AccountsView.tsx` 中增强错误用量展示**

在 `getModelBreakdowns()` 中，保留 `success` 与 `error` 字段：
```typescript
export interface ModelUsageDetail {
  limit?: number;
  usage?: number;
  requests?: number;
  success?: number;
  error?: number;
}
```
在 Breakdown Popover 中：如果 `item.error > 0`，额外展示红色微型标记：`(${item.success} ok / ${item.error} err)`。

- [ ] **Step 3: 运行前端构建测试**

Run: `npm run build:frontend`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/LogsView.tsx frontend/src/components/AccountsView.tsx
git commit -m "feat(ui): display account tags in logs view and show error counts in accounts usage breakdown"
```

---

### Task 7: 全系统构建与全量测试套件验证 (Full Verification)

**Files:**
- None (Verification step)

- [ ] **Step 1: 运行后端 TypeScript 编译**

Run: `npm run build:backend`
Expected: 0 errors.

- [ ] **Step 2: 运行全部 Jest 自动化测试**

Run: `npm test` (or `npx jest --runInBand`)
Expected: 全部测试用例通过（0 failed）。

- [ ] **Step 3: 运行前端构建**

Run: `npm run build:frontend`
Expected: 构建成功，生成 `dist/frontend`。

- [ ] **Step 4: 启动与初始化生命周期检查**

在 `src/index.ts` 启动时，调用 `await accountUsageService.init()` 确保服务启动时立即恢复持久化数据。

- [ ] **Step 5: Commit 启动初始化变更**

```bash
git add src/index.ts
git commit -m "chore: initialize accountUsageService on server startup"
```

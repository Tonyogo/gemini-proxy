# 账号模型每日用量统计简化与前端展示修复实现计划 (Account Usage Simplification & UI Fix Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 极简账号每日用量统计，单文件持久化并在每天 15:00 (UTC+8) 自动重置，彻底去除历史归档逻辑，并在后端与前端彻底归一化模型名称，解决同一个模型在前端显示两遍的问题。

**Architecture:** 
1. `AccountUsageService` 改为极简单文件 `data/account-usage.json`，去除 `history/` 目录和归档代码，模型记录时强制去除 `models/` 前缀，跨天（超过 15:00 周期）直接内存重置；
2. `AccountController.getStatus` 对上游返回的账号列表统一用本地标准用量对象做 100% 覆盖，彻底丢弃上游透传的混乱 `usage` / `models` 字段；
3. `AccountsView.tsx` 前端重构 `getModelBreakdowns`，以 Map 方式按清洗后的模型名聚合去重，同时简化 `getTotalUsage`。

**Tech Stack:** Node.js, Express, TypeScript, Jest, Supertest, React 18, Vite.

## Global Constraints

- **基准时区**: 统一使用 `Asia/Shanghai`（北京时间 UTC+8）划分周期，每天 15:00:00 至次日 15:00:00 为同一个业务周期。
- **持久化位置**: 仅使用 `data/account-usage.json` 单文件，不再生成 `data/account-usage/history/` 目录与历史文件。
- **模型去重**: 无论传入模型名是否带有 `models/` 前缀，统一去除前缀并归并至同一统计项。
- **全量测试**: 每次代码变更后保证对应单元测试与全量测试通过（`npx jest --runInBand`）且前后端构建无报错。

---

### Task 1: 极简 `AccountUsageService` 并实现模型名归一化与周期自动重置

**Files:**
- Modify: `src/admin/services/accountUsageService.ts`
- Test: `tests/accountUsageService.test.ts`

**Interfaces:**
- Consumes: `AccountUsageStats`, `ModelUsageStats`, `PeriodUsageStore` from `src/types/accountUsage.ts`
- Produces: 
  - `accountUsageService.record(accountName, model, isSuccess): void` (自动剥除 `models/` 前缀)
  - `accountUsageService.getUsageForAccount(accountName): AccountUsageStats | null`
  - `accountUsageService.getAllUsage(): PeriodUsageStore`
  - `accountUsageService.init(): Promise<void>`
  - `accountUsageService.flush(): Promise<void>`

- [ ] **Step 1: 在 `tests/accountUsageService.test.ts` 中编写针对模型去重和无归档重置的测试用例**

修改 `tests/accountUsageService.test.ts`，增加以下断言：
1. 测试传入 `models/gemini-2.0-flash` 与 `gemini-2.0-flash` 时合并为一个模型 `gemini-2.0-flash`；
2. 验证跨周期时重置，且不再产生历史归档文件。

```typescript
// 在 tests/accountUsageService.test.ts 中添加：
it('should normalize model name by removing models/ prefix and merge counts', () => {
  accountUsageService.record('user-norm@example.com', 'models/gemini-2.0-flash', true);
  accountUsageService.record('user-norm@example.com', 'gemini-2.0-flash', true);

  const usage = accountUsageService.getUsageForAccount('user-norm@example.com');
  expect(usage).not.toBeNull();
  expect(usage!.totalSuccess).toBe(2);
  expect(usage!.byModel['gemini-2.0-flash']).toEqual({
    success: 2,
    error: 0,
    total: 2
  });
  expect(usage!.byModel['models/gemini-2.0-flash']).toBeUndefined();
});

it('should reset usage on period change without creating history archives', async () => {
  accountUsageService.record('user-old@example.com', 'gemini-1.5-pro', true);
  expect(accountUsageService.getUsageForAccount('user-old@example.com')?.totalSuccess).toBe(1);

  // 模拟周期发生变化
  const pastStore = accountUsageService.getAllUsage();
  (pastStore as any).periodKey = '2026-09-20_15';

  // 触发新的记录，应当自动进入新周期并重置
  accountUsageService.record('user-new@example.com', 'gemini-1.5-pro', true);
  expect(accountUsageService.getUsageForAccount('user-old@example.com')).toBeNull();
  expect(accountUsageService.getUsageForAccount('user-new@example.com')?.totalSuccess).toBe(1);

  // 检查 data/account-usage/history 目录不应存在
  const historyExists = await fs.access(path.join(process.cwd(), 'data', 'account-usage', 'history'))
    .then(() => true)
    .catch(() => false);
  expect(historyExists).toBe(false);
});
```

- [ ] **Step 2: 运行测试验证新测试失败**

Run: `npx jest tests/accountUsageService.test.ts`
Expected: FAIL（未去除 `models/` 前缀导致断言失败）。

- [ ] **Step 3: 重构 `src/admin/services/accountUsageService.ts` 为极简单文件模式**

简化实现：
1. 存储文件路径设为 `path.join(process.cwd(), 'data', 'account-usage.json')`；
2. 彻底移除 `historyDir` 及 `archiveCurrentPeriod` 方法；
3. 在 `record` 时清洗 `model`:
   ```typescript
   const rawModel = (model && model.trim()) ? model.trim() : 'unknown';
   const normModel = rawModel.replace(/^models\//, '');
   ```
4. 周期比对不同时直接重置当前 store 为新周期：
   ```typescript
   private ensureCurrentStore(): PeriodUsageStore {
     const activePeriodKey = this.getPeriodKey();
     if (!this.currentStore || this.currentStore.periodKey !== activePeriodKey) {
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
   ```
5. 异步原子写入 `data/account-usage.json`。

- [ ] **Step 4: 运行单元测试验证通过**

Run: `npx jest tests/accountUsageService.test.ts`
Expected: PASS

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add src/admin/services/accountUsageService.ts tests/accountUsageService.test.ts
git commit -m "refactor(admin): simplify accountUsageService to single-file store with model normalization"
```

---

### Task 2: 后端 `AccountController.getStatus` 统一重写并清洗账号用量结构

**Files:**
- Modify: `src/admin/controllers/accountController.ts:30-56`
- Test: `tests/accountStatusUsage.test.ts`

**Interfaces:**
- Consumes: `accountUsageService.getUsageForAccount(accountName)`
- Produces: `GET /api/admin/accounts/status` 返回每个 `acc.usage` 均为纯净的本地统一结构，彻底丢弃上游透传的原字段

- [ ] **Step 1: 在 `tests/accountStatusUsage.test.ts` 补充针对覆盖上游脏数据及零用量账号的测试用例**

修改 `tests/accountStatusUsage.test.ts`，模拟上游返回带脏数据 `usage: { models: { 'gemini-pro': { requests: 99 } } }` 的账号：

```typescript
it('should completely overwrite upstream dirty usage data with local clean usage', async () => {
  accountUsageService.record('clean-user@example.com', 'models/gemini-2.0-flash', true);

  mockedAccountService.getStatus.mockResolvedValueOnce({
    status: 200,
    data: {
      status: {
        accountDetails: [
          {
            index: 0,
            name: 'clean-user@example.com',
            usage: {
              models: { 'dirty-model': { requests: 999 } }
            }
          },
          {
            index: 1,
            name: 'zero-user@example.com',
            usage: {
              models: { 'old-model': { requests: 50 } }
            }
          }
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
  expect(acc0.usage.models).toBeUndefined(); // 上游脏字段被清除
  expect(acc0.usage.byModel['gemini-2.0-flash'].success).toBe(1);
  expect(acc0.usage.totalRequests).toBe(1);

  const acc1 = res.body.status.accountDetails[1];
  expect(acc1.usage.models).toBeUndefined(); // 零用量账号的上游脏字段也被清除
  expect(acc1.usage.totalRequests).toBe(0);
  expect(acc1.usage.byModel).toEqual({});
});
```

- [ ] **Step 2: 运行测试验证测试失败**

Run: `npx jest tests/accountStatusUsage.test.ts`
Expected: FAIL（上游脏数据未被完全覆盖/清除）。

- [ ] **Step 3: 更新 `src/admin/controllers/accountController.ts` 实现严格覆盖**

在 `getStatus` 中：
```typescript
if (result.status === 200 && result.data?.status?.accountDetails && Array.isArray(result.data.status.accountDetails)) {
  for (const acc of result.data.status.accountDetails) {
    const localStats = acc.name ? accountUsageService.getUsageForAccount(acc.name) : null;
    const byModelCompat: Record<string, any> = {};

    if (localStats?.byModel) {
      for (const [model, stats] of Object.entries(localStats.byModel)) {
        const cleanModel = model.replace(/^models\//, '');
        byModelCompat[cleanModel] = {
          usage: stats.success,
          requests: stats.total,
          success: stats.success,
          error: stats.error
        };
      }
    }

    acc.usage = {
      total: localStats?.totalSuccess || 0,
      totalRequests: localStats?.totalRequests || 0,
      totalSuccess: localStats?.totalSuccess || 0,
      totalError: localStats?.totalError || 0,
      byModel: byModelCompat
    };
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/accountStatusUsage.test.ts`
Expected: PASS

- [ ] **Step 5: 提交 Task 2 代码**

```bash
git add src/admin/controllers/accountController.ts tests/accountStatusUsage.test.ts
git commit -m "fix(admin): strictly overwrite account usage in getStatus to purge upstream dirty fields"
```

---

### Task 3: 前端 `AccountsView.tsx` 模型用量提取去重与精简

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:740-785`

**Interfaces:**
- Consumes: `AccountUsage`
- Produces: 
  - `getModelBreakdowns(usage?: AccountUsage): Array<{ model: string; count: number; limit?: number; success?: number; error?: number }>` (严格归一化去重合并)
  - `getTotalUsage(usage?: AccountUsage): number` (直接取总请求数)

- [ ] **Step 1: 重构 `frontend/src/components/AccountsView.tsx` 中的 `getModelBreakdowns` 与 `getTotalUsage`**

修改 `getTotalUsage`:
```typescript
const getTotalUsage = (usage?: AccountUsage): number => {
  if (!usage) return 0;
  if (typeof usage.totalRequests === 'number') return usage.totalRequests;
  if (typeof usage.total === 'number') return usage.total;
  if (usage.byModel) {
    return Object.values(usage.byModel).reduce((sum, item) => sum + (item.requests || item.usage || 0), 0);
  }
  return 0;
};
```

修改 `getModelBreakdowns`:
```typescript
const getModelBreakdowns = (usage?: AccountUsage): Array<{
  model: string;
  count: number;
  limit?: number;
  success?: number;
  error?: number;
}> => {
  if (!usage?.byModel) return [];

  const map = new Map<string, {
    model: string;
    count: number;
    limit?: number;
    success?: number;
    error?: number;
  }>();

  for (const [rawModel, item] of Object.entries(usage.byModel)) {
    const model = rawModel.replace(/^models\//, '').trim();
    const count = item.usage ?? item.requests ?? 0;
    const success = item.success ?? count;
    const error = item.error ?? 0;
    const limit = item.limit;

    const existing = map.get(model);
    if (existing) {
      existing.count += count;
      existing.success = (existing.success ?? 0) + success;
      existing.error = (existing.error ?? 0) + error;
      if (limit !== undefined) existing.limit = limit;
    } else {
      map.set(model, {
        model,
        count,
        limit,
        success,
        error
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};
```

- [ ] **Step 2: 执行前端构建检查是否有编译错误**

Run: `npm run build:frontend`
Expected: Vite build succeeds with 0 errors.

- [ ] **Step 3: 提交 Task 3 代码**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "fix(ui): deduplicate and simplify model breakdowns in AccountsView"
```

---

### Task 4: 全量回归测试与构建验证 (Full Regression Verification)

**Files:**
- 全局测试与构建验证

- [ ] **Step 1: 运行所有 Jest 自动化测试**

Run: `npx jest --runInBand`
Expected: 100% 测试套件通过，0 failures。

- [ ] **Step 2: 运行后端构建编译**

Run: `npm run build:backend`
Expected: TypeScript 编译通过，生成 `dist/src`。

- [ ] **Step 3: 运行完整构建**

Run: `npm run build`
Expected: 前端和后端全部编译成功。

- [ ] **Step 4: 检查 git 状态**

Run: `git status`
Expected: 工作区干净无未提交内容。

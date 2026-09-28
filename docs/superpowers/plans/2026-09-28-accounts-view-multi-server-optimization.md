# Web 端多服务器账号管理重构与节点模型调用统计实施计划 (Accounts View Multi-Server Optimization & Node Model Stats Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除 AccountsView 内部与侧边栏重复的 `<h1>账号管理</h1>` 大标题以拉平视觉层级，升级现代卡片式多网关节点切换器，并在每个服务器节点头部提供专属的「模型调用统计明细大盘」及账号表格行内主力模型胶囊徽标。

**Architecture:** 
1. 在 `frontend/src/utils/accountModelStats.ts` 中实现通用的服务器级与账号级模型调用统计归并算法；
2. 扩充中英文语言包（`zh.ts` / `en.ts`）新增节点模型统计与展示文案；
3. 在 `frontend/src/components/AccountsView.tsx` 中彻底移除冗余的页面内 `<h1>账号管理</h1>` 标题栏，并重构多服务器网关选择器为卡片式切换栏；
4. 在 `AccountsView.tsx` 中新增节点专属的「模型调用统计明细看板」，包含流量切分多色占比条与细分指标网格，并在账号列表“用量”列直观展示 Top 模型胶囊徽标；
5. 更新测试套件并执行全量回归，确保前端构建与 155+ 测试套件持续 100% 绿色通过。

**Tech Stack:** React (TypeScript), TailwindCSS, Lucide Icons, Jest, Vite

**Spec:** `docs/superpowers/specs/2026-09-28-accounts-view-multi-server-optimization-design.md`

## Global Constraints

- **界面标题去重**：遵循用户指示，页面内部绝对不再渲染 `<h1>账号管理</h1>` 或重复的标题描述，首屏顶部直接由服务器节点选择器统领。
- **纯前端数据聚合**：充分复用现有 `/api/admin/accounts/status` 返回的各账号 `usage.byModel` 字典，不在后端引入破坏性接口变更。
- **多节点数据隔离**：不同服务器节点的统计数据相互独立，切换节点时指标即时重算，绝不产生跨节点数据串扰。
- **除零防守**：调用量为 0 时成功率与流量占比安全显示为 `0.0%` 或 `100.0%`，严禁产生 `NaN%` 或崩溃。
- **全量测试通过**：不得破坏现有的 155 个测试套件，保持全量绿色。

## Review Focus

1. **页面内标题彻底消除**：验证页面内不存在 `accounts.title` 的 `h1` 渲染，给多服务器切换和数据表格腾出垂直首屏空间。
2. **服务器级模型统计聚合精度**：验证对当前服务器下所有账号的 `byModel` 进行归并时，总调用量、各模型请求数、成功率与流量份额占比计算精准无误。
3. **空用量节点平稳展示**：当某服务器节点没有任何调用记录或无账号时，统计看板优雅展示空状态占位，不报错且不展示失真数值。
4. **行内模型胶囊徽标**：账号表格用量列除了显示总数，行内展示调用量最多的 Top 2 模型紧凑徽标，悬浮保持完整 Popover。
5. **多服务器切换响应**：切换服务器卡片时，看板与表格数据联动刷新，且加载态与离线呼吸灯清晰准确。

---

### Task 1: 节点级模型调用统计聚合算法与单元测试实现

**Files:**
- Create: `frontend/src/utils/accountModelStats.ts`
- Create: `tests/accountModelStats.test.ts`

**Interfaces:**
- Consumes: `AccountDetail[]`, `AccountUsage`
- Produces: 
  - `calculateServerModelStats(accounts: AccountDetail[]): ServerModelStats`
  - `getAccountTopModels(usage?: AccountUsage, limit?: number): Array<{ model: string; count: number }>`

- [ ] **Step 1: 编写模型统计聚合算法的失败测试**

在 `tests/accountModelStats.test.ts` 中编写测试：

```typescript
import { calculateServerModelStats, getAccountTopModels } from '../frontend/src/utils/accountModelStats';
import { AccountDetail } from '../frontend/src/components/AccountsView';

describe('accountModelStats utility', () => {
  it('aggregates server model statistics across multiple accounts accurately', () => {
    const mockAccounts: AccountDetail[] = [
      {
        index: 0,
        name: 'acc1@gmail.com',
        status: 'active',
        isDisabled: false,
        isInvalid: false,
        isDuplicate: false,
        isExpired: false,
        isRotation: true,
        hasContext: true,
        canonicalIndex: null,
        usage: {
          totalRequests: 100,
          totalSuccess: 90,
          totalError: 10,
          byModel: {
            'gemini-2.5-flash': { requests: 80, success: 75, error: 5 },
            'gemini-2.5-pro': { requests: 20, success: 15, error: 5 }
          }
        }
      },
      {
        index: 1,
        name: 'acc2@gmail.com',
        status: 'active',
        isDisabled: false,
        isInvalid: false,
        isDuplicate: false,
        isExpired: false,
        isRotation: true,
        hasContext: false,
        canonicalIndex: null,
        usage: {
          totalRequests: 50,
          totalSuccess: 50,
          totalError: 0,
          byModel: {
            'gemini-2.5-flash': { requests: 20, success: 20, error: 0 },
            'claude-3-7-sonnet': { requests: 30, success: 30, error: 0 }
          }
        }
      }
    ];

    const stats = calculateServerModelStats(mockAccounts);

    expect(stats.totalRequests).toBe(150);
    expect(stats.totalSuccess).toBe(140);
    expect(stats.totalError).toBe(10);
    expect(stats.successRate).toBe(93.3);

    // Verify models breakdown sorted by request count descending
    expect(stats.models).toHaveLength(3);
    expect(stats.models[0].model).toBe('gemini-2.5-flash');
    expect(stats.models[0].requests).toBe(100);
    expect(stats.models[0].sharePercent).toBe(66.7);

    expect(stats.models[1].model).toBe('claude-3-7-sonnet');
    expect(stats.models[1].requests).toBe(30);

    expect(stats.models[2].model).toBe('gemini-2.5-pro');
    expect(stats.models[2].requests).toBe(20);
  });

  it('handles empty accounts list or accounts with no usage data without NaN', () => {
    const stats = calculateServerModelStats([]);
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalSuccess).toBe(0);
    expect(stats.totalError).toBe(0);
    expect(stats.successRate).toBe(100);
    expect(stats.models).toEqual([]);
  });

  it('extracts top models for an account correctly', () => {
    const usage = {
      byModel: {
        'gemini-2.5-flash': { requests: 100 },
        'gemini-2.5-pro': { requests: 20 },
        'claude-3-7-sonnet': { requests: 50 }
      }
    };
    const top2 = getAccountTopModels(usage, 2);
    expect(top2).toEqual([
      { model: 'gemini-2.5-flash', count: 100 },
      { model: 'claude-3-7-sonnet', count: 50 }
    ]);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/accountModelStats.test.ts`
Expected: FAIL（模块 `accountModelStats.ts` 不存在）。

- [ ] **Step 3: 实现 accountModelStats 工具类**

在 `frontend/src/utils/accountModelStats.ts` 中实现：
```typescript
import { AccountDetail, AccountUsage } from '../components/AccountsView';

export interface ModelStatItem {
  model: string;
  requests: number;
  success: number;
  error: number;
  successRate: number;
  sharePercent: number;
}

export interface ServerModelStats {
  totalRequests: number;
  totalSuccess: number;
  totalError: number;
  successRate: number;
  models: ModelStatItem[];
}

export function calculateServerModelStats(accounts: AccountDetail[]): ServerModelStats {
  let totalRequests = 0;
  let totalSuccess = 0;
  let totalError = 0;

  const modelMap = new Map<string, { requests: number; success: number; error: number }>();

  for (const acc of accounts) {
    const usage = acc.usage;
    if (!usage) continue;

    const accReqs = typeof usage.totalRequests === 'number'
      ? usage.totalRequests
      : (typeof usage.total === 'number' ? usage.total : 0);
    const accSucc = usage.totalSuccess ?? (usage as any).total ?? accReqs;
    const accErr = usage.totalError ?? 0;

    totalRequests += accReqs;
    totalSuccess += accSucc;
    totalError += accErr;

    if (usage.byModel) {
      for (const [rawModel, item] of Object.entries(usage.byModel)) {
        const cleanModel = rawModel.replace(/^models\//, '').trim();
        const reqCount = item.requests ?? item.usage ?? 0;
        const succCount = item.success ?? reqCount;
        const errCount = item.error ?? 0;

        const current = modelMap.get(cleanModel) || { requests: 0, success: 0, error: 0 };
        current.requests += reqCount;
        current.success += succCount;
        current.error += errCount;
        modelMap.set(cleanModel, current);
      }
    }
  }

  const overallSuccessRate = totalRequests > 0
    ? parseFloat(((totalSuccess / totalRequests) * 100).toFixed(1))
    : 100.0;

  const models: ModelStatItem[] = Array.from(modelMap.entries()).map(([model, data]) => {
    const rate = data.requests > 0
      ? parseFloat(((data.success / data.requests) * 100).toFixed(1))
      : 100.0;
    const share = totalRequests > 0
      ? parseFloat(((data.requests / totalRequests) * 100).toFixed(1))
      : 0.0;

    return {
      model,
      requests: data.requests,
      success: data.success,
      error: data.error,
      successRate: rate,
      sharePercent: share
    };
  }).sort((a, b) => b.requests - a.requests);

  return {
    totalRequests,
    totalSuccess,
    totalError,
    successRate: overallSuccessRate,
    models
  };
}

export function getAccountTopModels(usage?: AccountUsage, limit: number = 2): Array<{ model: string; count: number }> {
  if (!usage?.byModel) return [];

  const list: Array<{ model: string; count: number }> = [];
  for (const [rawModel, item] of Object.entries(usage.byModel)) {
    const cleanModel = rawModel.replace(/^models\//, '').trim();
    const count = item.requests ?? item.usage ?? 0;
    if (count > 0) {
      list.push({ model: cleanModel, count });
    }
  }

  return list.sort((a, b) => b.count - a.count).slice(0, limit);
}
```

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/accountModelStats.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add frontend/src/utils/accountModelStats.ts tests/accountModelStats.test.ts
git commit -m "feat(accounts): add calculateServerModelStats and getAccountTopModels helpers"
```

---

### Task 2: 国际化多语言词条扩充与规范化

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: 设计规范文案
- Produces: 新增 `accounts.*` 节点模型调用看板词条

- [ ] **Step 1: 更新中文语言包 zh.ts**

在 `frontend/src/i18n/locales/zh.ts` 中的 `accounts` 对象中添加：
```typescript
    serverModelStatsTitle: "节点模型调用概览",
    nodeTotalRequests: "总调用量",
    nodeSuccessRate: "成功率",
    modelTrafficShare: "模型流量占比",
    activeModels: "活跃模型明细",
    noModelUsageYet: "当前节点暂无模型调用数据",
    toggleStatsCollapse: "收起概览",
    toggleStatsExpand: "展开概览",
    modelSuccessFailed: "成功 {success} / 失败 {error}",
```

- [ ] **Step 2: 更新英文语言包 en.ts**

在 `frontend/src/i18n/locales/en.ts` 中的 `accounts` 对象中添加：
```typescript
    serverModelStatsTitle: "Node Model Usage Overview",
    nodeTotalRequests: "Total Requests",
    nodeSuccessRate: "Success Rate",
    modelTrafficShare: "Model Traffic Share",
    activeModels: "Active Models Breakdown",
    noModelUsageYet: "No model usage recorded on this node yet",
    toggleStatsCollapse: "Collapse Overview",
    toggleStatsExpand: "Expand Overview",
    modelSuccessFailed: "{success} Succeeded / {error} Failed",
```

- [ ] **Step 3: 验证语言包编译**

运行: `npm run build:frontend`
Expected: 编译通过，无类型报错。

- [ ] **Step 4: 提交 Task 2 代码**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add node model usage stats translation keys in zh and en"
```

---

### Task 3: 移除页面内部重复大标题与重构网关节点选择器

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:880-980`
- Test: `tests/accountsViewMultiServer.test.ts`

**Interfaces:**
- Consumes: `servers`, `activeServerIndex`, `serverDataMap`, `serverHealthMap`
- Produces: 去除 `<h1>{t('accounts.title')}</h1>`，高信息密度的卡片式网关选择器

- [ ] **Step 1: 编写多服务器网关选择器界面测试**

编辑 `tests/accountsViewMultiServer.test.ts`：
```typescript
  it('AccountsView should not render redundant in-page h1 accounts title', () => {
    expect(accountsCode).not.toContain('<h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">\n                {t(\'accounts.title\')}\n              </h1>');
  });

  it('AccountsView should render gateway server selector with server indices and status', () => {
    expect(accountsCode).toContain('handleSwitchServer');
    expect(accountsCode).toContain('Server {idx + 1}');
  });
```

- [ ] **Step 2: 运行测试验证**

运行: `npx jest tests/accountsViewMultiServer.test.ts`
Expected: FAIL（代码中尚包含旧的 `<h1>` 标题结构）。

- [ ] **Step 3: 重构 AccountsView 顶部布局**

在 `frontend/src/components/AccountsView.tsx` 中：
1. **删除**原先占位的桌面端重复大标题块：
   ```tsx
   {/* Modern Page Header (Desktop/Tablet only...) */}
   <div className="hidden sm:flex items-center justify-between pb-1">
     ...
     <h1>{t('accounts.title')}</h1>
     ...
   </div>
   ```
2. **升级顶部服务器网关选择栏**：
   - 当 `servers.length > 0` 时，呈现现代卡片式/胶囊切换栏；
   - 每个服务器卡片展示：
     - `Server {idx + 1}`；
     - 主机名 `({host})`；
     - 在线/离线绿色/红色呼吸指示灯（`isOffline ? 'bg-rose-500' : 'bg-emerald-500'`）；
     - 凭据数量胶囊（`{count} 个凭据`）；
     - 激活卡片采用高亮边框和深度背景（`bg-indigo-600 text-white shadow-sm`），未激活卡片采用温和的半透明悬浮样式。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx jest tests/accountsViewMultiServer.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 3 代码**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountsViewMultiServer.test.ts
git commit -m "feat(accounts): remove duplicate in-page title and upgrade gateway server switcher"
```

---

### Task 4: 实现节点专属模型调用统计大盘与账号行内 Top 模型胶囊

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Consumes: `calculateServerModelStats`, `getAccountTopModels`
- Produces: 
  - 节点模型调用统计看板（支持一键折叠/展开、流量占比条、模型细分指标网格）
  - 表格与移动端卡片用量列中的 Top 模型胶囊徽标

- [ ] **Step 1: 在 AccountsView.tsx 中引入统计逻辑与看板状态**

1. 导入函数：
   ```typescript
   import { calculateServerModelStats, getAccountTopModels } from '../utils/accountModelStats';
   import { Activity, BarChart2, ChevronUp, ChevronDown } from 'lucide-react';
   ```
2. 增加状态与计算：
   ```typescript
   const [isStatsCollapsed, setIsStatsCollapsed] = useState<boolean>(false);
   const serverModelStats = useMemo(() => {
     return calculateServerModelStats(accounts);
   }, [accounts]);
   ```

- [ ] **Step 2: 渲染节点模型调用统计大盘 (Server Model Stats Banner)**

在网关切换器下方、操作工具栏上方插入：
```tsx
{/* Node Model Usage Overview Banner */}
<div className="ui-card p-3 sm:p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
  {/* Header row */}
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-2">
      <BarChart2 className="w-4 h-4 text-indigo-500 shrink-0" />
      <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
        {t('accounts.serverModelStatsTitle', '节点模型调用概览')}
      </span>
      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
        (Server {activeServerIndex + 1})
      </span>
    </div>

    <div className="flex items-center space-x-2.5">
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300 font-mono">
        {t('accounts.nodeTotalRequests')}: <strong className="text-indigo-600 dark:text-indigo-400">{serverModelStats.totalRequests.toLocaleString()}</strong>
      </span>
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
        {t('accounts.nodeSuccessRate')}: <strong>{serverModelStats.successRate}%</strong>
      </span>
      <button
        type="button"
        onClick={() => setIsStatsCollapsed(!isStatsCollapsed)}
        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        title={isStatsCollapsed ? t('accounts.toggleStatsExpand') : t('accounts.toggleStatsCollapse')}
      >
        {isStatsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>
    </div>
  </div>

  {/* Collapsible Content */}
  {!isStatsCollapsed && (
    <div className="space-y-3 pt-1 animate-in fade-in duration-200">
      {serverModelStats.models.length > 0 ? (
        <>
          {/* Multi-color Model Traffic Share Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span>{t('accounts.modelTrafficShare')}</span>
              <span>{serverModelStats.models.length} 个模型处理中</span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              {serverModelStats.models.map((item, idx) => {
                const colors = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
                const color = colors[idx % colors.length];
                return (
                  <div
                    key={item.model}
                    style={{ width: `${item.sharePercent}%` }}
                    className={`${color} h-full transition-all duration-300`}
                    title={`${item.model}: ${item.requests}次 (${item.sharePercent}%)`}
                  />
                );
              })}
            </div>
          </div>

          {/* Model Breakdown Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {serverModelStats.models.map((item, idx) => {
              const colors = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
              const dotColor = colors[idx % colors.length];
              return (
                <div
                  key={item.model}
                  className="p-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--border-subtle)] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                    <span className="font-mono font-medium truncate text-slate-800 dark:text-slate-200" title={item.model}>
                      {item.model}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {item.requests.toLocaleString()} <span className="text-[10px] text-slate-400">({item.sharePercent}%)</span>
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                      {item.successRate}% 成功
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-center py-2 text-xs text-slate-400 dark:text-slate-500 font-mono">
          {t('accounts.noModelUsageYet')}
        </div>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 3: 表格与卡片用量列增加 Top 模型胶囊徽标**

在桌面端表格中，用量列中展示：
```tsx
{/* Usage Column */}
<td className="px-4 py-3 text-right">
  <div
    className="inline-flex flex-col items-end cursor-pointer group"
    onClick={(e) => handleTogglePopover(e, acc.index)}
    onMouseEnter={(e) => handleMouseEnterPopover(e, acc.index)}
  >
    <div className="flex items-center space-x-1 font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
      <span>{totalUsage.toLocaleString()}</span>
      <span className="text-[10px] px-1 py-0.2 rounded font-normal bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        {successRate}%
      </span>
    </div>
    {/* Inline Top Models Badges */}
    {topModels.length > 0 && (
      <div className="flex items-center space-x-1 mt-0.5">
        {topModels.map(m => (
          <span
            key={m.model}
            className="text-[9px] font-mono px-1 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-slate-500 dark:text-slate-400"
          >
            {m.model.replace('gemini-', '')}: {m.count}
          </span>
        ))}
      </div>
    )}
  </div>
</td>
```
并在移动端卡片视图的用量展示中同步优化。

- [ ] **Step 4: 编译前端验证无语法/类型错误**

运行: `npm run build:frontend`
Expected: 编译通过，无类型或打包错误。

- [ ] **Step 5: 提交 Task 4 代码**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(accounts): add server model stats banner and inline top model capsules"
```

---

### Task 5: 交互测试更新与全量回归保障

**Files:**
- Modify: `tests/accountsViewMultiServer.test.ts`
- Verify: 全量 155+ 测试套件

- [ ] **Step 1: 扩充 accountsViewMultiServer.test.ts 测试用例**

在 `tests/accountsViewMultiServer.test.ts` 中补充对模型统计看板与行内胶囊的断言：
```typescript
  it('AccountsView should integrate server model stats calculation and banner', () => {
    expect(accountsCode).toContain('calculateServerModelStats');
    expect(accountsCode).toContain('serverModelStats');
    expect(accountsCode).toContain('serverModelStatsTitle');
  });

  it('AccountsView should integrate inline top models in account rows', () => {
    expect(accountsCode).toContain('getAccountTopModels');
  });
```

- [ ] **Step 2: 运行测试验证**

运行: `npx jest tests/accountsViewMultiServer.test.ts tests/accountModelStats.test.ts`
Expected: PASS。

- [ ] **Step 3: 运行全量回归测试**

运行: `npm test`
Expected: 156 个测试套件全量绿色通过（156 passed, 0 failed）。

- [ ] **Step 4: 提交 Task 5 代码**

```bash
git add tests/accountsViewMultiServer.test.ts
git commit -m "test(accounts): update multi-server UI test for model stats banner and inline badges"
```

---

## Plan Self-Review Check

1. **Spec Coverage**:
   - 彻底移除重复 `<h1>账号管理</h1>` 标题 -> Task 3
   - 现代卡片式多网关节点切换栏 -> Task 3
   - 节点专属模型调用统计大盘与流量切分条 -> Task 1, Task 4
   - 账号表格行内 Top 2 主力模型胶囊徽标 -> Task 1, Task 4
   - 多语言国际化规范更新 -> Task 2
   - 完整的单元测试与全量回归 -> Task 1, Task 5
2. **Placeholder Scan**: 扫描确认无任何 "TODO", "TBD", "implement later" 占位符。
3. **Type Consistency**: `ServerModelStats`, `ModelStatItem`, `calculateServerModelStats` 在前后端与测试中类型完全自洽。
4. **Review Focus**: 包含无模型数据防守、除零防守、多服务器隔离计算、行内胶囊展示。

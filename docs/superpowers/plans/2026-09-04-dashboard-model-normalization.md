# 控制台模型矩阵置顶优先展示与模型归一化实施计划 (Dashboard Model Normalization & Top Placement Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化控制台概览页面，将模型性能与分布矩阵和系统运行时配置矩阵置顶优先展示；实现模型名称 `-high` 尾缀智能归一化算法（将 `gemini-3.8-flash-high` 归入 `gemini-3.8-flash`），在桌面端表格中拆分标准与 High 请求列；在移动端恢复上一版经典简洁卡片流设计；并在趋势图表中统一映射基准模型。

**Architecture:** 
- 在 `frontend/src/utils/modelHelpers.ts` 中封装模型名称归一化算法 `normalizeModelName` 与汇总聚合函数 `aggregateModelStats`。
- 在 `frontend/src/i18n/locales/` 中补充 `standardRequests`、`highRequests` 等多语言词条。
- 重构 `ModelPerformanceMatrix.tsx` 为双态自适应组件：桌面端 (`md:block`) 全宽多维分析大表（包含 Standard 与 High 独立列）；移动端 (`md:hidden`) 简洁卡片列表（上方单行排布模型与明细，下方横贯大跨度圆角进度条）。
- 在 `DashboardView.tsx` 中调整垂直层级：KPI Cards -> ModelPerformanceMatrix -> SystemRuntimeMatrix -> 图表区；并使用归一化基准模型渲染图表曲线与图例。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, SVG, Jest, Vite.

## Global Constraints

- **Model Normalization**: 模型尾缀以 `-high` 结尾的必须归一化为基准模型，不得作为单独行在矩阵中分散统计。
- **Dual-State View**: 桌面端具备标准与 High 独立列，移动端渲染上一版经典紧凑卡片流，避免小屏横向滚动表格。
- **Top Priority Placement**: 模型性能矩阵与系统配置矩阵在页面中置于趋势图表区之上。
- **100% Theme Conformance**: 彻底杜绝深色硬编码，全面使用主题 CSS 变量。
- **Strict TypeScript & TDD**: 严格类型安全，前端后端编译 0 报错，全量 Jest 测试套件通过。

---

### Task 1: 编写模型归一化与聚合算法工具及测试

**Files:**
- Create: `frontend/src/utils/modelHelpers.ts`
- Create: `tests/modelHelpers.test.ts`

**Interfaces:**
- Produces:
  - `normalizeModelName(rawModel: string): { baseModel: string; isHigh: boolean }`
  - `aggregateModelStats(timeSeries: any[]): { totalRequests: number; list: ModelStatItem[] }`
  - `aggregateTimeSeriesModels(timeSeries: any[]): any[]`

- [ ] **Step 1: 编写测试文件 `tests/modelHelpers.test.ts`**

```typescript
import {
  normalizeModelName,
  aggregateModelStats
} from '../frontend/src/utils/modelHelpers';

describe('Model Normalization & Aggregation Helpers', () => {
  test('normalizeModelName should strip -high suffix and flag isHigh', () => {
    expect(normalizeModelName('gemini-3.8-flash-high')).toEqual({
      baseModel: 'gemini-3.8-flash',
      isHigh: true
    });
    expect(normalizeModelName('gemini-3.8-flash')).toEqual({
      baseModel: 'gemini-3.8-flash',
      isHigh: false
    });
    expect(normalizeModelName('claude-3-5-sonnet-20241022')).toEqual({
      baseModel: 'claude-3-5-sonnet-20241022',
      isHigh: false
    });
  });

  test('aggregateModelStats should group -high and standard into the same base model', () => {
    const mockTimeSeries = [
      {
        time: '12:00',
        total: 15,
        models: {
          'gemini-3.8-flash': 10,
          'gemini-3.8-flash-high': 5
        },
        modelDurations: {
          'gemini-3.8-flash': 500,
          'gemini-3.8-flash-high': 800
        }
      }
    ];

    const result = aggregateModelStats(mockTimeSeries);
    expect(result.totalRequests).toBe(15);
    expect(result.list.length).toBe(1);

    const flash = result.list[0];
    expect(flash.model).toBe('gemini-3.8-flash');
    expect(flash.requests).toBe(15);
    expect(flash.standardRequests).toBe(10);
    expect(flash.highRequests).toBe(5);
    expect(flash.percentage).toBe(100);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/modelHelpers.test.ts`
Expected: FAIL (Cannot find module '../frontend/src/utils/modelHelpers')

- [ ] **Step 3: 实现 `frontend/src/utils/modelHelpers.ts`**

```typescript
export interface NormalizedModelInfo {
  baseModel: string;
  isHigh: boolean;
}

export interface ModelStatItem {
  model: string;
  requests: number;
  standardRequests: number;
  highRequests: number;
  percentage: number;
  avgLatency: number;
}

/**
 * Normalizes model names by stripping suffixes like '-high'.
 */
export function normalizeModelName(rawModel: string): NormalizedModelInfo {
  if (!rawModel) return { baseModel: 'unknown', isHigh: false };
  if (rawModel.endsWith('-high')) {
    return {
      baseModel: rawModel.slice(0, -5),
      isHigh: true
    };
  }
  return {
    baseModel: rawModel,
    isHigh: false
  };
}

/**
 * Aggregates model metrics across timeSeries into grouped base models with standard vs high requests.
 */
export function aggregateModelStats(timeSeries: any[]): { totalRequests: number; list: ModelStatItem[] } {
  const summary: Record<string, {
    requests: number;
    standardRequests: number;
    highRequests: number;
    totalDuration: number;
    durationCount: number;
  }> = {};

  let totalReqs = 0;

  timeSeries.forEach(p => {
    if (p.models) {
      Object.entries(p.models).forEach(([rawModel, count]) => {
        const numCount = Number(count) || 0;
        const { baseModel, isHigh } = normalizeModelName(rawModel);

        if (!summary[baseModel]) {
          summary[baseModel] = {
            requests: 0,
            standardRequests: 0,
            highRequests: 0,
            totalDuration: 0,
            durationCount: 0
          };
        }

        summary[baseModel].requests += numCount;
        if (isHigh) {
          summary[baseModel].highRequests += numCount;
        } else {
          summary[baseModel].standardRequests += numCount;
        }
        totalReqs += numCount;
      });
    }

    if (p.modelDurations) {
      Object.entries(p.modelDurations).forEach(([rawModel, dur]) => {
        const numDur = Number(dur) || 0;
        const { baseModel } = normalizeModelName(rawModel);

        if (!summary[baseModel]) {
          summary[baseModel] = {
            requests: 0,
            standardRequests: 0,
            highRequests: 0,
            totalDuration: 0,
            durationCount: 0
          };
        }

        summary[baseModel].totalDuration += numDur;
        summary[baseModel].durationCount += 1;
      });
    }
  });

  const list: ModelStatItem[] = Object.entries(summary)
    .map(([model, data]) => ({
      model,
      requests: data.requests,
      standardRequests: data.standardRequests,
      highRequests: data.highRequests,
      percentage: totalReqs > 0 ? (data.requests / totalReqs) * 100 : 0,
      avgLatency: data.durationCount > 0 ? Math.round(data.totalDuration / data.durationCount) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  return {
    totalRequests: totalReqs,
    list
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/modelHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: 提交任务 1 改动**

```bash
git add frontend/src/utils/modelHelpers.ts tests/modelHelpers.test.ts
git commit -m "feat(models): add normalizeModelName and aggregateModelStats helpers"
```

---

### Task 2: 补充中英 i18n 字典词条

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `useTranslation`
- Produces: `dashboard.standardReqs`, `dashboard.highReqs`, `dashboard.highBadge`

- [ ] **Step 1: 在 `frontend/src/i18n/locales/zh.ts` 中补充词条**

在 `dashboard` 对象中增加：
```typescript
    standardReqs: "标准请求",
    highReqs: "High 规格",
    highBadge: "High",
```

- [ ] **Step 2: 在 `frontend/src/i18n/locales/en.ts` 中补充词条**

在 `dashboard` 对象中增加：
```typescript
    standardReqs: "Standard",
    highReqs: "High Spec",
    highBadge: "High",
```

- [ ] **Step 3: 运行测试检查无语法报错**

Run: `npx jest tests/modelHelpers.test.ts`
Expected: PASS

- [ ] **Step 4: 提交 i18n 改动**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add standard and high spec requests translations"
```

---

### Task 3: 重构 ModelPerformanceMatrix 实现桌面端拆分列与移动端经典卡片流

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`
- Create: `tests/dashboardModelNormalization.test.ts`

**Interfaces:**
- Consumes: `ModelStatItem` with `standardRequests` and `highRequests`
- Produces: 
  - 桌面端 (`hidden md:block`): 表格中包含 `标准请求 (Standard)` 与 `High 规格 (High)` 独立列
  - 移动端 (`md:hidden`): 单行展示模型名+延迟微晶，右侧 `${standard}/${high} High`，下方大通栏圆角流光进度条

- [ ] **Step 1: 编写 `tests/dashboardModelNormalization.test.ts` 静态断言**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('ModelPerformanceMatrix Normalization & Dual-State View', () => {
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');

  let matrixContent: string;
  let dashboardContent: string;

  beforeAll(() => {
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
    dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
  });

  test('ModelPerformanceMatrix should have desktop table view and mobile card view', () => {
    expect(matrixContent).toContain('hidden md:block');
    expect(matrixContent).toContain('md:hidden');
  });

  test('desktop table view should display standardRequests and highRequests columns', () => {
    expect(matrixContent).toContain('standardRequests');
    expect(matrixContent).toContain('highRequests');
  });

  test('DashboardView should place ModelPerformanceMatrix and SystemRuntimeMatrix before charts', () => {
    const matrixIndex = dashboardContent.indexOf('<ModelPerformanceMatrix');
    const systemIndex = dashboardContent.indexOf('<SystemRuntimeMatrix');
    const chartIndex = dashboardContent.indexOf('volumeBarGrad');

    expect(matrixIndex).toBeGreaterThan(0);
    expect(systemIndex).toBeGreaterThan(0);
    expect(chartIndex).toBeGreaterThan(0);

    // Matrix and System must appear BEFORE chart in the DOM
    expect(matrixIndex).toBeLessThan(chartIndex);
    expect(systemIndex).toBeLessThan(chartIndex);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/dashboardModelNormalization.test.ts`
Expected: FAIL

- [ ] **Step 3: 重构 `ModelPerformanceMatrix.tsx`**

```tsx
import React from 'react';
import { Layers, Zap } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { ModelStatItem } from '../../utils/modelHelpers';

export interface ModelPerformanceMatrixProps {
  modelStats: {
    totalRequests: number;
    list: ModelStatItem[];
  };
  getModelColor: (modelName: string, index: number) => string;
  range?: number | 'today';
}

export const ModelPerformanceMatrix: React.FC<ModelPerformanceMatrixProps> = ({
  modelStats,
  getModelColor,
  range = 24,
}) => {
  const { t } = useTranslation();
  const count = modelStats?.list?.length || 0;

  const getThroughput = (requests: number) => {
    if (!requests || requests <= 0) return '0.00 req/s';
    let hours = typeof range === 'number' ? range : 24;
    if (range === 'today') {
      const now = new Date();
      hours = Math.max(1, now.getHours() + now.getMinutes() / 60);
    }
    const qps = requests / (hours * 3600);
    return `${qps.toFixed(2)} req/s`;
  };

  return (
    <div className="ui-card p-4 sm:p-5 flex flex-col w-full overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold text-[var(--text-primary)] tracking-wider uppercase">
            {t('dashboard.modelPerformanceTitle')}
          </h3>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full font-mono border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium">
          {count} {t('dashboard.modelsTracked')}
        </span>
      </div>

      {!modelStats?.list || count === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[140px] text-slate-500 text-xs font-mono">
          {t('dashboard.noData')}
        </div>
      ) : (
        <>
          {/* 1. Desktop Multi-column DataTable (Hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto w-full no-scrollbar">
            <table className="w-full text-left text-xs font-mono border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-medium">{t('dashboard.modelName', '模型名称')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.standardReqs', '标准请求')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.highReqs', 'High 规格')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.totalTransactions', '总请求量')}</th>
                  <th className="py-2.5 px-4 font-medium min-w-[180px]">{t('dashboard.trafficShare', '流量占比')}</th>
                  <th className="py-2.5 px-3 font-medium text-center">{t('dashboard.averageLatency', '平均延迟')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.throughputRate', '平均吞吐')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]/50">
                {modelStats.list.map((item, index) => {
                  const color = getModelColor(item.model, index);
                  const latencyColor = item.avgLatency < 1000
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : item.avgLatency < 3000
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

                  return (
                    <tr key={item.model} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                      {/* Model Name */}
                      <td className="py-3 px-3 font-medium text-[var(--text-primary)]">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                          <span className="truncate max-w-[220px]" title={item.model}>
                            {item.model}
                          </span>
                        </div>
                      </td>

                      {/* Standard Requests */}
                      <td className="py-3 px-3 text-right text-[var(--text-primary)] font-medium">
                        {item.standardRequests ? item.standardRequests.toLocaleString() : '-'}
                      </td>

                      {/* High Spec Requests */}
                      <td className="py-3 px-3 text-right font-medium">
                        {item.highRequests > 0 ? (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-semibold">
                            <Zap className="w-2.5 h-2.5" />
                            <span>{item.highRequests.toLocaleString()}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Total Requests */}
                      <td className="py-3 px-3 text-right font-bold text-indigo-400">
                        {item.requests.toLocaleString()}
                      </td>

                      {/* Traffic Share & Progress Bar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-[var(--text-primary)] font-semibold w-11 text-right shrink-0">
                            {item.percentage.toFixed(1)}%
                          </span>
                          <div className="flex-1 bg-[var(--border-subtle)]/40 h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full transition-all duration-500 rounded-full"
                              style={{
                                width: `${Math.max(item.percentage, 2)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Avg Latency */}
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded border text-[11px] font-medium inline-block ${latencyColor}`}>
                          ~{item.avgLatency}ms
                        </span>
                      </td>

                      {/* Throughput */}
                      <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
                        {getThroughput(item.requests)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 2. Mobile Classic Compact Card List (Hidden on desktop) */}
          <div className="md:hidden space-y-3">
            {modelStats.list.map((item, index) => {
              const color = getModelColor(item.model, index);
              return (
                <div key={item.model} className="space-y-1.5 p-2 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]/60">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-mono font-semibold text-[var(--text-primary)] truncate max-w-[130px]" title={item.model}>
                        {item.model}
                      </span>
                      <span className="text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0">
                        ~{item.avgLatency}ms
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0 font-mono text-[11px] text-[var(--text-secondary)]">
                      <span>
                        {item.standardRequests}
                        {item.highRequests > 0 && (
                          <span className="text-purple-400 font-semibold ml-1">+{item.highRequests}H</span>
                        )}
                      </span>
                      <span className="text-[var(--text-primary)] font-bold w-10 text-right">
                        {item.percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-[var(--border-subtle)]/40 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300 rounded-full"
                      style={{
                        width: `${Math.max(item.percentage, 2)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ModelPerformanceMatrix;
```

- [ ] **Step 4: 运行测试检查矩阵改动**

Run: `npx jest tests/dashboardModelNormalization.test.ts`
Expected: dual-state 与 desktop columns 测试通过

- [ ] **Step 5: 提交改动**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx
git commit -m "feat(dashboard): add standard/high columns in desktop table and classic cards on mobile"
```

---

### Task 4: 调整页面置顶优先层级并接入模型归一化引擎

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `aggregateModelStats`, `normalizeModelName`
- Produces: 
  - Tier 1: 4 KPI Cards
  - Tier 2: `ModelPerformanceMatrix`（通栏优先展示）
  - Tier 3: `SystemRuntimeMatrix`（通栏优先展示）
  - Tier 4: 通栏图表 1 (请求总量 + 归一化多模型分布)
  - Tier 5: 通栏图表 2 (归一化多模型延迟趋势)

- [ ] **Step 1: 在 `DashboardView.tsx` 中引入模型归一化工具并重构 `modelStatsSummary`**

```typescript
import { aggregateModelStats, normalizeModelName } from '../utils/modelHelpers';

// 替换原 modelStatsSummary useMemo:
const modelStatsSummary = useMemo(() => {
  return aggregateModelStats(timeSeries);
}, [timeSeries]);
```

- [ ] **Step 2: 归一化图表中的 `allModels` 与模型路径生成**

在 `DashboardView.tsx` 中：
```typescript
const allModels = Array.from(new Set(timeSeries.flatMap(p => {
  return Object.keys(p.models || {}).map(m => normalizeModelName(m).baseModel);
})));
```
同时调整 `getModelPath` 与 `getModelLatencyPath`：对同一时间点下归入同一基准模型的 count 进行累加求和，保证图表中每条曲线代表唯一的基准模型。

- [ ] **Step 3: 调整 JSX 中的组件层级顺序**

将：
```tsx
{/* 1. KPI Cards */}
...
{/* 2. Top Priority: Full-width Model Performance DataTable & Matrix */}
<ModelPerformanceMatrix
  modelStats={modelStatsSummary}
  getModelColor={getModelColor}
  range={range}
/>

{/* 3. Top Priority: Full-width System Runtime Matrix */}
<SystemRuntimeMatrix config={cfg} />

{/* 4. Full-width Interactive APM Charts */}
<div className="space-y-6">
  {/* Chart 1: Merged Volume & Model Distribution */}
  ...
  {/* Chart 2: Model Latency Trend */}
  ...
</div>
```

- [ ] **Step 4: 运行测试验证顺序与断言全部通过**

Run: `npx jest tests/dashboardModelNormalization.test.ts`
Expected: PASS

- [ ] **Step 5: 提交改动**

```bash
git add frontend/src/components/DashboardView.tsx tests/dashboardModelNormalization.test.ts
git commit -m "feat(dashboard): prioritize matrices at top and normalize models in charts"
```

---

### Task 5: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [ ] **Step 1: 运行全量 Jest 测试套件**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test`
Expected: 44 个测试套件全部 PASS

- [ ] **Step 2: 运行前端 Vite 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend`
Expected: 0 错误构建成功

- [ ] **Step 3: 运行后端 TypeScript 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend`
Expected: 0 错误构建成功

- [ ] **Step 4: 运行全量构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build`
Expected: SUCCESS

# 控制台页面通栏分层与模型矩阵全宽平铺实施计划 (Dashboard Full-Width Layout Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 取消控制台页面 6:4 栅格布局，采用垂直通栏分层流（Vertical Tiered Flow）；将每小时请求量趋势与模型分布趋势合二为一，形成底色总量柱状/面积波形与多模型品牌色平滑曲线并存的综合全景大图；将模型性能与分布矩阵平铺展开为全宽多维分析大表格（展示请求量、流光占比、平均耗时、吞吐速率 QPS 与健康态）；并将系统运行时配置矩阵优化为通栏 6 芯片网格。

**Architecture:** 
- 在 `DashboardView.tsx` 中移除 `grid grid-cols-1 lg:grid-cols-12` 栅格，各主要模块采用通栏满宽垂直层叠结构。
- 合并图表：将原本分离的请求量柱状图与多模型折线分布融合在同一张通栏图表中，柱状/面积直观反映总水位，上覆各模型平滑贝塞尔曲线呈现结构贡献；Tooltip 同时汇集总量、成功率与各模型精确占比。
- 全宽模型性能表格：重构 `ModelPerformanceMatrix.tsx` 为 100% 全宽现代化数据分析表格（DataTable），横向延展展示模型名、请求数、大跨度流光占比进度条、平均延迟与处理吞吐量。
- 底部运行时配置：重构 `SystemRuntimeMatrix.tsx` 为自适应 6 列微晶芯片网格 (`lg:grid-cols-6`)。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, SVG, Jest, Vite.

## Global Constraints

- **No 6:4 Grid Constraint**: 彻底移除 `lg:grid-cols-12` 划分，所有图表与数据矩阵 100% 满宽舒展。
- **Merged Volume & Distribution Chart**: 图表 1 必须同时呈现总请求量（柱状或面积）与各模型分布线条，不能仅展示单一指标。
- **DataTable Rich Columns**: 全宽模型表格必须包含模型名称、请求总数、流量占比与大跨度进度条、平均延迟、处理吞吐量（req/s）。
- **100% Theme Conformance**: 遵循主题 CSS 变量（`--bg-surface`, `--bg-surface-sub`, `--border-subtle`, `--text-primary`, `--text-secondary`）。
- **Strict TypeScript & TDD**: 严格类型安全，前端后端编译 0 报错，全量 Jest 测试套件通过。

---

### Task 1: 编写布局与图表合并及矩阵平铺的测试断言

**Files:**
- Create: `tests/dashboardFullwidthLayout.test.ts`

**Interfaces:**
- Consumes: `DashboardView.tsx`, `ModelPerformanceMatrix.tsx`, `SystemRuntimeMatrix.tsx`
- Produces: 静态与组件行为断言，检验移除 6:4 栅格、图表 1 具备总量与多模型混合绘制、模型矩阵具备多维列与流光进度条、系统配置为 6 芯片网格。

- [ ] **Step 1: 编写测试文件 `tests/dashboardFullwidthLayout.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard Full-Width Layout & Merged Charts', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');
  const systemPath = path.resolve(__dirname, '../frontend/src/components/dashboard/SystemRuntimeMatrix.tsx');

  let dashboardContent: string;
  let matrixContent: string;
  let systemContent: string;

  beforeAll(() => {
    dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
    systemContent = fs.readFileSync(systemPath, 'utf-8');
  });

  test('should eliminate 6:4 split grid classes from DashboardView', () => {
    expect(dashboardContent).not.toContain('lg:grid-cols-12');
    expect(dashboardContent).not.toContain('lg:col-span-7');
    expect(dashboardContent).not.toContain('lg:col-span-5');
  });

  test('merged chart 1 should render both total volume bars/area and multi-model distribution paths', () => {
    // Chart 1 renders volume (bars/area)
    expect(dashboardContent).toContain('volumeBarGrad');
    // Chart 1 renders multi-model distribution lines or curves
    expect(dashboardContent).toContain('getModelPath');
    expect(dashboardContent).toContain('allModels');
  });

  test('ModelPerformanceMatrix should render full-width table view with throughput and wide progress bar', () => {
    expect(matrixContent).toContain('table');
    expect(matrixContent).toContain('Throughput');
    expect(matrixContent).toContain('req/s');
    expect(matrixContent).toContain('percentage');
  });

  test('SystemRuntimeMatrix should use full-width 6-column responsive grid', () => {
    expect(systemContent).toContain('lg:grid-cols-6');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/dashboardFullwidthLayout.test.ts`
Expected: FAIL (因为目前 `DashboardView.tsx` 仍有 `lg:grid-cols-12`，且矩阵尚未重构为全宽 table)

- [ ] **Step 3: 提交初始测试文件**

```bash
git add tests/dashboardFullwidthLayout.test.ts
git commit -m "test(dashboard): add assertions for full-width tiered layout and merged charts"
```

---

### Task 2: 补充中英多语言字典词条 (i18n)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `useTranslation`
- Produces: 
  - `dashboard.mergedVolumeTitle`: "请求总量与多模型分布趋势" / "Request Volume & Model Distribution"
  - `dashboard.modelName`: "模型名称" / "Model Name"
  - `dashboard.trafficShare`: "流量占比" / "Traffic Share"
  - `dashboard.throughputRate`: "平均吞吐" / "Throughput"
  - `dashboard.modelHealth`: "健康状态" / "Health"

- [ ] **Step 1: 在 `frontend/src/i18n/locales/zh.ts` 中补充词条**

在 `dashboard` 对象中增加：
```typescript
    mergedVolumeTitle: "请求总量与多模型分布趋势",
    modelName: "模型名称",
    trafficShare: "流量占比",
    throughputRate: "平均吞吐",
    modelHealth: "健康状态",
```

- [ ] **Step 2: 在 `frontend/src/i18n/locales/en.ts` 中补充词条**

在 `dashboard` 对象中增加：
```typescript
    mergedVolumeTitle: "Request Volume & Model Distribution",
    modelName: "Model Name",
    trafficShare: "Traffic Share",
    throughputRate: "Throughput",
    modelHealth: "Health",
```

- [ ] **Step 3: 运行测试确认 i18n 无语法错误**

Run: `npx jest tests/chartHelpers.test.ts`
Expected: PASS

- [ ] **Step 4: 提交 i18n 改动**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add merged chart and model datatable column translations"
```

---

### Task 3: 重构 ModelPerformanceMatrix 为全宽现代化数据分析表格

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`

**Interfaces:**
- Consumes: `modelStats: { totalRequests: number; list: ModelStatItem[] }`, `getModelColor`, `range: number | 'today'`
- Produces: 
  - 100% 全宽数据分析卡片
  - 现代化 DataTable（模型标识、请求数、大跨度色彩进度条、平均延迟微晶、平均吞吐速率 QPS、健康状态徽章）
  - 完美适配移动端（支持卡片/表格水平自适应滚动）

- [ ] **Step 1: 在 `ModelPerformanceMatrix.tsx` 中更新 Props 接口与吞吐量计算**

```typescript
export interface ModelPerformanceMatrixProps {
  modelStats: {
    totalRequests: number;
    list: ModelStatItem[];
  };
  getModelColor: (modelName: string, index: number) => string;
  range?: number | 'today';
}
```
通过 `range` 计算每个模型的吞吐量：
```typescript
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
```

- [ ] **Step 2: 重构 JSX 结构为通栏全宽表格**

```tsx
<div className="ui-card p-5 flex flex-col w-full overflow-hidden">
  {/* Header */}
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

  {/* Content: Full-width Table */}
  {!modelStats?.list || count === 0 ? (
    <div className="flex-1 flex items-center justify-center min-h-[140px] text-slate-500 text-xs font-mono">
      {t('dashboard.noData')}
    </div>
  ) : (
    <div className="overflow-x-auto w-full no-scrollbar">
      <table className="w-full text-left text-xs font-mono border-collapse min-w-[650px]">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] text-slate-400 text-[11px] uppercase tracking-wider">
            <th className="py-2.5 px-3 font-medium">{t('dashboard.modelName', '模型名称')}</th>
            <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.totalTransactions', '请求总量')}</th>
            <th className="py-2.5 px-4 font-medium min-w-[200px]">{t('dashboard.trafficShare', '流量占比')}</th>
            <th className="py-2.5 px-3 font-medium text-center">{t('dashboard.averageLatency', '平均延迟')}</th>
            <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.throughputRate', '平均吞吐')}</th>
            <th className="py-2.5 px-3 font-medium text-center">{t('dashboard.modelHealth', '健康状态')}</th>
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
                {/* 1. Model Name */}
                <td className="py-3 px-3 font-medium text-[var(--text-primary)]">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                    <span className="truncate max-w-[220px]" title={item.model}>
                      {item.model}
                    </span>
                  </div>
                </td>

                {/* 2. Total Requests */}
                <td className="py-3 px-3 text-right font-bold text-indigo-400">
                  {item.requests.toLocaleString()}
                </td>

                {/* 3. Traffic Share & Wide Progress Bar */}
                <td className="py-3 px-4">
                  <div className="flex items-center space-x-3">
                    <span className="text-[var(--text-primary)] font-semibold w-10 text-right shrink-0">
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

                {/* 4. Avg Latency Badge */}
                <td className="py-3 px-3 text-center">
                  <span className={`px-2 py-0.5 rounded border text-[11px] font-medium inline-block ${latencyColor}`}>
                    ~{item.avgLatency}ms
                  </span>
                </td>

                {/* 5. Throughput Rate */}
                <td className="py-3 px-3 text-right text-slate-400">
                  {getThroughput(item.requests)}
                </td>

                {/* 6. Health Indicator */}
                <td className="py-3 px-3 text-center">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold inline-flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>ACTIVE</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</div>
```

- [ ] **Step 3: 运行测试检查矩阵部分通过情况**

Run: `npx jest tests/dashboardFullwidthLayout.test.ts`
Expected: ModelPerformanceMatrix 测试项 PASS

- [ ] **Step 4: 提交模型矩阵改动**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx
git commit -m "feat(dashboard): convert ModelPerformanceMatrix into a full-width rich datatable"
```

---

### Task 4: 重构 SystemRuntimeMatrix 为全宽 6 列网格

**Files:**
- Modify: `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx`

**Interfaces:**
- Consumes: `config: Record<string, any>`
- Produces: 
  - 100% 全宽 `ui-card`
  - 6 列自适应网格 `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3`

- [ ] **Step 1: 在 `SystemRuntimeMatrix.tsx` 中将网格改为 `lg:grid-cols-6`**

在 `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx` 中：
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1 font-mono text-xs">
  {/* 6 runtime chips */}
</div>
```

- [ ] **Step 2: 运行测试验证网格断言通过**

Run: `npx jest tests/dashboardFullwidthLayout.test.ts`
Expected: SystemRuntimeMatrix 测试项 PASS

- [ ] **Step 3: 提交系统配置矩阵改动**

```bash
git add frontend/src/components/dashboard/SystemRuntimeMatrix.tsx
git commit -m "feat(dashboard): make SystemRuntimeMatrix a full-width 6-column responsive grid"
```

---

### Task 5: 移除 6:4 栅格，实现通栏垂直分层流与请求总量+多模型分布合并图表

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx:438-1015`

**Interfaces:**
- Consumes: `timeSeries`, `allModels`, `getModelColor`, `volumeChartType`, `hoveredIndex`
- Produces:
  - 彻底移除 `lg:grid-cols-12` 栅格，改为 `space-y-6` 垂直全宽层叠
  - **图表 1 (合并全景大图表)**：
    - 底层：全网每小时请求量柱状图 (或平滑面积波形)
    - 上层：叠加绘制各模型的品牌色平滑曲线与彩色节点
    - 顶栏：模型色彩图例横排胶囊、形态切换药丸、悬浮时刻指示
    - 悬浮卡片：总数、成功/错误比、各模型精确数量与占比明细
  - **图表 2 (响应延迟趋势图表)**：
    - 独占通栏全宽展示各模型毫秒耗时曲线
  - **Tier 3 & 4**：
    - 通栏平铺展示 `ModelPerformanceMatrix`（传入 `range`）与 `SystemRuntimeMatrix`

- [ ] **Step 1: 在 `DashboardView.tsx` 中移除 6:4 栅格容器**

将：
```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
  <div className="lg:col-span-7 xl:col-span-8 space-y-6">
    ...
  </div>
  <div className="lg:col-span-5 xl:col-span-4 space-y-6">
    ...
  </div>
</div>
```
重构为垂直通栏分层结构：
```tsx
{/* Tier 2: Full-width Interactive APM Charts */}
<div className="space-y-6">
  {/* Chart 1: Merged Request Volume & Model Distribution */}
  ...
  {/* Chart 2: Model Latency Trend */}
  ...
</div>

{/* Tier 3: Full-width Model Performance DataTable */}
<ModelPerformanceMatrix
  modelStats={modelStatsSummary}
  getModelColor={getModelColor}
  range={range}
/>

{/* Tier 4: Full-width System Runtime Matrix (6-col grid) */}
<SystemRuntimeMatrix config={cfg} />
```

- [ ] **Step 2: 实现图表 1 (请求总量 + 多模型分布复合图表)**

在同一个 `<svg viewBox="0 0 800 240">` 画布中：
1. **底层绘制总量**：
   - 当 `volumeChartType === 'area'`：渲染柔和半透明面积底图与贝塞尔曲线；
   - 当 `volumeChartType === 'bar'`：渲染半透明低对比圆角柱状图。
2. **上层叠加多模型平滑曲线**：
   - 遍历 `allModels`，为每个模型渲染 `getModelPath(model)` 平滑折线与每个节点的圆形点阵 `circle`；
3. **顶栏丰富图例与控件**：
   - 渲染各模型的品牌色圆点与标签，让用户一眼看懂各个线条代表哪个模型；
   - 提供 `[ 📊 柱状直方 | 📈 平滑面积 ]` 切换药丸；
4. **全景 Tooltip 悬浮卡片**：
   - 悬浮时展示：时刻、总数、成功/失败数、各模型的请求次数与占比（如 `claude-3-5: 820 (58%)`）。

- [ ] **Step 3: 实现图表 2 (通栏全宽响应延迟趋势图)**

满宽展示多模型的平均延迟曲线，时间轴宽度提升，彻底消除曲线互相拥挤遮挡的问题。

- [ ] **Step 4: 运行全量测试验证全部通过**

Run: `npx jest tests/dashboardFullwidthLayout.test.ts`
Expected: 4 个测试全部 PASS

- [ ] **Step 5: 提交改动**

```bash
git add frontend/src/components/DashboardView.tsx tests/dashboardFullwidthLayout.test.ts
git commit -m "feat(dashboard): replace 6:4 grid with vertical tiered full-width layout and merged chart"
```

---

### Task 6: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [ ] **Step 1: 运行全量 Jest 测试套件**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test`
Expected: 43 个测试套件全部 PASS

- [ ] **Step 2: 运行前端 Vite 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend`
Expected: 0 错误构建成功

- [ ] **Step 3: 运行后端 TypeScript 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend`
Expected: 0 错误构建成功

- [ ] **Step 4: 运行全量构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build`
Expected: SUCCESS

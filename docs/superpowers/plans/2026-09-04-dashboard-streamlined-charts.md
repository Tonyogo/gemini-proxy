# 控制台移除系统配置矩阵与图表清晰直观重构实施计划 (Dashboard Streamlined Charts Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除控制台页面中的系统运行时参数矩阵；重构图表区域为单一全景 APM 大图表容器（支持流量趋势与延迟走势 Tab 切换）；流量图升级为多模型分段彩色堆叠柱状图 (Stacked Bar Chart)，消除交叉线条干扰；延迟图引入全网综合基底波形与交互式图例聚焦高亮 (Legend Focus)，实现清晰、专业且直观的数据洞察。

**Architecture:** 
- 在 `frontend/src/utils/chartHelpers.ts` 中新增多模型堆叠分段几何计算辅助函数 `getStackedBarSegments`。
- 在 `DashboardView.tsx` 中彻底移除 `SystemRuntimeMatrix` 引用与渲染；将图表区收拢为单一大卡片，采用 `chartViewTab` (`'volume' | 'latency'`) 进行模式切换。
- 流量模式下渲染多模型彩色堆叠柱状图（柱总高 = 总请求数，柱内分段色彩 = 对应基准模型占比），Tooltip 呈现按贡献降序的明细拆解；延迟模式下渲染全网综合平均延迟的贝塞尔平滑渐变面积底图，悬浮/点击顶栏模型图例时独占高亮该模型专属曲线并淡化其余线条。
- 清理或删除 `SystemRuntimeMatrix.tsx` 及其无用测试和文案。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, SVG, Jest, Vite.

## Global Constraints

- **Remove System Runtime Matrix**: 彻底从概览页面中剔除系统配置矩阵，不再渲染。
- **Unified APM Chart Tab Container**: 采用单一大图表卡片，顶部 Tab 支持流量趋势与延迟走势切换，减少垂直空间占用。
- **Stacked Bar Visualization**: 流量图采用无交叉线的堆叠分段柱状图，直观展现总体量与分模型结构贡献。
- **Interactive Legend Focus**: 延迟图支持悬浮/点击单模型图例独占高亮其折线，解决多线乱麻问题。
- **Strict TypeScript & TDD**: 严格类型安全，前端后端编译 0 报错，全量 Jest 测试套件通过。

---

### Task 1: 编写堆叠柱状图辅助函数与测试

**Files:**
- Modify: `frontend/src/utils/chartHelpers.ts`
- Modify: `tests/chartHelpers.test.ts`

**Interfaces:**
- Produces:
  - `getStackedBarSegments(point: any, allModels: string[], getModelCount: (p: any, m: string) => number, yMax: number, volumeLimit: number, plottingHeight: number): Array<{ model: string; y: number; height: number }>`

- [ ] **Step 1: 在 `tests/chartHelpers.test.ts` 中编写堆叠柱状分段算法测试**

```typescript
import { getStackedBarSegments } from '../frontend/src/utils/chartHelpers';

describe('Stacked Bar Chart Helper', () => {
  test('getStackedBarSegments should calculate stacked segments from base to top', () => {
    const point = { total: 100 };
    const allModels = ['modelA', 'modelB'];
    const getModelCount = (_p: any, m: string) => (m === 'modelA' ? 60 : 40);
    const yMax = 200;
    const volumeLimit = 100;
    const plottingHeight = 150;

    const segments = getStackedBarSegments(point, allModels, getModelCount, yMax, volumeLimit, plottingHeight);

    expect(segments.length).toBe(2);
    // First segment (modelA: 60)
    expect(segments[0].model).toBe('modelA');
    expect(segments[0].height).toBe(90); // (60/100) * 150
    expect(segments[0].y).toBe(110); // 200 - 90

    // Second segment (modelB: 40) stacked on top
    expect(segments[1].model).toBe('modelB');
    expect(segments[1].height).toBe(60); // (40/100) * 150
    expect(segments[1].y).toBe(50); // 110 - 60
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/chartHelpers.test.ts`
Expected: FAIL (getStackedBarSegments is not a function)

- [ ] **Step 3: 在 `frontend/src/utils/chartHelpers.ts` 中实现 `getStackedBarSegments`**

```typescript
export interface StackedSegment {
  model: string;
  y: number;
  height: number;
}

/**
 * Computes stacked vertical bar segments for multiple models in a timeSeries data point.
 */
export function getStackedBarSegments(
  point: any,
  allModels: string[],
  getModelCount: (p: any, model: string) => number,
  yMax: number,
  volumeLimit: number,
  plottingHeight: number
): StackedSegment[] {
  if (!point || volumeLimit <= 0) return [];
  const segments: StackedSegment[] = [];
  let currentY = yMax;

  allModels.forEach(model => {
    const count = getModelCount(point, model);
    if (count > 0) {
      const segH = (count / volumeLimit) * plottingHeight;
      currentY -= segH;
      segments.push({
        model,
        y: currentY,
        height: segH
      });
    }
  });

  return segments;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/chartHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: 提交 Task 1 改动**

```bash
git add frontend/src/utils/chartHelpers.ts tests/chartHelpers.test.ts
git commit -m "feat(charts): add getStackedBarSegments calculation helper"
```

---

### Task 2: 编写移除系统配置矩阵与单图表聚合的测试断言

**Files:**
- Create: `tests/dashboardStreamlinedCharts.test.ts`

**Interfaces:**
- Consumes: `DashboardView.tsx`
- Produces: 静态与行为断言，检验 `SystemRuntimeMatrix` 已被移除，图表具备 `chartViewTab` 切换与堆叠柱状渲染逻辑，以及延迟图支持 `focusedModel`。

- [ ] **Step 1: 编写测试文件 `tests/dashboardStreamlinedCharts.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard Streamlined Charts & Layout', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(dashboardPath, 'utf-8');
  });

  test('should NOT import or render SystemRuntimeMatrix', () => {
    expect(content).not.toContain('SystemRuntimeMatrix');
  });

  test('should support chartViewTab state switching between volume and latency', () => {
    expect(content).toContain('chartViewTab');
    expect(content).toContain('setChartViewTab');
  });

  test('should compute stacked bar segments for volume chart', () => {
    expect(content).toContain('getStackedBarSegments');
  });

  test('should support focusedModel for interactive legend filtering in latency view', () => {
    expect(content).toContain('focusedModel');
    expect(content).toContain('setFocusedModel');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/dashboardStreamlinedCharts.test.ts`
Expected: FAIL (因为 `DashboardView.tsx` 仍引用了 `SystemRuntimeMatrix` 且尚未重构为单图表容器)

- [ ] **Step 3: 提交初始测试文件**

```bash
git add tests/dashboardStreamlinedCharts.test.ts
git commit -m "test(dashboard): add assertions for removing SystemRuntimeMatrix and streamlined charts"
```

---

### Task 3: 重构 DashboardView 移除系统配置矩阵并实现全景 APM 单图表容器

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `getStackedBarSegments`, `getBezierSplinePath`, `getBezierAreaPath`, `modelStatsSummary`
- Produces: 
  - 移除 `<SystemRuntimeMatrix />`
  - 增加 `chartViewTab: 'volume' | 'latency'` 状态
  - 增加 `focusedModel: string | null` 状态
  - 流量模式渲染分段堆叠彩色柱状图（或总体波形）
  - 延迟模式渲染全网综合波形 + 悬浮/点击图例独占高亮单模型曲线

- [ ] **Step 1: 移除 `SystemRuntimeMatrix` 的 import 与 JSX 引用**

从 `DashboardView.tsx` 中删除 `import SystemRuntimeMatrix from './dashboard/SystemRuntimeMatrix';` 和 `<SystemRuntimeMatrix config={cfg} />`。

- [ ] **Step 2: 声明 `chartViewTab` 与 `focusedModel` 状态**

```typescript
const [chartViewTab, setChartViewTab] = useState<'volume' | 'latency'>('volume');
const [focusedModel, setFocusedModel] = useState<string | null>(null);
```

- [ ] **Step 3: 实现单图表容器顶栏控件**

```tsx
<div className="ui-card p-5 relative flex flex-col transition-colors group">
  {/* Header Toolbar */}
  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[var(--border-subtle)]">
    <div className="flex items-center space-x-3">
      {/* Chart View Tabs */}
      <div className="ui-tab-container p-0.5 text-[11px] font-medium">
        <button
          type="button"
          onClick={() => { setChartViewTab('volume'); setFocusedModel(null); }}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-all ${
            chartViewTab === 'volume' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>{t('dashboard.volumeTab', '流量请求趋势')}</span>
        </button>
        <button
          type="button"
          onClick={() => setChartViewTab('latency')}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-all ${
            chartViewTab === 'latency' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{t('dashboard.latencyTab', '响应延迟走势')}</span>
        </button>
      </div>

      {/* Model Legend (Click/Hover to focus) */}
      {allModels.length > 0 && (
        <div className="hidden sm:flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
          {allModels.map((model, idx) => {
            const mColor = getModelColor(model, idx);
            const isFocused = focusedModel === model;
            return (
              <button
                key={model}
                type="button"
                onMouseEnter={() => chartViewTab === 'latency' && setFocusedModel(model)}
                onMouseLeave={() => chartViewTab === 'latency' && setFocusedModel(null)}
                onClick={() => setFocusedModel(focusedModel === model ? null : model)}
                className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono transition-all ${
                  isFocused
                    ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-sm ring-1 ring-indigo-500/30 font-semibold'
                    : focusedModel
                    ? 'border-transparent opacity-35 hover:opacity-100'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={model}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: mColor }} />
                <span className="truncate max-w-[120px]">{model}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>

    {/* Right Controls: Volume chart type switcher or active hover badge */}
    <div className="flex items-center space-x-2">
      {chartViewTab === 'volume' && (
        <div className="ui-tab-container p-0.5 text-[10px] font-medium">
          <button
            type="button"
            onClick={() => setVolumeChartType('bar')}
            className={`px-2 py-0.5 rounded flex items-center space-x-1 ${
              volumeChartType === 'bar' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>{t('dashboard.barChart', '堆叠柱状')}</span>
          </button>
          <button
            type="button"
            onClick={() => setVolumeChartType('area')}
            className={`px-2 py-0.5 rounded flex items-center space-x-1 ${
              volumeChartType === 'area' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>{t('dashboard.areaChart', '总体波形')}</span>
          </button>
        </div>
      )}

      {hoveredIndex !== null && timeSeries[hoveredIndex] && (
        <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          {chartViewTab === 'volume'
            ? `${timeSeries[hoveredIndex].total} reqs`
            : `${timeSeries[hoveredIndex].avgDurationMs} ms`
          }
        </span>
      )}
    </div>
  </div>

  {/* Chart Body */}
  ...
</div>
```

- [ ] **Step 4: 在流量模式下渲染多模型堆叠柱状图 (Stacked Bar Chart)**

当 `chartViewTab === 'volume'` 且 `volumeChartType === 'bar'` 时：
使用 `getStackedBarSegments` 计算每个小时柱子内的分段矩形：
```tsx
{timeSeries.map((p, i) => {
  const barWidth = Math.min(22, Math.max(8, (plottingWidth / N) * 0.55));
  const x = getX(i) - barWidth / 2;
  const segments = getStackedBarSegments(
    p,
    allModels,
    (item, model) => getModelHourlyCount(item, model),
    yMax,
    volumeLimit,
    plottingHeight
  );

  return (
    <g key={i}>
      {/* Background Hover Guide */}
      {hoveredIndex === i && (
        <rect
          x={getX(i) - barWidth * 1.2}
          y={yMin}
          width={barWidth * 2.4}
          height={plottingHeight}
          fill="rgba(255, 255, 255, 0.04)"
          rx="4"
          className="pointer-events-none"
        />
      )}

      {/* Stacked Segments */}
      {segments.map((seg, sIdx) => {
        const mIdx = allModels.indexOf(seg.model);
        const mColor = getModelColor(seg.model, mIdx >= 0 ? mIdx : 0);
        const isTop = sIdx === segments.length - 1;
        return (
          <rect
            key={seg.model}
            x={x}
            y={seg.y}
            width={barWidth}
            height={Math.max(1, seg.height - 1)}
            rx={isTop ? 3 : 0}
            fill={mColor}
            className="transition-all duration-150"
            opacity={0.9}
          />
        );
      })}
    </g>
  );
})}
```

- [ ] **Step 5: 在延迟模式下渲染全网综合波形与交互式图例高亮**

当 `chartViewTab === 'latency'` 时：
1. 底层绘制全网平均延迟贝塞尔平滑渐变面积图作为基底；
2. 上层绘制多模型折线：若 `focusedModel` 为当前模型，线宽加粗至 `3.5px`，`opacity: 1`；若有其他模型被聚焦，本模型降至 `opacity: 0.1`；未聚焦时保持优雅柔和的 `opacity: 0.45`。

- [ ] **Step 6: 优化悬浮 Tooltip 微卡片**

在流量模式下，展示时间、总请求、成功/错误比，以及各个模型的请求贡献倒序明细；在延迟模式下，展示全网平均耗时及各模型具体耗时。

- [ ] **Step 7: 运行测试验证 Task 3 全部通过**

Run: `npx jest tests/dashboardStreamlinedCharts.test.ts`
Expected: PASS

- [ ] **Step 8: 提交 Task 3 改动**

```bash
git add frontend/src/components/DashboardView.tsx tests/dashboardStreamlinedCharts.test.ts
git commit -m "feat(dashboard): remove SystemRuntimeMatrix and implement unified APM chart with stacked bars and latency focus"
```

---

### Task 4: 清理冗余测试与更新历史断言

**Files:**
- Modify: `tests/dashboardFullwidthLayout.test.ts`
- Modify: `tests/dashboardOptimization.test.ts`

**Interfaces:**
- Consumes: `DashboardView.tsx`
- Produces: 确保之前测试中关于 `SystemRuntimeMatrix` 的断言被同步更新或移除，避免破坏 CI/CD。

- [ ] **Step 1: 更新 `tests/dashboardFullwidthLayout.test.ts`**

移除已不适用的 `SystemRuntimeMatrix` 存在断言，更新为断言图表具备 `chartViewTab` 和 `stacked bar`。

- [ ] **Step 2: 运行全量测试套件**

Run: `npx jest tests/`
Expected: 所有测试套件通过

- [ ] **Step 3: 提交改动**

```bash
git add tests/dashboardFullwidthLayout.test.ts tests/dashboardOptimization.test.ts
git commit -m "test(dashboard): clean up obsolete SystemRuntimeMatrix assertions"
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

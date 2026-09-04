# 控制台图表防抖精简与暗夜白线消除实施计划 (Dashboard Chart Anti-Shift & Dark Border Polish Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 简化控制台图表 Tab 名称；彻底消除模型性能矩阵在 Dark 模式下的突兀刺眼白线；固定请求总量为分模型堆叠彩色柱状图（移除形态切换器）；彻底移除顶栏滑过小时柱时动态跳动的指标徽章，消除 Layout Shift，确保模型图例胶囊稳定呈现。

**Architecture:** 
- 在 `frontend/src/i18n/locales/` 中将图表 Tab 词条精简为 `请求量` (Volume) 与 `响应延迟` (Latency)。
- 在 `ModelPerformanceMatrix.tsx` 中移除不规范的 `divide-y divide-[var(--border-subtle)]/50` 与多层亮色边框，重构为微弱暗阶边框 `border-b border-black/[0.05] dark:border-white/[0.04]` 与 `dark:border-slate-800/60`，外层添加 `rounded-xl overflow-hidden`，保证 Dark 模式深邃沉浸。
- 在 `DashboardView.tsx` 中彻底移除 `volumeChartType` 状态及柱状/波形切换器；移除顶栏工具栏中的 `{hoveredIndex !== null && ...}` 动态指标，使顶栏排版 100% 静态防抖，数据完全交由悬浮微卡片呈现。
- 在 `tests/dashboardStreamlinedCharts.test.ts` 中更新断言并验证通过。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, SVG, Jest, Vite.

## Global Constraints

- **Anti-Shift Toolbar**: 顶栏工具条必须 100% 静态锁定，鼠标滑过时间轴时不得动态插入徽章或挤压模型图例。
- **No Chart Type Switcher**: 流量图表仅保留分模型堆叠柱状图，移除所有波形/柱状切换按钮与状态。
- **Eliminate Dark White Lines**: 表格必须消除所有突兀亮白边框，采用暗阶边框与暗夜底板浑然一体。
- **Strict TypeScript & TDD**: 严格类型安全，前端后端编译 0 报错，全量 Jest 测试套件通过。

---

### Task 1: 补充精简版图表词条 (i18n) 与测试

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `tests/dashboardStreamlinedCharts.test.ts`

**Interfaces:**
- Consumes: `useTranslation`
- Produces: `dashboard.chartVolumeTab`, `dashboard.chartLatencyTab`

- [ ] **Step 1: 在 `tests/dashboardStreamlinedCharts.test.ts` 中补充防抖与精简词条断言**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard Anti-Shift & Dark Border Polish', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');

  let dashboardContent: string;
  let matrixContent: string;

  beforeAll(() => {
    dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
  });

  test('should eliminate volumeChartType switcher and state from DashboardView', () => {
    expect(dashboardContent).not.toContain('volumeChartType');
    expect(dashboardContent).not.toContain('setVolumeChartType');
  });

  test('should eliminate dynamic hoveredIndex metric badge from chart header toolbar', () => {
    // Header toolbar should not dynamically insert hoveredIndex badge
    expect(dashboardContent).not.toMatch(/hoveredIndex\s*!==\s*null\s*&&\s*timeSeries\[hoveredIndex\]\s*&&\s*\(\s*<span[^>]*font-mono/);
  });

  test('ModelPerformanceMatrix should eliminate divide-y divide-[var(--border-subtle)]/50', () => {
    expect(matrixContent).not.toContain('divide-[var(--border-subtle)]/50');
  });

  test('ModelPerformanceMatrix should use dark-subtle border classes', () => {
    expect(matrixContent).toContain('dark:border-white/[0.04]');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/dashboardStreamlinedCharts.test.ts`
Expected: FAIL (因为目前 `DashboardView.tsx` 仍有 `volumeChartType` 与动态徽章)

- [ ] **Step 3: 更新 `frontend/src/i18n/locales/zh.ts` 与 `en.ts`**

在 `zh.ts` 的 `dashboard` 中：
```typescript
    chartVolumeTab: "请求量",
    chartLatencyTab: "响应延迟",
```
在 `en.ts` 的 `dashboard` 中：
```typescript
    chartVolumeTab: "Volume",
    chartLatencyTab: "Latency",
```

- [ ] **Step 4: 提交 Task 1 改动**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/dashboardStreamlinedCharts.test.ts
git commit -m "feat(i18n): add simplified chart tab labels for volume and latency"
```

---

### Task 2: 消除 ModelPerformanceMatrix 在 Dark 模式下的刺眼白线

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`

**Interfaces:**
- Consumes: `ModelPerformanceMatrixProps`
- Produces: 消除 `divide-[var(--border-subtle)]/50`，采用暗阶 `border-b border-black/[0.05] dark:border-white/[0.04]`，表格圆角防溢出。

- [ ] **Step 1: 重构 `ModelPerformanceMatrix.tsx` 中的表格边框结构**

在 `ModelPerformanceMatrix.tsx` 中：
1. 将 `<thead>` 下的表头分割线改为：
   `<tr className="border-b border-black/[0.06] dark:border-white/[0.06] text-[var(--text-secondary)] text-[11px] uppercase tracking-wider">`
2. 将 `<tbody className="divide-y divide-[var(--border-subtle)]/50">` 改为：
   `<tbody>`
3. 为每个 `<tr>` 设置专属底边框：
   `<tr key={item.model} className="border-b border-black/[0.04] dark:border-white/[0.04] last:border-b-0 hover:bg-[var(--bg-surface-hover)] transition-colors">`
4. 将表格容器增加平滑圆角修饰：
   `<div className="hidden md:block overflow-x-auto w-full no-scrollbar rounded-xl">`

- [ ] **Step 2: 运行测试检查白线相关断言**

Run: `npx jest tests/dashboardStreamlinedCharts.test.ts`
Expected: ModelPerformanceMatrix 相关白线断言全部 PASS

- [ ] **Step 3: 提交 Task 2 改动**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx
git commit -m "fix(dashboard): eliminate harsh white lines in ModelPerformanceMatrix for dark theme"
```

---

### Task 3: 移除图表切换器与动态跳动徽章，重构防抖顶栏与纯净堆叠图

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `t('dashboard.chartVolumeTab')`, `t('dashboard.chartLatencyTab')`, `getStackedBarSegments`
- Produces: 
  - 移除 `volumeChartType`
  - 移除顶栏右侧 `{hoveredIndex !== null && ...}` 动态指标
  - 图表固定为分模型堆叠柱状图
  - 顶栏 Tab 使用两字精简标签 `[ 📊 请求量 ]` / `[ ⚡ 响应延迟 ]`

- [ ] **Step 1: 在 `DashboardView.tsx` 中移除 `volumeChartType` 状态**

移除 `const [volumeChartType, setVolumeChartType] = useState<'bar' | 'area'>('bar');`。

- [ ] **Step 2: 简化顶栏标题与移除动态悬浮指标**

在顶栏区域：
1. 双 Tab 使用精简文案：
   ```tsx
   <button
     type="button"
     onClick={() => { setChartViewTab('volume'); setFocusedModel(null); }}
     className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-all ${
       chartViewTab === 'volume' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
     }`}
   >
     <BarChart3 className="w-3.5 h-3.5" />
     <span>{t('dashboard.chartVolumeTab', '请求量')}</span>
   </button>
   <button
     type="button"
     onClick={() => setChartViewTab('latency')}
     className={`flex items-center space-x-1.5 px-3 py-1 rounded-md transition-all ${
       chartViewTab === 'latency' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
     }`}
   >
     <Clock className="w-3.5 h-3.5" />
     <span>{t('dashboard.chartLatencyTab', '响应延迟')}</span>
   </button>
   ```
2. 彻底删除原先右侧的 `volumeChartType` 切换器与 `{hoveredIndex !== null && timeSeries[hoveredIndex] && (<span>...</span>)}` 标签。
3. 若在延迟 Tab 下有 `focusedModel`，保留一个极简靠右的 `[ 重置高亮 ]` 按钮。

- [ ] **Step 3: 移除流量模式下的波形渲染逻辑，纯化堆叠柱状图**

在 `chartViewTab === 'volume'` 分支下，直接渲染 `timeSeries.map(...)` 堆叠柱状图，移除原 `volumeChartType === 'area'` 逻辑，减少无效分支和 DOM 计算。

- [ ] **Step 4: 运行测试检查全部断言**

Run: `npx jest tests/dashboardStreamlinedCharts.test.ts`
Expected: 4 个测试全部 PASS

- [ ] **Step 5: 提交 Task 3 改动**

```bash
git add frontend/src/components/DashboardView.tsx
git commit -m "feat(dashboard): lock volume chart to stacked bars, simplify tabs, and eliminate layout shift"
```

---

### Task 4: 全量构建与回归测试验证 (Full Verification)

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

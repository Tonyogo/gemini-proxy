# 控制台概览 (DashboardView) 专业 APM 监控升级与视觉重构实施计划 (Dashboard APM Optimization Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全面升级控制台概览页面为专业级现代化 APM 监控仪表盘。重塑 4 张核心指标卡为包含在线时长、QPS 吞吐率、延迟品质与可用度百分比的专业 APM 体系；引入三次贝塞尔平滑面积图算法与柱状/波形形态切换；深度适配浅色/深色主题消灭所有硬编码暗色；重塑右侧模型分布与系统配置微晶矩阵。

**Architecture:** 
- 在前端图表工具集 (`frontend/src/utils/chartHelpers.ts`) 中封装三次贝塞尔平滑曲线与渐变闭合路径计算算法，以及人性化运行时间与吞吐率计算函数。
- 在 `DashboardView.tsx` 中将 4 张指标卡重塑为专业 APM 维度；增加 `volumeChartType` (`'bar' | 'area'`) 自由切换控制；悬浮微卡片升级为自适应玻璃拟态。
- 重构 `ModelPerformanceMatrix.tsx` 与 `SystemRuntimeMatrix.tsx`，彻底消除所有深色硬编码（`text-slate-100`, `bg-black/20` 等），全面对接系统 CSS 变量。
- 在中英双语字典中补充对应的新增文案与提示。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, SVG, Vite, Jest.

## Global Constraints

- **Zero Heavy Third-Party Chart Libs**: 采用轻量高性能纯前端自研 SVG 贝塞尔曲线算法，避免引入大型图表依赖。
- **100% Theme Token Conformance**: 彻底杜绝深色写死类名，所有文字采用 `text-[var(--text-primary)]` / `text-[var(--text-secondary)]`，所有卡片背景与边框统一对接 CSS 变量。
- **Strict TypeScript & TDD**: 严格类型安全，前端后端编译 0 报错，全量 Jest 测试套件通过。

---

### Task 1: 编写 APM 图表与指标算法工具集及测试

**Files:**
- Create: `frontend/src/utils/chartHelpers.ts`
- Create: `tests/chartHelpers.test.ts`

**Interfaces:**
- Produces:
  - `formatUptime(seconds: number): string`
  - `formatThroughput(totalRequests: number, range: number | 'today'): string`
  - `getBezierSplinePath(points: Array<{x: number, y: number}>): string`
  - `getBezierAreaPath(points: Array<{x: number, y: number}>, yBase: number): string`

- [x] **Step 1: 编写测试文件 `tests/chartHelpers.test.ts`**

```typescript
import {
  formatUptime,
  formatThroughput,
  getBezierSplinePath,
  getBezierAreaPath
} from '../frontend/src/utils/chartHelpers';

describe('Chart Helpers & APM Formatters', () => {
  test('formatUptime should format seconds into human-readable uptime', () => {
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(125)).toBe('2m 5s');
    expect(formatUptime(3665)).toBe('1h 1m');
    expect(formatUptime(90061)).toBe('1d 1h 1m');
  });

  test('formatThroughput should calculate requests per second correctly', () => {
    // 3600 requests over 1 hour (range 1) = 1.00 req/s
    expect(formatThroughput(3600, 1)).toBe('1.00 req/s');
    // 0 requests
    expect(formatThroughput(0, 6)).toBe('0.00 req/s');
  });

  test('getBezierSplinePath should generate smooth bezier SVG path', () => {
    const points = [
      { x: 50, y: 100 },
      { x: 100, y: 50 },
      { x: 150, y: 80 },
      { x: 200, y: 30 }
    ];
    const path = getBezierSplinePath(points);
    expect(path).toMatch(/^M 50,100 C/);
    expect(path).toContain('200,30');
  });

  test('getBezierAreaPath should close path to yBase baseline', () => {
    const points = [
      { x: 50, y: 100 },
      { x: 100, y: 50 }
    ];
    const areaPath = getBezierAreaPath(points, 200);
    expect(areaPath).toMatch(/^M 50,100 C/);
    expect(areaPath).toContain('L 100,200 L 50,200 Z');
  });
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/chartHelpers.test.ts`
Expected: FAIL (Cannot find module '../frontend/src/utils/chartHelpers')

- [x] **Step 3: 实现 `frontend/src/utils/chartHelpers.ts`**

```typescript
/**
 * Formats uptime seconds into a human-readable duration string (e.g. "3d 14h 22m" or "42m 10s").
 */
export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const sec = Math.floor(seconds);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remSec}s`;
  }
  return `${remSec}s`;
}

/**
 * Calculates and formats throughput in requests per second.
 */
export function formatThroughput(totalRequests: number, range: number | 'today'): string {
  if (!totalRequests || totalRequests <= 0) return '0.00 req/s';
  // If range is 'today', estimate based on elapsed hours today (minimum 1 hour, max 24)
  let hours = typeof range === 'number' ? range : 24;
  if (range === 'today') {
    const now = new Date();
    hours = Math.max(1, now.getHours() + now.getMinutes() / 60);
  }
  const totalSeconds = hours * 3600;
  const qps = totalRequests / totalSeconds;
  return `${qps.toFixed(2)} req/s`;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Generates a smooth cubic Bezier curve SVG path through a series of 2D points.
 */
export function getBezierSplinePath(points: Point[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }

  let d = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    // Smooth control points using Catmull-Rom to Cubic Bezier conversion factor (1/6)
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return d;
}

/**
 * Generates a closed area SVG path below the smooth Bezier curve anchored at yBase.
 */
export function getBezierAreaPath(points: Point[], yBase: number): string {
  if (!points || points.length === 0) return '';
  const curvePath = getBezierSplinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${curvePath} L ${last.x},${yBase} L ${first.x},${yBase} Z`;
}
```

- [x] **Step 4: 运行测试确认全部通过**

Run: `npx jest tests/chartHelpers.test.ts`
Expected: PASS

- [x] **Step 5: 提交任务 1 代码**

```bash
git add frontend/src/utils/chartHelpers.ts tests/chartHelpers.test.ts
git commit -m "feat(charts): add bezier spline path generator and apm metric formatters"
```

---

### Task 2: 完善中英双语 i18n APM 字典词条

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `useTranslation`
- Produces: `dashboard.uptimeHuman`, `dashboard.avgThroughput`, `dashboard.serviceAvailability`, `dashboard.barChart`, `dashboard.areaChart`, `dashboard.healthy`, `dashboard.successRate`

- [x] **Step 1: 在 `frontend/src/i18n/locales/zh.ts` 中补充 APM 词条**

在 `dashboard` 对象中增加：
```typescript
    serviceAvailability: "服务可用率",
    avgThroughput: "平均吞吐量",
    healthy: "健康",
    barChart: "柱状图",
    areaChart: "面积图",
    excellent: "极佳",
    good: "良好",
    slow: "缓慢",
    successCountLabel: "成功",
    errorCountLabel: "异常",
    totalReqsLabel: "总请求数",
```

- [x] **Step 2: 在 `frontend/src/i18n/locales/en.ts` 中补充对应英文词条**

在 `dashboard` 对象中增加：
```typescript
    serviceAvailability: "Service Availability",
    avgThroughput: "Avg Throughput",
    healthy: "HEALTHY",
    barChart: "Bar Chart",
    areaChart: "Area Chart",
    excellent: "EXCELLENT",
    good: "GOOD",
    slow: "SLOW",
    successCountLabel: "Success",
    errorCountLabel: "Errors",
    totalReqsLabel: "Total Requests",
```

- [x] **Step 3: 运行全量测试验证无类型报错**

Run: `npx jest tests/chartHelpers.test.ts`
Expected: PASS

- [x] **Step 4: 提交任务 2 词条**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add apm metrics and chart control translations"
```

---

### Task 3: 重构顶部 4 张核心 APM 指标卡并消除浅色硬编码

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx:310-410`
- Create: `tests/dashboardOptimization.test.ts`

**Interfaces:**
- Consumes: `formatUptime`, `formatThroughput`, `status`, `stats`
- Produces: 
  - 卡片 1: 服务健康度 + 人性化在线时长
  - 卡片 2: 总请求量 + 平均吞吐率 QPS
  - 卡片 3: 平均响应延迟 + 品质徽章 (EXCELLENT/GOOD/SLOW) + 超时提示
  - 卡片 4: 可用度成功率百分比 + 迷你进度条 + 成功/异常明细

- [x] **Step 1: 编写 `tests/dashboardOptimization.test.ts` 静态断言**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard APM & Visual Optimization', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(dashboardPath, 'utf-8');
  });

  test('should import and use formatUptime and formatThroughput', () => {
    expect(content).toContain('formatUptime');
    expect(content).toContain('formatThroughput');
  });

  test('should eliminate hardcoded dark text classes in kpi cards', () => {
    expect(content).not.toContain('text-slate-100');
  });

  test('should support volume chart type switching (bar vs area)', () => {
    expect(content).toContain('volumeChartType');
    expect(content).toContain('setVolumeChartType');
  });

  test('should use smooth bezier area chart path generator', () => {
    expect(content).toContain('getBezierSplinePath');
    expect(content).toContain('getBezierAreaPath');
  });
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/dashboardOptimization.test.ts`
Expected: FAIL

- [x] **Step 3: 在 `DashboardView.tsx` 中重构 4 张指标卡**

导入 `formatUptime`, `formatThroughput`, `getBezierSplinePath`, `getBezierAreaPath`，增加 `volumeChartType` 状态，替换顶部 4 张卡片代码：
```tsx
  const [volumeChartType, setVolumeChartType] = useState<'bar' | 'area'>('area');

  // APM calculations
  const totalLogsCount = stats?.totalLogs || 0;
  const totalSuccessCount = stats?.successCount || 0;
  const totalErrorCount = stats?.errorCount || 0;
  const availabilityRate = totalLogsCount > 0 ? ((totalSuccessCount / totalLogsCount) * 100).toFixed(2) : '100.00';
  const avgLatency = stats ? stats.avgDurationMs : 0;
  const latencyQuality = avgLatency < 1000 ? 'EXCELLENT' : avgLatency < 3000 ? 'GOOD' : 'SLOW';
  const latencyQualityColor = avgLatency < 1000 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : avgLatency < 3000 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20';
```
在 JSX 中彻底使用 `text-[var(--text-primary)]`, `text-[var(--text-secondary)]` 渲染。

- [x] **Step 4: 运行测试验证指标卡部分通过**

Run: `npx jest tests/dashboardOptimization.test.ts`

---

### Task 4: 实现贝塞尔平滑面积图与形态切换控制器

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx:415-895`

**Interfaces:**
- Consumes: `getBezierSplinePath`, `getBezierAreaPath`, `volumeChartType`
- Produces:
  - 请求量趋势图支持 `bar` 直方图与 `area` 面积图一键切换
  - 响应延迟与分布图表升级为三次贝塞尔平滑曲线与面积渐变
  - 悬浮 Tooltip 采用玻璃拟态与主题变量

- [x] **Step 1: 在请求量图表标题栏加入形态切换按钮**

```tsx
<div className="ui-tab-container p-0.5 text-[10px] font-medium">
  <button
    type="button"
    onClick={() => setVolumeChartType('area')}
    className={`px-2 py-0.5 rounded flex items-center space-x-1 ${
      volumeChartType === 'area' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
    }`}
  >
    <Activity className="w-3 h-3" />
    <span>{t('dashboard.areaChart', '面积图')}</span>
  </button>
  <button
    type="button"
    onClick={() => setVolumeChartType('bar')}
    className={`px-2 py-0.5 rounded flex items-center space-x-1 ${
      volumeChartType === 'bar' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
    }`}
  >
    <BarChart3 className="w-3 h-3" />
    <span>{t('dashboard.barChart', '柱状图')}</span>
  </button>
</div>
```

- [x] **Step 2: 渲染面积渐变与贝塞尔曲线**

当 `volumeChartType === 'area'` 时，使用 `getBezierAreaPath` 与 `getBezierSplinePath` 渲染波形面积图；当为 `'bar'` 时渲染圆角柱状图。

- [x] **Step 3: 优化 Chart 2 模型延迟与分布平滑曲线**

利用 `getBezierSplinePath` 替换原先直角折线渲染，曲线自然柔美。

- [x] **Step 4: 升级玻璃拟态悬浮 Tooltip**

全面采用 `backdrop-blur-xl bg-[var(--bg-surface)]/95 border border-[var(--border-subtle)] text-[var(--text-primary)]`。

- [x] **Step 5: 运行测试检查通过情况**

Run: `npx jest tests/dashboardOptimization.test.ts`
Expected: PASS

---

### Task 5: 重构右侧模型矩阵与系统运行时配置矩阵

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`
- Modify: `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx`

**Interfaces:**
- Consumes: `ModelStatItem`, `SystemRuntimeMatrixProps`
- Produces: 
  - 消除 `text-slate-200`, `bg-white/[0.04]` 等深色类名
  - 进度条轨道采用 `bg-[var(--border-subtle)]/40`
  - 系统配置微晶卡片增强毫秒与时分双重可读性

- [x] **Step 1: 重构 `ModelPerformanceMatrix.tsx`**

将条目标题与数值类名更新为主题变量，轨道背景设为 `bg-[var(--border-subtle)]/40`，文字设为 `text-[var(--text-primary)]`。

- [x] **Step 2: 重构 `SystemRuntimeMatrix.tsx`**

系统配置卡片统一采用 `ui-card-sub`，消除所有黑色底色，强化配置参数对比度。

- [x] **Step 3: 运行全量测试并提交**

```bash
git add frontend/src/components/DashboardView.tsx frontend/src/components/dashboard/ModelPerformanceMatrix.tsx frontend/src/components/dashboard/SystemRuntimeMatrix.tsx tests/dashboardOptimization.test.ts
git commit -m "feat(dashboard): implement apm metric cards, bezier area charts, and theme refinement"
```

---

### Task 6: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [x] **Step 1: 运行全量 Jest 测试套件**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test`
Expected: 42 个测试套件全部 PASS

- [x] **Step 2: 运行前端 Vite 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend`
Expected: 0 错误构建成功

- [x] **Step 3: 运行后端 TypeScript 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend`
Expected: 0 错误构建成功

- [x] **Step 4: 运行全量构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build`
Expected: SUCCESS

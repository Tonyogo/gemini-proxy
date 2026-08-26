# 控制台概览布局优化实施计划 (Dashboard Layout Optimization Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构控制台概览（Dashboard）页面布局，使用 6:4 左右黄金分栏将“模型性能与分布矩阵”置顶于首屏右上侧黄金视窗，左侧整合流量与延迟趋势图表联动，底部保留模型分布分析，提升整体监控效率与空间利用率。

**Architecture:** 将 `DashboardView.tsx` 按照单一职责拆解为清晰的模块化子组件/子模块（顶部控制栏、KPI 指标网格、左侧核心趋势图表、右侧模型性能与运行时矩阵、底部模型分布图表），重构 SVG 坐标与多图表 hover 联动逻辑，并确保响应式与 i18n 完整覆盖。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Inline SVG Charting Engine, Vite.

**Spec:** `docs/superpowers/specs/2026-08-26-dashboard-layout-optimization-design.md`

## Global Constraints

- **布局规范**: Desktop（≥ 1024px / `lg:`）使用 6:4 左右分栏（`lg:col-span-7` / `lg:col-span-5`），移动端优雅降级为单列纵向流且模型性能矩阵置前展示。
- **色彩与设计规范**: 背景基调 `#090A0F`，卡片背景 `#0F1118/90`，边框 `border-white/[0.08]`，悬停提亮 `hover:border-indigo-500/30`。模型配色统一使用 `['#6366F1', '#38BDF8', '#10B981', '#F59E0B', '#EC4899', '#A855F7', '#14B8A6']`。
- **i18n 约束**: 所有文本必须通过 `useTranslation` 的 `t()` 函数获取，中英双语 100% 完整覆盖。
- **类型安全**: TypeScript 严格类型检查，不得使用 `any` 忽略明显类型推断。

---

### Task 1: 国际化多语言键值扩充与对齐 (i18n Locales Enhancement)

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`

**Interfaces:**
- Consumes: 既有 `dashboard` 命名空间。
- Produces: 完整对齐的概览多语言翻译键（包括 `modelDistribution`、`volumeAndSuccess`、`hoverGuide`、`avgDuration` 等）。

- [ ] **Step 1: 检查并添加所需的 i18n 键值**

在中英文语言包中完善并对齐 `dashboard` 下的相关词条（如 `volumeChartTitle`, `latencyChartTitle`, `modelPerformanceTitle`, `systemRuntimeMatrix`, `modelChartTitle`, `modelsTracked` 等），确保无缺失的 fallback。

- [ ] **Step 2: 验证前端构建**

Run: `cd frontend && npm run build`
Expected: PASS (无 TypeScript 类型报错)

- [ ] **Step 3: 提交代码**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add and align dashboard layout localization keys"
```

---

### Task 2: 拆分与提炼首屏右侧矩阵组件 (ModelPerformanceMatrix & SystemRuntimeMatrix)

**Files:**
- Create: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`
- Create: `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx`

**Interfaces:**
- `ModelPerformanceMatrix` Props:
  ```typescript
  interface ModelPerformanceMatrixProps {
    modelStats: {
      totalRequests: number;
      list: Array<{
        model: string;
        requests: number;
        percentage: number;
        avgLatency: number;
      }>;
    };
    getModelColor: (modelName: string, index: number) => string;
  }
  ```
- `SystemRuntimeMatrix` Props:
  ```typescript
  interface SystemRuntimeMatrixProps {
    config: Record<string, any>;
  }
  ```

- [ ] **Step 1: 创建 `ModelPerformanceMatrix.tsx`**

实现包含模型色彩标、完整模型名称、平均延迟药丸徽章（`~Xms`）、请求次数与带有柔和轨道的进度条，并增加局部滚动适配。

- [ ] **Step 2: 创建 `SystemRuntimeMatrix.tsx`**

实现 2x3 等宽等高运行时参数网格（`LOG_LEVEL`, `UPSTREAM_TIMEOUT`, `SYSTEM_ROLE_TO_INSTRUCTION`, `LOG_RETENTION_DAYS`, `TIME_ZONE`, `COUNT_TOKENS_MODEL`）。

- [ ] **Step 3: 运行前端构建进行语法与类型校验**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx frontend/src/components/dashboard/SystemRuntimeMatrix.tsx
git commit -m "feat(dashboard): create modular ModelPerformanceMatrix and SystemRuntimeMatrix components"
```

---

### Task 3: 重构 `DashboardView.tsx` 页面布局与 6:4 黄金分栏网格

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- Consumes: `ModelPerformanceMatrix`, `SystemRuntimeMatrix`, `TimeSeriesPoint`, `useTranslation`.
- Produces: 响应式 6:4 栅格布局，顶部 KPI 卡片、左侧双主图（流量 + 延迟）、右侧置顶模型矩阵 + 运行矩阵、底部全宽模型分布图。

- [ ] **Step 1: 组织数据与图表辅助函数**

在 `DashboardView.tsx` 中优化 `modelStatsSummary`、SVG 坐标计算、多模型配色方案以及跨图表共享的 `hoveredIndex` 处理函数。

- [ ] **Step 2: 实现 6:4 黄金分栏布局及图表装配**

按照 Spec 规范构建：
- 顶部标题与时间范围切换器；
- 4 栏 KPI 指标卡；
- `grid grid-cols-1 lg:grid-cols-12 gap-6`：
  - 左侧 `lg:col-span-7 xl:col-span-8`：请求流量趋势图 + 模型延迟分析图；
  - 右侧 `lg:col-span-5 xl:col-span-4`：`<ModelPerformanceMatrix />` 置顶 + `<SystemRuntimeMatrix />`；
- 底部全宽卡片：多模型并发时间序列分布图。

- [ ] **Step 3: 优化跨图表 Hover 准线联动与 Tooltip 交互**

确保鼠标在图表 1、图表 2、图表 3 之间移动时，时间准线精准对齐，Tooltip 智能左右翻转防止溢出。

- [ ] **Step 4: 运行前端构建并验证**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/components/DashboardView.tsx
git commit -m "feat(dashboard): optimize layout with 6:4 split, elevating model performance matrix"
```

---

### Task 4: 端到端与响应式验证、回归测试套件 (Verification & Regression Testing)

**Files:**
- Test: `tests/` (全量后端与管理路由测试)
- Build: `npm run build` (全量前后端构建)

- [ ] **Step 1: 运行全量后端单元与集成测试**

Run: `npm test`
Expected: PASS (所有测试用例通过)

- [ ] **Step 2: 运行全量构建**

Run: `npm run build`
Expected: PASS (前端 Vite 构建成功，后端 TypeScript 编译成功)

- [ ] **Step 3: 提交并整合分支**

```bash
git status
git commit -m "chore: verify build and tests for dashboard layout optimization" --allow-empty
```

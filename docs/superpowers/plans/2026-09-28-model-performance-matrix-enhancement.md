# Model Performance Matrix Visual & Metrics Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Model Performance & Distribution Matrix table on the dashboard with rich visual cues (standard vs high-spec stacked ratio bar, relative latency benchmarks, sleek ranking badges, and a footer insights strip).

**Architecture:** Pure frontend enhancement within React/Tailwind/TypeScript: augment `ModelPerformanceMatrix.tsx` with richer data visualizations, update i18n locales (`zh.ts`, `en.ts`), and maintain full backwards-compatibility with existing dashboard data structures and tests.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, Jest.

**Spec:** In-conversation design approved for directions 1 (visual refinement & styling) and 3 (enhanced metrics & dimensional visualization).

## Global Constraints

- Preserve `ModelStatItem` type interface in `frontend/src/utils/modelHelpers.ts` without breaking changes.
- Ensure strict Tailwind theme compatibility (`var(--text-primary)`, `var(--text-secondary)`, `var(--bg-surface)`, `var(--border-subtle)`). No hardcoded text colors like `text-slate-100` or `text-slate-200`.
- Maintain mobile responsiveness: sleek multi-column table on desktop (`md:block`), compact micro-dashboard cards on mobile (`md:hidden`).
- All existing tests in `tests/dashboardModelNormalization.test.ts` and `tests/dashboardOptimization.test.ts` must continue to pass.
- Project-wide clean build must succeed (`npm run build:frontend` and `npm test`).

## Review Focus

1. Empty dataset handling: `modelStats.list` empty or undefined renders the graceful empty state message instead of crashing or showing empty headers.
2. Models with zero `highRequests` or 100% `highRequests`: Spec ratio distribution bar displays cleanly without zero-division or rendering anomalies.
3. Latency gauge calculations: models with 0ms or identical latencies should not produce `NaN` widths in the relative benchmark bars.
4. Dark and light theme legibility: all text, badges, background bars, and borders remain readable across all color themes.
5. Large model lists / small screen horizontal scrolling: the desktop table has `overflow-x-auto` with a sensible minimum width and does not break parent grid containers.

---

### Task 1: Add i18n Localization Keys and Test Assertions

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Create: `tests/modelPerformanceMatrixEnhancement.test.ts`

**Interfaces:**
- Consumes: `useTranslation()` keys under `dashboard.*`
- Produces: Keys `dashboard.specDistribution`, `dashboard.standardOnly`, `dashboard.latencyScaleFast`, `dashboard.latencyScaleModerate`, `dashboard.latencyScaleSlow`, `dashboard.insightsPrimaryModel`, `dashboard.insightsFastest`, `dashboard.insightsTotalThroughput`

- [ ] **Step 1: Write the test assertions for the new matrix features**

Create `tests/modelPerformanceMatrixEnhancement.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('ModelPerformanceMatrix Visual & Metrics Enhancement', () => {
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');
  const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  let matrixContent: string;
  let zhContent: string;
  let enContent: string;

  beforeAll(() => {
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
    zhContent = fs.readFileSync(zhPath, 'utf-8');
    enContent = fs.readFileSync(enPath, 'utf-8');
  });

  test('should have localization keys for matrix enhancements in zh and en', () => {
    expect(zhContent).toContain('specDistribution');
    expect(zhContent).toContain('insightsPrimaryModel');
    expect(zhContent).toContain('insightsFastest');
    expect(zhContent).toContain('insightsTotalThroughput');

    expect(enContent).toContain('specDistribution');
    expect(enContent).toContain('insightsPrimaryModel');
    expect(enContent).toContain('insightsFastest');
    expect(enContent).toContain('insightsTotalThroughput');
  });

  test('ModelPerformanceMatrix should render spec distribution ratio bar', () => {
    expect(matrixContent).toContain('specDistribution');
    expect(matrixContent).toMatch(/standardRequests|highRequests/);
  });

  test('ModelPerformanceMatrix should render latency relative scale indicator', () => {
    expect(matrixContent).toContain('avgLatency');
  });

  test('ModelPerformanceMatrix should render footer insights summary strip', () => {
    expect(matrixContent).toContain('insightsPrimaryModel');
    expect(matrixContent).toContain('insightsFastest');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/modelPerformanceMatrixEnhancement.test.ts`
Expected: FAIL due to missing i18n keys and un-upgraded `ModelPerformanceMatrix.tsx`.

- [ ] **Step 3: Add new i18n keys to `zh.ts` and `en.ts`**

In `frontend/src/i18n/locales/zh.ts`, inside `dashboard`:
```typescript
    specDistribution: "规格分布 (标 / 高)",
    standardOnly: "纯标准规格",
    latencyScaleFast: "极速",
    latencyScaleModerate: "正常",
    latencyScaleSlow: "较慢",
    insightsSummary: "矩阵速览",
    insightsPrimaryModel: "主力模型",
    insightsFastest: "最快响应",
    insightsTotalThroughput: "全站总吞吐",
```

In `frontend/src/i18n/locales/en.ts`, inside `dashboard`:
```typescript
    specDistribution: "Spec Distribution (Std / High)",
    standardOnly: "Standard Only",
    latencyScaleFast: "Fast",
    latencyScaleModerate: "Normal",
    latencyScaleSlow: "Slow",
    insightsSummary: "Insights",
    insightsPrimaryModel: "Top Model",
    insightsFastest: "Fastest",
    insightsTotalThroughput: "Total Throughput",
```

- [ ] **Step 4: Run test to verify partial progress**

Run: `npx jest tests/modelPerformanceMatrixEnhancement.test.ts`
Expected: Localization test passes; matrix component assertions still fail until Task 2 is implemented.

- [ ] **Step 5: Commit Task 1**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/modelPerformanceMatrixEnhancement.test.ts
git commit -m "feat(i18n): add localization keys and test suite for model matrix enhancements"
```

---

### Task 2: Implement Visual & Metrics Matrix Redesign in `ModelPerformanceMatrix.tsx`

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`

**Interfaces:**
- Consumes:
  - `modelStats: { totalRequests: number; list: ModelStatItem[] }`
  - `getModelColor: (modelName: string, index: number) => string`
  - `range?: number | 'today'`
- Produces: Updated React Component with:
  1. Ranking badge (`#1`, `#2`, ...) on model names
  2. Dual-state specification distribution bar (Standard vs High with visual percentage split)
  3. Latency indicator with color classification + relative scale mini bar
  4. Sleek progress pill for Traffic Share
  5. Footer insights summary strip (Top model, Fastest model, Total Throughput)
  6. Redesigned compact mobile cards

- [ ] **Step 1: Implement the enhanced matrix component**

In `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`:
- Compute min/max latencies safely across `modelStats.list` to drive the relative latency meter.
- Calculate top model by traffic, fastest model (lowest latency with >0 requests), and total throughput rate.
- Render Desktop table headers:
  - Model Name (with Rank # badge)
  - Spec Distribution (combined standard & high with mini stacked progress bar)
  - Total Requests
  - Traffic Share (with smooth rounded capsule)
  - Latency (color badge + micro benchmark bar)
  - Throughput
- Render Footer Insights Strip:
  - 3-column or flex container with `Insights` icon, highlighting Top Model, Fastest Model, and Total Combined Throughput.
- Render Mobile Card View:
  - Clean card for each model featuring rank badge, model color, dual-spec split bar, latency pill, and throughput.

- [ ] **Step 2: Run test suite to verify all assertions pass**

Run: `npx jest tests/modelPerformanceMatrixEnhancement.test.ts`
Expected: PASS

Run: `npx jest tests/dashboardModelNormalization.test.ts tests/dashboardOptimization.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite to guarantee zero regressions**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Verify frontend production build**

Run: `npm run build:frontend`
Expected: Build succeeds without TypeScript errors or Tailwind warnings.

- [ ] **Step 5: Commit Task 2**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx
git commit -m "feat(dashboard): enhance model performance matrix with spec distribution bar, latency benchmarks and insights strip"
```

---

### Task 3: Visual Polish & Documentation Review

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx` (if any micro-adjustments needed for spacing or border transitions)
- Test: Verify with real dev build or preview

- [ ] **Step 1: Check theme compatibility (light & dark mode variables)**
Ensure all background pills and bars use `bg-black/5 dark:bg-white/5`, borders use `border-[var(--border-subtle)]`, and text uses `text-[var(--text-primary)]` / `text-[var(--text-secondary)]`.

- [ ] **Step 2: Run full build and test verification**

Run: `npm run build && npm test`
Expected: Both frontend and backend compile cleanly and all Jest tests pass.

- [ ] **Step 3: Commit Task 3**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx
git commit -m "style(dashboard): refine model matrix padding, borders and theme adaptability"
```

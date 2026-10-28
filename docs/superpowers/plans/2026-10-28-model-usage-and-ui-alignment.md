# Model Usage and Active Models Normalization & UI Alignment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize active model usage by merging `-high` suffix models into their base model across Accounts management, refine Dashboard model distribution to highlight High spec usage and High average latency independently without standard spec clutter, and unify the visual design and model family badges between Accounts and Dashboard.

**Architecture:** 
1. In `frontend/src/utils/modelHelpers.ts`, extract and export `detectModelFamily(modelName)` and extend `aggregateModelStats` to compute `highAvgLatency` per model.
2. In `frontend/src/utils/accountModelStats.ts` and `frontend/src/components/AccountsView.tsx`, normalize model names using `normalizeModelName(rawModel).baseModel` in `calculateServerModelStats`, `getAccountTopModels`, and `getModelBreakdowns` to merge `-high` models into their base models.
3. In `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`, update the specification column and mobile cards to display only the High spec capsule containing High requests, percentage, and High average latency (`highAvgLatency`).
4. In `frontend/src/components/AccountsView.tsx`, upgrade the node model breakdown cards with model family badges, glow dots, model name copying, and matching typography to align with the Dashboard matrix.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest, Vite.

**Spec:** In-chat bounded design agreed during brainstorming.

## Global Constraints

- Retain clean base model names across all breakdowns in AccountsView (e.g. `gemini-2.5-pro-high` merges into `gemini-2.5-pro`).
- Keep High average latency formatting accurate (`~Xms`), showing 0 or omitted when there are no High requests.
- Ensure all copy feedback states (clipboard copy) operate independently with 2-second visual timeout.
- Maintain dual-language support across `zh.ts` and `en.ts` for updated table headers and labels.
- Pass all unit tests (`npm test`) and frontend compilation (`npm run build:frontend`).

## Review Focus

1. **Model name merging in accounts:** Accounts reporting usage under `gemini-2.5-pro` and `gemini-2.5-pro-high` simultaneously must aggregate into a single entry with combined request, success, and error totals without duplicate entries.
2. **High average latency calculation:** If a model has only standard requests (0 High requests), `highAvgLatency` must be 0 and the High capsule should display the muted zero state `High 0 · 0%`.
3. **High latency display precision:** When High requests and durations exist, the High capsule must render both percentage and latency (e.g. `High 1,200 · 20% · ~1,500ms`).
4. **Model family detection consistency:** Both Dashboard and AccountsView must resolve the same family label (`Gemini`, `Claude`, `OpenAI`, `DeepSeek`, `Qwen`, `Llama`, `LLM`) and badge styling for any given model name.
5. **Theme support:** Upgraded account model cards must render cleanly in both dark and light modes with proper border and hover states.

---

### Task 1: Extend Model Helpers with Shared Family Detection and High Latency Calculation

**Files:**
- Modify: `frontend/src/utils/modelHelpers.ts`
- Test: `tests/modelHelpers.test.ts`

**Interfaces:**
- Consumes: `timeSeries` data containing `models` and `modelDurations`
- Produces: 
  - `ModelFamilyConfig`: `{ label: string; badgeClass: string }`
  - `detectModelFamily(modelName: string): ModelFamilyConfig`
  - Extended `ModelStatItem`: `{ ..., highAvgLatency: number }`

- [x] **Step 1: Write failing tests in `tests/modelHelpers.test.ts`**

Add tests asserting:
1. `detectModelFamily` correctly tags Gemini, Claude, OpenAI, DeepSeek, and fallback LLM.
2. `aggregateModelStats` computes `highAvgLatency` correctly from `modelDurations` of `-high` models.
3. `aggregateModelStats` sets `highAvgLatency: 0` when there are no high model durations.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/modelHelpers.test.ts`
Expected: FAIL due to missing `highAvgLatency` and `detectModelFamily`.

- [x] **Step 3: Implement `detectModelFamily` and `highAvgLatency` in `frontend/src/utils/modelHelpers.ts`**

1. Define and export `ModelFamilyConfig` and `detectModelFamily`:
```ts
export interface ModelFamilyConfig {
  label: string;
  badgeClass: string;
}

export function detectModelFamily(modelName: string): ModelFamilyConfig {
  const lower = (modelName || '').toLowerCase();
  if (lower.includes('gemini')) {
    return {
      label: 'Gemini',
      badgeClass: 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/25'
    };
  }
  if (lower.includes('claude')) {
    return {
      label: 'Claude',
      badgeClass: 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/25'
    };
  }
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) {
    return {
      label: 'OpenAI',
      badgeClass: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/25'
    };
  }
  if (lower.includes('deepseek')) {
    return {
      label: 'DeepSeek',
      badgeClass: 'bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border-cyan-500/25'
    };
  }
  if (lower.includes('qwen')) {
    return {
      label: 'Qwen',
      badgeClass: 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/25'
    };
  }
  if (lower.includes('llama')) {
    return {
      label: 'Llama',
      badgeClass: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/25'
    };
  }
  return {
    label: 'LLM',
    badgeClass: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/25'
  };
}
```
2. Update `ModelStatItem` interface:
```ts
export interface ModelStatItem {
  model: string;
  requests: number;
  standardRequests: number;
  highRequests: number;
  percentage: number;
  avgLatency: number;
  highAvgLatency: number;
}
```
3. Update `aggregateModelStats` to track `highTotalDuration` and `highDurationCount`, and compute `highAvgLatency`:
```ts
        if (isHigh) {
          summary[baseModel].highTotalDuration = (summary[baseModel].highTotalDuration || 0) + numDur;
          summary[baseModel].highDurationCount = (summary[baseModel].highDurationCount || 0) + 1;
        }
```
And in final map:
```ts
highAvgLatency: (data.highDurationCount || 0) > 0 ? Math.round(data.highTotalDuration / data.highDurationCount) : 0,
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/modelHelpers.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/utils/modelHelpers.ts tests/modelHelpers.test.ts
git commit -m "feat(models): add detectModelFamily helper and calculate highAvgLatency in aggregateModelStats"
```

---

### Task 2: Merge `-high` Suffix Models into Base Models in Accounts View and Utils

**Files:**
- Modify: `frontend/src/utils/accountModelStats.ts`
- Modify: `frontend/src/components/AccountsView.tsx`
- Test: `tests/accountModelStats.test.ts`

**Interfaces:**
- Consumes: `normalizeModelName` from `./modelHelpers`
- Produces: Merged `ServerModelStats`, merged `getAccountTopModels`, merged `getModelBreakdowns` without `-high` duplicates

- [x] **Step 1: Write failing test in `tests/accountModelStats.test.ts` for `-high` model aggregation**

Add tests verifying:
1. `calculateServerModelStats` combines `gemini-2.5-pro` and `gemini-2.5-pro-high` under `gemini-2.5-pro` with summed requests, success, and error.
2. `getAccountTopModels` combines `gemini-2.5-pro-high` and `gemini-2.5-pro` into `gemini-2.5-pro`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/accountModelStats.test.ts`
Expected: FAIL due to separate `-high` entries.

- [x] **Step 3: Implement model normalization in `accountModelStats.ts` and `AccountsView.tsx`**

1. In `frontend/src/utils/accountModelStats.ts`:
Import `normalizeModelName` from `./modelHelpers`.
In `calculateServerModelStats`:
```ts
    if (usage.byModel) {
      for (const [rawModel, item] of Object.entries(usage.byModel)) {
        const cleanModel = rawModel.replace(/^models\//, '').trim();
        const { baseModel } = normalizeModelName(cleanModel);
        const reqCount = item.requests ?? item.usage ?? 0;
        const succCount = item.success ?? reqCount;
        const errCount = item.error ?? 0;

        const current = modelMap.get(baseModel) || { requests: 0, success: 0, error: 0 };
        current.requests += reqCount;
        current.success += succCount;
        current.error += errCount;
        modelMap.set(baseModel, current);
      }
    }
```
In `getAccountTopModels`:
```ts
export function getAccountTopModels(usage?: AccountUsage, limit: number = 2): Array<{ model: string; count: number }> {
  if (!usage?.byModel) return [];

  const map = new Map<string, number>();
  for (const [rawModel, item] of Object.entries(usage.byModel)) {
    const cleanModel = rawModel.replace(/^models\//, '').trim();
    const { baseModel } = normalizeModelName(cleanModel);
    const count = item.requests ?? item.usage ?? 0;
    if (count > 0) {
      map.set(baseModel, (map.get(baseModel) || 0) + count);
    }
  }

  const list: Array<{ model: string; count: number }> = [];
  for (const [model, count] of map.entries()) {
    list.push({ model, count });
  }

  return list.sort((a, b) => b.count - a.count).slice(0, limit);
}
```
2. In `frontend/src/components/AccountsView.tsx`:
In `getModelBreakdowns`:
```ts
    for (const [rawModel, item] of Object.entries(usage.byModel)) {
      const cleanModel = rawModel.replace(/^models\//, '').trim();
      const { baseModel } = normalizeModelName(cleanModel);
      const count = item.usage ?? item.requests ?? 0;
      const success = item.success ?? count;
      const error = item.error ?? 0;
      const limit = item.limit;

      const existing = map.get(baseModel);
      if (existing) {
        existing.count += count;
        existing.success = (existing.success ?? 0) + success;
        existing.error = (existing.error ?? 0) + error;
        if (limit !== undefined) existing.limit = limit;
      } else {
        map.set(baseModel, {
          model: baseModel,
          count,
          limit,
          success,
          error
        });
      }
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/accountModelStats.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/utils/accountModelStats.ts frontend/src/components/AccountsView.tsx tests/accountModelStats.test.ts
git commit -m "fix(accounts): merge -high suffix models into base models for usage statistics"
```

---

### Task 3: Refine Dashboard Model Performance Matrix to Display Only High Spec & High Latency

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/modelPerformanceMatrixEnhancement.test.ts`

**Interfaces:**
- Consumes: `detectModelFamily`, `ModelStatItem` with `highAvgLatency`
- Produces: Streamlined High specification column with High latency badge, removed standard spec capsule

- [x] **Step 1: Update i18n keys for High specification column**

In `frontend/src/i18n/locales/zh.ts`:
```ts
highSpecDistribution: "High 规格用量与延迟",
```
In `frontend/src/i18n/locales/en.ts`:
```ts
highSpecDistribution: "High Spec & Latency",
```

- [x] **Step 2: Update `ModelPerformanceMatrix.tsx`**

1. Import `detectModelFamily` from `../../utils/modelHelpers` instead of local function.
2. Update table header:
```tsx
<th
  className="py-2.5 px-3 font-semibold text-center min-w-[210px] cursor-pointer select-none group hover:text-[var(--text-primary)] transition-colors"
  onClick={() => handleSort('spec')}
  title={t('dashboard.sortBy', '点击排序')}
>
  <div className="flex items-center justify-center space-x-1.5">
    <span>{t('dashboard.highSpecDistribution', 'High 规格用量与延迟')}</span>
    {renderSortIcon('spec')}
  </div>
</th>
```
3. In table body rows, remove standard capsule and render High capsule with latency:
```tsx
<td className="py-3 px-3">
  <div className="flex items-center justify-center">
    {highCount > 0 ? (
      <span
        className="bg-fuchsia-500/10 text-fuchsia-400 font-mono text-[10px] px-2.5 py-0.5 rounded-full flex items-center space-x-1 font-medium whitespace-nowrap border border-fuchsia-500/20"
        title={`${t('dashboard.highReqs', 'High 规格')}: ${highCount.toLocaleString()} (${Math.round(highPercent)}%)${item.highAvgLatency > 0 ? ` · ${t('dashboard.averageLatency')}: ~${item.highAvgLatency}ms` : ''}`}
      >
        <Zap className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
        <span className="tabular-nums">High {highCount.toLocaleString()} · {Math.round(highPercent)}%{item.highAvgLatency > 0 ? ` · ~${item.highAvgLatency}ms` : ''}</span>
      </span>
    ) : (
      <span
        className="bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] opacity-40 font-mono text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 whitespace-nowrap"
        title={`${t('dashboard.highReqs', 'High 规格')}: 0 (0%)`}
      >
        <Zap className="w-2.5 h-2.5 shrink-0 opacity-60" />
        <span>High 0 · 0%</span>
      </span>
    )}
  </div>
</td>
```
4. In mobile card view, render High capsule with latency accordingly.

- [x] **Step 3: Update `tests/modelPerformanceMatrixEnhancement.test.ts`**

Update test assertions for High spec only and verify:
Run: `npm test -- tests/modelPerformanceMatrixEnhancement.test.ts`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/modelPerformanceMatrixEnhancement.test.ts
git commit -m "feat(dashboard): refine model matrix to show only High spec usage and High average latency"
```

---

### Task 4: Unify Accounts View Model Breakdown UI with Dashboard Matrix

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/accountsViewUiUnification.test.ts` (or existing accounts test)

**Interfaces:**
- Consumes: `detectModelFamily` from `../utils/modelHelpers`
- Produces: Redesigned Node Model Breakdown section with card header, family badges, glow dots, and copy action

- [x] **Step 1: Add i18n keys for accounts active models header**

In `frontend/src/i18n/locales/zh.ts`:
```ts
activeModelsTitle: "活跃模型处理明细",
```
In `frontend/src/i18n/locales/en.ts`:
```ts
activeModelsTitle: "Active Models Breakdown",
```

- [x] **Step 2: Add copy feedback state and update model breakdown cards in `AccountsView.tsx`**

1. Add state:
```tsx
const [copiedServerModel, setCopiedServerModel] = useState<string | null>(null);
```
2. Import `Layers`, `detectModelFamily`.
3. Redesign the header of `Node Model Usage Overview` to include `Layers` icon badge, uppercase title, count badge, and aligned total request / success rate stats.
4. Redesign each model item in the grid to display:
   - Glow dot with dynamic color;
   - `detectModelFamily(item.model)` badge;
   - Truncated model name;
   - Model name copy button with `Check`/`Copy` feedback;
   - Bottom row with request count, share percent, success/error count, and success rate.

- [x] **Step 3: Run accounts view unit tests**

Run: `npm test -- tests/accountModelStats.test.ts`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/AccountsView.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(accounts): align node model breakdown UI with dashboard matrix styling and family badges"
```

---

### Task 5: Full Regression Testing and Frontend Build Check

**Files:**
- Test: Full Jest suite (`npm test`)
- Build: Frontend production bundle (`npm run build:frontend`)

- [x] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 124+ test suites pass without regressions.

- [x] **Step 2: Run frontend build check**

Run: `npm run build:frontend`
Expected: TypeScript validation and Vite bundling succeed with exit code 0.

- [x] **Step 3: Commit any final cleanups**

```bash
git add -A
git commit -m "chore: verify tests and frontend build for model usage normalization and UI alignment"
```

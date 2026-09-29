# Model Spec Distribution Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the model specification distribution (Standard vs High spec) column and mobile micro-cards in `ModelPerformanceMatrix.tsx` with high-contrast dual-color pill badges, explicit percentages, and an amplified gradient ratio bar (`h-2.5`).

**Architecture:** Update `ModelPerformanceMatrix.tsx` to calculate and format explicit percentages for both standard and high specifications, wrap them into styled pill badges (`sky` for standard and `fuchsia` for high), and upgrade the dual-color ratio bar to `h-2.5` with linear gradients and container border spacing. Keep mobile view aligned with the same badge and bar styling.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide Icons (`Zap`), Jest.

**Spec:** `docs/superpowers/specs/2026-09-29-model-spec-distribution-matrix-design.md`

## Global Constraints

- Must preserve TypeScript strict mode without type errors or `any` escapes.
- Must ensure responsive alignment across desktop tables (`min-w-[210px]`) and mobile micro-cards.
- Must preserve backward compatibility with existing `ModelStatItem` data structure and localized strings.
- Must keep high spec zero-state graceful with an aligned low-contrast capsule so row heights do not jitter.

## Review Focus

1. **Zero High Requests:** Ensure rows with 0 high requests render an aligned ghost capsule (`High 0 · 0%` or `-`) rather than breaking column alignment or causing NaN% errors.
2. **Zero Total Requests:** Ensure models with 0 total requests safely display `0% / 0%` without division-by-zero or `NaN`.
3. **100% High Requests:** Ensure models with only high requests render smooth rounded capsules without gradient overflow.
4. **Mobile Layout Widths:** Ensure mobile micro-cards do not overflow horizontally or wrap badges awkwardly on narrow viewports (320px).
5. **Dark & Light Mode Contrast:** Ensure badge text and backgrounds have sufficient contrast in both dark and light modes.

---

### Task 1: Update Test Assertions for Visual Enhancements

**Files:**
- Test: `tests/modelPerformanceMatrixEnhancement.test.ts`

**Interfaces:**
- Consumes: `ModelPerformanceMatrix.tsx` content
- Produces: Test suite validating `h-2.5`, `fuchsia-500`, `sky-500`, and badge formatting in `ModelPerformanceMatrix.tsx`.

- [ ] **Step 1: Write failing test assertion in `tests/modelPerformanceMatrixEnhancement.test.ts`**

Update `tests/modelPerformanceMatrixEnhancement.test.ts` to assert that `ModelPerformanceMatrix.tsx` uses the new `h-2.5` ratio bar and high-contrast spec badge styling:

```typescript
  test('ModelPerformanceMatrix should render amplified dual-color spec badges and ratio bar', () => {
    // Should use h-2.5 for the amplified ratio bar
    expect(matrixContent).toContain('h-2.5');
    // Should use fuchsia and sky badge colors
    expect(matrixContent).toMatch(/fuchsia-500|fuchsia-400/);
    expect(matrixContent).toMatch(/sky-500|sky-400/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/modelPerformanceMatrixEnhancement.test.ts`
Expected: FAIL because `h-2.5` and `fuchsia` are not yet present in `ModelPerformanceMatrix.tsx`.

- [ ] **Step 3: Commit failing test update**

```bash
git add tests/modelPerformanceMatrixEnhancement.test.ts
git commit -m "test: add assertions for amplified spec distribution badges and ratio bar"
```

---

### Task 2: Implement Redesigned Spec Distribution Badges & Gradient Ratio Bar

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx:99-101,160-200,298-331`
- Test: `tests/modelPerformanceMatrixEnhancement.test.ts`

**Interfaces:**
- Consumes: `ModelStatItem` with `standardRequests`, `highRequests`, `requests`.
- Produces: Enhanced dual-color pill badges and `h-2.5` gradient bar in desktop table & mobile cards.

- [ ] **Step 1: Update desktop column header width and spec cells in `ModelPerformanceMatrix.tsx`**

1. In desktop table header (`th`), adjust `min-w-[170px]` to `min-w-[210px]`.
2. Compute safe percentage variables:
   ```typescript
   const stdCount = item.standardRequests || 0;
   const highCount = item.highRequests || 0;
   const totalSpec = stdCount + highCount;
   const stdPercent = totalSpec > 0 ? (stdCount / totalSpec) * 100 : 100;
   const highPercent = totalSpec > 0 ? (highCount / totalSpec) * 100 : 0;
   ```
3. Update Desktop Spec Distribution cell (`td`):
   - Replace simple bullet text with two compact pill badges:
     - Standard Pill: `border border-sky-500/30 bg-sky-500/10 text-sky-400 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 font-medium`
     - High Pill (when `highCount > 0`): `border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 font-medium`
     - High Pill (when `highCount === 0`): `border border-[var(--border-subtle)] bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] opacity-40 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1`
   - Upgrade Ratio Bar:
     - Container: `w-full bg-black/5 dark:bg-white/5 h-2.5 rounded-full overflow-hidden p-0.5 flex border border-black/5 dark:border-white/5`
     - Standard Segment: `bg-gradient-to-r from-sky-500 to-blue-500 h-full rounded-l-full transition-all duration-300` (rounded-full if 100%)
     - High Segment: `bg-gradient-to-r from-fuchsia-500 to-purple-600 h-full rounded-r-full transition-all duration-300` (rounded-full if 100%)

- [ ] **Step 2: Update mobile card spec distribution in `ModelPerformanceMatrix.tsx`**

Apply the same dual-color pill badge layout and `h-2.5` progress bar to the mobile card rendering section (`md:hidden`).

- [ ] **Step 3: Run unit tests to verify they pass**

Run: `npx jest tests/modelPerformanceMatrixEnhancement.test.ts`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/components/dashboard/ModelPerformanceMatrix.tsx
git commit -m "feat(ui): enhance model spec distribution with dual-color badges and amplified ratio bar"
```

---

### Task 3: Build Verification & Regression Testing

**Files:**
- Test: All tests across the test suite
- Verification: Frontend Vite compilation

- [ ] **Step 1: Run frontend build check**

Run: `npm run build:frontend`
Expected: Exit code 0 with clean Vite output in `dist/frontend`.

- [ ] **Step 2: Run full Jest test suite**

Run: `npm test`
Expected: 163+ test suites pass without regression.

- [ ] **Step 3: Commit any final tweaks if needed**

```bash
git status
```

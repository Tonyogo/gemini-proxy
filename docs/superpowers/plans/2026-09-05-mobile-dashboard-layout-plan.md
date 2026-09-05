# Mobile Dashboard Layout & Spacing Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize mobile viewport presentation on the dashboard by transforming the 4 KPI stat cards into a compact 2x2 grid, tightening container spacing, reducing card padding, and making the interactive chart height responsive.

**Architecture:** Use Tailwind responsive modifiers (`grid-cols-2 lg:grid-cols-4`, `p-3 sm:p-5`, `text-lg sm:text-2xl`, `h-[300px] sm:h-[380px]`) across `DashboardView.tsx` and `ModelPerformanceMatrix.tsx`. This keeps desktop layouts completely untouched while significantly increasing mobile information density.

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Jest

**Spec:** `docs/superpowers/specs/2026-09-05-mobile-dashboard-layout-design.md`

## Global Constraints

- Never break existing desktop styles or remove functionality.
- Maintain CSS variable color tokens (`var(--bg-surface)`, `var(--text-primary)`, `var(--border-subtle)`).
- Ensure all tests in `tests/dashboardOptimization.test.ts` continue to pass.
- Verify production Vite build succeeds cleanly with `npm run build:frontend`.

---

### Task 1: Add Unit Tests for Mobile Dashboard Layout Assertions

**Files:**
- Modify: `tests/dashboardOptimization.test.ts`

**Interfaces:**
- Consumes: Test file reading `frontend/src/components/DashboardView.tsx` and `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`
- Produces: Verified unit test asserting `grid-cols-2 lg:grid-cols-4` and responsive chart height `h-[300px] sm:h-[380px]`

- [ ] **Step 1: Write the failing tests in `tests/dashboardOptimization.test.ts`**

Add tests checking for mobile 2-column KPI grid and responsive chart card height.

```typescript
  test('should use 2-column compact grid for KPI cards on mobile', () => {
    expect(content).toContain('grid-cols-2 lg:grid-cols-4');
  });

  test('should use responsive height for interactive APM chart', () => {
    expect(content).toContain('h-[300px] sm:h-[380px]');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/dashboardOptimization.test.ts`
Expected: FAIL due to missing `grid-cols-2 lg:grid-cols-4` and `h-[300px] sm:h-[380px]`.

---

### Task 2: Implement Mobile Layout & Spacing in DashboardView.tsx

**Files:**
- Modify: `frontend/src/components/DashboardView.tsx:275-450`

**Interfaces:**
- Consumes: `DashboardView` component JSX
- Produces: Compact mobile header, 2x2 KPI card layout, responsive padding, and responsive chart container

- [ ] **Step 1: Update page container and header spacing**

In `frontend/src/components/DashboardView.tsx`:
Change root container spacing:
```tsx
<div className="space-y-3.5 sm:space-y-6 max-w-7xl mx-auto font-sans pb-8">
```
Change header gap and title size:
```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4">
  <div>
    <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight flex items-center space-x-2">
```
Change time range selector button padding:
```tsx
className={`ui-tab-pill font-mono px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs ${
  range === r ? 'ui-tab-pill-active' : ''
}`}
```

- [ ] **Step 2: Transform KPI Cards to 2-column compact grid**

Change KPI grid from:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
```
To:
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
```

For each of the 4 KPI cards:
- Change padding to `p-3 sm:p-5`
- Change icon wrapper to `w-6 h-6 sm:w-8 sm:h-8 rounded-lg`
- Change icon size to `w-3.5 h-3.5 sm:w-4 sm:h-4`
- Change primary stat text to `text-lg sm:text-2xl font-mono font-bold tracking-tight text-[var(--text-primary)]`
- Change footer margins and font sizes to `mt-1.5 sm:mt-3 text-[10px] sm:text-[11px]`

- [ ] **Step 3: Update APM Chart Card Container to Responsive Height**

Change the APM Chart card container:
```tsx
<div className="ui-card p-3.5 sm:p-6 relative flex flex-col h-[300px] sm:h-[380px] transition-colors group">
```

- [ ] **Step 4: Run tests to verify Task 1 tests now pass**

Run: `npx jest tests/dashboardOptimization.test.ts`
Expected: PASS

---

### Task 3: Optimize Mobile Compact Layout for ModelPerformanceMatrix.tsx

**Files:**
- Modify: `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`

**Interfaces:**
- Consumes: `ModelPerformanceMatrix` component JSX
- Produces: Compact padding and spacing on mobile screens

- [ ] **Step 1: Update Card Padding and Header**

In `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`:
Change card padding:
```tsx
<div className="ui-card p-3 sm:p-5 flex flex-col w-full overflow-hidden">
```
Change header margin:
```tsx
<div className="flex items-center justify-between mb-2.5 sm:mb-4">
```

- [ ] **Step 2: Update Mobile Card List Spacing**

Change mobile list item gap:
```tsx
<div className="md:hidden space-y-2">
```
Change mobile card item padding:
```tsx
<div key={item.model} className="space-y-1 p-2 sm:p-2.5 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]/60">
```

- [ ] **Step 3: Run Jest and Frontend Build Verification**

Run:
```bash
npx jest tests/dashboardOptimization.test.ts
npm run build:frontend
```
Expected: All tests PASS and build finishes with 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add tests/dashboardOptimization.test.ts frontend/src/components/DashboardView.tsx frontend/src/components/dashboard/ModelPerformanceMatrix.tsx docs/superpowers/
git commit -m "feat(dashboard): optimize mobile layout with 2x2 KPI grid and compact spacing"
```

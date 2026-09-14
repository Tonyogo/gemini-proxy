# Mobile Model Mapping UI Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the mobile layout and buttons for the Model Mappings tab in `ConfigModal.tsx` by integrating the index badge and action buttons into a compact top header row, reducing card height by ~35% while preserving the desktop single-row layout without DOM duplication.

**Architecture:** Utilize CSS flexbox order and wrapping (`flex-wrap sm:flex-nowrap`, `order-1`, `order-2 sm:order-3`, `order-3 sm:order-2`) to position the `#index` and action buttons (strategy, HIGH toggle, trash) on row 1 in mobile view while wrapping full-width inputs to rows 2 & 3. In desktop (`sm:`), restore natural horizontal flow (`index -> inputs -> actions`) without duplicating JSX or state.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Jest, Vite.

## Global Constraints

- Preserve all existing mapping functionality: source/target editing, multi-target badge (`×N`), strategy select (`least-used`, `round-robin`, `weighted`), HIGH toggle (`-high` suffix), and mapping removal.
- Zero DOM duplication for inputs or action controls.
- Maintain desktop (`sm:`) single-line visual flow and alignment.
- Keep tests runnable via `npx jest tests/configModalMobile.test.ts` and ensure frontend build (`npm run build:frontend`) passes with 0 errors.

---

### Task 1: Create Test Assertions for Mobile Model Mapping Compact Layout

**Files:**
- Modify: `tests/configModalMobile.test.ts`

**Interfaces:**
- Consumes: `frontend/src/components/ConfigModal.tsx`
- Produces: Automated assertions validating the presence of flex-wrap ordering, mobile compact button sizes (`h-7` and `sm:h-8`), and removal of redundant bottom action separator.

- [ ] **Step 1: Write the failing test**

Edit `tests/configModalMobile.test.ts` to add test assertions for the mobile compact layout:

```typescript
test('should layout model mapping with mobile top action bar and desktop single-line flow', () => {
  expect(content).toContain('order-1');
  expect(content).toContain('order-2 sm:order-3');
  expect(content).toContain('order-3 sm:order-2');
  expect(content).toContain('h-7 sm:h-8');
});

test('should remove bottom action separator in mobile mapping card', () => {
  // Verifies that the previous pt-1.5 border-t separator inside mapping item actions is eliminated
  expect(content).not.toContain('pt-1.5 sm:pt-0 border-t border-white/[0.04]');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/configModalMobile.test.ts`
Expected: FAIL due to missing `order-2 sm:order-3` and obsolete `border-t border-white/[0.04]`.

- [ ] **Step 3: Commit test file changes**

```bash
git add tests/configModalMobile.test.ts
git commit -m "test(config): add assertions for compact mobile model mapping layout"
```

---

### Task 2: Implement Compact Mobile Layout & Button Optimization in ConfigModal.tsx

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:696-795`

**Interfaces:**
- Consumes: `entry`, `handleEntryChange`, `handleToggleHigh`, `handleRemoveMapping`
- Produces: Compact responsive flex mapping card with top row header and optimized action buttons.

- [ ] **Step 1: Refactor mapping item card JSX layout and button sizing**

In `frontend/src/components/ConfigModal.tsx`, replace the mapping entry inner container (around lines 704-792) with:

```tsx
<div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-start gap-y-2 sm:gap-y-0 sm:gap-x-1.5">
  {/* Index Badge: Order 1 on mobile and desktop */}
  <div className="order-1 flex items-center space-x-1 shrink-0">
    <span className="text-[10px] font-mono font-bold text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
      #{index + 1}
    </span>
  </div>

  {/* Compact Action Buttons: Order 2 on mobile (aligned right in header), Order 3 on desktop */}
  <div className="order-2 sm:order-3 flex items-center gap-1.5 sm:gap-1 shrink-0 ml-auto sm:ml-0">
    <select
      value={entry.strategy || ''}
      onChange={(e) => handleEntryChange(entry.id, 'strategy', e.target.value)}
      className="w-[88px] sm:w-[94px] h-7 sm:h-8 ui-input p-1 sm:p-2 text-[10px] sm:text-[11px] shrink-0 appearance-none cursor-pointer"
      title={t('config.strategy')}
    >
      <option value="">{t('config.strategyDefault')}</option>
      <option value="least-used">{t('config.strategyLeastUsed')}</option>
      <option value="round-robin">{t('config.strategyRoundRobin')}</option>
      <option value="weighted">{t('config.strategyWeighted')}</option>
    </select>
    <button
      type="button"
      onClick={() => handleToggleHigh(entry.id, entry.target)}
      className={`h-7 sm:h-8 px-2 sm:px-1.5 py-0.5 sm:py-1.5 text-[9px] sm:text-[10px] font-bold rounded-lg transition-all border shrink-0 flex items-center space-x-0.5 active:scale-95 ${
        entry.target.trim().endsWith('-high')
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
          : 'ui-btn-secondary'
      }`}
      title={t('config.highToggleTooltip')}
    >
      <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
      <span>HIGH</span>
    </button>
    <button
      type="button"
      onClick={() => handleRemoveMapping(entry.id)}
      className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors text-xs shrink-0 active:scale-95"
      title="Remove mapping"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>

  {/* Source -> Target Input Fields: Order 3 on mobile (full width row 2 & 3), Order 2 on desktop (middle) */}
  <div className="order-3 sm:order-2 w-full sm:w-auto flex-1 min-w-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
    <div className="flex-[2] min-w-0">
      <label className="text-[10px] text-slate-400 block sm:hidden mb-0.5 font-semibold">
        {t('config.sourceModelShort', '源模型')}
      </label>
      <input
        type="text"
        value={entry.source}
        onChange={(e) => handleEntryChange(entry.id, 'source', e.target.value)}
        placeholder={t('config.sourceModelPlaceholder', '如 claude-3-5-sonnet')}
        className="w-full ui-input p-1.5 sm:p-2 text-xs"
      />
    </div>
    <span className="hidden sm:inline text-slate-500 font-bold text-xs shrink-0">→</span>
    <div className="flex-[3] min-w-0">
      <label className="text-[10px] text-slate-400 block sm:hidden mb-0.5 font-semibold">
        {t('config.targetModelShort', '重定向至')}
      </label>
      <div className="relative flex items-center">
        <input
          type="text"
          value={entry.target}
          onChange={(e) => handleEntryChange(entry.id, 'target', e.target.value)}
          onFocus={() => setFocusedTargetId(entry.id)}
          onBlur={() => setFocusedTargetId(null)}
          placeholder={t('config.targetModelPlaceholder', '如 gemini-2.5-pro')}
          className={`w-full ui-input p-1.5 sm:p-2 text-xs text-amber-500 dark:text-amber-300 ${
            isMultiTarget && focusedTargetId !== entry.id ? 'pr-6' : ''
          }`}
        />
        {isMultiTarget && focusedTargetId !== entry.id && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center">
            <span
              className="text-[9px] font-mono font-bold text-amber-500 dark:text-amber-300 bg-[var(--bg-surface-sub)] border border-amber-500/60 shadow-sm px-1 py-0.5 rounded leading-none flex items-center select-none"
              title={`${targets.length} targets configured`}
            >
              ×{targets.length}
            </span>
          </div>
        )}
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest tests/configModalMobile.test.ts`
Expected: PASS with 5 passed tests.

- [ ] **Step 3: Run frontend build to verify TypeScript and JSX compilation**

Run: `npm run build:frontend`
Expected: PASS with clean bundle output in `dist/frontend`.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): optimize mobile model mapping layout with integrated header actions"
```

---

### Task 3: Full Suite Verification & Build Verification

**Files:**
- Verify: Full Jest test suite and frontend build

- [ ] **Step 1: Run all tests in band**

Run: `npm test`
Expected: All test suites pass.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Backend TypeScript and frontend Vite bundle build successfully.

- [ ] **Step 3: Final sanity commit (if any leftover changes)**

```bash
git status
```

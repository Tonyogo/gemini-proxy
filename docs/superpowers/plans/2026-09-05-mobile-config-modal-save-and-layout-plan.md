# Mobile Config Modal Save & Touch Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix unresponsive Save buttons and misaligned clicks in the mobile configuration modal by adding a header quick-save button, locking body scroll while the modal is open, handling dynamic viewport height (`dvh`) and safe area insets, and ensuring proper touch targets in model mappings.

**Architecture:** 
- In `frontend/src/components/ConfigModal.tsx`, add a mobile-only quick Save action in the header alongside the Close button.
- Add a body scroll lock via `useEffect` to prevent background scroll interference.
- Add `safe-area-inset-bottom` padding to the sticky footer and use `dvh` for responsive mobile drawer sizing.
- Improve touch target heights and spacing in the Model Mappings action row.

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Jest

**Spec:** `docs/superpowers/specs/2026-09-05-mobile-config-modal-save-and-layout-design.md`

## Global Constraints
- Preserve all existing desktop functionality and layout unchanged.
- Ensure strict TypeScript safety.
- Verify `npm run build:frontend` and `npm test` pass cleanly.

---

### Task 1: Add Unit Tests for Mobile Config Modal Enhancements

**Files:**
- Create: `tests/configModalMobile.test.ts`

**Interfaces:**
- Consumes: `frontend/src/components/ConfigModal.tsx`
- Produces: Verified unit tests for header quick save, body scroll lock, safe area insets, and `dvh` viewport handling

- [ ] **Step 1: Write failing unit tests in `tests/configModalMobile.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Mobile Enhancements', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(modalPath, 'utf-8');
  });

  test('should include a mobile-only header quick save button', () => {
    expect(content).toContain('onClick={handleSave}');
    expect(content).toContain('sm:hidden');
  });

  test('should lock body scroll when modal is open and restore on close', () => {
    expect(content).toContain("document.body.style.overflow = 'hidden'");
  });

  test('should use dynamic viewport height dvh and safe area inset padding', () => {
    expect(content).toContain('dvh');
    expect(content).toContain('safe-area-inset-bottom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/configModalMobile.test.ts`
Expected: FAIL due to missing mobile header save button, body scroll lock, or `dvh` / `safe-area-inset-bottom`.

---

### Task 2: Implement Body Scroll Lock and Header Quick Save in ConfigModal.tsx

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:140-160, 350-400`

**Interfaces:**
- Consumes: `handleSave`, `saving`, `isOpen`, `onClose`
- Produces: Body scroll locking side-effect, header quick save button, and `dvh` modal container

- [ ] **Step 1: Add body scroll lock effect in ConfigModal.tsx**

In `ConfigModal.tsx`:
```tsx
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);
```

- [ ] **Step 2: Update modal container height to support dynamic viewport height (`dvh`)**

Change:
```tsx
<div className="ui-card rounded-t-2xl sm:rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[92vh] sm:h-auto sm:max-h-[90vh]">
```
To:
```tsx
<div className="ui-card rounded-t-2xl sm:rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[92dvh] sm:h-auto sm:max-h-[90vh]">
```

- [ ] **Step 3: Add mobile quick save button to modal header**

In the Header right actions group:
```tsx
          <div className="flex items-center space-x-1.5 sm:space-x-1 shrink-0">
            {/* Mobile-only Quick Save Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 sm:hidden shadow-sm active:scale-95 disabled:opacity-50 transition-all"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{saving ? t('config.applying') : t('config.save')}</span>
            </button>

            <a
              href="https://github.com/Tonyogo/gemini-proxy"
              target="_blank"
              rel="noopener noreferrer"
              title={t('nav.github', 'GitHub Repository')}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0 flex items-center"
            >
              <Github className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
```

---

### Task 3: Optimize Sticky Footer Safe Area and Model Mappings Touch Targets

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:690-735, 790-830`

**Interfaces:**
- Consumes: Modal sticky footer, Model mappings list items
- Produces: Safe area padding in sticky footer, touch-friendly action buttons in model mappings

- [ ] **Step 1: Add safe area inset support to sticky footer**

Change footer container classes to:
```tsx
<div className="sticky bottom-0 bg-[var(--bg-surface-sub)]/95 backdrop-blur-xl border-t border-[var(--border-subtle)] p-3.5 sm:p-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex flex-col-reverse sm:flex-row items-center justify-between gap-3 shrink-0">
```

- [ ] **Step 2: Optimize model mappings action row touch targets on mobile**

In the model mappings action buttons container:
Ensure `select`, `HIGH` toggle button, and delete button have `h-8` touch targets and clean gaps:
```tsx
<div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-1 pt-1.5 sm:pt-0 border-t border-white/[0.04] sm:border-0 shrink-0">
  <select
    value={entry.strategy || ''}
    onChange={(e) => handleEntryChange(entry.id, 'strategy', e.target.value)}
    className="w-28 sm:w-[94px] h-8 ui-input p-1.5 sm:p-2 text-[10px] sm:text-[11px] shrink-0 appearance-none cursor-pointer"
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
    className={`h-8 px-2 sm:px-1.5 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold rounded-lg transition-all border shrink-0 flex items-center space-x-0.5 active:scale-95 ${
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
    className="h-8 w-8 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors text-xs shrink-0 active:scale-95"
    title="Remove mapping"
  >
    <Trash2 className="w-3.5 h-3.5" />
  </button>
</div>
```

- [ ] **Step 3: Run unit tests and frontend build**

Run:
```bash
npx jest tests/configModalMobile.test.ts
npm run build:frontend
```
Expected: PASS and clean build with 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add tests/configModalMobile.test.ts frontend/src/components/ConfigModal.tsx docs/superpowers/
git commit -m "feat(config): optimize mobile config modal with dual save buttons, body scroll lock, and safe area support"
```

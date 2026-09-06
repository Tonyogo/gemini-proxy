# API Playground Mobile Layout Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize API Playground (`PlaygroundView.tsx`) layout for mobile devices by organizing controls into structured, compact tiers, auto-switching to the response tab upon sending requests, and streamlining responsive heights.

**Architecture:** Restructure top control bar into responsive flex rows with desktop/mobile visibility adjustments, auto-switch active mobile tab on submit (`setMobileActiveTab('response')`), and adjust viewport height constraints for mobile viewports without breaking desktop layout.

**Tech Stack:** React 18, Tailwind CSS, Lucide React, Monaco Editor React.

## Global Constraints
- Preserve exact desktop layout and functionality for screens `>= md` / `>= lg`.
- Ensure strict TypeScript compilation with zero errors.
- Ensure all tests pass.

---

### Task 1: Create failing test suite for Playground mobile layout optimizations

**Files:**
- Create: `tests/playgroundMobileOptimization.test.ts`

**Interfaces:**
- Validates that `PlaygroundView.tsx` implements:
  1. Auto-switch to response tab when `handleSend` is triggered (`setMobileActiveTab('response')`).
  2. Structured multi-tier responsive header controls (`flex flex-col` on mobile with compact action rows).
  3. Responsive height classes for mobile viewports (`h-auto` or `min-h-0` on mobile, fixed height on desktop).

- [ ] **Step 1: Write the failing test**

Write `tests/playgroundMobileOptimization.test.ts`:
```typescript
import fs from 'fs';
import path from 'path';

describe('Playground View Mobile Layout Optimization', () => {
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(playgroundPath, 'utf-8');
  });

  test('auto-switches mobile tab to response on handleSend', () => {
    expect(content).toContain("setMobileActiveTab('response');");
  });

  test('uses responsive height on main container to prevent mobile viewport clipping', () => {
    expect(content).toMatch(/h-auto\s+md:h-\[calc\(100dvh-6\.5rem\)\]/);
  });

  test('organizes mobile controls with responsive tiered layout', () => {
    // Top brand/action row
    expect(content).toContain('hidden sm:block');
    // Compact action button in header
    expect(content).toContain('handleSend');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/playgroundMobileOptimization.test.ts`
Expected: FAIL (missing `setMobileActiveTab('response')` and responsive height regex).

- [ ] **Step 3: Implement minimal code in PlaygroundView.tsx**

Update `frontend/src/components/PlaygroundView.tsx`:
1. In `handleSend`, add `setMobileActiveTab('response');` right after `setLoading(true);`.
2. In main container wrapper, replace `min-h-[600px] md:h-[calc(100dvh-6.5rem)]` with `h-auto min-h-0 md:h-[calc(100dvh-6.5rem)]`.
3. In header workbench:
   - Row 1: Brand title & logo (left) + Primary Send button (right on mobile, flex on desktop).
   - Row 2: Model select + Endpoint select in a 2-column flex grid on mobile (`flex-1 w-full sm:w-auto`).
   - Row 3: Stream toggle, Presets, Copy cURL, and Concurrent test grouped into a clean horizontally scrolling/wrapped auxiliary toolbar.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/playgroundMobileOptimization.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite and build**

Run: `npx jest --runInBand && npm run build:frontend`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/playgroundMobileOptimization.test.ts frontend/src/components/PlaygroundView.tsx
git commit -m "feat(playground): optimize mobile layout and auto-switch response tab"
```

# Config Modal Model Mappings Layout & Scrolling Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate nested scrolling bottlenecks and compact the model mapping entries in `ConfigModal.tsx` so that when multiple 1-to-N model mappings are configured, the modal expands naturally, displays cleanly across viewports, and scrolls smoothly without layout clipping.

**Architecture:**
- Remove arbitrary nested height caps (`max-h-72 sm:max-h-64`) on the KV model mappings container in `frontend/src/components/ConfigModal.tsx`, allowing the parent modal scroll viewport to handle unified scrolling.
- Add index counter badge (`#1`, `#2`, ...) and rule count summary (`(count rules)`) to provide clear visual structure when many mappings are present.
- Compact padding and input heights on both desktop and mobile views (`p-2.5 sm:p-2`, tight borders).
- Ensure "Add Mapping Rule" button remains accessible and smooth.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons.

**Spec:** In-chat approved Bounded Design for Config Modal Mappings List Optimization.

## Global Constraints
- Strict TypeScript: maintain type safety across components.
- Zero feature regression on model mapping parsing, saving, and bidirectional JSON sync.
- Verification: `npm run build` and `npx jest --runInBand`.

---

### Task 1: Refactor Model Mappings Container & Compact Entry Cards in ConfigModal.tsx

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`

**Interfaces:**
- Consumes: `MappingEntry`, `mappingEntries`, `useTranslation()`.
- Produces: Streamlined model mapping rules layout without nested scrollbar constraints.

- [ ] **Step 1: Inspect and update Tab 4 (mappings) container in ConfigModal.tsx**

1. In `ConfigModal.tsx`:
   - Display active rule count in section header (e.g. `({count})`).
   - Remove `max-h-72 sm:max-h-64 overflow-y-auto` from mapping entries list container.
   - Add mini index indicator badge (`#${index + 1}`) before each mapping entry.
   - Refine padding (`p-2.5 sm:p-2`) and layout for desktop & mobile to ensure high information density.

- [ ] **Step 2: Verify build compilation**

Run: `npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 3: Run full automated test suite**

Run: `npx jest --runInBand`
Expected: All 22 test suites pass.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): optimize model mappings layout and eliminate nested scrolling bottlenecks"
```

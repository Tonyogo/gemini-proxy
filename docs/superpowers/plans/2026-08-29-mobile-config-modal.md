# Mobile Config Modal Layout Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the dynamic runtime configuration modal (`ConfigModal.tsx`) for mobile viewports by converting it to a native-feeling bottom sheet modal with smooth tab scrolling, responsive model mapping cards, and a sticky touch-friendly footer.

**Architecture:**
- Adjust modal container to use bottom sheet styling on mobile (`items-end sm:items-center p-0 sm:p-4`, `rounded-t-2xl sm:rounded-2xl`, `h-[94vh] sm:h-auto sm:max-h-[90vh]`) with a top drag handle indicator.
- Optimize tab navigation with scrollbars hidden and touch-friendly padding.
- Modernize the Model Mappings editor on mobile into stacked card rows with clear field hierarchy (Source model, Target model, Scheduling strategy, High toggle, Delete).
- Upgrade modal footer to be sticky at the bottom on mobile with a full-width action button group.
- Improve form inputs (select, text inputs, textareas) font size and padding to prevent awkward mobile browser zoom and layout shifts.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons.

**Spec:** In-chat approved Bounded Design for Mobile Config Modal Optimization.

## Global Constraints
- Strict TypeScript: maintain type safety across components.
- Zero feature regression: retain all config state synchronization (KV editor, Raw JSON sync, Reset to env, Save & Apply).
- Test integrity: verify with `npm run build` and `npx jest --runInBand`.

---

### Task 1: Refactor ConfigModal.tsx with Mobile-First Responsive Layout

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`

**Interfaces:**
- Consumes: `ConfigModalProps`, `MappingEntry`, `TabType`, `useTranslation()`.
- Produces: Enhanced responsive layout supporting both desktop popups and mobile bottom sheets.

- [ ] **Step 1: Inspect and update modal outer wrapper & header**

1. Update modal outer overlay to align bottom on mobile (`items-end sm:items-center p-0 sm:p-4`).
2. Add mobile drag handle (`<div className="w-12 h-1 bg-white/20 rounded-full mx-auto my-1.5 block sm:hidden" />`).
3. Make header compact and sleek on mobile.

- [ ] **Step 2: Optimize Tab Bar for touch scrolling**

1. Ensure tabs container has `overflow-x-auto scrollbar-none` with smooth touch momentum scrolling (`-webkit-overflow-scrolling: touch`).
2. Maintain active tab visual hierarchy.

- [ ] **Step 3: Refactor Model Mappings KV list for mobile viewports**

1. In the KV editor list (`mappingEntries.map`), render mobile-optimized cards where Source and Target inputs stack neatly with clear labels, and Strategy / High / Delete buttons row aligns horizontally.
2. Maintain side-by-side flex layout on desktop (`sm:flex-row`).

- [ ] **Step 4: Refactor Modal Footer with Sticky Touch Actions**

1. Wrap modal footer in a sticky container (`sticky bottom-0 bg-[#121520]/95 backdrop-blur-xl border-t border-white/[0.08] p-3.5 sm:p-4`).
2. Display note and action buttons cleanly on mobile (e.g. `flex-col-reverse sm:flex-row gap-2 sm:gap-3`, full-width buttons on mobile).

- [ ] **Step 5: Verify build compilation**

Run: `npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 6: Run automated test suite**

Run: `npx jest --runInBand`
Expected: All test suites pass.

- [ ] **Step 7: Commit changes**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): optimize runtime config modal layout for mobile viewports"
```

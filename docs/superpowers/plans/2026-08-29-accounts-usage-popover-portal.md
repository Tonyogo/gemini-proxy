# Accounts View Usage Popover Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the account usage breakdown popover in `AccountsView.tsx` to render via React Portal directly into `document.body` with fixed position, eliminating clipping and z-index overlap issues caused by parent table overflow and stacking contexts.

**Architecture:**
- Create an interactive/smart positioned portal component or helper in `frontend/src/components/AccountsView.tsx` using `createPortal`.
- Track anchor DOM element bounding client rect (`anchorRect: DOMRect | null`) and target account usage data.
- Calculate fixed positioning coordinates (`top`, `bottom`, `left`, `right`) with boundary/viewport collision handling.
- Attach global event listeners for `scroll` (capture), `resize`, and outside `pointerdown` / `click` to dismiss the popover cleanly.

**Tech Stack:** React 18 (`createPortal`, hooks), TypeScript, Tailwind CSS, Lucide React icons.

**Spec:** In-chat approved Bounded Design for React Portal Top-Layer Usage Popover.

## Global Constraints
- Strict TypeScript: maintain type safety across components.
- Zero layout shift: ensure existing table styles and mobile card list view remain fully functional and visually cohesive.
- Test integrity: verify with `npm run build` and `npx jest --runInBand`.

---

### Task 1: Implement React Portal Top-Layer Usage Popover in AccountsView.tsx

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Consumes: `AccountDetail`, `AccountUsage`, `getModelBreakdowns()`, `getTotalUsage()`, `useTranslation()`.
- Produces: `createPortal`-based top-level popover rendering attached to `document.body`.

- [ ] **Step 1: Inspect popover state & DOM anchor logic**

Review current popover states in `AccountsView.tsx`:
- `activePopoverIndex: number | null`
- Replace/enhance with `popoverAnchor: { index: number; rect: DOMRect } | null` or equivalent.
- Ensure event listeners dismiss popover on scroll, resize, or outside click.

- [ ] **Step 2: Update AccountsView.tsx to use createPortal**

1. Import `createPortal` from `'react-dom'`.
2. Manage `activePopover: { index: number; rect: DOMRect; usage?: AccountUsage } | null`.
3. Add outside click and scroll listeners via `useEffect`.
4. Render the popover container using `createPortal(..., document.body)` with `fixed z-[100]`.
5. Implement smart position calculation (checking bottom space vs top space, viewport right bound clamping).

- [ ] **Step 3: Verify build compilation**

Run: `npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 4: Run automated test suite**

Run: `npx jest --runInBand`
Expected: All test suites pass.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(ui): render accounts usage details via React Portal on top layer"
```

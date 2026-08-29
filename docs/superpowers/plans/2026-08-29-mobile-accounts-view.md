# Mobile Accounts View Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a native mobile card list view and responsive controls for the Accounts management view (`AccountsView.tsx`) to replace the cluttered horizontally-scrolling desktop table on small screens.

**Architecture:** 
- Render dual-mode data views: Keep desktop `<table>` for `md:` screens, and render responsive `<div className="block md:hidden">` Account Cards for mobile screens.
- Mobile Account Card layout:
  - Header: Checkbox, `#index`, Context active indicator (⚡), Current badge, Status badge.
  - Body: Account name with copy button, canonical ID, in-card expandable Today Usage & model breakdown.
  - Footer: Large touch-friendly action buttons (Set as Current, Toggle Enable/Disable, Download, Delete).
- Mobile Top KPI Stats: Refine 6 status counters to `grid-cols-3 sm:grid-cols-3 lg:grid-cols-6` with compact padding for mobile screens.
- Floating Batch Action Bar: Position above fixed bottom navigation bar (`bottom-16 md:bottom-6`) with touch-friendly layout.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons

**Spec:** In-chat approved bounded design for mobile accounts list.

## Global Constraints
- Strict TypeScript: ensure all state, props, and callbacks match existing types.
- Preserve desktop table display and functionality 100% intact (`hidden md:block`).
- Support expandable model usage breakdown directly inside cards without popovers.

---

### Task 1: Refactor AccountsView.tsx for Mobile Cards, Compact KPIs, and Floating Batch Bar

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Consumes: `filteredAccounts`, `currentAuthIndex`, `selectedIndices`, `handleSelectOne`, `handleSelectAll`, `handleToggleDisabled`, `handleSetCurrent`, `handleDownloadSingle`, `setDeleteConfirm`, `getTotalUsage`, `getModelBreakdowns`, `renderStatusBadge`
- Produces: Dual-mode desktop table + mobile card list layout with in-card usage breakdown toggle.

- [ ] **Step 1: Update AccountsView.tsx with Mobile Card Presentation**

In `frontend/src/components/AccountsView.tsx`:
1. Add `expandedUsageIndices` state (`number[]` or `Set<number>`) for in-card collapsible today's usage details on mobile.
2. Refactor Top KPI Cards grid to `grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3` with compact padding on mobile.
3. Wrap existing `<table>` inside `<div className="hidden md:block overflow-x-auto">`.
4. Add mobile card list `<div className="block md:hidden divide-y divide-white/[0.06]">` rendering each account as a well-spaced card with touch targets.
5. Update floating batch action bar position to `bottom-16 md:bottom-6`.

- [ ] **Step 2: Build frontend to verify TypeScript and JSX compilation**

Run: `npm run build`
Expected: `✓ built in ...` and `tsc` exits with 0.

- [ ] **Step 3: Run test suite to ensure all tests pass**

Run: `npx jest --runInBand`
Expected: 22 test suites passed.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(ui): optimize accounts management view with native mobile card list"
```

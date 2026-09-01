# Mobile Web Terminal Topbar & Fullscreen Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the layout clipping issue on mobile devices so the terminal's built-in top window bar (containing macOS dots, live status, zoom, and fullscreen toggle) is immediately visible without scrolling, and add a quick-fullscreen action to the mobile top bar.

**Architecture:** Update `App.tsx` main container styles with dynamic viewport height (`100dvh`) bounds and add an explicit mobile topbar fullscreen button when on `webTerminal` tab; refine `WebTerminalView.tsx` top window bar with `shrink-0 sticky top-0` and responsive button spacing.

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Vite.

## Global Constraints

- **Viewport Bounding**: Main container bounded by `h-[calc(100dvh-3rem-3.5rem)] max-h-[calc(100dvh-3rem-3.5rem)]` on mobile when `activeTab === 'webTerminal'`.
- **Zero Horizontal/Vertical Overflow**: The terminal top window bar must stay `shrink-0 sticky top-0` at the very top of the terminal viewport.
- **Dual Triggers**: Fullscreen button available on both the terminal's own topbar and the global header on mobile.
- **Strict TypeScript & Zero Build Errors**: `npm run build:frontend` and `npm run build:backend` must pass cleanly.

---

### Task 1: Update Mobile Layout & Topbar Fullscreen Trigger in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: Dynamic `100dvh` layout bounds for `webTerminal` tab and mobile global header fullscreen trigger.

- [ ] **Step 1: Update App.tsx Header and Main container**

In `frontend/src/App.tsx`:
1. In the global header's action buttons, add a fullscreen trigger button when `activeTab === 'webTerminal'`:
```tsx
{activeTab === 'webTerminal' && (
  <button
    onClick={handleEnterStandalone}
    title={t('webTerminal.fullscreen')}
    className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 hover:text-white transition-all md:hidden active:scale-95"
  >
    <Maximize2 className="w-3.5 h-3.5" />
  </button>
)}
```
2. Update `<main>` classes:
```tsx
<main className={`flex-1 overflow-x-hidden ${
  activeTab === 'webTerminal'
    ? 'p-0 md:p-6 pb-0 md:pb-6 flex flex-col min-h-0 h-[calc(100dvh-3rem-3.5rem)] max-h-[calc(100dvh-3rem-3.5rem)] md:h-auto md:max-h-none overflow-hidden'
    : 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6'
}`}>
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "fix(ui): ensure mobile web terminal auto-fills screen without outer scrollbar"
```

---

### Task 2: Refine WebTerminalView Window Topbar for Small Screens

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Produces: `shrink-0 sticky top-0 z-20` top window bar with tight responsive spacing on mobile.

- [ ] **Step 1: Update WebTerminalView top window bar layout**

In `frontend/src/components/WebTerminalView.tsx`:
1. Ensure the outer container on mobile is `w-full h-full flex flex-col min-h-0 overflow-hidden`:
```tsx
className={`mx-auto flex flex-col bg-[#07090E] border border-white/[0.08] overflow-hidden shadow-2xl font-mono text-xs transition-all ${
  standalone
    ? 'fixed inset-0 z-50 rounded-none h-screen w-screen overflow-hidden overscroll-none border-none'
    : 'w-full h-full md:max-w-7xl md:h-[calc(100vh-140px)] md:min-h-[500px] rounded-none md:rounded-2xl border-x-0 md:border-x border-t-0 md:border-t'
}`}
```
2. Set the top window bar to `shrink-0 bg-[#0C0E14] border-b border-white/[0.08] px-2.5 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between select-none z-10`:
- macOS action dots, live status badge, and right action buttons (`ZoomOut`, `ZoomIn`, `RefreshCw`, `Trash2`, `Maximize2`) with compact button padding `p-1 sm:p-1.5` so all buttons fit cleanly on 375px screens.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "fix(terminal): prevent double scrollbars in mobile fullscreen mode"
```

---

### Task 3: Full End-to-End Verification

**Files:**
- All affected components.

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: 24 test suites pass.

- [ ] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Zero errors.

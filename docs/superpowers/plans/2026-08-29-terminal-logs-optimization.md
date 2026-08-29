# Terminal Logs Toolbar & Mobile Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De-clutter terminal log toolbar buttons to prevent crowding and text overflow, add fullscreen toggle mode, optimize mobile timestamp display to maximize log readability, and streamline the embedded logs toolbar in AccountsView.

**Architecture:**
- `TerminalLogsView.tsx`:
  - Replace text-heavy buttons with responsive Icon + Tooltip buttons (Auto-scroll with active pulse, Copy with feedback, Clear, Fullscreen toggle).
  - Add `isFullscreen` toggle to allow distraction-free, full-viewport terminal inspection on both desktop and mobile.
  - Implement smart timestamp formatting: on small screens, render compact `HH:mm:ss` instead of full ISO datetime strings, freeing up horizontal space for log text.
  - Add clean search/filter toolbar layout with compact margins.
- `AccountsView.tsx`:
  - Streamline the embedded upstream logs toolbar: replace long text checkboxes (`实时轮询`, `自动滚屏`) with compact pill buttons and icon badges to prevent text crowding on small and medium screens.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons (`Maximize2`, `Minimize2`, `ArrowDownCircle`, `Copy`, `Check`, `Trash2`, `Filter`, `Search`, `Terminal`, `Radio`)

**Spec:** In-chat approved bounded design for terminal logs optimization.

## Global Constraints
- Strict TypeScript: no type regressions.
- Ensure all button controls remain accessible with proper `title` attributes and touch targets.
- Retain SSE live streaming and auto-scroll functionality without breaking state.

---

### Task 1: Refactor TerminalLogsView.tsx Controls, Fullscreen Mode & Smart Timestamps

**Files:**
- Modify: `frontend/src/components/TerminalLogsView.tsx`

**Interfaces:**
- Consumes: `adminKey`, `useTranslation()`, `LogEntry`
- Produces: `isFullscreen` mode, compact responsive icon buttons, smart timestamp extraction.

- [ ] **Step 1: Update TerminalLogsView.tsx with Decluttered Toolbar, Fullscreen Toggle & Compact Mobile Timestamps**

1. Import `Maximize2`, `Minimize2` from `lucide-react`.
2. Add `isFullscreen` state (`boolean`, default `false`).
3. Refactor toolbar buttons:
   - Search input: flexible width (`w-28 xs:w-36 sm:w-44 md:w-56`).
   - Level filter: compact padding (`px-2 py-1`).
   - Auto-scroll button: compact icon with status indicator.
   - Copy button: compact icon with green checkmark feedback.
   - Clear button: compact icon with hover effect.
   - Fullscreen button: toggles `isFullscreen` to render the container with fixed full-screen overlay (`fixed inset-0 z-50 rounded-none h-screen`).
4. Update `renderFormattedLog`:
   - Parse timestamp and provide mobile-friendly short time (`HH:mm:ss`) alongside desktop full time.
   - Apply `break-all` and text sizing `text-[11px] sm:text-xs`.

- [ ] **Step 2: Build frontend to verify TypeScript and JSX compilation**

Run: `npm run build`
Expected: Vite build succeeds with 0 errors.

---

### Task 2: Streamline Embedded Upstream Logs Toolbar in AccountsView.tsx

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Consumes: `enableLivePolling`, `autoScrollLogs`, `copiedLogs`, `refreshingLogs`, `handleCopyLogs`, `handleManualRefreshLogs`
- Produces: Compact icon pills for live polling, auto scroll, refresh and copy.

- [ ] **Step 1: Refactor Embedded Upstream Logs Toolbar in AccountsView.tsx**

1. In the upstream logs header, convert long checkbox labels to compact pill toggles with icons and short tags (e.g., Live pulse badge, Auto-scroll icon button, Copy icon button).
2. Ensure no text overlap across mobile and medium screen widths.

- [ ] **Step 2: Build frontend and run test suite**

Run: `npm run build && npx jest --runInBand`
Expected: 22 test suites passed.

- [ ] **Step 3: Commit changes**

```bash
git add frontend/src/components/TerminalLogsView.tsx frontend/src/components/AccountsView.tsx
git commit -m "feat(ui): optimize terminal logs toolbar layout, mobile timestamps and fullscreen view"
```

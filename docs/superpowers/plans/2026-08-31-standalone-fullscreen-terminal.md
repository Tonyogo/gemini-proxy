# Standalone Fullscreen Web Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a code-server style standalone fullscreen Web Terminal that completely detaches from the admin dashboard layout, preventing background overscroll bleed and supporting direct `/terminal` routing.

**Architecture:** App-level route & state switcher detaching the dashboard layout (`<header>`, `<aside>`, `<nav>`, `<main>`) when standalone fullscreen mode is active or when URL is `/terminal` / `#/terminal`, rendering a pure root terminal component with viewport lockdown and native browser fullscreen invocation.

**Tech Stack:** React 18, `@xterm/xterm`, Tailwind CSS, TypeScript, Vite.

## Global Constraints

- **Zero-DOM Bleed**: When fullscreen/standalone is active, no sidebar, topbar, or bottom nav elements exist in the DOM.
- **Strict Lockdown**: `html` and `body` overscroll and bounce locked with `overscroll-behavior: none; touch-action: pan-y; position: fixed; inset: 0;`.
- **Navigation & URL**: Support direct URL `/terminal` or `#/terminal` as well as dynamic fullscreen toggle from within the dashboard.
- **Strict TypeScript**: `npm run build:frontend` and `npm run build:backend` must compile with zero errors.

---

### Task 1: Add Standalone Translations and App-Level Route Switcher

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: `isStandaloneTerminal` state in `App.tsx` controlled via URL route (`/terminal`, `#/terminal`) and toggle callbacks.

- [ ] **Step 1: Update i18n translation keys in `en.ts` and `zh.ts`**

Update `frontend/src/i18n/locales/en.ts`:
Add to `webTerminal`:
```typescript
    backToDashboard: "Back to Dashboard",
    exitStandalone: "Exit Standalone",
```

Update `frontend/src/i18n/locales/zh.ts`:
Add to `webTerminal`:
```typescript
    backToDashboard: "返回控制台",
    exitStandalone: "退出独立终端",
```

- [ ] **Step 2: Update `App.tsx` with Standalone Route & Fullscreen Switcher**

Modify `frontend/src/App.tsx`:
Add detection for `/terminal` or `#/terminal` route:
```typescript
const isTerminalRoute = () => {
  return window.location.pathname === '/terminal' || window.location.hash === '#/terminal' || window.location.hash === '#terminal';
};
```
Add `isStandaloneTerminal` state. When `isStandaloneTerminal` is true and user is authenticated:
Render ONLY `<WebTerminalView adminKey={adminKey} standalone={true} onExitStandalone={() => setStandalone(false)} />` at the root, completely skipping sidebar, top bar, and bottom nav.

- [ ] **Step 3: Test and build frontend**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts frontend/src/App.tsx
git commit -m "feat(ui): add standalone terminal route detection and layout isolation in App"
```

---

### Task 2: Refactor WebTerminalView for Pure Standalone Mode & Touch Isolation

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Consumes: `standalone?: boolean`, `onExitStandalone?: () => void`, `onToggleStandalone?: (val: boolean) => void`.
- Produces: Standalone viewport with `ArrowLeft` back button, zero-bounce touch containment, and optional native `requestFullscreen`.

- [ ] **Step 1: Update `WebTerminalView.tsx` with standalone props and UI**

Modify `frontend/src/components/WebTerminalView.tsx`:
- Accept props:
```typescript
interface WebTerminalViewProps {
  adminKey: string;
  standalone?: boolean;
  onExitStandalone?: () => void;
  onToggleStandalone?: (val: boolean) => void;
}
```
- In standalone mode or fullscreen mode:
  - Add "Back to Dashboard" button (`ArrowLeft` / `LayoutDashboard` icon) in the top mini bar that calls `onExitStandalone()`.
  - Apply `fixed inset-0 z-50 h-full w-full bg-[#07090E]` layout with zero outer padding or margins.
  - When toggling fullscreen in embedded mode, invoke `onToggleStandalone?.(true)` and `document.documentElement.requestFullscreen?.()`.
  - Lock `document.body` and `document.documentElement` styles on mount/unmount in standalone mode.

- [ ] **Step 2: Verify build and touch ergonomics**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): implement pure standalone fullscreen view and back-to-console navigation"
```

---

### Task 3: Full End-to-End Verification & Test Suite

**Files:**
- Run complete verification tests and builds.

- [ ] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: 24 test suites pass.

- [ ] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Frontend and backend build cleanly with zero errors.

- [ ] **Step 3: Commit all changes if any**

```bash
git status
```

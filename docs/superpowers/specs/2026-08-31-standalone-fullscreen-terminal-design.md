# Standalone Code-Server Style Fullscreen Web Terminal Design Spec

## 1. Problem Statement & Motivation

When entering fullscreen mode on mobile devices in the current Web Terminal:
- The terminal was styled using `fixed inset-0 z-[9999]`, but remained nested inside the Admin dashboard layout (with Topbar, Sidebar, BottomNav, and main scroll containers still existing in the background DOM).
- Swiping or scrolling on touchscreens causes rubber-banding / overscroll bounce that exposes parts of the background admin console.
- Users requested a **code-server style standalone experience**: entering fullscreen mode should completely detach and hide the admin console shell, rendering a 100% pure terminal viewport with zero background layout bleed, with support for direct URL navigation (`/terminal`).

---

## 2. Architecture & Design

### 2.1 Route & Viewport Separation

```
                       URL / Route Request
                               │
               ┌───────────────┴───────────────┐
               │                               │
        Route: / or /#dashboard        Route: /terminal or /#terminal
               │                               │ (or isStandalone === true)
               ▼                               ▼
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │    Admin Dashboard App    │   │  Standalone Terminal App  │
 │ - Desktop Sidebar         │   │ (Code-Server Style Pure)  │
 │ - Topbar & Breadcrumbs    │   │ - 100% Pure DOM Root      │
 │ - Bottom Navigation Bar   │   │ - ZERO Admin Shell HTML   │
 │ - Embedded Web Terminal   │   │ - Complete Touch Lock     │
 └───────────────────────────┘   └───────────────────────────┘
```

### 2.2 Core Requirements
1. **Zero-DOM Bleed Standalone Mode**:
   - In standalone mode (either triggered by the "Fullscreen" action or visiting `/terminal` / `#/terminal`), the parent React component unmounts/hides the entire dashboard layout (`<header>`, `<aside>`, `<nav>`, `<main>`), rendering only the `StandaloneTerminalApp`.
2. **Body Lockdown & Touch Isolation**:
   - `html, body` styles are locked with `overscroll-behavior: none; touch-action: pan-y; position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden;`.
   - Scroll events within the terminal are 100% handled by xterm.js buffer scrolling with zero parent propagation.
3. **Mini Compact Navigation Header**:
   - A dedicated 36px mini header with:
     - "Back to Console" / "Exit Fullscreen" button (returns to full admin dashboard).
     - Connection status indicator.
     - Zoom `A-` / `A+`, quick command snippet toolbox, reconnect, and clear screen actions.
4. **Browser Native Fullscreen Integration**:
   - Toggling fullscreen mode triggers `document.documentElement.requestFullscreen()` on supported mobile browsers, with graceful fallback on iOS Safari.

---

## 3. Component Hierarchy

- **`App.tsx`**:
  - Detects if route is `/terminal` or `#/terminal` or if user toggled standalone fullscreen mode.
  - If standalone mode is active: renders `<StandaloneTerminalApp>` as the sole root component (after auth verification), omitting all sidebar, topbar, and bottom navigation DOM nodes.
  - If standard mode is active: renders regular admin dashboard with tabs.
- **`WebTerminalView.tsx`**:
  - Supports both `embedded` mode (rendered within dashboard tab) and `standalone` mode (rendered as fullscreen root).
  - Emits `onToggleStandalone(boolean)` to allow seamless transition between embedded and standalone modes without dropping the WebSocket connection if state is preserved.
- **`TerminalAccessoryBar.tsx`** & **`TerminalSnippetsDrawer.tsx`**:
  - Render cleanly inside both modes.

---

## 4. Testing & Verification

1. **Build & Type Check**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 24 backend test suites pass.
2. **Mobile Interaction & Overscroll**:
   - Verify fullscreen mode has zero background layout visible on swiping/scrolling.
   - Verify direct URL `/terminal` lands directly into the standalone terminal.
   - Verify exiting standalone returns smoothly to the full admin dashboard.

# Mobile Web Terminal Header & Fullscreen Button Visibility Fix Design Spec

## 1. Problem Statement & Root Cause

On mobile devices, when navigating to the Web Terminal tab:
- The `<main>` container and internal terminal components overflowed the mobile viewport height because the outer flex container didn't bound the dynamic viewport height (`100dvh`) against the fixed mobile top bar (48px / 3rem) and mobile bottom navigation bar (56px / 3.5rem).
- As a result, the terminal's built-in window header bar (which contains the macOS action dots, zoom controls, clear/reconnect buttons, and the **Fullscreen / Standalone toggle button**) was pushed out of view or obstructed.
- Users could not see or tap the fullscreen button on mobile devices upon opening the terminal tab.

---

## 2. Architecture & Layout Fix

### 2.1 Viewport Height Bounding with Dynamic CSS
- In `App.tsx`, when `activeTab === 'webTerminal'`, the main container is explicitly constrained to:
  ```css
  height: calc(100dvh - 3rem - 3.5rem); /* Exactly fill the area between mobile top header and bottom nav */
  max-height: calc(100dvh - 3rem - 3.5rem);
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  ```
- On desktop screens (`md:` breakpoint), it seamlessly reverts to standard padding and height (`md:h-auto md:max-h-none md:p-6 md:pb-6`).

### 2.2 Terminal Window Bar Mobile Layout & Dual Fullscreen Trigger
1. **Window Top Bar Guarantee**:
   - `WebTerminalView.tsx` keeps its top window bar as `shrink-0 bg-[#0C0E14] z-10 sticky top-0`, ensuring the red/yellow/green dots, live status badge, zoom buttons, and the **Fullscreen / Standalone toggle button (`Maximize2`)** are 100% visible on small screens (iPhone SE, 375px+).
   - In narrow mobile screens, gap and padding are optimized (`p-1 sm:p-1.5`, `space-x-1 sm:space-x-1.5`) so no button wraps or clips.
2. **Global Header Quick Action**:
   - In `App.tsx`, when `activeTab === 'webTerminal'`, an additional quick fullscreen button is placed on the mobile top navigation bar next to the refresh button, allowing immediate one-tap transition into standalone code-server terminal mode.

---

## 3. Testing & Verification

1. **Build & Type Check**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 24 backend test suites pass.
2. **Mobile Viewport Simulation**:
   - Verify terminal top bar is immediately visible on 375px mobile viewport without needing to scroll.
   - Verify the fullscreen button on both the terminal window bar and global header triggers standalone mode cleanly.

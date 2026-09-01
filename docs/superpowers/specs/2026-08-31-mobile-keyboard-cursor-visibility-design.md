# Mobile Fullscreen Terminal Keyboard & Cursor Visibility Design Spec

## 1. Problem Statement & Root Cause

When invoking the virtual soft keyboard in mobile fullscreen terminal mode:
- The terminal container or parent root wrapper was constrained by full physical screen height (`h-screen`), preventing the terminal viewport from shrinking above the on-screen keyboard.
- When the keyboard opened, the active command line and terminal cursor ended up positioned behind the virtual keyboard.
- `xterm.js` was not triggering `scrollToBottom()` on viewport resizing or input events, leaving the cursor hidden in the obscured bottom buffer rows.

---

## 2. Architecture & Solution Design

### 2.1 Visual Viewport Reactive Sizing
- Bind the fullscreen standalone container explicitly to `window.visualViewport.height` and `window.visualViewport.offsetTop`:
  ```typescript
  const vv = window.visualViewport;
  if (vv && isMobile && standalone) {
    setViewportStyle({
      position: 'fixed',
      top: `${vv.offsetTop}px`,
      left: `${vv.offsetLeft}px`,
      width: `${vv.width}px`,
      height: `${vv.height}px`,
      maxHeight: `${vv.height}px`,
      zIndex: 50,
      borderRadius: 0,
      border: 'none',
      overflow: 'hidden',
    });
  }
  ```
- Trigger multiple debounce/animation compensation ticks (`0ms`, `120ms`, `300ms`) during keyboard show/hide transitions to ensure `fitAddon.fit()` recalculates exact cols and rows after iOS/Android slide-up animations finish.

### 2.2 Active Cursor & Bottom Auto-Scroll
- Automatically execute `term.scrollToBottom()` whenever:
  1. `updateViewport()` runs during keyboard show/hide.
  2. The user types via soft keyboard (`term.onData`).
  3. The user sends inputs from `TerminalAccessoryBar` or `TerminalSnippetsDrawer`.
  4. The terminal receives focus (`term.focus()`).

---

## 3. Testing & Verification

1. **Build & Type Check**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 24 backend test suites pass.
2. **Mobile Keyboard Simulation**:
   - Verify that when the soft keyboard appears in standalone fullscreen mode, the accessory bar is pushed directly above the keyboard, the xterm viewport shrinks without vertical clipping, and the cursor line automatically scrolls into view.

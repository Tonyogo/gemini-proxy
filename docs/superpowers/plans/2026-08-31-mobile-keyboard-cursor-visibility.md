# Mobile Fullscreen Terminal Keyboard & Cursor Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the mobile Web Terminal in fullscreen mode shrinks dynamically to fit above the on-screen soft keyboard and automatically scrolls the cursor line into full visibility.

**Architecture:** Update `App.tsx` standalone root wrapper to avoid physical height lock (`h-screen`) and update `WebTerminalView.tsx` with dynamic visualViewport tracking, animation compensation timers, and automatic `scrollToBottom()` on resize and input.

**Tech Stack:** React 18, `@xterm/xterm`, Tailwind CSS, TypeScript.

## Global Constraints

- **Dynamic Viewport Height**: Standalone root container must respect `visualViewport.height` rather than fixed `h-screen`.
- **Active Cursor Visibility**: `term.scrollToBottom()` must fire on viewport resize, keyboard animation ticks, and input events.
- **Strict TypeScript & Zero Build Errors**: `npm run build:frontend` and `npm run build:backend` must pass cleanly.

---

### Task 1: Update App.tsx Standalone Container Height & Overflow

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: Flexible, unconstrained root wrapper for standalone terminal mode.

- [ ] **Step 1: Update `App.tsx` standalone wrapper styles**

In `frontend/src/App.tsx`:
Change the standalone wrapper from `h-screen w-screen` to `fixed inset-0 z-50 w-full h-full bg-[#07090E] overflow-hidden`:
```tsx
  // Standalone Fullscreen Terminal Mode (Zero DOM bleed)
  if (isStandaloneTerminal) {
    return (
      <div className="fixed inset-0 z-50 w-full h-full bg-[#07090E] overflow-hidden">
        <WebTerminalView
          key={refreshTrigger}
          adminKey={adminKey}
          standalone={true}
          onExitStandalone={handleExitStandalone}
        />
      </div>
    );
  }
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "fix(terminal): make standalone terminal root container fill dynamic viewport"
```

---

### Task 2: Implement Reactive Viewport Resizing & Cursor Scroll in WebTerminalView

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Produces: `updateViewport` with `scrollToBottom()`, multi-stage animation timeouts (`0ms`, `120ms`, `300ms`), and auto-scroll on inputs/focus.

- [ ] **Step 1: Update `WebTerminalView.tsx` viewport and scroll behavior**

In `frontend/src/components/WebTerminalView.tsx`:
1. In `updateViewport()`:
```typescript
const updateViewport = () => {
  const mobile = window.innerWidth < 768;
  setIsMobile(mobile);

  if (mobile && standalone && window.visualViewport) {
    const vv = window.visualViewport;
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
  } else {
    setViewportStyle({});
  }

  if (fitAddonRef.current && xtermRef.current) {
    fitAddonRef.current.fit();
    sendResize(xtermRef.current.cols, xtermRef.current.rows);
    xtermRef.current.scrollToBottom();
  }
};
```
2. Schedule multi-stage ticks for smooth keyboard slide-up animation:
```typescript
const handleViewportChange = () => {
  updateViewport();
  setTimeout(updateViewport, 120);
  setTimeout(updateViewport, 300);
};

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', handleViewportChange);
  window.visualViewport.addEventListener('scroll', handleViewportChange);
}
```
3. In `handleSendInput`, `handleToggleKeyboard`, and `term.onData`:
Call `xtermRef.current?.scrollToBottom()` so the cursor line is always visible.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "fix(terminal): ensure terminal cursor auto-scrolls into view above soft keyboard"
```

---

### Task 3: Full End-to-End Verification

**Files:**
- All components and build verification.

- [ ] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: 24 test suites pass.

- [ ] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Zero errors.

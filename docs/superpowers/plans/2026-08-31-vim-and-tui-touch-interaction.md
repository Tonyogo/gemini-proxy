# Vim and Interactive CLI Touch Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable seamless mobile touch interaction in `vim`, `nano`, and interactive full-screen CLI programs by separating tap-to-focus from swipe gestures, translating alternate buffer gestures to navigation arrows, and adding essential vim keys.

**Architecture:** Update `WebTerminalView.tsx` touch listener state machine to distinguish single taps (for focusing xterm hidden `<textarea>` and opening soft keyboard) from swipe drags (which scroll normal buffer lines or dispatch `\x1b[A` / `\x1b[B` arrow keys in alternate buffer mode), and enhance `TerminalAccessoryBar.tsx` with dedicated vim `:` and `↵` keys.

**Tech Stack:** React 18, `@xterm/xterm`, Tailwind CSS, TypeScript.

## Global Constraints

- **Focus Preservation**: Single tap must always invoke `term.focus()` to open the virtual keyboard.
- **Alternate Buffer Translation**: In `term.buffer.active.type === 'alternate'` (vim mode), swipe gestures must translate to Up/Down arrow sequences.
- **Accessory Keys**: Add `:` and `↵` keys with `onTouchStart={(e) => e.preventDefault()}` and instant refocus.
- **Strict TypeScript & Zero Build Errors**: `npm run build:frontend` and `npm run build:backend` must pass cleanly.

---

### Task 1: Enhance Touch Gesture State Machine and Alternate Buffer Routing in WebTerminalView

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Produces: Precise touch tap-to-focus and alternate buffer swipe translation.

- [ ] **Step 1: Update touch event handling in `WebTerminalView.tsx`**

In `frontend/src/components/WebTerminalView.tsx`:
```typescript
    // Mobile Touch Gesture & Vim Navigation Bridge (code-server / VS Code style)
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartTime = 0;
    let isDragging = false;
    let accumulatedDeltaY = 0;
    const container = terminalContainerRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchStartTime = Date.now();
        isDragging = false;
        accumulatedDeltaY = 0;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = touchStartY - currentY;
      const deltaX = touchStartX - currentX;

      if (!isDragging && (Math.abs(deltaY) > 8 || Math.abs(deltaX) > 8)) {
        isDragging = true;
      }

      if (!isDragging) return;

      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();

      touchStartY = currentY;
      touchStartX = currentX;
      accumulatedDeltaY += deltaY;

      const currentFontSize = fontSizeRef.current;
      const lineHeight = Math.max(12, currentFontSize * 1.3);

      if (Math.abs(accumulatedDeltaY) >= lineHeight) {
        const linesToScroll = Math.trunc(accumulatedDeltaY / lineHeight);
        accumulatedDeltaY -= linesToScroll * lineHeight;

        const isAlternate = term.buffer.active.type === 'alternate';
        if (isAlternate) {
          // In Vim / Nano / Htop, translate vertical swipe into Arrow Up/Down sequences
          const arrowSequence = linesToScroll > 0 ? '\x1b[B' : '\x1b[A';
          const count = Math.min(5, Math.abs(linesToScroll));
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(arrowSequence.repeat(count));
          }
        } else {
          // Standard command line scrollback buffer
          term.scrollLines(linesToScroll);
        }
      }
    };

    const handleTouchEnd = () => {
      const elapsed = Date.now() - touchStartTime;
      if (!isDragging && elapsed < 300) {
        // Pure single tap -> Focus terminal & wake on-screen virtual keyboard
        term.focus();
      }
    };

    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): add tap-to-focus and alternate buffer swipe translation for vim"
```

---

### Task 2: Enhance TerminalAccessoryBar with Vim Auxiliary Keys and Focus Preservation

**Files:**
- Modify: `frontend/src/components/terminal/TerminalAccessoryBar.tsx`

**Interfaces:**
- Produces: `:` and `↵ (Enter)` auxiliary keys with mobile `onTouchStart` blur-prevention.

- [ ] **Step 1: Update `TerminalAccessoryBar.tsx` keys**

In `frontend/src/components/terminal/TerminalAccessoryBar.tsx`:
1. Add `onTouchStart={(e) => e.preventDefault()}` on all accessory buttons.
2. In the quick characters list, include `':'` and add a dedicated `↵ (Enter)` button:
```tsx
{/* Quick Enter Key */}
<button
  type="button"
  onTouchStart={(e) => e.preventDefault()}
  onMouseDown={(e) => e.preventDefault()}
  onClick={() => onSendInput('\r')}
  className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 active:scale-95 text-indigo-300 font-mono text-xs font-semibold border border-indigo-500/30 transition-all"
  title="Enter (Return)"
>
  ↵
</button>
```
3. Update `handleKeyClick` to support `:` properly.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/terminal/TerminalAccessoryBar.tsx
git commit -m "feat(terminal): add vim colon and enter keys with touch blur prevention"
```

---

### Task 3: Full End-to-End Verification

**Files:**
- Run complete test suite and project build.

- [ ] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: All 25 test suites pass.

- [ ] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Zero build errors.

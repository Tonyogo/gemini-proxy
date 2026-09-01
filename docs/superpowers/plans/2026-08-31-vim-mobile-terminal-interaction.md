# Mobile Vim & Interactive Terminal UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize mobile terminal touch gestures and input ergonomics for Vim and full-screen TUI apps (Alternate Screen buffer touch-to-arrow translation, dedicated Vim accessory actions, and soft keyboard focus retention).

**Architecture:** Detect `term.buffer.active.type === 'alternate'` in `WebTerminalView.tsx` to route swipe gestures as `ArrowUp` / `ArrowDown` escape sequences to PTY, and expand `TerminalAccessoryBar.tsx` with high-frequency Vim keys (`:`, `i`, `u`, `v`, `0`, `$`) and a floating Vim commands action menu.

**Tech Stack:** React 18, `@xterm/xterm`, Lucide React, Tailwind CSS, TypeScript.

## Global Constraints

- **Alternate Screen Routing**: Touch gestures in alternate buffer must translate to `\x1b[A` / `\x1b[B` instead of `term.scrollLines()`.
- **Focus Preservation**: All accessory buttons must prevent default on touch/mouse events to avoid soft keyboard dismissal.
- **Strict TypeScript & Zero Build Errors**: `npm run build:frontend` and `npm run build:backend` must pass cleanly.

---

### Task 1: Add Alternate Screen Buffer Touch Gesture Routing in WebTerminalView

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Produces: Dynamic touch gesture handling distinguishing between Normal and Alternate screen buffers.

- [ ] **Step 1: Update `handleTouchMove` in `WebTerminalView.tsx`**

In `frontend/src/components/WebTerminalView.tsx`:
Update `handleTouchMove`:
```typescript
const handleTouchMove = (e: TouchEvent) => {
  if (e.touches.length !== 1) return;
  if (e.cancelable) {
    e.preventDefault();
  }
  e.stopPropagation();

  const currentY = e.touches[0].clientY;
  const deltaY = touchStartY - currentY;
  touchStartY = currentY;
  accumulatedDeltaY += deltaY;

  const currentFontSize = fontSizeRef.current;
  const lineHeight = Math.max(12, currentFontSize * 1.3);

  if (Math.abs(accumulatedDeltaY) >= lineHeight) {
    const steps = Math.trunc(accumulatedDeltaY / lineHeight);
    const isAlternate = term.buffer.active.type === 'alternate';

    if (isAlternate) {
      // In Vim/Less/Htop, send Arrow Up / Arrow Down sequences to PTY
      const arrowSequence = steps > 0 ? '\x1b[B' : '\x1b[A'; // Down or Up
      const count = Math.min(5, Math.abs(steps));
      for (let i = 0; i < count; i++) {
        handleSendInput(arrowSequence);
      }
    } else {
      term.scrollLines(steps);
    }

    accumulatedDeltaY -= steps * lineHeight;
  }
};
```

- [ ] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): add alternate screen buffer touch routing for vim line scrolling"
```

---

### Task 2: Add Vim Action Palette and Dedicated Edit Keys to TerminalAccessoryBar

**Files:**
- Modify: `frontend/src/components/terminal/TerminalAccessoryBar.tsx`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`

**Interfaces:**
- Produces: Vim actions palette (`:w`, `:wq`, `:q!`, `dd`, `yy`, `p`, `gg`, `G`), direct keys (`:`, `i`, `u`, `v`, `0`, `$`), and complete focus preservation.

- [ ] **Step 1: Add i18n locales for Vim actions**

In `frontend/src/i18n/locales/en.ts`:
Add to `webTerminal`:
```typescript
    vimActions: "Vim Actions",
    vimSave: ":w (Save)",
    vimSaveExit: ":wq (Save & Exit)",
    vimForceQuit: ":q! (Force Quit)",
    vimDeleteLine: "dd (Delete Line)",
    vimYankLine: "yy (Copy Line)",
    vimPaste: "p (Paste)",
    vimTop: "gg (Top)",
    vimBottom: "G (Bottom)",
```

In `frontend/src/i18n/locales/zh.ts`:
Add to `webTerminal`:
```typescript
    vimActions: "Vim 常用指令",
    vimSave: ":w (保存)",
    vimSaveExit: ":wq (保存退出)",
    vimForceQuit: ":q! (强制退出)",
    vimDeleteLine: "dd (删除行)",
    vimYankLine: "yy (复制行)",
    vimPaste: "p (粘贴)",
    vimTop: "gg (跳至开头)",
    vimBottom: "G (跳至结尾)",
```

- [ ] **Step 2: Update `TerminalAccessoryBar.tsx` with Vim Palette & Keys**

In `frontend/src/components/terminal/TerminalAccessoryBar.tsx`:
1. Add state for `isVimMenuOpen`:
```tsx
const [isVimMenuOpen, setIsVimMenuOpen] = useState(false);
```
2. Add quick keys (`:`, `i`, `u`, `v`, `0`, `$`) into the scrollable accessory row.
3. Add a dedicated `Vim` button with a popover menu of quick actions (`:w\r`, `:wq\r`, `:q!\r`, `dd`, `yy`, `p`, `gg`, `G`).
4. Ensure all buttons prevent default on mouse/touch down and maintain `term.focus()`:
```tsx
onMouseDown={(e) => e.preventDefault()}
onTouchStart={(e) => e.preventDefault()}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/terminal/TerminalAccessoryBar.tsx frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(terminal): add vim quick action palette and dedicated editing keys"
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

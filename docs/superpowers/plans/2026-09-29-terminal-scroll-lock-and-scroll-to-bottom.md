# Web Terminal: Scroll Lock and Floating Scroll-to-Bottom Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent terminal content updates from forcefully resetting viewport scroll position to the bottom when users scroll up to inspect history, while providing a sticky-bottom scroll lock and a floating one-click "Scroll to Bottom" button.

**Architecture:** 
1. Upgrade `terminalScrollHelper.ts` with a sub-line/fractional-row tolerance threshold for `isUserAtBottom` to resist viewport height and font metric rounding jitter.
2. Refactor `WebTerminalView.tsx` to eliminate unconditional 150ms replay timer scroll resets in `ws.onmessage`.
3. Track active terminal scroll events via `term.onScroll` to maintain reactive `isAtBottom` state.
4. Render a frosted-glass floating button in the bottom-right corner when `!isAtBottom` that smoothly scrolls to the bottom and restores active bottom tracking.

**Tech Stack:** React, TypeScript, xterm.js, Tailwind CSS, Lucide React, Jest.

**Spec:** `docs/superpowers/specs/2026-09-29-terminal-scroll-lock-and-scroll-to-bottom-design.md`

## Global Constraints

- Do not break existing alternate buffer protections (`term.buffer.active.type === 'alternate'` for Vim, Nano, Less, Htop).
- Keep initial connection / reconnect / reset history replay auto-scroll intact (first 600ms replay window).
- When the user types or presses keys in terminal (`term.onData`), automatically scroll to the bottom cursor prompt.
- Mobile accessory bar compatibility: adjust the floating button's bottom position (`bottom-14`) so it does not obstruct the touch accessory bar.
- Preserve zero-cache hot reloading and full TypeScript type safety.

## Review Focus

- High-frequency data stream while scrolled up: ensure continuous data arriving does not cause the scroll position to jump or jerk to the bottom.
- Alternate buffer apps (vim/nano): ensure floating scroll button never appears in alternate screen buffer.
- Initial replay: ensure when connecting or reconnecting, the terminal scrolls to the bottom of the replayed history as expected.
- Keystroke input: ensure user typing at terminal promptly scrolls to the bottom to reveal the cursor.
- Mobile keyboard and accessory bar: ensure floating button position does not clip or block virtual buttons.

---

### Task 1: Enhance `terminalScrollHelper.ts` and Unit Tests

**Files:**
- Modify: `frontend/src/utils/terminalScrollHelper.ts`
- Test: `tests/terminalScrollHelper.test.ts`

**Interfaces:**
- Consumes: `TerminalLike` interface.
- Produces: `isUserAtBottom(term: TerminalLike | null | undefined, threshold?: number): boolean`.

- [ ] **Step 1: Write the failing tests in `tests/terminalScrollHelper.test.ts`**

Add tests covering the tolerance threshold for `isUserAtBottom`:
```typescript
    it('returns true when viewportY is within the tolerance threshold of baseY', () => {
      const mockTerm = {
        buffer: {
          active: {
            viewportY: 99,
            baseY: 100,
            type: 'normal',
          },
        },
      };
      // Default threshold is 1 line tolerance
      expect(isUserAtBottom(mockTerm, 1)).toBe(true);
      expect(isUserAtBottom(mockTerm, 0)).toBe(false);
    });

    it('returns false when viewportY is beyond threshold from baseY', () => {
      const mockTerm = {
        buffer: {
          active: {
            viewportY: 90,
            baseY: 100,
            type: 'normal',
          },
        },
      };
      expect(isUserAtBottom(mockTerm, 2)).toBe(false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalScrollHelper.test.ts`
Expected: FAIL because `isUserAtBottom` does not yet accept or handle a `threshold` argument.

- [ ] **Step 3: Update `frontend/src/utils/terminalScrollHelper.ts`**

Update `isUserAtBottom`:
```typescript
/**
 * Checks if the user is currently at the bottom of the scrollback buffer.
 * If in alternate buffer (like vim, nano, htop), returns true as alternate screens do not have normal scrollback.
 * @param term Terminal instance
 * @param threshold Allowed line tolerance (default: 1 line) for layout/rounding discrepancies
 */
export function isUserAtBottom(term: TerminalLike | null | undefined, threshold = 1): boolean {
  if (!term || !term.buffer || !term.buffer.active) {
    return true;
  }
  const active = term.buffer.active;
  if (active.type === 'alternate') {
    return true;
  }
  return active.viewportY >= Math.max(0, active.baseY - threshold);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalScrollHelper.test.ts`
Expected: PASS with all 13 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/terminalScrollHelper.ts tests/terminalScrollHelper.test.ts
git commit -m "feat(terminal): add tolerance threshold support to isUserAtBottom"
```

---

### Task 2: Add Internationalization Locale Keys

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Produces: `webTerminal.scrollToBottom` translation key.

- [ ] **Step 1: Add `scrollToBottom` under `webTerminal` in `frontend/src/i18n/locales/zh.ts`**

In `webTerminal` section:
```typescript
    scrollToBottom: "跳到最后",
```

- [ ] **Step 2: Add `scrollToBottom` under `webTerminal` in `frontend/src/i18n/locales/en.ts`**

In `webTerminal` section:
```typescript
    scrollToBottom: "Scroll to bottom",
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add webTerminal.scrollToBottom translation keys"
```

---

### Task 3: Refactor WebTerminalView to Remove Force Jump & Add Floating Scroll-to-Bottom Button

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Consumes: `isUserAtBottom`, `shouldScrollToBottom`, `scrollToBottomSafe` from `terminalScrollHelper.ts`.
- Produces:
  - Reactive `isAtBottom` state tracking terminal viewport position.
  - Floating button rendered in JSX when `!isAtBottom && !isSelectMode && activeHostId`.

- [ ] **Step 1: Eliminate unconditional 150ms scroll in `ws.onmessage`**

In `frontend/src/components/WebTerminalView.tsx`:
Replace:
```typescript
        const term = xtermRef.current;
        const wasAtBottom = isUserAtBottom(term);
        term?.write(data, () => {
          if (!isRefittingRef.current && shouldScrollToBottom({ isReplaying: isReplayingRef.current, wasAtBottom, bufferType: term?.buffer.active.type })) {
            scrollToBottomSafe(term);
          }
          term?.refresh(0, Math.max(0, (term.rows || 1) - 1));
          if (replayTimerRef.current) {
            clearTimeout(replayTimerRef.current);
          }
          replayTimerRef.current = setTimeout(() => {
            isReplayingRef.current = false;
            scrollToBottomSafe(xtermRef.current);
            xtermRef.current?.refresh(0, Math.max(0, (xtermRef.current.rows || 1) - 1));
          }, 150);
        });
```
With:
```typescript
        const term = xtermRef.current;
        const wasAtBottom = isAtBottomRef.current;
        term?.write(data, () => {
          if (!isRefittingRef.current && shouldScrollToBottom({ isReplaying: isReplayingRef.current, wasAtBottom, bufferType: term?.buffer.active.type })) {
            scrollToBottomSafe(term);
          }
          term?.refresh(0, Math.max(0, (term.rows || 1) - 1));
          if (replayTimerRef.current) {
            clearTimeout(replayTimerRef.current);
          }
          replayTimerRef.current = setTimeout(() => {
            isReplayingRef.current = false;
            // Only auto-scroll to bottom if user is already at the bottom or replaying
            if (shouldScrollToBottom({ isReplaying: false, wasAtBottom: isAtBottomRef.current, bufferType: xtermRef.current?.buffer.active.type })) {
              scrollToBottomSafe(xtermRef.current);
            }
            xtermRef.current?.refresh(0, Math.max(0, (xtermRef.current.rows || 1) - 1));
          }, 150);
        });
```
Apply the exact same fix for binary data handler (`data instanceof ArrayBuffer`).

- [ ] **Step 2: Add `isAtBottom` state & `term.onScroll` listener**

Add state and ref near other terminal refs:
```typescript
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
  const isAtBottomRef = useRef<boolean>(true);
```

In `useEffect` where `term` is created and configured:
```typescript
    const scrollDisposable = term.onScroll(() => {
      if (!term || !isMountedRef.current) return;
      if (term.buffer.active.type === 'alternate') {
        if (!isAtBottomRef.current) {
          isAtBottomRef.current = true;
          setIsAtBottom(true);
        }
        return;
      }
      const atBottom = isUserAtBottom(term);
      if (isAtBottomRef.current !== atBottom) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    });
```
Ensure `scrollDisposable.dispose()` is called on unmount.

- [ ] **Step 3: Update `term.onData` to re-anchor `isAtBottom`**

In `term.onData`:
```typescript
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      scrollToBottomSafe(term);
```

- [ ] **Step 4: Add `handleScrollToBottom` helper**

```typescript
  const handleScrollToBottom = useCallback(() => {
    if (xtermRef.current) {
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      scrollToBottomSafe(xtermRef.current);
      xtermRef.current.focus();
    }
  }, []);
```

- [ ] **Step 5: Render Floating "Scroll to Bottom" Button**

In the JSX of `WebTerminalView.tsx`, right before the empty state guard or floating selection bar:
Import `ArrowDown` from `lucide-react`.
```tsx
        {/* Floating Scroll to Bottom Button */}
        {!isAtBottom && activeHostId && !isSelectMode && xtermRef.current?.buffer.active.type !== 'alternate' && (
          <button
            type="button"
            onClick={handleScrollToBottom}
            aria-label={t('webTerminal.scrollToBottom', '跳到最后')}
            title={t('webTerminal.scrollToBottom', '跳到最后')}
            className={`absolute right-4 z-20 w-9 h-9 rounded-full bg-[var(--bg-surface)]/85 hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] shadow-xl flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95 backdrop-blur-md cursor-pointer animate-in fade-in zoom-in-90 ${
              isMobile && !hideAccessoryBar ? 'bottom-14' : 'bottom-4'
            }`}
          >
            <ArrowDown className="w-4 h-4 text-indigo-400 animate-pulse" />
          </button>
        )}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): implement sticky scroll lock and floating scroll-to-bottom button"
```

---

### Task 4: Add Automated Component & Scroll Lock Integration Tests

**Files:**
- Create: `tests/terminalScrollLock.test.ts`
- Test: `tests/terminalScrollLock.test.ts`

**Interfaces:**
- Validates:
  - `terminalScrollHelper.ts` threshold edge cases.
  - `WebTerminalView.tsx` code structure ensuring unconditional 150ms scroll has been removed.
  - `term.onScroll` event subscription presence.
  - Floating button JSX markup and i18n key integration.

- [ ] **Step 1: Write integration tests in `tests/terminalScrollLock.test.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import {
  isUserAtBottom,
  shouldScrollToBottom,
  scrollToBottomSafe,
} from '../frontend/src/utils/terminalScrollHelper';

describe('Terminal Scroll Lock & Sticky Follow Tests', () => {
  const terminalViewPath = path.join(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const terminalViewContent = fs.readFileSync(terminalViewPath, 'utf8');

  test('isUserAtBottom respects tolerance threshold', () => {
    const term = {
      buffer: {
        active: {
          viewportY: 198,
          baseY: 200,
          type: 'normal',
        },
      },
    };

    expect(isUserAtBottom(term, 2)).toBe(true);
    expect(isUserAtBottom(term, 1)).toBe(false);
  });

  test('shouldScrollToBottom returns false when user has scrolled up', () => {
    expect(
      shouldScrollToBottom({
        isReplaying: false,
        wasAtBottom: false,
        bufferType: 'normal',
      })
    ).toBe(false);
  });

  test('WebTerminalView does not unconditionally scroll in replayTimerRef timeout', () => {
    // Ensure unconditional scrollToBottomSafe inside the 150ms timeout was removed or guarded
    const lines = terminalViewContent.split('\n');
    const timerIndices = lines.reduce<number[]>((acc, line, idx) => {
      if (line.includes('replayTimerRef.current = setTimeout')) {
        acc.push(idx);
      }
      return acc;
    }, []);

    expect(timerIndices.length).toBeGreaterThan(0);
    // Inside the 150ms timeout block, scrollToBottomSafe must be guarded by shouldScrollToBottom
    for (const idx of timerIndices) {
      const block = lines.slice(idx, idx + 10).join('\n');
      if (block.includes('150')) {
        expect(block).not.toMatch(/isReplayingRef\.current = false;\s*scrollToBottomSafe\(xtermRef\.current\);/);
      }
    }
  });

  test('WebTerminalView subscribes to term.onScroll to manage bottom tracking', () => {
    expect(terminalViewContent).toContain('term.onScroll');
    expect(terminalViewContent).toContain('setIsAtBottom');
  });

  test('WebTerminalView contains floating scroll to bottom button', () => {
    expect(terminalViewContent).toContain('handleScrollToBottom');
    expect(terminalViewContent).toContain('webTerminal.scrollToBottom');
    expect(terminalViewContent).toContain('ArrowDown');
  });
});
```

- [ ] **Step 2: Run tests to verify**

Run: `npx jest tests/terminalScrollLock.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/terminalScrollLock.test.ts
git commit -m "test(terminal): add integration tests for scroll lock and scroll-to-bottom button"
```

---

### Task 5: Full Regression Testing and Production Build Verification

**Files:**
- All touched files
- Test: Full Jest test suite

- [ ] **Step 1: Run all unit and integration tests**

Run: `npm test`
Expected: 100% test suites pass without failure.

- [ ] **Step 2: Run frontend production build**

Run: `npm run build:frontend`
Expected: Vite build succeeds with 0 TypeScript/CSS errors.

- [ ] **Step 3: Run backend build**

Run: `npm run build:backend`
Expected: `tsc` compiles cleanly with 0 errors.

- [ ] **Step 4: Final verification and status check**

Run: `git status`
Expected: Clean working tree.

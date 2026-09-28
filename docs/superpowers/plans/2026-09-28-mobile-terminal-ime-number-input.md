# Mobile Terminal IME Number Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the mobile terminal issue where digits and symbols cannot be entered when switching to numeric mode under a Chinese/Pinyin IME virtual keyboard, while preserving normal Chinese candidate word selection and physical keyboard input.

**Architecture:** Encapsulate mobile IME event pipeline handling into a dedicated utility module (`terminalImeHelper.ts`) that intercepts `beforeinput`, `input`, `compositionstart`, and `compositionend` on xterm's underlying `helperTextarea`. When not in active IME composition (`!isComposing`), intercept direct text insertions (digits, punctuation, direct ASCII) before xterm's flawed `(!ev.composed || !this._keyDownSeen)` filter can discard them, forwarding the characters directly via `term.input(data)` and clearing the textarea.

**Tech Stack:** React 18, TypeScript 5.4, `@xterm/xterm` 5.5, Jest 29, ts-jest.

**Spec:** In-chat bounded design approved in brainstorming turn (Option 1: Input Channel Patch).

## Global Constraints

- Must not break normal Chinese candidate selection (Pinyin composition followed by candidate touch).
- Must not produce duplicate characters on mobile or desktop keyboards.
- Must not interfere with `TerminalAccessoryBar` virtual modifier keys (CTRL, ALT, ESC, arrow keys).
- Must clean up all event listeners on terminal unmount to prevent memory leaks.
- Zero regression on existing terminal tests (`npm test`).

## Review Focus

1. **Pinyin candidate selection:** When user types pinyin (e.g., "nihao") and taps candidate "你好", characters must emit exactly once without duplicate prefix or dropped characters.
2. **Pinyin keyboard switched to numbers:** When user switches to digits on the mobile virtual keyboard and taps "1", "2", "3", each digit must be sent to the terminal immediately without being swallowed.
3. **Punctuation and symbols:** Punctuation keys on the mobile keyboard (e.g. `;`, `:`, `/`, `-`) outside of active composition must be delivered directly.
4. **Physical external keyboard:** When using an external bluetooth or USB keyboard on tablet/mobile, normal keystroke handling via xterm must remain unaffected.
5. **Paste and clipboard:** Multiline pasting and accessory bar paste button must not be double-intercepted or corrupted.

---

### Task 1: Create `terminalImeHelper.ts` with Pure Logic and Event Handlers

**Files:**
- Create: `frontend/src/utils/terminalImeHelper.ts`
- Test: `tests/terminalImeHelper.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface TerminalImeOptions {
    textarea: HTMLTextAreaElement;
    onDirectInput: (data: string) => void;
  }
  export interface TerminalImeController {
    isComposing: () => boolean;
    dispose: () => void;
  }
  export function attachMobileImeHandler(options: TerminalImeOptions): TerminalImeController;
  ```

- [ ] **Step 1: Write the failing unit tests for `terminalImeHelper`**

Create `tests/terminalImeHelper.test.ts` covering:
1. `attachMobileImeHandler` binds to `textarea` events (`compositionstart`, `compositionend`, `beforeinput`, `input`).
2. Toggling `isComposing` state accurately during composition lifecycle with safety timeout delay.
3. When `!isComposing` and `beforeinput` fires with `inputType: 'insertText'`, prevents default and calls `onDirectInput(data)`.
4. When `isComposing === true` and `beforeinput` fires, does NOT prevent default and does NOT call `onDirectInput(data)`.
5. `dispose()` correctly unbinds all listeners and cancels timers.

```typescript
import { attachMobileImeHandler } from '../frontend/src/utils/terminalImeHelper';

describe('terminalImeHelper', () => {
  let textarea: HTMLTextAreaElement;
  let sentData: string[];

  beforeEach(() => {
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    sentData = [];
  });

  afterEach(() => {
    if (textarea.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
    jest.useRealTimers();
  });

  test('intercepts beforeinput insertText when not composing and sends data', () => {
    const controller = attachMobileImeHandler({
      textarea,
      onDirectInput: (data) => sentData.push(data),
    });

    expect(controller.isComposing()).toBe(false);

    // Simulate mobile virtual keyboard direct numeric input (e.g. '1')
    const beforeInputEv = new CustomEvent('beforeinput', {
      cancelable: true,
      bubbles: true,
    }) as any;
    beforeInputEv.inputType = 'insertText';
    beforeInputEv.data = '1';

    let defaultPrevented = false;
    beforeInputEv.preventDefault = () => { defaultPrevented = true; };

    textarea.dispatchEvent(beforeInputEv);

    expect(sentData).toEqual(['1']);
    expect(defaultPrevented).toBe(true);

    controller.dispose();
  });

  test('does not intercept beforeinput during composition', () => {
    const controller = attachMobileImeHandler({
      textarea,
      onDirectInput: (data) => sentData.push(data),
    });

    // Start composition (e.g. typing pinyin)
    textarea.dispatchEvent(new Event('compositionstart'));
    expect(controller.isComposing()).toBe(true);

    const beforeInputEv = new CustomEvent('beforeinput', {
      cancelable: true,
      bubbles: true,
    }) as any;
    beforeInputEv.inputType = 'insertText';
    beforeInputEv.data = 'n';

    let defaultPrevented = false;
    beforeInputEv.preventDefault = () => { defaultPrevented = true; };

    textarea.dispatchEvent(beforeInputEv);

    // Should NOT intercept while composing (leave to xterm CompositionHelper)
    expect(sentData).toEqual([]);
    expect(defaultPrevented).toBe(false);

    controller.dispose();
  });

  test('delays resetting isComposing after compositionend to let xterm finalize word', () => {
    jest.useFakeTimers();
    const controller = attachMobileImeHandler({
      textarea,
      onDirectInput: (data) => sentData.push(data),
    });

    textarea.dispatchEvent(new Event('compositionstart'));
    expect(controller.isComposing()).toBe(true);

    textarea.dispatchEvent(new Event('compositionend'));
    // Immediately after compositionend, isComposing should still remain true for a short window
    expect(controller.isComposing()).toBe(true);

    // Advance timers past the finalization delay (e.g. 60ms)
    jest.advanceTimersByTime(70);
    expect(controller.isComposing()).toBe(false);

    controller.dispose();
  });

  test('dispose removes event listeners and cancels pending timers', () => {
    jest.useFakeTimers();
    const controller = attachMobileImeHandler({
      textarea,
      onDirectInput: (data) => sentData.push(data),
    });

    textarea.dispatchEvent(new Event('compositionstart'));
    textarea.dispatchEvent(new Event('compositionend'));

    controller.dispose();

    jest.advanceTimersByTime(100);

    // Further events should not trigger callback
    const beforeInputEv = new CustomEvent('beforeinput', { cancelable: true }) as any;
    beforeInputEv.inputType = 'insertText';
    beforeInputEv.data = '9';
    textarea.dispatchEvent(beforeInputEv);

    expect(sentData).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalImeHelper.test.ts`
Expected: FAIL ("Cannot find module '../frontend/src/utils/terminalImeHelper'")

- [ ] **Step 3: Implement `frontend/src/utils/terminalImeHelper.ts`**

Create `frontend/src/utils/terminalImeHelper.ts`:

```typescript
/**
 * Helper to handle mobile virtual keyboard direct input (e.g. digits, punctuation)
 * when in Chinese/Pinyin IME mode without breaking composition word selection.
 */

export interface TerminalImeOptions {
  textarea: HTMLTextAreaElement;
  onDirectInput: (data: string) => void;
}

export interface TerminalImeController {
  isComposing: () => boolean;
  dispose: () => void;
}

export function attachMobileImeHandler({
  textarea,
  onDirectInput,
}: TerminalImeOptions): TerminalImeController {
  let isComposing = false;
  let compositionEndTimer: NodeJS.Timeout | null = null;
  let lastHandledData = '';
  let lastHandledTime = 0;

  const handleCompositionStart = () => {
    if (compositionEndTimer) {
      clearTimeout(compositionEndTimer);
      compositionEndTimer = null;
    }
    isComposing = true;
  };

  const handleCompositionEnd = () => {
    if (compositionEndTimer) {
      clearTimeout(compositionEndTimer);
    }
    // Delay resetting composing flag by 60ms to allow xterm's native
    // CompositionHelper._finalizeComposition to read and dispatch the selected word.
    compositionEndTimer = setTimeout(() => {
      isComposing = false;
      compositionEndTimer = null;
    }, 60);
  };

  const handleBeforeInput = (e: InputEvent) => {
    // If user is typing in composition mode (e.g. typing pinyin letters),
    // let xterm's native CompositionHelper manage candidate rendering and selection.
    if (isComposing) {
      return;
    }

    if (e.inputType === 'insertText' && e.data) {
      // Prevent xterm's internal _inputEvent from discarding the event via its
      // (!ev.composed || !this._keyDownSeen) check when keyCode 229 precedes it.
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();

      lastHandledData = e.data;
      lastHandledTime = Date.now();

      textarea.value = '';
      onDirectInput(e.data);
    }
  };

  const handleInput = (e: Event) => {
    // Fallback for older mobile webviews where beforeinput cannot be canceled:
    // If not composing, and data wasn't just sent by beforeinput within 50ms, deliver it.
    if (isComposing) {
      return;
    }

    const inputEv = e as InputEvent;
    if (inputEv.inputType === 'insertText' && inputEv.data) {
      const now = Date.now();
      if (inputEv.data === lastHandledData && (now - lastHandledTime) < 60) {
        // Already handled by beforeinput
        textarea.value = '';
        return;
      }

      lastHandledData = inputEv.data;
      lastHandledTime = now;
      textarea.value = '';
      onDirectInput(inputEv.data);
    }
  };

  textarea.addEventListener('compositionstart', handleCompositionStart);
  textarea.addEventListener('compositionend', handleCompositionEnd);
  textarea.addEventListener('beforeinput', handleBeforeInput as EventListener, { capture: true });
  textarea.addEventListener('input', handleInput as EventListener, { capture: true });

  return {
    isComposing: () => isComposing,
    dispose: () => {
      if (compositionEndTimer) {
        clearTimeout(compositionEndTimer);
        compositionEndTimer = null;
      }
      textarea.removeEventListener('compositionstart', handleCompositionStart);
      textarea.removeEventListener('compositionend', handleCompositionEnd);
      textarea.removeEventListener('beforeinput', handleBeforeInput as EventListener, { capture: true });
      textarea.removeEventListener('input', handleInput as EventListener, { capture: true });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalImeHelper.test.ts`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/terminalImeHelper.ts tests/terminalImeHelper.test.ts
git commit -m "feat(terminal): add terminalImeHelper to intercept mobile direct inputs outside composition"
```

---

### Task 2: Integrate `attachMobileImeHandler` into `WebTerminalView.tsx`

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:44-48, 700-754, 1370-1385`
- Test: `tests/terminalMobileImeIntegration.test.ts`

**Interfaces:**
- Consumes:
  - `attachMobileImeHandler({ textarea, onDirectInput: (data) => term.input(data) })` from `terminalImeHelper.ts`
  - `term.input(data: string)` from `@xterm/xterm`

- [ ] **Step 1: Write integration test for WebTerminalView IME integration**

Create `tests/terminalMobileImeIntegration.test.ts`:
1. Verify `WebTerminalView.tsx` imports `attachMobileImeHandler`.
2. Verify `attachMobileImeHandler` is invoked on `helperTextarea` with `term.input`.
3. Verify the controller is disposed when terminal unmounts.

```typescript
import fs from 'fs';
import path from 'path';

describe('WebTerminalView Mobile IME Integration', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  test('WebTerminalView imports and connects attachMobileImeHandler', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');

    // Must import attachMobileImeHandler
    expect(content).toMatch(/import\s*{[^}]*attachMobileImeHandler[^}]*}\s*from\s*'\.\.\/utils\/terminalImeHelper'/);

    // Must attach IME handler on helperTextarea
    expect(content).toContain('attachMobileImeHandler');
    expect(content).toContain('onDirectInput:');
    expect(content).toContain('term.input(');

    // Must call controller.dispose() on cleanup
    expect(content).toContain('imeController?.dispose()');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalMobileImeIntegration.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify `frontend/src/components/WebTerminalView.tsx`**

1. Import `attachMobileImeHandler` and `TerminalImeController` in `WebTerminalView.tsx`:
```typescript
import {
  attachMobileImeHandler,
  TerminalImeController,
} from '../utils/terminalImeHelper';
```

2. Inside `useEffect` where `term` and `helperTextarea` are initialized:
```typescript
    let imeController: TerminalImeController | null = null;
    if (helperTextarea) {
      // ... existing focus and blur event bindings ...

      imeController = attachMobileImeHandler({
        textarea: helperTextarea,
        onDirectInput: (data) => {
          if (!isMountedRef.current || !xtermRef.current) return;
          xtermRef.current.input(data, true);
        },
      });
    }
```

3. In the effect's cleanup return function:
```typescript
    return () => {
      // ... existing disposals ...
      if (imeController) {
        imeController.dispose();
      }
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalMobileImeIntegration.test.ts`
Expected: PASS

- [ ] **Step 5: Run full frontend build and all existing tests**

Run:
```bash
npm run build:frontend
npx jest tests/terminalImeHelper.test.ts tests/terminalMobileImeIntegration.test.ts tests/terminalMobileKeyboard.test.ts
```
Expected: PASS with zero build or test errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalMobileImeIntegration.test.ts
git commit -m "fix(terminal): integrate mobile IME handler to allow numeric and symbol inputs in pinyin mode"
```

---

### Task 3: Full Regression and End-to-End Verification

**Files:**
- Test: All tests via `npm test`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All test suites PASS.

- [ ] **Step 2: Run full production build**

Run: `npm run build`
Expected: Frontend and backend compile cleanly with zero errors.

- [ ] **Step 3: Verify git status is clean and ready**

Run: `git status`
Expected: Working tree clean, changes properly committed with Co-Authored-By attribution.

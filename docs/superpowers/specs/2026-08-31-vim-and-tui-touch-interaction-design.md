# Vim & Interactive TUI Touch Navigation Design Spec

## 1. Problem Statement & Root Cause

When using `vim`, `nano`, or interactive TUI applications (e.g. `htop`, `less`) in the Web Terminal on mobile devices:
1. **Touch Gestures Blocked Keyboard Focus**: The touch listeners on the container intercepted all tap events without delegating focus to xterm's hidden input textarea, preventing the on-screen soft keyboard from opening or staying focused.
2. **Alternate Screen Buffer Scrolling Failed**: In vim/htop, the terminal enters the alternate screen buffer. Standard `scrollLines()` only scrolls the view buffer without sending arrow keys or mouse wheel sequences to vim, resulting in a frozen screen during swipe gestures.
3. **Missing Critical Vim Auxiliary Keys**: The touch accessory bar lacked dedicated `:` (Colon) and `↵` (Enter) shortcuts, making it difficult to execute vim commands (`:wq`, `:q!`).
4. **Focus Loss on Accessory Key Tap**: Tapping accessory bar buttons caused mobile browsers to blur the textarea, dismissing the soft keyboard.

---

## 2. Architecture & Technical Solution

### 2.1 Touch State Machine (Tap vs Drag Separation)
- In `WebTerminalView.tsx`:
  - `onTouchStart`: Records initial coordinates and timestamps, resetting `isDragging = false`.
  - `onTouchMove`: If movement exceeds `8px`, sets `isDragging = true` and performs scroll calculation.
  - `onTouchEnd`: If `!isDragging`, immediately invokes `term.focus()` to wake up and focus the on-screen virtual keyboard.

### 2.2 Alternate Buffer (Vim / Htop) Gesture Translation
- When `term.buffer.active.type === 'alternate'`:
  - Swiping up translates accumulated delta into Down Arrow (`\x1b[B`).
  - Swiping down translates accumulated delta into Up Arrow (`\x1b[A`).
  - Allows natural touchscreen scrolling within vim files and htop process lists.

### 2.3 Accessory Bar Vim Ergonomics & Focus Preservation
- In `TerminalAccessoryBar.tsx`:
  - Add `:` (Colon) and `↵` (Enter / Return) keys to the quick character list.
  - Attach `onTouchStart={(e) => e.preventDefault()}` to all buttons to prevent keyboard blur.
  - Call `onSendInput()` followed by immediate refocus so the keyboard never drops.

---

## 3. Testing & Verification

1. **Build & Type Check**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 25 test suites pass.
2. **Vim Workflow Verification**:
   - Launch `vim test.txt`.
   - Tap screen to focus and open soft keyboard.
   - Press `i` to insert text.
   - Press `ESC` -> `:` -> `wq` -> `Enter` to save and exit smoothly.
   - Swipe up/down inside vim to verify smooth cursor navigation.

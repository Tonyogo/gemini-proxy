# Terminal Accessory Bar Streamlining Design

## Problem Statement

During previous Vim compatibility debugging, temporary shortcut buttons (e.g. `:wq`, `:q!`, and single character buttons like `:`, `i`, `w`, `q`, `|`, `/`, `-`, `~`, `$`, `\\`) were added to the bottom mobile/touch `TerminalAccessoryBar`.

Now that the underlying terminal PTY pipeline, xterm parser, and real-time character transmission are fully standard-compliant, these Vim-specific buttons clutter the UI and are redundant.

---

## Design Specification

### 1. Target Layout

Streamline `TerminalAccessoryBar.tsx` to a clean, professional, and standard terminal accessory bar (Termius / Blink Shell style):

```text
[ ESC ] [ TAB ] [ CTRL ] [ ALT ] | [ ^C ] [ ^D ] [ ^L ] | [ ↵ ] [ ↑ ] [ ↓ ] [ ← ] [ → ]  ||  [ ✨ Snippets ] [ ⌨ ]
```

### 2. Button Specifications

1. **Modifiers**:
   - `ESC`: Sends `\x1b`
   - `TAB`: Sends `\t`
   - `CTRL`: Toggles sticky Ctrl mode (`isCtrlActive`)
   - `ALT`: Toggles sticky Alt mode (`isAltActive`)
2. **Terminal Signals**:
   - `^C`: Sends `\x03` (SIGINT)
   - `^D`: Sends `\x04` (EOF)
   - `^L`: Sends `\x0c` (Clear screen)
3. **Navigation & Confirmation**:
   - `↵`: Sends `\r` (Enter / Return)
   - `↑`: Sends `\x1b[A` (Up arrow)
   - `↓`: Sends `\x1b[B` (Down arrow)
   - `←`: Sends `\x1b[D` (Left arrow)
   - `→`: Sends `\x1b[C` (Right arrow)
4. **Tools & Accessories**:
   - `✨ Snippets`: Toggles the snippets drawer
   - `⌨`: Focuses terminal and helper textarea to toggle the virtual keyboard

### 3. Removed Elements
- Removed `:wq` and `:q!` buttons.
- Removed single character buttons: `:`, `i`, `w`, `q`, `|`, `/`, `-`, `~`, `$`, `\\`.
- Removed unused imports and dead code.

---

## Verification Plan

1. Build frontend and backend (`npm run build`).
2. Run test suites (`npm test`).
3. Verify that all standard modifier keys, arrow keys, Ctrl shortcuts, and snippet drawer function seamlessly.

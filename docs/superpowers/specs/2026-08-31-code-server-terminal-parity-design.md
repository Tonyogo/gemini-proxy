# Code-Server PTY Environment & Protocol Parity Design Spec

## 1. Problem Statement & Root Cause

When interacting with `vim` in the Web Terminal:
1. **Missing UTF-8 Environment Variables**: `node-pty` spawned shells without `LANG` / `LC_ALL` locale environment variables. Linux/macOS `vim` fell back to a 7-bit dumb terminal compatibility mode where full-screen cursor relocation and multi-byte redraws are suppressed.
2. **Ambiguous Control Framing**: Control frames were guessed using `startsWith('{') && endsWith('}')`. When editing JSON files or typing code containing `{}` in vim, input was erroneously intercepted by the control parser.

---

## 2. Architecture & Technical Solution

### 2.1 UTF-8 Locale & Environment Parity (`terminalService.ts`)
- Explicitly inject full terminal environment variables when spawning PTY:
  ```typescript
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
    TERM_PROGRAM: 'gemini-proxy-terminal',
    ...options.env,
  };
  ```

### 2.2 Unambiguous Protocol Framing (`terminalWs.ts` & `WebTerminalView.tsx`)
- All JSON control messages (resize, reset, ping) are prefixed with `"JSON:"`.
- All other messages are passed directly to PTY `stdin` with zero ambiguity.

### 2.3 xterm Configuration
- Set `convertEol: true` and `scrollback: 5000`.

---

## 3. Testing & Verification

1. **Build & Type Check**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 25 test suites pass.
2. **Vim Workflow Verification**:
   - Enter `vim demo.json`.
   - Type JSON payloads with `{}` and verify characters write to the file immediately.
   - Save with `:wq` and verify clean return to shell.

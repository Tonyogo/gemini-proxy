# Unified Terminal Window & Tab Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the terminal window layout between embedded and fullscreen modes into a single polished shell, lifting the window header and tab switcher into `UnifiedTerminalView` with adaptive actions and tab keep-alive preservation.

**Architecture:** 
- `UnifiedTerminalView` becomes the primary window container managing the window frame, top window bar (macOS dots, HostSelector, Tab pills, adaptive actions), and fullscreen state.
- `WebTerminalView` exposes imperatively accessible controls (zoom, reset, reconnect, select mode, fit) via a forwarded ref handle and accepts `hideHeader={true}` to suppress duplicate header rendering.
- `TerminalFileManagerView` exposes a refresh action via an imperative handle.
- Tab preservation is achieved through CSS `display: none` / `hidden` toggling, keeping the active terminal session and WebSocket connected during tab switching.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, xterm.js, Jest.

## Global Constraints

- Strict TypeScript with complete type safety.
- Keep `WebTerminalView` and `TerminalFileManagerView` state intact across tab changes (zero WebSocket disconnections or PTY restarts).
- In standalone/fullscreen mode, retain mobile viewport keyboard translateY compensation.
- Do not invoke HTML5 native `requestFullscreen` (preserves CLI Esc key functionality).
- All 77+ existing test suites must continue to pass without regressions.

---

### Task 1: Extend WebTerminalView & TerminalFileManagerView with Imperative Handles and Prop Interfaces

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/components/terminal/TerminalFileManagerView.tsx`
- Test: `tests/terminalUnifiedHandles.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // in WebTerminalView.tsx
  export interface WebTerminalHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    reconnect: () => void;
    resetSession: () => void;
    toggleSelectMode: () => void;
    fit: () => void;
    isSelectMode: boolean;
  }

  // in TerminalFileManagerView.tsx
  export interface TerminalFileManagerHandle {
    refresh: () => void;
  }
  ```
- Props additions on `WebTerminalViewProps`:
  - `hideHeader?: boolean`
  - `onConnectionChange?: (status: { isConnected: boolean; isConnecting: boolean }) => void`
  - `onSelectModeChange?: (isSelect: boolean) => void`
  - `ref?: React.Ref<WebTerminalHandle>`

- [ ] **Step 1: Write the failing test**

Create `tests/terminalUnifiedHandles.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Component Handles and Props Verification', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const fileManagerPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalFileManagerView.tsx');

  it('WebTerminalView exports WebTerminalHandle and supports hideHeader and handle callbacks', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');
    expect(content).toContain('export interface WebTerminalHandle');
    expect(content).toContain('hideHeader');
    expect(content).toContain('onConnectionChange');
    expect(content).toContain('onSelectModeChange');
  });

  it('TerminalFileManagerView exports TerminalFileManagerHandle', () => {
    const content = fs.readFileSync(fileManagerPath, 'utf-8');
    expect(content).toContain('export interface TerminalFileManagerHandle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalUnifiedHandles.test.ts`
Expected: FAIL (missing exports/props in WebTerminalView & TerminalFileManagerView).

- [ ] **Step 3: Implement WebTerminalView & TerminalFileManagerView updates**

1. In `frontend/src/components/WebTerminalView.tsx`:
   - Define and export `WebTerminalHandle`.
   - Wrap `WebTerminalView` with `React.forwardRef<WebTerminalHandle, WebTerminalViewProps>`.
   - In `useImperativeHandle`, expose `zoomIn`, `zoomOut`, `reconnect`, `resetSession`, `toggleSelectMode`, `fit`, and `isSelectMode`.
   - Call `onConnectionChange?.({ isConnected, isConnecting })` whenever connection state changes.
   - Call `onSelectModeChange?.(isSelectMode)` when selection mode changes.
   - Conditionally render top window bar only when `!hideHeader`.

2. In `frontend/src/components/terminal/TerminalFileManagerView.tsx`:
   - Define and export `TerminalFileManagerHandle`.
   - Wrap `TerminalFileManagerView` with `React.forwardRef<TerminalFileManagerHandle, TerminalFileManagerViewProps>`.
   - Expose `refresh: () => { fetchFiles(currentPath); }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalUnifiedHandles.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx frontend/src/components/terminal/TerminalFileManagerView.tsx tests/terminalUnifiedHandles.test.ts
git commit -m "feat(terminal): add imperative handles and hideHeader prop to terminal components"
```

---

### Task 2: Refactor UnifiedTerminalView to Host Unified Header and Tab Preserving Layout

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Test: `tests/terminalUnifiedLayout.test.ts`

**Interfaces:**
- Consumes: `WebTerminalHandle`, `TerminalFileManagerHandle`, `TerminalHostSelector`
- Responsibilities:
  - Unified window container for embedded and standalone fullscreen modes.
  - Render unified top window bar with:
    - Back button (in standalone mode)
    - macOS dots (Red: exit standalone; Green: toggle standalone)
    - `TerminalHostSelector`
    - Compact Tab capsules for `命令行终端 (interactive)` and `文件管理 (files)`
    - Connection state badge (connected, connecting, disconnected, no hosts)
    - Adaptive right actions:
      - For `interactive`: ZoomOut, ZoomIn, Reconnect, ResetSession, TextSelect, Maximize2/Minimize2
      - For `files`: RefreshCw, Maximize2/Minimize2
  - Dual persistent panels with CSS `hidden` / `flex` toggle.
  - Fit xterm when switching back to `interactive` tab or resizing window.

- [ ] **Step 1: Write the failing test**

Create `tests/terminalUnifiedLayout.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('UnifiedTerminalView Layout and Header Architecture', () => {
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');

  let content: string;
  beforeAll(() => {
    content = fs.readFileSync(unifiedPath, 'utf-8');
  });

  it('UnifiedTerminalView should render macOS action dots in its header', () => {
    expect(content).toContain('rounded-full bg-[#EF4444]');
    expect(content).toContain('rounded-full bg-[#10B981]');
  });

  it('UnifiedTerminalView should host both WebTerminalView and TerminalFileManagerView without unmounting on subTab toggle', () => {
    expect(content).toMatch(/subTab\s*===\s*'interactive'\s*\?\s*'flex'\s*:\s*'hidden'/);
    expect(content).toMatch(/subTab\s*===\s*'files'\s*\?\s*'flex'\s*:\s*'hidden'/);
  });

  it('UnifiedTerminalView should pass hideHeader={true} to WebTerminalView', () => {
    expect(content).toContain('hideHeader={true}');
  });

  it('UnifiedTerminalView should adaptively show terminal zoom/reset buttons only when subTab is interactive', () => {
    expect(content).toContain("subTab === 'interactive'");
    expect(content).toContain('ZoomIn');
    expect(content).toContain('Trash2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalUnifiedLayout.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement UnifiedTerminalView refactor**

Rewrite `frontend/src/components/UnifiedTerminalView.tsx`:
- Import icons: `TerminalSquare`, `FolderOpen`, `Maximize2`, `Minimize2`, `ZoomIn`, `ZoomOut`, `RefreshCw`, `Trash2`, `TextSelect`, `ArrowLeft`.
- Set up `terminalRef = useRef<WebTerminalHandle>(null)` and `fileManagerRef = useRef<TerminalFileManagerHandle>(null)`.
- Maintain `subTab`, `activeHostId`, `connectionStatus`, `isSelectMode` state.
- Add window resize / visual viewport support when in standalone mode on mobile to support smooth keyboard translation.
- Build the unified top bar adhering to the spec.
- Render the dual views with `hidden` / `flex` preserve classes.
- Trigger `terminalRef.current?.fit()` on tab switch to `interactive`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalUnifiedLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UnifiedTerminalView.tsx tests/terminalUnifiedLayout.test.ts
git commit -m "feat(terminal): unify embedded and fullscreen window layouts with top bar tab switching"
```

---

### Task 3: Mobile Viewport, i18n Translations, and Edge-Case Hardening

**Files:**
- Modify: `frontend/src/i18n/LanguageContext.tsx`
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Test: `tests/terminalUnifiedIntegration.test.ts`

**Interfaces:**
- Produces: Complete i18n support in `zh`, `en`, `ja`, `ko` for any new labels/tooltips.
- Guarantees:
  - Mobile virtual keyboard translation works in standalone mode.
  - Reset session confirmation dialog behaves consistently.
  - Font size increments and decrements correctly call terminal ref methods and persist in storage.

- [ ] **Step 1: Write the failing test**

Create `tests/terminalUnifiedIntegration.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Unified Terminal Integration and Translations', () => {
  const i18nPath = path.resolve(__dirname, '../frontend/src/i18n/LanguageContext.tsx');
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');

  it('i18n contains webTerminal and files translation keys in all languages', () => {
    const content = fs.readFileSync(i18nPath, 'utf-8');
    expect(content).toContain('interactiveTab');
    expect(content).toContain('exitFullscreen');
    expect(content).toContain('fullscreen');
  });

  it('UnifiedTerminalView handles mobile visualViewport when in standalone mode', () => {
    const content = fs.readFileSync(unifiedPath, 'utf-8');
    expect(content).toContain('calculateKeyboardTranslateY');
    expect(content).toContain('viewportStyle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalUnifiedIntegration.test.ts`
Expected: FAIL

- [ ] **Step 3: Update i18n and UnifiedTerminalView**

1. Verify `LanguageContext.tsx` has all necessary translation keys for terminal controls and tabs.
2. In `UnifiedTerminalView.tsx`, wire `calculateKeyboardTranslateY` and `window.visualViewport` listener for `standalone` mode so the entire unified window container translates upward when virtual keyboard is active.
3. Wire `handleResetSession` with `confirm(t('webTerminal.resetConfirm'))` before calling `terminalRef.current?.resetSession()`.
4. Wire `handleToggleSelectMode` to invoke `terminalRef.current?.toggleSelectMode()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalUnifiedIntegration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/LanguageContext.tsx frontend/src/components/UnifiedTerminalView.tsx tests/terminalUnifiedIntegration.test.ts
git commit -m "fix(terminal): add mobile keyboard push compensation and complete i18n in unified terminal"
```

---

### Task 4: Complete System Verification, Full Test Suite & Production Build

**Files:**
- Verify: Full codebase
- Build: `npm run build`
- Tests: `npm test`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 78+ test suites pass with 0 failures.

- [ ] **Step 2: Run frontend and backend production build**

Run: `npm run build`
Expected: `dist/frontend` (Vite) and `dist/src` (tsc) compile with 0 errors.

- [ ] **Step 3: Commit and Push**

```bash
git status
git commit --allow-empty -m "chore(terminal): complete verification of unified terminal window design"
git push origin main
```

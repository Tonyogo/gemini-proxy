# WeChat-Like Fixed Header & Adaptive Terminal Viewport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the terminal top window bar remains fixed at the top of the mobile screen (like WeChat's navigation header) while the terminal content and accessory bar dynamically adapt their height and anchor the active prompt/cursor directly above the virtual keyboard.

**Architecture:** 
- Stop applying `translate3d` to the outermost root container in `UnifiedTerminalView` and `WebTerminalView`.
- Keep the top window bar (`Top Window Bar`) pinned as a static/sticky item (`sticky top-0 z-30`).
- Dynamically resize the workspace container to `visualViewport.height - headerHeight` using smooth spring animation (`transition: height 0.22s cubic-bezier(0.16, 1, 0.3, 1)`).
- Anchor the terminal scroll position to the bottom (`scrollToBottomSafe`) so the active cursor line and command prompt remain visible above `TerminalAccessoryBar`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, xterm.js, Jest.

## Global Constraints

- Strict TypeScript with 100% type safety.
- Do not invoke HTML5 native `requestFullscreen`.
- Virtual keyboard appearance must NOT trigger PTY resize (`shouldBlockPtyResize`).
- All existing 82+ test suites must continue to pass without regressions.

---

### Task 1: Decouple Fixed Header and Add Adaptive Workspace Height in UnifiedTerminalView

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Create: `tests/terminalMobileFixedHeader.test.ts`

**Interfaces:**
- Produces:
  - Fixed top window bar (`headerRef`, `sticky top-0 z-30`).
  - Dynamic `workspaceStyle` on the dual panels container with height constrained to `visualViewport.height - headerHeight`.
  - Auto-scroll to prompt/cursor on virtual keyboard appearance.

- [ ] **Step 1: Write the failing test**

Create `tests/terminalMobileFixedHeader.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('UnifiedTerminalView Mobile Fixed Header & Adaptive Viewport', () => {
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(unifiedPath, 'utf-8');
  });

  it('root container does not translate whole window with translate3d', () => {
    // Root container style must not apply translate3d
    expect(content).not.toMatch(/className=\{`[^`]*\bstyle=\{isMobile\s*&&\s*isStandalone\s*\?\s*viewportStyle\s*:\s*undefined\}/);
    expect(content).toContain('workspaceStyle');
  });

  it('top header bar is marked as sticky top-0 and tracked with headerRef', () => {
    expect(content).toContain('headerRef');
    expect(content).toMatch(/sticky\s+top-0\s+z-30/);
  });

  it('workspace container applies dynamic height adaptation with transition', () => {
    expect(content).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(content).toMatch(/style=\{isMobile\s*&&\s*isStandalone\s*\?\s*workspaceStyle\s*:\s*undefined\}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalMobileFixedHeader.test.ts`
Expected: FAIL (missing `workspaceStyle`, `headerRef`, and root container still has `viewportStyle`).

- [ ] **Step 3: Implement Fixed Header & Workspace Height in UnifiedTerminalView**

In `frontend/src/components/UnifiedTerminalView.tsx`:
1. Add `headerRef = useRef<HTMLDivElement>(null)` and state `workspaceStyle: React.CSSProperties`.
2. In `handleViewportChange`:
   - Calculate `headerHeight = headerRef.current?.offsetHeight || 44`.
   - When `offsetResult.isKeyboardShowing`:
     - Available height: `Math.max(120, vv.height - headerHeight)`.
     - Set `workspaceStyle`:
       ```typescript
       setWorkspaceStyle({
         height: `${Math.max(120, vv.height - headerHeight)}px`,
         maxHeight: `${Math.max(120, vv.height - headerHeight)}px`,
         flex: 'none',
         transition: 'height 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
         overflow: 'hidden',
       });
       ```
     - Call `terminalRef.current?.fit()` / `terminalRef.current?.scrollToBottomSafe?.()` or safe scroll anchor.
   - When keyboard closes, reset `workspaceStyle` to `{}`.
3. Remove `viewportStyle` from the root container.
4. Add `ref={headerRef}` and `z-30` to the Top Window Bar (`sticky top-0 z-30`).
5. Wrap the dual panels workspace with a container having:
   ```tsx
   <div
     style={isMobile && isStandalone ? workspaceStyle : undefined}
     className="flex-1 min-h-0 flex flex-col relative overflow-hidden"
   >
     {/* subTab === 'interactive' and subTab === 'files' */}
   </div>
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalMobileFixedHeader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UnifiedTerminalView.tsx tests/terminalMobileFixedHeader.test.ts
git commit -m "feat(terminal): pin top header and make workspace height adaptive on mobile keyboard"
```

---

### Task 2: Align WebTerminalView Standalone Header and Update Regression Tests

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `tests/terminalMobileSmoothPush.test.ts`
- Modify: `tests/terminalMobileFixedHeader.test.ts`

**Interfaces:**
- Guarantees:
  - When `WebTerminalView` is rendered with `hideHeader={false}` in standalone mode, its top header bar also remains fixed at `top: 0` while the terminal canvas area contracts.
  - `TerminalAccessoryBar` stays docked at the bottom of the viewport directly above the keyboard.
  - `terminalMobileSmoothPush.test.ts` validates smooth transition curves without regressions.

- [ ] **Step 1: Write test updates**

Update `tests/terminalMobileFixedHeader.test.ts` to assert that `WebTerminalView` also pins its top header when `!hideHeader && standalone`:
```typescript
  it('WebTerminalView header has sticky top-0 and does not translate off-screen', () => {
    const webContent = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx'), 'utf-8');
    expect(webContent).toContain('sticky top-0 z-30');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalMobileFixedHeader.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement WebTerminalView fixed header alignment**

In `frontend/src/components/WebTerminalView.tsx`:
1. Change Top Window Bar header from `sticky top-0 z-10` to `sticky top-0 z-30`.
2. When `!hideHeader && standalone`, apply the `viewportStyle` height adjustment to the inner terminal workspace instead of translating the root container, keeping the top header pinned at the top.
3. Update `terminalMobileSmoothPush.test.ts` to match the updated styling while retaining verification of `cubic-bezier(0.16, 1, 0.3, 1)` spring animation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/terminalMobileFixedHeader.test.ts tests/terminalMobileSmoothPush.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalMobileSmoothPush.test.ts tests/terminalMobileFixedHeader.test.ts
git commit -m "fix(terminal): align standalone WebTerminalView fixed header and smooth push behavior"
```

---

### Task 3: Full Test Suite Verification & Production Build

**Files:**
- Full codebase
- Build: `npm run build`
- Tests: `npm test`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 83+ test suites pass with 0 errors.

- [ ] **Step 2: Run frontend and backend production build**

Run: `npm run build`
Expected: `dist/frontend` (Vite) and `dist/src` (tsc) compile cleanly with 0 errors.

- [ ] **Step 3: Commit and Push**

```bash
git status
git commit --allow-empty -m "chore(terminal): complete verification of mobile WeChat-like fixed header"
git push origin main
```

# WeChat-Like Fixed Header & Adaptive Terminal Viewport on Mobile Keyboard Design

## 1. Problem Statement

On mobile devices in fullscreen terminal mode, when the virtual keyboard pops up, the previous implementation applied a global `translate3d(0, -translateY, 0)` to the **outer root container**.
As a result:
- The entire screen, including the **top header bar** (macOS dots, node selector, Tab switcher, fullscreen exit button), was pushed up outside the visible viewport.
- Users were unable to access header controls (such as switching nodes, navigating to File Manager, or exiting fullscreen) while typing.
- The experience differed unfavorably from native messaging apps like WeChat, where the **header bar remains strictly pinned to the top**, and only the message area and input dock adjust to the virtual keyboard.

---

## 2. Architecture & Design Principles

```
+-------------------------------------------------------------+
| Top Window Bar (Fixed Header: shrink-0, sticky top-0, z-30) | <- NEVER moves
| [<- Back] [Nodes] [Terminal | Files] ... [Exit Fullscreen]   |
+-------------------------------------------------------------+
| Dynamic Workspace Container (flex-1 / dynamic height)       |
|                                                             |
|   +-----------------------------------------------------+   |
|   | xterm.js Terminal Canvas (overflow-hidden, flex-1)  |   |
|   | - Content scrolls behind top header with clean mask |   |
|   | - Automatically anchors prompt/cursor to bottom     |   |
|   +-----------------------------------------------------+   |
|   | TerminalAccessoryBar (ESC, TAB, Ctrl, Arrows)       |   | <- Glued above keyboard
+---+-----------------------------------------------------+---+
|                                                             |
|               Mobile Virtual Keyboard (OS-level)            |
|                                                             |
+-------------------------------------------------------------+
```

### Core Principles
1. **Header Stays Fixed (Zero Translate on Root)**:
   - Root container remains `fixed inset-0` with no `transform: translate3d`.
   - Top Header Bar remains anchored at `top: 0` with sticky positioning and backdrop blur.
2. **Dynamic Viewport Height Adaptation**:
   - Instead of translating the whole container upward, the workspace container dynamically calculates its height using `window.visualViewport.height - headerHeight`.
   - Smooth height transition `transition: height 0.22s cubic-bezier(0.16, 1, 0.3, 1)` mirrors native WeChat keyboard interaction.
3. **Cursor & Accessory Bar Pinning**:
   - `TerminalAccessoryBar` sits flush at the bottom of the active workspace, docking directly above the virtual keyboard.
   - `scrollToBottomSafe(term)` anchors the terminal prompt/cursor line immediately above the accessory bar on keyboard focus and viewport resize.
4. **PTY Resize Suppression**:
   - Retain `shouldBlockPtyResize` so virtual keyboard appearance does not send `SIGWINCH` or trigger Claude Code CLI reflows.

---

## 3. Detailed Specifications

### 3.1 UnifiedTerminalView Layout Updates
- **Root Container**:
  - Class: `fixed inset-0 z-50 rounded-none h-[100dvh] w-screen overflow-hidden overscroll-none border-none bg-[var(--bg-canvas)] flex flex-col font-mono text-xs transition-none`
  - Remove root `viewportStyle` transform.
- **Top Header Bar**:
  - `ref={headerRef}` to dynamically track actual header height (typically ~40px - 44px).
  - Class: `shrink-0 sticky top-0 z-30 bg-[var(--bg-surface-sub)]/95 backdrop-blur-md border-b border-[var(--border-subtle)]`
- **Workspace Wrapper**:
  - Dynamic style applied to workspace container:
    ```typescript
    const workspaceStyle: React.CSSProperties = isMobile && isStandalone && isKeyboardOpen
      ? {
          height: `${visualViewportHeight - headerHeight}px`,
          maxHeight: `${visualViewportHeight - headerHeight}px`,
          flex: 'none',
          transition: 'height 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        }
      : {};
    ```

### 3.2 WebTerminalView Layout Alignment
- If `WebTerminalView` is rendered standalone with `hideHeader={false}`, it adopts the identical structure:
  - Header remains fixed at the top.
  - Inner terminal container and accessory bar adjust height rather than translating the root.
- In both views, call `terminalRef.current?.scrollToBottomSafe()` upon `isKeyboardOpen` transition.

---

## 4. Testing & Verification

1. **Unit & Structural Tests (`tests/terminalMobileFixedHeader.test.ts`)**:
   - Verify `UnifiedTerminalView` does not apply `translate3d` to its root element.
   - Verify the top header maintains `sticky top-0` / `shrink-0` and does not translate.
   - Verify workspace container receives dynamic height bounded by `visualViewport.height - headerHeight`.
2. **Regression Verification**:
   - Full test suite (`npm test`) passes with 0 failures.
   - Frontend and backend production build (`npm run build`) succeeds cleanly.

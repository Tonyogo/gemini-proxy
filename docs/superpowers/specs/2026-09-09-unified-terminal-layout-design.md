# Unified Terminal Window & Tab Navigation Design

## 1. Overview & Objective

The current terminal UI exhibits an inconsistency between the normal (embedded) view and the standalone/fullscreen view:
1. In embedded mode, `UnifiedTerminalView` wraps `WebTerminalView` with an outer card containing host selection and sub-tab pills, while `WebTerminalView` simultaneously renders its own inner window header bar with macOS control dots, host selection, and control buttons (resulting in a redundant double-header layout).
2. In fullscreen mode, `WebTerminalView` renders its own single header bar, but the "File Manager" (`TerminalFileManagerView`) navigation is completely missing, locking the user out of file management when operating in fullscreen.
3. The layout dimensions, border styling, and visual container paradigms differ between embedded and fullscreen modes.

### Goals
- **Unified Layout**: Standardize both embedded and fullscreen terminal views into a single, polished window shell container replicating the modern fullscreen design.
- **Top Bar Tab Navigation**: Move the `命令行终端 (interactive)` and `文件管理 (files)` pill tabs into the unified top window bar beside the macOS window buttons and Host Selector.
- **Adaptive Action Bar**: Context-sensitively render actions on the right side of the window bar based on the active tab (e.g., zoom, reset session, and selection mode for terminal; refresh for file manager; fullscreen toggle for both).
- **Tab State Keep-Alive**: Ensure switching between terminal and file manager preserves the running `xterm.js` process and WebSocket tunnel without reconnecting or clearing screen buffers.

---

## 2. Architecture & Component Hierarchy

```
UnifiedTerminalView (unified container, window frame, layout transitions, top window bar)
  ├── UnifiedHeaderBar (macOS action dots, back button, HostSelector, Tab pills, adaptive actions)
  └── WorkspaceContent (overflow-hidden, full flex container)
        ├── WebTerminalView (terminal session: xterm.js, PTY tunnel, touch bridge, accessory bar)
        │     * Rendered in persistent DOM wrapper with hidden/flex toggle
        └── TerminalFileManagerView (RPC file manager: tree, upload/download, Monaco editor)
              * Rendered in persistent DOM wrapper with hidden/flex toggle
```

---

## 3. Detailed Specifications

### 3.1 Unified Container Styles
- **Fullscreen / Standalone Mode (`isStandalone = true`)**:
  - Class: `fixed inset-0 z-50 rounded-none h-[100dvh] w-screen overflow-hidden overscroll-none border-none bg-[var(--bg-canvas)] flex flex-col font-mono text-xs`
  - Dynamic transform support: Bound to `viewportStyle` calculated by `mobileViewportHelper` on mobile when virtual keyboard is raised.
- **Embedded Mode (`isStandalone = false`)**:
  - Class: `w-full max-w-7xl mx-auto h-[calc(100vh-140px)] min-h-[500px] rounded-none md:rounded-2xl border-x-0 md:border-x border-t-0 md:border-t border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col bg-[var(--bg-canvas)] font-mono text-xs`

### 3.2 Top Window Bar Specification
The top bar uses `bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] px-2 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between select-none shrink-0 sticky top-0 z-10`.

#### Left Section:
1. **Back to Console**: In standalone mode, renders `<ArrowLeft />` button to return to dashboard.
2. **macOS Action Dots**:
   - Red: Exits fullscreen if in standalone mode; decorative otherwise.
   - Yellow: Decorative.
   - Green: Toggles fullscreen/standalone mode on click.
3. **Host Selector (`TerminalHostSelector`)**: Directly embedded in the top bar. Selects active agent node.
4. **Tab Switcher Pills**:
   - Styled as a compact rounded-xl capsule (`bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] p-0.5`).
   - `interactive` button: `<TerminalSquare className="w-3.5 h-3.5" />` + label `命令行终端` (text hidden on extra-small mobile).
   - `files` button: `<FolderOpen className="w-3.5 h-3.5" />` + label `文件管理` (text hidden on extra-small mobile).
   - Active style: `bg-indigo-600 text-white shadow-xs font-semibold`.
   - Inactive style: `text-slate-400 hover:text-slate-200`.
5. **Connection Badge**:
   - Reflects the active host connection state (`在线/已连接`, `连接中`, `已断开`, `无在线节点`).

#### Right Action Section (Adaptive):
- **When `subTab === 'interactive'`**:
  - `ZoomOut`: Decrements terminal font size (hidden on mobile).
  - `ZoomIn`: Increments terminal font size (hidden on mobile).
  - `RefreshCw`: Reconnects terminal WebSocket.
  - `Trash2`: Resets terminal session (confirmation modal).
  - `TextSelect`: Toggles touch/mouse text selection mode.
  - `Maximize2 / Minimize2`: Toggles fullscreen/standalone mode.
- **When `subTab === 'files'`**:
  - `RefreshCw`: Triggers directory refresh in file manager.
  - `Maximize2 / Minimize2`: Toggles fullscreen/standalone mode.

---

## 4. Component Communication & State Management

### 4.1 Imperative Handles & Ref Bridge
To keep `WebTerminalView` modular while lifting the header controls to `UnifiedTerminalView`:
1. `WebTerminalView` exposes a `WebTerminalHandle` through `React.forwardRef` or custom ref object:
   ```typescript
   export interface WebTerminalHandle {
     zoomIn: () => void;
     zoomOut: () => void;
     reconnect: () => void;
     resetSession: () => void;
     toggleSelectMode: () => void;
     isSelectMode: boolean;
     fit: () => void;
   }
   ```
2. `TerminalFileManagerView` exposes a `FileManagerHandle`:
   ```typescript
   export interface FileManagerHandle {
     refresh: () => void;
   }
   ```
3. Status callbacks:
   - `onConnectionChange?: (status: { isConnected: boolean; isConnecting: boolean }) => void`
   - `onSelectModeChange?: (isSelectMode: boolean) => void`
4. Header elimination in `WebTerminalView`:
   - Add a prop `hideHeader?: boolean` to `WebTerminalView`.
   - When rendered under `UnifiedTerminalView`, `hideHeader={true}` suppresses the duplicate header inside `WebTerminalView`.

### 4.2 Tab Preservation (Keep-Alive)
Instead of unmounting components when switching tabs:
```tsx
<div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
  <div className={`flex-1 flex flex-col h-full min-h-0 ${subTab === 'interactive' ? 'flex' : 'hidden'}`}>
    <WebTerminalView
      ref={terminalRef}
      adminKey={adminKey}
      hideHeader={true}
      controlledHostId={activeHostId}
      standalone={Boolean(isStandalone)}
      onConnectionChange={handleConnectionChange}
      onSelectModeChange={handleSelectModeChange}
    />
  </div>
  <div className={`flex-1 flex flex-col h-full min-h-0 ${subTab === 'files' ? 'flex' : 'hidden'}`}>
    <TerminalFileManagerView
      ref={fileManagerRef}
      adminKey={adminKey}
      activeHostId={activeHostId}
    />
  </div>
</div>
```
When `subTab` changes to `'interactive'`, call `terminalRef.current?.fit()` on the next tick so xterm adjusts to geometry immediately.

---

## 5. Testing & Verification

1. **Unit & Component Tests**:
   - Test tab switching in `UnifiedTerminalView` updates visible panel class without unmounting children.
   - Test header actions adaptively show/hide depending on `subTab`.
   - Test standalone/fullscreen toggling preserves active tab and host selection.
2. **End-to-End & Build Verification**:
   - `npm run build` succeeds for both frontend and backend.
   - Run complete test suite (`npm test`).
   - Manual visual check in desktop and mobile viewport sizes.

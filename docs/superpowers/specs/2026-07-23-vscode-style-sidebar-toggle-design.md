# Design Spec: VS Code Style Complete Sidebar Hiding in LogsView

## Executive Summary
This spec refactors the LogsView sidebar collapse mechanism to match VS Code IDE behavior, enabling complete, zero-width hiding of the left logs sidebar.

## Component Architecture (`frontend/src/components/LogsView.tsx`)

### 1. Inspector Toolbar Integration
- Moves the toggle button to the top-left corner of the main Inspector Panel.
- Displays an SVG sidebar toggle icon (`[|]`).
- Toggling directly flips `sidebarCollapsed` state.

### 2. Zero-Width Complete Hiding
- **When Collapsed (`sidebarCollapsed = true`)**:
  - The left sidebar is completely removed from the layout (`hidden` / `display: none`).
  - The main Payload Inspector immediately occupies 100% of the screen width (`w-full flex-1`).
- **When Expanded (`sidebarCollapsed = false`)**:
  - The left sidebar renders at its fixed 320px width (`w-80`).

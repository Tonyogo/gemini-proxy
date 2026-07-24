# Design Spec: Monaco Editor Integration for Raw Text Code Folding

## Executive Summary
This design specifies integrating Monaco Editor (`@monaco-editor/react`) into `gemini-proxy`'s LogsView to deliver a true VS Code style JSON reading experience in `Raw Text` mode, complete with code folding, line numbers, and syntax highlighting.

## Components & Architecture (`frontend/src/components/LogsView.tsx`)

### 1. Dependencies (`frontend/package.json`)
- Adds `@monaco-editor/react` (`^4.6.0`).

### 2. Monaco Code Viewer Configuration
- **Language**: `json`
- **Theme**: `vs-dark`
- **Key Features Enabled**:
  - `folding: true` (Native code block fold/unfold on line gutters)
  - `readOnly: true` (Read-only inspection)
  - `minimap: { enabled: false }` (Clean layout without mini-map clutter)
  - `wordWrap: 'on'`
  - `automaticLayout: true` (Auto-adjust to panel dimensions)

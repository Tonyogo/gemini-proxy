# Design Spec: Chrome DevTools Style JSON Tree Preview & Raw Logs Inspector

## Executive Summary
This design replaces custom card abstraction logic with a true Chrome DevTools Network Panel style JSON Inspector in `gemini-proxy`. 

It delivers an interactive expandable/collapsible JSON Object Tree (`Preview` mode) and plain formatted string code blocks (`Raw` mode) for side-by-side comparison between Claude API and Gemini API payloads.

## Architecture & Component Breakdown (`frontend/src/components/LogsView.tsx`)

### 1. DevTools Sub-Tab Navigation Bar
- **Tab Selection**:
  - `Payload` (Request Comparison): Compares `client_req` (Claude) vs `gem_req` (Gemini).
  - `Response` (Response Comparison): Compares `claude_res` (Claude) vs `gem_res` (Gemini).
  - `All-in-One`: Stacks Request and Response side-by-side.
- **View Mode Switcher**:
  - `Preview` (Default): Renders an interactive, syntax-highlighted, expandable/collapsible `JsonTreeView`.
  - `Raw`: Renders pure `JSON.stringify(..., null, 2)` inside formatted `<pre>` code blocks.

### 2. Interactive JSON Tree Component (`JsonTreeView`)
- **Recursive Node Expand/Collapse**:
  - Displays `▼` (expanded) and `▶` (collapsed) toggle controls.
  - Displays structural type counts, e.g. `messages: Array(2)` or `generationConfig: Object(4)`.
  - Expands root and second-level nodes by default for immediate visibility.
- **Chrome DevTools Syntax Color Rules**:
  - `Keys`: Light yellow/white (`text-amber-200/text-slate-200`)
  - `Strings`: Green (`text-emerald-400`)
  - `Numbers`: Blue (`text-blue-400`)
  - `Booleans`: Purple (`text-purple-400`)
  - `Null / Undefined`: Dark Gray (`text-slate-500 italic`)

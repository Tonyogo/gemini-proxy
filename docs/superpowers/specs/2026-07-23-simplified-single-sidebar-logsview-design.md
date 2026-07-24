# Design Spec: Simplified Single-Sidebar Logs View with Date/Hour Selectors

## Executive Summary
This spec simplifies the LogsView layout in `gemini-proxy` from a 3-column layout with dual sidebars to a clean, spacious 2-column layout (Left Sidebar + Right Inspector).

## Layout & Component Architecture (`frontend/src/components/LogsView.tsx`)

### 1. Left Sidebar Column (1/3 Width)
- **Top Filter Controls**:
  - **Date Dropdown (`<select>`)**: Populated dynamically from `tree` keys. Defaults to the most recent date with log data.
  - **Hour Dropdown (`<select>`)**: Populated dynamically based on selected date's hours. Defaults to the most recent hour with log data (with "All Hours" option available).
  - **Refresh Button**: Manual reload icon trigger.
- **Log Files Card List**:
  - Scrollable file list filtered by selected `date` and `hour`.
  - Automatically loads and highlights the first file in the filtered list upon initial render or filter changes.

### 2. Right Main Inspection Column (2/3 Width)
- Full-width JSON Payload Comparison Inspector.
- Renders:
  - Client Claude API Request
  - Translated Upstream Gemini Request
  - Claude Response Output
- Prominently displays status badges and latency duration.

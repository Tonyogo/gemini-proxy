# Design Spec: Enhanced SSE Event Stream Preview & Toolbar Simplification

## Executive Summary
This design removes the redundant `All-in-One` tab mode in `gemini-proxy`'s LogsView and implements a specialized Chrome DevTools EventSource style SSE Stream Inspector in `Preview` mode for streaming responses.

## UI/UX & Component Changes (`frontend/src/components/LogsView.tsx`)

### 1. Navigation Toolbar Simplification
- **Removed**: `All-in-One` tab option.
- **Active Tabs**: `Payload (Request Comparison)` and `Response (Response Comparison)`.

### 2. Specialized SSE Stream Preview Inspector (`SseStreamPreview`)
When response payloads (`claude_res` or `gem_res`) contain streaming data (arrays of chunk objects or multi-line `event: ...\ndata: ...` strings):

- **Assembled Full Message Card (Top Summary)**:
  - Automatically reconstructs and concatenates streamed text deltas (`content_block_delta` / `text`) into the full final response string.
  - Automatically reconstructs CoT thinking process (`thinking_delta`) into a single collapsible **💭 Complete Thinking Chain** panel.
- **Chrome DevTools EventSource Style Timeline (Bottom Stream List)**:
  - Renders indexed SSE events with distinct event badges (`message_start`, `content_block_delta`, `message_delta`, `message_stop`).
  - Allows clicking individual chunks to inspect their raw JSON object via `JsonTreeView`.

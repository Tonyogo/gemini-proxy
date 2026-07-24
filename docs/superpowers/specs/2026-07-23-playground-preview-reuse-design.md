# Design Spec: Playground Stream Preview and DevTools View Reuse

## Executive Summary
This design brings the polished, highly-observant logging `Preview` viewer components into the Interactive API Playground.

When testing requests in the Playground, users will have access to the exact same DevTools-inspired interface: expandable JSON trees (`JsonTreeView`) for static payloads, and live-assembling stream timeline components (`SseStreamPreview`) for stream requests.

## Component Integrations (`frontend/src/components/PlaygroundView.tsx`)

### 1. View Mode Toggles (Right Column Header)
- Adds Mode toggles to the right-side Response Panel:
  - `👁 Preview` (Default):
    - If the request has `"stream": true`, renders the dynamic `SseStreamPreview` populated with the raw stream array.
    - If non-stream, renders the expandable `JsonTreeView` tree.
  - `💻 Raw Text`:
    - Renders pure string text inside Monaco Editor.

### 2. Live Typewriter Streaming
- Replaces plain string accumulation.
- During `ReadableStream` reader looping, parses incoming SSE string chunks in real-time, adds parsed JSON objects into a reactive `streamChunks` array state, and feeds it into `<SseStreamPreview streamData={streamChunks} />`. This allows the text, thinking processes, and event logs to animate dynamically as they load from the API.

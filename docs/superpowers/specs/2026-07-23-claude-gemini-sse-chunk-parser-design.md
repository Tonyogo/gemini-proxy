# Design Spec: High-Fidelity Claude/Gemini SSE Chunk Parser & Timeline Viewer

## Executive Summary
This spec outlines the implementation of a high-fidelity chunk-level parser inside `SseStreamPreview.tsx`. It intelligently detects, translates, and summarizes distinct events within both Claude (Anthropic Messages Stream format) and Gemini response stream events.

## Chunk Parsing Rules (`frontend/src/components/SseStreamPreview.tsx`)

### 1. Timeline Card Summary Rules
Each item in the EventSource timeline scrollbox represents a single SSE message block. The preview text is dynamically extracted using these rules:

#### Claude Event Chunks (`claude_res`)
- **`message_start`**: Summary ➔ `Model: {model}` (starts assistant message).
- **`content_block_start`**: Summary ➔ `Block Start (type: {block.type})`.
- **`content_block_delta`**:
  - `text_delta` ➔ Summary ➔ `Text: "{delta.text}"`.
  - `thinking_delta` ➔ Summary ➔ `Thinking: "{delta.thinking}"`.
- **`content_block_stop`**: Summary ➔ `Block End`.
- **`message_delta`**: Summary ➔ `Stop Reason: {delta.stop_reason} | Usage: {usage.output_tokens} tokens`.
- **`message_stop`**: Summary ➔ `Stream Ended`.

#### Gemini Event Chunks (`gem_res`)
- **Standard response parts**:
  - `text` part ➔ Summary ➔ `Text: "{part.text}"`.
  - `thought` part (CoT) ➔ Summary ➔ `Thought: "{part.thought}"`.
  - `functionCall` ➔ Summary ➔ `Function Call: {part.functionCall.name}`.
- **Finish metadata**: Summary ➔ `Finish Reason: {candidate.finishReason}`.

## Top Assembled Panel Enhancement
- Keeps the exact text delta concatenation and thinking process aggregation but updates parsing hooks to perfectly handle the expanded Claude content blocks and Gemini candidates objects.

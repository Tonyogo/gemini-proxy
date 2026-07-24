# Design Spec: High-Fidelity JSON Event Return and Stream Serializer Separation

## Executive Summary
This design refactors `translateGoogleToClaudeStream` to make it a pure, side-effect-free JSON-to-JSON translator. 

Instead of returning a serialized multi-line SSE string (`event: ...\ndata: ...`), it will directly return an array of structured Claude JSON events. Protocol serialization will be cleanly separated and performed at the network boundaries inside the HTTP controller (`claudeController.ts`).

## Component Specifications

### 1. Translator Refactoring (`src/services/claudeTranslator.ts`)
- **Method Signature**: `translateGoogleToClaudeStream(googleChunk: string, modelName: string, streamState: any): any[] | null`
- **Output**: Pure array of translated Claude JSON event objects. Contains no SSE wrapping, no `data:` prefixes, and no terminal newlines.

### 2. Controller & Log Alignment (`src/controllers/claudeController.ts`)
In the streaming event loop inside `handleMessages`:
- Calls `translateGoogleToClaudeStream` to get JSON events.
- Seamlessly flattens and stores events directly into `claudeResChunks` using standard Array spreading (`claudeResChunks.push(...events)`).
- Performs on-the-fly network protocol serialization right before writing to response socket:
  ```typescript
  const sseText = events.map((ev: any) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join('');
  res.write(sseText);
  ```

### 3. Frontend & Logs Alignment
Since both `gem_res` and `claude_res` in transaction logs now consist strictly of unified JSON Object Arrays, we can strip any dirty SSE parsing workarounds out of `SseStreamPreview.tsx` and feed JSON trees straight to the inspector.

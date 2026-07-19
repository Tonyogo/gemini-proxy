# Design Spec: Stream Response Optimization (Log Viewer)

This design specification details the architecture, UI changes, parsing rules, and rendering engine for adding native SSE (Server-Sent Events) and Chunk Stream support to the request/response log viewer.

## 1. Goal

When a transaction utilizes a streaming model, `gem_res` is saved as a list of parsed JSON chunk objects, and `claude_res` is saved as an array of SSE event strings (containing `event: ...\ndata: ...\n\n`). 

Directly rendering these arrays in a standard JSON tree causes:
- Inability to read the overall output text without manually piecing together dozens of frames.
- A cluttered and unreadable presentation of raw SSE strings in Claude's output.

We will introduce a client-side **Stream Parser & Timeline Renderer** inside the SPA viewer that detects streaming logs, assembles the complete concatenated AI message in a beautiful chat bubble at the top, and displays a chronologically color-coded event timeline, allowing users to fold/unfold specific frame JSON payload trees on demand.

---

## 2. Parsing Architecture (Front-end Vanilla JS)

All parsing logic is fully isolated inside the browser runtime of `src/public/index.html`.

### 2.1 Detection Heuristics
```javascript
function isClaudeStream(resArray) {
  if (!Array.isArray(resArray) || resArray.length === 0) return false;
  const firstItem = resArray.find(item => typeof item === 'string' && item.trim().length > 0);
  if (!firstItem) return false;
  const cleaned = firstItem.trim();
  return cleaned.startsWith('event:') || cleaned.startsWith('data:') || cleaned.includes('event:');
}

function isGeminiStream(resArray) {
  if (!Array.isArray(resArray) || resArray.length === 0) return false;
  const firstItem = resArray[0];
  return firstItem && typeof firstItem === 'object' && ('candidates' in firstItem || 'promptFeedback' in firstItem);
}
```

### 2.2 Text Reassembly Algorithms

#### Claude Stream Merger:
Iterate over the Claude raw lines. For each item:
1. Parse SSE syntax using regex to capture the `event` label and `data` JSON block.
2. If the parsed object `type` is `content_block_delta` or `completion`, extract `delta.text` or `completion` string.
3. Append and sanitize text to produce a final continuous text block.

#### Gemini Stream Merger:
Iterate over the array of objects. For each object:
1. Extract content safely: `item.candidates?.[0]?.content?.parts?.[0]?.text`.
2. Accumulate text chunks.

---

## 3. UI Layout & Component Design

The Stream Response Preview panel is split vertically into two sections:

### 3.1 AI Response Merged Preview (Chat Bubble)
- **Container**: Slate-900 styled box (`bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6 shadow-lg shadow-black/20`).
- **Header**: Shows an AI Assistant icon and a "Text Output Preview" label with a copy-to-clipboard button.
- **Content Area**: Formatted paragraph output. Newlines (`\n`) are preserved and rendered as breaks or wrap-spaces (`whitespace-pre-wrap font-sans text-gray-200 leading-relaxed`).

### 3.2 Timeline Events Stream (Interactive Drawer Accordion)
- **List Structure**: Chronological cards.
- **Visual Indicators (Color-coded chips)**:
  - **Initiators / Headers (Blue)**: `message_start`, `promptFeedback`.
  - **Deltas / Tokens (Green)**: `content_block_delta`, `text_delta`. Shows a sub-text snippet previewing the token (e.g. `+ "hello"`).
  - **Finalizers / Metadata (Yellow)**: `message_delta`, `done`, `usage`.
- **Interactivity**: Clicking on an event row toggles the height of an nested child div. The child div displays the precise JSON payload of that individual event, rendered by our recursive JSON tree generator `createJsonNode()`.

---

## 4. Verification & Implementation Phases

1. **Step 1: Write Stream Heuristics & Reassembly Functions**
   - Inject `isClaudeStream`, `isGeminiStream`, and parsers directly into the script scope of `src/public/index.html`.

2. **Step 2: Design Timeline Row Component Generator**
   - Build a lightweight JS DOM generator function `createStreamRow(index, eventType, label, snippetText, payloadObject)` to create interactive rows with Tailwind-animated collapse arrows.

3. **Step 3: Integrate with Detail Selection Handler**
   - Update `renderPayload()` in `index.html`. When the active format is "Preview", check if the payload object is a stream array. If true, run stream rendering instead of deep-recursive tree rendering.

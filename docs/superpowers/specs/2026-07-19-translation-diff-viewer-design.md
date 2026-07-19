# Design Spec: Translation Discrepancy Diff Viewer (Side-by-Side Compare)

This design specification details the UX layout, twin-rendering architecture, and file/DOM modifications required to introduce a Side-by-Side compare visualizer inside the log viewer.

## 1. Goal

When developing or debugging Claude-to-Gemini API translation patterns, it is extremely difficult to spot mismatch parameters, dropped schemas, casing errors, or system-instruction wrappers across disparate tabs.

We will introduce a **Side-by-Side Compare Mode** alongside a **Collapsible Sidebar Action** to give developers maximum horizontal space to align Claude requests/responses right next to their translated Gemini counterparts. 

---

## 2. UI Layout Adjustments & HTML DOM Restructuring

We will restructure the main DOM layout of `src/public/index.html` to support two-column split-pane rendering.

### 2.1 Level 1 Navigation Tabs Upgrade
We will insert a third button into the Level 1 tab list:
```html
<button onclick="switchTab('primary', 'compare')" id="tab-primary-compare" class="border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-700 transition">Compare / 对比</button>
```

### 2.2 Collapsible Sidebar Trigger
To accommodate twin-panel horizontal requirements, we introduce a collapse button `[◀/▶]` right at the boundary or header of the sidebar. When collapsed:
- Sidebar width shifts to `w-0` or `hidden`.
- Main comparison workspace expands to 100% viewport.

### 2.3 Double-Column Contrast Panels
We introduce a side-by-side div inside the display container, adjacent to the original `payloadContainer`:
```html
<!-- Single Pane Container (Original) -->
<div id="payloadContainer" class="font-mono text-sm leading-relaxed"></div>

<!-- Side-by-Side Compare Pane Container (New) -->
<div id="compareContainer" class="hidden flex-1 grid grid-cols-2 gap-4 h-full overflow-hidden">
  <!-- Left Side: Claude Client Payload -->
  <div class="flex flex-col border border-gray-800 rounded-xl bg-gray-900/10 overflow-hidden h-full">
    <div class="bg-gray-900/60 px-4 py-2 border-b border-gray-800 flex items-center justify-between text-xs text-indigo-400 font-bold uppercase select-none shrink-0">
      <span>Claude Payload (Client)</span>
    </div>
    <div id="compareLeftBody" class="flex-1 overflow-auto p-4 font-mono text-xs"></div>
  </div>
  
  <!-- Right Side: Gemini Upstream Payload -->
  <div class="flex flex-col border border-gray-800 rounded-xl bg-gray-900/10 overflow-hidden h-full">
    <div class="bg-gray-900/60 px-4 py-2 border-b border-gray-800 flex items-center justify-between text-xs text-emerald-400 font-bold uppercase select-none shrink-0">
      <span>Gemini Payload (Upstream)</span>
    </div>
    <div id="compareRightBody" class="flex-1 overflow-auto p-4 font-mono text-xs"></div>
  </div>
</div>
```

---

## 3. Two-Channel Rendering Controller Logic

We will expand `renderPayload()` inside the HTML's `<script>` tags to route logic to the twin-columns when `'compare'` is selected.

```javascript
function renderPayload() {
  const container = document.getElementById('payloadContainer');
  const compareContainer = document.getElementById('compareContainer');
  
  const leftBody = document.getElementById('compareLeftBody');
  const rightBody = document.getElementById('compareRightBody');

  if (activeTabs.primary === 'compare') {
    container.classList.add('hidden');
    compareContainer.classList.remove('hidden');

    leftBody.innerHTML = '';
    rightBody.innerHTML = '';

    const leftObj = activeTabs.direction === 'req' ? selectedLogData?.client_req : selectedLogData?.claude_res;
    const rightObj = activeTabs.direction === 'req' ? selectedLogData?.gem_req : selectedLogData?.gem_res;

    renderDualPane(leftBody, leftObj, 'claude');
    renderDualPane(rightBody, rightObj, 'gemini');
  } else {
    compareContainer.classList.add('hidden');
    container.classList.remove('hidden');

    // Original single rendering
    const obj = getCurrentPayloadObject();
    ...
  }
}
```

### 3.1 Adaptive Rendering support
`renderDualPane(targetContainer, payloadObj, channelType)`:
- If `activeTabs.format` is `'raw'`: Renders plain `<pre>` strings.
- If `activeTabs.format` is `'preview'`:
  - Detects if the object is a stream (via `isClaudeStream` or `isGeminiStream`). If so, runs `renderStreamView(targetContainer, payloadObj, isClaude)`.
  - Otherwise, directly appends recursive collapsible node trees `createJsonNode(null, payloadObj, true)`.

---

## 4. Key Translation Schema Highlighting

To help developers debug schema mutations instantly, we inject high-contrast markers during collapsible node creation.

### 4.1 Highlighting Rules in `createJsonNode`
- **System Instructions**:
  - In Claude pane: Highlight `"system"` keys with a purple shadow badge indicating `(Translated to System Instruction)`.
  - In Gemini pane: Highlight elements starting with `<system-reminder>` using a light purple frame label.
- **Tool definitions**:
  - In Claude pane: Highlight `"tools"` schemas.
  - In Gemini pane: Highlight `"functionDeclarations"` schemas with amber borders and helper text indicating `(JSON Schema translated to Upper-Case API types)`.

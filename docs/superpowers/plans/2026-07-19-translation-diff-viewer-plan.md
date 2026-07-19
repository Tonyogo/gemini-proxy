# Translation Diff Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Side-by-Side compare visualizer with a collapsible sidebar and schema highlights in the Log Viewer.

**Architecture:** Inject double-column layout grids, custom dual-channel router logic, and highlighted schema tags in `src/public/index.html`.

**Tech Stack:** Vanilla JavaScript, CSS, Tailwind CSS, Lucide Icons.

## Global Constraints
- Only frontend `src/public/index.html` should be modified.
- High-fidelity layout supporting 100% width on sidebar collapse.
- Proper Lucide icon rendering on all dynamic controls.

---

## Files To Be Created or Modified

- **Modify**:
  - `src/public/index.html`: Inject Level 1 Tab, Collapsible Sidebar icon/button, double column grid markup, `renderDualPane` router, and system/tools highlights inside `createJsonNode()`.

---

## Tasks

### Task 1: Implement Side-by-Side Compare Layout & Rendering Router

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consumes: `selectedLogData` with Request / Response payloads.
- Produces: 
  - Dynamic `[Compare]` tab in Level 1 navigation.
  - Sidebar collapse button `[◀/▶]`.
  - Side-by-Side compare panels.
  - `renderDualPane(target, data, channelType)` logic.
  - Custom schema highlighting inside `createJsonNode()`.

- [ ] **Step 1: Update UI layout with sidebar collapse & compare containers**

Modify `src/public/index.html`. We will insert the Collapse sidebar button, the Level 1 Tab, and the Side-by-Side `compareContainer` DOM nodes. 

Let's write out the HTML modification structure carefully:

**Sidebar Toggle Button Insertion**:
Find the header area and insert a toggle button to fold/unfold the sidebar.
```html
<!-- Inside Header on the left next to Refresh or Title, or directly above sidebar -->
<button id="toggleSidebarBtn" onclick="toggleSidebar()" class="bg-gray-800 hover:bg-gray-700 text-sm p-1.5 rounded border border-gray-700 transition" title="Toggle Sidebar">
  <i data-lucide="chevron-left" class="w-4 h-4" id="sidebarToggleIcon"></i>
</button>
```

**Level 1 Tabs update**:
Find the Tabs section and add:
```html
<button onclick="switchTab('primary', 'compare')" id="tab-primary-compare" class="border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-700 transition">Compare / 对比</button>
```

**Two-Column Grid Insertion**:
Add `compareContainer` right next to the original `payloadContainer` inside the JSON Display Area:
```html
<!-- Original: -->
<div id="payloadContainer" class="font-mono text-sm leading-relaxed"></div>

<!-- Add Next to it: -->
<div id="compareContainer" class="hidden flex-1 grid grid-cols-2 gap-6 h-full overflow-hidden min-h-[500px]">
  <!-- Left Side: Claude Client Payload -->
  <div class="flex flex-col border border-gray-800/80 rounded-xl bg-gray-950/40 overflow-hidden h-full">
    <div class="bg-gray-900/60 px-4 py-2 border-b border-gray-800/80 flex items-center justify-between text-xs text-indigo-400 font-bold uppercase select-none shrink-0">
      <span>Claude Payload (Client)</span>
      <span class="text-[10px] text-gray-500 font-mono font-normal">Anthropic Spec</span>
    </div>
    <div id="compareLeftBody" class="flex-1 overflow-auto p-4 font-mono text-xs"></div>
  </div>
  
  <!-- Right Side: Gemini Upstream Payload -->
  <div class="flex flex-col border border-gray-800/80 rounded-xl bg-gray-950/40 overflow-hidden h-full">
    <div class="bg-gray-900/60 px-4 py-2 border-b border-gray-800/80 flex items-center justify-between text-xs text-emerald-400 font-bold uppercase select-none shrink-0">
      <span>Gemini Payload (Upstream)</span>
      <span class="text-[10px] text-gray-500 font-mono font-normal">Google Spec</span>
    </div>
    <div id="compareRightBody" class="flex-1 overflow-auto p-4 font-mono text-xs"></div>
  </div>
</div>
```

- [ ] **Step 2: Implement Sidebar folding and Router controllers**

Add these methods to the `<script>` tag:

```javascript
    // Toggle Sidebar fold/unfold
    let sidebarCollapsed = false;
    function toggleSidebar() {
      const sidebar = document.querySelector('aside');
      const icon = document.getElementById('sidebarToggleIcon');
      sidebarCollapsed = !sidebarCollapsed;
      if (sidebarCollapsed) {
        sidebar.style.display = 'none';
        icon.setAttribute('data-lucide', 'chevron-right');
      } else {
        sidebar.style.display = 'flex';
        icon.setAttribute('data-lucide', 'chevron-left');
      }
      lucide.createIcons();
    }

    // Adaptive Dual Pane router
    function renderDualPane(targetContainer, payloadObj, channelType) {
      if (!payloadObj) {
        targetContainer.innerHTML = '<div class="text-gray-500 italic py-4">No content recorded for this section</div>';
        return;
      }

      if (activeTabs.format === 'raw') {
        targetContainer.innerHTML = `<pre class="bg-gray-950 p-4 border border-gray-800 rounded-lg text-gray-300 overflow-x-auto text-[11px] whitespace-pre">${JSON.stringify(payloadObj, null, 2)}</pre>`;
      } else {
        const isClaude = isClaudeStream(payloadObj);
        const isGemini = isGeminiStream(payloadObj);

        if (isClaude || isGemini) {
          renderStreamView(targetContainer, payloadObj, isClaude);
        } else {
          // Pass the channelType to createJsonNode to enable contextual highlights!
          targetContainer.appendChild(createJsonNode(null, payloadObj, true, channelType));
        }
      }
    }
```

- [ ] **Step 3: Modify `renderPayload()` and `createJsonNode()` for high-contrast highlighting**

Modify the existing `renderPayload()` in `index.html` to invoke Compare routing:
```javascript
    function renderPayload() {
      const container = document.getElementById('payloadContainer');
      const compareContainer = document.getElementById('compareContainer');
      const leftBody = document.getElementById('compareLeftBody');
      const rightBody = document.getElementById('compareRightBody');

      if (!selectedLogData) return;

      if (activeTabs.primary === 'compare') {
        container.classList.add('hidden');
        compareContainer.classList.remove('hidden');

        leftBody.innerHTML = '';
        rightBody.innerHTML = '';

        const leftObj = activeTabs.direction === 'req' ? selectedLogData.client_req : selectedLogData.claude_res;
        const rightObj = activeTabs.direction === 'req' ? selectedLogData.gem_req : selectedLogData.gem_res;

        renderDualPane(leftBody, leftObj, 'claude');
        renderDualPane(rightBody, rightObj, 'gemini');
      } else {
        compareContainer.classList.add('hidden');
        container.classList.remove('hidden');

        const obj = getCurrentPayloadObject();

        if (!obj) {
          container.innerHTML = '<div class="text-gray-500 italic py-4">No content recorded for this section</div>';
          return;
        }

        if (activeTabs.format === 'raw') {
          container.innerHTML = `<pre class="bg-gray-950 p-4 border border-gray-800 rounded-lg text-gray-300 overflow-x-auto text-xs whitespace-pre">${JSON.stringify(obj, null, 2)}</pre>`;
        } else {
          container.innerHTML = '';
          const isClaude = isClaudeStream(obj);
          const isGemini = isGeminiStream(obj);

          if (isClaude || isGemini) {
            renderStreamView(container, obj, isClaude);
          } else {
            // Default single viewer
            container.appendChild(createJsonNode(null, obj, true, activeTabs.primary));
          }
        }
      }
    }
```

Now, update `createJsonNode(key, value, isLast, channelType)` signature and add highlight annotations based on `channelType` inside the tree rendering blocks:
```javascript
    function createJsonNode(key, value, isLast, channelType = null) {
      const container = document.createElement('div');
      container.className = 'pl-4 py-0.5 border-l border-gray-900 hover:bg-gray-800/10 transition-colors relative font-mono text-xs text-gray-300';

      // Check special highlight annotations based on Channel (Claude vs Gemini)
      let highlightClass = '';
      let badgeHtml = '';

      if (key && channelType) {
        if (channelType === 'claude') {
          if (key === 'system') {
            highlightClass = 'bg-purple-950/10 border-l-2 border-purple-500 pl-1 rounded-r pr-2 py-0.5 shadow-sm shadow-purple-500/10';
            badgeHtml = ' <span class="bg-purple-500/15 text-purple-300 text-[9px] px-1.5 py-0.5 rounded ml-1 font-sans border border-purple-500/20 font-semibold">→ System Instruction</span>';
          } else if (key === 'tools') {
            highlightClass = 'bg-amber-950/10 border-l-2 border-amber-500 pl-1 rounded-r pr-2 py-0.5 shadow-sm shadow-amber-500/10';
            badgeHtml = ' <span class="bg-amber-500/15 text-amber-300 text-[9px] px-1.5 py-0.5 rounded ml-1 font-sans border border-amber-500/20 font-semibold">→ Tool Definitions</span>';
          }
        } else if (channelType === 'gemini') {
          if (key === 'systemInstruction') {
            highlightClass = 'bg-purple-950/10 border-l-2 border-purple-500 pl-1 rounded-r pr-2 py-0.5 shadow-sm shadow-purple-500/10';
            badgeHtml = ' <span class="bg-purple-500/15 text-purple-300 text-[9px] px-1.5 py-0.5 rounded ml-1 font-sans border border-purple-500/20 font-semibold">← System Wrapper</span>';
          } else if (key === 'functionDeclarations') {
            highlightClass = 'bg-amber-950/10 border-l-2 border-amber-500 pl-1 rounded-r pr-2 py-0.5 shadow-sm shadow-amber-500/10';
            badgeHtml = ' <span class="bg-amber-500/15 text-amber-300 text-[9px] px-1.5 py-0.5 rounded ml-1 font-sans border border-amber-500/20 font-semibold">← upperCase Schemas</span>';
          }
        }
      }

      // Add wrapper highlighting class if active
      if (highlightClass) {
        container.className += ' ' + highlightClass;
      }

      const keySpan = key ? `<span class="text-indigo-400">"${key}"</span>${badgeHtml}: ` : '';

      if (value === null) {
        container.innerHTML = `${keySpan}<span class="text-gray-500 font-bold">null</span>${isLast ? '' : ','}`;
      } else if (typeof value === 'object') {
        const isArray = Array.isArray(value);
        const size = isArray ? value.length : Object.keys(value).length;
        const bracketOpen = isArray ? '[' : '{';
        const bracketClose = isArray ? ']' : '}';

        const summarySpan = document.createElement('span');
        summarySpan.className = 'cursor-pointer select-none font-semibold hover:text-white flex items-center inline-flex';
        summarySpan.innerHTML = `
          <span class="mr-1 text-gray-500 text-[10px] transform transition-transform duration-100 collapse-arrow inline-block">▶</span>
          ${keySpan}${bracketOpen} <span class="text-[10px] text-gray-500 font-normal ml-1">(${size} ${isArray ? 'items' : 'keys'})</span>
        `;

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'hidden pl-4 border-l border-gray-800/50 mt-0.5 space-y-0.5';

        // Lazy-render children
        let rendered = false;
        summarySpan.onclick = () => {
          const arrow = summarySpan.querySelector('.collapse-arrow');
          if (childrenContainer.classList.contains('hidden')) {
            childrenContainer.classList.remove('hidden');
            arrow.style.transform = 'rotate(90deg)';
            if (!rendered) {
              const keys = Object.keys(value);
              keys.forEach((k, i) => {
                childrenContainer.appendChild(createJsonNode(isArray ? null : k, value[k], i === keys.length - 1, channelType));
              });
              rendered = true;
            }
          } else {
            childrenContainer.classList.add('hidden');
            arrow.style.transform = 'rotate(0deg)';
          }
        };

        const closingSpan = document.createElement('div');
        closingSpan.className = 'text-gray-400';
        closingSpan.innerHTML = `${bracketClose}${isLast ? '' : ','}`;

        container.appendChild(summarySpan);
        container.appendChild(childrenContainer);
        container.appendChild(closingSpan);

      } else {
        let valSpan = '';
        if (typeof value === 'string') {
          // Highlight string representation of system-reminder system instruction inside Gemini
          let stringHighlight = '';
          if (channelType === 'gemini' && value.includes('<system-reminder>')) {
            stringHighlight = 'bg-purple-950/20 px-1 py-0.5 rounded border border-purple-800/40 inline-block font-mono text-[11px]';
          }
          valSpan = `<span class="text-emerald-400 ${stringHighlight}">"${value.replace(/"/g, '\\"')}"</span>`;
        } else if (typeof value === 'number') {
          valSpan = `<span class="text-amber-500">${value}</span>`;
        } else if (typeof value === 'boolean') {
          valSpan = `<span class="text-orange-400 font-bold">${value}</span>`;
        }
        container.innerHTML = `${keySpan}${valSpan}${isLast ? '' : ','}`;
      }

      return container;
    }
```

- [ ] **Step 4: Build project and verify no compilation errors**

Run: `npm run build`
Expected: Success

- [ ] **Step 5: Commit**

```bash
git add src/public/index.html
git commit -m "feat: add Side-by-Side compare tab, sidebar collapsible toggle, and schema-transformation highlighters" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Execution Choice Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-translation-diff-viewer-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

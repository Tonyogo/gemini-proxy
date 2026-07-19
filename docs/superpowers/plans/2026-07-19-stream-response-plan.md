# Stream Response Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement front-end smart parsing and timeline accordion rendering for SSE streams (Claude) and object array streams (Gemini) in the Proxy Log Viewer.

**Architecture:** Integrate JS detection, parsing, content reassembly, and collapsible timeline DOM generation directly inside `src/public/index.html` as purely client-side rendering updates.

**Tech Stack:** Vanilla JavaScript ES6, Tailwind CSS, Lucide Icons.

## Global Constraints
- Pure front-end (browser runtime) execution.
- High-fidelity visual styling aligning with existing tailwind dark layout.
- Path traversal protection remains active.

---

## Files To Be Created or Modified

- **Modify**:
  - `src/public/index.html`: Append stream identification heuristics, reassembly, and Timeline row generator functions.

---

## Tasks

### Task 1: Integrate Stream Parsers & Timeline UI Generator inside `index.html`

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consumes: Raw payload response objects/arrays.
- Produces: 
  - `isClaudeStream(arr)`, `isGeminiStream(arr)`
  - `renderStreamTimeline(arr, isClaude)`
  - Beautiful aggregated AI text output box.

- [ ] **Step 1: Write Stream Helpers & DOM Timelines rendering logic**

Read `src/public/index.html` and inject the stream helper functions into the `<script>` tag. Specifically, we will replace the `renderPayload()` logic and append the helper methods.

Here is the exact code to be added inside the script area:

```javascript
    // Heuristics
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

    // Helper to extract SSE data
    function parseClaudeSSELine(line) {
      const trimmed = line.trim();
      if (!trimmed) return null;
      
      const result = { event: 'data', data: null };
      const lines = trimmed.split('\n');
      for (const l of lines) {
        if (l.startsWith('event:')) {
          result.event = l.substring(6).trim();
        } else if (l.startsWith('data:')) {
          const jsonStr = l.substring(5).trim();
          try {
            result.data = JSON.parse(jsonStr);
          } catch (e) {
            result.data = jsonStr; // fallback to raw string if not JSON
          }
        }
      }
      return result;
    }

    // Reassemble full text and compile list of stream frame representations
    function compileStreamDetails(arr, isClaude) {
      let mergedText = '';
      const frames = [];

      if (isClaude) {
        arr.forEach((item, index) => {
          if (typeof item !== 'string') return;
          const parsed = parseClaudeSSELine(item);
          if (!parsed) return;

          let snippet = '';
          let typeClass = 'bg-blue-500/10 text-blue-300 border-blue-500/20';
          
          if (parsed.event === 'content_block_delta' && parsed.data?.delta?.text) {
            const txt = parsed.data.delta.text;
            mergedText += txt;
            snippet = `+ "${txt.replace(/\n/g, '\\n')}"`;
            typeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
          } else if (parsed.data?.completion) {
            // legacy Claude completions text streams
            const txt = parsed.data.completion;
            mergedText += txt;
            snippet = `+ "${txt.replace(/\n/g, '\\n')}"`;
            typeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
          } else {
            snippet = parsed.data?.type || parsed.event;
            typeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
          }

          frames.push({
            index,
            event: parsed.event,
            snippet,
            typeClass,
            payload: parsed.data || parsed
          });
        });
      } else {
        // Gemini
        arr.forEach((item, index) => {
          let snippet = '';
          let typeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
          
          const partText = item.candidates?.[0]?.content?.parts?.[0]?.text;
          if (partText) {
            mergedText += partText;
            snippet = `+ "${partText.replace(/\n/g, '\\n')}"`;
          } else {
            snippet = 'metadata / usage / promptFeedback';
            typeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
          }

          frames.push({
            index,
            event: partText ? 'text_delta' : 'metadata',
            snippet,
            typeClass,
            payload: item
          });
        });
      }

      return { mergedText, frames };
    }

    // Render SSE Stream view
    function renderStreamView(container, arr, isClaude) {
      const { mergedText, frames } = compileStreamDetails(arr, isClaude);

      // Create AI Response Merged Preview Bubble
      const chatBubbleHtml = `
        <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-6 shadow-md relative">
          <div class="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <i data-lucide="bot" class="w-4 h-4 text-indigo-400"></i> AI Response Merged Preview
            </div>
            <button onclick="navigator.clipboard.writeText(\`${mergedText.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`).then(() => alert('Copied text!'))" class="text-xs text-slate-500 hover:text-white transition flex items-center gap-1">
              <i data-lucide="copy" class="w-3 h-3"></i> Copy Text
            </button>
          </div>
          <div class="whitespace-pre-wrap font-sans text-gray-200 text-sm leading-relaxed">${mergedText || '<span class="text-gray-500 italic">No text content returned in stream</span>'}</div>
        </div>
      `;

      // Timeline Title
      const timelineHeaderHtml = `
        <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <i data-lucide="git-commit" class="w-4 h-4"></i> Timeline Chunks (${frames.length} frames)
        </div>
      `;

      const timelineContainer = document.createElement('div');
      timelineContainer.className = 'space-y-2';

      frames.forEach(frame => {
        const row = document.createElement('div');
        row.className = 'bg-gray-900/30 border border-gray-800/50 rounded-lg overflow-hidden transition-all duration-150';

        row.innerHTML = `
          <div class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:bg-gray-800/20" id="stream-row-trigger-${frame.index}">
            <div class="flex items-center gap-3 truncate">
              <span class="font-mono text-gray-600 text-[10px]">#${frame.index + 1}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full border font-semibold truncate ${frame.typeClass}">${frame.event}</span>
              <span class="font-mono text-xs text-gray-400 truncate">${frame.snippet}</span>
            </div>
            <i data-lucide="chevron-right" class="w-4 h-4 text-gray-500 transition-transform duration-100 stream-arrow"></i>
          </div>
          <div class="hidden border-t border-gray-900 p-4 bg-gray-950/40" id="stream-row-content-${frame.index}"></div>
        `;

        // Interactive toggle nested payload tree
        const trigger = row.querySelector(`#stream-row-trigger-${frame.index}`);
        const content = row.querySelector(`#stream-row-content-${frame.index}`);
        const arrow = row.querySelector('.stream-arrow');

        let isRendered = false;
        trigger.onclick = () => {
          if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            arrow.style.transform = 'rotate(90deg)';
            if (!isRendered) {
              content.appendChild(createJsonNode(null, frame.payload, true));
              isRendered = true;
            }
          } else {
            content.classList.add('hidden');
            arrow.style.transform = 'rotate(0deg)';
          }
        };

        timelineContainer.appendChild(row);
      });

      const wrapper = document.createElement('div');
      wrapper.innerHTML = chatBubbleHtml + timelineHeaderHtml;
      wrapper.appendChild(timelineContainer);
      container.appendChild(wrapper);

      lucide.createIcons();
    }
```

- [ ] **Step 2: Update `renderPayload()` handler logic to check streams**

Modify `renderPayload()` in `src/public/index.html` to identify streams and routing to `renderStreamView()`:

```javascript
    function renderPayload() {
      const container = document.getElementById('payloadContainer');
      const obj = getCurrentPayloadObject();

      if (!obj) {
        container.innerHTML = '<div class="text-gray-500 italic py-4">No content recorded for this section</div>';
        return;
      }

      if (activeTabs.format === 'raw') {
        // Raw view
        container.innerHTML = `<pre class="bg-gray-950 p-4 border border-gray-800 rounded-lg text-gray-300 overflow-x-auto text-xs whitespace-pre">${JSON.stringify(obj, null, 2)}</pre>`;
      } else {
        // Interactive Preview view
        container.innerHTML = '';
        
        // CHECK IF OBJECT IS STREAM
        const isClaude = isClaudeStream(obj);
        const isGemini = isGeminiStream(obj);

        if (isClaude || isGemini) {
          renderStreamView(container, obj, isClaude);
        } else {
          container.appendChild(createJsonNode(null, obj, true));
        }
      }
    }
```

- [ ] **Step 3: Build and verify compilation is clean**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/public/index.html
git commit -m "feat: implement smart parsing and beautiful Timeline accordion visualizer for stream response logs" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Execution Choice Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-stream-response-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

# Design Spec: Compact Sidebar Redesign (VS Code Style High-Density Rows)

This design specification details the layout restructuring, DOM/CSS changes, and parsing refactoring required to replace the existing tall sidebar cards with a highly optimized, single-row high-density request list.

## 1. Goal

Currently, each log card in the sidebar spans three vertical rows, with excessive padding and repetitive model prefix strings. This limits vertical visibility to roughly 10 logs per viewport, forcing developers to scroll continuously to check translation patterns across adjacent transactions.

We will introduce a **Compact Sidebar View** styled after the VS Code File Explorer and Chrome's Network Tab. We will:
- Shrink default sidebar width from `w-80` to `w-72` to prioritize horizontal dual-column space.
- Flatten list items to a single line using micro-paddings (`py-1.5 px-3`) and a single row of variables.
- Shorten log IDs to their random suffix segment (e.g. `_maneq3z6m`) and truncate model names to their core features.
- Provide a hover tooltip (HTML `title`) carrying the fully qualified metadata (full timestamp, absolute log ID, and full model name) to preserve context.

---

## 2. Layout & Styles Modification

We will modify `src/public/index.html` to integrate high-density spacing.

### 2.1 Refactoring Sidebar HTML Structure
```html
<!-- Reduce parent aside width to w-72 -->
<aside class="w-72 bg-gray-900 border-r border-gray-800 flex flex-col h-full shrink-0">
  <!-- Squeeze filter inputs padding -->
  <div class="p-3 border-b border-gray-800 flex gap-2 items-center shrink-0">
    <div class="relative flex-1">
      <input type="text" id="logSearch" oninput="filterLogs()" placeholder="Filter logs..." class="w-full bg-gray-950 text-xs pl-8 pr-3 py-1.5 rounded border border-gray-800 focus:outline-none focus:border-indigo-500 text-gray-200">
      <i data-lucide="search" class="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-500"></i>
    </div>
    <!-- Incorporate sidebar collapse cleanly here to clean header -->
    <button id="toggleSidebarBtn" onclick="toggleSidebar()" class="bg-gray-800 hover:bg-gray-700 p-1.5 rounded border border-gray-700 transition" title="Toggle Sidebar">
      <i data-lucide="chevron-left" class="w-3.5 h-3.5" id="sidebarToggleIcon"></i>
    </button>
  </div>
  <div id="logsList" class="flex-1 overflow-y-auto divide-y divide-gray-800/30">
    <div class="p-4 text-center text-gray-500 text-xs">Loading logs...</div>
  </div>
</aside>
```

---

## 3. High-Density Single Line Item Rendering

We will rewrite `renderLogsList()` inside `<script>` blocks in `index.html`.

### 3.1 Template Refactor
Instead of mapping separate divs for timestamps, models, and IDs, we layout a single-row flex bar:
```javascript
function renderLogsList() {
  const container = document.getElementById('logsList');
  if (logsList.length === 0) {
    container.innerHTML = '<div class="p-4 text-center text-gray-500 text-xs">No transaction logs found</div>';
    return;
  }

  container.innerHTML = logsList.map(log => {
    // Extract HH:MM:SS
    const timeParts = log.time.split(' ');
    const displayTime = timeParts[1] || log.time;

    // Short ID (extract segment after underscore)
    const displayId = log.id.includes('_') ? '_' + log.id.split('_')[1] : log.id.slice(-8);

    // Short model identifier (strip redundant gemini- or gemini-3.1- prefixes)
    const displayModel = log.model.replace('gemini-3.1-', '').replace('gemini-', '');

    return `
      <div onclick="selectLog('${log.id}')" 
           id="log-item-${log.id}" 
           title="Time: ${log.time}\nFull ID: ${log.id}\nModel: ${log.model}"
           class="px-3 py-1.5 hover:bg-gray-800/40 cursor-pointer border-l-2 border-transparent transition flex items-center justify-between text-xs font-mono">
        <div class="flex items-center gap-2 truncate">
          <span class="text-gray-500 text-[11px]">${displayTime}</span>
          <span class="text-gray-300 font-semibold select-all">${displayId}</span>
        </div>
        <span class="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1 py-0.2 rounded uppercase font-bold shrink-0">
          ${displayModel}
        </span>
      </div>
    `;
  }).join('');

  lucide.createIcons();
  filterLogs();
}
```

### 3.2 Visual Selection Refactor
Since we modified class names and paddings, selection highlighter must target `border-l-2` instead of `border-l-4`:
```javascript
async function selectLog(id) {
  selectedLog = id;

  // Clear previous highlights
  document.querySelectorAll('#logsList > div').forEach(el => {
    el.classList.remove('bg-gray-800/60', 'border-indigo-500');
    el.classList.add('border-transparent');
  });
  
  // Highlight active
  const selectedEl = document.getElementById(`log-item-${id}`);
  if (selectedEl) {
    selectedEl.classList.add('bg-gray-800/60', 'border-indigo-500');
    selectedEl.classList.remove('border-transparent');
  }
  ...
}
```

---

## 4. Verification

1. **Horizontal Space Health Check**: Ensure that default width of `w-72` matches CSS specifications and provides wider split channels.
2. **Integration Verification**: Verify that searching & filtering still targets log ID and model properties cleanly.
3. **Build Integrity**: Ensure `npm run build` is executed and resolves with zero errors.

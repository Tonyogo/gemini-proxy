# Compact Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the sidebar in the Log Viewer to use ultra-compact single-line rows, showing up to 35 logs at once instead of 10.

**Architecture:** Refactor CSS width classes, inputs padding, and rewrite the JavaScript loop in `renderLogsList` inside `src/public/index.html`.

**Tech Stack:** Vanilla JavaScript ES6, Tailwind CSS, Lucide Icons.

## Global Constraints
- Only frontend `src/public/index.html` should be modified.
- Full ID, full timestamp, and absolute model names must be kept on HTML hover tooltip `title` properties.

---

## Files To Be Created or Modified

- **Modify**:
  - `src/public/index.html`: Update parent aside spacing to `w-72`, rewrite `renderLogsList()` template string, and update element selection highlighters inside `selectLog()`.

---

## Tasks

### Task 1: Refactor Sidebar HTML Layout and CSS Spacing

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consumes: `<aside>` layout container.
- Produces: `w-72` high-density sidebar with tight paddings.

- [ ] **Step 1: Shrink Aside parent width to `w-72`**

Locate the sidebar `aside` container in `src/public/index.html` and change its classes.
```html
<!-- Replace: -->
<aside class="w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-full shrink-0">

<!-- With: -->
<aside class="w-72 bg-gray-900 border-r border-gray-800 flex flex-col h-full shrink-0">
```

- [ ] **Step 2: Compress padding around filter inputs**

Locate the search block inside the `aside` container and rewrite to compress padding and height:
```html
<!-- Replace the existing search block: -->
      <div class="p-4 border-b border-gray-800">
        <div class="relative">
          <input type="text" id="logSearch" oninput="filterLogs()" placeholder="Filter logs..." class="w-full bg-gray-950 text-sm pl-9 pr-4 py-2 rounded border border-gray-800 focus:outline-none focus:border-indigo-500 text-gray-200">
          <i data-lucide="search" class="absolute left-3 top-2.5 w-4 h-4 text-gray-500"></i>
        </div>
      </div>

<!-- With: -->
      <div class="p-3 border-b border-gray-800 flex gap-2 items-center shrink-0">
        <div class="relative flex-1">
          <input type="text" id="logSearch" oninput="filterLogs()" placeholder="Filter logs..." class="w-full bg-gray-950 text-xs pl-8 pr-3 py-1.5 rounded border border-gray-800 focus:outline-none focus:border-indigo-500 text-gray-200">
          <i data-lucide="search" class="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-500"></i>
        </div>
        <button id="toggleSidebarBtn" onclick="toggleSidebar()" class="bg-gray-800 hover:bg-gray-700 p-1.5 rounded border border-gray-700 transition" title="Toggle Sidebar">
          <i data-lucide="chevron-left" class="w-3.5 h-3.5" id="sidebarToggleIcon"></i>
        </button>
      </div>
```

*(Note: Clean up any old occurrences of the `toggleSidebarBtn` button inside the details panel header so it lives exclusively on the compact sidebar. If there is a `toggleSidebarBtn` inside main main area header, remove or adapt it).*

---

### Task 2: Rewrite `renderLogsList` and High-Density Selection

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consumes: JSON list of logs retrieved from `/admin/api/logs`.
- Produces:
  - High-density single-line rows with title hover cards.
  - Correct `border-l-2` active selection highlights.

- [ ] **Step 1: Rewrite `renderLogsList` mapping function**

Locate the `renderLogsList()` definition in the JavaScript blocks of `src/public/index.html` and replace it with:
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

- [ ] **Step 2: Update active item class highlighting**

Locate `selectLog()` and ensure the visual selection reset and border matches the new `border-l-2` specification:
```javascript
    async function selectLog(id) {
      selectedLog = id;

      // Update sidebar visual selection
      document.querySelectorAll('#logsList > div').forEach(el => {
        el.classList.remove('bg-gray-800/60', 'border-indigo-500');
        el.classList.add('border-transparent');
      });
      const selectedEl = document.getElementById(`log-item-${id}`);
      if (selectedEl) {
        selectedEl.classList.add('bg-gray-800/60', 'border-indigo-500');
        selectedEl.classList.remove('border-transparent');
      }
      ...
```

- [ ] **Step 3: Test compilation stability**

Run: `npm run build`
Expected: Success with no typescript errors.

- [ ] **Step 4: Commit**

```bash
git add src/public/index.html
git commit -m "feat: redesign log list to use ultra-compact high-density rows" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Execution Choice Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-compact-sidebar-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

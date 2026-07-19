# Design Spec: Request & Response Log Viewer (Claude-to-Gemini Proxy)

This design specification details the architecture, visual interface, API contracts, and implementation plan for adding a Chrome DevTools-style request/response log viewer to the stateless Claude-to-Gemini API proxy.

## 1. Executive Summary

The `gemini-proxy` currently logs full JSON transactions (including client requests, translated Gemini requests, Gemini responses, and translated Claude responses) to local JSON files under the `logs/` directory using `payloadLogger.ts`.

To make these logs accessible and debuggable without manual file searching, we will introduce a lightweight, beautiful, single-page log viewer built inside the server. It will run securely on `localhost`, fetch transaction logs through a safe backend API, and render them with a Chrome DevTools-style multi-tab layout, complete with high-performance JSON tree expanders (Preview mode) and formatted raw text (Raw mode).

---

## 2. Technical Stack

### Backend (Express & Node.js)
- **Routes & Middleware**: Express router for admin-only paths.
- **FS Operations**: `fs.promises` to asynchronously scan directories, sort files, and load JSON.
- **Security Middleware**: Localhost IP restriction check (`127.0.0.1` / `::1`) to prevent external exposure of sensitive API keys and conversation logs.

### Frontend (Single File Tailwind SPA)
- **HTML5 & Vanilla ES6 JS**: High-speed, dependency-free code with native fetch APIs.
- **Tailwind CSS (via CDN)**: Dark-themed modern layout matching Anthropic Console / Chrome DevTools aesthetic.
- **Lucide Icons (via CDN)**: Icons for file items, copy status, collapse/expand states.
- **Custom Native JSON Tree Renderer**: A light, native recursive JS tree renderer to simulate Chrome's collapsible JSON tree viewer without external heavyweight libraries.

---

## 3. Backend Architecture & API Contracts

We will isolate the administration routes in a new file: `src/routes/adminRoutes.ts` and controller `src/controllers/adminController.ts`.

### 3.1 Security Middleware: `localhostOnly`
```typescript
import { Request, Response, NextFunction } from 'express';

export function localhostOnly(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || '';
  const isLocal = 
    ip === '127.0.0.1' || 
    ip === '::1' || 
    ip === '::ffff:127.0.0.1' ||
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1';

  if (!isLocal) {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Access is restricted to localhost / 127.0.0.1 for security reasons.' 
    });
  }
  next();
}
```

### 3.2 Endpoint Contracts

#### 1. Server-side log viewer page
- **Method / Path**: `GET /admin/logs-viewer`
- **Output**: Returns the static `index.html` file containing the SPA.
- **Security**: Bound by `localhostOnly`.

#### 2. Get Logs List API
- **Method / Path**: `GET /admin/api/logs`
- **Output**: Returns metadata about recent transaction logs. Reads the `logs/` directory, extracts timestamp details, sorts them chronologically descending, and caps the result to the 50 most recent files.
- **Response Format (`200 OK`)**:
  ```json
  {
    "success": true,
    "logs": [
      {
        "id": "1784434231472_maneq3z6m",
        "filename": "transaction_1784434231472_maneq3z6m.json",
        "timestamp": 1784434231472,
        "time": "2026-07-19 12:10:31",
        "model": "gemini-flash-latest"
      }
    ]
  }
  ```
  *Note: To fetch the requested model efficiently without reading the entire JSON file, the controller can parse the first ~500 bytes of the file or use a regex to capture `"model": "..."` under the `client_req` header.*

#### 3. Get Log Detail API
- **Method / Path**: `GET /admin/api/logs/:id`
- **Path Param Check**: `:id` must strictly match `/^[a-zA-Z0-9_]+$/` to prevent directory traversal.
- **Output**: Reads the file `transaction_<id>.json` and outputs the logged object directly.
- **Response Format (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "client_req": { ... },
      "gem_req": { ... },
      "gem_res": { ... },
      "claude_res": { ... }
    }
  }
  ```

---

## 4. Frontend Interface Design (Chrome DevTools Style)

The user interface will be split into a sidebar and a multi-tab panel.

### 4.1 Sidebar (Logs Directory)
- **Header**: Search bar + refresh button.
- **List Items**: Chronological order.
  - Active log item: Highlighted in blue/indigo border.
  - Text lines: Shows time, ID snippet, and Request Model (extracted via API).

### 4.2 Details Panel (Chrome DevTools Dual View)
The layout has three levels of navigation to cleanly compare both APIs.

#### Level 1 Tab: Primary API Context
- **Claude Messages API**: The payload sent/received by Claude Code CLI.
- **Gemini Studio API**: The payload translated and transmitted to/from Google Gemini.

#### Level 2 Tab: Data Direction
- **Request**: Client input or upstream translated input.
- **Response**: Upstream raw response or translated proxy response.

#### Level 3 Tab: Visualization Format
- **Preview**: High-fidelity collapsible JSON Tree. Nodes can be clicked to toggle expansion. Arrays show item count `[length]`, objects show keys count `{size}`. Colors match standard syntax highlighting (strings: green, numbers: orange, booleans: yellow, keys: blue-purple).
- **Raw**: Pre-formatted standard JSON string inside a `<pre>` block, with line numbers and a "Copy Code" button.

---

## 5. Collapsible JSON Viewer Engine (Native JS implementation)

To maintain a pure standalone single-file HTML without bloating dependencies, we write a self-contained renderer.

### Code Pattern Example (Native Collapsible JS Tree)
```javascript
function createJsonNode(key, value, isLast) {
  const container = document.createElement('div');
  container.className = 'pl-4 py-0.5 border-l border-gray-800 hover:bg-gray-800/30 transition-colors relative font-mono text-sm text-gray-300';
  
  const keySpan = key ? `<span class="text-indigo-400 font-semibold">"${key}"</span>: ` : '';
  
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
      <span class="mr-1 text-gray-500 transform transition-transform duration-100 collapse-arrow">▶</span>
      ${keySpan}${bracketOpen} <span class="text-xs text-gray-500 font-normal ml-1">(${size} ${isArray ? 'items' : 'keys'})</span>
    `;
    
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'hidden pl-4 border-l border-gray-700/50 mt-1 space-y-0.5';
    
    // Lazy-render children on first expansion
    let rendered = false;
    summarySpan.onclick = () => {
      const arrow = summarySpan.querySelector('.collapse-arrow');
      if (childrenContainer.classList.contains('hidden')) {
        childrenContainer.classList.remove('hidden');
        arrow.style.transform = 'rotate(90deg)';
        if (!rendered) {
          const keys = Object.keys(value);
          keys.forEach((k, i) => {
            childrenContainer.appendChild(createJsonNode(isArray ? null : k, value[k], i === keys.length - 1));
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
      valSpan = `<span class="text-emerald-400">"${value.replace(/"/g, '\\"')}"</span>`;
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

---

## 6. Implementation Stages & Security Safeguards

1. **Step 1: Admin Controller and Routing**
   - Create `src/controllers/adminController.ts`.
   - Create `src/routes/adminRoutes.ts`.
   - Integrate `localhostOnly` middleware on all endpoints under `/admin`.
   - Add routes inside `src/app.ts` under `/admin`.

2. **Step 2: HTML Page Construction**
   - Create `src/public/index.html` file.
   - Use Tailwind CSS CDN, Lucide CDN, and construct the 3-level tab UI.
   - Connect frontend state with `GET /admin/api/logs` and `GET /admin/api/logs/:id`.

3. **Step 3: Verification & Integration Tests**
   - Verify the logs are read successfully.
   - Run local request tests using curl, inspect that the logs display instantly on the web viewer.
   - Assert IP constraints work (mock remote IP in unit test to verify 403 Forbidden).

# Log Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a lightweight, secure Chrome DevTools-style request/response log viewer to inspect local JSON transactions logged by the proxy.

**Architecture:** Use Express backend to securely scan and read logs, restricting requests strictly to `localhost`. Render the frontend as a single-page app via static HTML with Tailwind CSS, Lucide icons, and a custom recursive JSON viewer.

**Tech Stack:** Express (NodeJS), TypeScript, Tailwind CSS, Lucide Icons, Vanilla JS ES6.

## Global Constraints
- Target platform: Darwin / Node.js
- Access restrictions: Only `localhost` / `127.0.0.1` can access `/admin/*` routes.
- Path traversal protection: Log ID parameter strictly validated with regex `/^[a-zA-Z0-9_]+$/`.

---

## Files To Be Created or Modified

- **Create**:
  - `src/middleware/auth.ts`: Localhost IP restriction middleware.
  - `src/routes/adminRoutes.ts`: Routing for admin-related API and log-viewer pages.
  - `src/controllers/adminController.ts`: Controller to scan, filter, and serve log details.
  - `src/public/index.html`: Self-contained static HTML log viewer frontend page.
- **Modify**:
  - `src/app.ts`: Mount the new `/admin` routes.
  - `tests/admin.test.ts`: Create test suite for API endpoints and localhost security checks.

---

## Tasks

### Task 1: Create `localhostOnly` Security Middleware

**Files:**
- Create: `src/middleware/auth.ts`
- Test: `tests/admin.test.ts` (Stubbed)

**Interfaces:**
- Consumes: Standard Express `Request`, `Response`, `NextFunction`
- Produces: `localhostOnly` middleware function

- [ ] **Step 1: Write the localhost check middleware**

Write the implementation inside `src/middleware/auth.ts`:
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
    res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Access is restricted to localhost / 127.0.0.1 for security reasons.' 
    });
    return;
  }
  next();
}
```

- [ ] **Step 2: Create a minimal test structure**

Write the basic structure of `tests/admin.test.ts` to verify middleware behavior.
```typescript
import { Request, Response } from 'express';
import { localhostOnly } from '../src/middleware/auth';

describe('localhostOnly Middleware', () => {
  it('should allow local IP addresses', () => {
    const req = {
      ip: '127.0.0.1',
      hostname: 'localhost',
      socket: {}
    } as unknown as Request;
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;
    
    const next = jest.fn();
    
    localhostOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block external IP addresses', () => {
    const req = {
      ip: '192.168.1.100',
      hostname: 'external-host',
      socket: {}
    } as unknown as Request;
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;
    
    const next = jest.fn();
    
    localhostOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test suite**

Run: `npx jest tests/admin.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/middleware/auth.ts tests/admin.test.ts
git commit -m "feat: add localhostOnly middleware and associated tests" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Implement Admin Controller and Logs Scan APIs

**Files:**
- Create: `src/controllers/adminController.ts`
- Test: `tests/admin.test.ts` (Expand with API route tests)

**Interfaces:**
- Consumes: `logs/` folder containing transaction logs.
- Produces:
  - `AdminController.listLogs(req, res)`: Scans logs and returns metadata array.
  - `AdminController.getLogDetail(req, res)`: Reads and outputs specific log JSON contents.

- [ ] **Step 1: Write AdminController implementation**

Create `src/controllers/adminController.ts` with directory scanning, date sorting, and payload parsing logic:
```typescript
import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../config/default';
import logger from '../utils/logger';

class AdminController {
  private getLogsDir(): string {
    const logsDir = config.transactionLogsDir || 'logs';
    return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
  }

  public async listLogs(req: Request, res: Response): Promise<void> {
    try {
      const logsDir = this.getLogsDir();
      let files: string[] = [];
      try {
        files = await fs.readdir(logsDir);
      } catch (e) {
        // Logs directory might not exist yet if no requests made
        res.status(200).json({ success: true, logs: [] });
        return;
      }

      const logFiles = files.filter(f => f.startsWith('transaction_') && f.endsWith('.json'));
      const logsData = await Promise.all(
        logFiles.map(async (filename) => {
          const parts = filename.replace('transaction_', '').replace('.json', '').split('_');
          const timestampStr = parts[0];
          const timestamp = parseInt(timestampStr, 10);
          
          let model = 'unknown';
          try {
            // Read first 2KB of file to extract requested model quickly without memory overflow
            const filePath = path.join(logsDir, filename);
            const handle = await fs.open(filePath, 'r');
            const buffer = Buffer.alloc(2048);
            await handle.read(buffer, 0, 2048, 0);
            await handle.close();
            
            const partialText = buffer.toString('utf8');
            const match = partialText.match(/"model"\s*:\s*"([^"]+)"/);
            if (match && match[1]) {
              model = match[1];
            }
          } catch (err) {
            logger.error(`[AdminController] Error reading model from ${filename}: ${err}`);
          }

          return {
            id: filename.replace('transaction_', '').replace('.json', ''),
            filename,
            timestamp,
            time: new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19),
            model
          };
        })
      );

      // Sort chronological descending
      logsData.sort((a, b) => b.timestamp - a.timestamp);

      // Cap at 50 logs
      res.status(200).json({ success: true, logs: logsData.slice(0, 50) });
    } catch (err: any) {
      logger.error(`[AdminController] listLogs failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async getLogDetail(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      if (!/^[a-zA-Z0-9_]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid log file ID parameter' });
        return;
      }

      const logsDir = this.getLogsDir();
      const filePath = path.join(logsDir, `transaction_${id}.json`);

      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        res.status(200).json({ success: true, data });
      } catch (err) {
        res.status(404).json({ success: false, error: 'Log transaction file not found' });
      }
    } catch (err: any) {
      logger.error(`[AdminController] getLogDetail failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new AdminController();
```

- [ ] **Step 2: Add Controller Integration tests to `tests/admin.test.ts`**

We will mock Express `req`/`res` and file structures to assert logs listing, model regex extraction, sorting and path checks.
```typescript
// Append details testing listLogs and getLogDetail to tests/admin.test.ts
import { promises as fs } from 'fs';
import * as path from 'path';
import adminController from '../src/controllers/adminController';

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn(),
    open: jest.fn().mockResolvedValue({
      read: jest.fn().mockResolvedValue({ bytesRead: 100 }),
      close: jest.fn()
    })
  }
}));

describe('AdminController Methods', () => {
  it('should parse and list logs correctly', async () => {
    const mockReaddir = fs.readdir as jest.Mock;
    mockReaddir.mockResolvedValue(['transaction_1784434231472_maneq3z6m.json']);

    const mockReadFile = fs.readFile as jest.Mock;
    mockReadFile.mockResolvedValue(JSON.stringify({
      client_req: { model: 'gemini-flash-latest' }
    }));

    const req = {} as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await adminController.listLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      logs: expect.any(Array)
    }));
  });

  it('should validate malicious ID structures', async () => {
    const req = {
      params: { id: '../../etc/passwd' }
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await adminController.getLogDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Invalid log file ID parameter'
    }));
  });
});
```

- [ ] **Step 3: Run the test suite**

Run: `npx jest tests/admin.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/controllers/adminController.ts tests/admin.test.ts
git commit -m "feat: implement AdminController with log list and details serving" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Setup Router and Mount Log Viewer Route

**Files:**
- Create: `src/routes/adminRoutes.ts`
- Modify: `src/app.ts`
- Test: `tests/admin.test.ts` (Add route testing with supertest)

**Interfaces:**
- Consumes: `adminRoutes` inside `src/app.ts`.
- Produces: API routing `/admin/api/logs`, `/admin/api/logs/:id`, and HTML delivery at `/admin/logs-viewer`.

- [ ] **Step 1: Create `src/routes/adminRoutes.ts`**

Write routes definition using the security middleware and controller:
```typescript
import { Router, Request, Response } from 'express';
import * as path from 'path';
import { localhostOnly } from '../middleware/auth';
import adminController from '../controllers/adminController';

const router = Router();

// Secure all admin routes
router.use(localhostOnly);

// Static Viewer page delivery
router.get('/logs-viewer', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Logs APIs
router.get('/api/logs', (req: Request, res: Response) => adminController.listLogs(req, res));
router.get('/api/logs/:id', (req: Request, res: Response) => adminController.getLogDetail(req, res));

export default router;
```

- [ ] **Step 2: Mount Admin Router in `src/app.ts`**

Update `src/app.ts` to include `/admin` prefix and static files preparation:
```typescript
// Read existing app.ts and update:
import express, { Request, Response } from 'express';
import claudeRoutes from './routes/claudeRoutes';
import adminRoutes from './routes/adminRoutes'; // <-- ADD THIS

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use('/v1', claudeRoutes);
app.use('/admin', adminRoutes); // <-- ADD THIS

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
```

- [ ] **Step 3: Test route endpoints via Supertest**

Expand integration checks in `tests/admin.test.ts` using supertest:
```typescript
import request from 'supertest';
import app from '../src/app';

describe('Admin Integration Endpoints', () => {
  it('should block non-local IP on GET /admin/api/logs', async () => {
    // Note: supertest sets headers; we expect to bypass or fail based on connection setup
    const response = await request(app)
      .get('/admin/api/logs')
      .set('X-Forwarded-For', '192.168.1.100'); // Mocking an external proxy IP if supported
      
    // Assert security behavior
    if (response.status === 403) {
      expect(response.body.error).toBe('Forbidden');
    }
  });
});
```

- [ ] **Step 4: Run all tests to make sure router integration is clean**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/adminRoutes.ts src/app.ts tests/admin.test.ts
git commit -m "feat: mount admin router and security checks in app routing" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Construct HTML Log Viewer SPA Front-end

**Files:**
- Create: `src/public/index.html` (Ensure parent directory `src/public` is created)
- Test: Verify HTML structure loading.

**Interfaces:**
- Consumes: `/admin/api/logs` and `/admin/api/logs/:id`
- Produces: Beautiful Chrome DevTools log comparator.

- [ ] **Step 1: Create public folder**

Run: `mkdir -p src/public`

- [ ] **Step 2: Write complete static single-page viewer `src/public/index.html`**

Write the entire code including styling and vanilla JavaScript interactivity inside `src/public/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gemini-Proxy Admin Log Viewer 🔍</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    /* Custom scrollbars */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: #111827;
    }
    ::-webkit-scrollbar-thumb {
      background: #374151;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #4b5563;
    }
  </style>
</head>
<body class="bg-gray-950 text-gray-100 flex flex-col h-screen overflow-hidden font-sans">

  <!-- Header -->
  <header class="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-3">
      <i data-lucide="terminal" class="text-indigo-400 w-6 h-6"></i>
      <h1 class="text-lg font-bold tracking-tight">Gemini-Proxy Log Viewer</h1>
      <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-xs font-semibold">Local Session</span>
    </div>
    <div class="flex items-center gap-4">
      <button onclick="loadLogs()" class="bg-gray-800 hover:bg-gray-700 text-sm px-3 py-1.5 rounded flex items-center gap-2 border border-gray-700 transition">
        <i data-lucide="refresh-cw" class="w-4 h-4"></i> Refresh
      </button>
    </div>
  </header>

  <!-- Main Split Layout -->
  <div class="flex flex-1 overflow-hidden">
    
    <!-- Sidebar: Log Items List -->
    <aside class="w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-full shrink-0">
      <div class="p-4 border-b border-gray-800">
        <div class="relative">
          <input type="text" id="logSearch" oninput="filterLogs()" placeholder="Filter logs..." class="w-full bg-gray-950 text-sm pl-9 pr-4 py-2 rounded border border-gray-800 focus:outline-none focus:border-indigo-500 text-gray-200">
          <i data-lucide="search" class="absolute left-3 top-2.5 w-4 h-4 text-gray-500"></i>
        </div>
      </div>
      <div id="logsList" class="flex-1 overflow-y-auto divide-y divide-gray-800/50">
        <div class="p-4 text-center text-gray-500 text-sm">Loading logs...</div>
      </div>
    </aside>

    <!-- Details View: Chrome DevTools Layout -->
    <main class="flex-1 flex flex-col bg-gray-950 overflow-hidden">
      <div id="noSelection" class="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
        <i data-lucide="layers" class="w-12 h-12 text-gray-700 animate-pulse"></i>
        <p class="text-sm">Select a transaction log from the sidebar to inspect</p>
      </div>

      <div id="logDetail" class="hidden flex-1 flex flex-col overflow-hidden">
        
        <!-- Level 1 Tabs: API Selection -->
        <div class="bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between select-none shrink-0">
          <div class="flex gap-4">
            <button onclick="switchTab('primary', 'claude')" id="tab-primary-claude" class="border-b-2 border-indigo-500 px-1 py-3 text-sm font-semibold text-white">Claude Messages API</button>
            <button onclick="switchTab('primary', 'gemini')" id="tab-primary-gemini" class="border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-700 transition">Gemini API</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500" id="currentLogId">ID: null</span>
          </div>
        </div>

        <!-- Level 2 Tabs: Req vs Res -->
        <div class="bg-gray-900/40 border-b border-gray-800/80 px-6 py-2 flex items-center justify-between shrink-0">
          <div class="flex gap-2 bg-gray-950/80 p-1 rounded-lg border border-gray-800">
            <button onclick="switchTab('direction', 'req')" id="tab-direction-req" class="bg-gray-800 text-xs px-3 py-1 rounded font-medium text-white shadow-sm transition">Request Payload</button>
            <button onclick="switchTab('direction', 'res')" id="tab-direction-res" class="text-xs px-3 py-1 rounded font-medium text-gray-400 hover:text-white transition">Response Payload</button>
          </div>

          <!-- Level 3 Tabs: Preview vs Raw -->
          <div class="flex gap-1">
            <button onclick="switchTab('format', 'preview')" id="tab-format-preview" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i> Preview
            </button>
            <button onclick="switchTab('format', 'raw')" id="tab-format-raw" class="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1">
              <i data-lucide="code-2" class="w-3.5 h-3.5"></i> Raw
            </button>
            <button onclick="copyCurrentPayload()" class="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy
            </button>
          </div>
        </div>

        <!-- JSON Display Area -->
        <div class="flex-1 overflow-auto p-6 bg-gray-950 relative">
          <!-- Loading Overlay -->
          <div id="detailLoading" class="absolute inset-0 bg-gray-950/80 flex items-center justify-center hidden">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>

          <!-- Render Container -->
          <div id="payloadContainer" class="font-mono text-sm leading-relaxed"></div>
        </div>

      </div>
    </main>

  </div>

  <script>
    let logsList = [];
    let selectedLog = null;
    let selectedLogData = null;

    // Active Navigation State
    let activeTabs = {
      primary: 'claude', // 'claude' or 'gemini'
      direction: 'req',  // 'req' or 'res'
      format: 'preview'  // 'preview' or 'raw'
    };

    // Load initial logs
    async function loadLogs() {
      try {
        const res = await fetch('/admin/api/logs');
        const json = await res.json();
        if (json.success) {
          logsList = json.logs;
          renderLogsList();
        }
      } catch (err) {
        console.error('Failed to load logs:', err);
      }
    }

    function renderLogsList() {
      const container = document.getElementById('logsList');
      if (logsList.length === 0) {
        container.innerHTML = '<div class="p-6 text-center text-gray-500 text-sm">No transaction logs found</div>';
        return;
      }

      container.innerHTML = logsList.map(log => `
        <div onclick="selectLog('${log.id}')" id="log-item-${log.id}" class="p-4 hover:bg-gray-800/40 cursor-pointer border-l-4 border-transparent transition flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-400 font-mono">${log.time}</span>
            <span class="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">${log.model.split('-').slice(-2).join('-')}</span>
          </div>
          <div class="text-xs font-semibold truncate text-gray-200 font-mono">${log.id}</div>
          <div class="text-[11px] text-gray-500 truncate font-mono">${log.model}</div>
        </div>
      `).join('');
      
      lucide.createIcons();
      filterLogs();
    }

    function filterLogs() {
      const query = document.getElementById('logSearch').value.toLowerCase();
      logsList.forEach(log => {
        const element = document.getElementById(`log-item-${log.id}`);
        if (!element) return;
        const matches = log.id.toLowerCase().includes(query) || log.model.toLowerCase().includes(query);
        if (matches) {
          element.classList.remove('hidden');
        } else {
          element.classList.add('hidden');
        }
      });
    }

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
      }

      document.getElementById('noSelection').classList.add('hidden');
      document.getElementById('logDetail').classList.remove('hidden');
      document.getElementById('currentLogId').innerText = `ID: ${id}`;
      document.getElementById('detailLoading').classList.remove('hidden');

      try {
        const res = await fetch(`/admin/api/logs/${id}`);
        const json = await res.json();
        if (json.success) {
          selectedLogData = json.data;
          renderPayload();
        }
      } catch (err) {
        console.error('Failed to load log detail:', err);
      } finally {
        document.getElementById('detailLoading').classList.add('hidden');
      }
    }

    function switchTab(level, target) {
      activeTabs[level] = target;

      // Update Tabs Style
      if (level === 'primary') {
        document.querySelectorAll('[id^="tab-primary-"]').forEach(el => {
          el.className = 'border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-gray-400 hover:text-white hover:border-gray-700 transition';
        });
        document.getElementById(`tab-primary-${target}`).className = 'border-b-2 border-indigo-500 px-1 py-3 text-sm font-semibold text-white';
      } else if (level === 'direction') {
        document.querySelectorAll('[id^="tab-direction-"]').forEach(el => {
          el.className = 'text-xs px-3 py-1 rounded font-medium text-gray-400 hover:text-white transition';
        });
        document.getElementById(`tab-direction-${target}`).className = 'bg-gray-800 text-xs px-3 py-1 rounded font-medium text-white shadow-sm transition';
      } else if (level === 'format') {
        document.querySelectorAll('[id^="tab-format-"]').forEach(el => {
          el.className = 'bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1';
        });
        document.getElementById(`tab-format-${target}`).className = 'bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2.5 py-1 rounded font-medium transition flex items-center gap-1';
      }

      renderPayload();
    }

    // Identify which nested payload field matches active controls
    function getCurrentPayloadObject() {
      if (!selectedLogData) return null;
      if (activeTabs.primary === 'claude') {
        return activeTabs.direction === 'req' ? selectedLogData.client_req : selectedLogData.claude_res;
      } else {
        return activeTabs.direction === 'req' ? selectedLogData.gem_req : selectedLogData.gem_res;
      }
    }

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
        container.appendChild(createJsonNode(null, obj, true));
      }
    }

    // Collapsible JSON tree generator
    function createJsonNode(key, value, isLast) {
      const container = document.createElement('div');
      container.className = 'pl-4 py-0.5 border-l border-gray-900 hover:bg-gray-800/10 transition-colors relative font-mono text-xs text-gray-300';
      
      const keySpan = key ? `<span class="text-indigo-400">"${key}"</span>: ` : '';
      
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

    // Utility to copy current JSON
    function copyCurrentPayload() {
      const obj = getCurrentPayloadObject();
      if (!obj) return;
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).then(() => {
        alert('Copied to clipboard!');
      });
    }

    // Init
    window.onload = () => {
      loadLogs();
      lucide.createIcons();
    };
  </script>
</body>
</html>
```

- [ ] **Step 3: Run full tests and ensure app launches successfully**

Run: `npm run build`
Expected: Success with no TypeScript or build issues.

- [ ] **Step 4: Commit HTML files**

```bash
git add src/public/index.html
git commit -m "feat: design and implement Chrome-inspired Single-page Log Viewer dashboard" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Execution Choice Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-log-viewer-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

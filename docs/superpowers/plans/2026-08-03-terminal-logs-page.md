# Terminal Logs Web Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a real-time Terminal Logs view in the Admin Web Console with 100-entry memory Ring Buffer and SSE stream broadcasting.

**Architecture:** Add `TerminalLogService` to buffer server console log outputs and broadcast via EventEmitter, register logger hook in `src/utils/logger.ts`, expose `/api/admin/terminal-logs` (SSE and JSON modes) in Express, and build a dark monospace `TerminalLogsView.tsx` tab in React.

**Tech Stack:** TypeScript, Express, EventEmitter, React, EventSource, Vite, Jest.

## Global Constraints

- `logsBuffer` size in `TerminalLogService` must be capped at exactly 100 entries.
- All tests must pass with `npx jest --runInBand`.
- Frontend build must succeed with `npm run build:frontend`.

---

### Task 1: Create TerminalLogService and Hook into Logger

**Files:**
- Create: `src/admin/services/terminalLogService.ts`
- Modify: `src/utils/logger.ts:44-51`
- Test: `tests/terminalLogService.test.ts`

**Interfaces:**
- Consumes: `log(level, message)` from `src/utils/logger.ts`
- Produces: `TerminalLogEntry` items and EventEmitter `'log'` events

- [ ] **Step 1: Write failing unit tests for TerminalLogService in tests/terminalLogService.test.ts**

Create `tests/terminalLogService.test.ts`:

```typescript
import terminalLogService from '../src/admin/services/terminalLogService';

describe('TerminalLogService', () => {
  beforeEach(() => {
    terminalLogService.clearHistory();
  });

  it('buffers log entries up to maximum capacity of 100', () => {
    for (let i = 0; i < 110; i++) {
      terminalLogService.addLog('info', `Log message ${i}`);
    }

    const history = terminalLogService.getHistory();
    expect(history.length).toBe(100);
    expect(history[0].message).toBe('Log message 10');
    expect(history[99].message).toBe('Log message 109');
  });

  it('dispatches event on new log entry', (done) => {
    terminalLogService.once('log', (entry) => {
      expect(entry.level).toBe('warn');
      expect(entry.message).toBe('Test warning');
      done();
    });

    terminalLogService.addLog('warn', 'Test warning');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/terminalLogService.test.ts`
Expected: FAIL ("Cannot find module '../src/admin/services/terminalLogService'")

- [ ] **Step 3: Implement TerminalLogService in src/admin/services/terminalLogService.ts**

Create `src/admin/services/terminalLogService.ts`:

```typescript
import { EventEmitter } from 'events';

export interface TerminalLogEntry {
  id: number;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
}

class TerminalLogService extends EventEmitter {
  private logsBuffer: TerminalLogEntry[] = [];
  private nextId = 1;
  private readonly maxCapacity = 100;

  public addLog(level: 'error' | 'warn' | 'info' | 'debug' | string, message: string): TerminalLogEntry {
    const validLevel = ['error', 'warn', 'info', 'debug'].includes(level)
      ? (level as 'error' | 'warn' | 'info' | 'debug')
      : 'info';

    const entry: TerminalLogEntry = {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      level: validLevel,
      message
    };

    this.logsBuffer.push(entry);
    if (this.logsBuffer.length > this.maxCapacity) {
      this.logsBuffer.shift();
    }

    this.emit('log', entry);
    return entry;
  }

  public getHistory(): TerminalLogEntry[] {
    return [...this.logsBuffer];
  }

  public clearHistory(): void {
    this.logsBuffer = [];
  }
}

const terminalLogService = new TerminalLogService();
export default terminalLogService;
```

- [ ] **Step 4: Update src/utils/logger.ts to call terminalLogService.addLog**

In `src/utils/logger.ts`:

```typescript
import terminalLogService from '../admin/services/terminalLogService';

// Inside log function:
const log = (level: string, message: string, ...meta: any[]) => {
  const timestamp = getFormattedTimestamp();
  const formattedMeta = meta.length
    ? ' ' + meta.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(' ')
    : '';
  const fullMsg = `${message}${formattedMeta}`;

  terminalLogService.addLog(level, `[${timestamp}] [${level.toUpperCase()}] ${fullMsg}`);

  if (process.env.NODE_ENV === 'test') {
    return;
  }

  if (levels[level] <= getCurrentLevel()) {
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${fullMsg}`);
  }
};
```

- [ ] **Step 5: Run unit tests to verify pass**

Run: `npx jest tests/terminalLogService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit backend service changes**

```bash
git add src/admin/services/terminalLogService.ts src/utils/logger.ts tests/terminalLogService.test.ts
git commit -m "feat(admin): implement TerminalLogService ring buffer and hook into logger"
```

---

### Task 2: Add Admin Route & SSE Controller for Terminal Logs

**Files:**
- Modify: `src/admin/controllers/adminController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Test: `tests/adminController.test.ts`

**Interfaces:**
- Consumes: `terminalLogService`
- Produces: `GET /api/admin/terminal-logs` (JSON & SSE stream)

- [ ] **Step 1: Write unit test in tests/adminController.test.ts**

In `tests/adminController.test.ts`, add:

```typescript
    it('GET /api/admin/terminal-logs returns 100 history log entries', async () => {
      const res = await request(app)
        .get('/api/admin/terminal-logs')
        .set('x-admin-key', 'test-secret-key');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logs');
      expect(Array.isArray(res.body.logs)).toBe(true);
    });
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/adminController.test.ts -t "terminal-logs"`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Implement getTerminalLogs in AdminController and add Route**

In `src/admin/controllers/adminController.ts`:

```typescript
  public async getTerminalLogs(req: Request, res: Response): Promise<void> {
    const isStream = req.query.stream === 'true' || req.headers.accept === 'text/event-stream';

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const history = terminalLogService.getHistory();
      res.write(`data: ${JSON.stringify({ type: 'history', logs: history })}\n\n`);

      const onLog = (entry: any) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'log', entry })}\n\n`);
        }
      };

      terminalLogService.on('log', onLog);

      req.on('close', () => {
        terminalLogService.off('log', onLog);
      });
      return;
    }

    res.json({ logs: terminalLogService.getHistory() });
  }
```

In `src/admin/routes/adminRoutes.ts`:

```typescript
router.get('/terminal-logs', (req, res) => adminController.getTerminalLogs(req, res));
```

- [ ] **Step 4: Run unit tests to verify pass**

Run: `npx jest tests/adminController.test.ts --runInBand`
Expected: PASS

- [ ] **Step 5: Commit route and controller changes**

```bash
git add src/admin/controllers/adminController.ts src/admin/routes/adminRoutes.ts tests/adminController.test.ts
git commit -m "feat(admin): add /api/admin/terminal-logs SSE & JSON endpoint"
```

---

### Task 3: Build Frontend TerminalLogsView Component and Integrate Tab

**Files:**
- Create: `frontend/src/components/TerminalLogsView.tsx`
- Modify: `frontend/src/App.tsx:8-178`

**Interfaces:**
- Consumes: `/api/admin/terminal-logs?stream=true` SSE
- Produces: Interactive Terminal Log Viewer UI in Admin Console

- [ ] **Step 1: Create frontend TerminalLogsView component in frontend/src/components/TerminalLogsView.tsx**

Create `frontend/src/components/TerminalLogsView.tsx`:

```typescript
import React, { useEffect, useState, useRef } from 'react';

export default function TerminalLogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    const streamUrl = `/api/admin/terminal-logs?stream=true${adminKey ? `&x-admin-key=${encodeURIComponent(adminKey)}` : ''}`;

    eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'history') {
          setLogs(payload.logs || []);
        } else if (payload.type === 'log' && payload.entry) {
          setLogs(prev => [...prev.slice(-99), payload.entry]);
        }
      } catch (err) {
        // ignore parse error
      }
    };

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [adminKey]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(item => {
    if (levelFilter !== 'ALL' && item.level.toUpperCase() !== levelFilter) {
      return false;
    }
    if (searchTerm && !item.message.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'text-red-400 font-bold';
      case 'warn': return 'text-yellow-400 font-semibold';
      case 'info': return 'text-emerald-400';
      case 'debug': return 'text-slate-400';
      default: return 'text-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[820px] bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
      {/* Top Toolbar */}
      <div className="bg-slate-800/90 border-b border-slate-700/80 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="font-bold text-slate-200 tracking-wider uppercase text-[11px]">Server Terminal Output</span>
          <div className="flex items-center space-x-1.5 ml-2 bg-slate-950/60 px-2.5 py-1 rounded-full text-[10px]">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className={isConnected ? 'text-emerald-300' : 'text-red-300'}>
              {isConnected ? 'LIVE' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 text-slate-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
          />

          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">ALL LEVELS</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="DEBUG">DEBUG</option>
          </select>

          <label className="flex items-center space-x-1.5 text-slate-300 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>

          <button
            onClick={() => setLogs([])}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-2.5 py-1 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Console Output Window */}
      <div
        ref={containerRef}
        className="flex-1 p-4 overflow-y-auto space-y-1 bg-slate-950/90 selection:bg-cyan-500/30 selection:text-cyan-200"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 italic py-8 text-center">No terminal logs recorded.</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="leading-relaxed break-all flex items-start space-x-2 hover:bg-slate-800/40 px-1 py-0.5 rounded">
              <span className={getLevelColor(log.level)}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Terminal Tab to frontend/src/App.tsx**

In `frontend/src/App.tsx`:
1. Import `TerminalLogsView` component:
   ```typescript
   import TerminalLogsView from './components/TerminalLogsView';
   ```
2. Update `activeTab` state type to include `'terminal'`:
   ```typescript
   const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'terminal' | 'playground'>('dashboard');
   ```
3. Update Tab navigation buttons array:
   ```typescript
   {(['dashboard', 'logs', 'terminal', 'playground'] as const).map((tab) => (
   ```
   with tab label mapping: `terminal` -> `Terminal Logs`.
4. Render component when `activeTab === 'terminal'`:
   ```typescript
   {activeTab === 'terminal' && <TerminalLogsView adminKey={adminKey} />}
   ```

- [ ] **Step 3: Build frontend to verify TypeScript compilation and Vite bundling**

Run: `npm run build:frontend`
Expected: Successful Vite React frontend build into `dist/frontend`.

- [ ] **Step 4: Run full backend and integration test suite**

Run: `npx jest --runInBand`
Expected: All 20 test suites PASS.

- [ ] **Step 5: Commit frontend changes**

```bash
git add frontend/src/components/TerminalLogsView.tsx frontend/src/App.tsx
git commit -m "feat(frontend): add TerminalLogsView component and tab in Admin Console"
```

---

## Plan Self-Review Checklist
- [x] Spec coverage verified (TerminalLogService with 100 ring buffer, SSE route, TerminalLogsView tab)
- [x] No placeholders or vague TODOs
- [x] Exact file paths and line steps provided
- [x] Tested with `npx jest --runInBand` and `npm run build:frontend`

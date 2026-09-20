# Model Request Passive Circuit Breaker & Accounts View Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove active background heartbeat health checks from `UpstreamManager`, implement a passive circuit breaker (3 consecutive network/timeout/5xx failures isolates node for 180s; success resets), decouple accounts view online/offline status to reflect its own HTTP status API responses directly, and modernize the account management header.

**Architecture:**
1. `UpstreamManager` removes background intervals and tracks per-node `UpstreamCircuitState`. `recordRequestResult(serverIndex, success, error)` isolates nodes failing 3 consecutive times for 180 seconds.
2. `claudeController.ts` and `geminiController.ts` report request outcomes to `upstreamManager.recordRequestResult()`.
3. `AccountsView.tsx` derives tab health status directly from the HTTP response of `/api/admin/accounts/status`, without lag.
4. `AccountsView.tsx` header is redesigned with an indigo icon container, dynamic node count pill, and streamlined subtitle.

**Tech Stack:** TypeScript, Node.js, Express, React 18, Tailwind CSS, Lucide React, Jest, Supertest.

## Global Constraints
- **Zero Background Polling**: Do not introduce any `setInterval` heartbeat timers for upstream health checks.
- **Dynamic Config Access**: Never cache `config` properties at module scope.
- **Circuit Breaker Fallback**: If 100% of upstream nodes are isolated, fall back to the full cluster to prevent total request refusal.
- **Bilingual i18n**: Parity across `zh.ts` and `en.ts`.

---

### Task 1: UpstreamManager Passive Circuit Breaker

**Files:**
- Modify: `src/utils/upstreamManager.ts`
- Test: `tests/upstreamCircuitBreaker.test.ts`
- Delete/Replace: `tests/upstreamHealthCheck.test.ts`

**Interfaces:**
- Consumes: `config.geminiBaseUrl`
- Produces:
  - `UpstreamCircuitState`: `{ serverUrl: string, serverIndex: number, consecutiveFailures: number, isolatedUntil: number, lastError?: string }`
  - `UpstreamManager.recordRequestResult(serverIndex: number, success: boolean, error?: string | number): void`
  - `UpstreamManager.getCircuitStatusList(): UpstreamCircuitState[]`
  - `UpstreamManager.isNodeIsolated(serverIndex: number): boolean`
  - `UpstreamManager.resetCircuit(serverIndex?: number): void`

- [ ] **Step 1: Write failing unit test for passive circuit breaker**

Create `tests/upstreamCircuitBreaker.test.ts`:
```typescript
import config, { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';

describe('UpstreamManager Passive Circuit Breaker (3 failures / 180s isolation)', () => {
  const originalUrl = config.geminiBaseUrl;

  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  it('initializes all nodes with 0 failures and not isolated', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    const statusList = upstreamManager.getCircuitStatusList();
    expect(statusList).toHaveLength(2);
    expect(statusList[0]).toMatchObject({ serverIndex: 0, consecutiveFailures: 0, isolatedUntil: 0 });
    expect(statusList[1]).toMatchObject({ serverIndex: 1, consecutiveFailures: 0, isolatedUntil: 0 });
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);
  });

  it('does not isolate node after 1 or 2 failures', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.recordRequestResult(0, false, 'ECONNREFUSED');
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);

    upstreamManager.recordRequestResult(0, false, 'ETIMEDOUT');
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);

    const status = upstreamManager.getCircuitStatusList()[0];
    expect(status.consecutiveFailures).toBe(2);
    expect(status.isolatedUntil).toBe(0);
  });

  it('resets consecutive failures to 0 on success', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.recordRequestResult(0, false, 'ETIMEDOUT');
    upstreamManager.recordRequestResult(0, false, 'ETIMEDOUT');
    expect(upstreamManager.getCircuitStatusList()[0].consecutiveFailures).toBe(2);

    upstreamManager.recordRequestResult(0, true);
    expect(upstreamManager.getCircuitStatusList()[0].consecutiveFailures).toBe(0);
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);
  });

  it('isolates node for 180 seconds upon reaching 3 consecutive failures', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    const before = Date.now();
    upstreamManager.recordRequestResult(1, false, '502 Bad Gateway');
    upstreamManager.recordRequestResult(1, false, '503 Service Unavailable');
    upstreamManager.recordRequestResult(1, false, 'ECONNREFUSED');

    expect(upstreamManager.isNodeIsolated(1)).toBe(true);
    const status = upstreamManager.getCircuitStatusList()[1];
    expect(status.consecutiveFailures).toBe(3);
    expect(status.isolatedUntil).toBeGreaterThanOrEqual(before + 179_000);
    expect(status.isolatedUntil).toBeLessThanOrEqual(before + 181_000);
  });

  it('bypasses isolated nodes during round-robin model routing', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    // Isolate server 2 (index 1) with 3 failures
    upstreamManager.recordRequestResult(1, false, 'Down');
    upstreamManager.recordRequestResult(1, false, 'Down');
    upstreamManager.recordRequestResult(1, false, 'Down');
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    const model = 'gemini-2.5-pro';
    const s1 = upstreamManager.getUpstreamServer({ model });
    expect(s1.serverIndex).toBe(0);

    // Skips index 1, goes straight to index 2
    const s2 = upstreamManager.getUpstreamServer({ model });
    expect(s2.serverIndex).toBe(2);

    // Wraps around to index 0
    const s3 = upstreamManager.getUpstreamServer({ model });
    expect(s3.serverIndex).toBe(0);
  });

  it('falls back to full cluster if 100% of nodes are isolated', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    for (let i = 0; i < 3; i++) upstreamManager.recordRequestResult(0, false, 'Fail');
    for (let i = 0; i < 3; i++) upstreamManager.recordRequestResult(1, false, 'Fail');

    expect(upstreamManager.isNodeIsolated(0)).toBe(true);
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    // Does not crash, falls back to full cluster
    const s = upstreamManager.getUpstreamServer();
    expect([0, 1]).toContain(s.serverIndex);
  });

  it('always honors explicit serverIndex even if isolated', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    for (let i = 0; i < 3; i++) upstreamManager.recordRequestResult(1, false, 'Fail');
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    const s = upstreamManager.getUpstreamServer({ serverIndex: 1 });
    expect(s.serverIndex).toBe(1);
    expect(s.serverUrl).toBe('https://server2.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamCircuitBreaker.test.ts`
Expected: FAIL with `upstreamManager.recordRequestResult is not a function` or similar.

- [ ] **Step 3: Refactor `src/utils/upstreamManager.ts` to implement passive circuit breaker**

Update `src/utils/upstreamManager.ts`:
```typescript
import config, { parseBaseUrls } from '../../config/default';
import logger from './logger';

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
}

export interface UpstreamUrlSelection extends UpstreamServerSelection {
  targetUrl: string;
}

export interface UpstreamCircuitState {
  serverUrl: string;
  serverIndex: number;
  consecutiveFailures: number;
  isolatedUntil: number; // Timestamp in ms until node is isolated; 0 if healthy
  lastError?: string;
}

export class UpstreamManager {
  private modelCounters: Map<string, number> = new Map();
  private globalCounter: number = 0;
  private circuitMap: Map<number, UpstreamCircuitState> = new Map();

  /**
   * Retrieves current list of configured upstream server URLs.
   */
  public getBaseUrls(): string[] {
    const raw = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    const urls = parseBaseUrls(raw);
    return urls.length > 0 ? urls : ['https://generativelanguage.googleapis.com'];
  }

  /**
   * Returns circuit breaker status list for all configured upstream nodes.
   */
  public getCircuitStatusList(): UpstreamCircuitState[] {
    const servers = this.getBaseUrls();
    const now = Date.now();
    return servers.map((url, idx) => {
      const existing = this.circuitMap.get(idx);
      if (existing && existing.serverUrl === url) {
        // Auto-heal if isolation time has passed
        if (existing.isolatedUntil > 0 && existing.isolatedUntil <= now) {
          existing.isolatedUntil = 0;
          existing.consecutiveFailures = 0;
          existing.lastError = undefined;
        }
        return existing;
      }
      const initial: UpstreamCircuitState = {
        serverUrl: url,
        serverIndex: idx,
        consecutiveFailures: 0,
        isolatedUntil: 0
      };
      this.circuitMap.set(idx, initial);
      return initial;
    });
  }

  /**
   * Checks whether a node is currently isolated under circuit breaker.
   */
  public isNodeIsolated(serverIndex: number): boolean {
    const servers = this.getBaseUrls();
    if (serverIndex < 0 || serverIndex >= servers.length) return false;
    const existing = this.circuitMap.get(serverIndex);
    if (!existing) return false;
    if (existing.isolatedUntil > 0 && existing.isolatedUntil > Date.now()) {
      return true;
    }
    return false;
  }

  /**
   * Records request outcome for a given upstream server.
   * 3 consecutive failures trigger 180-second isolation.
   */
  public recordRequestResult(serverIndex: number, success: boolean, error?: string | number): void {
    const servers = this.getBaseUrls();
    if (serverIndex < 0 || serverIndex >= servers.length) return;
    const url = servers[serverIndex];
    let existing = this.circuitMap.get(serverIndex);
    if (!existing || existing.serverUrl !== url) {
      existing = {
        serverUrl: url,
        serverIndex,
        consecutiveFailures: 0,
        isolatedUntil: 0
      };
      this.circuitMap.set(serverIndex, existing);
    }

    if (success) {
      existing.consecutiveFailures = 0;
      existing.isolatedUntil = 0;
      existing.lastError = undefined;
      return;
    }

    existing.consecutiveFailures += 1;
    existing.lastError = error !== undefined ? String(error) : 'Upstream request failed';

    if (existing.consecutiveFailures >= 3) {
      existing.isolatedUntil = Date.now() + 180_000; // 180 seconds isolation
      logger.warn(`[UpstreamManager] Upstream node ${serverIndex + 1} (${url}) failed 3 times consecutively (${existing.lastError}). Isolated for 180s.`);
    }
  }

  /**
   * Resets circuit state for a given node or all nodes.
   */
  public resetCircuit(serverIndex?: number): void {
    if (serverIndex !== undefined) {
      this.circuitMap.delete(serverIndex);
    } else {
      this.circuitMap.clear();
    }
  }

  /**
   * Selects an upstream server based on model-specific round-robin,
   * explicit server index, or global round-robin, skipping isolated nodes.
   */
  public getUpstreamServer(options?: { model?: string; serverIndex?: number }): UpstreamServerSelection {
    const servers = this.getBaseUrls();
    if (servers.length === 0) {
      return { serverUrl: 'https://generativelanguage.googleapis.com', serverIndex: 0 };
    }

    // 1. Explicit serverIndex (e.g. for AccountService or direct targeting)
    if (options?.serverIndex !== undefined && !isNaN(options.serverIndex)) {
      const idx = Math.abs(Math.floor(options.serverIndex)) % servers.length;
      return { serverUrl: servers[idx], serverIndex: idx };
    }

    // 2. Filter out isolated nodes
    const now = Date.now();
    const availableList = servers
      .map((url, idx) => ({ url, idx }))
      .filter(item => {
        const state = this.circuitMap.get(item.idx);
        return !state || state.isolatedUntil <= now;
      });

    // If all servers are isolated, fall back to full pool to prevent 100% rejection
    const candidatePool = availableList.length > 0
      ? availableList
      : servers.map((url, idx) => ({ url, idx }));

    if (availableList.length === 0 && servers.length > 1) {
      logger.warn(`[UpstreamManager] All upstream servers currently isolated, falling back to full cluster`);
    }

    // 3. Per-model round-robin
    if (options?.model) {
      const current = this.modelCounters.get(options.model) || 0;
      const selection = candidatePool[current % candidatePool.length];
      this.modelCounters.set(options.model, (current + 1) % 100000000);
      return { serverUrl: selection.url, serverIndex: selection.idx };
    }

    // 4. Global round-robin fallback
    const selection = candidatePool[this.globalCounter % candidatePool.length];
    this.globalCounter = (this.globalCounter + 1) % 100000000;
    return { serverUrl: selection.url, serverIndex: selection.idx };
  }

  /**
   * Builds the full target URL and returns server selection metadata.
   */
  public getUpstreamUrl(
    pathAndQuery: string,
    options?: { model?: string; serverIndex?: number }
  ): UpstreamUrlSelection {
    const { serverUrl, serverIndex } = this.getUpstreamServer(options);
    const cleanPath = pathAndQuery.replace(/^\/+/, '');
    return {
      targetUrl: `${serverUrl}/${cleanPath}`,
      serverUrl,
      serverIndex
    };
  }

  /**
   * Resets internal counters and circuit state.
   */
  public reset(): void {
    this.modelCounters.clear();
    this.globalCounter = 0;
    this.circuitMap.clear();
  }
}

export const upstreamManager = new UpstreamManager();
export default upstreamManager;
```

- [ ] **Step 4: Remove obsolete `tests/upstreamHealthCheck.test.ts`**

Delete `tests/upstreamHealthCheck.test.ts`.

- [ ] **Step 5: Run tests to verify it passes**

Run: `npx jest tests/upstreamCircuitBreaker.test.ts tests/upstreamManager.test.ts tests/multiServerProxy.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/upstreamManager.ts tests/upstreamCircuitBreaker.test.ts
git rm tests/upstreamHealthCheck.test.ts
git commit -m "feat(upstream): implement passive circuit breaker and remove background health prober"
```

---

### Task 2: Controller Circuit Breaker Outcome Reporting & AccountController Cleanup

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts`
- Modify: `src/proxy/controllers/geminiController.ts`
- Modify: `src/admin/controllers/accountController.ts`
- Modify: `tests/accountController.test.ts`

**Interfaces:**
- Consumes: `upstreamManager.recordRequestResult(serverIndex, success, error)`
- Produces: Accurate circuit breaker failure tracking on network disconnects, timeouts, 502/503/504; success tracking on 200/client responses.

- [ ] **Step 1: Update `src/proxy/controllers/claudeController.ts`**

In `claudeController.ts`:
1. On fetch error / response status check:
   - If `!response.ok`:
     - If `response.status >= 502 && response.status <= 504`: call `upstreamManager.recordRequestResult(serverIndex, false, response.status)`
     - Else: call `upstreamManager.recordRequestResult(serverIndex, true)` (legitimate client/model response)
   - On fetch catch (`err`):
     - If network/timeout: call `upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Fetch error')`
   - On response success:
     - Call `upstreamManager.recordRequestResult(serverIndex, true)`

- [ ] **Step 2: Update `src/proxy/controllers/geminiController.ts`**

In `geminiController.ts`:
1. On stream or non-stream response:
   - If `!response.ok`:
     - If `response.status >= 502 && response.status <= 504`: call `upstreamManager.recordRequestResult(serverIndex, false, response.status)`
     - Else: call `upstreamManager.recordRequestResult(serverIndex, true)`
   - On fetch catch / error event:
     - Call `upstreamManager.recordRequestResult(serverIndex, false, err.message)`
   - On success:
     - Call `upstreamManager.recordRequestResult(serverIndex, true)`

- [ ] **Step 3: Update `src/admin/controllers/accountController.ts` and `tests/accountController.test.ts`**

In `accountController.ts`:
```typescript
  public async getServers(req: Request, res: Response): Promise<void> {
    res.json({
      servers: upstreamManager.getBaseUrls(),
      circuits: upstreamManager.getCircuitStatusList()
    });
  }
```

In `tests/accountController.test.ts`:
```typescript
  it('should return servers and circuit status list from getServers', async () => {
    const res = await request(app)
      .get('/api/admin/accounts/servers')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.servers)).toBe(true);
    expect(Array.isArray(res.body.circuits)).toBe(true);
  });
```

- [ ] **Step 4: Run tests to verify it passes**

Run: `npx jest tests/accountController.test.ts tests/claudeController.test.ts tests/geminiController.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts src/admin/controllers/accountController.ts tests/accountController.test.ts
git commit -m "feat(proxy): report request outcomes to upstream circuit breaker"
```

---

### Task 3: Bilingual i18n Modern Header Translation

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Produces:
  - `accounts.modernSub`: "集中管理多节点账号凭据、状态监控与上下文轮换" / "Centralized multi-node credentials, monitoring, and context rotation"
  - `accounts.singleNode`: "单节点" / "Single Node"
  - `accounts.multiNodes`: "{count} 节点" / "{count} Nodes"

- [ ] **Step 1: Add translation keys in `frontend/src/i18n/locales/zh.ts`**

In `accounts` section of `frontend/src/i18n/locales/zh.ts`:
```typescript
    modernSub: "集中管理多节点账号凭据、状态监控与上下文轮换",
    singleNode: "单节点",
    multiNodes: "{count} 个节点",
```

- [ ] **Step 2: Add translation keys in `frontend/src/i18n/locales/en.ts`**

In `accounts` section of `frontend/src/i18n/locales/en.ts`:
```typescript
    modernSub: "Centralized multi-node credentials, monitoring, and context rotation",
    singleNode: "Single Node",
    multiNodes: "{count} Nodes",
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add modernized accounts view header translations"
```

---

### Task 4: AccountsView Direct Status Display & Modern Header Redesign

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`
- Modify: `tests/accountsMultiServerIsolation.test.ts`

**Interfaces:**
- Consumes:
  - `res.ok` from `/api/admin/accounts/status?serverId=idx`
- Produces:
  - Online/offline status derived strictly from status fetch results
  - Modernized compact header with card-encapsulated Users icon, dynamic node count badge, and clean sub-text
  - Removal of outdated text

- [ ] **Step 1: Update `tests/accountsMultiServerIsolation.test.ts` for modern header and direct status**

Update `tests/accountsMultiServerIsolation.test.ts`:
```typescript
import fs from 'fs';
import path from 'path';

describe('AccountsView Multi-Server Tab Isolation & Direct Status', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  const accountsViewContent = fs.readFileSync(accountsViewPath, 'utf-8');

  test('derives health status directly from status fetch response', () => {
    expect(accountsViewContent).toContain('setServerHealthMap(prev => ({ ...prev, [idx]: true }))');
    expect(accountsViewContent).toContain('setServerHealthMap(prev => ({ ...prev, [idx]: false }))');
  });

  test('displays clear online / offline health indicators on server tabs', () => {
    expect(accountsViewContent).toContain('accounts.nodeOffline');
    expect(accountsViewContent).toMatch(/bg-rose-500/);
    expect(accountsViewContent).toMatch(/bg-emerald-500/);
  });

  test('renders modernized compact header with badge and removes legacy description', () => {
    expect(accountsViewContent).toContain('accounts.modernSub');
    expect(accountsViewContent).not.toContain('Manage multi-account credentials, automatic context rotation');
  });

  test('renders node offline fallback state when active server is unreachable', () => {
    expect(accountsViewContent).toContain('accounts.nodeConnectionFailed');
    expect(accountsViewContent).toContain('accounts.retryNode');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountsMultiServerIsolation.test.ts`
Expected: FAIL due to old header still being rendered.

- [ ] **Step 3: Update `frontend/src/components/AccountsView.tsx`**

1. Replace the legacy header section:
```tsx
      {/* Modern Page Header (Desktop/Tablet only, hidden on mobile to avoid duplicate header with App bar) */}
      <div className="hidden sm:flex items-center justify-between pb-1">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 shadow-sm shadow-indigo-500/10 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {t('accounts.title')}
              </h1>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
                {servers.length > 1 ? t('accounts.multiNodes', { count: servers.length }) : t('accounts.singleNode')}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('accounts.modernSub')}
            </p>
          </div>
        </div>
      </div>
```
2. In `fetchServers`, populate `servers` and let `fetchAllServers` directly establish initial `serverHealthMap`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountsMultiServerIsolation.test.ts`
Expected: PASS

- [ ] **Step 5: Run frontend build to verify compilation**

Run: `npm run build:frontend`
Expected: PASS with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountsMultiServerIsolation.test.ts
git commit -m "feat(accounts): modernize page header and derive tab health directly from status API"
```

---

### Task 5: Full Regression Testing & Production Build

**Files:**
- Full test suite
- Full build

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All test suites pass.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: 0 errors for frontend and backend compilation.

- [ ] **Step 3: Commit and verify status**

```bash
git status
git commit -m "chore: complete passive circuit breaker and accounts view modernization"
```

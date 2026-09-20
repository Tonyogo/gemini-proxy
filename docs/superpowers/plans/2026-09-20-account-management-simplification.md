# Account Management Simplification, Multi-Server Concurrent Refresh & Upstream Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement active upstream server health checking in `UpstreamManager` to automatically bypass dead nodes during model request routing, simplify frontend account management to concurrently refresh all servers with real-time online/offline Tab status, and eliminate obsolete stats chips/banners to maximize table viewport.

**Architecture:** 
1. `UpstreamManager` maintains an active heartbeat prober inspecting configured `GEMINI_BASE_URL` upstream servers and dynamically filters out unhealthy/offline nodes during model and global round-robin routing.
2. `AccountController.getServers` returns health status metadata along with server URLs.
3. `AccountsView.tsx` executes concurrent `Promise.allSettled` queries across all nodes, renders prominent online (green) / offline (red "Offline" badge) indicators on Tab headers, removes the 6 stats cards and Server Scope Banner, and provides an offline empty state for unreachable nodes.

**Tech Stack:** TypeScript, Express, node-fetch, React 18, Tailwind CSS, Lucide React, Jest, Supertest.

## Global Constraints
- **Config Dynamic Access**: Never cache `config` values statically at module level.
- **Zero Interruption**: If all upstream servers are marked offline, gracefully fall back to all configured servers to prevent hard 100% request failure.
- **Bilingual i18n**: Maintain complete parity across `zh.ts` and `en.ts`.
- **Zero Breaking Changes**: Existing tests in `tests/upstreamManager.test.ts` and `tests/accountController.test.ts` must pass.

---

### Task 1: Upstream Health Checking & Dynamic Routing Bypass

**Files:**
- Modify: `src/utils/upstreamManager.ts`
- Test: `tests/upstreamHealthCheck.test.ts`

**Interfaces:**
- Consumes: `config.geminiBaseUrl`, `config.upstreamTimeoutMs`, `config.adminSecretKey`
- Produces:
  - `UpstreamHealthStatus` interface: `{ serverUrl: string, serverIndex: number, isHealthy: boolean, lastChecked: number, lastError?: string, consecutiveFailures: number }`
  - `UpstreamManager.getHealthStatusList(): UpstreamHealthStatus[]`
  - `UpstreamManager.checkHealth(serverIndex?: number): Promise<void>`
  - `UpstreamManager.startHealthCheck(intervalMs?: number): void`
  - `UpstreamManager.stopHealthCheck(): void`
  - `UpstreamManager.setNodeHealth(serverIndex: number, isHealthy: boolean, error?: string): void`

- [x] **Step 1: Write the failing unit test for upstream health checking and bypass routing**

Create `tests/upstreamHealthCheck.test.ts`:
```typescript
import config, { updateConfig } from '../config/default';
import upstreamManager, { UpstreamHealthStatus } from '../src/utils/upstreamManager';

describe('UpstreamManager Health Checking and Dead Node Bypass', () => {
  const originalUrl = config.geminiBaseUrl;

  beforeEach(async () => {
    upstreamManager.stopHealthCheck();
    upstreamManager.reset();
  });

  afterEach(async () => {
    upstreamManager.stopHealthCheck();
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  it('initializes health status list for all configured servers as healthy by default', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    const healthList = upstreamManager.getHealthStatusList();
    expect(healthList).toHaveLength(3);
    expect(healthList[0]).toMatchObject({ serverUrl: 'https://server1.com', serverIndex: 0, isHealthy: true });
    expect(healthList[1]).toMatchObject({ serverUrl: 'https://server2.com', serverIndex: 1, isHealthy: true });
    expect(healthList[2]).toMatchObject({ serverUrl: 'https://server3.com', serverIndex: 2, isHealthy: true });
  });

  it('bypasses offline nodes during per-model round-robin routing', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    // Mark server 2 (index 1) as unhealthy/offline
    upstreamManager.setNodeHealth(1, false, 'Connection refused');

    const model = 'gemini-2.5-pro';
    const s1 = upstreamManager.getUpstreamServer({ model });
    expect(s1.serverIndex).toBe(0);

    // Next model call should skip server 2 (index 1) and route to server 3 (index 2)
    const s2 = upstreamManager.getUpstreamServer({ model });
    expect(s2.serverIndex).toBe(2);

    // Wraps around only between healthy nodes (0 and 2)
    const s3 = upstreamManager.getUpstreamServer({ model });
    expect(s3.serverIndex).toBe(0);
  });

  it('bypasses offline nodes during global round-robin routing', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    // Mark server 1 (index 0) as unhealthy
    upstreamManager.setNodeHealth(0, false, 'Timeout');

    const r1 = upstreamManager.getUpstreamServer();
    expect(r1.serverIndex).toBe(1);

    const r2 = upstreamManager.getUpstreamServer();
    expect(r2.serverIndex).toBe(1);
  });

  it('falls back to all configured servers if 100% of servers are unhealthy', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.setNodeHealth(0, false, 'Down');
    upstreamManager.setNodeHealth(1, false, 'Down');

    // Should not throw, should fall back to round-robin across all servers
    const r1 = upstreamManager.getUpstreamServer();
    expect([0, 1]).toContain(r1.serverIndex);
  });

  it('always respects explicit serverIndex even if the node is offline', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.setNodeHealth(1, false, 'Offline');

    const explicit = upstreamManager.getUpstreamServer({ serverIndex: 1 });
    expect(explicit.serverIndex).toBe(1);
    expect(explicit.serverUrl).toBe('https://server2.com');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamHealthCheck.test.ts`
Expected: FAIL with `upstreamManager.getHealthStatusList is not a function` or similar.

- [x] **Step 3: Implement health checking and dead node bypass in `src/utils/upstreamManager.ts`**

Update `src/utils/upstreamManager.ts`:
```typescript
import fetch from 'node-fetch';
import config, { parseBaseUrls } from '../../config/default';
import logger from './logger';

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
}

export interface UpstreamUrlSelection extends UpstreamServerSelection {
  targetUrl: string;
}

export interface UpstreamHealthStatus {
  serverUrl: string;
  serverIndex: number;
  isHealthy: boolean;
  lastChecked: number;
  lastError?: string;
  consecutiveFailures: number;
}

export class UpstreamManager {
  private modelCounters: Map<string, number> = new Map();
  private globalCounter: number = 0;
  private healthMap: Map<number, UpstreamHealthStatus> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;

  constructor() {
    this.startHealthCheck();
  }

  /**
   * Retrieves current list of configured upstream server URLs.
   */
  public getBaseUrls(): string[] {
    const raw = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    const urls = parseBaseUrls(raw);
    return urls.length > 0 ? urls : ['https://generativelanguage.googleapis.com'];
  }

  /**
   * Returns health status list for all configured upstream nodes.
   */
  public getHealthStatusList(): UpstreamHealthStatus[] {
    const servers = this.getBaseUrls();
    return servers.map((url, idx) => {
      const existing = this.healthMap.get(idx);
      if (existing && existing.serverUrl === url) {
        return existing;
      }
      const initial: UpstreamHealthStatus = {
        serverUrl: url,
        serverIndex: idx,
        isHealthy: true,
        lastChecked: Date.now(),
        consecutiveFailures: 0
      };
      this.healthMap.set(idx, initial);
      return initial;
    });
  }

  /**
   * Manually set a node's health status (e.g. for testing or passive circuit breaker).
   */
  public setNodeHealth(serverIndex: number, isHealthy: boolean, error?: string): void {
    const servers = this.getBaseUrls();
    if (serverIndex < 0 || serverIndex >= servers.length) return;
    const url = servers[serverIndex];
    const existing = this.healthMap.get(serverIndex) || {
      serverUrl: url,
      serverIndex,
      isHealthy: true,
      lastChecked: Date.now(),
      consecutiveFailures: 0
    };

    existing.isHealthy = isHealthy;
    existing.lastChecked = Date.now();
    if (!isHealthy) {
      existing.lastError = error;
      existing.consecutiveFailures += 1;
    } else {
      existing.lastError = undefined;
      existing.consecutiveFailures = 0;
    }
    this.healthMap.set(serverIndex, existing);
  }

  /**
   * Actively probe upstream server health.
   */
  public async checkHealth(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const servers = this.getBaseUrls();
      await Promise.allSettled(
        servers.map(async (serverUrl, idx) => {
          const timeout = 3000;
          const headers: Record<string, string> = {
            'Accept': 'application/json'
          };
          if (config.adminSecretKey) {
            headers['Authorization'] = `Bearer ${config.adminSecretKey}`;
          }

          try {
            const probeUrl = `${serverUrl}/api/status`;
            const res = await fetch(probeUrl, {
              method: 'GET',
              headers,
              timeout
            });

            // Any HTTP response (2xx, 3xx, 401, 403, 404, etc.) proves host is alive and reachable
            // 502/503 indicates an upstream gateway outage
            if (res.status === 502 || res.status === 503) {
              this.setNodeHealth(idx, false, `HTTP ${res.status}`);
            } else {
              this.setNodeHealth(idx, true);
            }
          } catch (err: any) {
            this.setNodeHealth(idx, false, err.message || 'Connection failed');
          }
        })
      );
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Starts periodic background health check (every 20s by default).
   */
  public startHealthCheck(intervalMs: number = 20000): void {
    if (this.healthCheckTimer) return;
    // Immediate initial probe asynchronously
    this.checkHealth().catch(() => {});
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth().catch(() => {});
    }, intervalMs);
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }

  /**
   * Stops periodic background health check.
   */
  public stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Selects an upstream server based on model-specific round-robin,
   * explicit server index, or global round-robin, filtering out offline nodes.
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

    // 2. Filter healthy servers
    const healthyList = servers
      .map((url, idx) => ({ url, idx }))
      .filter(item => {
        const h = this.healthMap.get(item.idx);
        return h ? h.isHealthy : true;
      });

    // If all servers are marked unhealthy, fall back to full pool to prevent 100% hard failure
    const candidatePool = healthyList.length > 0
      ? healthyList
      : servers.map((url, idx) => ({ url, idx }));

    if (healthyList.length === 0 && servers.length > 1) {
      logger.warn(`[UpstreamManager] All upstream servers marked offline/unhealthy, falling back to full cluster`);
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
   * Resets internal counters and health cache.
   */
  public reset(): void {
    this.modelCounters.clear();
    this.globalCounter = 0;
    this.healthMap.clear();
  }
}

export const upstreamManager = new UpstreamManager();
export default upstreamManager;
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/upstreamHealthCheck.test.ts`
Expected: PASS

- [x] **Step 5: Run existing tests to ensure no regressions**

Run: `npx jest tests/upstreamManager.test.ts tests/multiServerProxy.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/utils/upstreamManager.ts tests/upstreamHealthCheck.test.ts
git commit -m "feat(upstream): implement upstream active health checking and dead node bypass"
```

---

### Task 2: Account Controller Health Status Integration

**Files:**
- Modify: `src/admin/controllers/accountController.ts`
- Test: `tests/accountController.test.ts`

**Interfaces:**
- Consumes: `upstreamManager.getHealthStatusList()`
- Produces: `GET /api/admin/accounts/servers` returns `{ servers: string[], health: UpstreamHealthStatus[] }`

- [x] **Step 1: Write the failing test for `getServers` health response**

Add to `tests/accountController.test.ts`:
```typescript
  it('should return servers and health status list from getServers', async () => {
    const res = await request(app)
      .get('/api/admin/accounts/servers')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.servers)).toBe(true);
    expect(Array.isArray(res.body.health)).toBe(true);
    if (res.body.health.length > 0) {
      expect(res.body.health[0]).toHaveProperty('isHealthy');
      expect(res.body.health[0]).toHaveProperty('serverUrl');
    }
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountController.test.ts`
Expected: FAIL with `expect(Array.isArray(res.body.health)).toBe(true)` failing.

- [x] **Step 3: Update `src/admin/controllers/accountController.ts`**

Update `getServers` method:
```typescript
  public async getServers(req: Request, res: Response): Promise<void> {
    res.json({
      servers: upstreamManager.getBaseUrls(),
      health: upstreamManager.getHealthStatusList()
    });
  }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountController.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/admin/controllers/accountController.ts tests/accountController.test.ts
git commit -m "feat(admin): expose upstream server health list in accounts servers endpoint"
```

---

### Task 3: Bilingual i18n Translations for Node Status & Simplified UI

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Produces:
  - `accounts.nodeOnline` ("在线" / "Online")
  - `accounts.nodeOffline` ("离线" / "Offline")
  - `accounts.nodeConnectionFailed` ("无法连接到该节点" / "Failed to connect to node")
  - `accounts.retryNode` ("重试连接" / "Retry Connection")
  - `accounts.refreshAll` ("刷新全部节点" / "Refresh All Nodes")
  - `accounts.offlineTip` ("当前节点无法访问，模型路由已自动跳过该节点。" / "This node is unreachable and automatically bypassed by model routing.")

- [x] **Step 1: Add keys to `frontend/src/i18n/locales/zh.ts`**

In `accounts` section of `frontend/src/i18n/locales/zh.ts`, add:
```typescript
    nodeOnline: "在线",
    nodeOffline: "离线",
    nodeConnectionFailed: "无法连接到该节点",
    retryNode: "重试连接",
    refreshAll: "刷新全部节点",
    offlineTip: "当前节点无法访问，模型请求已自动跳过该节点��"
```

- [x] **Step 2: Add keys to `frontend/src/i18n/locales/en.ts`**

In `accounts` section of `frontend/src/i18n/locales/en.ts`, add:
```typescript
    nodeOnline: "Online",
    nodeOffline: "Offline",
    nodeConnectionFailed: "Failed to connect to node",
    retryNode: "Retry Connection",
    refreshAll: "Refresh All Nodes",
    offlineTip: "This node is unreachable and automatically bypassed by model routing."
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add node health and simplified accounts view translations"
```

---

### Task 4: AccountsView Concurrent Refresh & Viewport Space Optimization

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`
- Modify: `tests/accountsMultiServerIsolation.test.ts`

**Interfaces:**
- Consumes:
  - `/api/admin/accounts/servers` (returns `servers` and `health`)
  - `/api/admin/accounts/status?serverId=idx`
- Produces:
  - Concurrent `fetchAllServers(silent = false)` populating `serverDataMap`
  - Tab header displaying green dot (healthy) / red dot + `[ 离线 ]` badge (unhealthy) / spinner (loading)
  - Removal of 6 stats cards (`Total Accounts`, `Active`, `Activating`, `Retired`, `Disabled`, `Inactive`)
  - Removal of Server Scope Banner
  - Offline empty state in table container when active node fails to load and has no accounts

- [x] **Step 1: Write failing unit test in `tests/accountsMultiServerIsolation.test.ts`**

Update `tests/accountsMultiServerIsolation.test.ts`:
```typescript
import fs from 'fs';
import path from 'path';

describe('AccountsView Multi-Server Concurrent Refresh & Simplified UI', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  const accountsViewContent = fs.readFileSync(accountsViewPath, 'utf-8');

  test('implements concurrent fetchAllServers querying all servers at once', () => {
    expect(accountsViewContent).toContain('fetchAllServers');
    expect(accountsViewContent).toMatch(/Promise\.allSettled/);
  });

  test('displays clear online / offline health indicators on server tabs', () => {
    expect(accountsViewContent).toContain('accounts.nodeOffline');
    expect(accountsViewContent).toMatch(/bg-rose-500/);
    expect(accountsViewContent).toMatch(/bg-emerald-500/);
  });

  test('removes 6 stats chips and server scope banner for maximized viewport', () => {
    // Should NOT contain the old stats chips grid
    expect(accountsViewContent).not.toContain('stats.totalAccounts');
    expect(accountsViewContent).not.toContain('t(\'accounts.serverScope\'');
    // Scope banner removed
    expect(accountsViewContent).not.toContain('t(\'accounts.scopeDesc\'');
  });

  test('renders node offline fallback state when active server is unreachable', () => {
    expect(accountsViewContent).toContain('accounts.nodeConnectionFailed');
    expect(accountsViewContent).toContain('accounts.retryNode');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountsMultiServerIsolation.test.ts`
Expected: FAIL due to missing `fetchAllServers`, old banner still present, etc.

- [x] **Step 3: Implement concurrent refresh, health display, and UI simplification in `AccountsView.tsx`**

In `frontend/src/components/AccountsView.tsx`:
1. Add `serverHealthMap` state: `const [serverHealthMap, setServerHealthMap] = useState<Record<number, boolean>>({});`
2. Update `fetchServers` to parse `health` list and initialize `serverHealthMap`.
3. Replace single-server `fetchStatus` with `fetchAllServers` using `Promise.allSettled`:
```typescript
  const fetchAllServers = async (silent = false) => {
    if (!silent) setGlobalLoading(true);
    try {
      await Promise.allSettled(
        servers.map(async (_, idx) => {
          setServerLoadingMap(prev => ({ ...prev, [idx]: true }));
          try {
            const res = await fetch(getApiUrl('/api/admin/accounts/status', idx), {
              headers: getHeaders()
            });
            if (res.ok) {
              const json = await res.json();
              setServerDataMap(prev => ({ ...prev, [idx]: json }));
              setServerErrorMap(prev => ({ ...prev, [idx]: null }));
              setServerHealthMap(prev => ({ ...prev, [idx]: true }));
            } else {
              const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
              setServerErrorMap(prev => ({ ...prev, [idx]: err.error || `HTTP ${res.status}` }));
              setServerHealthMap(prev => ({ ...prev, [idx]: false }));
            }
          } catch (e: any) {
            setServerErrorMap(prev => ({ ...prev, [idx]: e.message }));
            setServerHealthMap(prev => ({ ...prev, [idx]: false }));
          } finally {
            setServerLoadingMap(prev => ({ ...prev, [idx]: false }));
          }
        })
      );
    } finally {
      if (!silent) setGlobalLoading(false);
    }
  };
```
4. Tab switch handler: `handleSwitchServer(idx)` simply sets `activeServerIndex(idx)` without loading delay.
5. In Multi-Server Tabs:
   - Check `const isOffline = serverHealthMap[idx] === false || Boolean(serverErrorMap[idx]);`
   - If offline: render red indicator (`bg-rose-500`) and a red badge: `<span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">{t('accounts.nodeOffline')}</span>`
   - If online: render green indicator (`bg-emerald-500`) and account count.
6. Remove Server Scope Banner entirely.
7. Remove the 6 stats chips cards (`Total Accounts`, `Active`, `Activating`, `Retired`, `Disabled`, `Inactive`).
8. Add offline fallback card in table section if `isCurrentOffline && accounts.length === 0`:
```tsx
  {isCurrentOffline && accounts.length === 0 ? (
    <div className="ui-card p-12 text-center flex flex-col items-center justify-center space-y-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
        <AlertCircle className="w-6 h-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t('accounts.nodeConnectionFailed')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
          {currentError || t('accounts.offlineTip')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => fetchSingleServer(false, activeServerIndex)}
        className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer shadow-sm shadow-indigo-500/20"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>{t('accounts.retryNode')}</span>
      </button>
    </div>
  ) : (
    /* Table rendering */
  )}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountsMultiServerIsolation.test.ts`
Expected: PASS

- [x] **Step 5: Run frontend build to verify compilation**

Run: `npm run build:frontend`
Expected: PASS with 0 errors.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountsMultiServerIsolation.test.ts
git commit -m "feat(accounts): simplify multi-server refresh with concurrent fetching and tab health badges"
```

---

### Task 5: Full Regression Testing & Verification

**Files:**
- Run all test suites
- Build frontend and backend

- [x] **Step 1: Run complete backend & integration test suite**

Run: `npm test`
Expected: All test suites pass.

- [x] **Step 2: Build full production bundle**

Run: `npm run build`
Expected: Both frontend Vite SPA and backend TypeScript compile cleanly to `dist/`.

- [x] **Step 3: Commit any lingering changes or docs**

```bash
git status
git commit -m "chore: complete account management simplification and health check integration"
```

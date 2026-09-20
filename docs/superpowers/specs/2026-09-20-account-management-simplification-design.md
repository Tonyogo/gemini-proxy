# Design Doc: Account Management Simplification, Concurrent Multi-Server Refresh & Health Checking

- **Date:** 2026-09-20
- **Topic:** Account Management Multi-Server Concurrent Refresh, Tab Health Status Display, UI Space Optimization, and Backend Upstream Health Check Routing
- **Status:** Approved

## 1. Overview & Objectives

In environments configuring multiple upstream Gemini servers (`GEMINI_BASE_URL` with multiple comma-separated upstream URLs):
1. **Frontend Latency & Switching Complexity**: Lazy-loading each server tab individually creates unnecessary async waiting, spinners, and race condition mitigations.
2. **Lack of Visual Node Health Status**: Users cannot tell at a glance from the Tab bar whether an upstream node is running, unreachable, or dead.
3. **Screen Real Estate Congestion**: The top account stats cards (Total, Active, Activating, Retired, Disabled, Inactive) and persistent Server Scope Banner occupy significant vertical space, cramping the main account data table.
4. **Backend Blind Routing to Dead Nodes**: When an upstream server crashes or goes offline, `UpstreamManager` continues blindly routing model requests to that dead node via round-robin, leading to request timeouts and 502 Bad Gateway responses for client applications.

### Core Goals:
1. **Simplified Concurrent Multi-Server Refresh**: On page load or manual refresh, simultaneously query all configured upstream servers (`Promise.allSettled`), caching responses into `serverDataMap`. Tab switches become instantaneous memory-based state toggles.
2. **Prominent Tab Health Indicator**: Display green online dots, red offline badges (`Offline / 离线`), and account count pills directly on each server tab.
3. **Maximized Viewport for Accounts Table**:
   - Completely remove the 6 account stats cards.
   - Completely remove the redundant Server Scope Banner.
   - Deliver an uncluttered, high-efficiency account management workspace.
4. **Backend Upstream Health Checking & Automatic Routing Bypass**:
   - Implement an active background heartbeat checker in `UpstreamManager` (probing upstream `/api/status` or base endpoint every 20s with a 3s timeout).
   - In `getUpstreamServer()`, dynamically filter out unhealthy/offline nodes during model and global round-robin scheduling.
   - Graceful fallback: If all servers fail health checks, fall back to the full cluster to prevent total service refusal.
5. **Full Bilingual Internationalization (i18n)** in Chinese and English.

---

## 2. Backend Architecture & Health Check Implementation

### 2.1 Health Status Schema (`src/utils/upstreamManager.ts`)
```typescript
export interface UpstreamHealthStatus {
  serverUrl: string;
  serverIndex: number;
  isHealthy: boolean;
  lastChecked: number;
  lastError?: string;
  consecutiveFailures: number;
}
```

### 2.2 Background Heartbeat Prober
- **Default Parameters**:
  - Heartbeat Interval: `20,000ms` (20 seconds).
  - Probe Timeout: `3,000ms` (3 seconds).
- **Probe Mechanism**:
  - Uses `node-fetch` with `AbortController` (or timeout option).
  - Sends a lightweight `GET /api/status` or `HEAD /` request with admin authentication header if configured.
  - Any HTTP response (including 200, 401, 403, 404) confirms process accessibility and marks `isHealthy = true`.
  - Network errors (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `502`, `503`, `AbortError`) mark `isHealthy = false` and record `lastError`.
- **Lifecycle Management**:
  - Starts automatically on process boot / first access.
  - Can be stopped or reset during testing via `stopHealthCheck()` / `reset()`.

### 2.3 Upstream Selection Algorithm (`getUpstreamServer`)
```typescript
public getUpstreamServer(options?: { model?: string; serverIndex?: number }): UpstreamServerSelection {
  const allServers = this.getBaseUrls();
  if (allServers.length === 0) {
    return { serverUrl: 'https://generativelanguage.googleapis.com', serverIndex: 0 };
  }

  // 1. Explicit serverIndex request (e.g. from AccountController targeting a specific server)
  if (options?.serverIndex !== undefined && !isNaN(options.serverIndex)) {
    const idx = Math.abs(Math.floor(options.serverIndex)) % allServers.length;
    return { serverUrl: allServers[idx], serverIndex: idx };
  }

  // 2. Filter healthy nodes
  const healthyIndices = allServers
    .map((url, idx) => ({ url, idx }))
    .filter(item => this.healthStatus.get(item.idx)?.isHealthy ?? true);

  // Fallback to all servers if every node is reported unhealthy
  const candidatePool = healthyIndices.length > 0
    ? healthyIndices
    : allServers.map((url, idx) => ({ url, idx }));

  // 3. Per-model round-robin across candidate pool
  if (options?.model) {
    const current = this.modelCounters.get(options.model) || 0;
    const selection = candidatePool[current % candidatePool.length];
    this.modelCounters.set(options.model, (current + 1) % 100000000);
    return { serverUrl: selection.url, serverIndex: selection.idx };
  }

  // 4. Global round-robin fallback across candidate pool
  const selection = candidatePool[this.globalCounter % candidatePool.length];
  this.globalCounter = (this.globalCounter + 1) % 100000000;
  return { serverUrl: selection.url, serverIndex: selection.idx };
}
```

### 2.4 Server Health Metadata Endpoint
Enhance `AccountController.getServers` to return health metadata:
```typescript
public async getServers(req: Request, res: Response): Promise<void> {
  res.json({
    servers: upstreamManager.getBaseUrls(),
    health: upstreamManager.getHealthStatusList()
  });
}
```

---

## 3. Frontend Architecture & UI Simplification

### 3.1 Concurrent Fetching (`AccountsView.tsx`)
```typescript
const fetchAllServers = async (silent = false) => {
  if (!silent) setGlobalLoading(true);
  try {
    await Promise.allSettled(
      servers.map(async (_, idx) => {
        setServerLoadingMap(prev => ({ ...prev, [idx]: true }));
        try {
          const res = await fetch(getApiUrl('/api/admin/accounts/status', idx), { headers: getHeaders() });
          if (res.ok) {
            const json = await res.json();
            setServerDataMap(prev => ({ ...prev, [idx]: json }));
            setServerErrorMap(prev => ({ ...prev, [idx]: null }));
          } else {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            setServerErrorMap(prev => ({ ...prev, [idx]: err.error || `HTTP ${res.status}` }));
          }
        } catch (e: any) {
          setServerErrorMap(prev => ({ ...prev, [idx]: e.message }));
        } finally {
          setServerLoadingMap(prev => ({ ...prev, [idx]: false }));
        }
      })
    );
  } finally {
    setGlobalLoading(false);
  }
};
```

### 3.2 Rich Server Tab Presentation
- **Online Node**:
  - Green pulsing indicator (`bg-emerald-500 ring-2 ring-emerald-500/20`).
  - Server index and truncated hostname: `Server 1 (upstream-1.internal)`.
  - Account count badge: `[ 18 ]`.
- **Offline / Error Node**:
  - Red indicator (`bg-rose-500 ring-2 ring-rose-500/20`).
  - Red alert badge: `[ Offline ]` / `[ 离线 ]`.
- **Loading Node**:
  - Spinner animation icon (`RefreshCw`).

### 3.3 Elimination of Redundant UI Elements
- **Remove Stats Chips**: Completely eliminate the 6 account statistics cards (`Total Accounts`, `Active`, `Activating`, `Retired`, `Disabled`, `Inactive`).
- **Remove Server Scope Banner**: Completely eliminate the colored scope notification banner above the table.
- **Offline State Guard in Table View**: If the active server is offline and has no cached accounts, display a clean empty state card with an error explanation and a "Retry Connection" button.

---

## 4. Internationalization (i18n)

Add translations in `frontend/src/i18n/locales/zh.ts` and `en.ts`:
- `accounts.nodeOnline`: 在线 / Online
- `accounts.nodeOffline`: 离线 / Offline
- `accounts.nodeConnectionFailed`: 无法连接到该节点 / Failed to connect to node
- `accounts.retryNode`: 重试连接 / Retry Connection
- `accounts.refreshAll`: 刷新所有节点 / Refresh All Nodes

---

## 5. Testing & Verification

1. **Upstream Health Check Unit Tests (`tests/upstreamHealthCheck.test.ts`)**:
   - Verify health probe updates `isHealthy` when upstream succeeds or fails.
   - Verify `getUpstreamServer()` skips unhealthy nodes during model and global round-robin.
   - Verify fallback behavior when all nodes are marked unhealthy.
2. **Account Controller Tests**:
   - Verify `GET /api/admin/accounts/servers` returns `health` status array alongside server URLs.
3. **Frontend Component & Integration Tests (`tests/accountsMultiServerIsolation.test.ts`)**:
   - Verify concurrent fetch populates `serverDataMap` for all servers simultaneously.
   - Verify removal of stats cards and scope banner frees viewport space.
   - Verify tab badges reflect node online/offline states.
4. **Full Regression Build**:
   - `npm run build`: Zero errors.
   - `npm test`: All tests pass.

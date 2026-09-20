# Design Doc: Model Request Passive Circuit Breaker (3-Failures / 180s), Accounts Direct-Status & Modern Header

- **Date:** 2026-09-20
- **Topic:** Remove background active health check, implement 3-consecutive-failure / 180s circuit breaker for model proxy requests, display node online/offline status directly from page status API, and modernize the account management page header.
- **Status:** Approved

## 1. Overview & Objectives

1. **Eliminate Background Active Health Probing**:
   - The previously introduced background heartbeat prober (`setInterval` polling `/api/status` every 20s) introduces periodic network noise, wastes VPS bandwidth, and pollutes upstream server access logs.
2. **Implement Passive Request Circuit Breaker**:
   - Replace active polling with passive error observation on actual model proxy requests (Claude Messages & Gemini Native APIs).
   - If a target upstream node encounters **3 consecutive failures** (defined strictly as network disconnects, timeouts, or gateway 502/503/504 errors), automatically isolate that node for **180 seconds**.
   - Model request routing (`UpstreamManager.getUpstreamServer`) automatically skips isolated nodes.
   - Any successful request resets that node's failure count to 0.
   - Fallback: If 100% of nodes are isolated, fall back to the full cluster to prevent hard rejection.
3. **Accounts View Direct-Status Display**:
   - The web console Account Management view (`AccountsView.tsx`) determines whether a node is online or offline solely based on the HTTP response of its own `/api/admin/accounts/status?serverId=idx` requests.
   - 200 OK -> Online (green dot + accounts count).
   - Network failure or HTTP error -> Offline (red dot + `[ 离线 ]` badge).
4. **Modernize Accounts View Header**:
   - Replace the legacy, heavy, text-heavy header with a modern, compact, Linear/Tailwind-styled header featuring an icon container, concise title, dynamic node-count badge, and brief subtitle aligned with the Dashboard and Discover views.

---

## 2. UpstreamManager Passive Circuit Breaker Architecture

### 2.1 Circuit State Schema (`src/utils/upstreamManager.ts`)
```typescript
export interface UpstreamCircuitState {
  serverUrl: string;
  serverIndex: number;
  consecutiveFailures: number;
  isolatedUntil: number; // Timestamp in ms until node is isolated; 0 if healthy
  lastError?: string;
}
```

### 2.2 Circuit Breaker API
- Remove `startHealthCheck()`, `stopHealthCheck()`, `checkHealth()`, and `healthCheckTimer`.
- Provide `recordRequestResult(serverIndex: number, success: boolean, error?: string): void`:
  - `success === true`: sets `consecutiveFailures = 0`, `isolatedUntil = 0`, `lastError = undefined`.
  - `success === false`: increments `consecutiveFailures += 1`. If `consecutiveFailures >= 3`, sets `isolatedUntil = Date.now() + 180_000` (180 seconds isolation).
- Provide `getCircuitStatusList(): UpstreamCircuitState[]`.
- Provide `isNodeAvailable(serverIndex: number): boolean`:
  - Returns `true` if `isolatedUntil <= Date.now()`.

### 2.3 Routing Dispatch (`getUpstreamServer`)
```typescript
public getUpstreamServer(options?: { model?: string; serverIndex?: number }): UpstreamServerSelection {
  const servers = this.getBaseUrls();
  if (servers.length === 0) {
    return { serverUrl: 'https://generativelanguage.googleapis.com', serverIndex: 0 };
  }

  // 1. Explicit serverIndex request (e.g. from AccountController targeting a specific server)
  if (options?.serverIndex !== undefined && !isNaN(options.serverIndex)) {
    const idx = Math.abs(Math.floor(options.serverIndex)) % servers.length;
    return { serverUrl: servers[idx], serverIndex: idx };
  }

  const now = Date.now();
  // 2. Filter out nodes currently isolated under circuit breaker
  const availableServers = servers
    .map((url, idx) => ({ url, idx }))
    .filter(item => {
      const state = this.circuitMap.get(item.idx);
      return !state || state.isolatedUntil <= now;
    });

  // Fallback to all servers if every node is isolated
  const candidatePool = availableServers.length > 0
    ? availableServers
    : servers.map((url, idx) => ({ url, idx }));

  if (availableServers.length === 0 && servers.length > 1) {
    logger.warn(`[UpstreamManager] All upstream servers currently isolated, falling back to full cluster`);
  }

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

### 2.4 Integration into Proxy Controllers
In `claudeController.ts` and `geminiController.ts`:
- Check response status:
  - If network error (`err.code === 'ECONNREFUSED' || 'ETIMEDOUT' || 'ENOTFOUND'` or fetch AbortError/Timeout) OR HTTP `502 / 503 / 504`:
    call `upstreamManager.recordRequestResult(serverIndex, false, err.message || response.status)`.
  - On valid response (200, or legitimate 4xx client/model errors):
    call `upstreamManager.recordRequestResult(serverIndex, true)`.

---

## 3. Account Management Frontend & Header Redesign

### 3.1 Direct Status Observation
- `AccountsView.tsx` executes `fetchAllServers`:
  - If `GET /api/admin/accounts/status?serverId=idx` returns 200:
    `serverHealthMap[idx] = true`
  - If it returns an error or throws:
    `serverHealthMap[idx] = false`, `serverErrorMap[idx] = err.message`
- Tab indicators reflect `serverHealthMap[idx]` in real time without background lag.

### 3.2 Header Modernization
Replace the legacy header in `AccountsView.tsx`:
```tsx
<div className="hidden sm:flex items-center justify-between pb-1">
  <div className="flex items-center space-x-3">
    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 shadow-sm shadow-indigo-500/10">
      <Users className="w-5 h-5" />
    </div>
    <div>
      <div className="flex items-center space-x-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          {t('accounts.title')}
        </h1>
        <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
          {servers.length > 1 ? `${servers.length} Nodes` : 'Single Node'}
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        {t('accounts.modernSub', 'Manage multi-account credentials, automatic context rotation, and usage quotas.')}
      </p>
    </div>
  </div>
</div>
```

---

## 4. Internationalization (i18n)

Update `zh.ts` and `en.ts`:
- `accounts.modernSub`: "集中管理多节点账号凭据、状态监控与上下文轮换" / "Centralized multi-node credentials, monitoring, and context rotation"
- Ensure `accounts.nodeOnline`, `accounts.nodeOffline`, `accounts.nodeConnectionFailed`, `accounts.retryNode` are maintained.

---

## 5. Testing & Verification

1. **Circuit Breaker Tests (`tests/upstreamCircuitBreaker.test.ts`)**:
   - Verify 1 or 2 failures do NOT isolate node.
   - Verify 3 consecutive failures trigger 180s isolation.
   - Verify successful request resets failure count to 0.
   - Verify isolated node is skipped during model and global round-robin routing.
   - Verify fallback when 100% of nodes are isolated.
   - Verify explicit `serverIndex` is always honored.
2. **Proxy Controller Circuit Breaker Integration Tests**:
   - Verify network failure triggers `recordRequestResult(serverIndex, false)`.
3. **Frontend Tests (`tests/accountsMultiServerIsolation.test.ts`)**:
   - Verify direct status rendering on tabs based on status API results.
   - Verify modern header layout structure and absence of legacy text.
4. **Full Regression**:
   - Run `npm test` across all 117+ suites.
   - Run `npm run build` for complete production compilation.

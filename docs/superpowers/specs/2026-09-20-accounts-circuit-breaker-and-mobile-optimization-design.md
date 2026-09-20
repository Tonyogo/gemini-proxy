# Design Doc: Bidirectional Circuit Breaker Integration for Accounts & Mobile Experience Optimization

- **Date:** 2026-09-20
- **Topic:** Extend passive circuit breaker policy to AccountService API calls, support immediate recovery of isolated nodes upon successful account requests, and optimize AccountsView mobile layout (compact tab capsules, mobile node status bar).
- **Status:** Approved

## 1. Overview & Objectives

1. **Bidirectional Circuit Breaker Integration in Account Management**:
   - Currently, only proxy model calls (Claude and Gemini controllers) report outcomes to `upstreamManager.recordRequestResult()`.
   - If an upstream node crashes or is offline, account management requests (`AccountService.request`) also experience 502s or network errors. These failures must feed into the circuit breaker counter so repeated failures isolate the node.
   - Crucially, **any successful account request (e.g., manual "Retry Connection", successful `/api/status`, upload, delete, or context release) must immediately clear the isolation state (`consecutiveFailures = 0`, `isolatedUntil = 0`)**, instantly unblocking model proxy routing without waiting for the 180s isolation countdown to expire.
2. **Mobile Viewport & Interaction Optimization for AccountsView**:
   - **Compact Multi-Server Tab Capsules**: On mobile screens (`< sm`), long hostnames overflow horizontally. Replace desktop-length labels with compact capsules: `● S1 [ 18 ]` or `● S1 [ 离线 ]`.
   - **Dedicated Mobile Node Status Bar**: For multi-server configurations on mobile, display an ultra-compact single-row environment bar above the toolbar indicating the active server, host, online/offline status, and account count without wasting vertical space.
   - **Mobile Touch Refinements**: Polish touch target spacing and row rhythm in the native mobile card list.

---

## 2. Backend Bidirectional Circuit Breaker Architecture

### 2.1 Integration into `AccountService.request` (`src/admin/services/accountService.ts`)
```typescript
private async request(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  data?: any,
  params?: Record<string, string>,
  serverIndex?: number
) {
  const serverSelection = upstreamManager.getUpstreamServer({ serverIndex });
  const actualIndex = serverSelection.serverIndex;
  const url = `${serverSelection.serverUrl}${path.startsWith('/') ? path : '/' + path}`;

  try {
    const res = await fetch(url, options);

    if (res.status >= 502 && res.status <= 504) {
      // Gateway error -> record failure
      upstreamManager.recordRequestResult(actualIndex, false, `HTTP ${res.status}`);
    } else {
      // Any valid HTTP response (200, 400, 401, 404, etc.) confirms node is alive -> recover node immediately!
      upstreamManager.recordRequestResult(actualIndex, true);
    }

    // Process and return response...
  } catch (err: any) {
    // Network failure (ECONNREFUSED, ETIMEDOUT, ENOTFOUND) -> record failure
    upstreamManager.recordRequestResult(actualIndex, false, err.message);
    return {
      status: 502,
      data: { error: `Upstream error: ${err.message}` },
      headers: {}
    };
  }
}
```

### 2.2 Immediate Recovery Semantics
In `UpstreamManager.recordRequestResult(serverIndex, success, error)`:
- When `success === true`:
  - `existing.consecutiveFailures = 0`
  - `existing.isolatedUntil = 0`
  - `existing.lastError = undefined`
- This ensures that if an operator clicks "Retry Connection" in the Web Console and the upstream node responds, the node is immediately restored for all model requests.

---

## 3. Frontend Mobile Viewport Optimization (`AccountsView.tsx`)

### 3.1 Compact Server Tab Capsules on Mobile
- Responsive label formatting:
  - Desktop (`sm:` and above): `Server 1 (node1.internal) [ 18 ]`
  - Mobile (`< sm`): `S1 [ 18 ]` or `S1 [ 离线 ]`
- Reduced padding and gap on mobile: `px-2 py-1 gap-1 text-[11px]`

### 3.2 Mobile Active Node Status Indicator
Rendered on mobile (`block sm:hidden`) when `servers.length > 1`:
```tsx
{servers.length > 1 && (
  <div className="flex sm:hidden items-center justify-between px-2.5 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-[var(--border-subtle)] text-[11px]">
    <div className="flex items-center space-x-1.5 min-w-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCurrentOffline ? 'bg-rose-500 ring-2 ring-rose-500/20' : 'bg-emerald-500 ring-2 ring-emerald-500/20'}`} />
      <span className="font-semibold text-slate-800 dark:text-slate-200 shrink-0">
        Server {activeServerIndex + 1}
      </span>
      <span className="font-mono text-slate-400 dark:text-slate-500 truncate max-w-[130px]">
        ({getServerHost(servers[activeServerIndex])})
      </span>
    </div>
    <div className="flex items-center space-x-1.5 shrink-0 text-[10px]">
      <span className={isCurrentOffline ? 'text-rose-500 font-medium' : 'text-emerald-500 font-medium'}>
        {isCurrentOffline ? t('accounts.nodeOffline') : t('accounts.nodeOnline')}
      </span>
      <span className="text-slate-400 font-mono">· {accounts.length} {t('accounts.accountUnit', 'accounts')}</span>
    </div>
  </div>
)}
```

---

## 4. Internationalization (i18n)

Add to `zh.ts` and `en.ts`:
- `accounts.accountUnit`: "个账号" / "accounts"
- `accounts.mobileTabShort`: "S{index}"

---

## 5. Testing & Verification

1. **AccountService Circuit Breaker Integration Tests (`tests/accountServiceCircuitBreaker.test.ts`)**:
   - Verify that network error in `accountService.getStatus(index)` records failure in `upstreamManager`.
   - Verify that 3 consecutive failures via `accountService` isolate the node.
   - Verify that a subsequent successful `accountService` call immediately resets isolation and failure count to 0.
2. **Frontend Multi-Server Isolation & Mobile Tests (`tests/accountsMultiServerIsolation.test.ts`)**:
   - Verify mobile compact tab capsules rendering.
   - Verify mobile active node status bar rendering.
3. **Full Test & Build Suite**:
   - Run `npm test`.
   - Run `npm run build`.

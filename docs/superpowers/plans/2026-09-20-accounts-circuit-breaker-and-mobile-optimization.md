# Accounts Circuit Breaker Integration & Mobile Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate passive circuit breaker into `accountService.ts` so account management requests report failure on network/gateway errors and immediately recover isolated nodes upon success, and optimize `AccountsView.tsx` mobile layout with compact tab capsules and a dedicated single-line active node status bar.

**Architecture:**
1. `accountService.ts` wraps its central `request()` method with `upstreamManager.recordRequestResult()`. When requests succeed (200 or client responses), the node is instantly recovered (`consecutiveFailures = 0, isolatedUntil = 0`). When requests fail (network errors, timeouts, 502–504), failure counts increment toward the 3-failure isolation threshold.
2. `AccountsView.tsx` adopts responsive tab capsules (`S1 [ 18 ]` on mobile, `Server 1 (host) [ 18 ]` on desktop), and displays an ultra-compact single-row environment status bar on mobile when multiple servers are configured.

**Tech Stack:** TypeScript, Node.js, Express, React 18, Tailwind CSS, Lucide React, Jest.

## Global Constraints
- **Immediate Recovery Semantics**: Successful account requests must immediately clear isolation state in `UpstreamManager`.
- **Zero Polling**: Do not introduce background timers.
- **Bilingual i18n**: Parity across `zh.ts` and `en.ts`.
- **Clean Regression**: All existing 117 test suites must pass.

---

### Task 1: AccountService Circuit Breaker Integration & Immediate Recovery

**Files:**
- Modify: `src/admin/services/accountService.ts`
- Test: `tests/accountServiceCircuitBreaker.test.ts`

**Interfaces:**
- Consumes: `upstreamManager.recordRequestResult(actualIndex, success, error)`
- Produces:
  - Account API failures (502-504, connection errors) increment node failure counter.
  - Account API successes (200, valid HTTP status) immediately clear isolation for that node.

- [x] **Step 1: Write the failing unit test for AccountService circuit breaker reporting and recovery**

Create `tests/accountServiceCircuitBreaker.test.ts`:
```typescript
import accountService from '../src/admin/services/accountService';
import upstreamManager from '../src/utils/upstreamManager';
import config, { updateConfig } from '../config/default';
import fetch from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = fetch as unknown as jest.Mock;

describe('AccountService Circuit Breaker Integration & Instant Recovery', () => {
  const originalUrl = config.geminiBaseUrl;

  beforeEach(async () => {
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  it('records failure in upstreamManager when account request fails with network error or 502', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    mockedFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    await accountService.getStatus(1);

    const circuit = upstreamManager.getCircuitStatusList()[1];
    expect(circuit.consecutiveFailures).toBe(1);
    expect(circuit.lastError).toContain('ECONNREFUSED');
  });

  it('isolates node when account service encounters 3 consecutive network failures', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    mockedFetch.mockRejectedValue(new Error('ETIMEDOUT'));

    await accountService.getStatus(0);
    await accountService.getStatus(0);
    await accountService.getStatus(0);

    expect(upstreamManager.isNodeIsolated(0)).toBe(true);
    const circuit = upstreamManager.getCircuitStatusList()[0];
    expect(circuit.consecutiveFailures).toBe(3);
    expect(circuit.isolatedUntil).toBeGreaterThan(Date.now());
  });

  it('immediately clears isolation and resets failures when an account request succeeds', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    // Artificially isolate node 1
    upstreamManager.recordRequestResult(1, false, 'Fail 1');
    upstreamManager.recordRequestResult(1, false, 'Fail 2');
    upstreamManager.recordRequestResult(1, false, 'Fail 3');
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    // Mock successful status response
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ status: { accountDetails: [] } })
    });

    const res = await accountService.getStatus(1);
    expect(res.status).toBe(200);

    // Node 1 should be immediately recovered!
    expect(upstreamManager.isNodeIsolated(1)).toBe(false);
    const circuit = upstreamManager.getCircuitStatusList()[1];
    expect(circuit.consecutiveFailures).toBe(0);
    expect(circuit.isolatedUntil).toBe(0);
    expect(circuit.lastError).toBeUndefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountServiceCircuitBreaker.test.ts`
Expected: FAIL because `accountService.request` does not yet call `upstreamManager.recordRequestResult`.

- [x] **Step 3: Update `src/admin/services/accountService.ts`**

In `src/admin/services/accountService.ts`:
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
    let url = `${serverSelection.serverUrl}${path.startsWith('/') ? path : '/' + path}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      const queryStr = searchParams.toString();
      if (queryStr) {
        url += (url.includes('?') ? '&' : '?') + queryStr;
      }
    }

    try {
      const options: any = {
        method: method.toUpperCase(),
        headers: this.getHeaders(),
        timeout: config.upstreamTimeoutMs || 30000
      };

      if (data !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
        options.body = JSON.stringify(data);
      }

      const res = await fetch(url, options);

      // Check upstream gateway failure vs success
      if (res.status >= 502 && res.status <= 504) {
        upstreamManager.recordRequestResult(actualIndex, false, `HTTP ${res.status}`);
      } else {
        // Any other valid HTTP response (200, 400, 401, 403, 404, etc.) proves host is alive -> immediately recover!
        upstreamManager.recordRequestResult(actualIndex, true);
      }

      const contentType = res.headers.get('content-type') || '';

      let resData: any;
      if (contentType.includes('application/json')) {
        try {
          resData = await res.json();
        } catch {
          resData = await res.text();
        }
      } else {
        resData = await res.text();
      }

      const headersObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      return {
        status: res.status,
        data: resData,
        headers: headersObj
      };
    } catch (err: any) {
      upstreamManager.recordRequestResult(actualIndex, false, err.message);
      return {
        status: 502,
        data: { error: `Upstream error: ${err.message}` },
        headers: {}
      };
    }
  }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountServiceCircuitBreaker.test.ts`
Expected: PASS

- [x] **Step 5: Run existing accountService tests to verify no regressions**

Run: `npx jest tests/accountService.test.ts tests/accountController.test.ts`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/admin/services/accountService.ts tests/accountServiceCircuitBreaker.test.ts
git commit -m "feat(accounts): integrate circuit breaker into account service with instant recovery"
```

---

### Task 2: Bilingual i18n Translation for Mobile Elements

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Produces:
  - `accounts.accountUnit`: "个账号" / "accounts"
  - `accounts.mobileTabShort`: "S{index}"

- [x] **Step 1: Add keys in `frontend/src/i18n/locales/zh.ts`**

In `accounts` section of `frontend/src/i18n/locales/zh.ts`:
```typescript
    accountUnit: "个账号",
    mobileTabShort: "S{index}",
```

- [x] **Step 2: Add keys in `frontend/src/i18n/locales/en.ts`**

In `accounts` section of `frontend/src/i18n/locales/en.ts`:
```typescript
    accountUnit: "accounts",
    mobileTabShort: "S{index}",
```

- [x] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add account unit and mobile tab translation keys"
```

---

### Task 3: AccountsView Mobile Viewport & Tab Capsule Optimization

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`
- Modify: `tests/accountsViewMobileOptimization.test.ts`

**Interfaces:**
- Produces:
  - Responsive tab labels: `S1` on mobile, `Server 1 (host)` on desktop.
  - Dedicated mobile single-row active node status indicator bar when `servers.length > 1`.
  - Polished touch card spacing.

- [x] **Step 1: Update `tests/accountsViewMobileOptimization.test.ts` to test mobile tab capsules & status bar**

Add assertions in `tests/accountsViewMobileOptimization.test.ts`:
```typescript
  it('verifies mobile compact server tab capsules and dedicated active node status bar', () => {
    // Compact mobile tab short label
    expect(code).toContain('accounts.mobileTabShort');
    // Mobile-only active node status bar
    expect(code).toContain('block sm:hidden');
    expect(code).toContain('getServerHost(servers[activeServerIndex])');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountsViewMobileOptimization.test.ts`
Expected: FAIL due to missing `accounts.mobileTabShort` or mobile status bar.

- [x] **Step 3: Update `frontend/src/components/AccountsView.tsx`**

1. In Multi-Server Tabs render block (`{servers.length > 1 && ...}`):
   - Update tab button styles for mobile compactness: `px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 sm:space-x-2`
   - Render responsive label:
   ```tsx
   <span className="flex items-center space-x-1.5">
     {isLoading ? (
       <RefreshCw className="w-3 h-3 animate-spin text-indigo-300 shrink-0" />
     ) : isOffline ? (
       <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-500/20 shrink-0" />
     ) : (
       <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-300 ring-2 ring-emerald-300/30' : 'bg-emerald-500'}`} />
     )}
     <span className="hidden sm:inline">Server {idx + 1} ({host})</span>
     <span className="inline sm:hidden font-mono font-bold">{t('accounts.mobileTabShort', { index: idx + 1 })}</span>
   </span>
   ```
   - Render badges:
   ```tsx
   {isOffline ? (
     <span className="px-1 sm:px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
       {t('accounts.nodeOffline')}
     </span>
   ) : count !== undefined ? (
     <span className={`text-[9px] sm:text-[10px] font-mono px-1 sm:px-1.5 py-0.2 rounded-full shrink-0 ${
       isActive ? 'bg-white/20 text-white font-semibold' : 'bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-300'
     }`}>
       {count}
     </span>
   ) : null}
   ```
2. Below the Tabs block, add the dedicated single-line mobile active node status bar:
```tsx
      {/* Mobile-only Active Node Status Bar */}
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
            <span className="text-slate-400 font-mono">· {accounts.length} {t('accounts.accountUnit')}</span>
          </div>
        </div>
      )}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountsViewMobileOptimization.test.ts tests/accountsMultiServerIsolation.test.ts`
Expected: PASS

- [x] **Step 5: Run frontend build to verify compilation**

Run: `npm run build:frontend`
Expected: PASS with 0 errors.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountsViewMobileOptimization.test.ts
git commit -m "feat(accounts): optimize mobile view with compact tab capsules and node status bar"
```

---

### Task 4: Full Regression Verification & Production Build

**Files:**
- Run all test suites
- Full production build

- [x] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All test suites pass.

- [x] **Step 2: Run full build**

Run: `npm run build`
Expected: 0 errors for frontend Vite build and backend TypeScript build.

- [x] **Step 3: Commit and verify status**

```bash
git status
git commit -m "chore: complete accounts circuit breaker integration and mobile layout optimization"
```

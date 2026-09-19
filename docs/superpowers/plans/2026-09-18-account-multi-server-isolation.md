# Account Management Multi-Server Tab Caching & Visual Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix multi-server tab switching lag, eliminate stale data race conditions, and provide unambiguous visual environment isolation in the Web Console Account Management view (`AccountsView.tsx`).

**Architecture:** 
- Upgrade state model in `AccountsView.tsx` from monolithic `data` to per-server sharded maps (`serverDataMap`, `serverLoadingMap`, `serverErrorMap`).
- Implement request-ID sequence tracking (`latestRequestIdRef`) to safely discard out-of-order delayed HTTP responses during fast tab switches.
- Display rich server tabs with real-time connectivity health dots and cached account count pills.
- Mount a persistent, scoped `Server Scope Banner` above the table toolbar with distinct color loops (Indigo, Emerald, Amber, Purple) and active rotation account indicators.
- Bind all user mutation actions (upload, toggle, delete, deduplicate, close context) explicitly to `activeServerIndex` to prevent closure stale references.
- Add internationalized translations in `zh.ts` and `en.ts`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest.

## Global Constraints

- **Instantaneous Tab Switching**: If server data is cached in `serverDataMap`, render immediately without flickering or displaying previous server remnants.
- **Race Condition Immunity**: Older in-flight requests must never overwrite newer tab data.
- **Strict Visual Scoping**: In multi-server environments (`servers.length > 1`), active server identity and URL must be persistently evident.
- **Zero Regression**: All existing 111 test suites must pass, with 0 TypeScript compilation errors under `npm run build:frontend`.

---

### Task 1: Add Multi-Server Scope & Isolation Translations (i18n)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Produces i18n keys under `accounts.*`:
  - `serverScope`: "当前操作节点: {server}" / "Active Target: {server}"
  - `accountsCountBadge`: "{count} 账号" / "{count} accounts"
  - `activeAuthBadge`: "当前轮换: #{index} ({email})" / "Active: #{index} ({email})"
  - `noActiveAuth`: "未指定活动账号" / "No active rotation account"
  - `refreshServer`: "刷新当前节点" / "Refresh Server"
  - `serverErrorNotice`: "该节点上游请求异常: {error}" / "Upstream node error: {error}"
  - `scopeDesc`: "导入、删除、启用/禁用及轮换操作仅作用于当前选中的服务器实例。" / "All import, delete, toggle, and rotation actions apply strictly to this server instance."

- [ ] **Step 1: Update `frontend/src/i18n/locales/zh.ts`**

In `frontend/src/i18n/locales/zh.ts`, add the new keys to `accounts`:
```typescript
    serverScope: "当前操作节点: {server}",
    accountsCountBadge: "{count} 账号",
    activeAuthBadge: "当前轮换: #{index} ({email})",
    noActiveAuth: "暂无生效中的轮换账号",
    refreshServer: "刷新当前节点",
    serverErrorNotice: "该节点上游请求异常: {error}",
    scopeDesc: "当前凭据导入、启停、删除、去重及轮换设置仅作用于该独立服务器实例。",
```

- [ ] **Step 2: Update `frontend/src/i18n/locales/en.ts`**

In `frontend/src/i18n/locales/en.ts`, add the corresponding keys:
```typescript
    serverScope: "Active Target: {server}",
    accountsCountBadge: "{count} accounts",
    activeAuthBadge: "Active: #{index} ({email})",
    noActiveAuth: "No active rotation account",
    refreshServer: "Refresh Server",
    serverErrorNotice: "Upstream node error: {error}",
    scopeDesc: "All credential operations apply strictly to this server instance.",
```

- [ ] **Step 3: Run build to verify dictionary compatibility**

Run: `npm run build:frontend`
Expected: Passes with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(i18n): add account multi-server scope and isolation translations"
```

---

### Task 2: Implement Sharded State Map, Sequence Shield & Scoped Mutations in `AccountsView.tsx`

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Updates:
  - `serverDataMap`: `Record<number, any>`
  - `serverLoadingMap`: `Record<number, boolean>`
  - `serverErrorMap`: `Record<number, string | null>`
  - `fetchStatus(silent?, targetServerIdx?)`: Sequence-guarded by `latestRequestIdRef`
  - `handleSwitchServer(idx)`: Instant cache display + silent background fetch
  - Explicit `targetServerIdx = activeServerIndex` binding across all mutation functions

- [ ] **Step 1: Replace monolithic `data` state with sharded maps**

In `frontend/src/components/AccountsView.tsx`:
Replace:
```typescript
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
```
With:
```typescript
  const [serverDataMap, setServerDataMap] = useState<Record<number, any>>({});
  const [serverLoadingMap, setServerLoadingMap] = useState<Record<number, boolean>>({});
  const [serverErrorMap, setServerErrorMap] = useState<Record<number, string | null>>({});

  const latestRequestIdRef = useRef<number>(0);

  const currentData = serverDataMap[activeServerIndex] || null;
  const isCurrentLoading = Boolean(serverLoadingMap[activeServerIndex]);
  const currentError = serverErrorMap[activeServerIndex] || null;
```

Update derived data:
```typescript
  const accounts: AccountDetail[] = currentData?.status?.accountDetails || [];
  const currentAuthIndex = currentData?.status?.currentAuthIndex;
  const isSystemBusy = Boolean(currentData?.status?.isSystemBusy);
```

- [ ] **Step 2: Update `fetchStatus` with Request Sequence Guard**

Implement sequence-guarded `fetchStatus`:
```typescript
  const fetchStatus = async (silent: boolean = false, targetServerIdx: number = activeServerIndex) => {
    const reqId = ++latestRequestIdRef.current;

    if (!silent) {
      setServerLoadingMap(prev => ({ ...prev, [targetServerIdx]: true }));
    }

    try {
      const res = await fetch(getApiUrl('/api/admin/accounts/status', targetServerIdx), {
        headers: getHeaders()
      });

      // Drop stale response if another request has been started for another tab
      if (reqId !== latestRequestIdRef.current && targetServerIdx !== activeServerIndex) {
        return;
      }

      if (res.ok) {
        const json = await res.json();
        setServerDataMap(prev => ({ ...prev, [targetServerIdx]: json }));
        setServerErrorMap(prev => ({ ...prev, [targetServerIdx]: null }));
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setServerErrorMap(prev => ({ ...prev, [targetServerIdx]: err.error || err.message }));
        if (!silent) {
          showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
        }
      }
    } catch (e: any) {
      if (reqId === latestRequestIdRef.current) {
        setServerErrorMap(prev => ({ ...prev, [targetServerIdx]: e.message }));
        if (!silent) {
          showToast(t('accounts.actionFailed', { error: e.message }), 'error');
        }
      }
    } finally {
      if (!silent) {
        setServerLoadingMap(prev => ({ ...prev, [targetServerIdx]: false }));
      }
    }
  };
```

- [ ] **Step 3: Update `handleSwitchServer` for Instantaneous Switching**

```typescript
  const handleSwitchServer = (idx: number) => {
    if (idx === activeServerIndex) return;
    setActiveServerIndex(idx);
    setSelectedIndices([]);
    setPopoverAnchor(null);

    const hasCachedData = Boolean(serverDataMap[idx]);
    // If cached, render immediately without blocking, then trigger silent sync; otherwise show loading spinner
    fetchStatus(!hasCachedData ? false : true, idx);
  };
```

- [ ] **Step 4: Explicitly scope all mutation handlers with `targetServerIdx`**

Update handlers:
1. `handleCloseContext(index)`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   ...
   const res = await fetch(getApiUrl(`/api/admin/accounts/${index}/close-context`, targetServerIdx), ...);
   if (res.ok) {
     ...
     fetchStatus(false, targetServerIdx);
   }
   ```
2. `handleToggleDisabled(index, currentDisabled)`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   ...
   const res = await fetch(getApiUrl('/api/admin/accounts/toggle-disabled', targetServerIdx), ...);
   if (res.ok) {
     fetchStatus(false, targetServerIdx);
   }
   ```
3. `handleBatchToggleDisabled(disabled)`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   await Promise.all(selectedIndices.map(index => fetch(getApiUrl('/api/admin/accounts/toggle-disabled', targetServerIdx), ...)));
   fetchStatus(false, targetServerIdx);
   ```
4. `handleSwitchCurrent(targetIndex)`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   const res = await fetch(getApiUrl('/api/admin/accounts/current', targetServerIdx), ...);
   if (res.ok) {
     fetchStatus(false, targetServerIdx);
   }
   ```
5. `handleDeleteAccount(index, force)`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   const res = await fetch(getApiUrl(`/api/admin/accounts/${index}?force=${force}`, targetServerIdx), ...);
   if (res.ok) {
     fetchStatus(false, targetServerIdx);
   }
   ```
6. `handleBatchDelete(force)`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   const res = await fetch(getApiUrl('/api/admin/accounts/batch-delete', targetServerIdx), ...);
   if (res.ok) {
     fetchStatus(false, targetServerIdx);
   }
   ```
7. `handleDeduplicate()`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   const res = await fetch(getApiUrl('/api/admin/accounts/deduplicate', targetServerIdx), ...);
   if (res.ok) {
     fetchStatus(false, targetServerIdx);
   }
   ```
8. `handleBatchDownload()`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   const res = await fetch(getApiUrl('/api/admin/accounts/batch-download', targetServerIdx), ...);
   ```
9. `handleFileUpload(e)`:
   ```typescript
   const targetServerIdx = activeServerIndex;
   res = await fetch(getApiUrl('/api/admin/accounts/upload', targetServerIdx), ...);
   if (res.ok || res.status === 207) {
     fetchStatus(false, targetServerIdx);
   }
   ```

- [ ] **Step 5: Verify build**

Run: `npm run build:frontend`
Expected: Compiles with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(accounts): implement sharded state caching and sequence guard for multi-server tabs"
```

---

### Task 3: Build Multi-Server Rich Tabs & Persistent Scope Banner

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Produces:
  - Rich Tab element with node status dot and account count badge
  - Dedicated `Server Scope Banner` with distinct color loop scheme, active target information, and quick refresh button

- [ ] **Step 1: Enhance Multi-Server Selection Tabs UI**

In `frontend/src/components/AccountsView.tsx`, update the `{servers.length > 1 && ...}` section:
```tsx
      {/* Multi-Server Selection Tabs */}
      {servers.length > 1 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
          <div className="flex items-center bg-black/[0.03] dark:bg-white/[0.04] p-1 rounded-xl border border-black/5 dark:border-white/10 gap-1.5 min-w-max">
            {servers.map((serverUrl, idx) => {
              const host = getServerHost(serverUrl);
              const isActive = activeServerIndex === idx;
              const serverData = serverDataMap[idx];
              const isLoading = Boolean(serverLoadingMap[idx]);
              const hasError = Boolean(serverErrorMap[idx]);
              const count = serverData?.status?.accountDetails?.length;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSwitchServer(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                  title={serverUrl}
                >
                  <span className="flex items-center space-x-1.5">
                    {isLoading ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-indigo-300" />
                    ) : hasError ? (
                      <span className="w-2 h-2 rounded-full bg-rose-400 ring-2 ring-rose-400/20" />
                    ) : (
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-300 ring-2 ring-emerald-300/30' : 'bg-emerald-500/60'}`} />
                    )}
                    <span>Server {idx + 1} ({host})</span>
                  </span>

                  {count !== undefined && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-300'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Add Persistent Server Scope Banner Component**

Directly under the tabs (or above the modern page header / toolbar):
```tsx
      {/* Multi-Server Scope & Environment Banner */}
      {servers.length > 1 && (
        <div className={`ui-card-sub px-3.5 py-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-all ${
          activeServerIndex % 4 === 0
            ? 'border-indigo-500/30 bg-indigo-500/5 text-indigo-900 dark:text-indigo-200'
            : activeServerIndex % 4 === 1
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200'
            : activeServerIndex % 4 === 2
            ? 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200'
            : 'border-purple-500/30 bg-purple-500/5 text-purple-900 dark:text-purple-200'
        }`}>
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${
              activeServerIndex % 4 === 0
                ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                : activeServerIndex % 4 === 1
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : activeServerIndex % 4 === 2
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-purple-500/20 text-purple-600 dark:text-purple-400'
            }`}>
              <Globe className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                <span className="font-bold text-xs">
                  {t('accounts.serverScope', { server: `Server ${activeServerIndex + 1}` })}
                </span>
                <span className="font-mono text-[11px] opacity-80 truncate max-w-xs sm:max-w-md">
                  ({servers[activeServerIndex]})
                </span>
                {currentAuthIndex !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/5 dark:bg-white/10 font-semibold">
                    {t('accounts.activeAuthBadge', {
                      index: String(currentAuthIndex),
                      email: accounts[currentAuthIndex]?.name || 'current'
                    })}
                  </span>
                )}
              </div>
              <p className="text-[11px] opacity-75 mt-0.5 hidden sm:block">
                {t('accounts.scopeDesc')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            {currentError && (
              <span className="text-[11px] text-rose-500 dark:text-rose-400 flex items-center space-x-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="max-w-[200px] truncate">{currentError}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchStatus(false, activeServerIndex)}
              disabled={isCurrentLoading}
              className="px-2.5 py-1 rounded-lg ui-btn-secondary text-xs flex items-center space-x-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              title={t('accounts.refreshServer')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCurrentLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="hidden sm:inline">{t('accounts.refreshServer')}</span>
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Add Empty / Loading Skeleton Overlay when currentData is null**

When switching to a server that has not yet loaded (`!currentData && isCurrentLoading`), render a clean loading skeleton or indicator instead of stale empty cards:
```tsx
      {isCurrentLoading && !currentData && (
        <div className="ui-card p-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-mono">{t('accounts.loading')}</span>
        </div>
      )}
```

- [ ] **Step 4: Verify Frontend Build**

Run: `npm run build:frontend`
Expected: Passes with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(accounts): add rich server tabs, scope banner, and loading skeleton"
```

---

### Task 4: Write Unit & Integration Tests in `tests/accountsMultiServerIsolation.test.ts`

**Files:**
- Create: `tests/accountsMultiServerIsolation.test.ts`

**Interfaces:**
- Verifies:
  - `serverDataMap` state isolation between multiple server indices.
  - Race condition immunity: slow network mock for server 0 does not overwrite server 1 data.
  - Scope banner presence and active target host rendering.

- [ ] **Step 1: Write tests in `tests/accountsMultiServerIsolation.test.ts`**

```typescript
import fs from 'fs';
import path from 'path';

describe('AccountsView Multi-Server Tab Isolation and Caching', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  const accountsViewContent = fs.readFileSync(accountsViewPath, 'utf-8');

  test('uses serverDataMap sharded dictionary instead of single data state', () => {
    expect(accountsViewContent).toContain('serverDataMap');
    expect(accountsViewContent).toContain('serverLoadingMap');
    expect(accountsViewContent).toContain('serverErrorMap');
    expect(accountsViewContent).toMatch(/const currentData = serverDataMap\[activeServerIndex\]/);
  });

  test('implements request-ID sequence guard to eliminate race conditions', () => {
    expect(accountsViewContent).toContain('latestRequestIdRef');
    expect(accountsViewContent).toMatch(/reqId !== latestRequestIdRef\.current/);
  });

  test('handleSwitchServer immediately activates new index and checks cached data', () => {
    expect(accountsViewContent).toMatch(/const hasCachedData = Boolean\(serverDataMap\[idx\]\)/);
    expect(accountsViewContent).toContain('setActiveServerIndex(idx)');
  });

  test('mutation handlers explicitly lock targetServerIdx for scoped mutations', () => {
    expect(accountsViewContent).toContain('const targetServerIdx = activeServerIndex');
    expect(accountsViewContent).toMatch(/fetchStatus\(\s*(?:false|true)\s*,\s*targetServerIdx\s*\)/);
  });

  test('renders Server Scope Banner when servers.length > 1', () => {
    expect(accountsViewContent).toContain('accounts.serverScope');
    expect(accountsViewContent).toContain('accounts.scopeDesc');
    expect(accountsViewContent).toContain('activeAuthBadge');
  });
});
```

- [ ] **Step 2: Run new test file**

Run: `npx jest tests/accountsMultiServerIsolation.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/accountsMultiServerIsolation.test.ts
git commit -m "test(accounts): add unit tests for multi-server tab isolation and race shield"
```

---

### Task 5: Full Verification & Build Validation

**Files:**
- Test all: `npm test`
- Build all: `npm run build`

- [ ] **Step 1: Execute Full Build**

Run: `npm run build`
Expected: Both frontend Vite bundle and backend TypeScript compile cleanly with 0 errors.

- [ ] **Step 2: Execute Complete Test Suite**

Run: `npm test`
Expected: All 112 test suites pass with 0 failures.

- [ ] **Step 3: Final Git Check**

Run: `git status && git log -n 5 --oneline`
Expected: Clean working tree.

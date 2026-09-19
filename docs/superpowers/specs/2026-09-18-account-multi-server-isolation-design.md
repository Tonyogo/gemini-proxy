# Design Doc: Account Management Multi-Server Tab Caching, Race-Condition Shield & Visual Isolation

- **Date:** 2026-09-18
- **Topic:** Fix Multi-Server Tab Switching Lag, Stale Data Races, and Missing Visual Isolation in AccountsView
- **Status:** Approved

## 1. Overview & Objectives

In the Web Console's Account Management view (`AccountsView.tsx`), when multiple upstream servers (`GEMINI_BASE_URL` with multiple comma-separated URLs) are configured:
1. **Stale Data Residuals & Latency**: Switching between Server Tabs does not immediately clear or isolate data. The view continues rendering the previous server's account list and stats until the new HTTP request finishes. Under high latency or network errors, stale ghost data remains visible.
2. **Network Race Conditions**: If a user switches from Server 0 to Server 1 quickly, a slow delayed response from Server 0 can resolve after Server 1's request, overwriting Server 1's data with Server 0's payload.
3. **No Clear Visual Scope Isolation**: Across the stats chips, search/filter toolbar, and account data table, there is no persistent indicator of which server is currently active, confusing users regarding which server credentials belong to.
4. **Unscoped Mutation Refresh**: Action handlers (upload, delete, toggle disabled, close context, switch current) often invoke a parameterless `fetchStatus()`, relying on closure variables that risk refreshing the wrong server.

### Core Goals:
1. **Per-Server State Sharding (`serverDataMap`)**: Maintain independent data, loading, and error states per `serverIndex`. Cached servers switch instantaneously; uncached servers show dedicated skeleton/loading states.
2. **Request-ID Sequence Shield**: Guard against race conditions by tracking incremental request IDs; stale responses from earlier tab switches are discarded.
3. **Visual Server Scope Isolation**:
   - Enhanced Tabs: Rich indicator badges showing node host, connection health, and account counts on each tab.
   - Persistent Server Scope Banner: Ambient banner displaying current node URL, active rotation account, count breakdown, and a dedicated refresh button.
   - Distinct server color palette loop (Indigo, Teal, Amber, Rose) providing unconscious environment awareness.
4. **Scoped Action Execution**: Bind all mutations explicitly to `targetServerIdx` and refresh only the targeted server's slice.
5. **Full Bilingual Internationalization (i18n)**.

---

## 2. State & Architecture Design

### 2.1 State Sharding Schema (`AccountsView.tsx`)
```typescript
// 1. Sharded State Dictionaries
const [serverDataMap, setServerDataMap] = useState<Record<number, any>>({});
const [serverLoadingMap, setServerLoadingMap] = useState<Record<number, boolean>>({});
const [serverErrorMap, setServerErrorMap] = useState<Record<number, string | null>>({});

// 2. Active Derived State
const currentData = serverDataMap[activeServerIndex] || null;
const isCurrentLoading = Boolean(serverLoadingMap[activeServerIndex]);
const currentError = serverErrorMap[activeServerIndex] || null;

// Derived account lists and metrics calculated strictly from currentData
const accounts: AccountDetail[] = currentData?.status?.accountDetails || [];
const currentAuthIndex = currentData?.status?.currentAuthIndex;
const isSystemBusy = Boolean(currentData?.status?.isSystemBusy);
```

---

### 2.2 Sequence Guard & Abort Strategy
```typescript
const latestRequestIdRef = useRef<number>(0);

const fetchStatus = async (silent: boolean = false, targetServerIdx: number = activeServerIndex) => {
  const reqId = ++latestRequestIdRef.current;

  if (!silent) {
    setServerLoadingMap(prev => ({ ...prev, [targetServerIdx]: true }));
  }

  try {
    const res = await fetch(getApiUrl('/api/admin/accounts/status', targetServerIdx), {
      headers: getHeaders()
    });

    // Drop stale response if user switched tabs during fetch
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

---

### 2.3 Instantaneous Tab Switch Handler
```typescript
const handleSwitchServer = (idx: number) => {
  if (idx === activeServerIndex) return;
  setActiveServerIndex(idx);
  setSelectedIndices([]);
  setPopoverAnchor(null);

  const hasCachedData = Boolean(serverDataMap[idx]);
  // If cache exists, render immediately with silent background sync; otherwise show loading spinner/skeleton
  fetchStatus(!hasCachedData ? false : true, idx);
};
```

---

### 2.4 Visual Server Isolation Layout

#### 1. Rich Server Tabs
Each Tab in `servers.map((serverUrl, idx) => ...)` renders:
- Server Index & Host: `Server 1 (proxy-node-1.internal)`
- Health Dot: Green for loaded/healthy, spinning indicator while loading, red if `serverErrorMap[idx]` is present.
- Account Count Pill: `[ N ]` showing cached total count.

#### 2. Persistent Server Scope Banner
Rendered when `servers.length > 1`:
```text
┌────────────────────────────────────────────────────────────────────────────────────────���
│ 🌐 Active Server: Server 1 (https://node1.example.com)                   [ Refresh ]   │
│ ├─ Target Upstream: https://node1.example.com  ├─ Active Account: #3 (user@gmail.com)  │
│ ├─ Accounts Loaded: 18 (14 Active / 2 Retired) └─ Scope: All edits apply to this node  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- Color themes looped by index:
  - Index 0: Indigo / Blue
  - Index 1: Emerald / Teal
  - Index 2: Amber / Orange
  - Index 3: Purple / Rose

---

## 3. Scoped Mutation Handlers

Every mutation handler (`handleCloseContext`, `handleToggleDisabled`, `handleBatchToggleDisabled`, `handleSwitchCurrent`, `handleDeleteAccount`, `handleBatchDelete`, `handleDeduplicate`, `handleFileUpload`) explicitly locks `targetServerIdx`:
```typescript
const targetServerIdx = activeServerIndex;
// 1. Send API request with targetServerIdx
await fetch(getApiUrl('/api/admin/accounts/...', targetServerIdx), { ... });
// 2. Refresh target server status explicitly
fetchStatus(false, targetServerIdx);
```

---

## 4. Testing & Verification Plan

1. **Component Test (`tests/accountsMultiServerIsolation.test.ts`)**:
   - Verify `serverDataMap` state isolation between different server indices.
   - Verify that slow responses from older server indices do not overwrite newer active tab state.
   - Verify that switching tabs immediately switches the active server index and resets selection.
   - Verify that the Server Scope Banner mounts and displays when `servers.length > 1`.
2. **Build Verification**:
   - `npm run build:frontend`: Verify JSX and TypeScript compilation with 0 errors.
   - `npm run build`: Verify full project build.
3. **Regression Test**:
   - `npm test`: Run all test suites to ensure 100% pass rate.

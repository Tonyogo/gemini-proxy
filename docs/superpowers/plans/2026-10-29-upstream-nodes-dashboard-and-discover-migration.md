# Upstream Nodes Dashboard Overview & Discover Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline primary navigation to 3 items (`dashboard`, `logs`, `discover`), migrate the accounts management view into Discover as the builtin tool `upstreamNodes`, and add a zero-overhead upstream nodes overview section to DashboardView.

**Architecture:** 
1. Register `upstreamNodes` in `DEFAULT_BUILTIN_APPS` and handle launch within `DiscoverHubView`, rendering `AccountsView` as an embedded sub-view.
2. Refactor `App.tsx` navigation items from 4 to 3 (`⌘1` Dashboard, `⌘2` Logs, `⌘3` Discover), with backward-compatible migration for stored `'accounts'` active tab state.
3. Extract `calculateUpstreamNodeSummary` in `frontend/src/utils/upstreamNodeHelpers.ts` to compute node health and metrics from local `/api/admin/status` and `/api/admin/stats` data with zero additional network requests.
4. Mount `UpstreamNodesOverview` in `DashboardView` between the APM KPI cards and the model performance matrix.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest, Vite

**Spec:** `docs/superpowers/specs/2026-10-29-upstream-nodes-dashboard-and-discover-migration-design.md`

## Global Constraints

- **Primary Navigation**: Exactly 3 top-level items (`dashboard` ⌘1, `logs` ⌘2, `discover` ⌘3).
- **Zero Additional Network Requests**: The dashboard overview must calculate node metrics using existing `/api/admin/status` and `/api/admin/stats` payload data without querying `/api/admin/accounts/status`.
- **Backward Compatibility**: Existing stored tabs `localStorage.admin_active_tab === 'accounts'` must gracefully redirect to `'discover'` with sub-view `'upstreamNodes'`.
- **Builtin App ID**: The discover app ID must be exactly `'upstreamNodes'`.
- **Design System Consistency**: Linear-style glassmorphism, CSS variable colors (`var(--bg-surface)`, `var(--border-subtle)`), no hardcoded dark text classes.

## Review Focus

1. `localStorage.getItem('admin_active_tab') === 'accounts'` → smoothly redirects to `activeTab = 'discover'` and `discoverSubView = 'upstreamNodes'`.
2. Empty or missing `timeSeries` in `calculateUpstreamNodeSummary` → returns default 0 requests, 100% success rate, 0 avgLatency without `NaN` or exceptions.
3. `mergeBuiltinDiscoverApps` with legacy remote apps list lacking `upstreamNodes` → seamlessly merges `upstreamNodes` into the list without re-ordering custom apps.
4. Node in `isIsolated` state → renders with red dot, pulse animation, and isolated label.
5. Direct mode node → renders with cyan `直连` badge and API Key pool count, hiding irrelevant proxy-specific metrics.

---

### Task 1: Discover App Types, Storage & Builtin Registration (`upstreamNodes`)

**Files:**
- Modify: `frontend/src/types/discoverApps.ts`
- Modify: `frontend/src/utils/discoverAppsStorage.ts`
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/discoverUpstreamNodes.test.ts`

**Interfaces:**
- Produces:
  - `DiscoverToolId`: `'systemLogs' | 'playground' | 'translate' | 'tasks' | 'upstreamNodes'`
  - `DEFAULT_BUILTIN_APPS`: contains `{ id: 'upstreamNodes', type: 'builtin', name: '上游节点信息', icon: 'Server', color: 'from-blue-600 to-indigo-700', badge: 'MULTI-NODE', enabled: true, order: 4 }`
  - `DiscoverHubView`: renders `Server` icon for `upstreamNodes` and launches `onSelectTool('upstreamNodes')`

- [x] **Step 1: Write the failing test**

Create `tests/discoverUpstreamNodes.test.ts`:
```ts
import { DEFAULT_BUILTIN_APPS, DEFAULT_DISCOVER_APPS, mergeBuiltinDiscoverApps } from '../frontend/src/utils/discoverAppsStorage';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Discover Upstream Nodes Builtin Tool', () => {
  it('registers upstreamNodes in DEFAULT_BUILTIN_APPS and DEFAULT_DISCOVER_APPS', () => {
    const builtin = DEFAULT_BUILTIN_APPS.find(a => a.id === 'upstreamNodes');
    expect(builtin).toBeDefined();
    expect(builtin?.type).toBe('builtin');
    expect(builtin?.icon).toBe('Server');
    expect(builtin?.badge).toBe('MULTI-NODE');
    expect(builtin?.enabled).toBe(true);

    const inDefault = DEFAULT_DISCOVER_APPS.find(a => a.id === 'upstreamNodes');
    expect(inDefault).toBeDefined();
  });

  it('merges upstreamNodes when remote config misses it', () => {
    const legacyApps = [
      { id: 'systemLogs', type: 'builtin', name: '系统日志', order: 0, enabled: true, icon: 'FileText', color: 'blue' },
      { id: 'custom_1', type: 'custom', name: 'Custom 1', order: 1, enabled: true, icon: 'Globe', color: 'orange' }
    ];
    const merged = mergeBuiltinDiscoverApps(legacyApps as any);
    expect(merged.some(a => a.id === 'upstreamNodes')).toBe(true);
    expect(merged.some(a => a.id === 'custom_1')).toBe(true);
  });

  it('includes i18n translations for upstreamNodes in zh and en', () => {
    expect((zh as any).discover.upstreamNodesTitle).toBe('上游节点信息');
    expect((zh as any).discover.upstreamNodesDesc).toBeDefined();
    expect((en as any).discover.upstreamNodesTitle).toBe('Upstream Nodes');
    expect((en as any).discover.upstreamNodesDesc).toBeDefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverUpstreamNodes.test.ts`
Expected: FAIL with `upstreamNodes` not found in `DEFAULT_BUILTIN_APPS` or missing translations.

- [x] **Step 3: Implement `upstreamNodes` registration and DiscoverHubView rendering**

1. In `frontend/src/types/discoverApps.ts`:
   - Extend `DiscoverToolId`:
     ```ts
     export type DiscoverToolId = 'systemLogs' | 'playground' | 'translate' | 'tasks' | 'upstreamNodes';
     ```
2. In `frontend/src/utils/discoverAppsStorage.ts`:
   - Add `upstreamNodes` to `DEFAULT_BUILTIN_APPS`:
     ```ts
     {
       id: 'upstreamNodes',
       type: 'builtin',
       name: '上游节点信息',
       description: '集中管理多节点账号凭据、状态监控与上下文轮换',
       icon: 'Server',
       color: 'from-blue-600 to-indigo-700',
       badge: 'MULTI-NODE',
       enabled: true,
       order: 4,
     }
     ```
   - Update `PRESET_CUSTOM_APP.order` to 5.
3. In `frontend/src/components/DiscoverHubView.tsx`:
   - Import `Server` from `lucide-react`.
   - Update `renderAppIcon`:
     ```tsx
     if (app.id === 'upstreamNodes' || app.icon === 'Server') {
       return <Server className={sizeClass} />;
     }
     ```
   - Update `getAppTitle`:
     ```tsx
     if (app.id === 'upstreamNodes') return t('discover.upstreamNodesTitle', '上游节点信息');
     ```
   - Update `getAppDesc`:
     ```tsx
     if (app.id === 'upstreamNodes') return t('discover.upstreamNodesDesc', '集中管理多节点账号凭据、状态监控与上下文轮换');
     ```
   - Update `getAppBadge`:
     ```tsx
     if (app.id === 'upstreamNodes') return 'MULTI-NODE';
     ```
4. In `frontend/src/i18n/locales/zh.ts` & `en.ts`:
   - Add `upstreamNodesTitle` and `upstreamNodesDesc` under `discover`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/discoverUpstreamNodes.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/types/discoverApps.ts frontend/src/utils/discoverAppsStorage.ts frontend/src/components/DiscoverHubView.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/discoverUpstreamNodes.test.ts
git commit -m "feat(discover): register upstreamNodes builtin tool and i18n support"
```

---

### Task 2: Primary Navigation Slimming & Discover Subview Integration (`App.tsx`)

**Files:**
- Modify: `frontend/src/App.tsx`
- Test: `tests/navItemMigration.test.ts`

**Interfaces:**
- Consumes:
  - `DiscoverSubView`: includes `'upstreamNodes'`
  - `AccountsView`: lazy loaded component
- Produces:
  - `NAV_ITEMS`: 3 items (`dashboard` ⌘1, `logs` ⌘2, `discover` ⌘3)
  - `App`: renders `AccountsView` when `activeTab === 'discover' && discoverSubView === 'upstreamNodes'`
  - `localStorage.admin_active_tab === 'accounts'` migration to `'discover'` + `discoverSubView: 'upstreamNodes'`

- [x] **Step 1: Write the failing test**

Create `tests/navItemMigration.test.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';

describe('App Navigation Slimming & Backward Compatibility Migration', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  let appCode: string;

  beforeAll(() => {
    appCode = fs.readFileSync(appPath, 'utf-8');
  });

  it('contains exactly 3 top-level navigation items in NAV_ITEMS', () => {
    expect(appCode).toMatch(/NAV_ITEMS:\s*NavItem\[\]\s*=\s*\[\s*\{\s*id:\s*'dashboard'/);
    expect(appCode).toContain("{ id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' }");
    expect(appCode).toContain("{ id: 'logs', icon: FileText, shortcut: '⌘2' }");
    expect(appCode).toContain("{ id: 'discover', icon: Compass, shortcut: '⌘3' }");
    // 'accounts' must not be in NAV_ITEMS
    expect(appCode).not.toMatch(/\{\s*id:\s*'accounts'/);
  });

  it('migrates legacy accounts tab to discover with upstreamNodes subview', () => {
    expect(appCode).toContain("rawSaved === 'accounts'");
    expect(appCode).toContain("'upstreamNodes'");
  });

  it('renders AccountsView inside discover subview upstreamNodes', () => {
    expect(appCode).toContain("discoverSubView === 'upstreamNodes'");
    expect(appCode).toContain('<AccountsView');
  });

  it('includes discover.upstreamNodesTitle in header breadcrumbs', () => {
    expect(appCode).toContain("discoverSubView === 'upstreamNodes' && t('discover.upstreamNodesTitle'");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/navItemMigration.test.ts`
Expected: FAIL with missing navigation structure or migration code.

- [x] **Step 3: Implement primary navigation slimming and discover subview in `App.tsx`**

1. Update `TabType` and `DiscoverSubView`:
   ```ts
   type TabType = 'dashboard' | 'logs' | 'discover';
   export type DiscoverSubView = 'hub' | 'systemLogs' | 'playground' | 'translate' | 'tasks' | 'embeddedWeb' | 'upstreamNodes';
   ```
2. Update `NAV_ITEMS` and `VALID_TABS`:
   ```ts
   const NAV_ITEMS: NavItem[] = [
     { id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
     { id: 'logs', icon: FileText, shortcut: '⌘2' },
     { id: 'discover', icon: Compass, shortcut: '⌘3' },
   ];
   const VALID_TABS: TabType[] = ['dashboard', 'logs', 'discover'];
   ```
3. Update `activeTab` initial state resolver:
   ```ts
   const [activeTab, setActiveTab] = useState<TabType>(() => {
     const rawSaved = localStorage.getItem('admin_active_tab');
     if (rawSaved === 'accounts') {
       return 'discover';
     }
     if (rawSaved === 'systemLogs' || rawSaved === 'playground' || rawSaved === 'translate' || rawSaved === 'tasks' || rawSaved === 'upstreamNodes') {
       return 'discover';
     }
     const saved = rawSaved as TabType;
     return VALID_TABS.includes(saved) ? saved : 'dashboard';
   });
   ```
4. Update `discoverSubView` initial state resolver:
   ```ts
   const [discoverSubView, setDiscoverSubView] = useState<DiscoverSubView>(() => {
     const rawSaved = localStorage.getItem('admin_active_tab');
     if (rawSaved === 'accounts') {
       return 'upstreamNodes';
     }
     if (rawSaved === 'systemLogs' || rawSaved === 'playground' || rawSaved === 'translate' || rawSaved === 'tasks' || rawSaved === 'upstreamNodes') {
       return rawSaved as DiscoverSubView;
     }
     return 'hub';
   });
   ```
5. In breadcrumb header title:
   ```tsx
   {discoverSubView === 'systemLogs' && t('discover.systemLogsTitle')}
   {discoverSubView === 'playground' && t('discover.playgroundTitle')}
   {discoverSubView === 'translate' && t('discover.translateTitle')}
   {discoverSubView === 'tasks' && t('tasks.title', '在线事项')}
   {discoverSubView === 'upstreamNodes' && t('discover.upstreamNodesTitle', '上游节点信息')}
   {discoverSubView === 'embeddedWeb' && (activeEmbeddedApp?.name || t('discover.customAppsTitle'))}
   ```
6. In `<main>` discover tab section, render `AccountsView` when `discoverSubView === 'upstreamNodes'`:
   ```tsx
   {discoverSubView === 'upstreamNodes' && (
     <AccountsView
       key={refreshTrigger}
       adminKey={adminKey}
     />
   )}
   ```
   Remove the old standalone `{activeTab === 'accounts' && ...}` block.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/navItemMigration.test.ts tests/discoverNavigation.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/App.tsx tests/navItemMigration.test.ts
git commit -m "feat(nav): slim primary navigation to 3 items and embed AccountsView in discover"
```

---

### Task 3: Upstream Node Summary Helper & Calculation (`upstreamNodeHelpers.ts`)

**Files:**
- Create: `frontend/src/utils/upstreamNodeHelpers.ts`
- Test: `tests/upstreamNodeHelpers.test.ts`

**Interfaces:**
- Produces:
  - `UpstreamNodeSummaryItem`:
    ```ts
    export interface UpstreamNodeSummaryItem {
      serverIndex: number;
      name: string;
      host: string;
      url: string;
      type: 'proxy' | 'direct';
      weight: number;
      effectivePercent: number;
      enabled: boolean;
      isIsolated: boolean;
      keyCount?: number;
      requests: number;
      success: number;
      error: number;
      successRate: number;
      avgLatency: number;
    }
    ```
  - `calculateUpstreamNodeSummary(upstreamServers?: any[], timeSeries?: any[]): UpstreamNodeSummaryItem[]`

- [x] **Step 1: Write the failing test**

Create `tests/upstreamNodeHelpers.test.ts`:
```ts
import { calculateUpstreamNodeSummary } from '../frontend/src/utils/upstreamNodeHelpers';

describe('upstreamNodeHelpers.calculateUpstreamNodeSummary', () => {
  it('returns empty array when upstreamServers is empty or undefined', () => {
    expect(calculateUpstreamNodeSummary(undefined, [])).toEqual([]);
    expect(calculateUpstreamNodeSummary([], [])).toEqual([]);
  });

  it('aggregates metrics per node correctly across timeSeries modelNodes', () => {
    const upstreamServers = [
      {
        serverIndex: 0,
        url: 'https://proxy-1.example.com',
        name: 'Node Alpha',
        type: 'proxy',
        weight: 1,
        enabled: true,
        isIsolated: false,
        effectivePercent: 50.0,
      },
      {
        serverIndex: 1,
        url: 'https://generativelanguage.googleapis.com',
        name: 'Direct Gemini',
        type: 'direct',
        weight: 1,
        enabled: true,
        isIsolated: false,
        effectivePercent: 50.0,
        apiKeys: ['key-1', 'key-2'],
      },
    ];

    const timeSeries = [
      {
        time: '2026-10-29 10:00',
        modelNodes: {
          'gemini-pro': {
            '0': { requests: 10, success: 9, error: 1, totalDuration: 9000, durationCount: 9 },
            '1': { requests: 5, success: 5, error: 0, totalDuration: 4000, durationCount: 5 },
          },
        },
      },
      {
        time: '2026-10-29 11:00',
        modelNodes: {
          'gemini-flash': {
            '0': { requests: 20, success: 20, error: 0, totalDuration: 12000, durationCount: 20 },
            '1': { requests: 15, success: 14, error: 1, totalDuration: 6000, durationCount: 14 },
          },
        },
      },
    ];

    const summary = calculateUpstreamNodeSummary(upstreamServers, timeSeries);
    expect(summary).toHaveLength(2);

    // Node 0
    expect(summary[0].name).toBe('Node Alpha');
    expect(summary[0].host).toBe('proxy-1.example.com');
    expect(summary[0].type).toBe('proxy');
    expect(summary[0].requests).toBe(30);
    expect(summary[0].success).toBe(29);
    expect(summary[0].error).toBe(1);
    expect(summary[0].successRate).toBe(96.7);
    expect(summary[0].avgLatency).toBe(Math.round((9000 + 12000) / (9 + 20))); // 724ms

    // Node 1 (Direct)
    expect(summary[1].name).toBe('Direct Gemini');
    expect(summary[1].type).toBe('direct');
    expect(summary[1].keyCount).toBe(2);
    expect(summary[1].requests).toBe(20);
    expect(summary[1].successRate).toBe(95.0);
    expect(summary[1].avgLatency).toBe(Math.round((4000 + 6000) / (5 + 14))); // 526ms
  });

  it('handles zero requests without NaN', () => {
    const upstreamServers = [
      {
        serverIndex: 0,
        url: 'https://proxy-idle.example.com',
        type: 'proxy',
        weight: 1,
        enabled: true,
      },
    ];
    const summary = calculateUpstreamNodeSummary(upstreamServers, []);
    expect(summary[0].requests).toBe(0);
    expect(summary[0].successRate).toBe(100.0);
    expect(summary[0].avgLatency).toBe(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamNodeHelpers.test.ts`
Expected: FAIL with module `upstreamNodeHelpers` not found.

- [x] **Step 3: Implement `frontend/src/utils/upstreamNodeHelpers.ts`**

```ts
export interface UpstreamNodeSummaryItem {
  serverIndex: number;
  name: string;
  host: string;
  url: string;
  type: 'proxy' | 'direct';
  weight: number;
  effectivePercent: number;
  enabled: boolean;
  isIsolated: boolean;
  keyCount?: number;
  requests: number;
  success: number;
  error: number;
  successRate: number;
  avgLatency: number;
}

export function extractHost(urlStr?: string): string {
  if (!urlStr) return '';
  try {
    return new URL(urlStr).hostname;
  } catch {
    return urlStr.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

export function calculateUpstreamNodeSummary(
  upstreamServers?: any[],
  timeSeries?: any[]
): UpstreamNodeSummaryItem[] {
  if (!Array.isArray(upstreamServers) || upstreamServers.length === 0) {
    return [];
  }

  const series = Array.isArray(timeSeries) ? timeSeries : [];

  return upstreamServers.map((server, idx) => {
    const serverIndex = typeof server.serverIndex === 'number' ? server.serverIndex : idx;
    const url = server.url || '';
    const host = extractHost(url);
    const fallbackName = host ? `Node ${serverIndex + 1} (${host})` : `Node ${serverIndex + 1}`;
    const name = server.name?.trim() ? server.name.trim() : fallbackName;
    const type = server.type === 'direct' ? 'direct' : 'proxy';
    const weight = typeof server.weight === 'number' ? server.weight : 1;
    const effectivePercent = typeof server.effectivePercent === 'number' ? server.effectivePercent : 0;
    const enabled = server.enabled !== false;
    const isIsolated = Boolean(server.isIsolated);
    const keyCount = Array.isArray(server.apiKeys) ? server.apiKeys.length : undefined;

    let requests = 0;
    let success = 0;
    let error = 0;
    let totalDuration = 0;
    let durationCount = 0;

    const nodeKey = String(serverIndex);

    series.forEach(point => {
      if (!point || !point.modelNodes || typeof point.modelNodes !== 'object') return;
      Object.values(point.modelNodes).forEach((nodeMap: any) => {
        if (!nodeMap || typeof nodeMap !== 'object') return;
        const m = nodeMap[nodeKey];
        if (m) {
          requests += Number(m.requests) || 0;
          success += Number(m.success) || 0;
          error += Number(m.error) || 0;
          totalDuration += Number(m.totalDuration) || 0;
          durationCount += Number(m.durationCount) || 0;
        }
      });
    });

    const successRate = requests > 0
      ? parseFloat(((requests - error) / requests * 100).toFixed(1))
      : 100.0;
    const avgLatency = durationCount > 0
      ? Math.round(totalDuration / durationCount)
      : 0;

    return {
      serverIndex,
      name,
      host,
      url,
      type,
      weight,
      effectivePercent,
      enabled,
      isIsolated,
      keyCount,
      requests,
      success,
      error,
      successRate,
      avgLatency,
    };
  });
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/upstreamNodeHelpers.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/utils/upstreamNodeHelpers.ts tests/upstreamNodeHelpers.test.ts
git commit -m "feat(dashboard): add calculateUpstreamNodeSummary helper"
```

---

### Task 4: UpstreamNodesOverview Component & DashboardView Integration

**Files:**
- Create: `frontend/src/components/dashboard/UpstreamNodesOverview.tsx`
- Modify: `frontend/src/components/DashboardView.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/upstreamNodesOverview.test.ts`

**Interfaces:**
- Consumes:
  - `calculateUpstreamNodeSummary` from `../../utils/upstreamNodeHelpers`
  - `upstreamServers` and `timeSeries` from `DashboardView`
- Produces:
  - `<UpstreamNodesOverview upstreamServers={upstreamServers} timeSeries={timeSeries} range={range} />` rendered in `DashboardView.tsx`

- [x] **Step 1: Write the failing test**

Create `tests/upstreamNodesOverview.test.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('UpstreamNodesOverview Component & Integration', () => {
  const componentPath = path.resolve(__dirname, '../frontend/src/components/dashboard/UpstreamNodesOverview.tsx');
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');

  it('component file exists and follows Linear-style design classes', () => {
    expect(fs.existsSync(componentPath)).toBe(true);
    const code = fs.readFileSync(componentPath, 'utf-8');
    expect(code).toContain('calculateUpstreamNodeSummary');
    expect(code).toContain('ui-card');
    expect(code).toContain('tabular-nums');
    expect(code).not.toContain('text-slate-100');
  });

  it('DashboardView imports and renders UpstreamNodesOverview', () => {
    const dashCode = fs.readFileSync(dashboardPath, 'utf-8');
    expect(dashCode).toContain('UpstreamNodesOverview');
    expect(dashCode).toContain('<UpstreamNodesOverview');
  });

  it('i18n dictionaries include dashboard upstreamNodes entries in zh and en', () => {
    expect((zh as any).dashboard.upstreamNodesTitle).toBe('上游节点概览');
    expect((zh as any).dashboard.nodesConfigured).toBeDefined();
    expect((zh as any).dashboard.nodeReqsAndRate).toBeDefined();

    expect((en as any).dashboard.upstreamNodesTitle).toBe('Upstream Nodes Overview');
    expect((en as any).dashboard.nodesConfigured).toBeDefined();
    expect((en as any).dashboard.nodeReqsAndRate).toBeDefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamNodesOverview.test.ts`
Expected: FAIL with component file not found.

- [x] **Step 3: Implement `UpstreamNodesOverview.tsx` and integrate into `DashboardView.tsx`**

1. Create `frontend/src/components/dashboard/UpstreamNodesOverview.tsx`:
   - Use `calculateUpstreamNodeSummary(upstreamServers, timeSeries)`.
   - If `summary.length === 0`, return `null`.
   - Render header: `Server` icon, `t('dashboard.upstreamNodesTitle')`, count badge (`${summary.length} ${t('dashboard.nodesConfigured')}`).
   - Render grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3`):
     - For each node:
       - Header row:
         - Status dot: emerald if healthy, rose/pulsing if isolated, slate if disabled.
         - Node name (`node.name`) and host (`node.host`).
         - Mode badge: `直连` (cyan) or `代理` (purple).
       - Info rows:
         - Traffic weight & share: `权重 ${node.weight} (${node.effectivePercent}%)`.
         - Requests & success rate: `${node.requests.toLocaleString()} reqs (${node.successRate}%)`.
         - Avg latency: `${node.avgLatency} ms`.
         - If direct mode: `${node.keyCount} Keys`.
2. In `frontend/src/components/DashboardView.tsx`:
   - Import `UpstreamNodesOverview from './dashboard/UpstreamNodesOverview'`.
   - Place `<UpstreamNodesOverview upstreamServers={upstreamServers} timeSeries={timeSeries} range={range} />` right under the 4 KPI cards and above `<ModelPerformanceMatrix ... />`.
3. In `frontend/src/i18n/locales/zh.ts` & `en.ts`:
   - Add dashboard upstream nodes strings:
     - `upstreamNodesTitle`: "上游节点概览" / "Upstream Nodes Overview"
     - `nodesConfigured`: "个节点已配置" / "Nodes Configured"
     - `nodesHealthy`: "健康" / "Healthy"
     - `nodesIsolated`: "熔断隔离" / "Isolated"
     - `nodeWeightShare`: "流量权重" / "Traffic Share"
     - `nodeReqsAndRate`: "请求 / 成功率" / "Requests / Success"
     - `nodeLatency`: "平均延迟" / "Avg Latency"
     - `nodeDirectKeys`: "API Key 池" / "API Key Pool"

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/upstreamNodesOverview.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/UpstreamNodesOverview.tsx frontend/src/components/DashboardView.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/upstreamNodesOverview.test.ts
git commit -m "feat(dashboard): mount UpstreamNodesOverview card grid in DashboardView"
```

---

### Task 5: End-to-End Build & Full Test Suite Verification

**Files:**
- Existing test files

- [x] **Step 1: Run frontend build**

Run: `npm run build:frontend`
Expected: SUCCESS with zero TypeScript or Vite bundle errors.

- [x] **Step 2: Run full test suite**

Run: `npx jest --runInBand`
Expected: ALL test suites PASS.

- [x] **Step 3: Final sanity commit if any cleanup required**

```bash
git status
```
Verify working tree is clean.

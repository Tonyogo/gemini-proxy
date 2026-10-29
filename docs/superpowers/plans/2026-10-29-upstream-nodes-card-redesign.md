# Upstream Cluster Nodes Flat Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `UpstreamNodesOverview` to match the flat, clean 2-column cluster node card layout from the user's reference mockup, with an "编辑集群节点" action button and a bottom status row showing `🔑 密钥池: N 个轮询` and `平均延迟: xxxms`.

**Architecture:** 
1. Update `calculateUpstreamNodeSummary` in `frontend/src/utils/upstreamNodeHelpers.ts` so `name` defaults to short clean node identifiers (`s1`, `s2` or `Server 1` when `server.name` is empty, without appending `(${host})` to the title) and preserves `keyCount` (`server.keyCount` or `server.apiKeys.length` or `1` fallback).
2. Refactor `UpstreamNodesOverview.tsx` to remove the outer wrapper `ui-card`, rendering a standalone section header (`Server` icon + `上游集群节点列表` on the left, `编辑集群节点` link button on the right) followed by a 2-column card grid (`grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4`).
3. Each node card renders:
   - Row 1: Left (`node.name` bold + `权重: ${node.weight}` pill + `DIRECT` / `PROXY` badge); Right (`ShieldCheck` + `健康在线` emerald pill, or rose `熔断隔离` / slate `已禁用` pill).
   - Row 2: Monospace full URL (`node.url || node.host`).
   - Divider + Bottom Row: `KeyRound` icon + `密钥池: ${keyCount} 个轮询` and `平均延迟: ${node.avgLatency}ms`.
4. Wire `onEditNodes` from `App.tsx` (`setConfigModalInitialTab('upstream'); setIsConfigModalOpen(true)`) through `DashboardView` to `UpstreamNodesOverview`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React (`Server`, `ShieldCheck`, `ShieldAlert`, `KeyRound`), Jest

**Spec:** `docs/superpowers/specs/2026-10-29-upstream-nodes-dashboard-and-discover-migration-design.md`

## Global Constraints

- **No Outer Wrapper Card**: `UpstreamNodesOverview` must NOT wrap the whole section inside an outer `ui-card` box; each node item itself is an individual `.ui-card` in a 2-column grid (`grid-cols-1 md:grid-cols-2`).
- **Header Action**: Right side of the section header displays `编辑集群节点` (`dashboard.editClusterNodes`), triggering `onEditNodes` to open `ConfigModal` on the `'upstream'` tab.
- **Bottom Status Bar**: Displays `🔑 密钥池: N 个轮询` (`KeyRound` icon) and `平均延迟: xxxms` side by side below a subtle horizontal divider.
- **Node Name Cleanliness**: When `server.name` is configured (e.g. `s1`), display `s1` directly; when unconfigured, fallback to `s${serverIndex + 1}` so the header stays compact while the full `url` is shown on the second line.

## Review Focus

1. `server.name` is empty/undefined → falls back to `s${serverIndex + 1}` (e.g., `s1`, `s2`) instead of duplicating the domain in the title, because the full URL is displayed on line 2.
2. `server.keyCount` vs `server.apiKeys` → resolves `server.keyCount ?? server.apiKeys?.length ?? (type === 'direct' ? 1 : 1)` so `密钥池: N 个轮询` always has a valid number.
3. Clicking `编辑集群节点` → invokes `onEditNodes()` which opens `ConfigModal` with `initialTab="upstream"`.
4. Node `isIsolated === true` → right status pill renders rose badge with `ShieldAlert` icon and `熔断隔离` text.
5. `avgLatency === 0` → renders `平均延迟: 0ms` cleanly without `NaN` or missing units.

---

### Task 1: Refine `calculateUpstreamNodeSummary` & i18n Keys

**Files:**
- Modify: `frontend/src/utils/upstreamNodeHelpers.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `tests/upstreamNodeHelpers.test.ts`

**Interfaces:**
- Produces:
  - `UpstreamNodeSummaryItem`: `keyCount: number` (always a number, defaulting to `server.keyCount || server.apiKeys?.length || 1`), `name: string` (defaults to `s${serverIndex + 1}` when `server.name` is blank)
  - i18n keys under `dashboard`:
    - `upstreamNodesTitle`: `'上游集群节点列表'` (zh) / `'Upstream Cluster Nodes'` (en)
    - `editClusterNodes`: `'编辑集群节点'` (zh) / `'Edit Cluster Nodes'` (en)
    - `nodeWeightLabel`: `'权重'` (zh) / `'Weight'` (en)
    - `nodeHealthyOnline`: `'健康在线'` (zh) / `'Healthy Online'` (en)
    - `nodeDisabled`: `'已禁用'` (zh) / `'Disabled'` (en)
    - `nodeKeyPoolPolling`: `'密钥池: {count} 个轮询'` (zh) / `'Key Pool: {count} Polling'` (en)
    - `nodeAvgLatencyItem`: `'平均延迟: {ms}ms'` (zh) / `'Avg Latency: {ms}ms'` (en)

- [x] **Step 1: Update the unit test in `tests/upstreamNodeHelpers.test.ts`**

```ts
  it('uses short fallback name s1, s2 when server.name is omitted and resolves keyCount', () => {
    const upstreamServers = [
      {
        serverIndex: 0,
        url: 'https://s1.yatao.cc.cd',
        type: 'direct',
        weight: 1,
        enabled: true,
        keyCount: 3,
      },
    ];
    const summary = calculateUpstreamNodeSummary(upstreamServers, []);
    expect(summary[0].name).toBe('s1');
    expect(summary[0].url).toBe('https://s1.yatao.cc.cd');
    expect(summary[0].keyCount).toBe(3);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamNodeHelpers.test.ts`
Expected: FAIL on `summary[0].name` being `'Node 1 (s1.yatao.cc.cd)'` instead of `'s1'` and `keyCount` being `undefined`.

- [x] **Step 3: Update `frontend/src/utils/upstreamNodeHelpers.ts` and i18n files**

1. In `frontend/src/utils/upstreamNodeHelpers.ts`:
   - Set `const fallbackName = \`s\${serverIndex + 1}\`;`
   - Resolve `keyCount`:
     ```ts
     const rawKeyCount = typeof server.keyCount === 'number' && server.keyCount > 0
       ? server.keyCount
       : Array.isArray(server.apiKeys) && server.apiKeys.length > 0
       ? server.apiKeys.length
       : 1;
     ```
2. In `frontend/src/i18n/locales/zh.ts` and `en.ts`:
   - Update `dashboard.upstreamNodesTitle` to `'上游集群节点列表'` / `'Upstream Cluster Nodes'` and add `editClusterNodes`, `nodeWeightLabel`, `nodeHealthyOnline`, `nodeDisabled`, `nodeKeyPoolPolling`, `nodeAvgLatencyItem`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/upstreamNodeHelpers.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/utils/upstreamNodeHelpers.ts frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/upstreamNodeHelpers.test.ts
git commit -m "feat(dashboard): refine upstream node summary fallback name, keyCount, and i18n"
```

---

### Task 2: Redesign `UpstreamNodesOverview.tsx` & Wire `onEditNodes` in `DashboardView` and `App`

**Files:**
- Modify: `frontend/src/components/dashboard/UpstreamNodesOverview.tsx`
- Modify: `frontend/src/components/DashboardView.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `tests/upstreamNodesOverview.test.ts`

**Interfaces:**
- Consumes:
  - `calculateUpstreamNodeSummary` from `../../utils/upstreamNodeHelpers`
- Produces:
  - `UpstreamNodesOverviewProps`: `{ upstreamServers?: any[]; timeSeries?: any[]; range?: number | 'today'; onEditNodes?: () => void }`
  - `DashboardView`: accepts `{ adminKey: string; onEditNodes?: () => void }` and passes `onEditNodes` to `UpstreamNodesOverview`
  - `App.tsx`: passes `onEditNodes={() => { setConfigModalInitialTab('upstream'); setIsConfigModalOpen(true); }}` to `DashboardView`

- [x] **Step 1: Update the test in `tests/upstreamNodesOverview.test.ts`**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('UpstreamNodesOverview Flat Cluster Card Design', () => {
  const componentPath = path.resolve(__dirname, '../frontend/src/components/dashboard/UpstreamNodesOverview.tsx');
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');

  it('renders flat 2-column cluster cards with ShieldCheck, KeyRound, DIRECT/PROXY badge, and bottom status row', () => {
    const code = fs.readFileSync(componentPath, 'utf-8');
    expect(code).toContain('calculateUpstreamNodeSummary');
    expect(code).toContain('grid-cols-1 md:grid-cols-2');
    expect(code).toContain('ShieldCheck');
    expect(code).toContain('KeyRound');
    expect(code).toContain('DIRECT');
    expect(code).toContain('PROXY');
    expect(code).toContain('nodeKeyPoolPolling');
    expect(code).toContain('nodeAvgLatencyItem');
    expect(code).toContain('editClusterNodes');
  });

  it('wires onEditNodes from App.tsx through DashboardView to UpstreamNodesOverview', () => {
    const dashCode = fs.readFileSync(dashboardPath, 'utf-8');
    const appCode = fs.readFileSync(appPath, 'utf-8');
    expect(dashCode).toContain('onEditNodes');
    expect(appCode).toContain("setConfigModalInitialTab('upstream')");
  });

  it('i18n dictionaries include updated cluster node labels in zh and en', () => {
    expect((zh as any).dashboard.upstreamNodesTitle).toBe('上游集群节点列表');
    expect((zh as any).dashboard.editClusterNodes).toBe('编辑集群节点');
    expect((zh as any).dashboard.nodeHealthyOnline).toBe('健康在线');
    expect((en as any).dashboard.upstreamNodesTitle).toBe('Upstream Cluster Nodes');
    expect((en as any).dashboard.editClusterNodes).toBe('Edit Cluster Nodes');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamNodesOverview.test.ts`
Expected: FAIL with missing `ShieldCheck`, `KeyRound`, `onEditNodes`, etc.

- [x] **Step 3: Implement `UpstreamNodesOverview.tsx`, `DashboardView.tsx`, and `App.tsx`**

1. In `frontend/src/components/dashboard/UpstreamNodesOverview.tsx`:
   - Outer container: `<div className="space-y-3">` (no outer `.ui-card` box).
   - Top bar:
     - Left: `<Server className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />` + `<h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">{t('dashboard.upstreamNodesTitle', '上游集群节点列表')}</h3>`
     - Right: `<button type="button" onClick={onEditNodes} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer">{t('dashboard.editClusterNodes', '编辑集群节点')}</button>`
   - Grid: `<div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">`
   - Card item (`ui-card p-4 sm:p-5 rounded-2xl transition-all`):
     - Row 1 (`flex items-center justify-between gap-2`):
       - Left (`flex items-center space-x-2 min-w-0`):
         - Node name: `<span className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">{node.name}</span>`
         - Weight pill: `<span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/[0.04] dark:bg-white/[0.06] text-[var(--text-secondary)] shrink-0">{t('dashboard.nodeWeightLabel', '权重')}: {node.weight}</span>`
         - Mode pill: `<span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">{isDirect ? 'DIRECT' : 'PROXY'}</span>`
       - Right (Status pill):
         - Healthy: `<span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0"><ShieldCheck className="w-3.5 h-3.5" /><span>{t('dashboard.nodeHealthyOnline', '健康在线')}</span></span>`
         - Isolated: rose pill with `ShieldAlert` and `t('dashboard.nodesIsolated', '熔断隔离')`
         - Disabled: slate pill with `t('dashboard.nodeDisabled', '已禁用')`
     - Row 2 (URL):
       - `<div className="mt-1.5 text-xs sm:text-sm font-mono text-[var(--text-secondary)] truncate" title={node.url}>{node.url || node.host}</div>`
     - Divider + Row 3 (`mt-3.5 pt-3 border-t border-[var(--border-subtle)] flex items-center space-x-5 text-xs text-[var(--text-secondary)]`):
       - Key Pool item:
         ```tsx
         <div className="flex items-center space-x-1.5">
           <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
           <span>
             {t('dashboard.nodeKeyPoolPolling', '密钥池: {count} 个轮询').replace('{count}', String(node.keyCount ?? 1))}
           </span>
         </div>
         ```
       - Average Latency item:
         ```tsx
         <div className="flex items-center space-x-1.5 font-mono tabular-nums">
           <span>
             {t('dashboard.nodeAvgLatencyItem', '平均延迟: {ms}ms').replace('{ms}', String(node.avgLatency))}
           </span>
         </div>
         ```
2. In `frontend/src/components/DashboardView.tsx`:
   - Accept `onEditNodes?: () => void` in props and pass `onEditNodes={onEditNodes}` to `<UpstreamNodesOverview />`.
3. In `frontend/src/App.tsx`:
   - Pass `onEditNodes={() => { setConfigModalInitialTab('upstream'); setIsConfigModalOpen(true); }}` to `<DashboardView />`.

- [x] **Step 4: Run tests and frontend build**

Run: `npx jest tests/upstreamNodesOverview.test.ts tests/upstreamNodeHelpers.test.ts && npm run build:frontend`
Expected: PASS with 0 errors.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/UpstreamNodesOverview.tsx frontend/src/components/DashboardView.tsx frontend/src/App.tsx tests/upstreamNodesOverview.test.ts
git commit -m "feat(dashboard): redesign UpstreamNodesOverview as flat 2-column cluster cards"
```

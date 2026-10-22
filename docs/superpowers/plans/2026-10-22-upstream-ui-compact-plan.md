# Upstream Nodes Compact UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim down the expanded upstream node configuration form by ~45% and enhance collapsed summary pills so multiple upstream nodes are visually distinct and compact.

**Architecture:** Unify the duplicate Egress Channel blocks (`direct` and `proxy` modes) into a single compact inline toolbar row alongside theAllowed Models field, shrink the Direct Mode API Keys textarea from 3 rows with heavy outer padding to a 2-row inline field, and add mode badges (`代理`/`直连`) to the collapsed summary row so mobile and desktop users can distinguish node types even when collapsed.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Jest

**Spec:** Conversation-approved Option A confirmation checklist ("「代理与上游配置」UI 交互改造确认单")

## Global Constraints

- Maintain strict TypeScript patterns across `frontend/src/components/ConfigModal.tsx` and locale dictionaries.
- Preserve all existing i18n keys tested in `tests/configModalProxyUi.test.ts` and `tests/configModalWorkbench.test.ts` (`config.egressChannelTitle`, `config.egressLocalShort`, `config.egressProxyShort`, `config.globalProxyTitle`, `config.globalProxyPlaceholder`, `config.expandAll`, `config.collapseAll`).
- Keep `SPLIT_BORDER_COLORS`, `getCompactHost`, `#${idx + 1}`, `border-l-4`, and mutually exclusive `toggleServerExpand` behavior verified by `tests/configModalUpstreamCompact.test.ts`.

## Review Focus

1. Switching a node from `proxy` to `direct` mode while `url` is empty must still auto-populate `https://generativelanguage.googleapis.com`.
2. Collapsed node cards on mobile viewports (`< sm`) must not render the bulky full-width mode switcher bar when collapsed; mode switching on mobile belongs inside `isExpanded` while collapsed state shows a compact mode pill (`代理` / `直连`).
3. Nodes with `useProxy: true` when `proxyUrl` is blank must still display the amber warning badge `config.globalProxyNotConfigured`.
4. Direct mode API key pool textarea must deduplicate and trim keys on blur while displaying `Key × N` count badge in the label row.
5. Allowed models input must deduplicate comma-separated model names on blur and show `×N` badge when more than 1 model is configured.

---

### Task 1: Compact Collapsed Header & Mode Pill (Hide Mobile Mode Bar When Collapsed)

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:1290-1375`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/configModalUpstreamCompact.test.ts`

**Interfaces:**
- Produces: Collapsed summary row containing mode badge (`server.type === 'direct'`), host summary (`getCompactHost`), egress channel badge, model count badge, and key count badge; moves mobile-only mode switcher inside `{isExpanded && (...)}` so collapsed cards on mobile are truly compact.

- [x] **Step 1: Write the failing test in `tests/configModalUpstreamCompact.test.ts`**

```typescript
  test('collapsed state renders compact mode badge and hides mobile mode switcher when collapsed', () => {
    expect(content).toContain("t('config.modeDirectShort'");
    expect(content).toContain("t('config.modeProxyShort'");
    // Mobile segmented switcher should only render inside isExpanded block
    const collapsedToExpandedSlice = content.slice(
      content.indexOf('Collapsed State Compact Summary Pills'),
      content.indexOf('{isExpanded && (')
    );
    expect(collapsedToExpandedSlice).not.toContain('grid-cols-2 p-0.5 bg-slate-900');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/configModalUpstreamCompact.test.ts`
Expected: FAIL with `Expected substring: "t('config.modeDirectShort'"`

- [x] **Step 3: Add `modeProxyShort` / `modeDirectShort` to `zh.ts` and `en.ts`, render mode pill in collapsed summary, and move mobile mode switcher inside `isExpanded` in `frontend/src/components/ConfigModal.tsx`**

In `frontend/src/i18n/locales/zh.ts` (`config` section):
- `modeProxyShort: '代理'`
- `modeDirectShort: '直连'`

In `frontend/src/i18n/locales/en.ts` (`config` section):
- `modeProxyShort: 'Proxy'`
- `modeDirectShort: 'Direct'`

In `frontend/src/components/ConfigModal.tsx`:
- Inside `{!isExpanded && (...)}`, prepend a compact mode pill before `compactHost`:
  - `server.type === 'direct'` → cyan pill `{t('config.modeDirectShort', '直连')}`
  - otherwise → purple pill `{t('config.modeProxyShort', '代理')}`
- Move the `sm:hidden` mobile-only 2-column mode switcher inside `{isExpanded && (...)}` as the first `col-span-12 sm:hidden` item.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/configModalUpstreamCompact.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/configModalUpstreamCompact.test.ts
git commit -m "feat(config): add mode pill to collapsed summary and hide mobile switcher when collapsed"
```

---

### Task 2: Slim Expanded Node Form (Unify Egress Channel + Allowed Models Row & Compact API Keys)

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:1363-1615`
- Test: `tests/configModalUpstreamCompact.test.ts`

**Interfaces:**
- Consumes: `UpstreamServerConfig`, `serverModelInputs`, `serverKeyInputs`, `proxyUrl`
- Produces: Unified 3-row compact expanded form:
  - Row 1 (`col-span-12 grid grid-cols-12 gap-2`): `节点备注名 (col-span-8 sm:col-span-3)` + `网关 / 端点 URL (col-span-12 sm:col-span-7)` + `权重 (col-span-4 sm:col-span-2 sm:order-last)`
  - Row 2 (`col-span-12 grid grid-cols-12 gap-2 items-end`): `允许模型 (col-span-12 sm:col-span-7)` + unified `出口通道 (col-span-12 sm:col-span-5)` compact control bar (replaces the two separate `server.type === 'direct'` and `server.type !== 'direct'` full-width boxes)
  - Row 3 (`server.type === 'direct'` only): compact 2-row `textarea` (`rows={2}`) for `Gemini API Keys` without nested outer container box padding.

- [x] **Step 1: Write the failing test in `tests/configModalUpstreamCompact.test.ts`**

```typescript
  test('expanded form unifies egress channel switcher and uses compact 2-row API keys input', () => {
    // Egress channel title should appear only once in unified control instead of duplicated for direct/proxy
    const matches = content.match(/t\('config\.egressChannelTitle'/g) || [];
    expect(matches.length).toBe(1);
    // Direct API keys textarea uses rows={2} for compact vertical footprint
    expect(content).toContain('rows={2}');
    expect(content).not.toContain('rows={3}');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/configModalUpstreamCompact.test.ts`
Expected: FAIL with `Expected: 1, Received: 2`

- [x] **Step 3: Refactor expanded node form in `frontend/src/components/ConfigModal.tsx`**

1. Adjust Row 1 column spans to `sm:col-span-3` (Name), `sm:col-span-7` (URL), `sm:col-span-2` (Weight), and use `py-1.5 px-2` on inputs.
2. Replace the two separate Egress Channel blocks (`server.type === 'direct'` and `server.type !== 'direct'`) and the full-width Allowed Models row with a single 12-column row (`col-span-12 grid grid-cols-12 gap-2 items-end`):
   - Left (`col-span-12 sm:col-span-7 space-y-1`): `允许模型` single-line input with `×{count}` badge.
   - Right (`col-span-12 sm:col-span-5 space-y-1`): Unified `出口通道` label + status badge in label header (`config.viaGlobalProxyBadge` or `config.globalProxyNotConfigured` when `server.useProxy` is true) + full-width 2-button segmented control (`本机直连` / `代理通道`) matching input height (`h-[30px]`).
3. In Direct mode (`server.type === 'direct'`), render `Gemini API Keys` directly in `col-span-12 space-y-1` (no nested `p-2.5 bg-slate-900/60` box) with `rows={2}` and `Key × {count}` badge in the header row.

- [x] **Step 4: Run all ConfigModal tests and full frontend build to verify**

Run: `npx jest tests/configModalUpstreamCompact.test.ts tests/configModalProxyUi.test.ts tests/configModalWorkbench.test.ts tests/configModalMobile.test.ts && npm run build:frontend`
Expected: PASS on all 4 test suites and clean Vite build.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/ConfigModal.tsx tests/configModalUpstreamCompact.test.ts
git commit -m "refactor(config): slim expanded upstream node form and unify egress channel row"
```

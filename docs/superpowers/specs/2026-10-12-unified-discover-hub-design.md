# Unified Discover Hub Design Spec

## 1. Overview & Objective
Transform the Discover page (`DiscoverHubView`) from a two-tier layout (hardcoded builtin tools separated from user custom web apps) into a unified, composable application launchpad.
Users can configure the entire page via a desktop management modal ("⚙ 管理页面"):
- Unify builtin tools and custom web apps into a single data model (`DiscoverAppItem`).
- Support arbitrary ordering (drag / move up / move down) and visibility toggles (`enabled: boolean`).
- Add, edit, and delete custom web apps within the management modal.
- Provide a unified responsive card grid on desktop, and a clean, read-only launcher list on mobile without edit/config clutter.

## 2. Data Schema & Persistence

### 2.1 Unified Model (`DiscoverAppItem`)
```typescript
export type DiscoverAppType = 'builtin' | 'custom';
export type BuiltinToolId = 'systemLogs' | 'playground' | 'translate';

export interface DiscoverAppItem {
  id: string; // Builtin: 'systemLogs' | 'playground' | 'translate'; Custom: 'app_<timestamp>_<random>'
  type: DiscoverAppType;
  name: string; // Localized default for builtins, custom name for web apps
  description?: string;
  icon: string; // Lucide icon name, e.g. 'FileText' | 'Play' | 'Languages' | 'Globe'
  color: string; // Tailwind gradient class, e.g. 'from-blue-500 to-cyan-600'
  badge?: string; // Optional tag, e.g. 'SSE STREAM', 'REST', 'BILINGUAL', 'GW PROXY'
  enabled: boolean; // Visibility on Discover page
  order: number; // Sort order (ascending)
  
  // Custom Web App specific fields
  url?: string;
  useGateway?: boolean;
  createdAt?: number;
}
```

### 2.2 Storage & Migration
- Primary storage key: `localStorage.getItem('discover_hub_apps_config')`.
- Downward compatibility: If the new key does not exist:
  1. Check legacy `custom_discover_apps` key.
  2. Synthesize default builtin apps (`systemLogs` at order 0, `playground` at order 1, `translate` at order 2).
  3. Append existing custom apps starting at order 3.
  4. Save to `discover_hub_apps_config` and keep backward compatible fallback.
- Remote Cloud Sync: When `adminKey` is provided, sync updated apps to `/api/admin/config` via the existing `customWebApps` remote config payload.

## 3. UI & Interaction Architecture

### 3.1 Desktop (`md:block`)
- **Header**: Left side shows Discover Hub title and subtitle; right side contains a "⚙ 页面配置 / 管理" (Manage Page) button.
- **Unified Card Grid**:
  - Filter `apps.filter(a => a.enabled).sort((a, b) => a.order - b.order)`.
  - Render each app using uniform card styling (12x12 gradient icon, badge, title, subtitle/domain, launch CTA arrow).
  - Terminal card in grid is an interactive dashed card ("+ 添加应用 / 配置") that directly opens the management modal.

### 3.2 Mobile (`md:hidden`)
- Pure read-only launcher mode:
  - No management buttons or edit icons.
  - Render enabled apps ordered by `order` as an integrated WeChat-style rounded list card.
  - Clicking any item triggers navigation (`onSelectTool` for builtins or `onSelectCustomApp` for custom apps).

### 3.3 Page Management Modal (`DiscoverConfigModal`)
- Modal title: "发现页管理" (Manage Discover Hub).
- Item list displaying all apps (both builtin and custom) in current order:
  - Move Up / Move Down buttons (▲ / ▼) to adjust ordering.
  - App icon, name, and badge.
  - Type indicator chip ("内置" vs "外部应用").
  - Visibility toggle switch (Hide / Show).
  - Custom apps have Edit (✏️) and Delete (🗑️) action buttons. Builtins cannot be deleted, only hidden.
- Modal header / footer actions:
  - "+ 添加 Web 应用" opens the custom app creation dialog.
  - "恢复默认" (Reset Default) resets to initial default order and visibility.
  - "完成" (Done) closes modal and persists changes.

## 4. Error Handling & Edge Cases
1. Empty URL or invalid protocol in custom apps: Handled by `normalizeWebAppUrl`.
2. All apps disabled: Empty state with an "所有应用均已隐藏，点击管理恢复" prompt and a button to open config.
3. Storage failure / quota exceeded: Graceful fallback to in-memory state.
4. Legacy storage migration: Guaranteed seamless transition without data loss.

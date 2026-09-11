# Embedded Web Apps Header Consolidation & Cloud Sync Specification

## 1. Overview & Problem Statement

Following the initial implementation of the Embedded Web App feature, two major areas required refinement:
1. **Redundant Title & Navigation Bars**: When viewing an embedded web application (e.g., `Ubuntu Web UI`), both the global application header (displaying breadcrumbs like `Gemini Proxy > 发现 > Ubuntu Web UI`) and the `EmbeddedWebView`'s own internal toolbar (with back button, title, and actions) rendered simultaneously. This duplicated titles and consumed over 110px of vertical viewport space.
2. **Local-Only Persistence (Lack of Cloud Sync)**: Custom web apps were persisted solely in the browser's `localStorage` (`custom_discover_apps`), meaning newly configured entry points were not stored on the server and could not sync across different devices or browsers.

This specification addresses both concerns by:
- Merging the embedded navigation controls directly into the global `<header>`, eliminating internal duplicate bars in `EmbeddedWebView` and giving `iframe` maximal viewport height.
- Integrating `customWebApps` into the backend's `config/default.ts`, storing entries in `runtime.json` via `/api/admin/config`, and keeping multi-device environments in sync automatically.

---

## 2. Architecture & Design Principles

```
+-----------------------------------------------------------------------------------------+
|                                    Client Browser                                       |
|                                                                                         |
|  [ Unified Glass Header (App.tsx) ]                                                     |
|  ├─ In Normal Mode: Brand / Sidebar toggle, Breadcrumbs, Status, Theme, Settings        |
|  └─ In Embedded Web Mode (discoverSubView === 'embeddedWeb'):                           |
|      ├─ [ < Back to Discover ]                                                          |
|      ├─ [ App Icon + App Name + Hostname Capsule with SSL Lock ]                        |
|      └─ [ 🔄 Refresh ] [ ↗️ Open External ] [ ⛶ Fullscreen ] [ ⚙️ Edit App ]             |
|                                                                                         |
|  [ EmbeddedWebView Component (EmbeddedWebView.tsx) ]                                    |
|  └─ 100% Height Responsive <iframe> with loading skeleton (NO duplicate internal bar)    |
|                                                                                         |
|  [ Cloud Sync Data Flow (customWebAppsStorage.ts) ]                                     |
|  ├─ On Console Mount: GET /api/admin/status -> sync remote customWebApps to local cache |
|  └─ On Add/Edit/Delete: Update local state & POST /api/admin/config                     |
+--------------------------------------------+--------------------------------------------+
                                             | Authenticated Admin API
                                             v
+-----------------------------------------------------------------------------------------+
|                              Gemini Proxy Backend Server                                |
|                                                                                         |
|  Config Layer (config/default.ts):                                                      |
|  ├─ config.customWebApps: CustomWebAppItem[]                                            |
|  └─ updateConfig({ customWebApps }): Writes to config/runtime.json                      |
|                                                                                         |
|  Admin Routes (adminController.ts):                                                     |
|  ├─ GET /api/admin/status -> Returns { config: { ..., customWebApps } }                 |
|  └─ POST /api/admin/config -> Hot-reloads & persists customWebApps                       |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Detailed Component Specifications

### 3.1 Backend Configuration & Persistence (`config/default.ts` & `src/types/index.ts`)

1. **Type Definition (`src/types/index.ts`)**:
   ```typescript
   export interface CustomWebAppItem {
     id: string;
     name: string;
     url: string;
     icon?: string;
     color?: string;
     useGateway?: boolean;
     createdAt: number;
   }
   ```
2. **Default Configuration (`config/default.ts`)**:
   - Default `customWebApps` seeded with:
     ```typescript
     export const PRESET_CUSTOM_WEB_APPS: CustomWebAppItem[] = [
       {
         id: 'preset_ubuntu_ui',
         name: 'Ubuntu Web UI',
         url: 'https://ubuntu.yatao.cc.cd/ui/',
         icon: 'Layout',
         color: 'from-orange-500 to-amber-600',
         createdAt: 1726045000000,
       },
     ];
     ```
   - In `getEnvConfig()`: parse `CUSTOM_WEB_APPS` from environment if present, defaulting to `PRESET_CUSTOM_WEB_APPS`.
   - In `updateConfig()`: accept `partialConfig.customWebApps` and persist it to `runtime.json`.
3. **Admin Controller (`src/admin/controllers/adminController.ts`)**:
   - `getStatus` and `updateConfig` response payload exposes `customWebApps`.

### 3.2 Frontend Cloud Sync Layer (`frontend/src/utils/customWebAppsStorage.ts`)

1. **Hybrid Sync Policy**:
   - `syncCustomWebAppsFromRemote(remoteApps?: CustomWebAppItem[]): CustomWebAppItem[]`
   - `syncCustomWebAppsToRemote(apps: CustomWebAppItem[], adminKey: string): Promise<void>`
   - Saves to `localStorage` immediately for zero-latency optimism, then asynchronously sends `POST /api/admin/config` with `{ customWebApps }`.

### 3.3 Unified Header Integration (`frontend/src/App.tsx`)

1. **Conditional Global Header Rendering**:
   - When `activeTab === 'discover' && discoverSubView === 'embeddedWeb' && activeEmbeddedApp`:
     - Render unified embedded browser toolbar in `<header>`:
       - Back to discover button (`ChevronLeft` + label).
       - App icon with gradient badge.
       - App name and hostname security capsule (`Lock` + hostname).
       - Actions: Refresh button (triggers iframe reload state), Open External (`window.open`), Fullscreen toggle, Edit App button (opens `CustomWebAppModal`).
   - Normal tabs: Retain existing breadcrumbs and system controls.
2. **`EmbeddedWebView.tsx` Simplification**:
   - Remove the duplicate top toolbar from `EmbeddedWebView.tsx`.
   - `EmbeddedWebView` receives `reloadTrigger` from `App.tsx` and renders `<iframe>` directly with full container height (`calc(100vh - 3.5rem)` or `100vh` in fullscreen).

---

## 4. Verification & Testing Plan

1. **Backend Persistence Tests (`tests/customWebAppsCloudConfig.test.ts`)**:
   - Verify `updateConfig` saves and retrieves `customWebApps` through `runtime.json`.
   - Verify `adminController.getStatus` includes `customWebApps`.
2. **Frontend Header & Embedded Integration Tests (`tests/embeddedHeaderIntegration.test.ts`)**:
   - Verify global header switches to embedded browser bar when in `embeddedWeb` subview.
   - Verify toolbar actions (refresh, external link, fullscreen) work smoothly.
3. **Regression & Build Verification**:
   - All Jest test suites pass.
   - Full production build (`npm run build`) compiles cleanly.

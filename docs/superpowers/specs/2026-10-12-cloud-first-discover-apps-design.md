# Cloud-First Discover Apps Sync Design Spec

## 1. Overview & Objective
Eliminate all local browser storage (`localStorage`) dependencies for the Discover page configuration (`discover_hub_apps_config` and legacy `custom_discover_apps`). Establish the backend server (`config/runtime.json`) as the single source of truth for full Discover page ordering, visibility toggles, and custom apps.
This ensures that changes made on the desktop browser (e.g. moving a custom app to the top, hiding a tool) are immediately and seamlessly synchronized across all clients, specifically mobile devices without manual setup or separate local caches.

## 2. Server Architecture & Persistence

### 2.1 Schema Definition (`src/types/index.ts`)
```typescript
export type DiscoverAppType = 'builtin' | 'custom';
export type BuiltinToolId = 'systemLogs' | 'playground' | 'translate';

export interface DiscoverAppItem {
  id: string; // 'systemLogs' | 'playground' | 'translate' | 'app_<timestamp>_<random>'
  type: DiscoverAppType;
  name: string;
  description?: string;
  icon: string;
  color: string;
  badge?: string;
  enabled: boolean;
  order: number;
  url?: string;
  useGateway?: boolean;
  createdAt?: number;
}
```

### 2.2 Server Configuration (`config/default.ts`)
- Add `discoverApps: DiscoverAppItem[]` to the server config.
- Default builtin apps:
  - `systemLogs` (order: 0, enabled: true)
  - `playground` (order: 1, enabled: true)
  - `translate` (order: 2, enabled: true)
  - `preset_ubuntu_ui` (order: 3, enabled: true)
- Backward compatibility & migration in `config/default.ts`:
  - When loading from `runtime.json` or environment, if `discoverApps` is present, it is used directly.
  - If only `customWebApps` is present (legacy), automatically synthesize the default 3 builtin apps (order 0..2) followed by the custom apps (order 3+).
  - When saving `discoverApps` via `updateConfig`, automatically maintain `customWebApps` derived from apps where `type === 'custom'`.

### 2.3 Admin API Endpoints (`src/admin/controllers/adminController.ts`)
- `GET /api/admin/status`: Returns `config.discoverApps` as part of the config payload.
- `POST /api/admin/config` and `PUT /api/admin/config`: Accepts `{ discoverApps: DiscoverAppItem[] }`, sanitizes contiguous orders (0..N-1), saves to `config/runtime.json`, and returns updated `config.discoverApps`.

## 3. Frontend Architecture (Zero-LocalStorage, Cloud-First)

### 3.1 Complete Removal of LocalStorage
- Delete all `localStorage.getItem` and `localStorage.setItem` calls related to Discover configuration (`discover_hub_apps_config`, `custom_discover_apps`).
- `frontend/src/utils/discoverAppsStorage.ts` is refactored into pure memory helper functions:
  - `DEFAULT_DISCOVER_APPS`: Initial in-memory fallback list.
  - Helper functions for re-indexing, moving items, toggling visibility, and CRUD operations on custom items that work directly on arrays.
  - Remote API calls `fetchRemoteDiscoverApps(adminKey)` and `saveRemoteDiscoverApps(apps, adminKey)`.

### 3.2 Rendering & Synchronization Flow (Option A: In-Memory Fallback + Seamless Remote Replacement)
1. **Initial Mount**: `DiscoverHubView` and `App.tsx` initialize with `DEFAULT_DISCOVER_APPS` in React state. The user immediately sees the interface without layout shifts or blank screens.
2. **Cloud Fetch**:
   - `App.tsx` fetches `/api/admin/status` on load / auth verification.
   - When `data.config.discoverApps` is received, it updates the global/hub state.
   - `DiscoverHubView` also supports directly loading/refreshing from `/api/admin/status` if props are passed or on mount.
3. **Desktop Configuration Updates**:
   - In `DiscoverConfigModal`, when a user moves an item up/down, toggles visibility, or adds/edits/deletes an app:
     1. Optimistically update local React state.
     2. Send `POST /api/admin/config` with `{ discoverApps: updatedList }`.
     3. On error, display notification and restore prior state.
4. **Mobile Experience**:
   - Read-only launcher.
   - Because mobile pulls `/api/admin/status` directly on startup, it receives the exact customized ordering from the server.
   - If a custom app was moved to index 0 on desktop, it will display as the very first card on mobile.

## 4. Testing & Verification Plan
1. **Backend Unit & Integration Tests**:
   - Verify `GET /api/admin/status` returns `discoverApps`.
   - Verify `POST /api/admin/config` updates and persists `discoverApps` in `runtime.json` and syncs `customWebApps`.
   - Verify legacy migration when only `customWebApps` exists.
2. **Frontend Storage Utility Tests**:
   - Verify all functions in `discoverAppsStorage.ts` operate in-memory without accessing `localStorage`.
   - Verify optimistic reordering and remote API synchronization.
3. **End-to-End Consistency**:
   - Simulate a desktop client reordering custom app to position 0 and saving to backend.
   - Verify a new simulated client (e.g. mobile) receives that order as the authoritative view without prior `localStorage`.

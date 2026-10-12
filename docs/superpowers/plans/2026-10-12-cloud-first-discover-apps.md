# Cloud-First Discover Apps Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all `localStorage` caching for the Discover page layout, establishing the backend server (`config/runtime.json`) as the single source of truth for app ordering, visibility, and custom apps across desktop and mobile devices.

**Architecture:** Extend backend configuration with `discoverApps: DiscoverAppItem[]` and wire it through `GET /api/admin/status` and `POST /api/admin/config` with automatic legacy compatibility. Refactor frontend `discoverAppsStorage.ts` to remove `localStorage` entirely, using in-memory defaults on initial mount and seamlessly replacing them with the server's authoritative state upon network load.

**Tech Stack:** Express, TypeScript, Node.js, React 18, Tailwind CSS, Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-12-cloud-first-discover-apps-design.md`

## Global Constraints
- Zero static configuration caching in backend: dynamic evaluation via getters in `config/default.ts`.
- Zero `localStorage` dependency for discover page ordering and visibility.
- Mobile viewport constraint: Mobile (`md:hidden`) Discover page is strictly read-only and displays items matching the server's ordered `discoverApps`.
- Zero regressions across existing proxy pipelines, translators, and admin endpoints.

## Review Focus
1. **Zero-LocalStorage Verification**: Ensure neither `discover_hub_apps_config` nor `custom_discover_apps` is read from or written to `localStorage` during runtime.
2. **Legacy Migration on Backend**: If an existing server only has `customWebApps` in `runtime.json`, the backend must automatically synthesize the default builtin apps (order 0..2) followed by the custom apps (order 3+).
3. **Contiguous Order Normalization**: When `POST /api/admin/config` receives reordered `discoverApps`, it must enforce contiguous 0..N-1 ordering to prevent indexing drift.
4. **Instant In-Memory Render (No Blank Screen)**: Ensure `DiscoverHubView` mounts instantly with `DEFAULT_DISCOVER_APPS` and seamlessly swaps in remote data once `/api/admin/status` responds.
5. **Mobile Order Consistency**: When a custom app is moved to order 0 on desktop and persisted to the cloud, any new client (simulating mobile) without prior state must see that custom app at the very top.

---

### Task 1: Backend DiscoverApps Schema & Persistent Configuration

**Files:**
- Modify: `src/types/index.ts`
- Modify: `config/default.ts`
- Modify: `src/admin/controllers/adminController.ts`
- Test: `tests/discoverAppsCloudConfig.test.ts`

**Interfaces:**
- Produces in `src/types/index.ts`:
  ```typescript
  export type DiscoverAppType = 'builtin' | 'custom';
  export type BuiltinToolId = 'systemLogs' | 'playground' | 'translate';
  export interface DiscoverAppItem {
    id: string;
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
- Produces in `config/default.ts`:
  - `DEFAULT_BUILTIN_DISCOVER_APPS: DiscoverAppItem[]`
  - `config.discoverApps: DiscoverAppItem[]`
  - `updateConfig` handles `discoverApps`, normalizes `order: 0..N-1`, and syncs `config.customWebApps`.
- Produces in `src/admin/controllers/adminController.ts`:
  - `GET /api/admin/status`: includes `discoverApps: config.discoverApps`
  - `POST /api/admin/config`: accepts `{ discoverApps: [...] }` and returns updated `discoverApps`.

- [ ] **Step 1: Write failing tests for backend discoverApps configuration**

Create `tests/discoverAppsCloudConfig.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';
import { DiscoverAppItem } from '../src/types';
import { promises as fs } from 'fs';
import * as path from 'path';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Backend DiscoverApps Cloud Config', () => {
  const adminKey = config.adminSecretKey || 'test-admin-key';
  const runtimeJsonPath = path.join(process.cwd(), 'config', 'runtime.test.json');

  beforeAll(() => {
    config.adminSecretKey = adminKey;
  });

  beforeEach(async () => {
    await updateConfig({}, { resetToEnv: true });
  });

  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
    try {
      await fs.unlink(runtimeJsonPath);
    } catch {
      // ignore
    }
  });

  it('should expose default discoverApps in GET /api/admin/status', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toBeDefined();
    expect(Array.isArray(res.body.config.discoverApps)).toBe(true);
    expect(res.body.config.discoverApps.length).toBeGreaterThanOrEqual(3);
    expect(res.body.config.discoverApps[0].id).toBe('systemLogs');
    expect(res.body.config.discoverApps[0].order).toBe(0);
  });

  it('should persist reordered discoverApps and update customWebApps via POST /api/admin/config', async () => {
    const reordered: DiscoverAppItem[] = [
      {
        id: 'app_my_top_app',
        type: 'custom',
        name: 'My Top Custom App',
        icon: 'Globe',
        color: 'from-orange-500 to-amber-600',
        enabled: true,
        order: 0,
        url: 'https://top.example.com',
        createdAt: 1000,
      },
      {
        id: 'systemLogs',
        type: 'builtin',
        name: '系统日志',
        icon: 'FileText',
        color: 'from-blue-500 to-cyan-600',
        enabled: true,
        order: 1,
      },
      {
        id: 'playground',
        type: 'builtin',
        name: '接口演练',
        icon: 'Play',
        color: 'from-orange-500 to-amber-600',
        enabled: true,
        order: 2,
      },
      {
        id: 'translate',
        type: 'builtin',
        name: '双语对照',
        icon: 'Languages',
        color: 'from-indigo-500 to-purple-600',
        enabled: false,
        order: 3,
      },
    ];

    const res = await request(app)
      .post('/api/admin/config')
      .set('x-admin-key', adminKey)
      .send({ discoverApps: reordered });

    expect(res.status).toBe(200);
    expect(res.body.config.discoverApps).toBeDefined();
    expect(res.body.config.discoverApps[0].id).toBe('app_my_top_app');
    expect(res.body.config.discoverApps[0].order).toBe(0);

    // Verify config getter reflects updated order
    expect(config.discoverApps[0].id).toBe('app_my_top_app');

    // Verify customWebApps is synchronized
    expect(config.customWebApps.some(a => a.id === 'app_my_top_app')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverAppsCloudConfig.test.ts`
Expected: FAIL (discoverApps property missing in config and adminController)

- [ ] **Step 3: Update `src/types/index.ts`**

Export `DiscoverAppType`, `BuiltinToolId`, and `DiscoverAppItem`.

- [ ] **Step 4: Update `config/default.ts`**

1. Define `DEFAULT_BUILTIN_DISCOVER_APPS: DiscoverAppItem[]`.
2. Add helper to construct `discoverApps` from `parsedCustomWebApps` if not explicitly in `runtimeOverrides` or env.
3. In `getEnvConfig()`: parse `process.env.DISCOVER_APPS` or fallback.
4. In `config` object: add `get discoverApps()` and `set discoverApps()`.
5. In `updateConfig()`:
   - If `partialConfig.discoverApps` is provided, normalize contiguous `order` (0..N-1).
   - Synchronize `partialConfig.customWebApps = partialConfig.discoverApps.filter(a => a.type === 'custom')`.

- [ ] **Step 5: Update `src/admin/controllers/adminController.ts`**

Include `discoverApps: config.discoverApps` in both `getStatus` and `updateConfig` response bodies.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/discoverAppsCloudConfig.test.ts`
Expected: PASS

- [ ] **Step 7: Commit Task 1**

```bash
git add src/types/index.ts config/default.ts src/admin/controllers/adminController.ts tests/discoverAppsCloudConfig.test.ts
git commit -m "feat(config): add discoverApps cloud configuration and persistence"
```

---

### Task 2: Refactor Frontend Discover Storage (Zero-LocalStorage)

**Files:**
- Modify: `frontend/src/utils/discoverAppsStorage.ts`
- Modify: `tests/discoverAppsStorage.test.ts`

**Interfaces:**
- Produces in `frontend/src/utils/discoverAppsStorage.ts`:
  - `export const DEFAULT_DISCOVER_APPS: DiscoverAppItem[]`: pure in-memory defaults.
  - `export function reindexApps(apps: DiscoverAppItem[]): DiscoverAppItem[]`: contiguous orders.
  - `export function moveAppInList(apps: DiscoverAppItem[], id: string, direction: 'up' | 'down'): DiscoverAppItem[]`.
  - `export function toggleAppVisibilityInList(apps: DiscoverAppItem[], id: string): DiscoverAppItem[]`.
  - `export function upsertCustomAppInList(apps: DiscoverAppItem[], app: Partial<DiscoverAppItem>): DiscoverAppItem[]`.
  - `export function deleteCustomAppInList(apps: DiscoverAppItem[], id: string): DiscoverAppItem[]`.
  - `export async function fetchRemoteDiscoverApps(adminKey?: string): Promise<DiscoverAppItem[]>`: fetches `/api/admin/status`.
  - `export async function saveRemoteDiscoverApps(apps: DiscoverAppItem[], adminKey?: string): Promise<boolean>`: posts to `/api/admin/config`.
  - **Zero references** to `localStorage`.

- [ ] **Step 1: Update unit tests in `tests/discoverAppsStorage.test.ts`**

Update tests to verify that `discoverAppsStorage.ts` works in-memory, provides remote API methods, and does not touch `localStorage`:
```typescript
import {
  DEFAULT_DISCOVER_APPS,
  reindexApps,
  moveAppInList,
  toggleAppVisibilityInList,
  upsertCustomAppInList,
  deleteCustomAppInList,
  fetchRemoteDiscoverApps,
  saveRemoteDiscoverApps,
} from '../frontend/src/utils/discoverAppsStorage';
import { DiscoverAppItem } from '../frontend/src/types/discoverApps';

describe('discoverAppsStorage (In-Memory & Remote Only)', () => {
  it('provides default in-memory apps', () => {
    expect(DEFAULT_DISCOVER_APPS.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_DISCOVER_APPS[0].id).toBe('systemLogs');
  });

  it('moves apps up and down correctly in-memory', () => {
    const list = [...DEFAULT_DISCOVER_APPS];
    const topId = list[0].id;
    const secondId = list[1].id;

    // Moving top item up is no-op
    let moved = moveAppInList(list, topId, 'up');
    expect(moved[0].id).toBe(topId);

    // Moving second item up swaps position
    moved = moveAppInList(list, secondId, 'up');
    expect(moved[0].id).toBe(secondId);
    expect(moved[1].id).toBe(topId);
    expect(moved[0].order).toBe(0);
    expect(moved[1].order).toBe(1);
  });

  it('toggles visibility in-memory', () => {
    const list = [...DEFAULT_DISCOVER_APPS];
    const toggled = toggleAppVisibilityInList(list, 'systemLogs');
    expect(toggled.find(a => a.id === 'systemLogs')?.enabled).toBe(false);
  });

  it('upserts and deletes custom app in-memory', () => {
    let list = [...DEFAULT_DISCOVER_APPS];
    list = upsertCustomAppInList(list, {
      name: 'Cloud Note',
      url: 'https://notes.local',
    });
    const item = list.find(a => a.name === 'Cloud Note');
    expect(item).toBeDefined();
    expect(item?.type).toBe('custom');

    list = deleteCustomAppInList(list, item!.id);
    expect(list.find(a => a.name === 'Cloud Note')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverAppsStorage.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `frontend/src/utils/discoverAppsStorage.ts`**

Rewrite the storage utility:
1. Strip all `localStorage` methods (`localStorage.getItem`, `setItem`, `removeItem`).
2. Provide pure in-memory transformation functions (`reindexApps`, `moveAppInList`, `toggleAppVisibilityInList`, `upsertCustomAppInList`, `deleteCustomAppInList`).
3. Provide `fetchRemoteDiscoverApps(adminKey)` and `saveRemoteDiscoverApps(apps, adminKey)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/discoverAppsStorage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add frontend/src/utils/discoverAppsStorage.ts tests/discoverAppsStorage.test.ts
git commit -m "refactor(frontend): convert discoverAppsStorage to pure in-memory and remote sync"
```

---

### Task 3: Refactor DiscoverHubView and DiscoverConfigModal to Cloud-First

**Files:**
- Modify: `frontend/src/components/DiscoverConfigModal.tsx`
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `tests/discoverHubCloudFirst.test.ts`

**Interfaces:**
- Consumes:
  - `DEFAULT_DISCOVER_APPS`, `fetchRemoteDiscoverApps`, `saveRemoteDiscoverApps`, `moveAppInList`, `toggleAppVisibilityInList`, `upsertCustomAppInList`, `deleteCustomAppInList` from `frontend/src/utils/discoverAppsStorage.ts`
- Produces:
  - `DiscoverHubView`:
    - Mounts with `DEFAULT_DISCOVER_APPS`.
    - Automatically fetches `/api/admin/status` on mount / adminKey update to load cloud `discoverApps`.
    - Updates local state and passes remote `saveRemoteDiscoverApps` callback.
  - `DiscoverConfigModal`:
    - Edits operate on `apps` passed via props or state.
    - On every change (move, toggle, edit, delete, reset), immediately invokes remote save via `saveRemoteDiscoverApps`.
  - `App.tsx`:
    - Passes `discoverApps` from status response down to `DiscoverHubView` if available.

- [ ] **Step 1: Write integration test for Cloud-First DiscoverHubView**

Create `tests/discoverHubCloudFirst.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('DiscoverHubView Cloud-First Architecture', () => {
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');
  const modalPath = path.resolve(__dirname, '../frontend/src/components/DiscoverConfigModal.tsx');
  const storagePath = path.resolve(__dirname, '../frontend/src/utils/discoverAppsStorage.ts');

  it('does not contain any localStorage calls in DiscoverHubView or storage utility', () => {
    const hubContent = fs.readFileSync(hubPath, 'utf-8');
    const storageContent = fs.readFileSync(storagePath, 'utf-8');
    expect(hubContent).not.toContain('localStorage');
    expect(storageContent).not.toContain('localStorage');
  });

  it('uses remote fetch and save functions in DiscoverHubView', () => {
    const hubContent = fs.readFileSync(hubPath, 'utf-8');
    expect(hubContent).toContain('fetchRemoteDiscoverApps');
    expect(hubContent).toContain('saveRemoteDiscoverApps');
  });

  it('modal updates trigger remote save with adminKey', () => {
    const modalContent = fs.readFileSync(modalPath, 'utf-8');
    expect(modalContent).toContain('saveRemoteDiscoverApps');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverHubCloudFirst.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `frontend/src/components/DiscoverConfigModal.tsx`**

1. Accept `apps: DiscoverAppItem[]` and `onSaveApps: (newApps: DiscoverAppItem[]) => Promise<void> | void`.
2. Handlers for `handleMove`, `handleToggle`, `handleDelete`, `handleReset` transform the array using the in-memory helpers and invoke `onSaveApps(updated)`.

- [ ] **Step 4: Update `frontend/src/components/DiscoverHubView.tsx`**

1. Initialize `const [apps, setApps] = useState<DiscoverAppItem[]>(DEFAULT_DISCOVER_APPS)`.
2. In `useEffect` on `adminKey`:
   ```typescript
   fetchRemoteDiscoverApps(adminKey).then((remoteApps) => {
     if (remoteApps && remoteApps.length > 0) {
       setApps(remoteApps);
     }
   });
   ```
3. Implement `handleSaveApps(newApps: DiscoverAppItem[])`:
   - Optimistically `setApps(newApps)`.
   - Call `saveRemoteDiscoverApps(newApps, adminKey)`.
4. Update custom app save/delete handlers to use `upsertCustomAppInList` and `deleteCustomAppInList`.
5. Pass `apps` and `handleSaveApps` to `DiscoverConfigModal`.

- [ ] **Step 5: Update `frontend/src/App.tsx`**

Ensure `App.tsx` handles `data?.config?.discoverApps` properly on login / verify.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest tests/discoverHubCloudFirst.test.ts`
Expected: PASS

- [ ] **Step 7: Commit Task 3**

```bash
git add frontend/src/components/DiscoverConfigModal.tsx frontend/src/components/DiscoverHubView.tsx frontend/src/App.tsx tests/discoverHubCloudFirst.test.ts
git commit -m "feat(discover): refactor DiscoverHubView and modal to cloud-first architecture"
```

---

### Task 4: End-to-End Build & Full Regression Verification

**Files:**
- Modify/Fix: Any impacted test in `tests/`
- Build: Root and frontend

- [ ] **Step 1: Run frontend compilation**

Run: `npm run build:frontend`
Expected: Vite builds successfully with 0 errors.

- [ ] **Step 2: Run backend TypeScript compilation**

Run: `npm run build:backend`
Expected: `tsc` compiles with 0 errors.

- [ ] **Step 3: Run all Discover and Custom Web App test suites**

Run: `npx jest tests/discover*.test.ts tests/customWebApp*.test.ts --runInBand`
Expected: All suites PASS.

- [ ] **Step 4: Run complete project test suite**

Run: `npm test`
Expected: All 100+ test suites PASS with 0 regressions.

- [ ] **Step 5: Commit and finalize**

```bash
git add .
git commit -m "chore: verify cloud-first discover apps build and test suite"
```

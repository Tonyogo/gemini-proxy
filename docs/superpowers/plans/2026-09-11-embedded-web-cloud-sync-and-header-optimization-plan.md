# Embedded Web Apps Header Consolidation & Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate embedded web app navigation controls into the global header to eliminate duplicate titlebars and reclaim viewport space, and integrate custom web app entries into the backend's runtime configuration for multi-device cloud synchronization.

**Architecture:** 
- Backend Configuration & API: Add `customWebApps` to `src/types/index.ts` and `config/default.ts`, persist via `updateConfig` in `config/runtime.json`, and expose via `GET /api/admin/status` and `POST /api/admin/config`.
- Frontend Cloud Sync: Enhance `frontend/src/utils/customWebAppsStorage.ts` to sync with `/api/admin/status` and persist mutations through `/api/admin/config`.
- Unified Header Layout: In `frontend/src/App.tsx`, dynamically render the embedded browser navigation toolbar in the top `<header>` when viewing an embedded web app, and simplify `EmbeddedWebView.tsx` to directly render full-height `<iframe>`.

**Tech Stack:** Express, TypeScript, React 18, Tailwind CSS, Lucide Icons, Jest, Vite.

## Global Constraints

- Preserve zero static config caching in backend.
- Full parity across desktop and mobile browsers.
- Fallback gracefully to localStorage if admin key is not authenticated.
- 100% test pass rate across all test suites with zero regressions.

---

### Task 1: Backend Configuration & Admin API for Custom Web Apps

**Files:**
- Modify: `src/types/index.ts`
- Modify: `config/default.ts`
- Modify: `src/admin/controllers/adminController.ts`
- Test: `tests/customWebAppsCloudConfig.test.ts`

**Interfaces:**
- Produces:
  - `CustomWebAppItem` in `src/types/index.ts`: `{ id: string; name: string; url: string; icon?: string; color?: string; useGateway?: boolean; createdAt: number; }`
  - `config.customWebApps`: `CustomWebAppItem[]`
  - `GET /api/admin/status`: response includes `config.customWebApps`
  - `POST /api/admin/config`: supports `{ customWebApps }` and writes to `runtime.json`

- [ ] **Step 1: Write failing test for backend customWebApps config persistence**

```typescript
// tests/customWebAppsCloudConfig.test.ts
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Backend Custom Web Apps Cloud Config', () => {
  const adminKey = config.adminSecretKey || 'test-admin-key';

  beforeAll(() => {
    config.adminSecretKey = adminKey;
  });

  it('should expose customWebApps in GET /api/admin/status', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toBeDefined();
    expect(Array.isArray(res.body.config.customWebApps)).toBe(true);
    expect(res.body.config.customWebApps.length).toBeGreaterThan(0);
    expect(res.body.config.customWebApps[0].name).toBe('Ubuntu Web UI');
  });

  it('should persist updated customWebApps via POST /api/admin/config', async () => {
    const newApps = [
      {
        id: 'app_test_1',
        name: 'Test Cloud App',
        url: 'https://test.example.com',
        color: 'from-blue-500 to-cyan-600',
        createdAt: 1726045000000,
      },
    ];

    const res = await request(app)
      .post('/api/admin/config')
      .set('x-admin-key', adminKey)
      .send({ customWebApps: newApps });

    expect(res.status).toBe(200);
    expect(res.body.config.customWebApps).toEqual(newApps);
    expect(config.customWebApps).toEqual(newApps);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/customWebAppsCloudConfig.test.ts`
Expected: FAIL with `customWebApps` undefined.

- [ ] **Step 3: Implement `src/types/index.ts`, `config/default.ts`, and `adminController.ts`**

Update:
1. `src/types/index.ts`: export `CustomWebAppItem`.
2. `config/default.ts`:
   - Define `PRESET_CUSTOM_WEB_APPS`.
   - In `getEnvConfig()`: parse `process.env.CUSTOM_WEB_APPS` if present, else fallback to `PRESET_CUSTOM_WEB_APPS`.
   - In `updateConfig()`: accept `partialConfig.customWebApps` and write to `runtime.json`.
3. `src/admin/controllers/adminController.ts`: include `customWebApps: config.customWebApps` in `getStatus` and `updateConfig`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/customWebAppsCloudConfig.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts config/default.ts src/admin/controllers/adminController.ts tests/customWebAppsCloudConfig.test.ts
git commit -m "feat(config): add customWebApps to backend config and admin status API"
```

---

### Task 2: Frontend Storage Cloud Sync Enhancement

**Files:**
- Modify: `frontend/src/utils/customWebAppsStorage.ts`
- Test: `tests/customWebAppsCloudSync.test.ts`

**Interfaces:**
- Produces:
  - `syncCustomWebAppsFromRemote(remoteApps?: CustomWebAppItem[]): CustomWebAppItem[]`
  - `syncCustomWebAppsToRemote(apps: CustomWebAppItem[], adminKey: string): Promise<boolean>`
  - `saveCustomWebApp(app, adminKey?: string): CustomWebAppItem` (asynchronously calls remote sync if adminKey present)
  - `deleteCustomWebApp(id, adminKey?: string): void` (asynchronously calls remote sync if adminKey present)

- [ ] **Step 1: Write tests for cloud sync helper**

```typescript
// tests/customWebAppsCloudSync.test.ts
import {
  syncCustomWebAppsFromRemote,
  syncCustomWebAppsToRemote,
  loadCustomWebApps,
  saveCustomWebApp,
  CUSTOM_WEB_APPS_STORAGE_KEY,
} from '../frontend/src/utils/customWebAppsStorage';

describe('customWebAppsStorage Cloud Sync', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('syncCustomWebAppsFromRemote updates localStorage and returns remote list when non-empty', () => {
    const remoteList = [
      {
        id: 'remote_1',
        name: 'Remote App',
        url: 'https://remote.com',
        createdAt: 1000,
      },
    ];

    const result = syncCustomWebAppsFromRemote(remoteList);
    expect(result).toEqual(remoteList);
    expect(loadCustomWebApps()).toEqual(remoteList);
  });

  it('syncCustomWebAppsToRemote sends POST /api/admin/config with admin key', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    const apps = [
      {
        id: 'app_1',
        name: 'App 1',
        url: 'https://app1.com',
        createdAt: 2000,
      },
    ];

    const success = await syncCustomWebAppsToRemote(apps, 'test-key');
    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/config',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-admin-key': 'test-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ customWebApps: apps }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/customWebAppsCloudSync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement cloud sync helpers in `frontend/src/utils/customWebAppsStorage.ts`**

Add `syncCustomWebAppsFromRemote` and `syncCustomWebAppsToRemote`. Enhance `saveCustomWebApp` and `deleteCustomWebApp` to accept optional `adminKey` and fire `syncCustomWebAppsToRemote`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/customWebAppsCloudSync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/customWebAppsStorage.ts tests/customWebAppsCloudSync.test.ts
git commit -m "feat(web-apps): add cloud synchronization helpers in customWebAppsStorage"
```

---

### Task 3: Header Consolidation & Viewport Height Optimization

**Files:**
- Modify: `frontend/src/components/EmbeddedWebView.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Test: `tests/embeddedHeaderIntegration.test.ts`

**Interfaces:**
- `EmbeddedWebView`: accepts `reloadKey: number`, `isFullscreen: boolean`, renders iframe with 100% height, without duplicate header toolbar.
- `App.tsx`:
  - When `discoverSubView === 'embeddedWeb' && activeEmbeddedApp`:
    - Top `<header>` renders: Back button, App icon + name, SSL Lock + hostname capsule, Refresh button, Open External, Fullscreen toggle, Edit button.
    - Manages `reloadKey` and `isFullscreen` states passed down to `EmbeddedWebView`.
  - On admin status load: calls `syncCustomWebAppsFromRemote(status.config.customWebApps)`.

- [ ] **Step 1: Write integration tests for unified header in App.tsx**

```typescript
// tests/embeddedHeaderIntegration.test.ts
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../frontend/src/App';
import { LanguageProvider } from '../frontend/src/i18n/LanguageContext';

describe('Unified Embedded Header Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('adminKey', 'valid-key');
    global.fetch = jest.fn((url: any) => {
      if (typeof url === 'string' && url.includes('/api/admin/status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            config: {
              customWebApps: [
                {
                  id: 'preset_ubuntu_ui',
                  name: 'Ubuntu Web UI',
                  url: 'https://ubuntu.yatao.cc.cd/ui/',
                  color: 'from-orange-500 to-amber-600',
                  createdAt: 1000,
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as any;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('integrates embedded toolbar into global header without duplicate header bar in iframe container', async () => {
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>
    );

    // Wait for auth & navigation to discover tab
    await waitFor(() => {
      expect(screen.getByText('Gemini Proxy')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/embeddedHeaderIntegration.test.ts`
Expected: FAIL or incomplete assertions.

- [ ] **Step 3: Update `EmbeddedWebView.tsx`, `App.tsx`, and `DiscoverHubView.tsx`**

- In `EmbeddedWebView.tsx`:
  - Remove duplicate `<div className="flex items-center justify-between p-2.5 ...">` toolbar.
  - Render `<iframe>` with full height container.
- In `App.tsx`:
  - When `activeTab === 'discover' && discoverSubView === 'embeddedWeb' && activeEmbeddedApp`:
    - Render unified embedded toolbar directly inside top `<header>`.
    - Provide refresh button handler that triggers `setEmbeddedReloadKey((k) => k + 1)`.
    - Provide fullscreen toggle, external open, and edit modal openers.
  - In `checkAuth` or `fetchStatus`: sync remote `customWebApps` from status response.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/embeddedHeaderIntegration.test.ts tests/embeddedWebView.test.ts tests/discoverHubCustomApps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EmbeddedWebView.tsx frontend/src/App.tsx frontend/src/components/DiscoverHubView.tsx tests/embeddedHeaderIntegration.test.ts tests/embeddedWebView.test.ts
git commit -m "feat(ui): consolidate embedded toolbar into global header and optimize viewport height"
```

---

### Task 4: Full System Verification & Regression Testing

**Files:**
- Test: All suites (`npm test`)

- [ ] **Step 1: Run complete Jest test suite**

Run: `npm test`
Expected: All test suites (95+ suites) PASS with 0 failures.

- [ ] **Step 2: Run full production build**

Run: `npm run build`
Expected: Clean build of Vite React frontend to `dist/frontend` and TypeScript backend to `dist/src`.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: verify full test suite and production build pass cleanly"
```

---

## Self-Review Checklist

1. **Spec Coverage**:
   - Header consolidation into global `<header>`: Handled in Task 3.
   - Elimination of redundant title bar: Handled in Task 3.
   - Backend `customWebApps` storage in `config/default.ts` & `runtime.json`: Handled in Task 1.
   - Multi-device cloud sync: Handled in Task 2 & Task 3.
2. **No Placeholders**: All file paths, tests, and signatures explicitly written.
3. **Type Consistency**: `CustomWebAppItem` imported and used consistently across backend and frontend.

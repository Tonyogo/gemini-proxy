# Mihomo Web Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a native, lightweight, and responsive Mihomo (Clash.Meta) Web Management Panel inside the Discover page, connected to the local Mihomo API (`http://127.0.0.1:9090`) via a secure authenticated backend reverse proxy with traffic monitoring, node switching, latency testing, and mode toggling.

**Architecture:**
1. **Backend Relay (`mihomoService.ts` & `mihomoController.ts`)**: Secure reverse proxy mounted at `/api/admin/mihomo/*`, protected by `x-admin-key`. Injects `Authorization: Bearer <MIHOMO_SECRET>` and forwards REST/Stream requests to `http://127.0.0.1:9090` without exposing secret credentials to the client.
2. **Discover Hub Integration (`DiscoverHubView.tsx` & `App.tsx`)**: Extends `DiscoverToolId` to support `'mihomo'`, adding desktop card and mobile list entries with i18n support.
3. **Native React Dashboard (`MihomoView.tsx`)**: Renders real-time upload/download speeds, memory and connection stats, running mode switcher (Rule/Global/Direct), proxy groups and node cards, single-node & batch latency testing, node selection, and an offline diagnostic empty state.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Express, Axios / Fetch, Jest.

## Global Constraints

- Strict TypeScript patterns with 0 `any` where types are known.
- Follow existing glassmorphic and Linear/Tailwind UI patterns (`var(--bg-canvas)`, `var(--bg-surface)`, `var(--border-subtle)`).
- Preserve all existing tests and features without regression.

---

### Task 1: Backend Mihomo Reverse Proxy Service & Routes

**Files:**
- Modify: `config/default.ts`
- Create: `src/admin/services/mihomoService.ts`
- Create: `src/admin/controllers/mihomoController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Test: `tests/mihomoProxy.test.ts`

**Interfaces:**
- `config.mihomoApiUrl: string` (default `process.env.MIHOMO_API_URL || 'http://127.0.0.1:9090'`)
- `config.mihomoSecret: string` (default `process.env.MIHOMO_SECRET || ''`)
- Endpoints:
  - `GET /api/admin/mihomo/status` -> `{ ok: boolean, version?: string, message?: string }`
  - `GET /api/admin/mihomo/traffic` -> streams or returns `{ up: number, down: number }`
  - `GET /api/admin/mihomo/proxies` -> `{ proxies: Record<string, any> }`
  - `PUT /api/admin/mihomo/proxies/:group` -> `{ name: string }`
  - `GET /api/admin/mihomo/proxies/:name/delay` -> `{ delay: number }`
  - `GET /api/admin/mihomo/configs` -> `{ port, socks-port, mode, ... }`
  - `PATCH /api/admin/mihomo/configs` -> `{ mode?: string }`
  - `GET /api/admin/mihomo/connections` -> `{ downloadTotal, uploadTotal, connections }`
  - `DELETE /api/admin/mihomo/connections` -> `{ success: boolean }`

- [ ] **Step 1: Write the failing test for Mihomo backend proxy**

Create `tests/mihomoProxy.test.ts`:
```typescript
import request from 'supertest';
import express from 'express';
import http from 'http';
import adminRoutes from '../src/admin/routes/adminRoutes';
import { config } from '../config/default';

describe('Mihomo Reverse Proxy Endpoints', () => {
  let app: express.Application;
  let mockMihomoServer: http.Server;
  const mockPort = 19090;

  beforeAll((done) => {
    // Spin up mock Mihomo HTTP server
    const mockApp = express();
    mockApp.use(express.json());

    mockApp.get('/version', (req, res) => {
      const auth = req.headers.authorization;
      if (auth !== 'Bearer test-secret') {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      res.json({ version: 'Mihomo Meta v1.19.0' });
    });

    mockApp.get('/traffic', (req, res) => {
      res.json({ up: 1024, down: 4096 });
    });

    mockApp.get('/configs', (req, res) => {
      res.json({ mode: 'rule', 'port': 7890 });
    });

    mockApp.patch('/configs', (req, res) => {
      res.json({ success: true, mode: req.body.mode });
    });

    mockApp.get('/proxies', (req, res) => {
      res.json({
        proxies: {
          GLOBAL: { name: 'GLOBAL', type: 'Selector', now: 'DIRECT', all: ['DIRECT', 'PROXY_1'] },
          DIRECT: { name: 'DIRECT', type: 'Direct' },
          PROXY_1: { name: 'PROXY_1', type: 'Shadowsocks' }
        }
      });
    });

    mockApp.put('/proxies/:group', (req, res) => {
      res.status(204).end();
    });

    mockApp.get('/proxies/:name/delay', (req, res) => {
      res.json({ delay: 88 });
    });

    mockApp.get('/connections', (req, res) => {
      res.json({ downloadTotal: 10000, uploadTotal: 5000, connections: [] });
    });

    mockApp.delete('/connections', (req, res) => {
      res.status(204).end();
    });

    mockMihomoServer = mockApp.listen(mockPort, () => {
      config.mihomoApiUrl = `http://127.0.0.1:${mockPort}`;
      config.mihomoSecret = 'test-secret';
      config.adminSecretKey = 'test-admin-key';

      app = express();
      app.use(express.json());
      app.use('/api/admin', adminRoutes);
      done();
    });
  });

  afterAll((done) => {
    mockMihomoServer.close(done);
  });

  it('rejects unauthorized requests without x-admin-key', async () => {
    const res = await request(app).get('/api/admin/mihomo/status');
    expect(res.status).toBe(401);
  });

  it('proxies /status with valid secret', async () => {
    const res = await request(app)
      .get('/api/admin/mihomo/status')
      .set('x-admin-key', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toContain('Mihomo Meta');
  });

  it('proxies /traffic successfully', async () => {
    const res = await request(app)
      .get('/api/admin/mihomo/traffic')
      .set('x-admin-key', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(res.body.up).toBe(1024);
    expect(res.body.down).toBe(4096);
  });

  it('proxies /proxies and node selection', async () => {
    const listRes = await request(app)
      .get('/api/admin/mihomo/proxies')
      .set('x-admin-key', 'test-admin-key');
    expect(listRes.status).toBe(200);
    expect(listRes.body.proxies.GLOBAL).toBeDefined();

    const switchRes = await request(app)
      .put('/api/admin/mihomo/proxies/GLOBAL')
      .set('x-admin-key', 'test-admin-key')
      .send({ name: 'PROXY_1' });
    expect(switchRes.status).toBe(204);
  });

  it('proxies node delay check', async () => {
    const res = await request(app)
      .get('/api/admin/mihomo/proxies/PROXY_1/delay?timeout=3000')
      .set('x-admin-key', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(res.body.delay).toBe(88);
  });

  it('proxies /configs mode update', async () => {
    const res = await request(app)
      .patch('/api/admin/mihomo/configs')
      .set('x-admin-key', 'test-admin-key')
      .send({ mode: 'global' });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('global');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/mihomoProxy.test.ts`
Expected: FAIL with 404 or missing route handlers.

- [ ] **Step 3: Implement config extension and Mihomo service & controller**

1. Update `config/default.ts`:
   Add `mihomoApiUrl` and `mihomoSecret` getters to `getEnvConfig()`:
   ```typescript
   mihomoApiUrl: (process.env.MIHOMO_API_URL || 'http://127.0.0.1:9090') as string,
   mihomoSecret: (process.env.MIHOMO_SECRET || '') as string,
   ```
2. Create `src/admin/services/mihomoService.ts`:
   Implement HTTP fetch wrapper forwarding requests with `headers: { 'Authorization': `Bearer ${secret}` }` and error handling.
3. Create `src/admin/controllers/mihomoController.ts`:
   Implement handlers: `getStatus`, `getTraffic`, `getProxies`, `selectProxy`, `getProxyDelay`, `getConfigs`, `updateConfigs`, `getConnections`, `closeConnections`.
4. Update `src/admin/routes/adminRoutes.ts`:
   Mount the `/mihomo/*` routes under `adminRoutes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/mihomoProxy.test.ts`
Expected: PASS (all 6 tests pass)

- [ ] **Step 5: Commit**

```bash
git add config/default.ts src/admin/services/mihomoService.ts src/admin/controllers/mihomoController.ts src/admin/routes/adminRoutes.ts tests/mihomoProxy.test.ts
git commit -m "feat(mihomo): implement authenticated backend reverse proxy service and routes"
```

---

### Task 2: I18n & Discover Hub Entry Integration

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `tests/mihomoDiscoverEntry.test.ts`

**Interfaces:**
- `DiscoverToolId`: `'terminal' | 'systemLogs' | 'playground' | 'translate' | 'mihomo'`
- i18n keys: `discover.mihomoTitle`, `discover.mihomoDesc`

- [ ] **Step 1: Write the test for Discover Hub integration**

Create `tests/mihomoDiscoverEntry.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Discover Hub Mihomo Entry Integration', () => {
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  it('DiscoverHubView includes mihomo tool type and render items', () => {
    const content = fs.readFileSync(hubPath, 'utf-8');
    expect(content).toContain("'mihomo'");
    expect(content).toContain("onSelectTool('mihomo')");
  });

  it('App.tsx handles discoverSubView === "mihomo"', () => {
    const content = fs.readFileSync(appPath, 'utf-8');
    expect(content).toContain("discoverSubView === 'mihomo'");
  });

  it('translations include mihomo titles and descriptions in zh and en', () => {
    const zh = fs.readFileSync(zhPath, 'utf-8');
    const en = fs.readFileSync(enPath, 'utf-8');
    expect(zh).toContain('mihomoTitle');
    expect(en).toContain('mihomoTitle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/mihomoDiscoverEntry.test.ts`
Expected: FAIL due to missing entries.

- [ ] **Step 3: Update i18n, DiscoverHubView, and App.tsx**

1. In `en.ts` & `zh.ts`:
   - Add `mihomoTitle` ("Mihomo 控制台" / "Mihomo Dashboard")
   - Add `mihomoDesc` ("Mihomo 代理核心实时监控、节点测速与策略组切换" / "Real-time Mihomo proxy core traffic monitor, node speed test & policy switching")
   - Add `mihomo` section for panel labels.
2. In `DiscoverHubView.tsx`:
   - Update `DiscoverToolId` to include `'mihomo'`.
   - Add mobile list item in "System & Operations" category or new category with an icon (e.g. `Radio` or `Zap` or `Compass`).
   - Add 5th desktop card in the grid with smooth responsive layout.
3. In `App.tsx`:
   - Add `discoverSubView === 'mihomo'` rendering `<MihomoView adminKey={adminKey} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/mihomoDiscoverEntry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts frontend/src/components/DiscoverHubView.tsx frontend/src/App.tsx tests/mihomoDiscoverEntry.test.ts
git commit -m "feat(discover): add mihomo entry to discover hub and route handler"
```

---

### Task 3: Implement Native Light Mihomo View (`MihomoView.tsx`)

**Files:**
- Create: `frontend/src/components/MihomoView.tsx`
- Test: `tests/mihomoView.test.ts`

**Component Architecture:**
- **Header & Metric Strip**:
  - Live upload & download rate (e.g. `4.2 KB/s ↑` / `1.8 MB/s ↓`)
  - Running Mode Switcher (`Rule` / `Global` / `Direct`)
  - Status badge (Online / Connecting / Offline)
- **Controls & Group Tabs**:
  - Policy Group Selector tabs (e.g. `GLOBAL`, `PROXY`, `Auto`, `Domestic`, etc.)
  - Search filter input to filter node names
  - Quick action buttons: "一键测速 (Speedtest All)", "刷新 (Refresh)", "清空连接 (Close All)"
- **Node Card Grid**:
  - Displays nodes in current group
  - Highlighting for currently active node (`now === node.name`)
  - Click to select/switch node (`PUT /api/admin/mihomo/proxies/:group`)
  - Click latency badge to test individual node delay
- **Offline / Unauthorized Empty State**:
  - If Mihomo server is unreachable or reports 401 Unauthorized, displays diagnostic card with prompt to check `.env` or input temporary secret.

- [ ] **Step 1: Write structural and functionality test for `MihomoView.tsx`**

Create `tests/mihomoView.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('MihomoView Component Structure', () => {
  const compPath = path.resolve(__dirname, '../frontend/src/components/MihomoView.tsx');

  it('MihomoView exists and includes key state handlers', () => {
    expect(fs.existsSync(compPath)).toBe(true);
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('/api/admin/mihomo/status');
    expect(content).toContain('/api/admin/mihomo/traffic');
    expect(content).toContain('/api/admin/mihomo/proxies');
    expect(content).toContain('/api/admin/mihomo/configs');
  });

  it('MihomoView supports mode switching and latency testing', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toMatch(/handleSwitchMode|handleModeChange/);
    expect(content).toMatch(/handleTestDelay|testGroupDelay/);
    expect(content).toMatch(/handleSelectNode|switchProxy/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/mihomoView.test.ts`
Expected: FAIL (file does not exist yet).

- [ ] **Step 3: Implement `frontend/src/components/MihomoView.tsx`**

Create full implementation with responsive styling, polling, theme integration, mode switching, node cards, and latency testing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/mihomoView.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MihomoView.tsx tests/mihomoView.test.ts
git commit -m "feat(mihomo): implement native light Mihomo dashboard view"
```

---

### Task 4: Full Test Suite Verification and Production Build

**Files:**
- Test: all test suites
- Build: `npm run build:frontend` & `npm run build`

- [ ] **Step 1: Run all unit & integration tests**

Run: `npm test`
Expected: PASS with 0 failures across all test suites.

- [ ] **Step 2: Run frontend build**

Run: `npm run build:frontend`
Expected: Vite builds cleanly without TypeScript or CSS errors.

- [ ] **Step 3: Run full production build**

Run: `npm run build`
Expected: Full compile to `dist/` succeeds cleanly.

- [ ] **Step 4: Commit any final polishing changes**

```bash
git commit -am "chore(mihomo): verify end-to-end builds and test passing"
```

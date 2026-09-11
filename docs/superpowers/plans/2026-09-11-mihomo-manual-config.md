# Mihomo Web Panel Manual URL & Secret Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable manual configuration of the Mihomo API URL and Secret directly from the Web UI via a dedicated modal dialog in `MihomoView.tsx`, persisting values to browser localStorage and forwarding them to the backend proxy via `x-mihomo-url` and `x-mihomo-secret` headers with automatic fallback to server environment variables.

**Architecture:**
1. **Backend Dynamic Context Relay (`mihomoService.ts` & `mihomoController.ts`)**: Extract `x-mihomo-url` and `x-mihomo-secret` from incoming requests. If provided, override the default `config.mihomoApiUrl` and `config.mihomoSecret` on a per-request basis.
2. **Frontend UI Settings Modal (`MihomoView.tsx`)**:
   - Provide a connection settings modal with inputs for `API URL` and `Secret` (with show/hide password toggle).
   - Add a "Test Connection" button providing immediate inline diagnostics.
   - Save to `localStorage.getItem('mihomo_api_url')` and `localStorage.getItem('mihomo_api_secret')`.
   - Embed entry points on the top toolbar and on the offline / unauthorized state cards.
3. **I18n Localization (`zh.ts` & `en.ts`)**: Add translations for the connection settings modal, fields, and alerts.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Express, Jest.

## Global Constraints

- Strict TypeScript patterns without `any` where concrete types are available.
- Backward compatibility: If no `x-mihomo-url` or `x-mihomo-secret` headers are sent, seamlessly fall back to `config.mihomoApiUrl` and `config.mihomoSecret`.
- Preserve existing test coverage and pass all tests cleanly.

---

### Task 1: Update Backend Service & Controller for Per-Request Overrides

**Files:**
- Modify: `src/admin/services/mihomoService.ts`
- Modify: `src/admin/controllers/mihomoController.ts`
- Modify: `tests/mihomoProxy.test.ts`

**Interfaces:**
```typescript
export interface MihomoConnectionOptions {
  targetUrl?: string;
  targetSecret?: string;
}
```

- [ ] **Step 1: Write failing test for header overrides in `tests/mihomoProxy.test.ts`**

Add test cases in `tests/mihomoProxy.test.ts`:
```typescript
it('overrides target URL and secret when x-mihomo-url and x-mihomo-secret headers are provided', async () => {
  // Test with custom secret header
  const res = await request(app)
    .get('/api/admin/mihomo/status')
    .set('x-admin-key', 'test-admin-key')
    .set('x-mihomo-secret', 'test-secret');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  // Test failure with wrong custom secret header
  const failRes = await request(app)
    .get('/api/admin/mihomo/status')
    .set('x-admin-key', 'test-admin-key')
    .set('x-mihomo-secret', 'wrong-secret');
  expect(failRes.status).toBe(200);
  expect(failRes.body.ok).toBe(false);
  expect(failRes.body.statusCode).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/mihomoProxy.test.ts`
Expected: FAIL (custom secret headers not yet processed).

- [ ] **Step 3: Update `mihomoService.ts` and `mihomoController.ts`**

1. In `src/admin/services/mihomoService.ts`:
   - Export `MihomoConnectionOptions`.
   - Update `request(method, endpoint, body, queryParams, timeoutMs, options?: MihomoConnectionOptions)`.
   - Calculate effective URL: `(options?.targetUrl || config.mihomoApiUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '')`.
   - Calculate effective secret: `options?.targetSecret !== undefined ? options.targetSecret : config.mihomoSecret`.
   - Pass options through all methods (`getStatus`, `getTraffic`, `getProxies`, `selectProxy`, `getProxyDelay`, `getConfigs`, `updateConfigs`, `getConnections`, `closeConnections`).
2. In `src/admin/controllers/mihomoController.ts`:
   - Add `private getConnectionOptions(req: Request): MihomoConnectionOptions`:
     ```typescript
     private getConnectionOptions(req: Request): MihomoConnectionOptions {
       const targetUrl = (req.headers['x-mihomo-url'] as string)?.trim() || undefined;
       const targetSecret = (req.headers['x-mihomo-secret'] as string) || undefined;
       return { targetUrl, targetSecret };
     }
     ```
   - Pass `this.getConnectionOptions(req)` to all service invocations.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/mihomoProxy.test.ts`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/admin/services/mihomoService.ts src/admin/controllers/mihomoController.ts tests/mihomoProxy.test.ts
git commit -m "feat(mihomo): support per-request x-mihomo-url and x-mihomo-secret header overrides"
```

---

### Task 2: Add I18n Keys for Connection Settings Modal

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/mihomoDiscoverEntry.test.ts`

- [ ] **Step 1: Write test checking i18n keys**

Add assertions to `tests/mihomoDiscoverEntry.test.ts`:
```typescript
it('translations include mihomo connection settings keys', () => {
  const zh = fs.readFileSync(zhPath, 'utf-8');
  const en = fs.readFileSync(enPath, 'utf-8');
  expect(zh).toContain('settingsTitle');
  expect(zh).toContain('apiUrlLabel');
  expect(zh).toContain('secretLabel');
  expect(en).toContain('settingsTitle');
  expect(en).toContain('apiUrlLabel');
  expect(en).toContain('secretLabel');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/mihomoDiscoverEntry.test.ts`
Expected: FAIL due to missing keys.

- [ ] **Step 3: Update `zh.ts` and `en.ts`**

Add keys under `mihomo`:
- `settingsTitle`: "Mihomo 连接配置" / "Mihomo Connection Settings"
- `settingsDesc`: "自定义 Mihomo 控制器 API 地址与访问密钥" / "Customize Mihomo Controller API endpoint and secret"
- `apiUrlLabel`: "API 地址" / "API Endpoint"
- `apiUrlPlaceholder`: "http://127.0.0.1:9090"
- `secretLabel`: "访问密钥 (Secret)" / "Secret Key"
- `secretPlaceholder`: "留空或输入 Secret..." / "Optional Secret..."
- `testConnection`: "测试连通性" / "Test Connection"
- `testing`: "正在测试..." / "Testing..."
- `testSuccess`: "连接成功！版本: {version}" / "Connection successful! Version: {version}"
- `testFailed`: "连接失败: {message}" / "Connection failed: {message}"
- `saveSettings`: "保存并生效" / "Save & Apply"
- `configSaved`: "连接配置已保存并生效" / "Connection settings saved"
- `configBtn`: "连接设置" / "Settings"
- `configureNow`: "配置连接参数" / "Configure Connection"

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/mihomoDiscoverEntry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/mihomoDiscoverEntry.test.ts
git commit -m "feat(i18n): add mihomo connection settings translations"
```

---

### Task 3: Implement Settings Modal and Dynamic Headers in `MihomoView.tsx`

**Files:**
- Modify: `frontend/src/components/MihomoView.tsx`
- Modify: `tests/mihomoView.test.ts`

**Key Features:**
1. Read initial values from `localStorage`:
   - `mihomo_api_url` (default `'http://127.0.0.1:9090'`)
   - `mihomo_api_secret` (default `''`)
2. Append `x-mihomo-url` and `x-mihomo-secret` to headers in `getHeaders()`.
3. Add Settings Modal:
   - State `isSettingsOpen: boolean`.
   - Input for API URL.
   - Input for Secret (with show/hide password toggle).
   - "Test Connection" action that calls `/api/admin/mihomo/status` with temporary headers.
   - "Save" action that updates state, writes to localStorage, closes modal, and refreshes status & data.
4. Add Settings button (`SlidersHorizontal` / `Settings`) in the top action toolbar.
5. Add "配置连接参数" button in the offline and unauthorized empty states.

- [ ] **Step 1: Write test assertions for settings modal in `tests/mihomoView.test.ts`**

Update `tests/mihomoView.test.ts`:
```typescript
it('MihomoView supports manual URL and secret configuration', () => {
  const content = fs.readFileSync(compPath, 'utf-8');
  expect(content).toContain('x-mihomo-url');
  expect(content).toContain('x-mihomo-secret');
  expect(content).toContain('localStorage.getItem(\'mihomo_api_url\')');
  expect(content).toContain('localStorage.getItem(\'mihomo_api_secret\')');
  expect(content).toContain('isSettingsOpen');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/mihomoView.test.ts`
Expected: FAIL due to missing settings modal code.

- [ ] **Step 3: Update `MihomoView.tsx`**

Implement state, localStorage synchronization, settings modal with testing/saving actions, and integration into the top action bar and empty state.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/mihomoView.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MihomoView.tsx tests/mihomoView.test.ts
git commit -m "feat(mihomo): implement connection settings modal with localStorage persistence"
```

---

### Task 4: Full Test Suite Verification and Production Build

**Files:**
- Test: all test suites (`npm test`)
- Build: `npm run build:frontend` & `npm run build`

- [ ] **Step 1: Run all unit and integration tests**

Run: `npm test`
Expected: PASS with 0 failures across all 89+ test suites.

- [ ] **Step 2: Run frontend production build**

Run: `npm run build:frontend`
Expected: Vite builds bundle cleanly into `dist/frontend`.

- [ ] **Step 3: Run full backend and frontend build**

Run: `npm run build`
Expected: Compiles cleanly with exit code 0.

- [ ] **Step 4: Final verification commit if needed**

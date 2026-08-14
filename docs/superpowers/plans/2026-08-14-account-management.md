# 代理服务账号管理页面实现计划 (Account Management Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Gemini Proxy Web 控制台接入外部代理服务（AIStudioToAPI）的账号管理子系统，实现状态监控、账号列表、用量展示、凭据上传导入/下载导出、活跃切换、自动去重及删除等功能。

**Architecture:** 后端在 `/api/admin/accounts/*` 下构建透明中转代理服务（`accountService.ts` / `accountController.ts`），复用系统 `GEMINI_BASE_URL` 并携带 `ADMIN_SECRET_KEY` 转发至 upstream 服务；前端在 `AccountsView.tsx` 构建符合控制台暗色设计语言及 `@account-page.jpeg` 视觉布局的账号管理面板，集成中英文国际化与批量文件上传/下载操作。

**Tech Stack:** TypeScript, Node.js (Express, Axios / Node Fetch), React 18, Tailwind CSS, Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-08-14-account-management-design.md`

## Global Constraints

- **No Static Config Caching**: 动态从 `config.geminiBaseUrl` 与 `config.adminSecretKey` 获取配置，支持运行时热重载。
- **Upstream Auth Header**: 转发至目标代理服务时统一携带 `Authorization: Bearer <ADMIN_SECRET_KEY>` 及 `Accept: application/json`。
- **Admin Authentication**: 所有 `/api/admin/accounts/*` 请求必须经过现有的 `adminAuthMiddleware` 鉴权。
- **Strict TypeScript**: 保证无类型报错，通过 `npm run build` 和 `npm test`。

---

### Task 1: 后端账号服务层实现 (Backend Account Service)

**Files:**
- Create: `src/admin/services/accountService.ts`
- Test: `tests/accountService.test.ts`

**Interfaces:**
- Produces: `AccountService` class with methods:
  - `getStatus(): Promise<{ status: number; data: any }>`
  - `uploadFile(content: any): Promise<{ status: number; data: any }>`
  - `uploadBatchFiles(files: any[]): Promise<{ status: number; data: any }>`
  - `toggleDisabled(index: number, disabled: boolean): Promise<{ status: number; data: any }>`
  - `deleteAccount(index: number, force?: boolean): Promise<{ status: number; data: any }>`
  - `batchDeleteAccounts(indices: number[], force?: boolean): Promise<{ status: number; data: any }>`
  - `deduplicateAccounts(): Promise<{ status: number; data: any }>`
  - `switchCurrentAccount(targetIndex?: number): Promise<{ status: number; data: any }>`
  - `getFileStream(filename: string): Promise<{ status: number; stream: NodeJS.ReadableStream; headers: Record<string, string> }>`
  - `batchDownload(indices: number[]): Promise<{ status: number; stream: NodeJS.ReadableStream; headers: Record<string, string> }>`

- [ ] **Step 1: Write unit tests for `accountService`**

```typescript
// tests/accountService.test.ts
import accountService from '../src/admin/services/accountService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('accountService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call GET /api/status with Bearer token', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { status: { accountDetails: [] } }
    } as any);

    const res = await accountService.getStatus();
    expect(res.status).toBe(200);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/status'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json'
        })
      })
    );
  });

  it('should toggle disabled status for account', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      data: { success: true, isDisabled: true }
    } as any);

    const res = await accountService.toggleDisabled(1, true);
    expect(res.status).toBe(200);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/toggle-disabled'),
      { index: 1, disabled: true },
      expect.any(Object)
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountService.test.ts`
Expected: FAIL with missing `src/admin/services/accountService.ts`

- [ ] **Step 3: Implement `src/admin/services/accountService.ts`**

```typescript
import axios, { AxiosRequestConfig, ResponseType } from 'axios';
import config from '../../../config/default';

export class AccountService {
  private getBaseUrl(): string {
    return (config.geminiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (config.adminSecretKey) {
      headers['Authorization'] = `Bearer ${config.adminSecretKey}`;
    }
    return headers;
  }

  private async request(method: 'get' | 'post' | 'put' | 'delete', path: string, data?: any, params?: any, responseType: ResponseType = 'json') {
    const url = `${this.getBaseUrl()}${path.startsWith('/') ? path : '/' + path}`;
    const reqConfig: AxiosRequestConfig = {
      method,
      url,
      headers: this.getHeaders(),
      data,
      params,
      responseType,
      timeout: config.upstreamTimeoutMs || 30000,
      validateStatus: () => true // Forward all upstream status codes (including 207, 400, 409, etc.)
    };

    try {
      const response = await axios(reqConfig);
      return {
        status: response.status,
        data: response.data,
        headers: response.headers
      };
    } catch (err: any) {
      return {
        status: err.response?.status || 502,
        data: err.response?.data || { error: `Upstream error: ${err.message}` },
        headers: err.response?.headers || {}
      };
    }
  }

  public async getStatus() {
    return this.request('get', '/api/status');
  }

  public async uploadFile(content: any) {
    return this.request('post', '/api/files', { content });
  }

  public async uploadBatchFiles(files: any[]) {
    return this.request('post', '/api/files/batch', { files });
  }

  public async toggleDisabled(index: number, disabled: boolean) {
    return this.request('post', '/api/auth/toggle-disabled', { index, disabled });
  }

  public async deleteAccount(index: number, force?: boolean) {
    return this.request('delete', `/api/accounts/${index}`, undefined, { force: force ? 'true' : 'false' });
  }

  public async batchDeleteAccounts(indices: number[], force: boolean = true) {
    return this.request('delete', '/api/accounts/batch', { indices, force });
  }

  public async deduplicateAccounts() {
    return this.request('post', '/api/accounts/deduplicate', {});
  }

  public async switchCurrentAccount(targetIndex?: number) {
    const payload = typeof targetIndex === 'number' ? { targetIndex } : {};
    return this.request('put', '/api/accounts/current', payload);
  }

  public async getFileStream(filename: string) {
    return this.request('get', `/api/files/${encodeURIComponent(filename)}`, undefined, undefined, 'stream');
  }

  public async batchDownload(indices: number[]) {
    return this.request('post', '/api/accounts/batch/download', { indices }, undefined, 'stream');
  }
}

export default new AccountService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/services/accountService.ts tests/accountService.test.ts
git commit -m "feat(admin): implement accountService for proxying account management API"
```

---

### Task 2: 后端控制器与路由集成 (Account Controller & Admin Routes)

**Files:**
- Create: `src/admin/controllers/accountController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Test: `tests/accountController.test.ts`

**Interfaces:**
- Consumes: `AccountService` from `src/admin/services/accountService.ts`
- Produces: Express routes:
  - `GET /api/admin/accounts/status`
  - `POST /api/admin/accounts/upload`
  - `POST /api/admin/accounts/toggle-disabled`
  - `DELETE /api/admin/accounts/:index`
  - `POST /api/admin/accounts/batch-delete`
  - `POST /api/admin/accounts/deduplicate`
  - `PUT /api/admin/accounts/current`
  - `GET /api/admin/accounts/files/:filename`
  - `POST /api/admin/accounts/batch-download`

- [ ] **Step 1: Write integration tests for `accountController` endpoints**

```typescript
// tests/accountController.test.ts
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import accountService from '../src/admin/services/accountService';
import config from '../config/default';

jest.mock('../src/admin/services/accountService');
const mockedAccountService = accountService as jest.Mocked<typeof accountService>;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Account Controller Endpoints', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 without x-admin-key', async () => {
    const res = await request(app).get('/api/admin/accounts/status');
    expect(res.status).toBe(401);
  });

  it('should forward getStatus correctly with valid key', async () => {
    mockedAccountService.getStatus.mockResolvedValueOnce({
      status: 200,
      data: { status: { accountDetails: [{ index: 0, name: 'user@gmail.com' }] } }
    } as any);

    const res = await request(app)
      .get('/api/admin/accounts/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.status.accountDetails[0].name).toBe('user@gmail.com');
  });

  it('should forward toggleDisabled correctly', async () => {
    mockedAccountService.toggleDisabled.mockResolvedValueOnce({
      status: 200,
      data: { success: true, isDisabled: true }
    } as any);

    const res = await request(app)
      .post('/api/admin/accounts/toggle-disabled')
      .set('x-admin-key', secretKey)
      .send({ index: 0, disabled: true });

    expect(res.status).toBe(200);
    expect(mockedAccountService.toggleDisabled).toHaveBeenCalledWith(0, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountController.test.ts`
Expected: FAIL (routes not found or 404)

- [ ] **Step 3: Implement `src/admin/controllers/accountController.ts` and register in `adminRoutes.ts`**

```typescript
// src/admin/controllers/accountController.ts
import { Request, Response } from 'express';
import accountService from '../services/accountService';

class AccountController {
  public async getStatus(req: Request, res: Response): Promise<void> {
    const result = await accountService.getStatus();
    res.status(result.status).json(result.data);
  }

  public async upload(req: Request, res: Response): Promise<void> {
    const { files, content } = req.body;
    if (Array.isArray(files)) {
      const result = await accountService.uploadBatchFiles(files);
      res.status(result.status).json(result.data);
    } else {
      const result = await accountService.uploadFile(content);
      res.status(result.status).json(result.data);
    }
  }

  public async toggleDisabled(req: Request, res: Response): Promise<void> {
    const { index, disabled } = req.body;
    if (typeof index !== 'number' || typeof disabled !== 'boolean') {
      res.status(400).json({ error: 'Invalid parameters: index and disabled are required' });
      return;
    }
    const result = await accountService.toggleDisabled(index, disabled);
    res.status(result.status).json(result.data);
  }

  public async deleteAccount(req: Request, res: Response): Promise<void> {
    const index = parseInt(req.params.index, 10);
    const force = req.query.force === 'true';
    if (isNaN(index)) {
      res.status(400).json({ error: 'Invalid account index' });
      return;
    }
    const result = await accountService.deleteAccount(index, force);
    res.status(result.status).json(result.data);
  }

  public async batchDelete(req: Request, res: Response): Promise<void> {
    const { indices, force } = req.body;
    if (!Array.isArray(indices)) {
      res.status(400).json({ error: 'indices must be an array of numbers' });
      return;
    }
    const result = await accountService.batchDeleteAccounts(indices, force !== false);
    res.status(result.status).json(result.data);
  }

  public async deduplicate(req: Request, res: Response): Promise<void> {
    const result = await accountService.deduplicateAccounts();
    res.status(result.status).json(result.data);
  }

  public async switchCurrent(req: Request, res: Response): Promise<void> {
    const { targetIndex } = req.body;
    const result = await accountService.switchCurrentAccount(targetIndex);
    res.status(result.status).json(result.data);
  }

  public async downloadFile(req: Request, res: Response): Promise<void> {
    const { filename } = req.params;
    const result = await accountService.getFileStream(filename);
    if (result.status === 200 && result.data && typeof result.data.pipe === 'function') {
      res.setHeader('Content-Type', result.headers['content-type'] || 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      result.data.pipe(res);
    } else {
      res.status(result.status).json(result.data);
    }
  }

  public async batchDownload(req: Request, res: Response): Promise<void> {
    const { indices } = req.body;
    const result = await accountService.batchDownload(indices || []);
    if (result.status === 200 && result.data && typeof result.data.pipe === 'function') {
      res.setHeader('Content-Type', result.headers['content-type'] || 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="accounts.zip"');
      if (result.headers['x-file-count']) {
        res.setHeader('X-File-Count', result.headers['x-file-count']);
      }
      result.data.pipe(res);
    } else {
      res.status(result.status).json(result.data);
    }
  }
}

export default new AccountController();
```

And update `src/admin/routes/adminRoutes.ts`:
```typescript
import accountController from '../controllers/accountController';
// ...
router.get('/accounts/status', (req, res) => accountController.getStatus(req, res));
router.post('/accounts/upload', (req, res) => accountController.upload(req, res));
router.post('/accounts/toggle-disabled', (req, res) => accountController.toggleDisabled(req, res));
router.delete('/accounts/:index', (req, res) => accountController.deleteAccount(req, res));
router.post('/accounts/batch-delete', (req, res) => accountController.batchDelete(req, res));
router.post('/accounts/deduplicate', (req, res) => accountController.deduplicate(req, res));
router.put('/accounts/current', (req, res) => accountController.switchCurrent(req, res));
router.get('/accounts/files/:filename', (req, res) => accountController.downloadFile(req, res));
router.post('/accounts/batch-download', (req, res) => accountController.batchDownload(req, res));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountController.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/controllers/accountController.ts src/admin/routes/adminRoutes.ts tests/accountController.test.ts
git commit -m "feat(admin): add account management routes and controller"
```

---

### Task 3: 前端多语言国际化字典扩充 (Frontend i18n Locales)

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`

- [ ] **Step 1: Add `nav.accounts` and `accounts` dictionary keys in `en.ts` and `zh.ts`**

In `frontend/src/i18n/locales/en.ts`:
```typescript
  nav: {
    dashboard: "Dashboard",
    accounts: "Accounts",
    logs: "Request Logs",
    terminal: "Terminal Logs",
    playground: "Playground",
    // ...
  },
  accounts: {
    title: "Account Management",
    loading: "Loading accounts and system status...",
    totalAccounts: "Total Accounts",
    activeAccounts: "Active",
    disabledAccounts: "Disabled",
    inFlightRequests: "In Flight",
    systemBusy: "System Busy",
    selectAll: "Select All",
    importFiles: "Import Storage State",
    deduplicate: "Auto Deduplicate",
    batchDownload: "Download ZIP",
    batchDelete: "Batch Delete",
    refresh: "Refresh",
    statusActive: "Active",
    statusDisabled: "Disabled",
    currentBadge: "Current",
    invalidBadge: "Invalid",
    duplicateBadge: "Duplicate",
    expiredBadge: "Expired",
    todayUsage: "Today Usage",
    inFlight: "In Flight",
    toggleEnable: "Enable Account",
    toggleDisable: "Disable Account",
    setAsCurrent: "Set as Current",
    isCurrentAccount: "Currently Active Account",
    downloadCredential: "Download Credential",
    deleteAccount: "Delete Account",
    confirmDeleteTitle: "Confirm Delete Account",
    confirmDeleteMessage: "Are you sure you want to delete account #{index} ({email})?",
    confirmDeleteCurrentWarning: "This account is currently active. Deleting it will switch to another account. Are you sure you want to force delete?",
    confirmBatchDeleteMessage: "Are you sure you want to delete {count} selected accounts?",
    confirmDeduplicateTitle: "Clean Duplicate Accounts",
    confirmDeduplicateMessage: "This will automatically scan and remove older duplicate credentials. Continue?",
    dedupSuccess: "Successfully cleaned {count} duplicate credentials.",
    noAccounts: "No accounts configured yet. Click 'Import Storage State' to add account credentials.",
    uploadSuccess: "Successfully uploaded {count} credential file(s).",
    uploadFailed: "Failed to upload credentials: {error}",
    actionSuccess: "Operation completed successfully.",
    actionFailed: "Operation failed: {error}"
  }
```

And corresponding Chinese dictionary in `frontend/src/i18n/locales/zh.ts`:
```typescript
  nav: {
    dashboard: "控制台概览",
    accounts: "账号管理",
    logs: "请求日志",
    terminal: "终端日志",
    playground: "API 调试器",
    // ...
  },
  accounts: {
    title: "账号管理",
    loading: "正在加载账号列表与系统状态...",
    totalAccounts: "账号总数",
    activeAccounts: "已激活",
    disabledAccounts: "已禁用",
    inFlightRequests: "并发中请求",
    systemBusy: "系统繁忙",
    selectAll: "全选",
    importFiles: "导入凭据",
    deduplicate: "自动去重",
    batchDownload: "批量打包下载",
    batchDelete: "批量删除",
    refresh: "刷新",
    statusActive: "已激活",
    statusDisabled: "已禁用",
    currentBadge: "当前",
    invalidBadge: "凭据失效",
    duplicateBadge: "重复账号",
    expiredBadge: "已过期",
    todayUsage: "今日用量",
    inFlight: "处理中",
    toggleEnable: "启用账号",
    toggleDisable: "禁用账号",
    setAsCurrent: "设为当前活跃账号",
    isCurrentAccount: "当前主账号",
    downloadCredential: "下载凭据文件",
    deleteAccount: "删除账号",
    confirmDeleteTitle: "确认删除账号",
    confirmDeleteMessage: "确定要删除账号 #{index} ({email}) 吗？",
    confirmDeleteCurrentWarning: "该账号是系统当前活跃账号，删除将强制轮换至下一账号，是否确认强制删除？",
    confirmBatchDeleteMessage: "确定要批量删除选中的 {count} 个账号吗？",
    confirmDeduplicateTitle: "清理重复账号",
    confirmDeduplicateMessage: "系统将自动扫描同邮箱凭据并清理旧版本文件，仅保留最新凭据。是否继续？",
    dedupSuccess: "成功清理 {count} 个重复凭据文件。",
    noAccounts: "当前暂无配置账号。请点击上方「导入凭据」上传 Storage State 凭据文件。",
    uploadSuccess: "成功导入 {count} 个凭据文件。",
    uploadFailed: "导入凭据失败：{error}",
    actionSuccess: "操作成功。",
    actionFailed: "操作失败：{error}"
  }
```

- [ ] **Step 2: Test TypeScript compilation of locales**

Run: `npm run build:frontend`
Expected: PASS without type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/
git commit -m "feat(frontend): add i18n locales for account management"
```

---

### Task 4: 前端账号管理组件开发 (Frontend AccountsView Component)

**Files:**
- Create: `frontend/src/components/AccountsView.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create `AccountsView.tsx` implementing full UI & API interactions**

Implement features:
- Top stats strip (total accounts, active, disabled, in-flight, system busy status)
- Global action toolbar (Select all, hidden file input `<input type="file" multiple accept=".json" />` triggered by upload button, auto deduplicate, batch download, batch delete, refresh)
- Account list with `@account-page.jpeg` styling (Green tinted card for current active account `#0`, dark cards for others, checkbox, `#index`, email name, badges, `今日用量 xxx` badge, action button group for toggle disabled, set as current, download JSON, delete)
- Modal dialogs for confirmations (delete active account with force flag, batch delete, dedup feedback)
- Error handling / toast banners for API responses (200, 207, 409 conflict, etc.)

- [ ] **Step 2: Update `App.tsx` to include `accounts` tab navigation and render `AccountsView`**

Update `activeTab` state union type to include `'accounts'` and add tab switch button.

- [ ] **Step 3: Build frontend and verify no syntax/type errors**

Run: `npm run build:frontend`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AccountsView.tsx frontend/src/App.tsx
git commit -m "feat(frontend): implement AccountsView component and integrate tab in App"
```

---

### Task 5: 完整系统构建与端到端测试验证 (End-to-End Verification)

**Files:**
- Test: `tests/accountController.test.ts`
- Test: All tests in `tests/`

- [ ] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Run full production build**

Run: `npm run build`
Expected: Backend and Frontend build cleanly into `dist/`

- [ ] **Step 3: Commit all remaining cleanups if any**

```bash
git add .
git commit -m "chore: complete account management integration and verification"
```

---

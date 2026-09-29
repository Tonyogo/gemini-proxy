# 直连模式与代理模式双服务器类型实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持“代理模式（Proxy）”和“直连模式（Direct）”两种服务器类型配置，直连模式支持配置多个 Gemini API Key 并自动在其间做轮询负载均衡，同时支持模型白名单限制（`allowedModels`），并在账号管理页面提供无在线/离线概念的 Key 维度请求量与模型细分统计视图。

**Architecture:** 
1. 在 `UpstreamServerConfig` 中引入 `type: 'proxy' | 'direct'` 与 `apiKeys?: string[]`，扩展 `parseUpstreamServers` 保证完全向后兼容；
2. 在 `UpstreamManager` 中为直连节点提供基于多 Key 的平滑轮询，同时沿用 SWRR 流量权重与 `allowedModels` 过滤；
3. `claudeController` 与 `geminiController` 在命中直连节点时将上游请求凭据替换为选中的 Key，以脱敏 Key 作为 `accountName` 记入交���日志和本地用量统计；
4. `AccountController` 在直连模式下拦截对外网络探测，本地基于配置的 Key 池与 `accountUsageService` 组装返回虚拟账号统计；
5. 前端 `ConfigModal` 支持直连模式与多 Key 输入，`AccountsView` 在直连模式下呈现专属的 Key 维度请求量统计看板。

**Tech Stack:** TypeScript, Node.js / Express, React, Tailwind CSS, Jest, Lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-29-upstream-server-types-and-direct-mode-design.md`

## Global Constraints

- **向后兼容**：缺失 `type` 字段的上游服务器配置默认严格为 `'proxy'`，纯字符串或旧版 JSON 配置无需任何改动即可运行。
- **直连默认 URL**：当节点为直连模式且 URL 为空时，缺省 URL 为 `https://generativelanguage.googleapis.com`。
- **安全性与脱敏**：任何日志、前端展示或接口传输均不得暴露原始 API Key 明文，统一使用 `maskApiKey` 进行安全脱敏。
- **配置零静态缓存**：不缓存 config 属性，动态访问或热重载保持生效。
- **测试覆盖**：所有新增调度逻辑、类型解析、转发替换及虚拟状态接口必须有 Jest 测试覆盖，前端必须通过 `npm run build:frontend` 验证。

## Review Focus

1. **直连节点未配置任何 Key**：系统必须能降级使用客户端传入的有效凭据，且不能崩溃。
2. **直连节点模型白名单限制**：当客户端请求的模型不在直连节点的 `allowedModels` 中时，SWRR 调度器必须将其准确排除；若全集群无可用节点，应返回标准的 403 错误。
3. **直连模式下的账号管理接口防护**：在直连模式下请求 `/api/admin/accounts/status` 必须绝对禁止向上游官方端点发起真实的 `/api/status` 网络探测（避免 404/502）；同时对上传、切换、删除等代理专属动作拦截并返回 400。
4. **多 Key 轮询分布与统计一致性**：直连节点的多个 Key 必须均匀接收请求，且每个 Key 的成功/失败/模型细分统计必须能被 `accountUsageService` 准确认领并在前端实时呈现。
5. **代理模式现有功能零回归**：现有的代理模式节点在多账号管理、凭据上传、轮换及会话管理上的全部能力不受任何干扰。

---

### Task 1: 数据类型与上游服务器配置解析扩展

**Files:**
- Modify: `src/types/index.ts:100-125`
- Modify: `config/default.ts:106-200`
- Test: `tests/upstreamServerType.test.ts`

**Interfaces:**
- Consumes: `UpstreamServerConfig`, `parseUpstreamServers`
- Produces:
  ```typescript
  export type UpstreamServerType = 'proxy' | 'direct';
  export interface UpstreamServerConfig {
    url: string;
    weight: number;
    enabled: boolean;
    name?: string;
    allowedModels?: string[];
    type?: UpstreamServerType;
    apiKeys?: string[];
  }
  export interface UpstreamServerStatus extends UpstreamServerConfig {
    serverIndex: number;
    effectivePercent: number;
    consecutiveFailures: number;
    isIsolated: boolean;
    isolatedUntil: number;
    lastError?: string;
    keyCount?: number;
  }
  export interface UpstreamServerSelection {
    serverUrl: string;
    serverIndex: number;
    weight: number;
    serverType: UpstreamServerType;
    selectedApiKey?: string;
  }
  ```

- [ ] **Step 1: Write the failing test**

创建 `tests/upstreamServerType.test.ts`：
```typescript
import { parseUpstreamServers } from '../config/default';
import { UpstreamServerConfig } from '../src/types';

describe('UpstreamServerConfig type & direct mode parsing', () => {
  it('defaults to proxy type if type is omitted in JSON array', () => {
    const raw: any[] = [
      { url: 'https://proxy1.example.com', weight: 1, enabled: true }
    ];
    const res = parseUpstreamServers(raw);
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('proxy');
    expect(res[0].url).toBe('https://proxy1.example.com');
  });

  it('correctly parses direct mode server with apiKeys and default URL', () => {
    const raw: any[] = [
      {
        type: 'direct',
        url: '',
        weight: 3,
        enabled: true,
        name: 'Official Gemini',
        allowedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        apiKeys: ['AIzaSy111', ' AIzaSy222 ', 'AIzaSy111', '']
      }
    ];
    const res = parseUpstreamServers(raw);
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('direct');
    expect(res[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(res[0].weight).toBe(3);
    expect(res[0].allowedModels).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
    expect(res[0].apiKeys).toEqual(['AIzaSy111', 'AIzaSy222']);
  });

  it('parses direct mode with custom url and hash string format', () => {
    const rawStr = 'https://custom-official.com#type=direct&name=CustomDirect&weight=2&models=gemini-2.5-pro&keys=keyA+keyB';
    const res = parseUpstreamServers(rawStr);
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('direct');
    expect(res[0].url).toBe('https://custom-official.com');
    expect(res[0].name).toBe('CustomDirect');
    expect(res[0].weight).toBe(2);
    expect(res[0].allowedModels).toEqual(['gemini-2.5-pro']);
    expect(res[0].apiKeys).toEqual(['keyA', 'keyB']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamServerType.test.ts`
Expected: FAIL (missing `type` or `apiKeys` properties / logic).

- [ ] **Step 3: Implement minimal code in `src/types/index.ts` and `config/default.ts`**

在 `src/types/index.ts` 中更新类型定义：
```typescript
export type UpstreamServerType = 'proxy' | 'direct';

export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: UpstreamServerType;
  apiKeys?: string[];
}

export interface UpstreamServerStatus extends UpstreamServerConfig {
  serverIndex: number;
  effectivePercent: number;
  consecutiveFailures: number;
  isIsolated: boolean;
  isolatedUntil: number;
  lastError?: string;
  keyCount?: number;
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
  serverType: UpstreamServerType;
  selectedApiKey?: string;
}
```

在 `config/default.ts` 的 `parseUpstreamServers` 中实现：
- 增加辅助函数 `sanitizeApiKeys(keys?: any): string[] | undefined`，支持数组或逗号/加号分隔字符串，去除空值与重复项。
- JSON 数组分支：
  - 提取 `type = (item.type === 'direct' ? 'direct' : 'proxy') as UpstreamServerType;`
  - 如果 `type === 'direct'` 且 `!url`，设置 `url = 'https://generativelanguage.googleapis.com'`；
  - 提取并清洗 `apiKeys`。
- 字符串分支：
  - 解析 hash 参数：`params.get('type') === 'direct'` 则 `type = 'direct'`；
  - 解析 `keys = params.get('keys') || params.get('apiKeys')`；
  - 组装 `res.type = type; if (apiKeys) res.apiKeys = apiKeys;`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/upstreamServerType.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/types/index.ts config/default.ts tests/upstreamServerType.test.ts
git commit -m "feat(config): support upstream server types and direct mode apiKeys in UpstreamServerConfig"
```

---

### Task 2: UpstreamManager 直连模式多 Key 轮询与节点状态增强

**Files:**
- Modify: `src/utils/upstreamManager.ts:1-280`
- Test: `tests/upstreamServerType.test.ts`

**Interfaces:**
- Consumes: `UpstreamServerConfig`, `UpstreamServerSelection`, `UpstreamServerStatus`
- Produces:
  - `getUpstreamServer(options?: { model?: string; originalModel?: string; resolvedModel?: string; serverIndex?: number }): UpstreamServerSelection` 返回带有 `serverType` 与 `selectedApiKey` 的结果。
  - `getUpstreamServerStatusList(): UpstreamServerStatus[]` 返回带有 `type`, `apiKeys`, `keyCount` 的状态。

- [ ] **Step 1: Write the failing test**

在 `tests/upstreamServerType.test.ts` 补充测试用例：
```typescript
import upstreamManager from '../src/utils/upstreamManager';
import config from '../config/default';

describe('UpstreamManager direct mode scheduling and key distribution', () => {
  const originalServers = config.upstreamServers;

  afterEach(() => {
    config.upstreamServers = originalServers;
  });

  it('returns serverType and distributes configured apiKeys evenly in round-robin', () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server',
        apiKeys: ['key-1', 'key-2', 'key-3']
      }
    ];

    const sel1 = upstreamManager.getUpstreamServer();
    expect(sel1.serverType).toBe('direct');
    expect(sel1.selectedApiKey).toBe('key-1');

    const sel2 = upstreamManager.getUpstreamServer();
    expect(sel2.serverType).toBe('direct');
    expect(sel2.selectedApiKey).toBe('key-2');

    const sel3 = upstreamManager.getUpstreamServer();
    expect(sel3.serverType).toBe('direct');
    expect(sel3.selectedApiKey).toBe('key-3');

    const sel4 = upstreamManager.getUpstreamServer();
    expect(sel4.selectedApiKey).toBe('key-1');
  });

  it('falls back to undefined selectedApiKey if direct server has no apiKeys', () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server Empty Keys'
      }
    ];

    const sel = upstreamManager.getUpstreamServer();
    expect(sel.serverType).toBe('direct');
    expect(sel.selectedApiKey).toBeUndefined();
  });

  it('respects allowedModels filter on direct mode server', () => {
    config.upstreamServers = [
      {
        url: 'https://proxy.example.com',
        weight: 1,
        enabled: true,
        type: 'proxy',
        allowedModels: ['gemini-2.5-flash']
      },
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        allowedModels: ['gemini-2.5-pro'],
        apiKeys: ['direct-key-pro']
      }
    ];

    // Request for gemini-2.5-pro should ONLY hit the direct server
    const sel = upstreamManager.getUpstreamServer({ model: 'gemini-2.5-pro' });
    expect(sel.serverType).toBe('direct');
    expect(sel.serverIndex).toBe(1);
    expect(sel.selectedApiKey).toBe('direct-key-pro');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/upstreamServerType.test.ts`
Expected: FAIL (`serverType` or `selectedApiKey` missing).

- [ ] **Step 3: Implement in `src/utils/upstreamManager.ts`**

1. 在 `UpstreamManager` 类中增加私有属性：
   ```typescript
   private directKeyIndexMap: Map<number, number> = new Map();
   ```
2. 封装根据直连节点挑选 API Key 的方法：
   ```typescript
   private selectDirectApiKey(serverIndex: number, server: UpstreamServerConfig): string | undefined {
     if (server.type !== 'direct' || !server.apiKeys || server.apiKeys.length === 0) {
       return undefined;
     }
     const currentIdx = this.directKeyIndexMap.get(serverIndex) || 0;
     const selected = server.apiKeys[currentIdx % server.apiKeys.length];
     this.directKeyIndexMap.set(serverIndex, (currentIdx + 1) % server.apiKeys.length);
     return selected;
   }
   ```
3. 在 `getUpstreamServer()` 中，确保返回的对象包含：
   ```typescript
   const chosenServer = allServers[chosenIndex];
   const serverType = chosenServer.type || 'proxy';
   const selectedApiKey = this.selectDirectApiKey(chosenIndex, chosenServer);

   return {
     serverUrl: chosenServer.url,
     serverIndex: chosenIndex,
     weight: chosenServer.weight || 1,
     serverType,
     selectedApiKey
   };
   ```
4. 在 `getUpstreamServerStatusList()` 中，将 `type`、`apiKeys`、`keyCount: server.apiKeys?.length || 0` 注入到 `UpstreamServerStatus`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/upstreamServerType.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/utils/upstreamManager.ts tests/upstreamServerType.test.ts
git commit -m "feat(upstream): implement round-robin key selection and metadata for direct mode servers"
```

---

### Task 3: 核心代理请求注入、脱敏日志与用量统计适配

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts:80-120, 360-440`
- Modify: `src/proxy/controllers/geminiController.ts:80-160`
- Test: `tests/directModeProxy.test.ts`

**Interfaces:**
- Consumes: `upstreamManager.getUpstreamUrl`, `maskApiKey`, `buildUpstreamHeaders`, `accountUsageService`
- Produces:
  - 当目标节点为直连模式时，上游 `x-goog-api-key` 被替换为 `selectedApiKey`；
  - 请求的 `accountName` 被记录为 `maskApiKey(selectedApiKey)` 并写入 `accountUsageService` 和 `payloadLogger`。

- [ ] **Step 1: Write the failing test**

创建 `tests/directModeProxy.test.ts`：
```typescript
import request from 'supertest';
import express from 'express';
import nock from 'nock';
import config from '../config/default';
import claudeRoutes from '../src/proxy/routes/claudeRoutes';
import geminiRoutes from '../src/proxy/routes/geminiRoutes';
import accountUsageService from '../src/admin/services/accountUsageService';
import upstreamManager from '../src/utils/upstreamManager';

const app = express();
app.use(express.json());
app.use(claudeRoutes);
app.use(geminiRoutes);

describe('Direct Mode Proxy Forwarding & Account Usage', () => {
  const originalServers = config.upstreamServers;

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    config.upstreamServers = originalServers;
    nock.cleanAll();
  });

  it('injects selectedApiKey into x-goog-api-key and records masked key usage in Claude Messages proxy', async () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Gemini',
        apiKeys: ['AIzaSyDirectTestKey1234567890']
      }
    ];

    const geminiMock = nock('https://generativelanguage.googleapis.com')
      .post('/v1beta/models/gemini-2.5-flash:generateContent')
      .matchHeader('x-goog-api-key', 'AIzaSyDirectTestKey1234567890')
      .reply(200, {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Hello from direct mode!' }]
            },
            finishReason: 'STOP'
          }
        ],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 }
      });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    expect(geminiMock.isDone()).toBe(true);

    // Verify usage recorded under masked key name
    const maskedKey = 'AIzaSy***7890';
    const usage = accountUsageService.getUsageForAccount(maskedKey);
    expect(usage).not.toBeNull();
    expect(usage?.totalSuccess).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/directModeProxy.test.ts`
Expected: FAIL (headers match failure or account name not recorded as masked key).

- [ ] **Step 3: Implement in `claudeController.ts` and `geminiController.ts`**

在 `claudeController.ts`（流式与非流式分支）：
1. 获取 `const selection = upstreamManager.getUpstreamServer(...)` 并提取 `serverSelection`（包含 `serverType` 与 `selectedApiKey`）。
2. 构建上游 Headers 时：
   ```typescript
   const effectiveApiKey = (serverSelection.serverType === 'direct' && serverSelection.selectedApiKey)
     ? serverSelection.selectedApiKey
     : apiKey;
   const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders);
   ```
3. 解析响应时：
   ```typescript
   let accountName = response.headers?.get ? (response.headers.get('x-account-name') || null) : null;
   if (serverSelection.serverType === 'direct' && serverSelection.selectedApiKey) {
     accountName = maskApiKey(serverSelection.selectedApiKey);
   }
   ```
4. 在 `geminiController.ts` 中完成相同的 `effectiveApiKey` 与 `accountName` 处理。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/directModeProxy.test.ts`
Expected: PASS

- [ ] **Step 5: Run all proxy tests for regression check**

Run: `npx jest tests/claudeController.test.ts tests/geminiController.test.ts`
Expected: PASS

- [ ] **Step 6: Commit changes**

```bash
git add src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts tests/directModeProxy.test.ts
git commit -m "feat(proxy): inject direct mode apiKey and bind masked account name in transaction logs"
```

---

### Task 4: 账号管理与状态接口直连模式虚拟化及操作保护

**Files:**
- Modify: `src/admin/controllers/accountController.ts:1-120`
- Modify: `src/admin/services/accountService.ts:1-100`
- Test: `tests/accountDirectMode.test.ts`

**Interfaces:**
- Consumes: `upstreamManager.getUpstreamServerStatusList()`, `accountUsageService`
- Produces:
  - `GET /api/admin/accounts/servers` 返回包含 `type`, `keyCount` 的服务器列表。
  - `GET /api/admin/accounts/status` 在直连模式下不向上游发请求，直接返回本地组装好的虚拟账号状态。
  - `POST /api/admin/accounts/upload`, `PUT /api/admin/accounts/current` 等接口对直连模式返回 400 保护。

- [ ] **Step 1: Write the failing test**

创建 `tests/accountDirectMode.test.ts`：
```typescript
import request from 'supertest';
import express from 'express';
import config from '../config/default';
import adminRoutes from '../src/admin/routes/adminRoutes';
import accountUsageService from '../src/admin/services/accountUsageService';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Account Controller in Direct Mode', () => {
  const originalServers = config.upstreamServers;
  const originalKey = config.adminSecretKey;

  beforeEach(() => {
    config.adminSecretKey = 'test-admin-key';
  });

  afterEach(() => {
    config.upstreamServers = originalServers;
    config.adminSecretKey = originalKey;
  });

  it('returns server metadata with type and keyCount in /api/admin/accounts/servers', async () => {
    config.upstreamServers = [
      { url: 'https://proxy.example.com', weight: 1, enabled: true, type: 'proxy' },
      { url: 'https://generativelanguage.googleapis.com', weight: 2, enabled: true, type: 'direct', apiKeys: ['key1', 'key2'] }
    ];

    const res = await request(app)
      .get('/api/admin/accounts/servers')
      .set('x-admin-key', 'test-admin-key');

    expect(res.status).toBe(200);
    expect(res.body.serversMeta).toBeDefined();
    expect(res.body.serversMeta[0].type).toBe('proxy');
    expect(res.body.serversMeta[1].type).toBe('direct');
    expect(res.body.serversMeta[1].keyCount).toBe(2);
  });

  it('returns local virtual account status without network request in /api/admin/accounts/status for direct mode', async () => {
    const rawKey = 'AIzaSyDirectModeTesting12345';
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server',
        apiKeys: [rawKey]
      }
    ];

    // Seed usage
    const masked = 'AIzaSy***2345';
    accountUsageService.record(masked, 'gemini-2.5-pro', true);

    const res = await request(app)
      .get('/api/admin/accounts/status?serverIndex=0')
      .set('x-admin-key', 'test-admin-key');

    expect(res.status).toBe(200);
    expect(res.body.isDirectMode).toBe(true);
    expect(res.body.status?.accountDetails).toHaveLength(1);
    expect(res.body.status.accountDetails[0].name).toBe(masked);
    expect(res.body.status.accountDetails[0].usage.totalRequests).toBeGreaterThanOrEqual(1);
  });

  it('rejects proxy-only operations with 400 for direct mode servers', async () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        apiKeys: ['key1']
      }
    ];

    const res = await request(app)
      .post('/api/admin/accounts/upload?serverIndex=0')
      .set('x-admin-key', 'test-admin-key')
      .send({ content: 'credentials' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('代理模式');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountDirectMode.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/admin/controllers/accountController.ts`**

1. 在 `getServers` 中返回：
   ```typescript
   const statusList = upstreamManager.getUpstreamServerStatusList();
   res.json({
     servers: upstreamManager.getBaseUrls(),
     serversMeta: statusList.map(s => ({
       url: s.url,
       name: s.name,
       weight: s.weight,
       enabled: s.enabled,
       type: s.type || 'proxy',
       keyCount: s.apiKeys?.length || 0,
       allowedModels: s.allowedModels
     })),
     circuits: upstreamManager.getCircuitStatusList()
   });
   ```
2. 在 `getStatus` 中增加判断：
   ```typescript
   const servers = upstreamManager.getUpstreamServers();
   const serverIdx = serverIndex !== undefined ? serverIndex : 0;
   const targetServer = servers[serverIdx];

   if (targetServer && targetServer.type === 'direct') {
     const keys = targetServer.apiKeys || [];
     const accountDetails = keys.map((key, idx) => {
       const maskedName = maskApiKey(key);
       const localStats = accountUsageService.getUsageForAccount(maskedName);
       const byModelCompat: Record<string, any> = {};
       if (localStats?.byModel) {
         for (const [model, stats] of Object.entries(localStats.byModel)) {
           const cleanModel = model.replace(/^models\//, '');
           byModelCompat[cleanModel] = {
             usage: stats.success,
             requests: stats.total,
             success: stats.success,
             error: stats.error
           };
         }
       }
       return {
         index: idx,
         name: maskedName,
         status: 'ACTIVE',
         isDisabled: false,
         isInvalid: false,
         isDuplicate: false,
         isExpired: false,
         isRotation: false,
         hasContext: false,
         canonicalIndex: null,
         usage: {
           total: localStats?.totalSuccess || 0,
           totalRequests: localStats?.totalRequests || 0,
           totalSuccess: localStats?.totalSuccess || 0,
           totalError: localStats?.totalError || 0,
           byModel: byModelCompat
         }
       };
     });

     return res.json({
       isDirectMode: true,
       status: {
         isSystemBusy: false,
         streamingMode: 'DIRECT',
         usageCount: accountDetails.reduce((sum, a) => sum + (a.usage?.totalRequests || 0), 0),
         failureCount: accountDetails.reduce((sum, a) => sum + (a.usage?.totalError || 0), 0),
         accountDetails
       }
     });
   }
   ```
3. 在 `upload`, `toggleDisabled`, `closeContext`, `deleteAccount`, `batchDelete`, `deduplicate`, `switchCurrent` 头部加入直连保护：
   ```typescript
   const servers = upstreamManager.getUpstreamServers();
   const serverIdx = this.getServerIndex(req) ?? 0;
   if (servers[serverIdx]?.type === 'direct') {
     res.status(400).json({ error: '该操作仅在代理模式服务器可用' });
     return;
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountDirectMode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/admin/controllers/accountController.ts tests/accountDirectMode.test.ts
git commit -m "feat(admin): implement direct mode virtual account status and proxy action protection"
```

---

### Task 5: 前端系统配置弹窗（ConfigModal）服务器类型与多 Key 编辑支持

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:750-890`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `UpstreamServerConfig` with `type` and `apiKeys`
- Produces: 
  - 服务器卡片中的类型选择器（代理模式 / 直连模式）；
  - 直连模式下自动默认 URL `https://generativelanguage.googleapis.com`；
  - 直连模式下多行 API Key 文本域编辑。

- [ ] **Step 1: Update i18n dictionaries**

在 `frontend/src/i18n/locales/zh.ts` 与 `en.ts` 中新增对应文案：
- `config.serverType`: `'服务器类型'` / `'Server Type'`
- `config.serverTypeProxy`: `'代理模式 (Proxy)'` / `'Proxy Mode'`
- `config.serverTypeDirect`: `'直连模式 (Direct)'` / `'Direct Mode'`
- `config.serverApiKeys`: `'Gemini API Keys (直连密钥池)'` / `'Gemini API Keys (Direct Pool)'`
- `config.serverApiKeysPlaceholder`: `'每行一个 API Key，请求将在配置的 Key 之间均衡轮询负载'` / `'One API Key per line. Requests will be load-balanced evenly across keys'`
- `config.serverApiKeysHelp`: `'已配置 {count} 个密钥'` / `'{count} API keys configured'`

- [ ] **Step 2: Update ConfigModal server card UI**

在 `frontend/src/components/ConfigModal.tsx` 中：
1. 扩展 `UpstreamServerConfig` 本地接口定义，增加 `type?: 'proxy' | 'direct'` 与 `apiKeys?: string[]`。
2. 维护 `serverKeyInputs: Record<number, string>` 本地状态，用于绑定多行文本框的草稿输入。
3. 在服务器卡片头部加入类型切换器（Segmented Control 或按钮组）：
   - 当点击“直连模式”时：
     - 若当前 `url` 为空或为常用代理地址，自动填充为 `https://generativelanguage.googleapis.com`；
     - `type` 设为 `'direct'`。
   - 当点击“代理模式”时：
     - `type` 设为 `'proxy'`。
4. 当 `server.type === 'direct'` 时，渲染 API Keys 文本输入区：
   - 绑定 `serverKeyInputs[idx]`，多行展示，按换行符拆分解析；
   - 支持实时计数徽章展示当前配置的 Key 数量。
5. 保留原有的 `allowedModels`、`weight` 与 `enabled` 配置项无缝可用。

- [ ] **Step 3: Build frontend and verify no compilation errors**

Run: `npm run build:frontend`
Expected: 编译打包成功（`dist/frontend` 生成成功，无类型报错）。

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(ui): add server type switcher and apiKeys editor in ConfigModal"
```

---

### Task 6: 前端账号管理视图（AccountsView）直连模式专属展示与国际化

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:1-400`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `/api/admin/accounts/servers` 中的 `serversMeta`，`/api/admin/accounts/status` 中的 `isDirectMode`
- Produces: 
  - 服务器标签栏模式徽章（`直连` / `代理`）；
  - 直连模式下精简操作栏（隐藏上传、去重、删除等）；
  - 直连模式下 Key 维度调用量列表卡片。

- [ ] **Step 1: Update i18n dictionaries**

在 `frontend/src/i18n/locales/zh.ts` 与 `en.ts` 中新增文案：
- `accounts.directModeBadge`: `'直连'` / `'Direct'`
- `accounts.proxyModeBadge`: `'代理'` / `'Proxy'`
- `accounts.directModeTitle`: `'Gemini 直连密钥用量监控'` / `'Gemini Direct API Keys Usage'`
- `accounts.directModeDesc`: `'当前节点直接连接官方端点，请求将在下列已配置的 API Key 之间均匀负载均衡'` / `'This node connects directly to official endpoints. Requests are balanced across configured API keys.'`
- `accounts.keyTotalRequests`: `'总调用量'` / `'Total Requests'`
- `accounts.keySuccess`: `'成功'` / `'Success'`
- `accounts.keyFailure`: `'失败'` / `'Failed'`
- `accounts.keySuccessRate`: `'成功率'` / `'Success Rate'`
- `accounts.noKeysConfigured`: `'当前直连节点尚未配置 API Key，请前往系统设置添加'` / `'No API keys configured on this direct node. Please add keys in Settings.'`

- [ ] **Step 2: Update AccountsView state & header**

在 `frontend/src/components/AccountsView.tsx` 中：
1. 接收来自 `/api/admin/accounts/servers` 的 `serversMeta` 数据并维护 `serversMeta` 状态数组。
2. 在服务器 Tab 切换按钮旁渲染类型徽章：
   - 如果是 `direct` 模式，渲染精致的青色/蓝色徽章 `[直连]`；
   - 如果是 `proxy` 模式，渲染紫色/灰色徽章 `[代理]`。
3. 判断当前选中的节点是否为直连模式：
   `const isCurrentDirect = serversMeta[activeServerIndex]?.type === 'direct' || serverDataMap[activeServerIndex]?.isDirectMode;`

- [ ] **Step 3: Render Direct Mode UI**

1. 当 `isCurrentDirect` 为 `true` 时：
   - 隐藏顶部的“上传凭据文件”、“去重”、“批量删除”、“导出”等代理专用按钮，仅保留“刷新”与“搜索”。
   - 顶部统计卡片：直连 Key 数量、周期总请求数、成功调用数、失败调用数。
   - 列表渲染：
     - 若未配置任何 Key，展示友好的空状态卡片并提供“前往配置”引导。
     - 若有 Key，每一行展示脱敏 Key 名称（如 `AIzaSy***1234`，带一键复制）、成功率状态条、总调用次数、成功/失败数。
     - 展开或直接展示该 Key 的 `byModel` 模型明细标签���如 `gemini-2.5-flash: 42次`、`gemini-2.5-pro: 18次`）。

- [ ] **Step 4: Build frontend and verify**

Run: `npm run build:frontend`
Expected: 编译打包成功，无 TypeScript 错误。

- [ ] **Step 5: Run full test suite for regression verification**

Run: `npm test`
Expected: 全体单元测试通过。

- [ ] **Step 6: Commit changes**

```bash
git add frontend/src/components/AccountsView.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(ui): implement direct mode keys usage monitoring and server type badges in AccountsView"
```

---

### Task 7: 端到端全链路集成验证与系统自检

**Files:**
- Test: `tests/upstreamServerTypeE2E.test.ts`

- [ ] **Step 1: Write E2E Integration test**

编写覆盖混合节点集群调度、直连多 Key 轮询、模型白名单限制与虚拟账号统计的完整端到端测试 `tests/upstreamServerTypeE2E.test.ts`。

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: 全体通过。

- [ ] **Step 3: Run full production build**

Run: `npm run build`
Expected: 前端和后端全部编译成功。

- [ ] **Step 4: Commit test and any final polish**

```bash
git add tests/upstreamServerTypeE2E.test.ts
git commit -m "test: add comprehensive E2E tests for upstream server types and direct mode"
```

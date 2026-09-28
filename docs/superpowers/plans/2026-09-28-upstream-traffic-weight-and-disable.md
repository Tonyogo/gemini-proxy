# 上游代理请求权重配置与启停控制实施计划 (Upstream Traffic Weight & Disable Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Gemini Proxy 上游代理服务器引入基于平滑加权轮询（SWRR）的百分比流量分配机制和启停（Enable/Disable）控制，并在 Web 控制台中提供直观的可视化多代理配置面板，同时全面向后兼容现有的环境变量与逗号分隔配置。

**Architecture:** 
1. 在 `src/types/index.ts` 中定义 `UpstreamServerConfig` 和 `UpstreamServerStatus` 核心类型；
2. 在 `config/default.ts` 中实现统一解析器 `parseUpstreamServers`，支持标准 JSON 结构与带 `#weight=80&name=xxx`、`#disabled` 参数的扩展字符串解析，并与 `runtime.json` 双模同步；
3. 在 `src/utils/upstreamManager.ts` 中集成平滑加权轮询（SWRR）算法与实时百分比归一化计算，联动 180s 故障熔断���离与全禁用安全兜底；
4. 在 `src/admin/controllers/adminController.ts` 中扩展 `/api/admin/status` 与 `/api/admin/config` 接口以支持结构化代理管理与实时占比监控；
5. 在 `frontend/src/components/ConfigModal.tsx` 中实现模块化代理管理卡片与彩色流量切分进度条。

**Tech Stack:** TypeScript, Node.js, Express, React (Vite), TailwindCSS, Jest, Supertest

**Spec:** `docs/superpowers/specs/2026-09-28-upstream-traffic-weight-and-disable-design.md`

## Global Constraints

- **向前兼容性**：必须保持 `config.geminiBaseUrl` 作为逗号分隔字符串导出，以及 `upstreamManager.getBaseUrls()` 返回 string[] 数组的原有契约。
- **动态配置无缓存**：遵循项目规范，禁止在模块顶层或构造函数中静态缓存 `config` 属性，必须通过 getter 或动态求值支持运行时热重载。
- **纯正平滑算法**：流量分配必须采用 Nginx 风格平滑加权轮询（SWRR），避免高权重节点在小并发窗口内被连续密集调用。
- **零中断兜底**：当所有节点均被手动禁用或全部触发熔断时，系统必须自动降级激活节点，杜绝 100% 拒绝服务错误。
- **测试全量绿色**：实现过程中不得破坏已有的 147 个测试套件（813 个测试项）。

## Review Focus

1. **全节点禁用/全熔断边界**：当用户在配置中将所有节点全部置为 `enabled: false`，调度器能够自动降级激活并打印告警，而不是返回空或崩溃。
2. **非法权重输入清洗**：输入负数、0、NaN 或极大数值时，解析器自动规整在 `1 ~ 1000` 合法区间内，防止除零或死循环。
3. **禁用节点流量占比严格归零**：当一个节点被设置为 `enabled: false` 时，其 `effectivePercent` 必须精确为 `0.0%`，且 SWRR 调度器绝对不选中该节点。
4. **单节点运行的高性能直通**：当仅有一个已启用节点时，调度器跳过复杂的加权矩阵计算，直接快速返回该节点并标记占比 `100.0%`。
5. **动态热重载原子性**：通过 Web 控制台更新 `upstreamServers` 时，`updateConfig` 需同时更新结构化配置与 `geminiBaseUrl`，并重置调度器的权衡状态，使新配置即时生效。

---

### Task 1: 数据类型定义与配置解析层重构 (Types & Config Parser)

**Files:**
- Modify: `src/types/index.ts:75-80`
- Modify: `config/default.ts:75-160`
- Test: `tests/upstreamConfig.test.ts`

**Interfaces:**
- Consumes: `process.env.GEMINI_BASE_URL`, `config/runtime.json`
- Produces: 
  - `UpstreamServerConfig`: `{ url: string; weight: number; enabled: boolean; name?: string }`
  - `UpstreamServerStatus`: ���承 `UpstreamServerConfig` 附带 `serverIndex`, `effectivePercent`, `isIsolated`, `consecutiveFailures`, `isolatedUntil`, `lastError`
  - `parseUpstreamServers(raw?: any): UpstreamServerConfig[]`
  - `config.upstreamServers: UpstreamServerConfig[]`

- [ ] **Step 1: 编写配置解析器的失败测试**

在 `tests/upstreamConfig.test.ts` 中编写针对传统逗号分隔、扩展 Hash 参数、JSON 数组及非法边界清洗的测试：

```typescript
import { parseUpstreamServers, normalizeBaseUrls, config, updateConfig } from '../config/default';
import { UpstreamServerConfig } from '../src/types';

describe('Upstream Config Parser', () => {
  it('parses legacy comma-separated urls with default weight and enabled status', () => {
    const raw = 'https://s1.example.com, https://s2.example.com/';
    const servers = parseUpstreamServers(raw);
    expect(servers).toEqual([
      { url: 'https://s1.example.com', weight: 1, enabled: true },
      { url: 'https://s2.example.com', weight: 1, enabled: true }
    ]);
  });

  it('parses extended hash parameters including weight, percent, disabled, and name', () => {
    const raw = 'https://s1.example.com#weight=80&name=MainHK,https://s2.example.com#percent=20&name=BackupUS,https://s3.example.com#disabled';
    const servers = parseUpstreamServers(raw);
    expect(servers).toEqual([
      { url: 'https://s1.example.com', weight: 80, enabled: true, name: 'MainHK' },
      { url: 'https://s2.example.com', weight: 20, enabled: true, name: 'BackupUS' },
      { url: 'https://s3.example.com', weight: 1, enabled: false }
    ]);
  });

  it('parses JSON array format properly', () => {
    const input: UpstreamServerConfig[] = [
      { url: 'https://s1.example.com', weight: 75, enabled: true, name: 'Primary' },
      { url: 'https://s2.example.com', weight: 25, enabled: false }
    ];
    const servers = parseUpstreamServers(input);
    expect(servers).toEqual([
      { url: 'https://s1.example.com', weight: 75, enabled: true, name: 'Primary' },
      { url: 'https://s2.example.com', weight: 25, enabled: false }
    ]);
  });

  it('sanitizes invalid weights and protocol missing urls', () => {
    const raw = 's1.example.com#weight=-10,s2.example.com#weight=invalid,s3.example.com#weight=2000';
    const servers = parseUpstreamServers(raw);
    expect(servers[0]).toEqual({ url: 'https://s1.example.com', weight: 1, enabled: true });
    expect(servers[1]).toEqual({ url: 'https://s2.example.com', weight: 1, enabled: true });
    expect(servers[2]).toEqual({ url: 'https://s3.example.com', weight: 1000, enabled: true });
  });

  it('falls back to official Gemini endpoint when raw input is empty', () => {
    expect(parseUpstreamServers('')).toEqual([
      { url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API' }
    ]);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/upstreamConfig.test.ts`
预期: 失败（`parseUpstreamServers` 尚未导出与定义）。

- [ ] **Step 3: 更新类型定义与实现解析逻辑**

1. 在 `src/types/index.ts` 补充类型：
```typescript
export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
}

export interface UpstreamServerStatus extends UpstreamServerConfig {
  serverIndex: number;
  effectivePercent: number;
  consecutiveFailures: number;
  isIsolated: boolean;
  isolatedUntil: number;
  lastError?: string;
}
```

2. 在 `config/default.ts` 中实现 `parseUpstreamServers`、升级 `normalizeBaseUrls` 与 `updateConfig`：
```typescript
export function parseUpstreamServers(raw?: any): UpstreamServerConfig[] {
  const defaultFallback: UpstreamServerConfig[] = [
    { url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API' }
  ];

  if (!raw) return defaultFallback;

  // 1. JSON Array input
  if (Array.isArray(raw)) {
    const list = raw.map(item => {
      if (!item || typeof item !== 'object') return null;
      let url = String(item.url || '').trim().replace(/\/+$/, '');
      if (!url) return null;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      let weight = parseInt(String(item.weight), 10);
      if (isNaN(weight) || weight < 1) weight = 1;
      if (weight > 1000) weight = 1000;
      const enabled = item.enabled !== false;
      const name = item.name ? String(item.name).trim() : undefined;
      return { url, weight, enabled, name };
    }).filter(Boolean) as UpstreamServerConfig[];

    return list.length > 0 ? list : defaultFallback;
  }

  // 2. String input (comma separated, with optional #params)
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return defaultFallback;

    // Check if it's a JSON string representation of an array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parseUpstreamServers(parsed);
        }
      } catch {
        // Fall back to comma-separated parsing
      }
    }

    const segments = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    const list = segments.map(seg => {
      const hashIdx = seg.indexOf('#');
      let basePart = hashIdx !== -1 ? seg.slice(0, hashIdx).trim() : seg;
      const paramPart = hashIdx !== -1 ? seg.slice(hashIdx + 1).trim() : '';

      basePart = basePart.replace(/\/+$/, '');
      if (!basePart) return null;
      if (!/^https?:\/\//i.test(basePart)) basePart = `https://${basePart}`;

      let weight = 1;
      let enabled = true;
      let name: string | undefined = undefined;

      if (paramPart) {
        const params = new URLSearchParams(paramPart);
        const wStr = params.get('weight') || params.get('percent');
        if (wStr !== null) {
          const w = parseInt(wStr, 10);
          if (!isNaN(w)) weight = Math.max(1, Math.min(1000, w));
        }

        if (params.has('disabled') || params.get('enabled') === 'false') {
          enabled = false;
        }

        const nameParam = params.get('name');
        if (nameParam) {
          name = decodeURIComponent(nameParam);
        }
      }

      return { url: basePart, weight, enabled, name };
    }).filter(Boolean) as UpstreamServerConfig[];

    return list.length > 0 ? list : defaultFallback;
  }

  return defaultFallback;
}
```

并在 `config` 对象上增加 `upstreamServers` getter，保持 `geminiBaseUrl` 与 `upstreamServers` 紧密同步。

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/upstreamConfig.test.ts`
预期: PASS。

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add src/types/index.ts config/default.ts tests/upstreamConfig.test.ts
git commit -m "feat(config): add UpstreamServerConfig type and parseUpstreamServers helper"
```

---

### Task 2: UpstreamManager 平滑加权轮询 (SWRR) 调度引擎实现

**Files:**
- Modify: `src/utils/upstreamManager.ts`
- Test: `tests/upstreamWeightedScheduler.test.ts`

**Interfaces:**
- Consumes: `config.upstreamServers`, `config.geminiBaseUrl`
- Produces:
  - `upstreamManager.getUpstreamServer(options?: { model?: string; serverIndex?: number }): UpstreamServerSelection`
  - `upstreamManager.getUpstreamServerStatusList(): UpstreamServerStatus[]`
  - `upstreamManager.isNodeIsolated(serverIndex: number): boolean`
  - `upstreamManager.recordRequestResult(serverIndex: number, success: boolean, error?: string | number): void`

- [ ] **Step 1: 编写加权调度与百分比分流测试**

在 `tests/upstreamWeightedScheduler.test.ts` 中编写测试：

```typescript
import { upstreamManager } from '../src/utils/upstreamManager';
import config, { updateConfig } from '../config/default';

describe('UpstreamManager Smooth Weighted Round-Robin (SWRR)', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  it('distributes requests matching configured 4:1 (80% vs 20%) ratio smoothly', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 80, enabled: true },
        { url: 'https://s2.example.com', weight: 20, enabled: true }
      ]
    });

    const sequence: number[] = [];
    for (let i = 0; i < 5; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'test-model' });
      sequence.push(sel.serverIndex);
    }
    // SWRR for 4:1 generates A, A, A, B, A (smooth distribution)
    expect(sequence).toEqual([0, 0, 0, 1, 0]);

    // Aggregate over 100 requests
    const counts = { 0: 0, 1: 0 };
    for (let i = 0; i < 95; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'test-model' });
      counts[sel.serverIndex as 0 | 1]++;
    }
    // 5 + 95 = 100 requests total
    counts[0] += 4;
    counts[1] += 1;
    expect(counts[0]).toBe(80);
    expect(counts[1]).toBe(20);
  });

  it('completely excludes disabled nodes and normalizes active nodes to 100%', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 60, enabled: true },
        { url: 'https://s2.example.com', weight: 40, enabled: false }
      ]
    });

    const statusList = upstreamManager.getUpstreamServerStatusList();
    expect(statusList[0].effectivePercent).toBe(100);
    expect(statusList[1].effectivePercent).toBe(0);

    for (let i = 0; i < 10; i++) {
      const sel = upstreamManager.getUpstreamServer();
      expect(sel.serverIndex).toBe(0);
      expect(sel.serverUrl).toBe('https://s1.example.com');
    }
  });

  it('transfers 100% traffic to healthy nodes when a node is isolated by circuit breaker', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 50, enabled: true },
        { url: 'https://s2.example.com', weight: 50, enabled: true }
      ]
    });

    // Node 0 fails 3 times
    upstreamManager.recordRequestResult(0, false, '500 Error');
    upstreamManager.recordRequestResult(0, false, '500 Error');
    upstreamManager.recordRequestResult(0, false, '500 Error');

    expect(upstreamManager.isNodeIsolated(0)).toBe(true);

    const statusList = upstreamManager.getUpstreamServerStatusList();
    expect(statusList[0].isIsolated).toBe(true);
    expect(statusList[0].effectivePercent).toBe(0);
    expect(statusList[1].effectivePercent).toBe(100);

    for (let i = 0; i < 5; i++) {
      const sel = upstreamManager.getUpstreamServer();
      expect(sel.serverIndex).toBe(1);
    }
  });

  it('falls back safely when all nodes are disabled to prevent complete service denial', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 50, enabled: false },
        { url: 'https://s2.example.com', weight: 50, enabled: false }
      ]
    });

    // Should not throw and should still route
    const sel = upstreamManager.getUpstreamServer();
    expect([0, 1]).toContain(sel.serverIndex);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/upstreamWeightedScheduler.test.ts`
预期: 失败（`upstreamManager` 尚未实现加权 SWRR 算法与状态返回）。

- [ ] **Step 3: 实现平滑加权轮询调度器**

编辑 `src/utils/upstreamManager.ts`：
1. 实现 `getUpstreamServers(): UpstreamServerConfig[]`：优先读取 `config.upstreamServers`，若无或类型不符则调用 `parseUpstreamServers(config.geminiBaseUrl)`；
2. 内部维护 `modelCurrentWeights: Map<string, Map<number, number>>` 与 `globalCurrentWeights: Map<number, number>`；
3. 实现平滑加权轮询逻辑（SWRR）：
   - 过滤健康可用节点候选集 `candidates`；
   - 单节点时直接返回；
   - 候选集全为空时安全回退；
   - 计算各节点实际权重累加，选取最大 `currentWeight` 节点，并扣除 `totalWeight`；
4. 实现 `getUpstreamServerStatusList(): UpstreamServerStatus[]`：计算每个节点的 `effectivePercent = parseFloat(((w / total) * 100).toFixed(1))`。

- [ ] **Step 4: 运行加权测试与既有测试验证**

运行: `npx jest tests/upstreamWeightedScheduler.test.ts tests/upstreamManager.test.ts tests/upstreamCircuitBreaker.test.ts`
预期: 全部通过。

- [ ] **Step 5: 提交 Task 2 代码**

```bash
git add src/utils/upstreamManager.ts tests/upstreamWeightedScheduler.test.ts
git commit -m "feat(upstream): implement smooth weighted round-robin scheduling and status monitoring"
```

---

### Task 3: Admin API 契约扩展与配置持久化对接

**Files:**
- Modify: `src/admin/controllers/adminController.ts:10-105`
- Test: `tests/adminUpstreamConfig.test.ts`

**Interfaces:**
- Consumes: `upstreamManager.getUpstreamServerStatusList()`, `config.upstreamServers`
- Produces:
  - `GET /api/admin/status`: 返回 `config.upstreamServers` 与 `upstreamStatus`
  - `PUT /api/admin/config`: 接收并更新 `upstreamServers`

- [ ] **Step 1: 编写 Admin API 集成测试**

在 `tests/adminUpstreamConfig.test.ts` 中编写测试：

```typescript
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin API Upstream Management', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  it('GET /api/admin/status returns structured upstreamServers and upstreamStatus', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toHaveProperty('upstreamServers');
    expect(Array.isArray(res.body.config.upstreamServers)).toBe(true);
    expect(res.body).toHaveProperty('upstreamStatus');
    expect(Array.isArray(res.body.upstreamStatus)).toBe(true);
  });

  it('PUT /api/admin/config updates upstreamServers and recomputes effectivePercent', async () => {
    const newServers = [
      { url: 'https://hk.example.com', weight: 70, enabled: true, name: 'HK Gateway' },
      { url: 'https://us.example.com', weight: 30, enabled: true, name: 'US Gateway' }
    ];

    const putRes = await request(app)
      .put('/api/admin/config')
      .set('x-admin-key', secretKey)
      .send({ upstreamServers: newServers });

    expect(putRes.status).toBe(200);
    expect(putRes.body.config.upstreamServers).toEqual(newServers);
    expect(putRes.body.config.geminiBaseUrl).toBe('https://hk.example.com,https://us.example.com');

    // Verify GET /status reflects the new distribution
    const statusRes = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    const statuses = statusRes.body.upstreamStatus;
    expect(statuses[0].effectivePercent).toBe(70);
    expect(statuses[1].effectivePercent).toBe(30);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/adminUpstreamConfig.test.ts`
预期: 失败（`adminController.getStatus` 尚未返回 `upstreamServers` 与 `upstreamStatus`）。

- [ ] **Step 3: 更新 AdminController 实现**

编辑 `src/admin/controllers/adminController.ts`：
1. 在 `getStatus` 中返回：
   ```typescript
   config: {
     ...
     upstreamServers: config.upstreamServers,
   },
   upstreamStatus: upstreamManager.getUpstreamServerStatusList(),
   ```
2. 在 `updateConfig` 中��步处理 `upstreamServers`，并返回最新的 `upstreamServers` 和 `upstreamStatus`；
3. 当更新完成后调用 `upstreamManager.reset()` 清空瞬时累加权重以完成热重载。

- [ ] **Step 4: 运行 Admin API 测试及回归测试**

运行: `npx jest tests/adminUpstreamConfig.test.ts tests/adminController.test.ts`
预期: 全部通过。

- [ ] **Step 5: 提交 Task 3 代码**

```bash
git add src/admin/controllers/adminController.ts tests/adminUpstreamConfig.test.ts
git commit -m "feat(admin): expose upstreamServers configuration and upstreamStatus monitoring"
```

---

### Task 4: 前端 Web 控制台多代理管理面板与流量占比进度条实现

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/components/ConfigModal.tsx`

**Interfaces:**
- Consumes: `/api/admin/status` 返回的 `config.upstreamServers` 和 `upstreamStatus`
- Produces: 直观的代理节点列表，实时流量切分条，启停开关与权重输入，向 `/api/admin/config` 提交 `upstreamServers` 数组

- [ ] **Step 1: 补充中英文国际化语言包词条**

编辑 `frontend/src/i18n/locales/zh.ts` 与 `frontend/src/i18n/locales/en.ts`：
- `upstreamServersTitle`: "上游代理服务器与流量分配" / "Upstream Gateways & Traffic Allocation"
- `upstreamServersDesc`: "配置多个上游 Gemini 网关并设置流量百分比权重及启停状态。系统将自动按平滑加权算法进行精确调度。" / "Configure multiple upstream gateways with traffic weights and enable/disable toggles. Requests are smoothly dispatched via weighted round-robin."
- `trafficSplitPreview`: "实时流量分配预览" / "Live Traffic Split Preview"
- `effectiveTraffic`: "实际流量占比" / "Effective Traffic"
- `addUpstreamServer`: "添加代理节点" / "Add Gateway Node"
- `nodeName`: "节点备注名" / "Node Alias"
- `nodeUrl`: "网关 URL" / "Gateway URL"
- `nodeWeight`: "权重" / "Weight"
- `nodeEnabled`: "已启用" / "Enabled"
- `nodeDisabled`: "已禁用" / "Disabled"
- `atLeastOneServer`: "至少需要保留一个上游网关节点" / "At least one gateway node must be configured"

- [ ] **Step 2: 重构 ConfigModal.tsx 中的上游网关配置区域**

1. 在 `ConfigModal.tsx` 中新增状态：
   ```typescript
   const [upstreamServers, setUpstreamServers] = useState<UpstreamServerConfig[]>([]);
   ```
2. 在从 `/api/admin/status` 获取配置时，初始化 `upstreamServers`（若后端未提供则自动由 `geminiBaseUrl` 转化）；
3. 计算各已启用节点的实时百分比：
   ```typescript
   const activeTotalWeight = useMemo(() => {
     return upstreamServers
       .filter(s => s.enabled)
       .reduce((sum, s) => sum + (Number(s.weight) || 1), 0);
   }, [upstreamServers]);

   const getEffectivePercent = (server: UpstreamServerConfig) => {
     if (!server.enabled || activeTotalWeight === 0) return 0;
     const w = Number(server.weight) || 1;
     return parseFloat(((w / activeTotalWeight) * 100).toFixed(1));
   };
   ```
4. 渲染彩色“流量切分进度条 (Traffic Split Bar)”；
5. 渲染各节点配置卡片（包括启用 Switch 开关、节点别名、URL、权重输入、实时占比徽标、删除按钮）；
6. 保存时向 `PUT /api/admin/config` 提交清洗后的 `upstreamServers` 数组。

- [ ] **Step 3: 构建前端验证**

运行: `npm run build:frontend`
预期: Vite React 编译顺利无错误，无类型报错。

- [ ] **Step 4: 运行前端相关测试**

运行: `npx jest tests/configModalMobile.test.tsx`
预期: PASS。

- [ ] **Step 5: 提交 Task 4 代码**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): add visual upstream traffic management and split preview in ConfigModal"
```

---

### Task 5: 全链路端到端回归与性能验证 (E2E Regression)

**Files:**
- Test: `tests/upstreamTrafficE2E.test.ts`
- Verify: 全量 147+ 测试套件

- [ ] **Step 1: 编写全链路端到端代理加权转发验证**

在 `tests/upstreamTrafficE2E.test.ts` 中启动两个本地模拟 HTTP 上游服务器（Server 1 端口 19991，Server 2 端口 19992），配置权重为 75% vs 25%：
1. 连续发起 40 次代理转发请求；
2. 统计 Server 1 与 Server 2 实际收到的请求数量；
3. 断言 Server 1 接收 30 次（75%），Server 2 接收 10 次（25%）；
4. 动态禁用 Server 2，再发起 10 次请求，断言 10 次全部打到 Server 1（100%）。

- [ ] **Step 2: 运行端到端测试**

运行: `npx jest tests/upstreamTrafficE2E.test.ts`
预期: PASS。

- [ ] **Step 3: 运行全量 Jest 测试套件回归**

运行: `npm test`
预期: 148 个测试套件全量绿色通过（148 passed, 0 failed）。

- [ ] **Step 4: 提交 Task 5 代码**

```bash
git add tests/upstreamTrafficE2E.test.ts
git commit -m "test(upstream): add end-to-end traffic weight and disable integration test"
```

---

## Plan Self-Review Check

1. **Spec Coverage**:
   - 流量百分比调度与平滑加权（SWRR）覆盖 -> Task 2
   - 节点启用/禁用与百分比归一化覆盖 -> Task 1, Task 2, Task 4
   - 双模兼容与 Hash 参数扩展语法覆盖 -> Task 1
   - 熔断健康联动与全禁用/全熔断安全降级覆盖 -> Task 2
   - Web 控制台可视化管理卡片与切分进度条覆盖 -> Task 4
   - 全链路与全量测试套件保障覆盖 -> Task 5
2. **Placeholder Scan**: 扫描确认无任何 "TODO", "TBD", "implement later" 占位符。
3. **Type Consistency**: `UpstreamServerConfig` 与 `UpstreamServerStatus` 在各任务间定义统一，属性名一致。
4. **Review Focus**: 全禁用安全降级、非合法权重清洗、禁用节点 0% 强制清空、单节点性能直通均包含于测试矩阵中。

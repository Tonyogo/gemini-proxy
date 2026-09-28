# 代理服务器节点级模型限制与感知调度实施计划 (Per-Upstream Model Restriction & Routing Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底清理先前实现的全局模型限制逻辑，并将模型白名单能力下沉到各个代理服务器节点（`UpstreamServerConfig`）中，使调度器仅在支持目标模型的代理服务器子集中执行平滑加权轮询（SWRR），当全集群无任何节点支持该模型时在请求发起前返回标准 403 错误，并在 Web 控制台各节点卡片中提供内嵌的模型标签化配置。

**Architecture:** 
1. 清理原全局配置：移除 `config.allowedModels`、`src/utils/modelValidator.ts` 及旧全局测试文件；
2. 在 `src/types/index.ts` 中为 `UpstreamServerConfig` 增加 `allowedModels?: string[]` 字段；
3. 在 `config/default.ts` 中增强 `parseUpstreamServers`，支持 Hash 参数 `#models=m1+m2` 与 JSON 对象���组中节点的 `allowedModels` 解析，未配置默认允许全部模型；
4. 在 `src/utils/upstreamManager.ts` 中实现节点模型匹配判定 `serverSupportsModel` 与集群可用性检查 `hasUpstreamForModel`，调度器动态过滤候选池并实现基于模型能力的平滑加权轮询；
5. 在 `claudeController.ts` 与 `geminiController.ts` 中在请求发起前调用 `upstreamManager.hasUpstreamForModel`，若全节点不支持则分别返回标准 403 响应（Anthropic: `permission_error`，Gemini: `PERMISSION_DENIED`）；
6. 在 `frontend/src/components/ConfigModal.tsx` 中移除全局卡片，在各代理服务器卡片内嵌入模型限制标签编辑器与状态微标；
7. 编写节点模型解析、感知路由与端到端集成测试，保障现有 150+ 测试套件全量绿色通过。

**Tech Stack:** TypeScript, Node.js, Express, React (Vite), TailwindCSS, Jest, Supertest

**Spec:** `docs/superpowers/specs/2026-09-28-per-upstream-model-restriction-design.md`

## Global Constraints

- **向前兼容性**：若代理节点未配置 `allowedModels` 或为空数组，该节点默认允许全部模型通行。
- **全字匹配与大小写不敏感**：节点模型判定采用严格全字比对，统一小写清洗，支持客户端原始请求模型名与映射后目标底座模型名双向放行。
- **流���绝对隔离**：对于明确配置了 `allowedModels` 的代理节点，绝不可接收未授权模型的请求；当支持该模型的节点全部熔断时，仅在该模型支持者集合内重试，严禁向不支持该模型的节点泄露流量。
- **上游熔断保护**：全节点不支持导致的 403 拦截发生在调用 upstream 之前，严禁调用 `upstreamManager.recordRequestResult`。
- **旧代码彻底清理**：不留无用的全局配置与死代码，删除旧全局测试文件。

## Review Focus

1. **旧全局配置彻底移除**：检查 `config.allowedModels`、`ALLOWED_MODELS`、`modelValidator.ts` 以及旧全局拦截代码是否被彻底清除，无遗留死代码。
2. **多节点异构模型分流**：Server 1（允许全部），Server 2（仅允许 `gemini-2.5-flash`）。请求 `gemini-2.5-flash` 时流量按权重在 Server 1 与 Server 2 间平滑分流；请求 `gemini-2.5-pro` 时流量 100% 打到 Server 1，Server 2 接收量精确为 0。
3. **全集群无可用节点时的标准 403 拦截**：当请求的模型未被任何已启用的代理服务器允许时，Claude 协议接口返回 Anthropic 格式的 403 `permission_error`，Gemini 协议接口返回 Google 格式的 403 `PERMISSION_DENIED`。
4. **双向兼容模型判定**：客户端请求 `claude-3-7-sonnet` 映射至 `gemini-2.5-pro`，代理节点只要在 `allowedModels` 中包含两者任一即可判定为支持。
5. **各节点单独配置的持久化与热重载**：通过 Web 控制台更新各代理节点的 `allowedModels` 时，配置正确写入 `runtime.json`，且内存中调度器的权重状态原子重置并即时生效。

---

### Task 1: 彻底清理旧全局模型限制代码与测试文件

**Files:**
- Delete: `src/utils/modelValidator.ts`
- Delete: `tests/modelValidator.test.ts`
- Delete: `tests/claudeModelRestriction.test.ts`
- Delete: `tests/geminiModelRestriction.test.ts`
- Delete: `tests/adminAllowedModels.test.ts`
- Delete: `tests/modelRestrictionE2E.test.ts`
- Modify: `config/default.ts:50-280`
- Modify: `src/admin/controllers/adminController.ts:15-105`
- Modify: `src/proxy/controllers/claudeController.ts:50-590`
- Modify: `src/proxy/controllers/geminiController.ts:40-75`

**Interfaces:**
- Consumes: 现有全局代码
- Produces: 干净的代码库，移除全局 `allowedModels` 配置、全局拦截逻辑与旧测试文件

- [ ] **Step 1: 删除旧的独立全局工具类与测试文件**

```bash
rm -f src/utils/modelValidator.ts
rm -f tests/modelValidator.test.ts
rm -f tests/claudeModelRestriction.test.ts
rm -f tests/geminiModelRestriction.test.ts
rm -f tests/adminAllowedModels.test.ts
rm -f tests/modelRestrictionE2E.test.ts
```

- [ ] **Step 2: 从 config/default.ts 中移除全局 allowedModels**

1. 移除 `parseAllowedModels` 函数；
2. 从 `getEnvConfig()` 中移除 `allowedModels` 字段；
3. 从 `config` 对象中移除 `allowedModels` 的 getter 和 setter；
4. 从 `updateConfig` 中移除对 `partialConfig.allowedModels` 的处理。

- [ ] **Step 3: 从控制器与管理 API 中移除全局 isModelAllowed 调用**

1. 在 `src/proxy/controllers/claudeController.ts`：移除 `import { isModelAllowed }`，移除 `handleMessages`、`handleCountTokens`、`handleRetrieveModel` 中的全局 `isModelAllowed` 拦截；
2. 在 `src/proxy/controllers/geminiController.ts`：移除 `import { isModelAllowed }`，移除 `handleProxy` 中的全局 `isModelAllowed` 拦截；
3. 在 `src/admin/controllers/adminController.ts`：从 `getStatus` 和 `updateConfig` 的 `config` 响应中移除 `allowedModels`。

- [ ] **Step 4: 运行基线测试确保清理干净且不产生语法错误**

运行: `npm test`
Expected: 剩余全部测试套件顺利通过（150+ suites passed）。

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add -u
git commit -m "refactor: remove legacy global allowedModels implementation and tests"
```

---

### Task 2: 节点级数据结构扩展与配置解析实现 (Per-Upstream Schema & Parser)

**Files:**
- Modify: `src/types/index.ts:93-105`
- Modify: `config/default.ts:75-170`
- Test: `tests/upstreamServerModelConfig.test.ts`

**Interfaces:**
- Consumes: `process.env.GEMINI_BASE_URL`, `config/runtime.json`
- Produces: 
  - `UpstreamServerConfig.allowedModels?: string[]`
  - `parseUpstreamServers(raw?: any): UpstreamServerConfig[]` 支持解析 `#models=m1+m2` 与 JSON 对象数组

- [ ] **Step 1: 编写节点级模型解析测试**

在 `tests/upstreamServerModelConfig.test.ts` 中编写测试：

```typescript
import { parseUpstreamServers } from '../config/default';
import { UpstreamServerConfig } from '../src/types';

describe('Per-Upstream Model Config Parser', () => {
  it('parses extended hash parameters with models list separated by + or ,', () => {
    const raw = 'https://s1.example.com#weight=80&models=gemini-2.5-flash+gemini-2.5-pro,https://s2.example.com#weight=20&models=gemini-2.5-flash';
    const servers = parseUpstreamServers(raw);

    expect(servers).toEqual([
      {
        url: 'https://s1.example.com',
        weight: 80,
        enabled: true,
        allowedModels: ['gemini-2.5-flash', 'gemini-2.5-pro']
      },
      {
        url: 'https://s2.example.com',
        weight: 20,
        enabled: true,
        allowedModels: ['gemini-2.5-flash']
      }
    ]);
  });

  it('defaults allowedModels to undefined or empty array when not specified (meaning all allowed)', () => {
    const raw = 'https://s1.example.com#weight=50,https://s2.example.com';
    const servers = parseUpstreamServers(raw);

    expect(servers[0].allowedModels).toBeUndefined();
    expect(servers[1].allowedModels).toBeUndefined();
  });

  it('parses JSON array format containing allowedModels', () => {
    const input: UpstreamServerConfig[] = [
      {
        url: 'https://s1.example.com',
        weight: 70,
        enabled: true,
        allowedModels: ['gemini-2.5-pro', 'claude-3-7-sonnet']
      },
      {
        url: 'https://s2.example.com',
        weight: 30,
        enabled: true
      }
    ];
    const servers = parseUpstreamServers(input);

    expect(servers[0].allowedModels).toEqual(['gemini-2.5-pro', 'claude-3-7-sonnet']);
    expect(servers[1].allowedModels).toBeUndefined();
  });

  it('sanitizes and deduplicates model names in allowedModels', () => {
    const input = [
      {
        url: 'https://s1.example.com',
        weight: 10,
        enabled: true,
        allowedModels: [' gemini-2.5-flash ', '', 'gemini-2.5-flash', 'gemini-2.5-pro']
      }
    ];
    const servers = parseUpstreamServers(input);
    expect(servers[0].allowedModels).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/upstreamServerModelConfig.test.ts`
Expected: FAIL（`parseUpstreamServers` 尚未解析 `allowedModels`）。

- [ ] **Step 3: 更新类型定义与实现解析逻辑**

1. 在 `src/types/index.ts` 扩展 `UpstreamServerConfig`：
```typescript
export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
}
```
2. 在 `config/default.ts` 的 `parseUpstreamServers` 中加入对 `models` / `allowedModels` 的解析与清洗：
```typescript
// Helper to sanitize model array
function sanitizeModelList(models?: any): string[] | undefined {
  if (!models) return undefined;
  if (Array.isArray(models)) {
    const list = Array.from(new Set(models.map(m => String(m || '').trim()).filter(Boolean)));
    return list.length > 0 ? list : undefined;
  }
  if (typeof models === 'string') {
    const list = Array.from(new Set(models.split(/[+,|]/).map(m => m.trim()).filter(Boolean)));
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}
```
并在解析每个 item 时：
```typescript
const allowedModels = sanitizeModelList(item.allowedModels || (params && (params.get('models') || params.get('allowedModels'))));
return { url, weight, enabled, name, ...(allowedModels ? { allowedModels } : {}) };
```

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/upstreamServerModelConfig.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 2 代码**

```bash
git add src/types/index.ts config/default.ts tests/upstreamServerModelConfig.test.ts
git commit -m "feat(config): support per-upstream allowedModels parsing in UpstreamServerConfig"
```

---

### Task 3: 模型感知加权路由调度器与可用性判定实现 (Model-Aware SWRR)

**Files:**
- Modify: `src/utils/upstreamManager.ts`
- Test: `tests/upstreamModelRouting.test.ts`

**Interfaces:**
- Consumes: `config.upstreamServers`, `config.geminiBaseUrl`
- Produces:
  - `serverSupportsModel(server: UpstreamServerConfig, originalModel?: string, resolvedModel?: string): boolean`
  - `hasUpstreamForModel(originalModel?: string, resolvedModel?: string): boolean`
  - `getUpstreamServer(options?: { model?: string; originalModel?: string; resolvedModel?: string; serverIndex?: number }): UpstreamServerSelection`

- [ ] **Step 1: 编写模型感知加权调度测试**

在 `tests/upstreamModelRouting.test.ts` 中编写测试：

```typescript
import { upstreamManager } from '../src/utils/upstreamManager';
import config, { updateConfig } from '../config/default';

describe('UpstreamManager Model-Aware SWRR Routing', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  it('identifies whether a server supports a model correctly', () => {
    const unrestrictedServer = { url: 'https://s1.example.com', weight: 1, enabled: true };
    expect(upstreamManager.serverSupportsModel(unrestrictedServer, 'gemini-2.5-pro')).toBe(true);

    const restrictedServer = {
      url: 'https://s2.example.com',
      weight: 1,
      enabled: true,
      allowedModels: ['gemini-2.5-flash', 'claude-3-7-sonnet']
    };
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'gemini-2.5-flash')).toBe(true);
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'GEMINI-2.5-FLASH')).toBe(true);
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'gemini-2.5-pro')).toBe(false);

    // Dual-direction matching: client model or mapped target model
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'claude-3-7-sonnet', 'gemini-2.5-pro')).toBe(true);
  });

  it('determines if any upstream server supports the model', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 1, enabled: true, allowedModels: ['gemini-2.5-flash'] },
        { url: 'https://s2.example.com', weight: 1, enabled: false, allowedModels: ['gemini-2.5-pro'] }
      ]
    });

    expect(upstreamManager.hasUpstreamForModel('gemini-2.5-flash')).toBe(true);
    // s2 is disabled, so gemini-2.5-pro has no active upstream
    expect(upstreamManager.hasUpstreamForModel('gemini-2.5-pro')).toBe(false);
    expect(upstreamManager.hasUpstreamForModel('unknown-model')).toBe(false);
  });

  it('routes traffic strictly to servers supporting the requested model', async () => {
    // S1: weight 80, unrestricted (supports all)
    // S2: weight 20, restricted to flash
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 80, enabled: true },
        { url: 'https://s2.example.com', weight: 20, enabled: true, allowedModels: ['gemini-2.5-flash'] }
      ]
    });

    // Requesting 'gemini-2.5-pro': ONLY S1 can serve it
    for (let i = 0; i < 20; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'gemini-2.5-pro' });
      expect(sel.serverIndex).toBe(0);
      expect(sel.serverUrl).toBe('https://s1.example.com');
    }

    // Requesting 'gemini-2.5-flash': Both S1 and S2 can serve it with 80% vs 20%
    const counts = { 0: 0, 1: 0 };
    for (let i = 0; i < 100; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'gemini-2.5-flash' });
      counts[sel.serverIndex as 0 | 1]++;
    }
    expect(counts[0]).toBe(80);
    expect(counts[1]).toBe(20);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/upstreamModelRouting.test.ts`
Expected: FAIL（方法未定义或调度器尚未按模型过滤）。

- [ ] **Step 3: 在 upstreamManager.ts 中实现模型感知调度逻辑**

1. 实现 `serverSupportsModel` 与 `hasUpstreamForModel`：
```typescript
public serverSupportsModel(server: UpstreamServerConfig, originalModel?: string, resolvedModel?: string): boolean {
  if (!server.allowedModels || server.allowedModels.length === 0) {
    return true;
  }
  const allowedSet = new Set(server.allowedModels.map(m => m.trim().toLowerCase()).filter(Boolean));
  if (allowedSet.size === 0) return true;

  const normOriginal = originalModel ? originalModel.trim().toLowerCase() : '';
  const normResolved = resolvedModel ? resolvedModel.trim().toLowerCase() : '';

  if (normOriginal && allowedSet.has(normOriginal)) return true;
  if (normResolved && allowedSet.has(normResolved)) return true;

  return false;
}

public hasUpstreamForModel(originalModel?: string, resolvedModel?: string): boolean {
  const servers = this.getUpstreamServers();
  return servers.some(s => s.enabled !== false && this.serverSupportsModel(s, originalModel, resolvedModel));
}
```

2. 在 `getUpstreamServer(options)` 中：
   - 提取请求模型：`const modelKey = options?.model || options?.resolvedModel || options?.originalModel;`
   - 过滤候选池：若 `modelKey` 存在，首先从已启用的节点��合中筛选出 `this.serverSupportsModel(s, options?.originalModel || modelKey, options?.resolvedModel || modelKey)` 的节点；
   - 检查熔断：在支持该模型的节点池中，过滤掉处于隔离期的节点；若全部隔离，则降级在支持该模型的节点池中重试；
   - 在得到的候选节点池中执行 SWRR 加权调度。

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/upstreamModelRouting.test.ts tests/upstreamWeightedScheduler.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 3 代码**

```bash
git add src/utils/upstreamManager.ts tests/upstreamModelRouting.test.ts
git commit -m "feat(upstream): implement model-aware upstream filtering and SWRR dispatching"
```

---

### Task 4: 控制器层全节点不支持拦截 (Controller 403 Interception)

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts:50-590`
- Modify: `src/proxy/controllers/geminiController.ts:40-75`
- Test: `tests/upstreamModelInterception.test.ts`

**Interfaces:**
- Consumes: `upstreamManager.hasUpstreamForModel(originalModel, resolvedModel)`
- Produces: 
  - 当无节点支持目标模型时，返回标准 403 响应，阻止向上游发起任何网络调用

- [ ] **Step 1: 编写控制器 403 拦截集成测试**

在 `tests/upstreamModelInterception.test.ts` 中���写测试：

```typescript
import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';

describe('Per-Upstream Model Restriction Controller Interception', () => {
  beforeEach(async () => {
    config.adminSecretKey = 'test-key';
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 1, enabled: true, allowedModels: ['gemini-2.5-flash', 'claude-3-5-sonnet'] }
      ]
    });
  });

  it('rejects /v1/messages with 403 when no upstream supports the model', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key')
      .send({
        model: 'claude-3-opus',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      type: 'error',
      error: {
        type: 'permission_error',
        message: "Model 'claude-3-opus' is not supported by any configured upstream server."
      }
    });
  });

  it('rejects /v1beta/models/{model}:generateContent with 403 when no upstream supports the model', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'test-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 403,
        message: "Model 'gemini-1.5-pro' is not supported by any configured upstream server.",
        status: 'PERMISSION_DENIED'
      }
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/upstreamModelInterception.test.ts`
Expected: FAIL（未在控制器中校验 `hasUpstreamForModel`）。

- [ ] **Step 3: 在控制器中集成拦截逻辑**

1. 在 `src/proxy/controllers/claudeController.ts`：
   - 在 `handleMessages` 中，在解析完 `clientReq.model` 与 `cleanModelName` 后：
     ```typescript
     const clientModel = clientReq.model || '';
     if (!upstreamManager.hasUpstreamForModel(clientModel, cleanModelName)) {
       const errPayload = {
         type: 'error',
         error: {
           type: 'permission_error',
           message: `Model '${clientModel || cleanModelName}' is not supported by any configured upstream server.`
         }
       };
       const duration = Date.now() - startTime;
       logger.warn(`[UpstreamManager] [Transaction: ${transactionId}] Request rejected: Model '${clientModel}' is not supported by any configured upstream server.`);
       payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 403, false);
       return res.status(403).json(errPayload);
     }
     ```
   - 在 `handleCountTokens` 与 `handleRetrieveModel` 中执行同样校验。
2. 在 `src/proxy/controllers/geminiController.ts`：
   - 在提取完 `originalModel` 与 `targetModelName` 后：
     ```typescript
     if (targetModelName && !upstreamManager.hasUpstreamForModel(originalModel, targetModelName)) {
       const errPayload = {
         error: {
           code: 403,
           message: `Model '${originalModel || targetModelName}' is not supported by any configured upstream server.`,
           status: 'PERMISSION_DENIED'
         }
       };
       const duration = Date.now() - startTime;
       logger.warn(`[GeminiProxy] [Transaction: ${transactionId}] Request rejected: Model '${originalModel || targetModelName}' is not supported by any configured upstream server.`);
       payloadLogger.saveTransaction(transactionId, req.body, null, null, errPayload, duration, requestPath, 403, false);
       return res.status(403).json(errPayload);
     }
     ```

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/upstreamModelInterception.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 4 代码**

```bash
git add src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts tests/upstreamModelInterception.test.ts
git commit -m "feat(proxy): return 403 when model is not supported by any configured upstream server"
```

---

### Task 5: 前端 Web 控制台节点卡片内嵌模型限制配置 (Frontend UI & i18n)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/components/ConfigModal.tsx`

**Interfaces:**
- Consumes: `/api/admin/status` 中各 `upstreamServers[i].allowedModels`
- Produces: 
  - 节点卡片内部的模型白名单标签编辑器、状态指示、快捷添加与删除
  - 保存时向 `PUT /api/admin/config` 发送带 `allowedModels` 的 `upstreamServers` 数组

- [ ] **Step 1: 更新多语言词条**

编辑 `frontend/src/i18n/locales/zh.ts` 和 `en.ts`：
- 清理废弃的全局 `allowedModels*` 词条；
- 新增节点��词条：
  - `serverAllowedModelsTitle`: "允许通行的模型限制（可选）" / "Allowed Models Restriction (Optional)"
  - `serverAllowedModelsDesc`: "限制该代理节点仅处理特定的模型请求。留空表示默认允许全部模型。" / "Restrict this gateway node to specific models only. Leave blank to allow all models by default."
  - `serverAllModelsAllowed`: "允许全部模型 (默认)" / "All Models Allowed (Default)"
  - `serverRestrictedModels`: "已限制 {{count}} 个模型" / "{{count}} Models Restricted"
  - `addModelPlaceholder`: "输入模型名，按回车添加..." / "Type model name & press Enter..."

- [ ] **Step 2: 在 ConfigModal.tsx 中重构 UI**

1. 彻底移除原先在 Tab 4（模型映射页）底部添加的全局白名单卡片，恢复原有整洁布局；
2. 在 Tab 2（上游代理服务器面板）的各服务器卡片内，添加模型限制标签编辑区：
   - 显示当前节点状态徽标（绿色 `允许全部模型 (默认)` 或琥珀色 `已限制 N 个模型`）；
   - 渲染已有模型标签（带 `✕` 删除按钮）；
   - 提供输入框（回车/逗号自动添加模型）；
   - 提供快捷添加推荐模型按钮（`+ gemini-2.5-flash`、`+ gemini-2.5-pro`、`+ claude-3-7-sonnet`）；
   - 保证在修改某节点的 `allowedModels` 时，实时更新 `upstreamServers` 状态；
3. 保存时直接通过 `PUT /api/admin/config` 提交 `upstreamServers` 数组。

- [ ] **Step 3: 运行前端生产编译验证**

运行: `npm run build:frontend`
Expected: 编译通过，无类型或语法错误。

- [ ] **Step 4: 运行前端相关测试**

运行: `npx jest tests/configModalMobile.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交 Task 5 代码**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): add in-card allowedModels tag editor for each upstream server in ConfigModal"
```

---

### Task 6: 端到端全链路与全量回归测试 (E2E Regression)

**Files:**
- Test: `tests/upstreamModelRoutingE2E.test.ts`
- Verify: 全量 150+ 测试套件

- [ ] **Step 1: 编写全链路真实网络请求路由与拦截集成测试**

在 `tests/upstreamModelRoutingE2E.test.ts` 中：
1. 本地启动两个 Mock HTTP 代理服务器：
   - Server 1 (19981): 允许全部模型；
   - Server 2 (19982): 仅允许 `gemini-2.5-flash`；
2. 发起 20 次 `gemini-2.5-flash` 请求：断言 Server 1 与 Server 2 均收到请求；
3. 发起 10 次 `gemini-2.5-pro` 请求：断言 10 次全部打到 Server 1，Server 2 接收量严格为 0；
4. 发起 `unknown-model` 请求：断言直接返回 403 阻断，Server 1 和 Server 2 均未收到请求。

- [ ] **Step 2: 运行端到端测试**

运行: `npx jest tests/upstreamModelRoutingE2E.test.ts`
Expected: PASS。

- [ ] **Step 3: 运行全量测试套件回归**

运行: `npm test`
Expected: 所有测试套件全量绿色通过（152+ suites passed, 0 failed）。

- [ ] **Step 4: 提交 Task 6 代码**

```bash
git add tests/upstreamModelRoutingE2E.test.ts
git commit -m "test(upstream): add end-to-end model-aware routing and interception integration test"
```

---

## Plan Self-Review Check

1. **Spec Coverage**:
   - 节点级模型配置与 Hash/JSON 解析 -> Task 2
   - 模型感知 SWRR 路由调度与可用性判定 -> Task 3
   - 全集群无可用节点时的双协议 403 拦截 -> Task 4
   - Web 控制台各节点卡片内嵌标签编辑器与旧全局功能清理 -> Task 1, Task 5
   - 端到端异构节点模型隔离分流测试 -> Task 6
2. **Placeholder Scan**: 扫描确认无任何 "TODO", "TBD", "implement later" 占位符。
3. **Type Consistency**: `allowedModels?: string[]` 在 `UpstreamServerConfig` 和各模块中命名与类型统一。
4. **Review Focus**: 涵盖异构模型流量隔离、全节点不支持 403 阻断、双向兼容放行比对、多节点持久化���热重载。

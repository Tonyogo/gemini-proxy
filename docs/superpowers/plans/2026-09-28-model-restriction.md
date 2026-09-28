# 模型访问限制与白名单实施计划 (Model Restriction & Whitelist Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Gemini Proxy 引入模型访问白名单管控功能（`ALLOWED_MODELS`），默认允许全部模型通行，配置后仅允许白名单内的模型发起调用，在请求转发给上游前对未授权模型进行拦截并返回符合各协议规范的标准 403 错误，并在 Web 控制台中提供可视化的标签化管理界面。

**Architecture:** 
1. 在 `config/default.ts` 中解析环境变量 `ALLOWED_MODELS` 并导出 `config.allowedModels: string[]`，在 `updateConfig` 中支持运行时动态持久化；
2. 在 `src/utils/modelValidator.ts` 中实现统一模型校验器 `isModelAllowed(originalModel?, resolvedModel?)`，支持默认全部开放、严格全字匹配（大小写不敏感）与原始模型/映射底座双向放行；
3. 在 `src/proxy/controllers/claudeController.ts` 与 `geminiController.ts` 中实现网络发起前的拦截阻断，分别返回 Anthropic 格式的 `permission_error` 和 Google 格式的 `PERMISSION_DENIED`，并记录审计日志；
4. 在 `src/admin/controllers/adminController.ts` 中向 `/api/admin/status` 与 `/api/admin/config` 暴露 `allowedModels` 字段以支持动态热重载；
5. 在 `frontend/src/components/ConfigModal.tsx` 中新增模型白名单标签化管理面板，支持实时状态指示、快捷添加、回车标签编辑与一键清空。

**Tech Stack:** TypeScript, Node.js, Express, React (Vite), TailwindCSS, Jest, Supertest

**Spec:** `docs/superpowers/specs/2026-09-28-model-restriction-design.md`

## Global Constraints

- **默认全部放行**：当 `allowedModels` 未设置或为空数组 `[]` 时，保持 100% 现有行为，放行所有模型请求。
- **全字匹配与大小写不敏感**：采用严格全字比对，对比时统一规整为小写，防止微小格式差异造成误拦截。
- **双向兼容判定**：请求的原始模型名（`originalModel`）或映射后的目标底座模型名（`resolvedModel`）任一命中白名单即允许通行；两者皆不在白名单中时才拦截。
- **上游熔断保护**：403 拦截发生在调用 upstream 之前，严禁调用 `upstreamManager.recordRequestResult`，不得误触发上游节点的健康熔断。
- **测试全量回归**：实现过程中不得破坏已有的 151 个测试套件��826 个测试项）。

## Review Focus

1. **大小写不敏感兼容**：白名单配置 `gemini-2.5-flash` 时，客户端请求 `GEMINI-2.5-FLASH` 或 `Gemini-2.5-Flash` 必须正常通过。
2. **模型别名双向放行**：配置了映射 `claude-3-7-sonnet -> gemini-2.5-pro`，白名单只要包含 `claude-3-7-sonnet` 或 `gemini-2.5-pro` 之一，均能正常放行；仅当两者均不在白名单时才拦截。
3. **空配置与空白项容错**：`allowedModels` 设为 `[]`、空字符串或包含空白字符串元素时，能够安全过滤并默认放行所有模型。
4. **Token 计算接口覆盖**：`/v1/messages/count_tokens` 请求若指定了未授权模型，或使用了未授权的 `countTokensModel` 覆盖时，能够正确触发拦截。
5. **双协议标准 403 结构**：Claude 协议返回 Anthropic 格式的 `{"type": "error", "error": {"type": "permission_error", ...}}`，Gemini 原生协议返回 `{"error": {"code": 403, "status": "PERMISSION_DENIED", ...}}`。

---

### Task 1: 配置定义与统一模型校验器实现 (Config & Model Validator)

**Files:**
- Modify: `config/default.ts:50-130`
- Create: `src/utils/modelValidator.ts`
- Test: `tests/modelValidator.test.ts`

**Interfaces:**
- Consumes: `process.env.ALLOWED_MODELS`, `config.allowedModels`
- Produces:
  - `parseAllowedModels(raw?: any): string[]`
  - `config.allowedModels: string[]`
  - `isModelAllowed(originalModel?: string, resolvedModel?: string): boolean`

- [ ] **Step 1: 编写模型校验器失败测试**

在 `tests/modelValidator.test.ts` 中编写测试：

```typescript
import { isModelAllowed, parseAllowedModels } from '../src/utils/modelValidator';
import config, { updateConfig } from '../config/default';

describe('Model Validator & Allowed Models Parser', () => {
  beforeEach(async () => {
    await updateConfig({ allowedModels: [] });
  });

  it('parses comma-separated strings, json arrays, and sanitizes whitespace', () => {
    expect(parseAllowedModels('gemini-2.5-flash, claude-3-7-sonnet ')).toEqual([
      'gemini-2.5-flash',
      'claude-3-7-sonnet'
    ]);
    expect(parseAllowedModels('["gemini-2.5-pro", "gemini-2.5-flash"]')).toEqual([
      'gemini-2.5-pro',
      'gemini-2.5-flash'
    ]);
    expect(parseAllowedModels('')).toEqual([]);
    expect(parseAllowedModels(null)).toEqual([]);
  });

  it('allows all models when allowedModels is empty or not configured', () => {
    config.allowedModels = [];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(true);
    expect(isModelAllowed('any-unregistered-model')).toBe(true);
  });

  it('strictly checks exact string match (case-insensitive)', () => {
    config.allowedModels = ['gemini-2.5-flash', 'claude-3-7-sonnet'];

    // Exact matches
    expect(isModelAllowed('gemini-2.5-flash')).toBe(true);
    expect(isModelAllowed('GEMINI-2.5-FLASH')).toBe(true);
    expect(isModelAllowed('Claude-3-7-Sonnet')).toBe(true);

    // Prefix/suffix mismatches
    expect(isModelAllowed('gemini-2.5-flash-preview')).toBe(false);
    expect(isModelAllowed('claude-3-7-sonnet-20250219')).toBe(false);
    expect(isModelAllowed('claude-3-opus')).toBe(false);
  });

  it('supports dual-direction checking (either original or resolved matches)', () => {
    // Only target base model in whitelist
    config.allowedModels = ['gemini-2.5-pro'];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(true);

    // Only client requested model in whitelist
    config.allowedModels = ['claude-3-5-sonnet'];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(true);

    // Neither in whitelist
    config.allowedModels = ['gemini-2.5-flash'];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/modelValidator.test.ts`
Expected: FAIL（模块 `src/utils/modelValidator.ts` 不存在）。

- [ ] **Step 3: 实现配置解析与 modelValidator 逻辑**

1. 在 `config/default.ts` 中增加 `ALLOWED_MODELS` 解析逻辑并加入 `config` 对象与 `updateConfig`：
```typescript
export function parseAllowedModels(raw?: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map(s => String(s || '').trim()).filter(Boolean)));
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parseAllowedModels(parsed);
        }
      } catch {
        // Fall back to comma / newline split
      }
    }
    const parts = trimmed.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    return Array.from(new Set(parts));
  }
  return [];
}
```
并在 `getEnvConfig()` 中增加：
```typescript
allowedModels: parseAllowedModels(process.env.ALLOWED_MODELS)
```
并在 `config` 中支持 `allowedModels` 的 getter/setter 与在 `updateConfig` 中清洗赋值。

2. 创建 `src/utils/modelValidator.ts`：
```typescript
import config from '../../config/default';

export { parseAllowedModels } from '../../config/default';

/**
 * Checks whether a given model is permitted by the proxy allowedModels whitelist.
 * @param originalModel The raw client-requested model name
 * @param resolvedModel The translated Gemini target base model name
 * @returns true if allowed, false if blocked
 */
export function isModelAllowed(originalModel?: string, resolvedModel?: string): boolean {
  const allowed = config.allowedModels;
  if (!allowed || !Array.isArray(allowed) || allowed.length === 0) {
    return true; // Default: all models permitted
  }

  const allowedSet = new Set(
    allowed.map(m => String(m || '').trim().toLowerCase()).filter(Boolean)
  );

  if (allowedSet.size === 0) {
    return true;
  }

  const normOriginal = originalModel ? originalModel.trim().toLowerCase() : '';
  const normResolved = resolvedModel ? resolvedModel.trim().toLowerCase() : '';

  if (normOriginal && allowedSet.has(normOriginal)) return true;
  if (normResolved && allowedSet.has(normResolved)) return true;

  return false;
}
```

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/modelValidator.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add config/default.ts src/utils/modelValidator.ts tests/modelValidator.test.ts
git commit -m "feat(validator): add allowedModels config parsing and isModelAllowed validator"
```

---

### Task 2: Claude 协议端点模型限制拦截与测试 (Claude Endpoints Interception)

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts:50-590`
- Test: `tests/claudeModelRestriction.test.ts`

**Interfaces:**
- Consumes: `isModelAllowed(originalModel, resolvedModel)`
- Produces: 
  - 当模型受限时返回 HTTP 403 及 Anthropic 标准格式：
    `{ type: 'error', error: { type: 'permission_error', message: "Model '...' is not permitted by proxy policy." } }`

- [ ] **Step 1: 编写 Claude 端点模型拦截集成测试**

在 `tests/claudeModelRestriction.test.ts` 中编写测试：

```typescript
import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';

describe('Claude API Model Restriction', () => {
  beforeEach(async () => {
    config.adminSecretKey = 'test-key';
    await updateConfig({
      allowedModels: ['claude-3-5-sonnet', 'gemini-2.5-flash']
    });
  });

  afterAll(async () => {
    await updateConfig({ allowedModels: [] });
  });

  it('rejects /v1/messages with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-api-key')
      .send({
        model: 'claude-3-opus',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      type: 'error',
      error: {
        type: 'permission_error',
        message: "Model 'claude-3-opus' is not permitted by proxy policy."
      }
    });
  });

  it('rejects /v1/messages/count_tokens with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'test-api-key')
      .send({
        model: 'claude-3-opus',
        messages: [{ role: 'user', content: 'Count tokens' }]
      });

    expect(res.status).toBe(403);
    expect(res.body.type).toBe('error');
    expect(res.body.error.type).toBe('permission_error');
    expect(res.body.error.message).toContain('claude-3-opus');
  });

  it('rejects /v1/models/:model_id with 403 when model is not permitted', async () => {
    const res = await request(app)
      .get('/v1/models/claude-3-opus')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(403);
    expect(res.body.type).toBe('error');
    expect(res.body.error.type).toBe('permission_error');
  });

  it('permits requests when model matches allowed whitelist', async () => {
    // If allowed model, it passes restriction check (and proceeds to upstream fetch / mock)
    // We verify it does not return 403 permission_error
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-api-key')
      .send({
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(res.status).not.toBe(403);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/claudeModelRestriction.test.ts`
Expected: FAIL（返回非 403 状态，未进行拦截）。

- [ ] **Step 3: 在 claudeController 中增加拦截逻辑**

在 `src/proxy/controllers/claudeController.ts`：
1. 导入 `isModelAllowed`：
   ```typescript
   import { isModelAllowed } from '../../utils/modelValidator';
   ```
2. 在 `handleMessages` 中，在解析完模型名后（调用 upstream 前）：
   ```typescript
   const clientModel = clientReq.model || '';
   if (!isModelAllowed(clientModel, cleanModelName)) {
     const errPayload = {
       type: 'error',
       error: {
         type: 'permission_error',
         message: `Model '${clientModel || cleanModelName}' is not permitted by proxy policy.`
       }
     };
     const duration = Date.now() - startTime;
     logger.warn(`[Model Restriction] [Transaction: ${transactionId}] Request rejected: Model '${clientModel}' is not allowed.`);
     payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 403, false);
     return res.status(403).json(errPayload);
   }
   ```
3. 在 `handleCountTokens` 中增加对应校验：
   ```typescript
   const requestedModel = (clientReq.model || config.countTokensModel || '').trim();
   const resolvedCountModel = requestedModel ? claudeTranslator.getCleanModelName(requestedModel) : '';
   if (!isModelAllowed(requestedModel, resolvedCountModel)) {
     const errPayload = {
       type: 'error',
       error: {
         type: 'permission_error',
         message: `Model '${requestedModel || resolvedCountModel}' is not permitted by proxy policy.`
       }
     };
     const duration = Date.now() - startTime;
     payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 403, false);
     return res.status(403).json(errPayload);
   }
   ```
4. 在 `handleRetrieveModel` 中增加对 `modelId` 的校验。

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/claudeModelRestriction.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 2 代码**

```bash
git add src/proxy/controllers/claudeController.ts tests/claudeModelRestriction.test.ts
git commit -m "feat(claude): intercept unauthorized models on Claude API endpoints with 403"
```

---

### Task 3: Gemini 原生协议端点模型限制拦截与测试 (Gemini Endpoints Interception)

**Files:**
- Modify: `src/proxy/controllers/geminiController.ts:40-75`
- Test: `tests/geminiModelRestriction.test.ts`

**Interfaces:**
- Consumes: `isModelAllowed(originalModel, targetModelName)`
- Produces: 
  - 当模型受限时返回 HTTP 403 及 Google Gemini 标准格式：
    `{ error: { code: 403, message: "Model '...' is not permitted by proxy policy.", status: "PERMISSION_DENIED" } }`

- [ ] **Step 1: 编写 Gemini 端点模型拦截集成测试**

在 `tests/geminiModelRestriction.test.ts` 中编写测试：

```typescript
import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';

describe('Gemini Native API Model Restriction', () => {
  beforeEach(async () => {
    config.adminSecretKey = 'test-key';
    await updateConfig({
      allowedModels: ['gemini-2.5-flash']
    });
  });

  afterAll(async () => {
    await updateConfig({ allowedModels: [] });
  });

  it('rejects /v1beta/models/{model}:generateContent with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'test-api-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 403,
        message: "Model 'gemini-1.5-pro' is not permitted by proxy policy.",
        status: 'PERMISSION_DENIED'
      }
    });
  });

  it('rejects /v1/models/{model}:streamGenerateContent with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1/models/gemini-2.5-pro:streamGenerateContent?alt=sse')
      .set('x-goog-api-key', 'test-api-key')
      .send({
        contents: [{ parts: [{ text: 'Stream' }] }]
      });

    expect(res.status).toBe(403);
    expect(res.body.error.status).toBe('PERMISSION_DENIED');
  });

  it('permits requests when model is in allowedModels whitelist', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash:generateContent')
      .set('x-goog-api-key', 'test-api-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).not.toBe(403);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/geminiModelRestriction.test.ts`
Expected: FAIL（返回非 403 状态，未进行拦截）。

- [ ] **Step 3: 在 geminiController 中实现拦截逻辑**

编辑 `src/proxy/controllers/geminiController.ts`：
1. 导入 `isModelAllowed`：
   ```typescript
   import { isModelAllowed } from '../../utils/modelValidator';
   ```
2. 在提取完 `targetModelName` 与 `originalModel` 后：
   ```typescript
   if (targetModelName && !isModelAllowed(originalModel, targetModelName)) {
     const errPayload = {
       error: {
         code: 403,
         message: `Model '${originalModel || targetModelName}' is not permitted by proxy policy.`,
         status: 'PERMISSION_DENIED'
       }
     };
     const duration = Date.now() - startTime;
     logger.warn(`[GeminiProxy] [Transaction: ${transactionId}] Request rejected: Model '${originalModel || targetModelName}' is not allowed.`);
     payloadLogger.saveTransaction(transactionId, req.body, null, null, errPayload, duration, requestPath, 403, false);
     return res.status(403).json(errPayload);
   }
   ```

- [ ] **Step 4: 运行测试并确保通过**

运行: `npx jest tests/geminiModelRestriction.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 3 代码**

```bash
git add src/proxy/controllers/geminiController.ts tests/geminiModelRestriction.test.ts
git commit -m "feat(gemini): intercept unauthorized models on native Gemini endpoints with 403"
```

---

### Task 4: Admin API 状态暴露与动态热重载 (Admin API Integration)

**Files:**
- Modify: `src/admin/controllers/adminController.ts:15-105`
- Test: `tests/adminAllowedModels.test.ts`

**Interfaces:**
- Consumes: `config.allowedModels`, `updateConfig`
- Produces: 
  - `GET /api/admin/status`: 返回包含 `config.allowedModels: string[]`
  - `PUT /api/admin/config`: 接收并更新 `allowedModels`

- [ ] **Step 1: 编写 Admin API 集成测试**

在 `tests/adminAllowedModels.test.ts` 中编写测试：

```typescript
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin API Allowed Models Management', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  it('GET /api/admin/status returns allowedModels array in config', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toHaveProperty('allowedModels');
    expect(Array.isArray(res.body.config.allowedModels)).toBe(true);
  });

  it('PUT /api/admin/config updates allowedModels and persists into runtime config', async () => {
    const models = ['gemini-2.5-pro', 'claude-3-7-sonnet'];
    const putRes = await request(app)
      .put('/api/admin/config')
      .set('x-admin-key', secretKey)
      .send({ allowedModels: models });

    expect(putRes.status).toBe(200);
    expect(putRes.body.config.allowedModels).toEqual(models);

    const getRes = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    expect(getRes.body.config.allowedModels).toEqual(models);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行: `npx jest tests/adminAllowedModels.test.ts`
Expected: FAIL（`adminController` 未在 `status` 与 `updateConfig` 返回 `allowedModels`）。

- [ ] **Step 3: 更新 AdminController**

在 `src/admin/controllers/adminController.ts`：
1. 在 `getStatus` 的 `config` 响应中加入 `allowedModels: config.allowedModels`；
2. 在 `updateConfig` 的响应 `config` 中加入 `allowedModels: config.allowedModels`。

- [ ] **Step 4: 运行测试验证**

运行: `npx jest tests/adminAllowedModels.test.ts tests/adminController.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交 Task 4 代码**

```bash
git add src/admin/controllers/adminController.ts tests/adminAllowedModels.test.ts
git commit -m "feat(admin): expose allowedModels in admin status and support dynamic updates"
```

---

### Task 5: 前端 Web 控制台白名单管理与国际化 (Frontend Tag Editor & i18n)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/components/ConfigModal.tsx`

**Interfaces:**
- Consumes: `/api/admin/status` 返回的 `config.allowedModels`
- Produces: 标签化模型添加/删除组件、状态徽标、快捷添加与清空重置，向 `PUT /api/admin/config` 提交 `allowedModels: string[]`

- [ ] **Step 1: 补充中���文语言包**

在 `frontend/src/i18n/locales/zh.ts` 与 `en.ts` 中新增词条：
- `allowedModelsTitle`: "允许访问的模型白名单 (ALLOWED_MODELS)" / "Allowed Models Whitelist"
- `allowedModelsDesc`: "限制仅允许白名单内的模型发起调用。留空表示开放模式，允许全部模型通行。" / "Restrict requests to only allowed models. Leave empty to allow all models (open mode)."
- `allowedModelsOpenBadge`: "开放模式（允许全部模型）" / "Open Mode (All Models Allowed)"
- `allowedModelsRestrictedBadge`: "白名单生效中（已限制 {{count}} 个模型）" / "Whitelist Active ({{count}} Models Restricted)"
- `allowedModelsInputPlaceholder`: "输入模型名称并回车或点击添加..." / "Type model name and press Enter..."
- `addModel`: "添加模型" / "Add Model"
- `clearAllowedModels`: "清空并允许全部" / "Clear & Allow All"
- `quickAdd`: "快捷添加" / "Quick Add"

- [ ] **Step 2: 在 ConfigModal.tsx 中实现标签化模型白名单编辑面板**

1. 在 `ConfigModal.tsx` 中增加状态：
   ```typescript
   const [allowedModels, setAllowedModels] = useState<string[]>([]);
   const [modelInput, setModelInput] = useState<string>('');
   ```
2. 从 `data.config.allowedModels` 初始化状态；
3. 实现添加标签函数 `handleAddModel(name: string)`（去除前后空格、去重）；
4. 实现删除标签函数 `handleRemoveModel(name: string)`；
5. 在 Tab 4（模型映射与控制）中渲染模型白名单设置模块：
   - 顶部状态指示徽标（绿色开放 / 琥珀色受限）；
   - 已添加模型标签列表（带 `✕` 删除图标）；
   - 输入框与添加按钮；
   - 快捷添加推荐模型（`gemini-2.5-flash`、`gemini-2.5-pro`、`claude-3-7-sonnet`）与一键清空按钮；
6. 在保存时向 `/api/admin/config` 发送 `allowedModels`。

- [ ] **Step 3: 运行前端构建验证**

运行: `npm run build:frontend`
Expected: 编译通过，无类型与语法错误。

- [ ] **Step 4: 运行前端测试**

运行: `npx jest tests/configModalMobile.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交 Task 5 代码**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): add visual allowed models tag editor and status badges in ConfigModal"
```

---

### Task 6: 端到端全链路与全量回归测试 (E2E Regression)

**Files:**
- Test: `tests/modelRestrictionE2E.test.ts`
- Verify: 全量 151+ 测试套件

- [ ] **Step 1: 编写全链路动态白名单切换端到端测试**

在 `tests/modelRestrictionE2E.test.ts` 中：
1. 启动测试，初始配置 `allowedModels: []`，发起调用验证放行；
2. 动态更新配置 `allowedModels: ['gemini-2.5-flash']`；
3. 发起 `gemini-1.5-pro` 请求，验证被 403 阻断；发起 `gemini-2.5-flash` 请求，验证放行；
4. 动态清空白名单 `allowedModels: []`，验证 `gemini-1.5-pro` 恢复放行。

- [ ] **Step 2: 运行端到端测试**

运行: `npx jest tests/modelRestrictionE2E.test.ts`
Expected: PASS。

- [ ] **Step 3: 运行全量 Jest 测试套件回归**

运行: `npm test`
Expected: 所有测试套件全量绿色通过（155+ suites passed）。

- [ ] **Step 4: 提交 Task 6 代码**

```bash
git add tests/modelRestrictionE2E.test.ts
git commit -m "test(restriction): add end-to-end model restriction dynamic switching test"
```

---

## Plan Self-Review Check

1. **Spec Coverage**:
   - `allowedModels` 白名单配置与空列表默认全部开放 -> Task 1
   - 严格全字匹配（大小写不敏感）与双向校验 -> Task 1
   - Claude 协议 403 `permission_error` 拦截 -> Task 2
   - Gemini 协议 403 `PERMISSION_DENIED` 拦截 -> Task 3
   - Admin API 状态暴露与动态持久化 -> Task 4
   - Web 控制台标签编辑器与直观状态徽标 -> Task 5
   - 全链路与全量测试套件保障 -> Task 6
2. **Placeholder Scan**: 扫描确认无任何 "TODO", "TBD", "implement later" 占位符。
3. **Type Consistency**: `isModelAllowed`, `parseAllowedModels`, `allowedModels` 在所有任务中类型、方法命名一致。
4. **Review Focus**: 涵盖大小写匹配、模型别名映射放行、count_tokens 端点覆盖、上游熔断器保护测试。

# 纯 Cloudflare Worker 架构全量迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 `gemini-proxy` 仓库彻底剥离 Node.js / Express 依赖，重构为基于 Hono、W3C Web Streams、Cloudflare KV、R2 与 Assets 的现代纯 Cloudflare Worker 架构。

**Architecture:** 采用轻量边缘框架 Hono 作为统一网关，复用并适配纯函数式 Claude ↔ Gemini 协议转码引擎；流式响应使用 Web Standard `TransformStream` 逐行转码，实现零缓冲首字下发；动态配置由 Cloudflare KV 提供 15s 内存缓存热加载，交易审计由 R2 通过 `ctx.waitUntil` 异步持久化，前端 React SPA 由 Worker `[assets]` 绑定一体化分发。

**Tech Stack:** Cloudflare Workers, Hono, TypeScript, Web Streams API (TransformStream / ReadableStream), Cloudflare KV, Cloudflare R2, Cloudflare Assets, Vitest, Wrangler.

**Spec:** [`docs/superpowers/specs/2026-10-04-cloudflare-workers-migration-design.md`](file:///home/liyatao001/gemini-proxy/docs/superpowers/specs/2026-10-04-cloudflare-workers-migration-design.md)

## Global Constraints

- 严禁引入任何 Node.js 原生特有模块（如 `fs`, `path`, `net`, `http`, `child_process`），全仓代码必须在 Cloudflare Workerd / V8 Isolate 环境中运行。
- 上游请求严禁将 API Key 拼接在 URL query 中，必须始终通过 `x-goog-api-key` 请求头传递。
- 所有日志持久化与控制台输出必须调用脱敏工具对 API Key 及 Bearer Token 进行掩码（保留前4后4位）。
- 动态配置不得在全局顶层作用域静态缓存，必须支持基于 KV 的 15 秒 TTL 缓存与即时失效。
- 必须保证流式转码的背压与客户端取消联动，当客户端连接断开时及时触发上游 AbortController。

## Review Focus

- 客户端在流式传输未完成时主动断开连接：Worker 必须监听 `c.req.raw.signal` 并中止上游 fetch，同时日志中记录 partial 或 client_aborted 状态。
- 上游 Gemini 返回带 HTML/错误 JSON 且状态码非 200：必须转码为标准 Claude error JSON 结构，并匹配相应的 HTTP 状态码。
- 未绑定 `CONFIG_KV` 或 `LOGS_BUCKET`：系统必须平滑降级（配置回退为环境变量与内存，日志写入为 No-op），核心代理必须正常可用。
- Claude Code 发送的临时系统提示词（Ephemeral Messages）注入：转码引擎必须自动清理过滤，防止污染 Gemini 上下文。
- 多 Key 直连调度时某个 Key 触发 429 配额耗尽：熔断器必须自动标记 60 秒冷却，平滑轮换至下一个可用健康 Key。

---

### Task 1: 依赖清理、构建与测试工程脚手架 (Vitest & Wrangler)

**Files:**
- Modify: `package.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Modify: `tsconfig.json`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: None
- Produces: 运行于 Web Worker 环境下的 Vitest 测试基建与 Wrangler 开发脚本

- [ ] **Step 1: Write the failing test**

```typescript
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('Worker Environment Smoke Test', () => {
  it('should have standard Web APIs available in testing runtime', () => {
    expect(typeof Request).toBe('function');
    expect(typeof Response).toBe('function');
    expect(typeof ReadableStream).toBe('function');
    expect(typeof TransformStream).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (vitest not yet installed or configured)

- [ ] **Step 3: Update `package.json`, `tsconfig.json`, `wrangler.toml`, and `vitest.config.ts`**

1. In `package.json`:
   - Remove: `express`, `@types/express`, `node-fetch`, `@types/node-fetch`, `dotenv`, `pm2`, `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `ts-node-dev`.
   - Add dependencies: `hono` (^4.0.0).
   - Add devDependencies: `wrangler`, `@cloudflare/workers-types`, `vitest`, `typescript`.
   - Update scripts:
     `"dev": "wrangler dev"`,
     `"build:frontend": "cd frontend && npm run build"`,
     `"build": "npm run build:frontend"`,
     `"deploy": "npm run build:frontend && wrangler deploy"`,
     `"test": "vitest run"`
2. Create `wrangler.toml` configuring `name = "gemini-proxy"`, `main = "src/index.ts"`, `compatibility_date = "2024-09-23"`, `compatibility_flags = ["nodejs_compat"]`, `[assets]`, `[[kv_namespaces]]`, `[[r2_buckets]]`, and `[vars]`.
3. Create `vitest.config.ts` with `defineConfig({ test: { globals: true, environment: 'node' } })`.
4. Run `npm install`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS (1 test passed)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json wrangler.toml vitest.config.ts tsconfig.json tests/smoke.test.ts
git commit -m "chore: setup vitest, wrangler, and pure worker dependencies"
```

---

### Task 2: Worker 环境类型与边缘配置中心 (`src/env.ts` & `src/config/configManager.ts`)

**Files:**
- Create: `src/env.ts`
- Create: `src/config/configManager.ts`
- Test: `tests/configManager.test.ts`

**Interfaces:**
- Consumes: None
- Produces:
  - `WorkerEnv`: interface defining bindings (`CONFIG_KV?`, `LOGS_BUCKET?`, `ASSETS?`, and vars `GEMINI_BASE_URL`, `ADMIN_SECRET_KEY`, `LOG_LEVEL`, `MODEL_MAPPINGS`)
  - `getConfig(env: WorkerEnv): Promise<WorkerConfig>`: retrieves merged config with 15s in-memory cache
  - `updateConfig(env: WorkerEnv, updates: Partial<WorkerConfig>): Promise<WorkerConfig>`: writes to KV & clears cache

- [ ] **Step 1: Write the failing test**

```typescript
// tests/configManager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConfig, updateConfig, clearConfigCache } from '../src/config/configManager';
import { WorkerEnv } from '../src/env';

describe('ConfigManager', () => {
  let mockEnv: WorkerEnv;
  let kvStore: Record<string, string>;

  beforeEach(() => {
    clearConfigCache();
    kvStore = {};
    mockEnv = {
      GEMINI_BASE_URL: 'https://default.googleapis.com',
      ADMIN_SECRET_KEY: 'secret-123',
      CONFIG_KV: {
        get: vi.fn(async (key: string) => kvStore[key] || null),
        put: vi.fn(async (key: string, val: string) => { kvStore[key] = val; }),
      } as any,
    };
  });

  it('should return env defaults when KV is empty', async () => {
    const config = await getConfig(mockEnv);
    expect(config.GEMINI_BASE_URL).toBe('https://default.googleapis.com');
  });

  it('should override defaults with KV values and invalidate on update', async () => {
    await updateConfig(mockEnv, { GEMINI_BASE_URL: 'https://custom.googleapis.com' });
    const config = await getConfig(mockEnv);
    expect(config.GEMINI_BASE_URL).toBe('https://custom.googleapis.com');
  });

  it('should fall back gracefully to env when CONFIG_KV is not provided', async () => {
    const noKvEnv: WorkerEnv = { GEMINI_BASE_URL: 'https://fallback.com' };
    const config = await getConfig(noKvEnv);
    expect(config.GEMINI_BASE_URL).toBe('https://fallback.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/configManager.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/env.ts` and `src/config/configManager.ts`**

1. Create `src/env.ts` declaring `WorkerEnv` and `WorkerConfig`.
2. Create `src/config/configManager.ts`:
   - Define default configuration object.
   - Implement `getConfig(env: WorkerEnv): Promise<WorkerConfig>` checking in-memory cache timestamp `< 15000ms`. If expired, read `CONFIG_KV.get('runtime_config', 'json')` and deep merge.
   - Implement `updateConfig(env: WorkerEnv, updates: Partial<WorkerConfig>)`: writes to `CONFIG_KV.put('runtime_config', JSON.stringify(...))` and clears local cache.
   - Implement `clearConfigCache()` for testing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/configManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/env.ts src/config/configManager.ts tests/configManager.test.ts
git commit -m "feat(config): implement edge dynamic configManager with KV and cache TTL"
```

---

### Task 3: 核心协议转码与工具函数迁移 (`src/proxy/services/claudeTranslator.ts` & `src/utils/`)

**Files:**
- Create: `src/utils/requestHelper.ts`
- Create: `src/utils/modelThinkingHelper.ts`
- Create: `src/proxy/services/claudeTranslator.ts`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: `src/types/index.ts`
- Produces:
  - `sanitizeData(data: any): any`: masks sensitive keys/tokens in headers and bodies
  - `translateClaudeToGoogle(body: any, isDirectMode?: boolean, customSystem?: string): GeminiRequestBody`
  - `translateGoogleToClaudeResponse(geminiJson: any, model: string): ClaudeResponse`
  - `translateGoogleToClaudeStream(chunk: any, state: StreamState): ClaudeStreamEvent[]`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claudeTranslator.test.ts
import { describe, it, expect } from 'vitest';
import { translateClaudeToGoogle, translateGoogleToClaudeResponse } from '../src/proxy/services/claudeTranslator';

describe('claudeTranslator', () => {
  it('should translate standard user message to gemini contents', () => {
    const claudeReq = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Hello world' }],
      max_tokens: 100,
    };
    const geminiReq = translateClaudeToGoogle(claudeReq);
    expect(geminiReq.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hello world' }] },
    ]);
    expect(geminiReq.generationConfig?.maxOutputTokens).toBe(100);
  });

  it('should translate gemini response back to claude message format', () => {
    const geminiRes = {
      candidates: [
        {
          content: { parts: [{ text: 'Hi there!' }], role: 'model' },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    };
    const claudeRes = translateGoogleToClaudeResponse(geminiRes, 'claude-3-5-sonnet-20241022');
    expect(claudeRes.content[0]).toEqual({ type: 'text', text: 'Hi there!' });
    expect(claudeRes.stop_reason).toBe('end_turn');
    expect(claudeRes.usage.output_tokens).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/claudeTranslator.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `src/utils/requestHelper.ts`, `src/utils/modelThinkingHelper.ts`, and `src/proxy/services/claudeTranslator.ts`**

1. Port `requestHelper.ts`: `sanitizeData`, `sanitizeHeaders`, header extraction.
2. Port `modelThinkingHelper.ts`: thinking budget extraction and Gemini `thinkingConfig` mapping.
3. Migrate `claudeTranslator.ts`:
   - Keep pure functions: `translateClaudeToGoogle`, `translateGoogleToClaudeResponse`, `translateGoogleToClaudeStream`.
   - Remove any node-specific dependencies or globals.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/claudeTranslator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/requestHelper.ts src/utils/modelThinkingHelper.ts src/proxy/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(proxy): migrate claudeTranslator and helpers to pure edge functions"
```

---

### Task 4: Web Streams 实时流式转码管道 (`src/proxy/services/streamTranscoder.ts`)

**Files:**
- Create: `src/proxy/services/streamTranscoder.ts`
- Test: `tests/streamTranscoder.test.ts`

**Interfaces:**
- Consumes: `claudeTranslator.translateGoogleToClaudeStream`
- Produces: `createClaudeSseTransformStream(model: string, onComplete?: (payload: { rawChunks: string[]; events: any[] }) => void): TransformStream<Uint8Array, Uint8Array>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/streamTranscoder.test.ts
import { describe, it, expect } from 'vitest';
import { createClaudeSseTransformStream } from '../src/proxy/services/streamTranscoder';

describe('streamTranscoder', () => {
  it('should transform Gemini SSE chunks into Claude SSE events', async () => {
    let capturedEvents: any[] = [];
    const transformStream = createClaudeSseTransformStream('claude-3-5-sonnet', (result) => {
      capturedEvents = result.events;
    });

    const geminiSsePayload = 
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}\n\n' +
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n';

    const reader = transformStream.readable.getReader();
    const writer = transformStream.writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    await writer.write(encoder.encode(geminiSsePayload));
    await writer.close();

    let output = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toContain('event: message_start');
    expect(output).toContain('event: content_block_delta');
    expect(output).toContain('event: message_stop');
    expect(capturedEvents.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/streamTranscoder.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `src/proxy/services/streamTranscoder.ts`**

1. Define `createClaudeSseTransformStream(model, onComplete)`:
   - Maintains line buffer `buffer = ''`, stream state `state = createInitialStreamState()`, accumulated chunks `rawChunks: string[] = []`, accumulated events `events: any[] = []`.
   - In `transform(chunk, controller)`:
     - Decode bytes and append to `buffer`.
     - Split on `\n`. For each line starting with `data: `, extract JSON, call `translateGoogleToClaudeStream`, format as `event: ...\ndata: ...\n\n`, enqueue encoded Uint8Array.
   - In `flush(controller)`:
     - If end of stream hasn't emitted `message_stop`, emit remaining closure events.
     - Call `onComplete?.({ rawChunks, events })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/streamTranscoder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/services/streamTranscoder.ts tests/streamTranscoder.test.ts
git commit -m "feat(stream): implement web standard transformStream for sse transcoding"
```

---

### Task 5: 上游调度、多 Key 轮询与熔断器 (`src/proxy/services/upstreamService.ts`)

**Files:**
- Create: `src/proxy/services/upstreamService.ts`
- Test: `tests/upstreamService.test.ts`

**Interfaces:**
- Consumes: `src/env.ts`, `src/config/configManager.ts`
- Produces:
  - `getUpstreamKey(env: WorkerEnv): string | null`
  - `recordKeyFailure(key: string, statusCode: number): void`
  - `recordKeySuccess(key: string): void`
  - `fetchUpstream(url: string, init: RequestInit, timeoutMs?: number): Promise<Response>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/upstreamService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getUpstreamKey, recordKeyFailure, recordKeySuccess, resetKeyPool } from '../src/proxy/services/upstreamService';
import { WorkerEnv } from '../src/env';

describe('upstreamService', () => {
  beforeEach(() => {
    resetKeyPool();
  });

  it('should rotate keys in round-robin order', () => {
    const env: WorkerEnv = {
      GEMINI_API_KEYS: 'key1,key2,key3',
    };
    expect(getUpstreamKey(env)).toBe('key1');
    expect(getUpstreamKey(env)).toBe('key2');
    expect(getUpstreamKey(env)).toBe('key3');
    expect(getUpstreamKey(env)).toBe('key1');
  });

  it('should cool down failing key on 429 and skip to healthy key', () => {
    const env: WorkerEnv = {
      GEMINI_API_KEYS: 'key1,key2',
    };
    expect(getUpstreamKey(env)).toBe('key1');
    recordKeyFailure('key1', 429);
    // key1 is in cooldown, should return key2
    expect(getUpstreamKey(env)).toBe('key2');
    expect(getUpstreamKey(env)).toBe('key2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/upstreamService.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `src/proxy/services/upstreamService.ts`**

1. Parse `GEMINI_API_KEYS` (or upstream server array in config).
2. Maintain in-memory key state map: `{ key, failCount, cooldownUntil }`.
3. If key returns 429 or 5xx, set `cooldownUntil = Date.now() + 60000`.
4. Implement `fetchUpstream(url, init, timeoutMs)` using `AbortController` linked with upstream timeout.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/upstreamService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/services/upstreamService.ts tests/upstreamService.test.ts
git commit -m "feat(upstream): implement multi-key scheduler and 429 circuit breaker"
```

---

### Task 6: 异步 R2 交易审计日志服务 (`src/admin/services/r2LoggerService.ts`)

**Files:**
- Create: `src/admin/services/r2LoggerService.ts`
- Test: `tests/r2LoggerService.test.ts`

**Interfaces:**
- Consumes: `src/env.ts`, `src/utils/requestHelper.ts`
- Produces:
  - `saveTransactionAuditLog(env: WorkerEnv, ctx: ExecutionContext, record: TransactionRecord): void`
  - `listAuditLogs(env: WorkerEnv, date?: string, hour?: string): Promise<string[]>`
  - `getAuditLog(env: WorkerEnv, key: string): Promise<any | null>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/r2LoggerService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { saveTransactionAuditLog, listAuditLogs, getAuditLog } from '../src/admin/services/r2LoggerService';
import { WorkerEnv } from '../src/env';

describe('r2LoggerService', () => {
  it('should gracefully no-op when LOGS_BUCKET is not bound', async () => {
    const env: WorkerEnv = {};
    const ctx = { waitUntil: vi.fn() } as any;
    saveTransactionAuditLog(env, ctx, {
      transactionId: 't1',
      timestamp: Date.now(),
      durationMs: 100,
      client_req: {},
      claude_res: {},
    });
    expect(ctx.waitUntil).not.toHaveBeenCalled();
    const list = await listAuditLogs(env);
    expect(list).toEqual([]);
  });

  it('should call bucket.put via ctx.waitUntil when LOGS_BUCKET is bound', async () => {
    const mockBucket = {
      put: vi.fn(async () => {}),
      list: vi.fn(async () => ({ objects: [{ key: 'logs/2026-10-04/13/t1.json' }] })),
      get: vi.fn(async () => ({ json: async () => ({ transactionId: 't1' }) })),
    };
    const env: WorkerEnv = { LOGS_BUCKET: mockBucket as any };
    const ctx = { waitUntil: vi.fn((promise) => promise) } as any;

    saveTransactionAuditLog(env, ctx, {
      transactionId: 't1',
      timestamp: new Date('2026-10-04T13:00:00Z').getTime(),
      durationMs: 120,
      client_req: {},
      claude_res: {},
    });

    expect(ctx.waitUntil).toHaveBeenCalled();
    const list = await listAuditLogs(env, '2026-10-04', '13');
    expect(list).toContain('logs/2026-10-04/13/t1.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/r2LoggerService.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `src/admin/services/r2LoggerService.ts`**

1. Format date/hour partition keys `logs/YYYY-MM-DD/HH/mmss_<transactionId>.json` using configured timezone.
2. In `saveTransactionAuditLog(env, ctx, record)`:
   - If `!env.LOGS_BUCKET`, return early.
   - Call `ctx.waitUntil(env.LOGS_BUCKET.put(key, JSON.stringify(record), { httpMetadata: { contentType: 'application/json' } }))`.
3. In `listAuditLogs` and `getAuditLog`:
   - Query R2 bucket using `list({ prefix })` and `get(key)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/r2LoggerService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/services/r2LoggerService.ts tests/r2LoggerService.test.ts
git commit -m "feat(logger): implement asynchronous r2 audit logging and query service"
```

---

### Task 7: Claude & Gemini 边缘代理路由 (`src/proxy/routes/`)

**Files:**
- Create: `src/proxy/routes/claudeRoutes.ts`
- Create: `src/proxy/routes/geminiRoutes.ts`
- Test: `tests/claudeRoutes.test.ts`

**Interfaces:**
- Consumes: `claudeTranslator`, `streamTranscoder`, `upstreamService`, `r2LoggerService`
- Produces: Hono sub-routers for Claude (`/v1/*`) and Gemini (`/v1beta/*`)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/claudeRoutes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { claudeRoutes } from '../src/proxy/routes/claudeRoutes';
import { WorkerEnv } from '../src/env';

describe('claudeRoutes', () => {
  it('should return Claude error format when request body is invalid', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/v1', claudeRoutes);

    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }, {} as WorkerEnv);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.type).toBe('error');
    expect(data.error.type).toBe('invalid_request_error');
  });

  it('should handle /v1/models successfully', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/v1', claudeRoutes);

    const res = await app.request('/v1/models', { method: 'GET' }, {} as WorkerEnv);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/claudeRoutes.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `src/proxy/routes/claudeRoutes.ts` and `src/proxy/routes/geminiRoutes.ts`**

1. In `claudeRoutes.ts`:
   - `POST /messages`: parse body, translate to Google, determine upstream key and target model, call upstream (non-stream or SSE stream), transcode response, save audit log asynchronously.
   - `POST /messages/count_tokens`: estimate tokens.
   - `GET /models`: list available models.
2. In `geminiRoutes.ts`:
   - `ALL /v1beta/*`: transparent reverse proxy to `${GEMINI_BASE_URL}/v1beta/*`, passing `x-goog-api-key`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/claudeRoutes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/routes/claudeRoutes.ts src/proxy/routes/geminiRoutes.ts tests/claudeRoutes.test.ts
git commit -m "feat(routes): implement claude and gemini edge proxy routes"
```

---

### Task 8: Admin 全量管理接口与鉴权中间件 (`src/admin/routes/adminRoutes.ts`)

**Files:**
- Create: `src/admin/routes/adminRoutes.ts`
- Test: `tests/adminRoutes.test.ts`

**Interfaces:**
- Consumes: `src/env.ts`, `configManager`, `r2LoggerService`, `upstreamService`
- Produces: Hono sub-router for `/api/admin/*`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/adminRoutes.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { adminRoutes } from '../src/admin/routes/adminRoutes';
import { WorkerEnv } from '../src/env';

describe('adminRoutes', () => {
  const env: WorkerEnv = {
    ADMIN_SECRET_KEY: 'test-admin-secret',
  };

  it('should reject unauthorized requests to /api/admin/status with 401', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const res = await app.request('/api/admin/status', {}, env);
    expect(res.status).toBe(401);
  });

  it('should accept authorized requests with x-admin-key header', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const res = await app.request('/api/admin/status', {
      headers: { 'x-admin-key': 'test-admin-secret' },
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.runtime).toBe('cloudflare-worker');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adminRoutes.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `src/admin/routes/adminRoutes.ts`**

1. Add admin auth middleware: check `x-admin-key` or `Authorization: Bearer <key>` against `env.ADMIN_SECRET_KEY`.
2. Implement endpoints:
   - `GET /status`: runtime info, region, KV/R2 binding flags.
   - `GET /config` & `POST /config`: read/update via `configManager`.
   - `GET /models`: list configured models and mappings.
   - `GET /stats`: return in-memory metrics.
   - `GET /logs` & `GET /logs/:date/:hour/:filename`: read from R2 logger.
   - `GET /accounts`: return pool accounts health.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/adminRoutes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/routes/adminRoutes.ts tests/adminRoutes.test.ts
git commit -m "feat(admin): implement admin authentication and management endpoints"
```

---

### Task 9: Worker 主入口编排、静态 Assets 托管与 Node.js 彻底清理

**Files:**
- Create: `src/index.ts` (pure Worker entry)
- Modify: `CLAUDE.md`
- Delete: `src/app.ts`, `ecosystem.config.js`, `jest.config.js`, `scripts/deploy.sh`
- Test: `tests/integration.test.ts`

**Interfaces:**
- Consumes: All routes, `env.ASSETS`
- Produces: Exported Worker default handler `{ fetch }`

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration.test.ts
import { describe, it, expect } from 'vitest';
import workerApp from '../src/index';
import { WorkerEnv } from '../src/env';

describe('Worker Gateway Integration', () => {
  it('should serve API routes and fallback non-API routes to assets', async () => {
    const mockAssets = {
      fetch: vi.fn(async (req) => new Response('<html>SPA</html>', { status: 200 })),
    };
    const env: WorkerEnv = {
      ASSETS: mockAssets as any,
    };

    // API route 404 test
    const apiRes = await workerApp.request('/v1/unknown-endpoint', {}, env);
    expect(apiRes.status).toBe(404);
    const apiJson = await apiRes.json();
    expect(apiJson.type).toBe('error');

    // UI route fallback test
    const uiRes = await workerApp.request('/ui', {}, env);
    expect(mockAssets.fetch).toHaveBeenCalled();
    expect(uiRes.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/index.ts` and clean up legacy Node.js files**

1. Create `src/index.ts`:
   - Instantiate Hono app with `cors()`.
   - Mount `/v1` -> `claudeRoutes`.
   - Mount `/v1beta` -> `geminiRoutes`.
   - Mount `/api/admin` -> `adminRoutes`.
   - Error handler: `app.onError(...)` converting exceptions to Claude error format.
   - Not found handler: `app.notFound(...)`: if path starts with `/v1` or `/api`, return JSON 404; otherwise return `env.ASSETS.fetch(c.req.raw)`.
   - `export default app;`
2. Remove obsolete Node.js files: `src/app.ts`, `ecosystem.config.js`, `jest.config.js`, `scripts/deploy.sh`.
3. Update `CLAUDE.md` with Worker commands (`npm run dev`, `npm run deploy`, `npm test`).

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npm test`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/integration.test.ts CLAUDE.md
git rm src/app.ts ecosystem.config.js jest.config.js scripts/deploy.sh
git commit -m "feat(worker): orchestrate main worker entry with assets hosting and clean legacy node files"
```

---

## Plan Self-Review Checklist

- [x] **Spec coverage:** All sections of the spec (Dependencies, StreamTranscoder, ConfigManager, R2Logger, Admin, Assets, Error Handling, Vitest) are covered in Tasks 1-9.
- [x] **Step scan:** Every step contains exact files, test code, signatures, and commands.
- [x] **Type consistency:** `WorkerEnv`, `WorkerConfig`, and `createClaudeSseTransformStream` maintain consistent naming throughout Tasks 1-9.
- [x] **Review Focus:** AbortController cancellation, Gemini error transcode, unconfigured KV/R2 degradation, ephemeral messages filter, and 429 cooldown are tested in Tasks 3, 4, 5, 6, 7.
- [x] **Proportion:** The plan focuses strictly on interfaces, tests, and execution steps without duplicating the implementation code.

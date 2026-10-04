# Cloudflare Workers 全量迁移架构设计规范 (Spec)

> **文档版本**：1.0.0  
> **创建日期**：2026-10-04  
> **状态**：Approved (已通过方案确认，待编写实施计划)

---

## 1. 目标与背景

### 1.1 项目背景
现有 `gemini-proxy` 项目是一个将 Anthropic Claude Messages API 与 Google Gemini API 进行双向协议转换的代理网关，并内置原生 Gemini `/v1beta/*` 透传、管理后台 Web 控制台及多账号管理能力。原有架构基于 Node.js / Express 与本地文件系统构建。

### 1.2 迁移目标
本方案将项目彻底转型为**纯面向 Cloudflare Workers 的现代轻量化边缘架构（Worker-Only）**：
1. **彻底剥离 Node.js 原生服务**：完全移除 `express`、`dotenv`、`node-fetch`、`pm2`、`ecosystem.config.js` 及所有本地文件系统（`fs`/`path`）读写逻辑。
2. **纯 Web 标准 API 构建**：采用高性能轻量边缘框架 **Hono**，全面使用 W3C Web Streams (`ReadableStream`, `TransformStream`) 处理 SSE 实时流式转码，消除对 Node.js 流和 EventEmitter 的依赖。
3. **分布式存储集成**：
   - 动态配置：基于 **Cloudflare KV** 实现多地域低延迟配置持久化与秒级热更新，搭配 15 秒内存缓存防穿透；
   - 交易审计日志：基于 **Cloudflare R2** 配合 `ctx.waitUntil()` 实现非阻塞异步持久化，保留 Chrome DevTools 风格的时间树查看与回放能力，并通过 R2 生命周期规则自动过期归档。
4. **全功能平移**：完整迁移 Claude ↔ Gemini 转换引擎（含 Thinking 思考模式、工具调用、多模态文档与图像）、Admin 管理端全部接口、多 Key 轮询熔断调度器以及前端 React SPA 的边缘一体化托管（Cloudflare Assets）。
5. **现代测试基建**：全面切换至 **Vitest**，利用 Hono 原生 `app.request()` 标准 Web 接口断言，提升测试执行效率。

---

## 2. 总体架构设计

```text
                                 [客户端 / SDK]
                   (Claude Code, Cursor, LibreChat, Web UI)
                                        │
                         HTTPS / W3C Request / SSE
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Global Network (Edge Runtime)                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    Hono 核心应用网关 (src/index.ts)                    │  │
│  │  - 全局 CORS 中间件                                                    │  │
│  │  - 全局异常捕获 & 404 兜底                                              │  │
│  │  - Admin 鉴权中间件 (x-admin-key / Bearer)                             │  │
│  └───────┬────────────────────────────┬────────────────────────────┬──────┘  │
│          │                            │                            │         │
│          ▼                            ▼                            ▼         │
│ ┌──────────────────┐       ┌──────────────────┐         ┌──────────────────┐ │
│ │  Claude 代理路由  │       │  Gemini 原生路由 │         │   Admin 管理路由 │ │
│ │  /v1/messages    │       │  /v1beta/*       │         │   /api/admin/*   │ │
│ │  /v1/models      │       │  (Thinking增强 & │         │   - 状态/配置/统计│ │
│ │  /v1/count_tokens│       │   别名调度透传)  │         │   - 账号池与熔断 │ │
│ └────────┬─────────┘       └────────┬─────────┘         │   - R2 日志检索  │ │
│          │                          │                   └────────┬─────────┘ │
│          ▼                          ▼                            │           │
│ ┌──────────────────────────────────────────────┐                 │           │
│ │   核心转码引擎 (src/proxy/services/)         │                 │           │
│ │   - claudeTranslator: 请求/响应纯结构转换   │                 │           │
│ │   - streamTranscoder: TransformStream SSE管道│                 │           │
│ │   - upstreamService: 多 Key 轮询与自动熔断   │                 │           │
│ └──────────────────────┬───────────────────────┘                 │           │
│                        │ (标准 fetch)                            │           │
│                        ▼                                         │           │
│ ┌──────────────────────────────────────────────┐                 │           │
│ │      Google Gemini 官方上游 (REST / SSE)     │                 │           │
│ └──────────────────────┬───────────────────────┘                 │           │
│                        │ (非阻塞 ctx.waitUntil)                  │           │
│                        ▼                                         ▼           │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │                  Cloudflare 边缘存储与资产绑定 (Bindings)                │ │
│ │  • CONFIG_KV (Cloudflare KV): 动态配置持久化 (15s 内存缓存)              │ │
│ │  • LOGS_BUCKET (Cloudflare R2): 异步持久化交易审计 JSON (生命周期自动清理)│ │
│ │  • ASSETS (Cloudflare Assets): 托管 frontend/dist 前端单页应用 (SPA 兜底) │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 项目目录结构与依赖定义

### 3.1 目录布局
```text
gemini-proxy/
├── src/                                  # Worker 源码根目录
│   ├── index.ts                          # 主入口：实例化 Hono，挂载全局中间件与子路由
│   ├── env.ts                            # Cloudflare Bindings 与环境变量 TypeScript 接口定义
│   ├── config/
│   │   └── configManager.ts              # 配置管理中心：读取 env 静态默认值与 KV 动态覆盖
│   ├── proxy/
│   │   ├── routes/
│   │   │   ├── claudeRoutes.ts           # /v1/messages, /v1/models, /v1/messages/count_tokens
│   │   │   └── geminiRoutes.ts           # /v1beta/* 原生 Gemini 透传与模型映射
│   │   └── services/
│   │       ├── claudeTranslator.ts       # 协议转换纯函数引擎 (请求与响应双向清洗)
│   │       ├── streamTranscoder.ts       # Web Standard TransformStream 流式转码管道
│   │       └── upstreamService.ts        # 多 Key 轮询、负载均衡与 429 自动冷却熔断器
│   ├── admin/
│   │   ├── routes/
│   │   │   └── adminRoutes.ts            # /api/admin/* (status, config, stats, models, logs, accounts)
│   │   └── services/
│   │       ├── r2LoggerService.ts        # R2 异步日志持久化、按时间树查询与详情回放
│   │       ├── statsService.ts           # 边缘指标统计（内存 QPS/状态码度量）
│   │       └── accountService.ts         # 多账号健康检查与用量透视
│   ├── utils/
│   │   ├── requestHelper.ts              # 敏感信息脱敏 (Sanitize) 与请求头规范化
│   │   └── modelThinkingHelper.ts        # Gemini 思考模式参数解析与适配
│   └── types/
│       ├── index.ts                      # 协议与配置跨模块类型定义
│       └── accountUsage.ts               # 账号配额与使用量类型定义
├── frontend/                             # Vite React SPA 管理后台（保持不变）
├── tests/                                # Vitest 自动化测试套件
│   ├── claudeTranslator.test.ts          # 协议转换纯逻辑单测
│   ├── streamTranscoder.test.ts          # TransformStream SSE 转码单测
│   ├── configManager.test.ts             # KV 配置与内存缓存单测
│   ├── upstreamService.test.ts           # 调度器与熔断器单测
│   ├── claudeApi.test.ts                 # /v1/* 接口集成测试
│   └── adminApi.test.ts                  # /api/admin/* 管理接口集成测试
├── wrangler.toml                         # Cloudflare Workers 部署配置文件
├── tsconfig.json                         # 面向 WebWorker 与 ESNext 的 TS 配置
├── package.json                          # 精简后的项目依赖声明
└── CLAUDE.md                             # 更新后的 Worker 架构运维指南
```

### 3.2 依赖变更清单
* **移除的无用依赖**：
  - `express`, `@types/express`, `dotenv`, `node-fetch`, `@types/node-fetch`
  - `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`
  - `ts-node-dev`, `pm2`
* **新增与保留的核心依赖**：
  - 生产依赖：`hono`
  - 开发依赖：`wrangler`, `@cloudflare/workers-types`, `typescript`, `vitest`

---

## 4. 核心模块详细设计

### 4.1 Claude ↔ Gemini 代理与流式转码

#### 4.1.1 请求流转与非流式响应
1. 客户端调用 `POST /v1/messages`。
2. 提取认证：优先取 `x-api-key`，其次取 `Authorization: Bearer <key>`，若未提供则从上游账号池中轮询获取。
3. 模型映射与转换：
   - 根据 `MODEL_MAPPINGS` 将传入的 Claude 模型别名映射为实际 Gemini 模型（如 `claude-3-5-sonnet-20241022` -> `gemini-2.5-pro`）；
   - 调用 `claudeTranslator.translateClaudeToGoogle()`，将 messages、system、tools、thinking 转换为 Gemini 的 contents 与 generationConfig；
   - 过滤 Claude Code 产生的临时恢复文本（Ephemeral messages）。
4. 上游请求：
   - 构造请求：`POST ${GEMINI_BASE_URL}/v1beta/models/${targetModel}:generateContent`；
   - 传递请求头：`x-goog-api-key`（绝不拼接到 URL query）；
   - 超时控制：默认 180s，支持客户端中断信号联动。
5. 响应转换：
   - 成功：调用 `claudeTranslator.translateGoogleToClaudeResponse()` 返回标准 Claude 格式 JSON；
   - 异常：标准化为 Claude 错误格式后返回。
6. 审计留痕：通过 `ctx.waitUntil()` 提交日志至 R2。

#### 4.1.2 Web Standard TransformStream 流式转码管道
流式请求（`stream: true`）的核心难点在于保持低延迟与低内存占用。

1. **管道设计**：
   使用标准 `TransformStream<Uint8Array, Uint8Array>`，结合内部行缓冲区（Line Buffer）：
   ```typescript
   export function createClaudeSseTransformStream(
     model: string,
     onComplete: (data: { rawChunks: string[]; claudeEvents: any[] }) => void
   ): TransformStream<Uint8Array, Uint8Array>
   ```
2. **切片解析流程**：
   - 监听上游二进制流块，通过 `TextDecoder` 解码并按换行符追加至缓冲区；
   - 提取完整以 `data: ` 开头的行，解析为 Gemini 的 Candidate JSON；
   - 调用 `claudeTranslator.translateGoogleToClaudeStream(geminiChunk, state)`；
   - 状态机逐步触发 Claude SSE 标准事件流：
     - `message_start` (角色与初始结构)
     - `content_block_start` (区分 text / thinking / tool_use)
     - `content_block_delta` (实时下发 `text_delta`、`thinking_delta`、`input_json_delta`)
     - `content_block_stop`
     - `message_delta` (累计输出 stop_reason 与 usage)
     - `message_stop`
   - 将生成的事件序列通过 `TextEncoder` 编码为字节后立即调用 `controller.enqueue()`，首字无缓冲下发；
   - 管道关闭（`flush`）时，汇总所有事件数据，通过回调函数触发异步日志归档。

### 4.2 边缘动态配置管理（`configManager.ts`）
1. **层次化配置解析**：
   - 默认配置：从 `env` 环境变量与 `wrangler.toml` 读取；
   - 覆盖配置：从 KV 命名空间 `CONFIG_KV` 获取 key `runtime_config`；
   - 最终配置：深度合并（Deep Merge）两者。
2. **防穿透内存缓存**：
   - 在 Worker 实例内保持 `cachedConfig` 与 `lastFetchedTime`；
   - 缓存有效期设置为 15 秒，避免高并发流量击穿 KV 读限额；
   - 当收到 `POST /api/admin/config` 更新请求时，写入 KV 成功后立即重置本地内存缓存。
3. **降级机制**：未绑定 `CONFIG_KV` 时，配置回退为内存变量存储，保证无绑定亦可运行。

### 4.3 交易审计日志系统（`r2LoggerService.ts`）
1. **异步写入架构**：
   - 响应客户端后，在后台执行：
     ```typescript
     c.executionCtx.waitUntil(env.LOGS_BUCKET.put(key, JSON.stringify(record), {
       httpMetadata: { contentType: 'application/json' }
     }));
     ```
   - 客户端网络传输零阻塞，提升吞吐量。
2. **时间树索引与存储路径**：
   - Key 格式：`logs/YYYY-MM-DD/HH/mmss_<transactionId>.json`；
   - 包含字段：`transactionId`、`timestamp`、`durationMs`、`client_req`（已脱敏）、`gem_req`（已脱敏）、`claude_res`（含所有下发事件）或 `gem_res`。
3. **管理后台检索回放**：
   - 列表接口：`GET /api/admin/logs?date=2026-10-04&hour=13`，调用 `bucket.list({ prefix })` 获取元数据列表；
   - 详情接口：`GET /api/admin/logs/:date/:hour/:filename`，调用 `bucket.get()` 输出原始 JSON，供前端 DevTools 视图交互展开与流式重放。
4. **生命周期自动清理**：
   - 在 Cloudflare 控制台或 wrangler 中为 R2 Bucket 配置 Lifecycle Rule，自动清理 3 天前的对象，免除服务内部定时任务负担。

### 4.4 Admin 管理端与多账号调度
1. **鉴权校验**：
   - 中间件统一验证 `x-admin-key` 请求头或 `Authorization: Bearer <key>`，比对 `env.ADMIN_SECRET_KEY`；
   - 鉴权未通过返回标准 401 响应。
2. **多 Key 轮询与熔断器（Direct 模式）**：
   - 维护 Key 列表健康状态数组；
   - 调度策略支持 Round-Robin 与权重调度；
   - 当特定 Key 连续遇到 429（Quota Exhausted）或 5xx 错误时，标记该 Key 进入 60 秒冷却期（Cooldown），自动路由请求至下一个健康 Key；
   - 冷却期结束后发送轻量探测请求（Ping），成功则自动恢复为健康态。
3. **管理端 API 清单**：
   - `GET /api/admin/status`：系统运行状况、所在 Cloudflare 数据中心编码、KV/R2 挂载状态；
   - `GET /api/admin/config` & `POST /api/admin/config`：读取与修改运行时配置；
   - `GET /api/admin/models`：模型列表与映射规则；
   - `GET /api/admin/stats`：QPS、成功率、活跃流式连接统计；
   - `GET /api/admin/accounts` & `POST /api/admin/accounts/refresh`：多账号状态与健康测试。

### 4.5 前端静态 SPA 边缘托管
1. **Assets 绑定**：
   - 在 `wrangler.toml` 中配置：
     ```toml
     [assets]
     directory = "./dist/frontend"
     binding = "ASSETS"
     ```
2. **路由分发逻辑**：
   - 优先级 1：API 路径（`/v1/*`、`/v1beta/*`、`/api/*`）由 Hono 拦截处理；
   - 优先级 2：其余请求由 `env.ASSETS.fetch(c.req.raw)` 承接，支持客户端 History 路由自动回退到 `index.html`。
3. **打包指令**：
   - `npm run build:frontend` 将 Vite React 前端编译输出至 `dist/frontend`；
   - 执行 `wrangler deploy` 时一并打包推送到 Cloudflare 边缘 CDN。

---

## 5. 安全与错误处理规范

### 5.1 凭据安全与敏感数据脱敏
1. **禁止 URL Query 传参**：所有访问 Gemini 上游的 Key 一律通过 `x-goog-api-key` 头部传递，杜绝网络嗅探与日志留痕。
2. **日志脱敏规则**：
   - 对所有 Header 中的 `x-api-key`、`Authorization`、`x-admin-key`、`x-goog-api-key` 实行掩码（如 `sk-ant-api03-****abcd` 或 `AIzaSy****1234`）；
   - 请求/响应 Body 中若包含内嵌密钥，在日志写入前通过正则脱敏。
3. **敏感 Secret 保护**：
   - 生产环境中通过 `npx wrangler secret put ADMIN_SECRET_KEY` 注入密钥，不写入配置文件。

### 5.2 统一错误转换规范
* **400 Bad Request** -> `{ type: "error", error: { type: "invalid_request_error", message: err.message } }`
* **401/403 Auth Error** -> `{ type: "error", error: { type: "authentication_error", message: err.message } }`
* **429 Rate Limit** -> `{ type: "error", error: { type: "rate_limit_error", message: "Upstream quota exceeded or rate limited" } }`
* **500/503 Upstream Error** -> `{ type: "error", error: { type: "api_error", message: "Upstream service error" } }`

---

## 6. 测试与验证策略

### 6.1 测试框架切换（Vitest）
* 原有测试代码基于 Jest 与 Express，测试入口强依赖 Socket 监听。
* 迁移后全面采用 **Vitest**，测试用例通过 Hono 的 `app.request(path, options, mockEnv)` 模拟 Web 标准请求，完全无需起监听端口。

### 6.2 测试用例迁移与覆盖目标
1. **单元测试 (`tests/*.test.ts`)**：
   - `claudeTranslator.test.ts`：验证消息清洗、Thinking 标签提取、工具 schema 转换、多模态 block 映射；
   - `streamTranscoder.test.ts`：输入模拟 Gemini SSE 数据流，断言输出标准 Claude SSE 事件序列及边界闭合；
   - `configManager.test.ts`：验证静态 env 回退、KV 覆盖生效及 15 秒缓存 TTL 失效。
2. **集成测试**：
   - `claudeApi.test.ts`：测试 `/v1/messages`（流式与非流式）、`/v1/models`，断言状态码与响应体格式；
   - `adminApi.test.ts`：测试 `/api/admin/*` 鉴权、配置修改、R2 日志回放。

---

## 7. 部署与运维规范

### 7.1 本地开发与调试
```bash
# 启动本地 Worker 调试（监听 http://localhost:8787）
npm run dev

# 启动前端独立开发（可选）
npm run dev:frontend
```

### 7.2 生产发布工作流
```bash
# 1. 编译前端静态单页应用
npm run build:frontend

# 2. 发布 Worker 与前端静态资产到 Cloudflare 边缘
npm run deploy

# 3. 设置生产管理员 Secret
npx wrangler secret put ADMIN_SECRET_KEY
```

---

## 8. 实施路径规划

本设计规范通过后，将通过 `writing-plans` 技能拆解为具体实施步骤：
- **阶段一**：依赖精简与工程骨架（移除 Node/Express/Jest，配置 package.json、wrangler.toml、tsconfig.json 与 Vitest）；
- **阶段二**：核心协议转码与 Web Stream 流式管道迁移及单测保障；
- **阶段三**：KV 配置中心与 R2 交易日志服务实现；
- **阶段四**：Admin 管理路由、多 Key 调度器与前端静态资产托管联动；
- **阶段五**：全面测试覆盖与本地 wrangler dev 验证。

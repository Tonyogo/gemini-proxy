# Cloudflare Workers 全量迁移与双模架构实施方案

> **适用范围**：双模运行架构（Node.js / Express 原生模式 + Cloudflare Workers 边缘模式），支持 KV 动态配置、R2 交易日志持久化与查询、全量 Admin 管理接口、Claude/Gemini 双协议转码流式代理与前端静态资源托管。

---

## 1. 架构与目录设计

```
gemini-proxy/
├── src/                          # 原有 Node.js / Express 入口与实现（保持100%兼容）
│   ├── proxy/services/           # 核心协议转码服务（claudeTranslator 等）
│   └── ...
├── worker/                       # Cloudflare Workers 边缘入口与模块
│   ├── index.ts                  # Worker 主入口（Hono 应用定义与路由挂��）
│   ├── env.ts                    # Worker 环境变量与 Bindings 类型定义 (KV, R2)
│   ├── config/
│   │   └── workerConfig.ts       # 基于 KV 与环境变量的动态配置提供者
│   ├── services/
│   │   ├── workerLogger.ts       # 基于 R2 + ctx.waitUntil 的异步审计日志服务
│   │   ├── workerStream.ts       # Web Standard TransformStream 流式转码管道
│   │   └── workerUpstream.ts     # 边缘上游负载均衡与多账号调度器
│   └── routes/
│       ├── claudeRoutes.ts       # /v1/messages, /v1/models 等
│       ├── geminiRoutes.ts       # /v1beta/* 原生透传代理
│       └── adminRoutes.ts        # /api/admin/* (status, config, logs, accounts)
├── wrangler.toml                 # Cloudflare Workers 配置文件 (KV, R2, Assets)
├── tsconfig.worker.json          # Worker 专用 TypeScript 编译配置
└── package.json                  # 引入 hono, wrangler, @cloudflare/workers-types
```

---

## 2. 核心模块适配方案

### 2.1 Web 框架与流式管道（Hono + TransformStream）
- 使用极轻量的 **Hono** 框架（零冷启动开销，完全基于标准 Web API `Request` / `Response`）。
- **SSE 流式转换**：
  - 上游 Gemini 请求返回 `ReadableStream<Uint8Array>`。
  - 使用 `TransformStream` 逐行缓冲解析 SSE chunk。
  - 实时调用 `claudeTranslator.translateGoogleToClaudeStream()` 转化为 Claude 协议事件，实时发送给客户端。
  - 彻底摆脱 Node `res.write` 与 `events` 依赖。

### 2.2 动态配置中心（Cloudflare KV + 内存缓存）
- 静态配置：从 Worker `env` 读取默认环境变量（`GEMINI_BASE_URL`、`ADMIN_SECRET_KEY` 等）。
- 动态配置：绑定 `env.CONFIG_KV`，读取 `runtime_config` 键。
- 内存缓存：在 Worker isolate 实例中做 15~30s 缓存，避免每次请求频繁调用 KV API。
- 管理后台更新：`POST /api/admin/config` 时，直接写入 `CONFIG_KV.put('runtime_config', JSON.stringify(newConfig))`，实现全球边缘节点即时生效。

### 2.3 交易日志与审计回放（Cloudflare R2 + `ctx.waitUntil`）
- 异步非阻塞：客户端流式传输完成后，通过 `c.executionCtx.waitUntil(...)` 将完整的 Transaction JSON（含 `client_req`, `gem_req`, `claude_res` 等）写入 R2 Bucket：
  - Key 格式：`logs/YYYY-MM-DD/HH/mmss_<transactionId>.json`。
- 控制台日志回放：
  - `/api/admin/logs`：基于 R2 的 `bucket.list({ prefix: 'logs/...' })` 构建按小时层级树与分页列表。
  - `/api/admin/logs/:date/:hour/:filename`：直接 `bucket.get(key)` 返回 JSON 数据，与现有前端 DevTools 风格审计器完全兼容。
- 自动清理：利用 Cloudflare R2 自带的 **Lifecycle Rule（生命周期规则）** 自动过期删除 3~7 天前的对象，免除 Node.js 端的定时扫描。

### 2.4 全量 Admin 与多账号管理
- 挂载 `/api/admin/status`, `/api/admin/stats`, `/api/admin/models`, `/api/admin/config`。
- 挂载 `/api/admin/accounts/*`：
  - 直连 Direct 模式：动态解析 upstreamServers 中的 API Keys，并记录与展示配额用量。
  - Proxy 模式：透明转发至配置的上游网关。
- 鉴权：严格校验请求头 `x-admin-key` 或 `Authorization: Bearer <key>` 与 `env.ADMIN_SECRET_KEY`。

### 2.5 前端静态资源托管
- 在 `wrangler.toml` 中配置：
  ```toml
  [assets]
  directory = "./dist/frontend"
  binding = "ASSETS"
  ```
- 访问根路径 `/`、`/dashboard`、`/logs` 时由 Cloudflare 边缘 CDN 直接极速分发静态 React SPA，无缝访问 `/v1/*` 与 `/api/*`。

---

## 3. 分阶段实施任务清单

- [ ] **Task 1: 基础设施与依赖准备**
  - 安装 `hono`、`@cloudflare/workers-types`，并将 `wrangler` 作为 devDependency。
  - 创建 `wrangler.toml`（预设 KV、R2 与 Assets 绑定）。
  - 创建 `tsconfig.worker.json` 适配 ESM 与 WebWorker 类型库。

- [ ] **Task 2: Worker 配置中心与 R2 日志服务**
  - 编写 `worker/config/workerConfig.ts`：支持 `env` 环境变量与 `CONFIG_KV` 运行时热重载。
  - 编写 `worker/services/workerLogger.ts`：实现脱敏与异步写入 R2，提供 R2 列表与详情读取 API。

- [ ] **Task 3: Worker 代理流水线与流式转码**
  - 编写 `worker/services/workerStream.ts`：实现基于 Web 标准 `TransformStream` 的 Gemini SSE 到 Claude SSE 实时转换管道。
  - 编写 `worker/routes/claudeRoutes.ts`：接入 `claudeTranslator`，实现 `/v1/messages`（流式/非流式）、`/v1/models`、`/v1/messages/count_tokens`。
  - 编写 `worker/routes/geminiRoutes.ts`：实现 `/v1beta/*` 原生透传与 thinking 增强。

- [ ] **Task 4: Worker Admin 与全量管理接口**
  - 编写 `worker/routes/adminRoutes.ts`：实现鉴权中间件、系统状态、动态配置更新、R2 日志查询与统计、多账号管理转发。

- [ ] **Task 5: Worker 入口编排与前端静态资源联动**
  - 编写 `worker/index.ts` 整合所有路由。
  - 编写 npm scripts（`build:worker`、`dev:worker`、`deploy:worker`）。
  - 本地运行 `wrangler dev` 调试 Claude 对话与 Admin 控制台，验证流式输出与日志写入。

- [ ] **Task 6: 保持 Node 模式向后兼容与测试验证**
  - 确保原有 `npm test` 和 `npm start` 100% 正常运行，不受 Worker 新增代码影响。

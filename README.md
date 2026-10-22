# Gemini-Proxy: Claude API to Gemini API Stateless Proxy

一个轻量、无状态、高性能、使用 **TypeScript** 全盘重构的 API 代理服务器。它作为 Anthropic Claude Messages API 的无缝替代品，接收 Claude 格式的 API 请求，并自动将其翻译并转发至 Google AI Studio (Gemini) 官方 API，最后将生成的流式（SSE）或非流式响应转换回 Claude 格式返回给客户端。

---

## 🌟 核心特性

- **全协议双向代理与直传**：
  - **Claude 协议转译模式**：接收 Anthropic Claude 协议请求（`/v1/messages`、`/v1/models`、`/v1/messages/count_tokens`），转译为 Gemini 协议并把结果还原为 Claude SSE 流式/非流式响应。
  - **原生 Gemini 协议透传模式**：完整支持官方 Google Gemini 协议路径（`/v1beta/*` 与 `/v1/models/*:*`），可作为官方 API 代理直连，自带模型别名映射（`MODEL_MAPPINGS`）、负载均衡策略、客户端断连中止管理与全量审计日志记录。
- **TypeScript 强类型支持**：全盘采用严格模式（strict）的 TypeScript 开发，提供极致的安全性和健壮性，杜绝因 JSON Schema 繁琐键值定位引发的运行时崩溃。
- **轻量且无状态**：无任何数据库、浏览器实例（Playwright/Puppeteer）或账户轮询队列，所有请求完全在内存中高效处理。
- **纯透传定位 (无配置密钥泄露风险)**：服务器本身**不保存任何官方 API 密钥**。客户端请求必须在 Header 中携带 `x-api-key`、`Authorization: Bearer <key>` 或 `x-goog-api-key` 作为官方 Gemini 密钥。代理端在翻译完参数后直接透传并访问下游 Google 接口，完全零运营与配额消耗。
- **自定义 Base URL 支持 (`GEMINI_BASE_URL`)**：支持通过环境变量自定义 Google Gemini 接口的请求地址，完美适配自建反代、国内网络中转（如 Cloudflare Workers、Nginx 等），并内建智能斜杠合并与纠错机制。
- **正向出站代理支持 (HTTP / HTTPS / SOCKS5)**：原生支持 HTTP/HTTPS/SOCKS4/SOCKS5 出站代理。支持在全局一次配置代理地址（通过环境变量 `GLOBAL_PROXY_URL` / `PROXY_URL`、系统环境变量 `HTTPS_PROXY` 或 Web 控制台设置），并在各服务器节点通过直观的胶囊按钮一键切换“本机直连”或“代理通道”，消除在每个节点重复输入代理 URL 的冗余。未开启代理通道或未配置代理时直接走原生网络协议栈，零性能损耗。
- **模型别名与调度解耦 (`MODEL_MAPPINGS`)**：支持通过环境变量 `MODEL_MAPPINGS` 或 Web Admin 控制台动态配置模型别名重定向与负载均衡策略（如 `round-robin`、`least-used`、`weighted`）。无需改动或重新编译任何代码，即可实时热重载生效。
- **全功能翻译转换**：
  - 系统提示词（System Prompt）映射与自定义控制：支持 `SYSTEM_ROLE_TO_INSTRUCTION` 开关控制将 `role: 'system'` 消息映射至 Gemini 的 `systemInstruction` 中，并自动按标题前缀进行增量去重（仅保留最新版系统指令）。
  - 可配置的运行时上下文标签：支持通过 `RUNTIME_CONTEXT_TAG` 环境变量（默认 `system-context`）自定义系统提示词的包裹标签。
  - 多轮复杂对话及角色（User / Assistant / Tool）自动映射。
  - 多模态与文档支持：支持 Base64 图片及 PDF/文档类型（`type === 'document'`）数据的自动抽取与转换，完美支持包含文档与图片的 `tool_result` 工具执行结果。
  - 智能思考（Thinking Mode）：支持 Claude `thinking` 参数与 Gemini 思考预算的自动映射与 Token 统计。
  - 完备的工具调用（Tools / Function Calling）：支持 Claude 工具格式到 Gemini 声明的自动大写转换、Draft 不兼容属性递归剔除，以及多轮对话下 `tool_use_id` 到原始函数名的 Map 还原和非标参数类型兼容。
- **流式 SSE 实时传输与生命周期管理**：支持毫秒级、低延迟 Server-Sent Events 流式生成，并集成客户端中断检测与超时取消机制（`UPSTREAM_TIMEOUT_MS`）。
- **Token 计数与模型查询**：完整实现 `/v1/messages/count_tokens` 与 `/v1/models`、`/v1/models/:model_id` 接口。
- **现代可视化 Web 管理控制台 (`/ui`)**：开箱即用的现代化前端控制台，提供实时 QPS/耗时/错误率仪表盘、Chrome DevTools 级交易日志详情查看器（JSON 树形预览与 SSE 打字机流式汇编），以及集成 Monaco Editor 的 API 测试 Playground。

---

## 📂 项目结构

```text
gemini-proxy/
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions: 自动化部署流水线
├── config/
│   ├── default.ts             # 配置文件读取、基础默认配置项与热重载
│   └── runtime.json           # 运行时持久化用户配置 (Admin 控制台保存)
├── frontend/                  # React + Vite + Tailwind 前端 Admin Web 控制台
│   └── src/
│       ├── components/        # DashboardView, LogsView, PlaygroundView, ConfigModal
│       ├── i18n/              # 中英文国际化语言包 (zh / en)
│       └── utils/             # 视图与图表辅助工具
├── scripts/
│   └── deploy.sh              # 统一步署脚本 (Git 拉取、依赖安装、前后端编译、PM2 平滑重载)
├── src/
│   ├── admin/                 # 管理控制台后端逻辑 (状态、统计、日志审计、全局配置、账号)
│   │   ├── controllers/       # AdminController, AccountController
│   │   ├── middlewares/       # AdminAuth (管理员密钥鉴权)
│   │   ├── routes/            # AdminRoutes (/api/admin/*)
│   │   └── services/          # MetricsService, LogService, AccountService
│   ├── proxy/                 # 核心 API 代理与转译系统
│   │   ├── controllers/       # ClaudeController, GeminiController (协议转译与转发)
│   │   ├── routes/            # ClaudeRoutes, GeminiRoutes (/v1/*, /v1beta/*)
│   │   └── services/          # ClaudeTranslator (转译核心), PayloadLogger (报文审计), UpstreamManager (多上游路由)
│   ├── types/
│   │   └── index.ts           # 强类型定义声明 (Claude 与 Gemini API REST 协议载荷接口)
│   ├── utils/
│   │   ├── logger.ts          # 工具类：支持日志级别的定制化控制台日志输出
│   │   ├── proxyAgentManager.ts # 工具类：集中管理 HTTP/SOCKS5 出站 Agent 池与优先级解析
│   │   ├── requestHelper.ts   # 请求头与基址辅助工具
│   │   └── streamLifecycleManager.ts # 工具类：流式传输超时控制与客户端断开检测管理
│   ├── app.ts                 # Express 应用注册、中间件绑定
│   └── index.ts               # 服务监听主启动入口
├── tests/                     # 包含 99 个测试套件、519+ 断言的高覆盖自动化测试集
├── dist/                      # (Git-ignored) 经构建输出的 CommonJS 生产代码与静态前端
├── ecosystem.config.js        # PM2 进程守护及平滑重载配置
├── .env                       # 本地环境变量配置（端口、中转基址、管理密钥等）
├── tsconfig.json              # TypeScript 编译选项配置文件
├── package.json               # 项目依赖、TypeScript 工具链及 npm 运行脚本
└── README.md                  # 本使用说明文档
```

---

## ⚙️ 快速上手

### 1. 安装依赖

需要确保本地安装了 **Node.js (v18+)**。

```bash
# 安装所需依赖包（自动加载并搭建 TypeScript 工具链）
npm install
```

### 2. 配置环境变量

在项目根目录下创建 `.env` 文件（或复制 `.env.example`），进行以下配置：

```env
# 代理服务器监听端口
PORT=8001

# 自定义 Gemini Upstream API 基础地址 (可选项。默认指向官方地址)
GEMINI_BASE_URL=https://generativelanguage.googleapis.com

# 全局出站正向代理地址 (可选项。支持 HTTP, HTTPS, SOCKS4, SOCKS5。各节点可通过胶囊开关选择走代理通道或本机直连)
# GLOBAL_PROXY_URL=http://127.0.0.1:7890

# 管理控制台 (/ui) 鉴权密钥 (强烈建议配置)
ADMIN_SECRET_KEY=your_secure_admin_key_here

# 是否启用 Web 管理控制台前端托管 (默认 true，访问地址 /ui)
ENABLE_UI=true

# 日志输出级别: error, warn, info, debug
LOG_LEVEL=info

# 交易日志存储目录 (按日期/小时自动分卷存储)
TRANSACTION_LOGS_DIR=logs

# 交易日志保留天数 (默认 3 天，0 表示不自动清理)
LOG_RETENTION_DAYS=3

# 时区配置 (默认 Asia/Shanghai)
TIME_ZONE=Asia/Shanghai

# 是否将消息中的 role='system' 路由至 systemInstruction 并按标题去重 (默认 false)
SYSTEM_ROLE_TO_INSTRUCTION=false

# 运行时上下文包裹标签名 (默认 system-context)
RUNTIME_CONTEXT_TAG=system-context

# 上游 Gemini 请求超时毫秒数 (默认 180000ms / 3分钟)
UPSTREAM_TIMEOUT_MS=180000

# 全局追加的自定义 System 提示词 (可选项)
CUSTOM_SYSTEM_INSTRUCTION=
```

### 3. 运行服务

#### A. 生产环境全量编译运行：
```bash
# 1. 一键编译前端静态资源 (Vite) 与后端代码 (tsc)
npm run build

# 2. 启动生产服务
npm start
```

#### B. 极速开发模式：
```bash
# 后端：使用 ts-node-dev 动态监控更改并免编译热重载
npm run dev

# 前端：启动 Vite 独立调试热重载服务 (端口 5173，自动转发 /api, /v1 请求至后端 8001 端口)
npm run dev:frontend
```

服务启动后，默认会在 `http://localhost:8001` 监听 API 请求，管理控制台可在浏览器直接访问 `http://localhost:8001/ui`。

---

## 🚀 生产部署与 CI/CD 自动化流水线

项目支持 **PM2 零停机平滑部署** 与 **GitHub Actions 自动化流水线**。

### 1. 服务器端一键部署 (PM2)

项目已提供统一步署脚本 `scripts/deploy.sh`，在服务器项目根目录下执行：

```bash
# 一键拉取最新代码、安装依赖、编译前后端并平滑重启 PM2 进程
npm run deploy
```

常用 PM2 管理命令：
```bash
pm2 start ecosystem.config.js    # 启动 PM2 守护进程
pm2 reload ecosystem.config.js   # 零停机平滑热重载
pm2 stop gemini-proxy            # 停止进程
pm2 logs gemini-proxy            # 查看实时运行日志
```

### 2. GitHub Actions 自动部署流水线

项目内置了 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，支持在代码推送到 `main` 分支或手动点击 `workflow_dispatch` 时，通过远程执行代理自动化触发服务器部署，完全无需配置 SSH 密钥或 Cloudflare SSH 隧道。

流水线内置并发队列控制（`concurrency`），同一时间仅允许一个流水线执行部署，并自带 PM2 reload 期间的断线自动重连容错（容忍最多 30 次轮询重试）。

#### GitHub Repository Secrets 配置

在 GitHub 仓库中进入 **Settings -> Secrets and variables -> Actions -> New repository secret** 配置以下变量（与服务器端 `.env` 保持一致）：

| Secret 变量名 | 必填 | 说明与示例 |
| :--- | :--- | :--- |
| `TERMINAL_SERVER` | **是** | 远程执行 Hub 服务访问地址（如 `https://hub.yourdomain.com`） |
| `ADMIN_SECRET_KEY` | **是** | 管理员密钥（与服务器端 `.env` 中配置的 `ADMIN_SECRET_KEY` 相同） |
| `DEPLOY_PATH` | 否 | 目标服务器上的部署绝对路径（选填，默认 `~/gemini-proxy`，支持自动探测与波浪号展开） |
| `GT_HOST` | 否 | 目标主机标识/名称（选填，默认为 `gemini-proxy`） |

配置完成后，推送代码到 `main` 分支即可全自动触发构建、平滑热重载并在 GitHub Actions 中实时回显部署流式日志。

---

## 🖥️ Web 管理控制台与 API 调试器 (/ui)

项目内置了现代化的单页 Web 控制台，在浏览器中访问 `http://localhost:8001/ui`（或您部署的域名后加 `/ui`）即可进入。

- **安全鉴权**：在 `.env` 中配置 `ADMIN_SECRET_KEY`，前端通过 Header `x-admin-key` 鉴权，支持记住登录状态与多语言无缝切换（简体中文 / English）。
- **实时监控仪表盘 (Dashboard)**：
  - 呈现系统运行时间、总调用量、平均响应耗时、错误率及实时活跃连接数；
  - 动态展示各模型调用占比环形图、近期 QPS 趋势图与各错误类型分布。
- **Chrome DevTools 级交易日志检查器 (Logs Inspector)**：
  - 左右分栏设计，左侧展示请求流列表（状态码、模型、耗时、时间戳、客户端 IP），支持按状态与关键词实时搜索；
  - 右侧详情面板支持查看原始请求/响应 Header 与 Body；
  - 内置交互式 **JSON 树形组件**，支持键值搜索与展开折叠；
  - 针对流式传输特别集成 **SSE 打字机预览组件**，直观回放流式事件时间轴与事件块内容。
- **API 实时测试 Playground**：
  - 内置基于 Monaco Editor（VS Code 同款）的请求体编辑器，提供一键格式化与常用模板；
  - 支持即时发送请求并以流式（打字机）或完整 JSON 格式输出，排查 API 问题零等待。
- **模型动态映射与调度策略**：
  - 支持给 Claude 模型配置目标 Gemini 模型别名，并支持选择负载调度策略（`least-used` 最小负载、`round-robin` 轮询、`weighted` 权重）。

---

## 🧩 架构解耦说明 (WebTerminal & gt CLI)

WebTerminal 交互终端与多主机反向 Agent（`gt` CLI）功能已正式从本项目解耦，并迁移至独立的 **[`gt-hub`](https://github.com/Tonyogo/gt-hub)** 项目。
本项目专注于高性能无状态 Claude-to-Gemini API 代理网关与 Web 控制台，代码结构更加轻量纯粹。

---

## 🧭 模型配置与动态映射 (`MODEL_MAPPINGS`)

所有支持内容生成的 Google 原生模型均可通过其原生 `id`（去除 `models/` 前缀后）被直接调用。若需为特定 Claude 或 Gemini 模型配置别名重定向与负载均衡，可通过环境变量 `MODEL_MAPPINGS` 或在 Web Admin 控制台中的“模型映射”标签页进行动态配置：

```json
{
  "claude-3-7-sonnet": "gemini-2.5-pro",
  "claude-3-5-haiku": "gemini-2.5-flash",
  "gemini-flash-latest": ["gemini-2.5-flash", "gemini-2.0-flash"]
}
```

支持单模型重定向、数组负载均衡，以及指定调度策略对象 `{ "target": "gemini-2.5-pro", "strategy": "round-robin" }`。

您只需传入目标 Gemini 模型名称，即可实现完全等价的无缝代理转换。

---

## 🚀 API 接口使用说明

所有请求必须在请求头中带上您的 Gemini API Key 作为鉴权密钥。

### 1. 模型列表与详情查询

#### a. 获取支持的所有模型列表：
**接口：** `GET /v1/models`

**请求示例 (cURL)：**
```bash
curl http://localhost:8001/v1/models \
     -H "x-api-key: YOUR_GEMINI_API_KEY"
```

---

### 2. 创建消息 (非流式响应)

**接口：** `POST /v1/messages`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:8001/v1/messages \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "gemini-3.5-flash",
       "max_tokens": 1024,
       "messages": [
         {"role": "user", "content": "你好，请用一句话介绍你自己。"}
       ]
     }'
```

---

### 3. 创建流式消息 (Server-Sent Events)

通过将 `stream` 设置为 `true`，代理会自动以实时打字机流式输出：

**接口：** `POST /v1/messages`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:8001/v1/messages \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "gemini-3.5-flash",
       "max_tokens": 1024,
       "stream": true,
       "messages": [
         {"role": "user", "content": "写一首赞美晴天的四言绝句。"}
       ]
     }'
```

---

### 4. 原生 Gemini 协议调用 (免转译直连)

客户端（Google Gen AI SDK、Python `google-generativeai` 或 cURL）可将 `baseUrl` 直接指定为本服务：

#### a. 非流式内容生成
**接口：** `POST /v1beta/models/:model:generateContent`

```bash
curl -X POST "http://localhost:8001/v1beta/models/gemini-2.0-flash:generateContent" \
     -H "Content-Type: application/json" \
     -H "x-goog-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "contents": [{ "parts": [{ "text": "你好，Gemini！" }] }]
     }'
```

#### b. SSE 流式内容生成
**接口：** `POST /v1beta/models/:model:streamGenerateContent?alt=sse`

```bash
curl -N -X POST "http://localhost:8001/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse" \
     -H "Content-Type: application/json" \
     -H "x-goog-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "contents": [{ "parts": [{ "text": "写一篇关于人工智能发展的短文" }] }]
     }'
```

#### c. 原生模型列表查询
**接口：** `GET /v1beta/models`

```bash
curl "http://localhost:8001/v1beta/models" \
     -H "x-goog-api-key: YOUR_GEMINI_API_KEY"
```

---

## 🛡️ 交易 payload 审计日志 (`logs/YYYY-MM-DD/HH/`)

系统会自动将完整的请求和响应交易数据以**绝对异步、非阻塞（0 延迟阻碍）**的形式分区写入本地文件系统。保存路径支持通过环境变量 `TRANSACTION_LOGS_DIR` 进行自定义配置，按日期与小时自动分层隔离管理。

---

## 🧪 测试验证

本项目包含一套基于 `ts-jest` 驱动的严苛自动化测试集，涵盖翻译协议、流式生命周期、鉴权中间件、Web 控制台组件及多上游网关调度算法：

```bash
# 运行全量单元测试
npm test

# 单线程模式运行 (规避并发端口占用)
npx jest --runInBand
```

测试执行结果：
```text
Test Suites: 99 passed, 99 total
Tests:       1 skipped, 519 passed, 520 total
Snapshots:   0 total
Ran all test suites.
```

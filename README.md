# Gemini-Proxy: Claude API to Gemini API Stateless Proxy

一个轻量、无状态、高性能、使用 **TypeScript** 全盘重构的 API 代理服务器。它作为 Anthropic Claude Messages API 的无缝替代品，接收 Claude 格式的 API 请求，并自动将其翻译并转发至 Google AI Studio (Gemini) 官方 API，最后将生成的流式（SSE）或非流式响应转换回 Claude 格式返回给客户端。

---

## 🌟 核心特性

- **TypeScript 强类型支持**：全盘采用严格模式（strict）的 TypeScript 开发，提供极致的安全性和健壮性，杜绝因 JSON Schema 繁琐键值定位引发的运行时崩溃。
- **轻量且无状态**：无任何数据库、浏览器实例（Playwright/Puppeteer）或账户轮询队列，所有请求完全在内存中高效处理。
- **纯透传定位 (无配置密钥泄露风险)**：服务器本身**不保存任何官方 API 密钥**。客户端请求必须在 Header 中携带 `x-api-key`、`Authorization: Bearer <key>` 或 `x-goog-api-key` 作为官方 Gemini 密钥。代理端在翻译完参数后直接透传并访问下游 Google 接口，完全零运营与配额消耗。
- **自定义 Base URL 支持 (`GEMINI_BASE_URL`)**：支持通过环境变量自定义 Google Gemini 接口的请求地址，完美适配自建反代、国内网络中转（如 Cloudflare Workers、Nginx 等），并内建智能斜杠合并与纠错机制。
- **数据与逻辑完美解耦 (`models.json`)**：将所有 Claude 的模型详细信息以及其到 Gemini 的映射关系高度整合在 `config/models.json` 配置文件中。未来增加新模型映射、添加别名，均只需在此单文件里增改一行，**无需改动并重新编译任何逻辑代码**。
- **全功能翻译转换**：
  - 系统提示词（System Prompt）映射与自定义控制：支持 `SYSTEM_ROLE_TO_INSTRUCTION` 开关控制将 `role: 'system'` 消息映射至 Gemini 的 `systemInstruction` 中，并自动按标题前缀进行增量去重（仅保留最新版系统指令）。
  - 可配置的运行时上下文标签：支持通过 `RUNTIME_CONTEXT_TAG` 环境变量（默认 `runtime-context`）自定义系统提示词的包裹标签。
  - 多轮复杂对话及角色（User / Assistant / Tool）自动映射。
  - 多模态与文档支持：支持 Base64 图片及 PDF/文档类型（`type === 'document'`）数据的自动抽取与转换，完美支持包含文档与图片的 `tool_result` 工具执行结果。
  - 智能思考（Thinking Mode）：支持 Claude `thinking` 参数与 Gemini 思考预算的自动映射与 Token 统计。
  - 完备的工具调用（Tools / Function Calling）：支持 Claude 工具格式到 Gemini 声明的自动大写转换、Draft 不兼容属性递归剔除，以及多轮对话下 `tool_use_id` 到原始函数名的 Map 还原和非标参数类型兼容。
- **流式 SSE 实时传输与生命周期管理**：支持毫秒级、低延迟 Server-Sent Events 流式生成，并集成客户端中断检测与超时取消机制（`UPSTREAM_TIMEOUT_MS`）。
- **Token 计数支持**：完整实现 `/v1/messages/count_tokens` 接口。
- **可用模型名查询**：完整支持 `/v1/models` 以及 `/v1/models/:model_id` 查询，且已自动通过数据清洗在输出时对客户端过滤隐藏内部映射字段（如 `gemini_mapping`）。
- **完善的错误映射**：自动将 Gemini 各种错误格式包装成 Claude 官方格式，使客户端的 SDK 能够完美捕获异常。

---

## 📂 项目结构

```text
gemini-proxy/
├── config/
│   ├── default.ts             # 配置文件读取、基础默认配置项
│   └── models.json            # 核心配置文件：受支持的模型列表及到 Gemini 的映射规则
├── src/
│   ├── types/
│   │   └── index.ts           # 强类型定义声明 (Claude 与 Gemini API REST 协议载荷接口)
│   ├── routes/
│   │   └── claudeRoutes.ts    # 路由层：/v1/messages, /v1/models, /v1/messages/count_tokens
│   ├── controllers/
│   │   └── claudeController.ts# 控制器层：Express 请求与响应逻辑、双向映射 info 日志等
│   ├── services/
│   │   ├── claudeTranslator.ts# 服务层：核心翻译适配器 (Claude <-> Gemini 核心协议转换)
│   │   └── payloadLogger.ts   # 服务层：异步、非阻塞式交易日志文件保存器
│   ├── utils/
│   │   ├── logger.ts          # 工具类：支持日志级别的定制化控制台日志输出
│   │   └── streamLifecycleManager.ts # 工具类：流式传输超时控制与客户端断开检测管理
│   ├── app.ts                 # Express 应用注册、中间件绑定
│   └── index.ts               # 服务监听主启动入口
├── tests/
│   ├── jest.config.ts         # ts-jest 测试框架配置
│   └── *.test.ts              # 包含 60+ 个精细化功能断言的高覆盖 TS 自动化测试集
├── dist/                      # (Git-ignored) 经 tsc 编译输出的 CommonJS 生产代码
├── .env                       # 本地环境变量配置（端口、中转基址等）
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
PORT=3000

# 自定义 Gemini Upstream API 基础地址 (可选项。默认指向官方地址)
GEMINI_BASE_URL=https://generativelanguage.googleapis.com

# 日志输出级别: error, warn, info, debug
LOG_LEVEL=info

# 交易日志存储目录 (按日期/小时自动分卷存储)
TRANSACTION_LOGS_DIR=logs

# 是否将消息中的 role='system' 路由至 systemInstruction 并按标题去重 (默认 false)
SYSTEM_ROLE_TO_INSTRUCTION=false

# 运行时上下文包裹标签名 (默认 runtime-context)
RUNTIME_CONTEXT_TAG=runtime-context

# 上游 Gemini 请求超时毫秒数 (默认 180000ms / 3分钟)
UPSTREAM_TIMEOUT_MS=180000

# 全局追加的自定义 System 提示词 (可选项)
CUSTOM_SYSTEM_INSTRUCTION=
```

### 3. 运行服务

#### A. 生产环境编译运行 (标准 tsc 模式)：
```bash
# 1. 编译 TypeScript 到 dist 文件夹中
npm run build

# 2. 启动编译好的生产服务
npm start
```

#### B. 极速开发模式 (热重载及免编译直接执行)：
```bash
# 使用 ts-node-dev 动态监控更改并免编译启动
npm run dev
```

服务启动后，默认会在本地 `http://localhost:3000` 监听请求。

---

## 🧭 模型配置与映射关系 (`config/models.json`)

系统受支持的模型列表在 **`config/models.json`** 中动态生成和读取。所有支持内容生成的 Google 原生模型都可以通过其原生 `id`（去除 `models/` 前缀后）被直接调用：

| 客户端请求传入的模型 (ID) | 描述 / 说明 |
| :--- | :--- |
| **`gemini-3.5-flash`** | 直接映射并调度最新的 Gemini 3.5 Flash 模型 |
| **`gemini-2.5-pro`** | 映射至 Google 强大的 2.5 Pro 模型 |
| **`gemini-2.5-flash`** | 映射至高速 2.5 Flash 推理 |
| `gemini-flash-latest` | 动态映射至最新可用 Flash |
| 其它 Gemini 模型名 | 只要是在 models.json 中定义的模型名均支持纯透传调度 |

您只需传入目标 Gemini 模型名称，即可实现完全等价的无缝代理转换。

---

## 🚀 API 接口使用说明

所有请求必须在请求头中带上您的 Gemini API Key 作为鉴权密钥。

### 1. 模型列表与详情查询

#### a. 获取支持的所有模型列表：
**接口：** `GET /v1/models`

**请求示例 (cURL)：**
```bash
curl http://localhost:3000/v1/models \
     -H "x-api-key: YOUR_GEMINI_API_KEY"
```

---

### 2. 创建消息 (非流式响应)

**接口：** `POST /v1/messages`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages \
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
curl -X POST http://localhost:3000/v1/messages \
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

## 🛡️ 交易 payload 审计日志 (`logs/YYYY-MM-DD/HH/`)

系统会自动将完整的请求和响应交易数据以**绝对异步、非阻塞（0 延迟阻碍）**的形式分区写入本地文件系统。保存路径支持通过环境变量 `TRANSACTION_LOGS_DIR` 进行自定义配置，按日期与小时自动分层隔离管理。

---

## 🧪 测试验证

本项目包含一套基于 `ts-jest` 驱动的自动化测试集：

运行全量测试：
```bash
npm test
# 或使用单线程模式规避并发信号中断：
npx jest --runInBand
```

测试执行结果：
```text
PASS tests/claudeTranslator.test.ts
PASS tests/claudeController.test.ts
PASS tests/claudeControllerStreamLifecycle.test.ts
PASS tests/claudeLogging.test.ts
PASS tests/claudeStreaming.test.ts
PASS tests/payloadLogger.test.ts
PASS tests/claudeModels.test.ts
PASS tests/claudeCountTokens.test.ts
PASS tests/health.test.ts
PASS tests/streamLifecycleManager.test.ts
PASS tests/requestHelper.test.ts

Test Suites: 11 passed, 11 total
Tests:       1 skipped, 66 passed, 67 total
Snapshots:   0 total
Time:        5.93 s
Ran all test suites.
```

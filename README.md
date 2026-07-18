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
  - 系统提示词（System Prompt）支持（多 System 拼装及对话序列过滤净化）。
  - 多轮复杂对话及角色（User / Assistant / Tool）自动映射。
  - 多模态输入：支持 Base64 图片数据的自动转换。
  - 智能思考（Thinking Mode）：支持 Claude `thinking` 参数与 Gemini 2.5 思考预算的自动映射与 Token 统计。
  - 完备的工具调用（Tools / Function Calling）：支持 Claude 工具格式到 Gemini 声明的自动大写转换、Draft 不兼容属性递归剔除，以及多轮对话下 `tool_use_id` 到原始函数名的 Map 还原和非标参数类型兼容。
- **流式 SSE 实时传输**：支持毫秒级、低延迟的 Server-Sent Events 流式生成，与 Claude 官方流式事件完全兼容。
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
│   │   └── logger.ts          # 工具类：支持日志级别的定制化控制台日志输出
│   ├── app.ts                 # Express 应用注册、中间件绑定
│   └── index.ts               # 服务监听主启动入口
├── tests/
│   ├── jest.config.ts         # ts-jest 测试框架配置
│   └── *.test.ts              # 包含 25 个精细化功能断言的高覆盖 TS 自动化测试集
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

# 自定义 Gemini Upstream API 基础地址 (可选项。用于国内中转、Cloudflare Workers 等自建反代，默认指向官方地址)
# 支持尾部带斜杠或不带斜杠，代理端会自动进行合并容错处理。
GEMINI_BASE_URL=https://generativelanguage.googleapis.com

# 日志输出级别: error, warn, info, debug
LOG_LEVEL=info
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

**响应格式：**
```json
{
  "data": [
    {
      "type": "model",
      "id": "gemini-3.5-flash",
      "display_name": "Gemini 3.5 Flash",
      "created_at": "2026-07-18T00:00:00Z"
    },
    {
      "type": "model",
      "id": "gemini-2.5-pro",
      "display_name": "Gemini 2.5 Pro",
      "created_at": "2026-07-18T00:00:00Z"
    },
    ...
  ],
  "has_more": false,
  "first_id": "gemini-2.5-flash",
  "last_id": "gemini-embedding-2"
}
```

#### b. 获取特定模型的元数据：
**接口：** `GET /v1/models/:model_id`

**请求示例 (cURL)：**
```bash
curl http://localhost:3000/v1/models/claude-opus-4-7 \
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

### 4. Token 数量计算

**接口：** `POST /v1/messages/count_tokens`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages/count_tokens \
     -H "x-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "gemini-3.5-flash",
       "messages": [
         {"role": "user", "content": "测试一下这段文字占用了多少个 Token。"}
       ]
     }'
```

---

### 5. 深度功能：思维链 (Thinking Mode) 演示

你可以传入 Claude 风格的 `thinking` 参数，代理由此触发 Gemini 的思考层输出，并通过 `thinking` 块格式返还：

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "gemini-3.5-flash",
       "max_tokens": 4096,
       "thinking": {
         "type": "enabled",
         "budget_tokens": 2048
       },
       "messages": [
         {"role": "user", "content": "9.11 和 9.9 哪个数字大？"}
       ]
     }'
```

---

## 🛡️ 交易 payload 审计日志 (`data/debug/`)

当您开启 `LOG_LEVEL=debug` 时，系统会自动将完整的请求和响应 lifecycle 交易数据以**绝对异步、非阻塞（0 延迟阻碍）**的形式写入本地文件系统 `data/debug/transaction_{ID}.json`。

每条交易日志包含：
1. `client_req`：客户端发送给代理的原汁原味的 Claude 请求参数。
2. `gem_req`：翻译转换后的高清洁 Gemini 官方 API 请求包（已安全脱敏 API Key）。
3. `gem_res`：下游 Google 官方返回的最原始的数据包（流式场景下，会自动聚合所有的流 chunks 按数组顺序完美还原并归档，包含 `thoughtsTokenCount` 与 `candidatesTokenCount`）。

---

## 🧪 测试验证

本项目包含一套基于 `ts-jest` 驱动的完备的自动化测试集，测试全盘覆盖了健康、格式翻译适配器、模型查询、多态工具调用、SSE 实时事件管道流动、以及高并发审计日志在 Jest 间谍模式（Spy mock）下的线程隔离检验。

运行全量测试：
```bash
npm test
```

测试执行结果：
```text
PASS tests/claudeLogging.test.ts
PASS tests/claudeTranslator.test.ts
PASS tests/payloadLogger.test.ts
PASS tests/health.test.ts
PASS tests/claudeController.test.ts
PASS tests/claudeModels.test.ts
PASS tests/claudeCountTokens.test.ts
PASS tests/claudeStreaming.test.ts

Test Suites: 8 passed, 8 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        3.616 s
Ran all test suites.
```

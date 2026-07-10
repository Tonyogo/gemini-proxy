# Gemini-Proxy: Claude API to Gemini API Stateless Proxy

一个轻量、无状态、高性能的 API 代理服务器。它作为 Anthropic Claude Messages API 的无缝替代品，接收 Claude 格式的 API 请求，并自动将其翻译并转发至 Google AI Studio (Gemini) 官方 API，最后将生成的流式（SSE）或非流式响应转换回 Claude 格式返回给客户端。

---

## 🌟 核心特性

- **轻量且无状态**：无任何数据库、浏览器实例（Playwright/Puppeteer）或账户轮询队列，所有请求完全在内存中高效处理。
- **支持 API Key 透传**：如果客户端请求在 Header 中带了 `Authorization: Bearer <key>`，代理服务器会自动将此 Key 转发至 Google；若未携带，则默认使用服务器本地配置的全局 `GEMINI_API_KEY`。
- **全功能翻译转换**：
  - 系统提示词（System Prompt）支持。
  - 多轮对话及角色（User / Assistant / Tool）自动映射。
  - 多模态输入：支持 Base64 图片数据的自动转换。
  - 智能思考（Thinking Mode）：支持 Claude `thinking` 参数与 Gemini 2.5 `thinkingConfig` 思考预算的自动映射。
  - 工具调用（Tools / Function Calling）：支持 Claude 工具格式到 Gemini 声明的自动转换及返回接收。
- **流式 SSE 实时传输**：支持毫秒级、低延迟的 Server-Sent Events 流式生成，与 Claude 官方流式事件完全兼容。
- **Token 计数支持**：完整实现 `/v1/messages/count_tokens` 接口。
- **完善的错误映射**：自动将 Gemini 各种错误格式包装成 Claude 官方格式，使客户端的 SDK 能够完美捕获异常。

---

## 📂 项目结构

```text
gemini-proxy/
├── config/
│   └── default.js             # 配置文件读取、默认模型及模型映射表
├── src/
│   ├── routes/
│   │   └── claudeRoutes.js    # 路由层：/v1/messages & /v1/messages/count_tokens
│   ├── controllers/
│   │   └── claudeController.js# 控制器层：处理 HTTP 流式与非流式请求及转发
│   ├── services/
│   │   └── claudeTranslator.js# 服务层：核心翻译适配器 (Claude <-> Gemini 转换逻辑)
│   ├── utils/
│   │   └── logger.js          # 工具类：基于日志级别的格式化日志输出
│   └── app.js                 # Express 应用注册、中间件及生命周期
├── .env                       # 本地环境变量配置（API 密钥、端口等）
├── index.js                   # 服务启动入口
├── package.json               # 依赖项及启动脚本
└── README.md                  # 本使用说明文档
```

---

## ⚙️ 快速上手

### 1. 安装依赖

需要确保本地安装了 **Node.js (v18+)**。

```bash
# 安装所需依赖包
npm install
```

### 2. 配置环境变量

在项目根目录下创建 `.env` 文件（或修改已有的 `.env`），进行以下配置：

```env
# 代理服务器监听端口
PORT=3000

# 默认全局 Gemini API Key (可空，优先使用客户端传入的 Bearer token)
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere

# 当客户端传入 generic 模型 ID 时默认映射的 Gemini 模型
DEFAULT_GEMINI_MODEL=gemini-2.5-flash

# 日志输出级别: error, warn, info, debug
LOG_LEVEL=info
```

### 3. 运行服务

```bash
# 开发模式 / 生产模式启动
npm start
```

服务启动后，默认会在本地 `http://localhost:3000` 监听请求。

---

## 🧭 模型映射关系

默认内置了以下 Claude 模型到 Gemini 最新模型的映射（可在 `config/default.js` 中随时修改）：

| 客户端请求的 Claude 模型 | 转发至 Google Studio 的模型 |
| :--- | :--- |
| `claude-3-5-sonnet` / `claude-3-5-sonnet-20241022` | `gemini-2.5-pro` |
| `claude-3-5-haiku` / `claude-3-5-haiku-20241022` | `gemini-2.5-flash` |
| `claude-3-opus` | `gemini-2.5-pro` |
| `claude-3-sonnet` / `claude-3-haiku` | `gemini-2.5-flash` |
| 其它未知模型名 | 默认使用 `DEFAULT_GEMINI_MODEL` (如 `gemini-2.5-flash`) |

---

## 🚀 API 接口使用说明

### 1. 创建消息 (非流式响应)

**接口：** `POST /v1/messages`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "claude-3-5-sonnet",
       "max_tokens": 1024,
       "messages": [
         {"role": "user", "content": "你好，请用一句话介绍你自己。"}
       ]
     }'
```

**响应格式：**
```json
{
  "id": "msg_fake_7vpxz8p91",
  "type": "message",
  "role": "assistant",
  "model": "gemini-2.5-pro",
  "content": [
    {
      "type": "text",
      "text": "你好！我是由 Google 训练的大型语言模型 Gemini。"
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 15,
    "output_tokens": 20
  }
}
```

---

### 2. 创建流式消息 (Server-Sent Events)

通过将 `stream` 设置为 `true`，代理会自动以实时打字机流式输出：

**接口：** `POST /v1/messages`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "claude-3-5-sonnet",
       "max_tokens": 1024,
       "stream": true,
       "messages": [
         {"role": "user", "content": "写一首赞美晴天的四言绝句。"}
       ]
     }'
```

**流式响应事件流：**
```text
event: message_start
data: {"type":"message_start","message":{"id":"msg_stream_z8x9p3r1","type":"message","role":"assistant","model":"gemini-2.5-pro","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":12,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"烈日當空"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"，照臨四方"}}

...

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":28}}

event: message_stop
data: {"type":"message_stop"}
```

---

### 3. Token 数量计算

**接口：** `POST /v1/messages/count_tokens`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages/count_tokens \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "claude-3-5-sonnet",
       "messages": [
         {"role": "user", "content": "测试一下这段文字占用了多少个 Token。"}
       ]
     }'
```

**响应格式：**
```json
{
  "input_tokens": 14
}
```

---

### 4. 深度功能：思维链 (Thinking Mode) 演示

你可以传入 Claude 风格的 `thinking` 参数，代理由此触发 Gemini 的思考层输出，并通过 `thinking` 块格式返还：

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "claude-3-5-sonnet",
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

## 🧪 测试验证

本项目包含一套基于 `Jest` + `Supertest` 的完整单元测试与端到端集成测试，测试覆盖了健康检查、格式翻译器、路由控制器、SSE 实时流管道及 Token 计数接口。

运行全量测试套件：
```bash
npm test
```

测试执行结果：
```text
PASS tests/claudeCountTokens.test.js
PASS tests/claudeStreaming.test.js
PASS tests/claudeController.test.js
PASS tests/health.test.js
PASS tests/claudeTranslator.test.js

Test Suites: 5 passed, 5 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        0.384 s
Ran all test suites.
```

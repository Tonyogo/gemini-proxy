# gt.js Agent HTTP 出口代理设计规范 (Spec Document)

- **作者**: Claude Assistant & yatao
- **日期**: 2026-09-30
- **状态**: Approved / Ready for Implementation
- **分类**: Architectural Spec

---

## 1. 概述与背景

### 1.1 现状与痛点
Gemini-Proxy 是一个将 Anthropic Claude Messages API 翻译为 Google Gemini API、并提供原生 Gemini 反向代理的无状态服务端程序。在受限网络环境（如国内云服务器）下部署时，服务端无法直接稳定访问 Google Upstream（`generativelanguage.googleapis.com`）。

目前系统已具备完善的 WebTerminal 和多节点反向 Agent 体系（`scripts/gt.js`），海外 VPS 节点通过反向 WebSocket（`/api/terminal/agent-ws`）主动长连接接入服务端。

### 1.2 目标
让海外部署的 `gt agent` 节点具备 HTTP 出口代理能力。服务端向 Google Upstream 发起请求时，借道既有的反向 WebSocket 隧道转发至指定的海外 Agent 节点发出，并将上游的流式（SSE）或非流式响应实时回传给服务端，最终吐给终端客户端。

---

## 2. 总体架构与数据流向

```text
[Client / Claude Code / Curl]
       │ HTTP / SSE 请求
       ▼
┌────────────────────────────────────────────────────────┐
│ Gemini-Proxy Server                                    │
│                                                        │
│  claudeController / geminiController                   │
│         │                                              │
│         ▼                                              │
│  upstreamManager (调度选出: serverType === 'agent')    │
│         │                                              │
│         ▼                                              │
│  agentProxyService                                     │
│  (提供与 fetch 签名兼容的 agentFetch)                  │
│         │                                              │
│         ▼ RPC: http_req / http_abort                   │
│  terminalHostManager (通过指定 agentId 获取 agentWs)   │
└─────────┼──────────────────────────────────────────────┘
          │ Reverse WebSocket (/api/terminal/agent-ws)
          │ [双向 JSON 协议帧]
┌─────────┼──────────────────────────────────────────────┐
│ gt.js (Running on Remote Agent Node)                   │
│                                                        │
│  AgentProxyDispatcher (新增子模块)                     │
│         │                                              │
│         ▼ 原生 Node https.request (通用出站)           │
│  [Google Gemini API / 任意上游公网服务]                 │
└────────────────────────────────────────────────────────┘
```

---

## 3. WebSocket 隧道协议帧规范

所有控制消息采用以 `http_` 为前缀的 JSON 对象传输（带有 `JSON:` 前缀或纯 JSON，与现有 terminal control 协议一致）。

### 3.1 帧定义

| 消息类型 (`type`) | 方向 | 载荷字段 (Payload) | 说明 |
|---|---|---|---|
| `http_req` | Server $\rightarrow$ Agent | `requestId: string`<br>`method: string`<br>`url: string`<br>`headers: Record<string, string>`<br>`body?: string` (Base64)<br>`timeoutMs?: number` | 发起一次出站 HTTP 请求 |
| `http_res_start` | Agent $\rightarrow$ Server | `requestId: string`<br>`status: number`<br>`statusText: string`<br>`headers: Record<string, any>` | 远端已与目标上游建立连接并收到响应头 |
| `http_res_chunk` | Agent $\rightarrow$ Server | `requestId: string`<br>`chunk: string` (Base64) | 流式数据块（单块或 SSE chunk），二进制安全 |
| `http_res_end` | Agent $\rightarrow$ Server | `requestId: string`<br>`trailers?: Record<string, any>` | 响应数据流完整结束 |
| `http_res_error` | Agent $\rightarrow$ Server | `requestId: string`<br>`error: { code: string, message: string }` | 远端网络错误（DNS 失败、连接超时、ECONNRESET 等） |
| `http_abort` | Server $\rightarrow$ Agent | `requestId: string`<br>`reason?: string` | 客户端中断或服务端超时，要求 Agent 立即销毁远端连接 |

### 3.2 字段说明与约束
- `requestId`：服务端分配的唯一短 ID（例如 `req_` + 8 位随机器），生命周期内严格唯一。
- `body` 与 `chunk`：均采用 Base64 编码，确保在 JSON 文本协议传输下，二进制与包含换行符的 SSE 事件流 100% 无损。
- 多路复用：单个 WebSocket 链路并发承载无限个 `requestId`，各请求的数据帧交叉传输，互不干扰。

---

## 4. 服务端模块详细设计

### 4.1 数据类型与配置扩充 (`src/types/index.ts` & `config/default.ts`)

1. **扩充 `UpstreamServerType`**：
   ```typescript
   export type UpstreamServerType = 'proxy' | 'direct' | 'agent';

   export interface UpstreamServerConfig {
     url: string; // 默认 https://generativelanguage.googleapis.com
     weight: number;
     enabled: boolean;
     name?: string;
     type?: UpstreamServerType;
     agentId?: string; // 绑定的 Agent 节点名或 hostId (例如 "hk-node-1")
     allowedModels?: string[];
     apiKeys?: string[]; // 可选：支持 Agent 节点配置专属 key 列表与 direct 轮换
   }
   ```
2. **`config/default.ts` 解析**：
   在 `parseUpstreamServers()` 中识别 `item.type === 'agent'`，校验并提取 `item.agentId`。

### 4.2 调度管理 (`src/utils/upstreamManager.ts`)
- **在线感知**：计算候选节点时，若 `server.type === 'agent'`，调用 `terminalHostManager.getHost(server.agentId)` 检查节点状态。
  - 若 Agent 离线，自动跳过该节点，不分配流量。
- **权重调度**：在线的 Agent 节点与原有的 proxy / direct 节点一同参与平���加权轮询（Weighted Round-Robin）。
- **熔断隔离**：若通过 Agent 发起请求遭遇网络级失败（504 或 `http_res_error`），累加 `consecutiveFailures` 并自动熔断隔离指定时长。

### 4.3 Agent 出口请求服务 (`src/proxy/services/agentProxyService.ts`)
实现统一的适配器接口：
```typescript
export interface AgentFetchResponse {
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
    raw(): Record<string, string[]>;
  };
  body: NodeJS.ReadableStream; // Node.js PassThrough stream
}

export class AgentProxyService {
  public async agentFetch(
    agentId: string,
    targetUrl: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
      signal?: AbortSignal;
      timeoutMs?: number;
    }
  ): Promise<AgentFetchResponse>;
}
```

**关键执行步骤**：
1. 校验 `terminalHostManager` 中指定 `agentId` 的 WebSocket 状态，若未连接则直接抛出 `AgentNotFoundError` 或 `AgentOfflineError`。
2. 构造 `requestId` 与 `PassThrough` 响应流对象。
3. 注册 WebSocket 单次监听与状态机：
   - 收到 `http_res_start`：解析响应头，构造伪 `Headers` 对象，resolve 返回 `response`。
   - 收到 `http_res_chunk`：将 Base64 解码后的 Buffer 写入 `response.body.write(chunkBuffer)`。
   - 收到 `http_res_end`：调用 `response.body.end()`。
   - 收到 `http_res_error`：调用 `response.body.destroy(err)`，若尚未 resolve 则直接 reject。
4. 绑定 `signal`：当 `options.signal?.aborted` 触发时，向 Agent 发送 `http_abort` 并清理资源。

### 4.4 控制器适配 (`claudeController.ts` & `geminiController.ts`)
在选出目标节点后，统一调度网络执行器：
```typescript
const executeRequest = (serverSelection.serverType === 'agent')
  ? (url: string, opts: any) => agentProxyService.agentFetch(serverSelection.agentId!, url, opts)
  : fetch;

const response = await executeRequest(targetUrl, {
  method: 'POST',
  headers: upstreamHeaders,
  body: JSON.stringify(gemReq),
  signal: streamManager.signal
});
```

---

## 5. `gt.js` Agent 端详细设计

### 5.1 `AgentProxyDispatcher` 类设计
在 `scripts/gt.js` 中新增纯轻量级请求分发器：
```javascript
class AgentProxyDispatcher {
  constructor(sendWsFn) {
    this.sendWs = sendWsFn;
    this.activeRequests = new Map(); // requestId -> { clientReq, timer }
  }

  handleRequest({ requestId, method, url, headers, body, timeoutMs }) {
    // 1. 判断 http 或 https
    // 2. 构造原生 Node.js request
    // 3. 设置 timeoutTimer
    // 4. 流式触发 http_res_start, http_res_chunk, http_res_end
    // 5. 错误捕获触发 http_res_error
  }

  handleAbort({ requestId, reason }) {
    const entry = this.activeRequests.get(requestId);
    if (entry && entry.clientReq) {
      entry.clientReq.destroy();
    }
    this.cleanupRequest(requestId);
  }

  cleanup() {
    for (const [id, entry] of this.activeRequests.entries()) {
      if (entry.clientReq) entry.clientReq.destroy();
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.activeRequests.clear();
  }
}
```

### 5.2 通用出站与安全策略
- 行为：完全通用透明代理，不做特定域名硬编码限制，根据 URL 自动适配 HTTP/HTTPS。
- 连接复用：利用 Node.js 默认的全局 `https.globalAgent` / `http.globalAgent` 实现针对上游的 HTTP Keep-Alive 连接池复用。
- 内存防护：限制单次请求 chunk 大小不超过 64KB，收到数据块立即 Base64 编码发出，避免在 Agent 内存中积压。

---

## 6. 可观测性与审计监控

1. **Admin 控制台 (`/ui`)**：
   - `/api/admin/models` Upstream 列表中标识 `type: agent`、绑定的 `agentId` 以及实时状态（Online / Offline）。
2. **审计日志 (`payloadLogger`)**：
   - ���录 `upstreamServerType: 'agent'`、`agentId: string` 以及 `proxyDurationMs`，便于在 `LogsView.tsx` 中快速排查和溯源。

---

## 7. 测试验证策略

1. **单元测试 (`tests/agentProxyService.test.ts`)**：
   - 模拟 WebSocket 双向通信，测试 `agentFetch` 的普通请求、长流式请求、握手超时、连接中断以及 `AbortSignal` 触发。
2. **Upstream 调度测试 (`tests/upstreamManager.test.ts`)**：
   - 测试 `agent` 节点在线/离线时的流量分配、权重占比与隔离熔断。
3. **端到端测试 (`tests/agentEgressE2E.test.ts`)**：
   - 启动内存 Agent 守护进程连接主服务，测试 `/v1/messages` (Claude 转 Gemini SSE 流式) 与 `/v1beta/*` (原生 Gemini) 完整代理调用。

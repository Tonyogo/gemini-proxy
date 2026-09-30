# gt.js Agent HTTP 出口代理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让海外部署的 `gt.js agent` 守护进程能够通过既有的反向 WebSocket 隧道，作为 Gemini-Proxy 访问上游 Google API 的 HTTP/HTTPS 出口代理。

**Architecture:** 
在 `src/types` 与 `config/default.ts` 中新增 `UpstreamServerType = 'agent'` 配置支持；在 `src/utils/upstreamManager.ts` 中集成 Agent 节点在线检测与故障熔断；在 `src/proxy/services/agentProxyService.ts` 中实现类似 `fetch` 的 `agentFetch` 适配器，将 HTTP 请求封装为 WebSocket RPC（`http_req`）下发给海外 Agent；在 `scripts/gt.js` 中新增 `AgentProxyDispatcher` 负责原生执行出站 HTTP 请求并将流式响应（`http_res_*`）编码回传；最后在 `claudeController` 与 `geminiController` 中按 `serverType` 路由执行。

**Tech Stack:** TypeScript, Node.js (http/https/stream), Express, WebSocket, Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-30-gt-agent-http-egress-proxy-design.md`

## Global Constraints

- 保持无状态代理核心逻辑不受侵入，`agentFetch` 必须兼容类似 `node-fetch` 的 Response 接口（`status`, `headers.get()`, `body: ReadableStream`）。
- 隧道传输中，二进制数据和 SSE 换行符必须通过 Base64 编码保障 100% 无损。
- 零静态配置缓存：配置项和 upstream 列表必须动态评估。
- 保证双向生命周期联动：当客户端提前断开连接时，服务端必须立即向 Agent 发送 `http_abort` 销毁远端 socket。
- Node.js 原生兼容：`gt.js` 端仅使用原生标准库 `http` / `https` 模块，无需新增任何第三方包依赖。

## Review Focus

1. **Agent 离线/不存在时的调度行为**：如果配置的 Agent 离线，`UpstreamManager` 必须自动跳过该节点而不是挂起，若所有节点不可用则按现有策略返回友好错误。
2. **长 SSE 连接的流式稳定性与背压**：大 token 输出时，分批的 `http_res_chunk` 帧在服务端解出 Buffer 后必须正确推入可读流，不能出现内存泄漏或数据截断。
3. **客户端提前中断 (AbortSignal) 资源释放**：当终端用户取消生成时，必须验证 `http_abort` 正确送达远端且 Agent 端的 outgoing request 被立即 `destroy()`。
4. **远端网络异常穿透**：当 Agent 遇到 DNS 解析失败（`ENOTFOUND`）或连接超时，必须通过 `http_res_error` 及时回传给服务端并触发 upstream 熔断计数。
5. **Base64 编解码一致性**：多字节 UTF-8 字符（如中文、特殊 Unicode 符号）在分块切片传输时不发生乱码。

---

### Task 1: 扩展 Upstream 配置类型与解析器

**Files:**
- Modify: `src/types/index.ts:100-128`
- Modify: `config/default.ts:119-160`
- Test: `tests/configAgentUpstream.test.ts`

**Interfaces:**
- Produces: 
  - `UpstreamServerType = 'proxy' | 'direct' | 'agent'`
  - `UpstreamServerConfig.agentId?: string`
  - `parseUpstreamServers()` 支持识别 `type: 'agent'` 并提取 `agentId`

- [ ] **Step 1: 编写失败测试**

创建 `tests/configAgentUpstream.test.ts`，验证 `parseUpstreamServers` 能正确解析 `type: 'agent'` 配置并校验 `agentId`：

```typescript
import { parseUpstreamServers } from '../config/default';

describe('parseUpstreamServers - agent type', () => {
  it('correctly parses an agent upstream config item', () => {
    const raw = [
      {
        type: 'agent',
        agentId: 'hk-vps-node',
        url: 'https://generativelanguage.googleapis.com',
        weight: 3,
        enabled: true,
        name: 'HK Agent Node'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('agent');
    expect(servers[0].agentId).toBe('hk-vps-node');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].weight).toBe(3);
  });

  it('defaults url to official Gemini endpoint if url is omitted for agent type', () => {
    const raw = [
      {
        type: 'agent',
        agentId: 'us-node'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('agent');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].agentId).toBe('us-node');
  });

  it('rejects agent upstream without agentId', () => {
    const raw = [
      {
        type: 'agent',
        url: 'https://generativelanguage.googleapis.com'
      }
    ];
    const servers = parseUpstreamServers(raw);
    // Should fallback to default because agent item without agentId is invalid
    expect(servers[0].type).not.toBe('agent');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/configAgentUpstream.test.ts`
Expected: FAIL (Type error or property missing)

- [ ] **Step 3: 实现配置与类型变更**

1. 修改 `src/types/index.ts`：
```typescript
export type UpstreamServerType = 'proxy' | 'direct' | 'agent';

export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: UpstreamServerType;
  apiKeys?: string[];
  agentId?: string;
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
  serverType: UpstreamServerType;
  selectedApiKey?: string;
  agentId?: string;
}
```

2. 修改 `config/default.ts` 中的 `parseUpstreamServers` 函数：
```typescript
      const type: UpstreamServerType = (item.type === 'direct' || item.type === 'agent') ? item.type : 'proxy';
      const agentId = item.agentId ? String(item.agentId).trim() : undefined;
      if (type === 'agent' && !agentId) {
        return null;
      }
      let url = String(item.url || '').trim().replace(/\/+$/, '');
      if ((type === 'direct' || type === 'agent') && !url) {
        url = 'https://generativelanguage.googleapis.com';
      }
```
并在返回对象中带上 `agentId`。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/configAgentUpstream.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/types/index.ts config/default.ts tests/configAgentUpstream.test.ts
git commit -m "feat(upstream): support agent upstream server type and agentId configuration"
```

---

### Task 2: TerminalHostManager 提供 Agent 状态与 WebSocket 访问接口

**Files:**
- Modify: `src/terminal/services/terminalHostManager.ts`
- Test: `tests/terminalHostManagerAgent.test.ts`

**Interfaces:**
- Produces:
  - `terminalHostManager.isAgentOnline(agentIdentifier: string): boolean`
  - `terminalHostManager.getAgentWs(agentIdentifier: string): any | null`

- [ ] **Step 1: 编写失败测试**

创建 `tests/terminalHostManagerAgent.test.ts`：
```typescript
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('TerminalHostManager Agent Accessors', () => {
  it('correctly reports online status and returns agentWs by ID or name', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    const hostId = 'agent-123456';
    const hostName = 'hk-vps';

    terminalHostManager.registerHost({
      id: hostId,
      name: hostName,
      hostname: 'vps-hk-1',
      ip: '1.2.3.4',
      platform: 'linux',
      type: 'agent'
    }, mockWs);

    expect(terminalHostManager.isAgentOnline(hostId)).toBe(true);
    expect(terminalHostManager.isAgentOnline(hostName)).toBe(true);
    expect(terminalHostManager.getAgentWs(hostId)).toBe(mockWs);
    expect(terminalHostManager.getAgentWs(hostName)).toBe(mockWs);

    // Unknown node
    expect(terminalHostManager.isAgentOnline('unknown')).toBe(false);
    expect(terminalHostManager.getAgentWs('unknown')).toBeNull();

    // After unregister
    terminalHostManager.unregisterHost(hostId);
    expect(terminalHostManager.isAgentOnline(hostName)).toBe(false);
    expect(terminalHostManager.getAgentWs(hostName)).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/terminalHostManagerAgent.test.ts`
Expected: FAIL (`isAgentOnline is not a function`)

- [ ] **Step 3: 在 `TerminalHostManager` 中实现方法**

修改 `src/terminal/services/terminalHostManager.ts`，添加：
```typescript
  public isAgentOnline(agentIdentifier?: string): boolean {
    if (!agentIdentifier) return false;
    const hostId = this.resolveCanonicalHostId(agentIdentifier);
    if (!hostId) return false;
    const host = this.hosts.get(hostId);
    if (!host || host.status !== 'online') return false;
    const session = this.sessions.get(hostId);
    if (!session) return false;
    const ws = session.getAgentWs();
    return Boolean(ws && ws.readyState === 1);
  }

  public getAgentWs(agentIdentifier?: string): any | null {
    if (!agentIdentifier) return null;
    const hostId = this.resolveCanonicalHostId(agentIdentifier);
    if (!hostId) return null;
    const session = this.sessions.get(hostId);
    if (!session) return null;
    const ws = session.getAgentWs();
    if (ws && ws.readyState === 1) {
      return ws;
    }
    return null;
  }
```

- [ ] **Step 4: 运行���试验证通过**

Run: `npx jest tests/terminalHostManagerAgent.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/terminal/services/terminalHostManager.ts tests/terminalHostManagerAgent.test.ts
git commit -m "feat(terminal): add isAgentOnline and getAgentWs methods to TerminalHostManager"
```

---

### Task 3: UpstreamManager 集成 Agent 在线健康检查与调度

**Files:**
- Modify: `src/utils/upstreamManager.ts:50-160`
- Test: `tests/upstreamManagerAgent.test.ts`

**Interfaces:**
- Consumes:
  - `terminalHostManager.isAgentOnline(agentId)`
- Produces:
  - `UpstreamManager.getUpstreamUrl(...)` 能够返回 `serverType: 'agent'` 及 `agentId`，并且仅调度当前在线的 Agent

- [ ] **Step 1: 编写失败测试**

创建 `tests/upstreamManagerAgent.test.ts`：
```typescript
import { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('UpstreamManager Agent Scheduling', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    upstreamManager.reset();
  });

  it('skips agent server if agent is offline and selects fallback proxy', async () => {
    await updateConfig({
      upstreamServers: [
        {
          type: 'agent',
          agentId: 'remote-hk',
          url: 'https://generativelanguage.googleapis.com',
          weight: 10,
          enabled: true
        },
        {
          type: 'proxy',
          url: 'https://fallback-proxy.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    // remote-hk is offline
    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('proxy');
    expect(selection.serverUrl).toBe('https://fallback-proxy.com');
  });

  it('selects agent server when agent is online', async () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerHost({
      id: 'agent-id-1',
      name: 'remote-hk',
      hostname: 'vps',
      ip: '1.1.1.1',
      platform: 'linux',
      type: 'agent'
    }, mockWs);

    await updateConfig({
      upstreamServers: [
        {
          type: 'agent',
          agentId: 'remote-hk',
          url: 'https://generativelanguage.googleapis.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('agent');
    expect(selection.agentId).toBe('remote-hk');
    expect(selection.serverUrl).toBe('https://generativelanguage.googleapis.com');

    terminalHostManager.unregisterHost('agent-id-1');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/upstreamManagerAgent.test.ts`
Expected: FAIL (Agent online check not integrated)

- [ ] **Step 3: 修改 `UpstreamManager`**

在 `src/utils/upstreamManager.ts` 中引入 `terminalHostManager`：
```typescript
import { terminalHostManager } from '../terminal/services/terminalHostManager';
```
在计算活跃��选节点（`activeCandidates`）逻辑中，增加对 `type === 'agent'` 的状态判断：
```typescript
    const isServerOnline = (s: UpstreamServerConfig) => {
      if (s.type === 'agent') {
        return terminalHostManager.isAgentOnline(s.agentId);
      }
      return true;
    };
```
将过滤条件更新为：
```typescript
    let activeCandidates = servers
      .map((s, idx) => ({ ...s, serverIndex: idx }))
      .filter(item => item.enabled && !this.isNodeIsolated(item.serverIndex) && isServerOnline(item));
```
并在 `getUpstreamUrl` 的返回对象中包含 `agentId: selectedServer.agentId`。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/upstreamManagerAgent.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/utils/upstreamManager.ts tests/upstreamManagerAgent.test.ts
git commit -m "feat(upstream): integrate agent online status check into upstream manager selection"
```

---

### Task 4: `gt.js` 端实现 `AgentProxyDispatcher` (出站 HTTP 转发)

**Files:**
- Modify: `scripts/gt.js`
- Test: `tests/agentProxyDispatcher.test.ts`

**Interfaces:**
- Produces:
  - `AgentProxyDispatcher` 类，处理 `http_req`, `http_abort`，发送 `http_res_start`, `http_res_chunk`, `http_res_end`, `http_res_error`
  - `ws.on('message')` 集成 `http_req` 与 `http_abort` 处理

- [ ] **Step 1: 编写单元测试**

创建 `tests/agentProxyDispatcher.test.ts`，验证 `AgentProxyDispatcher` 对 HTTP/HTTPS 请求的发送与流式响应转换：
```typescript
import http from 'http';
const { AgentProxyDispatcher } = require('../scripts/gt.js');

describe('AgentProxyDispatcher in gt.js', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (req.url === '/echo') {
        res.setHeader('content-type', 'text/plain');
        res.setHeader('x-custom-res', 'test-val');
        res.writeHead(200);
        res.write('Hello ');
        setTimeout(() => {
          res.end('World!');
        }, 10);
        return;
      }
      if (req.url === '/error') {
        res.destroy();
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('dispatches request and emits http_res_start, chunk, end frames', (done) => {
    const sentFrames: any[] = [];
    const dispatcher = new AgentProxyDispatcher((msg: any) => {
      sentFrames.push(msg);
      if (msg.type === 'http_res_end') {
        expect(sentFrames.find(f => f.type === 'http_res_start')).toBeDefined();
        const startFrame = sentFrames.find(f => f.type === 'http_res_start');
        expect(startFrame.status).toBe(200);
        expect(startFrame.headers['x-custom-res']).toBe('test-val');

        const chunks = sentFrames.filter(f => f.type === 'http_res_chunk');
        const text = chunks.map(c => Buffer.from(c.chunk, 'base64').toString('utf-8')).join('');
        expect(text).toBe('Hello World!');
        dispatcher.cleanup();
        done();
      }
    });

    dispatcher.handleRequest({
      requestId: 'test_req_1',
      method: 'GET',
      url: `http://127.0.0.1:${serverPort}/echo`,
      headers: { 'Accept': 'text/plain' },
      timeoutMs: 5000
    });
  });

  it('handles remote network error and emits http_res_error', (done) => {
    const dispatcher = new AgentProxyDispatcher((msg: any) => {
      if (msg.type === 'http_res_error') {
        expect(msg.requestId).toBe('test_err_req');
        expect(msg.error).toBeDefined();
        dispatcher.cleanup();
        done();
      }
    });

    dispatcher.handleRequest({
      requestId: 'test_err_req',
      method: 'GET',
      url: `http://127.0.0.1:1/unreachable`, // Port 1 is closed
      headers: {},
      timeoutMs: 2000
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/agentProxyDispatcher.test.ts`
Expected: FAIL (`AgentProxyDispatcher is not defined`)

- [ ] **Step 3: 在 `scripts/gt.js` 中实现 `AgentProxyDispatcher`**

在 `scripts/gt.js` 中新增类并导出给测试使用：
```javascript
class AgentProxyDispatcher {
  constructor(sendWsFn) {
    this.sendWs = sendWsFn;
    this.activeRequests = new Map();
  }

  handleRequest(data) {
    const { requestId, method = 'GET', url: targetUrl, headers = {}, body, timeoutMs = 180000 } = data;
    if (!requestId || !targetUrl) return;

    try {
      const parsedUrl = new url.URL(targetUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const reqHeaders = { ...headers };
      let bodyBuf = null;
      if (body) {
        bodyBuf = Buffer.from(body, 'base64');
        reqHeaders['content-length'] = bodyBuf.length;
      }

      const reqOptions = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: method.toUpperCase(),
        headers: reqHeaders,
      };

      const clientReq = client.request(reqOptions, (res) => {
        this.sendWs({
          type: 'http_res_start',
          requestId,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
        });

        res.on('data', (chunk) => {
          this.sendWs({
            type: 'http_res_chunk',
            requestId,
            chunk: chunk.toString('base64'),
          });
        });

        res.on('end', () => {
          this.cleanupRequest(requestId);
          this.sendWs({
            type: 'http_res_end',
            requestId,
          });
        });
      });

      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.cleanupRequest(requestId);
          clientReq.destroy(new Error(`Agent request timeout after ${timeoutMs}ms`));
          this.sendWs({
            type: 'http_res_error',
            requestId,
            error: { code: 'ETIMEDOUT', message: `Agent request timeout after ${timeoutMs}ms` },
          });
        }, timeoutMs);
        if (timer.unref) timer.unref();
      }

      clientReq.on('error', (err) => {
        this.cleanupRequest(requestId);
        this.sendWs({
          type: 'http_res_error',
          requestId,
          error: { code: err.code || 'UNKNOWN', message: err.message },
        });
      });

      this.activeRequests.set(requestId, { clientReq, timer });

      if (bodyBuf) {
        clientReq.write(bodyBuf);
      }
      clientReq.end();
    } catch (err) {
      this.cleanupRequest(requestId);
      this.sendWs({
        type: 'http_res_error',
        requestId,
        error: { code: 'BAD_REQUEST', message: err.message },
      });
    }
  }

  handleAbort(data) {
    const { requestId } = data;
    const entry = this.activeRequests.get(requestId);
    if (entry) {
      if (entry.clientReq) {
        try { entry.clientReq.destroy(); } catch {}
      }
      this.cleanupRequest(requestId);
    }
  }

  cleanupRequest(requestId) {
    const entry = this.activeRequests.get(requestId);
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      this.activeRequests.delete(requestId);
    }
  }

  cleanup() {
    for (const [id, entry] of this.activeRequests.entries()) {
      if (entry.clientReq) {
        try { entry.clientReq.destroy(); } catch {}
      }
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.activeRequests.clear();
  }
}
```

在 `gt.js` 的 agent 运行流程中实例化 `agentProxyDispatcher`，并在 `ws.on('message')` 中接入：
```javascript
if (control.type === 'http_req') {
  agentProxyDispatcher.handleRequest(control);
  return;
}
if (control.type === 'http_abort') {
  agentProxyDispatcher.handleAbort(control);
  return;
}
```
并在文件末尾导出：
```javascript
if (typeof module !== 'undefined' && module.exports) {
  module.exports.AgentProxyDispatcher = AgentProxyDispatcher;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/agentProxyDispatcher.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add scripts/gt.js tests/agentProxyDispatcher.test.ts
git commit -m "feat(gt): implement AgentProxyDispatcher for http egress proxy in gt agent"
```

---

### Task 5: 服务端实现 `agentProxyService` (适配器与 WebSocket 协议状态机)

**Files:**
- Create: `src/proxy/services/agentProxyService.ts`
- Test: `tests/agentProxyService.test.ts`

**Interfaces:**
- Consumes:
  - `terminalHostManager.getAgentWs(agentId)`
- Produces:
  - `agentProxyService.agentFetch(agentId, targetUrl, options)`

- [ ] **Step 1: 编写单元测试**

创建 `tests/agentProxyService.test.ts`：
```typescript
import { EventEmitter } from 'events';
import agentProxyService from '../src/proxy/services/agentProxyService';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

class MockWs extends EventEmitter {
  public readyState = 1;
  public sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }
}

describe('agentProxyService', () => {
  let mockWs: MockWs;
  const agentId = 'test-agent';

  beforeEach(() => {
    mockWs = new MockWs();
    terminalHostManager.registerHost({
      id: 'agent-uuid',
      name: agentId,
      hostname: 'test-vps',
      ip: '127.0.0.1',
      platform: 'linux',
      type: 'agent'
    }, mockWs);
  });

  afterEach(() => {
    terminalHostManager.unregisterHost('agent-uuid');
  });

  it('successfully streams response chunks from remote agent', async () => {
    const fetchPromise = agentProxyService.agentFetch(agentId, 'https://generativelanguage.googleapis.com/test', {
      method: 'POST',
      headers: { 'x-test': '123' },
      body: JSON.stringify({ hello: 'world' })
    });

    // Check sent frame
    expect(mockWs.sent).toHaveLength(1);
    const reqFrame = JSON.parse(mockWs.sent[0].replace(/^JSON:/, ''));
    expect(reqFrame.type).toBe('http_req');
    expect(reqFrame.url).toBe('https://generativelanguage.googleapis.com/test');
    const reqId = reqFrame.requestId;

    // Simulate Agent responding
    mockWs.emit('message', JSON.stringify({
      type: 'http_res_start',
      requestId: reqId,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' }
    }));

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    // Simulate Streaming Chunks
    const receivedChunks: Buffer[] = [];
    response.body.on('data', (c: Buffer) => receivedChunks.push(c));

    mockWs.emit('message', JSON.stringify({
      type: 'http_res_chunk',
      requestId: reqId,
      chunk: Buffer.from('data: {"text":"hi"}\n\n').toString('base64')
    }));

    mockWs.emit('message', JSON.stringify({
      type: 'http_res_end',
      requestId: reqId
    }));

    await new Promise((resolve) => response.body.on('end', resolve));
    expect(Buffer.concat(receivedChunks).toString('utf-8')).toBe('data: {"text":"hi"}\n\n');
  });

  it('rejects if agent is not connected', async () => {
    await expect(
      agentProxyService.agentFetch('offline-agent', 'https://example.com')
    ).rejects.toThrow(/not online/i);
  });

  it('sends http_abort when AbortController aborts', async () => {
    const abortController = new AbortController();
    const fetchPromise = agentProxyService.agentFetch(agentId, 'https://example.com', {
      signal: abortController.signal
    });

    const reqFrame = JSON.parse(mockWs.sent[0].replace(/^JSON:/, ''));
    const reqId = reqFrame.requestId;

    abortController.abort();

    const abortFrame = mockWs.sent.map(s => JSON.parse(s.replace(/^JSON:/, ''))).find(f => f.type === 'http_abort');
    expect(abortFrame).toBeDefined();
    expect(abortFrame.requestId).toBe(reqId);

    await expect(fetchPromise).rejects.toThrow(/aborted/i);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/agentProxyService.test.ts`
Expected: FAIL (`Cannot find module agentProxyService`)

- [ ] **Step 3: 实现 `src/proxy/services/agentProxyService.ts`**

编写 `src/proxy/services/agentProxyService.ts`：
```typescript
import { PassThrough } from 'stream';
import { terminalHostManager } from '../../terminal/services/terminalHostManager';
import { generateShortId } from '../../utils/requestHelper';
import logger from '../../utils/logger';

export interface AgentFetchResponse {
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
    raw(): Record<string, string[]>;
  };
  body: NodeJS.ReadableStream;
}

export interface AgentFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class AgentProxyService {
  public async agentFetch(
    agentId: string,
    targetUrl: string,
    options: AgentFetchOptions = {}
  ): Promise<AgentFetchResponse> {
    const ws = terminalHostManager.getAgentWs(agentId);
    if (!ws) {
      throw new Error(`Target egress agent "${agentId}" is not online or connected.`);
    }

    const requestId = 'req_' + generateShortId();
    const { method = 'GET', headers = {}, body, signal, timeoutMs = 180000 } = options;

    if (signal?.aborted) {
      throw new Error('This operation was aborted');
    }

    let bodyBase64: string | undefined = undefined;
    if (body) {
      bodyBase64 = Buffer.isBuffer(body)
        ? body.toString('base64')
        : Buffer.from(String(body), 'utf-8').toString('base64');
    }

    const passThrough = new PassThrough();

    return new Promise<AgentFetchResponse>((resolve, reject) => {
      let isResolved = false;
      let cleanup: () => void;

      const onMessage = (rawMsg: any) => {
        try {
          const str = typeof rawMsg === 'string' ? rawMsg : rawMsg.toString();
          const cleanStr = str.startsWith('JSON:') ? str.slice(5) : str;
          const msg = JSON.parse(cleanStr);

          if (!msg || msg.requestId !== requestId) return;

          if (msg.type === 'http_res_start') {
            isResolved = true;
            const resHeaders = msg.headers || {};
            const headersObj = {
              get(name: string) {
                const lower = name.toLowerCase();
                for (const [k, v] of Object.entries(resHeaders)) {
                  if (k.toLowerCase() === lower) {
                    return Array.isArray(v) ? v.join(', ') : String(v);
                  }
                }
                return null;
              },
              raw() {
                const res: Record<string, string[]> = {};
                for (const [k, v] of Object.entries(resHeaders)) {
                  res[k] = Array.isArray(v) ? v.map(String) : [String(v)];
                }
                return res;
              }
            };

            resolve({
              status: msg.status || 200,
              statusText: msg.statusText || 'OK',
              headers: headersObj,
              body: passThrough
            });
            return;
          }

          if (msg.type === 'http_res_chunk') {
            if (msg.chunk) {
              const buf = Buffer.from(msg.chunk, 'base64');
              passThrough.write(buf);
            }
            return;
          }

          if (msg.type === 'http_res_end') {
            passThrough.end();
            cleanup();
            return;
          }

          if (msg.type === 'http_res_error') {
            const err = new Error(msg.error?.message || 'Remote agent request failed');
            (err as any).code = msg.error?.code;
            if (!isResolved) {
              reject(err);
            } else {
              passThrough.destroy(err);
            }
            cleanup();
            return;
          }
        } catch {
          // Ignore non-json or unrelated frames
        }
      };

      const onAbort = () => {
        try {
          if (ws.readyState === 1) {
            ws.send('JSON:' + JSON.stringify({ type: 'http_abort', requestId, reason: 'Client aborted' }));
          }
        } catch {}
        const err = new Error('This operation was aborted');
        if (!isResolved) {
          reject(err);
        } else {
          passThrough.destroy(err);
        }
        cleanup();
      };

      cleanup = () => {
        if (typeof ws.off === 'function') {
          ws.off('message', onMessage);
        } else if (typeof ws.removeListener === 'function') {
          ws.removeListener('message', onMessage);
        }
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (typeof ws.on === 'function') {
        ws.on('message', onMessage);
      }
      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      // Send http_req frame
      try {
        ws.send('JSON:' + JSON.stringify({
          type: 'http_req',
          requestId,
          method,
          url: targetUrl,
          headers,
          body: bodyBase64,
          timeoutMs
        }));
      } catch (err: any) {
        cleanup();
        reject(new Error(`Failed to send request frame to agent: ${err.message}`));
      }
    });
  }
}

export const agentProxyService = new AgentProxyService();
export default agentProxyService;
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/agentProxyService.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/proxy/services/agentProxyService.ts tests/agentProxyService.test.ts
git commit -m "feat(proxy): implement agentProxyService for HTTP-over-WebSocket tunnel fetch"
```

---

### Task 6: 控制器层接入 Agent 出口路由

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts:80-140`
- Modify: `src/proxy/controllers/geminiController.ts:130-180`
- Test: `tests/claudeControllerAgentEgress.test.ts`

**Interfaces:**
- Consumes:
  - `serverSelection.serverType === 'agent'`
  - `agentProxyService.agentFetch(...)`

- [ ] **Step 1: 编写测试**

创建 `tests/claudeControllerAgentEgress.test.ts`：
```typescript
import request from 'supertest';
import express from 'express';
import claudeRoutes from '../src/proxy/routes/claudeRoutes';
import agentProxyService from '../src/proxy/services/agentProxyService';
import upstreamManager from '../src/utils/upstreamManager';
import { updateConfig } from '../config/default';

jest.mock('../src/proxy/services/agentProxyService');

const app = express();
app.use(express.json());
app.use(claudeRoutes);

describe('ClaudeController Agent Egress Routing', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    upstreamManager.reset();
  });

  it('routes request through agentFetch when selected upstream is an agent', async () => {
    const mockAgentFetch = jest.spyOn(agentProxyService, 'agentFetch').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        raw: () => ({ 'content-type': ['application/json'] })
      },
      body: (function* () {
        yield Buffer.from(JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: 'response from agent' }] } }]
        }));
      })() as any
    });

    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      serverUrl: 'https://generativelanguage.googleapis.com',
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
      serverIndex: 0,
      weight: 1,
      serverType: 'agent',
      agentId: 'mock-agent'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'valid-key')
      .send({
        model: 'claude-3-7-sonnet-20250219',
        messages: [{ role: 'user', content: 'hello' }]
      });

    expect(mockAgentFetch).toHaveBeenCalledWith(
      'mock-agent',
      expect.stringContaining('generateContent'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(res.status).toBe(200);
    expect(res.body.content[0].text).toBe('response from agent');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/claudeControllerAgentEgress.test.ts`
Expected: FAIL (Claude controller calls node-fetch instead of agentProxyService)

- [ ] **Step 3: 修改 `claudeController.ts` 与 `geminiController.ts`**

在 `src/proxy/controllers/claudeController.ts` 导入：
```typescript
import agentProxyService from '../services/agentProxyService';
```
在流式和非流式两处分支中，替换直接 `fetch(targetUrl, ...)`：
```typescript
        const executeFetch = (serverType === 'agent' && serverSelection.agentId)
          ? (u: string, o: any) => agentProxyService.agentFetch(serverSelection.agentId!, u, o)
          : (fetch as any);

        const response = await executeFetch(targetUrl, {
          method: 'POST',
          headers: upstreamHeaders,
          body: JSON.stringify(gemReq),
          signal: streamManager.signal
        });
```

同样在 `src/proxy/controllers/geminiController.ts` 中针对 Native 模式做对应改动。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/claudeControllerAgentEgress.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts tests/claudeControllerAgentEgress.test.ts
git commit -m "feat(controllers): route requests through agentProxyService when serverType is agent"
```

---

### Task 7: 端到端集成测试 (E2E Integration Testing)

**Files:**
- Create: `tests/agentEgressE2E.test.ts`

**Interfaces:**
- Consumes:
  - 启动真实 Express App + WebSocket Server
  - 运行 `AgentProxyDispatcher` 模拟真实海外 Agent 建立反向 WS
  - 模拟 Google Upstream Mock Server
  - 发送 `/v1/messages` (SSE stream) 与 `/v1beta/models/...` (Native) 请求并验证完整数据流

- [ ] **Step 1: 编写完整的端到端测试**

创建 `tests/agentEgressE2E.test.ts`：
```typescript
import http from 'http';
import express from 'express';
import request from 'supertest';
import claudeRoutes from '../src/proxy/routes/claudeRoutes';
import geminiRoutes from '../src/proxy/routes/geminiRoutes';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';
import { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
const { AgentProxyDispatcher } = require('../scripts/gt.js');

describe('E2E Agent Egress Proxy Flow', () => {
  let mockGoogleServer: http.Server;
  let googlePort: number;

  beforeAll((done) => {
    // 1. Mock Google Gemini Upstream
    mockGoogleServer = http.createServer((req, res) => {
      if (req.url?.includes(':streamGenerateContent')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        });
        res.write('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Streamed via "}]}}]}\n\n');
        setTimeout(() => {
          res.write('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Overseas Agent!"}]}}]}\n\n');
          res.end();
        }, 30);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Native Response via Agent' }] } }]
      }));
    });

    mockGoogleServer.listen(0, '127.0.0.1', () => {
      googlePort = (mockGoogleServer.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    mockGoogleServer.close(done);
  });

  it('successfully executes end-to-end Claude SSE stream through simulated gt agent', async () => {
    const app = express();
    app.use(express.json());
    app.use(claudeRoutes);
    app.use(geminiRoutes);

    // 2. Setup Mock WebSocket linking TerminalHostManager and AgentProxyDispatcher
    let agentDispatcher: any = null;
    const mockWs = {
      readyState: 1,
      send: (data: string) => {
        const str = data.replace(/^JSON:/, '');
        const json = JSON.parse(str);
        if (json.type === 'http_req' || json.type === 'http_abort') {
          agentDispatcher.handleRequest(json);
        }
      },
      on: (event: string, fn: any) => {
        mockWsListeners.push(fn);
      },
      removeListener: () => {}
    };
    const mockWsListeners: any[] = [];

    agentDispatcher = new AgentProxyDispatcher((msg: any) => {
      for (const listener of mockWsListeners) {
        listener(JSON.stringify(msg));
      }
    });

    terminalHostManager.registerHost({
      id: 'hk-agent-id',
      name: 'hk-vps-agent',
      hostname: 'vps',
      ip: '127.0.0.1',
      platform: 'linux',
      type: 'agent'
    }, mockWs);

    await updateConfig({
      upstreamServers: [
        {
          type: 'agent',
          agentId: 'hk-vps-agent',
          url: `http://127.0.0.1:${googlePort}`,
          weight: 1,
          enabled: true
        }
      ]
    });

    // 3. Send Claude stream request to our Express app
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'claude-3-7-sonnet-20250219',
        stream: true,
        messages: [{ role: 'user', content: 'test stream' }]
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('Overseas Agent!');

    terminalHostManager.unregisterHost('hk-agent-id');
    agentDispatcher.cleanup();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx jest tests/agentEgressE2E.test.ts`
Expected: PASS

- [ ] **Step 3: 运行完整测试套件验证无回归**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 4: 提交代码**

```bash
git add tests/agentEgressE2E.test.ts
git commit -m "test: add comprehensive end-to-end integration tests for gt agent egress proxy"
```

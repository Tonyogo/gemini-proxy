# 出站 HTTP/SOCKS5 代理功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现全局及单节点粒度的 HTTP/HTTPS/SOCKS5 出站代理机制，让无翻墙直连能力的服务器通过代理服务正常访问 Google Gemini 官方接口与外部服务。

**Architecture:** 
1. 引入轻量级无编译依赖的 `proxy-agent` 作为底层网络 Agent 驱动，支持 HTTP/HTTPS/SOCKS4/SOCKS5 全协议；
2. 建立 `src/utils/proxyAgentManager.ts` 集中管理 Agent 实例池与解析优先级（Node proxyUrl > Global proxyUrl > ENV）；
3. 扩展 `UpstreamServerConfig` 和 `config/default.ts`，支持节点级和全局级 `proxyUrl` 配置及持久化；
4. 在 `claudeController`、`geminiController` 及 `accountService` 的 `fetch` 调用中挂载对应 `agent`；
5. 在前端 `ConfigModal` 及国际化语言包中添加全局代理和节点专属代理的可视化配置。

**Tech Stack:** TypeScript, Node.js, `proxy-agent`, `node-fetch`, React, TailwindCSS, Jest.

**Spec:** In-chat bounded design for HTTP/SOCKS5 proxy egress.

## Global Constraints

- **deploy.yml 零改动**：绝对不触碰 `.github/workflows/deploy.yml`。
- **向下兼容与零性能损耗**：未配置代理时，`agent` 为 `undefined`，完全走系统原生网络协议栈，无任何中间层开销。
- **全量测试通过**：保证现有 99 个测试套件及新增代理测试 100% PASS。

## Review Focus

1. 当代理 URL 格式非法时（如非 URI 字符串），`proxyAgentManager` 能够安全优雅降级并打印 warning，绝不导致服务崩溃。
2. 节点级代理与全局代理的优先级层级准确（节点配置优先；节点为空则使用全局；全局为空则直连）。
3. 动态通过 Admin API 更新 `proxyUrl` 时能实时热重载，无需重启服务。
4. 前端保存配置时正确回传 `proxyUrl`，Direct 模式与 Proxy 模式均支持设置独立代理。
5. 测试用例中对 `proxyAgentManager` 的单元测试覆盖全面（覆盖协议解析、单例缓存、优先级回退）。

---

### Task 1: 引入 proxy-agent 依赖并实现 ProxyAgentManager

**Files:**
- Modify: `package.json`
- Create: `src/utils/proxyAgentManager.ts`
- Test: `tests/proxyAgentManager.test.ts`

**Interfaces:**
- Produces: 
  - `proxyAgentManager.getAgent(nodeProxyUrl?: string): http.Agent | undefined`
  - `proxyAgentManager.resolveProxyUrl(nodeProxyUrl?: string): string | undefined`
  - `proxyAgentManager.clearCache(): void`

- [x] **Step 1: 安装 proxy-agent 生产依赖**

```bash
npm install proxy-agent --allow-remote=all
```
验证 `package.json` 的 `dependencies` 包含 `proxy-agent`。

- [x] **Step 2: 编写 proxyAgentManager 单元测试**

创建 `tests/proxyAgentManager.test.ts`：
```ts
import proxyAgentManager from '../src/utils/proxyAgentManager';
import config from '../config/default';

describe('ProxyAgentManager', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    proxyAgentManager.clearCache();
    (config as any).proxyUrl = undefined;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns undefined when no proxy is configured', () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.ALL_PROXY;
    expect(proxyAgentManager.getAgent()).toBeUndefined();
    expect(proxyAgentManager.resolveProxyUrl()).toBeUndefined();
  });

  test('prioritizes node-level proxyUrl over global config and env', () => {
    (config as any).proxyUrl = 'http://global-proxy:8080';
    process.env.HTTPS_PROXY = 'http://env-proxy:8080';
    
    const resolved = proxyAgentManager.resolveProxyUrl('socks5://127.0.0.1:1080');
    expect(resolved).toBe('socks5://127.0.0.1:1080');
    
    const agent = proxyAgentManager.getAgent('socks5://127.0.0.1:1080');
    expect(agent).toBeDefined();
  });

  test('falls back to global config proxyUrl when node proxyUrl is not provided', () => {
    (config as any).proxyUrl = 'http://127.0.0.1:7890';
    delete process.env.HTTPS_PROXY;

    const resolved = proxyAgentManager.resolveProxyUrl(undefined);
    expect(resolved).toBe('http://127.0.0.1:7890');
    expect(proxyAgentManager.getAgent()).toBeDefined();
  });

  test('falls back to environment variable HTTPS_PROXY when neither node nor global is set', () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:8888';
    const resolved = proxyAgentManager.resolveProxyUrl();
    expect(resolved).toBe('http://127.0.0.1:8888');
  });

  test('reuses cached Agent instances for identical proxy URLs', () => {
    const agent1 = proxyAgentManager.getAgent('http://127.0.0.1:7890');
    const agent2 = proxyAgentManager.getAgent('http://127.0.0.1:7890');
    expect(agent1).toBe(agent2);
  });
});
```

- [x] **Step 3: 运行测试验证失败**

运行：`npx jest tests/proxyAgentManager.test.ts`
预期：FAIL，`src/utils/proxyAgentManager.ts` 不存在。

- [x] **Step 4: 实现 proxyAgentManager.ts**

创建 `src/utils/proxyAgentManager.ts`：
```ts
import http from 'http';
import { ProxyAgent } from 'proxy-agent';
import config from '../../config/default';
import logger from './logger';

export class ProxyAgentManager {
  private agentCache: Map<string, http.Agent> = new Map();

  public resolveProxyUrl(nodeProxyUrl?: string): string | undefined {
    if (nodeProxyUrl && typeof nodeProxyUrl === 'string' && nodeProxyUrl.trim()) {
      return nodeProxyUrl.trim();
    }
    if (config.proxyUrl && typeof config.proxyUrl === 'string' && config.proxyUrl.trim()) {
      return config.proxyUrl.trim();
    }
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    if (envProxy && typeof envProxy === 'string' && envProxy.trim()) {
      return envProxy.trim();
    }
    return undefined;
  }

  public getAgent(nodeProxyUrl?: string): http.Agent | undefined {
    const proxyUrl = this.resolveProxyUrl(nodeProxyUrl);
    if (!proxyUrl) {
      return undefined;
    }

    if (this.agentCache.has(proxyUrl)) {
      return this.agentCache.get(proxyUrl);
    }

    try {
      const agent = new ProxyAgent({ getProxyForUrl: () => proxyUrl }) as unknown as http.Agent;
      this.agentCache.set(proxyUrl, agent);
      return agent;
    } catch (err: any) {
      logger.warn(`Failed to initialize ProxyAgent for "${proxyUrl}": ${err?.message || err}`);
      return undefined;
    }
  }

  public clearCache(): void {
    this.agentCache.clear();
  }
}

const proxyAgentManager = new ProxyAgentManager();
export default proxyAgentManager;
```

- [x] **Step 5: 重新运行测试验证通过**

运行：`npx jest tests/proxyAgentManager.test.ts`
预期：PASS。

- [x] **Step 6: 提交代码**

```bash
git add package.json package-lock.json src/utils/proxyAgentManager.ts tests/proxyAgentManager.test.ts
git commit -m "feat(proxy): add ProxyAgentManager supporting HTTP and SOCKS5 egress"
```

---

### Task 2: 配置项与类型定义扩展

**Files:**
- Modify: `src/types/index.ts:100-130`
- Modify: `config/default.ts`
- Modify: `src/admin/controllers/adminController.ts`
- Test: `tests/proxyConfigIntegration.test.ts`

**Interfaces:**
- `UpstreamServerConfig` 增加 `proxyUrl?: string`
- `config` 增加 `proxyUrl?: string`
- `/api/admin/status` 返回 `proxyUrl`
- `/api/admin/config` 支持动态修改 `proxyUrl` 并写入 `runtime.json`

- [x] **Step 1: 编写配置解析与热更新测试**

创建 `tests/proxyConfigIntegration.test.ts`：
```ts
import config, { parseUpstreamServers, updateConfig } from '../config/default';

describe('Proxy Config Integration', () => {
  test('parseUpstreamServers correctly parses proxyUrl', () => {
    const servers = parseUpstreamServers([
      { url: 'https://generativelanguage.googleapis.com', proxyUrl: 'http://127.0.0.1:7890' }
    ]);
    expect(servers[0].proxyUrl).toBe('http://127.0.0.1:7890');
  });

  test('updateConfig persists and reloads proxyUrl', async () => {
    await updateConfig({ proxyUrl: 'socks5://127.0.0.1:1080' });
    expect(config.proxyUrl).toBe('socks5://127.0.0.1:1080');

    // Clean up
    await updateConfig({ proxyUrl: '' });
    expect(config.proxyUrl).toBe('');
  });
});
```

- [x] **Step 2: 更新 types/index.ts**

在 `src/types/index.ts` 中：
```ts
export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: UpstreamServerType;
  apiKeys?: string[];
  proxyUrl?: string; // 可选出站代理
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
  serverType: UpstreamServerType;
  selectedApiKey?: string;
  proxyUrl?: string; // 选定节点的代理
}
```

- [x] **Step 3: 更新 config/default.ts 与 adminController.ts**

1. `config/default.ts`：
   - 支持解析 `process.env.GLOBAL_PROXY_URL || process.env.PROXY_URL || ''`；
   - `parseUpstreamServers` 提取 `item.proxyUrl`；
   - `runtimeOverrides` 支持读取与覆写 `proxyUrl`；
   - 在 getter 中暴露 `proxyUrl`。
2. `src/admin/controllers/adminController.ts`：
   - `getStatus` 接口将 `config.proxyUrl` 包含在响应体中；
   - `updateConfig` 允许更新 `proxyUrl`。

- [x] **Step 4: 运行测试验证**

运行：`npx jest tests/proxyConfigIntegration.test.ts`
预期：PASS。

- [x] **Step 5: 提交代码**

```bash
git add src/types/index.ts config/default.ts src/admin/controllers/adminController.ts tests/proxyConfigIntegration.test.ts
git commit -m "feat(config): support global and per-node proxyUrl configuration"
```

---

### Task 3: 后端请求链路挂载 ProxyAgent

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts`
- Modify: `src/proxy/controllers/geminiController.ts`
- Modify: `src/admin/services/accountService.ts`
- Modify: `src/utils/upstreamManager.ts`
- Test: `tests/proxyEgressExecution.test.ts`

**Interfaces:**
- Consumes: `proxyAgentManager.getAgent(serverSelection.proxyUrl)`
- Produces: `fetch(url, { ...options, agent })`

- [x] **Step 1: 编写出站挂载 agent 测试**

创建 `tests/proxyEgressExecution.test.ts`：
```ts
import request from 'supertest';
import app from '../src/app';
import proxyAgentManager from '../src/utils/proxyAgentManager';
import config, { updateConfig } from '../config/default';

describe('Proxy Egress Execution', () => {
  test('injects proxy agent into upstream fetch call when proxyUrl is configured', async () => {
    const getAgentSpy = jest.spyOn(proxyAgentManager, 'getAgent');
    await updateConfig({ proxyUrl: 'http://127.0.0.1:9999' });

    // Send a request to trigger upstream fetch
    await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'hello' }]
      });

    expect(getAgentSpy).toHaveBeenCalled();
    getAgentSpy.mockRestore();
    await updateConfig({ proxyUrl: '' });
  });
});
```

- [x] **Step 2: 修改 upstreamManager.ts**

在 `selectServer` 和 `getUpstreamUrl` 的返回结构 `UpstreamServerSelection` 中，包含选定节点的 `proxyUrl: selected.proxyUrl`。

- [x] **Step 3: 修改 claudeController.ts、geminiController.ts 与 accountService.ts**

在每个发出 `fetch` 的调用处引入 `proxyAgentManager`��
```ts
const agent = proxyAgentManager.getAgent(serverSelection?.proxyUrl);

const response = await fetch(targetUrl, {
  method: 'POST',
  headers: upstreamHeaders,
  body: JSON.stringify(gemReq),
  signal: streamManager.signal,
  agent
});
```

- [x] **Step 4: 运行所有测试**

运行：`npx jest tests/proxyEgressExecution.test.ts`
预期：PASS。

- [x] **Step 5: 提交代码**

```bash
git add src/utils/upstreamManager.ts src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts src/admin/services/accountService.ts tests/proxyEgressExecution.test.ts
git commit -m "feat(proxy): mount ProxyAgent into upstream fetch calls in controllers and services"
```

---

### Task 4: 前端 ConfigModal 可视化代理配置与国际化

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/configModalProxyUi.test.ts`

**Interfaces:**
- Consumes: `ConfigModal.tsx`
- Produces: 
  - 全局配置区域的“全局出站代理”输入框
  - 上游节点卡片内部的“出站代理 (可选)”输入框

- [x] **Step 1: 编写 ConfigModal 代理 UI 单测**

创建 `tests/configModalProxyUi.test.ts`：
```ts
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Proxy UI Integration', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(modalPath, 'utf-8');
  });

  test('ConfigModal should manage proxyUrl state', () => {
    expect(content).toContain('const [proxyUrl, setProxyUrl] = useState<string>');
    expect(content).toContain('proxyUrl: proxyUrl.trim()');
  });

  test('ConfigModal should render global proxy input', () => {
    expect(content).toContain("t('config.globalProxyTitle'");
    expect(content).toContain("t('config.globalProxyPlaceholder'");
  });

  test('ConfigModal should render per-node proxy input in upstream server cards', () => {
    expect(content).toContain("t('config.nodeProxyTitle'");
  });
});
```

- [x] **Step 2: 更新 ConfigModal.tsx**

1. 增加 `proxyUrl` 全局状态管理；
2. 在全局网络设置区域渲染全局代理输入框，占位提示：`http://127.0.0.1:7890 或 socks5://127.0.0.1:10808`；
3. 在节点卡片中（包括 Proxy 与 Direct 模式），提供 `proxyUrl` 输入框，占位提示：`留空继承全局代理`；
4. 保存配置时将 `proxyUrl` 包含在全局对象与 `upstreamServers` 数组中。

- [x] **Step 3: 更新语言包 zh.ts 与 en.ts**

添加配置项说明：
- `globalProxyTitle`: "全局出站代理" / "Global Egress Proxy"
- `globalProxyDesc`: "支持 HTTP / HTTPS / SOCKS5 代理。服务器无法直连 Google 时配置" / "Supports HTTP / HTTPS / SOCKS5 proxy when server cannot reach Google"
- `globalProxyPlaceholder`: "http://127.0.0.1:7890 或 socks5://127.0.0.1:10808 (留空直连)" / "http://127.0.0.1:7890 or socks5://... (empty for direct)"
- `nodeProxyTitle`: "专属出站代理 (可选)" / "Node Egress Proxy (Optional)"
- `nodeProxyPlaceholder`: "留空继承全局代理" / "Leave blank to inherit global proxy"

- [x] **Step 4: 运行前端构建与测试**

运行：
```bash
cd frontend && npm run build && cd ..
npx jest tests/configModalProxyUi.test.ts
```
预期：0 警告，构建成功，单测全部 PASS。

- [x] **Step 5: 提交代码**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/configModalProxyUi.test.ts
git commit -m "feat(ui): add global and per-node egress proxy configuration in ConfigModal"
```

---

### Task 5: 全量回归测试与文档更新

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [x] **Step 1: 文档与环境变量模板更新**

1. 在 `README.md` 中添加“正向出站代理支持 (HTTP / SOCKS5)”说明，指导用户如何在受限网络下通过 `PROXY_URL` 或 Web 控制台无缝代理访问 Google 官方接口；
2. 在 `.env.example` 中补充 `GLOBAL_PROXY_URL=http://127.0.0.1:7890` 配置说明；
3. 在 `CLAUDE.md` 中记录 `proxyAgentManager` 架构设计与动态代理调度机制。

- [x] **Step 2: 执行全量构建与全部测试套件**

运行：
```bash
npm run build
npm test
```
预期：全部编译无误，所有测试套件（100+ suites）全部 PASS。

- [x] **Step 3: 检查 Git 状态并提交**

```bash
git add README.md .env.example CLAUDE.md
git commit -m "docs: document HTTP/SOCKS5 egress proxy feature and env configurations"
```

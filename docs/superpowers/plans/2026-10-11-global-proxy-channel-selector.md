# 全局代理与服务器节点代理通道切换实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将出站代理的配置模式优化为“全局一次配置代理地址，各服务器节点胶囊切换（本机直连 / 代理通道）”，与原 Agent 通道交互体验保持一致，消除在每个节点重复输入代理 URL 的冗余。

**Architecture:** 
1. 全局配置层维护单一的 `config.proxyUrl`（支持 Web 控制台设置及 `GLOBAL_PROXY_URL` / `HTTPS_PROXY` 环境变量）；
2. 上游节点配置 `UpstreamServerConfig` 引入 `useProxy?: boolean` 标志位（默认为 `false` 本机直连）；
3. `ProxyAgentManager` 扩展支持节点级判断：显式 `useProxy: false` 的节点直接走本机原生网络（绕过全局代理），仅 `useProxy: true` 的节点挂载全局代理 Agent；
4. 前端 `ConfigModal.tsx` 移除每个节点卡片中的专属代理文本输入框，统一替换为经典的胶囊分段按钮（Segmented Pill）：`[ 本机直连 ]` 与 `[ 代理通道 ]`，并动态指示当前是否挂载���局代理；
5. 更新单测套件、国际化文件与说明文档。

**Tech Stack:** TypeScript, Node.js, `proxy-agent`, `node-fetch`, React 18, TailwindCSS, Jest.

**Spec:** In-chat bounded design for Global Proxy with Node-level Channel Selector.

## Global Constraints

- **deploy.yml 零改动**：绝对不触碰 `.github/workflows/deploy.yml`。
- **配置向后兼容**：若节点历史数据存在 `proxyUrl`，自动将其视为 `useProxy: true`，平滑升级无缝迁移。
- **隔离精确**：当全局配置了代理但节点选择了 `本机直连` (`useProxy: false`) 时，该节点的请求必须绝对走原生网络直出，不得挂载代理。
- **全量测试通过**：现有全部测试套件（103 个 suites）及新增测试必须保持 100% PASS。

## Review Focus

1. 当全局代理已配置时，未开启代理通道（`useProxy: false`）的节点发起的请求不会走代理连接池。
2. 当节点开启了代理通道（`useProxy: true`）但全局未填写代理地址时，系统能优雅回退至直连并给出提示，不发生未捕获异常。
3. 前端切换 Direct / Proxy 节点模式时，`useProxy` 状态正确保留并在保存时成功持久化至 `runtime.json`。
4. 环境变量或字符串解析 `parseUpstreamServers` 支持 `#useProxy=true` / `#useProxy=false` 参数。
5. 界面中 Direct 模式与 Proxy 模式均呈现统一的 `[ 本机直连 ]` / `[ 代理通道 ]` 切换控件。

---

### Task 1: 扩展类型定义与 ProxyAgentManager 节点级调度

**Files:**
- Modify: `src/types/index.ts:100-130`
- Modify: `src/utils/proxyAgentManager.ts:1-50`
- Test: `tests/proxyAgentManager.test.ts`

**Interfaces:**
- `UpstreamServerConfig` 扩展：`useProxy?: boolean`
- `UpstreamServerSelection` 扩展：`useProxy?: boolean`
- `proxyAgentManager.getAgent(target?: string | { useProxy?: boolean; proxyUrl?: string }): http.Agent | undefined`

- [x] **Step 1: 编写支持节点级 useProxy 开关的测试用例**

修改 `tests/proxyAgentManager.test.ts`，增加节点选择开关断言：
```ts
test('returns undefined when node explicitly sets useProxy: false even if global proxy is configured', () => {
  (config as any).proxyUrl = 'http://127.0.0.1:7890';
  expect(proxyAgentManager.getAgent({ useProxy: false })).toBeUndefined();
});

test('returns global proxy agent when node sets useProxy: true without custom proxyUrl', () => {
  (config as any).proxyUrl = 'http://127.0.0.1:7890';
  const agent = proxyAgentManager.getAgent({ useProxy: true });
  expect(agent).toBeDefined();
});

test('returns undefined when node sets useProxy: true but no global or node proxy is configured', () => {
  (config as any).proxyUrl = undefined;
  delete process.env.HTTPS_PROXY;
  delete process.env.HTTP_PROXY;
  expect(proxyAgentManager.getAgent({ useProxy: true })).toBeUndefined();
});
```

- [x] **Step 2: 运行测试验证失败**

运行：`npx jest tests/proxyAgentManager.test.ts`
预期：FAIL（新断言失败，`proxyAgentManager.getAgent` 尚未处理对象参数与 `useProxy`）。

- [x] **Step 3: 更新 types/index.ts**

修改 `src/types/index.ts`：
```ts
export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: UpstreamServerType;
  apiKeys?: string[];
  proxyUrl?: string;
  useProxy?: boolean; // 新增：是否走代理通道
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
  serverType: UpstreamServerType;
  selectedApiKey?: string;
  proxyUrl?: string;
  useProxy?: boolean; // 新增：选定节点是否走代理通道
}
```

- [x] **Step 4: 更新 src/utils/proxyAgentManager.ts**

修改 `src/utils/proxyAgentManager.ts`：
```ts
export class ProxyAgentManager {
  private agentCache: Map<string, http.Agent> = new Map();

  public resolveProxyUrl(nodeProxyUrl?: string): string | undefined {
    if (nodeProxyUrl && typeof nodeProxyUrl === 'string' && nodeProxyUrl.trim()) {
      return nodeProxyUrl.trim();
    }
    if ((config as any).proxyUrl && typeof (config as any).proxyUrl === 'string' && (config as any).proxyUrl.trim()) {
      return (config as any).proxyUrl.trim();
    }
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    if (envProxy && typeof envProxy === 'string' && envProxy.trim()) {
      return envProxy.trim();
    }
    return undefined;
  }

  public getAgent(target?: string | { useProxy?: boolean; proxyUrl?: string }): http.Agent | undefined {
    if (typeof target === 'object' && target !== null) {
      if (target.useProxy === false) {
        return undefined; // 显式选择本机直连，不走代理
      }
      return this.getAgent(target.proxyUrl);
    }

    const proxyUrl = this.resolveProxyUrl(target);
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
```

- [x] **Step 5: 重新运行测试验证通过**

运行：`npx jest tests/proxyAgentManager.test.ts`
预期：PASS。

- [x] **Step 6: 提交代码**

```bash
git add src/types/index.ts src/utils/proxyAgentManager.ts tests/proxyAgentManager.test.ts
git commit -m "feat(proxy): support node-level useProxy channel flag in ProxyAgentManager"
```

---

### Task 2: 配置解析与控制器出站对接

**Files:**
- Modify: `config/default.ts:120-220`
- Modify: `src/utils/upstreamManager.ts:160-220`
- Modify: `src/proxy/controllers/claudeController.ts`
- Modify: `src/proxy/controllers/geminiController.ts`
- Test: `tests/proxyConfigIntegration.test.ts`
- Test: `tests/proxyEgressExecution.test.ts`

**Interfaces:**
- `parseUpstreamServers` 支持解析 `useProxy` 字段和 URL 参数 `#useProxy=true`
- `upstreamManager.selectServer` 返回包含 `useProxy: selected.useProxy` 的选择对象
- 控制器调用 `proxyAgentManager.getAgent(serverSelection)` 挂载 agent

- [x] **Step 1: 编写配置与出站集成测试**

修改 `tests/proxyConfigIntegration.test.ts`，增加对 `useProxy` 解析的测试：
```ts
test('parseUpstreamServers correctly parses useProxy boolean and URL param', () => {
  const servers = parseUpstreamServers([
    { url: 'https://generativelanguage.googleapis.com', useProxy: true },
    { url: 'https://api.example.com#useProxy=false' }
  ]);
  expect(servers[0].useProxy).toBe(true);
  expect(servers[1].useProxy).toBe(false);
});
```

修改 `tests/proxyEgressExecution.test.ts`，测试节点粒度选择：
```ts
test('does not use proxy agent when selected node has useProxy: false even with global proxy set', async () => {
  const getAgentSpy = jest.spyOn(proxyAgentManager, 'getAgent');
  await updateConfig({
    proxyUrl: 'http://127.0.0.1:9999',
    upstreamServers: [{ url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, useProxy: false }]
  });

  await request(app)
    .post('/v1/messages')
    .set('x-api-key', 'dummy-key')
    .send({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'test' }] });

  expect(getAgentSpy).toHaveBeenCalledWith(expect.objectContaining({ useProxy: false }));
  getAgentSpy.mockRestore();
  await updateConfig({ proxyUrl: '' });
});
```

- [x] **Step 2: 更新 config/default.ts**

在 `parseUpstreamServers` 中提取 `useProxy`：
```ts
// 1. JSON Array
const useProxy = item.useProxy !== undefined
  ? Boolean(item.useProxy)
  : (item.proxyUrl ? true : false);
...
if (useProxy !== undefined) res.useProxy = useProxy;

// 2. String input params
if (paramPart) {
  const params = new URLSearchParams(paramPart);
  if (params.has('useProxy')) {
    useProxy = params.get('useProxy') === 'true';
  }
}
```

- [x] **Step 3: 更新 upstreamManager.ts**

在 `selectServer` 和 `getUpstreamUrl` 中返回的 `UpstreamServerSelection` 对象中加上：
```ts
useProxy: selected.useProxy,
```

- [x] **Step 4: 更新 claudeController.ts 与 geminiController.ts**

将 `proxyAgentManager.getAgent(serverSelection?.proxyUrl)` 改为传递整个 `serverSelection` 对象：
```ts
const agent = proxyAgentManager.getAgent(serverSelection);
```
（涵盖 `claudeController` 的 streaming、non-streaming、count_tokens、models，以及 `geminiController` 的 streaming 和 non-streaming）。

- [x] **Step 5: ��行相关单测**

运行：`npx jest tests/proxyConfigIntegration.test.ts tests/proxyEgressExecution.test.ts`
预期：PASS。

- [x] **Step 6: 提交代码**

```bash
git add config/default.ts src/utils/upstreamManager.ts src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts tests/proxyConfigIntegration.test.ts tests/proxyEgressExecution.test.ts
git commit -m "feat(proxy): wire node useProxy selection into upstream routing and controllers"
```

---

### Task 3: 前端 ConfigModal 界面重构与国际化

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/configModalProxyUi.test.ts`
- Test: `tests/i18nAgentEgress.test.ts`

**Interfaces:**
- 移除各节点内部的 `专属出站代理 (可选)` 单独输入框
- 在 Direct 模式与 Proxy 模式节点卡片中渲染统一的“出口通道”胶囊按钮：
  `[ 本机直连 ]` (`useProxy: false`) vs `[ 代理通道 ]` (`useProxy: true`)
- 当选中 `代理通道` 时，若全局代理已配置，显示微型徽标 `全局代理: http://...`；若未配置全局代理，显示友好黄色徽标 `未配置全局代理`

- [x] **Step 1: 编写 ConfigModal 胶囊 UI 单测**

修改 `tests/configModalProxyUi.test.ts`：
```ts
test('ConfigModal should render egress channel segmented switcher for upstream nodes', () => {
  expect(content).toContain("t('config.egressChannelTitle'");
  expect(content).toContain("t('config.egressLocalShort'");
  expect(content).toContain("t('config.egressProxyShort'");
});

test('ConfigModal should remove per-node proxy input textboxes', () => {
  expect(content).not.toContain("t('config.nodeProxyTitle'");
});

test('ConfigModal should save useProxy boolean in upstreamServers', () => {
  expect(content).toContain('useProxy: Boolean(s.useProxy)');
});
```

- [x] **Step 2: 更新语言包 zh.ts 与 en.ts**

在 `frontend/src/i18n/locales/zh.ts` 与 `en.ts` 的 `config` 命名空间下：
```ts
// zh.ts
egressChannelTitle: "出口通道",
egressLocalShort: "本机直连",
egressProxyShort: "代理通道",
viaGlobalProxyBadge: "全局代理: {proxy}",
globalProxyNotConfigured: "需配置全局代理",

// en.ts
egressChannelTitle: "Egress Channel",
egressLocalShort: "Local Direct",
egressProxyShort: "Proxy Channel",
viaGlobalProxyBadge: "Global Proxy: {proxy}",
globalProxyNotConfigured: "Global Proxy Required",
```

- [x] **Step 3: 重构 ConfigModal.tsx**

1. 在 `upstreamServers` 状态管理和保存逻辑中保留 `useProxy: Boolean(s.useProxy)`；
2. 移除节点卡片中的 `nodeProxyTitle` 文本框；
3. 在 Direct 模式卡片中，渲染：
   ```tsx
   <div className="flex items-center space-x-1.5">
     <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
     <span className="text-[11px] font-semibold text-cyan-400">{t('config.egressChannelTitle', '出口通道')}</span>
     <div className="inline-flex rounded-md p-0.5 bg-slate-950 border border-slate-700/80 ml-1">
       <button
         type="button"
         onClick={() => {
           const updated = [...upstreamServers];
           updated[idx] = { ...updated[idx], useProxy: false };
           setUpstreamServers(updated);
         }}
         className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
           !server.useProxy ? 'bg-cyan-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:text-slate-200'
         }`}
       >
         {t('config.egressLocalShort', '本机直连')}
       </button>
       <button
         type="button"
         onClick={() => {
           const updated = [...upstreamServers];
           updated[idx] = { ...updated[idx], useProxy: true };
           setUpstreamServers(updated);
         }}
         className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
           Boolean(server.useProxy) ? 'bg-cyan-600 text-white shadow-xs font-semibold' : 'text-slate-400 hover:text-slate-200'
         }`}
       >
         {t('config.egressProxyShort', '代理通道')}
       </button>
     </div>
   </div>
   ```
4. 在 Proxy 模式卡片中，同样在右上角或节点底部加入相同的轻量胶囊按钮；
5. 在旁边动态显示 `全局代理: {proxy}` 或 `需配置全局代理` 徽标。

- [x] **Step 4: 运行前端构建与相关测试**

运行：
```bash
cd frontend && npm run build && cd ..
npx jest tests/configModalProxyUi.test.ts tests/i18nAgentEgress.test.ts
```
预期：前端构建通过，0 警告，单测全部 PASS。

- [x] **Step 5: 提交代码**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/configModalProxyUi.test.ts tests/i18nAgentEgress.test.ts
git commit -m "refactor(ui): streamline proxy configuration with global URL and node egress pill switcher"
```

---

### Task 4: 说明文档与环境模板对齐

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [x] **Step 1: 更新 README.md、CLAUDE.md 与 .env.example**

1. `README.md`：介绍更新后的正向代理方案——在顶部配置好全局代理地址（`HTTP_PROXY` / `SOCKS5`），在每个上游服务器节点通过直观的胶囊按钮一键切换“本机直连”或“代理通道”；
2. `CLAUDE.md`：更新配置模型说明，记录 `UpstreamServerConfig.useProxy` 与全局 `proxyUrl` 的协同机制；
3. `.env.example`：保持简洁清晰的全局代理配置注释��

- [x] **Step 2: 提交文档变更**

```bash
git add README.md .env.example CLAUDE.md
git commit -m "docs: update egress proxy docs to reflect global proxy with per-node channel pill switcher"
```

---

### Task 5: 全量回归测试与构建验证

**Files:** None (全量验证)

- [x] **Step 1: 执行全量构建**

运行：`npm run build`
预期：
1. `npm run build:frontend` 成功构建，0 Circular chunk 警告；
2. `npm run build:backend` (`tsc`) 成功构建，0 编译错误。

- [x] **Step 2: 执行全量自动化测试套件**

运行：`npm test`
预期：所有测试套件全部 PASS。

- [x] **Step 3: 检查 Git 状态**

运行：`git status`
预期：工作区干净，无未追踪文件，`.github/workflows/deploy.yml` 零变动。

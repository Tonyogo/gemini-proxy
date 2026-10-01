# 直连模式 Agent 出口通道配置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底重构 Upstream 概念模型，收敛类型为 `proxy | direct`。将 Agent 作为直连模式（`direct`）下的可选出口通道（`agentId`），并在前端系统配置管理页面（`ConfigModal.tsx`）中实现精美的出口通道切换、Agent 节点动态选择与状态联动。

**Architecture:** 
- 后端数据模型：移除 `UpstreamServerType` 中的 `'agent'`，收敛为 `'proxy' | 'direct'`。在 `config/default.ts`、`src/types/index.ts`、`src/utils/upstreamManager.ts` 中将 Agent 识别为 `type === 'direct' && agentId` 的网络通道。
- 控制器层：`claudeController.ts` 与 `geminiController.ts` 直接基于是否有 `agentId` 决定是否走 `agentProxyService`，与 API Key 池正交解耦。
- 前端管理页面：`ConfigModal.tsx` 在节点选择「直连模式 (Direct)」时，展开「网络出口通道」单选（本机出站 / Agent 出口）与动态节点选择器（调用 `/api/terminal/hosts` 获取在线主机），配合中英文国际化。

**Tech Stack:** TypeScript, React, TailwindCSS, Express, Node.js, Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-01-direct-mode-agent-egress-design.md`

## Global Constraints

- 彻底移除 `type: 'agent'`，统一规范为 `type: 'proxy' | 'direct'`，不再保留对 `type: 'agent'` 的兼容代码。
- 直连模式下，无论是本机出站还是 Agent 出站，均无缝支持 `apiKeys` 密钥池轮换，也可以留空透传客户端 Key。
- 前端组件与 i18n 遵循项目现有的设计风格（Linear / TailwindCSS 深色风格、中英多语言双向同步）。
- 所有改动必须通过完整回归测试，包括前端构建 (`npm run build:frontend`) 和后端测试 (`npm test`)。

## Review Focus

1. **配置解析的一致性**：当 JSON 配置传入 `type: 'direct'` 且附带 `agentId` 时，解析出 `type: 'direct'` 并保留 `agentId`；若无 `agentId` 则 `agentId` 为 `undefined`。
2. **调度感知的准确性**：配置了 `agentId` 的直连节点，在其绑定的 Agent 掉线时必须自动跳过调度；本机直连节点（��� `agentId`）不受 Agent 状态影响。
3. **控制器路由无死角**：无论流式 (SSE) 还是非流式，只要节点带有 `agentId`，均调用 `agentProxyService.agentFetch`，并正确传递轮换 key 或客户端 key。
4. **前端状态切换干净**：在 `ConfigModal` 中，从 Agent 出口切回“本机出站”时，对应节点的 `agentId` 必须被正确清空，不能残留在提交保存的 payload 中。
5. **多语言完整性**：所有新出现的 UI 标签和提示必须在 `zh.ts` 与 `en.ts` 中同时存在，不出现缺失 key。

---

### Task 1: 数据类型与后端配置解析重构 (去除 `type: 'agent'`)

**Files:**
- Modify: `src/types/index.ts:100-130`
- Modify: `config/default.ts:120-250`
- Modify: `tests/configAgentUpstream.test.ts`

**Interfaces:**
- Produces:
  - `export type UpstreamServerType = 'proxy' | 'direct';`
  - `UpstreamServerConfig.agentId?: string` (只作为 direct 模式的出口标记)
  - `parseUpstreamServers()` 仅解析 `proxy` 与 `direct`

- [ ] **Step 1: 编写/更新失败测试**

修改 `tests/configAgentUpstream.test.ts`，验证新的契约规范：
```typescript
import { parseUpstreamServers } from '../config/default';

describe('parseUpstreamServers - direct mode with agentId egress', () => {
  it('correctly parses direct upstream with agentId egress channel', () => {
    const raw = [
      {
        type: 'direct',
        agentId: 'hk-vps-node',
        url: 'https://generativelanguage.googleapis.com',
        weight: 3,
        enabled: true,
        name: 'HK Agent Direct Node',
        apiKeys: ['key-1', 'key-2']
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('direct');
    expect(servers[0].agentId).toBe('hk-vps-node');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].weight).toBe(3);
    expect(servers[0].apiKeys).toEqual(['key-1', 'key-2']);
  });

  it('correctly parses direct upstream with local egress (no agentId)', () => {
    const raw = [
      {
        type: 'direct',
        name: 'Local Direct Node'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('direct');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].agentId).toBeUndefined();
  });

  it('does not recognize type: agent, defaults to proxy', () => {
    const raw = [
      {
        type: 'agent',
        url: 'https://custom-proxy.com'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers[0].type).toBe('proxy');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/configAgentUpstream.test.ts`
Expected: FAIL

- [ ] **Step 3: 修改 `src/types/index.ts` 和 `config/default.ts`**

1. 修改 `src/types/index.ts`：
```typescript
export type UpstreamServerType = 'proxy' | 'direct';

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

export interface UpstreamServerStatus extends UpstreamServerConfig {
  serverIndex: number;
  effectivePercent: number;
  consecutiveFailures: number;
  isIsolated: boolean;
  isolatedUntil: number;
  lastError?: string;
  keyCount?: number;
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

2. 修改 `config/default.ts` 中的 `parseUpstreamServers()`：
```typescript
      const type: UpstreamServerType = item.type === 'direct' ? 'direct' : 'proxy';
      const agentId = (type === 'direct' && item.agentId) ? String(item.agentId).trim() : undefined;
      let url = String(item.url || '').trim().replace(/\/+$/, '');
      if (type === 'direct' && !url) {
        url = 'https://generativelanguage.googleapis.com';
      }
```
清理掉所有带有 `item.type === 'agent'` 的旧逻辑。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/configAgentUpstream.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/types/index.ts config/default.ts tests/configAgentUpstream.test.ts
git commit -m "refactor(upstream): converge UpstreamServerType to proxy and direct with agentId egress channel"
```

---

### Task 2: 调度器与控制器重构 (`UpstreamManager` & Controllers)

**Files:**
- Modify: `src/utils/upstreamManager.ts:55-80, 275-300`
- Modify: `src/proxy/controllers/claudeController.ts:85-115, 295-325`
- Modify: `src/proxy/controllers/geminiController.ts:100-125, 205-230`
- Modify: `tests/upstreamManagerAgent.test.ts`
- Modify: `tests/claudeControllerAgentEgress.test.ts`

**Interfaces:**
- Consumes:
  - `terminalHostManager.isAgentOnline(agentId)`
  - `serverSelection.agentId`
- Produces:
  - `UpstreamManager` 仅在 `server.type === 'direct' && server.agentId` 时检测 Agent 在线状态
  - 控制器只要 `agentId` 存在即走 `agentProxyService.agentFetch`，`serverType` 为 `'direct'`

- [ ] **Step 1: 更新单元测试**

1. 修改 `tests/upstreamManagerAgent.test.ts`：
```typescript
import { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('UpstreamManager Agent Egress Scheduling', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    upstreamManager.reset();
  });

  it('skips direct server with offline agent and selects fallback proxy', async () => {
    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
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

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('proxy');
    expect(selection.serverUrl).toBe('https://fallback-proxy.com');
  });

  it('selects direct server with agent egress when agent is online', async () => {
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
          type: 'direct',
          agentId: 'remote-hk',
          url: 'https://generativelanguage.googleapis.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('direct');
    expect(selection.agentId).toBe('remote-hk');
    expect(selection.serverUrl).toBe('https://generativelanguage.googleapis.com');

    terminalHostManager.unregisterHost('agent-id-1');
  });

  it('does not skip direct server with local egress (no agentId)', async () => {
    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
          url: 'https://generativelanguage.googleapis.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('direct');
    expect(selection.agentId).toBeUndefined();
  });
});
```

2. 修改 `tests/claudeControllerAgentEgress.test.ts`：
将 mock 的 `serverType` 改为 `'direct'`，带有 `agentId: 'mock-agent'`。

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/upstreamManagerAgent.test.ts tests/claudeControllerAgentEgress.test.ts`
Expected: FAIL

- [ ] **Step 3: 修改 `upstreamManager.ts`、`claudeController.ts` 和 `geminiController.ts`**

1. 修改 `src/utils/upstreamManager.ts`：
```typescript
    const isServerOnline = (s: UpstreamServerConfig) => {
      if (s.type === 'direct' && s.agentId) {
        return terminalHostManager.isAgentOnline(s.agentId);
      }
      return true;
    };
```
在 `getUpstreamUrl` 中：
```typescript
    const selection: UpstreamUrlSelection = {
      serverUrl: selectedServer.url,
      serverIndex: selectedIndex,
      targetUrl,
      weight: selectedServer.weight || 1,
      serverType: selectedServer.type === 'direct' ? 'direct' : 'proxy',
      selectedApiKey,
      agentId: selectedServer.agentId
    };
```

2. ���改 `src/proxy/controllers/claudeController.ts`（流式与非流式分支）：
```typescript
        const executeFetch = (serverSelection.agentId)
          ? (u: string, o: any) => agentProxyService.agentFetch(serverSelection.agentId!, u, o)
          : (fetch as any);
```

3. 同样修改 `src/proxy/controllers/geminiController.ts`（两处 executeFetch）。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/upstreamManagerAgent.test.ts tests/claudeControllerAgentEgress.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/utils/upstreamManager.ts src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts tests/upstreamManagerAgent.test.ts tests/claudeControllerAgentEgress.test.ts
git commit -m "refactor(controllers): simplify agent egress routing based on agentId in direct mode"
```

---

### Task 3: 国际化词条扩充 (zh.ts & en.ts)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/i18nAgentEgress.test.ts`

**Interfaces:**
- Produces:
  - `config.egressChannelTitle`, `config.egressLocal`, `config.egressLocalDesc`
  - `config.egressAgent`, `config.egressAgentDesc`, `config.selectAgent`, `config.noAgentsAvailable`

- [ ] **Step 1: 编写 i18n 单元测试**

创建 `tests/i18nAgentEgress.test.ts`：
```typescript
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('i18n locales for Agent Egress Channel', () => {
  const keys = [
    'egressChannelTitle',
    'egressLocal',
    'egressLocalDesc',
    'egressAgent',
    'egressAgentDesc',
    'selectAgent',
    'noAgentsAvailable'
  ];

  it('contains all egress channel translation keys in zh and en', () => {
    for (const key of keys) {
      expect((zh.config as any)[key]).toBeDefined();
      expect(typeof (zh.config as any)[key]).toBe('string');
      expect((en.config as any)[key]).toBeDefined();
      expect(typeof (en.config as any)[key]).toBe('string');
    }
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/i18nAgentEgress.test.ts`
Expected: FAIL

- [ ] **Step 3: 在 `zh.ts` 与 `en.ts` 中添加词条**

1. 修改 `frontend/src/i18n/locales/zh.ts` 的 `config` 下：
```typescript
    egressChannelTitle: "网络出口通道",
    egressLocal: "本机直接出站 (Local Direct)",
    egressLocalDesc: "由服务器本机网络直接发起向 Google 官方接口的请求",
    egressAgent: "借道 Agent 节点出口 (Remote Agent Egress)",
    egressAgentDesc: "通过反向 WebSocket 隧道将请求借道已连接的海外节点发出",
    selectAgent: "选择出站 Agent 节点...",
    noAgentsAvailable: "暂无在线可用的 Agent 节点",
```

2. 修改 `frontend/src/i18n/locales/en.ts` 的 `config` 下：
```typescript
    egressChannelTitle: "Network Egress Channel",
    egressLocal: "Local Direct (Server Host)",
    egressLocalDesc: "Outbound requests are sent directly from this server host",
    egressAgent: "Remote Agent Egress",
    egressAgentDesc: "Tunnel outbound requests through a connected remote agent node via reverse WebSocket",
    selectAgent: "Select Egress Agent Node...",
    noAgentsAvailable: "No available online agent nodes connected",
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/i18nAgentEgress.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/i18nAgentEgress.test.ts
git commit -m "feat(i18n): add egress channel translations in Chinese and English"
```

---

### Task 4: 前端配置管理界面 (`ConfigModal.tsx`) 重构与出口通道交互

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:25-45, 100-150, 730-800, 915-950`
- Test: `npm run build:frontend`

**Interfaces:**
- Consumes:
  - `GET /api/terminal/hosts` 获取主机列表
  - `t('config.egressChannelTitle')` 等翻译
- Produces:
  - 直连模式下展示「网络出口通道」单选框组与 Agent 主机下拉选择器
  - 切换出站通道时正确设置 / 清除 `server.agentId`

- [ ] **Step 1: 检查现有 `UpstreamServerConfig` 定义与 Agent 主机状态**

在 `frontend/src/components/ConfigModal.tsx` 中：
1. 扩充类型接口：
```typescript
export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: 'proxy' | 'direct';
  apiKeys?: string[];
  agentId?: string;
}

export interface TerminalHostOption {
  id: string;
  name: string;
  ip: string;
  platform: string;
  status: 'online' | 'offline';
}
```

2. 在组件内新增状态管理：
```typescript
const [availableHosts, setAvailableHosts] = useState<TerminalHostOption[]>([]);
const [loadingHosts, setLoadingHosts] = useState<boolean>(false);
```

3. 实现拉取主机列表的函数：
```typescript
const fetchAvailableHosts = async () => {
  setLoadingHosts(true);
  try {
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    const res = await fetch('/api/terminal/hosts', { headers });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.hosts)) {
        setAvailableHosts(data.hosts);
      }
    }
  } catch {
    // Ignore fetch errors
  } finally {
    setLoadingHosts(false);
  }
};
```
在 `useEffect` 中当弹窗打开且处于 `upstream` tab 时调用 `fetchAvailableHosts()`。

- [ ] **Step 2: 渲染直连模式下的出口通道模块**

在 `server.type === 'direct'` 的配置区域中，紧随允许模型之后、API Keys 之前，增加出口通道选择区：
```tsx
{/* Direct Mode Egress Channel Selector */}
{server.type === 'direct' && (
  <div className="sm:col-span-12 space-y-2 mt-1 p-3 rounded-lg bg-slate-900/60 border border-cyan-500/20">
    <div className="flex items-center justify-between">
      <label className="text-[11px] font-semibold text-cyan-400 flex items-center space-x-1.5">
        <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
        <span>{t('config.egressChannelTitle', '网络出口通道')}</span>
      </label>
      {server.agentId && (
        <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
          Agent: {server.agentId}
        </span>
      )}
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
      {/* Option 1: Local Direct */}
      <label
        onClick={() => {
          const updated = [...upstreamServers];
          updated[idx] = { ...updated[idx], agentId: undefined };
          setUpstreamServers(updated);
        }}
        className={`p-2.5 rounded border cursor-pointer transition-all flex flex-col justify-between ${
          !server.agentId
            ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-100 shadow-sm'
            : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
        }`}
      >
        <div className="flex items-center space-x-2">
          <input
            type="radio"
            name={`egress_channel_${idx}`}
            checked={!server.agentId}
            onChange={() => {}}
            className="text-cyan-600 focus:ring-0 cursor-pointer"
          />
          <span className="font-semibold text-slate-200">{t('config.egressLocal', '本机直接出站 (Local Direct)')}</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 pl-5">
          {t('config.egressLocalDesc', '由服务器本机直接请求 Google 官方 API 接口')}
        </p>
      </label>

      {/* Option 2: Remote Agent */}
      <label
        onClick={() => {
          if (!server.agentId) {
            const firstOnline = availableHosts.find(h => h.status === 'online');
            const target = firstOnline ? firstOnline.name || firstOnline.id : (availableHosts[0]?.name || availableHosts[0]?.id || 'agent');
            const updated = [...upstreamServers];
            updated[idx] = { ...updated[idx], agentId: target };
            setUpstreamServers(updated);
          }
        }}
        className={`p-2.5 rounded border cursor-pointer transition-all flex flex-col justify-between ${
          server.agentId
            ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-100 shadow-sm'
            : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
        }`}
      >
        <div className="flex items-center space-x-2">
          <input
            type="radio"
            name={`egress_channel_${idx}`}
            checked={Boolean(server.agentId)}
            onChange={() => {}}
            className="text-cyan-600 focus:ring-0 cursor-pointer"
          />
          <span className="font-semibold text-slate-200">{t('config.egressAgent', '借道 Agent 节点出口 (Remote Agent Egress)')}</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 pl-5">
          {t('config.egressAgentDesc', '通过已连接的反向 WebSocket 隧道将请求借道远端节点发出')}
        </p>
      </label>
    </div>

    {/* Agent Host Dropdown when Remote Agent is selected */}
    {server.agentId && (
      <div className="pt-2 border-t border-cyan-500/10 flex items-center space-x-2">
        <div className="flex-1 relative">
          <select
            value={server.agentId}
            onChange={(e) => {
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], agentId: e.target.value };
              setUpstreamServers(updated);
            }}
            className="w-full ui-input p-2 text-xs font-mono bg-slate-950/80 border-cyan-500/30 text-cyan-200 cursor-pointer"
          >
            {availableHosts.length === 0 ? (
              <option value={server.agentId}>
                {server.agentId} ({t('config.noAgentsAvailable', '暂无在线 Agent')})
              </option>
            ) : (
              availableHosts.map((h) => {
                const identifier = h.name || h.id;
                const statusDot = h.status === 'online' ? '● 在线' : '○ 离线';
                return (
                  <option key={h.id} value={identifier}>
                    {statusDot} | {identifier} ({h.ip || 'no-ip'})
                  </option>
                );
              })
            )}
          </select>
        </div>
        <button
          type="button"
          onClick={fetchAvailableHosts}
          disabled={loadingHosts}
          title="刷新在线 Agent 列表"
          className="p-2 text-cyan-400 hover:text-cyan-200 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 rounded cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingHosts ? 'animate-spin' : ''}`} />
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: 运行前端构建测试**

Run: `npm run build:frontend`
Expected: PASS (No TypeScript or Vite compilation errors)

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): implement direct mode egress channel selector and agent dropdown in ConfigModal"
```

---

### Task 5: 全链路端到端回归测试 (E2E Regression Testing)

**Files:**
- Modify: `tests/agentEgressE2E.test.ts`
- Test: `npm test`

**Interfaces:**
- Consumes:
  - `type: 'direct'` + `agentId: 'hk-vps-agent'`
- Produces:
  - 确保重构后的 direct 模式借道 Agent 出口通过端到端 SSE 流式与普通请求全量测试

- [ ] **Step 1: 更新 `tests/agentEgressE2E.test.ts` 中的配置**

将上游配置更新为规范的 `type: 'direct'`：
```typescript
    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
          agentId: 'hk-vps-agent',
          url: `http://127.0.0.1:${googlePort}`,
          weight: 1,
          enabled: true
        }
      ]
    });
```

- [ ] **Step 2: 运行全量测试**

Run: `npm test`
Expected: ALL PASS (所有 177+ 个测试套件全部通过)

- [ ] **Step 3: 提交代码**

```bash
git add tests/agentEgressE2E.test.ts
git commit -m "test(e2e): update agent egress E2E tests for direct mode with agentId"
```

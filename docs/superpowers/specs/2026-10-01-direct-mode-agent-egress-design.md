# 直连模式 Agent 出口通道配置设计规范 (Spec Document)

- **作者**: Claude Assistant & yatao
- **日期**: 2026-10-01
- **状态**: Approved / Ready for Implementation
- **分类**: Architectural Spec

---

## 1. 概述与设计理念

### 1.1 背景
在此前实现中，Agent 作为一个独立的上游类型 `type: 'agent'` 存在。然而从网络拓扑和用户认知模型来看，“借道海外 Agent 访问 Google Upstream”本质上依然是访问 Google 官方 Gemini API，只是其**物理出口通道由本地宿主机切换到了海外 Agent 节点**。

### 1.2 目标
彻底重构上游类型体系，将系统概念模型收敛为两大基础模式：
1. **代理模式 (`proxy`)**：请求发往第三方反代 / 网关服务（如自建反代、Cloudflare Workers 等）。
2. **直连模式 (`direct`)**：请求直达 Google Gemini 官方 API（默认 `https://generativelanguage.googleapis.com`）。
   - **出口通道 (Egress Channel)**：
     - **本机直接出站 (Local Direct)**（默认，`agentId` 为空）：由 Gemini-Proxy 所在机器直接发起请求。
     - **借道 Agent 节点出口 (Remote Agent Egress)**（`agentId` 包含有效节点标识）：通过已有 WebSocket 隧道转发至远端 Agent 节点向 Google 发出。
   - 两种出口均完全支持配置专属 `apiKeys` 密钥池轮换，也可以留空直接透传客户端 Key。

彻底移除旧的 `type: 'agent'` 冗余分支，不需要兼容旧设计。

---

## 2. 数据模型与契约变更

### 2.1 类型定义 (`src/types/index.ts` & `frontend/src/components/ConfigModal.tsx`)

收敛 `UpstreamServerType` 仅包含 `proxy` 与 `direct`：

```typescript
export type UpstreamServerType = 'proxy' | 'direct';

export interface UpstreamServerConfig {
  url: string;              // 目标 URL（直连模式下默认为 https://generativelanguage.googleapis.com）
  weight: number;           // 调度权重 (1-1000)
  enabled: boolean;         // 是否启用
  name?: string;            // 节点备注名
  type?: UpstreamServerType;// 'proxy' | 'direct' (缺省为 'proxy')
  allowedModels?: string[]; // 允许调度的模型列表
  apiKeys?: string[];       // 直连模式专属 API Key 列表（轮换）
  agentId?: string;         // 仅当 type === 'direct' 时有效：绑定的出站 Agent ID；若未设置则为本机出站
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
  serverType: UpstreamServerType;
  selectedApiKey?: string;
  agentId?: string;         // 选中的出站 Agent ID（如有）
}
```

### 2.2 配置解析重构 (`config/default.ts`)

在 `parseUpstreamServers` 中严格按照 `proxy` / `direct` 模式解析：
```typescript
const type: UpstreamServerType = item.type === 'direct' ? 'direct' : 'proxy';
const agentId = (type === 'direct' && item.agentId) ? String(item.agentId).trim() : undefined;
let url = String(item.url || '').trim().replace(/\/+$/, '');
if (type === 'direct' && !url) {
  url = 'https://generativelanguage.googleapis.com';
}
```
不再识别 `type === 'agent'`。

---

## 3. 调度与控制器集成

### 3.1 调度与健康状态感知 (`src/utils/upstreamManager.ts`)

在 `UpstreamManager` 计算候选节点时，动态检查 Agent 的在线状态：
```typescript
const isServerOnline = (s: UpstreamServerConfig) => {
  // 仅对配置了 agentId 的直连节点进行 Agent 在线状态检测
  if (s.type === 'direct' && s.agentId) {
    return terminalHostManager.isAgentOnline(s.agentId);
  }
  // 本地直连或代理网关默认在线（由网络请求失败触发被动熔断）
  return true;
};
```
选出的目标节点返回 `serverType: 'direct'`，并附带选定的 `agentId`（若有）。

### 3.2 控制器统一出站路由 (`claudeController.ts` & `geminiController.ts`)

无论是流式（SSE）还是非流式调用，以 `agentId` 作为网络执行器的路由判定标准：
```typescript
const { targetUrl, serverUrl, serverIndex, serverType, selectedApiKey, agentId } = serverSelection;

// 1. 确定认证密钥：直连模式下优先使用轮换选中的 Key，否则透传客户端请求携带的 Key
const effectiveApiKey = (serverType === 'direct' && selectedApiKey)
  ? selectedApiKey
  : apiKey;
const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders);

// 2. 确定出站方式：只要存在 agentId，则借道 Agent 隧道；否则走本机直接 fetch
const executeFetch = agentId
  ? (u: string, o: any) => agentProxyService.agentFetch(agentId, u, o)
  : (fetch as any);

const response = await executeFetch(targetUrl, {
  method: 'POST',
  headers: upstreamHeaders,
  body: JSON.stringify(gemReq),
  signal: streamManager.signal
});
```

---

## 4. 前端配置管理界面 (`ConfigModal.tsx`)

### 4.1 数据拉取
- 打开配置弹窗或切换到 `upstream` 选项卡时，自动通过 `GET /api/terminal/hosts` 获取当前已注册的 Agent 列表（包含 `id`, `name`, `hostname`, `ip`, `status`）。

### 4.2 直连模式下的出口通道卡片
在节点卡片选择「直连模式 (Direct)」时，原有的配置结构扩展为：

1. **基本信息**：备注名、默认 URL (`https://generativelanguage.googleapis.com`)、权重、允许模型。
2. **网络出口通道 (Egress Channel)**：
   - 单选按钮 A：**本机直接出站 (Local Direct)**（默认）
     - 说明：“由服务器本机网络直接发起向 Google 官方接口的请求”。
     - 动作：将该节点的 `agentId` 置为 `undefined`。
   - 单选按钮 B：**借道 Agent 节点出口 (Remote Agent Egress)**
     - 下拉框：列出所有获取到的 Agent 主机，显示状态圆点（在线绿色/离线灰色）、主机名与 IP 地址。
     - 刷新小按钮：随时重新加载最新的 Agent 列表。
     - 动作：选中后绑定对应主机的 `name` 或 `id` 至 `agentId`。
3. **API Key 池配置**：保持不变，支持针对该直连节点配置多组官方密钥轮换。

### 4.3 国际化 (i18n)
在 `zh.ts` 和 `en.ts` 中增补以下键值：
- `config.egressChannelTitle`: "网络出口通道" / "Network Egress Channel"
- `config.egressLocal`: "本机直接出站 (Local Direct)" / "Local Direct (Server Host)"
- `config.egressLocalDesc`: "由服务器本机直接请求 Google 官方 API 接口" / "Outbound requests are sent directly from this server"
- `config.egressAgent`: "借道 Agent 节点出口 (Remote Agent Egress)" / "Remote Agent Egress"
- `config.egressAgentDesc`: "通过已连接的反向 WebSocket 隧道将请求借道远端节点发出" / "Tunnel outbound requests through a connected remote agent node via reverse WebSocket"
- `config.selectAgent`: "选择出站 Agent 节点" / "Select Egress Agent Node"
- `config.noAgentsAvailable`: "暂无可用的在线 Agent 节点" / "No available agent nodes connected"

---

## 5. 测试与验证策略

1. **配置解析单元测试 (`tests/configAgentUpstream.test.ts`)**：
   - 验证 `type: 'direct'` 配置带有 `agentId` 时能正确解析。
   - 验证已不再识别 `type: 'agent'`，统一规范化为 `type: 'proxy' | 'direct'`。
2. **调度单元测试 (`tests/upstreamManagerAgent.test.ts`)**：
   - 验证直连节点带 `agentId` 时，如果 Agent 离线，自动跳过该节点；Agent 上线后正常调度。
3. **控制器路由测试 (`tests/claudeControllerAgentEgress.test.ts`)**：
   - 验证 `serverType: 'direct'` 且有 `agentId` 时，控制器正确触发 `agentProxyService.agentFetch`。
4. **完整端到端测试 (`tests/agentEgressE2E.test.ts`)**：
   - 更新测试用例为 `type: 'direct', agentId: 'hk-vps-agent'`，断言直连模式经由 Agent 出口能够成功完成流式与非流式调用。

# 直连模式与代理模式双服务器类型架构设计规范

## 1. 概述与背景

当前系统的上游服务器集群配置（`UpstreamServerConfig`）默认上游节点为一个具有账号管理能力的代理服务（Proxy Server），系统向其转发请求，并通过 `/api/status` 与 `/api/accounts/*` 等接口进行多账号管理、凭据同步和在线状态探测。

为了支持直接对接 Google 官方 API 端点（或兼容官方协议的基础镜像反代），并支持在节点内配置多个 Google Gemini API Key 进行客户端请求的分流负载均衡与用量审计，系统需要引入**双服务器类型体系**：
1. **代理模式（Proxy Mode）**：原有的第三方代理服务模式，具有在线/离线、多账号凭据管理、上下文释放等特性。
2. **直连模式（Direct Mode）**：类似官方端点模式，节点可配置多个 API Key 并自动在其间做轮询负载均衡，同时支持独立的允许模型白名单（`allowedModels`），账号管理展示为无在线/离线概念的“API Key 请求量统计面板”。

---

## 2. 核心数据模型与��置扩展

### 2.1 数据模型扩展 (`src/types/index.ts`)

```typescript
export type UpstreamServerType = 'proxy' | 'direct';

export interface UpstreamServerConfig {
  url: string;                          // 基础请求地址。代理模式为自建代理 URL；直连模式默认为 https://generativelanguage.googleapis.com
  weight: number;                       // 流量权重（平滑加权轮询 SWRR），1~1000
  enabled: boolean;                     // 节点是否启用
  name?: string;                        // 节点显示名称
  allowedModels?: string[];             // 允许使用的模型白名单（无论是 proxy 还是 direct 都严格生效）
  type?: UpstreamServerType;            // 节点类型：'proxy'（默认） | 'direct'
  apiKeys?: string[];                   // 直连模式下的 Google Gemini API Key 列表
}

export interface UpstreamServerStatus extends UpstreamServerConfig {
  serverIndex: number;
  effectivePercent: number;
  consecutiveFailures: number;
  isIsolated: boolean;
  isolatedUntil: number;
  lastError?: string;
  keyCount?: number;                   // 直连模式下配置的 Key 数量
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
  serverType: UpstreamServerType;
  selectedApiKey?: string;             // 直连模式下轮询选出的有效 API Key
}
```

### 2.2 配置解析与标准化 (`config/default.ts`)

扩展 `parseUpstreamServers(raw?: any): UpstreamServerConfig[]`：
- **向后兼容**：若未显式指定 `type`，默认为 `'proxy'`。
- **直连默认 URL**：当 `type === 'direct'` 且未填写 `url` 时，默认使用 `https://generativelanguage.googleapis.com`。
- **API Key 清洗与去重**：对 `apiKeys` 进行过滤，去除首尾空白字符，移除无效空值，并进行 `Set` 去重。
- **字符串解析支持**：
  - 增强 URL hash 参数解析，支持形如 `#type=direct&keys=key1+key2` 的解析。
  - 标准 JSON 数组形式解析时，自动映射 `type` 与 `apiKeys` 字段并完成严格校验。

---

## 3. 调度引擎与转发执行设计

### 3.1 节点层与 Key 层调度机制 (`src/utils/upstreamManager.ts`)

1. **节点层调度**：
   - 无论是 `proxy` 还是 `direct` 节点，均统一注册在集群列表中。
   - 统一遵循 `allowedModels` 白名单过滤机制：如果配置了允许模型，仅匹配目标模型的节点（无论是代理还是直连）才作为可用候选节点参与调度。
   - 统一遵循平滑加权轮询算法（SWRR，Smooth Weighted Round-Robin）计算节点被选中的概率。
2. **Key 层调度（仅直连模式生效）**：
   - 在 `UpstreamManager` 中维护每个直连节点专属的 Key 轮询计数器（`directKeyRoundRobinMap: Map<number, number>`）。
   - 当选中的节点为直连模式（`serverType === 'direct'`）时：
     - 若该节点配置了 `apiKeys` 且列表非空，则根据轮询算法取出一个 `selectedApiKey`，随 `UpstreamServerSelection` 返回。
     - 若该节点未配置任何 Key，则 `selectedApiKey` 为 `undefined`，降级使用客户端传入的 Key。

### 3.2 转发与鉴权适配 (`claudeController.ts` & `geminiController.ts`)

1. **请求入口鉴权**：
   - 客户端依然可以通过 `x-api-key`、`Authorization: Bearer <key>`、`x-goog-api-key` 传入鉴权凭据，或者直接传入本系统的 `ADMIN_SECRET_KEY`。
2. **请求转发头注入与账号标识绑定**：
   - **对于代理模式（`proxy`）**：
     - 保持现有逻辑，直接向上游透传凭据；请求返回后从响应头 `x-account-name` 中提取实际执行账号名称。
   - **对于直连模式（`direct`）**：
     - 上游请求的 `x-goog-api-key` 请求头替换为选出的 `selectedApiKey`（若无则保留客户端提供的 Key）。
     - 账号标识直接绑定为该 Key 的脱敏字符串（调用 `maskApiKey(selectedApiKey)`，形如 `AIzaSy***1234`）。
3. **统计与日志记录**：
   - 在请求成功、失败或超时时，使用绑定的账号标识调用 `accountUsageService.record(accountName, model, isSuccess)`。
   - 交易日志记录 `payloadLogger.saveTransaction(...)` 将脱敏的 `accountName` 存入日记账。

---

## 4. 账号管理与前端视图交互设计

### 4.1 后端接口适配 (`accountController.ts`)

1. `GET /api/admin/accounts/servers`：
   - 返回节点列表时携带元数据：包括每个节点的 `name`、`url`、`type`（`'proxy'` 或 `'direct'`）、`keyCount`、`allowedModels` 等。
2. `GET /api/admin/accounts/status`：
   - 获取指定 `serverIndex` 的状态时：
     - 若对应节点为 **代理模式**：继续向上游代理服务器发起 `/api/status` 请求，并附加本地用量统计后返回。
     - 若对应节点为 **直连模式**：
       - **拦截网络请求**，不向上游发起任何调用，彻底避免因官方端点不存在该路径而产生的 404/502 错误。
       - 本地构造包含 `accountDetails` 的虚构系统状态对象：
         - 遍历该直连节点的所有配置 `apiKeys`；
         - 每个 Key 脱敏后作为 `name`，并从 `accountUsageService` 获取该 Key 的��计用量（总请求量、成功量、失败量、按模型分类明细）；
         - 组装成标准化的账号详情对象返回给前端，状态标记为常规就绪，无在线/离线标记。
3. **代理特有操作保护**：
   - 对于凭据文件上传（`upload`）、切换账号（`switchCurrent`）、关闭上下文（`closeContext`）、账号删除（`deleteAccount`）等接口，若目标为直连节点，直接返回 400 提示：`"该操作仅在代理模式服务器可用"`。

### 4.2 前端系统配置弹窗 (`ConfigModal.tsx`)

- 在代理服务器设置列表中，为每个节点卡片增加 **服务器类型选择器**（Proxy vs Direct）。
- 当类型切换为 **直连模式（Direct）** 时：
  - URL 输入框默认自动填入 `https://generativelanguage.googleapis.com`（支持用户按需修改为自定义端点）。
  - 显示 API Keys 配置输入区，支持按行输入或粘贴多个 Google Gemini API Key。
  - 保留并完全支持 **允许模型 (`allowedModels`)** 和 **权重 (`weight`)** 配置。

### 4.3 前端账号管理视图 (`AccountsView.tsx`)

- **服务器切换标签栏**：
  - 在每个服务器标签上展示模式徽章（如 `[直连]` / `[代理]`）。
- **直连模式下的展示与交互**：
  - 顶部指标卡：展示直连 Key 总数、周期内累计请���、成功率与各模型请求占比。
  - 隐藏代理模式专属操作按钮（上传凭据文件、自动轮换、去重等）。
  - 表格/卡片列表：每一行显示一个脱敏的 API Key（支持点击复制），右侧直观展示该 Key 的请求量进度条、成功率及模型明细分布。

---

## 5. 错误处理与容错机制

1. **直连节点未配置 Key 时的降级**：
   - 若直连节点未配置任何 Key，请求仍可根据客户端提供的有效 Google Key 正常转发；若客户端也未提供有效 Google Key，则返回 401 提示缺少凭据。
2. **上游调用失败**：
   - 当某个直连 Key 收到官方返回的错误（如 429 配额不足或 400 参数错误）时，不执行跨 Key 的自动重试，直接如实将错误返回给客户端，并将失败准确计入该 Key 的失败统计中。
3. **容灾熔断隔离**：
   - 直连节点同样享有 `UpstreamManager` 的集群熔断器机制。若该节点连续多次请求出现 5xx 故障，该直连节点将被临时隔离，调度器自动绕行其他正常节点。

---

## 6. 测试与验证策略

1. **单元测试 (`tests/upstreamServerType.test.ts`)**：
   - 验证 `parseUpstreamServers` 能正确解析 `type: 'direct'`、默认 URL 填充、以及 `apiKeys` 清洗。
   - 验证直连节点在平滑加���轮询中的调度表现，以及节点内多 Key 的轮询分发。
   - 验证直连节点配置 `allowedModels` 时的白名单过滤逻辑。
2. **控制器与代理测试 (`tests/directModeProxy.test.ts`)**：
   - 模拟直连模式请求，验证 `x-goog-api-key` 被正确替换为选中的 Key，且 `accountName` 被正确记录为脱敏 Key 标识。
   - 验证 `GET /api/admin/accounts/status` 在直连模式下不会发起外部网络请求，且能返回各个 Key 的用量聚合。
3. **前端构建验证**：
   - 运行 `npm run build:frontend`，确保 TypeScript 编译和 Vite 打包 100% 通过无报错。

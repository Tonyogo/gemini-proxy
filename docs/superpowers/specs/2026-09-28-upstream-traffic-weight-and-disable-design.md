# 上游代理请求权重与启停控制设计规范 (Upstream Traffic Weight & Disable Design Spec)

## 1. 背景与目标 (Background & Goals)

### 1.1 现状与痛点
当前系统的多上游代理（`GEMINI_BASE_URL`）仅支持纯逗号分隔的 URL 列表（如 `url1,url2`）。在请求转发时，调度器默认采用简单的固定均匀轮询（Round-Robin），即每个节点流量占比严格均分（50% : 50%）。这导致以下局限：
1. **无法按比例分配流量**：无法根据服务器规格、网络延迟、配额上限等因素，将流量按自定义百分比（如 80% 与 20%）切分至不同网关。
2. **缺乏灵活启停开关**：若某节点需要维护或下线，只能从配置中彻底删除该 URL；维护完毕后又需重新填写，缺乏一键禁用/恢复能力。
3. **熔断与调度孤立**：原有的 3 次连续失败触发 180s 熔断隔离机制仅支持简单过滤，缺少动态权重重算与归一化分摊能力。

### 1.2 设计目标
1. **流量百分比分流**：支持配置各节点的权重数值（如 80、20），由调度器自动归一化为 100% 流量占比，并采用平滑加权轮询（Smooth Weighted Round-Robin, SWRR）算法实现按模型隔离的均匀调度。
2. **节点启停控制（Enabled/Disabled）**：支持为节点配置启用状态；被禁用的节点实际流量占比强制归零（0.0%），剩余流量由已启用的节点自动平摊。
3. **双模兼容与扩展后缀**：
   - 环境变量与快速输入支持扩展 hash 参数语法（如 `url#weight=80&name=主节点,url2#disabled`）与旧版纯逗号分隔；
   - 运行时配置持久化（`config/runtime.json`）支持标准结构化数组 `upstreamServers: UpstreamServerConfig[]`；
   - 保留原 `config.geminiBaseUrl` 作为逗号分隔字符串导出，无缝兼容存量系统与日志输出。
4. **熔断健康联动**：当某节点触发 180s 熔断隔离时，自动从候选加权池中暂时剥离，剩余有效节点重新归一化承接 100% 流量；隔离恢复后平滑回归原有比例。
5. **Web 控制台可视化管理**：在 `ConfigModal` 中提供模块化代理节点卡片管理，包含直观的“流量切分进度条”、启停开关、权重调节、实时百分比计算预览与增删功能。

---

## 2. 数据结构设计 (Data Schema)

### 2.1 核心类型定义 (`src/types/index.ts`)

```typescript
export interface UpstreamServerConfig {
  url: string;               // 节点 URL（已规范化：带协议前缀，无尾部斜杠）
  weight: number;            // 流量权重值（正整数 1 ~ 1000，默认 1）
  enabled: boolean;          // 是否启用（默认 true；若为 false，实际流量占比为 0%）
  name?: string;             // 节点友好名称/别名（可选，如 "主香港网关"）
}

export interface UpstreamServerStatus extends UpstreamServerConfig {
  serverIndex: number;       // 原始配置索引（对应 getBaseUrls() 索引）
  effectivePercent: number;  // 当前实时有效流量占比（0 ~ 100.0%）
  consecutiveFailures: number; // 当前连续失败次数
  isIsolated: boolean;       // 是否因连续失败触发熔断隔离
  isolatedUntil: number;     // 熔断隔离截止时间戳（ms）
  lastError?: string;        // 最近一次请求错误简述
}

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
  weight: number;
}
```

---

## 3. 配置解析与持久化 (Config & Parser Layer)

### 3.1 字符串扩展解析语法
`config/default.ts` 中增强解析逻辑，统一由 `parseUpstreamServers(raw?: any): UpstreamServerConfig[]` 处理：
- **JSON 数组输入**：若直接传入符合 `UpstreamServerConfig[]` 的对象数组或其 JSON 字符串，直接验证���洗各字段。
- **扩展字符串输入**：支持逗号分隔，每个项可携带 `#` 锚点参数：
  - 格式示例：`https://api1.com#weight=80&name=主香港,https://api2.com#weight=20&name=备用美西,https://api3.com#disabled`
  - 解析规则：
    - URL 前半部分清洗：剔除尾部斜杠，若缺失 `http://` 或 `https://` 默认补齐 `https://`；
    - `#` 后的参数通过键值对解析：
      - `weight` / `percent`：解析为正整数，范围 clamp 在 `1 ~ 1000`，非法或缺失时缺省为 `1`；
      - `disabled` / `enabled`：出现 `disabled` 标志或 `enabled=false` 时，`enabled: false`，其余为 `true`；
      - `name`：可选解码字符串。
- **纯逗号分隔输入（向后兼容）**：`https://api1.com,https://api2.com` 自动转换为各节点 `weight: 1`，`enabled: true`。
- **空输入兜底**：若解析结果为空，回退默认官方节点：
  `[{ url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Google Official API' }]`。

### 3.2 配置导出与更新 (`config/default.ts`)
- 导出字段：
  - `config.upstreamServers: UpstreamServerConfig[]`：结构化配置数组。
  - `config.geminiBaseUrl: string`：由已配置的所有有效节点的 url 以英文逗号拼接而成，保证原引用不破坏。
- `updateConfig(partialConfig)`：
  - 支持传入 `upstreamServers?: UpstreamServerConfig[]` 或 `geminiBaseUrl?: string`；
  - 若传入 `upstreamServers`，同步规范化更新 `config.upstreamServers` 和 `config.geminiBaseUrl`，并原子写入 `config/runtime.json`；
  - 若传入字符串 `geminiBaseUrl`，经由 `parseUpstreamServers` 转换为结构化数据后同步更新。

---

## 4. 调度引擎与熔断协同 (Scheduling & Circuit Breaker)

### 4.1 流量百分比归一化计算
对于任一给定的上游节点集合：
1. 过滤当前健康且启用的节点集合 $S_{cand}$：
   - 过滤条件：`item.enabled === true && !isNodeIsolated(item.serverIndex)`
2. 若 $S_{cand}$ 为空，执行双层兜底：
   - 第一层：若所有已启用节点均被熔断，降级为所有 `item.enabled === true` 的节点；
   - 第二层：若用户手动禁用了全部节点（无任何 `enabled: true` 节点），为避免 100% 拒绝服务，系统强制激活所有节点，并记录警告日志。
3. 计算有效权重总和 $W_{total} = \sum_{i \in S_{cand}} w_i$。
4. 计算各节点的实际流量百分比：
   $$P_i = \begin{cases} 0.0\%, & i \notin S_{cand} \\ \frac{w_i}{W_{total}} \times 100\%, & i \in S_{cand} \end{cases}$$

### 4.2 平滑加权轮询算法 (Smooth Weighted Round-Robin, SWRR)
在 `src/utils/upstreamManager.ts` 中维护加权调度状态：
1. **按模型隔离 (Per-Model State)**：
   - 维护 `modelWeightsMap: Map<string, Map<number, number>>`，存储每个模型下各个可用节点的 `currentWeight`。
   - 维护 `globalWeightsMap: Map<number, number>` 用于无模型参数时的全局回退调度。
2. **每次调度迭代**：
   - 提取候选节点集合 $S_{cand}$；
   - 对每个候选节点 $i \in S_{cand}$：`currentWeight[i] += weight[i]`；
   - 选出当前 `currentWeight` 最大的节点 $k$；
   - 对选出的节点 $k$ 执行：`currentWeight[k] -= totalWeight`；
   - 返回节点 $k$ 的 `serverUrl` 及原始 `serverIndex`。
3. **算法特性**：
   - 80% vs 20%（比例 4:1）的 5 次请求调度序列严格为：`A, A, A, B, A`；
   - 避免了突发将连续流量全部堆积给高权重节点，实现时间序列维度的绝对平滑。

### 4.3 熔断器与健康监控机制
- 连续 3 次失败触发 180s 隔离（原有机制保持并强化）；
- `getCircuitStatusList()` 升级为返回完整的 `UpstreamServerStatus[]`，提供每个节点当前的实时有效流量百分比 `effectivePercent`、熔断状态��失败原因。

---

## 5. API 契约与管理控制台 (API & UI Design)

### 5.1 Admin API 规范

#### `GET /api/admin/status`
响应中强化 upstream 相关信息：
```json
{
  "status": "ok",
  "config": {
    "geminiBaseUrl": "https://api1.com,https://api2.com",
    "upstreamServers": [
      { "url": "https://api1.com", "weight": 80, "enabled": true, "name": "主香港网关" },
      { "url": "https://api2.com", "weight": 20, "enabled": true, "name": "备用美西" },
      { "url": "https://api3.com", "weight": 10, "enabled": false, "name": "灰度节点" }
    ]
  },
  "upstreamStatus": [
    { "url": "https://api1.com", "weight": 80, "enabled": true, "name": "主香港网关", "serverIndex": 0, "effectivePercent": 80.0, "isIsolated": false, "consecutiveFailures": 0 },
    { "url": "https://api2.com", "weight": 20, "enabled": true, "name": "备用美西", "serverIndex": 1, "effectivePercent": 20.0, "isIsolated": false, "consecutiveFailures": 0 },
    { "url": "https://api3.com", "weight": 10, "enabled": false, "name": "灰度节点", "serverIndex": 2, "effectivePercent": 0.0, "isIsolated": false, "consecutiveFailures": 0 }
  ]
}
```

#### `PUT /api/admin/config`
支持更新请求体：
```json
{
  "upstreamServers": [
    { "url": "https://api1.com", "weight": 70, "enabled": true, "name": "主香港网关" },
    { "url": "https://api2.com", "weight": 30, "enabled": true, "name": "备用美西" }
  ]
}
```
亦同时向下兼容传入字符串 `geminiBaseUrl: "https://api1.com,https://api2.com"`。

### 5.2 前端界面交互 (`frontend/src/components/ConfigModal.tsx`)
1. **多代理服务器管理面板 (Upstream Servers Panel)**：
   - 顶部设置“实时流量分配概览条”：按已启用节点色彩分段显示各自占比，直观体现 80% / 20% 的流量切分。
   - 节点列表卡片：
     - **启停开关 (Switch)**：实时开启或禁用。禁用时卡片置灰，旁侧实际流量占比即时变为 `0.0%`。
     - **节点别名与 URL 输入框**：带自动补齐协议前缀与尾斜杠去除处理。
     - **自由权重输入 (Weight Input)**：支持用户输入权重数值，旁侧动态计算并展示当前 `实际流量占比: XX.X%`。
     - **删除节点按钮 (Trash)**：支持删除某一项（最后剩余一项时限制删除）。
   - 底部按钮：`+ 添加代理节点` 与 `填入官方默认` 快速重置。
2. **多语言词条 (`frontend/src/i18n/locales/`)**：
   - 为中文（`zh.ts`）和英文（`en.ts`）补齐多代理管理��权重配置、启停状态、流量占比条等相关文本。

---

## 6. 测试与质量保证 (Testing Strategy)

1. **配置解析单元测试 (`tests/upstreamConfig.test.ts`)**：
   - 验证传统纯 URL 逗号分隔的解析与默认权重/启用状态；
   - 验证 `#weight=80&name=xxx`、`#disabled` 等扩展后缀的准确解析；
   - 验证标准 JSON 数组配置输入及异常非法数值的自动纠偏与清洗；
   - 验证 `updateConfig` 与 `runtime.json` 持久化读写。
2. **加权调度与百分比精准性测试 (`tests/upstreamWeightedScheduler.test.ts`)**：
   - **平滑加权轮询序列验证**：验证 4:1 配置下产生 `A, A, A, B, A` 序列；
   - **大样本比例验证**：运行 1000 次调度，验证 80% 与 20% 的最终命中分布���准一致；
   - **启停开关动态切换测试**：将某节点设为 `enabled: false`，验证其流量立即归零，其余节点自动平分；
   - **熔断与降级测试**：验证节点被熔断后流量转移至健康节点；验证所有节点全熔断或全禁用时的安全降级。
3. **Admin API 与集成测试**：
   - 验证 `GET /api/admin/status` 返回的 `upstreamStatus` 数据格式；
   - 验证 `PUT /api/admin/config` 更新 `upstreamServers` 后的实时生效与持久化。
4. **现有测试回归验证**：
   - 确保 `tests/upstreamManager.test.ts`、`tests/upstreamCircuitBreaker.test.ts` 等全量 147 个测试套件持续 100% 通过。

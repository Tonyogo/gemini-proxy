# 代理服务器节点级模型限制与感知调度设计规范 (Per-Upstream Model Restriction & Routing Design Spec)

## 1. 背景与目标 (Background & Goals)

### 1.1 现状与痛点
先前实现的全局模型限制（Global `allowedModels`）在网关入口处对所有请求实施一刀切拦截，未贴合多代理网关异构能力的真实业务场景：
1. **多上游异构能力冲突**：不同的上游代理服务器（Upstream Server）具有不同的可用模型与配额。例如：
   - 官方直连 / 高规格专线节点：允许访问全量模型（含 `gemini-2.5-pro` 等高消耗模型）；
   - 第三方反代 / 低成本辅助节点：仅支持或仅允许转发轻量级模型（如 `gemini-2.5-flash`）。
2. **需要基于模型能力的智能加权调度**：当请求到达时，系统应能够根据请求的模型，仅在该模型被允许的上游代理服务器集合中进行加权分流；若将请求调度到不支持该模型的代理服务器，将导致上游返回 404/400 失败并误触发熔断。
3. **彻底清理旧全局配置**：清理先前在网关全局层引入的 `ALLOWED_MODELS` 环境变量、`config.allowedModels` 顶层配置、全局拦截器及相关旧测试。

### 1.2 设计目标
1. **节点级模型白名单（Per-Upstream Allowed Models）**：
   - 在每个代理服务器配置项（`UpstreamServerConfig`）中支持独立配置 `allowedModels?: string[]`；
   - **默认行为**：若未配置或配置为空列表（`[]`），该代理节点**默认允许全部模型**通过，100% 保持向后兼容。
2. **模型感知加权路由调度（Model-Aware SWRR Routing）**：
   - 请求模型到达时（支持原始请求模型名与映射后底座模型名双向比对），调度器仅在**支持该模型的已启用代理服务器集合**中进行平滑加权轮询（SWRR）；
   - 不支持该模型的代理服务器流量占比为 0%，绝不会被分配该模型的请求；
   - 示例：Server A（权重 80，允许全部），Server B（权重 20，仅允许 `gemini-2.5-flash`）：
     - 请求 `gemini-2.5-flash` 时：Server A 与 Server B 均支持，流量按 80% : 20% 分配；
     - 请求 `gemini-2.5-pro` 时：仅 Server A 支持，Server A 自动独占 100% 流量，Server B 不承接。
3. **全集群不支持时的标准 403 拦截**：
   - 若当前所有已启用的代理服务器均**不支持**该模型，则网关在请求发起前立即拦截阻断，向客户端返回标准 403 响应（Claude: `permission_error`，Gemini: `PERMISSION_DENIED`）。
4. **旧全局配置与代码彻底清理**：
   - 移除旧全局 `config.allowedModels` 及其在 `updateConfig`、`AdminController`、控制器入口处的全局拦截逻辑；
   - 删除旧全局测试文件。
5. **Web 控制台节点级可视化管理**：
   - 移除全局白名单面板；
   - 在上游代理服务器列表卡片内部，为每个代理节点提供专属的模型限制标签编辑器（Tag Input）与状态指示（`允许全部模型 (默认)` vs `已限制 N 个模型`）。

---

## 2. 数据结构设计 (Data Schema)

### 2.1 核心类型定义 (`src/types/index.ts`)

```typescript
export interface UpstreamServerConfig {
  url: string;               // 节点 URL
  weight: number;            // 流量权重值（默认 1）
  enabled: boolean;          // 是否启用（默认 true）
  name?: string;             // 节点友好备注（可选）
  allowedModels?: string[];  // 该代理节点允许通行的模型列表，留空/undefined/[] 表示默认允许全部模型
}

export interface UpstreamServerStatus extends UpstreamServerConfig {
  serverIndex: number;
  effectivePercent: number;  // 归一化后的实时流量占比
  consecutiveFailures: number;
  isIsolated: boolean;
  isolatedUntil: number;
  lastError?: string;
}
```

---

## 3. 配置定义、解析与清理 (Config & Cleanup)

### 3.1 字符串扩展解析语法 (`config/default.ts`)
升级 `parseUpstreamServers(raw?: any): UpstreamServerConfig[]`：
- **Hash 参数扩展语法**：
  - 示例：`https://api1.com#weight=80&models=gemini-2.5-flash+gemini-2.5-pro,https://api2.com#weight=20&models=gemini-2.5-flash`
  - 参数支持：`models` 或 `allowedModels`；
  - 多个模型以 `+`、`|` 或 `,` 分隔；
  - 解析时去除首尾空格、过滤空串并去重；未指定时为 `undefined` 或 `[]`。
- **JSON 数组输入**：
  - 读取每个元素的 `allowedModels` 数组，去除脏数据并规整为字符串数组。

### 3.2 彻底清理旧全局配置
- 从 `config/default.ts` 中移除 `ALLOWED_MODELS` 环境变量的读取与独立解析；
- 从 `config` 对象中移除 `allowedModels` 字段及其 getter/setter；
- 从 `updateConfig` 中移除对顶层 `partialConfig.allowedModels` 的处理；
- 移除 `src/utils/modelValidator.ts` 文件。

---

## 4. 模型感知调度与拦截机制 (Model-Aware Scheduling & Interception)

### 4.1 节点模型支持度判定 (`src/utils/upstreamManager.ts`)
```typescript
/**
 * 判定指定节点是否支持处理指定模型（严格全字比对，大小写不敏感，支持双向兼容）
 */
public serverSupportsModel(server: UpstreamServerConfig, originalModel?: string, resolvedModel?: string): boolean {
  if (!server.allowedModels || server.allowedModels.length === 0) {
    return true; // 默认允许全部模型
  }
  const allowedSet = new Set(server.allowedModels.map(m => m.trim().toLowerCase()).filter(Boolean));
  if (allowedSet.size === 0) return true;

  const normOriginal = originalModel ? originalModel.trim().toLowerCase() : '';
  const normResolved = resolvedModel ? resolvedModel.trim().toLowerCase() : '';

  if (normOriginal && allowedSet.has(normOriginal)) return true;
  if (normResolved && allowedSet.has(normResolved)) return true;

  return false;
}
```

### 4.2 调度过程 (`getUpstreamServer` / `getUpstreamUrl`)
1. **提取候选集 $S_{model}$**：
   - 过滤 `server.enabled !== false` 且 `serverSupportsModel(server, originalModel, resolvedModel)` 的节点集合。
2. **全节点不支持检测 (403 Interception)**：
   - 若 $S_{model}$ 为空：说明**当前没有任何已启用的代理节点允许该模型**；
   - 调度器提供显式方法 `hasUpstreamForModel(originalModel, resolvedModel): boolean`；
   - 控制器在请求前检查，若无节点支持，直接拦截并响应 403：
     - Claude 协议：
       ```json
       {
         "type": "error",
         "error": {
           "type": "permission_error",
           "message": "Model 'claude-3-opus' is not supported by any configured upstream server."
         }
       }
       ```
     - Gemini 原生协议：
       ```json
       {
         "error": {
           "code": 403,
           "message": "Model 'gemini-1.5-pro' is not supported by any configured upstream server.",
           "status": "PERMISSION_DENIED"
         }
       }
       ```
3. **健康熔断与平滑分流**：
   - 在 $S_{model}$ 中过滤掉处于熔断隔离期的节点，得到健康候选池 $S_{healthy}$；
   - 若 $S_{healthy}$ 不为空，在 $S_{healthy}$ 中加权分流；
   - 若 $S_{healthy}$ 为空（支持该模型的所有节点均被熔断），降级在 $S_{model}$ 中轮询重试（**绝不泄露流量到不支持该模型的节点**）；
   - 在候选集中执行平滑加权轮询（SWRR），精准分配请求。

---

## 5. API 契约与 Web 控制台 (API & UI Design)

### 5.1 Admin API 契约
- **`GET /api/admin/status`**：
  - 移除顶层 `config.allowedModels`；
  - `config.upstreamServers` 和 `upstreamStatus` 的各节点对象携带独立的 `allowedModels?: string[]`。
- **`PUT /api/admin/config`**：
  - 移除顶层 `allowedModels` 接收；
  - 接收带 `allowedModels` 的 `upstreamServers` 数组并原子持久化至 `runtime.json`。

### 5.2 前端界面交互 (`frontend/src/components/ConfigModal.tsx`)
1. **清理全局白名单**：从模型映射 Tab 中移除先前添加的全局 `ALLOWED_MODELS` 卡片；
2. **节点卡片内嵌模型限制配置**：
   - 在每个代理节点的卡片底部增加「允许通行的模型限制（可选）」；
   - 未配置时显示状态：`🟢 允许全部模型 (默认)`，并带快捷添加常用模型（`+ gemini-2.5-flash`、`+ gemini-2.5-pro`、`+ claude-3-7-sonnet`）；
   - 配置后显示状态：`🟡 已限制 N 个模型`，并渲染标签（带 `✕` 删除）；
   - 提供回车/逗号模型输入框。
3. **国际化语言包更新**：在 `zh.ts` 和 `en.ts` 中更新节点级词条，清理无用的全局词条。

---

## 6. 测试与质量保证 (Testing Strategy)

1. **清理旧测试文件**：
   - 彻底删除：`tests/modelValidator.test.ts`、`tests/claudeModelRestriction.test.ts`、`tests/geminiModelRestriction.test.ts`、`tests/adminAllowedModels.test.ts`、`tests/modelRestrictionE2E.test.ts`。
2. **新增节点级模型解析测试 (`tests/upstreamServerModelConfig.test.ts`)**：
   - 测试 Hash 参数 `#models=m1+m2` 与标准 JSON 数组中 `allowedModels` 的解析。
3. **新增模型感知路由与调度测试 (`tests/upstreamModelRouting.test.ts`)**：
   - 测试特定模型仅路由到支持该模型的节点，不支持的节点流量为 0；
   - 测试全节点不支持时的 403 阻断响应（Claude 与 Gemini 双协议）；
   - 测试支持该模型的节点触发熔断时的隔离降级，确保流量不跨越到不支持的节点。
4. **端到端集成测试 (`tests/upstreamModelRoutingE2E.test.ts`)**：
   - 启动双 HTTP Mock 服务，验证双节点模型分流与 403 拦截的真实网络闭环。
5. **全量回归保障**：
   - 确保全量测试套件持续 100% 通过。

# 模型访问限制与白名单设计规范 (Model Restriction & Whitelist Design Spec)

## 1. 背景与目标 (Background & Goals)

### 1.1 现状与痛点
当前 Gemini Proxy 对所有通过的请求均无条件放行，只要 API Key 鉴权通过即可调用任意模型：
1. **缺乏模型级权限管控**：无法限制客户端可调用的模型范围。在多用户共享、团队内部测试或商用代理场景中，管理员无法禁止调用高成本模型（如 `gemini-2.5-pro`、`claude-3-opus`）。
2. **算力与额度浪费**：当客户端发起未授权或非预期模型的请求时，代理仍会转发给上游，产生上游调用消耗和并发占用。

### 1.2 设计目标
1. **白名单访问控制（Allowed Models Whitelist）**：支持配置允许通行的模型列表 `allowedModels`。
2. **默认完全开放**：当 `allowedModels` 未设置或为空列表（`[]`）时，**默认放行所有模型**，对现有环境保持 100% 向后兼容。
3. **双向兼容全字匹配校验**：
   - 匹配规则：严格全字匹配，大小写不敏感（Case-insensitive）；
   - 双向校验：客户端原始请求模型名（如 `claude-3-7-sonnet`）或映射后的目标底座模型名（如 `gemini-2.5-pro`）任一命中白名单即允许通行；只有两者皆不在白名单中时才拦截。
4. **双协议标准 403 阻断响应**：
   - Claude 接口端点返回 Anthropic 标准格式的 403 `permission_error`；
   - Gemini 原生接口端点返回 Google Gemini 标准格式的 403 `PERMISSION_DENIED`；
   - 请求发起前拦截，不消耗上游网络请求，不计入上游熔断器故障统计。
5. **多渠道配置与 Web 可视化管理**：
   - 支持环境变量 `ALLOWED_MODELS`（JSON 字符串或逗号/换行分隔）；
   - 支持运行时持久化到 `config/runtime.json`；
   - 在 Web 控制台（`ConfigModal`）提供标签化（Tag/Chip）编辑器与直观的状态提示。

---

## 2. 数据结构设计 (Data Schema)

### 2.1 核心类型定义 (`src/types/index.ts`)

```typescript
// 扩展系统配置接口
export interface AppConfig {
  // ... 现有字段
  allowedModels: string[]; // 允许访问的模型列表，空数组表示全部允许
}

// 统一模型校验函数出参/入参
export interface ModelValidationResult {
  allowed: boolean;
  model: string;
  targetModel?: string;
  reason?: string;
}
```

---

## 3. 配置定义与解析层 (Config Layer)

### 3.1 环境变量与解析规则 (`config/default.ts`)
- **环境变量**：`ALLOWED_MODELS`
- **解析函数**：`parseAllowedModels(raw?: any): string[]`
  - **输入为数组**：清洗每项为字符串，去除前后空格，过滤空字符串，执行去重并保持原始大小写存储；
  - **输入为字符串**：
    - 若以 `[` 开头并以 `]` 结尾，尝试解析为 JSON 数组；
    - 否则以逗号（`,`）或换行符（`\n`）分割，清洗每项并去重；
  - **缺省与容错**：未配置或解析为空时，统一返回空数组 `[]`。
- **运行时配置同步 (`updateConfig`)**：
  - 允许在 `updateConfig` 中传入 `allowedModels: string[] | string`；
  - 经由 `parseAllowedModels` 清洗后原子持久化到 `config/runtime.json` 并动态更新内存中的 `config.allowedModels`。

---

## 4. 校验拦截与双协议响应 (Validation & Interception)

### 4.1 核心校验逻辑 (`src/utils/modelValidator.ts`)
```typescript
/**
 * 校验模型是否在允许列表中
 * @param originalModel 客户端请求的原始模型名
 * @param resolvedModel 映射后的目标模型名
 * @returns boolean true 表示允许，false 表示受限阻断
 */
export function isModelAllowed(originalModel?: string, resolvedModel?: string): boolean {
  const allowed = config.allowedModels;
  if (!allowed || !Array.isArray(allowed) || allowed.length === 0) {
    return true; // 默认��部放行
  }

  const allowedSet = new Set(
    allowed.map(m => String(m || '').trim().toLowerCase()).filter(Boolean)
  );

  if (allowedSet.size === 0) {
    return true;
  }

  const normOriginal = originalModel ? originalModel.trim().toLowerCase() : '';
  const normResolved = resolvedModel ? resolvedModel.trim().toLowerCase() : '';

  if (normOriginal && allowedSet.has(normOriginal)) return true;
  if (normResolved && allowedSet.has(normResolved)) return true;

  return false;
}
```

### 4.2 拦截挂载点与执行时机
拦截在调用 `fetch` 前执行，直接返回 HTTP 403 状态码并记录审计日志：

1. **Claude API 端点 (`src/proxy/controllers/claudeController.ts`)**：
   - 覆盖接口：
     - `POST /v1/messages`：从 `req.body.model` 提取；
     - `POST /v1/messages/count_tokens`：从 `req.body.model` 或 `config.countTokensModel` 提取；
     - `GET /v1/models/:model_id`：从 `req.params.model_id` 提取；
   - 响应格式（Anthropic 规范）：
     ```json
     {
       "type": "error",
       "error": {
         "type": "permission_error",
         "message": "Model 'claude-3-opus' is not permitted by proxy policy."
       }
     }
     ```

2. **Gemini 原生 API 端点 (`src/proxy/controllers/geminiController.ts`)**：
   - 覆盖接口：
     - `ALL /v1beta/models/*` 与 `ALL /v1/models/*:*`；
     - 通过正则 `models\/([^:/?]+)(:[^?]*)?` 提取 URL 中的 `originalModel` 及映射后的 `targetModelName`；
   - 响应格式（Google Gemini 规范）：
     ```json
     {
       "error": {
         "code": 403,
         "message": "Model 'gemini-1.5-pro' is not permitted by proxy policy.",
         "status": "PERMISSION_DENIED"
       }
     }
     ```

3. **审计与健康熔断隔离**：
   - 记录 `payloadLogger.saveTransaction`，HTTP 状态记为 `403`，在日志管理控制台中标识阻断详情；
   - 不调用 `upstreamManager.recordRequestResult`，避免误触发上游节点的健康熔断。

---

## 5. Admin API 与前端控制台 (API & UI Design)

### 5.1 Admin API 契约规范

#### `GET /api/admin/status`
响应中 `config` 增加 `allowedModels` 字段：
```json
{
  "status": "ok",
  "config": {
    "allowedModels": ["gemini-2.5-flash", "claude-3-7-sonnet"],
    ...
  }
}
```

#### `PUT /api/admin/config`
支持更新请求体：
```json
{
  "allowedModels": ["gemini-2.5-flash", "gemini-2.5-pro"]
}
```

### 5.2 前端界面交互 (`frontend/src/components/ConfigModal.tsx`)
在设置面板的模型映射（Mappings）或上游设置区域中新增模型白名单配置块：
1. **状态指示器**：
   - 空列表：显示绿色徽标 `开放模式（允许全部模型）`；
   - 非空列表：显示琥珀色警示徽标 `白名单已生效（已限制 N 个模型）`。
2. **标签编辑器 (Chip / Tag Input)**：
   - 支持回车、逗号添加模型；
   - 每个标签带 `✕` 删除按钮；
   - 常用模型快捷添加按钮（`+ gemini-2.5-flash`、`+ gemini-2.5-pro`、`+ claude-3-7-sonnet`）；
   - 一键清空并恢复允许全部模型按钮。
3. **多语言支持**：在 `frontend/src/i18n/locales/zh.ts` 和 `en.ts` 中补齐词条。

---

## 6. 测试与质量保证 (Testing Strategy)

1. **单元测试 (`tests/modelValidator.test.ts`)**：
   - 测试默认空配置（允许全部）；
   - 测试严格全字匹配与大小写不敏感；
   - 测试双向兼容校验（客户端名命中通过、映射底座名命中通过、两者皆不命中拦截）；
   - 测试配置解析与脏数据清洗。
2. **Claude 路由拦截集成测试 (`tests/claudeModelRestriction.test.ts`)**：
   - 验证 `/v1/messages`、`/v1/messages/count_tokens`、`/v1/models/:model_id` 受限拦截及 403 Anthropic 报错报文；
   - 验证白名单内模型正常放行与透传。
3. **Gemini 路由拦截集成测试 (`tests/geminiModelRestriction.test.ts`)**：
   - 验证 `/v1beta/models/{model}:generateContent` 受限拦截及 403 Google 报错报文；
   - 验证流式接口与原生接口放行逻辑。
4. **Admin API 与持久化集成测试 (`tests/adminAllowedModels.test.ts`)**：
   - 验证 `GET /api/admin/status` 返回 `allowedModels`；
   - 验证 `PUT /api/admin/config` 动态热重载与 `runtime.json` 持久化。
5. **全量测试套件回归验证**：
   - 保证全量已有的 151 个测试套件持续全部通过。

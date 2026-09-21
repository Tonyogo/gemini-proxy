# 账号模型使用量本地统计与追踪设计规范 (Account Usage Tracking Design Specification)

## 1. 概述与背景 (Overview)
当前系统代理 Claude/Gemini 请求至上游的多账号轮换与调度集群。上游集群在响应客户端时，会在 HTTP 响应头中携带 `X-Account-Name` 暴露实际处理该请求的账号标识。
为了实现账号使用量的本地精确统计，避免对上游内部状态的盲目依赖，并在审计日志与控制台页面中提供更丰富的使用量维度，系统需要在本地支持：
1. 自动从上游响应头捕获 `X-Account-Name`。
2. 以北京时间（`Asia/Shanghai`）**每天 15:00 至次日 15:00** 为一个独立业务周期，统计“当日”各账号对各模型的**请求次数（成功与失败）**。
3. 高性能内存更新与异步防抖持久化，保证服务重启后当日用量不丢失。
4. 联动交易审计日志（`payloadLogger` 与 `index.jsonl`），实现请求级账号追踪。
5. 与现有的账号管理接口（`/api/admin/accounts/status`）及前端无缝对接。

---

## 2. 核心业务规则与时间窗口 (Business Window & Rules)

### 2.1 统计口径
- **计数单位**：纯请求次数（Request Count）。
- **聚合维度**：按账号名（`accountName`）跨多上游服务器全局汇总；每个账号下按模型名称（`model`）细分。
- **状态区分**：严格区分成功（`success`）与失败（`error`）。
  - HTTP 2xx 且流完整结束视为 `success`。
  - HTTP 4xx/5xx 或流中途网络异常/客户端断开视为 `error`。

### 2.2 业务周期定义（15:00 ~ 次日 15:00）
- **基准时区**：强制使用 `Asia/Shanghai`（北京时间 UTC+8）。
- **周期 Key 计算逻辑**：
  - 若当前北京时间的小时 `< 15`，周期起始日期为前一天。
    - 示例：`2026-09-21 14:59:59` -> 周期 Key 为 `2026-09-20_15`（范围：2026-09-20 15:00:00 至 2026-09-21 15:00:00）。
  - 若当前北京时间的小时 `>= 15`，周期起始日期为当天。
    - 示例：`2026-09-21 15:00:00` -> 周期 Key 为 `2026-09-21_15`（范围：2026-09-21 15:00:00 至 2026-09-22 15:00:00）。
- **周期滚动与历史归档**：
  - 内存中始终持有当前活跃周期的 `periodKey`。
  - 当新请求到达或发起查询时，若检测到系统时间已进入下一个周期，自动将上一周期的统计持久化快照归档（例如 `period-2026-09-20_15.json`），并将内存计数器重置为新周期。

---

## 3. 架构与组件设计 (Architecture & Components)

### 3.1 核心组件划分
```
                [Client Request]
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
  ClaudeController              GeminiController
        │                             │
        └──────────────┬──────────────┘
                       │ fetch Upstream
                       ▼
            [Upstream HTTP Response]
      (Header: X-Account-Name / x-account-name)
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
AccountUsageService              PayloadLogger
 (In-memory Stats)               (Audit Log & index.jsonl)
       │ (Debounce 1s)                 │
       ▼                               ▼
data/account-usage/            logs/YYYY-MM-DD/index.jsonl
current-period.json
       │
       ▼ (Merge into acc.usage)
AccountController (/api/admin/accounts/status)
       │
       ▼
Frontend (AccountsView.tsx)
```

### 3.2 组件职责

1. **`AccountUsageService` (`src/admin/services/accountUsageService.ts`)**：
   - 单例服务，维护当前周期的内存统计数据。
   - 提供 `record(accountName: string, model: string, isSuccess: boolean)` 方法。
   - 提供 `getUsageForAccount(accountName: string)` 与 `getAllUsage()` 方法。
   - 维护周期生命周期（检测、滚动、归档）与防抖持久化（Debounced flush）。
   - 注册进程退出信号钩子（`SIGINT`, `SIGTERM`, `beforeExit`），平滑落盘。

2. **`ClaudeController` & `GeminiController` 拦截与提取**：
   - 大小写不敏感提取 `response.headers.get('x-account-name')`。
   - 流式请求：
     - 上游返回非 2xx：立即 `record(accountName, model, false)`。
     - 流 `end` 正常结束：`record(accountName, model, true)`。
     - 流 `error` 或中断：`record(accountName, model, false)`。
   - 非流式请求：
     - 依据 `response.ok` 触发 `record(accountName, model, response.ok)`。
   - 将 `accountName` 传递给 `payloadLogger.saveTransaction`。

3. **`PayloadLogger` 审计日志扩展**：
   - 交易详情 JSON 文件（`minsec_transactionId.json`）记录顶层字段 `account`。
   - 日志索引文件（`index.jsonl`）的 `LogIndexRecord` 结构增加 `account?: string | null` 字段。
   - `LogService` 列表接口及前端展示��出该账号字段。

4. **`AccountController` 数据融合**：
   - 在处理 `GET /api/admin/accounts/status` 时，从上游拉取到账号列表后，遍历账号项，从 `AccountUsageService` 获取该账号在本地的今日用量。
   - 合并覆盖进账号对象的 `usage` 字段，格式兼容现有前端 `AccountUsage` 定义。
   - 增加独立端点 `GET /api/admin/accounts/usage`，直接返回当前周期的统计快照。

---

## 4. 数据结构与接口定义 (Data Structures & APIs)

### 4.1 TypeScript 接口定义 (`src/types/accountUsage.ts`)

```typescript
export interface ModelUsageStats {
  success: number;
  error: number;
  total: number;
}

export interface AccountUsageStats {
  accountName: string;
  totalSuccess: number;
  totalError: number;
  totalRequests: number;
  byModel: Record<string, ModelUsageStats>;
}

export interface PeriodUsageStore {
  periodKey: string;      // 例如 "2026-09-21_15"
  periodStart: string;    // 例如 "2026-09-21 15:00:00"
  periodEnd: string;      // 例如 "2026-09-22 15:00:00"
  updatedAt: string;      // ISO 8601
  accounts: Record<string, AccountUsageStats>;
}
```

### 4.2 前端兼容的 `AccountUsage` 结构映射
为了保持前端 `AccountsView.tsx` 中 `getTotalUsage()` 和 `getModelBreakdowns()` 完��兼容并增强展示：
```typescript
{
  total: stats.totalSuccess,            // 兼容前端已有的 getTotalUsage，按成功计
  totalRequests: stats.totalRequests,    // 总请求数
  totalSuccess: stats.totalSuccess,
  totalError: stats.totalError,
  byModel: {
    [model]: {
      usage: modelStat.success,
      requests: modelStat.total,
      success: modelStat.success,
      error: modelStat.error
    }
  }
}
```

### 4.3 存储路径与文件组织
- 基础存储目录：`data/account-usage/`
- 当前活跃周期文件：`data/account-usage/current-period.json`
- 归档历史周期文件：`data/account-usage/history/period-{periodKey}.json`（最多保留 7 天，自动清理过期文件）

---

## 5. 容错与边界处理 (Error Handling & Edge Cases)

1. **上游未携带 `X-Account-Name`**：
   - 部分系统探活请求或未认证请求可能无此响应头。
   - `accountName` 为 `null` 时直接跳过账号用量统计，不产生脏数据，但正常记录交易日志（`account: null`）。
2. **账号名称大小写与空白字符**：
   - 提取后进行 `trim()`，并在匹配或存储时保持原样（或统一规范化，避免因偶发空格导致分成两个账号）。
3. **并发写与突发断电/重启**：
   - 内存计数是原子的，防抖写入写入前生成��存快照；
   - 写入文件时先写至临时文件 `current-period.json.tmp` 再 `fs.rename` 覆盖，防止断电导致文件损坏。
   - 进程退出钩子强制同步 flush。
4. **系统跨越 15:00 边界时的正在进行的请求**：
   - 请求结束时判定当时的当前时间窗口进行计数累加；即使请求在 14:59 发起但在 15:01 结束，自然归入新的一天，逻辑自洽且无时钟歧义。

---

## 6. 测试与验证策略 (Testing Strategy)

1. **单元测试 (`tests/accountUsageService.test.ts`)**：
   - 验证北京时间 15:00 分界点的周期 Key 计算准确性（14:59 vs 15:00）。
   - 验证连续 `record()` 调用时成功与失败计数的累加正确性。
   - 验证跨周期滚动时上一周期的自动归档与当前周期重置。
   - 验证持久化落盘与启动时的恢复逻辑。
2. **控制器与代理集成测试 (`tests/claudeAccountUsage.test.ts`, `tests/geminiAccountUsage.test.ts`)**：
   - Mock 上游响应头包含 `X-Account-Name: test-account@example.com`。
   - 验证流式与非流式调用后，`AccountUsageService` 与 `PayloadLogger` 均能正确记录对应账号。
3. **账号管理接口集成测试 (`tests/accountStatusUsage.test.ts`)**：
   - 验证 `GET /api/admin/accounts/status` 正确将本地统计数据合并至返回的 `accountDetails[].usage` 中。
   - 验证独立接口 `GET /api/admin/accounts/usage` 的响应结构。
4. **前端构建验证**：
   - 执行 `npm run build` 确保前端与后端 TypeScript 类型完全通过。

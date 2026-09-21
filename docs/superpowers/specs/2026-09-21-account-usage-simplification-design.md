# 账号模型每日用量统计简化与展示修复设计 (Account Daily Usage Simplification & UI Fix Design)

## 1. 背景与目标 (Background & Goals)
现有账号使用量统计系统设计过于复杂：引入了多层目录结构、复杂的历史周期切片与归档文件搬运。同时前端在查看账号用量明细时存在同一个模型展示两遍的问题。

本次设计的目标是：
1. **轻量极简化**：仅追踪每日（15:00~次日15:00）的账号请求用量，去除所有历史归档与多文件搬运逻辑，采用单文件安全持久化与防抖写入。
2. **彻底解决模型重复问题**：在后端对模型名称严格去除 `models/` 前缀；在合并接口中完全以本地统计数据覆盖账号的 `acc.usage`（屏蔽上游混乱格式）；前端模型提取器做模型名称归一化合并去重。
3. **零影响与平滑迁移**：保持对外 HTTP 接口与测试用例的完全兼容，提升系统稳定性和可维护性。

---

## 2. 详细设计 (Detailed Architecture)

### 2.1 后端服务极简化 (`AccountUsageService`)
- **存储路径**：单文件 `data/account-usage.json`（自动清理或不再创建 `data/account-usage/history/` 目录）。
- **数据结构**：
  ```json
  {
    "periodKey": "2026-09-21_15",
    "updatedAt": "2026-09-21T15:30:00.000Z",
    "accounts": {
      "account_name": {
        "accountName": "account_name",
        "totalRequests": 10,
        "totalSuccess": 9,
        "totalError": 1,
        "byModel": {
          "gemini-2.5-flash": { "success": 9, "error": 1, "total": 10 }
        }
      }
    }
  }
  ```
- **周期滚动 (15:00 UTC+8)**：
  - 基于当前北京时间计算 `periodKey`（例如 `2026-09-21_15`）。
  - 当新请求到达或查询时，若检测到系统时间进入新周期，直接重置 `accounts = {}`，更新 `periodKey`。无需任何归档操作，保持极简。
- **模型规范化**：
  - 在 `record` 时，针对传入的 model 统一做：
    ```typescript
    const cleanModel = (model || 'unknown').trim().replace(/^models\//, '');
    ```
    杜绝 `models/gemini-pro` 和 `gemini-pro` 分裂为两项。
- **持久化策略**：
  - 内存更新后通过 1 秒防抖（debounce 1s）写入临时文件并原子替换至 `data/account-usage.json`。
  - 进程退出钩子同步落盘。

### 2.2 数据合并与覆盖 (`AccountController.getStatus`)
- 在处理 `GET /api/admin/accounts/status` 时：
  - 对上游返回的每一个账号：
    - 从 `AccountUsageService` 取出该账号的今日统计数据；
    - **完全覆盖 `acc.usage` 对象**（若本地无使用记录，则初始化全 0 用量对象），彻底丢弃上游接口透传的混乱 `usage` 属性；
    - `byModel` 中的 key 统一清洗去除 `models/`。

### 2.3 前端展示去重与简化 (`AccountsView.tsx`)
- **`getModelBreakdowns(usage?: AccountUsage)`**：
  - 专注于解析 `usage.byModel`；
  - 遍历条目时使用统一小写/去前缀的 model 建立 `Map<string, ModelItem>`；
  - 若遇到同名模型（如大小写或历史脏数据），自动合并 `count`、`success`、`error`；
  - 返回按请求量从大到小排序的明细列表。
- **`getTotalUsage(usage?: AccountUsage)`**：
  - 优先读取 `usage.totalRequests ?? usage.total ?? 0`，逻辑精简。

---

## 3. 错误处理与健壮性 (Error Handling & Reliability)
1. **数据损坏降级**：若 `data/account-usage.json` 无法解析或被损坏，自动记录警告并重置为空存储，不影响代理转发主链路。
2. **时区边界容错**：若 `Intl.DateTimeFormat` 抛出异常，降级使用宿主时间计算，保证服务永远可用。
3. **空值保护**：请求头未携带 `X-Account-Name` 时，安全跳过，不创建空白账号数据。

---

## 4. 验证与测试方案 (Testing Plan)
1. **单元测试 (`tests/accountUsageService.test.ts`)**：
   - 验证单文件读写与加载；
   - 验证 15:00 跨周期自动重置，且不再产生 history 文件；
   - 验证 `models/xxx` 与 `xxx` 自动合并记录。
2. **集成测试 (`tests/accountStatusUsage.test.ts`)**：
   - 验证 `getStatus` 正确将本地统计完全覆盖至各账号中。
3. **前端构建与全量测试**：
   - 执行 `npm run build:frontend` 验证前端代码编译；
   - 执行 `npm test` 保证所有自动化测试通过。

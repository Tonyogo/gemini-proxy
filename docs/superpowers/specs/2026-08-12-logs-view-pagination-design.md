# 设计文档：请求日志按小时浏览的分页组件与全面加载优化

## 1. 背景与问题分析

在现有系统中，用户选择指定日期和指定小时后，前端 `LogsView.tsx` 向后端 `/api/admin/logs` 发送请求时固定使用了 `limit=30`，并且没有传递 `page` 参数（后端默认 `page=1`）。同时，前端界面上没有提供上一页/下一页、页码指示器或每页条数选择器。

**后果**：当某个小时内产生的 API 请求日志超过 30 条时（例如并发量高或集中请求时有 100+ 条），只有最新 30 条能在列表中呈现，剩余的 70+ 条日志记录被截断，用户无法以任何方式查看或加载这些日志。

## 2. 核心目标

1. 在前端日志列表（左侧 Side Panel）底部新增标准分页器（Pagination Control），包括：
   - 当前页/总页数与记录条数提示（如 `展示 1-50 条 / 共 158 条`）。
   - **[上一页]** 与 **[下一页]** 操作按钮（并在第一页或最后一页时自动禁用）。
   - **每页条数选择器**（支持选择 30、50、100、200 条/页，默认 50 条）。
2. 在前端切换日期或小时选择器时，自动将 `page` 重置为 `1`。
3. 规范后端 `/api/admin/logs` 返回的数据结构，确保完整的包含 `page`, `limit`, `total` (即 `hourCount`) 元数据。
4. 提供多语言 (i18n) 语言包配置，确保中英文环境下均显示友好的分页文案。

## 3. 架构与 API 设计

### 3.1 API 契约变更 (`GET /api/admin/logs`)

**请求参数（Query Parameters）**：
- `date`: 可选，特定日期字符串（如 `2026-08-12`）。
- `hour`: 可选，特定小时字符串（如 `14`）。
- `page`: 可选，当前页码（正整数，默认 `1`）。
- `limit`: 可选，每页条数（正整数，默认 `50`）。

**响应 JSON 格式 (`LogListResponse`)**：
```json
{
  "tree": {
    "2026-08-12": { "14": 158, "13": 42 }
  },
  "hourCount": 158,
  "total": 158,
  "page": 1,
  "limit": 50,
  "logs": [
    {
      "date": "2026-08-12",
      "hour": "14",
      "filename": "transaction_1723456789.json",
      "path": "2026-08-12/14/transaction_1723456789.json",
      "reqPath": "/v1/messages",
      "timestamp": "2026-08-12T14:23:45.000Z",
      "status": 200,
      "isStream": true,
      "duration": 1250,
      "model": "claude-3-5-sonnet-20241022"
    }
  ]
}
```

### 3.2 后端逻辑更新 (`src/admin/services/logService.ts` & `src/admin/controllers/adminController.ts`)

1. **`LogService.listLogs`**:
   - 增加 `page` 和 `limit` 的透传。
   - 返回对象中加上 `page` 与 `limit` 属性。
2. **`AdminController.getLogs`**:
   - 解析 `req.query.page`（默认 `1`）与 `req.query.limit`（默认 `50`）。

## 4. 前端组件与 UI 交互设计 (`frontend/src/components/LogsView.tsx`)

### 4.1 状态管理

在 `LogsView` 组件中引入以下 state：
```tsx
const [page, setPage] = useState<number>(1);
const [limit, setLimit] = useState<number>(50);
const [totalLogs, setTotalLogs] = useState<number>(0);
```

### 4.2 触发条件逻辑

1. **刷新 / 过滤事件**：
   - 当用户更改 `selectedDate` 或 `selectedHour` 时：触发 `setPage(1)` 并请求 `fetchLogs(false, newDate, newHour, 1, limit)`。
   - 当用户点击 **刷新 (Refresh)** 按钮时：保留当前 `date` / `hour`，但重置为 `page 1` 并强刷。
2. **翻页事件**：
   - 点击 **上一页**：`setPage(prev => Math.max(1, prev - 1))` 并发送对应请求。
   - 点击 **下一页**：`setPage(prev => Math.min(totalPages, prev + 1))` 并发送对应请求。
   - 切换 **每页条数** 下拉框：更新 `limit`，重置 `page = 1` 并重新获取数据。

### 4.3 分页 UI 元素结构 (Tailwind CSS)

在左侧日志列表容器 (`w-80`) 的底栏插入分页组件：

```tsx
{/* 分页控制栏 */}
<div className="pt-2 mt-2 border-t border-slate-700/60 flex flex-col gap-2 font-mono text-[11px] text-slate-400">
  <div className="flex items-center justify-between">
    <span>
      {t('logs.showingRange', {
        start: totalLogs === 0 ? 0 : (page - 1) * limit + 1,
        end: Math.min(page * limit, totalLogs),
        total: totalLogs
      })}
    </span>
    <select
      value={limit}
      onChange={(e) => handleLimitChange(Number(e.target.value))}
      className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-200 focus:outline-none"
    >
      <option value={30}>30/页</option>
      <option value={50}>50/页</option>
      <option value={100}>100/页</option>
      <option value={200}>200/页</option>
    </select>
  </div>

  <div className="flex items-center justify-between gap-1">
    <button
      disabled={page <= 1 || loading}
      onClick={() => handlePageChange(page - 1)}
      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition-colors"
    >
      ‹ {t('logs.prevPage')}
    </button>

    <span className="text-slate-300 font-semibold">
      {page} / {totalPages || 1}
    </span>

    <button
      disabled={page >= totalPages || loading}
      onClick={() => handlePageChange(page + 1)}
      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 transition-colors"
    >
      {t('logs.nextPage')} ›
    </button>
  </div>
</div>
```

## 5. 多语言 (i18n) 文案定义

### `frontend/src/i18n/locales/zh.ts`
```ts
logs: {
  // ...已有文案
  prevPage: "上一页",
  nextPage: "下一页",
  showingRange: "{start}-{end} / 共 {total} 条"
}
```

### `frontend/src/i18n/locales/en.ts`
```ts
logs: {
  // ...已有文案
  prevPage: "Prev",
  nextPage: "Next",
  showingRange: "{start}-{end} of {total}"
}
```

## 6. 单元测试与验证计划

1. **后端功能测试**：
   - 编写/更新 `tests/logService.test.ts` 或相关 admin 路由测试：
   - 模拟构造 80 条日志文件在同一 `date/hour` 目录中。
   - 请求 `page=1, limit=50`，确认返回 50 条，且 `hourCount=80`，`total=80`。
   - 请求 `page=2, limit=50`，确认返回剩余 30 条。
2. **前端与集成验证**：
   - 开启前端调试，查看网路请求 `GET /api/admin/logs?date=...&hour=...&page=2&limit=50` 参数。
   - 点击上一页/下一页，确认列表内容平滑更新。
   - 切换日期或小时时，验证页码恢复为 1。

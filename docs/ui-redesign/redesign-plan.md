# Gemini Proxy 前端系统 UI/UX 全面重构规划书 (Redesign Plan)

本文件作为 Gemini Proxy 前端 UI/UX 现代化重构的工程执行蓝图。全面规范产品结构、设计系统、API 数据契约、表格与字段清单、状态与反馈机理，以及实施阶段路线图。

---

## 1. 重构愿景与核心设计原则

- **Clean & High-density (极简且高信息密度)**：采用现代 Linear / Vercel 风格设计语言，高对比度、清晰层级、精致微边框与微妙阴影，服务高密度专业运维场景。
- **URL-First (地址驱动状态)**：全面拥抱 URL 参数作为首要状态源（Page, Filter, Search, Tab, Detail Drawer ID），支持精准分享与多标签页工作。
- **Component-Driven (组件原子化分层)**：彻底告别 1000+ 行巨型单文件，建立严格的 `common/`、`data-display/`、`chat/`、`views/` 分层架构。
- **Graceful Degradation (优雅降级与全态覆盖)**：对每一个业务视图严格规范：Loading (骨架屏)、Empty (引导型空状态)、Error (恢复指引)、Success (微动效反馈)。

---

## 2. 页面重构架构与模式定位

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                   重构后前端整体布局形态                          │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Top: 全局状态指示条 (代理延迟 / 账号健康度 / 系统告警)                             │
├───────────────────┬───────────────────────────────────────────────────────────────┤
│ 固定侧边栏 (Sidebar)│ 动态主工作区 (Main View Workspace)                            │
│                   ├───────────────────────────────────────────────────────────────┤
│ · 仪表盘 (Dashboard)│ 【仪表盘模式】指标大盘、实时吞吐曲线、模型耗时分布            │
│ · 凭据资产 (Accounts)│ 【列表+抽屉模式】凭据健康表格 + 顶部指标卡 + 右侧深度配额抽屉  │
│ · 请求日志 (Logs)   │ 【分栏检查器模式】高级复合筛选 + 日志时序流 + DevTools 双向检查器│
│ · 运维终端 (Terminal)│ 【工作台模式】PTY 交互式 Shell + 实时 SSE 日志流              │
│ · API 调试 (Playground)│ 【工作台+历史记录】Monaco JSON IDE + 历史快照 + 压测 Modal   │
│ · 翻译对比 (Translate)│ 【对比操作台】多模型流式并行译文 + 耗时/速度卡片               │
│                   ├───────────────────────────────────────────────────────────────┤
│ · 全局配置 (Config) │ 【全局侧滑抽屉】从居中弹窗重构为大容量右侧滑出抽屉 (Drawer)    │
└───────────────────┴───────────────────────────────────────────────────────────────┘
```

---

## 3. 全局 API 与数据结构清单 (API & Data Schema)

| API 路由 | 方法 | 对应模块 | 入参 / Query 结构 | 响应数据模型 (Response Interface) |
| :--- | :---: | :--- | :--- | :--- |
| `/api/admin/status` | `GET` | 全局/配置 | Header: `x-admin-key` | `{ status: string, uptime: number, memoryUsage: object, config: SystemConfig }` |
| `/api/admin/stats` | `GET` | Dashboard | Query: `range=today\|6\|12\|24\|48` | `{ timeSeries: TimeSeriesPoint[], summary: object }` |
| `/api/admin/accounts/status` | `GET` | Accounts | 无 | `{ status: { currentAuthIndex, isSystemBusy, accountDetails: AccountDetail[] } }` |
| `/api/admin/accounts/upload` | `POST` | Accounts | Body: `{ files: Array<{ filename, content }> }` | `{ success: boolean, count: number, details: array }` |
| `/api/admin/accounts/toggle-disabled`| `POST` | Accounts | Body: `{ index: number, disabled: boolean }` | `{ success: boolean, message: string }` |
| `/api/admin/accounts/:index/close-context`| `POST` | Accounts | Param: `index` | `{ success: boolean, message: string }` |
| `/api/admin/accounts/:index` | `DELETE` | Accounts | Param: `index`, Query: `force=true` | `{ success: boolean, message: string }` |
| `/api/admin/accounts/batch-delete` | `POST` | Accounts | Body: `{ indices: number[], force: boolean }` | `{ success: boolean, deletedCount: number }` |
| `/api/admin/accounts/deduplicate` | `POST` | Accounts | 无 | `{ success: boolean, count: number }` |
| `/api/admin/accounts/current` | `PUT` | Accounts | Body: `{ targetIndex: number }` | `{ success: boolean, currentAuthIndex: number }` |
| `/api/admin/accounts/batch-download` | `POST` | Accounts | Body: `{ indices: number[] }` | 流式返回 ZIP 压缩包二进制 |
| `/api/admin/logs` | `GET` | Logs | Query: `page, limit, date, hour` | `{ total, hourCount, page, limit, tree, logs: LogSummaryItem[] }` |
| `/api/admin/logs/:d/:h/:f` | `GET` | Logs | Params: `date, hour, filename` | `LogDetailPayload: { client_req, gem_req, claude_res, gem_res, ... }` |
| `/api/admin/config` | `POST` | Config | Body: `Partial<SystemConfig> & { resetToEnv?: boolean }` | `{ status: 'ok', config: SystemConfig }` |
| `/api/admin/terminal/ws` | `WSS` | Terminal | Query / Header: `x-admin-key` | WebSocket PTY 二进制与控制帧 |
| `/api/admin/terminal-logs` | `GET (SSE)` | Terminal | Query: `stream=true` | SSE 文本流：`data: { type: 'history'\|'log', ... }` |
| `/v1/messages` | `POST` | 调试/代理 | Body: 标准 Claude API Payload | 标准 Claude SSE 事件流 或 JSON 响应 |

---

## 4. 表格、字段、操作按钮与筛选条件规范

### 4.1 账号凭据资产表 (Accounts Table Specification)

- **顶部指标筛选条 (Metrics Filter Bar)**：
  - 全部 (All)、已激活 (Activated)、激活中 (Activating)、未激活 (Inactive)、已下线 (Retired)、已禁用 (Disabled)、异常告警 (Issues - 包含失效/过期/重复)。
- **数据表格字段清单**：
  1. `[Checkbox]`：复选框，支持单选与跨页全选联动；
  2. `序号 (Index)`：`#0`, `#1`，主活跃账号标记 `[CURRENT]` 徽章；
  3. `凭据标识 / 邮箱 (Identifier)`：支持点击复制，展示主邮箱或文件名，带有有效性小图标；
  4. `生命周期状态 (Status)`：
     - `ACTIVATED`：绿灯常亮，处理中显示闪烁圆点；
     - `ACTIVATING`：琥珀色脉冲；
     - `INACTIVE`：浅灰；
     - `RETIRED`：深灰；
     - `DISABLED`：玫瑰红；
  5. `并发与上下文 (Concurrency)`：展示当前活跃上下文标记与并发处理中请求数（In-Flight）；
  6. `配额与今日调用量 (Quota & Usage)`：微型进度条，展示已用请求数 / 总可用配额，点击打开详情抽屉；
  7. `操作组 (Actions)`：
     - 单击设为主账号 (Pin Current)；
     - 启用 / 禁用切换开关 (Toggle Switch)；
     - 关闭会话上下文 (Close Context)；
     - 下载凭据 JSON (Download)；
     - 删除账号 (Delete)。
- **批量操作工具栏 (Batch Action Bar - 浮动底部居中)**：
  - 当 `selectedIndices.length > 0` 时浮出，展示选中数量，提供：批量启用、批量禁用、批量打包下载 (ZIP)、批量强制删除。

---

### 4.2 请求日志列表与检查器规范 (Logs & Inspector Specification)

- **多维筛选控制台 (Advanced Query Toolbar)**：
  - **时间范围选择器**：支持跨小时跨天快捷选择（今天 / 昨天 / 最近 2 小时 / 自定义）；
  - **状态码胶囊组**：全部 (All) / 成功 (2xx) / 客户端异常 (4xx) / 网关上游异常 (5xx)；
  - **请求模型下拉**：按目标模型（如 `gemini-2.5-flash`, `gemini-pro-latest`）过滤；
  - **耗时阈值滑块/输入**：过滤 `> 2000ms` 的慢调用；
  - **关键词检索框**：支持请求路径、文件名、用户 ID 模糊搜寻。
- **列表项信息字段**：
  - 请求方法徽章 (`POST`)、HTTP 状态码徽章 (`200`, `500`)、响应时长 (`1240ms`，根据快慢标注绿/黄/红)、模型标识、时间戳 (`15:23:45`)、流式标记 (`SSE`)。
- **DevTools 右侧/抽屉检查器 (Inspector)**：
  - 标签一：**Payload 审查**（支持在“树形树 (JsonTreeView)”与“原始高亮 (Monaco)”间一键切换，支持一键复制 Claude cURL / Gemini cURL）；
  - 标签二：**Response 响应**（非流式直接格式化，流式激活 `SseStreamPreview` 时序事件流与打字机回放）；
  - 标签三：**Conversation 还原**（将原始报文自动解构成可视化的 Chat 对话气泡、思考链折叠器与 Tool Call 执行卡片）。

---

## 5. 交互状态规范 (Loading / Empty / Error / Feedback)

### 5.1 加载中状态 (Loading States)
- **全局首次载入**：统一采用背景暗光流动 + 品牌 Logo 脉冲动画，避免闪烁；
- **表格与列表**：统一采用 **骨架屏 (Skeleton Screens)**，呈现 5~8 行带有轻微呼吸渐变的占位块，严格杜绝数据到达时页面跳动 (CLS)；
- **操作中状态 (In-flight Actions)**：按钮在点击后自动转入 `disabled` + 内置小菊花 (Spinner)，文字转为进行态（如“正在导出凭据...”）。

### 5.2 空状态规范 (Empty States)
每个模块均配备统一规范的 `<EmptyState>` 组件：
- `AccountsView` 无账号时：展示凭据金库图标，文案：“当前尚未导入任何账号凭据”，配主按钮“立即导入凭据”；
- `LogsView` 搜索无结果时：展示放大镜图标，文案：“未找到匹配的请求日志”，配辅助按钮“清空所有筛选条件”；
- `Playground` 无响应结果时：展示代码图标，文案：“在左侧编辑请求并点击发送，此处将实时展示调用结果”。

### 5.3 异常与容错机制 (Error Handling)
- **全局通知统一收敛**：放弃局部内联红字与各视图自行实现的定时器，引入全局单例 `<NotificationCenter>`，提供轻量平滑滑入的 Toast（Success, Warning, Error, Info）；
- **网络重试引导**：当后端 API 发生 502/网络断开时，以非侵入式顶部横幅（Banner）展示，并提供“重连中 (5s)... / 立即重试”按钮。

---

## 6. 四阶段实施路线图 (Implementation Phases)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                                四阶段迭代落地实施计划                             │
├───────────────────┬───────────────────────────────────────────────────────────────┤
│ 阶段一 (Phase 1)   │ 设计系统原子化与通用组件库建设                                │
│                   │ · 沉淀 Button, Input, Select, Modal, Drawer, Badge, Skeleton  │
│                   │ · 封装 useClipboard, useNotification, useUrlState 基础 Hooks   │
├───────────────────┼───────────────────────────────────────────────────────────────┤
│ 阶段二 (Phase 2)   │ 核心资产页重构: 账号管理与系统配置                            │
│                   │ · 拆分 AccountsView 巨型文件，移除内嵌轮询日志                │
│                   │ · 实现标准账号表格、指标卡片与凭据详情抽屉                    │
│                   │ · 将 ConfigModal 重构为全功能配置抽屉                         │
├───────────────────┼───────────────────────────────────────────────────────────────┤
│ 阶段三 (Phase 3)   │ 观测中心重构: 请求日志与统一运维工作台                        │
│                   │ · 重构 LogsView，加入模型与耗时多维过滤                       │
│                   │ · 优化 JsonTreeView 大数据性能与 SseStreamPreview 计时器      │
│                   │ · 完善 UnifiedTerminal 运维控制台体验                         │
├───────────────────┼───────────────────────────────────────────────────────────────┤
│ 阶段四 (Phase 4)   │ 开发者体验与润色: 操场、翻译台与全端自适应                    │
│                   │ · Playground 增加历史快照与收藏模板                           │
│                   │ · TranslateView 优化多栏响应式排版与 Diff 模式                │
│                   │ · 移动端端到端手势与触控交互精细化打磨                        │
└───────────────────┴───────────────────────────────────────────────────────────────┘
```

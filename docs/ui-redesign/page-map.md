# 页面架构与路由映射地图 (Page Map)

本文件深入分析系统现有页面拓扑结构、当前伪路由实现机制、组件归属、业务归属以及重构后的页面模式重塑。

---

## 1. 当前页面总览与现有路由机制

### 1.1 路由实现机理
目前前端系统**未采用成熟的客户端路由库（如 React Router）**，而是基于 `useState<TabType>('dashboard')` 与局部 `localStorage.getItem('admin_active_tab')` 维系的“单页标签页驱动 (Tab-driven)”架构：
- 唯一具有真实 URL 监听的特化路由是 `/terminal` 与 `#/terminal`，通过监听 `popstate` / `hashchange` 实现网页终端的独立全屏模式（`isStandaloneTerminal`）；
- 其余 5 个主页面（`dashboard`, `accounts`, `logs`, `playground`, `translate`）均通过组件内部 state 条件渲染；
- 刷新页面时仅依赖 `localStorage` 恢复 Tab，不支持深层链接（Deep Linking），无法通过 URL 共享具体的日志详情、账号筛选条件或特定调试预设。

---

## 2. 现有页面详尽映射表

| 序号 | 页面 ID / Tab | 现有实现文件 | 核心业务功能 | 核心 API 依赖 | 现有布局形态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P-00** | **Login (认证拦截层)** | `App.tsx` (内嵌条件渲染) | 管理员身份认证、密钥存储、主题/语言切换 | `GET /api/admin/status` (验证 `x-admin-key`) | 居中玻璃拟态卡片 Modal |
| **P-01** | **Dashboard (控制台概览)** | `DashboardView.tsx` | 系统吞吐量曲线 (QPS/Success/Error)、平均响应时长趋势、模型请求占比与延迟矩阵、当前运行时参数速查 | `GET /api/admin/status`<br>`GET /api/admin/stats?range=today\|6\|12\|24\|48` | 仪表盘网格 (Grid Dashboard) |
| **P-02** | **Accounts (账号管理)** | `AccountsView.tsx` | 凭据状态看板（总数/激活/激活中/下线/禁用/失效/处理中并发）、凭据列表检索与筛选、凭据上传/去重/批量下载/批量删除/切换当前主账号/关闭上下文 | `GET /api/admin/accounts/status`<br>`POST /api/admin/accounts/upload`<br>`POST /api/admin/accounts/toggle-disabled`<br>`POST /api/admin/accounts/:index/close-context`<br>`DELETE /api/admin/accounts/:index`<br>`POST /api/admin/accounts/batch-delete`<br>`POST /api/admin/accounts/deduplicate`<br>`PUT /api/admin/accounts/current`<br>`GET /api/admin/accounts/files/:filename`<br>`POST /api/admin/accounts/batch-download` | 统计栏 + 列表表格 + 折叠式终端日志抽屉 |
| **P-03** | **Logs (请求日志与审计)** | `LogsView.tsx` | 请求日志多维索引（日期/小时分层检索、状态码快速过滤、关键词搜寻）、双栏 DevTools 检查器（树形 JSON、SSE 分块重放、气泡对话渲染、cURL 复制） | `GET /api/admin/logs?page=&limit=&date=&hour=`<br>`GET /api/admin/logs/:date/:hour/:filename` | 经典双栏/主从检查器 (Master-Detail Inspector) |
| **P-04** | **Terminal (终端与运维)** | `UnifiedTerminalView.tsx`<br>↳ `WebTerminalView.tsx`<br>↳ `TerminalLogsView.tsx` | 宿主机 Linux 网页 Shell（支持移动端按键辅控条、常用命令片段抽屉、全屏切屏）；服务端 SSE 实时日志流监听与过滤 | `WSS /api/admin/terminal/ws`<br>`GET /api/admin/terminal-logs?stream=true` | 标签切换型全屏工作台 (Full-width Workbench) |
| **P-05** | **Playground (API 调试器)** | `PlaygroundView.tsx` | Monaco 驱动的原始 Claude 格式请求体编辑与语法校验、预设模版快速填充、流式/非流式请求发送、打字机效果预览、并发压测 Modal | `POST /v1/messages`<br>`POST /v1/messages/count_tokens`<br>（经由代理核心） | 左右分栏工作台 (Split Workbench) |
| **P-06** | **Translate (翻译工作台)** | `TranslateView.tsx` | 基于 Claude/Gemini 的技术文档智能双语翻译、自动语种识别、风格切换、最多 3 模型并行流式响应与 Token 耗时横向对比 | `POST /v1/messages`<br>`GET /api/admin/models` | 左右并列/多栏比对工作台 (Comparison Workbench) |
| **P-07** | **System Config (系统配置)** | `ConfigModal.tsx` | 系统级参数配置（日志级别、Gemini Base URL、系统角色转换、请求超时、日志保留周期、模型路由映射 KV/JSON 双向编辑、敏感系统/用户消息清理） | `GET /api/admin/status`<br>`POST /api/admin/config` | 模态弹窗 (Modal Dialog) |

---

## 3. 页面模式归类与重构定位建议

根据行业最佳实践与高频运维操作体验，对当前页面的设计模式进行重新界定：

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                页面形态分类重构建议                              │
├────────────────────────────────┬─────────────────────────────────────────────────┤
│ 模式类型                       │ 对应页面与改动设计                             │
├────────────────────────────────┼─────────────────────────────────────────────────┤
│ ① 仪表盘模式 (Dashboard)       │ · Dashboard 概览页：保持大屏网格，增强关键健康KPI │
│                                │ · Accounts 顶部看板：应抽离为标准指标卡组件     │
├────────────────────────────────┼─────────────────────────────────────────────────┤
│ ② 列表 + 筛选 + 详情 (CRUD/List)│ · Accounts 账号页：标准的表格 + 筛选栏 + 批量操作 │
│                                │ · Logs 请求日志页：标准的列表 + 抽屉/分栏检查器 │
├────────────────────────────────┼─────────────────────────────────────────────────┤
│ ③ 工作台/操作台模式 (Workbench) │ · Playground API 调试器：保持专业 IDE 工作台体验 │
│                                │ · Translate 翻译对比：保持多栏响应式操作台     │
│                                │ · Terminal 终端：保持独立全宽交互控制台         │
├────────────────────────────────┼─────────────────────────────────────────────────┤
│ ④ 抽屉 / 模态框 (Drawer/Modal) │ · ConfigModal：由居中弹窗升级为侧边高级抽屉     │
│                                │ · Accounts 内置终端日志：从页面底部抽离为右抽屉 │
│                                │ · ConcurrentTestModal：保持轻量任务型 Modal     │
│                                │ · 账号凭据详情 / 配额图表：建议改造为侧边抽屉   │
└────────────────────────────────┴─────────────────────────────────────────────────┘
```

### 3.1 哪些页面应该合并？
1. **Accounts 页面底部的“终端日志”与 Terminal 主页面的“服务端日志”**：
   - **现状**：`AccountsView.tsx` 在页面下方嵌入了一个折叠式的“终端日志（轮询获取）”，而 `UnifiedTerminalView.tsx` 中又有专门的 `TerminalLogsView`（SSE 流式获取）。两处不仅功能高度重叠，且 Accounts 中的轮询机制（每 3 秒 `fetchStatus`）带来冗余开销。
   - **重构建议**：彻底将 Accounts 下方的内嵌日志移除，或统一接入 `TerminalLogs` 轻量抽屉；让 Accounts 专心作为“凭据管理资产表格”。
2. **TranslateView 与 PlaygroundView 的能力合并或体系归一**：
   - **现状**：两者都是直接调用 `/v1/messages` 的调试客户端，使用了相似的 Monaco/Markdown、流式中断逻辑、模型选择逻辑。
   - **重构建议**：保持入口独立，但下沉公共的“请求执行器引擎（Request Runner Hook）”与“流式结果渲染器（Stream Result Inspector）”。

### 3.2 哪些页面应该拆分？
1. **AccountsView 页面拆分**：
   - 当前 `AccountsView.tsx` 超过 1000 行，集成了：状态卡片、搜索筛选栏、凭据数据表、分页、批量操作工具条、账号删除/去重弹窗、浮动 Popover、用量折线、以及底部的轮询终端日志。
   - **建议拆分为**：
     - `AccountMetricsHeader.tsx`（指标汇总栏）
     - `AccountTableToolbar.tsx`（搜索、状态过滤、导入与批量操作工具条）
     - `AccountTable.tsx`（纯受控表格）
     - `AccountDetailDrawer.tsx`（账号深度配额、多模型用量柱状图右侧抽屉）
     - `AccountUploadModal.tsx`（凭据导入弹窗）
2. **LogsView 页面拆分**：
   - 当前 `LogsView.tsx` 超过 700 行，承担了时间树层级计算、日志列表项渲染、顶部筛选、以及各种右侧 Inspector 标签。
   - **建议拆分为**：
     - `LogListSidebar.tsx`（包含日期树筛选、搜索、翻页、列表项）
     - `LogInspectorPanel.tsx`（右侧检查器容器）
     - 独立的 `LogCurlExportModal.tsx` 或统一的复制工具条。

---

## 4. 路由状态与 URL 参数设计（现代 URL-first 理念）

重构后应支持**基于 URL 查询参数的深度链接**，便于运维协作、错误分享及刷新保持状态：

```
/dashboard                          --> 默认控制台概览
/dashboard?range=24h                --> 指定时间跨度
/accounts                           --> 账号列表
/accounts?status=ACTIVATED&q=vip    --> 带状态过滤与关键词的列表
/accounts/:id                       --> 打开指定账号详情侧边抽屉
/logs                               --> 日志中心
/logs?date=2026-09-03&hour=15       --> 定位特定小时日志批次
/logs/:logId                        --> 展开指定日志的 DevTools 检查器
/logs/:logId?tab=chat               --> 直接打开会话气泡视图
/terminal                           --> 独立终端（兼容当前 /terminal 行为）
/playground                         --> API 调试器
/playground?preset=toolUse          --> 直接加载特定调试模版
/translate                          --> 多模型智能翻译工作台
```

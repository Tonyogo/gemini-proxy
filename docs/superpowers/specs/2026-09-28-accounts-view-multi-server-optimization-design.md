# Web 端多服务器账号管理重构与节点模型调用统计明细设计规范 (Accounts View Multi-Server Optimization & Node Model Stats Design Spec)

## 1. 背景与目标 (Background & Goals)

### 1.1 现状与痛点
1. **标题冗余与层级脱节**：
   - 系统的侧边栏导航和主框架中已经明确标注了“账号管理（Accounts）”；
   - 页面内部又渲染了一个独立的 `<h1>账号管理</h1>` 大标题及其图标和副标题，不仅侵占宝贵的竖向首屏空间，而且让上方的服务器节点切换 Tab 显得孤立、与页面内容脱节。
2. **多服务器网关切换体验简陋**：
   - 目前的切换器仅为简陋的小标签行，信息密度低，无法直观反映各个上游网关节点的健康状态、账号规模与流量特征。
3. **缺乏节点维度的模型调用全景明细**：
   - 虽然底层已具备单账号维度的按模型统计（`byModel`），但在多节点架构下，管理员无法一目了然得知：**“当前这台服务器承接了哪些模型的请求？各模型调用量占比如何？成功率是否存在异常？”**
   - 账号列表中的模型明细完全隐藏在悬浮 Popover 或移动端折叠抽屉中，难以直观对比各账号在不同模型上的负载贡献。

### 1.2 设计目标
1. **标题去重与结构扁平化**：
   - 彻底移除页面内重复的 `<h1>账号管理</h1>` 大标题，首屏顶部直接由“网关节点选择器”统领，拉平视觉层级，极大扩充有效数据操作区域。
2. **现代卡片/胶囊式网关切换栏 (Server Gateways Switcher)**：
   - 高信息密度展示各服务器的序号、别名/域名、健康呼吸指示灯、账号总数、流量权重与模型支持状态。
3. **节点级专属模型调用统计大盘 (Server Model Stats Banner)**：
   - 在选中的服务器头部提供通栏统计卡片，聚合展示该节点全量账号的：
     - 总调用数、成功率、���跃账号数；
     - 模型流量占比多色分布条（Traffic Share Bar）；
     - 各模型细分调用指标（模型名、总请求数、成功/失败数、成功率、流量占比）。
   - 支持一键折叠/展开，节省垂直空间。
4. **账号表格行内模型用量胶囊 (Inline Model Badges)**：
   - 表格“用量”列在展示总量的同时，行内紧凑展示该账号主力调用的 Top 2 模型胶囊徽标（如 `flash: 1.2k`、`pro: 300`）；
   - 悬浮/轻触保持完整的交互 Popover 查看所有模型明细。
5. **双语国际化 (i18n)**：补齐中文（`zh.ts`）与英文（`en.ts`）新词条。

---

## 2. 界面与交互架构设计 (UI & Layout Architecture)

### 2.1 整体页面流式排版 (Vertical Hierarchy)
```
+---------------------------------------------------------------------------------------------------------+
| [⚡ Server 1: 官方香港网关 (hk.example.com)  ● 权重: 80  账号: 12 ]  [ Server 2: 备用美西  ● 账号: 4 ... ]      | <-- 1. 网关节点矩阵选择栏
+---------------------------------------------------------------------------------------------------------+
| 📊 节点运行与模型调用概览 (Server 1)                           [总调用: 1,580]  [成功率: 99.4%]  [收起 ^]   | <-- 2. 节点专属模型统计看板
| 模型流量占比: [ gemini-2.5-flash: 78.5% ■ ] [ gemini-2.5-pro: 21.5% ■ ]                                  |
| 模型明细: • gemini-2.5-flash: 1,240 次 (成功 1,235 / 失败 5, 99.6%)  • gemini-2.5-pro: 340 次 (98.5%)    |
+---------------------------------------------------------------------------------------------------------+
| [ 搜索框 (序号/标识/模型) ] [ 状态筛选器 (全部/激活/...) ] [ 批量操作 v ] [ 上传凭据 ] [ 刷新 ]             | <-- 3. 紧凑操作工具栏
+---------------------------------------------------------------------------------------------------------+
| [ ] 序号 | 账号标识 / 邮箱 | 运行状态机 | 凭据上下文 | 模型调用用量 (含 Top 模型) | 操作栏                  | <-- 4. 账号数据表格
+---------------------------------------------------------------------------------------------------------+
```

### 2.2 多服务器网关选择器 (Server Gateways Switcher)
- 布局：置于页面最顶端，横向自适应滚动（`overflow-x-auto`）；
- 单个卡片包含：
  - 节点标头：`Server {index + 1}` + `别名`（若有）或 `主机名`；
  - 运行状态：绿色呼吸灯（在线）、红色呼吸灯（离线/熔断）、旋转菊花（加载中）；
  - 账号数量徽标：清晰展示该节点已有凭据数量；
- 交互动效：
  - 激活态：主色立体微浮雕、高亮边框与选中指示线；
  - 未激活态：毛玻璃底色、悬浮微动效，点击平滑无缝切换激活节点。

### 2.3 节点模型调用统计看板 (Server Model Stats Banner)
- **数据自动聚合算法**：
  基于当前激活节点拉取到的 `accounts` 列表实时向上归并：
  - $TotalRequests = \sum acc.usage.totalRequests$
  - $TotalSuccess = \sum acc.usage.totalSuccess$
  - $SuccessRate = \begin{cases} 100.0\%, & TotalRequests = 0 \\ \frac{TotalSuccess}{TotalRequests} \times 100\%, & TotalRequests > 0 \end{cases}$
  - 对所有账号的 `byModel` 按模型名称归类聚合，计算各模型的请求量及占该节点总量的 $SharePercent$；
- **展示组件**：
  - 头部快捷指标：总请求量徽标、综合成功率徽标、折叠/展开切换按钮；
  - 多色流量分段条：各活跃模型按颜色切分占比展示；
  - 明细指标网格：清晰展示每个模型的请求次数、成功/失败数、成功率与占比；
  - 空状态兜底：若该节点暂无调用记录，显示轻量优雅的“当前节点暂无调用记录”提示，不破坏视觉平衡。

### 2.4 账号表格行内模型用量胶囊 (Inline Model Capsules)
- 优化“用量 (Usage)”单元格展示：
  - 顶部主行：显示账号总请求数与成功率色标（如 `1,580`，成功率小绿标）；
  - 次行模型胶囊：行内展示调用量最多的 Top 2 模型紧凑徽标���如 `flash: 1.2k`、`pro: 340`）；
  - 悬浮/轻触交互：保持完整的悬浮 Popover 机制，展示完整明细与成功/失败分布。

---

## 3. 数据契约与接口复用 (Data Contracts)

本重构充分利用现有后端完备的接口，前端无需对后端 API 进行侵入式破坏，纯粹复用现有标准化数据：
1. **`/api/admin/accounts/servers`**：
   - 获取所有已配置的服务器节点列表（`servers: string[]`）及熔断健康状态（`circuits: UpstreamCircuitState[]`）。
2. **`/api/admin/accounts/status?serverId={idx}`**：
   - 获取指定服务器下的全量账号信息 `accountDetails: AccountDetail[]`；
   - 现有关联机制已确保每个账号对象均包含精确的 `usage.byModel` 字典，格式规范为：
     ```typescript
     byModel: {
       "gemini-2.5-flash": { requests: 1200, success: 1195, error: 5 },
       "gemini-2.5-pro": { requests: 300, success: 295, error: 5 }
     }
     ```
3. **前端纯粹数据流**：
   - `serverDataMap[activeServerIndex]` 驱动当前节点的所有统计、看板与表格，多节点数据完全独立、相互隔离。

---

## 4. 国际化与文案规范 (i18n Specifications)

在 `frontend/src/i18n/locales/zh.ts` 和 `en.ts` 中维护规范化词条：
- `accounts.serverModelStatsTitle`: "节点模型调用概览" / "Node Model Usage Overview"
- `accounts.totalRequests`: "总调用量" / "Total Requests"
- `accounts.successRate`: "成功率" / "Success Rate"
- `accounts.modelTrafficShare`: "模型流量占比" / "Model Traffic Share"
- `accounts.activeModels`: "活跃模型明细" / "Active Models Breakdown"
- `accounts.noModelUsageYet`: "当前节点暂无模型调用数据" / "No model usage recorded on this node yet"
- `accounts.toggleStatsCollapse`: "收起" / "Collapse"
- `accounts.toggleStatsExpand`: "展开" / "Expand"

---

## 5. 测试与质量保证 (Testing Strategy)

1. **多节点模型聚合计算单元测试 (`tests/accountsViewModelStats.test.ts`)**：
   - 验证单服务器下跨账号模型调用指标的精准归并；
   - 验证无调用数据、0 除法防守（确保不出现 `NaN%`）；
   - 验证多节点切换时各自统计独立无污染。
2. **界面渲染与交互测试 (`tests/accountsViewMultiServer.test.tsx`)**：
   - 验证内嵌的 `<h1>账号管理</h1>` 大标题已被彻底移除；
   - 验证顶部网关节点选择器在单节点/多节点下的自适应展示与切换响应；
   - 验证服务��模型统计看板在有数据/无数据状态下的完整渲染与折叠交互；
   - 验证账号列表行内 Top 模型胶囊徽标的正确渲染。
3. **全量构建与回归保障**：
   - 运行 `npm run build:frontend` 验证 Vite + TypeScript 0 报错；
   - 运行 `npm test` 保证既有 155 个测试套件 100% 持续通过。

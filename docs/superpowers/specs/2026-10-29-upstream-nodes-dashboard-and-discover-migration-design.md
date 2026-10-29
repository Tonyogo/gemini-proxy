# 首页节点信息展示与账号管理平滑迁移至发现页设计规范

## 1. 概述与背景 (Intent & Why)

随着 Gemini Proxy 的发展，系统定位明确为高性能、无状态的 API 代理网关与管理调试控制台。

目前主导航栏包含了 4 个顶级 Tab：`控制台概览`、`账号管理`、`请求日志`、`发现`。其中：
1. **老「账号管理」定位下沉**：账号凭据池管理属于低频维护操作；在引入多节点（直连模式 / 代理模式）架构后，用户日常更关注的是**各上游节点的整体运行状态与流量表现**，而非频繁下钻单个节点的凭据列表。
2. **「发现」页（Discover Hub）已具备完备的应用生态**：系统日志、接口演练、双语对照、在线事项均已收敛在「发现」页，具备内置工具与自定义卡片能力，适合作为各种工具箱与高级运维页面的聚集地。
3. **首页（Dashboard）缺乏节点维度的直接观测**：用户进入首页希望能一眼了解当前挂载的各个上游节点（直连/代理、健康度、权重分配、流量吞吐与平均延迟），而无需切换至老账号页查看。

因此，本次重构将：
1. **精简主导航**：移除顶级「账号管理」Tab，主导航精简为 `控制台概览 (⌘1)`、`请求日志 (⌘2)`、`发现 (⌘3)`。
2. **将老账号页迁移入发现页**：在发现页中作为内置应用 **「上游节点信息」（Upstream Nodes）** 启动，保留原有的全部凭据管理与终端日志功能。
3. **首页加入「上游节点状态概览」**：在顶部 APM KPI 指标与模型性能矩阵之间展示各节点的运行概况，纯利用本地已有指标，保持零额外网络开销与秒级首屏加载。

---

## 2. 目标、非目标与负目标 (Goals, Non-Goals, Anti-Goals)

### 2.1 目标 (Goals)
1. **主导航精简与快捷键对齐**：
   - 边栏和移动端底栏精简为 3 个主项：`控制台概览`（⌘1）、`请求日志`（⌘2）、`发现`（⌘3）。
   - 用户本地 `admin_active_tab === 'accounts'` 时自动平滑迁移至 `discover`（并自动激活 `upstreamNodes`），避免出现空白页。
2. **发现页集成「上游节点信息」应用**：
   - 在 `DEFAULT_BUILTIN_APPS` 中注册内置应用 `upstreamNodes`：
     - ID: `'upstreamNodes'`
     - 名称: 中文「上游节点信息」、英文「Upstream Nodes」
     - 图标: `Server`，渐变背景: `'from-blue-600 to-indigo-700'`，Badge: `'MULTI-NODE'`
     - 描述: 中文「集中管理多节点账号凭据、状态监控与上下文轮换」
   - 支持桌面端应用卡片点击启动与移动端列表启动。
   - 启动后进入内嵌式全功能 `AccountsView`，顶栏面包屑展示 `Gemini Proxy > 发现 > 上游节点信息`，点击「发现」可随时返回 Discover Hub；移动端支持左上角返回按钮退回 Hub。
   - 纳入 `DiscoverConfigModal` 的自定义排序与显示/隐藏配置生态。
3. **首页（DashboardView）新增「上游节点状态概览」组件 (`UpstreamNodesOverview`)**：
   - 摆放在「顶部 4 个 APM KPI 卡片」下方、「模型性能矩阵」上方。
   - **零额外网络开销**：100% 复用已有的 `/api/admin/status`（包含节点配置、权重、熔断隔离状态）与 `/api/admin/stats?range=...`（包含当前时间范围内的请求量、成功/失败数、平均延迟）。
   - 响应式多卡片网格布局（支持自适应 1 列、2 列或多列）：
     - 节点标头：节点序号/名称（如 `Server 1 (aistudio-proxy...)`）、在线状态指示灯（🟢 正常在线 / 🔴 熔断隔离中脉冲 / ⚪ 禁用）。
     - 节点模式与调度权重：`直连`（青色）或 `代理`（紫色）徽章 + 调度权重（如 `Weight 1 · 50.0%`）。
     - 关键性能指标：区间请求量、成功率（如 `1,420 reqs · 99.8%`）、平均延迟（如 `850 ms`）。
     - 若为直连节点，展示绑定的 `API Key 数量`。
4. **多语言（i18n）完整支持**：
   - 补齐中英文双语字典，包括发现页内置应用名称描述、首页节点概览卡片标题及各项指标标签。

### 2.2 非目标 (Non-Goals)
- 不修改底层 `upstreamManager` 的健康检查、熔断器和权重轮询调度算法。
- 不重写或拆分 `AccountsView` 的内部实现，保持其凭据上传、去重、删除、多节点切换与终端日志功能原样复用。
- 不从首页向各代理服务器发起额外的 `/api/admin/accounts/status` 账号池轮询，保证首页的高性能与轻量化。

### 2.3 负目标 (Anti-Goals)
- **拒绝硬编码与路由断裂**：不能因导航移除导致存量 URL 或已保存的主 Tab 状态报错。
- **拒绝视觉割裂**：首页新增的节点概览卡片必须严格遵循 Linear 风格设计规范（Glassmorphism、深浅色模式 CSS 变量、统一字体与圆角）。

---

## 3. 详细架构设计 (Detailed Architecture)

### 3.1 发现页扩展与类型定义

#### 1. 发现页工具类型 (`frontend/src/types/discoverApps.ts`)
```ts
export type DiscoverToolId = 'systemLogs' | 'playground' | 'translate' | 'tasks' | 'upstreamNodes';
```

#### 2. 内置应用预设 (`frontend/src/utils/discoverAppsStorage.ts`)
在 `DEFAULT_BUILTIN_APPS` 中添加：
```ts
{
  id: 'upstreamNodes',
  type: 'builtin',
  name: '上游节点信息',
  description: '集中管理多节点账号凭据、状态监控与上下文轮换',
  icon: 'Server',
  color: 'from-blue-600 to-indigo-700',
  badge: 'MULTI-NODE',
  enabled: true,
  order: 4,
}
```
并在 `mergeBuiltinDiscoverApps` 中确保向后兼容：当已有的用户本地/云端配置中缺失 `upstreamNodes` 时，自动将其无缝合并到列表中，避免已自定义过应用列表的老用户看不到新应用。

#### 3. 发现页卡片渲染 (`frontend/src/components/DiscoverHubView.tsx`)
- 引入 `Server` 图标，在 `renderAppIcon` 中针对 `app.id === 'upstreamNodes' || app.icon === 'Server'` 渲染 `<Server className={sizeClass} />`。
- 在 `getAppTitle`、`getAppDesc`、`getAppBadge` 中增加 `upstreamNodes` 的多语言和徽章适配。

---

### 3.2 全局导航调整 (`frontend/src/App.tsx`)

#### 1. Tab 类型定义与导航数组
```ts
type TabType = 'dashboard' | 'logs' | 'discover';
export type DiscoverSubView = 'hub' | 'systemLogs' | 'playground' | 'translate' | 'tasks' | 'embeddedWeb' | 'upstreamNodes';

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
  { id: 'logs', icon: FileText, shortcut: '⌘2' },
  { id: 'discover', icon: Compass, shortcut: '⌘3' },
];

const VALID_TABS: TabType[] = ['dashboard', 'logs', 'discover'];
```

#### 2. 本地存储向后兼容重定向
```ts
const [activeTab, setActiveTab] = useState<TabType>(() => {
  const rawSaved = localStorage.getItem('admin_active_tab');
  if (rawSaved === 'accounts') {
    return 'discover';
  }
  if (rawSaved === 'systemLogs' || rawSaved === 'playground' || rawSaved === 'translate' || rawSaved === 'tasks' || rawSaved === 'upstreamNodes') {
    return 'discover';
  }
  const saved = rawSaved as TabType;
  return VALID_TABS.includes(saved) ? saved : 'dashboard';
});

const [discoverSubView, setDiscoverSubView] = useState<DiscoverSubView>(() => {
  const rawSaved = localStorage.getItem('admin_active_tab');
  if (rawSaved === 'accounts') {
    return 'upstreamNodes';
  }
  if (rawSaved === 'systemLogs' || rawSaved === 'playground' || rawSaved === 'translate' || rawSaved === 'tasks' || rawSaved === 'upstreamNodes') {
    return rawSaved as DiscoverSubView;
  }
  return 'hub';
});
```

#### 3. 顶栏面包屑与移动端返回逻辑
- `isMobileDetailActive` 扩充：当 `activeTab === 'discover' && discoverSubView !== 'hub'` 时保持沉浸式返回按钮激活。
- 在面包屑渲染中增加：
  ```tsx
  {discoverSubView === 'upstreamNodes' && t('discover.upstreamNodesTitle', '上游节点信息')}
  ```
- 在 `<main>` 工作区内渲染：
  ```tsx
  {discoverSubView === 'upstreamNodes' && (
    <AccountsView
      key={refreshTrigger}
      adminKey={adminKey}
    />
  )}
  ```

---

### 3.3 首页「上游节点状态概览」组件 (`UpstreamNodesOverview.tsx`)

#### 1. 组件位置与挂载
在 `DashboardView.tsx` 中：
```tsx
{/* Tier 2: 4 APM KPI Summary Cards */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
  ...
</div>

{/* Tier 2.5: Upstream Nodes Health & Traffic Overview */}
<UpstreamNodesOverview
  upstreamServers={upstreamServers}
  timeSeries={timeSeries}
  range={range}
/>

{/* Tier 3: Full-width Model Performance DataTable & Matrix */}
<ModelPerformanceMatrix ... />
```

#### 2. 数据聚合算法 (纯本地零请求开销)
组件接收 `upstreamServers`（从 `stats.upstreamServers` 或 `status.upstreamStatus` 获得）与 `timeSeries`。
针对每个节点 `idx`（0, 1, 2, ...）：
1. **静态/调度状态**：
   - 提取 `url`, `name`, `type` (`proxy` | `direct`), `weight`, `enabled`, `isIsolated`, `effectivePercent`（权重流量占比）, `apiKeys`（针对直连模式计算数量）。
   - 解析出简明域名 `host`（如 `aistudio-proxy.example.com`）。
2. **动态流量指标（从 `timeSeries` 的 `modelNodes` 聚合）**：
   - 遍历 `timeSeries` 中每个时间点的 `p.modelNodes`，查找键为 `String(idx)` 的统计：
     - `requests += m.requests`
     - `success += m.success`
     - `error += m.error`
     - `totalDuration += m.totalDuration`
     - `durationCount += m.durationCount`
   - 计算该节点在当前时间范围（`today` / `6h` / `12h` / `24h` / `48h`）内的：
     - `successRate`: `requests > 0 ? (success / requests * 100).toFixed(1) : '100.0'`
     - `avgLatency`: `durationCount > 0 ? Math.round(totalDuration / durationCount) : 0`

#### 3. 视觉展示设计
- **卡片头部容器**：
  - 左侧标题：`Server` 图标 + **「上游节点概览」** / **「Upstream Nodes Overview」** + 节点总数徽章（如 `2 个节点运行中`）。
  - 右侧状态简讯：展示活跃健康节点数与熔断数。
- **网格卡片 (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3`)**：
  - **Node Header**：
    - 运行状态点：绿色呼吸点（健康在线） / 红色呼吸点（熔断隔离） / 灰色点（禁用）。
    - 节点名称：`Server N` / 自定义名称 + 域名 Host。
    - 模式徽章：`直连`（青色）/ `代理`（紫色）。
  - **Node Body (性能与配额)**：
    - **流量权重**：显示有效分流占比（如 `权重 1 · 50%`）。
    - **请求与成功率**：`总请求数` 粗体高亮 + `成功率` 徽章。
    - **平均延迟**：`avgLatency ms`（按延迟区间显示绿/黄/红文字）。
    - **直连 Key 池**（仅直连模式）：展示绑定的 Key 数量。

---

### 3.4 国际化与文案定义 (i18n)

#### 中文 (`zh.ts`)
```ts
discover: {
  // ...已有配置
  upstreamNodesTitle: "上游节点信息",
  upstreamNodesDesc: "集中管理多节点账号凭据、状态监控与上下文轮换",
},
dashboard: {
  // ...已有配置
  upstreamNodesTitle: "上游节点概览",
  nodesConfigured: "个节点已配置",
  nodesHealthy: "健康",
  nodesIsolated: "熔断隔离",
  nodeWeightShare: "流量权重",
  nodeReqsAndRate: "请求 / 成功率",
  nodeLatency: "平均延迟",
  nodeDirectKeys: "API Key 池",
}
```

#### 英文 (`en.ts`)
```ts
discover: {
  // ...existing
  upstreamNodesTitle: "Upstream Nodes",
  upstreamNodesDesc: "Manage multi-node account credentials, runtime state & context rotation",
},
dashboard: {
  // ...existing
  upstreamNodesTitle: "Upstream Nodes Overview",
  nodesConfigured: "Nodes Configured",
  nodesHealthy: "Healthy",
  nodesIsolated: "Isolated",
  nodeWeightShare: "Traffic Share",
  nodeReqsAndRate: "Requests / Success",
  nodeLatency: "Avg Latency",
  nodeDirectKeys: "API Key Pool",
}
```

---

## 4. 影响范围与测试验证计划 (Verification & Test Plan)

### 4.1 影响的文件列表
1. `frontend/src/types/discoverApps.ts` (增加 `upstreamNodes` 标识)
2. `frontend/src/utils/discoverAppsStorage.ts` (默认应用预设与合并逻辑更新)
3. `frontend/src/components/DiscoverHubView.tsx` (注册与图标展示)
4. `frontend/src/App.tsx` (主导航项精简为 3 项，快捷键 ⌘1~⌘3，Discover 子视图挂载 `AccountsView`)
5. `frontend/src/components/dashboard/UpstreamNodesOverview.tsx` (新增节点概览组件)
6. `frontend/src/components/DashboardView.tsx` (挂载节点概览组件)
7. `frontend/src/i18n/locales/zh.ts` & `en.ts` (多语言词条)

### 4.2 单元与集成测试用例
1. **发现页集成测试 (`tests/discoverUpstreamNodes.test.ts`)**：
   - 验证 `DEFAULT_BUILTIN_APPS` 包含 `upstreamNodes` 并且默认启用。
   - 验证 `mergeBuiltinDiscoverApps` 能将老配置补齐 `upstreamNodes` 项。
2. **主导航结构测试 (`tests/navItemMigration.test.ts`)**：
   - 验证导航项精简为 3 项（Dashboard, Logs, Discover）。
   - 验证 `accounts` 旧存储值能够正确解析并重定向到发现页对应的上游节点信息子页面。
3. **首页节点概览组件测试 (`tests/upstreamNodesOverview.test.ts`)**：
   - 验证节点数据聚合：计算各节点的总请求数、成功率、平均延迟与权重占比。
   - 验证熔断隔离状态与直连 Key 数量正常渲染。
4. **端到端构建回归测试**：
   - 运行 `npm run build:frontend` 验证 Vite + TypeScript 编译无任何类型错误。
   - 运行 `npx jest` 验证所有现有测试与新测试全部通过。

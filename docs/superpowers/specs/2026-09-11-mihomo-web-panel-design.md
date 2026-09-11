# Mihomo Web Panel (发现页轻量控制台) Design Specification

## 1. Overview & Context

用户希望在 Gemini Proxy 管理控制台的 **“发现 (Discover)”** 页面中接入本地运行的 **Mihomo (Clash.Meta) 控制台 (默认 `http://127.0.0.1:9090`)**。

通过与用户交流确认以下关键决策：
1. **面板形态**：采用**原生定制轻量面板 (Native Light Panel)**，完美契合现有控制台的设计语言（精美毛玻璃质感、暗黑/明亮双主题自适应、移动端与桌面端全响应式）。
2. **连接架构**：采用**后端代理中转 (Backend Reverse Proxy)**，浏览器前端向 `/api/admin/mihomo/*` 发起请求，后端 Node.js 负责转发至 `http://127.0.0.1:9090`，同时支持 SSE/WebSocket 或分块流式传输以实时拉取流量、日志与连接信息，彻底解决跨域 (CORS) 和内网安全隔离问题。
3. **密钥鉴权**：通过后端 `.env` 环境变量固化 `MIHOMO_API_URL` 与 `MIHOMO_SECRET`，开箱即用，同时允许在界面配置中动态热重载覆盖。

---

## 2. Core Functional Requirements

### 2.1 流量与核心状态监控 (Overview & Traffic)
- **实时上下行速率**：对接 `/traffic`，展示实时上传/下载速度（如 `1.2 MB/s ↑` / `4.5 MB/s ↓`）。
- **运行模式快速切换**：对接 `/configs` (GET/PATCH)，一键切换 `Rule` (规则) / `Global` (全局) / `Direct` (直连)。
- **核心信息状态卡片**：展示 Mihomo 核心版本 (Version)、内存占用 (`/memory`)、连接数统计 (`/connections`)。

### 2.2 代理分组与节点切换 (Proxies & Node Groups)
- **获取所有代理组与节点**：对接 `/proxies`，展示所有策略组（如 `PROXY`、`GLOBAL`、`Auto`、`节点选择` 等）。
- **节点延迟测速**：
  - 点击单个节点测速：`GET /proxies/:name/delay?timeout=5000&url=http://www.gstatic.com/generate_204`
  - 批量分组一键测速。
- **一键切换节点**：
  - `PUT /proxies/:groupName`，切换当前选中节点并实时反馈。
- **延迟标签色彩**：根据延迟数值动态显示颜色（`< 200ms` 绿色，`200-500ms` 黄色，`> 500ms` 橙色，超时红色）。

### 2.3 活跃连接管理 (Connections)
- **活跃连接列表**：对接 `/connections`，展示当前活跃连接数、总上传下载量。
- **一键断开所有连接**：`DELETE /connections`。

---

## 3. Architecture & Data Flow

```
+-------------------------------------------------------------------------------+
|                             Client Browser                                    |
|   Discover Hub -> MihomoPanel (/discover -> 'mihomo')                         |
+---------------------------------------+---------------------------------------+
                                        | (Admin Authenticated: x-admin-key)
                                        v
+-------------------------------------------------------------------------------+
|                         Gemini Proxy Backend Server                           |
|  - Route: /api/admin/mihomo/*                                                 |
|  - Controller: mihomoController.ts                                            |
|  - Service: mihomoService.ts                                                  |
|    * Reads config.mihomoApiUrl (default: http://127.0.0.1:9090)               |
|    * Reads config.mihomoSecret (from process.env.MIHOMO_SECRET)               |
|    * Injects 'Authorization: Bearer <MIHOMO_SECRET>'                          |
|    * Transparently proxies REST endpoints & streams traffic SSE/JSON          |
+---------------------------------------+---------------------------------------+
                                        | (Internal Loopback / HTTP)
                                        v
+-------------------------------------------------------------------------------+
|                       Local Mihomo Core (127.0.0.1:9090)                      |
|  - Endpoints: /version, /traffic, /memory, /configs, /proxies, /connections   |
+-------------------------------------------------------------------------------+
```

---

## 4. Detailed Component & API Design

### 4.1 Backend Implementation

1. **配置扩展 (`config/default.ts`)**：
   - `mihomoApiUrl`: 默认 `process.env.MIHOMO_API_URL || 'http://127.0.0.1:9090'`
   - `mihomoSecret`: 默认 `process.env.MIHOMO_SECRET || ''`
   - 支持动态 `updateConfig` 热重载。

2. **后端服务与路由 (`src/admin/controllers/mihomoController.ts` & `src/admin/routes/adminRoutes.ts`)**：
   - 保护路由：受 `adminAuthMiddleware` 保护。
   - `GET /api/admin/mihomo/status`: 检查 Mihomo 连通性并获取版本和基本配置。
   - `GET /api/admin/mihomo/traffic`: 流式推送或轮询实时流量（`/traffic`）。
   - `GET /api/admin/mihomo/proxies`: 获取所有策略组及节点详情。
   - `PUT /api/admin/mihomo/proxies/:group`: 切换指定组的活动节点 (`{ name: string }`)。
   - `GET /api/admin/mihomo/proxies/:name/delay`: 测量指定节点延迟。
   - `GET /api/admin/mihomo/configs`: 获取核心配置。
   - `PATCH /api/admin/mihomo/configs`: 修改核心模式（例如 `mode: "Rule"`）。
   - `GET /api/admin/mihomo/connections`: 获取当前连接列表。
   - `DELETE /api/admin/mihomo/connections`: 关闭所有连接。

### 4.2 Frontend Implementation

1. **发现页集成 (`frontend/src/components/DiscoverHubView.tsx` & `App.tsx`)**：
   - 扩充 `DiscoverToolId` 类型：`'terminal' | 'systemLogs' | 'playground' | 'translate' | 'mihomo'`。
   - 在移动端微信风格分组中加入 **Mihomo 代理核心** 快捷入口。
   - 在桌面端 4 列卡片网格中加入 **Mihomo 控制台** 工具卡片（图标采用网络/路由类图标，主题色调搭配渐变）。
   - `App.tsx` 中的子视图切换支持 `discoverSubView === 'mihomo'` 渲染 `MihomoView.tsx`。

2. **原生轻量控制面板 (`frontend/src/components/MihomoView.tsx`)**：
   - **顶栏状态与模式切换器**：展示当前连通状态（在线/未连通）、运行模式（Rule / Global / Direct 单选切换按钮组）、实时上下行速率统计。
   - **分组 Tab 切换与搜索过滤**：
     - 策略组 Tab 栏（如 `全部`、`节点选择`、`国外媒体` 等）。
     - 节点搜索过滤框，快速定位节点名称。
   - **节点卡片网格 (Node Cards Grid)**：
     - 当前活动节点高亮呈现（紫色/蓝光外发光徽标）。
     - 节点类型（Shadowsocks、VMess、VLESS、Trojan、Hysteria2 等）。
     - 实时延迟胶囊（点击触发单节点测速），显示 `128ms`。
     - 单击节点卡片即可触发无缝切换。
   - **一键全组测速与连接清空**：工具栏提供 `一键测速` 和 `清空连接` 按钮。
   - **优雅的离线异常占位**：若 Mihomo 未运行或 Secret 不正确，提供清晰的诊断指引卡片（展示目标地址、配置提示等）。

---

## 5. Verification & Test Plan

1. **单元与集成测试 (`tests/mihomoProxy.test.ts`)**：
   - 测试后端代理接口的转发逻辑、401 Secret 错误传递、超时容错。
   - 测试策略组切换与延迟检测的参数校验。
2. **UI 规范与渲染测试**：
   - 验证 `DiscoverHubView` 正常渲染 5 项工具（含移动端分组与桌面端卡片）。
   - 验证 `MihomoView` 在离线与在线状态下的平滑容错与操作响应。
3. **构建验证**：
   - `npm run build` 和 `npm test` 全部通过。

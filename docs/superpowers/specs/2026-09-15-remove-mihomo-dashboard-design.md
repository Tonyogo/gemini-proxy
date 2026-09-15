# 去除发现页面及系统内 Mihomo 控制台相关功能设计规范

## 1. 概述

本设计规范旨在彻底移除发现中心页面中的 Mihomo 控制台入口，并对系统内所有关联的前端视图、国际化翻译、后端代理接口、核心配置以及历史单测进行全面清理，以精简产品功能和代码库体积，消除无用依赖。

## 2. 变更范围与详细设计

### 2.1 前端变更

1. **`frontend/src/components/DiscoverHubView.tsx`**：
   - 联合类型 `DiscoverToolId` 移除 `'mihomo'`，仅保留 `'terminal' | 'systemLogs' | 'playground' | 'translate'`。
   - 移动端系统工具分类：移除包含 Radio 图标的 “Item 3: Mihomo Dashboard” 按钮。
   - 桌面端常用工具网格：移除 “Card 5: Mihomo Dashboard” 卡片，使其余 4 个工具卡片在不同屏幕断点（1/2/4 列）下保持平衡对齐。
   - 移除无用的 `Radio` 图标组件导入。
2. **`frontend/src/App.tsx`**：
   - 联合类型 `DiscoverSubView` 移除 `'mihomo'`，保留 `'hub' | 'terminal' | 'systemLogs' | 'playground' | 'translate' | 'embeddedWeb'`。
   - 移除会话存储中对 `'mihomo'` 的还原校验逻辑。
   - 移除顶部面包屑与标题栏中对 `discoverSubView === 'mihomo'` 的判断。
   - 移除对 `<MihomoView />` 的动态渲染与导入。
3. **前端文件删除**：
   - 删除 `frontend/src/components/MihomoView.tsx`。
4. **多语言字典 (`frontend/src/i18n/locales/zh.ts` 与 `en.ts`)**：
   - 移除 `discover` 字典内的 `mihomoTitle`、`mihomoDesc`、`openMihomo`、`proxyCategory`。
   - 移除顶层 `mihomo: { ... }` 国际化模块字典。

---

### 2.2 后端变更

1. **路由定义 (`src/admin/routes/adminRoutes.ts`)**：
   - 移除 `mihomoController` 导入。
   - 移除 `/mihomo/*`（`status`、`traffic`、`proxies`、`configs`、`connections`）等全部 10 个 REST 路由。
2. **���制器与服务文件删除**：
   - 删除 `src/admin/controllers/mihomoController.ts`。
   - 删除 `src/admin/services/mihomoService.ts`。
3. **全局配置与环境变量 (`config/default.ts`)**：
   - 移除 `mihomoApiUrl` 与 `mihomoSecret` 环境变量的读取与配置属性。

---

### 2.3 测试套件清理与验证

1. **移除旧测试用例**：
   - 删除 `tests/mihomoDiscoverEntry.test.ts`。
   - 删除 `tests/mihomoProxy.test.ts`。
   - 删除 `tests/mihomoView.test.ts`。
2. **质量与构建验证**：
   - 运行 `npm test` 确保所有既有测试全部 PASS。
   - 运行 `npm run build` 确保前端（Vite React SPA）和后端（TypeScript）均零报错编译。

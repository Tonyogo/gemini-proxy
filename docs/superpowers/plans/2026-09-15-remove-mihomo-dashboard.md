# 去除 Mihomo 控制台功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除发现中心页面及系统内的 Mihomo 控制台入口，清理所有关联的前端视图、国际化语言包、后端代理接口、核心配置及废弃测试。

**Architecture:** 
- 前端：更新 `DiscoverHubView.tsx`（移除工具 ID、移动端列表项、桌面端卡片及 Radio 图标），更新 `App.tsx`（移除子视图类型、还原逻辑、顶栏标题分支及组件渲染），删除 `MihomoView.tsx`，清理 `zh.ts` 和 `en.ts`。
- 后端：在 `adminRoutes.ts` 中移除全部 10 个 `/mihomo/*` 路由端点与控制器引用，删除 `mihomoController.ts` 与 `mihomoService.ts`，在 `config/default.ts` 中移除 `mihomoApiUrl` 和 `mihomoSecret`。
- 测试：移除 3 个废弃的 `tests/mihomo*.test.ts` 测试套件，运行全量测试套件与前后端构建验证。

**Tech Stack:** TypeScript, React, Tailwind CSS, Express, Jest.

## Global Constraints

- 保持严格 TypeScript 类型安全与既有代码注释与风格。
- 确保删除后无悬空类型引用，`npm run build` 和 `npm test` 均零错误通过。
- 保证其余工具（Terminal, SystemLogs, Playground, Translate, CustomApps）布局与交互完好无损。

---

### Task 1: 前端：移除发现页面卡片、路由分支、组件及国际化字典

**Files:**
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Delete: `frontend/src/components/MihomoView.tsx`

**Interfaces:**
- Produces: `DiscoverToolId = 'terminal' | 'systemLogs' | 'playground' | 'translate'`
- Produces: `DiscoverSubView = 'hub' | 'terminal' | 'systemLogs' | 'playground' | 'translate' | 'embeddedWeb'`

- [ ] **Step 1: 更新 `frontend/src/components/DiscoverHubView.tsx`**

1. 将 `export type DiscoverToolId` 修改为：
   ```typescript
   export type DiscoverToolId = 'terminal' | 'systemLogs' | 'playground' | 'translate';
   ```
2. 移除 `Radio` 图标组件的导入：
   ```typescript
   // 移除 Radio
   import {
     Terminal,
     FileText,
     Play,
     Languages,
     ChevronRight,
     ArrowUpRight,
     Plus,
     Globe,
     ExternalLink,
     Edit3,
     Trash2
   } from 'lucide-react';
   ```
3. 从移动端列表中移除 “Item 3: Mihomo Dashboard” 按钮。
4. 从桌面端网格卡片中移除 “Card 5: Mihomo Dashboard” 卡片。

- [ ] **Step 2: 更新 `frontend/src/App.tsx`**

1. 将 `DiscoverSubView` 联合类型修改为：
   ```typescript
   export type DiscoverSubView = 'hub' | 'terminal' | 'systemLogs' | 'playground' | 'translate' | 'embeddedWeb';
   ```
2. 移除 `import { MihomoView } from './components/MihomoView';` 导入。
3. 在 `sessionStorage` 初始读取校验中移除 `|| rawSaved === 'mihomo'`。
4. 在面包屑标题渲染中移除 `{discoverSubView === 'mihomo' && t('discover.mihomoTitle')}`。
5. 在子视图分支渲染中移除：
   ```tsx
   {discoverSubView === 'mihomo' && (
     <MihomoView
       key={refreshTrigger}
       adminKey={adminKey}
     />
   )}
   ```

- [ ] **Step 3: 删除物理文件 `frontend/src/components/MihomoView.tsx`**

```bash
rm frontend/src/components/MihomoView.tsx
```

- [ ] **Step 4: 清理多语言国际化文件 `zh.ts` 和 `en.ts`**

1. 在 `frontend/src/i18n/locales/zh.ts` 中：
   - 移除 `discover` 下的 `mihomoTitle`、`mihomoDesc`、`openMihomo`、`proxyCategory`。
   - 移除整个 `mihomo: { ... }` 顶层字典。
2. 在 `frontend/src/i18n/locales/en.ts` 中：
   - 移除 `discover` 下的 `mihomoTitle`、`mihomoDesc`、`openMihomo`、`proxyCategory`。
   - 移除整个 `mihomo: { ... }` 顶层字典。

- [ ] **Step 5: 验证前端编译检查**

运行：`npm run build:frontend`
预期：PASS（无任何 TypeScript 报错与 Vite 构建错误）

- [ ] **Step 6: 提交代码**

```bash
git rm frontend/src/components/MihomoView.tsx
git add frontend/src/components/DiscoverHubView.tsx frontend/src/App.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(discover): remove mihomo dashboard entry and frontend components"
```

---

### Task 2: 后端：移除 Mihomo 代理路由、控制器、服务与默认配置

**Files:**
- Modify: `src/admin/routes/adminRoutes.ts`
- Modify: `config/default.ts`
- Delete: `src/admin/controllers/mihomoController.ts`
- Delete: `src/admin/services/mihomoService.ts`

**Interfaces:**
- Produces: 纯净的 `adminRoutes.ts`，不再暴露 `/mihomo/*` 代理路由。
- Produces: 纯净的 `config/default.ts`，不再解析或暴露 `mihomoApiUrl` 与 `mihomoSecret`。

- [ ] **Step 1: 修改 `src/admin/routes/adminRoutes.ts`**

1. 移除 `import mihomoController from '../controllers/mihomoController';`。
2. 移除行 44-54 中包含的所有 Mihomo 相关路由定义：
   - `router.get('/mihomo/status', ...)`
   - `router.get('/mihomo/traffic', ...)`
   - `router.get('/mihomo/proxies', ...)`
   - `router.put('/mihomo/proxies/:group', ...)`
   - `router.get('/mihomo/proxies/:name/delay', ...)`
   - `router.get('/mihomo/configs', ...)`
   - `router.patch('/mihomo/configs', ...)`
   - `router.get('/mihomo/connections', ...)`
   - `router.delete('/mihomo/connections', ...)`
   - `router.delete('/mihomo/connections/:id', ...)`

- [ ] **Step 2: 修改 `config/default.ts`**

在 `getEnvConfig` 中移除：
```typescript
mihomoApiUrl: (process.env.MIHOMO_API_URL || 'http://127.0.0.1:9090') as string,
mihomoSecret: (process.env.MIHOMO_SECRET || '') as string,
```

- [ ] **Step 3: 删除物理文件 `mihomoController.ts` 与 `mihomoService.ts`**

```bash
rm src/admin/controllers/mihomoController.ts
rm src/admin/services/mihomoService.ts
```

- [ ] **Step 4: 验证后端 TypeScript 编译**

运行：`npm run build:backend`
预期：PASS（`tsc` 编译通过，无未引用或悬空报错）

- [ ] **Step 5: 提交代码**

```bash
git rm src/admin/controllers/mihomoController.ts src/admin/services/mihomoService.ts
git add src/admin/routes/adminRoutes.ts config/default.ts
git commit -m "feat(admin): remove mihomo proxy routes, controller, service and config"
```

---

### Task 3: 清理旧测试用例与全量回归验证

**Files:**
- Delete: `tests/mihomoDiscoverEntry.test.ts`
- Delete: `tests/mihomoProxy.test.ts`
- Delete: `tests/mihomoView.test.ts`
- Run: `npm test`
- Run: `npm run build`

- [ ] **Step 1: 删除已废弃的 Mihomo 单测文件**

```bash
rm tests/mihomoDiscoverEntry.test.ts
rm tests/mihomoProxy.test.ts
rm tests/mihomoView.test.ts
```

- [ ] **Step 2: 运行全量测试套件**

运行：`npx jest --runInBand`
预期：全部 103 个测试套件通过（566 passed, 1 skipped, 0 failures）。

- [ ] **Step 3: 运行前后端全量生产构建**

运行：`npm run build`
预期：`dist/frontend` 和 `dist/src` 均顺利构建成功。

- [ ] **Step 4: 提交测试清理**

```bash
git rm tests/mihomoDiscoverEntry.test.ts tests/mihomoProxy.test.ts tests/mihomoView.test.ts
git commit -m "test: remove obsolete mihomo test suites"
```

---

## Plan Self-Review Check

1. **Spec coverage**:
   - 移除 DiscoverHubView 入口卡片 -> Task 1
   - 移除 App.tsx 路由与子视图 -> Task 1
   - 删除 MihomoView.tsx -> Task 1
   - 清理国际化文本 -> Task 1
   - 移除后端路由、控制器与服务 -> Task 2
   - 清理 config/default.ts -> Task 2
   - 清理旧测试用例并全量回归 -> Task 3
2. **No Placeholders**: 所有步骤包含具体的行、文件名、命令与验证预期。
3. **Type Consistency**: 前后端类型 `DiscoverToolId`、`DiscoverSubView` 均精准保持同步。

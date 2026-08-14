# 代理服务账号管理页面设计方案 (Account Management Design Spec)

## 一、概述 (Overview)
本项目当前基于 Anthropic Claude 格式向 Google Gemini 代理转换，并提供 Web 控制台。现需接入外部代理服务（AIStudioToAPI）的账号管理功能，在 Web Console 中提供直观的可视化账号池监控与管理功能（包含账号列表、状态监控、凭据导入与下载、切换活跃账号、批量去重及删除等）。

---

## 二、架构设计 (Architecture)

### 1. 后端中转代理设计
- **目标地址与鉴权**：
  - 复用现有的 `config.geminiBaseUrl` 作为目标代理服务的基础 URL。
  - 后端使用 `config.adminSecretKey`（无静态缓存，动态获取）在发往目标服务请求头中携带 `Authorization: Bearer <ADMIN_SECRET_KEY>`。
  - 前端请求本系统 `/api/admin/accounts/*` 时，通过既有的 `adminAuthMiddleware` 验证控制台 `x-admin-key`。
- **后端模块划分**：
  - `src/admin/services/accountService.ts`：封装对目标服务的 HTTP 请求处理、文件/流下载、错误统一转换。
  - `src/admin/controllers/accountController.ts`：解析请求、调用服务层并返回相应 JSON / 文件流。
  - `src/admin/routes/adminRoutes.ts`：注册 `/accounts/*` 相关端点。

### 2. 接口端点映射 (API Routes)

| 本地路由 | HTTP 方法 | 转发 upstream 端点 | 说明 |
| :--- | :--- | :--- | :--- |
| `/api/admin/accounts/status` | `GET` | `GET /api/status` | 获取系统及账号状态列表 |
| `/api/admin/accounts/upload` | `POST` | `POST /api/files` 或 `/api/files/batch` | 单文件或批量凭据 JSON 文件上传 |
| `/api/admin/accounts/toggle-disabled` | `POST` | `POST /api/auth/toggle-disabled` | 切换账号启用/禁用状态 |
| `/api/admin/accounts/:index` | `DELETE` | `DELETE /api/accounts/:index` | 删除单个账号 (支持 `?force=true`) |
| `/api/admin/accounts/batch-delete` | `POST` | `DELETE /api/accounts/batch` | 批量删除账号 |
| `/api/admin/accounts/deduplicate` | `POST` | `POST /api/accounts/deduplicate` | 自动清理重复邮箱的旧账号 |
| `/api/admin/accounts/current` | `PUT` | `PUT /api/accounts/current` | 切换/轮换当前活跃账号 |
| `/api/admin/accounts/files/:filename` | `GET` | `GET /api/files/:filename` | 下载单个凭据文件流 |
| `/api/admin/accounts/batch-download` | `POST` | `POST /api/accounts/batch/download` | 批量打包导出凭据 ZIP 流 |

---

## 三、前端设计与组件结构 (Frontend & UI)

### 1. 视图与组件布局
- **入口导航**：在 `frontend/src/App.tsx` 顶部导航栏增加 `账号管理` (Tab: `accounts`)。
- **核心组件**：
  - `frontend/src/components/AccountsView.tsx`：
    - **Header & Stats Banner**：展示账号总数、活跃数、禁用数、并发数及系统繁忙状态。
    - **Toolbar**：全选框、文件上传导入按钮（隐藏 `<input type="file" multiple accept=".json" />`）、去重清理按钮、批量下载、批量删除、刷新按钮。
    - **Account Card List**（还原 `@account-page.jpeg` 视觉风格）：
      - 绿色高亮卡片（当前活跃账号）与暗色卡片（其他账号）。
      - 包含选择框、`#index`、邮箱名称、状态 Badge（已激活 / 已禁用 / 当前 / 失效 / 过期）。
      - 今日用量展示（从 `usage.totalRequests` 提取）与当前并发请求数 (`inFlight`)。
      - 操作按钮组：启用/禁用开关、设为主账号、单文件下载、删除账号。
    - **Confirm Modals**：用于删除当前活跃账号时的强制确认、批量删除二次确认、去重清理结果反馈。

### 2. 国际化支持 (i18n)
- 更新 `frontend/src/i18n/locales.ts`，为中英文添加 `accounts.*` 相关文案字典。

---

## 四、错误处理与边界情况 (Error Handling & Edge Cases)
1. **网络超时或 502/504 异常**：在前端展示清晰友好的连接失败/后端服务不可用通知。
2. **删除当前活跃账号 (409 Conflict)**：自动检测 `warningDeleteCurrentAccount`，弹出确认窗口让用户选择是否以 `force=true` 继续删除。
3. **文件格式校验**：前端上传前做简单的 JSON 格式解析检查，避免上传无效格式文件。

---

## 五、测试验证 (Testing & Verification)
1. **后端单元与集成测试**：编写 `tests/accountController.test.ts`，利用 `supertest` 和 `nock`/`jest.spyOn` 模拟 upstream 请求，覆盖 status、toggle、delete、upload 等端点。
2. **编译与构建验证**：运行 `npm run build`（包括前端 Vite build 与后端 tsc 编译），保证类型完全严格安全。

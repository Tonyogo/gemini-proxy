# API 调试器与翻译工作台统一使用 ADMIN_SECRET_KEY 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 API 调试器 (PlaygroundView) 与翻译工作台 (TranslateView) 的 API 请求凭据统一切换为已认证的系统 `ADMIN_SECRET_KEY`，隐藏调试器多余的 Key 输入框，并增强后端凭据提取与上游转发兼容性。

**Architecture:** 
- 后端：在 `src/utils/requestHelper.ts` 中增强 `extractClientKey` 支持 `x-admin-key` 请求头提取；在 `buildUpstreamHeaders` 中，当凭据匹配 `config.adminSecretKey` 时，同时注入 `Authorization: Bearer <ADMIN_SECRET_KEY>` 与 `x-goog-api-key`。
- 前端：在 `App.tsx` 中向 `PlaygroundView` 传入已认证的 `adminKey`；`PlaygroundView` 移除 `geminiApiKey` 本地存储与密码输入框，替换为紧凑的系统密钥生效徽章，发送请求与复制 cURL 时自动使用 `adminKey`；`TranslateView` 在向 `/v1/messages` 发起请求时补齐 `x-api-key`。

**Tech Stack:** TypeScript, Express, Node.js, React 18, Vite, Tailwind CSS, Jest, Supertest.

## Global Constraints

- **Strict TypeScript**: 保持所有代码在严格 TypeScript 下 0 编译与类型报错（`npm run build:backend` 与 `npm run build:frontend` 必须完全干净通过）。
- **Zero Static Config Caching**: 不在模块顶级作用域缓存 `config.adminSecretKey`，动态通过 `config.adminSecretKey` 访问。
- **Sensitive Data Redaction**: 保持 `sanitizeData` 的敏感信息屏蔽安全机制，不得在日志中明文输出密钥。
- **Testing Verification**: 遵循 TDD 模式，每个后端改动先写失败测试再编码，全量运行 Jest 测试套件确保无破坏性变更。

---

### Task 1: 后端凭据提取与上游 Header 转发增强 (Backend TDD)

**Files:**
- Modify: `src/utils/requestHelper.ts:7-21,75-82`
- Test: `tests/claudeController.test.ts:93-165`

**Interfaces:**
- Consumes: `config.adminSecretKey: string`
- Produces: 
  - `extractClientKey(req: Request): string | null` 支持提取 `req.headers['x-admin-key']`
  - `buildUpstreamHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string>` 当 `config.adminSecretKey && apiKey === config.adminSecretKey` 时附加 `Authorization: Bearer <apiKey>`

- [x] **Step 1: 在 `tests/claudeController.test.ts` 中编写失败测试**
- [x] **Step 2: 运行测试并验证失败**
- [x] **Step 3: 修改 `src/utils/requestHelper.ts` 实现功能**
- [x] **Step 4: 重新运行测试验证通过**
- [x] **Step 5: 提交后端代码变更**

```bash
git add src/utils/requestHelper.ts tests/claudeController.test.ts
git commit -m "feat(proxy): support x-admin-key extraction and bearer header injection for admin secret key"
```

---

### Task 2: 国际化文案与翻译工作台请求头补齐 (Frontend i18n & TranslateView)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts:228-245`
- Modify: `frontend/src/i18n/locales/en.ts:226-243`
- Modify: `frontend/src/components/TranslateView.tsx:275-285`

**Interfaces:**
- Consumes: `t('playground.systemKeyActive')`, `t('playground.systemKeyDesc')`
- Produces: `headers['x-api-key'] = adminKey` in `TranslateView.tsx`

- [x] **Step 1: 在 `frontend/src/i18n/locales/zh.ts` 和 `en.ts` 中添加文案**
- [x] **Step 2: 修改 `frontend/src/components/TranslateView.tsx` 补齐 `x-api-key`**
- [x] **Step 3: 运行前端类型检查**
- [x] **Step 4: 提交变更**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/TranslateView.tsx
git commit -m "feat(translate): add x-api-key header and define i18n keys for system admin key"
```

---

### Task 3: API 调试器隐藏输入框与集成 ADMIN_SECRET_KEY (PlaygroundView & App.tsx)

**Files:**
- Modify: `frontend/src/App.tsx:657-661`
- Modify: `frontend/src/components/PlaygroundView.tsx:120-135,170-185,250-260,340-350,380-390,490-510,640-650,935-948`

**Interfaces:**
- Consumes: `<PlaygroundView adminKey={adminKey} />`
- Produces: 调试器发起的请求、复制的 cURL、并发测试均使用 `adminKey`，顶部展示系统密钥就绪徽章。

- [x] **Step 1: 修改 `frontend/src/App.tsx` 传递 `adminKey`**
- [x] **Step 2: 重构 `frontend/src/components/PlaygroundView.tsx`**
- [x] **Step 3: 运行前端构建验证类型与编译**
- [x] **Step 4: 提交代码变更**

```bash
git add frontend/src/App.tsx frontend/src/components/PlaygroundView.tsx
git commit -m "feat(playground): use system adminKey for API requests and replace input with key status badge"
```

---

### Task 4: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [x] **Step 1: 运行后端与全量测试套件**
- [x] **Step 2: 运行后端构建**
- [x] **Step 3: 运行全量构建**

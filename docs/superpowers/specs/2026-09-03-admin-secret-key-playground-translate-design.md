# API 调试器与翻译工作台统一使用 ADMIN_SECRET_KEY 设计规范

## 1. 概述与背景 (Overview & Context)

当前管理控制台（Web Console）中的 **API 调试器 (PlaygroundView)** 要求用户手动输入并在本地 `localStorage` 缓存一份 `geminiApiKey`，而 **翻译工作台 (TranslateView)** 在请求 `/v1/messages` 代理接口时仅附加了 `x-admin-key` 请求头，缺失了代理接口要求的 `x-api-key`。

为了简化操作体验、提高安全性并与当前系统架构保持一致，系统设计将 API 调试器和翻译工作台的 API 请求凭据全面切换为系统登录时配置并验证的 `ADMIN_SECRET_KEY`。在前端彻底隐藏多余的 Key 输入框，由系统透明注入；同时在后端支持对 `ADMIN_SECRET_KEY` 的统一认证与上游兼容转发。

---

## 2. 目标与非目标 (Goals & Non-Goals)

### Goals
1. **统一前端凭据传递**：前端 `App.tsx` 将经过验证的 `adminKey` 注入至 `PlaygroundView` 和 `TranslateView`。
2. **隐藏并简化前端输入**：API 调试器顶部移除密码输入框与 `geminiApiKey` 本地存储逻辑，替换为只读的系统密钥已就绪徽章（Badge）。
3. **补齐请求头协议**：API 调试器与翻译工作台发往 `/v1/*` 接口时，均同时携带 `'x-api-key': adminKey` 与 `'x-admin-key': adminKey`。
4. **后端认证与转发增强**：
   - `extractClientKey` 支持提取 `x-admin-key` 请求头。
   - `buildUpstreamHeaders` 在检测到凭据为系统 `ADMIN_SECRET_KEY` 时，同时注入 `x-goog-api-key` 与 `Authorization: Bearer <key>`，兼顾官方与自建上游鉴权需求。
5. **保持 cURL 与并发测试功能一致**：调试器内的“复制 cURL”与 `ConcurrentTestModal` 自动使用 `adminKey`。

### Non-Goals
- 不修改外部未经认证客户端访问 `/v1/*` 的核心安全策略（普通客户端仍须提供有效 Key，不开放无凭据匿名调用）。
- 不破坏现有其它视图（如 LogsView、AccountsView、UnifiedTerminalView）已有的 `adminKey` 传递逻辑。

---

## 3. 架构与改动细节 (Architecture & Implementation Details)

### 3.1 后端服务与工具函数 (Backend)

#### A. 凭据提取 (`src/utils/requestHelper.ts` -> `extractClientKey`)
更新提取顺序，优先读取业务 Key，兜底识别管理 Key：
1. `req.headers['x-api-key']`
2. `req.headers['x-goog-api-key']`
3. `req.headers.authorization` (`Bearer <token>`)
4. `req.headers['x-admin-key']`
5. `req.query.key`

#### B. 上游转发请求头构建 (`src/utils/requestHelper.ts` -> `buildUpstreamHeaders`)
针对上游可能要求原生谷歌 `x-goog-api-key` 亦或要求 Bearer 授权的场景进行兼容：
```ts
export function buildUpstreamHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...customHeaders
  };

  // 当使用的是系统配置的 ADMIN_SECRET_KEY 时，同时附带 Bearer token 满足上游中转网关鉴权
  if (config.adminSecretKey && apiKey === config.adminSecretKey && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}
```

---

### 3.2 前端视图与交互 (Frontend)

#### A. 顶层入口 (`frontend/src/App.tsx`)
将已认证的 `adminKey` 传入 `PlaygroundView`：
```tsx
{activeTab === 'playground' && (
  <PlaygroundView
    key={refreshTrigger}
    adminKey={adminKey}
  />
)}
```

#### B. API 调试器 (`frontend/src/components/PlaygroundView.tsx`)
1. **组件入参扩展**：增加 `adminKey: string` prop。
2. **清理状态与存储**：
   - 移除 `apiKey` 的本地输入与 `localStorage.setItem('geminiApiKey', val)`。
   - 使用 `adminKey` 作为生效密钥 `const effectiveKey = adminKey;`。
3. **顶部工具栏 UI 升级**：
   - 移除原来的密码输入框及图标。
   - 增加紧凑状态徽章：
     ```tsx
     <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-mono">
       <Key className="w-3.5 h-3.5" />
       <span>{t('playground.systemKeyActive')}</span>
     </div>
     ```
4. **请求发送与并发测试**：
   - 发送时 Headers 设置：
     ```ts
     headers: {
       'content-type': 'application/json',
       'x-api-key': effectiveKey,
       'x-admin-key': effectiveKey
     }
     ```
   - `ConcurrentTestModal` 传入 `apiKey={effectiveKey}`。
   - `handleCopyCurl` 统一使用 `effectiveKey || 'YOUR_ADMIN_SECRET_KEY'` 生成 cURL。

#### C. 翻译工作台 (`frontend/src/components/TranslateView.tsx`)
补齐发往 `/v1/messages` 接口的请求头：
```ts
const headers: Record<string, string> = {
  'Content-Type': 'application/json'
};
if (adminKey) {
  headers['x-admin-key'] = adminKey;
  headers['x-api-key'] = adminKey;
}
```

#### D. 多语言适配 (`frontend/src/i18n/locales/zh.ts` & `en.ts`)
- 中文 (`zh.ts`)：
  - `playground.systemKeyActive: "系统密钥已就绪"`
- 英文 (`en.ts`)：
  - `playground.systemKeyActive: "Admin Key Ready"`

---

## 4. 安全性与边界处理 (Security & Edge Cases)

1. **凭据脱敏**：
   `sanitizeData` 已原生覆盖 `x-api-key` 与 `x-admin-key`，所有交易日志和控制台输出均会自动做打码保护。
2. **空密钥检查**：
   若管理控制台在未登录或未配置 `ADMIN_SECRET_KEY` 的极端异常状态下发起请求，依然受后端 401 拦截防护，不会发生非预期泄露。
3. **自定义端点调试**：
   同时附带 `x-api-key` 与 `x-admin-key`，完美支持用户在调试器内测试 `/api/admin/*` 管理端点与 `/v1/*` 业务代理端点。

---

## 5. 测试与验证计划 (Testing & Verification Plan)

1. **单元测试与集成测试** (`tests/claudeController.test.ts`)：
   - 增加对 `extractClientKey` 中 `x-admin-key` 提取能力的断言。
   - 增加对 `buildUpstreamHeaders` 中携带 `Authorization: Bearer <ADMIN_SECRET_KEY>` 的断言。
   - 运行 Jest 测试套件确保所有用例通过。
2. **前端编译与类型检查**：
   - 运行 `npm run build:frontend` 验证 React 组件与 TypeScript 类型无报错。
   - 运行 `npm run build:backend` 验证服务端 TS 编译无报错。
3. **手动端到端验证**：
   - 打开 API 调试器，验证顶部展示“系统密钥已就绪”徽章。
   - 发送请求验证流式及非流式输出正常。
   - 检查复制 cURL 格式正确包含管理密钥。
   - 切换到翻译工作台，发起单模型与对比翻译，验证请求头包含 `x-api-key` 与 `x-admin-key` 且能正常翻译。

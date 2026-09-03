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

- [ ] **Step 1: 在 `tests/claudeController.test.ts` 中编写失败测试**

在 `tests/claudeController.test.ts` 的 `describe('extractClientKey helper')` 和 `describe('buildUpstreamHeaders')` 中添加新断言，并在 `POST /v1/messages` 中增加对 `x-admin-key` 认证成功的端到端测试：

```ts
  it('extracts key from x-admin-key header', () => {
    const mockReq = {
      headers: { 'x-admin-key': 'test-admin-key' },
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-admin-key');
  });
```

```ts
  it('injects Bearer Authorization header when apiKey matches config.adminSecretKey', () => {
    const originalKey = config.adminSecretKey;
    config.adminSecretKey = 'admin-secret-123';
    try {
      const headers = buildUpstreamHeaders('admin-secret-123');
      expect(headers['Authorization']).toEqual('Bearer admin-secret-123');
      expect(headers['x-goog-api-key']).toEqual('admin-secret-123');
    } finally {
      config.adminSecretKey = originalKey;
    }
  });
```

在 `POST /v1/messages (Authentication / Headers)` 中增加：
```ts
  it('authenticates successfully via x-admin-key header', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-admin-key', 'admin-proxy-key')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });
```

- [ ] **Step 2: 运行测试并验证失败**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest tests/claudeController.test.ts -t "x-admin-key"
```
Expected: FAIL（因为 `extractClientKey` 尚未提取 `x-admin-key`，`buildUpstreamHeaders` 尚未注入 `Authorization`）

- [ ] **Step 3: 修改 `src/utils/requestHelper.ts` 实现功能**

在 `extractClientKey` 中加入 `req.headers["x-admin-key"]`：
```ts
export function extractClientKey(req: Request): string | null {
  if (req.headers["x-api-key"]) {
    return req.headers["x-api-key"] as string;
  }
  if (req.headers["x-goog-api-key"]) {
    return req.headers["x-goog-api-key"] as string;
  }
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    return req.headers.authorization.substring(7).trim();
  }
  if (req.headers["x-admin-key"]) {
    return req.headers["x-admin-key"] as string;
  }
  if (req.query && req.query.key) {
    return req.query.key as string;
  }
  return null;
}
```

在 `buildUpstreamHeaders` 中注入 Bearer Token：
```ts
export function buildUpstreamHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...customHeaders
  };

  if (config.adminSecretKey && apiKey === config.adminSecretKey && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}
```

- [ ] **Step 4: 重新运行测试验证通过**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npx jest tests/claudeController.test.ts
```
Expected: PASS (所有 26 个测试全部通过)

- [ ] **Step 5: 提交后端代码变更**

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

- [ ] **Step 1: 在 `frontend/src/i18n/locales/zh.ts` 和 `en.ts` 中添加文案**

在 `frontend/src/i18n/locales/zh.ts` 的 `playground` 对象中添加：
```ts
    systemKeyActive: "系统密钥已就绪",
    systemKeyDesc: "已使用系统配置的 ADMIN_SECRET_KEY",
```

在 `frontend/src/i18n/locales/en.ts` 的 `playground` 对象中添加：
```ts
    systemKeyActive: "Admin Key Ready",
    systemKeyDesc: "Using configured ADMIN_SECRET_KEY",
```

- [ ] **Step 2: 修改 `frontend/src/components/TranslateView.tsx` 补齐 `x-api-key`**

定位至 `TranslateView.tsx` 中的 `handleTranslateSingle` (约第 275-285 行)：
```ts
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (adminKey) {
        headers['x-admin-key'] = adminKey;
        headers['x-api-key'] = adminKey;
      }
```

- [ ] **Step 3: 运行前端类型检查**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend
```
Expected: 编译通过，无类型或打包错误。

- [ ] **Step 4: 提交变更**

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

- [ ] **Step 1: 修改 `frontend/src/App.tsx` 传递 `adminKey`**

在 `frontend/src/App.tsx` 约第 658 行：
```tsx
          {activeTab === 'playground' && (
            <PlaygroundView
              key={refreshTrigger}
              adminKey={adminKey}
            />
          )}
```

- [ ] **Step 2: 重构 `frontend/src/components/PlaygroundView.tsx`**

1. 修改组件入参：
```tsx
export default function PlaygroundView({ adminKey = '' }: { adminKey?: string }) {
```

2. 移除 `apiKey` 本地存储与手动变更状态：
删除：
```tsx
const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
```
以及删除：
```tsx
const handleKeyChange = (val: string) => {
  setApiKey(val);
  localStorage.setItem('geminiApiKey', val);
};
```
直接使用 `adminKey`：
```tsx
const effectiveApiKey = adminKey;
```

3. 更新 `handleCopyCurl` 中的 cURL 生成逻辑（约第 254 行）：
```tsx
    const apiKeyToUse = effectiveApiKey || 'YOUR_ADMIN_SECRET_KEY';
    const headers = [
      `-H "x-api-key: ${apiKeyToUse}"`,
      `-H "x-admin-key: ${apiKeyToUse}"`,
      `-H "Content-Type: application/json"`
    ];
```

4. 更新 `handleSend` 中的检查与请求头（约第 340-390 行）：
```tsx
  const handleSend = async () => {
    if (!effectiveApiKey) {
      alert(t('playground.alertKeyRequired'));
      return;
    }
```
请求头：
```tsx
      const fetchOptions: RequestInit = {
        method: targetMethod,
        headers: {
          'content-type': 'application/json',
          'x-api-key': effectiveApiKey,
          'x-admin-key': effectiveApiKey
        }
      };
```

5. 更新并发测试弹窗调用触发：
```tsx
          <button
            onClick={() => {
              if (!effectiveApiKey) {
                alert(t('playground.alertKeyRequired'));
                return;
              }
              setShowConcurrentModal(true);
            }}
```
并在底部 `ConcurrentTestModal` 传参：
```tsx
        apiKey={effectiveApiKey}
```

6. 替换顶部工具栏的密钥输入框（约第 495-507 行）：
将原密码输入框：
```tsx
          {/* Gemini API Key input with icon */}
          <div className="relative flex items-center w-full sm:w-64 lg:w-48">
            <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder={t('playground.apiKeyPlaceholder')}
              className="ui-input pl-8 pr-2.5 py-1.5 w-full"
            />
          </div>
```
替换为紧凑的系统密钥已就绪徽章：
```tsx
          {/* System Admin Secret Key Badge */}
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-mono select-none"
            title={t('playground.systemKeyDesc')}
          >
            <Key className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            <span className="font-medium whitespace-nowrap">{t('playground.systemKeyActive')}</span>
          </div>
```

- [ ] **Step 3: 运行前端构建验证类型与编译**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend
```
Expected: PASS (构建成功输出 dist/frontend)

- [ ] **Step 4: 提交代码变更**

```bash
git add frontend/src/App.tsx frontend/src/components/PlaygroundView.tsx
git commit -m "feat(playground): use system adminKey for API requests and replace input with key status badge"
```

---

### Task 4: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [ ] **Step 1: 运行后端与全量测试套件**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test
```
Expected: PASS，所有单测套件全部通过（`claudeController.test.ts`, `accountService.test.ts`, `accountController.test.ts` 等）。

- [ ] **Step 2: 运行后端构建**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend
```
Expected: PASS，tsc 编译无任何错误。

- [ ] **Step 3: 运行全量构建**

运行：
```bash
/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build
```
Expected: PASS，前后端整体构建成功。

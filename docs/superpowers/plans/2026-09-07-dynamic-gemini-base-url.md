# GEMINI_BASE_URL 动态配置与实时生效实施计划 (Dynamic GEMINI_BASE_URL Configuration & Live Hot-Reload Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理后台配置弹窗 (`ConfigModal`) 的【上游配置 (UPSTREAM)】面板中引入 `GEMINI_BASE_URL` 配置项，支持一键填入官方默认值与自动清洗规范化，保证保存后全站请求（代理转发、Token 计数、账号存活检测等）实时热生效，并支持重置回退。

**Architecture:**
- 在 `frontend/src/i18n/locales/` 中补充 `config.geminiBaseUrlTitle`、`config.geminiBaseUrlDesc` 与 `config.useOfficialDefault`。
- 在 `config/default.ts` 的 `updateConfig` 中增加 URL 规范化清洗（去空格、去除末尾斜杠、补全 http/https 协议前缀）。
- 在 `frontend/src/components/ConfigModal.tsx` 的【上游配置】Tab 顶部增加 `GEMINI_BASE_URL` 输入框、快捷“⚡ 填入官方默认”按钮与实时状态双向绑定。
- 在 `tests/dynamicGeminiBaseUrl.test.ts` 中完成自动化后端热更新断言与前端组件表单绑定断言。

**Tech Stack:** Express, TypeScript, React 18, Tailwind CSS, Lucide React, Jest, Vite.

## Global Constraints

- **Live Hot-Reload**: 后端更新 `geminiBaseUrl` 后，下一次 `getUpstreamUrl` 或 `accountService` 调用必须 100% 立即采用新地址，无需重启进程。
- **Auto Normalization**: 输入值必须在保存前/保存时自动清洗，去除末尾斜杠（`/`）并补齐协议头（`https://`）。
- **Zero Build Errors**: 前端 Vite 与后端 TypeScript 严格构建 0 错误，全量 Jest 测试套件 100% PASS。

---

### Task 1: 编写规范化逻辑与测试驱动断言 (Backend Normalization & TDD)

**Files:**
- Modify: `config/default.ts`
- Create: `tests/dynamicGeminiBaseUrl.test.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `updateConfig({ geminiBaseUrl })`, `getUpstreamUrl('/v1beta/models')`
- Produces: 自动格式化且即时生效的 `config.geminiBaseUrl`

- [x] **Step 1: 编写失败的测试 `tests/dynamicGeminiBaseUrl.test.ts`**

```typescript
import config, { updateConfig } from '../config/default';
import { getUpstreamUrl } from '../src/utils/requestHelper';
import * as fs from 'fs';
import * as path from 'path';

describe('Dynamic GEMINI_BASE_URL Hot-Reload & Normalization', () => {
  const originalUrl = config.geminiBaseUrl;

  afterEach(async () => {
    // Restore
    await updateConfig({ geminiBaseUrl: originalUrl });
  });

  test('should immediately update config.geminiBaseUrl and getUpstreamUrl', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://my-custom-proxy.example.com'
    });

    expect(config.geminiBaseUrl).toBe('https://my-custom-proxy.example.com');
    expect(getUpstreamUrl('/v1beta/models')).toBe('https://my-custom-proxy.example.com/v1beta/models');
  });

  test('should automatically strip trailing slashes and spaces from geminiBaseUrl', async () => {
    await updateConfig({
      geminiBaseUrl: '  https://custom-gateway.io/api///  '
    });

    expect(config.geminiBaseUrl).toBe('https://custom-gateway.io/api');
    expect(getUpstreamUrl('v1beta/models')).toBe('https://custom-gateway.io/api/v1beta/models');
  });

  test('should prepend https:// if protocol is missing', async () => {
    await updateConfig({
      geminiBaseUrl: 'gateway.openai-gemini.internal:8080'
    });

    expect(config.geminiBaseUrl).toBe('https://gateway.openai-gemini.internal:8080');
  });

  test('ConfigModal.tsx should include geminiBaseUrl state and UI elements', () => {
    const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');
    expect(content).toContain('geminiBaseUrl');
    expect(content).toContain('setGeminiBaseUrl');
    expect(content).toContain('generativelanguage.googleapis.com');
  });
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/dynamicGeminiBaseUrl.test.ts`
Expected: FAIL (去除斜杠清洗未在 `updateConfig` 中实现，`ConfigModal.tsx` 尚未添加 `geminiBaseUrl`)

- [x] **Step 3: 更新 `config/default.ts` 实现规范化清洗**

在 `config/default.ts` 的 `updateConfig` 中增加：
```typescript
  if (partialConfig.geminiBaseUrl !== undefined) {
    if (typeof partialConfig.geminiBaseUrl === 'string') {
      let cleanUrl = partialConfig.geminiBaseUrl.trim().replace(/\/+$/, '');
      if (!cleanUrl) {
        cleanUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
      } else if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `https://${cleanUrl}`;
      }
      partialConfig.geminiBaseUrl = cleanUrl;
    }
  }
```

- [x] **Step 4: 更新多语言词条 `zh.ts` 与 `en.ts`**

在 `frontend/src/i18n/locales/zh.ts` 的 `config` 下：
```typescript
    geminiBaseUrlTitle: "GEMINI_BASE_URL",
    geminiBaseUrlDesc: "Gemini 官方 API 地址或反向代理网关。保存后所有请求实时生效。",
    useOfficialDefault: "填入官方默认",
```

在 `frontend/src/i18n/locales/en.ts` 的 `config` 下：
```typescript
    geminiBaseUrlTitle: "GEMINI_BASE_URL",
    geminiBaseUrlDesc: "Official Gemini API or reverse proxy gateway URL. Takes effect immediately.",
    useOfficialDefault: "Use Official Default",
```

- [x] **Step 5: 提交 Task 1 改动**

```bash
git add config/default.ts frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/dynamicGeminiBaseUrl.test.ts
git commit -m "feat(config): add GEMINI_BASE_URL normalization and hot-reload logic"
```

---

### Task 2: 在 `ConfigModal.tsx` 中集成 `GEMINI_BASE_URL` 配置表单与交互

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`

**Interfaces:**
- Consumes: `t('config.geminiBaseUrlTitle')`, `t('config.geminiBaseUrlDesc')`, `t('config.useOfficialDefault')`
- Produces: 
  - `geminiBaseUrl` 状态初始化与回显
  - `fetchConfig()` 回填 `data.config.geminiBaseUrl`
  - `handleSave()` 包含 `geminiBaseUrl`
  - `[⚡ 填入官方默认]` 快速回填按钮

- [x] **Step 1: 在 `ConfigModal.tsx` 中添加状态与回显逻辑**

1. 声明状态：
   ```typescript
   const [geminiBaseUrl, setGeminiBaseUrl] = useState<string>('https://generativelanguage.googleapis.com');
   ```
2. 在 `fetchConfig` 中获取：
   ```typescript
   setGeminiBaseUrl(data.config.geminiBaseUrl || 'https://generativelanguage.googleapis.com');
   ```
3. 在 `handleSave` 提交载荷中加入：
   ```typescript
   geminiBaseUrl: geminiBaseUrl.trim().replace(/\/+$/, ''),
   ```

- [x] **Step 2: 在 `activeTab === 'upstream'` 中渲染置顶表单项**

```tsx
{/* TAB 2: Proxy & Upstream */}
{activeTab === 'upstream' && (
  <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-150">
    <div className="ui-card-sub p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
      <div className="hidden sm:flex items-center space-x-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
        <Globe className="w-3.5 h-3.5 text-blue-400" />
        <span>{t('config.upstreamGroup')}</span>
      </div>

      <div className="space-y-3.5 sm:space-y-4">
        {/* GEMINI_BASE_URL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 block">
              {t('config.geminiBaseUrlTitle', 'GEMINI_BASE_URL')}
            </label>
            <button
              type="button"
              onClick={() => setGeminiBaseUrl('https://generativelanguage.googleapis.com')}
              className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1"
            >
              <Zap className="w-2.5 h-2.5" />
              <span>{t('config.useOfficialDefault', '填入官方默认')}</span>
            </button>
          </div>
          <input
            type="text"
            value={geminiBaseUrl}
            onChange={(e) => setGeminiBaseUrl(e.target.value)}
            onBlur={() => setGeminiBaseUrl(prev => prev.trim().replace(/\/+$/, ''))}
            placeholder="https://generativelanguage.googleapis.com"
            className="w-full ui-input p-2.5 text-xs font-mono"
          />
          <p className="hidden sm:block text-[10px] text-slate-400">
            {t('config.geminiBaseUrlDesc', 'Gemini 官方 API 地址或反向代理网关。保存后所有请求实时生效。')}
          </p>
        </div>

        {/* UPSTREAM_TIMEOUT_MS */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200 block">UPSTREAM_TIMEOUT_MS</label>
          <div className="relative">
            <input
              type="number"
              value={upstreamTimeoutMs}
              onChange={(e) => setUpstreamTimeoutMs(parseInt(e.target.value, 10) || 0)}
              className="w-full ui-input p-2.5 text-xs"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">ms</span>
          </div>
          <p className="hidden sm:block text-[10px] text-slate-400">{t('config.upstreamTimeoutDesc')}</p>
        </div>

        {/* COUNT_TOKENS_MODEL */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200 block">COUNT_TOKENS_MODEL</label>
          <input
            type="text"
            value={countTokensModel}
            onChange={(e) => setCountTokensModel(e.target.value)}
            placeholder="e.g. gemini-2.5-flash (Leave blank to use request model)"
            className="w-full ui-input p-2.5 text-xs"
          />
          <p className="hidden sm:block text-[10px] text-slate-400">{t('config.countTokensDesc')}</p>
        </div>
      </div>
    </div>
  </div>
)}
```

- [x] **Step 3: 运行自动化测试验证**

Run: `npx jest tests/dynamicGeminiBaseUrl.test.ts`
Expected: 4 个测试全部 PASS

- [x] **Step 4: 提交 Task 2 改动**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): add GEMINI_BASE_URL form control and quick default fill to ConfigModal"
```

---

### Task 3: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (全面回归验证)

- [x] **Step 1: 运行全量 Jest 测试套件**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test`
Expected: 全量测试套件全部 PASS

- [x] **Step 2: 运行前端 Vite 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend`
Expected: 0 错误构建成功

- [x] **Step 3: 运行后端 TypeScript 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend`
Expected: 0 错误构建成功

- [x] **Step 4: 运行全量生产构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build`
Expected: SUCCESS

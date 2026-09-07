# GEMINI_BASE_URL 动态配置与实时生效设计文档 (Dynamic GEMINI_BASE_URL Configuration & Live Hot-Reload Design)

**日期**: 2026-09-07  
**分支**: `main`  
**目标**: 在管理后台配置弹窗 (`ConfigModal`) 的【上游配置 (UPSTREAM)】中增加 `GEMINI_BASE_URL` 配置项，支持一键填入官方默认值与格式自动规范化，保存后全站请求（包括代理转发、Token计数、API调试器、账号检测等）立即热生效，并持久化到 `config/runtime.json`。

---

## 1. 背景与诉求

1. **上游网关环境灵活切换**：
   在不同部署环境（国内 VPS、企业内网、Cloudflare Worker 中转、自定义反向代理网关）下，用户需要指定不同的 Gemini 上游地址，以往需要登录服务器手动编辑 `.env` 并重启 PM2，流程繁琐。
2. **零停机与实时热生效要求**：
   配置修改后必须立刻对后续所有进来的请求生效，无需重启进程，且重启后通过 `runtime.json` 自动维持最新设定。
3. **防呆与容错**：
   用户可能输入带有前后空格、多个尾部斜杠或漏写协议头的 URL，系统需要能够自动规范化清洗，防止造成请求 404 或网络中断。

---

## 2. 详细交互与视觉设计

### 2.1 ConfigModal 上游面板布局重构

在【上游配置 (UPSTREAM)】Tab 中置顶展示：

```
┌─ 上游配置 (UPSTREAM) ────────────────────────────────────────────────────────┐
│                                                                              │
│  GEMINI_BASE_URL (上游 API 基础地址)                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ https://generativelanguage.googleapis.com                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────┐                                                  │
│  │ ⚡ 填入官方默认         │                                                  │
│  └────────────────────────┘                                                  │
│  支持填写自建反向代理、Cloudflare Worker 网关或中转服务。保存后全站请求实时生效。│
│                                                                              │
│  UPSTREAM_TIMEOUT_MS (上游请求超时)                                          │
│  [ 180000                                                    ms ]            │
│                                                                              │
│  COUNT_TOKENS_MODEL (Token 计数模型)                                         │
│  [ e.g. gemini-2.5-flash                                        ]            │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### 交互细节：
- 默认读取当前生效的 `config.geminiBaseUrl` 进行表单回显；
- 提供一键快捷按钮 `⚡ 填入官方默认`，点击后直接重置为 `https://generativelanguage.googleapis.com`；
- 在输入框 `onBlur` 时自动执行 `.trim().replace(/\/+$/, '')` 去除多余空格和末尾斜杠；
- 支持保存提示及“恢复默认配置 (resetToEnv)”时自动恢复。

---

## 3. 后端架构与热生效数据流

```
Admin Web UI (ConfigModal)
          │  POST /api/admin/config { geminiBaseUrl: "https://my-proxy.com/" }
          ▼
AdminController.updateConfig()
          │  清洗: trim() -> 去除末尾斜杠 -> 补充 https:// 协议头
          ▼
config/default.ts: updateConfig()
          │  1. Object.assign(config, { geminiBaseUrl: "https://my-proxy.com" })
          │  2. 持久化写入 config/runtime.json
          ▼
后续请求实时消费:
  - claudeController: getUpstreamUrl() -> config.geminiBaseUrl (实时生效)
  - accountService: getBaseUrl() -> config.geminiBaseUrl (实时生效)
  - playgroundView -> /v1/messages 代理链路 (实时生效)
```

### 3.1 规范化规则
```typescript
if (typeof partialConfig.geminiBaseUrl === 'string') {
  let cleanUrl = partialConfig.geminiBaseUrl.trim().replace(/\/+$/, '');
  if (!cleanUrl) {
    cleanUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  } else if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = `https://${cleanUrl}`;
  }
  partialConfig.geminiBaseUrl = cleanUrl;
}
```

---

## 4. 多语言 (i18n) 规范

### `zh.ts`:
```typescript
config: {
  // ...
  geminiBaseUrlTitle: "GEMINI_BASE_URL",
  geminiBaseUrlDesc: "Gemini 官方 API 地址或反向代理网关。保存后所有请求实时生效。",
  useOfficialDefault: "填入官方默认",
}
```

### `en.ts`:
```typescript
config: {
  // ...
  geminiBaseUrlTitle: "GEMINI_BASE_URL",
  geminiBaseUrlDesc: "Official Gemini API or reverse proxy gateway URL. Takes effect immediately.",
  useOfficialDefault: "Use Official Default",
}
```

---

## 5. 测试与验证策略

1. **测试驱动断言 (`tests/dynamicGeminiBaseUrl.test.ts`)**：
   - 验证通过 POST `/api/admin/config` 成功更新 `geminiBaseUrl`；
   - 验证 URL 自动去除尾部斜杠并补充协议头；
   - 验证 `getUpstreamUrl` 立即返回新地址；
   - 验证重置配置 `resetToEnv: true` 正确恢复环境默认值；
   - 验证前端 `ConfigModal.tsx` 表单包含字段读写与回显。
2. **全量构建回归**：
   - `npm run build:frontend` 0 报错；
   - `npm run build:backend` 0 报错；
   - `npm test` 100% 通过。

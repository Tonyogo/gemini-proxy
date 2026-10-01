# 上游服务器配置极简视觉与紧凑布局重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除上游服务器配置界面的所有冗余长句段落文字，对直连模式进行极致内联收敛（隐藏冗余 URL 输入框、将两块多行 Radio 大卡片收敛为单行内联胶囊切换器与下拉框），压缩整张卡片 40%~50% 垂直高度，打造现代极简控制台视觉。

**Architecture:** 
- 多语言词条精简：在 `zh.ts` 与 `en.ts` 中精简冗余长句，增加紧凑型胶囊标签（`egressLocalShort`, `egressAgentShort`, `targetOfficialEndpoint` 等）。
- 直连模式卡片极致内联重构：在 `ConfigModal.tsx` 中，直连模式隐藏独立 URL 输入框改为紧凑灰色端点指示徽章；出口通道彻底废弃两行大 Radio Card，改为单行胶囊分段器，选中 Agent 时内联展开选择器与等高刷新按钮。
- 视觉噪音彻底剔除：移除顶部副标题整段解释，精简允许模型占位符与密钥池计数药丸。

**Tech Stack:** React 18, TypeScript, TailwindCSS, Lucide Icons, Vite, Jest.

**Spec:** `docs/superpowers/specs/2026-10-01-upstream-config-minimalist-redesign.md`

## Global Constraints

- 仅重构前端展现层与文本，不改动任何后端数据结构或提交的配置 Payload（`url`, `type`, `weight`, `agentId`, `apiKeys`, `allowedModels` 等字段完全保持一致）。
- 确保在直连模式下，切换为“本机出站”时将 `agentId` 设为 `undefined`，切换为“Agent 节点”时自动设置首个可用 Agent ID。
- 在直连模式下，后台保存的节点数据中 `url` 依然保证为有效端点（若为空或代理地址则保持为 `https://generativelanguage.googleapis.com`）。
- 保持移动端（`<640px`）与桌面端（`>=640px`）零横向溢出，所有测试套件及前端构建 `100%` 通过。

## Review Focus

1. **直连模式端点自动保全**：虽然隐藏了独立的 URL 输入框，但在切换模式或保存配置时，`server.url` 必须仍正确维持 Google 官方端点，不变成空字符串。
2. **内联胶囊切换器的响应状态一致性**：点击 `[ 本机出站 ]` 与 `[ Agent 节点 ]` 胶囊按钮时，高亮选中态、`agentId` 绑定以及下拉框的显隐必须严格同步且无闪烁。
3. **长节点名自适应截断**：当 Agent 节点名或 IP 较长时，内联下拉框���须通过 `min-w-0` 和 `truncate` 限制在单行内，不将刷新按钮挤出视口。
4. **多语言双向对齐**：所有精简后的词条（中英文）必须在 `zh.ts` 与 `en.ts` 中严格对称，不留缺失 key。
5. **回归测试零破坏**：既有功能（权重调整、多密钥池输入、模型过滤、启停切换）在紧凑化后完全正常工作。

---

### Task 1: 国际化词条 (zh.ts & en.ts) 精简化与单元测试更新

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts:50-80`
- Modify: `frontend/src/i18n/locales/en.ts:50-80`
- Modify: `tests/i18nAgentEgress.test.ts`

**Interfaces:**
- Produces:
  - `config.egressLocalShort`, `config.egressAgentShort`, `config.targetOfficialEndpoint`
  - 精简 `config.upstreamServersDesc` 为空或精简短句
  - 精简 `config.serverAllowedModelsPlaceholder` 为短占位符

- [ ] **Step 1: 编写/更新失败测试**

修改 `tests/i18nAgentEgress.test.ts`：
```typescript
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('i18n locales for Minimalist Agent Egress', () => {
  const requiredKeys = [
    'egressChannelTitle',
    'egressLocalShort',
    'egressAgentShort',
    'targetOfficialEndpoint',
    'serverAllowedModelsPlaceholder'
  ];

  it('contains minimalist egress channel and endpoint translation keys in zh and en', () => {
    for (const key of requiredKeys) {
      expect((zh.config as any)[key]).toBeDefined();
      expect(typeof (zh.config as any)[key]).toBe('string');
      expect((en.config as any)[key]).toBeDefined();
      expect(typeof (en.config as any)[key]).toBe('string');
    }
    // Verify concise placeholders
    expect((zh.config as any).serverAllowedModelsPlaceholder).toBe('全部模型 (逗号分隔过滤)');
    expect((en.config as any).serverAllowedModelsPlaceholder).toBe('All models (comma separated)');
    expect((zh.config as any).egressLocalShort).toBe('本机出站');
    expect((en.config as any).egressLocalShort).toBe('Local Direct');
    expect((zh.config as any).egressAgentShort).toBe('Agent 节点');
    expect((en.config as any).egressAgentShort).toBe('Remote Agent');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx jest tests/i18nAgentEgress.test.ts`
Expected: FAIL (Key or value not matching)

- [ ] **Step 3: 更新 `zh.ts` 与 `en.ts`**

1. 修改 `frontend/src/i18n/locales/zh.ts`：
```typescript
    upstreamServersDesc: "",
    serverAllowedModelsPlaceholder: "全部模型 (逗号分隔过滤)",
    egressChannelTitle: "出口通道",
    egressLocalShort: "本机出站",
    egressAgentShort: "Agent 节点",
    targetOfficialEndpoint: "目标: 官方 Gemini API",
    keyPoolCountBadge: "Key × {count}",
```

2. 修改 `frontend/src/i18n/locales/en.ts`：
```typescript
    upstreamServersDesc: "",
    serverAllowedModelsPlaceholder: "All models (comma separated)",
    egressChannelTitle: "Egress",
    egressLocalShort: "Local Direct",
    egressAgentShort: "Remote Agent",
    targetOfficialEndpoint: "Target: Official Gemini API",
    keyPoolCountBadge: "Key × {count}",
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/i18nAgentEgress.test.ts`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/i18nAgentEgress.test.ts
git commit -m "feat(i18n): streamline upstream config locales and add minimalist egress badges"
```

---

### Task 2: `ConfigModal.tsx` 上游面板视觉瘦身与直连模式内联重构

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:675-710, 890-1090`
- Test: `npm run build:frontend`

**Interfaces:**
- Produces:
  - 移除顶部冗长段落 `<p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">{t('config.upstreamServersDesc')}...`
  - 代理模式 (`proxy`) 保留网关 URL 输入框；直连模式 (`direct`) 隐藏 URL 输入框并展示紧凑的只读目标端点徽章
  - 彻底废除直连模式下占用大面积的两个 Radio Card，改为紧凑的单行胶囊分段按钮组：
    `出口通道: [ 本机出站* ] [ Agent 节点 ▾ ]`
  - 选中 Agent 时，在同一行平滑展示 Agent 下拉框与刷新小方块

- [ ] **Step 1: 移除顶部长段落描述**

在 `frontend/src/components/ConfigModal.tsx`（原 680 行附近），移除 `upstreamServersDesc` 的长段落渲染：
```tsx
<div className="flex items-center justify-between">
  <div>
    <label className="text-xs font-semibold text-slate-200 block">
      {t('config.upstreamServersTitle', '上游代理服务器与流量分配')}
    </label>
  </div>
  <button
    type="button"
    onClick={handleOfficialDefault}
    className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1 flex-shrink-0"
  >
    <Zap className="w-2.5 h-2.5" />
    <span>{t('config.useOfficialDefault', '填入官方默认')}</span>
  </button>
</div>
```

- [ ] **Step 2: 重构基础字段输入网格（直连模式隐藏 URL 输入框）**

在卡片内容区：
- 当 `server.type === 'direct'` 时：
  - 第一行仅渲染「节点备注名（8列）」与「权重（4列）」，不渲染独立的 URL 输入框；
  - 紧接着渲染「单行内联网络出口通道」与「目标端点只读徽章」；
- 当 `server.type === 'proxy'` 时：
  - 保持原有的「备注名」、「权重」与「网关 URL」输入框。

代码结构：
```tsx
<div className="grid grid-cols-12 gap-2 sm:gap-2.5 text-xs">
  {/* Top Row Inputs */}
  <div className="col-span-12 grid grid-cols-12 gap-2 sm:gap-2.5">
    {server.type === 'direct' ? (
      <>
        <div className="col-span-8 space-y-1">
          <label className="text-[11px] text-slate-400 block">{t('config.nodeName', '节点备注名')}</label>
          <input
            type="text"
            value={server.name || ''}
            onChange={(e) => {
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], name: e.target.value };
              setUpstreamServers(updated);
            }}
            placeholder="e.g. Gemini-Official"
            className="w-full ui-input p-2 text-xs"
          />
        </div>
        <div className="col-span-4 space-y-1">
          <label className="text-[11px] text-slate-400 block">{t('config.nodeWeight', '权重')}</label>
          <input
            type="number"
            min="1"
            max="1000"
            value={server.weight}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], weight: isNaN(val) ? 1 : Math.max(1, Math.min(1000, val)) };
              setUpstreamServers(updated);
            }}
            className="w-full ui-input p-2 text-xs font-mono"
          />
        </div>
      </>
    ) : (
      <>
        <div className="col-span-8 sm:col-span-4 space-y-1">
          <label className="text-[11px] text-slate-400 block">{t('config.nodeName', '节点备注名')}</label>
          <input
            type="text"
            value={server.name || ''}
            onChange={(e) => {
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], name: e.target.value };
              setUpstreamServers(updated);
            }}
            placeholder="e.g. HK-Gateway"
            className="w-full ui-input p-2 text-xs"
          />
        </div>
        <div className="col-span-4 sm:col-span-3 space-y-1 sm:order-last">
          <label className="text-[11px] text-slate-400 block">{t('config.nodeWeight', '权重')}</label>
          <input
            type="number"
            min="1"
            max="1000"
            value={server.weight}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], weight: isNaN(val) ? 1 : Math.max(1, Math.min(1000, val)) };
              setUpstreamServers(updated);
            }}
            className="w-full ui-input p-2 text-xs font-mono"
          />
        </div>
        <div className="col-span-12 sm:col-span-5 space-y-1">
          <label className="text-[11px] text-slate-400 block">{t('config.nodeUrl', '网关 URL')}</label>
          <input
            type="text"
            value={server.url}
            onChange={(e) => {
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], url: e.target.value };
              setUpstreamServers(updated);
              setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
            }}
            onBlur={() => {
              const updated = [...upstreamServers];
              let clean = (updated[idx].url || '').trim().replace(/\/+$/, '');
              if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
              updated[idx] = { ...updated[idx], url: clean };
              setUpstreamServers(updated);
              setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
            }}
            placeholder="https://api.example.com"
            className="w-full ui-input p-2 text-xs font-mono"
          />
        </div>
      </>
    )}
  </div>
```

- [ ] **Step 3: 重构直连模式出口通道为极简胶囊分段条**

彻底移除原本占据两行的大 Radio 卡片（`<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">` 及其子元素），替换为单行精致内联布局：
```tsx
{/* Direct Mode Minimalist Egress Pill & Endpoint Badge */}
{server.type === 'direct' && (
  <div className="col-span-12 space-y-2 p-2.5 rounded-lg bg-slate-900/60 border border-cyan-500/20">
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      <div className="flex items-center space-x-1.5">
        <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="text-[11px] font-semibold text-cyan-400">{t('config.egressChannelTitle', '出口通道')}</span>

        {/* Inline Segmented Pill Buttons */}
        <div className="inline-flex rounded-md p-0.5 bg-slate-950 border border-slate-700/80 ml-1">
          <button
            type="button"
            onClick={() => {
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], agentId: undefined };
              setUpstreamServers(updated);
            }}
            className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
              !server.agentId
                ? 'bg-cyan-600 text-white shadow-xs font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('config.egressLocalShort', '本机出站')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!server.agentId) {
                const firstOnline = availableHosts.find(h => h.status === 'online');
                const target = firstOnline ? firstOnline.name || firstOnline.id : (availableHosts[0]?.name || availableHosts[0]?.id || 'agent');
                const updated = [...upstreamServers];
                updated[idx] = { ...updated[idx], agentId: target };
                setUpstreamServers(updated);
              }
            }}
            className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
              Boolean(server.agentId)
                ? 'bg-cyan-600 text-white shadow-xs font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('config.egressAgentShort', 'Agent 节点')}
          </button>
        </div>
      </div>

      <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
        {t('config.targetOfficialEndpoint', '目标: 官方 Gemini API')}
      </span>
    </div>

    {/* Compact Agent Host Dropdown when Agent is active */}
    {server.agentId && (
      <div className="pt-1.5 border-t border-cyan-500/10 flex items-center space-x-2">
        <div className="flex-1 min-w-0">
          <select
            value={server.agentId}
            onChange={(e) => {
              const updated = [...upstreamServers];
              updated[idx] = { ...updated[idx], agentId: e.target.value };
              setUpstreamServers(updated);
            }}
            className="w-full ui-input py-1 px-2 text-xs font-mono bg-slate-950/90 border-cyan-500/30 text-cyan-200 cursor-pointer truncate"
          >
            {availableHosts.length === 0 ? (
              <option value={server.agentId}>
                {server.agentId} ({t('config.noAgentsAvailable', '暂无在线 Agent')})
              </option>
            ) : (
              availableHosts.map((h) => {
                const identifier = h.name || h.id;
                const statusDot = h.status === 'online' ? '● 在线' : '○ 离线';
                return (
                  <option key={h.id} value={identifier}>
                    {statusDot} | {identifier} ({h.ip || 'no-ip'})
                  </option>
                );
              })
            )}
          </select>
        </div>
        <button
          type="button"
          onClick={fetchAvailableHosts}
          disabled={loadingHosts}
          title="刷新在线 Agent 列表"
          className="w-7 h-7 shrink-0 flex items-center justify-center text-cyan-400 hover:text-cyan-200 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 rounded cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loadingHosts ? 'animate-spin' : ''}`} />
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: 允许模型占位符与密钥池计数药丸紧凑化**

1. 将允许模型输入框的 placeholder 替换为紧凑的：
```tsx
placeholder={t('config.serverAllowedModelsPlaceholder', '全部模型 (逗号分隔过滤)')}
```
2. 将 API Key 密钥池右上角的计数器简化为：
```tsx
<span className="text-[10px] text-cyan-300/80 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
  {t('config.keyPoolCountBadge', 'Key × {count}').replace('{count}', String(count))}
</span>
```

- [ ] **Step 5: 运行前端构建测试**

Run: `npm run build:frontend`
Expected: PASS (0 警告 0 错误)

- [ ] **Step 6: 提交代码**

```bash
git add frontend/src/components/ConfigModal.tsx
git commit -m "style(ui): redesign upstream config modal with minimalist inline layout"
```

---

### Task 3: 移动端测试与全量回归验证

**Files:**
- Modify: `tests/configModalMobile.test.ts`
- Test: `npm test`
- Test: `npm run build:frontend`

**Interfaces:**
- Produces:
  - 更新 `tests/configModalMobile.test.ts` 中针对胶囊分段切换器、直连模式隐藏独立 URL 输入框的 DOM 结构断言

- [ ] **Step 1: 更新 `tests/configModalMobile.test.ts` 测试断言**

修改 `tests/configModalMobile.test.ts`，断言新的极简内联胶囊及文案：
```typescript
import fs from 'fs';
import path from 'path';

describe('ConfigModal Minimalist Upstream Layout', () => {
  const filePath = path.join(__dirname, '../frontend/src/components/ConfigModal.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('renders minimalist inline egress pill switch in direct mode', () => {
    expect(content).toContain("t('config.egressLocalShort'");
    expect(content).toContain("t('config.egressAgentShort'");
    expect(content).toContain("t('config.targetOfficialEndpoint'");
  });

  it('conditionally hides node URL input when server.type is direct', () => {
    expect(content).toContain("server.type === 'direct' ?");
    expect(content).toContain("e.g. Gemini-Official");
  });

  it('removes noisy upstreamServersDesc paragraph', () => {
    expect(content).not.toContain("{t('config.upstreamServersDesc'");
  });
});
```

- [ ] **Step 2: 运行针对性单元测试**

Run: `npx jest tests/configModalMobile.test.ts tests/i18nAgentEgress.test.ts`
Expected: PASS

- [ ] **Step 3: 运行全量回归测试套件与前端打包构建**

Run: `npm test`
Expected: ALL PASS (178/178 suites passing)

Run: `npm run build:frontend`
Expected: ALL PASS

- [ ] **Step 4: 提交代码**

```bash
git add tests/configModalMobile.test.ts
git commit -m "test: update mobile and minimalist upstream layout assertions"
```

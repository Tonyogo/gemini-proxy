# 账号管理（AccountsView）UI 风格与全局设计系统统一重构计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `frontend/src/components/AccountsView.tsx`，使其视觉风格、排版、卡片与交互组件与 `DashboardView`、`ModelPerformanceMatrix` 及全局统一设计系统（`.ui-card`, `.ui-tab-container`, `.ui-tab-pill`, `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-input`）保持一致，消除版本代差带来的视觉割裂。

**Architecture:** 
1. 替换 `AccountsView.tsx` 中的旧式手写 Server 切换器为全局标准 `.ui-tab-container` 与 `.ui-tab-pill`，统一 Indigo 胶囊与微光阴影规范；
2. 轻量化节点模型概览卡片，对齐仪表盘指标风格，数值采用 `tabular-nums` 及微光进度条；
3. 全面规范操作工具栏，统一使用 `.ui-input` 与 `.ui-btn-primary` / `.ui-btn-secondary` 按钮系统；
4. 升级直连模式与代理模式下的账号/密钥表格体系，移除外层硬大边框与深色表头，采用无外框流线悬停行与统一状态徽章（Soft pill + Dot indicator）。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest

**Spec:** [docs/superpowers/specs/2026-10-23-accounts-view-ui-unification-design.md](docs/superpowers/specs/2026-10-23-accounts-view-ui-unification-design.md) (由 brainstorming 确定的视觉规范与 4 阶段统一方案)

## Global Constraints

- 严禁破坏现有业务逻辑、API 调用路径及 query 参数（如 `serverId=${serverIdx}` 等）。
- 确保国际化（i18n）文案全部保留，不硬编码未翻译文本。
- 确保移动端适配与折叠搜索功能完备，不能破坏现有的 `isMobileSearchOpen` 等逻辑。
- 保证测试套件完整通过：`tests/accountsViewMultiServer.test.ts`、`tests/accountsThemeRefinement.test.ts`、`tests/accountsViewMobileOptimization.test.ts` 以及新增的 UI 规范测试。

## Review Focus

1. 保证多节点 Server 切换器的 `Server {idx + 1}`、`({host})`、`accounts.mobileTabShort`、直连/代理模式徽章渲染结构保持测试兼容。
2. 保证移动端折叠搜索栏的展开/折叠交互不受 CSS 类名重构影响。
3. 确保直连模式表格与代理模式表格在暗黑模式（dark mode）下边框和背景协调，不出现高对比白边或刺眼背景色。
4. 保证批量选择工具条（浮动浮层）与弹窗（Modal）的圆角和背景毛玻璃特效完全契合全局规范。
5. 保证前端 build (`npm run build:frontend`) 编译零警告零错误。

---

### Task 1: 编写 UI 规范对齐的测试用例

**Files:**
- Create: `tests/accountsViewUiUnification.test.ts`
- Test: `tests/accountsViewUiUnification.test.ts`

**Interfaces:**
- Consumes: `frontend/src/components/AccountsView.tsx` 源码静态断言
- Produces: 自动化守护用例，确保 AccountsView 接入了 `.ui-tab-container`, `.ui-tab-pill`, `.ui-tab-pill-active`, `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-input` 等规范类，并消除了旧式手写类名。

- [x] **Step 1: 创建失败测试文件 `tests/accountsViewUiUnification.test.ts`**

```typescript
import fs from 'fs';
import path from 'path';

describe('AccountsView UI Design System Unification Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies server tabs adopt standard .ui-tab-container and .ui-tab-pill classes', () => {
    expect(code).toContain('ui-tab-container');
    expect(code).toContain('ui-tab-pill');
    expect(code).toContain('ui-tab-pill-active');
    expect(code).not.toContain('bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200/90');
  });

  it('verifies toolbar and buttons adopt standard .ui-btn-primary and .ui-btn-secondary classes', () => {
    expect(code).toContain('ui-btn-primary');
    expect(code).toContain('ui-btn-secondary');
  });

  it('verifies tables remove heavy outer border-collapse and adopt modern borderless hover row styles', () => {
    expect(code).not.toContain('bg-slate-800/50 text-slate-500 mb-3 border border-white/[0.04]');
    expect(code).toContain('tabular-nums');
  });
});
```

- [x] **Step 2: 运行测试验证失败**

Run: `npx jest tests/accountsViewUiUnification.test.ts`
Expected: FAIL (因目前尚未统一使用 `ui-tab-container` 等类名)

- [x] **Step 3: 提交初始测试**

```bash
git add tests/accountsViewUiUnification.test.ts
git commit -m "test(accounts): add UI design system unification test assertions"
```

---

### Task 2: 统一多节点切换栏（Server Tabs）为全局胶囊规范

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:914-980`
- Test: `tests/accountsViewUiUnification.test.ts`, `tests/accountsViewMultiServer.test.ts`

**Interfaces:**
- Consumes: `servers`, `serversMeta`, `activeServerIndex`, `handleSwitchServer`
- Produces: 采用 `.ui-tab-container` 与 `.ui-tab-pill` 渲染的多节点胶囊切换器，同时完整保留 `Server {idx + 1}`、`({host})`、在线状态灯及模式徽章。

- [x] **Step 1: 重构 `AccountsView.tsx` 中的 Multi-Server Selection Tabs**

将手写的 `p-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]` 与卡片按键改为：
```tsx
      {servers.length > 1 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
          <div className="ui-tab-container gap-1 min-w-max">
            {servers.map((serverUrl, idx) => {
              const host = getServerHost(serverUrl);
              const isActive = activeServerIndex === idx;
              const serverData = serverDataMap[idx];
              const isLoading = Boolean(serverLoadingMap[idx]);
              const isOffline = serverHealthMap[idx] === false || Boolean(serverErrorMap[idx]);
              const count = serverData?.status?.accountDetails?.length;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSwitchServer(idx)}
                  className={`ui-tab-pill flex items-center space-x-2 ${
                    isActive ? 'ui-tab-pill-active font-semibold' : ''
                  }`}
                  title={serverUrl}
                >
                  <span className="flex items-center space-x-1.5 min-w-0">
                    {isLoading ? (
                      <RefreshCw className="w-2.5 h-2.5 animate-spin shrink-0" />
                    ) : isOffline ? (
                      <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-500/25 shrink-0" />
                    ) : (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-white ring-2 ring-white/30' : 'bg-emerald-500'}`} />
                    )}
                    <span className="hidden sm:inline-flex items-center gap-1 min-w-0">
                      <span className="font-semibold shrink-0">Server {idx + 1}</span>
                      <span className={`font-mono text-[10px] truncate max-w-[85px] sm:max-w-[120px] font-normal ${isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`} title={host}>({host})</span>
                    </span>
                    <span className="inline sm:hidden font-mono font-bold">{t('accounts.mobileTabShort', { index: idx + 1 })}</span>
                  </span>

                  {serversMeta[idx]?.type === 'direct' ? (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${isActive ? 'bg-white/20 text-white border-white/30' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'}`}>
                      {t('accounts.directModeBadge', '直连')}
                    </span>
                  ) : (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${isActive ? 'bg-white/20 text-white border-white/30' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'}`}>
                      {t('accounts.proxyModeBadge', '代理')}
                    </span>
                  )}

                  {isOffline ? (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border shrink-0 ${isActive ? 'bg-rose-500 text-white border-rose-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'}`}>
                      {t('accounts.nodeOffline')}
                    </span>
                  ) : count !== undefined ? (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 tabular-nums ${
                      isActive ? 'bg-white/20 text-white font-semibold' : 'bg-black/5 dark:bg-white/5 text-slate-500 dark:text-slate-400'
                    }`}>
                      {count} {serversMeta[idx]?.type === 'direct' ? 'Keys' : t('accounts.accountUnit')}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
```

- [x] **Step 2: 验证多节点测试与 UI 测试通过**

Run: `npx jest tests/accountsViewMultiServer.test.ts tests/accountsViewUiUnification.test.ts`
Expected: Server tabs 相关断言 PASS

- [x] **Step 3: 提交代码**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "refactor(accounts): unify server tab switcher with system pill container"
```

---

### Task 3: 优化模型概览卡片与操作工具栏统一

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:1010-1280`
- Test: `tests/accountsViewUiUnification.test.ts`, `tests/accountsViewMobileOptimization.test.ts`

**Interfaces:**
- Consumes: `serverModelStats`, `searchQuery`, `statusFilter`, 批量操作等事件
- Produces: 
  - 规范排版的指标概览卡片，使用 `tabular-nums`、统一边框。
  - 标准化按钮工具栏，统一使用 `.ui-btn-primary`, `.ui-btn-secondary`, `.ui-input`。

- [x] **Step 1: 重构操作工具栏按钮**

将工具栏中的“去重”、“刷新”、“批量删除”、“批量导出”等辅助按钮统一应用 `.ui-btn-secondary`，导入主要操作应用 `.ui-btn-primary`：
- 去重按钮：改为 `p-1.5 ui-btn-secondary text-amber-500 hover:text-amber-400`
- 刷新按钮：改为 `p-1.5 ui-btn-secondary`
- 导入按钮：保留并统一高度与内边距 `px-3 py-1.5 ui-btn-primary flex items-center space-x-1.5 text-xs font-semibold`
- 搜索输入框与下拉筛选框：确保全部挂载 `.ui-input`。

- [x] **Step 2: 模型概览卡片数值加上 `tabular-nums`**

确保模型指标数字（如请求量、成功率、占比）均带有 `tabular-nums font-mono`，防止数字变化跳动。

- [x] **Step 3: 运行测试验证**

Run: `npx jest tests/accountsViewUiUnification.test.ts tests/accountsViewMobileOptimization.test.ts`
Expected: PASS

- [x] **Step 4: 提交代码**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "refactor(accounts): standardize action toolbar buttons and model usage cards"
```

---

### Task 4: 表格体系去硬框化与设计系统对齐（直连 Key 列表与代理账号列表）

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:1340-2050`
- Test: `tests/accountsViewUiUnification.test.ts`, `tests/accountsThemeRefinement.test.ts`

**Interfaces:**
- Consumes: `filteredAccounts`, `isCurrentDirect`, 账号详情列表
- Produces: 
  - 移除封闭大边框，采用类似 `ModelPerformanceMatrix` 的极简扁平表头（无大深色背板，仅保留底部分割线 `border-b border-[var(--border-subtle)]`）。
  - 统一状态徽章（如“轮询活跃”、“已激活”、“已禁用”），采用统一的柔和胶囊与呼吸指示灯。
  - 数据列全部增加 `tabular-nums`。

- [x] **Step 1: 升级 Desktop Direct Mode Table & Proxy Mode Table 的表头与行**

- 调整 `<thead>`：使用透明底色 + 浅色细分界线，统一字体为 `text-[11px] font-medium tracking-wider text-[var(--text-muted)] uppercase`。
- 调整 `<tbody>` 中的状态徽章：统一为 `px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center space-x-1.5 w-fit border` 形式。
- 保证数值与序号使用 `font-mono-refined tabular-nums`。

- [x] **Step 2: 运行所有相关测试**

Run: `npx jest tests/accounts*.test.ts`
Expected: 所有 accounts 相关的单测全部 PASS

- [x] **Step 3: 提交代码**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "refactor(accounts): modernize table headers, status badges and row typography"
```

---

### Task 5: 全局集成验证与构建测试

**Files:**
- Test: `npm test` & `npm run build:frontend`

- [x] **Step 1: 运行全量测试**

Run: `npx jest --runInBand`
Expected: 全部测试用例通过 (0 failed)

- [x] **Step 2: 构建前端产物验证**
 
Run: `npm run build:frontend`
Expected: Vite 编译成功，输出零 TypeScript 错误

- [x] **Step 3: 最终审查与提交**

```bash
git status
```
确保工作树整洁无遗留文件。

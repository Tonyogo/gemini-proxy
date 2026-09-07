# 运行日志独立至发现中心实施计划 (Extract System Logs to Discover Hub Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将【运行日志 (TerminalLogsView)】从终端内部分离出来，作为独立工具放入【发现中心 (Discover Hub)】；移动端与【在线终端】形成优雅的 2x2 微信双分组列表，桌面端展现 4 列对称 APM 展厅卡片；终端组件回归纯粹的交互式 Shell。

**Architecture:**
- 在 `frontend/src/i18n/locales/` 中增加 `discover.systemLogsTitle`、`discover.systemLogsDesc`、`discover.viewLogs`。
- 在 `frontend/src/components/DiscoverHubView.tsx` 中扩展 `DiscoverToolId = 'terminal' | 'systemLogs' | 'playground' | 'translate'`：
  - 移动端：分组 1 为【系统运维】（在线终端 + 运行日志，青蓝渐变图标），分组 2 为【开发协同】（API 调试器 + 翻译工作台）；
  - 桌面端：4 列响应式 APM 展厅网格卡片。
- 在 `frontend/src/App.tsx` 中增加 `discoverSubView === 'systemLogs'` 渲染 `<TerminalLogsView />`，并完善面包屑与移动端沉浸顶栏标题联动。
- 纯粹化 `UnifiedTerminalView.tsx` 与 `WebTerminalView.tsx`，移除终端内多余的只读日志 Subtab 切换。
- 在 `tests/discoverSystemLogs.test.ts` 中编写端到端断言并验证通过。

**Tech Stack:** React 18, Tailwind CSS, Lucide React (`FileText`, `ScrollText`, `Terminal`, `Play`, `Languages`), TypeScript, Jest, Vite.

## Global Constraints

- **4-Tool Discover Matrix**: 发现中心必须支持 4 大独立工具（`terminal`, `systemLogs`, `playground`, `translate`）。
- **2x2 WeChat Mobile Grouping**: 移动端必须保持 2 组 x 2 项的微信原生平衡分组与细分割线。
- **Pure Terminal**: 在线终端不再嵌套日志 Tab，专注于交互式 Shell。
- **Strict TypeScript & TDD**: 前端 Vite 与后端 TypeScript 严格构建 0 错误，全量 Jest 测试套件 100% PASS。

---

### Task 1: 编写多语言词条与测试驱动断言

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Create: `tests/discoverSystemLogs.test.ts`

**Interfaces:**
- Consumes: `useTranslation`
- Produces: `discover.systemLogsTitle`, `discover.systemLogsDesc`, `discover.viewLogs`

- [ ] **Step 1: 编写失败的测试 `tests/discoverSystemLogs.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Extract System Logs to Discover Hub', () => {
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');

  let hubContent: string;
  let appContent: string;

  beforeAll(() => {
    hubContent = fs.existsSync(hubPath) ? fs.readFileSync(hubPath, 'utf-8') : '';
    appContent = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf-8') : '';
  });

  test('i18n should include systemLogs translations in both zh and en', () => {
    expect(zh.discover.systemLogsTitle).toBe('运行日志');
    expect(en.discover.systemLogsTitle).toBe('System Logs');
    expect(zh.discover.systemLogsDesc).toBeDefined();
    expect(en.discover.systemLogsDesc).toBeDefined();
  });

  test('DiscoverHubView should support systemLogs tool in DiscoverToolId and render 4 tools', () => {
    expect(hubContent).toContain("'systemLogs'");
    expect(hubContent).toContain('systemLogsTitle');
    // Group 1 gradient
    expect(hubContent).toContain('from-blue-500 to-cyan-600');
  });

  test('App.tsx should route discoverSubView systemLogs to TerminalLogsView', () => {
    expect(appContent).toContain("discoverSubView === 'systemLogs'");
    expect(appContent).toContain('<TerminalLogsView');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/discoverSystemLogs.test.ts`
Expected: FAIL (词条未补充、`DiscoverHubView` 尚未更新、`App.tsx` 尚未分发 `systemLogs`)

- [ ] **Step 3: 更新多语言词条 `zh.ts` 与 `en.ts`**

在 `frontend/src/i18n/locales/zh.ts` 的 `discover` 对象中：
```typescript
    systemLogsTitle: "运行日志",
    systemLogsDesc: "系统实时事件与控制台日志输出流，支持分级过滤与检索",
    viewLogs: "查看日志",
```

在 `frontend/src/i18n/locales/en.ts` 的 `discover` 对象中：
```typescript
    systemLogsTitle: "System Logs",
    systemLogsDesc: "Real-time SSE console log stream with level filtering & search",
    viewLogs: "View Logs",
```

- [ ] **Step 4: 运行单项测试验证 i18n 断言通过**

Run: `npx jest tests/discoverSystemLogs.test.ts -t "i18n should include systemLogs"`
Expected: PASS

- [ ] **Step 5: 提交 Task 1 改动**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/discoverSystemLogs.test.ts
git commit -m "feat(i18n): add systemLogs translations to Discover Hub"
```

---

### Task 2: 重构 `DiscoverHubView.tsx` 为 4 矩阵工具展厅与微信 2x2 分组

**Files:**
- Modify: `frontend/src/components/DiscoverHubView.tsx`

**Interfaces:**
- Consumes: `useTranslation()`, `onSelectTool: (tool: DiscoverToolId) => void`
- Produces: 
  - `export type DiscoverToolId = 'terminal' | 'systemLogs' | 'playground' | 'translate'`
  - 移动端 2 组 x 2 项：
    - 分组 1（系统运维）：在线终端 + 运行日志
    - 分组 2（开发协同）：API 调试器 + 翻译工作台
  - 桌面端 4 列响应式卡片网格

- [ ] **Step 1: 更新 `DiscoverHubView.tsx`**

```tsx
import React from 'react';
import {
  Terminal,
  FileText,
  Play,
  Languages,
  ChevronRight,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export type DiscoverToolId = 'terminal' | 'systemLogs' | 'playground' | 'translate';

export interface DiscoverHubViewProps {
  adminKey: string;
  onSelectTool: (tool: DiscoverToolId) => void;
}

export const DiscoverHubView: React.FC<DiscoverHubViewProps> = ({ onSelectTool }) => {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* 1. Mobile WeChat Style Discover Page (2x2 Balanced Groups)                 */}
      {/* ========================================================================= */}
      <div className="md:hidden space-y-3.5 pt-1">
        {/* Category 1: System & Operations (Terminal + System Logs) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {/* Item 1: Web Terminal */}
          <button
            type="button"
            onClick={() => onSelectTool('terminal')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-emerald-500/20 group-active:scale-95 transition-transform">
                <Terminal className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.terminalTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.terminalDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>

          {/* Item 2: System Logs */}
          <button
            type="button"
            onClick={() => onSelectTool('systemLogs')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-blue-500/20 group-active:scale-95 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.systemLogsTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.systemLogsDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Category 2: Developer Tools (Playground + Translate) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {/* Item 3: API Playground */}
          <button
            type="button"
            onClick={() => onSelectTool('playground')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-orange-500/20 group-active:scale-95 transition-transform">
                <Play className="w-5 h-5 ml-0.5 fill-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.playgroundTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.playgroundDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>

          {/* Item 4: Translate Studio */}
          <button
            type="button"
            onClick={() => onSelectTool('translate')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-indigo-500/20 group-active:scale-95 transition-transform">
                <Languages className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.translateTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.translateDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. Desktop APM Discover Hub 4-Column Grid                                */}
      {/* ========================================================================= */}
      <div className="hidden md:block space-y-6">
        {/* Hub Header */}
        <div className="flex flex-col space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
              {t('discover.title')}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {t('discover.subtitle')}
          </p>
        </div>

        {/* Tools 4-Column Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Web Terminal */}
          <div
            onClick={() => onSelectTool('terminal')}
            className="ui-card p-5 flex flex-col justify-between hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                  <Terminal className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                  SYSTEM
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-emerald-400 transition-colors">
                {t('discover.terminalTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.terminalDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-emerald-500 dark:text-emerald-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 2: System Logs */}
          <div
            onClick={() => onSelectTool('systemLogs')}
            className="ui-card p-5 flex flex-col justify-between hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                  SSE STREAM
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-blue-400 transition-colors">
                {t('discover.systemLogsTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.systemLogsDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-blue-500 dark:text-blue-400">
              <span>{t('discover.viewLogs', '查看日志')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 3: API Playground */}
          <div
            onClick={() => onSelectTool('playground')}
            className="ui-card p-5 flex flex-col justify-between hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 ml-0.5 fill-white" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 font-medium">
                  REST & STREAM
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-orange-400 transition-colors">
                {t('discover.playgroundTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.playgroundDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-orange-500 dark:text-orange-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 4: Translate Studio */}
          <div
            onClick={() => onSelectTool('translate')}
            className="ui-card p-5 flex flex-col justify-between hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                  <Languages className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium">
                  BILINGUAL
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors">
                {t('discover.translateTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.translateDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-indigo-500 dark:text-indigo-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoverHubView;
```

- [ ] **Step 2: 运行测试检查 `DiscoverHubView` 断言**

Run: `npx jest tests/discoverSystemLogs.test.ts -t "DiscoverHubView"`
Expected: PASS

- [ ] **Step 3: 提交 Task 2 改动**

```bash
git add frontend/src/components/DiscoverHubView.tsx
git commit -m "feat(discover): expand DiscoverHubView to 4 tools with systemLogs matrix"
```

---

### Task 3: 更新 `App.tsx` 路由分发与简化终端组件

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`

**Interfaces:**
- Consumes: `TerminalLogsView`, `DiscoverToolId`
- Produces: 
  - `discoverSubView === 'systemLogs'` 渲染 `<TerminalLogsView adminKey={adminKey} />`
  - 面包屑与顶栏展示 `t('discover.systemLogsTitle')`
  - `UnifiedTerminalView` 简化为纯粹交互式终端包装器

- [ ] **Step 1: 在 `App.tsx` 中引入 `TerminalLogsView` 并配置子视图分发**

1. 引入组件：
   ```typescript
   import TerminalLogsView from './components/TerminalLogsView';
   ```
2. 更新面包屑标题：
   ```tsx
   {discoverSubView === 'terminal' && t('discover.terminalTitle')}
   {discoverSubView === 'systemLogs' && t('discover.systemLogsTitle')}
   {discoverSubView === 'playground' && t('discover.playgroundTitle')}
   {discoverSubView === 'translate' && t('discover.translateTitle')}
   ```
3. 在主内容区渲染：
   ```tsx
   {discoverSubView === 'systemLogs' && (
     <TerminalLogsView
       key={refreshTrigger}
       adminKey={adminKey}
     />
   )}
   ```

- [ ] **Step 2: 简化 `UnifiedTerminalView.tsx`**

使 `UnifiedTerminalView` 直接渲染 `WebTerminalView`，移除内部原有的 `subTab` 逻辑：
```tsx
import React from 'react';
import WebTerminalView from './WebTerminalView';

export interface UnifiedTerminalViewProps {
  adminKey: string;
  isStandalone?: boolean;
  onEnterStandalone?: () => void;
  onExitStandalone?: () => void;
}

export default function UnifiedTerminalView({
  adminKey,
  isStandalone,
  onEnterStandalone,
  onExitStandalone,
}: UnifiedTerminalViewProps) {
  return (
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 relative">
      <WebTerminalView
        adminKey={adminKey}
        standalone={Boolean(isStandalone)}
        onExitStandalone={onExitStandalone}
        onToggleStandalone={(val) => {
          if (val && onEnterStandalone) {
            onEnterStandalone();
          } else if (!val && onExitStandalone) {
            onExitStandalone();
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: 运行全部 `tests/discoverSystemLogs.test.ts` 测试**

Run: `npx jest tests/discoverSystemLogs.test.ts`
Expected: 3 个测试全部 PASS

- [ ] **Step 4: 提交 Task 3 改动**

```bash
git add frontend/src/App.tsx frontend/src/components/UnifiedTerminalView.tsx
git commit -m "refactor(terminal): route system logs to discover hub and streamline WebTerminalView"
```

---

### Task 4: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (全面回归验证)

- [ ] **Step 1: 运行全量 Jest 测试套件**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test`
Expected: 45+ 个测试套件全部 PASS

- [ ] **Step 2: 运行前端 Vite 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend`
Expected: 0 错误构建成功

- [ ] **Step 3: 运行后端 TypeScript 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend`
Expected: 0 错误构建成功

- [ ] **Step 4: 运行全量生产构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build`
Expected: SUCCESS

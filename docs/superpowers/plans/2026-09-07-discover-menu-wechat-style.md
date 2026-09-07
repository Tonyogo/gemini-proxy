# 发现菜单与仿微信发现页实施计划 (Discover Menu & WeChat Style Discover Hub Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将【终端】、【API 调试器】和【翻译工作台】收纳进全新的顶级菜单【发现 (Discover)】；移动端呈现微信原生风格分组条目列表并在进入工具后支持顶栏“‹ 发现”快速返回；桌面端提供 3 列 APM 级 Discover Hub 工具展厅；彻底解放移动端底部导航空间。

**Architecture:**
- 在 `frontend/src/i18n/locales/` 中补充 `nav.discover` 与 `discover.*` 多语言词条体系。
- 创建 `frontend/src/components/DiscoverHubView.tsx` 组件：自适应渲染桌面端 3 列 APM 展厅卡片与移动端仿微信分组 Cell 条目（墨绿渐变终端、活力橙渐变调试器、紫罗兰渐变翻译器，副标题描述与 Chevron 箭头）。
- 重构 `frontend/src/App.tsx`：
  - 顶级 Tab 收缩为 `dashboard`、`accounts`、`logs`、`discover` (4 个)；
  - 引入 `discoverSubView: 'hub' | 'terminal' | 'playground' | 'translate'` 状态管理；
  - 移动端当处于 `activeTab === 'discover'` 且 `discoverSubView !== 'hub'` 时，顶栏左侧渲染 `‹ 发现` 返回按钮；
  - 桌面端面包屑支持层级展示并点击切回 hub。
- 在 `tests/discoverNavigation.test.ts` 中完成自动化端到端结构与状态流转断言。

**Tech Stack:** React 18, Tailwind CSS, Lucide React (`Compass`, `Terminal`, `Play`, `Languages`, `ChevronRight`, `ChevronLeft`), TypeScript, Jest, Vite.

## Global Constraints

- **4-Tab Navigation**: 导航栏必须严格为 4 个顶级项（`dashboard`, `accounts`, `logs`, `discover`），消除原平铺的 6 按钮拥挤。
- **WeChat Style Mobile Experience**: 移动端发现列表必须具备微信分组卡片质感（精致渐变圆角图标容器、主标题、灰色描述副标、右向灰色微小箭头）。
- **Back Navigation**: 移动端从微信列表进入子工具后，顶栏左侧必须具备 `‹ 发现` 返回按钮，点击立即切回发现列表。
- **Standalone Terminal Compatibility**: 保持原 `#/terminal` 或 `/terminal` 独立全屏终端逻辑 100% 正常工作。
- **Strict TypeScript & Zero Build Errors**: 前端 Vite 与后端 TypeScript 必须 0 报错，全量 Jest 测试套件保持 100% PASS。

---

### Task 1: 补充“发现”多语言词条体系 (i18n) 与测试驱动断言

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Create: `tests/discoverNavigation.test.ts`

**Interfaces:**
- Consumes: `useTranslation`
- Produces: 
  - `nav.discover`
  - `discover.title`, `discover.subtitle`
  - `discover.terminalTitle`, `discover.terminalDesc`
  - `discover.playgroundTitle`, `discover.playgroundDesc`
  - `discover.translateTitle`, `discover.translateDesc`
  - `discover.back`, `discover.launch`, `discover.openWorkbench`
  - `discover.systemCategory`, `discover.devCategory`

- [ ] **Step 1: 编写失败的单元与结构测试 `tests/discoverNavigation.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Discover Navigation & WeChat Style Hub', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const hubComponentPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');

  let appContent: string;

  beforeAll(() => {
    appContent = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf-8') : '';
  });

  test('i18n should include complete discover translations in both zh and en', () => {
    expect(zh.nav.discover).toBe('发现');
    expect(en.nav.discover).toBe('Discover');

    expect(zh.discover).toBeDefined();
    expect(en.discover).toBeDefined();

    expect(zh.discover.title).toBe('发现中心');
    expect(en.discover.title).toBe('Discover Hub');

    expect(zh.discover.terminalTitle).toBe('在线终端');
    expect(zh.discover.playgroundTitle).toBe('API 调试器');
    expect(zh.discover.translateTitle).toBe('翻译工作台');
    expect(zh.discover.back).toBe('发现');

    expect(en.discover.terminalTitle).toBe('Web Terminal');
    expect(en.discover.playgroundTitle).toBe('API Playground');
    expect(en.discover.translateTitle).toBe('Translate Studio');
    expect(en.discover.back).toBe('Discover');
  });

  test('App.tsx should only have 4 top-level nav items and use Compass icon for discover', () => {
    expect(appContent).toContain("id: 'discover'");
    expect(appContent).toContain('Compass');
    // Ensure terminal, playground, translate are not in top-level NAV_ITEMS
    expect(appContent).not.toMatch(/id:\s*'terminal'/);
    expect(appContent).not.toMatch(/id:\s*'playground'/);
    expect(appContent).not.toMatch(/id:\s*'translate'/);
  });

  test('App.tsx should manage discoverSubView state and handle back navigation', () => {
    expect(appContent).toContain('discoverSubView');
    expect(appContent).toContain('setDiscoverSubView');
    expect(appContent).toContain('DiscoverHubView');
  });

  test('DiscoverHubView component file should exist and support wechat mobile style', () => {
    expect(fs.existsSync(hubComponentPath)).toBe(true);
    const hubContent = fs.readFileSync(hubComponentPath, 'utf-8');
    // Must contain gradient icon containers and chevron right
    expect(hubContent).toContain('from-emerald-500 to-teal-600');
    expect(hubContent).toContain('from-orange-500 to-amber-600');
    expect(hubContent).toContain('from-indigo-500 to-purple-600');
    expect(hubContent).toContain('ChevronRight');
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/discoverNavigation.test.ts`
Expected: FAIL (词条未补充、`DiscoverHubView` 尚未创建、`App.tsx` 尚未重构)

- [ ] **Step 3: 更新 `frontend/src/i18n/locales/zh.ts` 与 `en.ts`**

在 `frontend/src/i18n/locales/en.ts` 中：
```typescript
    discover: "Discover",
```
并在 `en` 对象末尾添加：
```typescript
  discover: {
    title: "Discover Hub",
    subtitle: "Explore system diagnostics, API debugging, and translation workbenches",
    terminalTitle: "Web Terminal",
    terminalDesc: "Host environment diagnostics & interactive shell terminal",
    playgroundTitle: "API Playground",
    playgroundDesc: "Raw Claude & Gemini JSON payload & SSE stream debugger",
    translateTitle: "Translate Studio",
    translateDesc: "AI-assisted translation & multi-model prompt workbench",
    back: "Discover",
    launch: "Launch",
    openWorkbench: "Open Workbench",
    systemCategory: "System Tools",
    devCategory: "Developer Tools"
  },
```

在 `frontend/src/i18n/locales/zh.ts` 中：
```typescript
    discover: "发现",
```
并在 `zh` 对象末尾添加：
```typescript
  discover: {
    title: "发现中心",
    subtitle: "探索系统运行、接口调试与语言模型协同工具",
    terminalTitle: "在线终端",
    terminalDesc: "宿主环境诊断与实时指令交互终端",
    playgroundTitle: "API 调试器",
    playgroundDesc: "Claude 与 Gemini 原始报文及流式响应调试器",
    translateTitle: "翻译工作台",
    translateDesc: "AI 辅助智能翻译与多语言对比工作台",
    back: "发现",
    launch: "立即启动",
    openWorkbench: "打开工作台",
    systemCategory: "系统工具",
    devCategory: "开发与测试"
  },
```

- [ ] **Step 4: 重新运行测试验证 i18n 断言通过**

Run: `npx jest tests/discoverNavigation.test.ts -t "i18n should include complete discover translations"`
Expected: PASS

- [ ] **Step 5: 提交 Task 1 改动**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/discoverNavigation.test.ts
git commit -m "feat(i18n): add discover navigation and tool hub translations"
```

---

### Task 2: 创建双端自适应 `DiscoverHubView.tsx` 组件

**Files:**
- Create: `frontend/src/components/DiscoverHubView.tsx`

**Interfaces:**
- Consumes: `useTranslation()`, `adminKey: string`, `onSelectTool: (tool: 'terminal' | 'playground' | 'translate') => void`
- Produces:
  - 移动端（`< md`）：微信原生风格列表（2 个分组卡片，墨绿终端、活力橙调试、靛蓝翻译，副标题与右箭头）。
  - 桌面端（`≥ md`）：3 列 APM 级 Discover Hub 工具展厅网格卡片。

- [ ] **Step 1: 编写 `DiscoverHubView.tsx` 组件**

```tsx
import React from 'react';
import {
  Terminal,
  Play,
  Languages,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Cpu,
  Code2
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export type DiscoverToolId = 'terminal' | 'playground' | 'translate';

export interface DiscoverHubViewProps {
  adminKey: string;
  onSelectTool: (tool: DiscoverToolId) => void;
}

export const DiscoverHubView: React.FC<DiscoverHubViewProps> = ({ onSelectTool }) => {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* 1. Mobile WeChat Style Discover Page (Hidden on desktop md:hidden)        */}
      {/* ========================================================================= */}
      <div className="md:hidden space-y-3.5 pt-1">
        {/* Category 1: System Tools (Web Terminal) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm">
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
        </div>

        {/* Category 2: Developer & Workbench Tools (Playground & Translate) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {/* Item 1: API Playground */}
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

          {/* Item 2: Translate Workbench */}
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
      {/* 2. Desktop APM Discover Hub Grid (Hidden on mobile hidden md:block)       */}
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

        {/* Tools 3-Column Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {t('discover.terminalDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-emerald-500 dark:text-emerald-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 2: API Playground */}
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
                  STREAM & REST
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-orange-400 transition-colors">
                {t('discover.playgroundTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {t('discover.playgroundDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-orange-500 dark:text-orange-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 3: Translate Studio */}
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
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
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

- [ ] **Step 2: 验证组件断言通过**

Run: `npx jest tests/discoverNavigation.test.ts -t "DiscoverHubView component file should exist"`
Expected: PASS

- [ ] **Step 3: 提交 Task 2 改动**

```bash
git add frontend/src/components/DiscoverHubView.tsx
git commit -m "feat(discover): add DiscoverHubView with WeChat mobile style and desktop cards"
```

---

### Task 3: 重构 `App.tsx` 导航结构与子视图流转机制

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `DiscoverHubView`, `Compass`, `ChevronLeft`
- Produces: 
  - `type TabType = 'dashboard' | 'accounts' | 'logs' | 'discover'` (4 项)
  - `type DiscoverSubView = 'hub' | 'terminal' | 'playground' | 'translate'`
  - 顶栏动态渲染：若在移动端处于发现子页面，左上角显示 `‹ 发现` 按钮并点击返回 `discoverSubView = 'hub'`
  - 面包屑支持点击“发现”返回展厅

- [ ] **Step 1: 修改 `App.tsx` 引入图标与组件**

1. 引入 `Compass`, `ChevronLeft` 图标；
2. 引入 `DiscoverHubView, { DiscoverToolId }` 组件；
3. 将 `TabType` 简化为：
   ```typescript
   type TabType = 'dashboard' | 'accounts' | 'logs' | 'discover';
   ```
4. 将 `NAV_ITEMS` 收敛为 4 项：
   ```typescript
   const NAV_ITEMS: NavItem[] = [
     { id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
     { id: 'accounts', icon: Users, shortcut: '⌘2' },
     { id: 'logs', icon: FileText, shortcut: '⌘3' },
     { id: 'discover', icon: Compass, shortcut: '⌘4' },
   ];
   ```
5. `VALID_TABS` 映射为 `['dashboard', 'accounts', 'logs', 'discover']`，处理旧缓存容错（如果从 `terminal`, `playground`, `translate` 进来的自动映射为 `discover` 并打开对应子页面）。

- [ ] **Step 2: 在 `App` 组件中添加 `discoverSubView` 状态与逻辑**

```typescript
const [discoverSubView, setDiscoverSubView] = useState<DiscoverSubView>(() => {
  const rawSaved = localStorage.getItem('admin_active_tab');
  if (rawSaved === 'terminal' || rawSaved === 'playground' || rawSaved === 'translate') {
    return rawSaved as DiscoverSubView;
  }
  return 'hub';
});
```

当点击具体工具时切换：
```typescript
const handleSelectDiscoverTool = (tool: DiscoverToolId) => {
  setDiscoverSubView(tool);
};
```

- [ ] **Step 3: 更新移动端顶栏返回按钮与标题渲染**

在 `header` 的左侧区域：
```tsx
{/* Mobile Brand Logo or Discover Subview Back Button */}
{activeTab === 'discover' && discoverSubView !== 'hub' ? (
  <button
    type="button"
    onClick={() => setDiscoverSubView('hub')}
    className="flex items-center space-x-1 py-1 px-2 -ml-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 font-medium text-xs hover:bg-indigo-500/10 active:scale-95 transition-all md:hidden"
  >
    <ChevronLeft className="w-4 h-4" />
    <span>{t('discover.back')}</span>
  </button>
) : (
  <img
    src="/favicon.svg"
    alt="Gemini Proxy Logo"
    className="w-7 h-7 shrink-0 md:hidden drop-shadow-[0_0_10px_rgba(99,102,241,0.4)] select-none"
  />
)}
```

在面包屑区域：
```tsx
<div className="flex items-center space-x-1.5 sm:space-x-2 text-xs font-medium min-w-0">
  <span className="hidden sm:inline text-slate-500 shrink-0">Gemini Proxy</span>
  <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-slate-600 shrink-0" />
  {activeTab === 'discover' && discoverSubView !== 'hub' ? (
    <>
      <button
        type="button"
        onClick={() => setDiscoverSubView('hub')}
        className="text-slate-400 hover:text-indigo-400 transition-colors hidden sm:inline"
      >
        {t('nav.discover')}
      </button>
      <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-slate-600 shrink-0" />
      <span className="text-[var(--text-primary)] font-semibold truncate max-w-[130px] sm:max-w-none">
        {discoverSubView === 'terminal' && t('discover.terminalTitle')}
        {discoverSubView === 'playground' && t('discover.playgroundTitle')}
        {discoverSubView === 'translate' && t('discover.translateTitle')}
      </span>
    </>
  ) : (
    <span className="text-[var(--text-primary)] font-semibold truncate max-w-[130px] sm:max-w-none">
      {getActiveTabTitle()}
    </span>
  )}
</div>
```

- [ ] **Step 4: 渲染主内容区 `activeTab === 'discover'`**

```tsx
{activeTab === 'discover' && (
  <>
    {discoverSubView === 'hub' && (
      <DiscoverHubView
        adminKey={adminKey}
        onSelectTool={handleSelectDiscoverTool}
      />
    )}
    {discoverSubView === 'terminal' && (
      <UnifiedTerminalView
        key={refreshTrigger}
        adminKey={adminKey}
        onEnterStandalone={handleEnterStandalone}
      />
    )}
    {discoverSubView === 'playground' && (
      <PlaygroundView
        key={refreshTrigger}
        adminKey={adminKey}
      />
    )}
    {discoverSubView === 'translate' && (
      <TranslateView
        key={refreshTrigger}
        adminKey={adminKey}
      />
    )}
  </>
)}
```

并适配 workbench 容器高度判断：
```typescript
const isWorkbenchTab = activeTab === 'logs' || (activeTab === 'discover' && discoverSubView !== 'hub');
```

- [ ] **Step 5: 运行全部 `tests/discoverNavigation.test.ts` 测试**

Run: `npx jest tests/discoverNavigation.test.ts`
Expected: 4 个测试全部 PASS

- [ ] **Step 6: 提交 Task 3 改动**

```bash
git add frontend/src/App.tsx
git commit -m "feat(nav): consolidate tools into 4-tab Discover menu with WeChat style back navigation"
```

---

### Task 4: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [ ] **Step 1: 运行全量 Jest 测试套件**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm test`
Expected: 所有测试套件全部 PASS

- [ ] **Step 2: 运行前端 Vite 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:frontend`
Expected: 0 错误构建成功

- [ ] **Step 3: 运行后端 TypeScript 严格构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build:backend`
Expected: 0 错误构建成功

- [ ] **Step 4: 运行全量生产构建**

Run: `/Users/yogo/.nvm/versions/node/v22.12.0/bin/npm run build`
Expected: SUCCESS

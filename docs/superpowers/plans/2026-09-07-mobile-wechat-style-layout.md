# 移动端仿微信二级详情沉浸式全屏实施计划 (Mobile WeChat-Style Immersive Detail Navigation Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构移动端界面层级与导航结构，实现仿原生微信 APP 的二级详情沉浸体验：列表页维持底部导航栏便于拇指切换，一旦进入【日志详情】或【发现子工具】（终端、调试器、翻译工作台），自动彻底隐藏移动端底部导航栏；将顶栏切换为微信风格沉浸式返回栏（`‹ 日志` / `‹ 发现`），释放约 80px~120px 黄金高度，让详情内容 100% 满屏展示。

**Architecture:**
- 在 `frontend/src/components/LogsView.tsx` 中增加 `mobileDetailOpen` 的外部受控或回调感知（`onMobileDetailChange?: (isOpen: boolean) => void`），并移除内部重复的移动端返回按钮，让二级 Tab 顶格展示。
- 在 `frontend/src/App.tsx` 中建立统一的 `isMobileDetailActive` 沉浸状态：
  - 判定条件：`(activeTab === 'logs' && mobileLogDetailOpen) || (activeTab === 'discover' && discoverSubView !== 'hub')`；
  - 当处于沉浸状态时，隐藏移动端底部 `<nav>`；
  - 动态重构顶栏：左侧渲染微信原生粗体 `ChevronLeft` 搭配上一级名称（`‹ 日志` 或 `‹ 发现`），中间展示详情标题，右侧隐藏冗余的刷新、设置、GitHub 等全局图标；
  - 动态重构 `<main>` 容器内边距：进入沉浸详情时解除 `pb-20` 与 `pb-[calc(3.75rem+...)]` 强制垫高，释放给全屏内容。
- 在 `tests/mobileWeChatNavigation.test.ts` 中编写自动化端到端测试并验证通过。

**Tech Stack:** React 18, Tailwind CSS, Lucide React (`ChevronLeft`), TypeScript, Jest, Vite.

## Global Constraints

- **WeChat-Style Navigation Flow**: 列表页保留底部导航，进入详情后自动隐藏底部导航并由顶栏微信返回键统一接管。
- **Full Screen Utilization**: 移动端详情态下必须清空原本多余的 `pb-20` / `pb-[3.75rem]` 垫高内边距，最大化终端键盘与 Monaco 编辑空间。
- **No Duplicate Controls**: 彻底消除日志详情内部重复的左向箭头返回按键。
- **Strict TypeScript & TDD**: 严格类型安全，前端 Vite 构建 0 错误，全量 Jest 测试套件保持 100% PASS。

---

### Task 1: 在 `LogsView.tsx` 中实现详情状态通知并移除重复返回按键

**Files:**
- Modify: `frontend/src/components/LogsView.tsx`
- Create: `tests/mobileWeChatNavigation.test.ts`

**Interfaces:**
- Consumes: `LogsViewProps` 增加 `onMobileDetailChange?: (isOpen: boolean) => void`, `mobileDetailOpenControlled?: boolean`, `onBackToList?: () => void`
- Produces: 
  - 当打开详情时调用 `onMobileDetailChange(true)`，关闭详情时调用 `onMobileDetailChange(false)`；
  - 移除内部冗余的 `ArrowLeft` 按钮，让 Subtabs 直接顶格。

- [ ] **Step 1: 编写失败的测试 `tests/mobileWeChatNavigation.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Mobile WeChat-Style Immersive Detail Navigation', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');

  let appContent: string;
  let logsViewContent: string;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf-8');
    logsViewContent = fs.readFileSync(logsViewPath, 'utf-8');
  });

  test('LogsView should support onMobileDetailChange callback and eliminate duplicate inner back button', () => {
    expect(logsViewContent).toContain('onMobileDetailChange');
    // Ensure duplicate mobile inner back button with ArrowLeft is removed from detail header
    expect(logsViewContent).not.toMatch(/<button[^>]*setMobileDetailOpen\(false\)[^>]*>\s*<ArrowLeft/);
  });

  test('App.tsx should detect mobile detail immersion and conditionally hide mobile bottom nav', () => {
    expect(appContent).toMatch(/isMobileDetailActive|isMobileImmersive/);
    // Bottom nav must be conditionally rendered based on immersion
    expect(appContent).toMatch(/!isMobileDetailActive\s*&&\s*<nav[^>]*fixed bottom-0/);
  });

  test('App.tsx should render WeChat-style back button in top bar during mobile detail immersion', () => {
    // Top bar should have a back button with ChevronLeft for both logs and discover
    expect(appContent).toContain('ChevronLeft');
    expect(appContent).toContain("t('logs.title'");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/mobileWeChatNavigation.test.ts`
Expected: FAIL (因 `LogsView` 和 `App.tsx` 尚未重构)

- [ ] **Step 3: 更新 `frontend/src/components/LogsView.tsx`**

1. 修改组件入参接口：
   ```typescript
   export interface LogsViewProps {
     adminKey: string;
     onMobileDetailChange?: (isOpen: boolean) => void;
     mobileDetailOpen?: boolean;
     onBackToList?: () => void;
   }
   ```
2. 在内部状态同步：
   ```typescript
   const [internalMobileDetailOpen, setInternalMobileDetailOpen] = useState<boolean>(false);
   const mobileDetailOpen = mobileDetailOpenControlled !== undefined ? mobileDetailOpenControlled : internalMobileDetailOpen;

   const updateMobileDetailOpen = (open: boolean) => {
     setInternalMobileDetailOpen(open);
     if (onMobileDetailChange) {
       onMobileDetailChange(open);
     }
   };
   ```
3. 在 `loadDetail` 中调用 `updateMobileDetailOpen(true)`；
4. 移除 `LogsView.tsx` 约第 707-713 行内部重复的移动端 `<button onClick={() => setMobileDetailOpen(false)} ...><ArrowLeft ... /></button>`；
5. 如果用户点击其他导致退出的操作，调用 `updateMobileDetailOpen(false)`。

- [ ] **Step 4: 运行单项测试检查 `LogsView` 断言**

Run: `npx jest tests/mobileWeChatNavigation.test.ts -t "LogsView should support onMobileDetailChange"`
Expected: PASS

- [ ] **Step 5: 提交 Task 1 改动**

```bash
git add frontend/src/components/LogsView.tsx tests/mobileWeChatNavigation.test.ts
git commit -m "refactor(logs): expose onMobileDetailChange callback and remove redundant inner back button"
```

---

### Task 2: 在 `App.tsx` 中实现仿微信全局沉浸式顶栏与底部导航隐藏

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `mobileLogDetailOpen`, `discoverSubView`, `ChevronLeft`
- Produces: 
  - `isMobileDetailActive = (activeTab === 'logs' && mobileLogDetailOpen) || (activeTab === 'discover' && discoverSubView !== 'hub')`
  - 隐藏移动端底部导航栏：`{!isMobileDetailActive && (<nav ...>)}`
  - 微信顶栏返回按键：点击返回主列表或 hub
  - `<main>` 内边距在沉浸模式下释放为 `pb-0`

- [ ] **Step 1: 在 `App.tsx` 中增加 `mobileLogDetailOpen` 状态与计算属性**

```typescript
const [mobileLogDetailOpen, setMobileLogDetailOpen] = useState<boolean>(false);

// Calculate composite mobile immersive detail state
const isMobileDetailActive =
  (activeTab === 'logs' && mobileLogDetailOpen) ||
  (activeTab === 'discover' && discoverSubView !== 'hub');

const handleMobileBack = () => {
  if (activeTab === 'logs') {
    setMobileLogDetailOpen(false);
  } else if (activeTab === 'discover') {
    setDiscoverSubView('hub');
  }
};
```

- [ ] **Step 2: 重构顶栏 Header 微信沉浸条**

在 `<header>` 中：
1. **左侧返回导航**：
   ```tsx
   {isMobileDetailActive ? (
     <button
       type="button"
       onClick={handleMobileBack}
       className="flex items-center space-x-1 py-1 px-2 -ml-2 rounded-lg text-indigo-600 dark:text-indigo-400 font-medium text-xs hover:bg-indigo-500/10 active:scale-95 transition-all md:hidden"
     >
       <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
       <span>{activeTab === 'logs' ? t('logs.title', '日志') : t('discover.back', '发现')}</span>
     </button>
   ) : (
     <img
       src="/favicon.svg"
       alt="Gemini Proxy Logo"
       className="w-7 h-7 shrink-0 md:hidden drop-shadow-[0_0_10px_rgba(99,102,241,0.4)] select-none"
     />
   )}
   ```
2. **中间标题与面包屑**：
   在移动端沉浸模式下，直接显示当前详情名称（如“请求详情”或具体工具名）。
3. **右侧操作精简**：
   当 `isMobileDetailActive` 为真时，在移动端隐藏 GitHub、刷新、设置、语言等非核心按钮，使顶栏干净舒适。

- [ ] **Step 3: 底部导航栏条件挂载与 `<main>` 内边距优化**

1. 隐藏底部导航栏：
   ```tsx
   {!isMobileDetailActive && (
     <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-xl border-t border-[var(--border-subtle)] px-2 py-1 flex items-center justify-around md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.6)]">
       {NAV_ITEMS.map(...)}
     </nav>
   )}
   ```
2. 动态调整 `<main>` 内边距：
   ```tsx
   <main className={`flex-1 overflow-x-hidden ${
     isMobileDetailActive
       ? 'p-0 md:p-6 pb-0 md:pb-6 flex flex-col min-h-0 h-full overflow-hidden'
       : isWorkbenchTab
         ? 'p-2 sm:p-4 md:p-6 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:pb-6 flex flex-col min-h-0 h-full overflow-hidden'
         : 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6'
   }`}>
   ```
3. 传递 `onMobileDetailChange` 给 `LogsView`：
   ```tsx
   {activeTab === 'logs' && (
     <LogsView
       key={refreshTrigger}
       adminKey={adminKey}
       mobileDetailOpenControlled={mobileLogDetailOpen}
       onMobileDetailChange={setMobileLogDetailOpen}
     />
   )}
   ```

- [ ] **Step 4: 运行全部 `tests/mobileWeChatNavigation.test.ts` 测试**

Run: `npx jest tests/mobileWeChatNavigation.test.ts`
Expected: 3 个测试全部 PASS

- [ ] **Step 5: 提交 Task 2 改动**

```bash
git add frontend/src/App.tsx
git commit -m "feat(mobile): implement WeChat-style immersive detail layout with auto-hidden bottom nav"
```

---

### Task 3: 全量构建与回归测试验证 (Full Verification)

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

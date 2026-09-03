# 终端顶栏与 Tab 切换一体化实现计划 (Terminal Header & Sub-Tab Consolidation Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将终端工作台 (`UnifiedTerminalView`) 外部独立的一级 Tab 切换栏消除，将其深度内嵌融合至 `WebTerminalView` 与 `TerminalLogsView` 顶部的 macOS 窗口栏中，彻底解决标题与 Tab 重复的问题并释放垂直空间。

**Architecture:**
1. 在 `WebTerminalView.tsx` 与 `TerminalLogsView.tsx` 中扩展 `subTab` 与 `onSubTabChange` 属性定义；
2. 在 `WebTerminalView.tsx` 的 macOS 窗口工具栏中，将静态文字标题替换为紧凑型 Tab 胶囊切换器；
3. 在 `TerminalLogsView.tsx` 的窗口工具栏中，做完全对称的 Tab 胶囊嵌入替换；
4. 在 `UnifiedTerminalView.tsx` 中彻底移除外部独立占行的 Tab 操作条，将 `subTab` 与回调透传给两个子视图；
5. 运行 `npm run build` 确保 TypeScript 类型与 Vite 打包 100% 通过。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Vite.

## Global Constraints

- **Zero Layout Shift**: 切换 Tab 时，顶栏的高度（`py-1.5 sm:py-2`）、背景色（`#0C0E14`）、三色圆点与 Tab 胶囊位置绝对对齐，零跳跃。
- **Standalone Compatibility**: 在独立全屏模式（`standalone=true` 或 `/terminal` 路由）下，如未传入 `onSubTabChange`，优雅降级展示常规终端图标与标题。
- **Component Class Standard**: Tab 胶囊统一采用全站 `.ui-tab-container` 与 `.ui-tab-pill-active` 规范。
- **Zero Regression**: 确保 xterm 终端尺寸自动适配（fit）、快捷键、WebSocket 连接、日志 SSE 监听、复制与全屏功能正常工作。

---

### Task 1: 扩展 WebTerminalView 顶栏并内嵌 Tab 切换胶囊

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:30-40, 655-670`

**Interfaces:**
- Consumes: `WebTerminalViewProps`
- Produces: 支持接收 `subTab`、`onSubTabChange` 并在顶栏左侧展示 Tab 胶囊的 `WebTerminalView`。

- [ ] **Step 1: 检查 WebTerminalView 的 Props 接口定义**

在 `frontend/src/components/WebTerminalView.tsx` 开头查看组件 Props：
```tsx
interface WebTerminalViewProps {
  adminKey: string;
  standalone?: boolean;
  onExitStandalone?: () => void;
  onToggleStandalone?: (val: boolean) => void;
}
```

- [ ] **Step 2: 扩展 WebTerminalViewProps 并引入必要图标**

确保引入 `TerminalSquare`, `FileText` 图标：
```tsx
interface WebTerminalViewProps {
  adminKey: string;
  standalone?: boolean;
  onExitStandalone?: () => void;
  onToggleStandalone?: (val: boolean) => void;
  subTab?: 'interactive' | 'logs';
  onSubTabChange?: (tab: 'interactive' | 'logs') => void;
}
```

- [ ] **Step 3: 重构 WebTerminalView 顶栏左侧区域**

将原先的静态标题区域：
```tsx
<div className="flex items-center space-x-1.5 text-slate-200">
  <TerminalIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
  <span className="font-semibold text-slate-200 text-xs hidden sm:inline truncate">
    {t('webTerminal.title')}
  </span>
</div>
```
替换为一体化 Tab 胶囊结构：
```tsx
{onSubTabChange ? (
  <div className="ui-tab-container p-0.5 text-[11px] font-medium shrink-0">
    <button
      type="button"
      onClick={() => onSubTabChange('interactive')}
      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition-all ${
        (subTab || 'interactive') === 'interactive'
          ? 'ui-tab-pill-active font-semibold shadow-sm'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <TerminalSquare className="w-3.5 h-3.5" />
      <span>{t('terminal.interactiveTab')}</span>
    </button>
    <button
      type="button"
      onClick={() => onSubTabChange('logs')}
      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition-all ${
        subTab === 'logs'
          ? 'ui-tab-pill-active font-semibold shadow-sm'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <FileText className="w-3.5 h-3.5" />
      <span>{t('terminal.logsTab')}</span>
    </button>
  </div>
) : (
  <div className="flex items-center space-x-1.5 text-slate-200">
    <TerminalIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
    <span className="font-semibold text-slate-200 text-xs hidden sm:inline truncate">
      {t('webTerminal.title')}
    </span>
  </div>
)}
```

- [ ] **Step 4: 运行前端编译检查**

Run: `cd frontend && npm run build`
Expected: 编译通过。

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(webTerminal): embed unified tab switcher into window top bar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 扩展 TerminalLogsView 顶栏并内嵌 Tab 切换胶囊

**Files:**
- Modify: `frontend/src/components/TerminalLogsView.tsx:25-35, 195-210`

**Interfaces:**
- Consumes: `TerminalLogsViewProps`
- Produces: 支持接收 `subTab`、`onSubTabChange` 并在顶栏左侧展示对齐 Tab 胶囊的 `TerminalLogsView`。

- [ ] **Step 1: 检查 TerminalLogsView 当前 Props 与顶栏结构**

在 `frontend/src/components/TerminalLogsView.tsx`:
```tsx
export default function TerminalLogsView({ adminKey }: { adminKey: string }) {
```
以及第 198 行起的静态标题结构。

- [ ] **Step 2: 扩展 Props 接口并引入 TerminalSquare, FileText**

定义 Props 接口并引入所需图标：
```tsx
export interface TerminalLogsViewProps {
  adminKey: string;
  subTab?: 'interactive' | 'logs';
  onSubTabChange?: (tab: 'interactive' | 'logs') => void;
}

export default function TerminalLogsView({
  adminKey,
  subTab,
  onSubTabChange
}: TerminalLogsViewProps) {
```

- [ ] **Step 3: 重构 TerminalLogsView 顶栏左侧为完全对齐的 Tab 胶囊**

在 `frontend/src/components/TerminalLogsView.tsx` 中，将顶栏背景统一为 `#0C0E14`（与 WebTerminalView 完全一致），内嵌 Tab 胶囊：
```tsx
{onSubTabChange ? (
  <div className="ui-tab-container p-0.5 text-[11px] font-medium shrink-0">
    <button
      type="button"
      onClick={() => onSubTabChange('interactive')}
      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition-all ${
        subTab === 'interactive'
          ? 'ui-tab-pill-active font-semibold shadow-sm'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <TerminalSquare className="w-3.5 h-3.5" />
      <span>{t('terminal.interactiveTab')}</span>
    </button>
    <button
      type="button"
      onClick={() => onSubTabChange('logs')}
      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition-all ${
        (subTab || 'logs') === 'logs'
          ? 'ui-tab-pill-active font-semibold shadow-sm'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <FileText className="w-3.5 h-3.5" />
      <span>{t('terminal.logsTab')}</span>
    </button>
  </div>
) : (
  <div className="flex items-center space-x-1.5 text-slate-200">
    <TerminalSquare className="w-3.5 h-3.5 text-indigo-400" />
    <span className="font-semibold text-slate-200 tracking-wide text-xs">
      {t('terminal.title')}
    </span>
  </div>
)}
```

- [ ] **Step 4: 运行前端编译检查**

Run: `cd frontend && npm run build`
Expected: 编译通过。

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/components/TerminalLogsView.tsx
git commit -m "feat(terminalLogs): embed aligned tab switcher into top bar and standardize styling

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 改造 UnifiedTerminalView 移除独立外部 Tab 栏

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx:45-115`

**Interfaces:**
- Consumes: `UnifiedTerminalViewProps`
- Produces: 纯净单一容器，消除独立行外层 Tab 切换栏，透传状态与回调。

- [ ] **Step 1: 审查 UnifiedTerminalView 原有布局**

在 `frontend/src/components/UnifiedTerminalView.tsx`:
```tsx
  return (
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 space-y-2 sm:space-y-3">
      {/* Sub-tab Navigation Pill Switcher */}
      <div className="flex items-center justify-between px-2 sm:px-0 shrink-0">
        <div className="ui-tab-container">
          ...
        </div>
      </div>
```

- [ ] **Step 2: 移除独立外层顶栏并向子组件透传属性**

重构 `UnifiedTerminalView.tsx` 的 return 结构：
```tsx
  return (
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 relative">
      {/* Keep-Alive Managed Views Container */}
      <div className="w-full flex-1 flex flex-col min-h-0 relative">
        {/* Interactive Web Terminal View */}
        <div className={`w-full flex-1 flex flex-col min-h-0 ${subTab === 'interactive' ? '' : 'hidden'}`}>
          <WebTerminalView
            adminKey={adminKey}
            standalone={false}
            subTab={subTab}
            onSubTabChange={handleSubTabChange}
            onToggleStandalone={(val) => {
              if (val && onEnterStandalone) {
                onEnterStandalone();
              }
            }}
          />
        </div>

        {/* Terminal Logs SSE Stream View */}
        <div className={`w-full flex-1 flex flex-col min-h-0 ${subTab === 'logs' ? '' : 'hidden'}`}>
          <TerminalLogsView
            adminKey={adminKey}
            subTab={subTab}
            onSubTabChange={handleSubTabChange}
          />
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 3: 运行前端编译检查**

Run: `cd frontend && npm run build`
Expected: 编译通过，无任何 TypeScript 报错。

- [ ] **Step 4: 提交代码**

```bash
git add frontend/src/components/UnifiedTerminalView.tsx
git commit -m "feat(terminal): eliminate redundant outer tab row and delegate tab switcher to subviews

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 综合构建验证与全站回归测试

**Files:**
- Test: `tests/claudeTranslator.test.ts`
- Test: `tests/admin.test.ts`

- [ ] **Step 1: 执行全站完整构建**

Run: `npm run build`
Expected: 前端 Vite 与后端 TypeScript 全部编译成功，无任何 warning/error。

- [ ] **Step 2: 运行测试套件验证**

Run: `npm test`
Expected: 所有测试 PASS。

- [ ] **Step 3: 检查工作区状态**

Run: `git status`
Expected: 工作区干净 (clean)。

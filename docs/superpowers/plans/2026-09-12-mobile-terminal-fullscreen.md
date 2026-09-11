# 移动端在线终端直达全屏实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现移动端点击进入在线终端时直接全屏呈现，彻底移除移动端下的非全屏嵌入过渡态，并在全屏顶部保留“返回”按钮，点击一步直接回到发现中心（Discover Hub）。

**Architecture:** 
在 `frontend/src/utils/mobileViewportHelper.ts` 中抽象统一且可靠的移动端设备判定函数 `isMobileScreenOrDevice()`；在 `App.tsx` 中将其接入进入逻辑 `handleSelectDiscoverTool`、退出逻辑 `handleExitStandalone` 以及浏览器历史事件 `popstate` / `hashchange`；在 `UnifiedTerminalView.tsx` 中隐藏移动端冗余的全屏缩放按钮，保证全屏终端沉浸式交互与状态一致性。

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Jest.

## Global Constraints

- 桌面端（屏幕宽度 >= 768px 且非移动 UserAgent）交互行为必须 100% 保持不变（支持嵌入小窗与全屏手动切换）。
- 移动端在线终端必须直达全屏（`isStandalone = true`，CSS 具有 `fixed inset-0 z-50`）。
- 移动端在全屏顶部栏必须隐藏全屏切换按钮（Maximize2/Minimize2），避免切入非全屏态。
- 移动端点击返回（ArrowLeft）必须一步退回到 Discover Hub，清除 `#/terminal` 哈希，不得停留在移动端嵌入态。
- 保持 TypeScript 严格模式无报错，且测试用例全部绿灯通过。

---

### Task 1: 规范化统一移动设备判断辅助方法并在工具层导出

**Files:**
- Modify: `frontend/src/utils/mobileViewportHelper.ts:1-25`
- Test: `tests/mobileViewportHelper.test.ts`

**Interfaces:**
- Produces: `isMobileScreenOrDevice(): boolean`
  - 参数：无（内部防御 SSR `typeof window === 'undefined'`）
  - 返回值：`boolean`（若为移动端环境或屏幕宽度 `< 768px` 返回 `true`）

- [x] **Step 1: 在 `tests/mobileViewportHelper.test.ts` 中编写 `isMobileScreenOrDevice` 判定测试用例**

```typescript
// tests/mobileViewportHelper.test.ts
import { isMobileScreenOrDevice } from '../frontend/src/utils/mobileViewportHelper';

describe('isMobileScreenOrDevice Helper', () => {
  const originalInnerWidth = window.innerWidth;
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
  });

  it('should return true if window.innerWidth < 768', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    expect(isMobileScreenOrDevice()).toBe(true);
  });

  it('should return true if UserAgent matches mobile device even if width is >= 768', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)', configurable: true });
    expect(isMobileScreenOrDevice()).toBe(true);
  });

  it('should return false for desktop browser with large width', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', configurable: true });
    expect(isMobileScreenOrDevice()).toBe(false);
  });
});
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/mobileViewportHelper.test.ts`
Expected: FAIL - "isMobileScreenOrDevice is not a function"

- [x] **Step 3: 在 `frontend/src/utils/mobileViewportHelper.ts` 中实现 `isMobileScreenOrDevice`**

```typescript
/**
 * Detects whether the current client is a mobile device or viewport (< 768px).
 * Safe for server-side evaluation.
 */
export function isMobileScreenOrDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return (
    window.innerWidth < 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
}
```

- [x] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/mobileViewportHelper.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/utils/mobileViewportHelper.ts tests/mobileViewportHelper.test.ts
git commit -m "feat(terminal): add isMobileScreenOrDevice helper function"
```

---

### Task 2: 改造 `App.tsx` 中的移动端终端直达全屏与一步返回逻辑

**Files:**
- Modify: `frontend/src/App.tsx:69-145`
- Modify: `frontend/src/App.tsx:195-205`
- Test: `tests/terminalMobileDirectFullscreen.test.ts`

**Interfaces:**
- Consumes: `isMobileScreenOrDevice` from `frontend/src/utils/mobileViewportHelper`
- Modifies:
  - `handleSelectDiscoverTool(tool)`: 当 `tool === 'terminal'` 且 `isMobileScreenOrDevice()` 时，直接调用 `handleEnterStandalone()`
  - `handleExitStandalone()`: 若当前处于移动端，退出全屏后直接将 `discoverSubView` 重置为 `'hub'`
  - `popstate` / `hashchange`: 当离开 `#/terminal` 时，若为移动端将 `discoverSubView` 同步重置为 `'hub'`

- [x] **Step 1: 编写 `tests/terminalMobileDirectFullscreen.test.ts` 源码逻辑断言测试**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Mobile Direct Fullscreen Routing & Logic', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');
  let appContent: string;
  let unifiedContent: string;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf-8');
    unifiedContent = fs.readFileSync(unifiedPath, 'utf-8');
  });

  it('App.tsx imports isMobileScreenOrDevice from mobileViewportHelper', () => {
    expect(appContent).toContain('isMobileScreenOrDevice');
    expect(appContent).toContain('./utils/mobileViewportHelper');
  });

  it('App.tsx handleSelectDiscoverTool directly enters standalone mode on mobile', () => {
    expect(appContent).toMatch(/handleSelectDiscoverTool\s*=\s*\(tool:\s*DiscoverToolId\)\s*=>\s*\{[\s\S]*?if\s*\(tool\s*===\s*'terminal'\s*&&\s*isMobileScreenOrDevice\(\)\)\s*\{[\s\S]*?handleEnterStandalone\(\);/);
  });

  it('App.tsx handleExitStandalone resets discoverSubView to hub on mobile', () => {
    expect(appContent).toMatch(/handleExitStandalone\s*=\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(isMobileScreenOrDevice\(\)\)\s*\{[\s\S]*?setDiscoverSubView\('hub'\);/);
  });

  it('App.tsx popstate/hashchange listener returns to hub on mobile when leaving terminal', () => {
    expect(appContent).toMatch(/handlePopState[\s\S]*?if\s*\(!isTerm\s*&&\s*isMobileScreenOrDevice\(\)\)\s*\{[\s\S]*?setDiscoverSubView\('hub'\);/);
  });
});
```

- [x] **Step 2: 运行测试验证失败**

Run: `npx jest tests/terminalMobileDirectFullscreen.test.ts`
Expected: FAIL - 匹配项未命中

- [x] **Step 3: 更新 `frontend/src/App.tsx` 中的路由与全屏联动代码**

在 `frontend/src/App.tsx` 引入 `isMobileScreenOrDevice`：
```typescript
import { isMobileScreenOrDevice } from './utils/mobileViewportHelper';
```

更新 `handlePopState`：
```typescript
    const handlePopState = () => {
      const isTerm = isTerminalRoute();
      setIsStandaloneTerminal(isTerm);
      if (isTerm) {
        setActiveTab('discover');
        setDiscoverSubView('terminal');
      } else if (isMobileScreenOrDevice()) {
        setDiscoverSubView('hub');
      }
    };
```

更新 `handleExitStandalone`：
```typescript
  const handleExitStandalone = () => {
    setIsStandaloneTerminal(false);
    if (isMobileScreenOrDevice()) {
      setDiscoverSubView('hub');
    }
    if (window.location.pathname === '/terminal' || window.location.pathname.startsWith('/terminal/')) {
      window.history.pushState(null, '', '/');
    } else if (window.location.hash === '#/terminal' || window.location.hash === '#terminal') {
      window.history.pushState(null, '', window.location.pathname);
    }
  };
```

更新 `handleSelectDiscoverTool`：
```typescript
  const handleSelectDiscoverTool = (tool: DiscoverToolId) => {
    setIsEmbeddedFullscreen(false);
    if (tool === 'terminal' && isMobileScreenOrDevice()) {
      handleEnterStandalone();
      return;
    }
    setDiscoverSubView(tool);
  };
```

- [x] **Step 4: 重新运行测试验证通过**

Run: `npx jest tests/terminalMobileDirectFullscreen.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/App.tsx tests/terminalMobileDirectFullscreen.test.ts
git commit -m "feat(terminal): direct enter fullscreen on mobile and step back to hub"
```

---

### Task 3: 优化 `UnifiedTerminalView.tsx` 顶部操作栏，隐藏移动端多余缩放按钮

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx:376-390`
- Modify: `tests/terminalMobileFullscreenHeader.test.ts`
- Modify: `tests/terminalMobileDirectFullscreen.test.ts`

**Interfaces:**
- Consumes: `isMobile` from `UnifiedTerminalView.tsx`
- Behavior: 当 `isMobile` 为真时，无论是否 `isStandalone`，都不渲染全屏切换按钮（Maximize2 / Minimize2），完全防止在移动端切到非全屏；仅在桌面端 (`!isMobile`) 展示全屏/小窗切换按钮。

- [x] **Step 1: 在 `tests/terminalMobileDirectFullscreen.test.ts` 中增加对顶部栏缩放按钮隐藏的检查**

```typescript
  it('UnifiedTerminalView hides Fullscreen toggle button completely on mobile', () => {
    expect(unifiedContent).toContain('{!isMobile && (');
    expect(unifiedContent).toMatch(/\{!isMobile\s*&&\s*\([\s\S]*?<Maximize2/);
  });
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/terminalMobileDirectFullscreen.test.ts`
Expected: FAIL - `unifiedContent` 尚未包含 `{!isMobile && (` 保护

- [x] **Step 3: 修改 `UnifiedTerminalView.tsx` 中的 Fullscreen Toggle 按钮渲染**

将：
```tsx
          {/* Fullscreen / Standalone Toggle */}
          <button
            type="button"
            onClick={handleFullscreenToggle}
            className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
              isStandalone
                ? 'hidden sm:inline-flex bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06]'
            }`}
            title={isStandalone ? t('webTerminal.exitFullscreen') : t('webTerminal.fullscreen')}
          >
            {isStandalone ? <Minimize2 className="w-3.5 h-3.5 text-indigo-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
```
更新为：
```tsx
          {/* Fullscreen / Standalone Toggle (Desktop only) */}
          {!isMobile && (
            <button
              type="button"
              onClick={handleFullscreenToggle}
              className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
                isStandalone
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06]'
              }`}
              title={isStandalone ? t('webTerminal.exitFullscreen') : t('webTerminal.fullscreen')}
            >
              {isStandalone ? <Minimize2 className="w-3.5 h-3.5 text-indigo-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
```

- [x] **Step 4: 检查并修复相关联的现有测试用例**

在 `tests/terminalMobileFullscreenHeader.test.ts` 中：
现有测试检查了：
`expect(unifiedContent).toContain("isStandalone\n ? 'hidden sm:inline-flex bg-indigo-500/20 text-indigo-300 border-indigo-500/30'");`
将其更新为适配 `!isMobile` 包装规则：
```typescript
  it('verifies UnifiedTerminalView renders Minimize2 button only on desktop when in standalone mode', () => {
    expect(unifiedContent).toContain('!isMobile');
    expect(unifiedContent).toContain('Minimize2');
  });
```

- [x] **Step 5: 运行全量终端相关测试**

Run: `npx jest tests/terminalMobileFullscreenHeader.test.ts tests/terminalMobileDirectFullscreen.test.ts tests/terminalUnifiedLayout.test.ts`
Expected: PASS (全部通过)

- [x] **Step 6: 提交更改**

```bash
git add frontend/src/components/UnifiedTerminalView.tsx tests/terminalMobileFullscreenHeader.test.ts tests/terminalMobileDirectFullscreen.test.ts
git commit -m "fix(terminal): hide fullscreen toggle button on mobile in UnifiedTerminalView"
```

---

### Task 4: 前端整体构建与全套测试验证

**Files:**
- None (Build & verify only)

- [x] **Step 1: 运行前端构建检查**

Run: `npm run build:frontend`
Expected: Vite 编译打包顺利成功，输出到 `dist/frontend`，0 错误

- [x] **Step 2: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: 所有测试文件全部通过通过（如遇特定断点运行可使用 `npx jest --runInBand`）

- [x] **Step 3: 验证 git 状态干净无多余文件**

Run: `git status`
Expected: Working tree clean

---

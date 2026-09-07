# 终端全屏连接复用实施计划 (Terminal Fullscreen Session & Connection Reuse Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除在线终端在全屏与窗口态切换时的反复断开重连问题，实现 100% 复用同一个 WebSocket 实例与终端会话，保持命令执行和输出的连续性。

**Architecture:**
- 在 `frontend/src/components/WebTerminalView.tsx` 中将 `standalone` 从初始化 `xterm` 与 `WebSocket` 的主 Effect 依赖数组中移除，改为专属轻量 `useEffect` 监听并在全屏切换时仅触发 `fitAddon.fit()` 和 PTY `sendResize`。
- 在 `frontend/src/App.tsx` 中移除破坏性的 `if (isStandaloneTerminal) return <WebTerminalView ... />` 条件提前返回，将 `standalone` 状态传入终端组件，利用内部 CSS `fixed inset-0` 升维全屏，保持组件实例存活。
- 在 `tests/terminalFullscreenReuse.test.ts` 中完成自动化断言与回归验证。

**Tech Stack:** React 18, xterm.js, Tailwind CSS, WebSocket, TypeScript, Jest, Vite.

## Global Constraints

- **Zero Connection Drop**: 全屏和退出全屏切换过程 WebSocket readyState 必须保持 `OPEN (1)`，不触发 `ws.close()` 或新连接建立。
- **PTY Auto Resize**: 全屏切换后必须自动重新计算终端行列数并发送 `resize` 帧，确保终端显示比例正确。
- **Strict TypeScript & TDD**: 严格类型安全，前端 Vite 构建 0 错误，全量 Jest 测试套件 100% PASS。

---

### Task 1: 编写测试驱动断言与 `WebTerminalView.tsx` 生命周期解耦

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Create: `tests/terminalFullscreenReuse.test.ts`

**Interfaces:**
- Consumes: `standalone?: boolean`, `onExitStandalone?: () => void`, `sendResize: (cols: number, rows: number) => void`
- Produces: 
  - 主 WebSocket/xterm 初始化 Effect 不再依赖 `standalone`；
  - 增加独立的 `standalone` 监听 Effect 触发 `fitAddon.fit()` 与 `sendResize`。

- [ ] **Step 1: 编写失败的测试 `tests/terminalFullscreenReuse.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Fullscreen Connection Reuse & Lifecycle', () => {
  const terminalViewPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');

  let terminalContent: string;
  let appContent: string;

  beforeAll(() => {
    terminalContent = fs.readFileSync(terminalViewPath, 'utf-8');
    appContent = fs.readFileSync(appPath, 'utf-8');
  });

  test('WebTerminalView main init effect should NOT depend on standalone', () => {
    // The main useEffect that creates Terminal and WebSocket must not have standalone in dependency array
    expect(terminalContent).not.toMatch(/\},\s*\[[^\]]*\bstandalone\b[^\]]*sendResize[^\]]*\]\);/);
  });

  test('WebTerminalView should have dedicated standalone effect for fit and sendResize', () => {
    expect(terminalContent).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?fitAddonRef\.current[\s\S]*?sendResize[\s\S]*?\}\s*,\s*\[\s*standalone/);
  });

  test('App.tsx should NOT unmount terminal on standalone toggle via early return', () => {
    // Should eliminate early return `if (isStandaloneTerminal) return ...`
    expect(appContent).not.toMatch(/if\s*\(\s*isStandaloneTerminal\s*\)\s*\{\s*return\s*\(\s*<div[^>]*>\s*<WebTerminalView/);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx jest tests/terminalFullscreenReuse.test.ts`
Expected: FAIL (因为 `WebTerminalView.tsx` 依赖仍含 `standalone`，且 `App.tsx` 仍有提前 return)

- [ ] **Step 3: 更新 `frontend/src/components/WebTerminalView.tsx`**

1. 将第 756 行主 Effect 的依赖项：
   ```typescript
   }, [sendResize, clearReconnectTimers, adminKey]);
   ```
   （彻底移除 `standalone`）
2. 在下方增加专属全屏尺寸自适应 Effect：
   ```typescript
   // Re-fit and send resize when standalone mode toggles without disconnecting WS
   useEffect(() => {
     const timer = setTimeout(() => {
       if (fitAddonRef.current && xtermRef.current) {
         fitAddonRef.current.fit();
         sendResize(xtermRef.current.cols, xtermRef.current.rows);
         if (xtermRef.current.buffer.active.type !== 'alternate') {
           xtermRef.current.scrollToBottom();
         }
       }
     }, 60);
     return () => clearTimeout(timer);
   }, [standalone, sendResize]);
   ```

- [ ] **Step 4: 运行单项测试检查 `WebTerminalView` 相关断言**

Run: `npx jest tests/terminalFullscreenReuse.test.ts -t "WebTerminalView"`
Expected: 2 个测试 PASS

- [ ] **Step 5: 提交 Task 1 改动**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalFullscreenReuse.test.ts
git commit -m "fix(terminal): decouple standalone mode from WebSocket init effect"
```

---

### Task 2: 在 `App.tsx` 中消除破坏性条件渲染并保持终端单例挂载

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`

**Interfaces:**
- Consumes: `isStandaloneTerminal: boolean`, `handleExitStandalone: () => void`, `handleEnterStandalone: () => void`
- Produces: 统一在主组件树中渲染终端，通过 CSS `fixed inset-0` 满屏覆盖，保持 React 组件实例存活。

- [ ] **Step 1: 移除 `App.tsx` 中的提前条件 return**

删除 `App.tsx` 约 368-379 行：
```tsx
// 删除此段:
if (isStandaloneTerminal) {
  return (
    <div className="fixed inset-0 z-50 w-full h-full bg-[#07090E] overflow-hidden">
      <WebTerminalView
        key={refreshTrigger}
        adminKey={adminKey}
        standalone={true}
        onExitStandalone={handleExitStandalone}
      />
    </div>
  );
}
```

- [ ] **Step 2: 将 `isStandaloneTerminal` 传递给 `UnifiedTerminalView`**

在 `frontend/src/components/UnifiedTerminalView.tsx` 中：
```typescript
export interface UnifiedTerminalViewProps {
  adminKey: string;
  isStandalone?: boolean;
  onEnterStandalone?: () => void;
  onExitStandalone?: () => void;
}
```
并在内部将 `standalone={Boolean(isStandalone)}` 和 `onExitStandalone={onExitStandalone}` 传递给 `<WebTerminalView />`。

在 `App.tsx` 中：
```tsx
{discoverSubView === 'terminal' && (
  <UnifiedTerminalView
    key={refreshTrigger}
    adminKey={adminKey}
    isStandalone={isStandaloneTerminal}
    onEnterStandalone={handleEnterStandalone}
    onExitStandalone={handleExitStandalone}
  />
)}
```

- [ ] **Step 3: 运行 `tests/terminalFullscreenReuse.test.ts` 全部测试**

Run: `npx jest tests/terminalFullscreenReuse.test.ts`
Expected: 3 个测试全部 PASS

- [ ] **Step 4: 提交 Task 2 改动**

```bash
git add frontend/src/App.tsx frontend/src/components/UnifiedTerminalView.tsx
git commit -m "refactor(app): keep terminal mounted during fullscreen toggle to preserve session"
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

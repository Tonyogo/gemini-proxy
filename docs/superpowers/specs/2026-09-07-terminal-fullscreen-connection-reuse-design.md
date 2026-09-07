# 在线终端全屏切换连接复用设计规范 (Terminal Fullscreen Session & Connection Reuse Design)

**日期**: 2026-09-07  
**分支**: `main`  
**目标**: 优化在线终端在进入全屏模式与退出全屏模式时的生命周期管理，彻底解决因组件重挂载和依赖更新引发的 WebSocket 反复断开与重新连接问题；实现在全屏与窗口态切换时 100% 复用同一个 WebSocket 实例与终端会话，保持命令输出与交互的平滑连续。

---

## 1. 现状痛点与根本原因

1. **`App.tsx` 提前分支渲染导致组件彻底销毁重建**：
   原系统在 `App.tsx` 中写有 `if (isStandaloneTerminal) return <WebTerminalView standalone={true} />`，导致从发现页/终端页点击全屏时，原有的 `UnifiedTerminalView` 与其子 `WebTerminalView` 触发 Unmount（断开 WebSocket、销毁 xterm 实例），新的独立 `WebTerminalView` 重新 Mount 并从头建立连接；退出全屏时同理。
2. **`WebTerminalView.tsx` 初始化 Effect 误将 `standalone` 放入依赖数组**：
   即使在同一组件树内，`useEffect(..., [standalone, ...])` 也会在 `standalone` 改变时执行 Cleanup（`ws.close()`、`term.dispose()`），造成不必要的重连。

---

## 2. 详细设计规范

### 2.1 状态与生命周期解耦 (Lifecycle Decoupling)

1. **从主 Effect 移除 `standalone` 依赖**：
   `WebTerminalView.tsx` 中负责创建 `xterm` 与 `WebSocket` 的核心 `useEffect` 仅依赖 `[sendResize, clearReconnectTimers, adminKey]`，组件生命周期内仅初始化一次。
2. **专属 `standalone` 响应 Hook**：
   ```typescript
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

### 2.2 统一组件树与 CSS 视口升维 (Unified Component Tree & CSS Promotion)

1. **消除 `App.tsx` 的破坏性条件分支**：
   移除 `if (isStandaloneTerminal) return ...`。
2. **全屏样式无缝升维**：
   当 `isStandaloneTerminal === true` 时，`WebTerminalView` 最外层容器动态应用：
   ```tsx
   className={`w-full flex-1 flex flex-col min-h-0 relative select-none ${
     standalone
       ? 'fixed inset-0 z-50 w-screen h-screen bg-[#07090E] overflow-hidden'
       : 'h-full'
   }`}
   ```
3. **切换过程体验**：
   - 用户点击放大/缩小按钮，容器直接满屏展开或收回；
   - WebSocket 毫秒级保持畅通，正在运行的交互程序（如 `top`、`vim`、正在打印的日志）完全不中断、不重放，丝滑自适应新分辨率。

---

## 3. 测试与验证策略

1. **自动化断言 (`tests/terminalFullscreenReuse.test.ts`)**：
   - 验证 `WebTerminalView.tsx` 初始化 Hook 的依赖数组不含 `standalone`；
   - 验证 `App.tsx` 不再包含导致组件销毁重建的独立 `return <WebTerminalView standalone={true} />` 分支；
   - 验证 `WebTerminalView.tsx` 具备全屏切换时的专属 `fit` 与 `sendResize` 调度；
2. **全量构建与回归**：
   - `npm run build:frontend` (0 报错)
   - `npm test` (100% 通过)

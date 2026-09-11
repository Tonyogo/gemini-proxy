# 移动端在线终端直达全屏设计规范 (Design Spec)

- **创建日期**: 2026-09-12
- **状态**: Approved (已确认)
- **目标**: 优化移动端在线终端交互体验，在移动端下点击终端直接进入全屏终端界面，无需非全屏嵌入界面，省去多次切换。

---

## 1. 背景与目标 (Background & Motivation)

### 当前现状
- 桌面端：在线终端嵌套在管理控制台主工作区内，并支持通过按钮放大至独立全屏 (`isStandalone = true`)。
- 移动端：用户从“发现 (Discover)”进入“在线终端”时，默认以嵌入式半屏渲染，受制于底栏、顶栏和内边距，必须再手动点击全屏按钮才能获得良好输入体验；退出时又需要两步操作（退出全屏 -> 再点击返回 Discover Hub）。

### 优化目标
- **进入即全屏**：移动端检测到用户选择“在线终端”时，直接进入独立全屏界面 (`isStandalone = true`)，URL 同步至 `#/terminal`。
- **免去过渡态**：移动端不需要也不展示非全屏嵌入式界面。
- **一步返回**：全屏左上角保留返回按钮，点击后直接一步退回到 Discover Hub，不再跌落到非全屏终端。
- **桌面端零影响**：桌面端依然保持现有的“嵌入小窗 + 手动全屏”双重自由切换模式。

---

## 2. 架构与交互流转 (Architecture & Interaction Flow)

### 2.1 状态生命周期控制 (`frontend/src/App.tsx`)

1. **移动端检测判断**:
   ```ts
   const isMobileDevice = () =>
     typeof window !== 'undefined' &&
     (window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
   ```

2. **选择终端入口 (`handleSelectDiscoverTool`)**:
   - 当 `tool === 'terminal'` 时：
     - 若 `isMobileDevice()` 为真：
       - 调用 `handleEnterStandalone()`，设置 `isStandaloneTerminal = true`，并 push 路由哈希 `#/terminal`；
     - 若为桌面端：
       - 保持 `isStandaloneTerminal = false`，仅设置 `discoverSubView = 'terminal'`。

3. **退出终端入口 (`handleExitStandalone`)**:
   - 当用户在全屏状态下点击返回按钮（或移动端退出）时：
     - 若当前为移动端（或由移动端进入）：
       - 直接将 `discoverSubView` 重置为 `'hub'`；
       - 将 `isStandaloneTerminal` 设为 `false`；
       - 清除 `#/terminal` 路由，还原正常控制台路径。
     - 若为桌面端：
       - 仅设置 `isStandaloneTerminal = false`，视图停留在桌面嵌入式终端中。

4. **浏览器原生后退 / 路由监听 (`popstate` / `hashchange`)**:
   - 当监听到用户后退并离开 `#/terminal` 时：
     - 若为移动设备，同步将 `discoverSubView` 设置为 `'hub'`，避免停留在移动端的嵌入半屏视图。

---

## 3. 组件与 UI 细节 (Component & UI Details)

### 3.1 顶部栏精简 (`frontend/src/components/UnifiedTerminalView.tsx`)
- **全屏缩放按钮 (Maximize2 / Minimize2)**:
  - 在移动端（`isMobile` 为真）完全隐藏全屏切换按钮，避免用户在移动端切出不适用的非全屏态；
  - 桌面端正常展示，提供全屏/窗口切换能力。
- **返回按钮 (ArrowLeft)**:
  - 移动端全屏状态下常驻左上角，点击触发 `onExitStandalone`；
  - 移动端文本折叠 (`hidden sm:inline`)，仅显示返回图标，保证与主机选择器、子标签页和谐共存。

### 3.2 移动端软键盘推顶与视口贴合
- 直接继承并无缝衔接现有的 `mobileViewportHelper.ts` 动态计算逻辑。
- 由于移动端初次渲染即为 `isStandalone`，`visualViewport` 监听器直接就绪，规避了动态从非全屏切到全屏时的多次 `xterm.fit()` 重绘抖动。

---

## 4. 边界处理 (Edge Cases)

1. **直链访问 (`/#/terminal`)**:
   - 移动端直接打开链接时初始化 `isStandalone = true`，点击返回同样回退至 Hub。
2. **终端子功能标签切换 (TerminalSubTab)**:
   - 切换“命令行终端”和“文件管理”时，在移动端全屏模式下均满屏显示，返回时统一回退至 Hub。
3. **屏幕旋转与窗口尺寸动态拉伸**:
   - 旋转屏幕时触发已有的 `orientationchange` 逻辑，重新矫正 `visualViewport` 基准高度与终端尺寸，保持全屏状态不中断。

---

## 5. 验证标准 (Verification Criteria)

1. **类型与构建**: `npm run build:frontend` 顺利通过，无 TS 错误与样式告警。
2. **移动端端到端行为**:
   - 移动端从 Discover 点击“在线终端”，视图直接展现 `fixed inset-0 z-50` 全屏外观；
   - 移动端顶部操作栏无全屏缩放按钮，左上角返回按钮功能完好；
   - 点击返回按钮直接退回到 Discover Hub，无中间嵌入式半屏态；
3. **桌面端回归**:
   - 桌面端进入终端仍为嵌入式，全屏缩放按钮功能正常，不受任何负面影响。

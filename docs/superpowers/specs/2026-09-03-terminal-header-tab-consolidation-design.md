# 终端工作台顶栏与 Tab 切换一体化重构设计规范 (Terminal Header & Sub-Tab Consolidation Spec)

**Date:** 2026-09-03  
**Status:** Approved  
**Topic:** 终端页面切换 tab 和下面的终端标题头重复了优化下显示

---

## 1. 目标与背景 (Goals & Background)

- **现状问题**：
  在终端工作台页面（`UnifiedTerminalView`）中，页面顶部已经存在一个全局 SubTab 切换栏：`[ 💻 交互终端 ]` `[ 📄 运行日志 ]`；
  而内层的子组件（`WebTerminalView` 和 `TerminalLogsView`）各自定义了属于自己的 macOS 风格顶栏，并在顶栏左侧重复打印了静态标题（“交互式终端 (WebTerminal)” 与 “终端日志”）。
  这导致：
  1. 视觉结构冗余、重复展示了两次终端类型说明；
  2. 垂直方向浪费了约 40px 的宝贵工作区高度，在小屏/笔记本上减少了终端命令行和日志的可见行数；
  3. 切换 Tab 时产生双层跳跃感。

- **解决目标**：
  移除外层独立占据一行的冗余 Tab 切换条，将 Tab 胶囊组件深度内嵌融合到内层窗口的标题区域，打造类似 VS Code / Warp / iTerm2 的现代原生单层一体化终端顶栏。

---

## 2. 架构设计与状态流 (Architecture & State Flow)

### 2.1 父级容器瘦身 (`frontend/src/components/UnifiedTerminalView.tsx`)
- 移除原本独立渲染在顶部的外层操作行（`<div className="ui-tab-container">...</div>`）。
- 状态保持与管理：
  - `subTab: TerminalSubTab`（`'interactive' | 'logs'`）状态继续由 `UnifiedTerminalView` 统一持久化管理至 `localStorage('terminal_sub_tab')`。
  - 父级将 `subTab`、`onSubTabChange` 回调透传给子视图。
- 容器结构：
  - 外层直接渲染 `div.w-full.flex-1.flex.flex-col.min-h-0.relative`，高度 100% 充满工作台主区域。
  - 通过 `hidden` 类保持两个视图的 Keep-Alive 会话状态。

### 2.2 共享 Tab 胶囊设计 (`TerminalTabSwitcher`)
设计一致、紧凑、轻量的 Tab 切换组件：
- **样式**：基于全站 `.ui-tab-container`，尺寸微调为更精致的 `p-0.5 text-[11px]`。
- **项目**：
  - `[ 💻 交互终端 ]` (`t('terminal.interactiveTab')`)
  - `[ 📄 运行日志 ]` (`t('terminal.logsTab')`)
- **交互动效**：激活状态应用微光高亮与背景，点击非激活项时即时平滑切换。

---

## 3. 子组件顶栏深度一体化改造 (Sub-View Header Integration)

### 3.1 交互终端 (`frontend/src/components/WebTerminalView.tsx`)
- **接收属性扩展**：
  - `subTab?: 'interactive' | 'logs'`
  - `onSubTabChange?: (tab: 'interactive' | 'logs') => void`
- **顶栏布局**：
  - **左侧**：
    1. macOS 三色圆点（红、黄、绿，在 standalone 模式支持红点退出/绿点全屏）；
    2. 内嵌 **Tab 胶囊切换器**（替代原有的静态文字标题 `t('webTerminal.title')`）；
    3. 连接状态徽标：`● 已连接`（绿色呼吸灯）/ `● 连接中` / `● 已断开`。
  - **右侧**：
    - 字号缩放按钮（`-` / `+`）、手动重连、清屏、重置会话、全屏切换。

### 3.2 运行日志 (`frontend/src/components/TerminalLogsView.tsx`)
- **接收属性扩展**：
  - `subTab?: 'interactive' | 'logs'`
  - `onSubTabChange?: (tab: 'interactive' | 'logs') => void`
- **顶栏布局**：
  - **左侧**：
    1. macOS 三色圆点；
    2. 内嵌相同的 **Tab 胶囊切换器**（替代原有的静态文字标题 `t('terminal.title')`）；
    3. 实时监听状态徽标与过滤计数：`● 实时监听 (已过滤条数/总条数)`。
  - **右侧**：
    - 搜索输入框、Log Level 过滤器下拉菜单、自动滚动开关、复制全部日志、清屏、全屏切换。

---

## 4. 视觉对齐与无缝切换体验 (Visual Consistency)

1. **高度完全锁定**：
   - 两个子视图的顶栏固定为相同的垂直高度与 padding（`py-1.5 sm:py-2 px-3 sm:px-4`），背景底色统一为 `#0C0E14`。
2. **位置绝对重合**：
   - 三色圆点与 Tab 胶囊在两个页面切换时完全处于相同的像素坐标，Tab 切换时肉眼看不到任何抖动或跳跃。
3. **空间收益**：
   - 垂直方向释放约 40px 空间，终端行数与日志可见范围显著提升。

---

## 5. 验证标准 (Verification Standards)

1. **交互验证**：
   - 点击 Tab 胶囊的【交互终端】与【运行日志】，页面无闪烁平滑切换，状态与连接不中断。
   - 终端字号调整、清屏、重连功能保持 100% 正常。
   - 日志过滤、实时流接收、滚动与复制功能保持 100% 正常。
2. **响应式验证**：
   - 在移动端（窄屏）上，Tab 胶囊文字紧凑展示，三色圆点与状态徽标不换行或错位。
3. **构建与测试**：
   - 前端 `npm run build` 0 错误，TypeScript 类型检查完全通过。

# 移动端终端顶栏与 Tab 切换布局优化设计方案

## 1. 目标与背景
在移动端屏幕（宽度 320px ~ 412px）下，控制台终端页面（包含 `WebTerminalView` 交互终端与 `TerminalLogsView` 运行日志两个子视图）顶栏元素过多：
- Tab 切换胶囊按钮同时包含图标与冗长中文/英文文本（如「交互终端 / Web Terminal」、「运行日志 / Terminal Logs」）；
- 连接状态 Badge 带有较长的状态文字标签；
- 右侧排列有字体缩放（放大/缩小）、重新连接、重置会话、全屏切换等多个操作按钮；
- 导致在移动端宽度下，顶栏 Tab 切换行严重挤压、换行甚至超出屏幕边界。

本方案旨在针对移动端（`< sm`）进行轻量化、响应式收纳，保持桌面端现有体验不变，同时使移动端顶栏在极窄宽度下依然单行舒展、无遮挡。

---

## 2. 详细设计规范

### 2.1 WebTerminalView 顶栏移动端精简
1. **Tab 切换胶囊 (`ui-tab-container`)**：
   - 移动端 (`< sm`)：Tab 按钮文字使用 `<span className="hidden sm:inline">` 隐藏，仅保留 Lucide 图标（`TerminalSquare` 与 `FileText`），外层内边距调整为 `px-2 py-1`，使胶囊宽度从 ~170px 缩减至 ~64px。
   - 桌面端 (`>= sm`)：正常显示图标 + 文本。
2. **连接状态徽标 (Connection Badge)**：
   - 移动端 (`< sm`)：隐藏文本（`已连接 / 连接中 / 已断开`），只保留状态圆点指示灯，减少 ~45px 宽度占用。
   - 状态圆点保留 `title` 属性，点击或长按仍可感知状态。
3. **右侧操作按钮区**：
   - 字体缩放按钮（`ZoomOut` 与 `ZoomIn`）：在移动端添加 `hidden sm:inline-flex` 进行隐藏（移动端通过视口适配，缩放极易误触且使用频率极低）。
   - 保留核心操作：重新连接（`RefreshCw`）、重置会话（`Trash2`）、全屏模式（`Maximize2/Minimize2`）。
   - 按钮尺寸与触摸友好度保持 `p-1.5`，左右两侧总宽度严格控制在 200px 以内。

### 2.2 TerminalLogsView 顶栏移动端对齐
1. **Tab 切换胶囊 (`ui-tab-container`)**：
   - 移动端 (`< sm`) 同样使用 `hidden sm:inline` 隐藏文字，只展示图标，保持与交互终端视觉尺寸 100% 对齐，避免切 Tab 时跳动。
2. **连接状态徽标 (Connection Badge)**：
   - 移动端隐藏 `LIVE / DISCONNECTED` 文本，只保留脉冲状态圆点。
3. **移动端自适应分行**：
   - 移动端采用 flex-col：第一行专心放置「macOS 圆点 + Tab 胶囊 + 状态灯 + 日志计数」，空间充裕绝不溢出；
   - 第二行放置搜索过滤、级别选择与功能按钮。

---

## 3. 影响范围与组件修改
- `frontend/src/components/WebTerminalView.tsx`
  - 修改 Top Window Bar 中的 Tab 切换胶囊文字显示条件 (`hidden sm:inline`)
  - 修改连接状态徽标文本 (`hidden sm:inline`)
  - 为 ZoomOut 和 ZoomIn 按钮添加 `hidden sm:inline-flex`
- `frontend/src/components/TerminalLogsView.tsx`
  - 修改 Top Window Bar 中的 Tab 切换胶囊文字显示条件 (`hidden sm:inline`)
  - 修改连接状态徽标文本 (`hidden sm:inline`)

---

## 4. 验证与测试标准
1. **移动端视口 (320px, 375px, 412px)**：
   - 顶栏 Tab 切换胶囊正常显示两个图标，无文字挤出。
   - 左右两端元素无重叠、无换行断裂。
   - 点击 Tab 能够平滑在交互终端和运行日志间切换，没有顶栏高宽突变。
2. **桌面端视口 (>= 640px)**：
   - Tab 显示「图标 + 完整文字」。
   - Zoom 缩放按钮正常显示且功能有效。
   - 连接状态文本正常显示。
3. **自动化测试构建**：
   - 执行 `npm run build:frontend` 验证编译无报错。
   - 执行 `npm test` 保证既有测试套件 100% 通过。

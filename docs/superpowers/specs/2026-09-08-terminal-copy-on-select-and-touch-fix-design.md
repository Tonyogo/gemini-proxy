# 终端划选即复制与移动端触控拖选修复设计规范

- **状态**: Approved
- **日期**: 2026-09-08
- **模块**: `frontend/src/components/WebTerminalView.tsx`, `frontend/src/index.css`

---

## 1. 背景与核心问题

### 1.1 缺陷现状
1. **桌面端**：
   - 之前添加的划选悬浮气泡和顶栏常驻复制按键在终端界面中显得割裂、突兀，打乱了终端控制栏原本干净统一的排版风格；
   - 用户期望采用专业终端工具（如 Xshell、SecureCRT、iTerm2）的黄金标准——**划选即自动复制（Copy on Select）**，界面保持 100% 极简纯粹。
2. **移动端**：
   - 移动端进入复制模式后，手指若按在**有文字的区域**，只能选中点下的单个字，手指拖动时**完全无法滑动多选**；
   - 只有手指从**没有文字的纯黑背景空白处**开始滑动时，才能拖动多选。

### 1.2 根因定位
- **移动端文本节点默认手势抢占**：
  xterm.js 在渲染终端文本时，将字符输出为 `.xterm-rows > div` 等 DOM 节点。当手指按在字符节点上时，移动端 WebKit/Blink 浏览器默认触发了系统的“文字长按/放大镜/文本拖拽”底层手势，导致浏览器中止了后续的 `touchmove` 像素派发，我们代码中的 `applySelection` 无法持续接收坐标更新。

---

## 2. 重构与修复方案

### 2.1 桌面端：极简 Copy on Select（划选即复制）
1. **彻底移除多余 UI**：
   - 清除所有 `selectionBubblePos` 浮动微气泡 DOM 和相关状态；
   - 清除顶栏常驻的复制按钮，使顶栏恢复原本纯粹的 `[字号/重连/清屏/全屏]` 现代化极简工具条。
2. **静默复制与轻量反馈**：
   - 监听 `mouseup` 事件；
   - 当 `!isMobile` 且 `term.hasSelection()` 为真时，获取选中文字 `term.getSelection()`；
   - 若长度大于 0，调用 `navigator.clipboard.writeText(text)` 自动写入剪贴板，并在底部弹出极轻量的 1 秒微 Toast 提示“已复制到剪贴板”；
   - 单击取消选区时不触发任何复制逻辑。

---

### 2.2 移动端：双重防御彻底解决“文字上无法拖选”缺陷
1. **防御 1：CSS 深度穿透剥夺原生文本手势**：
   - 当 `isSelectMode === true` 时，为终端容器添加 `.terminal-select-mode` 类名；
   - 在 CSS 中针对 `.terminal-select-mode, .terminal-select-mode .xterm, .terminal-select-mode .xterm-screen, .terminal-select-mode .xterm-rows, .terminal-select-mode .xterm-rows *` 施加：
     ```css
     user-select: none !important;
     -webkit-user-select: none !important;
     -webkit-touch-callout: none !important;
     touch-action: none !important;
     ```
   - 彻底关闭系统在字符 DOM 上的放大镜与拖动行为。
2. **防御 2：触控起点（`touchstart`）强制 `preventDefault`**：
   - 手指按下时，在捕获阶段如果处于选择模式且 `e.cancelable` 为 true，立即调用 `e.preventDefault()`；
   - 阻断浏览器将当前手势升级为系统文本选择，确保后续所有的 `touchmove` 事件 100% 完整传导至 `applySelection(startCell, currentCell)`；
   - 无论手指起点是文字内部还是空白区域，都能随手势连续滑动选取多行文本。

---

## 3. 自动化测试与验证

1. **测试断言 (`tests/terminalCopyOnSelectAndTouchFix.test.ts`)**：
   - 验证移除了 `selectionBubblePos` 与顶栏冗余复制按键；
   - 验证 `mouseup` 包含桌面端自动剪贴板写入与 Toast 反馈逻辑；
   - 验证包含针对 `.terminal-select-mode` 的深层 `user-select: none !important` 样式规则；
   - 验证 `touchstart` / `touchmove` 在选择模式下严格执行 `preventDefault` 且不中断拖动。
2. **全量构建验证**：
   - 运行 `npm test` 保证所有自动化测试通过；
   - 运行 `npm run build` 保证前后端生产编译无错误。

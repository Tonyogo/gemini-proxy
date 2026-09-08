# 终端统一划选复制模式与移动端触控手势重构设计规范

- **状态**: Approved
- **日期**: 2026-09-08
- **模块**: `frontend/src/components/WebTerminalView.tsx`, `frontend/src/components/terminal/TerminalAccessoryBar.tsx`

---

## 1. 背景与核心问题

### 1.1 问题一：Web 桌面端在 Claude 等全屏会话中无法自由划选复制
- **现象**：在普通命令行界面下划选容易，但在运行 `claude` CLI、`vim`、`htop`、`tmux` 等交互式会话时，无法直接选中文本复制，双击甚至弹出浏览器自带的原生选择框才能勉强复制。
- **根因**：Claude 等交互会话会向终端发送控制码开启“终端鼠标事件捕获（Mouse Tracking Mode，如 DEC 1000/1002/1006）”，xterm.js 将所有鼠标拖动解释为发给 Claude 进程的应用协议数据，直接屏蔽了终端的文本划选。之前的悬浮小气泡也割裂突兀。

### 1.2 问题二：移动端文字区域只能选中单字、无法滑动多选
- **现象**：移动端进入划选模式后，手指若按在**有文字的区域**，只能选中点下的单个字符，后续手指滑动**完全无法拖动多选**；只有从**没有文字的纯黑背景空白处**开始滑动时，才能正常拖选多字多行。
- **根因**：xterm.js 在 DOM 渲染器模式下将每个字符渲染为 `.xterm-rows > div > span`。当手指按下文字时，代码立即调用了 `applySelection(cell, cell)` 触发选区高亮重绘，该位置的字符 DOM 节点瞬间被重绘/替换。移动端 WebKit 浏览器检测到触摸初始目标 DOM 节点在 `touchstart` 期间被突变销毁，底层机制判定触摸目标失效，**彻底丢弃了后续所有的 `touchmove` 像素事件**，导致滑动无法继续。

---

## 2. 核心架构：透明手势捕获层 (Selection Gesture Overlay)

统一在桌面端与移动端使用“划选复制”模式，并在激活时启用一层绝对定位的**透明手势捕获层**：

```
+-----------------------------------------------------------------------------------+
|  顶层 (z-index: 25): 透明手势捕获层 (Selection Gesture Overlay)                   |
|  • 纯净无子节点 DOM: <div className="absolute inset-0 z-25 cursor-crosshair..." />|
|  • 捕获所有 touchstart / touchmove / touchend 以及 mousedown / mousemove / mouseup|
|  • 无论按在什么文字上方，接触的都是这块稳定的手势层，永不发生 DOM 突变丢事件！      |
+-----------------------------------------------------------------------------------+
                                         │ 计算 cell 坐标并派发
                                         ▼
+-----------------------------------------------------------------------------------+
|  底层 (z-index: 10): xterm.js 终端画布与字符渲染层                                 |
|  • 稳定接收并高亮选区，不受任何 DOM 替换手势中断影响                               |
|  • 阻断 Claude 会话等应用的鼠标事件穿透                                           |
+-----------------------------------------------------------------------------------+
```

---

## 3. 详细交互与实现规范

### 3.1 桌面端：极简顶栏模式开关与一键复制
1. **彻底移除旧版本方案**：
   - 彻底移除任何终端内部悬浮小气泡（`selectionBubblePos`）；
   - 移除旧的常驻复制按钮。
2. **顶栏快捷开关**：
   - 在桌面端顶部工具栏（全屏按钮左侧）增加轻量紧凑的 `[ ✏️ 划选 ]` 图标按钮；
   - 未开启时为半透明按钮；点击开启后呈高亮激活态（`bg-amber-500/20 text-amber-400 border-amber-500/30`）；
   - 激活时，手势捕获层覆盖终端区域，鼠标光标变为十字瞄准线（`cursor-crosshair`）；
   - 用户使用鼠标在终端上任意拖拽选区（无论是常规 Shell 还是 Claude 会话），松开鼠标瞬间：
     1. 提取选中文本并写入剪贴板（`navigator.clipboard.writeText`）；
     2. 底部弹出轻量 Toast `已复制到剪贴板`；
     3. 自动退出划选模式，恢复正常的键盘与 Claude 鼠标交互。

### 3.2 移动端：双端手势层与全区域自由拖选
1. **触控流生命周期彻底稳定**：
   - 在选择模式（`isSelectMode = true`）下，手势捕获层挂载并监听 `onTouchStart`、`onTouchMove`、`onTouchEnd`；
   - 手势捕获层自身是一个空 `div`，不包含任何文本节点，即使底层 xterm 频繁重绘高亮字符，手势层的 DOM 始终 100% 稳定，WebKit 浏览器的 `touchmove` **100% 完整派发无丢帧**；
   - 无论手指落在密集字符上还是空白黑底上，滑动瞬间连续触发 `applySelection(startCell, currentCell)`。
2. **单行精致胶囊工具栏维持**：
   - 保持顶部单行极简胶囊（`[ ✏️ ] [ ⬚ 全选 ] [ 📋 复制 N字 ] [ ✓ 完成 ]`），严格单行绝不换行；
   - 底部 `TerminalAccessoryBar` 的划选按钮与复制按钮天然保持联动。

### 3.3 选区坐标引擎规范化 (Order-Safe Coordinate Engine)
- 彻底解决反向划选（从下往上、从右往左）时的坐标颠倒或单字卡死：
  ```typescript
  const startOrder = start.bufferRow * term.cols + start.col;
  const currentOrder = current.bufferRow * term.cols + current.col;
  const isReversed = startOrder > currentOrder;

  const from = isReversed ? current : start;
  const to = isReversed ? start : current;

  // 正确更新内部 SelectionModel: selectionStart 必须先于 selectionEnd
  selectionService._model.selectionStart = [from.col, from.bufferRow];
  selectionService._model.selectionEnd = [to.col + 1, to.bufferRow];
  ```

---

## 4. 自动化测试与验证标准

1. **测试断言 (`tests/terminalSelectionOverlay.test.ts`)**：
   - 验证移除了所有悬浮微气泡 DOM 和旧顶栏常驻复制按键；
   - 验证顶栏包含 `handleToggleSelectMode` 划选开关按钮；
   - 验证渲染了具有 `absolute inset-0` 的透明手势捕获层（`Selection Gesture Overlay`）；
   - 验证逆向拖拽坐标规范化逻辑，确保 `from` 坐标小于等于 `to` 坐标；
   - 验证复制成功后清空状态并平滑关闭手势层。
2. **构建验证**：
   - 运行 `npm test` 保证全量测试套件通过；
   - 运行 `npm run build:frontend` 保证 Vite 生产编译零错误。

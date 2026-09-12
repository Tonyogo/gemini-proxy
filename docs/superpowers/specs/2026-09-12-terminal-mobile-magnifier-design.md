# 移动端终端划选放大镜设计规范 (Design Spec)

- **创建日期**: 2026-09-12
- **状态**: Approved (已确认)
- **目标**: 彻底解决移动端在进入划选复制模式（`isSelectMode`）时，由于手指触摸遮挡导致无法看清当前选中文本的问题，引入 iOS 原生风格的指尖悬浮放大镜气泡（Magnifier Bubble）。

---

## 1. 背景与核心痛点 (Background & Pain Point)

### 现状问题
- 用户在移动端点击“选择模式”并在屏幕上拖拽手指划选字符时，手指接触面积往往覆盖了 2~3 个字符高度和宽度，导致用户无法精确知道当前选中的起始和终止文字，需要反复挪动手指盲猜。

### 优化目标
- **指尖上方悬浮放大镜**：在手指触摸拖动的瞬间，于指尖上方约 60px 处实时跟随显示一个高质感暗色磨砂玻璃气泡。
- **字符高亮预览**：放大镜内以等宽字体放大呈现当前聚焦字符及其前后上下文，当前字符用高亮色块标记。
- **防遮挡智能翻转**：手指滑到屏幕顶部边缘时，气泡自动向下翻转，防止被顶栏遮挡。
- **抬手即隐，穿透无感**：放大镜气泡设置 `pointer-events-none`，不拦截手势；手指抬起即刻消失。
- **仅移动端触摸生效**：桌面端鼠标划选不受干扰。

---

## 2. 架构设计与数据流 (Architecture & Data Flow)

### 2.1 状态模型 (`frontend/src/components/WebTerminalView.tsx`)
```typescript
interface TerminalMagnifierState {
  visible: boolean;
  x: number; // 气泡居中水平位置
  y: number; // 气泡垂直位置
  textBefore: string; // 前置上下文字符
  focusChar: string;  // 指尖当前选中的焦点字符
  textAfter: string;  // 后置上下文字符
  isFlippedBelow: boolean; // 是否处于指尖下方翻转态
}
```

### 2.2 字符提取与坐标计算算法
1. **字符提取**：
   - 根据触点坐标计算网格 `(col, bufferRow)`；
   - 读取行内容：`term.buffer.active.getLine(bufferRow)`；
   - 提取 `focusChar = line.getCell(col)?.getChars() || ' '`；
   - 截取前后各 6~8 个字符形成完整预览词片段。
2. **位置计算与边缘保护**：
   - 默认偏置：`top = clientY - 60px`，`left = clientX`；
   - 若 `clientY < 95px`，触发翻转：`top = clientY + 45px`，`isFlippedBelow = true`；
   - 水平安全边距约束：`clampedLeft = Math.max(90, Math.min(window.innerWidth - 90, left))`。

### 2.3 手势生命周期联动
- `handleOverlayTouchStart`: 计算初始位置并设置 `visible = true`。
- `handleOverlayTouchMove`: 实时动态更新 `(x, y)` 与文本切片。
- `handleOverlayTouchEnd` / `handleOverlayTouchCancel`: 立即将 `visible` 置为 `false`。
- 退出划选模式 (`handleExitSelectMode`) 时，强制清空并隐藏放大镜。

---

## 3. UI 视觉表现 (Visual Design)

- **气泡容器**：
  ```tsx
  <div
    style={{ left: `${magnifier.x}px`, top: `${magnifier.y}px` }}
    className="fixed -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none select-none flex flex-col items-center animate-in fade-in zoom-in-95 duration-100"
  >
    {/* 翻转倒三角指针 (朝上) */}
    {magnifier.isFlippedBelow && (
      <div className="w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-indigo-500/60 mb-[-1px]" />
    )}

    {/* 气泡主体 */}
    <div className="px-2.5 py-1 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 border border-indigo-500/40 shadow-2xl backdrop-blur-xl flex items-center font-mono text-xs sm:text-sm font-semibold tracking-wide whitespace-pre text-slate-400 ring-1 ring-white/10">
      <span>{magnifier.textBefore}</span>
      <span className="bg-indigo-600 text-white px-1 py-0.5 rounded shadow-sm scale-110 mx-0.5">
        {magnifier.focusChar === ' ' ? '␣' : magnifier.focusChar}
      </span>
      <span>{magnifier.textAfter}</span>
    </div>

    {/* 标准倒三角指针 (朝下) */}
    {!magnifier.isFlippedBelow && (
      <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-indigo-500/60 mt-[-1px]" />
    )}
  </div>
  ```

---

## 4. 边界处理 (Edge Cases)

1. **终端行首与行尾空白**：
   - 焦点落在空白字符处时，用半角空格或 `'␣'` 占位，宽度保持一致，气泡不产生位移抖动。
2. **多字节中文与 Emoji**：
   - 提取时按字形字符读取（xterm 的 `cell.getChars()` 自动返回完整多字节字形），保证中文无乱码。
3. **滑过顶栏与底栏边界**：
   - 水平左右硬限位保护，垂直方向根据到顶距离自动翻转上下方向，绝不超出视口。

---

## 5. 验证标准 (Verification Criteria)

1. **单元测试**:
   - `tests/terminalMobileMagnifier.test.ts` 覆盖计算函数、翻转逻辑与生命周期管理。
2. **构建与现有套件**:
   - `npm run build:frontend` 0 错误编译通过。
   - `npm test` 全量 104+ 套件全部绿灯通过。

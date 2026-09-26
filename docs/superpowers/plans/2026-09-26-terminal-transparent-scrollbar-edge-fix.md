# 移动端终端边缘文字遮挡与滚动条透明化方案实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决移动端进入 Web 终端时最边上（尤其是右侧最后一列及物理屏幕边缘）文字被垂直滚动条或容器边界遮挡的问题，通过终端专属滚动条透明化与移动端安全边距优化，保障文本完整清晰展示。

**Architecture:** 
1. 在全局样式 `frontend/src/index.css` 中为 `.xterm-viewport` 定制高优先级透明滚动条规则，清除全局 `6px` 滚动条滑块的视觉覆盖，同时完整保留手势触摸滚动与鼠标滚轮原生滚动行为。
2. 在 `frontend/src/components/WebTerminalView.tsx` 中优化终端 Canvas 容器外边距，融入 `env(safe-area-inset-*)` 硬件安全区与微缓冲，杜绝高 DPR 屏幕下特殊宽字符/粗体字的亚像素裁切。
3. 添加针对终端滚动条透明化样式与移动端边距的自动化断言测试，运行全量测试验证。

**Tech Stack:** React 18, CSS3 / Tailwind CSS, xterm.js (`@xterm/xterm`, `@xterm/addon-fit`), Jest, TypeScript.

---

## 1. 目标与背景 (Goal Description)

### 问题复盘
用户在移动端使用终端时，反馈最边上的文字存在遮挡现象：
1. **全局滚动条样式侵入覆盖**：在 `frontend/src/index.css` 中配置了全局 `::-webkit-scrollbar { width: 6px; }` 及 `::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); }`。由于 xterm 的 `.xterm-viewport` 默认带有 `overflow-y: scroll;` 且层级盖在绘制字符的 `.xterm-screen` 之上，导致这条 6px 宽的半透明灰色滑块直接覆盖在终端最右侧字符上方，在移动端字号下正好遮挡半个至一个字符。
2. **高分屏亚像素与裁切**：外层容器设有 `overflow: hidden`，在 Retina 屏幕上字符宽度带小数，粗体字或特殊符号略微右倾时，贴边字符易被容器硬裁剪。
3. **物理屏幕圆角侵占**：在某些大圆角屏、曲面屏或全屏（Standalone）模式下，未对齐安全区（Safe Area Insets）导致最边缘字符落在物理圆角阴影区。

### 本次方案达成效果
- 终端滚动条全面透明化/不可见化，右侧最后一列文字 100% 露白无遮挡。
- 触摸滑动、双指拖拽与鼠标滚轮滚动体验完全不变。
- 引入硬件安全区及边缘抗裁切微缓冲。

---

## 2. 用户审核重点 (User Review Required)

> [!NOTE]
> - **滚动功能完全不受影响**：滚动条透明化只是将其视觉呈现（宽度、背景与滑块）设为隐藏与透明，底层的 `overflow-y: scroll` 容器依然保留，移动端手指滑动翻页、触控回滚、PC 滚轮及快捷键（PageUp/PageDown）依然 100% 原生可用。
> - **仅作用于交互终端**：透明滚动条规则精确定位在 `.xterm-viewport`，不会影响日志视图、侧边栏或系统设置中正常的滚动条展示。

---

## 3. 待讨论或澄清问题 (Open Questions)

- **Q1: 是否需要在桌面端也保持透明滚动条？**
  - **建议**：直接对 `.xterm .xterm-viewport` 统一生效。终端应用（如 VS Code、Ghostty、Warp、iTerm2）的现代设计规范通常都是无多余滚动条遮挡字符网格，采用平滑自然滚动，既简洁又杜绝任何字符被盖住。

---

## 4. 拟定代码改动 (Proposed Changes)

### Component: Frontend Styles (`frontend/src/index.css`)

#### [MODIFY] `frontend/src/index.css`
- 为 `.xterm .xterm-viewport` 增加覆盖全局规则的透明与隐藏滚动条样式：
  ```css
  /* Terminal Viewport: Transparent & Invisible Scrollbar to prevent text obstruction */
  .xterm .xterm-viewport {
    scrollbar-width: none !important; /* Firefox */
    -ms-overflow-style: none !important; /* IE / Edge */
  }

  .xterm .xterm-viewport::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    background: transparent !important;
  }

  .xterm .xterm-viewport::-webkit-scrollbar-thumb {
    background: transparent !important;
  }

  .xterm .xterm-viewport::-webkit-scrollbar-track {
    background: transparent !important;
  }
  ```

---

### Component: Terminal View Component (`frontend/src/components/WebTerminalView.tsx`)

#### [MODIFY] `frontend/src/components/WebTerminalView.tsx`
- 优化 Canvas 容器的外边距配置与安全区边距：
  - 在第 2075 行的父容器：
    ```tsx
    // 原代码:
    className={`flex-1 p-2 bg-[var(--bg-canvas)] overflow-hidden min-h-0 relative ...`}

    // 改为安全区适配与自适应水平内边距:
    className={`flex-1 py-1.5 sm:py-2 pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] bg-[var(--bg-canvas)] overflow-hidden min-h-0 relative ...`}
    ```
- 确保 `safeFit` 在滚动条宽度归零后，测量出的 `cols` 和 `rows` 紧密填满物理安全区，不再留出多余伪滚动条占位。

---

### Component: Automated Tests (`tests/terminalMobileResizeStability.test.ts`)

#### [MODIFY] `tests/terminalMobileResizeStability.test.ts`
- 增加终端视口透明滚动条规则与安全区样式类的断言测试，确保后续构建与样式优化不会回滚该特性。

---

## 5. 验证计划 (Verification Plan)

### 自动化测试 (Automated Tests)
1. 运行终端视口与移动端布局测试：
   ```bash
   npm test tests/terminalMobileResizeStability.test.ts
   npm test tests/terminalMobileLayout.test.ts
   ```
2. 运行整体测试套件：
   ```bash
   npm test
   ```

### 手动验证 (Manual Verification)
1. 在移动端（或 Chrome 开发者工具手机模拟器 iPhone 14 / Pixel 7）打开终端控制台：
   - 观察终端最右侧字符：执行 `ls -la` 或输出长字符串直至屏幕右边缘，确认最右侧字符没有被半透明滚动条滑块压住或遮挡。
   - 上下滑动屏幕：确认触控手势滚动依然灵敏流畅，无白条或滑块闪烁遮盖。
   - 切换横屏/全屏模式：确认左右物理安全区留白正常，文字无被圆角硬件遮挡。

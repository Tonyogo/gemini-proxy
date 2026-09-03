# 工作台页面全视口与全宽度自适应设计规范 (Workbench Viewport & Full-Width Responsiveness Spec)

**Date:** 2026-09-03  
**Status:** Approved  
**Topic:** 请求日志 (LogsView) 与翻译工作台 (TranslateView) 像 API 调试器 (PlaygroundView) 一样自动适配屏幕大小

---

## 1. 目标与背景 (Goals & Background)

在管理后台中，**API 调试器 (Playground)**、**请求日志 (Logs)** 和**翻译工作台 (Translate)** 是系统中最核心的三个高频沉浸式生产力工具。
- **现状问题**：
  1. `LogsView` 和 `PlaygroundView` 被硬编码限制在 `max-w-7xl`（约 1280px）居中，在 2K、4K、超宽屏等大显示器上两边产生大面积黑色留白，工作区左右双栏非常局促；
  2. `TranslateView` 采用了整屏包围式的顶栏结构（`h-[calc(100vh-3.5rem)]`），放在已有全局 padding 的 `<main>` 容器中显得突兀且产生高度错位和双重滚动条；
  3. `LogsView` 中 Monaco Editor 的高度固定写死（`height="620px"`），无法随视口高度自适应；
  4. 三个工作台在视口高度单位（`vh` vs `dvh`）、外层容器 padding 处理上未形成统一规范。
- **解决目标**：
  将三个工作台统一收敛为「全视口、满宽度（`w-full`）、双栏/多栏内部独立滚动、无外层浏览器纵向滚动条」的沉浸式专业 Workbench 体系。

---

## 2. 架构设计与全局视口规范 (Architecture & Viewport Standards)

### 2.1 主应用容器适配 (`frontend/src/App.tsx`)

- **工作台识别**：
  定义工作台视图集合：
  ```tsx
  const WORKBENCH_TABS: TabType[] = ['playground', 'logs', 'translate'];
  ```
- **`<main>` 视口高度与滚动规范**：
  - 桌面端顶栏高度为 `h-14`（3.5rem），外边距规范采用 `p-4 md:p-6`（上下各 1.5rem，共 3rem）。
  - 对工作台视图（Playground, Logs, Translate）：
    - 桌面端（`md:` 以上）：外层容器 `overflow-hidden`，高度固定占满剩余视口 `md:h-[calc(100dvh-6.5rem)]`（使用 `dvh` 兼顾浏览器动态栏高度），绝不触发主视口滚动条。
    - 移动端：保持平滑上下滑动，预留底部导航安全距离 `pb-20 md:pb-6`。

---

## 3. 请求日志 (`LogsView`) 自适应改造

### 3.1 容器与宽度调整
- 移除外层 `max-w-7xl mx-auto`，变更为 `w-full flex-1 flex flex-col md:flex-row gap-4 items-stretch h-full min-h-[600px] md:min-h-0`。

### 3.2 左侧请求主列表自适应阶梯
- 宽度调整为响应式阶梯：`w-full md:w-80 lg:w-[360px] xl:w-[380px] shrink-0`。
- 保证时间戳、HTTP Method、路径标签、模型名在宽屏上有更充裕的空间，减少溢出截断。
- 列表项区域保持 `flex-1 overflow-y-auto`，分页器固定在底部。

### 3.3 右侧详情审查面板 (`Detail Inspector`)
- 容器为 `flex-1 min-w-0 ui-card p-3 sm:p-4 flex flex-col h-full overflow-hidden`。
- 面板内容容器设为 `flex-1 min-h-0 overflow-y-auto`。
- **Raw JSON Monaco Editor 弹性撑满**：
  - 移除固定 `height="620px"`。
  - 容器设为 `flex-1 min-h-[420px] rounded-xl overflow-hidden`，编辑器组件配置 `height="100%"`，随屏幕伸缩自适应。
- **对话视图 (`ConversationView`)**：
  - 调整居中最大宽度为 `max-w-5xl mx-auto w-full`，在大屏下阅读体验更加舒展。

---

## 4. 翻译工作台 (`TranslateView`) 重构对齐

### 4.1 独立控制卡片 (`ui-card`) 顶栏
- 移除与外层 padding 冲突的假全屏顶栏，重构为独立的悬浮控制卡片：
  `<div className="ui-card p-3.5 flex flex-wrap items-center justify-between gap-3 relative z-30 shrink-0">`。
- **左侧语言与风格控制**：
  - 语言选择器（源语言、互换键、目标语言）使用 `.ui-card-sub`。
  - 风格预设选择器采用全站微光圆角规范。
- **右侧模式与操作**：
  - 单模型/对比模式切换采用全站 `.ui-tab-container` 与 `.ui-tab-pill`。
  - 模型下拉菜单和快捷翻译按键采用 `.ui-btn-primary` 与全站样式统一。

### 4.2 左右工作区弹性自适应
- 主工作区容器改为：`grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden`。
- **左侧原文输入区**：
  - 容器为 `.ui-card flex flex-col h-full overflow-hidden`。
  - 顶栏（语言检测、清空、复制、粘贴）和底栏（字符统计、词数统计）吸顶吸底。
  - 输入框 `<textarea>` 设为 `flex-1 min-h-0 resize-none overflow-y-auto`，填满视口。
- **右侧译文结果区**：
  - 单模型模式下结果卡片充满右侧，内容区独立内部平滑滚动。
  - 对比模式下内部根据选中模型数量自适应排布，各卡片保持内部独立滚动。

---

## 5. API 调试器 (`PlaygroundView`) 规范对齐

- 最外层容器将 `max-w-7xl mx-auto` 调整为 `w-full flex-1`。
- 视口高度单位统一为 `md:h-[calc(100dvh-6.5rem)]`。
- 保持现有的左右双列 Monaco Editor 与 Response Inspector（SseStreamPreview / JsonTreeView / Raw）的高性能自适应机制。

---

## 6. 验证与测试规范 (Verification & Testing)

1. **响应式断点测试**：
   - 移动端 (<768px)：上下单列自然流动，Tab 切换正常，无水平横向滚动条。
   - 平板端 (768px - 1024px)：两栏自适应收紧，文字与按键不换行重叠。
   - 桌面标准屏 (1280px - 1920px)：两栏比例和谐，充满视口，无多余大黑边。
   - 超宽屏 / 4K (>1920px)：工作区自然展开，代码与长文本可视范围显著提升。
2. **滚动与高度验证**：
   - 桌面端三大工作台页面下，主应用外层窗口绝不出现双重滚动条。
   - Monaco 编辑器、日志列表、翻译文本区内部平滑滚动正常。
3. **构建与测试**：
   - 运行 `npm run build:frontend` 确保 TypeScript 类型与 Vite 打包 0 错误。
   - 运行 `npm test` 确保无测试回归。

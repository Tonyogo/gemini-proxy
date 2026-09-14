# 移动端模型映射配置页面布局与按钮优化设计规范

**日期**: 2026-09-14  
**模块**: `frontend/src/components/ConfigModal.tsx`  
**类型**: UI/UX 优化 (移动端紧凑化与按钮交互整合)

---

## 1. 背景与现状问题

在 `ConfigModal.tsx` 中的“模型映射” Tab 页面下，移动端（屏幕宽度 `< 640px`）当前单条配置项卡片排版较为松散：
1. **序号单独占行**：`#{index + 1}` 单独位于首行左上方，占用了垂直高度。
2. **两行输入框**：源模型输入框和重定向目标输入框各占一行。
3. **底部操作栏单独占行**：策略下拉框、HIGH 开关按钮、删除按钮被放置在卡片底部的一条分割线下方，整整占用了一行。

**结果**：移动端单条配置项高度过大（约 180px~200px）。如果用户配置了多条模型映射，移动端首屏仅能显示 1~2 条，需要频繁上下滚动，体验不佳且浪费屏幕空间。

---

## 2. 目标与设计原则

1. **大幅削减移动端卡片高度**：单条卡片高度缩减约 30%~35%，使移动端一屏能浏览更多映射规则。
2. **整合操作栏至卡片顶栏**：将 `#序号` 与右侧操作按钮组（策略下拉、HIGH 切换、删除）融合为卡片头部单行，去除底部冗余分割线。
3. **保持桌面端现有体验不变**：在桌面端（`sm:` 及以上断点），依然保持现有一行流式排列（序号、源、箭头、目标、操作组）。
4. **提升长文本输入与交互体验**：移动端维持双行全宽输入框，避免因单行左右强行并排导致长模型名（如 `gemini-2.5-flash-preview`）或多目标角标（`×2`）出现严重截断或挤压。

---

## 3. 详细 UI/UX 架构与布局

### 3.1 移动端布局架构（`< sm`）

单条映射卡片内分为三层纵向结构：

```text
┌────────────────────────────────────────────────────────┐
│ [#1]                       [策略选择 ▾] [⚡HIGH] [🗑]   │  <- 顶栏：序号与操作栏合一 (h-7/28px)
├────────────────────────────────────────────────────────┤
│ 源模型                                                 │
│ [claude-3-5-sonnet                                   ] │  <- 第 1 行输入
├────────────────────────────────────────────────────────┤
│ 重定向至                                               │
│ [gemini-2.5-pro                                      ] │  <- 第 2 行输入 (支持 ×N 角标)
└────────────────────────────────────────────────────────┘
```

### 3.2 桌面端布局架构（`sm:` 及以上）

完全沿用现有的 flex 单行紧凑结构：
`[#1] [源模型输入框] → [目标模型输入框] [策略选择] [HIGH] [删除]`

---

## 4. 控件规格与样式设计

### 4.1 顶栏（Header Row）
- **容器属性**：
  - 移动端：`flex items-center justify-between gap-2`
  - 桌面端：融入主行 `sm:flex sm:items-center sm:gap-1.5`
- **序号 Badge**：
  - 样式：`text-[10px] font-mono font-bold text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]`
- **操作按钮组**：
  - 容器：`flex items-center gap-1.5 shrink-0`
  - **策略下拉（Strategy Select）**：
    - 尺寸：移动端 `h-7 w-[90px] text-[10px] p-1`，桌面端 `sm:h-8 sm:w-[94px] sm:text-[11px] sm:p-1.5`。
    - 样式：`ui-input appearance-none cursor-pointer`。
  - **HIGH 切换按钮（⚡ HIGH）**：
    - 尺寸：移动端 `h-7 px-2 text-[9px]`，桌面端 `sm:h-8 sm:px-1.5 sm:text-[10px]`。
    - 交互：`active:scale-95`。
    - 高亮态：`bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]`。
    - 默认态：`ui-btn-secondary`。
  - **删除按钮（Trash）**：
    - 尺寸：移动端 `h-7 w-7 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 active:scale-95`，桌面端 `sm:h-8 sm:w-8`。

### 4.2 输入框区域（Input Fields）
- **源模型与目标模型**：
  - 移动端堆叠布局：`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-1.5 flex-1 min-w-0`。
  - 标签（Label）：移动端显示 `text-[10px] text-slate-400 block sm:hidden font-semibold`，桌面端隐藏。
  - 边框与间距：去除卡片内底部的额外分割线（移除 `pt-1.5 sm:pt-0 border-t border-white/[0.04]`）。

### 4.3 卡片外框（Card Wrapper）
- 内边距：`p-2.5 sm:p-2 rounded-xl`。
- 多目标（Multi-target）高亮：
  - 若目标包含逗号分隔多模型，保留左侧强调边框：`border border-amber-500/40 border-l-4 border-l-amber-500 bg-amber-500/[0.04]`。

---

## 5. 改动范围与文件清单

- **主要改动文件**：
  - `frontend/src/components/ConfigModal.tsx`（重构 Tab 4 中的卡片 JSX 排版与 Tailwind 类名）
- **国际化与后端影响**：
  - 纯前端样式与排版优化，无需后端接口或数据结构变更。
  - 维持现有 i18n key (`config.strategy*`, `config.highToggleTooltip`, `config.sourceModelShort`, 等)。

---

## 6. 测试与验证要点

1. **移动端分辨率验证**：
   - 在 375px（iPhone SE）与 390px（iPhone 14/15）视口下，卡片高度是否显著降低。
   - 策略下拉框、HIGH 按钮、删除按钮是否在顶栏整齐对齐，无错位或换行。
   - 目标输入框中多目标角标（如 `×2`）在长文字输入时是否依然正确浮动展示。
2. **桌面端响应式兼容性验证**：
   - 在 `sm`（`>= 640px`）宽度下，卡片是否平滑切换回单行流式排版，各元素高度与间距保持一致。
3. **功能交互验证**：
   - 策略切换、HIGH 切换（加减 `-high` 后缀）、删除映射、添加映射功能均正常工作，保存成功后配置生效。

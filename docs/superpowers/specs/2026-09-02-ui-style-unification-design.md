# 全站页面 UI 风格统一 (Design System & Harmonization) 设计文档

## 1. 概述 (Overview)

为了彻底解决目前控制台不同页面（控制台概览 Dashboard、账号管理 Accounts、请求日志 Logs、终端 Terminal、API 调试器 Playground、系统配置 ConfigModal）之间存在的背景底色不一、边框粗糙度差异（混用 `border-slate-800` 与 `border-white/[0.08]`）、Tab 胶囊与按钮样式割裂的问题，建立一套现代极简暗黑微光风（Linear / Vercel 体系）的设计系统规范，并在全局抽取标准 UI 类名进行全站收敛。

---

## 2. 设计规范与 Design Tokens (Design System Tokens)

### 2.1 颜色与表面 (Colors & Surfaces)
- **Canvas（全站画布底色）**：`#090A0F`
- **Surface 1（主容器 / 卡片 / 侧边栏）**：`#0C0E14` (`bg-[#0C0E14]/90 backdrop-blur-md`)
- **Surface 2（内嵌卡片 / 下拉底座 / 输入框）**：`#10121A` (`bg-[#10121A]/80`)
- **Surface Hover（悬浮态）**：`hover:bg-white/[0.04]` ~ `hover:bg-white/[0.08]`

### 2.2 边框体系 (Borders)
- **标准微光边框**：`border-white/[0.08]`（淘汰粗糙的 `border-slate-800` / `border-slate-700`）
- **次级弱化边框**：`border-white/[0.05]`
- **聚焦 / 激活边框**：`border-indigo-500/60` 或 `border-purple-500/60`

### 2.3 圆角层级 (Border Radii)
- **主页面外壳 / 模态弹窗**：`rounded-2xl` (16px)
- **内层卡片 / 表格行 / 子面板**：`rounded-xl` (12px)
- **按钮 / 胶囊 Tab / 输入框**：`rounded-lg` (8px) 或 `rounded-xl` (10px)
- **角标 Badge / 状态指示点**：`rounded-md` (6px) / `rounded-full`

### 2.4 光影与阴影 (Glows & Shadows)
- **立体悬浮阴影**：`shadow-[0_4px_24px_rgba(0,0,0,0.6)]`
- **品牌渐变与微光**：`shadow-[0_0_15px_rgba(99,102,241,0.25)]`

---

## 3. 全局组件类抽离 (`frontend/src/index.css`)

在 `@layer components` 中沉淀标准类：
```css
/* 主卡片面板 */
.ui-card {
  @apply bg-[#0C0E14]/90 border border-white/[0.08] rounded-2xl shadow-2xl backdrop-blur-md;
}

/* 内嵌子卡片 */
.ui-card-sub {
  @apply bg-[#10121A]/80 border border-white/[0.06] rounded-xl shadow-sm;
}

/* 胶囊 Tab 切换容器与按键 */
.ui-tab-container {
  @apply flex items-center p-1 bg-[#10121A] rounded-xl border border-white/[0.08] shadow-sm;
}
.ui-tab-pill {
  @apply px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-slate-400 hover:text-slate-200 hover:bg-white/[0.04];
}
.ui-tab-pill-active {
  @apply bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)];
}

/* 统一按钮系统 */
.ui-btn-primary {
  @apply bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-medium text-xs shadow-[0_0_15px_rgba(99,102,241,0.25)] transition-all active:scale-[0.98];
}
.ui-btn-secondary {
  @apply bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all active:scale-[0.98];
}

/* 统一输入框 */
.ui-input {
  @apply bg-[#10121A] border border-white/[0.08] hover:border-white/[0.15] focus:border-indigo-500/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 font-mono transition-all;
}
```

---

## 4. 逐页面收敛改造清单 (View-by-View Harmonization)

1. **`DashboardView.tsx` & 子组件 (`ModelPerformanceMatrix.tsx`, `SystemRuntimeMatrix.tsx`)**：
   - 统一顶栏时间范围 Tab 胶囊为 `.ui-tab-container`。
   - 统一各性能指标卡片、图表容器的底色为 `#0C0E14`，描边为 `border-white/[0.08]`。
2. **`AccountsView.tsx`**：
   - 顶部统计瓷贴、账号列表表格、导入/导出/删除按钮统一套用规范。
3. **`LogsView.tsx`**：
   - 左侧主日志侧边栏、顶部 `Payload/Response/Chat` 切换、状态过滤按钮、cURL 复制按钮全面收敛。
4. **`PlaygroundView.tsx`**：
   - 左右两栏 Monaco 编辑器外壳、预设选择下拉框、并发压测入口统一。
5. **`UnifiedTerminalView.tsx` & `WebTerminalView.tsx`**：
   - 确保子 Tab 切换器与终端外壳尺寸与全局无缝契合。
6. **`ConfigModal.tsx`**：
   - 统一模态背景遮罩、左侧设置分类 Tab、表单卡片及底部操作按钮。

---

## 5. 验证与回归测试 (Verification Plan)

1. **构建与类型验证**：执行 `npm run build:frontend`，确保无 TypeScript / CSS 编译错误。
2. **全页面巡检**：
   - 在控制台依次切换 5 个主 Tab（Dashboard, Accounts, Logs, Terminal, Playground）以及设置弹窗；
   - 验证视觉风格、边框微光、圆角层次完全统一、无断层感。
3. **全套自动化测试**：运行 `npm test` 保证业务逻辑与接口测试 100% 通过。

# Gemini Proxy Admin Web Console - UI/UX 视觉与体验重构设计规范 (Linear SaaS 级)

## 1. 概述与设计愿景 (Design Vision)
- **目标定位**：将现有 Web 调试与管理控制台重塑为现代、专业、极度精致的开发者工具级 SaaS 产品（对标 Linear / Raycast / Supabase）。
- **核心原则**：
  1. **零业务破坏**：100% 保持所有现有的 REST/SSE API、路由、多语言国际化 i18n 键、数据字段结构和业务逻辑完全不变。
  2. **高密度与高可读性**：采用深邃炭黑底色、1px 极细微透明边框（Subtle Borders）、低饱和度半透明材质（Glassmorphism）与高穿透力的电光紫蓝强调色（Indigo/Violet）。
  3. **专业工程质感**：代码与数值全量等宽排版（Font Mono），交互元素具备细腻的呼吸光晕与微动效，提升操作沉浸感。

---

## 2. 设计系统规范 (Design Tokens & Styles)

### 2.1 色彩系统 (Color Palette)
- **画布与背景表面 (Surfaces)**：
  - `Surface-0 (Canvas)`: `#090A0F` (极深炭黑底板)
  - `Surface-1 (Containers/Sidebar)`: `#0F1118` (卡片/侧边栏容器)
  - `Surface-2 (Interactive/Table)`: `#151824` (表格行、面板、悬停交互层)
  - `Surface-3 (Inputs/Active)`: `#1D2132` (输入框底色、已激活项底色)
- **边框与光感 (Borders & Glows)**：
  - 常规边框：`border border-white/[0.08]` 或 `border-slate-800/80`
  - 微弱高光边框：`border-white/[0.15]`
  - 聚焦与激活呼吸光：`ring-1 ring-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]`
- **语义高光色 (Accent & Semantics)**：
  - **Primary**: Indigo `#6366F1` / Violet `#8B5CF6` (双色渐变微光)
  - **Success / Activated**: Emerald `#10B981` / Mint `#34D399` (搭配 `bg-emerald-500/10`)
  - **Warning / Retiring**: Amber `#F59E0B`
  - **Danger / Error / 401/403**: Rose `#F43F5E` / Coral `#FB7185`
  - **Info / In-Flight**: Sky `#0EA5E9` / Cyan `#06B6D4`

### 2.2 排版系统 (Typography)
- **字体层级**：
  - 界面文本：`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif`
  - 代码/数字/状态：`"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace`
- **文字明暗层级**：
  - Primary (`text-slate-100` / `#F8FAFC` - 98% 白)
  - Secondary (`text-slate-300` / `#CBD5E1` - 80% 灰白)
  - Muted (`text-slate-400` / `#94A3B8` - 65% 中灰)
  - Sub-Muted / Timestamp (`text-slate-500` / `#64748B` - 50% 深灰)

---

## 3. 架构与组件升级方案 (Component Architecture)

### 3.1 工作区骨架 (`App.tsx` & `index.css`)
- **左侧现代化折叠侧边栏 (Collapsible Sidebar)**：
  - 支持 `240px` (展开) / `64px` (折叠) 切换，集成品牌 Logo、版本徽章、导航 Tab（带图标 + 激活紫光左竖条 + 快捷键标识）。
  - 底部集成健康脉冲指示器、系统设置入口、双语切换（中/英）和退出登录。
- **顶部磨砂玻璃状态栏 (Breadcrumb Header)**：
  - 当前路径面包屑导航、全局并发活跃数小药丸、实时刷新按钮（带加载旋转动效）。
- **登录鉴权屏 (Login View)**：
  - 重塑为精致的深色卡片居中弹窗，带微发光安全锁图标与玻璃拟态输入框。

### 3.2 仪表盘与图表 (`DashboardView.tsx`)
- **KPI 核心指标卡片**：4 宫格微发光卡片，带等宽大字、趋势指示与右上角半透明语义图标。
- **请求吞吐与平均耗时双曲线/面积图**：
  - 细点阵/网格背景、Indigo & Emerald 半透明渐变填充、同步数据十字准星（Crosshair）。
  - 全新 Glassmorphic 悬浮卡片（按模型维度列出请求数、耗时占比、成功/错误比）。
- **系统状态与并发负载矩阵**：
  - 横向分段进度条、状态健康仪表、模型排行榜等宽进度柱。

### 3.3 账号池与状态机管理 (`AccountsView.tsx`)
- **多状态机 Badge 胶囊**：
  - `ACTIVATED` (呼吸绿)、`ACTIVATING/ROTATION` (电光紫)、`INACTIVE/DISABLED` (冷灰)、`SUSPENDED/EXPIRED` (玫瑰红)。
- **现代化数据表格**：
  - 极细分割线、表头大写轻量字、整行悬停升温、底部多选浮动操作栏（Floating Action Bar）。
- **内嵌式终端日志抽屉 (`TerminalLogsView.tsx`)**：
  - macOS 终端风格圆点控制栏、全选复制、自动滚动开关、彩色语法高亮。

### 3.4 网络日志与 SSE 流式回放 (`LogsView.tsx`, `JsonTreeView.tsx`, `SseStreamPreview.tsx`)
- **DevTools Network 风格两栏布局**：
  - 左侧请求列表（带极窄时间筛选、状态码色块、模型 Tag、耗时胶囊）。
  - 右侧详情面板：`Preview` 与 `Raw` 切换。
  - `JsonTreeView`：定制深色配色，支持单键折叠/展开与快速复制。
  - `SseStreamPreview`：LLM EventSource 流式序列时间轴，显示 Chunk 序号、Delta 文本与耗时增量。

### 3.5 API 沙盒与弹窗系统 (`PlaygroundView.tsx`, `ConfigModal.tsx`, `ConcurrentTestModal.tsx`)
- **Playground**：
  - Monaco Editor 深度嵌入深色主题，双栏请求参数与打字机响应流，顶部预设模版快速填充按钮。
- **Modals 弹窗体系**：
  - 统一采用磨砂深色弹窗底板（`backdrop-blur-xl bg-[#0F1118]/95 border border-white/[0.1]`），带平滑缩放进入动画（Scale & Fade-in）。

---

## 4. 实施与验证步骤 (Verification Plan)
1. **样式与底座构建**：更新 `index.css`，注入全局 CSS 变量、滚动条美化与动画关键帧。
2. **工作区骨架升级**：重构 `App.tsx` 侧边栏与头部导航。
3. **页面逐一精细化升级**：
   - 升级 `DashboardView.tsx`（KPI 卡片、SVG 图表、Tooltip）
   - 升级 `AccountsView.tsx` & `TerminalLogsView.tsx`（账号状态机胶囊、表格、日志抽屉）
   - 升级 `LogsView.tsx` & `JsonTreeView.tsx` & `SseStreamPreview.tsx`（DevTools 网络检查器）
   - 升级 `PlaygroundView.tsx` & `ConfigModal.tsx` & `ConcurrentTestModal.tsx`
4. **编译与功能验证**：
   - 运行 `npm run build:frontend` 确保 100% 编译通过且无 TS 类型报错。
   - 运行后端单元测试 `npm test` 确保无任何后端/翻译器逻辑受影响。

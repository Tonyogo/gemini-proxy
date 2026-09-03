# 账号管理视觉降噪与全站浅色字体精细化优化设计方案

## 1. 目标与背景
用户在体验深浅主题后反馈：
1. **账号管理页面（`AccountsView`）颜色过多、杂乱刺眼**：
   - 顶部统计看板充斥绿、蓝、橙、灰、红五彩斑斓的高饱和背景框；
   - 账号表格行滥用深色滤镜底色（如 `bg-emerald-950/20`、`bg-indigo-950/20`、`bg-black/20`），在 Light 模式下呈现为脏污色块；
   - 状态徽标与右侧操作按钮充斥高饱和彩色胶囊，信息层级混乱；
2. **Light 浅色模式字体排版与对比度不够精细**：
   - 标题、数据、描述、辅助信息缺乏清晰的字重与灰阶节奏；
   - 需要建立一套现代、优雅、素雅（Minimal & Refined）的高级企业级视觉体系。

---

## 2. 详细设计规范

### 2.1 账号管理视觉降噪（Low-Saturation & Minimal）

#### 1. 顶部统计指标看板卡片
- **现存问题**：每个卡片使用独立彩色底色（绿、蓝、橙、红、紫），在白底上极其花哨。
- **重构方案**：
  - 卡片底色全部统一为纯净素雅的 `ui-card-sub`；
  - 小图标保留语义点睛色（绿/蓝/橙/红），但取消大面积突兀的有色背景块；
  - 指标数字统一采用高对比度的字体排版：`text-slate-900 dark:text-white font-mono font-bold text-lg`；
  - 标签文字统一为低噪次要文本：`text-slate-500 dark:text-slate-400 text-[10px] font-medium uppercase tracking-wider`。

#### 2. 表格行背景与选中态规范
- **取消深色污浊遮罩**：彻底移除 `bg-emerald-950/20`、`bg-indigo-950/20` 与 `bg-black/20`。
- **当前活跃主账号 (`isCurrent`)**：
  - 浅色模式：`bg-emerald-50/50 dark:bg-emerald-950/20`，左侧边缘添加专属的祖母绿高亮装饰指示边框；
- **选中行 (`isChecked`)**：
  - 浅色模式：`bg-indigo-50/60 dark:bg-indigo-950/25`；
- **禁用行 (`isManuallyDisabled`)**：
  - 采用素雅的半透明弱化 `opacity-60`，不加任何混杂背景色。

#### 3. 状态徽标（Badges）微胶囊化
- 状态标签统一改为精致的微胶囊风格（低透明度底色 + 细腻边框 + 高可读性文字）：
  - **已激活 (Activated)**：`bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20`
  - **激活中 (Activating)**：`bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20`
  - **已下线 (Retired)**：`bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20`
  - **已禁用 / 未激活**：`bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/50`
  - **当前主账号标签 (`currentBadge`)**：采用精美圆角徽标 `bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30`。
- 去除多余的跑马灯阴影光晕（`shadow-[0_0_8px_...]`），恢复极简扁平的高级质感。

#### 4. 表格右侧操作按钮组收敛
- 默认全部统一为中性灰按键体系（`text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08]`）；
- 仅在点击或鼠标 Hover 时才呈现提示性语义微色（如删除 Hover 呈现微红，启用 Hover 呈现微绿），保持平时扫视表格时的宁静与专业。

---

### 2.2 全站浅色字体排版层级精细化

在 `frontend/src/index.css` 与核心组件中建立严格的四级灰阶字体节奏：

| 层级 | 作用场景 | Light 浅色 | Dark 深色 | 推荐字重/字形 |
| :--- | :--- | :--- | :--- | :--- |
| **Level 1: 核心标题/主值** | 页面大标题、卡片关键指标、表格账号主名称 | `text-slate-900` (`#0F172A`) | `text-slate-50` (`#F8FAFC`) | `font-semibold` / `font-bold` |
| **Level 2: 正文/表头/按钮** | 表格表头、表单 Label、菜单文本、操作按键 | `text-slate-700` (`#334155`) | `text-slate-300` (`#CBD5E1`) | `font-medium` |
| **Level 3: 次要描述/说明** | 功能介绍副标题、提示文字、用量副标签 | `text-slate-500` (`#64748B`) | `text-slate-400` (`#94A3B8`) | `font-normal` |
| **Level 4: 辅助元数据** | 时间戳、表格序号、快捷键 kbd、弱化标识 | `text-slate-400` (`#94A3B8`) | `text-slate-500` (`#64748B`) | `font-mono` / `text-[11px]` |

---

## 3. 验证与回归测试
1. **视觉验证**：
   - 切换至 Light 模式，打开账号管理页面，整体视觉呈现出统一的银灰底/纯白卡片，信息清晰明了，没有视觉噪音和脏块；
   - 主账号指示清晰，选中多项时浅蓝提示优雅自然；
   - 切换至 Dark 模式，暗黑高级感依旧完美保留。
2. **测试与构建**：
   - 运行前端单元测试与端到端编译，保证 100% 通过。

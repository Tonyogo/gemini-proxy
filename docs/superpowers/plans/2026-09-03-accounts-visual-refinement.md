# 账号管理视觉降噪与全站浅色字体精细化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 针对用户反馈的“Light 模式下字体仍需精细优化、账号管理页面颜色过多过杂”进行专项视觉升级：将账号管理页面的五彩跑马灯式配色收敛为高级低饱和素雅极简风格，同时建立清晰统一的四级字重与灰阶排版体系。

**Architecture:**
1. **账号管理页面看板与表格降噪**：
   - 顶部统计看板卡片移除大面积红/橙/蓝/绿背景块，统一使用 `ui-card-sub`，只保留精致小巧的状态指示点，大号数字使用高对比度的 `text-slate-900 dark:text-slate-100`。
   - 彻底清除桌面端表格与移动端卡片中的深色滤镜底色（如 `bg-emerald-950/20`、`bg-indigo-950/20`、`bg-black/20`），改为细腻的 `bg-emerald-50/50 dark:bg-emerald-950/20` 和 `bg-indigo-50/60 dark:bg-indigo-950/25`。
   - 收敛状态徽标（Badges）与操作按钮组，默认保持中性灰阶，Hover 时才呈现动作意图。
2. **全局 Light 模式字体与对比度精细化**：
   - 在 `index.css` 完善四级文字阶梯：Level 1（主标题/大数 `text-slate-900`），Level 2（正文/表头 `text-slate-700`），Level 3（说明/标签 `text-slate-500`），Level 4（序号/时间 `text-slate-400`）。
3. **自动化测试与全量回归**：
   - 编写断言测试验证 `AccountsView` 不再包含滥用的高饱和滤镜背景类，并确保全量测试与构建 100% 通过。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest, Vite.

## Global Constraints
- 不破坏账号管理现有的所有功能（选择、禁用、轮换、删除、下载、复制、弹窗）。
- 保留 Dark 模式下的高级暗夜体验，仅去除过饱和的视觉噪音。
- 构建 `npm run build:frontend` 与测试 `npm test` 保持 100% 通过。

---

### Task 1: 重构 AccountsView 顶部统计看板为低饱和素雅风格

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:720-810`

**Interfaces:**
- Consumes: `totalCount`, `activatedCount`, `activatingCount`, `retiredCount`, `inactiveCount`, `disabledCount`
- Produces: 统一低饱和指标看板，数字清晰利落

- [ ] **Step 1: 检查 AccountsView.tsx 顶部卡片**

定位 720-808 行的 6 个统计指标卡片。

- [ ] **Step 2: 改造指标卡片排版与配色**

在 `frontend/src/components/AccountsView.tsx` 中：
1. 卡片外框统一为 `ui-card-sub p-2.5 sm:px-4 sm:py-3 flex items-center space-x-3`；
2. 图标容器使用统一微弱底色与语义点睛色（如：小圆点或微型图标，去除 `p-2` 巨大高饱和背景框）；
3. 标题标签统一为：`<div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">`；
4. 数值统一为：`<div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">`。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 4: 提交 Task 1 代码**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(accounts): tone down stat cards with refined minimal typography"
```

---

### Task 2: 消除 AccountsView 表格与移动端卡片的深色脏斑滤镜，收敛状态徽标与操作按钮

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:630-695, 940-1170, 1180-1280`

**Interfaces:**
- Consumes: `acc: AccountDetail`, `renderStatusBadge`
- Produces: 清爽高对比度的表格行（当前行绿/蓝指示、选中行淡蓝高亮、低噪状态微胶囊、中性操作按钮组）

- [ ] **Step 1: 优化 renderStatusBadge**

修改 630-695 行：
1. 移除 `shadow-[0_0_8px_...]` 跑马灯发光；
2. 浅色模式下文字使用深色（如 `text-emerald-700 dark:text-emerald-400`、`text-amber-700 dark:text-amber-400`、`text-rose-700 dark:text-rose-400`），保证清晰可读。

- [ ] **Step 2: 优化表格行背景与移动端卡片背景**

修改 945-965 行与 1180-1190 行：
1. 将 `isCurrent` 对应的深色滤镜 `bg-emerald-950/20` 替换为：
   `bg-emerald-50/50 dark:bg-emerald-950/20 border-l-2 border-emerald-500`；
2. 将 `isChecked` 对应的 `bg-indigo-950/20` 替换为：
   `bg-indigo-50/60 dark:bg-indigo-950/25`；
3. 将 `isManuallyDisabled` 对应的 `bg-black/20` 替换为简洁优雅的 `opacity-60`。

- [ ] **Step 3: 收敛表格右侧操作按钮组**

修改 1090-1165 行：
1. 操作按钮默认采用中性灰阶：`ui-btn-secondary text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200`；
2. 仅在 Hover 时激活语义指示（Hover 启用呈微绿，Hover 禁用/删除呈微红）。

- [ ] **Step 4: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 5: 提交 Task 2 代码**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(accounts): refine table row highlighting, badge styles, and action button colors"
```

---

### Task 3: 优化全局 index.css 中的浅色文字阶梯与排版细节

**Files:**
- Modify: `frontend/src/index.css:70-85`

**Interfaces:**
- Consumes: `:root:not(.dark)`
- Produces: 更加精细的字重与灰阶节奏，避免简单粗暴将所有文字强行映射为同一种颜色

- [ ] **Step 1: 细化 index.css 中浅色模式下的文字层级**

在 `frontend/src/index.css` 中：
1. 细化 `:root:not(.dark)` 下的灰阶：
   - `.text-slate-100, .text-slate-200` 映射为 `#0F172A`（核心粗标题与重要数值）；
   - `.text-slate-300` 映射为 `#334155`（正文、表头、按钮文本）；
   - `.text-slate-400` 映射为 `#64748B`（次要说明、单位与标签）；
   - `.text-slate-500` 映射为 `#94A3B8`（元数据、时间戳、占位符与序号）；
2. 确保在浅色模式下，层次拉开，主次分明，利落清爽。

- [ ] **Step 2: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 3: 提交 Task 3 代码**

```bash
git add frontend/src/index.css
git commit -m "feat(theme): establish four-level subtle grayscale rhythm for light mode typography"
```

---

### Task 4: 编写视觉无脏斑回归断言测试与全量校验

**Files:**
- Create: `tests/accountsThemeRefinement.test.ts`

**Interfaces:**
- Consumes: `frontend/src/components/AccountsView.tsx`
- Produces: 自动化测试断言，确保深色污斑类名（`emerald-950`, `indigo-950`, `bg-black/20`）彻底绝迹

- [ ] **Step 1: 编写断言测试**

创建 `tests/accountsThemeRefinement.test.ts`：
```ts
import fs from 'fs';
import path from 'path';

describe('AccountsView Theme Refinement Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies dirty dark background filters are removed', () => {
    expect(code).not.toContain('bg-emerald-950/20');
    expect(code).not.toContain('bg-indigo-950/20');
    expect(code).not.toContain('bg-black/20');
  });

  it('verifies clean current account and checked styling are used', () => {
    expect(code).toContain('bg-emerald-50/50');
    expect(code).toContain('bg-indigo-50/60');
  });
});
```

- [ ] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/accountsThemeRefinement.test.ts'
```
Expected: PASS。

- [ ] **Step 3: 运行全量测试与打包构建**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm test && npm run build'
```
Expected: 全部测试通过，构建成功。

- [ ] **Step 4: 提交测试代码**

```bash
git add tests/accountsThemeRefinement.test.ts
git commit -m "test(accounts): add test assertions for visual refinement and clean row styling"
```

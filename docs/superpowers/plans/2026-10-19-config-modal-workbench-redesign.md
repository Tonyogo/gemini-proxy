# 代理运行时系统配置页面 (ConfigModal) 现代化工作台重构计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将系统配置弹窗（`ConfigModal`）重构为现代化的双栏全宽工作台（Linear / Vercel 风格），实现桌面端侧边导航、节点手风琴折叠（Accordion）、表单脏检查变更高亮常驻底栏、以及移动端优雅降级。

**Architecture:**
- **外层容器**：由原来的 `max-w-3xl` 居中弹窗升级为宽幅全景工作台（`max-w-5xl`，视口高度 `h-[92dvh] sm:h-[86vh]`，最大高度 `880px`）。
- **桌面端双栏分工**：左侧 `w-60` 垂直导航边栏（带 Tab 图标、分类名称、动态指标徽章如节点数/规则数、未修改/修改感知圆点），右侧独立平滑滚动的配置内容工作区。
- **移动端自适应**：在 `<640px` 屏幕下自动收缩为抽屉式全屏弹窗，顶部保留横向滑动的 Linear 胶囊 Tab，并自适应触控交互。
- **上游节点手风琴**：支持单节点折叠/展开与全部展开/折叠，折叠态提供极简健康状态与流量占比胶囊。
- **常驻底栏与脏检查**：捕获表单初始快照，检测字段变更（Dirty State）。无修改时显示同步状态与快捷键提示；有修改时高亮警示并激活“放弃修改”与“保存并应用”。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest

**Spec:** `docs/superpowers/specs/2026-10-19-config-modal-workbench-redesign.md`

---

## 检查重点与质量基线 (Review Focus)

1. **类型安全与零回归**：严格遵循 TypeScript 强类型，保持所有 Props、API Payload 格式及后端字段映射完全一致。
2. **主题一致性**：所有配色全面采用系统 CSS 变量（`var(--bg-surface)`、`var(--bg-surface-sub)`、`var(--border-subtle)`、`var(--text-primary)` 等），确保深浅主题完美渲染。
3. **响应式平滑过渡**：测试桌面端（`>= 640px`）双栏与移动端（`< 640px`）单栏的布局切换，无内容遮挡或溢出破损。
4. **键盘快捷键**：全局支持 `⌘+S` / `Ctrl+S` 保存当前配置，`Esc` 键退出弹窗。
5. **完整构建与测试**：Jest 测试覆盖核心逻辑，`npm run build` 和 `npm test` 零错误通过。

---

### Task 1: 扩��中英文语言包 (i18n)

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

- [x] **Step 1: 添加双栏工作台与手风琴所需的新增文案**
  - 在 `config` 命名空间下添加：
    - `expandAll`: "全部展开" / "Expand All"
    - `collapseAll`: "全部折叠" / "Collapse All"
    - `unsavedChanges`: "检测到未保存改动 ({count})" / "Unsaved changes detected ({count})"
    - `configSynced`: "配置已与服务器同步" / "Configuration in sync"
    - `revertChanges`: "放弃修改" / "Discard Changes"
    - `confirmRevert`: "确定要放弃所有未保存的配置修改吗？" / "Are you sure you want to discard all unsaved changes?"
    - `filterMappingsPlaceholder`: "过滤模型规则..." / "Filter model rules..."
    - `shortcutSave`: "⌘+S 保存" / "⌘+S to save"
    - `nodesBadge`: "{count} 节点" / "{count} nodes"
    - `rulesBadge`: "{count} 规则" / "{count} rules"

- [x] **Step 2: 验证中英文对照无缺失**

---

### Task 2: 编写工作台与交互行为单元测试

**Files:**
- Create: `tests/configModalWorkbench.test.ts`

- [x] **Step 1: 编写针对 ConfigModal 结构与脏检查逻辑的测试用例**
  - 验证 `ConfigModal.tsx` 包含双栏架构标记与响应式断点（`max-w-5xl`, `sm:flex-row`, 侧边导航栏容器）。
  - 验证上游节点手风琴折叠展开状态与批量切换逻辑。
  - 验证初始快照比对与 `isDirty` 计算逻辑。
  - 验证 `⌘+S` / `Ctrl+S` 键盘监听处理。

- [x] **Step 2: 执行测试确认失败（TDD）**
  - 运行 `npx jest tests/configModalWorkbench.test.ts`，预期因待改造而未能完全匹配。

---

### Task 3: 重构弹窗外层容器与响应式双栏导航布局

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`

- [x] **Step 1: 扩展容器尺寸与主栅格结构**
  - 将弹窗最大宽度调整为 `max-w-5xl`，高度调整为 `h-[92dvh] sm:h-[86vh]`。
  - 在主卡片内拆分左右结构：
    - 桌面端（`sm:flex`）：左侧 `w-60` 垂直导航条，右侧为带标题说明的配置内容区。
    - 移动端（`<sm`）：顶部保留横向胶囊切换条，保持触屏友好性。
- [x] **Step 2: 侧边导航栏精细化呈现**
  - 为每个 Tab 添加：图标、主标题、轻量小副标题、动态徽章（如上游节点展示活跃数/总数、模型映射展示条数、存在未保存变更时的醒目提示小点）。
  - 底部集成快速状态栏或恢复默认按钮。

---

### Task 4: 实现上游节点手风琴（Accordion）与智能卡片

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`

- [x] **Step 1: 实现节点折叠展开状态管理**
  - 引入 `expandedServers: Record<number, boolean>` 状态。
  - 默认首个节点展开，其余折叠（或通过记忆配置）。
  - 在节点列表上方提供操作栏：展示“全部展开”、“全部折叠”以及现有的“填入官方默认”按钮。
- [x] **Step 2: 优化节点折叠摘要栏 (Collapsed Header)**
  - 紧凑展示：健康状态灯、节点名称、流量占比色块标签、模式徽章（代理模式/直连模式）、启用禁用 Switch 开关、删除按钮与展开指示箭头。
  - 点击卡片头部空白区域可快速展开/折叠。
- [x] **Step 3: 优化展开态表单细节**
  - 调整网关 URL、权重、出口通道切换器、允许模型列表以及直连密钥池（Textarea）的间距与排版，清除原本的生硬深色背景，融入 `--bg-surface` 变量。

---

### Task 5: 脏检查（Dirty Checking）、常驻底栏与快捷键增强

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`

- [x] **Step 1: 建立配置快照与实时比对**
  - 在 `fetchConfig` 加载完成后，保存初始状态对象 `initialConfigRef`。
  - 编写比对工具函数，计算发生变动的字段数量 `dirtyCount` 与布尔值 `isDirty`。
- [x] **Step 2: 重构常驻操作底栏**
  - 底栏常驻于弹窗底部，具备 `backdrop-blur-xl` 与边框分割。
  - **无修改时**：左侧显示绿色就绪状态及 `⌘+S 保存` 提示；右侧保存按钮显示为就绪状态。
  - **有修改时**：底栏高亮，左侧显示琥珀色“存在未保存改动 (N项)”指示，并提供“放弃修改”按钮（点击后恢复初始快照）；右侧“保存应用”按钮呈现高亮主色。
- [x] **Step 3: 键盘快捷键监听**
  - 在弹窗打开时监听键盘事件，当按下 `Cmd+S` / `Ctrl+S` 时阻止默认行为并触发保存；按下 `Esc` 时退出。

---

### Task 6: 模型映射规则搜索过滤与视觉细节微调

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`

- [x] **Step 1: 增加模型映射规则快速过滤搜索框**
  - 当规则条数较多时，支持按源模型或目标模型名称进行实时过滤。
- [x] **Step 2: 统一各 Tab 的标题区设计**
  - 每个 Tab 的顶部增加一致的标题与说明文本，建立清晰的视觉认知。

---

### Task 7: 完整验证与构建检查

- [x] **Step 1: 执行全量测试**
  - 运行 `npx jest tests/configModalWorkbench.test.ts`
  - 运行 `npm test` 保证所有现有测试全部通过。
- [x] **Step 2: 执行前端编译构建**
  - 运行 `npm run build:frontend`，确��� Vite 编译无报错、无类型警告。
- [x] **Step 3: Git 状态确认与提交**
  - 检查变动文件，提交代码。

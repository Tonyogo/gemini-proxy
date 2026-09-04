# 请求日志详情页标题栏重构与元信息单行化实施计划 (Logs View Header Optimization Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化请求日志 (LogsView) 详情页标题栏与操作按钮布局，将全局模式切换与 cURL 专属按钮下放至数据列头并支持左右独立切换（VS Code 风格），同时将第二行元信息栏精简为单行微晶徽章展示。

**Architecture:** 
- 将 `LogsView.tsx` 中单一的 `viewMode` 解耦为左右独立的 `clientViewMode` 与 `upstreamViewMode`。
- 详情页顶栏移除全局 `[Preview | Raw]` 切换组件及 `Claude cURL` / `Gemini cURL` 复制按钮，仅保留 Tab 导航与全局 `[JSON]` 复制。
- 采用 VS Code 编辑器标题栏模式重构 Payload 与 Response 的双列标题头：左侧放置指示灯与标题，右侧集成独立微型 `[预览 | 源码]` 切换胶囊和对应列专属操作（Claude cURL / Gemini cURL / SSE Stream 标识）。
- 重构第二行元信息栏为 28px 高度的单行 `ui-card-sub`，采用紧凑芯片化徽章，去除冗余前缀并保证 `overflow-x-auto whitespace-nowrap` 永不折行。

**Tech Stack:** React 18, Tailwind CSS, TypeScript, Monaco Editor, Jest.

## Global Constraints

- **Independent Column Switching**: 左列（客户端数据）与右列（上游数据）具有独立的视图状态，一侧切源码不影响另一侧。
- **VS Code Header Alignment**: 标题栏左侧标题、右侧操作工具栏，主题完全继承 CSS 变量 (`--bg-surface`, `--bg-surface-sub`, `--border-subtle`)。
- **Single-Line Ribbon**: 元数据栏高度紧凑固定，永不换行撑开高度。
- **Strict TypeScript & TDD**: 严格类型安全，前端后端编译 0 报错，全量 Jest 测试套件通过。

---

### Task 1: 编写标题栏重构与单行元信息栏的测试断言

**Files:**
- Create: `tests/logsViewHeaderOptimization.test.ts`

**Interfaces:**
- Consumes: `frontend/src/components/LogsView.tsx`
- Produces: 静态与组件行为断言，检验顶栏不含全局预览按钮，双列头包含独立预览切换与专属 cURL，元数据栏单行化。

- [x] **Step 1: 编写测试文件 `tests/logsViewHeaderOptimization.test.ts`**
- [x] **Step 2: 运行测试并确认失败**
- [x] **Step 3: 提交初始测试文件**

```bash
git add tests/logsViewHeaderOptimization.test.ts
git commit -m "test(logs): add assertions for header optimization and single-line metadata ribbon"
```

---

### Task 2: 重构 LogsView 详情页顶栏与元信息栏 (Navigation & Metadata Ribbon)

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:50-70,695-920`

**Interfaces:**
- Consumes: `selectedLog`, `adminKey`, `t`
- Produces: 
  - 拆分 `clientViewMode` 与 `upstreamViewMode` 状态
  - 顶栏纯净导航（仅保留 Tab 与 `[JSON]` 按钮）
  - 元信息栏单行化与徽章微晶化

- [x] **Step 1: 在 `LogsView.tsx` 状态声明中替换 `viewMode` 为左右独立状态**
- [x] **Step 2: 重构详情页顶栏 (Navigation Bar)**
- [x] **Step 3: 重构第二行元信息栏 (Metadata Ribbon)**
- [x] **Step 4: 运行测试检查阶段性进度**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: 顶栏和元数据断言部分通过，列头部分等待 Task 3 完成

---

### Task 3: 实现 VS Code 风格列头与双栏独立模式切换

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:925-1085`

**Interfaces:**
- Consumes: `clientViewMode`, `upstreamViewMode`, `handleCopyClaudeCurl`, `handleCopyGeminiCurl`
- Produces: 
  - Payload 与 Response 标签下的左右栏独立切换
  - 标题栏右侧整合视图小胶囊及专属 cURL/Stream 徽章

- [x] **Step 1: 重构 Payload 标签下双列结构**
- [x] **Step 2: 重构 Response 标签下双列结构**
- [x] **Step 3: 运行测试验证通过**
- [x] **Step 4: 提交改动**

```bash
git add frontend/src/components/LogsView.tsx tests/logsViewHeaderOptimization.test.ts
git commit -m "feat(logs): relocate preview toggles and curl actions to vscode-style column headers with single-line metadata ribbon"
```

---

### Task 4: 全量构建与回归测试验证 (Full Verification)

**Files:**
- None (执行全面验证与回归测试)

- [x] **Step 1: 运行全量 Jest 测试套件**
- [x] **Step 2: 运行前端 Vite 严格构建**
- [x] **Step 3: 运行后端 TypeScript 严格构建**
- [x] **Step 4: 运行全量构建**

# 移动端仿微信二级详情沉浸式全屏设计规范 (Mobile WeChat-Style Immersive Detail Navigation Design)

**日期**: 2026-09-07  
**分支**: `main`  
**目标**: 重构移动端界面层级与导航流转逻辑，实现类似原生微信 APP 的优雅体验：一级列表页面（控制台、账号、日志、发现主页）正常展示底部导航栏与通用全局操作；一旦进入二级详情页（请求日志详情、在线终端工作台、API 调试器、翻译工作台），自动彻底隐藏移动端底部导航栏，并将顶栏重构为微信风格沉浸式返回条（`‹ 上一级名称` + 详情标题），释放纵向空间，使详情页 100% 充分利用手机屏幕。

---

## 1. 痛点与体验对比

| 对比维度 | 现有移动端设计 | 微信风格沉浸式设计 (本次重构) |
| :--- | :--- | :--- |
| **底部导航栏** | 二级详情页常驻显示，占用约 60px 高度并附加 `pb-20` 内边距 | **二级详情页自动隐藏底部导航栏**，底边距归零，释放全部高度 |
| **空间利用率** | 日志 JSON、Monaco 编辑器、终端键盘受上下挤压 | **100% 满屏沉浸**，纵向高度增加 80px~120px |
| **顶栏形态** | 包含 Logo、刷新、GitHub、设置、语言等多个小按钮，且与页面内自带的返回按钮重叠 | **纯粹的微信式返回栏**：左侧 `‹ 日志 / ‹ 发现`，中间标题，右侧仅留核心操作 |
| **返回交互** | 各页面自己写返回按钮，位置与样式不统一 | **全局统一的微信原生心智返回**，手感自然一致 |

---

## 2. 详细设计规范

### 2.1 沉浸式状态统一感知 (`App.tsx`)

1. **状态定义**：
   - 追踪日志详情展开状态：
     通过在 `LogsView` 中增加 `onMobileDetailChange?: (isOpen: boolean) => void`，与 `App.tsx` 中的 `mobileLogDetailOpen` 双向同步；
   - 追踪发现子工具状态：
     `discoverSubView !== 'hub'`；
   - 计算复合沉浸态：
     ```typescript
     const isMobileDetailActive = 
       (activeTab === 'logs' && mobileLogDetailOpen) ||
       (activeTab === 'discover' && discoverSubView !== 'hub');
     ```
2. **底部导航栏条件渲染**：
   ```tsx
   {/* 移动端底部导航: 仅在非二级详情时显示 */}
   {!isMobileDetailActive && (
     <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-xl border-t border-[var(--border-subtle)] px-2 py-1 flex items-center justify-around md:hidden shadow-lg">
       {NAV_ITEMS.map(...)}
     </nav>
   )}
   ```
3. **主容器内边距动态释放**：
   ```tsx
   <main className={`flex-1 overflow-x-hidden ${
     isMobileDetailActive
       ? 'p-0 md:p-6 pb-0 md:pb-6 flex flex-col min-h-0 h-full overflow-hidden'
       : isWorkbenchTab
         ? 'p-2 sm:p-4 md:p-6 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] md:pb-6 flex flex-col min-h-0 h-full overflow-hidden'
         : 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6'
   }`}>
   ```

### 2.2 移动端微信原生顶栏重构

当在移动端检测到 `isMobileDetailActive === true` 时：

```
┌────────────────────────────────────────────────────────┐
│ ‹ 日志       详情: /v1/messages            [复制JSON]  │
└────────────────────────────────────────────────────────┘
```

1. **左侧微信返回按钮**：
   - 统一使用带有粗体手感的 `ChevronLeft`（`stroke-[2.5]`）搭配文字：
     - 若当前为日志详情：点击执行退出详情，显示 `‹ 日志`；
     - 若当前为发现工具：点击执行切回 `hub`，显示 `‹ 发现`；
   - 具有触控按压变暗反馈 `active:bg-indigo-500/10 active:scale-95 transition-all`。
2. **中间标题与面包屑**：
   - 居中或紧随其后显示当前请求或工具名称；
   - 日志详情可显示请求路径（如 `/v1/messages`）或时间戳；
   - 发现子工具显示具体工具标题（如 `在线终端`、`API 调试器`、`翻译工作台`）。
3. **右侧清理杂乱控件**：
   - 隐藏全局 GitHub、刷新、设置、语言切换等次要功能；
   - 仅保留专属操作（如终端的全屏触发器，日志详情的全量 JSON 复制按钮）。

### 2.3 `LogsView.tsx` 页面内部精简

- 移除 `LogsView.tsx` 内部在移动端重复渲染的 `<button onClick={...}><ArrowLeft /> ...</button>`；
- 使顶部 `[ 请求 ]`、`[ 响应 ]`、`[ 对话 ]` 标签栏直接顶格排版，省去多余的一整行空白；
- 在用户从主列表点击日志时，触发 `onMobileDetailChange?.(true)`；在退出详情或选择返回时，触发 `onMobileDetailChange?.(false)`。

---

## 3. 测试与验证策略

1. **自动化断言 (`tests/mobileWeChatNavigation.test.ts`)**：
   - 验证 `App.tsx` 声明并计算了 `isMobileDetailActive`（或等价变量）；
   - 验证当处于移动端详情态时，底部 `<nav>` 节点不被挂载或隐藏；
   - 验证顶栏包含针对移动端详情的 `ChevronLeft` 返回组件；
   - 验证 `LogsView.tsx` 接收并调用了移动端详情变更通知；
2. **全量构建与回归**：
   - `npm run build:frontend`
   - `npm run build:backend`
   - `npm test` 100% 通过。

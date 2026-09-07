# 运行日志从终端独立至发现中心设计规范 (Extract System Logs to Discover Hub Design)

**日期**: 2026-09-07  
**分支**: `main`  
**目标**: 将【系统运行日志 (TerminalLogsView)】从原本内嵌在终端内的子标签中解耦独立出来，作为核心工具置入【发现中心 (Discover Hub)】；在移动端与【在线终端】组成 2x2 微信原生双分组列表；在桌面端呈现 4 矩阵对称卡片；实现终端交互环境与只读日志流监控的彻底解耦。

---

## 1. 架构重构动因

1. **功能属性本质不同**：
   - **在线终端 (WebTerminalView)**：是交互式、有状态、支持全屏与按键序列的 PTY 终端会话；
   - **运行日志 (TerminalLogsView)**：是无状态、只读、通过 Server-Sent Events (SSE) 推流的实时日志控制台；
   - 将日志塞在终端内部导致两套完全不同的交互模型混杂在一起，增加了不必要的组件嵌套与状态负担。
2. **发现中心形成 4 核心矩阵**：
   - 形成 **系统与运维工具**（在线终端 + 运行日志）与 **开发与协同工具**（API 调试器 + 翻译工作台）两个对齐对称的领域模型。

---

## 2. 详细设计规范

### 2.1 发现中心子工具类型扩展 (`DiscoverToolId`)

```typescript
export type DiscoverToolId = 'terminal' | 'systemLogs' | 'playground' | 'translate';
```

在 `App.tsx` 中分发：
- 当 `discoverSubView === 'systemLogs'` 时，渲染：
  ```tsx
  <TerminalLogsView
    key={refreshTrigger}
    adminKey={adminKey}
  />
  ```
- 面包屑与移动端沉浸顶栏：
  - 标题显示 `t('discover.systemLogsTitle', '运行日志')`；
  - 左侧微信返回按键 `‹ 发现`，点击切回 `discoverSubView = 'hub'`。

### 2.2 移动端仿微信发现页 2x2 双分组 (`DiscoverHubView.tsx`)

```
┌────────────────────────────────────────────────────────┐
│  发现                                                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ┌────┐                                           │  │
│  │ │ 💻 │ 在线终端                            >     │  │  ← 翠绿渐变
│  │ └────┘ 宿主环境诊断与实时指令交互终端            │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ ┌────┐                                           │  │
│  │ │ 📜 │ 运行日志                            >     │  │  ← 青蓝渐变 (SSE 实时推流)
│  │ └────┘ 系统实时事件与控制台日志输出流            │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ┌────┐                                           │  │
│  │ │ 🚀 │ API 调试器                          >     │  │  ← 活力橙渐变
│  │ └────┘ Claude 与 Gemini 原始报文及流式调试       │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ ┌────┐                                           │  │
│  │ │ 🌐 │ 翻译工作台                          >     │  │  ← 紫罗兰渐变
│  │ └────┘ AI 辅助智能翻译与多语言对比工作台         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

- **第一分组（系统运维）**：`在线终端` + `运行日志`（中间细分割线 `border-b border-black/[0.04] dark:border-white/[0.04]`）；
- **第二分组（开发协同）**：`API 调试器` + `翻译工作台`；
- **运行日志图标**：`bg-gradient-to-br from-blue-500 to-cyan-600`，内嵌白色 `ScrollText` / `FileText` 图标，带柔和发光阴影。

### 2.3 桌面端 4 列 APM 工具展厅 (`DiscoverHubView.tsx`)

- 布局采用响应式网格：`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-7xl`；
- 运行日志卡片规范：
  - 图标：`w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600`；
  - 徽标：`SSE STREAM`（青蓝色微徽章）；
  - 标题：`t('discover.systemLogsTitle', '运行日志')`；
  - 描述：`t('discover.systemLogsDesc', '系统实时事件与控制台日志输出流，支持分级过滤与检索')`；
  - 底部操作：`[ 查看日志 ↗ ]`。

---

## 3. 国际化词条 (i18n)

### `zh.ts`:
```typescript
discover: {
  // ...
  systemLogsTitle: "运行日志",
  systemLogsDesc: "系统实时事件与控制台日志输出流，支持分级过滤与检索",
  viewLogs: "查看日志",
}
```

### `en.ts`:
```typescript
discover: {
  // ...
  systemLogsTitle: "System Logs",
  systemLogsDesc: "Real-time SSE console log stream with level filtering & search",
  viewLogs: "View Logs",
}
```

---

## 4. 测试与验证策略

1. **测试驱动断言 (`tests/discoverSystemLogs.test.ts`)**：
   - 验证 `DiscoverToolId` 包含 `'systemLogs'`；
   - 验证 `DiscoverHubView.tsx` 包含 4 个工具卡片与移动端 2 个分组容器；
   - 验证 `App.tsx` 正确路由分发 `discoverSubView === 'systemLogs'` 至 `TerminalLogsView`；
   - 验证多语言词条完整性。
2. **全量构建与回归**：
   - `npm run build:frontend` 0 报错；
   - `npm run build:backend` 0 报错；
   - `npm test` 100% 通过。
